'use strict'

// The lane library: the table of external harnesses and their models, harness detection,
// the quota readings they leave and the lane log. The process helpers and token counter live in
// lib/lane-process.js and lib/spend-tokens.js and are re-exported here for their callers.
// Family: lane.

const fs = require('node:fs')
const path = require('node:path')
const { HARNESS_NAMES } = require('./harness/index.js')
const { isObject } = require('./common.js')
const { readingUsable } = require('./lane-order.js')
const { commandPath, commandInstalled, laneEnv, killGroup, killMarked } = require('./lane-process.js')
const { laneTokens } = require('./spend-tokens.js')

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'lanes.json')
const ROLES = ['implementer', 'supervisor', 'reviewer']
// The design seats a lane model may take as well (lib/seats.js), and each seat's timeout when its harness names none.
const SEATS = ['judge', 'writer', 'examiner']
const SEAT_TIMEOUTS = { judge: 1200, writer: 2700, examiner: 1800 }
// A model id is written into commands that hooks/ops-command.mjs checks, which takes only these characters (and a few
// more), so the table takes no more.
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const DAY_MS = 24 * 3600 * 1000

function configPath() {
  return process.env.AETHER_LANES_CONFIG || CONFIG_FILE
}

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

// Deletes the session files of the lane log not written to for `days`. Before it deletes the file of a session id, it
// adds what its calls spent to the session's summary (lib/spend-archive.js): a file whose summary cannot be written
// stays, for the next prune to try again, and leaves a trace of the failure under the data directory
// (prune-failures.json). `unknown` and a name that is not a session id go with no summary.
function pruneLog(dataDir, { days = 30, now = Date.now(), prices } = {}) {
  const dir = logDir(dataDir)
  if (!fs.existsSync(dir)) return { pruned: [] }
  const { isSessionId } = require('./spend.js')
  const { archiveSpend, noteFailure, clearFailure } = require('./spend-archive.js')
  const cutoff = now - days * DAY_MS
  const pruned = []
  for (const file of logFiles(dir)) {
    const full = path.join(dir, file)
    const id = file.slice(0, -'.jsonl'.length)
    let written
    try {
      written = fs.statSync(full).mtimeMs
    } catch (err) {
      // Another prune deleted it first.
      if (err.code === 'ENOENT') continue
      throw err
    }
    if (written > cutoff) continue
    if (isSessionId(id)) {
      try {
        archiveSpend(dataDir, id, 'lanes', { prices })
      } catch (err) {
        noteFailure(dataDir, `lanes/${id}`, err, now)
        continue
      }
      clearFailure(dataDir, `lanes/${id}`)
    }
    fs.rmSync(full, { force: true })
    pruned.push(id)
  }
  return { pruned: pruned.sort() }
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
