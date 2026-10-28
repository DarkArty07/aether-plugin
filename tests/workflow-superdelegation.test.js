'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf } = require('./workflow-harness.js')

const LANES = { superdelegation: true, harnesses: ['agy'], waits: { implementer: 3, supervisor: 2, reviewer: 2 } }
const FLASH = { id: 'agy/gemini-3.8-flash@medium', harness: 'agy', model: 'gemini-3.8-flash', family: 'gemini-3.8-flash', effort: 'medium', group: 'gemini', intelligence: 39.8, costPerTaskUsd: 0.93 }
const OPUS = { id: 'agy/claude-opus-5-5@medium', harness: 'agy', model: 'claude-opus-5-5', family: 'claude-opus-5-5', effort: 'medium', group: 'claude', intelligence: 51.2, costPerTaskUsd: 1.34 }
const FAMILY = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }

const argsOf = (t, tasks = [task(1, { tier: 'haiku xhigh — complete code' })], lanes = LANES) => ({ ...compile(makeRepo(t), plan(tasks)), lanes })
const ok = (run) => assert.equal(run.error, null, run.error && run.error.stack)
const verbs = (run, verb) => run.calls.filter((c) => c.kind === `ops:lane-${verb}`)
const flagsOf = (call) => ({ ...call.lane })
const natives = (run, role) => run.calls.filter((c) => c.role === role)
const starts = (run, role) => verbs(run, 'start').filter((c) => c.lane.role === role).length

// A decision for a pick's flags: `pairs[call]` gives the pair that call takes, or none (native).
function decision(call, picked) {
  const f = call.lane
  const native = { id: `claude/${f.model}@${f.effort}`, model: f.model, effort: f.effort, family: FAMILY[f.model], intelligence: 40 }
  return { call: f.call, role: f.role, requested: 40, reference: native, picked, native, reason: picked ? `took ${picked.id}` : 'native: test', candidates: [] }
}
const lane = (pairs = {}) => (call, fallback) => {
  if (call.command.verb === 'pick') return decision(call, pairs[call.lane.call] ?? null)
  return fallback(call)
}

test('without lanes the run never calls aether-lane and every round is native', async (t) => {
  for (const lanes of [null, undefined]) {
    const args = argsOf(t, [task(1)], lanes)
    if (lanes === undefined) delete args.lanes
    const run = await runWorkflow(args)
    ok(run)
    assert.equal(run.calls.some((c) => c.command && c.command.tool === 'aether-lane'), false)
    assert.equal(run.result.lanes, null)
  }
})

test('lanes of the wrong shape are refused before any agent starts', async (t) => {
  const bad = [{ superdelegation: true }, { ...LANES, waits: {} }, { ...LANES, harnesses: [] }]
  for (const lanes of bad) {
    const run = await runWorkflow(argsOf(t, [task(1)], lanes))
    assert.equal(run.error && run.error.message, 'aether:run args: lanes is invalid')
    assert.equal(run.calls.length, 0)
  }
})

test('C3: each call asks pick for the pair of its reference, and a pair that takes it runs on aether-lane start at the pair effort', async (t) => {
  const args = argsOf(t)
  const run = await runWorkflow(args, { lane: lane({ 'task-1-1-implement': FLASH, 'task-1-1-supervise': OPUS, 'final-review': OPUS }) })
  ok(run)
  const picks = verbs(run, 'pick').map((c) => c.lane)
  assert.deepEqual(picks.map((p) => [p.call, p.role, p.model, p.effort]), [
    ['task-1-1-implement', 'implementer', 'haiku', 'high'],
    ['task-1-1-supervise', 'supervisor', 'sonnet', 'high'],
    ['final-review', 'reviewer', 'sonnet', 'high'],
  ])
  assert.equal(picks[0].author, undefined)
  assert.equal(picks[1].author, 'gemini-3.8-flash')
  assert.equal(picks[2].author, 'gemini-3.8-flash')
  const started = verbs(run, 'start').map((c) => [c.lane.call, c.lane.model, c.lane.effort])
  assert.deepEqual(started, [['task-1-1-implement', 'gemini-3.8-flash', 'medium'], ['task-1-1-supervise', 'claude-opus-5-5', 'medium'], ['final-review', 'claude-opus-5-5', 'medium']])
  assert.equal(verbs(run, 'status').length + run.calls.filter((c) => c.kind === 'ops:lane-choice').length, 0)
  assert.equal(natives(run, 'implementer').length + natives(run, 'supervisor').length + natives(run, 'reviewer').length, 0)
  assert.deepEqual(verbs(run, 'took').map((c) => [c.lane.call, c.lane.by, c.lane.cause]), [
    ['task-1-1-implement', 'agy:gemini-3.8-flash', 'chosen'],
    ['task-1-1-supervise', 'agy:claude-opus-5-5', 'chosen'],
    ['final-review', 'agy:claude-opus-5-5', 'chosen'],
  ])
})

test('R5, R17, R18: a final review of units from two areas is offered to a pair before it is sliced, and a slice no pair takes runs on the native pair of its own decision', async (t) => {
  const tasks = [task(1, { area: 'api' }), task(2, { area: 'ui' })]
  const finalOf = (run, verb) => verbs(run, verb).filter((c) => c.lane.call === 'final-review')

  // A pair takes it: one external reviewer on the whole package, no slices, no native reviewer.
  const taken = await runWorkflow(argsOf(t, tasks), { lane: lane({ 'final-review': OPUS }) })
  ok(taken)
  assert.deepEqual(finalOf(taken, 'pick').map((c) => [c.lane.role, c.lane.model, c.lane.effort]), [['reviewer', 'sonnet', 'high']])
  assert.deepEqual(finalOf(taken, 'start').map((c) => [c.lane.model, c.lane.effort]), [['claude-opus-5-5', 'medium']])
  assert.equal(natives(taken, 'reviewer').length, 0)
  assert.equal(taken.result.finalReview.slices, undefined)
  assert.deepEqual(finalOf(taken, 'took').map((c) => [c.lane.by, c.lane.cause]), [['agy:claude-opus-5-5', 'chosen']])

  // None takes it whole: two slices (one per area) ask on their own at the whole decision's native pair, and
  // with no pair for them either they run native on the native pair of their own decisions.
  const fallback = await runWorkflow(argsOf(t, tasks), {
    lane: (call, next) => {
      if (call.command.verb !== 'pick') return next(call)
      const d = decision(call, null)
      if (call.lane.call === 'final-review') d.native = { ...d.native, model: 'opus', effort: 'high', id: 'claude/opus@high', family: FAMILY.opus }
      return d
    },
  })
  ok(fallback)
  assert.equal(finalOf(fallback, 'pick').length, 1)
  assert.equal(finalOf(fallback, 'start').length, 0)
  const reviewers = natives(fallback, 'reviewer')
  assert.equal(reviewers.length, 2)
  assert.deepEqual(reviewers.map((c) => [c.model, c.effort]), [['opus', 'high'], ['opus', 'high']])
  assert.equal(fallback.result.finalReview.slices, 2)
  assert.deepEqual(finalOf(fallback, 'took').map((c) => [c.lane.by, c.lane.cause]), [['native', 'no-candidate']])
  const slicePicks = verbs(fallback, 'pick').filter((c) => c.lane.call.startsWith('final-review-slice-'))
  assert.deepEqual(slicePicks.map((c) => [c.lane.call, c.lane.model, c.lane.effort]), [['final-review-slice-1', 'opus', 'high'], ['final-review-slice-2', 'opus', 'high']])
  const sliceTooks = verbs(fallback, 'took').filter((c) => c.lane.call.startsWith('final-review-slice-'))
  assert.deepEqual(sliceTooks.map((c) => [c.lane.call, c.lane.by, c.lane.cause]), [['final-review-slice-1', 'native', 'no-candidate'], ['final-review-slice-2', 'native', 'no-candidate']])
})

test('C11: a call with no pair runs native in the native pair of the decision, and took says no-candidate', async (t) => {
  const run = await runWorkflow(argsOf(t), {
    lane: (call, fallback) => {
      if (call.command.verb !== 'pick') return fallback(call)
      const d = decision(call, null)
      if (call.lane.role === 'supervisor') d.native = { ...d.native, model: 'opus', effort: 'high', id: 'claude/opus@high', family: FAMILY.opus }
      return d
    },
  })
  ok(run)
  assert.equal(verbs(run, 'start').length, 0)
  const [supervisor] = natives(run, 'supervisor')
  assert.deepEqual([supervisor.model, supervisor.effort], ['opus', 'high'])
  assert.deepEqual([...new Set(verbs(run, 'took').map((c) => c.lane.cause))], ['no-candidate'])
  assert.ok(verbs(run, 'took').every((c) => c.lane.by === 'native'))
})

test('C12: a supervisor review names the family that implemented the attempt, and the native fallback is the family the pick gave', async (t) => {
  const run = await runWorkflow(argsOf(t), { lane: lane() })
  ok(run)
  const supervise = verbs(run, 'pick').find((c) => c.lane.role === 'supervisor').lane
  assert.equal(supervise.author, 'claude-haiku-5-5')
})

test('max goes through pick like any other effort', async (t) => {
  const run = await runWorkflow(argsOf(t, [task(1, { review: 'max — a reason' })]), { lane: lane() })
  ok(run)
  assert.equal(verbs(run, 'pick').find((c) => c.lane.role === 'supervisor').lane.effort, 'max')
})

test('C9: the attempt after one that did not approve is picked with its own reference and without the pair that failed', async (t) => {
  const retry = { verdict: 'retry', findings: [{ severity: 'important', title: 'gap', file: 'src/t1/a.js:1', evidence: 'x' }], ruling: 'Retry: gap.', guidance: 'fix', question: '' }
  let reviews = 0
  const run = await runWorkflow(argsOf(t), {
    lane: lane({ 'task-1-1-implement': FLASH }),
    supervisor: () => (++reviews === 1 ? retry : { verdict: 'approve', findings: [], ruling: 'ok', guidance: '', question: '' }),
  })
  ok(run)
  const implementers = verbs(run, 'pick').filter((c) => c.lane.role === 'implementer').map((c) => c.lane)
  assert.equal(implementers.length, 2)
  assert.equal(implementers[0].exclude, undefined)
  assert.deepEqual([implementers[1].call, implementers[1].model, implementers[1].effort, implementers[1].exclude], ['task-1-2-implement', 'haiku', 'xhigh', FLASH.id])
})

test('a start that is not available repeats the pick without that pair, and the call ends native', async (t) => {
  const run = await runWorkflow(argsOf(t), {
    lane: (call, fallback) => {
      if (call.command.verb === 'pick') return decision(call, call.lane.role === 'implementer' && !call.lane.exclude ? FLASH : null)
      if (call.command.verb === 'start' && call.lane.role === 'implementer') return { unavailable: 'quota' }
      return fallback(call)
    },
  })
  ok(run)
  const picks = verbs(run, 'pick').filter((c) => c.lane.role === 'implementer')
  assert.deepEqual(picks.map((c) => c.lane.exclude), [undefined, FLASH.id])
  assert.equal(natives(run, 'implementer').length, 1)
  const took = verbs(run, 'took').find((c) => c.lane.call === 'task-1-1-implement')
  assert.deepEqual([took.lane.by, took.lane.cause], ['native', 'failed'])
})

test('C10: two calls on one harness start together, with no wait for a place', async (t) => {
  const args = argsOf(t, [task(1), task(2)])
  const open = new Set()
  let peak = 0
  const run = await runWorkflow(args, {
    lane: (call, fallback) => {
      const verb = call.command.verb
      if (verb === 'pick') return decision(call, call.lane.role === 'implementer' ? FLASH : null)
      if (verb === 'start') {
        open.add(call.lane.call)
        peak = Math.max(peak, open.size)
      }
      const answer = fallback(call)
      if (verb === 'wait' || verb === 'result') open.delete(call.lane.call)
      return answer
    },
  })
  ok(run)
  assert.equal(peak, 2)
  assert.equal(verbs(run, 'pause').length, 0)
  assert.equal(starts(run, 'implementer'), 2)
  assert.equal(natives(run, 'implementer').length, 0)
  assert.equal(Object.hasOwn(run.result.lanes, 'overflow'), false)
})

test('C12 and C11: a supervisor whose pair ran and failed runs in the native pair its pick gave, and took says failed', async (t) => {
  const run = await runWorkflow(argsOf(t), {
    lane: (call, fallback) => {
      if (call.command.verb === 'pick') {
        const d = decision(call, call.lane.role === 'supervisor' ? OPUS : null)
        return call.lane.role === 'supervisor' ? { ...d, native: { ...d.native, model: 'opus', effort: 'high', id: 'claude/opus@high', family: FAMILY.opus } } : d
      }
      if (call.command.verb === 'wait' && call.lane.call === 'task-1-1-supervise') return laneAnswer({ status: 'failed', detail: 'exit 1', lane: laneOf(call.started) })
      return fallback(call)
    },
  })
  ok(run)
  const [supervisor] = natives(run, 'supervisor')
  assert.deepEqual([supervisor.model, supervisor.effort], ['opus', 'high'])
  const took = verbs(run, 'took').find((c) => c.lane.call === 'task-1-1-supervise')
  assert.deepEqual([took.lane.by, took.lane.cause], ['native', 'failed'])
})
