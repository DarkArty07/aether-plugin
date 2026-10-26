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

test('(a) the lane table passes its own validation with the Spark entry and rule 2 with calledNotListed', () => {
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

  // Rule 2 check with calledNotListed in harness-models.json
  const listings = read('models', 'harness-models.json')
  assert.ok(Array.isArray(listings.harnesses?.muse?.calledNotListed), 'calledNotListed is an array in muse listing')
  const called = listings.harnesses.muse.calledNotListed.map((m) => (typeof m === 'string' ? m : m.id))
  assert.ok(called.includes('muse-spark-1.3'), 'muse-spark-1.3 is in calledNotListed')
  // Ensure it was NOT added to models list
  const listed = (listings.harnesses?.muse?.models ?? []).map((m) => (typeof m === 'string' ? m : m.id))
  assert.equal(listed.includes('muse-spark-1.3'), false, 'spark must not be in captured models list')
})

test('(b) routing picks muse-spark-1.3 for Haiku and Sonnet high ahead of Wonder Full', () => {
  const { pairs } = loadPairs()
  const open = (hours) => ({ usable: true, quota: { windows: { weekly: { remaining: 0.5, resetsAt: new Date(Date.now() + hours * 3600000).toISOString() } } } })
  const harnesses = { muse: { installed: true, groups: { muse: open(1) } } }

  const pickFor = (model, effort) => {
    const decision = choose({ pairs, reference: { model, effort }, harnesses })
    return decision.picked ? decision.picked.id : null
  }

  assert.equal(pickFor('haiku', 'high'), 'muse/muse-spark-1.3@xhigh')
  assert.equal(pickFor('haiku', 'max'), 'muse/muse-spark-1.3@xhigh')
  assert.equal(pickFor('sonnet', 'high'), 'muse/muse-spark-1.3@max')
  assert.equal(pickFor('opus', 'high'), 'muse/muse-wonder-full-1.0@high')
})

test('(c) muse-spark-1.3 has pairs at xhigh and max, and none at high, medium or low', () => {
  const { pairs } = loadPairs()
  const sparkPairs = pairs.filter((p) => p.harness === 'muse' && p.model === 'muse-spark-1.3')
  const efforts = sparkPairs.map((p) => p.effort).sort()
  assert.deepEqual(efforts, ['max', 'xhigh'])
  for (const unwanted of ['low', 'medium', 'high']) {
    assert.equal(sparkPairs.some((p) => p.effort === unwanted), false, `muse-spark-1.3 must have no pair at ${unwanted}`)
  }
})

test('(d) the index builder gives muse-spark-1.3 the efforts of its calledNotListed entry, so a rebuild keeps max, and Wonder Full keeps the capture\'s', () => {
  const { harnessEntries } = require('../scripts/build-models-index.js')
  const entries = harnessEntries(read('lanes.json'), read('models', 'harness-models.json'), ['muse'], loadPairs().pairs)
  const spark = entries.find((entry) => entry.model === 'muse-spark-1.3')
  assert.deepEqual(spark.detail.efforts, ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  const wonder = entries.find((entry) => entry.model === 'muse-wonder-full-1.0')
  assert.equal(wonder.detail.efforts.includes('max'), false, 'the capture says Wonder Full has no max')
})
