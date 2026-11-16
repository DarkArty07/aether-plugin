'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, writePlan, runBin, useDataDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { T0, MIN, sampleUsage, finishedRun } = require('./report-fixtures.js')
const { finalize } = require('../plugins/aether/lib/report.js')

const stateOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'))

test('R7: aether-plan compile writes the session that launches the run into state.json, and a relaunch keeps the first', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir, { CLAUDE_CODE_SESSION_ID: 'sess-one' })
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.equal(stateOf(first.json.runDir).session, 'sess-one')
  const again = runBin(PLAN_BIN, ['compile', file, '--run', first.json.runId, '--only', 'task-2'], repo.dir, { CLAUDE_CODE_SESSION_ID: 'sess-two' })
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.equal(stateOf(first.json.runDir).session, 'sess-one')
})

test('R7, R8: a compile with no session writes null, and a later relaunch by a session adopts it', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.equal(stateOf(first.json.runDir).session, null)
  const again = runBin(PLAN_BIN, ['compile', file, '--run', first.json.runId, '--only', 'task-2'], repo.dir, { CLAUDE_CODE_SESSION_ID: 'sess-two' })
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.equal(stateOf(first.json.runDir).session, 'sess-two')
})

test('R7: finalize copies the session of state.json into the runs.jsonl record, and writes null when there is none', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const stamped = finishedRun(t)
  const file = path.join(stamped.args.runDir, 'state.json')
  fs.writeFileSync(file, JSON.stringify({ ...stateOf(stamped.args.runDir), session: 'sess-one' }))
  finalize(stamped.repo.dir, stamped.args.runId, { tests: false, now: T0 + 40 * MIN })
  const bare = finishedRun(t)
  const bareState = stateOf(bare.args.runDir)
  delete bareState.session
  fs.writeFileSync(path.join(bare.args.runDir, 'state.json'), JSON.stringify(bareState))
  finalize(bare.repo.dir, bare.args.runId, { tests: false, now: T0 + 40 * MIN })
  const records = fs.readFileSync(path.join(dataDir, 'runs.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(records.find((r) => r.runId === stamped.args.runId).session, 'sess-one')
  assert.equal(records.find((r) => r.runId === bare.args.runId).session, null)
})

test('finalize with an unreadable state.json records session: null and does not throw', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const bad = finishedRun(t)
  fs.writeFileSync(path.join(bad.args.runDir, 'state.json'), '{not-json')
  const res = finalize(bad.repo.dir, bad.args.runId, { tests: false, now: T0 + 40 * MIN })
  assert.equal(res.record.session, null)
  const records = fs.readFileSync(path.join(dataDir, 'runs.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(records.find((r) => r.runId === bad.args.runId).session, null)
})
