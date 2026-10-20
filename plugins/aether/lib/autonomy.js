'use strict'

// The owner's standing authorizations for irreversible steps, each verified against the owner's own
// words in a session transcript, and an autonomous run's state and ceilings (hours and USD).
// Everything lives under <mainRoot>/.aether/autonomy/: the registry grants.json, and one folder per run.

const fs = require('node:fs')
const path = require('node:path')
const { ownerMessages, findTranscript } = require('./voice.js')
const { newRunId } = require('./run.js')

const CLASSES = ['merge-main', 'push', 'publish', 'deploy', 'delete', 'credentials', 'paid-call']
const SCOPES = ['repo', 'session']
const OUTCOMES = ['done', 'ceiling', 'incomplete']
const MIN_QUOTE = 12

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

// verifyQuote, with the transcript lines supplied by linesOf(sessionId).
function verifyWith(sessionId, quote, linesOf) {
  if (Array.from(normalize(quote)).length < MIN_QUOTE) return { ok: false, reason: `the quote must have at least ${MIN_QUOTE} characters` }
  const lines = linesOf(sessionId)
  if (lines === null) return { ok: false, reason: `${NO_TRANSCRIPT}${sessionId}` }
  const found = findQuote(lines, quote)
  if (!found) return { ok: false, reason: `the quote is not in the owner's messages of session ${sessionId}` }
  return { ok: true, time: found.time }
}

function verifyQuote(sessionId, quote, { configDir } = {}) {
  return verifyWith(sessionId, quote, (id) => transcriptLines(id, configDir))
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

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
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
  const verified = verifyQuote(session, quote, { configDir })
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

// The open run and the folder it lives in (its files are written there, whatever its id says).
function findOpenRun(mainRoot) {
  const root = autonomyDir(mainRoot)
  if (!fs.existsSync(root)) return null
  const names = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  let open = null
  for (const name of names) {
    const paths = runPaths(mainRoot, name)
    if (!fs.existsSync(paths.runFile)) continue
    const run = readRun(paths.runFile)
    if (run.ended === null) open = { run, paths }
  }
  return open
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

function start(mainRoot, { quote, session, hours = null, usd = null }, { configDir, now = Date.now() } = {}) {
  const defaults = loadCeilings()
  const h = ceiling(hours, defaults.hours)
  const u = ceiling(usd, defaults.usd)
  const open = openRun(mainRoot)
  if (open) throw new Error(`run ${open.id} is already open`)
  const verified = verifyQuote(session, quote, { configDir })
  if (!verified.ok) return { ok: false, reason: verified.reason }
  const run = {
    id: `auto-${newRunId(new Date(now))}`,
    session,
    quote,
    quoteTime: verified.time,
    started: new Date(now).toISOString(),
    ceilings: { hours: h.value, usd: u.value, source: { hours: h.source, usd: u.source } },
    spend: [],
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

function statusOfRun(run, paths, now) {
  const elapsed = round2((now - Date.parse(run.started)) / 3600000)
  const spent = round2(run.spend.reduce((sum, entry) => sum + entry.usd, 0))
  const idleMinutes = Math.max(0, Math.floor((now - lastActivity(run, paths)) / 60000))
  let stop = null
  if (elapsed >= run.ceilings.hours) stop = 'time'
  else if (spent >= run.ceilings.usd) stop = 'cost'
  return {
    open: true,
    id: run.id,
    diary: paths.diary,
    session: run.session,
    started: run.started,
    hours: { elapsed, ceiling: run.ceilings.hours },
    usd: { spent, ceiling: run.ceilings.usd },
    idleMinutes,
    idle: now - lastActivity(run, paths) >= IDLE_MS,
    stop,
  }
}

function status(mainRoot, { now = Date.now() } = {}) {
  const open = findOpenRun(mainRoot)
  if (!open) return { open: false }
  return statusOfRun(open.run, open.paths, now)
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

module.exports = {
  CLASSES,
  SCOPES,
  OUTCOMES,
  MIN_QUOTE,
  normalize,
  findQuote,
  verifyQuote,
  autonomyDir,
  runPaths,
  loadCeilings,
  readGrants,
  grant,
  revoke,
  check,
  list,
  openRun,
  start,
  spend,
  status,
  end,
}
