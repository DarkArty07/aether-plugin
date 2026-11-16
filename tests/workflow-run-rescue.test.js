'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

test('a rescue that throws records the failure on unit.reason', async (t) => {
  const args = compile(makeRepo(t), plan([task(1)]))
  const run = await runWorkflow(args, {
    stuckWait: 120,
    implementer: () => null,
    // A malformed files field makes mergeHeld throw while describing the delivered fix's refusal.
    ops: (call, wt) => (call.kind === 'ops:merge' && call.unit === 'task-1'
      ? { merged: false, reason: 'ownership', files: 'tests/other.test.js', detail: '' }
      : wt(call)),
    deadline: async ({ seconds }) => ({
      exitCode: 0,
      stdout: `${JSON.stringify({ paused: seconds, state: 'delivered', commit: 'fix1234', reason: 'tried' })}\n`,
    }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units.find((u) => u.id === 'task-1')
  assert.equal(unit.status, 'blocked')
  const opened = run.calls.find((call) => call.command && call.command.verb === 'stuck')
  const originalReason = JSON.parse(opened.payload.text).reason
  assert.ok(unit.reason.startsWith(originalReason), 'the original block reason is preserved')
  assert.match(unit.reason, /The rescue failed: .*join is not a function/, unit.reason)
  assert.ok(run.calls.some((call) => call.command && call.command.verb === 'stuck-end' && call.command.rest.includes('rejected')),
    'the failed rescue still closes the stuck wait')
})
