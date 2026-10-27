'use strict'

// Issue #101: Muse Spark 1.3 enters the lane table and pairs table so that Haiku-level
// calls are routed to Spark 1.3 instead of Wonder Full.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const lanes = require('../plugins/aether/lib/lanes.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { choose } = require('../plugins/aether/lib/superdelegation.js')

const CONFIG = path.join(__dirname, '..', 'plugins', 'aether', 'config')
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(CONFIG, ...parts), 'utf8'))

test('(a) the lane table passes its own validation with the Spark entry, and the CLI lists Spark since the capture of 2026-10-27', () => {
  const config = lanes.loadConfig()
  assert.ok(config.harnesses.muse)
  assert.ok(config.harnesses.muse.models['muse-spark-1.3'], 'muse-spark-1.3 is in config/lanes.json')
  const spark = config.harnesses.muse.models['muse-spark-1.3']
  assert.equal(spark.group, 'muse')
  assert.deepEqual(spark.roles, ['implementer', 'reviewer'])
  assert.equal(spark.aa?.slug, 'muse-spark-1-3')
  assert.equal(spark.aa?.intelligence, 48.1)
  assert.equal(spark.aa?.terminalBench, 0.33)
  assert.match(spark.ownerDecision, /infinitamente mas barato|nivel haiku o sonnet/)

  // Rule 2: the CLI lists it since muse 1.4.13 (model/list of muse serve, captured 2026-10-27), so it needs no calledNotListed entry
  const listings = read('models', 'harness-models.json')
  const listed = (listings.harnesses?.muse?.models ?? []).map((m) => (typeof m === 'string' ? m : m.id))
  assert.ok(listed.includes('muse-spark-1.3'), 'muse-spark-1.3 is in the captured models list')
  assert.equal(listings.harnesses.muse.capturedAt, '2026-10-27')
  const called = (listings.harnesses.muse.calledNotListed ?? []).map((m) => (typeof m === 'string' ? m : m.id))
  assert.equal(called.includes('muse-spark-1.3'), false, 'a listed model is not also called-but-not-listed')
})

test('(b) routing picks muse-spark-1.3 for Haiku and Sonnet high ahead of Wonder Full', () => {
  const { pairs } = loadPairs()
  const open = (hours) => ({ usable: true, quota: { windows: { weekly: { remaining: 0.5, resetsAt: new Date(Date.now() + hours * 3600000).toISOString() } } } })
  const harnesses = { muse: { installed: true, groups: { muse: open(1) } } }

  const pickFor = (model, effort) => {
    const decision = choose({ pairs, reference: { model, effort }, harnesses })
    return decision.picked ? decision.picked.id : null
  }

  // The estimated rows carry an estimated cost only so the router can rank them: compareCandidates
  // sorts a pair with no cost as Infinity, after every pair with a cost, so with null costs the measured
  // @xhigh and @max would always win. A Haiku high call (37.8 asked, floor 36.8) takes @medium (38.0)
  // as the cheapest pair that is enough.
  assert.equal(pickFor('haiku', 'high'), 'muse/muse-spark-1.3@medium')
  // Haiku max still takes @xhigh: @high at 41.0 points does not reach the floor, so @xhigh (45.1)
  // is the cheapest pair that reaches it.
  assert.equal(pickFor('haiku', 'max'), 'muse/muse-spark-1.3@xhigh')
  // Sonnet high (46.8 asked, at least 45.8) still lands on @max: @xhigh at 45.1 points falls short.
  assert.equal(pickFor('sonnet', 'high'), 'muse/muse-spark-1.3@max')
  assert.equal(pickFor('opus', 'high'), 'muse/muse-wonder-full-1.0@high')
})

test('(c) muse-spark-1.3 has pairs at low, medium, high, xhigh and max, and none at minimal', () => {
  const { pairs } = loadPairs()
  const sparkPairs = pairs.filter((p) => p.harness === 'muse' && p.model === 'muse-spark-1.3')
  const efforts = sparkPairs.map((p) => p.effort).sort()
  assert.deepEqual(efforts, ['high', 'low', 'max', 'medium', 'xhigh'])
  assert.equal(sparkPairs.some((p) => p.effort === 'minimal'), false, 'muse-spark-1.3 must have no pair at minimal: no curve below low to base it on')
})

test('(e) the low, medium and high rows are the owner-estimated points and costs of 2026-10-27, with no minimal row', () => {
  const { pairs } = loadPairs()
  const sparkPairs = pairs.filter((p) => p.harness === 'muse' && p.model === 'muse-spark-1.3')
  const estimated = Object.fromEntries(sparkPairs.filter((p) => ['low', 'medium', 'high'].includes(p.effort)).map((p) => [p.effort, p]))
  assert.deepEqual(Object.keys(estimated).sort(), ['high', 'low', 'medium'])
  assert.deepEqual([estimated.low.intelligence, estimated.medium.intelligence, estimated.high.intelligence], [32.0, 38.0, 41.0])
  assert.deepEqual([estimated.low.costPerTaskUsd, estimated.medium.costPerTaskUsd, estimated.high.costPerTaskUsd], [0.19, 0.43, 0.66])
  for (const [effort, pair] of Object.entries(estimated)) {
    assert.deepEqual([pair.harness, pair.model, pair.family, pair.group], ['muse', 'muse-spark-1.3', 'muse-spark-1.3', 'muse'], effort)
    assert.deepEqual([pair.outputTokensPerSecond, pair.timeToFirstTokenS], [null, null], effort)
    assert.match(pair.ownerDecision, /reocmendado/, `${effort}: quotes the owner's words`)
    assert.match(pair.ownerDecision, /2026-10-27/, `${effort}: carries the date of the decision`)
    assert.match(pair.ownerDecision, /stimat/, `${effort}: marked as an estimate, not a measurement`)
    assert.match(pair.ownerDecision, /no page/, `${effort}: says plainly that Artificial Analysis has no page for these efforts`)
    assert.match(pair.ownerDecision, /cost.{0,120}estimat/i, `${effort}: says the cost is an estimate too`)
  }
  // Each new row keeps a slug of its own, naming no Artificial Analysis page (the validation asks only
  // for a non-empty string, as with muse-wonder-full-1.0 reusing another page's slug).
  const slugs = sparkPairs.map((p) => p.slug)
  assert.equal(new Set(slugs).size, slugs.length, 'every Spark row has a distinct slug')
  assert.equal(sparkPairs.some((p) => p.effort === 'minimal'), false)

  // The estimates are live candidates, not dead rows: with the measured Spark pairs and Wonder Full out
  // (a retry chain excludes them), a Haiku high call falls to the estimated @medium, with @high next.
  const open = (hours) => ({ usable: true, quota: { windows: { weekly: { remaining: 0.5, resetsAt: new Date(Date.now() + hours * 3600000).toISOString() } } } })
  const harnesses = { muse: { installed: true, groups: { muse: open(1) } } }
  const excluded = ['muse/muse-spark-1.3@xhigh', 'muse/muse-spark-1.3@max', 'muse/muse-wonder-full-1.0@high']
  const decision = choose({ pairs, reference: { model: 'haiku', effort: 'high' }, harnesses, exclude: excluded })
  assert.equal(decision.picked.id, 'muse/muse-spark-1.3@medium')
  const outcome = Object.fromEntries(decision.candidates.filter((c) => c.id.startsWith('muse/muse-spark-1.3@')).map((c) => [c.id, [c.outcome, c.why]]))
  assert.deepEqual(outcome['muse/muse-spark-1.3@high'], ['next', null])
  assert.deepEqual(outcome['muse/muse-spark-1.3@low'], ['passed', 'below'], '32 points do not reach the 36.8 a Haiku high call asks for')
})

test('(d) the index builder gives Spark 1.3 and the Wonders the efforts of the capture, max included', () => {
  const { harnessEntries } = require('../scripts/build-models-index.js')
  const entries = harnessEntries(read('lanes.json'), read('models', 'harness-models.json'), ['muse'], loadPairs().pairs)
  const spark = entries.find((entry) => entry.model === 'muse-spark-1.3')
  assert.deepEqual(spark.detail.efforts, ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  const wonder = entries.find((entry) => entry.model === 'muse-wonder-full-1.0')
  assert.equal(wonder.detail.efforts.includes('max'), true, 'the capture of 2026-10-27 says Wonder Full takes max')
})
