'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf } = require('./workflow-harness.js')

const LANES = {
  harness: 'agy',
  maxParallel: 4,
  waits: { implementer: 3, supervisor: 2, reviewer: 2 },
  calls: {
    implementer: {
      haiku: { model: 'gemini-3.8-flash', group: 'gemini' },
      sonnet: { model: 'claude-sonnet-5-5', group: 'claude' },
      opus: { model: 'claude-opus-5-5', group: 'claude' },
    },
    supervisor: { sonnet: { model: 'claude-sonnet-5-5', group: 'claude' } },
    reviewer: { opus: { model: 'claude-opus-5-5', group: 'claude' } },
  },
}

function lanesRun(t, tasks = [task(1)], lanes = LANES) {
  return { ...compile(makeRepo(t), plan(tasks)), lanes }
}

const ok = (run) => assert.equal(run.error, null, run.error && run.error.stack)
const kinds = (run) => run.calls.map((c) => c.kind)
const starts = (run, role) => run.calls.filter((c) => c.kind === 'ops:lane-start' && (!role || c.lane.role === role))
const native = (run, role) => run.calls.filter((c) => c.role === role)
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

test('lanes of the wrong shape are refused before any agent starts', async (t) => {
  const bad = [{ harness: 'agy' }, { ...LANES, maxParallel: 0 }, { ...LANES, calls: { implementer: { gpt: { model: 'x', group: 'y' } } } }, { ...LANES, calls: { ops: {} } }]
  for (const lanes of bad) {
    const run = await runWorkflow(lanesRun(t, [task(1)], lanes))
    assert.equal(run.error && run.error.message, 'aether:run args: lanes is invalid')
    assert.equal(run.calls.length, 0)
  }
})

test('with every group usable, the implementer, the supervisor and the final reviewer all run on lanes', async (t) => {
  const args = lanesRun(t)
  const run = await runWorkflow(args)
  ok(run)
  assert.deepEqual(kinds(run), [
    'ops:lane-status',
    'ops:lane-start',
    'ops:lane-wait',
    'ops:lane-start',
    'ops:lane-wait',
    'ops:merge',
    'ops:remove',
    'ops:diff',
    'ops:lane-start',
    'ops:lane-wait',
    'ops:sweep',
  ])
  assert.equal(run.calls[0].label, 'wave 1: lane quota')
  const [implement, supervise, review] = starts(run)
  const { digest, ...flags } = implement.lane
  assert.deepEqual(flags, { run: args.runId, call: 'task-1-1-implement', role: 'implementer', task: 'task-1', model: 'gemini-3.8-flash', effort: 'xhigh' })
  assert.match(digest, /^[0-9a-f]{8}:\d+$/)
  assert.deepEqual([implement.digestOk, supervise.digestOk, review.digestOk], [true, true, true])
  assert.equal(implement.label, 'task-1: implement on haiku xhigh via agy gemini-3.8-flash (attempt 1): start')
  assert.match(implement.prompt, /^Run this command with the Bash tool, once, exactly as written, with the Bash tool's timeout set to 600000:\n\ncd '/)
  assert.equal(implement.payload.path, path.join(args.runDir, 'lanes', 'task-1-1-implement', 'prompt.md'))
  assert.match(implement.payload.text, /^You are implementing task-1: Task 1 title\.\n/)
  assert.ok(implement.payload.text.includes('\nBrief: .aether-tmp/brief.md\n'))
  assert.ok(implement.payload.text.includes('4. Commit your work in the worktree. Do not run aether-wt: the harness packages your diff and reads your head from git.'))
  assert.equal(implement.payload.text.includes('aether-wt ensure'), false)
  assert.equal(run.calls[2].label, 'task-1: implement on haiku xhigh via agy gemini-3.8-flash (attempt 1): wait 1')
  assert.deepEqual([supervise.lane.call, supervise.lane.role, supervise.lane.task, supervise.lane.model, supervise.lane.effort], [
    'task-1-1-supervise',
    'supervisor',
    'task-1',
    'claude-sonnet-5-5',
    'high',
  ])
  assert.equal(supervise.label, 'task-1: supervise attempt 1 via agy claude-sonnet-5-5: start')
  assert.ok(supervise.payload.text.includes('\nReview package: .aether-tmp/package.diff\n'))
  assert.ok(supervise.payload.text.includes(`\nUnit worktree: the current directory, a disposable copy of branch aether/${args.runId}/task-1\n`))
  assert.deepEqual([review.lane.call, review.lane.role, review.lane.task, review.lane.model, review.lane.effort], [
    'final-review',
    'reviewer',
    undefined,
    'claude-opus-5-5',
    'high',
  ])
  assert.equal(review.label, 'final review via agy claude-opus-5-5: start')
  assert.ok(review.payload.text.includes('Review package: .aether-tmp/package.diff (base '))
  assert.equal(native(run, 'implementer').length + native(run, 'supervisor').length + native(run, 'reviewer').length, 0)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].reviewProvider, unit.rounds[0].laneFailure], [
    'agy gemini-3.8-flash-high',
    'agy claude-sonnet-5-5-high',
    null,
  ])
  assert.deepEqual([run.result.finalReview.status, run.result.finalReview.provider], ['done', 'agy claude-opus-5-5-high'])
  assert.deepEqual(run.result.lanes, { calls: 3, ok: 3, failed: 0, quota: 0, violation: 0, blocked: 0, unavailable: 0, overflow: 0, dry: [{ wave: 1, groups: [] }] })
  assert.equal(run.result.agents.total, run.calls.length)
})

test("a group the wave's reading finds unusable sends its calls native for that wave", async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) =>
      call.command.verb === 'status' ? { harnesses: { agy: { installed: true, groups: { gemini: { usable: false }, claude: { usable: true } } } } } : fallback(call),
  })
  ok(run)
  assert.deepEqual(native(run, 'implementer').map((c) => [c.model, c.effort]), [['haiku', 'xhigh']])
  assert.equal(starts(run, 'implementer').length, 0)
  assert.equal(starts(run, 'supervisor').length, 1)
  assert.deepEqual(run.result.lanes.dry, [{ wave: 1, groups: ['gemini'] }])
  assert.equal(run.result.units[0].rounds[0].provider, 'native')
})

test('a failed quota reading leaves every group dry for that wave', async (t) => {
  const run = await runWorkflow(lanesRun(t), { lane: (call, fallback) => (call.command.verb === 'status' ? null : fallback(call)) })
  ok(run)
  assert.equal(starts(run).length, 0)
  assert.deepEqual(run.result.lanes.dry, [{ wave: 1, groups: ['claude', 'gemini'] }])
  assert.deepEqual([run.result.finalReview.status, run.result.finalReview.provider], ['done', 'native'])
})

test('a start that finds no quota runs the same attempt native, and leaves the group dry until the next wave', async (t) => {
  const run = await runWorkflow(lanesRun(t, [task(1), task(2, { depends: 'Task 1 — uses it' })]), {
    lane: (call, fallback) => {
      if (isCall(call, 'start', 'task-1-1-implement')) return { unavailable: 'quota' }
      if (isCall(call, 'wait', 'task-1-1-supervise')) return finished(call, { result: retry })
      return fallback(call)
    },
  })
  ok(run)
  assert.deepEqual(native(run, 'implementer').filter((c) => c.unit === 'task-1').map((c) => c.label), [
    'task-1: implement on haiku xhigh (attempt 1)',
    'task-1: implement on haiku xhigh (attempt 2)',
  ])
  assert.deepEqual(starts(run, 'implementer').map((c) => c.lane.call), ['task-1-1-implement', 'task-2-1-implement'])
  assert.equal(run.calls.filter((c) => c.kind === 'ops:lane-status').length, 2)
  const unit = run.result.units.find((u) => u.id === 'task-1')
  assert.equal(unit.attempts, 2)
  assert.deepEqual(unit.rounds.map((r) => [r.provider, r.laneFailure]), [
    ['native', null],
    ['native', null],
  ])
  assert.equal(run.result.lanes.unavailable, 1)
})

test('an attempt agy leaves for lack of quota goes on native, in the same attempt, told what happened', async (t) => {
  const args = lanesRun(t)
  const run = await runWorkflow(args, {
    lane: (call, fallback) => (isCall(call, 'wait', 'task-1-1-implement') ? finished(call, { status: 'quota', detail: 'exit 1: quota exhausted' }) : fallback(call)),
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
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].laneFailure], ['native', { model: 'gemini-3.8-flash-high', reason: 'its quota ran out' }])
  assert.equal(run.calls.some((c) => c.kind === 'ops:lane-stop'), false)
  assert.equal(run.result.lanes.quota, 1)
})

test('a supervisor lane that fails hands the same review to the native supervisor', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) => (isCall(call, 'wait', 'task-1-1-supervise') ? finished(call, { status: 'failed', detail: 'exit 1: model not found' }) : fallback(call)),
  })
  ok(run)
  assert.deepEqual(native(run, 'supervisor').map((c) => [c.model, c.effort, c.label]), [['sonnet', 'high', 'task-1: supervise attempt 1 on sonnet high']])
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.equal(unit.attempts, 1)
  assert.equal(unit.rounds[0].reviewProvider, 'native')
  assert.equal(run.result.lanes.failed, 1)
})

test('changes outside Owns cost the attempt, and the next one is told to revert them', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) =>
      isCall(call, 'wait', 'task-1-1-implement') ? finished(call, { status: 'violation', detail: 'changes outside Owns', files: ['other/x.js', 'README.md'] }) : fallback(call),
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
  assert.deepEqual(starts(run, 'supervisor').map((c) => c.lane.call), ['task-1-2-supervise'])
  const second = starts(run, 'implementer')[1]
  assert.equal(second.lane.call, 'task-1-2-implement')
  assert.ok(second.payload.text.includes(summary))
  assert.equal(run.result.lanes.violation, 1)
})

test('a lane that finds the integration worktree changed blocks the unit', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) =>
      isCall(call, 'wait', 'task-1-1-implement') ? finished(call, { status: 'blocked', detail: 'the integration worktree changed during the lane call' }) : fallback(call),
  })
  ok(run)
  const unit = run.result.units[0]
  assert.deepEqual([unit.status, unit.reason], ['blocked', 'lane: the integration worktree changed during the lane call'])
  assert.equal(starts(run, 'supervisor').length + native(run, 'supervisor').length, 0)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:remove').length, 1)
  assert.equal(run.result.finalReview.status, 'skipped')
  assert.equal(run.result.lanes.blocked, 1)
})

test('a wait the ops agent fails or garbles is only waited again', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) => {
      if (isCall(call, 'wait', 'task-1-1-implement') && call.n === 1) return null
      if (isCall(call, 'wait', 'task-1-1-implement') && call.n === 2) return 'Command running in background with ID: b1'
      return fallback(call)
    },
  })
  ok(run)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:lane-wait' && c.lane.call === 'task-1-1-implement').length, 3)
  assert.equal(run.calls.some((c) => c.kind === 'ops:lane-stop'), false)
  assert.equal(run.result.units[0].rounds[0].provider, 'agy gemini-3.8-flash-high')
})

test('when the waits run out, the lane call is stopped and the same attempt goes native', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) => (isCall(call, 'wait', 'task-1-1-implement') ? { done: false } : fallback(call)),
  })
  ok(run)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:lane-wait' && c.lane.call === 'task-1-1-implement').length, LANES.waits.implementer)
  const stops = run.calls.filter((c) => c.kind === 'ops:lane-stop')
  assert.deepEqual(stops.map((c) => [c.lane.call, c.label]), [['task-1-1-implement', 'task-1: implement on haiku xhigh via agy gemini-3.8-flash (attempt 1): stop']])
  assert.ok(run.calls.indexOf(stops[0]) < run.calls.indexOf(native(run, 'implementer')[0]))
  assert.deepEqual(run.result.units[0].rounds[0].laneFailure, { model: 'gemini-3.8-flash-high', reason: 'the wait cap ran out' })
  assert.equal(run.result.units[0].attempts, 1)
  assert.equal(run.result.lanes.failed, 1)
})

test('a result whose digest does not match is printed once more, then given up', async (t) => {
  const once = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) => (isCall(call, 'wait', 'task-1-1-implement') ? { ...fallback(call), digest: '00000000:0' } : fallback(call)),
  })
  ok(once)
  assert.deepEqual(once.calls.filter((c) => c.kind === 'ops:lane-result').map((c) => c.label), [
    'task-1: implement on haiku xhigh via agy gemini-3.8-flash (attempt 1): result',
  ])
  assert.equal(once.result.units[0].rounds[0].provider, 'agy gemini-3.8-flash-high')

  const twice = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) =>
      ['wait', 'result'].includes(call.command.verb) && call.lane.call === 'task-1-1-implement' ? { ...fallback(call), digest: '00000000:0' } : fallback(call),
  })
  ok(twice)
  assert.deepEqual(twice.calls.filter((c) => c.kind === 'ops:lane-stop').map((c) => c.lane.call), ['task-1-1-implement'])
  assert.deepEqual(twice.result.units[0].rounds[0].laneFailure, { model: 'gemini-3.8-flash-high', reason: 'the result digest did not match' })
})

test('a start the ops agent fails is stopped, and the same attempt goes native', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) => (isCall(call, 'start', 'task-1-1-implement') ? null : fallback(call)),
  })
  ok(run)
  assert.deepEqual(run.calls.filter((c) => c.kind === 'ops:lane-stop').map((c) => c.lane.call), ['task-1-1-implement'])
  assert.equal(native(run, 'implementer').length, 1)
  assert.deepEqual(run.result.units[0].rounds[0].laneFailure, { model: 'gemini-3.8-flash', reason: 'start failed: the ops agent failed' })
  assert.deepEqual([run.result.lanes.calls, run.result.lanes.failed], [2, 1])
})

test('calls at max effort stay native', async (t) => {
  const run = await runWorkflow(lanesRun(t, [task(1, { tier: 'haiku max — the deepest reasoning', review: 'max — subtle invariants' })]))
  ok(run)
  assert.equal(starts(run, 'implementer').length + starts(run, 'supervisor').length, 0)
  assert.deepEqual(native(run, 'implementer').map((c) => c.effort), ['max'])
  assert.deepEqual(native(run, 'supervisor').map((c) => c.effort), ['max'])
  assert.equal(starts(run, 'reviewer').length, 1)
})

test('a call that finds maxParallel lane calls in flight runs native, and is counted as overflow', async (t) => {
  const run = await runWorkflow(lanesRun(t, [task(1), task(2)], { ...LANES, maxParallel: 1 }))
  ok(run)
  assert.equal(starts(run, 'implementer').length, 1)
  assert.equal(native(run, 'implementer').length, 1)
  assert.ok(run.result.lanes.overflow >= 1)
  assert.deepEqual(run.result.units.map((u) => u.status), ['merged', 'merged'])
})

test('a final review lane that fails goes native, and one that finds the integration rewound fails the review', async (t) => {
  const failed = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) => (isCall(call, 'wait', 'final-review') ? finished(call, { status: 'failed', detail: 'exit 1' }) : fallback(call)),
  })
  ok(failed)
  assert.deepEqual(native(failed, 'reviewer').map((c) => [c.model, c.effort]), [['opus', 'high']])
  assert.deepEqual([failed.result.finalReview.status, failed.result.finalReview.provider], ['done', 'native'])

  const blocked = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) =>
      isCall(call, 'wait', 'final-review') ? finished(call, { status: 'blocked', detail: 'the integration branch was rewound or rewritten during the lane call' }) : fallback(call),
  })
  ok(blocked)
  assert.deepEqual(blocked.result.finalReview, { status: 'failed', reason: 'lane: the integration branch was rewound or rewritten during the lane call' })
  assert.equal(native(blocked, 'reviewer').length, 0)
})

test("an escalation from a Gemini attempt runs the next attempt on agy's Sonnet at xhigh", async (t) => {
  const escalate = { ...retry, verdict: 'escalate', ruling: 'Escalate: too hard for haiku.' }
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) => (isCall(call, 'wait', 'task-1-1-supervise') ? finished(call, { result: escalate }) : fallback(call)),
  })
  ok(run)
  const second = starts(run, 'implementer')[1]
  assert.deepEqual([second.lane.call, second.lane.model, second.lane.effort], ['task-1-2-implement', 'claude-sonnet-5-5', 'xhigh'])
  assert.deepEqual(run.result.units[0].tiers, ['haiku xhigh', 'sonnet xhigh'])
})

test('a lane call holds its place under maxParallel until its stop settles', async (t) => {
  const ticks = async (n) => {
    for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve))
  }
  // Lane calls from their start until their result is done or their stop returns.
  const live = new Set()
  let most = 0
  const run = await runWorkflow(lanesRun(t, [task(1), task(2)], { ...LANES, maxParallel: 1 }), {
    // task-2's native attempt ends while task-1's lane call is being stopped.
    implementer: async (call, done) => {
      await ticks(20)
      return done(call)
    },
    lane: async (call, fallback) => {
      if (call.command.verb === 'start') {
        live.add(call.lane.call)
        most = Math.max(most, live.size)
      }
      if (isCall(call, 'wait', 'task-1-1-implement')) return { done: false }
      if (call.command.verb === 'stop') await ticks(100)
      const answer = fallback(call)
      if (call.command.verb === 'stop' || answer.done) live.delete(call.lane.call)
      return answer
    },
  })
  ok(run)
  assert.equal(most, 1)
  assert.deepEqual(native(run, 'supervisor').map((c) => c.unit), ['task-2'])
  assert.deepEqual(run.result.units.map((u) => u.status), ['merged', 'merged'])
})
