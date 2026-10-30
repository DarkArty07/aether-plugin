'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { loadPrices, priceEntry, ratesFor } = require('../plugins/aether/lib/prices.js')

const ROOT = path.join(__dirname, '..')
const CONFIG = path.join(ROOT, 'plugins', 'aether', 'config')
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(CONFIG, ...parts), 'utf8'))
const listing = read('models', 'harness-models.json').harnesses.codex
const index = read('models', 'models.json')
const profiles = read('models', 'profiles.json').profiles
const IN_USE = ['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna']
const OUT = ['gpt-6-astra', 'gpt-6-sol', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-reserve', 'codex-auto-review']
const POINTS = {
  'gpt-6.1-sol': [34.5, 46.1, 50.2, 52.3, 54.5],
  'gpt-6.1-terra': [29.2, 38.1, 42.3, 45.0, 51.0],
  'gpt-6-luna': [9.7, 18.3, 21.4, 23.3, 27.8],
}
// Terminal-Bench 4.0 of AA (2026-10-29, the AA list of tests/fixtures/codex/aa-api-2026-10-29.json, as a share: 30.8 % is 0.308), effort by effort.
const TERMINAL = {
  'gpt-6.1-sol': [0.308, 0.48, 0.515, 0.54, 0.561],
  'gpt-6.1-terra': [0.152, 0.323, 0.419, 0.465, 0.556],
  'gpt-6-luna': [0, 0.025, 0.045, 0.081, 0.126],
}
const idOf = (entry) => (typeof entry === 'string' ? entry : entry.id)

test('the listing of the CLI is captured on its day with the ten models, and everything left out has its reason (R16)', () => {
  assert.equal(listing.capturedAt, '2026-10-29')
  assert.deepEqual(listing.efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(listing.models.map(idOf).sort(), [...IN_USE, ...OUT].sort())
  for (const entry of listing.models.filter((item) => OUT.includes(idOf(item)))) {
    assert.ok(typeof entry.excluded === 'string' && entry.excluded.length > 20, idOf(entry))
  }
  for (const id of IN_USE) assert.equal(typeof listing.models.find((item) => idOf(item) === id) === 'string' || !listing.models.find((item) => idOf(item) === id).excluded, true, id)
  const astra = listing.models.find((item) => idOf(item) === 'gpt-6-astra').excluded
  assert.ok(astra.includes('no lo vamos a usar hasta que salga astra 6.1'))
  assert.ok(/GPT-6\.1 Astra/.test(astra) && /Fable 5\.1/.test(astra) && /A43/.test(astra))
  assert.ok(/hidden|internal/i.test(listing.models.find((item) => idOf(item) === 'gpt-reserve').excluded))
  assert.ok(/hidden|internal/i.test(listing.models.find((item) => idOf(item) === 'codex-auto-review').excluded))
  assert.ok(/generation/i.test(listing.models.find((item) => idOf(item) === 'gpt-6-sol').excluded))
  assert.ok(typeof listing.excludedEfforts.ultra === 'string' && /Artificial Analysis/.test(listing.excludedEfforts.ultra))
})

test('the index lists Sol, Terra and Luna at the five efforts with the figures of AA of 2026-10-29, and the others as excluded with their reason (R12, R16)', () => {
  assert.ok(index.harnesses.includes('codex'))
  assert.equal(index.listedOn.codex, '2026-10-29')
  const used = index.models.filter((model) => model.harness === 'codex')
  assert.deepEqual(used.map((model) => model.model).sort(), [...IN_USE].sort())
  for (const model of used) {
    assert.deepEqual(model.scores.map((score) => score.effort), ['low', 'medium', 'high', 'xhigh', 'max'])
    assert.deepEqual(model.scores.map((score) => score.intelligence), POINTS[model.model])
    assert.deepEqual(model.scores.map((score) => score.terminalBench), TERMINAL[model.model], 'Terminal-Bench lives in the scores of the index, one figure for each effort')
  }
  const sol = used.find((model) => model.model === 'gpt-6.1-sol')
  assert.deepEqual([sol.scores[0].priceInput, sol.scores[0].priceOutput], [2, 10])
  const excluded = index.excluded.filter((entry) => entry.harness === 'codex')
  assert.deepEqual(excluded.map((entry) => entry.model).sort(), [...OUT].sort())
  assert.ok(excluded.every((entry) => typeof entry.reason === 'string' && entry.reason.length > 20))
  const haiku = index.models.find((model) => model.harness === 'claude' && model.alias === 'haiku')
  assert.equal(haiku.scores.find((score) => score.effort === 'high').intelligence, 29.6, 'the committed index carries the 2026-10-29 scale for the other harnesses too')
})

test('every Codex model of the index has a profile of OpenAI with its context (R14)', () => {
  const context = { 'gpt-6.1-sol': 500000, 'gpt-6.1-terra': 500000, 'gpt-6-luna': 272000 }
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
  assert.deepEqual([prices.models['gpt-6.1-terra'].input, prices.models['gpt-6.1-terra'].output], [1, 5])
  assert.deepEqual([prices.models['gpt-6-luna'].input, prices.models['gpt-6-luna'].output], [0.1, 0.5])
  assert.ok(ratesFor(prices, 'gpt-6.1-sol'))
  const MILLION = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 0 }
  assert.ok(Math.abs(priceEntry({ model: 'gpt-6.1-sol', agent: 'lane', ...MILLION }, prices) - (2 + 10 + 0.2)) < 1e-9)
})

test('the script, run on the saved AA list, reproduces the committed Codex records and finds every model profiled (R14, R16)', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-models-'))
  const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-models-docs-'))
  const run = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts', 'build-models-index.js'),
    '--from', path.join(ROOT, 'tests', 'fixtures', 'codex', 'aa-api-2026-10-29.json'),
    '--harnesses', 'claude,agy,codex,grok,muse', '--write', '--out', out, '--docs', docs,
  ], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const built = JSON.parse(fs.readFileSync(path.join(out, 'models.json'), 'utf8'))
  const ofCodex = (list) => list.filter((entry) => entry.harness === 'codex').sort((a, b) => a.model.localeCompare(b.model))
  assert.deepEqual(ofCodex(index.models), ofCodex(built.models))
  assert.deepEqual(ofCodex(index.excluded), ofCodex(built.excluded))
})
