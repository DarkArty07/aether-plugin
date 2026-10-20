'use strict'

// Spec 002, R9 to R16 in the workflow: each call walks its candidates in the order of the rule, a start that is
// unavailable moves it on, a full pool passes a candidate over, and each decision is logged with `aether-lane choice`.

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf } = require('./workflow-harness.js')
const choiceLib = require('../plugins/aether/lib/lane-choice.js')
const { CASES, GEMINI, GROK, CLAUDE_LOW } = require('./lane-order-cases.js')

const FLASH = { model: 'gemini-3.8-flash', group: 'gemini', harness: 'agy' }
const GROK_47 = { model: 'grok-4.7', group: 'grok', harness: 'grok' }
const SONNET = { model: 'claude-sonnet-5-5', group: 'claude', harness: 'agy' }

function lanesWith(calls, extra = {}) {
  return { harness: 'agy', harnesses: ['agy', 'grok'], maxParallel: 8, waits: { implementer: 3, supervisor: 2, reviewer: 2 }, calls, ...extra }
}

function lanesRun(t, tasks, lanes) {
  return { ...compile(makeRepo(t), plan(tasks)), lanes }
}

// The readings of 2026-10-14: Gemini and Grok usable, Claude in agy under the reserve.
const TODAY = { agy: { installed: true, groups: { gemini: GEMINI, claude: CLAUDE_LOW } }, grok: { installed: true, groups: { grok: GROK } } }
const TODAY_ORDER = 'grok:grok-4.7:0.013331:picked:absent/agy:gemini-3.8-flash:0.006044:untried'

const ok = (run) => assert.equal(run.error, null, run.error && run.error.stack)
const starts = (run, role = 'implementer') => run.calls.filter((c) => c.kind === 'ops:lane-start' && c.lane.role === role)
const choices = (run) => run.calls.filter((c) => c.kind === 'ops:lane-choice').map((c) => c.lane)
const native = (run, role) => run.calls.filter((c) => c.role === role)
const isCall = (call, verb, id) => call.command.verb === verb && call.lane.call === id
const retry = {
  verdict: 'retry',
  findings: [{ severity: 'important', title: 'gap', file: 'src/t1/a.js:1', evidence: 'x' }],
  ruling: 'Retry: gap.',
  guidance: 'fix the gap',
  question: '',
}
// A native supervisor that asks for a second attempt once.
const retryOnce = (call, fallback) => (call.n === 1 ? retry : fallback(call))
const status = (harnesses) => (call, fallback) => (call.command.verb === 'status' ? { harnesses } : fallback(call))
const withLane = (...handlers) => (call, fallback) => {
  for (const handler of handlers) {
    const answer = handler(call, () => undefined)
    if (answer !== undefined) return answer
  }
  return fallback(call)
}
// A finished implementer call, with the group's final reading in its lane block.
const DONE = { status: 'DONE', summary: 'Implemented the brief.', head: 'abc1234', tests: '3/3 pass', concerns: '', question: '' }
const finishedWith = (call, quota) => laneAnswer({ result: DONE, lane: { ...laneOf(call.started), quota } })

test('every case of the order rule gives the same order in the workflow, and each start that fails moves the call on', async (t) => {
  for (const c of CASES) {
    const lanes = lanesWith({ implementer: { haiku: c.candidates } })
    const run = await runWorkflow(lanesRun(t, [task(1)], lanes), {
      lane: (call, fallback) => (call.command.verb === 'status' ? { harnesses: c.harnesses } : call.command.verb === 'start' ? { unavailable: 'workspace' } : fallback(call)),
    })
    ok(run)
    assert.deepEqual(starts(run).map((s) => `${s.lane.model}`), c.ordered.map((name) => name.split(':')[1]), c.name)
    // Every candidate failed to start, so the attempt runs native, and the choice says so.
    assert.equal(native(run, 'implementer').length, 1, c.name)
    const [choice] = choices(run)
    assert.deepEqual([choice.pick, choice.role, choice.tier, choice.effort, choice.call], ['native', 'implementer', 'haiku', 'xhigh', 'task-1-1-implement'], c.name)
    const items = choiceLib.parseOrder(choice.order)
    assert.deepEqual(items.map((i) => `${i.harness}:${i.model}`), [...c.ordered, ...c.excluded.map((e) => e.split(':').slice(0, 2).join(':'))], c.name)
    assert.deepEqual(items.map((i) => i.outcome), [...c.ordered.map(() => 'unavailable-workspace'), ...c.excluded.map((e) => e.split(':')[2])], c.name)
    assert.equal(run.result.lanes.unavailable, c.ordered.length, c.name)
    assert.equal(run.result.lanes.overflow, 0, c.name)
  }
})

test('with the readings of 2026-10-14 a haiku implementer runs on Grok 4.7, a sonnet call goes native, and each decision is logged', async (t) => {
  const lanes = lanesWith({
    implementer: { haiku: [FLASH, GROK_47] },
    supervisor: { sonnet: [SONNET] },
    reviewer: { sonnet: [SONNET] },
  })
  const run = await runWorkflow(lanesRun(t, [task(1)], lanes), { lane: status(TODAY) })
  ok(run)
  assert.deepEqual(starts(run).map((s) => [s.lane.call, s.lane.model, s.label]), [['task-1-1-implement', 'grok-4.7', 'task-1: implement via grok grok-4.7 on haiku xhigh (attempt 1): start']])
  assert.match(run.result.units[0].rounds[0].provider, /^grok grok-4\.7/)
  assert.equal(native(run, 'supervisor').length, 1)
  assert.equal(native(run, 'reviewer').length, 1)
  assert.deepEqual(choices(run).map((c) => [c.call, c.role, c.tier, c.effort, c.pick, c.order]), [
    ['task-1-1-implement', 'implementer', 'haiku', 'xhigh', 'grok:grok-4.7', TODAY_ORDER],
    ['task-1-1-supervise', 'supervisor', 'sonnet', 'high', 'native', 'agy:claude-sonnet-5-5:excluded:reserve'],
    ['final-review', 'reviewer', 'sonnet', 'high', 'native', 'agy:claude-sonnet-5-5:excluded:reserve'],
  ])
  assert.deepEqual(run.result.lanes, { calls: 1, ok: 1, failed: 0, quota: 0, violation: 0, blocked: 0, unavailable: 0, overflow: 0, dry: [{ wave: 1, groups: ['agy/claude'] }] })
  assert.equal(run.result.agents.total, run.calls.length)
})

test('after the Claude group resets, the sonnet call goes to Claude in agy', async (t) => {
  const back = { agy: { installed: true, groups: { gemini: GEMINI, claude: { unknown: false, usable: true, priority: 0.0066, resetsAt: '2026-10-23T04:41:07.000Z' } } } }
  const run = await runWorkflow(lanesRun(t, [task(1, { tier: 'sonnet high — wiring the tests pin down' })], lanesWith({ implementer: { sonnet: [SONNET] } })), { lane: status(back) })
  ok(run)
  assert.deepEqual(starts(run).map((s) => s.lane.model), ['claude-sonnet-5-5'])
  assert.deepEqual(choices(run).map((c) => [c.pick, c.order]), [['agy:claude-sonnet-5-5', 'agy:claude-sonnet-5-5:0.0066:picked']])
})

test('a candidate whose pool is full is passed over, and the call goes native, counted as overflow, only when no pool has room', async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [FLASH, GROK_47] } }, { maxParallelByHarness: { agy: 1, grok: 1 } })
  const run = await runWorkflow(lanesRun(t, [task(1), task(2), task(3)], lanes), { lane: status(TODAY) })
  ok(run)
  const byUnit = Object.fromEntries(starts(run).map((s) => [s.lane.task, s.lane.model]))
  assert.deepEqual(byUnit, { 'task-1': 'grok-4.7', 'task-2': 'gemini-3.8-flash' })
  assert.deepEqual(native(run, 'implementer').map((c) => c.unit), ['task-3'])
  assert.equal(run.result.lanes.overflow, 1)
  const picks = Object.fromEntries(choices(run).map((c) => [c.call, [c.pick, c.order]]))
  assert.deepEqual(picks['task-1-1-implement'], ['grok:grok-4.7', TODAY_ORDER])
  assert.deepEqual(picks['task-2-1-implement'], ['agy:gemini-3.8-flash', 'grok:grok-4.7:0.013331:pool-full:absent/agy:gemini-3.8-flash:0.006044:picked'])
  assert.deepEqual(picks['task-3-1-implement'], ['native', 'grok:grok-4.7:0.013331:pool-full:absent/agy:gemini-3.8-flash:0.006044:pool-full'])
})

test('a start that is unavailable runs the same call on the next candidate, and a group that had no quota stays out of the run', async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [FLASH, GROK_47] } })
  const run = await runWorkflow(lanesRun(t, [task(1)], lanes), {
    supervisor: retryOnce,
    lane: withLane(status(TODAY), (call) => (call.command.verb === 'start' && call.lane.model === 'grok-4.7' ? { unavailable: 'quota' } : undefined)),
  })
  ok(run)
  assert.deepEqual(starts(run).map((s) => [s.lane.call, s.lane.model]), [
    ['task-1-1-implement', 'grok-4.7'],
    ['task-1-1-implement', 'gemini-3.8-flash'],
    ['task-1-2-implement', 'gemini-3.8-flash'],
  ])
  assert.deepEqual(choices(run).map((c) => [c.call, c.pick, c.order]), [
    ['task-1-1-implement', 'agy:gemini-3.8-flash', 'grok:grok-4.7:0.013331:unavailable-quota:absent/agy:gemini-3.8-flash:0.006044:picked'],
    ['task-1-2-implement', 'agy:gemini-3.8-flash', 'agy:gemini-3.8-flash:0.006044:picked/grok:grok-4.7:excluded:dry:absent'],
  ])
  assert.deepEqual([run.result.lanes.unavailable, run.result.lanes.overflow], [1, 0])
  assert.deepEqual(run.result.units[0].rounds.map((r) => r.provider.split(' ')[0]), ['agy', 'agy'])
})

test('a start that is unavailable frees its place in the pool, so the next candidate finds room (R13)', async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [FLASH, GROK_47] } }, { maxParallel: 1 })
  const run = await runWorkflow(lanesRun(t, [task(1)], lanes), {
    lane: withLane(status(TODAY), (call) => (call.command.verb === 'start' && call.lane.model === 'grok-4.7' ? { unavailable: 'workspace' } : undefined)),
  })
  ok(run)
  assert.deepEqual(starts(run).map((s) => s.lane.model), ['grok-4.7', 'gemini-3.8-flash'])
  assert.deepEqual(choices(run).map((c) => c.pick), ['agy:gemini-3.8-flash'])
  assert.deepEqual(native(run, 'implementer'), [])
  assert.equal(run.result.lanes.overflow, 0)
})

test('only a start unavailable for quota dries its group: one unavailable for the workspace is tried again by the next attempt and the next wave', async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [GROK_47, FLASH] } })
  const run = await runWorkflow(lanesRun(t, [task(1), task(2, { depends: 'Task 1 — it builds on task 1' })], lanes), {
    supervisor: retryOnce,
    lane: withLane(status(TODAY), (call) => (call.command.verb === 'start' && call.lane.model === 'grok-4.7' ? { unavailable: 'workspace' } : undefined)),
  })
  ok(run)
  // The second attempt of task 1 is in the same wave as the first, so no quota step has cleared anything between them.
  const grok = starts(run).filter((s) => s.lane.model === 'grok-4.7').map((s) => s.lane.call)
  assert.deepEqual(grok, ['task-1-1-implement', 'task-1-2-implement', 'task-2-1-implement', 'task-2-2-implement'])
  assert.ok(choices(run).every((c) => !c.order.includes('excluded:dry')), choices(run).map((c) => c.order).join('\n'))
})

test('a quota step that fails leaves the views and the groups that ran dry as the last wave left them', async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [GROK_47, FLASH] } })
  let steps = 0
  const run = await runWorkflow(lanesRun(t, [task(1), task(2, { depends: 'Task 1 — it builds on task 1' })], lanes), {
    lane: withLane(
      (call, fallback) => (call.command.verb === 'status' ? (++steps === 1 ? { harnesses: TODAY } : { error: 'status failed' }) : fallback(call)),
      (call) => (call.command.verb === 'start' && call.lane.model === 'grok-4.7' ? { unavailable: 'quota' } : undefined),
    ),
  })
  ok(run)
  assert.equal(steps, 2)
  assert.deepEqual(starts(run).map((s) => [s.lane.call, s.lane.model]), [
    ['task-1-1-implement', 'grok-4.7'],
    ['task-1-1-implement', 'gemini-3.8-flash'],
    ['task-2-1-implement', 'gemini-3.8-flash'],
  ])
  // Gemini keeps the priority wave 1 read for it (a wiped view would leave it without one), and grok stays out.
  assert.equal(choices(run)[1].order, 'agy:gemini-3.8-flash:0.006044:picked/grok:grok-4.7:excluded:dry:absent')
})

test('a call that ends for quota keeps its group out of the rest of the run, and the same attempt goes on native', async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [GROK_47, FLASH] } })
  const run = await runWorkflow(lanesRun(t, [task(1)], lanes), {
    supervisor: retryOnce,
    lane: withLane(status(TODAY), (call) => (isCall(call, 'wait', 'task-1-1-implement') ? laneAnswer({ status: 'quota', lane: laneOf(call.started), detail: 'quota: usage limit' }) : undefined)),
  })
  ok(run)
  assert.deepEqual(native(run, 'implementer').map((c) => c.label), ['task-1: implement on haiku xhigh (attempt 1)'])
  assert.deepEqual(starts(run).map((s) => [s.lane.call, s.lane.model]), [
    ['task-1-1-implement', 'grok-4.7'],
    ['task-1-2-implement', 'gemini-3.8-flash'],
  ])
  assert.deepEqual(choices(run).map((c) => [c.call, c.pick, c.order]), [
    ['task-1-1-implement', 'grok:grok-4.7', TODAY_ORDER],
    ['task-1-2-implement', 'agy:gemini-3.8-flash', 'agy:gemini-3.8-flash:0.006044:picked/grok:grok-4.7:excluded:dry:absent'],
  ])
  assert.equal(run.result.lanes.quota, 1)
})

test("the final reading of a finished call reorders the next candidates: a lower priority goes behind, an unusable group goes out", async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [FLASH, GROK_47] } })
  const low = { usable: true, unknown: false, remaining: 0.001, resetsAt: '2026-10-17T09:08:51.805Z', priority: 0.000013, usedPercentAbsent: false }
  const reorder = await runWorkflow(lanesRun(t, [task(1)], lanes), {
    supervisor: retryOnce,
    lane: withLane(status(TODAY), (call) => (isCall(call, 'wait', 'task-1-1-implement') ? finishedWith(call, low) : undefined)),
  })
  ok(reorder)
  assert.deepEqual(choices(reorder).map((c) => c.order), [TODAY_ORDER, 'agy:gemini-3.8-flash:0.006044:picked/grok:grok-4.7:0.000013:untried'])
  assert.deepEqual(starts(reorder).map((s) => s.lane.model), ['grok-4.7', 'gemini-3.8-flash'])

  const out = await runWorkflow(lanesRun(t, [task(1)], lanes), {
    supervisor: retryOnce,
    lane: withLane(status(TODAY), (call) => (isCall(call, 'wait', 'task-1-1-implement') ? finishedWith(call, { ...low, usable: false }) : undefined)),
  })
  ok(out)
  assert.deepEqual(choices(out).map((c) => c.order), [TODAY_ORDER, 'agy:gemini-3.8-flash:0.006044:picked/grok:grok-4.7:excluded:reserve'])
})

test('the quota step never runs while a lane call holds a place, and runs once per wave', async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [FLASH, GROK_47] }, supervisor: { sonnet: [SONNET] } })
  const live = new Set()
  const atStatus = []
  const watch = (call, fallback) => {
    if (call.command.verb === 'status') {
      atStatus.push(live.size)
      return { harnesses: TODAY }
    }
    const answer = fallback(call)
    if (call.command.verb === 'start' && answer.started === true) live.add(call.lane.call)
    if (call.command.verb === 'stop' || (call.command.verb === 'wait' && answer.done === true)) live.delete(call.lane.call)
    return answer
  }
  const run = await runWorkflow(lanesRun(t, [task(1), task(2, { depends: 'Task 1 — it builds on task 1' })], lanes), { lane: watch })
  ok(run)
  assert.deepEqual(atStatus, [0, 0])
  const quota = run.calls.filter((c) => c.kind === 'ops:lane-status')
  assert.deepEqual(quota.map((c) => c.label), ['wave 1: lane quota', 'wave 2: lane quota'])
  // The wave's quota step is the one that asks for the refresh; a status run by hand does not.
  assert.deepEqual(quota.map((c) => c.command.rest), [[run.result.runId, '--refresh'], [run.result.runId, '--refresh']])
})

test('a call never waits for the log of its choice, and the run returns only after every log ended', { timeout: 30000 }, async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [FLASH, GROK_47] }, supervisor: { sonnet: [SONNET] } })
  // The log of every choice waits for the first merge; if a call waited for its log, the merge would never come. The gate holds
  // until that merge and no clock decides it, so load cannot fail the test; the timeout of the test, long on
  // purpose, makes a call that waits fail instead of hang.
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const run = await runWorkflow(lanesRun(t, [task(1)], lanes), {
    lane: (call, fallback) => (call.command.verb === 'choice' ? gate.then(() => ({ logged: true })) : status(TODAY)(call, fallback)),
    ops: (call, fallback) => {
      if (call.command.verb === 'merge') release()
      return fallback(call)
    },
  })
  ok(run)
  const at = (event) => run.events.indexOf(event)
  assert.ok(at('start ops:merge task-1') > -1 && at('start ops:merge task-1') < at('end ops:lane-choice task-1'), run.events.join('\n'))
  assert.equal(run.events.filter((e) => e.startsWith('start ops:lane-choice')).length, run.events.filter((e) => e.startsWith('end ops:lane-choice')).length)
  assert.equal(choices(run).length, 2)
  assert.equal(run.result.agents.total, run.calls.length)
})

test('a choice that cannot be logged changes nothing in the run, and the order is not asked for effort max or a tier with no candidate', async (t) => {
  const lanes = lanesWith({ implementer: { haiku: [FLASH, GROK_47] } })
  const lost = await runWorkflow(lanesRun(t, [task(1)], lanes), {
    lane: (call, fallback) => (call.command.verb === 'choice' ? null : status(TODAY)(call, fallback)),
  })
  ok(lost)
  assert.equal(lost.result.units[0].status, 'merged')
  assert.ok(lost.logs.some((line) => line.includes('the lane choice was not logged')), lost.logs.join('\n'))

  const max = await runWorkflow(lanesRun(t, [task(1, { tier: 'haiku max — it needs the whole of it' })], lanes), { lane: status(TODAY) })
  ok(max)
  assert.deepEqual([starts(max).length, choices(max).length], [0, 0])

  const none = await runWorkflow(lanesRun(t, [task(1, { tier: 'sonnet high — wiring the tests pin down' })], lanes), { lane: status(TODAY) })
  ok(none)
  assert.deepEqual([starts(none).length, choices(none).length], [0, 0])
  assert.equal(native(none, 'implementer').length, 1)
})

test('the candidates of a tier are a list of lanes, or one lane of an older compile, and nothing else', async (t) => {
  const good = [
    { implementer: { haiku: [FLASH] } },
    { implementer: { haiku: [FLASH, GROK_47] } },
    { implementer: { haiku: FLASH } },
    { implementer: { haiku: [{ model: 'm', group: 'g' }] } },
  ]
  for (const calls of good) {
    const run = await runWorkflow(lanesRun(t, [task(1)], lanesWith(calls)), { lane: status(TODAY) })
    ok(run)
  }
  const bad = [
    { implementer: { haiku: [] } },
    { implementer: { haiku: [FLASH, { model: '', group: 'g' }] } },
    { implementer: { haiku: [FLASH, 'grok'] } },
    { implementer: { haiku: [{ ...FLASH, harness: 7 }] } },
    { implementer: { gpt: [FLASH] } },
  ]
  for (const calls of bad) {
    const run = await runWorkflow(lanesRun(t, [task(1)], lanesWith(calls)))
    assert.equal(run.error && run.error.message, 'aether:run args: lanes is invalid', JSON.stringify(calls))
    assert.equal(run.calls.length, 0)
  }
})
