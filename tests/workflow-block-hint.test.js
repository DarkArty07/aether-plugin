'use strict'

// Issues 81 and 92: a unit that ends blocked after its merge was refused says which files the refusal named, and
// the one step that integrates it by hand, with its patch. A unit blocked for another reason gets no such step.

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const one = (t) => compile(makeRepo(t), plan([task(1)]))
const refusedOwnership = (files) => (call, wt) => (call.kind === 'ops:merge' ? { merged: false, reason: 'ownership', files, detail: '' } : wt(call))
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const adoptStep = (result, unit) => new RegExp(`git apply ${escape(unit.patch)} in the integration worktree.*aether-wt adopt ${escape(result.runId)} task-1 --commit <sha> --reason "<text>"`)

test('a unit the merge refused for a file outside Owns names that file, its patch and the adopt step', async (t) => {
  const run = await runWorkflow(one(t), { ops: refusedOwnership(['src/other/x.js']) })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'blocked')
  assert.ok(unit.patch, 'the unit keeps its patch')
  assert.deepEqual(unit.blockedFiles, ['src/other/x.js'])
  assert.match(unit.next, adoptStep(run.result, unit))
  assert.ok(unit.reason.includes('src/other/x.js'), unit.reason)
  assert.ok(unit.reason.endsWith(unit.next), unit.reason)
})

test('a supervisor block after a refused merge keeps its ruling and adds the step', async (t) => {
  const run = await runWorkflow(one(t), {
    ops: refusedOwnership(['src/other/x.js']),
    supervisor: (call, approve) =>
      call.n === 1
        ? approve(call)
        : { verdict: 'block', findings: [], ruling: 'Block: the task must change src/other/x.js, which it does not own.', guidance: '', question: 'Own it, or accept a red?' },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'blocked')
  assert.equal(unit.question, 'Own it, or accept a red?')
  assert.ok(unit.reason.startsWith('Block: the task must change src/other/x.js, which it does not own.'), unit.reason)
  assert.deepEqual(unit.blockedFiles, ['src/other/x.js'])
  assert.match(unit.next, adoptStep(run.result, unit))
})

test('a unit whose merge turned the tests red names the test files that failed, not the names that are not files', async (t) => {
  const run = await runWorkflow(one(t), {
    ops: (call, wt) =>
      call.kind === 'ops:merge'
        ? { merged: false, reason: 'tests', exitCode: 1, timedOut: false, reverted: true, output: 'not ok 4 - adds', newFailures: ['tests/env-scrub.test.js', 'adds'] }
        : wt(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'blocked')
  assert.match(unit.reason, /merge failed again/)
  assert.deepEqual(unit.blockedFiles, ['tests/env-scrub.test.js'])
  assert.match(unit.next, adoptStep(run.result, unit))
})

test('a unit blocked for another reason has no blocked files and no step to adopt it', async (t) => {
  const run = await runWorkflow(one(t), { implementer: () => null })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'blocked')
  assert.equal(unit.reason, 'the ladder is spent (exhausted)')
  assert.deepEqual(unit.blockedFiles, [])
  assert.equal(unit.next, undefined)
})

test('a merged unit is unchanged: no blocked files, no step, and its reason stays empty', async (t) => {
  const run = await runWorkflow(one(t))
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.equal(unit.blockedFiles, undefined)
  assert.equal(unit.next, undefined)
  assert.equal(unit.reason, null)
})
