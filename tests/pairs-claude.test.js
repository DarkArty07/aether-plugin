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
// R9: a row with a page may carry refreshed intelligence, cost and code figures, and one date
// (`checked` and `codeChecked` name the same day when both are present). The test checks that
// shape, not the numbers of one reading.
const claudeRow = (over = {}) => ({
  id: 'claude/opus-6@high', slug: 'claude-opus-6-high', harness: 'claude', model: 'opus-6', family: 'claude-opus-6', effort: 'high', group: null,
  intelligence: 60, costPerTaskUsd: 3, outputTokensPerSecond: 70, timeToFirstTokenS: 9, code: 55, codeCostPerTaskUsd: 4, codeMinutesPerTask: 15, ...over,
})
const tableFile = (t, pairs) => {
  const file = path.join(tempDir(t, 'aether-pairs-'), 'pairs.json')
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: '2026-11-10', pairs }))
  return file
}

test('the Claude rows carry intelligence, cost and code figures, and one date when the row records both (R9)', () => {
  const raw = JSON.parse(fs.readFileSync(PAIRS_FILE, 'utf8'))
  assert.deepEqual(Object.keys(raw), ['fetchedAt', 'pairs'])
  assert.equal(typeof raw.fetchedAt, 'string')
  const claude = loadPairs().pairs.filter((pair) => pair.harness === 'claude')
  assert.equal(claude.length, 15)
  for (const pair of claude) {
    assert.equal(typeof pair.intelligence, 'number', pair.id)
    assert.equal(typeof pair.costPerTaskUsd, 'number', pair.id)
    for (const field of ['code', 'codeCostPerTaskUsd', 'codeMinutesPerTask']) assert.equal(typeof pair[field], 'number', `${pair.id} ${field}`)
    assert.equal(typeof pair.codeChecked, 'string', pair.id)
    assert.ok(pair.codeChecked.length > 0, pair.id)
    // A page without intelligence keeps the old checked while its code figures advance codeChecked (spec 036 R9): each date is checked on its own.
    if (Object.hasOwn(pair, 'checked')) assert.match(pair.checked, /^\d{4}-\d{2}-\d{2}$/, `${pair.id}: checked`)
  }
})

test('rows with a page may carry refreshed figures and one date; estimated rows keep estimateOf and estimateDistance (R9)', () => {
  const pairs = loadPairs().pairs
  const others = pairs.filter((pair) => pair.harness !== 'claude')
  assert.equal(others.length, 35)
  const byId = (id) => others.find((pair) => pair.id === id)
  assert.equal(byId('agy/claude-opus-5-5@high').slug, 'claude-opus-5-5-high')
  assert.equal(byId('muse/muse-wonder-full-1.0@high').slug, 'claude-opus-5-5-high')
  const codeFields = ['code', 'codeCostPerTaskUsd', 'codeMinutesPerTask']
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
    const present = codeFields.filter((field) => Object.hasOwn(pair, field))
    if (present.length === 0) continue
    assert.deepEqual(present, codeFields, pair.id)
    for (const field of codeFields) assert.equal(typeof pair[field], 'number', `${pair.id} ${field}`)
    if (Object.hasOwn(pair, 'codeChecked')) assert.equal(typeof pair.codeChecked, 'string', pair.id)
    if (Object.hasOwn(pair, 'checked')) assert.match(pair.checked, /^\d{4}-\d{2}-\d{2}$/, `${pair.id}: checked`)
  }
})

test('a Claude row needs its three code figures, any model name goes, codeChecked is text when present, and another harness needs none', (t) => {
  assert.equal(loadPairs(tableFile(t, [claudeRow()])).pairs.length, 1)
  assert.equal(loadPairs(tableFile(t, [claudeRow({ codeChecked: '2026-11-10' })])).pairs.length, 1)
  const rule = { code: /code must be a number from 0 to 100/, codeCostPerTaskUsd: /codeCostPerTaskUsd must be a number of at least 0/, codeMinutesPerTask: /codeMinutesPerTask must be a number of at least 0/ }
  for (const [field, pattern] of Object.entries(rule)) {
    const row = claudeRow()
    delete row[field]
    assert.throws(() => loadPairs(tableFile(t, [row])), pattern, field)
  }
  assert.throws(() => loadPairs(tableFile(t, [claudeRow({ code: 120 })])), /code must be a number from 0 to 100/)
  for (const bad of ['', 3, null]) assert.throws(() => loadPairs(tableFile(t, [claudeRow({ codeChecked: bad })])), /codeChecked must be a non-empty string when present/)
  const outside = { ...claudeRow({ id: 'agy/x@high', harness: 'agy', model: 'x', family: 'x', group: 'g' }) }
  for (const field of ['code', 'codeCostPerTaskUsd', 'codeMinutesPerTask']) delete outside[field]
  assert.equal(loadPairs(tableFile(t, [outside])).pairs.length, 1)
})

test('nativeModels lists the models of the Claude rows in table order, and the table names them, not a list in the code', () => {
  assert.deepEqual(nativeModels(loadPairs().pairs), ['haiku', 'sonnet', 'opus'])
  const rows = [claudeRow(), claudeRow({ id: 'claude/opus-6@xhigh', effort: 'xhigh', slug: 'claude-opus-6-xhigh' }), claudeRow({ id: 'claude/sonnet-6@high', model: 'sonnet-6', family: 'claude-sonnet-6', slug: 'claude-sonnet-6-high' })]
  assert.deepEqual(nativeModels(rows), ['opus-6', 'sonnet-6'])
  assert.equal(Object.hasOwn(require('../plugins/aether/lib/pairs.js'), 'NATIVE_MODELS'), false)
})
