'use strict'

// The external calls of the swarm with superdelegation on: what a call does once `aether-lane pick` gave it a
// pair (start, wait, result, stop, and the native agent that takes it over). What pick decides, the wait for a
// place and `took` are in workflow-superdelegation.test.js.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf, HARNESS_OF } = require('./workflow-harness.js')

const LANES = { superdelegation: true, harnesses: ['agy'], waits: { implementer: 3, supervisor: 2, reviewer: 2 } }
const FAMILY = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }

// A pair of the table as pick prints it (points and costs are stand-ins: no test here reads them).
const pairOf = (harness, model, effort) => ({ id: `${harness}/${model}@${effort}`, harness, model, family: model, effort, group: null, intelligence: 40, costPerTaskUsd: 1 })
const FLASH = pairOf('agy', 'gemini-3.8-flash', 'high')
const SONNET = pairOf('agy', 'claude-sonnet-5-5', 'high')
const OPUS = pairOf('agy', 'claude-opus-5-5', 'high')
const CODEX = pairOf('codex', 'gpt-5.5-codex', 'high')
const PAIRS = { implementer: [FLASH], supervisor: [SONNET], reviewer: [SONNET] }

// A lane handler: a pick gives the first pair of its role's list that the call does not exclude, or none, with
// the native pair of its flags; `more(call, fallback)` answers every other aether-lane command.
function onPairs(more = (call, fallback) => fallback(call), pairs = PAIRS) {
  return (call, fallback) => {
    if (call.command.verb !== 'pick') return more(call, fallback)
    const f = call.lane
    const excluded = f.exclude ? f.exclude.split(',') : []
    const picked = (pairs[f.role] || []).find((pair) => !excluded.includes(pair.id)) || null
    const native = { id: `claude/${f.model}@${f.effort}`, model: f.model, effort: f.effort, family: FAMILY[f.model], intelligence: 40 }
    return { call: f.call, role: f.role, requested: 40, reference: native, picked, native, reason: picked ? `took ${picked.id}` : 'native: test', candidates: [] }
  }
}

function lanesRun(t, tasks = [task(1)], lanes = LANES) {
  return { ...compile(makeRepo(t), plan(tasks)), lanes }
}

const ok = (run) => assert.equal(run.error, null, run.error && run.error.stack)
const kinds = (run) => run.calls.map((c) => c.kind)
const starts = (run, role) => run.calls.filter((c) => c.kind === 'ops:lane-start' && (!role || c.lane.role === role))
const native = (run, role) => run.calls.filter((c) => c.role === role)
const tookOf = (run, id) => run.calls.filter((c) => c.kind === 'ops:lane-took' && c.lane.call === id).map((c) => [c.lane.by, c.lane.cause])
const isCall = (call, verb, id) => call.command.verb === verb && call.lane.call === id
const finished = (call, fields) => laneAnswer({ lane: laneOf(call.started), ...fields })
const retry = {
  verdict: 'retry',
  findings: [{ severity: 'important', title: 'gap', file: 'src/t1/a.js:1', evidence: 'x' }],
  ruling: 'Retry: gap.',
  guidance: 'fix the gap',
  question: '',
}

test('without lanes the run never calls aether-lane, and its rounds are native', async (t) => {
  for (const lanes of [null, undefined]) {
    const args = lanesRun(t, [task(1)], lanes)
    if (lanes === undefined) delete args.lanes
    const run = await runWorkflow(args)
    ok(run)
    assert.equal(run.calls.some((c) => c.command && c.command.tool === 'aether-lane'), false)
    assert.equal(run.result.lanes, null)
    assert.deepEqual(run.result.units[0].rounds.map((r) => [r.provider, r.reviewProvider, r.laneFailure]), [['native', 'native', null]])
    assert.equal(run.result.finalReview.provider, 'native')
  }
})

test('lanes of the wrong shape, or of the shape before superdelegation, are refused before any agent starts', async (t) => {
  const bad = [
    { harness: 'agy', waits: LANES.waits, calls: { implementer: { haiku: { model: 'gemini-3.8-flash', group: 'gemini' } } } },
    { ...LANES, superdelegation: false },
    { ...LANES, harnesses: 'agy' },
    { ...LANES, harnesses: ['agy', ''] },
    { ...LANES, waits: { implementer: 3, supervisor: 2 } },
  ]
  for (const lanes of bad) {
    const run = await runWorkflow(lanesRun(t, [task(1)], lanes))
    assert.equal(run.error && run.error.message, 'aether:run args: lanes is invalid', JSON.stringify(lanes))
    assert.equal(run.calls.length, 0)
  }
})

test('with a pair for every call, the implementer, the supervisor and the final reviewer all run on lanes', async (t) => {
  const args = lanesRun(t)
  const run = await runWorkflow(args, { lane: onPairs() })
  ok(run)
  assert.deepEqual(kinds(run), [
    'ops:lane-pick',
    'ops:lane-start',
    'ops:lane-wait',
    'ops:lane-took',
    'ops:lane-pick',
    'ops:lane-start',
    'ops:lane-wait',
    'ops:lane-took',
    'ops:merge',
    'ops:remove',
    'ops:diff',
    'ops:lane-pick',
    'ops:lane-start',
    'ops:lane-wait',
    'ops:lane-took',
    'ops:sweep',
  ])
  assert.equal(run.calls[0].label, 'task-1: implement on haiku xhigh (attempt 1): pick')
  const [implement, supervise, review] = starts(run)
  const { digest, ...flags } = implement.lane
  assert.deepEqual(flags, { run: args.runId, call: 'task-1-1-implement', role: 'implementer', task: 'task-1', model: 'gemini-3.8-flash', effort: 'high' })
  assert.match(digest, /^[0-9a-f]{8}:\d+$/)
  assert.deepEqual([implement.digestOk, supervise.digestOk, review.digestOk], [true, true, true])
  assert.equal(implement.label, 'task-1: implement via agy gemini-3.8-flash on haiku xhigh (attempt 1): start')
  // The window shows the call as its Haiku ops agent (issue 032): the label names the harness
  // and model up front, and the progress log says who ran and what it spent.
  assert.ok(run.logs.some((line) => /ran on agy gemini-3\.8-flash-high · 1200 tok/.test(line)), run.logs.join('\n'))
  assert.match(implement.prompt, /^Run this command with the Bash tool, once, exactly as written, with the Bash tool's timeout set to 600000:\n\ncd '/)
  assert.equal(implement.payload.path, path.join(args.runDir, 'lanes', 'task-1-1-implement', 'prompt.md'))
  assert.match(implement.payload.text, /^You are implementing task-1: Task 1 title\.\n/)
  assert.ok(implement.payload.text.includes('\nBrief: .aether-tmp/brief.md\n'))
  assert.ok(implement.payload.text.includes('4. Commit your work in the worktree as you go: a commit after each part that passes, so an attempt cut off still leaves its work. Do not run aether-wt: the harness packages your diff and reads your head from git.'))
  assert.equal(implement.payload.text.includes('aether-wt ensure'), false)
  assert.equal(run.calls[2].label, 'task-1: implement via agy gemini-3.8-flash on haiku xhigh (attempt 1): wait 1')
  assert.deepEqual([supervise.lane.call, supervise.lane.role, supervise.lane.task, supervise.lane.model, supervise.lane.effort], [
    'task-1-1-supervise',
    'supervisor',
    'task-1',
    'claude-sonnet-5-5',
    'high',
  ])
  assert.equal(supervise.label, 'task-1: supervise via agy claude-sonnet-5-5 (attempt 1): start')
  assert.ok(supervise.payload.text.includes('\nReview package: .aether-tmp/package.diff\n'))
  assert.ok(supervise.payload.text.includes(`\nUnit worktree: the current directory, a disposable copy of branch aether/${args.runId}/task-1\n`))
  assert.deepEqual([review.lane.call, review.lane.role, review.lane.task, review.lane.model, review.lane.effort], [
    'final-review',
    'reviewer',
    undefined,
    'claude-sonnet-5-5',
    'high',
  ])
  assert.equal(review.label, 'final review via agy claude-sonnet-5-5: start')
  assert.ok(review.payload.text.includes('Review package: .aether-tmp/package.diff (base '))
  assert.equal(native(run, 'implementer').length + native(run, 'supervisor').length + native(run, 'reviewer').length, 0)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].reviewProvider, unit.rounds[0].reviewEffort, unit.rounds[0].laneFailure], [
    'agy gemini-3.8-flash-high',
    'agy claude-sonnet-5-5-high',
    'high',
    null,
  ])
  // The review carries the pair it ran on.
  assert.deepEqual([run.result.finalReview.status, run.result.finalReview.provider, run.result.finalReview.reviewModel, run.result.finalReview.reviewEffort], [
    'done',
    'agy claude-sonnet-5-5-high',
    'claude-sonnet-5-5',
    'high',
  ])
  assert.deepEqual(run.result.lanes, { calls: 3, ok: 3, failed: 0, quota: 0, violation: 0, blocked: 0, unavailable: 0 })
  assert.equal(run.result.agents.total, run.calls.length)
})

test('a start that finds no quota runs the same attempt native, as no pair is left', async (t) => {
  const run = await runWorkflow(lanesRun(t), { lane: onPairs((call, fallback) => (isCall(call, 'start', 'task-1-1-implement') ? { unavailable: 'quota' } : fallback(call))) })
  ok(run)
  assert.deepEqual(native(run, 'implementer').map((c) => [c.model, c.effort, c.label]), [['haiku', 'xhigh', 'task-1: implement on haiku xhigh (attempt 1)']])
  const unit = run.result.units[0]
  assert.equal(unit.attempts, 1)
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].laneFailure], ['native', null])
  assert.equal(run.result.lanes.unavailable, 1)
  assert.deepEqual(tookOf(run, 'task-1-1-implement'), [['native', 'failed']])
})

test('an attempt agy leaves for lack of quota goes on native, in the same attempt, told what happened', async (t) => {
  const args = lanesRun(t)
  const run = await runWorkflow(args, {
    lane: onPairs((call, fallback) => (isCall(call, 'wait', 'task-1-1-implement') ? finished(call, { status: 'quota', detail: 'exit 1: quota exhausted' }) : fallback(call))),
  })
  ok(run)
  const [attempt] = native(run, 'implementer')
  assert.equal(attempt.label, 'task-1: implement on haiku xhigh (attempt 1)')
  assert.ok(
    attempt.prompt.endsWith(
      '## An external agent began this attempt\nagy gemini-3.8-flash-high stopped before it finished: its quota ran out. Its uncommitted work, if any, is in the worktree. Continue from it.',
    ),
  )
  assert.ok(attempt.prompt.includes(`aether-wt ensure ${args.runId} task-1`))
  const unit = run.result.units[0]
  assert.equal(unit.attempts, 1)
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].laneFailure], ['native', { harness: 'agy', model: 'gemini-3.8-flash-high', reason: 'its quota ran out' }])
  assert.equal(run.calls.some((c) => c.kind === 'ops:lane-stop'), false)
  assert.equal(run.result.lanes.quota, 1)
  assert.deepEqual(tookOf(run, 'task-1-1-implement'), [['native', 'failed']])
})

test('a supervisor lane that fails hands the same review to the native supervisor', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) => (isCall(call, 'wait', 'task-1-1-supervise') ? finished(call, { status: 'failed', detail: 'exit 1: model not found' }) : fallback(call))),
  })
  ok(run)
  assert.deepEqual(native(run, 'supervisor').map((c) => [c.model, c.effort, c.label]), [['sonnet', 'high', 'task-1: supervise attempt 1 on sonnet high']])
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.equal(unit.attempts, 1)
  assert.equal(unit.rounds[0].reviewProvider, 'native')
  assert.equal(run.result.lanes.failed, 1)
})

test('a supervisor lane answer with an unknown verdict and findings that are a string counts as a retry, as a native answer does', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) =>
      isCall(call, 'wait', 'task-1-1-supervise')
        ? finished(call, { result: { verdict: 'approved', findings: 'see ruling', ruling: 'Looks right.', guidance: '', question: '' } })
        : fallback(call),
    ),
  })
  ok(run)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.deepEqual(unit.rounds.map((r) => r.verdict), ['retry', 'approve'])
  assert.deepEqual(unit.rounds[0].findings, [])
  assert.match(unit.rounds[0].ruling, /^Looks right\. The verdict was not one of approve, retry, escalate or block, so it counts as retry\.$/)
  assert.equal(starts(run, 'supervisor').length, 2)
})

test('changes outside Owns cost the attempt, and the next one, picked without that pair, is told to revert them', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) =>
      isCall(call, 'wait', 'task-1-1-implement') ? finished(call, { status: 'violation', detail: 'changes outside Owns', files: ['other/x.js', 'README.md'] }) : fallback(call),
    ),
  })
  ok(run)
  const unit = run.result.units[0]
  const summary = "The external agent changed files outside the task's Owns: other/x.js, README.md. Revert those changes."
  assert.equal(unit.attempts, 2)
  assert.deepEqual([unit.rounds[0].status, unit.rounds[0].summary, unit.rounds[0].provider, unit.rounds[0].reviewProvider], [
    'FAILED',
    summary,
    'agy gemini-3.8-flash-high',
    null,
  ])
  // The call ran on its pair, which took it; the next attempt's pick leaves that pair out, and no other is left.
  assert.deepEqual(tookOf(run, 'task-1-1-implement'), [['agy:gemini-3.8-flash', 'chosen']])
  assert.deepEqual(run.calls.filter((c) => c.kind === 'ops:lane-pick' && c.lane.role === 'implementer').map((c) => c.lane.exclude), [undefined, FLASH.id])
  assert.deepEqual(starts(run, 'supervisor').map((c) => c.lane.call), ['task-1-2-supervise'])
  const [second] = native(run, 'implementer')
  assert.equal(second.label, 'task-1: implement on haiku xhigh (attempt 2)')
  assert.ok(second.prompt.includes(summary))
  assert.equal(run.result.lanes.violation, 1)
  assert.deepEqual(unit.failures, ['no report'])
})

test('two changes outside Owns in a row block the unit: each counts as an attempt without a report', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs(
      (call, fallback) =>
        call.command.verb === 'wait' && call.lane.call.endsWith('-implement') ? finished(call, { status: 'violation', detail: 'changes outside Owns', files: ['other/x.js'] }) : fallback(call),
      { ...PAIRS, implementer: [FLASH, SONNET] },
    ),
  })
  ok(run)
  const unit = run.result.units[0]
  assert.deepEqual([unit.status, unit.reason], ['blocked', 'the unit ended twice without its report: it is probably too large for one attempt; split it into smaller tasks'])
  assert.equal(unit.attempts, 2)
  assert.deepEqual(unit.failures, ['no report', 'no report'])
  assert.deepEqual(starts(run, 'implementer').map((c) => c.lane.model), ['gemini-3.8-flash', 'claude-sonnet-5-5'])
  assert.equal(run.calls.some((c) => c.kind === 'ops:lane-start' && c.lane.role === 'supervisor'), false)
  assert.equal(run.result.lanes.violation, 2)
})

test('a lane that finds the integration worktree changed blocks the unit', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) =>
      isCall(call, 'wait', 'task-1-1-implement') ? finished(call, { status: 'blocked', detail: 'the integration worktree changed during the lane call' }) : fallback(call),
    ),
  })
  ok(run)
  const unit = run.result.units[0]
  assert.deepEqual([unit.status, unit.reason], ['blocked', 'lane: the integration worktree changed during the lane call'])
  assert.equal(starts(run, 'supervisor').length + native(run, 'supervisor').length, 0)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:remove').length, 1)
  assert.equal(run.result.finalReview.status, 'skipped')
  assert.equal(run.result.lanes.blocked, 1)
  assert.deepEqual(tookOf(run, 'task-1-1-implement'), [['agy:gemini-3.8-flash', 'chosen']])
})

test('a wait the ops agent fails or garbles is only waited again', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) => {
      if (isCall(call, 'wait', 'task-1-1-implement') && call.n === 1) return null
      if (isCall(call, 'wait', 'task-1-1-implement') && call.n === 2) return 'Command running in background with ID: b1'
      return fallback(call)
    }),
  })
  ok(run)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:lane-wait' && c.lane.call === 'task-1-1-implement').length, 3)
  assert.equal(run.calls.some((c) => c.kind === 'ops:lane-stop'), false)
  assert.equal(run.result.units[0].rounds[0].provider, 'agy gemini-3.8-flash-high')
})

test('when the waits run out, the lane call is stopped and the same attempt goes native', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) => (isCall(call, 'wait', 'task-1-1-implement') ? { done: false } : fallback(call))),
  })
  ok(run)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:lane-wait' && c.lane.call === 'task-1-1-implement').length, LANES.waits.implementer)
  const stops = run.calls.filter((c) => c.kind === 'ops:lane-stop')
  assert.deepEqual(stops.map((c) => [c.lane.call, c.label]), [['task-1-1-implement', 'task-1: implement via agy gemini-3.8-flash on haiku xhigh (attempt 1): stop']])
  assert.ok(run.calls.indexOf(stops[0]) < run.calls.indexOf(native(run, 'implementer')[0]))
  assert.deepEqual(run.result.units[0].rounds[0].laneFailure, { harness: 'agy', model: 'gemini-3.8-flash-high', reason: 'the wait cap ran out' })
  assert.equal(run.result.units[0].attempts, 1)
  assert.equal(run.result.lanes.failed, 1)
  assert.deepEqual(tookOf(run, 'task-1-1-implement'), [['native', 'failed']])
})

test('a result whose digest does not match is printed once more, then given up', async (t) => {
  const once = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) => (isCall(call, 'wait', 'task-1-1-implement') ? { ...fallback(call), digest: '00000000:0' } : fallback(call))),
  })
  ok(once)
  assert.deepEqual(once.calls.filter((c) => c.kind === 'ops:lane-result').map((c) => c.label), [
    'task-1: implement via agy gemini-3.8-flash on haiku xhigh (attempt 1): result',
  ])
  assert.equal(once.result.units[0].rounds[0].provider, 'agy gemini-3.8-flash-high')

  const twice = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) =>
      ['wait', 'result'].includes(call.command.verb) && call.lane.call === 'task-1-1-implement' ? { ...fallback(call), digest: '00000000:0' } : fallback(call),
    ),
  })
  ok(twice)
  assert.deepEqual(twice.calls.filter((c) => c.kind === 'ops:lane-stop').map((c) => c.lane.call), ['task-1-1-implement'])
  assert.deepEqual(twice.result.units[0].rounds[0].laneFailure, { harness: 'agy', model: 'gemini-3.8-flash-high', reason: 'the result digest did not match' })
})

test('a start the ops agent fails is stopped, and the same attempt goes native', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) => (isCall(call, 'start', 'task-1-1-implement') ? null : fallback(call))),
  })
  ok(run)
  assert.deepEqual(run.calls.filter((c) => c.kind === 'ops:lane-stop').map((c) => c.lane.call), ['task-1-1-implement'])
  assert.equal(native(run, 'implementer').length, 1)
  assert.deepEqual(run.result.units[0].rounds[0].laneFailure, { harness: 'agy', model: 'gemini-3.8-flash', reason: 'start failed: the ops agent failed' })
  assert.deepEqual([run.result.lanes.calls, run.result.lanes.failed], [2, 1])
})

test('a final review lane that fails goes native, and one that finds the integration rewound fails the review', async (t) => {
  const failed = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) => (isCall(call, 'wait', 'final-review') ? finished(call, { status: 'failed', detail: 'exit 1' }) : fallback(call))),
  })
  ok(failed)
  assert.deepEqual(native(failed, 'reviewer').map((c) => [c.model, c.effort, c.label]), [['sonnet', 'high', 'final review on sonnet high']])
  assert.deepEqual([failed.result.finalReview.status, failed.result.finalReview.provider], ['done', 'native'])
  assert.deepEqual(tookOf(failed, 'final-review'), [['native', 'failed']])

  const blocked = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) =>
      isCall(call, 'wait', 'final-review') ? finished(call, { status: 'blocked', detail: 'the integration branch was rewound or rewritten during the lane call' }) : fallback(call),
    ),
  })
  ok(blocked)
  assert.deepEqual(blocked.result.finalReview, {
    status: 'failed',
    reason: 'lane: the integration branch was rewound or rewritten during the lane call',
    reviewModel: 'claude-sonnet-5-5',
    reviewEffort: 'high',
  })
  assert.equal(native(blocked, 'reviewer').length, 0)
})

test('an escalation from a Gemini attempt picks the next attempt with the next rung as its reference, without the Gemini pair', async (t) => {
  const escalate = { ...retry, verdict: 'escalate', ruling: 'Escalate: too hard for haiku.' }
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs((call, fallback) => (isCall(call, 'wait', 'task-1-1-supervise') ? finished(call, { result: escalate }) : fallback(call)), {
      ...PAIRS,
      implementer: [FLASH, SONNET],
    }),
  })
  ok(run)
  const second = run.calls.filter((c) => c.kind === 'ops:lane-pick' && c.lane.role === 'implementer')[1]
  assert.deepEqual([second.lane.call, second.lane.model, second.lane.effort, second.lane.exclude], ['task-1-2-implement', 'sonnet', 'xhigh', FLASH.id])
  assert.deepEqual(starts(run, 'implementer').map((c) => [c.lane.call, c.lane.model, c.lane.effort]), [
    ['task-1-1-implement', 'gemini-3.8-flash', 'high'],
    ['task-1-2-implement', 'claude-sonnet-5-5', 'high'],
  ])
  assert.deepEqual(run.result.units[0].tiers, ['haiku xhigh', 'sonnet xhigh'])
})

// Two harnesses: agy runs the Gemini and Claude pairs, and codex runs GPT-5.5, the implementers' pair.
const TWO = { ...LANES, harnesses: ['agy', 'codex'] }
const TWO_PAIRS = { implementer: [CODEX], supervisor: [SONNET], reviewer: [OPUS] }
const SONNET_TASK = { tier: 'sonnet high — wiring the tests pin down' }

// A lane handler on TWO_PAIRS that counts the lane calls in flight per harness: a call is in flight from its
// start until its wait is done or its stop returns.
function watch() {
  const live = new Map()
  const most = { agy: 0, codex: 0 }
  const lane = onPairs((call, fallback) => {
    const answer = fallback(call)
    const id = call.lane.call
    if (call.command.verb === 'start' && answer.started === true) {
      const harness = HARNESS_OF[call.lane.model] || 'agy'
      live.set(id, harness)
      most[harness] = Math.max(most[harness], [...live.values()].filter((h) => h === harness).length)
    }
    if (call.command.verb === 'stop' || (call.command.verb === 'wait' && answer.done === true)) live.delete(id)
    return answer
  }, TWO_PAIRS)
  return { lane, most }
}

test('two harnesses: each call runs on the harness of its pair, and its provider and labels name that harness', async (t) => {
  const run = await runWorkflow(lanesRun(t, [task(1, SONNET_TASK), task(2, SONNET_TASK)], TWO), { lane: watch().lane })
  ok(run)
  assert.deepEqual(run.result.units.map((u) => u.rounds.map((r) => [r.provider, r.reviewProvider])), [
    [['codex gpt-5.5-codex-high', 'agy claude-sonnet-5-5-high']],
    [['codex gpt-5.5-codex-high', 'agy claude-sonnet-5-5-high']],
  ])
  assert.deepEqual([run.result.finalReview.status, run.result.finalReview.provider], ['done', 'agy claude-opus-5-5-high'])
  assert.deepEqual(starts(run, 'implementer').map((c) => c.lane.model), ['gpt-5.5-codex', 'gpt-5.5-codex'])
  assert.equal(starts(run, 'implementer')[0].label, 'task-1: implement via codex gpt-5.5-codex on sonnet high (attempt 1): start')
  assert.equal(native(run, 'implementer').length, 0)
  // The supervisor's --author is the family of the pair that implemented the attempt.
  assert.deepEqual(run.calls.filter((c) => c.kind === 'ops:lane-pick' && c.lane.role === 'supervisor').map((c) => c.lane.author), ['gpt-5.5-codex', 'gpt-5.5-codex'])
  assert.deepEqual(tookOf(run, 'task-1-1-implement'), [['codex:gpt-5.5-codex', 'chosen']])
})

test('a harness has no cap on calls in flight: two codex calls start together, and no call waits for a place', async (t) => {
  const watched = watch()
  const run = await runWorkflow(lanesRun(t, [task(1, SONNET_TASK), task(2, SONNET_TASK)], TWO), { lane: watched.lane })
  ok(run)
  assert.equal(watched.most.codex, 2)
  assert.equal(starts(run, 'implementer').length, 2)
  assert.equal(native(run, 'implementer').length, 0)
  assert.equal(run.calls.some((c) => c.kind === 'ops:lane-pause'), false)
  assert.deepEqual(run.result.units.map((u) => u.status), ['merged', 'merged'])
})

test('an attempt on codex that stops before it finishes names codex in its record and in the context it hands on', async (t) => {
  const run = await runWorkflow(lanesRun(t, [task(1, SONNET_TASK)], TWO), {
    lane: onPairs(
      (call, fallback) => (call.command.verb === 'wait' && call.lane.call === 'task-1-1-implement' ? finished(call, { status: 'failed', detail: 'exit 1: model not found' }) : fallback(call)),
      TWO_PAIRS,
    ),
  })
  ok(run)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.deepEqual(unit.rounds[0].laneFailure, { harness: 'codex', model: 'gpt-5.5-codex-high', reason: 'exit 1: model not found' })
  assert.equal(run.calls.find((c) => c.kind === 'ops:lane-wait' && c.lane.call === 'task-1-1-implement').label, 'task-1: implement via codex gpt-5.5-codex on sonnet high (attempt 1): wait 1')
  const [attempt] = native(run, 'implementer')
  assert.ok(
    attempt.prompt.endsWith(
      '## An external agent began this attempt\ncodex gpt-5.5-codex-high stopped before it finished: exit 1: model not found. Its uncommitted work, if any, is in the worktree. Continue from it.',
    ),
  )
})
