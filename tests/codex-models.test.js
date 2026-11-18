'use strict'

// No helper here: clear the test proxy before loading the real configuration (issue #254).
require('./env-proxy.js')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadPrices, priceEntry, ratesFor } = require('../plugins/aether/lib/prices.js')

const ROOT = path.join(__dirname, '..')
const CONFIG = path.join(ROOT, 'plugins', 'aether', 'config')
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(CONFIG, ...parts), 'utf8'))
const listing = read('models', 'harness-models.json').harnesses.codex
const index = read('models', 'models.json')
const profiles = read('models', 'profiles.json').profiles
const IN_USE = ['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna']
const OUT = ['gpt-6-astra', 'gpt-6.2-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-reserve', 'codex-auto-review']
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const pairs = loadPairs().pairs
const idOf = (entry) => (typeof entry === 'string' ? entry : entry.id)

test('the listing of the CLI is captured on its day with the twelve models, and everything left out has its reason (R16)', () => {
  assert.equal(listing.capturedAt, '2026-11-17')
  assert.deepEqual(listing.efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(listing.models.map(idOf).sort(), [...IN_USE, ...OUT].sort())
  for (const entry of listing.models.filter((item) => OUT.includes(idOf(item)))) {
    assert.ok(typeof entry.excluded === 'string' && entry.excluded.length > 20, idOf(entry))
  }
  for (const id of IN_USE) assert.equal(typeof listing.models.find((item) => idOf(item) === id) === 'string' || !listing.models.find((item) => idOf(item) === id).excluded, true, id)
  for (const id of ['gpt-6-astra', 'gpt-6.2-astra']) {
    const excluded = listing.models.find((item) => idOf(item) === id).excluded
    assert.ok(excluded.includes('Astra sigue fuera'), id)
    assert.ok(/Fable/.test(excluded), id)
    assert.ok(/only by the owner's decision/.test(excluded), id)
  }
  assert.equal(/reopens the question/.test(listing.models.find((item) => idOf(item) === 'gpt-6-astra').excluded), false, 'Astra no longer re-enters with a next generation')
  assert.ok(/generation/i.test(listing.models.find((item) => idOf(item) === 'gpt-6.1-sol').excluded))
  assert.ok(/hidden|internal/i.test(listing.models.find((item) => idOf(item) === 'gpt-reserve').excluded))
  assert.ok(/hidden|internal/i.test(listing.models.find((item) => idOf(item) === 'codex-auto-review').excluded))
  assert.ok(/generation/i.test(listing.models.find((item) => idOf(item) === 'gpt-6-sol').excluded))
  assert.ok(typeof listing.excludedEfforts.ultra === 'string' && /Artificial Analysis/.test(listing.excludedEfforts.ultra))
})

test('the index lists Sol, Terra and Luna with pair-table intelligence and Terminal-Bench fractions, and the others as excluded (R12, R16)', () => {
  assert.ok(index.harnesses.includes('codex'))
  assert.equal(index.listedOn.codex, '2026-11-17')
  const used = index.models.filter((model) => model.harness === 'codex')
  assert.deepEqual(used.map((model) => model.model).sort(), [...IN_USE].sort())
  for (const model of used) {
    assert.deepEqual(model.scores.map((score) => score.effort), ['low', 'medium', 'high', 'xhigh', 'max'])
    for (const score of model.scores) assert.equal(score.intelligence, pairs.find((row) => row.id === `codex/${model.model}@${score.effort}`).intelligence)
    for (const score of model.scores) assert.ok(typeof score.terminalBench === 'number' && score.terminalBench >= 0 && score.terminalBench <= 1)
  }
  const sol = used.find((model) => model.model === 'gpt-6.2-sol')
  assert.deepEqual([sol.scores[0].priceInput, sol.scores[0].priceOutput], [2, 10])
  const excluded = index.excluded.filter((entry) => entry.harness === 'codex')
  assert.deepEqual(excluded.map((entry) => entry.model).sort(), [...OUT].sort())
  assert.ok(excluded.every((entry) => typeof entry.reason === 'string' && entry.reason.length > 20))
  const haiku = index.models.find((model) => model.harness === 'claude' && model.alias === 'haiku')
  assert.equal(haiku.scores.find((score) => score.effort === 'high').intelligence, pairs.find((row) => row.id === 'claude/haiku@high').intelligence)
})

test('every Codex model of the index has a profile of OpenAI with its context (R14)', () => {
  const context = { 'gpt-6.2-sol': 500000, 'gpt-6.1-terra': 500000, 'gpt-6-luna': 272000 }
  for (const model of index.models.filter((item) => item.harness === 'codex')) {
    assert.equal(model.profile.contextTokens, context[model.model], model.model)
    assert.equal(model.maker, 'OpenAI')
  }
  for (const entry of index.excluded.filter((item) => item.harness === 'codex')) assert.ok(entry.profile, entry.model)
  assert.ok(Object.keys(profiles).length > 0)
})

test('the prices per million tokens are Sol 2/10, Terra 1/5 and Luna 0.1/0.5, and a lane call is priced from them (R14)', () => {
  const prices = loadPrices()
  assert.deepEqual([prices.models['gpt-6.1-sol'].input, prices.models['gpt-6.1-sol'].output], [2, 10])
  assert.deepEqual([prices.models['gpt-6.2-sol'].input, prices.models['gpt-6.2-sol'].output], [2, 10])
  assert.deepEqual([prices.models['gpt-6.1-terra'].input, prices.models['gpt-6.1-terra'].output], [1, 5])
  assert.deepEqual([prices.models['gpt-6-luna'].input, prices.models['gpt-6-luna'].output], [0.1, 0.5])
  assert.ok(ratesFor(prices, 'gpt-6.1-sol'))
  assert.ok(ratesFor(prices, 'gpt-6.2-sol'))
  const MILLION = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 0 }
  assert.ok(Math.abs(priceEntry({ model: 'gpt-6.1-sol', agent: 'lane', ...MILLION }, prices) - (2 + 10 + 0.2)) < 1e-9)
})
