'use strict'

// The owner's list of irreversible Bash commands that no grant covered: one JSON line per command, in
// <mainRoot>/.aether/pending.jsonl, so every such step reaches the owner in one place.
// Family: none.

const fs = require('node:fs')
const path = require('node:path')

function pendingFile(mainRoot) {
  return path.join(mainRoot, '.aether', 'pending.jsonl')
}

// Appends one entry as a JSON line. Returns false when it cannot be written; never throws.
function appendPending(mainRoot, entry) {
  try {
    const file = pendingFile(mainRoot)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify(entry) + '\n')
    return true
  } catch {
    return false
  }
}

// The entries in the order they were appended. A line that is not a JSON object is skipped, so one
// bad line does not hide the rest; [] when there is no file.
function readPending(mainRoot) {
  const file = pendingFile(mainRoot)
  if (!fs.existsSync(file)) return []
  const entries = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    try {
      const entry = JSON.parse(line)
      if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) entries.push(entry)
    } catch {
      // Skipped: a malformed line is not an entry.
    }
  }
  return entries
}

module.exports = { pendingFile, appendPending, readPending }
