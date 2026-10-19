'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadPrices, ratesFor, priceEntry } = require('../plugins/aether/lib/prices.js')

const prices = loadPrices()
const MILLION = { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 0 }

test('the models whose token price Meta publishes have a row, per million tokens', () => {
  assert.deepEqual(prices.models['muse-spark-1.3'], { ids: ['muse-spark-1.3'], input: 1.25, output: 4.25, cacheRead: 0.15, cacheWrite5m: 1.25, cacheWrite1h: 1.25 })
  assert.deepEqual(prices.models['muse-wonder-1.0'], { ids: ['muse-wonder-1.0'], input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 4, cacheWrite1h: 4 })
  assert.ok(prices.sources['muse-spark-1.3'].startsWith('https://dev.meta.ai/') && prices.sources['muse-wonder-1.0'].startsWith('https://dev.meta.ai/'))
})

test('a lane call of a priced Muse model costs its tokens, and the subscription-only model has no price', () => {
  assert.equal(ratesFor(prices, 'muse-spark-1.3').family, 'muse-spark-1.3')
  assert.ok(Math.abs(priceEntry({ model: 'muse-spark-1.3', agent: 'lane', ...MILLION }, prices) - (1.25 + 4.25 + 0.15)) < 1e-9)
  assert.ok(Math.abs(priceEntry({ model: 'muse-wonder-1.0', agent: 'lane', ...MILLION }, prices) - (4 + 20 + 0.2)) < 1e-9)
  assert.equal(ratesFor(prices, 'muse-wonder-full-1.0'), null)
  assert.equal(priceEntry({ model: 'muse-wonder-full-1.0', agent: 'lane', ...MILLION }, prices), null)
})
