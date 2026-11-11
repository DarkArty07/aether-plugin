'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { loadPairs, nativeModels } = require('../plugins/aether/lib/pairs.js')

const EVIDENCE = path.join(__dirname, '..', 'specs', '032-pareto-ladder', 'evidence', 'aa-pages-claude-2026-11-10.json')
const PAIRS_FILE = path.join(__dirname, '..', 'plugins', 'aether', 'config', 'pairs.json')
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits
// The intelligence and the cost per task of the Claude rows, in the scale the table has (2026-10-19): this build does not change them.
const KEPT = {
  'claude/haiku@low': [18.6, 0.044], 'claude/haiku@medium': [24.6, 0.092], 'claude/haiku@high': [29.6, 0.159], 'claude/haiku@xhigh': [34.3, 0.248], 'claude/haiku@max': [36.2, 0.411],
  'claude/sonnet@low': [25.3, 0.511], 'claude/sonnet@medium': [30.3, 0.781], 'claude/sonnet@high': [41.1, 1.636], 'claude/sonnet@xhigh': [49.6, 4.092], 'claude/sonnet@max': [54.2, 10.021],
  'claude/opus@low': [34.5, 0.976], 'claude/opus@medium': [48.1, 2.451], 'claude/opus@high': [51.7, 3.465], 'claude/opus@xhigh': [57, 6.047], 'claude/opus@max': [58.4, 10.036],
}
const claudeRow = (over = {}) => ({
  id: 'claude/opus-6@high', slug: 'claude-opus-6-high', harness: 'claude', model: 'opus-6', family: 'claude-opus-6', effort: 'high', group: null,
  intelligence: 60, costPerTaskUsd: 3, outputTokensPerSecond: 70, timeToFirstTokenS: 9, code: 55, codeCostPerTaskUsd: 4, codeMinutesPerTask: 15, ...over,
})
const tableFile = (t, pairs) => {
  const file = path.join(tempDir(t, 'aether-pairs-'), 'pairs.json')
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: '2026-11-10', pairs }))
  return file
}

test('the Claude rows gain the code figures of the extract of 2026-11-10 and codeChecked, and keep their intelligence and cost per task', () => {
  const pages = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'))
  const raw = JSON.parse(fs.readFileSync(PAIRS_FILE, 'utf8'))
  assert.deepEqual(Object.keys(raw), ['fetchedAt', 'pairs'])
  assert.equal(raw.fetchedAt, '2026-10-19')
  const claude = loadPairs().pairs.filter((pair) => pair.harness === 'claude')
  assert.equal(claude.length, 15)
  for (const pair of claude) {
    const code = pages[pair.slug].evals['terminalbench-4-0']
    assert.deepEqual(
      [pair.code, pair.codeCostPerTaskUsd, pair.codeMinutesPerTask, pair.codeChecked],
      [round(code.score * 100, 2), round(code.costUsd, 3), round(code.seconds / 60, 1), '2026-11-10'],
      pair.id,
    )
    assert.deepEqual([pair.intelligence, pair.costPerTaskUsd], KEPT[pair.id], pair.id)
    assert.equal(Object.hasOwn(pair, 'checked'), false, pair.id)
  }
  const opusHigh = claude.find((pair) => pair.id === 'claude/opus@high')
  assert.deepEqual([opusHigh.intelligence, opusHigh.costPerTaskUsd, opusHigh.code, opusHigh.codeCostPerTaskUsd, opusHigh.codeMinutesPerTask], [51.7, 3.465, 56.57, 5.119, 15.9])
})

test('the rows of the other harnesses are as they were, with no code figures, also the ones that reuse a slug of Claude', () => {
  const others = loadPairs().pairs.filter((pair) => pair.harness !== 'claude')
  assert.equal(others.length, 35)
  const byId = (id) => others.find((pair) => pair.id === id)
  assert.deepEqual([byId('agy/claude-opus-5-5@high').slug, byId('agy/claude-opus-5-5@high').intelligence], ['claude-opus-5-5-high', 51.7])
  assert.deepEqual([byId('muse/muse-wonder-full-1.0@high').slug, byId('muse/muse-wonder-full-1.0@high').intelligence], ['claude-opus-5-5-high', 51.7])
  assert.equal(byId('codex/gpt-6.1-sol@high').costPerTaskUsd, 0.591)
  for (const pair of others) for (const field of ['code', 'codeCostPerTaskUsd', 'codeMinutesPerTask', 'codeChecked']) assert.equal(Object.hasOwn(pair, field), false, `${pair.id} ${field}`)
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
