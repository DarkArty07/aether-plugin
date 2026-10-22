'use strict'

// Fixtures of the spend tests: a price table of the tests' own, an independent sum, and writers of the files the
// command reads. Nothing here reads the owner's data directory.

const fs = require('node:fs')
const path = require('node:path')
const { writeJson } = require('../plugins/aether/lib/run.js')
const { appendLog } = require('../plugins/aether/lib/lanes.js')

const MIN = 60 * 1000
const T0 = Date.parse('2026-09-01T10:00:00.000Z')
const RATES = {
  'm-a': { input: 1, output: 2, cacheRead: 0.5, cacheWrite5m: 1.25, cacheWrite1h: 2 },
  'm-b': { input: 10, output: 20, cacheRead: 5, cacheWrite5m: 12.5, cacheWrite1h: 20 },
}
const PRICES = {
  basis: 'test list prices',
  snapshot: 'S1',
  currency: 'USD',
  per: 1e6,
  cacheWriteTtl: { main: '1h', agents: '5m' },
  models: Object.fromEntries(Object.entries(RATES).map(([id, rates]) => [id, { ids: [id], ...rates }])),
}

const iso = (ms) => new Date(ms).toISOString()

// The independent sum: tokens times the table, per million. Null for a model the table lacks.
function usdOf(entry) {
  const rates = RATES[entry.model]
  if (!rates) return null
  const write = entry.agent ? rates.cacheWrite5m : rates.cacheWrite1h
  return ((entry.input || 0) * rates.input + (entry.output || 0) * rates.output + (entry.cacheRead || 0) * rates.cacheRead + (entry.cacheWrite || 0) * write) / 1e6
}

// One meter request `minutes` after T0: a million tokens of one kind.
function meter(minutes, model, agent, kind, effort = null) {
  return { t: T0 + minutes * MIN, ms: 1000, agent, model, effort, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, [kind]: 1e6 }
}

// Writes a session's meter parts: parts = [{ agents, entries }].
function writeParts(dataDir, session, parts) {
  parts.forEach((part, i) => writeJson(path.join(dataDir, 'usage', session, `${i}.json`), { session, part: i, claudeCode: '2.1.296', agents: {}, ...part }))
}

// A call of the lane log with a million tokens of one kind. Returns its list price.
function laneCall(dataDir, session, minutes, model, kind = 'input', extra = {}) {
  appendLog(dataDir, session, { kind: 'call', time: T0 + minutes * MIN, harness: 'grok', group: 'grok', role: 'implementer', model, effort: 'high', status: 'ok', usage: { [kind]: 1e6 }, ...extra })
  return usdOf({ model, agent: 'lane', [kind]: 1e6 })
}

function journalLine(dataDir, line) {
  const file = path.join(dataDir, 'router', 'decisions.jsonl')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${typeof line === 'string' ? line : JSON.stringify(line)}\n`)
}

// An outcome entry of the router's journal. Returns its list price.
function outcome(dataDir, session, minutes, model, kind = 'input', extra = {}) {
  journalLine(dataDir, { kind: 'outcome', id: `d-${minutes}`, time: T0 + minutes * MIN, session, status: 'ok', harness: 'agy', model, effort: 'low', durationMs: 1, usage: { [kind]: 1e6 }, attempt: 1, ...extra })
  return usdOf({ model, agent: 'lane', [kind]: 1e6 })
}

// What a prune archived: 25 dollars, 5 of them from two meter requests and 20 from one call of another harness.
const archivedTally = () => ({
  usd: 25,
  leadUsd: 3,
  agentsUsd: 2,
  byModel: { 'm-a': { usd: 5, requests: 2 }, 'm-b': { usd: 20, requests: 1 } },
  byEffort: { 'm-a high': { usd: 5, requests: 2 }, 'm-b high': { usd: 20, requests: 1 } },
  byRole: { main: { usd: 3, requests: 1 }, 'aether:judge': { usd: 2, requests: 1 } },
  harness: { calls: 1, usd: 20, byModel: { 'm-b': { usd: 20, calls: 1 } } },
  unpriced: ['x-old'],
  first: T0 - 60 * MIN,
  last: T0 + 10 * MIN,
  resumptions: 2,
  complete: true,
})
const summaryOf = (session, over = {}) => ({ version: 1, session, writtenAt: T0, through: { usage: null, lanes: null }, tally: archivedTally(), ...over })
const writeSummary = (dataDir, session, summary) => writeJson(path.join(dataDir, 'spend', `${session}.json`), summary)

function ageFile(file, hours) {
  const when = new Date(Date.now() - hours * 3600 * 1000)
  fs.utimesSync(file, when, when)
}

module.exports = { MIN, T0, RATES, PRICES, iso, usdOf, meter, writeParts, laneCall, journalLine, outcome, archivedTally, summaryOf, writeSummary, ageFile }
