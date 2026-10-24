'use strict'

// The store of self-observation: everything hangs from <data dir>/observe/. The closed list of keys of
// cleanEvent is what keeps conversation text out of the files (it keeps no free text at all).

const fs = require('node:fs')
const path = require('node:path')

const PLUGIN_ROOT = path.resolve(__dirname, '..')
const CONFIG_FILE = path.join(PLUGIN_ROOT, 'config', 'observe.json')

const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,64}$/
const SESSION = /^[A-Za-z0-9-]+$/
const TEXT_KEYS = ['kind', 'tool', 'class', 'reason', 'trigger']

const observeDir = (dataDir) => path.join(dataDir, 'observe')
const eventsFile = (dataDir) => path.join(observeDir(dataDir), 'events.jsonl')
const faultsDir = (dataDir) => path.join(observeDir(dataDir), 'faults')
const summaryFile = (dataDir) => path.join(observeDir(dataDir), 'summary.json')
const devDir = (dataDir) => path.join(observeDir(dataDir), 'dev')
const issuesDir = (dataDir) => path.join(observeDir(dataDir), 'issues')

// Development mode is turned on by AETHER_OBSERVE=dev or by the observedev option (CLAUDE_PLUGIN_OPTION_OBSERVEDEV=true).
// Precedence: AETHER_OBSERVE (dev or standard) wins; otherwise the observedev option decides.
function observeMode(env = process.env, root = PLUGIN_ROOT) {
  if (env.AETHER_OBSERVE === 'dev') return 'dev'
  if (env.AETHER_OBSERVE === 'standard') return 'standard'
  return env.CLAUDE_PLUGIN_OPTION_OBSERVEDEV === 'true' ? 'dev' : 'standard'
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const cleanText = (value) => (typeof value === 'string' && IDENTIFIER.test(value) ? value : 'unclassified')

function cleanEvent(raw) {
  if (!isObject(raw)) return null
  if (typeof raw.time !== 'number' || !Number.isFinite(raw.time)) return null
  if (typeof raw.session !== 'string' || !SESSION.test(raw.session)) return null
  if (raw.kind === undefined || raw.kind === null) return null
  const event = { time: raw.time, session: raw.session }
  for (const key of TEXT_KEYS) {
    if (raw[key] === undefined || raw[key] === null) continue
    event[key] = cleanText(raw[key])
  }
  if (typeof raw.interrupted === 'boolean') event.interrupted = raw.interrupted
  return event
}

function appendEvent(dataDir, raw) {
  const event = cleanEvent(raw)
  if (!event) return false
  try {
    fs.mkdirSync(observeDir(dataDir), { recursive: true })
    fs.appendFileSync(eventsFile(dataDir), `${JSON.stringify(event)}\n`)
    return true
  } catch {
    return false
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function readEvents(dataDir, { since = 0 } = {}) {
  let text
  try {
    text = fs.readFileSync(eventsFile(dataDir), 'utf8')
  } catch {
    return []
  }
  const events = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const event = parseJson(line)
    if (!isObject(event) || typeof event.time !== 'number' || !Number.isFinite(event.time)) continue
    if (event.time >= since) events.push(event)
  }
  return events.sort((a, b) => a.time - b.time)
}

function readFaults(dataDir) {
  let names
  try {
    names = fs.readdirSync(faultsDir(dataDir)).filter((name) => name.endsWith('.json')).sort()
  } catch {
    return []
  }
  const faults = []
  for (const name of names) {
    let text
    try {
      text = fs.readFileSync(path.join(faultsDir(dataDir), name), 'utf8')
    } catch {
      continue
    }
    const file = parseJson(text)
    if (!isObject(file) || !Array.isArray(file.faults)) continue
    const session = typeof file.session === 'string' ? file.session : name.slice(0, -'.json'.length)
    for (const fault of file.faults) {
      if (!isObject(fault)) continue
      faults.push({ session, time: fault.time, source: fault.source, class: fault.class })
    }
  }
  return faults.sort((a, b) => (a.session < b.session ? -1 : a.session > b.session ? 1 : a.time - b.time))
}

function loadObserveConfig(file = CONFIG_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// Every file under dir, recursively, as { rel, bytes }; a symlink counts as a file and is not followed.
function walk(dir, rel = '') {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const entry of entries) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(full, entryRel))
      continue
    }
    let bytes = 0
    try {
      bytes = fs.lstatSync(full).size
    } catch {
      continue
    }
    files.push({ rel: entryRel, bytes })
  }
  return files
}

function classOf(rel) {
  if (rel === 'events.jsonl') return 'events'
  if (rel === 'summary.json') return 'summary'
  if (rel === 'baseline.json') return 'baseline'
  if (rel === 'read.json') return 'read'
  const top = rel.split('/')[0]
  return { faults: 'faults', dev: 'dev', issues: 'issues' }[top]
}

function status(dataDir) {
  const classes = {}
  for (const name of ['events', 'faults', 'summary', 'dev', 'issues', 'baseline', 'read']) classes[name] = { files: 0, bytes: 0 }
  let bytes = 0
  for (const file of walk(observeDir(dataDir))) {
    const name = classOf(file.rel)
    if (!name) continue
    classes[name].files += 1
    classes[name].bytes += file.bytes
    bytes += file.bytes
  }
  return { classes, bytes }
}

// Deletes observe/ whole and nothing else, and only with yes === true. The answer names the folder, so that a run
// without yes says what it would delete.
function forget(dataDir, { yes } = {}) {
  const dir = observeDir(dataDir)
  const files = walk(dir).length
  if (yes !== true) return { deleted: false, dir, files }
  fs.rmSync(dir, { recursive: true, force: true })
  return { deleted: true, dir, files }
}

module.exports = {
  PLUGIN_ROOT, CONFIG_FILE,
  observeDir, eventsFile, faultsDir, summaryFile, devDir, issuesDir,
  observeMode, cleanEvent, appendEvent, readEvents, readFaults, loadObserveConfig, status, forget,
}
