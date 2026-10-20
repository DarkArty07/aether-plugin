'use strict'

// The lane library: the table of external harnesses and their models, harness detection,
// the quota and token readings they leave, the lane log, and the kills that stop a lane's processes:
// by the group of a pid file, and by the marker in their environment.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { HARNESS_NAMES } = require('./harness/index.js')
const { readingUsable } = require('./lane-order.js')

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'lanes.json')
const ROLES = ['implementer', 'supervisor', 'reviewer']
// The design seats a lane model may take as well (lib/seats.js), and each seat's timeout when its harness names none.
const SEATS = ['judge', 'writer', 'examiner']
const SEAT_TIMEOUTS = { judge: 1200, writer: 2700, examiner: 1800 }
// A model id is written into commands that hooks/ops-command.mjs checks, which takes only these characters (and a few
// more), so the table takes no more.
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const DAY_MS = 24 * 3600 * 1000
const KILL_WAIT_MS = 2000
const KILL_POLL_MS = 50

function configPath() {
  return process.env.AETHER_LANES_CONFIG || CONFIG_FILE
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isInteger = (value, min) => Number.isInteger(value) && value >= min

function validateModel(harness, id, model, groups) {
  const fail = (field, problem) => {
    throw new Error(`harness ${harness}, model ${id}: ${field} ${problem}`)
  }
  if (!MODEL_ID.test(id)) fail('id', 'must start with a letter or digit and use only letters, digits, ".", "_" and "-": the lane choice cannot log any other')
  if (!isObject(model)) fail('model', 'must be an object')
  if (typeof model.group !== 'string' || !Object.hasOwn(groups, model.group)) fail('group', 'must name one of the groups')
  if (!Array.isArray(model.roles) || model.roles.length === 0 || !model.roles.every((role) => ROLES.includes(role) || SEATS.includes(role))) {
    fail('roles', 'must be a non-empty list of implementer, supervisor, reviewer, judge, writer or examiner')
  }
}

function validateHarness(name, harness) {
  const fail = (field, problem) => {
    throw new Error(`harness ${name}: ${field} ${problem}`)
  }
  if (!isObject(harness)) throw new Error(`harness ${name} must be an object`)
  if (typeof harness.command !== 'string' || harness.command === '') fail('command', 'must be a non-empty string')
  if (!isInteger(harness.maxParallel, 1)) fail('maxParallel', 'must be an integer of at least 1')
  if (!isInteger(harness.waitSeconds, 1)) fail('waitSeconds', 'must be an integer of at least 1')
  if (harness.quotaLifeMinutes !== undefined && !isInteger(harness.quotaLifeMinutes, 0)) {
    fail('quotaLifeMinutes', 'must be an integer of at least 0')
  }
  if (!isObject(harness.timeouts) || !ROLES.every((role) => isInteger(harness.timeouts[role], 1))) {
    fail('timeouts', 'must give an integer of at least 1 for each role')
  }
  if (!SEATS.every((seat) => harness.timeouts[seat] === undefined || isInteger(harness.timeouts[seat], 1))) {
    fail('timeouts', 'must give an integer of at least 1 for each seat it names')
  }
  if (!isObject(harness.groups) || !Object.values(harness.groups).every((label) => typeof label === 'string')) {
    fail('groups', 'must be an object of strings')
  }
  if (!isObject(harness.models)) fail('models', 'must be an object')
  for (const [id, model] of Object.entries(harness.models)) validateModel(name, id, model, harness.groups)
}

function validateConfig(config) {
  if (!isObject(config)) throw new Error('the table must be an object')
  if (typeof config.reserve !== 'number' || !(config.reserve >= 0 && config.reserve <= 1)) {
    throw new Error('reserve must be a number from 0 to 1')
  }
  if (config.dryMarkMinutes !== undefined && !isInteger(config.dryMarkMinutes, 1)) {
    throw new Error('dryMarkMinutes must be an integer of at least 1')
  }
  // A mark longer than the weekly window, the longest a quota lasts, would be read as damaged and ignored.
  if (config.dryMarkMinutes > 7 * 24 * 60) throw new Error('dryMarkMinutes must be at most 10080, a week')
  if (!isObject(config.harnesses)) throw new Error('harnesses must be an object')
  // A group key names one quota, so two harnesses must not share one. A model id names one lane, so it must not be
  // in two harnesses either: start could not tell which of them takes its calls.
  const owners = new Map()
  const modelOwners = new Map()
  for (const [name, harness] of Object.entries(config.harnesses)) {
    validateHarness(name, harness)
    for (const group of Object.keys(harness.groups)) {
      if (owners.has(group)) throw new Error(`group ${group} is used by harnesses ${owners.get(group)} and ${name}: group keys are unique across the table`)
      owners.set(group, name)
    }
    for (const id of Object.keys(harness.models)) {
      if (modelOwners.has(id)) throw new Error(`model ${id} is in harnesses ${modelOwners.get(id)} and ${name}: model ids are unique across the table`)
      modelOwners.set(id, name)
    }
  }
}

// A seat's timeout on a harness, in seconds.
function seatTimeout(harness, seat) {
  return harness.timeouts[seat] ?? SEAT_TIMEOUTS[seat]
}

// The table at file, or null when there is none. Throws when the table is not JSON or breaks a rule.
function loadConfig(file = configPath()) {
  if (!fs.existsSync(file)) return null
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'))
    validateConfig(config)
    return config
  } catch (err) {
    throw new Error(`lanes config ${file}: ${err.message}`)
  }
}

function isExecutableFile(file) {
  try {
    if (!fs.statSync(file).isFile()) return false
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

// The absolute path where command is an executable: itself when it is absolute, else the first match on
// PATH. Null when there is none.
function commandPath(command, env = process.env) {
  if (path.isAbsolute(command)) return isExecutableFile(command) ? command : null
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    if (dir === '') continue
    const file = path.resolve(dir, command)
    if (isExecutableFile(file)) return file
  }
  return null
}

function commandInstalled(command, env = process.env) {
  return commandPath(command, env) !== null
}

// The known names in a comma-separated list: trimmed, lowercased, each once, in order.
function harnessNames(text) {
  const names = []
  for (const part of String(text ?? '').split(',')) {
    const name = part.trim().toLowerCase()
    if (HARNESS_NAMES.includes(name) && !names.includes(name)) names.push(name)
  }
  return names
}

// The harnesses the owner enabled, in the order given, or agy alone when none valid is given.
function enabledHarnesses(env = process.env) {
  const names = harnessNames(env.AETHER_LANE_HARNESSES)
  return names.length > 0 ? names : ['agy']
}

// FNV-1a, 32-bit, over UTF-16 code units, then the length.
function digest(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}:${text.length}`
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!isObject(value)) return value
  const sorted = {}
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) sorted[key] = sortKeys(value[key])
  }
  return sorted
}

function canonicalJson(value) {
  return JSON.stringify(sortKeys(value))
}

function resultDigest({ result, lane }) {
  return digest(canonicalJson({ result, lane }))
}

// Whether a group's reading lets its lane take a call: the one rule, in lane-order.js. A group that cannot report
// its quota, or a window without a balance, is used until a call fails for quota.
function usable(groupQuota, reserve) {
  return readingUsable(groupQuota, reserve)
}

// Whether config's table has the group of a harness: the test that leaves out the marks of a group the table dropped.
function groupKnown(config) {
  return (harness, group) => Object.hasOwn(config?.harnesses?.[harness]?.groups ?? {}, group)
}

// What each window consumed between consecutive readings that share its reset time, and how often it reset.
function quotaConsumed(readings) {
  const sorted = [...readings].sort((a, b) => a.time - b.time)
  const names = new Set(sorted.flatMap((reading) => Object.keys(reading.windows)))
  const out = {}
  for (const name of names) {
    const points = sorted.filter((reading) => reading.windows[name]).map((reading) => reading.windows[name])
    const total = { consumed: 0, resets: 0 }
    for (let i = 1; i < points.length; i++) {
      const earlier = points[i - 1]
      const later = points[i]
      if (earlier.resetsAt === later.resetsAt) total.consumed += Math.max(0, earlier.remaining - later.remaining)
      else total.resets += 1
    }
    out[name] = total
  }
  return out
}

const numberOrZero = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

// agy counts thinking inside total only in some builds: it is output only when total includes it.
function laneTokens(usage = {}) {
  const input = numberOrZero(usage.input)
  const output = numberOrZero(usage.output)
  const thinking = numberOrZero(usage.thinking)
  const total = numberOrZero(usage.total)
  const thinkingCounted = thinking > 0 && total >= input + output + thinking
  return {
    input,
    output: thinkingCounted ? output + thinking : output,
    cacheRead: numberOrZero(usage.cacheRead),
    cacheWrite: 0,
  }
}

function logDir(dataDir) {
  return path.join(dataDir, 'lanes')
}

function logFile(dataDir, session) {
  const name = typeof session === 'string' && /^[A-Za-z0-9_-]+$/.test(session) ? session : 'unknown'
  return path.join(logDir(dataDir), `${name}.jsonl`)
}

function appendLog(dataDir, session, entry) {
  const file = logFile(dataDir, session)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`)
}

function logFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => entry.name)
    .sort()
}

function parseEntry(line) {
  try {
    const entry = JSON.parse(line)
    return isObject(entry) ? entry : null
  } catch {
    return null
  }
}

// Every entry from every session file, time-ordered. An entry without a session takes its file's name.
function readLog(dataDir, { since = 0 } = {}) {
  const dir = logDir(dataDir)
  if (!fs.existsSync(dir)) return []
  const entries = []
  for (const file of logFiles(dir)) {
    const name = file.slice(0, -'.jsonl'.length)
    const fallback = name === 'unknown' ? null : name
    for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      const entry = parseEntry(line)
      if (!entry || typeof entry.time !== 'number' || entry.time < since) continue
      entries.push({ ...entry, session: entry.session ?? fallback })
    }
  }
  return entries.sort((a, b) => a.time - b.time)
}

function pruneLog(dataDir, { days = 30, now = Date.now() } = {}) {
  const dir = logDir(dataDir)
  if (!fs.existsSync(dir)) return { pruned: [] }
  const cutoff = now - days * DAY_MS
  const pruned = []
  for (const file of logFiles(dir)) {
    const full = path.join(dir, file)
    if (fs.statSync(full).mtimeMs > cutoff) continue
    fs.rmSync(full, { force: true })
    pruned.push(file.slice(0, -'.jsonl'.length))
  }
  return { pruned: pruned.sort() }
}

// What a lane's runner and agy may inherit. agy needs only HOME and PATH to sign in (agy 1.3.2,
// 2026-10-09); the rest keeps locales, terminals and temporary directories working. Anything named
// like a secret stays out, whatever its prefix: agy ran `env` once, and its output reaches the model.
const ENV_NAMES = ['HOME', 'PATH', 'LANG', 'TERM', 'TMPDIR', 'TZ', 'USER', 'LOGNAME', 'SHELL']
const ENV_PREFIXES = ['LC_', 'XDG_', 'AETHER_']
const ENV_SECRET = /TOKEN|KEY|SECRET/i

// The allowlisted part of env, with AETHER_LANE_CALL set to marker, and the variables that keep the
// owner's credentials out of a lane.
function laneEnv(env, marker) {
  const out = {}
  for (const [name, value] of Object.entries(env)) {
    if (ENV_SECRET.test(name)) continue
    if (ENV_NAMES.includes(name) || ENV_PREFIXES.some((prefix) => name.startsWith(prefix))) out[name] = value
  }
  // HOME stays, because each CLI keeps its own login there; these variables keep the owner's git, GitHub,
  // package-registry and cloud credentials out of the lane. A plain git command in a lane cannot reach a remote,
  // which prevents accidents; it does not stop an agent that overrides the setting, as `git -c protocol.allow=always` does.
  const noCredentials = path.join(os.tmpdir(), 'aether-lane-no-credentials')
  Object.assign(out, {
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'protocol.allow',
    GIT_CONFIG_VALUE_0: 'never',
    GH_CONFIG_DIR: noCredentials,
    DOCKER_CONFIG: noCredentials,
    CLOUDSDK_CONFIG: noCredentials,
    NPM_CONFIG_USERCONFIG: '/dev/null',
    AWS_CONFIG_FILE: '/dev/null',
    AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
    KUBECONFIG: '/dev/null',
  })
  out.AETHER_LANE_CALL = marker
  return out
}

function procRead(pid, name) {
  try {
    return fs.readFileSync(`/proc/${pid}/${name}`, 'utf8')
  } catch {
    return null
  }
}

// The state letter from /proc/<pid>/stat, or null when the process is gone. The command name may hold spaces.
function procState(pid) {
  const stat = procRead(pid, 'stat')
  if (stat === null) return null
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]
}

function isRunning(pid) {
  const state = procState(pid)
  return state !== null && state !== 'Z'
}

// The process group from /proc/<pid>/stat, or null when the process is gone.
function procGroup(pid) {
  const stat = procRead(pid, 'stat')
  if (stat === null) return null
  const group = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
  return group > 0 ? group : null
}

const MARKER_PREFIX = 'AETHER_LANE_CALL='

// The value of AETHER_LANE_CALL in a process's environment, or null.
function markerOf(pid) {
  const environ = procRead(pid, 'environ')
  if (environ === null) return null
  const entry = environ.split('\0').find((item) => item.startsWith(MARKER_PREFIX))
  return entry === undefined ? null : entry.slice(MARKER_PREFIX.length)
}

function ownedBy(pid, uid) {
  try {
    return fs.statSync(`/proc/${pid}`).uid === uid
  } catch {
    return false
  }
}

// This user's live processes, this one aside, whose AETHER_LANE_CALL is marker or, with prefix,
// starts with it. agy starts its commands in sessions of their own, so the marker every lane process
// inherits is the only thread to all of them. Reads /proc: Linux only.
function markedProcesses(marker, { prefix = false } = {}) {
  if (typeof marker !== 'string' || marker === '') return []
  let names
  try {
    names = fs.readdirSync('/proc')
  } catch {
    return []
  }
  const uid = process.getuid()
  const found = []
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue
    const pid = Number(name)
    if (pid === process.pid || !ownedBy(pid, uid)) continue
    const value = markerOf(pid)
    if (value === null || !(prefix ? value.startsWith(marker) : value === marker)) continue
    if (isRunning(pid)) found.push({ pid, marker: value })
  }
  return found
}

function signalQuietly(target, signal) {
  try {
    process.kill(target, signal)
  } catch {
    // Gone already, or not ours to signal.
  }
}

// Signals each process and its process group, never this process's own group.
function signalMarked(found, signal) {
  const own = procGroup(process.pid)
  for (const { pid } of found) {
    const group = procGroup(pid)
    signalQuietly(pid, signal)
    if (group !== null && group !== 1 && group !== own) signalQuietly(-group, signal)
  }
}

// Ends every process markedProcesses finds, with its process group: SIGTERM, then, after the wait
// killGroup gives, SIGKILL to those still marked and alive. Returns the markers it found, sorted.
function killMarked(marker, { prefix = false } = {}) {
  const found = markedProcesses(marker, { prefix })
  if (found.length === 0) return []
  signalMarked(found, 'SIGTERM')
  const deadline = Date.now() + KILL_WAIT_MS
  while (found.some(({ pid }) => isRunning(pid)) && Date.now() < deadline) sleepSync(KILL_POLL_MS)
  signalMarked(markedProcesses(marker, { prefix }), 'SIGKILL')
  return [...new Set(found.map((entry) => entry.marker))].sort()
}

function isLaneProcess(pid, marker) {
  const environ = procRead(pid, 'environ')
  if (environ === null || !environ.split('\0').includes(`AETHER_LANE_CALL=${marker}`)) return false
  return procState(pid) !== 'Z'
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal)
  } catch (err) {
    if (err.code !== 'ESRCH') throw err
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// Stops the process group led by the pid in pidFile, when that process carries the marker in its environment.
function killGroup(pidFile, marker) {
  let text
  try {
    text = fs.readFileSync(pidFile, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { killed: false, pid: null }
    throw err
  }
  fs.rmSync(pidFile, { force: true })
  const pid = Number.parseInt(text, 10)
  if (!(pid > 0)) return { killed: false, pid: null }
  if (!isLaneProcess(pid, marker)) return { killed: false, pid }
  signalGroup(pid, 'SIGTERM')
  const deadline = Date.now() + KILL_WAIT_MS
  while (isRunning(pid) && Date.now() < deadline) sleepSync(KILL_POLL_MS)
  if (isRunning(pid)) signalGroup(pid, 'SIGKILL')
  return { killed: true, pid }
}

module.exports = {
  CONFIG_FILE,
  ROLES,
  SEATS,
  configPath,
  loadConfig,
  commandPath,
  commandInstalled,
  enabledHarnesses,
  seatTimeout,
  digest,
  canonicalJson,
  resultDigest,
  usable,
  groupKnown,
  quotaConsumed,
  laneTokens,
  logFile,
  appendLog,
  readLog,
  pruneLog,
  laneEnv,
  killGroup,
  killMarked,
}
