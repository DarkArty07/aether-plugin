'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadPrices, ratesFor, priceEntry, priceModelUsage } = require('../plugins/aether/lib/prices.js')

const prices = loadPrices()
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
const MILLION = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 }

test('prices.json holds the OpenRouter snapshot for each model, per million tokens', () => {
  assert.equal(prices.per, 1e6)
  assert.deepEqual(prices.cacheWriteTtl, { main: '1h', agents: '5m' })
  assert.deepEqual(prices.models.opus, { ids: ['claude-opus-5-5'], input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 })
  assert.deepEqual(prices.models.sonnet, { ids: ['claude-sonnet-5-5'], input: 2, output: 10, cacheRead: 0.1, cacheWrite5m: 2.5, cacheWrite1h: 4 })
  assert.deepEqual(prices.models.haiku, {
    ids: ['claude-haiku-5-5'],
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite5m: 0.125,
    cacheWrite1h: 0.2,
    longPrompt: { minPromptTokens: 100000, input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite5m: 0.625, cacheWrite1h: 1 },
  })
  assert.ok(Object.values(prices.sources).every((url) => url.startsWith('https://openrouter.ai/') || url.startsWith('https://dev.meta.ai/')))
})

test('ratesFor matches exact ids and ids with a suffix, and nothing else', () => {
  assert.equal(ratesFor(prices, 'claude-sonnet-5-5').family, 'sonnet')
  assert.equal(ratesFor(prices, 'claude-sonnet-5-5-20261001').family, 'sonnet')
  assert.equal(ratesFor(prices, 'claude-opus-5-5[1m]').family, 'opus')
  assert.equal(ratesFor(prices, 'claude-opus-4-1'), null)
  assert.equal(ratesFor(prices, null), null)
})

test('priceEntry bills cache writes at 1 hour for the main session and 5 minutes for agents', () => {
  close(priceEntry({ model: 'claude-opus-5-5', agent: null, ...MILLION }, prices), 4 + 20 + 0.2 + 8)
  close(priceEntry({ model: 'claude-opus-5-5', agent: 'a1', ...MILLION }, prices), 4 + 20 + 0.2 + 5)
  close(priceEntry({ model: 'claude-sonnet-5-5', agent: 'a1', ...MILLION }, prices), 2 + 10 + 0.1 + 2.5)
})

test('Haiku prompts of 100,000 tokens or more take the long-prompt prices', () => {
  const entry = { model: 'claude-haiku-5-5', agent: 'a1', input: 0, output: 1000, cacheRead: 0, cacheWrite: 0 }
  close(priceEntry({ ...entry, input: 99999 }, prices), (99999 * 0.1 + 1000 * 0.5) / 1e6)
  close(priceEntry({ ...entry, input: 40000, cacheRead: 50000, cacheWrite: 10000 }, prices), (40000 * 0.5 + 1000 * 2.5 + 50000 * 0.05 + 10000 * 0.625) / 1e6)
})

test('an unknown model has no price', () => {
  assert.equal(priceEntry({ model: 'gpt-x', agent: null, ...MILLION }, prices), null)
})

test('priceModelUsage prices a claude -p modelUsage beside its list cost, with 1-hour writes for the main model', () => {
  const output = {
    modelUsage: {
      'claude-opus-5-5': { inputTokens: 1e6, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 1e6, costUSD: 12 },
      'claude-haiku-5-5': { inputTokens: 0, outputTokens: 1e6, cacheReadInputTokens: 1e6, cacheCreationInputTokens: 1e6, costUSD: 0.6 },
      'mystery-model': { inputTokens: 5, outputTokens: 5, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.01 },
    },
  }
  const r = priceModelUsage(output, prices, { mainModel: 'claude-opus-5-5' })
  close(r.byModel['claude-opus-5-5'].usd, 4 + 8)
  close(r.byModel['claude-haiku-5-5'].usd, 0.5 + 0.01 + 0.125)
  assert.equal(r.byModel['mystery-model'].usd, null)
  assert.deepEqual(r.unpriced, ['mystery-model'])
  close(r.totalUsd, 4 + 8 + 0.5 + 0.01 + 0.125)
  close(r.listUsd, 12.61)
  assert.deepEqual(r.byModel['claude-haiku-5-5'].tokens, { input: 0, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 })
})

test("Gemini 3.8 Flash has OpenRouter's prices, and agy's model ids price as their families", () => {
  assert.deepEqual(prices.models['gemini-3.8-flash'], {
    ids: ['gemini-3.8-flash'],
    input: 0.75,
    output: 3.75,
    cacheRead: 0.075,
    cacheWrite5m: 0.041667,
    cacheWrite1h: 0.041667,
  })
  assert.equal(prices.sources['gemini-3.8-flash'], 'https://openrouter.ai/api/v1/models/google/gemini-3.8-flash/endpoints')
  assert.equal(ratesFor(prices, 'gemini-3.8-flash-high').family, 'gemini-3.8-flash')
  assert.equal(ratesFor(prices, 'claude-opus-5-5-high').family, 'opus')
  assert.equal(ratesFor(prices, 'claude-sonnet-5-5-medium').family, 'sonnet')
  close(priceEntry({ model: 'gemini-3.8-flash-high', input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 0, agent: 'lane' }, prices), 0.75 + 3.75 + 0.075)
})

test("Gemini 4 Argon has OpenRouter's prices, and agy's levels of it price as the model", () => {
  assert.deepEqual(prices.models['gemini-4-argon'], {
    ids: ['gemini-4-argon'],
    input: 2,
    output: 10,
    cacheRead: 0.1,
    cacheWrite5m: 0.1875,
    cacheWrite1h: 0.1875,
  })
  assert.equal(prices.sources['gemini-4-argon'], 'https://openrouter.ai/api/v1/models/google/gemini-4-argon/endpoints')
  assert.equal(ratesFor(prices, 'gemini-4-argon-high').family, 'gemini-4-argon')
  close(priceEntry({ model: 'gemini-4-argon-high', input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 0, agent: 'lane' }, prices), 2 + 10 + 0.1)
})
