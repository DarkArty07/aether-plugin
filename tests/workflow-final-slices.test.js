'use strict'

// The sliced final review with superdelegation on: when no pair takes the whole package, each slice is
// offered to the pairs on its own (`final-review-slice-<n>`) before it runs on the native reviewer.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf } = require('./workflow-harness.js')
const { PLUGIN } = require('./helpers.js')

const LANES = { superdelegation: true, harnesses: ['agy'], maxParallelByHarness: { agy: 4 }, waits: { implementer: 3, supervisor: 2, reviewer: 2 }, cupo: { polls: 2, pollSeconds: 60 } }
const FAMILY = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }

// A pair of the table as pick prints it (points and costs are stand-ins: no test here reads them).
const pairOf = (harness, model, effort) => ({ id: `${harness}/${model}@${effort}`, harness, model, family: model, effort, group: null, intelligence: 40, costPerTaskUsd: 1 })
const SONNET = pairOf('agy', 'claude-sonnet-5-5', 'high')
const OPUS = pairOf('agy', 'claude-opus-5-5', 'high')

// Four merged tasks across two areas: two slices of two units each.
const SLICED = [task(1, { area: 'api' }), task(2, { area: 'api' }), task(3, { area: 'ui' }), task(4, { area: 'ui' })]
const slicedRun = (t, lanes = LANES) => ({ ...compile(makeRepo(t), plan(SLICED)), lanes })

// A lane handler whose pick gives, per call id, the first pair of that call's list the call does not
// exclude, or none. `nativeOf(call)` may override the decision's native pair; `more` answers the rest.
function onSlices(pairsByCall, more = (call, fallback) => fallback(call), nativeOf = null) {
  return (call, fallback) => {
    if (call.command.verb !== 'pick') return more(call, fallback)
    const f = call.lane
    const excluded = f.exclude ? f.exclude.split(',') : []
    const picked = (pairsByCall[f.call] || []).find((pair) => !excluded.includes(pair.id)) || null
    let native = { id: `claude/${f.model}@${f.effort}`, model: f.model, effort: f.effort, family: FAMILY[f.model], intelligence: 40 }
    const override = nativeOf ? nativeOf(f) : null
    if (override) native = { ...native, ...override, id: `claude/${override.model}@${override.effort}`, family: FAMILY[override.model] }
    return { call: f.call, role: f.role, requested: 40, reference: native, picked, native, reason: picked ? `took ${picked.id}` : 'native: test', candidates: [] }
  }
}

const ok = (run) => assert.equal(run.error, null, run.error && run.error.stack)
const natives = (run, role) => run.calls.filter((c) => c.role === role)
const picks = (run, id) => run.calls.filter((c) => c.kind === 'ops:lane-pick' && c.lane.call === id)
const starts = (run, id) => run.calls.filter((c) => c.kind === 'ops:lane-start' && (!id || c.lane.call === id))
const tookOf = (run, id) => run.calls.filter((c) => c.kind === 'ops:lane-took' && c.lane.call === id).map((c) => [c.lane.by, c.lane.cause])
const isCall = (call, verb, id) => call.command.verb === verb && call.lane.call === id
const finished = (call, fields) => laneAnswer({ lane: laneOf(call.started), ...fields })

test('no pair for the whole package and pairs for the slices: every slice runs on a pair, and no native reviewer is called', async (t) => {
  const run = await runWorkflow(slicedRun(t), {
    lane: onSlices({ 'final-review-slice-1': [SONNET], 'final-review-slice-2': [SONNET] }),
  })
  ok(run)
  assert.equal(natives(run, 'reviewer').length, 0)
  assert.equal(starts(run, 'final-review').length, 0)
  assert.deepEqual(starts(run).filter((c) => c.lane.role === 'reviewer').map((c) => c.lane.call), ['final-review-slice-1', 'final-review-slice-2'])
  for (const n of [1, 2]) {
    const [pick] = picks(run, `final-review-slice-${n}`)
    assert.deepEqual([pick.lane.role, pick.lane.model, pick.lane.effort, pick.lane.author], ['reviewer', 'opus', 'high', 'claude-haiku-5-5'])
    assert.deepEqual(tookOf(run, `final-review-slice-${n}`), [['agy:claude-sonnet-5-5', 'chosen']])
  }
  const [first] = starts(run, 'final-review-slice-1')
  assert.deepEqual([first.lane.role, first.lane.task, first.lane.model, first.lane.effort], ['reviewer', undefined, 'claude-sonnet-5-5', 'high'])
  assert.equal(first.label, 'final review (slice 1/2) via agy claude-sonnet-5-5: start')
  assert.ok(first.payload.text.includes('Review package: .aether-tmp/package.diff (base '))
  assert.ok(first.payload.text.includes('yours is slice 1'))
  const review = run.result.finalReview
  assert.equal(review.status, 'done')
  assert.equal(review.slices, 2)
  assert.equal(review.provider, 'agy claude-sonnet-5-5-high')
  assert.deepEqual(review.slicesBy, ['agy claude-sonnet-5-5-high', 'agy claude-sonnet-5-5-high'])
  assert.deepEqual([review.reviewModel, review.reviewEffort], ['opus', 'high'])
  assert.deepEqual(tookOf(run, 'final-review'), [['native', 'no-candidate']])
})

test("a slice whose pair fails is taken by the next pair, and a slice with no pair runs native on its own decision's native pair", async (t) => {
  const run = await runWorkflow(slicedRun(t), {
    lane: onSlices(
      { 'final-review-slice-1': [SONNET, OPUS] },
      (call, fallback) =>
        isCall(call, 'wait', 'final-review-slice-1') && call.started.model === 'claude-sonnet-5-5' ? finished(call, { status: 'failed', detail: 'exit 1' }) : fallback(call),
      (f) => (f.call === 'final-review-slice-2' ? { model: 'sonnet', effort: 'high' } : null),
    ),
  })
  ok(run)
  assert.deepEqual(starts(run, 'final-review-slice-1').map((c) => c.lane.model), ['claude-sonnet-5-5', 'claude-opus-5-5'])
  assert.deepEqual(picks(run, 'final-review-slice-1').map((c) => c.lane.exclude), [undefined, SONNET.id])
  const [reviewer] = natives(run, 'reviewer')
  assert.equal(natives(run, 'reviewer').length, 1)
  assert.deepEqual([reviewer.model, reviewer.effort], ['sonnet', 'high'])
  assert.ok(reviewer.label.includes('slice 2/2'))
  const review = run.result.finalReview
  assert.equal(review.status, 'done')
  assert.equal(review.provider, 'mixed')
  assert.deepEqual(review.slicesBy, ['agy claude-opus-5-5-high', 'native'])
  assert.deepEqual(tookOf(run, 'final-review-slice-1'), [['agy:claude-opus-5-5', 'chosen']])
  assert.deepEqual(tookOf(run, 'final-review-slice-2'), [['native', 'no-candidate']])
})

test('every slice native when no pair exists at all: the result is as before, apart from slicesBy', async (t) => {
  const run = await runWorkflow(slicedRun(t), { lane: onSlices({}) })
  ok(run)
  assert.equal(starts(run).length, 0)
  assert.deepEqual(natives(run, 'reviewer').map((c) => [c.model, c.effort]), [['opus', 'high'], ['opus', 'high']])
  const { slicesBy, ...review } = run.result.finalReview
  assert.deepEqual(review, {
    status: 'done',
    provider: 'native',
    verdict: 'ready',
    findings: [],
    declined: [],
    summary: 'Slice 1 (task-1, task-2): Ready to merge.\nSlice 2 (task-3, task-4): Ready to merge.',
    slices: 2,
    reviewModel: 'opus',
    reviewEffort: 'high',
  })
  assert.deepEqual(slicesBy, ['native', 'native'])
  assert.deepEqual(tookOf(run, 'final-review-slice-1'), [['native', 'no-candidate']])
  assert.deepEqual(tookOf(run, 'final-review-slice-2'), [['native', 'no-candidate']])
})

test('a blocked slice fails the review and keeps the findings of the other slices', async (t) => {
  const finding = { severity: 'important', title: 'a slice finding', file: 'src/t1/a.js:1', evidence: 'x' }
  const detail = 'the integration branch was rewound or rewritten during the lane call'
  const run = await runWorkflow(slicedRun(t), {
    lane: onSlices({ 'final-review-slice-1': [SONNET], 'final-review-slice-2': [SONNET] }, (call, fallback) => {
      if (isCall(call, 'wait', 'final-review-slice-1')) return finished(call, { result: { verdict: 'ready-with-fixes', findings: [finding], declined: [], summary: 'Mostly ready.' } })
      if (isCall(call, 'wait', 'final-review-slice-2')) return finished(call, { status: 'blocked', detail })
      return fallback(call)
    }),
  })
  ok(run)
  assert.equal(natives(run, 'reviewer').length, 0)
  const review = run.result.finalReview
  assert.equal(review.status, 'failed')
  assert.match(review.reason, /slice 2 of 2/)
  assert.ok(review.reason.includes(detail))
  assert.deepEqual(review.findings.map((f) => f.title), ['a slice finding'])
  assert.equal(review.verdict, undefined, 'part of a review is never a verdict')
  assert.deepEqual(tookOf(run, 'final-review-slice-2'), [['agy:claude-sonnet-5-5', 'chosen']])
})

test('lanes off: no aether-lane command, and the slices run native as before', async (t) => {
  const args = slicedRun(t, null)
  delete args.lanes
  const run = await runWorkflow(args)
  ok(run)
  assert.equal(run.calls.some((c) => c.command && c.command.tool === 'aether-lane'), false)
  assert.deepEqual(natives(run, 'reviewer').map((c) => [c.model, c.effort]), [['opus', 'high'], ['opus', 'high']])
  assert.equal(run.result.finalReview.status, 'done')
  assert.equal(run.result.finalReview.provider, 'native')
  assert.deepEqual(run.result.finalReview.slicesBy, ['native', 'native'])
})

// The workflow's lane commands pass the real parsers: the mod's closed list (which runs them without a model) and the
// bin's own call id check. A stub answers them in the tests above, so only this one shows an id that the real list refuses.
test('every lane command of a sliced run is one the mod answers and the bin accepts, the slices\' included', async (t) => {
  const { parseOpsPrompt, PAYLOAD_PATH } = await import(path.join(PLUGIN, 'hooks', 'ops-command.mjs'))
  const CALL = require('../plugins/aether/lib/lane-pick.js').CALL
  const run = await runWorkflow(slicedRun(t), { lane: onSlices({ 'final-review-slice-1': [SONNET], 'final-review-slice-2': [SONNET] }) })
  ok(run)
  const lane = run.calls.filter((c) => c.kind.startsWith('ops:lane-'))
  assert.ok(lane.some((c) => c.lane.call === 'final-review-slice-1') && lane.some((c) => c.lane.call === 'final-review-slice-2'))
  for (const call of lane) {
    if (call.lane.call && call.command.verb !== 'pause') assert.ok(CALL.test(call.lane.call), `${call.command.line}: the bin accepts the call id`)
    if (!['pick', 'took', 'start', 'wait', 'result', 'stop', 'pause'].includes(call.command.verb)) continue
    assert.ok(parseOpsPrompt(call.prompt), `the mod answers: ${call.command.line}`)
    if (call.payload) assert.ok(PAYLOAD_PATH.test(call.payload.path), `the mod saves the payload: ${call.payload.path}`)
  }
})
