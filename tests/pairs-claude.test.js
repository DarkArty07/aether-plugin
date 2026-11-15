'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { loadPairs, nativeModels } = require('../plugins/aether/lib/pairs.js')
const { ladderFrom } = require('../plugins/aether/lib/pareto.js')

test('the live pairs table derives the five required Claude rungs', () => {
  const rungs = ladderFrom(loadPairs().pairs, { candidateEfforts: ['high', 'xhigh'], minJumpPoints: 2 })
  assert.deepEqual(rungs.map(({ model, effort }) => `${model}-${effort}`), [
    'haiku-high', 'haiku-xhigh', 'sonnet-high', 'opus-high', 'opus-xhigh',
  ])
})

const PAIRS_FILE = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'pairs.json')
// R9: a row with a page may carry refreshed intelligence and cost per task, and one date (`checked`). The test checks
// that shape, not the numbers of one reading.
const claudeRow = (over = {}) => ({
  id: 'claude/opus-6@high', slug: 'claude-opus-6-high', harness: 'claude', model: 'opus-6', family: 'claude-opus-6', effort: 'high', group: null,
  intelligence: 60, costPerTaskUsd: 3, outputTokensPerSecond: 70, timeToFirstTokenS: 9, ...over,
})
const tableFile = (t, pairs) => {
  const file = path.join(tempDir(t, 'aether-pairs-'), 'pairs.json')
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: '2026-11-10', pairs }))
  return file
}

test('the Claude rows carry intelligence and cost per task, and a date when the row records one (R9)', () => {
  const raw = JSON.parse(fs.readFileSync(PAIRS_FILE, 'utf8'))
  assert.deepEqual(Object.keys(raw), ['fetchedAt', 'pairs'])
  assert.equal(typeof raw.fetchedAt, 'string')
  const claude = loadPairs().pairs.filter((pair) => pair.harness === 'claude')
  assert.equal(claude.length, 15)
  for (const pair of claude) {
    assert.equal(typeof pair.intelligence, 'number', pair.id)
    assert.equal(typeof pair.costPerTaskUsd, 'number', pair.id)
    if (Object.hasOwn(pair, 'checked')) assert.match(pair.checked, /^\d{4}-\d{2}-\d{2}$/, `${pair.id}: checked`)
  }
})

test('rows with a page may carry refreshed figures and one date; estimated rows keep estimateOf and estimateDistance (R9)', () => {
  const pairs = loadPairs().pairs
  const others = pairs.filter((pair) => pair.harness !== 'claude')
  assert.equal(others.length, 36)
  const byId = (id) => others.find((pair) => pair.id === id)
  assert.equal(byId('agy/claude-opus-5-5@high').slug, 'claude-opus-5-5-high')
  assert.equal(byId('muse/muse-wonder-full-1.0@high').slug, 'claude-opus-5-5-high')
  for (const pair of others) {
    if (Object.hasOwn(pair, 'estimateOf')) {
      assert.equal(typeof pair.estimateOf, 'string', pair.id)
      assert.equal(typeof pair.estimateDistance, 'number', pair.id)
      const ref = pairs.find((other) => other.id === pair.estimateOf)
      assert.ok(ref, pair.id)
      assert.equal(pair.intelligence, Math.round((ref.intelligence + pair.estimateDistance) * 10) / 10, pair.id)
      continue
    }
    assert.equal(typeof pair.intelligence, 'number', pair.id)
    assert.ok(pair.costPerTaskUsd === null || typeof pair.costPerTaskUsd === 'number', pair.id)
    if (Object.hasOwn(pair, 'checked')) assert.match(pair.checked, /^\d{4}-\d{2}-\d{2}$/, `${pair.id}: checked`)
  }
})

test('a Claude row needs intelligence and cost per task; a code field is not required, and one that is there is ignored (not an error)', (t) => {
  assert.equal(loadPairs(tableFile(t, [claudeRow()])).pairs.length, 1)
  assert.equal(loadPairs(tableFile(t, [claudeRow({ code: 120, codeCostPerTaskUsd: -1, codeMinutesPerTask: 'x', codeChecked: 3 })])).pairs.length, 1)
  assert.equal(loadPairs(tableFile(t, [claudeRow({ codeChecked: '2026-11-10' })])).pairs.length, 1)
  for (const [field, bad] of [['intelligence', 'high'], ['costPerTaskUsd', 'cheap']]) {
    assert.throws(() => loadPairs(tableFile(t, [claudeRow({ [field]: bad })])), new RegExp(`${field} must`), field)
  }
  const outside = { ...claudeRow({ id: 'agy/x@high', harness: 'agy', model: 'x', family: 'x', group: 'g' }) }
  assert.equal(loadPairs(tableFile(t, [outside])).pairs.length, 1)
})

test('nativeModels lists the models of the Claude rows in table order, and the table names them, not a list in the code', () => {
  assert.deepEqual(nativeModels(loadPairs().pairs), ['haiku', 'sonnet', 'opus'])
  const rows = [claudeRow(), claudeRow({ id: 'claude/opus-6@xhigh', effort: 'xhigh', slug: 'claude-opus-6-xhigh' }), claudeRow({ id: 'claude/sonnet-6@high', model: 'sonnet-6', family: 'claude-sonnet-6', slug: 'claude-sonnet-6-high' })]
  assert.deepEqual(nativeModels(rows), ['opus-6', 'sonnet-6'])
  assert.equal(Object.hasOwn(require('../plugins/aether/lib/pairs.js'), 'NATIVE_MODELS'), false)
})
