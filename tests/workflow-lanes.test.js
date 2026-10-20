'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf, HARNESS_OF } = require('./workflow-harness.js')

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
    reviewer: { sonnet: { model: 'claude-sonnet-5-5', group: 'claude' }, opus: { model: 'claude-opus-5-5', group: 'claude' } },
  },
}

function lanesRun(t, tasks = [task(1)], lanes = LANES) {
  return { ...compile(makeRepo(t), plan(tasks)), lanes }
}

const ok = (run) => assert.equal(run.error, null, run.error && run.error.stack)
// The ops commands in order, without the lane choices the workflow logs after each decision (see workflow-order.test.js).
const kinds = (run) => run.calls.map((c) => c.kind).filter((kind) => kind !== 'ops:lane-choice')
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
  // A one-unit run of haiku work with a high review: the final review is Sonnet at high.
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
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].reviewProvider, unit.rounds[0].laneFailure], [
    'agy gemini-3.8-flash-high',
    'agy claude-sonnet-5-5-high',
    null,
  ])
  assert.deepEqual([run.result.finalReview.status, run.result.finalReview.provider], ['done', 'agy claude-sonnet-5-5-high'])
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

test('a failed quota reading leaves every group with no reading: the calls still try their lanes, and start decides', async (t) => {
  const run = await runWorkflow(lanesRun(t), { lane: (call, fallback) => (call.command.verb === 'status' ? null : fallback(call)) })
  ok(run)
  assert.equal(starts(run).length, 3)
  assert.deepEqual(run.result.lanes.dry, [{ wave: 1, groups: [] }])
  assert.deepEqual([run.result.finalReview.status, run.result.finalReview.provider], ['done', 'agy claude-sonnet-5-5-high'])
  // And when start finds no quota, each call goes native, as it did when the reading failed before.
  const dry = await runWorkflow(lanesRun(t), { lane: (call, fallback) => (call.command.verb === 'status' ? null : call.command.verb === 'start' ? { unavailable: 'quota' } : fallback(call)) })
  ok(dry)
  assert.equal(starts(dry).length, 2, "the final review finds the Claude group dry already")
  assert.deepEqual([dry.result.lanes.unavailable, dry.result.lanes.calls], [2, 0])
  assert.deepEqual([dry.result.finalReview.status, dry.result.finalReview.provider], ['done', 'native'])
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
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].laneFailure], ['native', { harness: 'agy', model: 'gemini-3.8-flash-high', reason: 'its quota ran out' }])
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

test('a supervisor lane answer with an unknown verdict and findings that are a string counts as a retry, as a native answer does', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) =>
      isCall(call, 'wait', 'task-1-1-supervise')
        ? finished(call, { result: { verdict: 'approved', findings: 'see ruling', ruling: 'Looks right.', guidance: '', question: '' } })
        : fallback(call),
  })
  ok(run)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.deepEqual(unit.rounds.map((r) => r.verdict), ['retry', 'approve'])
  assert.deepEqual(unit.rounds[0].findings, [])
  assert.match(unit.rounds[0].ruling, /^Looks right\. The verdict was not one of approve, retry, escalate or block, so it counts as retry\.$/)
  assert.equal(starts(run, 'supervisor').length, 2)
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
  assert.deepEqual(unit.failures, ['no report'])
})

test('two changes outside Owns in a row block the unit: each counts as an attempt without a report', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) =>
      call.command.verb === 'wait' && call.lane.call.endsWith('-implement')
        ? finished(call, { status: 'violation', detail: 'changes outside Owns', files: ['other/x.js'] })
        : fallback(call),
  })
  ok(run)
  const unit = run.result.units[0]
  assert.deepEqual([unit.status, unit.reason], ['blocked', 'the unit ended twice without its report: it is probably too large for one attempt; split it into smaller tasks'])
  assert.equal(unit.attempts, 2)
  assert.deepEqual(unit.failures, ['no report', 'no report'])
  assert.equal(run.calls.some((c) => c.kind === 'ops:lane-start' && c.lane.role === 'supervisor'), false)
  assert.equal(run.result.lanes.violation, 2)
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
  assert.deepEqual(stops.map((c) => [c.lane.call, c.label]), [['task-1-1-implement', 'task-1: implement via agy gemini-3.8-flash on haiku xhigh (attempt 1): stop']])
  assert.ok(run.calls.indexOf(stops[0]) < run.calls.indexOf(native(run, 'implementer')[0]))
  assert.deepEqual(run.result.units[0].rounds[0].laneFailure, { harness: 'agy', model: 'gemini-3.8-flash-high', reason: 'the wait cap ran out' })
  assert.equal(run.result.units[0].attempts, 1)
  assert.equal(run.result.lanes.failed, 1)
})

test('a result whose digest does not match is printed once more, then given up', async (t) => {
  const once = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) => (isCall(call, 'wait', 'task-1-1-implement') ? { ...fallback(call), digest: '00000000:0' } : fallback(call)),
  })
  ok(once)
  assert.deepEqual(once.calls.filter((c) => c.kind === 'ops:lane-result').map((c) => c.label), [
    'task-1: implement via agy gemini-3.8-flash on haiku xhigh (attempt 1): result',
  ])
  assert.equal(once.result.units[0].rounds[0].provider, 'agy gemini-3.8-flash-high')

  const twice = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) =>
      ['wait', 'result'].includes(call.command.verb) && call.lane.call === 'task-1-1-implement' ? { ...fallback(call), digest: '00000000:0' } : fallback(call),
  })
  ok(twice)
  assert.deepEqual(twice.calls.filter((c) => c.kind === 'ops:lane-stop').map((c) => c.lane.call), ['task-1-1-implement'])
  assert.deepEqual(twice.result.units[0].rounds[0].laneFailure, { harness: 'agy', model: 'gemini-3.8-flash-high', reason: 'the result digest did not match' })
})

test('a start the ops agent fails is stopped, and the same attempt goes native', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) => (isCall(call, 'start', 'task-1-1-implement') ? null : fallback(call)),
  })
  ok(run)
  assert.deepEqual(run.calls.filter((c) => c.kind === 'ops:lane-stop').map((c) => c.lane.call), ['task-1-1-implement'])
  assert.equal(native(run, 'implementer').length, 1)
  assert.deepEqual(run.result.units[0].rounds[0].laneFailure, { harness: 'agy', model: 'gemini-3.8-flash', reason: 'start failed: the ops agent failed' })
  assert.deepEqual([run.result.lanes.calls, run.result.lanes.failed], [2, 1])
})

test('calls at max effort stay native', async (t) => {
  const run = await runWorkflow(lanesRun(t, [task(1, { tier: 'haiku max — the deepest reasoning', review: 'max — subtle invariants' })]))
  ok(run)
  assert.equal(starts(run, 'implementer').length + starts(run, 'supervisor').length, 0)
  assert.deepEqual(native(run, 'implementer').map((c) => c.effort), ['max'])
  assert.deepEqual(native(run, 'supervisor').map((c) => c.effort), ['max'])
  // A max review makes the final review Opus at xhigh, which has a lane.
  assert.deepEqual(starts(run, 'reviewer').map((c) => [c.lane.model, c.lane.effort]), [['claude-opus-5-5', 'xhigh']])
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
  assert.deepEqual(native(failed, 'reviewer').map((c) => [c.model, c.effort]), [['sonnet', 'high']])
  assert.deepEqual([failed.result.finalReview.status, failed.result.finalReview.provider], ['done', 'native'])

  const blocked = await runWorkflow(lanesRun(t), {
    lane: (call, fallback) =>
      isCall(call, 'wait', 'final-review') ? finished(call, { status: 'blocked', detail: 'the integration branch was rewound or rewritten during the lane call' }) : fallback(call),
  })
  ok(blocked)
  assert.deepEqual(blocked.result.finalReview, {
    status: 'failed',
    reason: 'lane: the integration branch was rewound or rewritten during the lane call',
    reviewModel: 'sonnet',
    reviewEffort: 'high',
  })
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

// Every call of a lanes block on one harness (null leaves the field out).
const onHarness = (calls, harness) =>
  Object.fromEntries(Object.entries(calls).map(([role, byModel]) => [role, Object.fromEntries(Object.entries(byModel).map(([model, lane]) => [model, { ...lane, harness }]))]))

// Two harnesses: agy runs the Gemini and Claude models, and codex runs GPT-5.5, which the sonnet tier's implementer uses.
const TWO = {
  ...LANES,
  harnesses: ['agy', 'codex'],
  maxParallelByHarness: { codex: 1 },
  calls: {
    ...LANES.calls,
    implementer: {
      haiku: LANES.calls.implementer.haiku,
      sonnet: { model: 'gpt-5.5-codex', group: 'openai', harness: 'codex' },
      opus: LANES.calls.implementer.opus,
    },
  },
}
const SONNET = { tier: 'sonnet high — wiring the tests pin down' }

// An aether-lane status reading with agy's groups usable; `more` adds the other harnesses' readings.
const reading = (more = {}) => ({
  harnesses: { agy: { installed: true, version: '1.3.2', groups: { gemini: { usable: true }, claude: { usable: true } } }, ...more },
})
const TWO_STATUS = reading({ codex: { installed: true, groups: { openai: { usable: true } } } })

// A lane override that answers the status with `status`, and counts the lane calls in flight per harness:
// a call is in flight from its start until its wait is done or its stop returns.
function watch(status) {
  const live = new Map()
  const most = { agy: 0, codex: 0 }
  const lane = (call, fallback) => {
    if (call.command.verb === 'status') return status
    const answer = fallback(call)
    const id = call.lane.call
    if (call.command.verb === 'start' && answer.started === true) {
      const harness = HARNESS_OF[call.lane.model] || 'agy'
      live.set(id, harness)
      most[harness] = Math.max(most[harness], [...live.values()].filter((h) => h === harness).length)
    }
    if (call.command.verb === 'stop' || (call.command.verb === 'wait' && answer.done === true)) live.delete(id)
    return answer
  }
  return { lane, most }
}

test('the optional harness fields are refused when malformed, and null counts as absent', async (t) => {
  const bad = [
    { ...LANES, harnesses: 'agy' },
    { ...LANES, harnesses: ['agy', ''] },
    { ...LANES, maxParallelByHarness: { codex: 0 } },
    { ...LANES, maxParallelByHarness: ['codex'] },
    { ...LANES, calls: { ...LANES.calls, supervisor: { sonnet: { model: 'claude-sonnet-5-5', group: 'claude', harness: 7 } } } },
  ]
  for (const lanes of bad) {
    const run = await runWorkflow(lanesRun(t, [task(1)], lanes))
    assert.equal(run.error && run.error.message, 'aether:run args: lanes is invalid')
    assert.equal(run.calls.length, 0)
  }
  const absent = await runWorkflow(lanesRun(t, [task(1)], { ...LANES, harnesses: null, maxParallelByHarness: null, calls: onHarness(LANES.calls, null) }))
  ok(absent)
  assert.equal(absent.result.units[0].status, 'merged')
})

test('args that name the one harness on every call run exactly as args without the new fields', async (t) => {
  const args = lanesRun(t, [task(1), task(2)])
  const named = { ...args, lanes: { ...LANES, harnesses: ['agy'], maxParallelByHarness: { agy: LANES.maxParallel }, calls: onHarness(LANES.calls, 'agy') } }
  const plain = await runWorkflow(args)
  const same = await runWorkflow(named)
  ok(plain)
  ok(same)
  const rounds = (run) => run.result.units.map((u) => u.rounds.map((r) => [r.provider, r.reviewProvider, r.laneFailure]))
  assert.deepEqual(kinds(same), kinds(plain))
  assert.deepEqual(rounds(same), rounds(plain))
  assert.deepEqual(same.result.lanes, plain.result.lanes)
  assert.deepEqual(same.result.finalReview, plain.result.finalReview)
})

test('two harnesses: each call runs on its own harness, and its provider and labels name that harness', async (t) => {
  const run = await runWorkflow(lanesRun(t, [task(1, SONNET), task(2, SONNET)], { ...TWO, maxParallelByHarness: { codex: 2 } }), {
    lane: watch(TWO_STATUS).lane,
  })
  ok(run)
  assert.deepEqual(run.result.units.map((u) => u.rounds.map((r) => [r.provider, r.reviewProvider])), [
    [['codex gpt-5.5-codex-high', 'agy claude-sonnet-5-5-high']],
    [['codex gpt-5.5-codex-high', 'agy claude-sonnet-5-5-high']],
  ])
  assert.deepEqual([run.result.finalReview.status, run.result.finalReview.provider], ['done', 'agy claude-opus-5-5-high'])
  assert.deepEqual(starts(run, 'implementer').map((c) => c.lane.model), ['gpt-5.5-codex', 'gpt-5.5-codex'])
  assert.equal(starts(run, 'implementer')[0].label, 'task-1: implement via codex gpt-5.5-codex on sonnet high (attempt 1): start')
  assert.equal(native(run, 'implementer').length, 0)
  assert.deepEqual(run.result.lanes.dry, [{ wave: 1, groups: [] }])
})

test("quota is read per harness: a group dry on one harness leaves the other harness's groups on lanes", async (t) => {
  const run = await runWorkflow(lanesRun(t, [task(1, SONNET)], TWO), {
    lane: (call, fallback) => (call.command.verb === 'status' ? reading({ codex: { installed: true, groups: { openai: { usable: false } } } }) : fallback(call)),
  })
  ok(run)
  assert.deepEqual(native(run, 'implementer').map((c) => [c.model, c.effort]), [['sonnet', 'high']])
  assert.equal(starts(run, 'implementer').length, 0)
  assert.equal(starts(run, 'supervisor').length, 1)
  assert.deepEqual(run.result.lanes.dry, [{ wave: 1, groups: ['codex/openai'] }])
  assert.equal(run.result.units[0].rounds[0].provider, 'native')

  // A harness found not installed is dry for its groups; one missing from the reading has no reading, and is tried.
  const notInstalled = await runWorkflow(lanesRun(t, [task(1, SONNET)], TWO), {
    lane: (call, fallback) => (call.command.verb === 'status' ? reading({ codex: { installed: false, groups: { openai: { usable: true } } } }) : fallback(call)),
  })
  ok(notInstalled)
  assert.equal(starts(notInstalled, 'implementer').length, 0)
  assert.deepEqual(notInstalled.result.lanes.dry, [{ wave: 1, groups: ['codex/openai'] }])
  const missing = await runWorkflow(lanesRun(t, [task(1, SONNET)], TWO), { lane: (call, fallback) => (call.command.verb === 'status' ? reading({}) : fallback(call)) })
  ok(missing)
  assert.equal(starts(missing, 'implementer').length, 1)
  assert.deepEqual(missing.result.lanes.dry, [{ wave: 1, groups: [] }])
})

test('the cap on calls in flight applies per harness: a second codex call finds codex full and runs native', async (t) => {
  const watched = watch(TWO_STATUS)
  const run = await runWorkflow(lanesRun(t, [task(1, SONNET), task(2, SONNET)], TWO), { lane: watched.lane })
  ok(run)
  assert.equal(watched.most.codex, 1)
  assert.equal(starts(run, 'implementer').length, 1)
  assert.deepEqual(native(run, 'implementer').map((c) => c.unit), ['task-2'])
  assert.ok(run.result.lanes.overflow >= 1)
  assert.deepEqual(run.result.units.map((u) => u.status), ['merged', 'merged'])
})

test('a harness with its own cap runs that many calls at once, while the harnesses without one share maxParallel', async (t) => {
  const watched = watch(TWO_STATUS)
  const run = await runWorkflow(lanesRun(t, [task(1, SONNET), task(2, SONNET)], { ...TWO, maxParallel: 1, maxParallelByHarness: { codex: 2 } }), {
    lane: watched.lane,
  })
  ok(run)
  assert.equal(watched.most.codex, 2)
  assert.equal(watched.most.agy, 1)
  assert.equal(native(run, 'implementer').length, 0)
  assert.deepEqual(run.result.units.map((u) => u.status), ['merged', 'merged'])
})

test('an attempt on codex that stops before it finishes names codex in its record and in the context it hands on', async (t) => {
  const run = await runWorkflow(lanesRun(t, [task(1, SONNET)], TWO), {
    lane: (call, fallback) => {
      if (call.command.verb === 'status') return TWO_STATUS
      if (call.command.verb === 'wait' && call.lane.call === 'task-1-1-implement') return finished(call, { status: 'failed', detail: 'exit 1: model not found' })
      return fallback(call)
    },
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
