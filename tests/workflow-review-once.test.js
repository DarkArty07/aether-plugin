'use strict'

// Issues #5 and #33: the final review runs once per run, when a launch ends with every unit
// merged, on the whole change. A launch that leaves a unit unmerged defers it. `review: true`
// runs it on what is merged, including a launch that has no unit left to run.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const ROOT = path.join(__dirname, '..')
const WHEN = 'The final review runs when a launch ends with all its units merged.'
const HOW = 'To run it now on what is merged, launch again with review set to true.'

function twoTasks(t, one = {}, two = {}) {
  const repo = makeRepo(t)
  return { repo, args: compile(repo, plan([task(1, one), task(2, two)])) }
}

const block = (unit) => (call, approve) =>
  call.unit === unit
    ? { verdict: 'block', findings: [], ruling: 'Block: needs a decision first.', guidance: '', question: '' }
    : approve(call)

const reviewers = (run) => run.calls.filter((c) => c.role === 'reviewer')
const reviewWork = (run) => run.calls.some((c) => c.role === 'reviewer' || (c.label || '').includes('final review'))

function deferredReason(counts) {
  return `${counts}. ${WHEN} ${HOW}`
}

test('a launch that leaves a unit blocked defers the final review and spends no reviewer', async (t) => {
  const { args } = twoTasks(t)
  const run = await runWorkflow(args, { supervisor: block('task-2') })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(
    run.result.units.map((u) => [u.id, u.status]),
    [
      ['task-1', 'merged'],
      ['task-2', 'blocked'],
    ],
  )
  assert.equal(run.result.finalReview.status, 'deferred')
  assert.equal(run.result.finalReview.reason, deferredReason('1 blocked, 0 skipped, 0 not run'))
  assert.equal(run.result.finalReview.verdict, undefined)
  assert.equal(reviewWork(run), false)
  assert.equal(run.result.agents.byRole.reviewer, undefined)
  const modelAgents = run.result.agents.total - (run.result.agents.byRole.ops || 0)
  assert.equal(modelAgents, run.calls.filter((c) => c.role !== 'ops').length)

  // false is not a force: the same launch still defers.
  const { args: again } = twoTasks(t)
  const quiet = await runWorkflow({ ...again, review: false }, { supervisor: block('task-2') })
  assert.equal(quiet.error, null, quiet.error && quiet.error.stack)
  assert.equal(quiet.result.finalReview.status, 'deferred')
  assert.equal(reviewWork(quiet), false)
})

test('a launch whose only unit is blocked defers, and is not a skipped review of nothing merged', async (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const run = await runWorkflow(args, { supervisor: block('task-1') })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.units[0].status, 'blocked')
  assert.equal(run.result.finalReview.status, 'deferred')
  assert.equal(run.result.finalReview.reason, deferredReason('1 blocked, 0 skipped, 0 not run'))
  assert.doesNotMatch(run.result.finalReview.reason, /no unit merged/)
  assert.equal(reviewWork(run), false)
})

test('review: true runs the final review of a launch that left a unit blocked, on the merged units', async (t) => {
  const { args } = twoTasks(t, { tier: 'opus high — the parser design' }, {})
  const run = await runWorkflow({ ...args, review: true }, { supervisor: block('task-1') })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.units[0].status, 'blocked')
  assert.equal(run.result.units[1].status, 'merged')
  assert.equal(run.result.finalReview.status, 'done')
  assert.equal(run.result.finalReview.verdict, 'ready')
  // The blocked opus task is not merged, so it does not raise the review.
  assert.deepEqual(reviewers(run).map((c) => `${c.model} ${c.effort}`), ['sonnet high'])
  assert.equal(reviewers(run).length, 1)
  const diff = run.calls.find((c) => c.kind === 'ops:diff')
  assert.match(diff.command.line, new RegExp(`aether-wt diff ${args.runId} --final`))
})

test('a relaunch that merges the blocked unit reviews once, and the launch that left it blocked does not', async (t) => {
  const repo = makeRepo(t)
  const tasks = [task(1), task(2)]
  const firstArgs = compile(repo, plan(tasks))
  const first = await runWorkflow(firstArgs, { supervisor: block('task-2') })
  assert.equal(first.error, null, first.error && first.error.stack)
  assert.equal(first.result.finalReview.status, 'deferred')
  assert.equal(reviewers(first).length, 0)

  commitIn(repo, repo.dir, 'src/by-hand.js', 'by hand\n', 'integrated by hand')
  const secondArgs = compile(repo, plan(tasks), ['--run', firstArgs.runId, '--only', 'task-2'])
  assert.deepEqual(secondArgs.waves, [['task-2']])
  assert.notEqual(secondArgs.integration.firstBase, secondArgs.integration.base)
  const second = await runWorkflow(secondArgs)
  assert.equal(second.error, null, second.error && second.error.stack)
  assert.deepEqual(second.result.units.map((u) => [u.id, u.status]), [['task-2', 'merged']])
  assert.equal(second.result.finalReview.status, 'done')
  assert.equal(reviewers(second).length, 1)
  assert.deepEqual(reviewers(second).map((c) => `${c.model} ${c.effort}`), ['opus high'])
  const diff = second.calls.find((c) => c.kind === 'ops:diff')
  assert.match(diff.command.line, new RegExp(`aether-wt diff ${firstArgs.runId} --final`))
  assert.equal(reviewers(first).length + reviewers(second).length, 1)
})

test('a launch with no unit left reviews only when review is true', async (t) => {
  const repo = makeRepo(t)
  const first = compile(repo, plan([task(1), task(2)]))
  commitIn(repo, repo.dir, 'src/by-hand.js', 'by hand\n', 'integrated by hand')
  const relaunch = compile(repo, plan([task(1), task(2)]), ['--run', first.runId, '--only', 'task-2'])
  // What compile prints when every unit of the run is already merged.
  const empty = { ...relaunch, waves: [], tasks: {} }
  assert.deepEqual(empty.waves, [])

  const held = await runWorkflow(empty)
  assert.equal(held.error, null, held.error && held.error.stack)
  assert.deepEqual(held.result.units, [])
  assert.equal(held.result.finalReview.status, 'deferred')
  assert.equal(held.result.finalReview.reason, `This launch ran no unit (0 blocked, 0 skipped, 0 not run). ${WHEN} ${HOW}`)
  assert.equal(reviewWork(held), false)

  const forced = await runWorkflow({ ...empty, review: true })
  assert.equal(forced.error, null, forced.error && forced.error.stack)
  assert.equal(forced.result.finalReview.status, 'done')
  assert.equal(reviewers(forced).length, 1)
  assert.deepEqual(reviewers(forced).map((c) => `${c.model} ${c.effort}`), ['opus high'])
  const diff = forced.calls.find((c) => c.kind === 'ops:diff')
  assert.match(diff.command.line, new RegExp(`aether-wt diff ${first.runId} --final`))
})

test('a first launch with no unit and review true still reviews, and is not treated as a small haiku run', async (t) => {
  const { args } = twoTasks(t)
  const run = await runWorkflow({ ...args, waves: [], tasks: {}, review: true })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.finalReview.status, 'done')
  assert.deepEqual(reviewers(run).map((c) => `${c.model} ${c.effort}`), ['opus high'])
  assert.deepEqual(
    run.logs.filter((line) => line.startsWith('final review on ')),
    ['final review on opus high: the merged work is not a small all-haiku run'],
  )
})

test('review that is not a boolean is refused before any agent starts', async (t) => {
  const { args } = twoTasks(t)
  const run = await runWorkflow({ ...args, review: 'true' })
  assert.equal(run.error && run.error.message, 'aether:run args are missing or invalid: review')
  assert.equal(run.calls.length, 0)
})

test('the swarm skill and the guide say when the final review runs', () => {
  const swarm = fs.readFileSync(path.join(ROOT, 'plugins/aether/skills/swarm/SKILL.md'), 'utf8')
  const trouble = fs.readFileSync(path.join(ROOT, 'docs/guide/troubleshooting.md'), 'utf8')
  const maintenance = fs.readFileSync(path.join(ROOT, 'docs/guide/maintenance.md'), 'utf8')
  for (const [name, text] of [
    ['swarm', swarm],
    ['troubleshooting', trouble],
    ['maintenance', maintenance],
  ]) {
    assert.match(text, /deferred/, name)
    assert.match(text, /when a launch ends with all its units merged|when a launch ends with every unit/, name)
    assert.match(text, /review/, name)
  }
  assert.match(swarm, /"review": true/)
  assert.match(swarm, /[Rr]elaunch the blocked, skipped and not-run tasks/)
  assert.match(swarm, /`deferred` is not a failure/)
  assert.match(trouble, /#the-final-review-has-not-run|## The final review has not run/)
  assert.match(maintenance, /troubleshooting\.md#the-final-review-has-not-run/)
})
