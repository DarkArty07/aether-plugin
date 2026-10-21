'use strict'

// A swarm lane call that began and then failed asks `aether-lane pick` for the next pair,
// up to three pairs that began a call, before it runs native. These tests keep every role
// but the one under test native, so the `lanes` counters count only that role's calls.

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow, laneAnswer, laneOf } = require('./workflow-harness.js')

const LANES = {
  superdelegation: true,
  harnesses: ['agy', 'codex', 'grok'],
  maxParallelByHarness: { agy: 4, codex: 4, grok: 4 },
  waits: { implementer: 3, supervisor: 2, reviewer: 2 },
  cupo: { polls: 2, pollSeconds: 60 },
}
const FAMILY = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }

const pairOf = (harness, model, effort) => ({ id: `${harness}/${model}@${effort}`, harness, model, family: model, effort, group: null, intelligence: 40, costPerTaskUsd: 1 })
const FLASH = pairOf('agy', 'gemini-3.8-flash', 'high')
const CODEX = pairOf('codex', 'gpt-5.5-codex', 'high')
const GROK = pairOf('grok', 'grok-4.7', 'high')
const SONNET = pairOf('agy', 'claude-sonnet-5-5', 'high')
const OPUS = pairOf('agy', 'claude-opus-5-5', 'high')

function onPairs(more = (call, fallback) => fallback(call), pairs = {}) {
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
const starts = (run, role) => run.calls.filter((c) => c.kind === 'ops:lane-start' && (!role || c.lane.role === role))
const picks = (run, role) => run.calls.filter((c) => c.kind === 'ops:lane-pick' && c.lane.role === role)
const native = (run, role) => run.calls.filter((c) => c.role === role)
const tookOf = (run, id) => run.calls.filter((c) => c.kind === 'ops:lane-took' && c.lane.call === id).map((c) => [c.lane.by, c.lane.cause])
const isCall = (call, verb, id) => call.command.verb === verb && call.lane.call === id
const onWait = (call, id, pair) => isCall(call, 'wait', id) && call.started && call.started.model === pair.model
const finished = (call, fields) => laneAnswer({ lane: laneOf(call.started), ...fields })
const lineFor = (pair, reason) => `${pair.harness} ${pair.model}-high stopped before it finished: ${reason}. Its uncommitted work, if any, is in the worktree. Continue from it.`

test('an implementer whose first pair ends quota is retried on the second pair, which ends ok', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs(
      (call, fallback) => (onWait(call, 'task-1-1-implement', FLASH) ? finished(call, { status: 'quota', detail: 'exit 1: quota exhausted' }) : fallback(call)),
      { implementer: [FLASH, CODEX] },
    ),
  })
  ok(run)
  assert.equal(native(run, 'implementer').length, 0)
  assert.deepEqual(starts(run, 'implementer').map((c) => c.lane.model), [FLASH.model, CODEX.model])
  assert.deepEqual(picks(run, 'implementer').map((c) => c.lane.exclude), [undefined, FLASH.id])
  const [, second] = starts(run, 'implementer')
  assert.ok(second.payload.text.includes(`## An external agent began this attempt\n${lineFor(FLASH, 'its quota ran out')}`), second.payload.text)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.equal(unit.attempts, 1)
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].laneFailure], [
    'codex gpt-5.5-codex-high',
    { harness: 'agy', model: 'gemini-3.8-flash-high', reason: 'its quota ran out' },
  ])
  assert.deepEqual(run.result.lanes, { calls: 2, ok: 1, failed: 0, quota: 1, violation: 0, blocked: 0, unavailable: 0, overflow: 0 })
  assert.deepEqual(tookOf(run, 'task-1-1-implement'), [['codex:gpt-5.5-codex', 'chosen']])
})

test('three pairs in a row failing end on the native implementer, and the fourth pair is not asked', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs(
      (call, fallback) => {
        if (onWait(call, 'task-1-1-implement', FLASH)) return finished(call, { status: 'failed', detail: 'exit 1: model not found' })
        if (onWait(call, 'task-1-1-implement', CODEX)) return finished(call, { status: 'quota', detail: 'exit 1: quota exhausted' })
        if (onWait(call, 'task-1-1-implement', GROK)) return { done: false }
        return fallback(call)
      },
      { implementer: [FLASH, CODEX, GROK, SONNET] },
    ),
  })
  ok(run)
  assert.deepEqual(starts(run, 'implementer').map((c) => c.lane.model), [FLASH.model, CODEX.model, GROK.model])
  assert.deepEqual(picks(run, 'implementer').map((c) => c.lane.exclude), [undefined, FLASH.id, `${FLASH.id},${CODEX.id}`])
  const [attempt] = native(run, 'implementer')
  assert.equal(native(run, 'implementer').length, 1)
  const section = ['## An external agent began this attempt', lineFor(FLASH, 'exit 1: model not found'), lineFor(CODEX, 'its quota ran out'), lineFor(GROK, 'the wait cap ran out')].join('\n')
  assert.ok(attempt.prompt.endsWith(section), attempt.prompt)
  const unit = run.result.units[0]
  assert.equal(unit.attempts, 1)
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].laneFailure], ['native', { harness: 'grok', model: 'grok-4.7-high', reason: 'the wait cap ran out' }])
  assert.deepEqual(run.result.lanes, { calls: 3, ok: 0, failed: 2, quota: 1, violation: 0, blocked: 0, unavailable: 0, overflow: 0 })
  assert.deepEqual(tookOf(run, 'task-1-1-implement'), [['native', 'failed']])
})

test('a supervisor lane that fails goes to the second pair, and no native supervisor runs', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs(
      (call, fallback) => (onWait(call, 'task-1-1-supervise', SONNET) ? finished(call, { status: 'failed', detail: 'exit 1: supervisor down' }) : fallback(call)),
      { supervisor: [SONNET, OPUS] },
    ),
  })
  ok(run)
  assert.equal(native(run, 'supervisor').length, 0)
  assert.deepEqual(starts(run, 'supervisor').map((c) => c.lane.model), [SONNET.model, OPUS.model])
  assert.deepEqual(picks(run, 'supervisor').map((c) => c.lane.exclude), [undefined, SONNET.id])
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.equal(unit.attempts, 1)
  assert.equal(unit.rounds[0].reviewProvider, 'agy claude-opus-5-5-high')
  assert.deepEqual(run.result.lanes, { calls: 2, ok: 1, failed: 1, quota: 0, violation: 0, blocked: 0, unavailable: 0, overflow: 0 })
  assert.deepEqual(tookOf(run, 'task-1-1-supervise'), [['agy:claude-opus-5-5', 'chosen']])
})

test('the whole-package final review lane that fails goes to the second pair, and no native reviewer runs', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs(
      (call, fallback) => (onWait(call, 'final-review', SONNET) ? finished(call, { status: 'failed', detail: 'exit 1: reviewer down' }) : fallback(call)),
      { reviewer: [SONNET, OPUS] },
    ),
  })
  ok(run)
  assert.equal(native(run, 'reviewer').length, 0)
  assert.deepEqual(starts(run, 'reviewer').map((c) => c.lane.model), [SONNET.model, OPUS.model])
  assert.deepEqual(picks(run, 'reviewer').map((c) => c.lane.exclude), [undefined, SONNET.id])
  assert.deepEqual([run.result.finalReview.status, run.result.finalReview.provider], ['done', 'agy claude-opus-5-5-high'])
  assert.deepEqual(run.result.lanes, { calls: 2, ok: 1, failed: 1, quota: 0, violation: 0, blocked: 0, unavailable: 0, overflow: 0 })
  assert.deepEqual(tookOf(run, 'final-review'), [['agy:claude-opus-5-5', 'chosen']])
})

test('a violation and a blocked outcome are not retried', async (t) => {
  const violation = await runWorkflow(lanesRun(t), {
    lane: onPairs(
      (call, fallback) =>
        onWait(call, 'task-1-1-supervise', SONNET) ? finished(call, { status: 'violation', detail: 'changes outside Owns', files: ['other/x.js'] }) : fallback(call),
      { supervisor: [SONNET, OPUS] },
    ),
  })
  ok(violation)
  assert.deepEqual(starts(violation, 'supervisor').map((c) => c.lane.model), [SONNET.model])
  assert.equal(native(violation, 'supervisor').length, 1)
  assert.equal(violation.result.lanes.violation, 1)

  const blocked = await runWorkflow(lanesRun(t), {
    lane: onPairs(
      (call, fallback) =>
        onWait(call, 'task-1-1-implement', FLASH) ? finished(call, { status: 'blocked', detail: 'the integration worktree changed during the lane call' }) : fallback(call),
      { implementer: [FLASH, CODEX] },
    ),
  })
  ok(blocked)
  assert.deepEqual(starts(blocked, 'implementer').map((c) => c.lane.model), [FLASH.model])
  assert.equal(native(blocked, 'implementer').length, 0)
  assert.deepEqual([blocked.result.units[0].status, blocked.result.units[0].reason], ['blocked', 'lane: the integration worktree changed during the lane call'])
  assert.equal(blocked.result.lanes.blocked, 1)
})

test('a pair that failed is never asked again in the same call, and an unavailable start still asks for the next pair without counting', async (t) => {
  const run = await runWorkflow(lanesRun(t), {
    lane: onPairs(
      (call, fallback) => {
        if (isCall(call, 'start', 'task-1-1-implement') && call.lane.model === FLASH.model) return { unavailable: 'quota' }
        if (onWait(call, 'task-1-1-implement', CODEX)) return finished(call, { status: 'failed', detail: 'exit 1: down' })
        if (onWait(call, 'task-1-1-implement', GROK)) return finished(call, { status: 'quota', detail: 'exit 1: quota exhausted' })
        return fallback(call)
      },
      { implementer: [FLASH, CODEX, GROK, SONNET] },
    ),
  })
  ok(run)
  assert.equal(native(run, 'implementer').length, 0)
  assert.deepEqual(starts(run, 'implementer').map((c) => c.lane.model), [FLASH.model, CODEX.model, GROK.model, SONNET.model])
  assert.deepEqual(picks(run, 'implementer').map((c) => c.lane.exclude), [undefined, FLASH.id, `${FLASH.id},${CODEX.id}`, `${FLASH.id},${CODEX.id},${GROK.id}`])
  const started = starts(run, 'implementer')
  assert.equal(started[1].payload.text.includes('## An external agent began this attempt'), false)
  const section = ['## An external agent began this attempt', lineFor(CODEX, 'exit 1: down'), lineFor(GROK, 'its quota ran out')].join('\n')
  assert.ok(started[3].payload.text.includes(section), started[3].payload.text)
  const unit = run.result.units[0]
  assert.deepEqual([unit.rounds[0].provider, unit.rounds[0].laneFailure], ['agy claude-sonnet-5-5-high', { harness: 'grok', model: 'grok-4.7-high', reason: 'its quota ran out' }])
  assert.deepEqual(run.result.lanes, { calls: 3, ok: 1, failed: 1, quota: 1, violation: 0, blocked: 0, unavailable: 1, overflow: 0 })
  assert.deepEqual(tookOf(run, 'task-1-1-implement'), [['agy:claude-sonnet-5-5', 'chosen']])
})
