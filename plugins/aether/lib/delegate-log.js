'use strict'

// The delegate log (R16): <dataDir>/delegates/log.jsonl, one JSON entry per line,
// append-only across sessions. Text values longer than MAX_TEXT are trimmed.
// Family: delegate.

const fs = require('node:fs')
const path = require('node:path')
const run = require('./run.js')

const MAX_TEXT = 4000

function logFile(dataDir) {
  return path.join(dataDir, 'delegates', 'log.jsonl')
}

function sanitizeValue(value) {
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT) {
      return value.slice(0, MAX_TEXT) + '…'
    }
    return value
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue)
  }
  const result = {}
  for (const [k, v] of Object.entries(value)) {
    result[k] = sanitizeValue(v)
  }
  return result
}

// Appends one entry as a line. Creates folder. Returns false on failure, never throws.
function appendEntry(dataDir, entry) {
  try {
    const file = logFile(dataDir)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const sanitized = sanitizeValue(entry)
    fs.appendFileSync(file, JSON.stringify(sanitized) + '\n')
    return true
  } catch {
    return false
  }
}

// The entries of one install's log file in file order, with the filters applied.
function readFileEntries(dataDir, { task, session, since }) {
  let text
  try {
    text = fs.readFileSync(logFile(dataDir), 'utf8')
  } catch {
    return []
  }
  const entries = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (!entry || typeof entry !== 'object') continue
    if (entry.time !== undefined && entry.time < since) continue
    if (entry.time === undefined && since > 0) continue
    if (task !== null && entry.task !== task && entry.id !== task) continue
    if (session !== null && entry.session !== session) continue
    entries.push(entry)
  }
  return entries
}

const timeOf = (entry) => (typeof entry.time === 'number' ? entry.time : 0)

// Entries in file order with time >= since, filtered by task and session, from this install's log alone. The ladder reads
// its state from here: a task id is only unique within an install, so another install's entries must not count for it.
// Skips unreadable lines; returns [] when no file exists.
function readEntries(dataDir, { task = null, session = null, since = 0 } = {}) {
  return readFileEntries(dataDir, { task, session, since })
}

// The same entries from the log of every install (run.installDirs), for a report (issue #114). One install's log is in
// file order; when more than one holds entries they are merged in time order. An entry that an earlier install's log
// holds too (an identical line) is left out, so a copy counts once.
function readAllEntries(dataDir, { task = null, session = null, since = 0 } = {}) {
  const earlier = new Set()
  const sources = []
  for (const dir of run.installDirs(dataDir)) {
    const entries = readFileEntries(dir, { task, session, since })
    const fresh = entries.filter((entry) => !earlier.has(JSON.stringify(entry)))
    for (const entry of entries) earlier.add(JSON.stringify(entry))
    if (fresh.length > 0) sources.push(fresh)
  }
  if (sources.length <= 1) return sources[0] ?? []
  return sources.flat().sort((a, b) => timeOf(a) - timeOf(b))
}

// A launch entry in the delegate log that opened an attempt (not a refused relaunch).
const isLaunch = (entry) => entry.kind === 'launch' && entry.launchKind !== 'refused'

module.exports = {
  MAX_TEXT,
  logFile,
  appendEntry,
  readEntries,
  readAllEntries,
  isLaunch,
}
