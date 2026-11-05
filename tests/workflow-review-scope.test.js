'use strict'

// Issue 122: after a relaunch, the final review is planned from the run's units across
// launches, so a relaunch reviews as the whole run would. The first launch merges task-1
// and leaves task-2 blocked; the Lead saves its result as result.json, the integration
// branch moves on by hand, and the relaunch runs task-2 alone.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const block = (unit) => (call, approve) =>
  call.unit === unit
    ? { verdict: 'block', findings: [], ruling: 'Block: needs a decision first.', guidance: '', question: '' }
    : approve(call)

const reviewers = (run) => run.calls.filter((c) => c.role === 'reviewer')
const reviewLog = (run) => run.logs.filter((line) => line.startsWith('final review on '))

async function relaunched(t, definitions) {
  const repo = makeRepo(t)
  const firstArgs = compile(repo, plan(definitions))
  const first = await runWorkflow(firstArgs, { supervisor: block('task-2') })
  assert.equal(first.error, null, first.error && first.error.stack)
  assert.deepEqual(first.result.units.map((u) => [u.id, u.status]), [
    ['task-1', 'merged'],
    ['task-2', 'blocked'],
  ])
  const earlier = first.result.units.find((u) => u.id === 'task-1')
  earlier.rounds.at(-1).findings.push({ severity: 'minor', title: 'Earlier deferred finding', file: 'src/t1/a.js', evidence: '' })
  fs.writeFileSync(path.join(firstArgs.runDir, 'result.json'), JSON.stringify(first.result))
  commitIn(repo, repo.dir, 'src/by-hand.js', 'integrated\n', 'integrated by hand')
  const nextArgs = compile(repo, plan(definitions), ['--run', firstArgs.runId, '--only', 'task-2'])
  assert.deepEqual(nextArgs.waves, [['task-2']])
  // The compile hands the workflow what the earlier launch merged; a first launch has nothing to hand.
  assert.deepEqual(nextArgs.earlierUnits.map((u) => u.id), ['task-1'])
  assert.equal(firstArgs.earlierUnits, undefined)
  assert.notEqual(nextArgs.integration.firstBase, nextArgs.integration.base)
  const next = await runWorkflow(nextArgs)
  assert.equal(next.error, null, next.error && next.error.stack)
  assert.equal(next.result.error, null)
  return { firstArgs, next }
}

for (const review of ['xhigh', 'max']) {
  test(`a relaunch whose earlier launch merged a ${review} unit reviews the whole run on Opus ${review}`, async (t) => {
    const { firstArgs, next } = await relaunched(t, [task(1, { review: `${review} — earlier work`, area: 'earlier' }), task(2, { area: 'current' })])
    assert.equal(next.result.finalReview.status, 'done')
    assert.deepEqual([next.result.finalReview.reviewModel, next.result.finalReview.reviewEffort], ['opus', 'xhigh'])
    assert.deepEqual(reviewLog(next), [`final review on opus xhigh: task-1 reviews at ${review}`])
    const calls = reviewers(next)
    assert.equal(calls.length, 2, 'both areas get a review slice')
    assert.ok(calls.some((c) => /Review only these units: task-1\./.test(c.prompt)))
    for (const call of calls) {
      assert.match(call.prompt, /- task-1 \(.*\): merged/)
      assert.match(call.prompt, /Earlier deferred finding/)
    }
    assert.ok(calls.some((c) => c.prompt.includes(firstArgs.tasks['task-1'].owns[0])))
  })
}

test('a relaunch whose earlier launches merged only high units still reviews on Opus high', async (t) => {
  const { next } = await relaunched(t, [task(1, { area: 'earlier' }), task(2, { area: 'current' })])
  assert.equal(next.result.finalReview.status, 'done')
  assert.deepEqual([next.result.finalReview.reviewModel, next.result.finalReview.reviewEffort], ['opus', 'high'])
  assert.deepEqual(reviewLog(next), ['final review on opus high: a relaunch: the final review covers the earlier launches too'])
  const calls = reviewers(next)
  assert.equal(calls.length, 2, 'both areas get a review slice')
  for (const call of calls) {
    assert.match(call.prompt, /- task-1 \(.*\): merged/)
    assert.match(call.prompt, /Earlier deferred finding/)
  }
})

test('a first launch plans its final review from its own units, as before', async (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1, { review: 'xhigh — the parser' }), task(2)]))
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual([run.result.finalReview.reviewModel, run.result.finalReview.reviewEffort], ['opus', 'xhigh'])
  assert.deepEqual(reviewLog(run), ['final review on opus xhigh: task-1 reviews at xhigh'])
  assert.equal(reviewers(run).length, 1)
})
