'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { figuresOf, indexesOf, pairFiguresOf, readPages, PAGE_URL } = require('../.claude/skills/artificial-analysis/aa-api.js')
const { block, page } = require('./aa-page-fixtures.js')

const OWN = { intelligence: 51.8421, cost: 3.4646622, code: 0.565656565656566, codeCost: 5.118905, seconds: 955.9325 }
const NEIGHBOUR = { intelligence: 10, cost: 9, code: 0.9, codeCost: 9, seconds: 9 }

test('figuresOf reads the code figures of the block of the page\'s own model, not its neighbours\', rounded as the table keeps them', () => {
  const html = page(block('claude-other-5-5', NEIGHBOUR), block('claude-opus-5-5-high', OWN), block('claude-next-5-5', NEIGHBOUR))
  assert.deepEqual(figuresOf(html, 'claude-opus-5-5-high'), { code: 56.57, codeCostPerTaskUsd: 5.119, codeMinutesPerTask: 15.9 })
  assert.equal(figuresOf(html, 'claude-missing-5-5'), null)
  assert.equal(figuresOf(page(block('claude-opus-5-5-high', OWN).replace('terminalbench-4-0', 'other-bench')), 'claude-opus-5-5-high'), null)
})

test('indexesOf takes only Terminal-Bench from the block of the page\'s own model: no coding figure, and null for a slug the page does not have', () => {
  const html = page(block('claude-other-5-5', NEIGHBOUR), block('claude-opus-5-5-high', OWN))
  assert.deepEqual(indexesOf(html, 'claude-opus-5-5-high'), { terminalBench: 0.566 })
  assert.equal(indexesOf(html, 'claude-missing-5-5'), null)
  assert.deepEqual(indexesOf(page(block('claude-opus-5-5-high', OWN).replace('terminalbench-4-0', 'other-bench')), 'claude-opus-5-5-high'), { terminalBench: null })
})

test('pairFiguresOf reads the intelligence, the cost and the code figures of the block of the page\'s own model, rounded as the table keeps them', () => {
  const html = page(block('claude-other-5-5', NEIGHBOUR), block('claude-opus-5-5-high', OWN), block('claude-next-5-5', NEIGHBOUR))
  assert.deepEqual(pairFiguresOf(html, 'claude-opus-5-5-high'), { intelligence: 51.8, costPerTaskUsd: 3.465, code: 56.57, codeCostPerTaskUsd: 5.119, codeMinutesPerTask: 15.9 })
  assert.equal(pairFiguresOf(html, 'claude-missing-5-5'), null)
})

test('pairFiguresOf reads intelligenceIndex wherever it sits in the scalars, not only as the first key', () => {
  const html = page(block('claude-opus-5-5-high', OWN))
  const text = html.replace(/\\"/g, '"')
  assert.equal(/"scalars":\{"intelligenceIndex":/.test(text), false, 'the fixture must put other scalar keys first, as a real page does')
  assert.equal(pairFiguresOf(html, 'claude-opus-5-5-high').intelligence, 51.8)
  const missing = page(block('claude-opus-5-5-high', OWN).replace(`"intelligenceIndex":${OWN.intelligence}`, '"intelligenceIndex":null'))
  assert.equal(pairFiguresOf(missing, 'claude-opus-5-5-high').intelligence, null)
})

test('#236 4: the page reader exports no cli (only the file\'s own main guard uses it)', () => {
  assert.equal(require('../.claude/skills/artificial-analysis/aa-api.js').cli, undefined)
})

test('readPages asks one page per slug with a pause between two, sends no key, and reports a page that does not answer', async () => {
  const asked = []
  const pauses = []
  const pages = { [`${PAGE_URL}a`]: page(block('a', OWN)), [`${PAGE_URL}b`]: page(block('b', OWN)) }
  const fetch = async (url, options) => {
    asked.push([url, options])
    return url in pages ? { ok: true, status: 200, text: async () => pages[url] } : { ok: false, status: 404, text: async () => '' }
  }
  const result = await readPages(['a', 'b', 'c'], { fetch, pause: async (ms) => pauses.push(ms), pauseMs: 1200 })
  assert.deepEqual(asked.map(([url]) => url), [`${PAGE_URL}a`, `${PAGE_URL}b`, `${PAGE_URL}c`])
  assert.deepEqual(pauses, [1200, 1200])
  assert.deepEqual([...result.keys()], ['a', 'b', 'c'])
  assert.equal(result.get('a').code, 56.57)
  assert.deepEqual(result.get('c'), { error: 'the page answered 404' })
  for (const [, options] of asked) assert.equal(JSON.stringify(options ?? {}).includes('key'), false)
})
