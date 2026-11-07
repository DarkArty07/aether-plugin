'use strict'

// Session state, marker files and option persistence for Aether sessions under the plugin data directory.
// Manages active session markers, ops suppression, delegate settings, quota brake configuration,
// and session directory pruning. A marker also records the repository, the claude process and the last
// activity of its session (spec 030 R19), and lists the sessions of one repository (spec 030 R6).
// Family: session.

const fs = require('node:fs')
const path = require('node:path')
const { processState } = require('./continuity-store.js')
const { isObject, readJsonOrNull, writeFileAtomic } = require('./common.js')

const LEAD_AGENT = 'aether:lead'
const SESSION_ID_RE = /^[A-Za-z0-9-]+$/
const DAY_MS = 24 * 60 * 60 * 1000
// A marker without a repository that was written less than this long ago belongs to a session of the older version (spec 030 R19, A18).
const OLD_MARK_MS = 12 * 3600 * 1000

const DEFAULT_DEADLINES = Object.freeze({ quotaMs: 3000 })
const MAX_DEADLINE_MS = 10000
const DEADLINE_KEYS = { quota: 'quotaMs' }

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

// 'other=5,quota=3' -> { quotaMs }, the values in seconds. Any key other than quota is ignored. A key that is
// missing, unknown or whose value is not a positive number keeps its default; a value above MAX_DEADLINE_MS is MAX_DEADLINE_MS.
function parseDeadlines(value) {
  const out = { ...DEFAULT_DEADLINES }
  if (typeof value !== 'string') return out
  for (const pair of value.split(',')) {
    const [rawKey, rawValue, ...rest] = pair.split('=')
    if (rawValue === undefined || rest.length > 0) continue
    const key = rawKey.trim().toLowerCase()
    const field = DEADLINE_KEYS[key]
    const text = rawValue.trim()
    const seconds = /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN
    if (!field || !(seconds > 0)) continue
    out[field] = Math.min(Math.round(seconds * 1000), MAX_DEADLINE_MS)
  }
  return out
}

// The settings of the session's delegates from the plugin options in env: whether superdelegation is on, the
// harnesses that are enabled, and the quota deadline, the only key of the deadlines option that is still read
// (any key other than quota is ignored).
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
      s.deadlines !== null && typeof s.deadlines === 'object' &&
      typeof s.deadlines.quotaMs === 'number' && Number.isFinite(s.deadlines.quotaMs) && s.deadlines.quotaMs > 0
    if (!valid) return null
    return { lanes: s.lanes, harnesses: s.harnesses, deadlines: { quotaMs: s.deadlines.quotaMs } }
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

// The marker's object, or null when the file is missing, unreadable or not an object, or the id is invalid; never throws.
function readMark(dataDir, sessionId) {
  try {
    const mark = readJsonOrNull(markerFile(dataDir, sessionId))
    return isObject(mark) ? mark : null
  } catch {
    return null
  }
}

// Sets lastActivity of the marker to now, writing it atomically. True when the marker was read and written; false for an
// invalid id, a missing or unreadable marker, or a failed write. Never throws (spec 030 R19).
function touchSession(dataDir, sessionId, now = Date.now()) {
  try {
    const file = markerFile(dataDir, sessionId)
    const mark = readMark(dataDir, sessionId)
    if (!mark) return false
    writeFileAtomic(file, JSON.stringify({ ...mark, lastActivity: now }) + '\n')
    return true
  } catch {
    return false
  }
}

// The marker's ids of the sessions folder, in alphabetical order, with the valid ones only. [] when the folder does not exist.
function markerIds(dataDir) {
  let names
  try {
    names = fs.readdirSync(path.join(dataDir, 'sessions'))
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith('.json') && isValidSessionId(name.slice(0, -'.json'.length)))
    .map((name) => name.slice(0, -'.json'.length))
    .sort()
}

// The same claude process: both are set and name the same pid and start time.
const sameProcess = (a, b) => Boolean(a && b && a.pid === b.pid && a.start === b.start)

// The last activity of a marker, or its start when it has none, for the order of the lists.
const activityOf = (mark) => (typeof mark.lastActivity === 'number' ? mark.lastActivity : Number(mark.startedAt) || 0)

// The markers of the sessions of one repository, the most recent activity first, each with the state of its claude
// process (continuity-store processState). `except` leaves out one session id; `exceptProcess` ({ pid, start }) leaves out
// the sessions of one claude process, since /clear opens a new id in the same process, which is not another session.
function repoSessions(dataDir, repo, { except = null, exceptProcess = null, procRoot = '/proc' } = {}) {
  const rows = []
  for (const id of markerIds(dataDir)) {
    if (id === except) continue
    const mark = readMark(dataDir, id)
    if (!mark || mark.repo !== repo || sameProcess(mark.claude, exceptProcess)) continue
    rows.push({
      session: id,
      startedAt: mark.startedAt,
      lastActivity: mark.lastActivity,
      claude: mark.claude ?? null,
      state: processState(mark.claude ?? null, { procRoot }),
    })
  }
  return rows.sort((a, b) => activityOf(b) - activityOf(a))
}

// The ids of the markers without a repository field (written by the older version) whose file was modified less than
// maxAgeMs ago, in alphabetical order. A marker that cannot be read is not listed (spec 030 R19 b).
function oldStyleMarks(dataDir, { now = Date.now(), maxAgeMs = OLD_MARK_MS } = {}) {
  const ids = []
  for (const id of markerIds(dataDir)) {
    let stat
    try {
      stat = fs.statSync(markerFile(dataDir, id))
    } catch {
      continue
    }
    if (!stat.isFile() || now - stat.mtimeMs >= maxAgeMs) continue
    const mark = readMark(dataDir, id)
    if (mark && !('repo' in mark)) ids.push(id)
  }
  return ids
}

// Writes {"session": sessionId, "startedAt": now} to the marker file, creating its directory. Throws on a bad id (before writing anything) or a failed write.
// With repo (a text) or claude ({ pid, start }) given, the marker also holds { repo, claude, lastActivity: now } (spec 030 R19).
// With opsInMod false it also writes the ops-off file, and with it true it removes a stale one, so a session
// resumed with the option changed follows the option it has now. With delegate given it writes the delegate file,
// and with it null it removes a stale one, for the same reason. The same goes for brake and its file.
function markSession(dataDir, sessionId, now = Date.now(), { opsInMod = true, delegate = null, brake = null, repo = null, claude = null } = {}) {
  const file = markerFile(dataDir, sessionId)
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const mark = repo !== null || claude !== null
    ? { session: sessionId, startedAt: now, repo, claude, lastActivity: now }
    : { session: sessionId, startedAt: now }
  fs.writeFileSync(file, JSON.stringify(mark) + '\n')
  const off = opsOffFile(dataDir, sessionId)
  if (opsInMod) fs.rmSync(off, { force: true })
  else fs.writeFileSync(off, '')
  const delegatePath = delegateFile(dataDir, sessionId)
  if (delegate) fs.writeFileSync(delegatePath, JSON.stringify(delegate) + '\n')
  else fs.rmSync(delegatePath, { force: true })
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
    fs.rmSync(path.join(dir, `${id}.brake.json`), { force: true })
    pruned.push(id)
  }
  return pruned
}

module.exports = {
  LEAD_AGENT,
  DEFAULT_DEADLINES,
  MAX_DEADLINE_MS,
  DEFAULT_THRESHOLD,
  markerFile,
  opsOffFile,
  delegateFile,
  brakeFile,
  parseDeadlines,
  parseThreshold,
  delegateSettingsFrom,
  brakeSettingsFrom,
  readDelegateSettings,
  readBrakeSettings,
  OLD_MARK_MS,
  markSession,
  readMark,
  touchSession,
  repoSessions,
  oldStyleMarks,
  isAetherSession,
  pruneSessions,
}
