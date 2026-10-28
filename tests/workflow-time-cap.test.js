'use strict'

// Issue 16: a native supervisor or final reviewer that never answers is abandoned at 15 minutes, and the run goes on.
// The script has no clock, so the cap is kept by `aether-lane pause` ticks that the harness stubs (see runWorkflow's `ticks`).

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const silent = () => new Promise(() => {})
// A clock that runs for the agents of `prefix` only: the others' ticks never end, so their answers are first.
const clockFor = (prefix) => ({ label }) => (label.startsWith(prefix) ? undefined : silent())

function twoTasks(t) {
  return compile(makeRepo(t), plan([task(1), task(2)]))
}

test('a supervisor that never answers is abandoned at 15 minutes, shown so, and the run goes on (issue 16)', async (t) => {
  const args = twoTasks(t)
  const run = await runWorkflow(args, {
    deadline: clockFor('task-1: supervise attempt 1'),
    supervisor: (call, approve) => (call.unit === 'task-1' ? silent() : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const [one, two] = run.result.units
  assert.equal(two.status, 'merged')
  // The supervisor of task 1 failed 3 times in a row, blocking the unit while task 2 merged.
  assert.equal(one.status, 'blocked')
  assert.match(one.reason, /the supervisor failed 3 times in a row: abandoned after 15 min/)
  assert.equal(run.result.abandoned.length, 3)
  assert.ok(run.logs.some((line) => /task-1: supervise attempt 1 on sonnet high: abandoned after 15 min/.test(line)), run.logs.join('\n'))
  // 900 s in ticks of at most 120 s, 3 times.
  const mine = run.ticks.filter((tick) => tick.label.startsWith('task-1: supervise attempt 1'))
  assert.equal(mine.reduce((sum, tick) => sum + tick.seconds, 0), 2700)
  assert.ok(mine.every((tick) => tick.seconds >= 1 && tick.seconds <= 120))
  assert.equal(run.result.agents.total, run.calls.length)
})

test('a supervisor that answers in time is not abandoned, and its clock stops', async (t) => {
  const args = twoTasks(t)
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(run.result.abandoned, [])
  // With the default stub a tick never ends, so the answer was first.
  assert.ok(run.result.units.every((u) => u.status === 'merged'))
})

test('a clock that cannot run (the pause fails) abandons nothing', async (t) => {
  const args = twoTasks(t)
  const run = await runWorkflow(args, {
    deadline: () => ({ exitCode: 1, stdout: '{"error":"no"}\n' }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(run.result.abandoned, [])
  assert.ok(run.logs.some((line) => /time cap cannot be kept/.test(line)))
})

test('a final reviewer that never answers is abandoned at 15 minutes and the review fails with that reason', async (t) => {
  const args = twoTasks(t)
  const run = await runWorkflow(args, { deadline: clockFor('final review'), reviewer: silent })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.finalReview.status, 'failed')
  assert.match(run.result.finalReview.reason, /abandoned after 15 min/)
  assert.equal(run.result.abandoned.length, 1)
  assert.equal(run.result.abandoned[0].role, 'reviewer')
})

test('an implementer has no 15-minute cap: it builds for as long as its lane allows', async (t) => {
  const args = twoTasks(t)
  const run = await runWorkflow(args, { deadline: silent })
  assert.ok(run.ticks.length > 0)
  assert.ok(run.ticks.every((tick) => /supervise|final review/.test(tick.label)), run.ticks.map((tick) => tick.label).join('\n'))
})
