'use strict'

// The router's decision log (R27): <dataDir>/router/decisions.jsonl, one JSON entry per line, kept across
// sessions and never pruned. Kept only as a reader for older logs (R18, D4).

const fs = require('node:fs')
const path = require('node:path')

const journalFile = (dataDir) => path.join(dataDir, 'router', 'decisions.jsonl')

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

module.exports = { journalFile, readJournal }
