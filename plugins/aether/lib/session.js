'use strict'

const fs = require('node:fs')
const path = require('node:path')

const LEAD_AGENT = 'aether:lead'
const SESSION_ID_RE = /^[A-Za-z0-9-]+$/
const DAY_MS = 24 * 60 * 60 * 1000

const ROUTER_MODES = ['record', 'advise', 'command']
// The values of the router option: auto, the default, is command with superdelegation on and record with it off.
const ROUTER_CHOICES = ['auto', ...ROUTER_MODES]
const ROUTER_DECIDERS = ['haiku', 'jev']
const FALLBACK_ALIASES = ['haiku', 'sonnet', 'opus']
const FALLBACK_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const DEFAULT_FALLBACK = Object.freeze({ alias: 'sonnet', effort: 'high' })
const DEFAULT_DEADLINES = Object.freeze({ haikuMs: 8000, jevMs: 3000, quotaMs: 3000 })
const MAX_DEADLINE_MS = 10000
const DEADLINE_KEYS = { haiku: 'haikuMs', jev: 'jevMs', quota: 'quotaMs' }

const DEFAULT_THRESHOLD = 95

function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_RE.test(sessionId)
}

// <dataDir>/sessions/<sessionId>.json. Throws Error('invalid session id: <id>') unless sessionId is a string matching /^[A-Za-z0-9-]+$/.
function markerFile(dataDir, sessionId) {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`invalid session id: ${String(sessionId)}`)
  }
  return path.join(dataDir, 'sessions', `${sessionId}.json`)
}

// <dataDir>/sessions/<sessionId>.ops-off: present when the session's ops option is off, which the mod reads
// by its existence, as it reads the marker's. Same id rules as the marker.
function opsOffFile(dataDir, sessionId) {
  return markerFile(dataDir, sessionId).replace(/\.json$/, '.ops-off')
}

// <dataDir>/sessions/<sessionId>.delegate.json: the settings of the session's delegates (superdelegation, the
// harnesses and the quota deadline), which aether-delegate reads. Same id rules as the marker.
function delegateFile(dataDir, sessionId) {
  return markerFile(dataDir, sessionId).replace(/\.json$/, '.delegate.json')
}

// <dataDir>/sessions/<sessionId>.router.json: the router's settings for the session, which the router's
// commands read. No session start writes it any more: only lib/route.js still reads it, until Task 16 retires
// both. Same id rules as the marker.
function routerFile(dataDir, sessionId) {
  return markerFile(dataDir, sessionId).replace(/\.json$/, '.router.json')
}

// <dataDir>/sessions/<sessionId>.brake.json: the session's quota brake settings. Same id rules as the marker.
function brakeFile(dataDir, sessionId) {
  return markerFile(dataDir, sessionId).replace(/\.json$/, '.brake.json')
}

// A finite number n with 0 < n <= 100, or DEFAULT_THRESHOLD for anything else.
function parseThreshold(value) {
  if (typeof value !== 'string') return DEFAULT_THRESHOLD
  const text = value.trim()
  if (!text) return DEFAULT_THRESHOLD
  const n = Number(text)
  if (Number.isFinite(n) && n > 0 && n <= 100) return n
  return DEFAULT_THRESHOLD
}

// 'alias:effort' -> { alias, effort }, case-insensitive and trimmed. Anything else is DEFAULT_FALLBACK.
function parseFallback(value) {
  const parts = typeof value === 'string' ? value.trim().toLowerCase().split(':') : []
  if (parts.length !== 2) return { ...DEFAULT_FALLBACK }
  const [alias, effort] = parts.map((part) => part.trim())
  if (!FALLBACK_ALIASES.includes(alias) || !FALLBACK_EFFORTS.includes(effort)) return { ...DEFAULT_FALLBACK }
  return { alias, effort }
}

// 'haiku=8,jev=3,quota=3' -> { haikuMs, jevMs, quotaMs }, the values in seconds. A key that is missing, unknown or
// whose value is not a positive number keeps its default; a value above MAX_DEADLINE_MS is MAX_DEADLINE_MS.
function parseDeadlines(value) {
  const out = { ...DEFAULT_DEADLINES }
  if (typeof value !== 'string') return out
  for (const pair of value.split(',')) {
    const [rawKey, rawValue, ...rest] = pair.split('=')
    if (rawValue === undefined || rest.length > 0) continue
    const field = DEADLINE_KEYS[rawKey.trim().toLowerCase()]
    const text = rawValue.trim()
    const seconds = /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN
    if (!field || !(seconds > 0)) continue
    out[field] = Math.min(Math.round(seconds * 1000), MAX_DEADLINE_MS)
  }
  return out
}

// The router's settings from the plugin options in env: a decider that is not listed is haiku. A mode that is not
// listed, auto among them, is command with superdelegation on (the router decides where each delegate runs) and
// record with it off (the router only writes what it would have decided).
function routerSettingsFrom(env = process.env) {
  const { enabledHarnesses } = require('./lanes.js')
  const { resolveOption } = require('./superdelegation.js')
  const mode = env.CLAUDE_PLUGIN_OPTION_ROUTER
  const decider = env.CLAUDE_PLUGIN_OPTION_DECIDER
  const superdelegation = resolveOption(env).on
  return {
    mode: ROUTER_MODES.includes(mode) ? mode : (superdelegation ? 'command' : 'record'),
    decider: ROUTER_DECIDERS.includes(decider) ? decider : 'haiku',
    fallback: parseFallback(env.CLAUDE_PLUGIN_OPTION_FALLBACK),
    deadlines: parseDeadlines(env.CLAUDE_PLUGIN_OPTION_DEADLINES),
    lanes: superdelegation,
    harnesses: enabledHarnesses({ AETHER_LANE_HARNESSES: env.CLAUDE_PLUGIN_OPTION_HARNESSES }),
  }
}

// The settings of the session's delegates from the plugin options in env: whether superdelegation is on, the
// harnesses that are enabled, and the quota deadline, the only key of the deadlines option that is still read
// (haiku= and jev= are accepted and ignored: no decider is left to give a time to).
function delegateSettingsFrom(env = process.env) {
  const { enabledHarnesses } = require('./lanes.js')
  const { resolveOption } = require('./superdelegation.js')
  return {
    lanes: resolveOption(env).on,
    harnesses: enabledHarnesses({ AETHER_LANE_HARNESSES: env.CLAUDE_PLUGIN_OPTION_HARNESSES }),
    deadlines: { quotaMs: parseDeadlines(env.CLAUDE_PLUGIN_OPTION_DEADLINES).quotaMs },
  }
}

// The settings in the session's delegate file, or null when it is missing, unreadable or invalid.
function readDelegateSettings(dataDir, sessionId) {
  try {
    const s = JSON.parse(fs.readFileSync(delegateFile(dataDir, sessionId), 'utf8'))
    const valid =
      s !== null && typeof s === 'object' &&
      typeof s.lanes === 'boolean' &&
      Array.isArray(s.harnesses) && s.harnesses.every((name) => typeof name === 'string') &&
      s.deadlines !== null && typeof s.deadlines === 'object' && isPositiveNumber(s.deadlines.quotaMs)
    if (!valid) return null
    return { lanes: s.lanes, harnesses: s.harnesses, deadlines: { quotaMs: s.deadlines.quotaMs } }
  } catch {
    return null
  }
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

// The settings in the session's router file, or null when it is missing, unreadable or invalid.
function readRouterSettings(dataDir, sessionId) {
  try {
    const s = JSON.parse(fs.readFileSync(routerFile(dataDir, sessionId), 'utf8'))
    const valid =
      s !== null && typeof s === 'object' &&
      ROUTER_MODES.includes(s.mode) &&
      ROUTER_DECIDERS.includes(s.decider) &&
      s.fallback && FALLBACK_ALIASES.includes(s.fallback.alias) && FALLBACK_EFFORTS.includes(s.fallback.effort) &&
      s.deadlines && isPositiveNumber(s.deadlines.haikuMs) && isPositiveNumber(s.deadlines.jevMs) && isPositiveNumber(s.deadlines.quotaMs) &&
      typeof s.lanes === 'boolean' &&
      Array.isArray(s.harnesses) && s.harnesses.every((name) => typeof name === 'string')
    if (!valid) return null
    const { mode, decider, fallback, deadlines, lanes, harnesses } = s
    return {
      mode,
      decider,
      fallback: { alias: fallback.alias, effort: fallback.effort },
      deadlines: { haikuMs: deadlines.haikuMs, jevMs: deadlines.jevMs, quotaMs: deadlines.quotaMs },
      lanes,
      harnesses,
    }
  } catch {
    return null
  }
}

function brakeSettingsFrom(env = process.env) {
  return {
    threshold: parseThreshold(env.CLAUDE_PLUGIN_OPTION_QUOTABRAKE),
    push: env.CLAUDE_PLUGIN_OPTION_BRAKEPUSH === 'true',
  }
}

// The settings in the session's brake file, or null when it is missing, unreadable or invalid.
function readBrakeSettings(dataDir, sessionId) {
  try {
    if (!isValidSessionId(sessionId)) return null
    const s = JSON.parse(fs.readFileSync(brakeFile(dataDir, sessionId), 'utf8'))
    const valid =
      s !== null &&
      typeof s === 'object' &&
      !Array.isArray(s) &&
      typeof s.threshold === 'number' &&
      Number.isFinite(s.threshold) &&
      s.threshold > 0 &&
      s.threshold <= 100 &&
      typeof s.push === 'boolean'
    if (!valid) return null
    return { threshold: s.threshold, push: s.push }
  } catch {
    return null
  }
}

// Writes {"session": sessionId, "startedAt": now} to the marker file, creating its directory. Throws on a bad id (before writing anything) or a failed write.
// With opsInMod false it also writes the ops-off file, and with it true it removes a stale one, so a session
// resumed with the option changed follows the option it has now. With delegate given it writes the delegate file,
// and with it null it removes a stale one, for the same reason. The same goes for brake and its file, and for
// router, which no session start gives any more (so it removes the file an older version left) and which stays
// accepted until Task 16 retires lib/route.js, the only reader of the router file.
function markSession(dataDir, sessionId, now = Date.now(), { opsInMod = true, delegate = null, router = null, brake = null } = {}) {
  const file = markerFile(dataDir, sessionId)
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ session: sessionId, startedAt: now }) + '\n')
  const off = opsOffFile(dataDir, sessionId)
  if (opsInMod) fs.rmSync(off, { force: true })
  else fs.writeFileSync(off, '')
  const delegatePath = delegateFile(dataDir, sessionId)
  if (delegate) fs.writeFileSync(delegatePath, JSON.stringify(delegate) + '\n')
  else fs.rmSync(delegatePath, { force: true })
  const routerPath = routerFile(dataDir, sessionId)
  if (router) fs.writeFileSync(routerPath, JSON.stringify(router) + '\n')
  else fs.rmSync(routerPath, { force: true })
  const brakePath = brakeFile(dataDir, sessionId)
  if (brake) fs.writeFileSync(brakePath, JSON.stringify(brake) + '\n')
  else fs.rmSync(brakePath, { force: true })
}

// True when the marker file exists. False for an invalid or missing id; never throws.
function isAetherSession(dataDir, sessionId) {
  try {
    if (!isValidSessionId(sessionId)) return false
    return fs.existsSync(markerFile(dataDir, sessionId))
  } catch {
    return false
  }
}

// Deletes <dataDir>/sessions/*.json whose modification time is more than `days` days before `now`. Returns the deleted ids; [] when the directory does not exist. Other files stay.
function pruneSessions(dataDir, { days = 30, now = Date.now() } = {}) {
  const dir = path.join(dataDir, 'sessions')
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  const pruned = []
  for (const file of entries.sort()) {
    if (!file.endsWith('.json')) continue
    const id = file.slice(0, -'.json'.length)
    if (!isValidSessionId(id)) continue
    const full = path.join(dir, file)
    let stat
    try {
      stat = fs.statSync(full)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    if (now - stat.mtimeMs <= days * DAY_MS) continue
    fs.rmSync(full, { force: true })
    fs.rmSync(path.join(dir, `${id}.ops-off`), { force: true })
    fs.rmSync(path.join(dir, `${id}.delegate.json`), { force: true })
    fs.rmSync(path.join(dir, `${id}.router.json`), { force: true })
    fs.rmSync(path.join(dir, `${id}.brake.json`), { force: true })
    pruned.push(id)
  }
  return pruned
}

module.exports = {
  LEAD_AGENT,
  ROUTER_MODES,
  ROUTER_CHOICES,
  ROUTER_DECIDERS,
  DEFAULT_FALLBACK,
  DEFAULT_DEADLINES,
  MAX_DEADLINE_MS,
  DEFAULT_THRESHOLD,
  markerFile,
  opsOffFile,
  delegateFile,
  routerFile,
  brakeFile,
  parseFallback,
  parseDeadlines,
  parseThreshold,
  delegateSettingsFrom,
  routerSettingsFrom,
  brakeSettingsFrom,
  readDelegateSettings,
  readRouterSettings,
  readBrakeSettings,
  markSession,
  isAetherSession,
  pruneSessions,
}
