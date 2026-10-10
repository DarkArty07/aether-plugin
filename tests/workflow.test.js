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
const NO_REPORT_REASON = 'the unit ended twice without its report: it is probably too large for one attempt; split it into smaller tasks'

test('two waves, all approved: merges run one at a time, the dependent unit waits, then review and cleanup', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(JSON.stringify(args))
  assert.equal(run.error, null, run.error && run.error.stack)
  const { result, events, calls } = run
  assert.deepEqual(
    result.units.map((u) => [u.id, u.status, u.tiers, u.commit]),
    [
      ['task-1', 'merged', ['haiku xhigh'], 'merge-task-1'],
      ['task-2', 'merged', ['haiku xhigh'], 'merge-task-2'],
      ['task-3', 'merged', ['haiku xhigh'], 'merge-task-3'],
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

  assert.deepEqual(calls.filter((c) => c.role === 'reviewer').map((c) => c.model), ['sonnet'])
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
  assert.deepEqual(unit.tiers, ['haiku xhigh', 'sonnet xhigh'])
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
    { ...args, tasks: { ...args.tasks, 'task-1': { ...args.tasks['task-1'], effort: 'turbo' } } },
    { ...args, tasks: { ...args.tasks, 'task-2': { ...args.tasks['task-2'], review: 'deep' } } },
    // args compiled before this change: no effort and no review
    { ...args, tasks: Object.fromEntries(Object.entries(args.tasks).map(([id, { effort, review, ...old }]) => [id, old])) },
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
  assert.deepEqual(run.result.units[0].failures, ['findings: missing edge case'])
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

test('a failed implementer counts as an attempt, and the next attempt runs', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, { implementer: (call, done) => (call.unit === 'task-2' && call.n === 1 ? null : done(call)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.status, 'merged')
  assert.deepEqual(attemptsOf(run, 'task-2').map((c) => c.model), ['haiku', 'haiku'])
  assert.deepEqual(unit.rounds.map((r) => [r.status, r.summary]), [
    ['FAILED', 'The implementer agent failed.'],
    ['DONE', 'Implemented the brief.'],
  ])
  assert.deepEqual(unit.failures, ['no report'])
})

test('an implementer that returns no report twice blocks the unit after two attempts, with the failures kept', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, { implementer: (call, done) => (call.unit === 'task-2' ? null : done(call)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.deepEqual([unit.status, unit.reason], ['blocked', NO_REPORT_REASON])
  assert.deepEqual(attemptsOf(run, 'task-2').map((c) => c.model), ['haiku', 'haiku'])
  assert.deepEqual(unit.tiers, ['haiku xhigh'])
  assert.deepEqual(unit.failures, ['no report', 'no report'])
  assert.equal(run.calls.some((c) => c.role === 'supervisor' && c.unit === 'task-2'), false)
  assert.equal(run.result.units[0].status, 'merged')
})

test('different findings each time keep the ladder: every rung runs, then the ladder is spent', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => (call.unit === 'task-2' ? retry(`gap ${call.n}`) : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.deepEqual([unit.status, unit.reason], ['blocked', 'the ladder is spent'])
  assert.deepEqual(attemptsOf(run, 'task-2').map((c) => c.model), ['haiku', 'haiku', 'sonnet', 'sonnet', 'opus'])
  assert.deepEqual(unit.failures, ['findings: gap 1', 'findings: gap 2', 'findings: gap 3', 'findings: gap 4', 'findings: gap 5'])
})

test('the same findings three times block the unit, whatever the case and spacing of their titles', async (t) => {
  const args = threeTasks(t)
  const titles = ['Missing  edge case', 'missing edge case', ' MISSING EDGE\tCASE ']
  // A minor finding does not take part in the comparison.
  const withMinor = (title) => ({
    ...retry(title),
    findings: [...retry(title).findings, { severity: 'minor', title: 'naming nit', file: 'src/t2/a.js', evidence: 'x' }],
  })
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => (call.unit === 'task-2' ? withMinor(titles[Math.min(call.n, titles.length) - 1]) : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.status, 'blocked')
  assert.equal(unit.reason, 'the same findings came back 3 times: missing edge case; the task needs a split or a redesign')
  assert.deepEqual(unit.failures, ['findings: missing edge case', 'findings: missing edge case', 'findings: missing edge case'])
  assert.deepEqual(attemptsOf(run, 'task-2').map((c) => c.model), ['haiku', 'haiku', 'sonnet'])
})

test('a retry without a blocking finding, three times, stops the unit and says so', async (t) => {
  const args = threeTasks(t)
  const bare = { verdict: 'retry', findings: [], ruling: 'Retry.', guidance: 'try again', question: '' }
  const run = await runWorkflow(args, { supervisor: (call, approve) => (call.unit === 'task-2' ? bare : approve(call)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.reason, 'the same findings came back 3 times: (no blocking finding); the task needs a split or a redesign')
  assert.deepEqual(unit.failures, Array(3).fill('findings: (no blocking finding)'))
})

// The sentences the script adds to a ruling or a summary when a verdict is not one it knows.
const NOT_A_VERDICT = 'The verdict was not one of approve, retry, escalate or block, so it counts as retry.'
const NOT_A_REVIEW_VERDICT = 'The verdict was not one of ready, ready-with-fixes or not-ready, so it counts as not-ready.'

test('findings that are not an array count as none, and the unit goes on with its ladder', async (t) => {
  const args = threeTasks(t)
  const shapes = ['see ruling', { severity: 'important', title: 'missing edge case', file: 'src/t2/a.js', evidence: 'line 3' }, null]
  for (const findings of shapes) {
    const run = await runWorkflow(args, {
      supervisor: (call, approve) => (call.unit === 'task-2' && call.n === 1 ? { ...retry('gap'), findings } : approve(call)),
    })
    assert.equal(run.error, null, run.error && run.error.stack)
    const unit = run.result.units[1]
    assert.equal(unit.status, 'merged', JSON.stringify(findings))
    assert.deepEqual(unit.rounds[0].findings, [], JSON.stringify(findings))
    assert.deepEqual(unit.failures, ['findings: (no blocking finding)'])
    assert.equal(attemptsOf(run, 'task-2').length, 2)
  }
})

test('findings keep only the entries that are objects', async (t) => {
  const run = await runWorkflow(threeTasks(t), {
    supervisor: (call, approve) =>
      call.unit === 'task-2' && call.n === 1
        ? { ...retry('missing edge case'), findings: ['the parser drops a row', null, 7, finding('missing edge case')] }
        : approve(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.deepEqual(unit.rounds[0].findings, [finding('missing edge case')])
  assert.deepEqual(unit.failures, ['findings: missing edge case'])
  assert.equal(unit.status, 'merged')
})

test('a verdict that is not one of the four counts as a retry, and the ruling says so', async (t) => {
  for (const verdict of ['approved', 'Approve']) {
    const run = await runWorkflow(threeTasks(t), {
      supervisor: (call, approve) =>
        call.unit === 'task-2' && call.n === 1 ? { verdict, findings: [], ruling: 'Looks right.', guidance: '', question: '' } : approve(call),
    })
    assert.equal(run.error, null, run.error && run.error.stack)
    const unit = run.result.units[1]
    assert.equal(unit.status, 'merged', verdict)
    assert.deepEqual(unit.rounds.map((r) => r.verdict), ['retry', 'approve'], verdict)
    assert.equal(unit.rounds[0].ruling, `Looks right. ${NOT_A_VERDICT}`)
    // The next attempt reads the ruling, and the unit merges once, on the approval.
    assert.match(attemptsOf(run, 'task-2')[1].prompt, /Supervisor: retry\. Looks right\. The verdict was not one of approve/)
    assert.equal(run.calls.filter((c) => c.kind === 'ops:merge' && c.unit === 'task-2').length, 1)
  }
})

test('an unknown verdict every time stops the unit as repeated findings, before the ladder is spent', async (t) => {
  const run = await runWorkflow(threeTasks(t), {
    supervisor: (call, approve) =>
      call.unit === 'task-2' ? { verdict: 'approved', findings: [], ruling: 'Fine.', guidance: '', question: '' } : approve(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units[1]
  assert.equal(unit.status, 'blocked')
  assert.equal(unit.reason, 'the same findings came back 3 times: (no blocking finding); the task needs a split or a redesign')
  assert.deepEqual(attemptsOf(run, 'task-2').map((c) => c.model), ['haiku', 'haiku', 'sonnet'])
  assert.equal(run.calls.some((c) => c.kind === 'ops:merge' && c.unit === 'task-2'), false)
})

test('a final review with findings that are not an array, or an unknown verdict, is checked the same way', async (t) => {
  const odd = await runWorkflow(threeTasks(t), {
    reviewer: () => ({ verdict: 'approved', findings: 'see ruling', declined: [], summary: 'Looks fine.' }),
  })
  assert.equal(odd.error, null, odd.error && odd.error.stack)
  assert.equal(odd.result.finalReview.status, 'done')
  assert.deepEqual(odd.result.finalReview.findings, [])
  assert.equal(odd.result.finalReview.verdict, 'not-ready')
  assert.equal(odd.result.finalReview.summary, `Looks fine. ${NOT_A_REVIEW_VERDICT}`)
  assert.deepEqual(odd.events.slice(-2), ['start ops:sweep', 'end ops:sweep'])

  const mixed = await runWorkflow(threeTasks(t), {
    reviewer: () => ({ verdict: 'ready-with-fixes', findings: ['a stray line', finding('naming drift')], declined: [], summary: 'Mostly fine.' }),
  })
  assert.equal(mixed.error, null, mixed.error && mixed.error.stack)
  assert.deepEqual(mixed.result.finalReview.findings, [finding('naming drift')])
  assert.equal(mixed.result.finalReview.verdict, 'ready-with-fixes')
  assert.equal(mixed.result.finalReview.summary, 'Mostly fine.')
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

// A compiled run of two independent tasks, with the given options for each.
function twoTasks(t, one = {}, two = {}) {
  const repo = makeRepo(t)
  return compile(repo, plan([task(1, one), task(2, two)]))
}

const rungs = (run, unit) => attemptsOf(run, unit).map((c) => `${c.model} ${c.effort}`)

test("every call passes its effort: the task's for implementers, its review for supervisors, the run's risk for the reviewer, low for ops", async (t) => {
  const args = twoTasks(t, {}, { tier: 'haiku medium — renames one field', review: 'xhigh — input parsing the tests leave open' })
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  const of = (role, unit) => run.calls.filter((c) => c.role === role && c.unit === unit).map((c) => `${c.model} ${c.effort}`)
  assert.deepEqual(of('implementer', 'task-1'), ['haiku xhigh'])
  assert.deepEqual(of('implementer', 'task-2'), ['haiku medium'])
  assert.deepEqual(of('supervisor', 'task-1'), ['sonnet high'])
  assert.deepEqual(of('supervisor', 'task-2'), ['sonnet xhigh'])
  // task-2 asks for an xhigh review, so the final review is Opus at xhigh.
  assert.deepEqual(run.calls.filter((c) => c.role === 'reviewer').map((c) => `${c.model} ${c.effort}`), ['opus xhigh'])
  const ops = run.calls.filter((c) => c.role === 'ops')
  assert.ok(ops.length > 0)
  assert.ok(ops.every((c) => c.model === 'haiku' && c.effort === 'low'))
  assert.deepEqual(run.result.units.map((u) => u.tiers), [['haiku xhigh'], ['haiku medium']])
  assert.deepEqual(run.result.units[1].rounds.map((r) => [r.tier, r.reviewEffort]), [['haiku medium', 'xhigh']])
  const implement = run.calls.find((c) => c.role === 'implementer' && c.unit === 'task-2')
  assert.equal(implement.label, 'task-2: implement on haiku medium (attempt 1)')
  assert.match(implement.prompt, /, attempt 1, on haiku medium\.\n/)
  const supervise = run.calls.find((c) => c.role === 'supervisor' && c.unit === 'task-2')
  assert.equal(supervise.label, 'task-2: supervise attempt 1 on sonnet xhigh')
  assert.match(supervise.prompt, /Attempt 1 ran on haiku medium\./)
})

test('a retry runs at xhigh on the same model, and an escalation runs the next model at xhigh', async (t) => {
  const args = twoTasks(t, { tier: 'haiku medium — renames one field' }, { tier: 'sonnet high — wiring the tests pin down' })
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => {
      if (call.unit === 'task-1' && call.n <= 2) return retry(`gap ${call.n}`)
      if (call.unit === 'task-2' && call.n === 1) return { ...retry('the order of the calls'), verdict: 'escalate' }
      return approve(call)
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(rungs(run, 'task-1'), ['haiku medium', 'haiku xhigh', 'sonnet xhigh'])
  assert.deepEqual(rungs(run, 'task-2'), ['sonnet high', 'opus xhigh'])
  assert.deepEqual(run.result.units.map((u) => u.tiers), [
    ['haiku medium', 'haiku xhigh', 'sonnet xhigh'],
    ['sonnet high', 'opus xhigh'],
  ])
  assert.ok(run.logs.includes('task-1: escalating from haiku xhigh to sonnet xhigh'), run.logs.join('\n'))
  assert.ok(run.logs.includes('task-2: escalating from sonnet high to opus xhigh'), run.logs.join('\n'))
  assert.match(attemptsOf(run, 'task-1')[2].prompt, /- Attempt 2 on haiku xhigh: DONE\./)
})

test('a declared max stays max on its model, and the retry after a merge conflict keeps the model and the effort', async (t) => {
  const args = twoTasks(t, { tier: 'sonnet max — a parser whose cases the tests cannot list' }, { tier: 'haiku high — a constant table' })
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => (call.unit === 'task-1' && call.n === 1 ? retry('edge') : approve(call)),
    ops: (call, wt) =>
      call.kind === 'ops:merge' && call.unit === 'task-2' && call.n === 1
        ? { merged: false, reason: 'conflict', files: ['src/shared.js'], detail: 'CONFLICT' }
        : wt(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(rungs(run, 'task-1'), ['sonnet max', 'sonnet max'])
  assert.deepEqual(rungs(run, 'task-2'), ['haiku high', 'haiku high'])
  assert.deepEqual(run.result.units.map((u) => [u.status, u.tiers]), [
    ['merged', ['sonnet max']],
    ['merged', ['haiku high']],
  ])
})

test("the supervisor's Ladder section names the rung a retry and an escalation would run", async (t) => {
  const args = { ...twoTasks(t, { tier: 'haiku medium — renames one field' }), ladder: { haiku: 2, sonnet: 1, opus: 0 } }
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => (call.unit === 'task-1' && call.n <= 2 ? retry(`gap ${call.n}`) : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const ladders = run.calls.filter((c) => c.role === 'supervisor' && c.unit === 'task-1').map((c) => c.prompt.split('\n## Ladder\n')[1])
  assert.deepEqual(ladders, [
    'Attempts used: haiku 1/2, sonnet 0/1, opus 0/0.\nA retry runs on haiku xhigh. Escalate runs on sonnet xhigh.',
    'Attempts used: haiku 2/2, sonnet 0/1, opus 0/0.\nA retry runs on sonnet xhigh. Escalate runs on sonnet xhigh.',
    'Attempts used: haiku 2/2, sonnet 1/1, opus 0/0.\nA retry blocks the unit: the ladder is spent. Escalate blocks the unit: the ladder is spent.',
  ])
})

test("a task's effort applies only on its own model: with no Haiku attempts, a haiku medium task starts on sonnet xhigh", async (t) => {
  const args = { ...twoTasks(t, { tier: 'haiku medium — renames one field' }), ladder: { haiku: 0, sonnet: 2, opus: 1 } }
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(rungs(run, 'task-1'), ['sonnet xhigh'])
  assert.deepEqual(run.result.units[0].tiers, ['sonnet xhigh'])
})

// The final reviewer's model and effort as the harness records them, and the log lines the review wrote.
const reviewOf = (run) => run.calls.filter((c) => c.role === 'reviewer').map((c) => `${c.model} ${c.effort}`)
const reviewLog = (run) => run.logs.filter((line) => line.startsWith('final review on '))

test('the final review runs on Sonnet at high for a small run of haiku work with high reviews', async (t) => {
  const run = await runWorkflow(threeTasks(t))
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(reviewOf(run), ['sonnet high'])
  assert.equal(run.calls.find((c) => c.role === 'reviewer').label, 'final review on sonnet high')
  assert.deepEqual([run.result.finalReview.reviewModel, run.result.finalReview.reviewEffort], ['sonnet', 'high'])
  assert.deepEqual(reviewLog(run), ['final review on sonnet high: a small all-haiku run with high reviews'])
})

test('the final review runs on Opus at xhigh when a merged task is tier opus', async (t) => {
  const run = await runWorkflow(twoTasks(t, { tier: 'opus high — the parser design' }, {}))
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(reviewOf(run), ['opus xhigh'])
  assert.equal(run.calls.find((c) => c.role === 'reviewer').label, 'final review on opus xhigh')
  assert.deepEqual([run.result.finalReview.reviewModel, run.result.finalReview.reviewEffort], ['opus', 'xhigh'])
  assert.deepEqual(reviewLog(run), ['final review on opus xhigh: task-1 is tier opus'])
})

test('the final review runs on Opus at xhigh when a merged task reviews at xhigh or max', async (t) => {
  for (const [review, why] of [
    ['xhigh — input parsing the tests leave open', 'task-2 reviews at xhigh'],
    ['max — subtle invariants', 'task-2 reviews at max'],
  ]) {
    const run = await runWorkflow(twoTasks(t, {}, { review }))
    assert.equal(run.error, null, run.error && run.error.stack)
    assert.deepEqual(reviewOf(run), ['opus xhigh'])
    assert.deepEqual(reviewLog(run), [`final review on opus xhigh: ${why}`])
  }
})

test('the final review runs on Opus at high for more than three units, or for sonnet work', async (t) => {
  const four = await runWorkflow(compile(makeRepo(t), plan([task(1), task(2), task(3), task(4)])))
  assert.equal(four.error, null, four.error && four.error.stack)
  assert.deepEqual(reviewOf(four), ['opus high'])
  assert.deepEqual(reviewLog(four), ['final review on opus high: the merged work is not a small all-haiku run'])

  const sonnet = await runWorkflow(twoTasks(t, { tier: 'sonnet high — wiring the tests pin down' }, {}))
  assert.equal(sonnet.error, null, sonnet.error && sonnet.error.stack)
  assert.deepEqual(reviewOf(sonnet), ['opus high'])
})

test('the final review judges only the merged units: a blocked opus task does not raise it', async (t) => {
  const run = await runWorkflow(twoTasks(t, { tier: 'opus high — the parser design' }, {}), {
    supervisor: (call, approve) =>
      call.unit === 'task-1' ? { verdict: 'block', findings: [], ruling: 'Block: needs a design first.', guidance: '', question: '' } : approve(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.units[0].status, 'blocked')
  assert.equal(run.result.units[1].status, 'merged')
  assert.deepEqual(reviewOf(run), ['sonnet high'])
})
