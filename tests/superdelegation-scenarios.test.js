'use strict'

// Scenario tests of superdelegation (spec 009): the real pairs table, the one choice function and the swarm
// workflow, with fixed quota views and stubbed agents. No quota, no tokens, no network.

const test = require('node:test')
const assert = require('node:assert/strict')
const { choose } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const { pairs } = loadPairs()
const group = (days) => ({ usable: true, unknown: false, mark: null, resetsAt: new Date(Date.UTC(2026, 9, 20) + days * 24 * 3600 * 1000).toISOString() })
const dry = { usable: false, unknown: false, mark: null, resetsAt: '2026-10-21T00:00:00.000Z' }
const healthy = { agy: { installed: true, groups: { argon: group(2), flash: group(2), claude: group(3) } }, grok: { installed: true, groups: { grok: group(1) } } }
const sick = { agy: { installed: true, groups: { argon: dry, flash: dry, claude: dry } }, grok: { installed: true, groups: { grok: dry } } }
const oneDry = { ...healthy, agy: { installed: true, groups: { argon: dry, flash: dry, claude: group(3) } }, grok: { installed: true, groups: { grok: dry } } }
const ask = (harnesses, model = 'sonnet', effort = 'high') => choose({ pairs, reference: { model, effort }, harnesses })

test('C15, no quota spent: with every quota healthy the Sonnet-level work leaves native Claude', () => {
  for (const [model, effort] of [['sonnet', 'high'], ['sonnet', 'xhigh'], ['opus', 'high']]) {
    const d = ask(healthy, model, effort)
    assert.ok(d.picked, `${model} ${effort}`)
    assert.notEqual(d.picked.harness, 'claude')
  }
})

test('C15, no quota spent: with every eligible quota dry the work falls to native, in its reference pair', () => {
  for (const [model, effort] of [['haiku', 'high'], ['sonnet', 'high'], ['sonnet', 'xhigh'], ['opus', 'high']]) {
    const d = ask(sick, model, effort)
    assert.equal(d.picked, null)
    assert.equal(d.native.id, `claude/${model}@${effort}`)
  }
})

test('C15, no quota spent: with one quota dry and another healthy the call goes to the healthy one', () => {
  const d = ask(oneDry, 'sonnet', 'xhigh')
  assert.ok(d.picked)
  assert.equal(d.picked.group, 'claude')
})

test('C16, no quota spent: with only Muse healthy an Opus high call goes to Muse by the owner decision, and an Opus xhigh call falls to native', () => {
  const onlyMuse = { muse: { installed: true, groups: { muse: group(2) } } }
  assert.equal(ask(onlyMuse, 'opus', 'high').picked.id, 'muse/muse-wonder-full-1.0@high')
  const d = ask(onlyMuse, 'opus', 'xhigh')
  assert.equal(d.picked, null)
  assert.equal(d.native.id, 'claude/opus@xhigh')
})

test('C15 through the swarm: a unit runs on the pair pick gives when quotas are healthy, and native when they are dry', async (t) => {
  const lanes = { superdelegation: true, harnesses: ['agy'], maxParallelByHarness: { agy: 2 }, waits: { implementer: 3, supervisor: 2, reviewer: 2 }, cupo: { polls: 2, pollSeconds: 60 } }
  const args = { ...compile(makeRepo(t), plan([task(1, { tier: 'sonnet high — a reason' })])), lanes }
  // Stands in for `aether-lane pick`: the real choice function on the real table, over the run's one harness.
  const withViews = (all) => async (call, fallback) => {
    if (call.command.verb !== 'pick') return fallback(call)
    const f = call.lane
    const harnesses = Object.fromEntries(lanes.harnesses.map((name) => [name, all[name]]))
    const d = choose({
      pairs,
      reference: { model: f.model, effort: f.effort },
      harnesses,
      exclude: f.exclude ? f.exclude.split(',') : [],
      authors: f.author ? [f.author] : [],
      nativeDiffers: f.role !== 'implementer',
    })
    return { call: f.call, role: f.role, ...d }
  }
  const external = await runWorkflow(args, { lane: withViews(healthy) })
  assert.equal(external.error, null, external.error && external.error.stack)
  assert.ok(external.calls.some((c) => c.kind === 'ops:lane-start'))
  assert.equal(external.calls.filter((c) => c.role === 'implementer').length, 0)
  const native = await runWorkflow(args, { lane: withViews(sick) })
  assert.equal(native.error, null, native.error && native.error.stack)
  assert.equal(native.calls.some((c) => c.kind === 'ops:lane-start'), false)
  assert.ok(native.calls.some((c) => c.role === 'implementer'))
})
