'use strict'

// The lane library: the table of external harnesses that take over native calls, harness detection,
// the quota and token readings they leave, the lane log, and the group kill that stops a lane process.

const fs = require('node:fs')
const path = require('node:path')

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'lanes.json')
const ROLES = ['implementer', 'supervisor', 'reviewer', 'designer']
const NATIVE_MODELS = ['haiku', 'sonnet', 'opus']
const LEVEL_NAMES = ['low', 'medium', 'high', 'xhigh']
const LEVEL_VALUES = ['low', 'medium', 'high']
const CALLED_ROLES = ['implementer', 'supervisor', 'reviewer']
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
  if (!isObject(model)) fail('model', 'must be an object')
  if (typeof model.group !== 'string' || !Object.hasOwn(groups, model.group)) fail('group', 'must name one of the groups')
  if (!NATIVE_MODELS.includes(model.replaces)) fail('replaces', 'must be haiku, sonnet or opus')
  if (!Array.isArray(model.roles) || model.roles.length === 0 || !model.roles.every((role) => ROLES.includes(role))) {
    fail('roles', 'must be a non-empty list of implementer, supervisor, reviewer or designer')
  }
  if (!isObject(model.levels) || !LEVEL_NAMES.every((level) => LEVEL_VALUES.includes(model.levels[level]))) {
    fail('levels', 'must map low, medium, high and xhigh to low, medium or high')
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
  if (!isObject(harness.timeouts) || !ROLES.every((role) => isInteger(harness.timeouts[role], 1))) {
    fail('timeouts', 'must give an integer of at least 1 for each role')
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
  if (!isObject(config.harnesses)) throw new Error('harnesses must be an object')
  for (const [name, harness] of Object.entries(config.harnesses)) validateHarness(name, harness)
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

function commandInstalled(command, env = process.env) {
  if (path.isAbsolute(command)) return isExecutableFile(command)
  return (env.PATH || '')
    .split(path.delimiter)
    .some((dir) => dir !== '' && isExecutableFile(path.join(dir, command)))
}

// The lane for a native call: the first model that replaces model and serves role, at effort's level.
function laneFor(config, role, model, effort) {
  if (!config || !ROLES.includes(role) || !LEVEL_NAMES.includes(effort)) return null
  for (const [harness, settings] of Object.entries(config.harnesses)) {
    for (const [id, entry] of Object.entries(settings.models)) {
      if (entry.replaces === model && entry.roles.includes(role)) {
        return { harness, model: id, group: entry.group, agyModel: `${id}-${entry.levels[effort]}` }
      }
    }
  }
  return null
}

function waitRounds(harness, role) {
  return Math.ceil(harness.timeouts[role] / harness.waitSeconds) + 1
}

// For each role that some model serves, the first model of each native model it replaces.
function nativeCalls(harness) {
  const calls = {}
  for (const role of CALLED_ROLES) {
    for (const [id, entry] of Object.entries(harness.models)) {
      if (!entry.roles.includes(role)) continue
      calls[role] = calls[role] || {}
      if (!calls[role][entry.replaces]) calls[role][entry.replaces] = { model: id, group: entry.group }
    }
  }
  return calls
}

// The arguments the run takes from the first installed harness, or null when none is installed.
function lanesArgs(config, { installed }) {
  if (!config) return null
  for (const [name, harness] of Object.entries(config.harnesses)) {
    if (!installed(name, harness)) continue
    return {
      harness: name,
      maxParallel: harness.maxParallel,
      waits: {
        implementer: waitRounds(harness, 'implementer'),
        supervisor: waitRounds(harness, 'supervisor'),
        reviewer: waitRounds(harness, 'reviewer'),
      },
      calls: nativeCalls(harness),
    }
  }
  return null
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

function usable(groupQuota, reserve) {
  if (!groupQuota || !isObject(groupQuota.windows)) return false
  const windows = Object.values(groupQuota.windows)
  return windows.length > 0 && windows.every((window) => window.remaining > reserve)
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
  configPath,
  loadConfig,
  commandInstalled,
  laneFor,
  lanesArgs,
  digest,
  canonicalJson,
  resultDigest,
  usable,
  quotaConsumed,
  laneTokens,
  logFile,
  appendLog,
  readLog,
  pruneLog,
  killGroup,
}
