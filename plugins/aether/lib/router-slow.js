'use strict'

// Tracks pairs whose delegate timed out, stored under <dataDir>/router/slow/ with source 'router'.
// Excludes slow model-effort pairs from delegate candidate selection without marking the whole quota group.
// Family: router.

const fs = require('node:fs')
const path = require('node:path')
const { writeAtomic } = require('./common.js')

const SLOW_MINUTES = 60
const MINUTE_MS = 60 * 1000
// A mark that outlasts this is damaged, or was written under a clock far ahead: it is no mark.
const MAX_SLOW_MS = 2 * SLOW_MINUTES * MINUTE_MS

function slowDir(dataDir) {
  return path.join(dataDir, 'router', 'slow')
}

function slowFile(dataDir, { harness, model, effort }) {
  const part = (value) => encodeURIComponent(String(value))
  return path.join(slowDir(dataDir), `${part(harness)}__${part(model)}__${part(effort)}.json`)
}

// The mark in a file, or null when the file is unreadable or is not a mark: every field is read as what it must be.
function readMark(file) {
  try {
    const mark = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (mark === null || typeof mark !== 'object' || Array.isArray(mark)) return null
    for (const key of ['harness', 'model', 'effort']) if (typeof mark[key] !== 'string' || mark[key] === '') return null
    if (!Number.isFinite(mark.at) || !Number.isFinite(mark.until)) return null
    return mark
  } catch {
    return null
  }
}

const isLive = (mark, now) => mark.until > now && mark.until - now <= MAX_SLOW_MS

// Writes the pair's mark for SLOW_MINUTES and returns it. A live mark of the same pair that ends later is kept as it is:
// a mark never shortens.
function markSlow(dataDir, { harness, model, effort }, { now = Date.now() } = {}) {
  const file = slowFile(dataDir, { harness, model, effort })
  const existing = readMark(file)
  const until = now + SLOW_MINUTES * MINUTE_MS
  if (existing && isLive(existing, now) && existing.until >= until) return existing
  const mark = { harness, model, effort, at: now, until }
  writeAtomic(file, JSON.stringify(mark, null, 2) + '\n')
  return mark
}

// The ids of the pairs of the table that hold a live mark, in the order of the table. Never throws: a directory that is
// missing or a file that is odd marks nothing.
function slowPairIds(dataDir, pairs, now = Date.now()) {
  if (!Array.isArray(pairs)) return []
  let names
  try {
    names = fs.readdirSync(slowDir(dataDir)).filter((name) => name.endsWith('.json') && !name.startsWith('.'))
  } catch {
    return []
  }
  const live = names.map((name) => readMark(path.join(slowDir(dataDir), name))).filter((mark) => mark !== null && isLive(mark, now))
  return pairs
    .filter((pair) => live.some((mark) => mark.harness === pair.harness && mark.model === pair.model && mark.effort === pair.effort))
    .map((pair) => pair.id)
}

module.exports = { SLOW_MINUTES, slowDir, markSlow, slowPairIds }
