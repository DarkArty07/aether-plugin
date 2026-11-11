'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { figuresOf, readPages, PAGE_URL } = require('../.claude/skills/artificial-analysis/aa-api.js')
const { block, page } = require('./aa-page-fixtures.js')

const OWN = { intelligence: 51.8421, cost: 3.4646622, code: 0.565656565656566, codeCost: 5.118905, seconds: 955.9325 }
const NEIGHBOUR = { intelligence: 10, cost: 9, code: 0.9, codeCost: 9, seconds: 9 }

test('figuresOf reads the code figures of the block of the page\'s own model, not its neighbours\', rounded as the table keeps them', () => {
  const html = page(block('claude-other-5-5', NEIGHBOUR), block('claude-opus-5-5-high', OWN), block('claude-next-5-5', NEIGHBOUR))
  assert.deepEqual(figuresOf(html, 'claude-opus-5-5-high'), { code: 56.57, codeCostPerTaskUsd: 5.119, codeMinutesPerTask: 15.9 })
  assert.equal(figuresOf(html, 'claude-missing-5-5'), null)
  assert.equal(figuresOf(page(block('claude-opus-5-5-high', OWN).replace('terminalbench-4-0', 'other-bench')), 'claude-opus-5-5-high'), null)
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
