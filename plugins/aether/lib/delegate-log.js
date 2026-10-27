'use strict'

// The delegate log (R16): <dataDir>/delegates/log.jsonl, one JSON entry per line,
// append-only across sessions. Text values longer than MAX_TEXT are trimmed.
// Family: delegate.

const fs = require('node:fs')
const path = require('node:path')

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

// Entries in file order with time >= since, filtered by task and session.
// Skips unreadable lines; returns [] when no file exists.
function readEntries(dataDir, { task = null, session = null, since = 0 } = {}) {
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

// A launch entry in the delegate log that opened an attempt (not a refused relaunch).
const isLaunch = (entry) => entry.kind === 'launch' && entry.launchKind !== 'refused'

module.exports = {
  MAX_TEXT,
  logFile,
  appendEntry,
  readEntries,
  isLaunch,
}
