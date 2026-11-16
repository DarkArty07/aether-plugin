'use strict'

// The owner's standing authorizations for irreversible steps, each verified against the owner's own
// words in a session transcript, and an autonomous run's state and ceilings (hours and USD).
// Everything lives under <mainRoot>/.aether/autonomy/: the registry grants.json, and one folder per run.
// Family: none.

const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const { ownerMessages, findTranscript } = require('./voice.js')
const { newRunId, isRunId, dataDir: runDataDir, aetherDir, runDir, installDirs } = require('./run.js')
const { readBrakeSettings, isAetherSession } = require('./session.js')
const { repoPaths, isRepository } = require('./git.js')
const { isObject } = require('./common.js')
const { trustedFile } = require('./skill-rules.js')
const { report: reportRun, runStartOf, finalizedRecords, readUsage } = require('./report.js')
const { loadPrices, priceEntry } = require('./prices.js')
const { delegateAttemptWindows, attemptBriefText } = require('./delegate-log.js')

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

function openRuns(mainRoot) {
  const list = []
  for (const item of runs(mainRoot)) {
    if (item.run.ended === null) list.push(item)
  }
  return list
}

function runsSummary(open) {
  return open.map(({ run }) => ({ id: run.id, session: run.session ?? null }))
}

function formatRunList(open) {
  return open.map(({ run }) => `${run.id} (session ${run.session || 'unknown'})`).join(', ')
}

function ambiguousMessage(open) {
  return `more than one run is open and this call does not say which is its own: ${formatRunList(open)}; name one with aether-autonomy status <id> or aether-autonomy end <id> --outcome incomplete, or pass --session <id>`
}

function foreignMessage(session, open) {
  const continues = open.map(({ run }) => `aether-autonomy continue ${run.id}`).join(' or ')
  const ends = open.map(({ run }) => `aether-autonomy end ${run.id} --outcome incomplete`).join(' or ')
  return `session ${session} has no run open; open runs: ${formatRunList(open)}; if one is yours from a restarted session, continue it with: ${continues}; otherwise close an old run with: ${ends}`
}

function selectRun(mainRoot, { session = null, id = null } = {}) {
  const open = openRuns(mainRoot)
  const list = runsSummary(open)
  if (id !== null && id !== undefined) {
    for (const item of runs(mainRoot)) {
      if (item.run.id !== id && path.basename(item.paths.dir) !== id) continue
      if (item.run.ended === null) return { ok: true, item }
      return { ok: false, code: 'not-open', message: `run ${id} is not open`, runs: list }
    }
    return { ok: false, code: 'unknown-id', message: `no run ${id}`, runs: list }
  }
  if (!open.length) return { ok: false, code: 'no-run', message: 'no open run', runs: [] }
  if (session) {
    const own = open.filter((item) => item.run.session === session)
    if (own.length) return { ok: true, item: own[own.length - 1] }
    if (open.length === 1 && !open[0].run.session) return { ok: true, item: open[0] }
    if (open.every((item) => !item.run.session)) {
      return { ok: false, code: 'ambiguous', message: ambiguousMessage(open), runs: list }
    }
    const result = { ok: false, code: 'foreign', message: foreignMessage(session, open), runs: list }
    if (open.length === 1) result.item = open[0]
    return result
  }
  if (open.length === 1) return { ok: true, item: open[0] }
  return { ok: false, code: 'ambiguous', message: ambiguousMessage(open), runs: list }
}

function runsFor(mainRoot, session) {
  const open = openRuns(mainRoot)
  const picked = selectRun(mainRoot, { session })
  const own = picked.ok ? picked.item : null
  const others = own ? open.filter((item) => item.paths.dir !== own.paths.dir) : open
  return { own, others }
}

function runSessions(run) {
  const prev = Array.isArray(run && run.previousSessions) ? run.previousSessions : []
  return new Set([run && run.session, ...prev].filter((s) => typeof s === 'string' && s !== ''))
}

function latestSessionRunStart(mainRoot, session) {
  let latest = null
  for (const { run } of runs(mainRoot)) {
    if (!runSessions(run).has(session)) continue
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
    `- USD: ${usd === null ? 'ilimitado' : usd} (${SOURCE_LABELS[source.usd]})`,
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
  const sel = selectRun(mainRoot, { session })
  if (sel.ok && (!session || sel.item.run.session === session)) {
    throw new Error(`run ${sel.item.run.id} is already open`)
  }
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
    ceilingChanges: [],
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

// Widens the ceilings of the open run without closing it (issue 253): the new
// values are totals since the run started, and the hours and dollars already
// spent keep counting. A null usd is unlimited and removes the dollar ceiling.
// The quote is verified with the same verifyQuote as start; no new plan
// approval is needed, the owner's own words are the authorization. Every
// change is appended to run.ceilingChanges with its old and new values.
function extend(mainRoot, { hours, usd, quote, session } = {}, { configDir, now = Date.now() } = {}) {
  if (hours === undefined && usd === undefined) throw new Error('extend needs --hours or --usd')
  if (hours !== undefined && !isPositive(hours)) throw new Error(`invalid ceiling: ${hours}`)
  if (usd !== undefined && usd !== null && !isPositive(usd)) throw new Error(`invalid ceiling: ${usd}`)
  const sel = selectRun(mainRoot, { session })
  if (!sel.ok) return sel.code === 'no-run' ? { ok: false, reason: sel.message } : { ok: false, reason: sel.message, code: sel.code }
  const verified = verifyQuote(session, quote, { configDir })
  if (!verified.ok) return { ok: false, reason: verified.reason }
  const { run, paths } = sel.item
  if (!Array.isArray(run.ceilingChanges)) run.ceilingChanges = []
  const from = { hours: run.ceilings.hours, usd: run.ceilings.usd }
  const to = { hours: hours !== undefined ? hours : from.hours, usd: usd !== undefined ? usd : from.usd }
  const source = run.ceilings.source || {}
  run.ceilings = {
    hours: to.hours,
    usd: to.usd,
    source: {
      hours: hours !== undefined ? 'owner' : (source.hours || 'default'),
      usd: usd !== undefined ? 'owner' : (source.usd || 'default'),
    },
  }
  run.ceilingChanges.push({ at: new Date(now).toISOString(), quote, quoteTime: verified.time, from, to })
  writeJsonFile(paths.runFile, run)
  return { ok: true, run, from, to }
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

function mergeWindows(intervals) {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged = [sorted[0].slice()]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const curr = sorted[i]
    if (curr[0] <= last[1]) {
      last[1] = Math.max(last[1], curr[1])
    } else {
      merged.push(curr.slice())
    }
  }
  return merged
}

// Timestamp in ms of a runs.jsonl record, or NaN when no known time field is valid.
function recordTime(record) {
  for (const key of ['finalizedAt', 'sweptAt', 'at', 'timestamp', 'ts']) {
    if (record[key] !== undefined && record[key] !== null) {
      const t = typeof record[key] === 'number' ? record[key] : Date.parse(record[key])
      if (Number.isFinite(t)) return t
    }
  }
  return NaN
}

// Swarm runs of `mainRoot` whose latest record in runs.jsonl (by record time across all install
// files) is `abandoned` and whose run folder shows no activity after `sweptAt` (other than
// `saved.json`), mapped to their `sweptAt` timestamp in ms (or NaN when absent/invalid).
function abandonedRuns(mainRoot, dataDir = runDataDir()) {
  const latest = new Map()
  for (const install of installDirs(dataDir)) {
    let text
    try {
      text = fs.readFileSync(path.join(install, 'runs.jsonl'), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let record
      try {
        record = JSON.parse(line)
      } catch {
        continue
      }
      if (!record || !isRunId(record.runId)) continue
      if (record.repo && record.repo !== mainRoot) continue
      const time = recordTime(record)
      const prev = latest.get(record.runId)
      const newer = !prev || (Number.isFinite(time) ? (!Number.isFinite(prev.time) || time >= prev.time) : !Number.isFinite(prev.time))
      if (newer) latest.set(record.runId, { status: record.status, time, sweptAt: Date.parse(record.sweptAt) })
    }
  }
  const abandoned = new Map()
  for (const [id, entry] of latest) {
    if (entry.status !== 'abandoned') continue
    if (Number.isFinite(entry.sweptAt) && latestRunFileMtime(runDir(mainRoot, id)) > entry.sweptAt) continue
    abandoned.set(id, entry.sweptAt)
  }
  return abandoned
}

// Latest mtimeMs of files inside `dir`, skipping symlinks and `saved.json` (which an earlier
// quota-brake may have written after abandonment). Returns -Infinity when none can be read.
function latestRunFileMtime(dir, isRoot = true) {
  let latest = -Infinity
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return latest
  }
  for (const entry of entries) {
    if (isRoot && entry.name === 'saved.json') continue
    const full = path.join(dir, entry.name)
    let stat
    try {
      stat = fs.lstatSync(full)
    } catch {
      continue
    }
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) latest = Math.max(latest, latestRunFileMtime(full, false))
    else if (stat.isFile()) latest = Math.max(latest, stat.mtimeMs)
  }
  return latest
}

// End of an abandoned swarm run's window: its last recorded activity in `dir` when it falls
// between `start` and `sweptAt` (or `sweptAt` is absent), capped at `sweptAt`, and never "now".
function abandonedEnd(dir, start, sweptAt) {
  const activity = latestRunFileMtime(dir)
  if (Number.isFinite(activity) && activity >= start && (!Number.isFinite(sweptAt) || activity <= sweptAt)) {
    return activity
  }
  if (Number.isFinite(sweptAt) && sweptAt >= start) return sweptAt
  return start
}

function isDelegateRunGraph(graph) {
  return (
    isObject(graph) &&
    graph.plan === null &&
    isObject(graph.tasks) &&
    isObject(graph.tasks['task-1']) &&
    graph.tasks['task-1'].area === 'delegate' &&
    graph.tasks['task-1'].tierReason === 'delegate'
  )
}

// End of a delegate attempt's one-unit run without result.json: the `result` time in the delegate log.
// Finished attempts carry `branch`/`worktree` on `result`; failed/timed-out attempts lack them and are
// matched via `graph.json` (delegate marker) + `briefs/task-1.md` (exact) or `[launchTime, resultTime]`.
// Returns null when the run is not a delegate run or the attempt is still in flight.
function delegateAttemptEnd(dir, id, start, windows, dataDir, briefCache = new Map()) {
  let graph
  try {
    graph = JSON.parse(fs.readFileSync(path.join(dir, 'graph.json'), 'utf8'))
  } catch {
    return null
  }
  if (!isDelegateRunGraph(graph)) return null

  if (windows.byRunId.has(id)) {
    const end = windows.byRunId.get(id)
    return end >= start ? end : start
  }

  const unlinked = windows.attempts.filter((a) => a.runId === null)
  let briefText = null
  try {
    briefText = fs.readFileSync(path.join(dir, 'briefs', 'task-1.md'), 'utf8')
  } catch {
    // Brief may be absent; fall back to launch..result window matching below.
  }
  if (briefText !== null) {
    const cachedBrief = (a) => {
      const key = `${a.session ?? ''}\0${a.task}\0${a.attempt}`
      if (briefCache.has(key)) return briefCache.get(key)
      const text = attemptBriefText(dataDir, a.session, a.task, a.attempt)
      briefCache.set(key, text)
      return text
    }
    const briefMatches = unlinked.filter((a) => cachedBrief(a) === briefText)
    if (briefMatches.length > 0) {
      const narrowed = briefMatches.length === 1
        ? briefMatches
        : briefMatches.filter((a) => a.launchTime <= start && (a.resultTime === null || start <= a.resultTime))
      if (narrowed.length === 1) {
        const hit = narrowed[0]
        if (hit.resultTime === null) return null
        return hit.resultTime >= start ? hit.resultTime : start
      }
      return null
    }
  }

  const windowMatches = unlinked.filter((a) => a.launchTime <= start && (a.resultTime === null || start <= a.resultTime))
  if (windowMatches.length === 1 && windowMatches[0].resultTime !== null) {
    const end = windowMatches[0].resultTime
    return end >= start ? end : start
  }
  return null
}

// The swarm runs of this repository that belong to the open run: compiled at or after the run started and before it
// ended (issue 191). Each one's figure is the lanes total of aether-report --run, read now from the usage meter and the
// lane logs, or from its record in runs.jsonl once it is finalized; the larger reading counts when both exist. A run
// with no readable figure is named in `unreadable` and counts as 0. Overlapping windows deduplicate native requests
// (issue 252); a run the union cannot place keeps its standalone figure.
function swarmSpend(mainRoot, run, { dataDir, now }) {
  const from = Date.parse(run.started)
  const until = run.ended ? Date.parse(run.ended) : Infinity
  const inWindow = (start) => Number.isFinite(start) && start >= from && start < until
  const sessions = runSessions(run)
  const matchesSession = (launchSession) => !run.session || !launchSession || sessions.has(launchSession)
  const abandoned = abandonedRuns(mainRoot, dataDir)
  const delegateWindows = delegateAttemptWindows(dataDir)
  const briefCache = new Map()
  const runsInfo = new Map()
  const failed = new Set()
  const keep = (id, rep, launchSession = null) => {
    const totalUsd = rep && rep.lanes && rep.lanes.totals && rep.lanes.totals.run && rep.lanes.totals.run.totalUsd
    if (typeof totalUsd !== 'number' || !Number.isFinite(totalUsd)) return
    const prev = runsInfo.get(id)
    if (!prev || totalUsd >= prev.totalUsd) {
      const lanesUsd = (rep.lanes && rep.lanes.totals && rep.lanes.totals.run && rep.lanes.totals.run.lanesUsd) || 0
      const start = Date.parse(rep.speed && rep.speed.run && rep.speed.run.start)
      const end = Date.parse(rep.speed && rep.speed.run && rep.speed.run.end)
      const session = launchSession || (rep.usage && rep.usage.session) || null
      runsInfo.set(id, { id, totalUsd, lanesUsd, start, end, session })
    }
  }
  let ids = []
  try {
    ids = fs.readdirSync(path.join(aetherDir(mainRoot), 'runs')).filter(isRunId)
  } catch {
    // No swarm run has been compiled in this repository yet.
  }
  for (const id of ids) {
    const dir = runDir(mainRoot, id)
    if (!fs.existsSync(path.join(dir, 'graph.json'))) continue
    let launchSession = null
    try {
      const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'))
      if (state && typeof state.session === 'string' && state.session) launchSession = state.session
    } catch {
      // Missing or unreadable state.json: treated as no launching session recorded (R8).
    }
    if (!matchesSession(launchSession)) continue
    let start
    try {
      start = runStartOf(dir)
    } catch {
      failed.add(id)
      continue
    }
    if (!inWindow(start)) continue
    let reportNow = now
    if (!fs.existsSync(path.join(dir, 'result.json'))) {
      if (abandoned.has(id)) {
        reportNow = abandonedEnd(dir, start, abandoned.get(id))
      } else {
        const delegateEnd = delegateAttemptEnd(dir, id, start, delegateWindows, dataDir, briefCache)
        if (delegateEnd !== null) reportNow = delegateEnd
      }
    }
    try {
      let rep
      if (launchSession) {
        try {
          rep = reportRun(mainRoot, id, { tests: false, dataDir, now: reportNow, session: launchSession })
        } catch (err) {
          if (err && typeof err.message === 'string' && err.message.startsWith('usage session ')) {
            rep = reportRun(mainRoot, id, { tests: false, dataDir, now: reportNow })
          } else {
            throw err
          }
        }
      } else {
        rep = reportRun(mainRoot, id, { tests: false, dataDir, now: reportNow })
      }
      keep(id, rep, launchSession)
    } catch {
      failed.add(id)
    }
  }
  for (const record of finalizedRecords(dataDir)) {
    if (record.repo !== mainRoot || !isRunId(record.runId)) continue
    const launchSession = typeof record.session === 'string' && record.session ? record.session : null
    if (!matchesSession(launchSession)) continue
    const report = record.report || {}
    const recordStart = Date.parse(report.speed && report.speed.run && report.speed.run.start)
    if (!inWindow(recordStart)) {
      // A record with no finite start cannot be placed by its window; it counts only
      // when a finite finalizedAt places it inside the run, so the deduplication below
      // can fall back to its standalone figure. A record with neither time could be any
      // old run of this repository, and is left out.
      if (Number.isFinite(recordStart)) continue
      const finalizedAt = Date.parse(record.finalizedAt)
      if (!inWindow(finalizedAt)) continue
    }
    keep(record.runId, report, launchSession)
  }

  // `estimated` holds the runs named in `unreadable` when reading usage or prices
  // fails below; runs that keep a standalone figure are not named there.
  const estimated = new Set()
  let totalUsd = 0
  if (runsInfo.size === 1) {
    totalUsd = [...runsInfo.values()][0].totalUsd
  } else if (runsInfo.size > 1) {
    // Lanes count once per run; each native request counts once over the union of the
    // runs' windows (issue 252). readUsage and loadPrices throw on unreadable files, and
    // status must never throw: on failure every run keeps its standalone figure (spentOf
    // counts those with the issue-191 rule when totalUsd is null) and every run is named.
    try {
      let totalLanesUsd = 0
      for (const info of runsInfo.values()) totalLanesUsd += info.lanesUsd

      const minStart = Math.min(...[...runsInfo.values()].map((r) => r.start).filter(Number.isFinite))
      let nativeUsd = 0
      if (Number.isFinite(minStart)) {
        const sessions = readUsage(dataDir, { since: minStart })
        const prices = loadPrices()
        const sessionIds = new Set()
        for (const info of runsInfo.values()) if (info.session) sessionIds.add(info.session)
        if (sessionIds.size === 0 && run.session) sessionIds.add(run.session)

        const covered = new Set()
        for (const sessionId of sessionIds) {
          const usage = sessions.get(sessionId)
          const sessionRuns = [...runsInfo.values()].filter((r) => r.session === sessionId || (!r.session && sessionId === run.session))
          for (const r of sessionRuns) covered.add(r.id)
          if (usage && Array.isArray(usage.entries)) {
            const sessionWindows = sessionRuns
              .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end))
              .map((r) => [r.start, r.end])
            const merged = mergeWindows(sessionWindows)
            for (const entry of usage.entries) {
              if (merged.some(([s, e]) => entry.t >= s && entry.t <= e)) {
                const usd = priceEntry(entry, prices)
                if (usd !== null) nativeUsd += usd
              }
            }
            // A run without a finite start and end has no window to place its native
            // requests in, so the union would lose them: fall back to its standalone
            // native figure.
            for (const r of sessionRuns) {
              if (!Number.isFinite(r.start) || !Number.isFinite(r.end)) nativeUsd += Math.max(0, r.totalUsd - r.lanesUsd)
            }
          } else {
            // The session's usage cannot be read, so each run's native figure is its own
            // reading and adding them would count shared requests once per run. Group the
            // runs by overlapping windows and count each group's native spend once, as the
            // largest of its figures; a run with no finite window stands on its own figure.
            const windowed = sessionRuns
              .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end))
              .sort((a, b) => a.start - b.start)
            const groups = []
            for (const r of windowed) {
              const last = groups[groups.length - 1]
              if (last && r.start <= last.end) {
                last.runs.push(r)
                last.end = Math.max(last.end, r.end)
              } else {
                groups.push({ runs: [r], end: r.end })
              }
            }
            for (const r of sessionRuns) {
              if (!Number.isFinite(r.start) || !Number.isFinite(r.end)) groups.push({ runs: [r], end: Infinity })
            }
            for (const group of groups) {
              nativeUsd += Math.max(0, ...group.runs.map((r) => r.totalUsd - r.lanesUsd))
            }
          }
        }
        // A run no iterated session admitted (no session while another run has
        // one, or a session matching none) keeps its standalone native figure.
        for (const info of runsInfo.values()) {
          if (!covered.has(info.id)) nativeUsd += Math.max(0, info.totalUsd - info.lanesUsd)
        }
      } else {
        // No run has a finite start, so no window can place any native request:
        // every run keeps its standalone native figure.
        for (const info of runsInfo.values()) nativeUsd += Math.max(0, info.totalUsd - info.lanesUsd)
      }
      totalUsd = totalLanesUsd + nativeUsd
    } catch {
      totalUsd = null
      for (const id of runsInfo.keys()) estimated.add(id)
    }
  }

  const unreadable = [...failed].filter((id) => !runsInfo.has(id))
  return {
    runs: [...runsInfo.keys()].sort().map((id) => ({ run: id, usd: round2(runsInfo.get(id).totalUsd) })),
    unreadable: [...new Set([...unreadable, ...estimated])].sort(),
    totalUsd,
  }
}

// The spend of the open run in USD: each recorded figure, except that a swarm run's own figure is read here and the
// larger of it and its recorded figure counts once (issue 191). Overlapping swarm runs deduplicate native requests (issue 252).
function spentOf(run, swarms, dedupedSwarmUsd = null) {
  const counted = new Map(swarms.runs.map((entry) => [entry.run, entry.usd]))
  let total = 0
  for (const entry of run.spend) if (!counted.has(entry.source)) total += entry.usd
  if (dedupedSwarmUsd === null || counted.size <= 1) {
    for (const [id, usd] of counted) {
      const recorded = run.spend.filter((entry) => entry.source === id).map((entry) => entry.usd)
      total += Math.max(usd, ...recorded)
    }
  } else {
    total += dedupedSwarmUsd
    for (const [id, usd] of counted) {
      const recorded = run.spend.filter((entry) => entry.source === id).map((entry) => entry.usd)
      const maxRecorded = Math.max(0, ...recorded)
      if (maxRecorded > usd) {
        total += maxRecorded - usd
      }
    }
  }
  return round2(total)
}

function statusOfRun(run, paths, now, { mainRoot = null, dataDir = runDataDir() } = {}) {
  ensureBrakeFields(run)
  const pausedMs = pausedMsOf(run, now)
  const elapsed = round2((now - Date.parse(run.started) - pausedMs) / 3600000)
  const paused = round2(pausedMs / 3600000)
  const swarmData = mainRoot ? swarmSpend(mainRoot, run, { dataDir, now }) : { runs: [], unreadable: [], totalUsd: 0 }
  const swarms = { runs: swarmData.runs, unreadable: swarmData.unreadable }
  const spent = spentOf(run, swarms, swarmData.totalUsd)
  const idleMinutes = Math.max(0, Math.floor((now - lastActivity(run, paths)) / 60000))
  const quotaPaused = !run.brakeOff && run.quotaPauses.some((pause) => Date.parse(pause.resumeAt) > now)
  let stop = null
  if (quotaPaused) stop = 'quota'
  else if (elapsed >= run.ceilings.hours) stop = 'time'
  // A null dollar ceiling is unlimited: the run never stops for cost.
  else if (run.ceilings.usd !== null && spent >= run.ceilings.usd) stop = 'cost'
  const lastPause = run.quotaPauses.length ? run.quotaPauses[run.quotaPauses.length - 1] : null
  return {
    open: true,
    id: run.id,
    diary: paths.diary,
    session: run.session,
    started: run.started,
    hours: { elapsed, ceiling: run.ceilings.hours, paused },
    usd: { spent, ceiling: run.ceilings.usd },
    swarms,
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

function status(mainRoot, { now = Date.now(), dataDir = runDataDir(), session = null, id = null } = {}) {
  const sel = selectRun(mainRoot, { session, id })
  const resolvedDataDir = resolveDataDir(dataDir)
  if (sel.ok) return statusOfRun(sel.item.run, sel.item.paths, now, { mainRoot, dataDir: resolvedDataDir })
  if (sel.code === 'no-run' || sel.code === 'not-open') return { open: false }
  if (sel.code === 'unknown-id') throw new Error(sel.message)
  if (sel.code === 'foreign' && sel.item) {
    return { ...statusOfRun(sel.item.run, sel.item.paths, now, { mainRoot, dataDir: resolvedDataDir }), foreign: true }
  }
  return { open: true, selected: false, code: sel.code, runs: sel.runs, message: sel.message }
}

function launchRefusal(cwd, { session = null, dataDir = runDataDir(), now = Date.now() } = {}) {
  const resolvedDataDir = resolveDataDir(dataDir)
  if (!isAetherSession(resolvedDataDir, session)) return null
  let mainRoot
  try {
    mainRoot = repoPaths(cwd).mainRoot
  } catch (error) {
    if (isRepository(cwd)) throw error
    return null
  }
  // An unreadable run state refuses the launch instead of throwing into the
  // caller (plan-compile has no catch): the run cannot be honored, and its
  // state names the broken file.
  let st
  let others
  try {
    const sel = selectRun(mainRoot, { session })
    if (!sel.ok) return null
    st = statusOfRun(sel.item.run, sel.item.paths, now, { mainRoot, dataDir: resolvedDataDir })
    if (!st.open || !st.stop) return null
    others = st.stop === 'quota' ? runsFor(mainRoot, session).others : null
  } catch (error) {
    return { stop: 'unreadable', id: null, message: `the open run's state could not be read: ${error.message}` }
  }
  let message
  if (st.stop === 'time') message = `autonomous run ${st.id} reached its time ceiling (${st.hours.elapsed}h / ${st.hours.ceiling}h); close it with: aether-autonomy end --outcome ceiling`
  else if (st.stop === 'cost') message = `autonomous run ${st.id} reached its spend ceiling ($${st.usd.spent} / $${st.usd.ceiling}); close it with: aether-autonomy end --outcome ceiling`
  else if (st.stop === 'quota') {
    const endClause = others.length
      ? others.map(({ run }) => `aether-autonomy end ${run.id} --outcome incomplete`).join(' or ')
      : 'aether-autonomy end --outcome incomplete'
    message = `autonomous run ${st.id} is paused by the quota brake (${st.quota.percentUsed}% used; resumeAt ${st.quota.resumeAt || 'pending'}); it is paused, not ended; start nothing of this run and wait until it resumes; and only an old run that another session left open is closed, with: ${endClause}`
  }
  else return null
  return { stop: st.stop, id: st.id, hours: st.hours, usd: st.usd, quota: st.quota, message }
}

function spend(mainRoot, usd, source, { now = Date.now(), dataDir = runDataDir(), session = null } = {}) {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) throw new Error(`invalid spend: ${usd}`)
  if (typeof source !== 'string' || source === '') throw new Error('a spend needs a source')
  const sel = selectRun(mainRoot, { session })
  if (!sel.ok) throw new Error(sel.message)
  const { run, paths } = sel.item
  const entry = { source, usd, at: new Date(now).toISOString() }
  const index = run.spend.findIndex((e) => e.source === source)
  if (index === -1) run.spend.push(entry)
  else run.spend[index] = entry
  writeJsonFile(paths.runFile, run)
  return statusOfRun(run, paths, now, { mainRoot, dataDir: resolveDataDir(dataDir) })
}

function end(mainRoot, outcome, { now = Date.now(), session = null, id = null } = {}) {
  assertOutcome(outcome)
  const sel = selectRun(mainRoot, { session, id })
  if (!sel.ok) throw new Error(sel.message)
  const { run, paths } = sel.item
  run.ended = new Date(now).toISOString()
  run.outcome = outcome
  writeJsonFile(paths.runFile, run)
  return run
}

// Hands an open run to a new session after a restart without reading a transcript or asking for a quote.
function continueRun(mainRoot, id, { session = null, now = Date.now() } = {}) {
  if (!session) {
    return { ok: false, reason: 'continue needs the session id of the caller; pass --session <id> or set CLAUDE_CODE_SESSION_ID' }
  }
  const sel = selectRun(mainRoot, { id: id ?? '' })
  if (!sel.ok) return { ok: false, reason: sel.message }
  const { run, paths } = sel.item
  if (run.session === session) return { ok: true, run, from: session, unchanged: true }
  const own = openRuns(mainRoot).find((item) => item.run.session === session && item.paths.dir !== paths.dir)
  if (own) {
    return { ok: false, reason: `session ${session} already has run ${own.run.id} open; close it before continuing another` }
  }
  const from = run.session || null
  const prev = Array.isArray(run.previousSessions) ? run.previousSessions : []
  run.previousSessions = from ? [...prev, from] : [...prev]
  run.session = session
  const iso = new Date(now).toISOString()
  writeJsonFile(paths.runFile, run)
  fs.appendFileSync(
    paths.diary,
    `\n## Continuación ${iso}\n\n- La corrida pasa de la sesión ${from || 'sin sesión'} a la sesión ${session}.\n`,
  )
  return { ok: true, run, from }
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

function activePause(run, now) {
  if (!run || run.brakeOff) return null
  for (let i = run.quotaPauses.length - 1; i >= 0; i--) {
    const pause = run.quotaPauses[i]
    if (now < Date.parse(pause.resumeAt)) {
      return { run: run.id, resetsAt: pause.resetsAt, resumeAt: pause.resumeAt, percentUsed: pause.percentUsed }
    }
  }
  return null
}

function brakeSettings(mainRoot, { session = null, now = Date.now(), dataDir } = {}) {
  const dir = resolveDataDir(dataDir)
  const fromFile = session ? readBrakeSettings(dir, session) : null
  const { threshold, push } = fromFile || { threshold: 95, push: false }
  const open = openRuns(mainRoot)
  let run = null
  let paused = null
  if (session) {
    const sel = selectRun(mainRoot, { session })
    run = sel.ok ? sel.item.run : null
    paused = activePause(run, now)
  } else {
    run = open[0] ? open[0].run : null
    for (const item of open) {
      paused = activePause(item.run, now)
      if (paused) break
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

function recordCrossingForRun({ run, paths }, { percentUsed, resetsAt, threshold, notice, now }) {
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

function summarizeCrossing(res) {
  const entry = { run: res.run, paused: res.paused }
  if (res.duplicate) entry.duplicate = true
  if (res.brakeOff) entry.brakeOff = true
  return entry
}

function recordCrossing(mainRoot, { kind, percentUsed, resetsAt, threshold, notify = { sent: false, reason: 'no-channel' } } = {}, { now = Date.now(), dataDir, session = null } = {}) {
  if (!WINDOW_KINDS.includes(kind)) throw new Error(`unknown window kind: ${kind}`)
  if (typeof percentUsed !== 'number' || !Number.isFinite(percentUsed) || percentUsed < 0) throw new Error(`invalid percent: ${percentUsed}`)
  if (typeof resetsAt !== 'string' || !Number.isFinite(Date.parse(resetsAt))) throw new Error(`invalid resetsAt: ${resetsAt}`)
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0) throw new Error(`invalid threshold: ${threshold}`)
  const dir = resolveDataDir(dataDir)
  writeNotified(dir, kind, resetsAt, now)
  if (kind === 'seven_day') return { recorded: false, paused: false, reason: 'weekly' }
  const open = openRuns(mainRoot)
  if (!open.length) return { recorded: false, paused: false, reason: 'no-run' }
  const notice = normalizeNotify(notify)
  const results = open.map((item) => recordCrossingForRun(item, { percentUsed, resetsAt, threshold, notice, now }))
  const runsList = results.map(summarizeCrossing)
  if (session) {
    const sel = selectRun(mainRoot, { session })
    if (!sel.ok) return { recorded: true, paused: false, run: null, reason: 'no-run', runs: runsList }
    const own = results.find((r) => r.run === sel.item.run.id) || results[0]
    return { ...own, runs: runsList }
  }
  return { ...results[0], runs: runsList }
}

function brakeOff(mainRoot, { quote, session } = {}, { configDir, now = Date.now() } = {}) {
  const sel = selectRun(mainRoot, { session })
  if (!sel.ok) return sel.code === 'no-run' ? { ok: false, reason: sel.message } : { ok: false, reason: sel.message, code: sel.code }
  const verified = verifyQuote(session, quote, { configDir })
  if (!verified.ok) return { ok: false, reason: verified.reason }
  const { run, paths } = sel.item
  const record = { quote, session, time: verified.time, added: new Date(now).toISOString() }
  run.brakeOff = record
  writeJsonFile(paths.runFile, run)
  return { ok: true, brakeOff: record }
}

function readSwarmState(mainRoot, swarmRunId) {
  const stateFile = path.join(mainRoot, '.aether', 'runs', swarmRunId, 'state.json')
  if (!fs.existsSync(stateFile)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function attributeSavedRuns(mainRoot, open, swarmRunId, now) {
  const state = readSwarmState(mainRoot, swarmRunId)
  if (!state) return []
  if (typeof state.session === 'string' && state.session) {
    return open.filter(({ run }) => !run.session || runSessions(run).has(state.session))
  }
  const compiledMs = typeof state.compiledAt === 'string' ? Date.parse(state.compiledAt) : NaN
  if (!Number.isFinite(compiledMs)) return []
  return open.filter(({ run }) => {
    const startMs = Date.parse(run.started)
    const endMs = run.ended ? Date.parse(run.ended) : now
    return Number.isFinite(startMs) && Number.isFinite(endMs) && compiledMs >= startMs && compiledMs <= endMs
  })
}

function recordSaved(mainRoot, saved, { now = Date.now() } = {}) {
  if (!isObject(saved) || !isRunId(saved.run) || !Array.isArray(saved.units)) throw new Error('a saved record needs a run and its units')
  const open = openRuns(mainRoot)
  if (!open.length) return { recorded: false, reason: 'no-run' }
  const targets = attributeSavedRuns(mainRoot, open, saved.run, now)
  if (!targets.length) return { recorded: false, reason: 'no-attribution' }
  const pausedTargets = targets.filter(({ run }) => run.quotaPauses.length > 0)
  if (!pausedTargets.length) return { recorded: false, reason: 'no-pause' }
  const entries = saved.units
    .filter((unit) => unit && unit.branch && unit.head && !unit.merged)
    .map((unit) => ({ swarmRun: saved.run, task: unit.task, branch: unit.branch, head: unit.head }))
  if (entries.length) {
    const list = entries.map((entry) => `\`${entry.task}\` en \`${entry.branch}\` (${entry.head})`).join(', ')
    for (const { run, paths } of pausedTargets) {
      const lastPause = run.quotaPauses[run.quotaPauses.length - 1]
      if (!Array.isArray(lastPause.savedUnits)) lastPause.savedUnits = []
      for (const entry of entries) {
        const index = lastPause.savedUnits.findIndex((unit) => unit && unit.swarmRun === entry.swarmRun && unit.task === entry.task)
        if (index === -1) lastPause.savedUnits.push(entry)
        else lastPause.savedUnits[index] = entry
      }
      writeJsonFile(paths.runFile, run)
      fs.appendFileSync(paths.diary, `- Guardadas (${saved.at}): ${list}.\n`)
    }
  }
  const out = { recorded: true, run: pausedTargets[0].run.id, savedUnits: entries }
  if (pausedTargets.length > 1) out.runs = pausedTargets.map(({ run }) => run.id)
  return out
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
  openRuns,
  runSessions,
  selectRun,
  runsFor,
  openRun,
  start,
  extend,
  launchRefusal,
  spend,
  status,
  end,
  continueRun,
  brakeSettings,
  recordCrossing,
  brakeOff,
  recordSaved,
  trustAuthor,
  abandonedRuns,
}
