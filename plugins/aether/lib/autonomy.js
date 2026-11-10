'use strict'

// The owner's standing authorizations for irreversible steps, each verified against the owner's own
// words in a session transcript, and an autonomous run's state and ceilings (hours and USD).
// Everything lives under <mainRoot>/.aether/autonomy/: the registry grants.json, and one folder per run.
// Family: none.

const fs = require('node:fs')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const { ownerMessages, findTranscript } = require('./voice.js')
const { newRunId, isRunId, dataDir: runDataDir } = require('./run.js')
const { readBrakeSettings, isAetherSession } = require('./session.js')
const { repoPaths } = require('./git.js')
const { isObject } = require('./common.js')
const { trustedFile } = require('./skill-rules.js')

const CLASSES = ['merge-main', 'push', 'publish', 'deploy', 'delete', 'credentials', 'paid-call', 'skill-install']
const SCOPES = ['repo', 'session']
const OUTCOMES = ['done', 'ceiling', 'incomplete']
const MIN_QUOTE = 12
const RESUME_MARGIN_MS = 120000
const WINDOW_KINDS = ['five_hour', 'seven_day']

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'autonomy.json')
const NO_TRANSCRIPT = 'no transcript for session '
const SOURCE_LABELS = { owner: 'del dueño', default: 'por defecto' }

function assertClass(cls) {
  if (!CLASSES.includes(cls)) throw new Error(`unknown class: ${cls}`)
}

function assertScope(scope) {
  if (!SCOPES.includes(scope)) throw new Error(`unknown scope: ${scope}`)
}

function assertOutcome(outcome) {
  if (!OUTCOMES.includes(outcome)) throw new Error(`unknown outcome: ${outcome}`)
}

function normalize(text) {
  return String(text).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function findQuote(lines, quote) {
  const wanted = normalize(quote)
  for (const message of ownerMessages(lines, { maxChars: Infinity })) {
    if (normalize(message.text).includes(wanted)) return { time: message.time, text: message.text }
  }
  return null
}

// The lines of a session's transcript, or null when there is none or it cannot be read.
function transcriptLines(sessionId, configDir) {
  const file = findTranscript(sessionId, { configDir })
  if (!file) return null
  try {
    return fs.readFileSync(file, 'utf8').split('\n')
  } catch {
    return null
  }
}

function readSessionRecords(configDir, sessionId) {
  const lines = transcriptLines(sessionId, configDir)
  if (lines === null) return { found: false, records: [] }
  const records = []
  for (const line of lines) {
    try { records.push(JSON.parse(line)) } catch { /* Ignore malformed transcript lines. */ }
  }
  return { found: true, records }
}

function isHeadlessTranscript(records) {
  return records.some((r) => r && r.entrypoint === 'sdk-cli') &&
    records.every((r) => !r || typeof r.entrypoint !== 'string' || r.entrypoint === 'sdk-cli')
}

function hasApprovedPlanMode(records, latestStarted) {
  const uses = new Set()
  const counted = new Set()
  for (const record of records) {
    if (record && record.isSidechain === true) continue
    const content = record && record.message && record.message.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      if (record.type === 'assistant' && block.type === 'tool_use' && block.name === 'ExitPlanMode' && typeof block.id === 'string') uses.add(block.id)
      if (record.type !== 'user' || block.type !== 'tool_result' || !uses.has(block.tool_use_id) || counted.has(block.tool_use_id) || block.is_error === true) continue
      const texts = typeof block.content === 'string' ? [block.content] : Array.isArray(block.content) ? block.content.filter((part) => part && part.type === 'text' && typeof part.text === 'string').map((part) => part.text) : []
      if (texts.some((text) => text.startsWith('User has approved your plan.') || text.includes('\nUser has approved your plan.'))) {
        counted.add(block.tool_use_id)
        if (latestStarted === null || Date.parse(record.timestamp) > latestStarted) return true
      }
    }
  }
  return false
}

const NEGATED_REASON = "the quote is in a negated clause of the owner's message"

// Single-word negators, folded without accents or capitals. `do not` is checked as a
// word pair; `sin` and `without` are not negators.
const SINGLE_NEGATORS = new Set([
  'no', 'nunca', 'jamas', 'tampoco', 'ni', 'not', 'never',
  "don't", 'dont', "doesn't", 'cannot', "can't", "won't",
])

// Words that end a clause, compared case-insensitively. `mas` is not one of them: typed without its accent it is
// the common «más» (more), and «ya no hagas mas push» must stay negated. Negators above keep the accent folding.
const CLAUSE_WORDS = new Set(['pero', 'sino', 'aunque', 'but', 'however', 'although'])

function foldClause(word) {
  return String(word).normalize('NFC').toLowerCase()
}

function foldNeg(text) {
  return String(text).normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[’‘]/gu, "'")
}

const WORD_CHAR = /[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF'’]/
const WORD_SOURCE = "[A-Za-z0-9\\u00C0-\\u024F\\u1E00-\\u1EFF'’]+"

function foldedWordsOf(text) {
  const found = String(text).match(new RegExp(WORD_SOURCE, 'gu')) || []
  return found.map((word) => foldNeg(word))
}

// The clause of text around index: from the end of the previous separator to the
// start of the next one. Separators are `.`, `;`, `:`, `!`, `?`, `,`, a line break
// or a clause word. An index inside a separator reads as an empty clause start.
function clauseAround(text, index) {
  const splits = []
  const punct = /[.;:!?,\n\r]+/g
  let hit
  while ((hit = punct.exec(text)) !== null) splits.push([hit.index, hit.index + hit[0].length])
  const words = new RegExp(WORD_SOURCE, 'gu')
  while ((hit = words.exec(text)) !== null) {
    if (CLAUSE_WORDS.has(foldClause(hit[0]))) splits.push([hit.index, hit.index + hit[0].length])
  }
  splits.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]))
  let start = 0
  for (const [from, to] of splits) {
    if (index < from) return [start, from]
    if (index < to) return [to, to]
    start = Math.max(start, to)
  }
  return [start, text.length]
}

// Whether the appearance of quote at index in text is negated: a negator in its
// clause before the appearance, a negator as the quote's first word, or `ni`
// anywhere in the quote. A `no` inside the quote past its first word does not negate.
function occurrenceNegated(text, index, quote) {
  // A quote that starts in the middle of a word ('o hagas push a origin' out of 'No hagas push a origin') is read with
  // the whole word it cuts: the negator it removed must not hide.
  let start = index
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start -= 1
  const quoteWords = foldedWordsOf(text.slice(start, index) + quote)
  if (quoteWords.length > 0 && SINGLE_NEGATORS.has(quoteWords[0])) return true
  if (quoteWords.length > 1 && quoteWords[0] === 'do' && quoteWords[1] === 'not') return true
  if (quoteWords.includes('ni')) return true
  const [from] = clauseAround(text, start)
  const before = foldedWordsOf(text.slice(Math.min(from, start), start))
  for (const word of before) {
    if (SINGLE_NEGATORS.has(word)) return true
  }
  for (let i = 0; i + 1 < before.length; i++) {
    if (before[i] === 'do' && before[i + 1] === 'not') return true
  }
  return false
}

// verifyQuote, with the transcript lines supplied by linesOf(sessionId).
function verifyWith(sessionId, quote, linesOf, { allowNegation = false } = {}) {
  if (Array.from(normalize(quote)).length < MIN_QUOTE) return { ok: false, reason: `the quote must have at least ${MIN_QUOTE} characters` }
  const lines = linesOf(sessionId)
  if (lines === null) return { ok: false, reason: `${NO_TRANSCRIPT}${sessionId}` }
  const wanted = normalize(quote)
  const pattern = new RegExp(
    wanted.split(' ').map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'),
    'gi',
  )
  let seen = false
  for (const message of ownerMessages(lines, { maxChars: Infinity })) {
    if (!normalize(message.text).includes(wanted)) continue
    seen = true
    if (allowNegation) return { ok: true, time: message.time }
    // NFC so the pattern and the clause analysis see the same composed words
    // the normalize/includes check above saw; a quote the pattern cannot
    // locate stays refused instead of failing open.
    const nfc = message.text.normalize('NFC')
    pattern.lastIndex = 0
    let plain = false
    let hit
    while ((hit = pattern.exec(nfc)) !== null) {
      if (!occurrenceNegated(nfc, hit.index, quote)) plain = true
      if (hit[0].length === 0) pattern.lastIndex += 1
      if (plain) break
    }
    if (plain) return { ok: true, time: message.time }
  }
  if (!seen) return { ok: false, reason: `the quote is not in the owner's messages of session ${sessionId}` }
  return { ok: false, reason: NEGATED_REASON }
}

function verifyQuote(sessionId, quote, { configDir, allowNegation = false } = {}) {
  return verifyWith(sessionId, quote, (id) => transcriptLines(id, configDir), { allowNegation })
}

// A grant's status, reading each session's transcript at most once per statusReader.
function statusReader(configDir) {
  const cache = new Map()
  const linesOf = (id) => {
    if (!cache.has(id)) cache.set(id, transcriptLines(id, configDir))
    return cache.get(id)
  }
  return (grant) => {
    const result = verifyWith(grant.session, grant.quote, linesOf)
    if (result.ok) return 'verified'
    return result.reason.startsWith(NO_TRANSCRIPT) ? 'transcript-gone' : 'invalid'
  }
}

function autonomyDir(mainRoot) {
  return path.join(mainRoot, '.aether', 'autonomy')
}

function grantsPath(mainRoot) {
  return path.join(autonomyDir(mainRoot), 'grants.json')
}

function runPaths(mainRoot, id) {
  const dir = path.join(autonomyDir(mainRoot), id)
  return { dir, runFile: path.join(dir, 'run.json'), diary: path.join(dir, 'diary.md'), brief: path.join(dir, 'brief.md') }
}

// Reads a JSON file; anything that cannot be read or parsed throws, and check(value) may reject its shape.
function readJsonFile(file, check = () => null) {
  let value
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`cannot read ${path.resolve(file)}: ${err.message}`)
  }
  const problem = check(value)
  if (problem) throw new Error(`cannot read ${path.resolve(file)}: ${problem}`)
  return value
}

function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

const isPositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0

function loadCeilings() {
  const config = readJsonFile(CONFIG_FILE, (v) =>
    isObject(v) && isPositive(v.hours) && isPositive(v.usd) ? null : 'hours and usd must be positive numbers',
  )
  return { hours: config.hours, usd: config.usd }
}

function readGrants(mainRoot) {
  const file = grantsPath(mainRoot)
  if (!fs.existsSync(file)) return { grants: [], revoked: [] }
  const registry = readJsonFile(file, (v) =>
    isObject(v) && Array.isArray(v.grants) && Array.isArray(v.revoked) ? null : 'grants and revoked must be arrays',
  )
  return { grants: registry.grants, revoked: registry.revoked }
}

function writeGrants(mainRoot, registry) {
  writeJsonFile(grantsPath(mainRoot), { grants: registry.grants, revoked: registry.revoked })
}

function grant(mainRoot, { class: cls, quote, session, scope = 'repo' }, { configDir, now = Date.now() } = {}) {
  assertClass(cls)
  assertScope(scope)
  const registry = readGrants(mainRoot)
  const verified = verifyQuote(session, quote, { configDir })
  if (!verified.ok) return { ok: false, reason: verified.reason }
  const record = { class: cls, scope, quote, session, time: verified.time, added: new Date(now).toISOString() }
  registry.grants.push(record)
  writeGrants(mainRoot, registry)
  return { ok: true, grant: record }
}

function revoke(mainRoot, { class: cls, quote, session, all = false }, { configDir, now = Date.now() } = {}) {
  assertClass(cls)
  const registry = readGrants(mainRoot)
  const verified = verifyQuote(session, quote, { configDir, allowNegation: true })
  if (!verified.ok) return { ok: false, reason: verified.reason }
  // The narrow form (the default, for the one-time procedure) removes only this
  // session's session-scoped grants of the class. Repository grants and other
  // sessions' grants stay; removing every grant of the class takes `all`.
  const kept = registry.grants.filter(
    (g) => g.class !== cls || (!all && !(g.scope === 'session' && g.session === session)),
  )
  const revocation = {
    class: cls,
    quote,
    session,
    all: Boolean(all),
    time: verified.time,
    added: new Date(now).toISOString(),
    removed: registry.grants.length - kept.length,
  }
  writeGrants(mainRoot, { grants: kept, revoked: [...registry.revoked, revocation] })
  return { ok: true, revocation }
}

function check(mainRoot, cls, { session = null, configDir } = {}) {
  assertClass(cls)
  const { grants } = readGrants(mainRoot)
  const statusOf = statusReader(configDir)
  for (let i = grants.length - 1; i >= 0; i--) {
    const g = grants[i]
    if (g.class !== cls) continue
    const covers = g.scope === 'repo' || (g.scope === 'session' && typeof session === 'string' && g.session === session)
    if (!covers) continue
    const status = statusOf(g)
    if (status !== 'invalid') return { ...g, status }
  }
  return null
}

function list(mainRoot, { configDir } = {}) {
  const { grants, revoked } = readGrants(mainRoot)
  const statusOf = statusReader(configDir)
  return { grants: grants.map((g) => ({ ...g, status: statusOf(g) })), revoked }
}

function readRun(file) {
  return readJsonFile(file, (v) => (isObject(v) && Array.isArray(v.spend) ? null : 'a run must be an object with a spend array'))
}

function quarantine(mainRoot, { target, id = null }, { now = Date.now() } = {}) {
  let from
  let file
  if (target === 'grants') {
    from = grantsPath(mainRoot)
    file = from
    if (!fs.existsSync(file)) return { ok: false, reason: 'there is no grants.json to set aside' }
  } else if (target === 'run') {
    if (typeof id !== 'string' || !/^auto-[0-9]{8}-[0-9]{6}-[0-9a-f]+$/.test(id)) return { ok: false, reason: 'invalid run id' }
    from = path.join(autonomyDir(mainRoot), id)
    file = path.join(from, 'run.json')
    if (!fs.existsSync(file)) return { ok: false, reason: 'there is no run.json to set aside' }
  } else {
    return { ok: false, reason: 'invalid quarantine target' }
  }

  let readable = true
  try {
    if (target === 'grants') readGrants(mainRoot)
    else readRun(file)
  } catch {
    readable = false
  }
  if (readable) return { ok: false, reason: target === 'grants'
    ? 'grants.json is readable; use aether-autonomy grant, revoke and end'
    : 'the run is readable; use aether-autonomy end' }

  const date = new Date(now)
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  const broken = path.join(mainRoot, '.aether', 'broken-runs')
  fs.mkdirSync(broken, { recursive: true })
  let to
  do {
    to = path.join(broken, `${target === 'grants' ? 'grants.json' : id}-${stamp}-${crypto.randomBytes(2).toString('hex')}`)
  } while (fs.existsSync(to))
  fs.renameSync(from, to)
  return { ok: true, from, to }
}

// A run written before the quota brake has none of its fields; it reads as if they were empty.
function ensureBrakeFields(run) {
  if (run.brakeOff === undefined) run.brakeOff = null
  if (!Array.isArray(run.quotaPauses)) run.quotaPauses = []
  if (!Array.isArray(run.quotaCrossings)) run.quotaCrossings = []
  return run
}

// Each run and the folder it lives in (its files are written there, whatever its id says).
function * runs(mainRoot) {
  const root = autonomyDir(mainRoot)
  if (!fs.existsSync(root)) return
  const names = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const name of names) {
    const paths = runPaths(mainRoot, name)
    if (!fs.existsSync(paths.runFile)) continue
    yield { run: ensureBrakeFields(readRun(paths.runFile)), paths }
  }
}

function findOpenRun(mainRoot) {
  let open = null
  for (const item of runs(mainRoot)) {
    if (item.run.ended === null) open = item
  }
  return open
}

function latestSessionRunStart(mainRoot, session) {
  let latest = null
  for (const { run } of runs(mainRoot)) {
    if (run.session !== session) continue
    const started = Date.parse(run.started)
    if (!Number.isFinite(started)) return Infinity
    if (latest === null || started > latest) latest = started
  }
  return latest
}

function openRun(mainRoot) {
  const open = findOpenRun(mainRoot)
  return open ? open.run : null
}

function ceiling(value, fallback) {
  if (value === null || value === undefined) return { value: fallback, source: 'default' }
  if (!isPositive(value)) throw new Error(`invalid ceiling: ${value}`)
  return { value, source: 'owner' }
}

function diarySkeleton(run) {
  const { hours, usd, source } = run.ceilings
  return [
    `# Corrida ${run.id}`,
    '',
    '## Intención',
    '',
    `> ${run.quote}`,
    `— permiso del dueño, ${run.quoteTime}`,
    '',
    '## Topes',
    '',
    `- Horas: ${hours} (${SOURCE_LABELS[source.hours]})`,
    `- USD: ${usd} (${SOURCE_LABELS[source.usd]})`,
    '',
    '## Decisiones',
    '',
    '## Descubrimientos',
    '',
    '## Espera tu sí',
    '',
    '## Propuestas',
    '',
    '## Estado',
    '',
  ].join('\n')
}

function start(mainRoot, { quote, session, hours = null, usd = null } = {}, { configDir, dataDir = runDataDir(), now = Date.now() } = {}) {
  const defaults = loadCeilings()
  const h = ceiling(hours, defaults.hours)
  const u = ceiling(usd, defaults.usd)
  const open = openRun(mainRoot)
  if (open) throw new Error(`run ${open.id} is already open`)
  const verified = verifyQuote(session, quote, { configDir })
  if (!verified.ok) return { ok: false, reason: verified.reason }
  if (isAetherSession(resolveDataDir(dataDir), session)) {
    const { records } = readSessionRecords(configDir, session)
    if (!isHeadlessTranscript(records) && !hasApprovedPlanMode(records, latestSessionRunStart(mainRoot, session))) {
      return { ok: false, reason: 'interactive session requires an approved plan in plan mode (ExitPlanMode) before starting an autonomous run; present the plan in plan mode and wait for the owner to approve it before running aether-autonomy start' }
    }
  }
  const run = {
    id: `auto-${newRunId(new Date(now))}`,
    session,
    quote,
    quoteTime: verified.time,
    started: new Date(now).toISOString(),
    ceilings: { hours: h.value, usd: u.value, source: { hours: h.source, usd: u.source } },
    spend: [],
    brakeOff: null,
    quotaPauses: [],
    quotaCrossings: [],
    ended: null,
    outcome: null,
  }
  const paths = runPaths(mainRoot, run.id)
  fs.mkdirSync(autonomyDir(mainRoot), { recursive: true })
  // Not recursive: an id that already has a folder is an error, never an overwrite.
  fs.mkdirSync(paths.dir)
  writeJsonFile(paths.runFile, run)
  fs.writeFileSync(paths.diary, diarySkeleton(run))
  return { ok: true, run, runFile: paths.runFile, diary: paths.diary }
}

const round2 = (x) => Math.round(x * 100) / 100

// A run counts as idle when neither its diary nor its state has changed for this long:
// the Lead is probably waiting on something that will never wake it (GitHub issue #31).
const IDLE_MS = 30 * 60 * 1000

function lastActivity(run, paths) {
  let latest = Date.parse(run.started)
  for (const file of [paths.diary, paths.runFile]) {
    try {
      latest = Math.max(latest, fs.statSync(file).mtimeMs)
    } catch {
      // A missing file is no activity, not an error.
    }
  }
  return latest
}

function pausedMsOf(run, now) {
  let total = 0
  for (const pause of run.quotaPauses || []) {
    const started = Date.parse(pause && pause.started)
    const until = Math.min(Date.parse(pause && pause.resumeAt), now)
    if (!Number.isFinite(started) || !Number.isFinite(until) || started > now) continue
    total += Math.max(0, until - started)
  }
  return total
}

function statusOfRun(run, paths, now) {
  ensureBrakeFields(run)
  const pausedMs = pausedMsOf(run, now)
  const elapsed = round2((now - Date.parse(run.started) - pausedMs) / 3600000)
  const paused = round2(pausedMs / 3600000)
  const spent = round2(run.spend.reduce((sum, entry) => sum + entry.usd, 0))
  const idleMinutes = Math.max(0, Math.floor((now - lastActivity(run, paths)) / 60000))
  const quotaPaused = !run.brakeOff && run.quotaPauses.some((pause) => Date.parse(pause.resumeAt) > now)
  let stop = null
  if (quotaPaused) stop = 'quota'
  else if (elapsed >= run.ceilings.hours) stop = 'time'
  else if (spent >= run.ceilings.usd) stop = 'cost'
  const lastPause = run.quotaPauses.length ? run.quotaPauses[run.quotaPauses.length - 1] : null
  return {
    open: true,
    id: run.id,
    diary: paths.diary,
    session: run.session,
    started: run.started,
    hours: { elapsed, ceiling: run.ceilings.hours, paused },
    usd: { spent, ceiling: run.ceilings.usd },
    idleMinutes,
    idle: now - lastActivity(run, paths) >= IDLE_MS,
    stop,
    quota: {
      paused: stop === 'quota',
      brakeOff: Boolean(run.brakeOff),
      resetsAt: lastPause ? lastPause.resetsAt : null,
      resumeAt: lastPause ? lastPause.resumeAt : null,
      percentUsed: lastPause ? lastPause.percentUsed : null,
    },
  }
}

function status(mainRoot, { now = Date.now() } = {}) {
  const open = findOpenRun(mainRoot)
  if (!open) return { open: false }
  return statusOfRun(open.run, open.paths, now)
}

function launchRefusal(cwd, { session = null, dataDir = runDataDir(), now = Date.now() } = {}) {
  if (!isAetherSession(resolveDataDir(dataDir), session)) return null
  let mainRoot
  try { mainRoot = repoPaths(cwd).mainRoot } catch (error) {
    // Normalize only the diagnostic probe's locale; repoPaths preserves operational errors.
    if (error.code) throw error
    const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
    })
    if (probe.error) throw probe.error
    if (probe.status === 128 && /^fatal: not a git repository\b/.test(probe.stderr)) return null
    throw error
  }
  const st = status(mainRoot, { now })
  if (!st.open || !st.stop) return null
  let message
  if (st.stop === 'time') message = `autonomous run ${st.id} reached its time ceiling (${st.hours.elapsed}h / ${st.hours.ceiling}h); close it with: aether-autonomy end --outcome ceiling`
  else if (st.stop === 'cost') message = `autonomous run ${st.id} reached its spend ceiling ($${st.usd.spent} / $${st.usd.ceiling}); close it with: aether-autonomy end --outcome ceiling`
  else if (st.stop === 'quota') message = `autonomous run ${st.id} is paused by the quota brake (${st.quota.percentUsed}% used; resumeAt ${st.quota.resumeAt || 'pending'}); it is paused, not ended; start nothing of this run and wait until it resumes; and only an old run that another session left open is closed, with: aether-autonomy end --outcome incomplete`
  else return null
  return { stop: st.stop, id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message }
}

function spend(mainRoot, usd, source, { now = Date.now() } = {}) {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) throw new Error(`invalid spend: ${usd}`)
  if (typeof source !== 'string' || source === '') throw new Error('a spend needs a source')
  const open = findOpenRun(mainRoot)
  if (!open) throw new Error('no open run')
  const { run, paths } = open
  const entry = { source, usd, at: new Date(now).toISOString() }
  const index = run.spend.findIndex((e) => e.source === source)
  if (index === -1) run.spend.push(entry)
  else run.spend[index] = entry
  writeJsonFile(paths.runFile, run)
  return statusOfRun(run, paths, now)
}

function end(mainRoot, outcome, { now = Date.now() } = {}) {
  assertOutcome(outcome)
  const open = findOpenRun(mainRoot)
  if (!open) throw new Error('no open run')
  const { run, paths } = open
  run.ended = new Date(now).toISOString()
  run.outcome = outcome
  writeJsonFile(paths.runFile, run)
  return run
}

function resolveDataDir(dataDir) {
  return dataDir === undefined || dataDir === null ? runDataDir() : dataDir
}

function quotaStateFile(dataDir) {
  return path.join(dataDir, 'quota', 'state.json')
}

function readNotified(dataDir) {
  try {
    const value = JSON.parse(fs.readFileSync(quotaStateFile(dataDir), 'utf8'))
    if (!isObject(value)) return { five_hour: null, seven_day: null }
    return {
      five_hour: typeof value.five_hour === 'string' ? value.five_hour : null,
      seven_day: typeof value.seven_day === 'string' ? value.seven_day : null,
    }
  } catch {
    return { five_hour: null, seven_day: null }
  }
}

function writeNotified(dataDir, kind, resetsAt, now) {
  const next = { ...readNotified(dataDir), [kind]: resetsAt, updatedAt: new Date(now).toISOString() }
  writeJsonFile(quotaStateFile(dataDir), next)
}

function normalizeNotify(notify) {
  const source = notify === undefined || notify === null ? { sent: false, reason: 'no-channel' } : notify
  const sent = Boolean(source && source.sent)
  return { sent, reason: sent ? (source.reason ?? null) : (source.reason ?? 'error') }
}

function noticeLine(notify) {
  return notify.sent ? '- Aviso al dueño: enviado.' : `- Aviso al dueño: no enviado (${notify.reason}).`
}

function brakeSettings(mainRoot, { session = null, now = Date.now(), dataDir } = {}) {
  const dir = resolveDataDir(dataDir)
  const fromFile = session ? readBrakeSettings(dir, session) : null
  const { threshold, push } = fromFile || { threshold: 95, push: false }
  const open = findOpenRun(mainRoot)
  const run = open ? open.run : null
  let paused = null
  if (run && !run.brakeOff) {
    for (let i = run.quotaPauses.length - 1; i >= 0; i--) {
      const pause = run.quotaPauses[i]
      if (now < Date.parse(pause.resumeAt)) {
        paused = { run: run.id, resetsAt: pause.resetsAt, resumeAt: pause.resumeAt, percentUsed: pause.percentUsed }
        break
      }
    }
  }
  return {
    threshold,
    push,
    openRun: run ? run.id : null,
    brakeOff: Boolean(run && run.brakeOff),
    paused,
    notified: readNotified(dir),
  }
}

function recordCrossing(mainRoot, { kind, percentUsed, resetsAt, threshold, notify = { sent: false, reason: 'no-channel' } } = {}, { now = Date.now(), dataDir } = {}) {
  if (!WINDOW_KINDS.includes(kind)) throw new Error(`unknown window kind: ${kind}`)
  if (typeof percentUsed !== 'number' || !Number.isFinite(percentUsed) || percentUsed < 0) throw new Error(`invalid percent: ${percentUsed}`)
  if (typeof resetsAt !== 'string' || !Number.isFinite(Date.parse(resetsAt))) throw new Error(`invalid resetsAt: ${resetsAt}`)
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0) throw new Error(`invalid threshold: ${threshold}`)
  const dir = resolveDataDir(dataDir)
  writeNotified(dir, kind, resetsAt, now)
  if (kind === 'seven_day') return { recorded: false, paused: false, reason: 'weekly' }
  const open = findOpenRun(mainRoot)
  if (!open) return { recorded: false, paused: false, reason: 'no-run' }
  const { run, paths } = open
  const notice = normalizeNotify(notify)
  if (run.brakeOff) {
    const at = new Date(now).toISOString()
    run.quotaCrossings.push({ at, percentUsed, threshold, resetsAt, notify: notice })
    writeJsonFile(paths.runFile, run)
    fs.appendFileSync(
      paths.diary,
      `\n## Cruce de cuota sin detención ${at}\n\n- Ventana de 5 horas al ${percentUsed}% (umbral ${threshold}%); reinicia ${resetsAt}.\n${noticeLine(notice)}\n- El freno estaba apagado por las palabras del dueño: «${run.brakeOff.quote}».\n`,
    )
    return { recorded: true, paused: false, brakeOff: true, run: run.id, quote: run.brakeOff.quote }
  }
  const existing = run.quotaPauses.find((pause) => pause.resetsAt === resetsAt)
  if (existing) {
    return { recorded: true, paused: now < Date.parse(existing.resumeAt), duplicate: true, run: run.id, resetsAt: existing.resetsAt, resumeAt: existing.resumeAt }
  }
  const started = new Date(now).toISOString()
  const resumeAt = new Date(Date.parse(resetsAt) + RESUME_MARGIN_MS).toISOString()
  run.quotaPauses.push({ started, percentUsed, threshold, resetsAt, resumeAt, notify: notice, savedUnits: [] })
  writeJsonFile(paths.runFile, run)
  fs.appendFileSync(
    paths.diary,
    `\n## Pausa de cuota ${started}\n\n- Ventana de 5 horas al ${percentUsed}% (umbral ${threshold}%); reinicia ${resetsAt}; la corrida se retoma ${resumeAt}.\n${noticeLine(notice)}\n`,
  )
  return { recorded: true, paused: true, run: run.id, resetsAt, resumeAt }
}

function brakeOff(mainRoot, { quote, session } = {}, { configDir, now = Date.now() } = {}) {
  const open = findOpenRun(mainRoot)
  if (!open) return { ok: false, reason: 'no open run' }
  const verified = verifyQuote(session, quote, { configDir })
  if (!verified.ok) return { ok: false, reason: verified.reason }
  const { run, paths } = open
  const record = { quote, session, time: verified.time, added: new Date(now).toISOString() }
  run.brakeOff = record
  writeJsonFile(paths.runFile, run)
  return { ok: true, brakeOff: record }
}

function recordSaved(mainRoot, saved, { now = Date.now() } = {}) {
  if (!isObject(saved) || !isRunId(saved.run) || !Array.isArray(saved.units)) throw new Error('a saved record needs a run and its units')
  const open = findOpenRun(mainRoot)
  if (!open) return { recorded: false, reason: 'no-run' }
  const { run, paths } = open
  if (!run.quotaPauses.length) return { recorded: false, reason: 'no-pause' }
  const entries = saved.units
    .filter((unit) => unit && unit.branch && unit.head && !unit.merged)
    .map((unit) => ({ swarmRun: saved.run, task: unit.task, branch: unit.branch, head: unit.head }))
  if (!entries.length) return { recorded: true, run: run.id, savedUnits: [] }
  const lastPause = run.quotaPauses[run.quotaPauses.length - 1]
  if (!Array.isArray(lastPause.savedUnits)) lastPause.savedUnits = []
  for (const entry of entries) {
    const index = lastPause.savedUnits.findIndex((unit) => unit && unit.swarmRun === entry.swarmRun && unit.task === entry.task)
    if (index === -1) lastPause.savedUnits.push(entry)
    else lastPause.savedUnits[index] = entry
  }
  writeJsonFile(paths.runFile, run)
  const list = entries.map((entry) => `\`${entry.task}\` en \`${entry.branch}\` (${entry.head})`).join(', ')
  fs.appendFileSync(paths.diary, `- Guardadas (${saved.at}): ${list}.\n`)
  return { recorded: true, run: run.id, savedUnits: entries }
}

const AUTHOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/

function isValidAuthor(author) {
  return typeof author === 'string' && author.length > 0 && author.length <= 39 && AUTHOR_PATTERN.test(author)
}

function trustAuthor(dataDir, { author, quote, session, remove = false }, { configDir, now = Date.now() } = {}) {
  if (!isValidAuthor(author)) return { ok: false, reason: `invalid author: ${author}` }
  const verified = verifyQuote(session, quote, { configDir, allowNegation: remove })
  if (!verified.ok) return { ok: false, reason: verified.reason }

  const file = trustedFile(dataDir)
  let data = { authors: [], log: [] }
  if (fs.existsSync(file)) {
    try {
      const read = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (isObject(read)) {
        if (Array.isArray(read.authors)) data.authors = read.authors
        if (Array.isArray(read.log)) data.log = read.log
      }
    } catch {
      data = { authors: [], log: [] }
    }
  }

  const normalizedAuthor = author.toLowerCase()
  if (remove) {
    if (!data.authors.includes(normalizedAuthor)) {
      return { ok: true, authors: data.authors }
    }
    data.authors = data.authors.filter((a) => a !== normalizedAuthor)
  } else {
    if (!data.authors.includes(normalizedAuthor)) {
      data.authors.push(normalizedAuthor)
    }
  }

  data.log.push({
    action: remove ? 'remove' : 'add',
    author: normalizedAuthor,
    quote,
    session,
    time: verified.time,
    added: new Date(now).toISOString(),
  })

  writeJsonFile(file, data)
  return { ok: true, authors: data.authors }
}

module.exports = {
  CLASSES,
  SCOPES,
  OUTCOMES,
  MIN_QUOTE,
  RESUME_MARGIN_MS,
  normalize,
  findQuote,
  verifyQuote,
  autonomyDir,
  runPaths,
  loadCeilings,
  readGrants,
  quarantine,
  grant,
  revoke,
  check,
  list,
  openRun,
  start,
  launchRefusal,
  spend,
  status,
  end,
  brakeSettings,
  recordCrossing,
  brakeOff,
  recordSaved,
  trustAuthor,
}
