'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { choose } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const CONFIG = path.join(__dirname, '..', 'plugins', 'aether', 'config')
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(CONFIG, ...parts), 'utf8'))
const { pairs } = loadPairs()
const config = lanes.loadConfig(lanes.CONFIG_FILE)
const OPEN = { usable: true, unknown: false, mark: null, resetsAt: '2026-11-20T00:00:00Z' }
const DRY = { usable: false, unknown: false, mark: null, resetsAt: '2026-11-20T00:00:00Z' }
// The world the design fixes: only agy installed and on, the Hydrogen group open, every other harness off. The group of agy's Claude
// models is dry (agy reports 4.4 % free, not usable) unless the test opens it.
const world = ({ claude = DRY } = {}) => ({ agy: { installed: true, groups: { argon: OPEN, hydrogen: OPEN, claude } } })
const ask = (model, effort, harnesses = world()) => choose({ pairs, reference: { model, effort }, harnesses, role: 'implementer', lanes: config })
const pickedId = (decision) => (decision.picked ? decision.picked.id : null)
const why = (decision, id) => decision.candidates.find((c) => c.id === id).why

test('with only agy, its Claude group dry and Hydrogen open, an implementer call lands on Hydrogen by intelligence and cost alone', () => {
  assert.equal(pickedId(ask('haiku', 'high')), 'agy/gemini-4-hydrogen@medium')
  assert.equal(pickedId(ask('haiku', 'xhigh')), 'agy/gemini-4-hydrogen@medium')
  assert.equal(pickedId(ask('sonnet', 'high')), 'agy/gemini-4-hydrogen@medium')
  assert.equal(pickedId(ask('opus', 'high')), 'agy/gemini-4-hydrogen@high')
  assert.equal(pickedId(ask('opus', 'xhigh')), null)
})

test('no implementer call is refused for a code figure: no candidate carries the outcome below-code', () => {
  for (const [model, effort] of [['haiku', 'high'], ['sonnet', 'high'], ['opus', 'high'], ['opus', 'xhigh']]) {
    assert.ok(ask(model, effort).candidates.every((c) => c.why !== 'below-code'), `${model} ${effort}`)
  }
  assert.equal(why(ask('sonnet', 'high'), 'agy/gemini-4-hydrogen@low'), 'below')
})

test('for Opus xhigh no Hydrogen pair is a candidate, and Opus high takes Hydrogen high', () => {
  const decision = ask('opus', 'xhigh')
  const hydrogen = decision.candidates.filter((c) => c.id.startsWith('agy/gemini-4-hydrogen@'))
  assert.equal(hydrogen.length, 4)
  assert.ok(hydrogen.every((c) => c.outcome === 'passed'))
  assert.equal(pickedId(ask('opus', 'high')), 'agy/gemini-4-hydrogen@high')
})

test('with the Claude group of agy open, an agy Claude pair takes the call where it is cheaper than Hydrogen, and the rest stay on Hydrogen', () => {
  const open = world({ claude: OPEN })
  assert.equal(pickedId(ask('haiku', 'high', open)), 'agy/claude-sonnet-5-5@medium')
  assert.equal(pickedId(ask('haiku', 'xhigh', open)), 'agy/gemini-4-hydrogen@medium')
  assert.equal(pickedId(ask('sonnet', 'high', open)), 'agy/gemini-4-hydrogen@medium')
  assert.equal(pickedId(ask('opus', 'high', open)), 'agy/gemini-4-hydrogen@high')
})

test('Flash is gone from the pairs and the lane table, and its group is called hydrogen', () => {
  assert.equal(pairs.some((pair) => /gemini-3\.8-flash|gemini-3-8-flash/.test(`${pair.id} ${pair.slug} ${pair.model} ${pair.family}`)), false)
  const agy = config.harnesses.agy
  assert.deepEqual(Object.keys(agy.groups).sort(), ['argon', 'claude', 'hydrogen'])
  assert.equal(agy.groups.hydrogen, 'Gemini Models')
  assert.equal(Object.hasOwn(agy.models, 'gemini-3.8-flash'), false)
  assert.deepEqual([agy.models['gemini-4-hydrogen'].group, agy.models['gemini-4-hydrogen'].roles], ['hydrogen', ['implementer']])
  assert.deepEqual(pairs.filter((pair) => pair.model === 'gemini-4-hydrogen').map((pair) => [pair.effort, pair.group]), [['low', 'hydrogen'], ['medium', 'hydrogen'], ['high', 'hydrogen'], ['xhigh', 'hydrogen']])
})

test('harness-models.json and models.json give Flash as replaced by Hydrogen, with the date and the figures, and Hydrogen as in use at its four efforts', () => {
  const declared = read('models', 'harness-models.json').harnesses.agy.superseded['gemini-3.8-flash']
  assert.equal(declared.by, 'gemini-4-hydrogen')
  assert.match(declared.on, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(declared.reason.length > 20 && declared.figures.length > 20)
  const index = read('models', 'models.json')
  assert.ok(index.superseded.some((entry) => entry.harness === 'agy' && entry.id === 'gemini-3.8-flash' && entry.supersededBy === 'gemini-4-hydrogen' && entry.on === declared.on && entry.figures === declared.figures))
  const hydrogen = index.models.find((entry) => entry.harness === 'agy' && entry.model === 'gemini-4-hydrogen')
  assert.deepEqual(hydrogen.efforts, ['low', 'medium', 'high', 'xhigh'])
  assert.deepEqual(hydrogen.lane, { roles: ['implementer'] })
  assert.equal(index.models.some((entry) => entry.model === 'gemini-3.8-flash'), false)
  assert.equal(read('prices.json').models['gemini-3.8-flash'].input, 0.75, 'the price entry of Flash stays, to price old usage')
  assert.equal(Object.hasOwn(read('models', 'profiles.json').profiles, 'gemini-3-8-flash'), false)
})
