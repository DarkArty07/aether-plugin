'use strict'

// Issues 002, 003, 004 and 005: what the workflow does when an attempt ends without its report, when a
// merge's ops reply is not the command's output, and when the final reviewer gives no answer.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

function threeTasks(t) {
  const repo = makeRepo(t)
  return compile(repo, plan([task(1), task(2), task(3, { depends: 'Task 1 — uses it' })]))
}

const noReport = (call, done) => (call.unit === 'task-2' && call.n === 1 ? null : done(call))
const salvaged = (call) => ({
  salvaged: true,
  files: ['src/t2/a.js', 'src/t2/b.js'],
  committed: ['src/t2/b.js'],
  left: [],
  head: 'cafe123',
  package: path.join('pkg', `${call.unit}.diff`),
})

test('an attempt that ends without its report but left work goes to the supervisor, not to a retry', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    implementer: noReport,
    ops: (call, wt) => (call.kind === 'ops:salvage' ? salvaged(call) : wt(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.status, 'merged')
  // One attempt only: the supervisor approved the salvaged work.
  assert.equal(run.calls.filter((c) => c.role === 'implementer' && c.unit === 'task-2').length, 1)
  assert.equal(unit.attempts, 1)
  assert.deepEqual(unit.failures, [])
  assert.equal(unit.rounds[0].salvaged, true)
  assert.equal(unit.rounds[0].status, 'DONE_WITH_CONCERNS')
  assert.equal(unit.rounds[0].head, 'cafe123')
  const supervise = run.calls.find((c) => c.role === 'supervisor' && c.unit === 'task-2')
  assert.match(supervise.prompt, /ended without its report/)
  assert.match(supervise.prompt, /2 changed files/)
  assert.match(supervise.prompt, /src\/t2\/a\.js, src\/t2\/b\.js/)
  assert.match(supervise.prompt, /run the test command yourself/)
  assert.ok(run.logs.some((l) => /task-2: no report, 2 changed files on the unit branch/.test(l)), run.logs.join('\n'))
  assert.equal(run.calls.filter((c) => c.kind === 'ops:salvage').length, 1)
  assert.match(run.calls.find((c) => c.kind === 'ops:salvage').prompt, new RegExp(`aether-wt salvage ${args.runId} task-2`))
})

test('a salvaged attempt the supervisor sends back runs again like any retry, and is not counted as a missing report', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    implementer: noReport,
    supervisor: (call, approve) =>
      call.unit === 'task-2' && call.n === 1
        ? { verdict: 'retry', findings: [{ severity: 'important', title: 'no tests', file: 'src/t2/a.js', evidence: 'none' }], ruling: 'Retry: add tests.', guidance: 'add tests', question: '' }
        : approve(call),
    ops: (call, wt) => (call.kind === 'ops:salvage' ? salvaged(call) : wt(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.status, 'merged')
  assert.deepEqual(unit.rounds.map((r) => [r.salvaged === true, r.verdict]), [[true, 'retry'], [false, 'approve']])
  assert.deepEqual(unit.failures, [])
})

test('an attempt that ends without a report and left nothing still counts, and two of them stop the unit', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    implementer: (call, done) => (call.unit === 'task-2' ? null : done(call)),
    ops: (call, wt) => (call.kind === 'ops:salvage' ? { salvaged: false, files: [], committed: [], left: ['src/elsewhere.js'], head: null, package: null } : wt(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.status, 'blocked')
  assert.equal(unit.reason, 'the ladder is spent (exhausted)')
  assert.equal(run.calls.filter((c) => c.kind === 'ops:salvage' && c.unit === 'task-2').length, 6)
  assert.equal(run.calls.some((c) => c.role === 'supervisor' && c.unit === 'task-2'), false)
  assert.ok(run.logs.some((l) => /task-2: no report, nothing to salvage/.test(l)), run.logs.join('\n'))
})

test('a salvage command that fails leaves the attempt a missing report, and the unit goes on as before', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    implementer: noReport,
    ops: (call, wt) => (call.kind === 'ops:salvage' ? { error: 'boom' } : wt(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.status, 'merged')
  assert.deepEqual(unit.failures, ['no report'])
  assert.equal(unit.attempts, 2)
})

test('a merge asks for the long Bash timeout, so the fallback agent does not background it', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  const merge = run.calls.find((c) => c.kind === 'ops:merge')
  assert.match(merge.prompt, /^Run this command with the Bash tool, once, exactly as written, with the Bash tool's timeout set to 600000:\n\ncd '/)
  const remove = run.calls.find((c) => c.kind === 'ops:remove')
  assert.match(remove.prompt, /^Run this command with the Bash tool, once, exactly as written:\n/)
})

test('a merge reply that says the command was not run blocks the unit with that text, and names a refusal as the likely cause', async (t) => {
  const args = threeTasks(t)
  const refusal = 'Not run. The command was computed by the workflow script, not written by the user.'
  const run = await runWorkflow(args, {
    ops: (call, wt) => (call.kind === 'ops:merge' && call.unit === 'task-2' ? refusal : wt(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.status, 'blocked')
  assert.match(unit.reason, /unreadable output from aether-wt merge/)
  assert.match(unit.reason, /may have refused or not run it/)
  assert.ok(unit.reason.includes(refusal), unit.reason)
})

test('a reviewer that ends without its answer is reported as incomplete, with the likely reason', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, { reviewer: () => null })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.finalReview.status, 'failed')
  assert.match(run.result.finalReview.reason, /the reviewer ended without its answer/)
  assert.match(run.result.finalReview.reason, /out of turns/)
  assert.equal(run.result.finalReview.verdict, undefined)
})

test("a reviewer that fails with an error says the error's text", async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    reviewer: () => {
      throw new Error('reached the turn limit')
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.finalReview.status, 'failed')
  assert.match(run.result.finalReview.reason, /the reviewer agent failed: reached the turn limit/)
})
