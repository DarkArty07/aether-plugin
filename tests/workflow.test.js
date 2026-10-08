'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

// A compiled run: Task 1 and Task 2 form the first wave, and Task 3 depends on Task 1.
function threeTasks(t) {
  const repo = makeRepo(t)
  return compile(repo, plan([task(1), task(2), task(3, { depends: 'Task 1 — uses it' })]))
}

const finding = (title) => ({ severity: 'important', title, file: 'src/t2/a.js', evidence: 'line 3' })
const retry = (title) => ({ verdict: 'retry', findings: [finding(title)], ruling: `Retry: ${title}.`, guidance: `fix ${title}`, question: '' })
const attemptsOf = (run, unit) => run.calls.filter((c) => c.role === 'implementer' && c.unit === unit)

test('two waves, all approved: merges run one at a time, the dependent unit waits, then review and cleanup', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(JSON.stringify(args))
  assert.equal(run.error, null, run.error && run.error.stack)
  const { result, events, calls } = run
  assert.deepEqual(
    result.units.map((u) => [u.id, u.status, u.tiers, u.commit]),
    [
      ['task-1', 'merged', ['haiku'], 'merge-task-1'],
      ['task-2', 'merged', ['haiku'], 'merge-task-2'],
      ['task-3', 'merged', ['haiku'], 'merge-task-3'],
    ],
  )
  assert.equal(result.runId, args.runId)
  assert.equal(result.error, null)
  assert.equal(run.maxActive.implementer, 2)
  assert.equal(run.maxActive['ops:merge'], 1)
  assert.ok(events.indexOf('end ops:merge task-1') < events.indexOf('start implementer task-3'))

  const implement = calls.find((c) => c.role === 'implementer' && c.unit === 'task-1')
  assert.equal(implement.model, 'haiku')
  assert.ok(implement.prompt.includes(args.tasks['task-1'].brief))
  assert.ok(implement.prompt.includes(`aether-wt ensure ${args.runId} task-1`))
  const supervise = calls.find((c) => c.role === 'supervisor' && c.unit === 'task-1')
  assert.equal(supervise.model, 'sonnet')
  assert.ok(supervise.prompt.includes(path.join(args.runDir, 'packages', 'task-1.diff')))

  assert.deepEqual(calls.filter((c) => c.role === 'reviewer').map((c) => c.model), ['opus'])
  assert.equal(result.finalReview.status, 'done')
  assert.equal(result.finalReview.verdict, 'ready')
  assert.deepEqual(calls.filter((c) => c.kind === 'ops:remove').map((c) => c.unit).sort(), ['task-1', 'task-2', 'task-3'])
  assert.deepEqual(events.slice(-2), ['start ops:sweep', 'end ops:sweep'])
  assert.deepEqual(result.cleanup.remaining, { worktrees: [], branches: [] })
  assert.equal(result.agents.total, calls.length)
  assert.equal(calls.every((c) => c.schema), true)
})

test('a unit the supervisor sends back twice on haiku escalates to sonnet and merges', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => (call.unit === 'task-2' && call.n <= 2 ? retry(`gap ${call.n}`) : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units.find((u) => u.id === 'task-2')
  assert.equal(unit.status, 'merged')
  assert.deepEqual(unit.tiers, ['haiku', 'sonnet'])
  assert.deepEqual(attemptsOf(run, 'task-2').map((c) => c.model), ['haiku', 'haiku', 'sonnet'])
  const third = attemptsOf(run, 'task-2')[2].prompt
  assert.match(third, /gap 2/)
  assert.match(third, /fix gap 2/)
  assert.deepEqual(unit.rounds.map((r) => r.verdict), ['retry', 'retry', 'approve'])
})

test('a unit that needs context and is blocked stops its dependents and keeps its work as a patch', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    implementer: (call, done) =>
      call.unit === 'task-1'
        ? { status: 'NEEDS_CONTEXT', summary: 'Stopped before coding.', head: '', tests: '', concerns: '', question: 'Which token format?' }
        : done(call),
    supervisor: (call, approve) =>
      call.unit === 'task-1'
        ? { verdict: 'block', findings: [], ruling: 'Block: only the Designer knows the format.', guidance: '', question: '' }
        : approve(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const [one, two, three] = run.result.units
  assert.equal(one.status, 'blocked')
  assert.equal(one.question, 'Which token format?')
  assert.equal(one.patch, path.join(args.runDir, 'patches', 'task-1.patch'))
  assert.match(run.calls.find((c) => c.role === 'supervisor' && c.unit === 'task-1').prompt, /Which token format\?/)
  assert.equal(two.status, 'merged')
  assert.equal(three.status, 'skipped')
  assert.match(three.reason, /task-1/)
  assert.equal(run.calls.some((c) => c.unit === 'task-3'), false)
})

test('a merge conflict gets one retry with its context, and a second conflict blocks the unit', async (t) => {
  const args = { ...threeTasks(t), ladder: { haiku: 1, sonnet: 1, opus: 1 } }
  const run = await runWorkflow(args, {
    ops: (call, wt) =>
      call.kind === 'ops:merge' && call.unit === 'task-2'
        ? { merged: false, reason: 'conflict', files: ['src/shared.js'], detail: `CONFLICT ${call.n}` }
        : wt(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units.find((u) => u.id === 'task-2')
  assert.equal(unit.status, 'blocked')
  assert.match(unit.reason, /conflict/)
  // The retry stays on the unit's tier: a conflict is not the implementer's failure.
  assert.deepEqual(attemptsOf(run, 'task-2').map((c) => c.model), ['haiku', 'haiku'])
  const second = attemptsOf(run, 'task-2')[1].prompt
  assert.match(second, /CONFLICT 1/)
  assert.match(second, /src\/shared\.js/)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:merge' && c.unit === 'task-2').length, 2)
  assert.equal(unit.patch, path.join(args.runDir, 'patches', 'task-2.patch'))
})

test('when the agent budget runs out no new attempt starts, the rest is not-run, and cleanup still runs', async (t) => {
  const args = { ...threeTasks(t), maxAgents: 2 }
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(
    run.result.units.map((u) => [u.id, u.status]),
    [
      ['task-1', 'merged'],
      ['task-2', 'merged'],
      ['task-3', 'not-run'],
    ],
  )
  assert.match(run.result.units[2].reason, /budget/)
  assert.equal(run.result.finalReview.status, 'skipped')
  assert.equal(run.calls.some((c) => c.role === 'reviewer'), false)
  assert.deepEqual(run.events.slice(-2), ['start ops:sweep', 'end ops:sweep'])
})

test('a failing final reviewer still yields a result and cleanup', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    reviewer: () => {
      throw new Error('API error')
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.finalReview.status, 'failed')
  assert.equal(run.result.units.every((u) => u.status === 'merged'), true)
  assert.deepEqual(run.events.slice(-2), ['start ops:sweep', 'end ops:sweep'])
})

test('missing or invalid args throw before any agent starts', async (t) => {
  const args = threeTasks(t)
  const { base, ...noBase } = args.integration
  assert.ok(base)
  const bad = [
    undefined,
    'not json',
    { ...args, integration: noBase },
    { ...args, waves: [['task-9']] },
    { ...args, runId: '../evil' },
    { ...args, maxAgents: 0 },
    { ...args, waves: [['task-1', 'task-2'], ['task-1']] },
  ]
  for (const input of bad) {
    const run = await runWorkflow(input)
    assert.match(String(run.error && run.error.message), /^aether:run/, JSON.stringify(input))
    assert.equal(run.calls.length, 0)
  }
})

test('an approval that still lists an important finding counts as a retry', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    supervisor: (call, approve) =>
      call.unit === 'task-1' && call.n === 1 ? { ...retry('missing edge case'), verdict: 'approve' } : approve(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(attemptsOf(run, 'task-1').length, 2)
  assert.match(attemptsOf(run, 'task-1')[1].prompt, /missing edge case/)
  assert.deepEqual(run.result.units[0].rounds.map((r) => r.verdict), ['retry', 'approve'])
  assert.equal(run.result.units[0].status, 'merged')
})

test('an ownership refusal at merge sends the unit back with the files outside its Owns', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    ops: (call, wt) =>
      call.kind === 'ops:merge' && call.unit === 'task-2' && call.n === 1 ? { merged: false, reason: 'ownership', files: ['README.md'] } : wt(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(attemptsOf(run, 'task-2').length, 2)
  assert.match(attemptsOf(run, 'task-2')[1].prompt, /README\.md/)
  assert.equal(run.result.units[1].status, 'merged')
})

test('a failed implementer counts as an attempt, and a spent ladder blocks the unit', async (t) => {
  const args = { ...threeTasks(t), ladder: { haiku: 1, sonnet: 1, opus: 0 } }
  const run = await runWorkflow(args, { implementer: (call, done) => (call.unit === 'task-2' ? null : done(call)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.status, 'blocked')
  assert.deepEqual(unit.tiers, ['haiku', 'sonnet'])
  assert.match(unit.reason, /ladder/)
  assert.equal(run.calls.some((c) => c.role === 'supervisor' && c.unit === 'task-2'), false)
})

test('a dirty integration worktree or a failed merge command blocks the unit at once', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    ops: (call, wt) => {
      if (call.kind !== 'ops:merge') return wt(call)
      if (call.unit === 'task-1') return { merged: false, reason: 'dirty-integration', detail: 'the integration worktree has uncommitted changes' }
      if (call.unit === 'task-2') return null
      return wt(call)
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const [one, two, three] = run.result.units
  assert.equal(one.status, 'blocked')
  assert.match(one.reason, /uncommitted changes/)
  assert.equal(two.status, 'blocked')
  assert.match(two.reason, /ops agent failed/)
  assert.equal(three.status, 'skipped')
  assert.equal(run.calls.filter((c) => c.role === 'implementer').length, 2)
  assert.equal(run.result.finalReview.status, 'skipped')
})

test('args encoded as JSON twice still run, as a Designer may pass them quoted', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(JSON.stringify(JSON.stringify(args)))
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.units.every((u) => u.status === 'merged'), true)
})
