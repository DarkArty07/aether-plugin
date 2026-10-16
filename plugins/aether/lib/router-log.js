'use strict'

// The router's decision log (R27): <dataDir>/router/decisions.jsonl, one JSON entry per line, kept across
// sessions and never pruned. Three kinds of entry: `decision`, `spawn` and `outcome`. An entry never holds
// request headers or keys; the callers write only the fields of the decision they record.

const fs = require('node:fs')
const path = require('node:path')

const journalFile = (dataDir) => path.join(dataDir, 'router', 'decisions.jsonl')

// Appends one entry as a line. False, never an error, when the log cannot be written.
function appendEntry(dataDir, entry) {
  try {
    const file = journalFile(dataDir)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify(entry) + '\n')
    return true
  } catch {
    return false
  }
}

// The entries in file order that are at or after `since` and, when `session` is given, belong to it.
// A line that does not parse is skipped; no file reads as an empty log.
function readJournal(dataDir, { since = 0, session = null } = {}) {
  let text
  try {
    text = fs.readFileSync(journalFile(dataDir), 'utf8')
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
    if (!(entry.time >= since)) continue
    if (session !== null && entry.session !== session) continue
    entries.push(entry)
  }
  return entries
}

module.exports = { journalFile, appendEntry, readJournal }
