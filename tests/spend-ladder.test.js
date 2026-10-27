'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useDataDir } = require('./helpers.js')
const { PRICES, T0, MIN } = require('./spend-fixtures.js')
const { spendReport } = require('../plugins/aether/lib/spend.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const spend = (dataDir) => spendReport({ dataDir, session: 'sess', prices: PRICES })

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
