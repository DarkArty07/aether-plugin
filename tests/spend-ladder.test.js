'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useDataDir } = require('./helpers.js')
const { PRICES, T0, MIN, outcome, journalLine } = require('./spend-fixtures.js')
const { spendReport } = require('../plugins/aether/lib/spend.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const { journalFile } = require('../plugins/aether/lib/router-log.js')

const spend = (dataDir) => spendReport({ dataDir, session: 'sess', prices: PRICES })
const journalEntry = (dataDir) => JSON.parse(fs.readFileSync(journalFile(dataDir), 'utf8').trim().split('\n')[0])

test('a session with a delegate in the new log and one in the old journal adds the two (E13, R18)', (t) => {
  const dataDir = useDataDir(t)
  const dollars = outcome(dataDir, 'sess', 1, 'm-a')
  const old = journalEntry(dataDir)
  log.appendEntry(dataDir, { ...old, id: 'task-new', attempt: 1, time: T0 + 2 * MIN })
  const report = spend(dataDir)
  assert.equal(report.harness.calls, 2)
  assert.ok(Math.abs(report.usd - 2 * dollars) < 1e-9)
})

test('the same id and attempt in both sources count once', (t) => {
  const dataDir = useDataDir(t)
  const dollars = outcome(dataDir, 'sess', 1, 'm-a')
  log.appendEntry(dataDir, journalEntry(dataDir))
  const report = spend(dataDir)
  assert.equal(report.harness.calls, 1)
  assert.ok(Math.abs(report.usd - dollars) < 1e-9)
})

test('the same id with another attempt is another call', (t) => {
  const dataDir = useDataDir(t)
  outcome(dataDir, 'sess', 1, 'm-a')
  log.appendEntry(dataDir, { ...journalEntry(dataDir), attempt: 2 })
  assert.equal(spend(dataDir).harness.calls, 2)
})

test('when both sources hold the pair, the figures of the new log win', (t) => {
  const dataDir = useDataDir(t)
  outcome(dataDir, 'sess', 1, 'm-a')
  log.appendEntry(dataDir, { ...journalEntry(dataDir), model: 'm-b' })
  const report = spend(dataDir)
  assert.deepEqual(Object.keys(report.harness.byModel), ['m-b'])
})

test('an entry with no attempt in both sources counts once', (t) => {
  const dataDir = useDataDir(t)
  const entry = { kind: 'outcome', id: 't', session: 'sess', time: T0, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1e6 } }
  journalLine(dataDir, entry)
  log.appendEntry(dataDir, entry)
  assert.equal(spend(dataDir).harness.calls, 1)
})

test('a session that only has the new log is recorded', (t) => {
  const dataDir = useDataDir(t)
  log.appendEntry(dataDir, { kind: 'outcome', id: 't', attempt: 1, session: 'sess', time: T0, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1e6 } })
  const report = spend(dataDir)
  assert.deepEqual([report.recorded, report.harness.calls], [true, 1])
})

test('entries of another session or of another kind in the new log are not counted', (t) => {
  const dataDir = useDataDir(t)
  const base = { id: 't', attempt: 1, time: T0, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1e6 } }
  log.appendEntry(dataDir, { kind: 'outcome', session: 'other', ...base })
  log.appendEntry(dataDir, { kind: 'launch', session: 'sess', ...base })
  log.appendEntry(dataDir, { kind: 'outcome', session: 'sess', ...base, id: 'u' })
  assert.equal(spend(dataDir).harness.calls, 1)
})

test('a broken line of the new log inside the span of the session makes it incomplete; one outside does not', (t) => {
  const dataDir = useDataDir(t)
  log.appendEntry(dataDir, { kind: 'outcome', id: 't1', attempt: 1, session: 'sess', time: T0, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1 } })
  fs.appendFileSync(log.logFile(dataDir), '{"time":' + (T0 + MIN) + ', broken\n')
  log.appendEntry(dataDir, { kind: 'outcome', id: 't2', attempt: 1, session: 'sess', time: T0 + 2 * MIN, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1 } })
  assert.equal(spend(dataDir).complete, false)

  const other = useDataDir(t)
  log.appendEntry(other, { kind: 'outcome', id: 't1', attempt: 1, session: 'sess', time: T0, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1 } })
  fs.appendFileSync(log.logFile(other), '{"time":' + (T0 + 60 * MIN) + ', broken\n')
  assert.equal(spend(other).complete, true)
})

test('the old journal is only read, never written (D4)', (t) => {
  const dataDir = useDataDir(t)
  journalLine(dataDir, { kind: 'outcome', id: 'd-1', time: T0, session: 'sess', status: 'ok', harness: 'agy', model: 'm-a', effort: 'low', usage: { input: 1e6 }, attempt: 1 })
  const before = fs.readFileSync(journalFile(dataDir), 'utf8')
  spend(dataDir)
  assert.equal(fs.readFileSync(journalFile(dataDir), 'utf8'), before)
})
