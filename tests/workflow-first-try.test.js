'use strict'

// Issue #109: a unit is a first try only when none of its attempts was salvaged from its branch and no merge
// conflict sent it back for a second implementer attempt. Neither spends a correction, so the ladder does not show them.

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const one = (t) => compile(makeRepo(t), plan([task(1)]))
const unitOf = (run) => run.result.units[0]
const noReport = (call, done) => (call.n === 1 ? null : done(call))
const salvaged = {
  salvaged: true,
  files: ['src/t1/a.js'],
  committed: ['src/t1/a.js'],
  left: [],
  head: 'cafe123',
  package: 'pkg/task-1.diff',
}

test('a clean run is a first try', async (t) => {
  const run = await runWorkflow(one(t))
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(unitOf(run).status, 'merged')
  assert.equal(unitOf(run).ladder.firstTry, true)
})

test('an attempt salvaged from its branch is not a first try, though no correction was spent', async (t) => {
  const run = await runWorkflow(one(t), {
    implementer: noReport,
    ops: (call, wt) => (call.kind === 'ops:salvage' ? salvaged : wt(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = unitOf(run)
  assert.equal(unit.status, 'merged')
  assert.equal(unit.rounds[0].salvaged, true)
  assert.equal(unit.ladder.corrections, 0)
  assert.equal(unit.ladder.firstTry, false)
})

test('a unit whose merge hit a conflict and got its retry is not a first try, and no correction was spent', async (t) => {
  const run = await runWorkflow(one(t), {
    ops: (call, wt) => (call.kind === 'ops:merge' && call.n === 1 ? { merged: false, reason: 'conflict', files: ['src/shared.js'], detail: 'CONFLICT' } : wt(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = unitOf(run)
  assert.equal(unit.status, 'merged')
  assert.equal(unit.attempts, 2)
  assert.equal(unit.ladder.corrections, 0)
  assert.equal(unit.ladder.firstTry, false)
})
