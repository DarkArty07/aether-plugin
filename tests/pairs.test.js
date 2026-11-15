'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { loadPairs, pairsPath, pairId, referenceOf } = require('../plugins/aether/lib/pairs.js')

const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'aa-pages.json'), 'utf8')).pages

test('every row with a page of its own takes its figures from the photo of the model pages, with six Claude pairs for agy, the seven pairs of Muse, the fifteen pairs of Codex and four of Hydrogen', () => {
  const { pairs } = loadPairs()
  // The Spark estimates have no page, and the Muse pair at Opus high borrows the page of Opus high and keeps no cost.
  const withPage = pairs.filter((p) => !Object.hasOwn(p, 'estimateOf') && p.id !== 'muse/muse-wonder-full-1.0@high')
  assert.equal(withPage.length, 46)
  for (const found of withPage) {
    const figures = SNAPSHOT[found.slug]?.figures
    assert.ok(figures, `${found.id} has the page ${found.slug} in the photo`)
    assert.equal(found.intelligence, figures.intelligence.value, found.id)
    assert.equal(found.costPerTaskUsd, figures.costPerTaskUsd.value, found.id)
    assert.equal(found.id, pairId(found.harness, found.model, found.effort))
  }
  assert.equal(pairs.length, 51)
  assert.equal(pairs.filter((p) => p.harness === 'agy' && p.family.startsWith('claude-')).length, 6)
  assert.equal(pairs.filter((p) => p.harness === 'agy' && p.model === 'gemini-4-hydrogen').length, 4)
  assert.equal(pairs.filter((p) => p.harness === 'muse').length, 7)
  assert.equal(pairs.filter((p) => p.harness === 'codex').length, 15)
  assert.equal(new Set(pairs.map((p) => p.id)).size, 51)
})

test('the Claude pairs of agy carry the figures of the native pair of the same model and effort', () => {
  const { pairs } = loadPairs()
  for (const pair of pairs.filter((p) => p.harness === 'agy' && p.family.startsWith('claude-'))) {
    const native = pairs.find((p) => p.harness === 'claude' && p.family === pair.family && p.effort === pair.effort)
    assert.ok(native, pair.id)
    assert.equal(pair.slug, native.slug, pair.id)
    assert.equal(pair.intelligence, native.intelligence, pair.id)
    assert.equal(pair.costPerTaskUsd, native.costPerTaskUsd, pair.id)
    assert.equal(pair.group, 'claude')
  }
})

test('every native pair has no group and every external pair has one', () => {
  for (const pair of loadPairs().pairs) assert.equal(pair.group === null, pair.harness === 'claude', pair.id)
})

test('C16: the Muse pair has the figure of Opus high, no cost and the owner words, and the estimated Spark pairs carry estimated costs with an owner decision too', () => {
  const { pairs } = loadPairs()
  const pair = pairs.find((p) => p.id === 'muse/muse-wonder-full-1.0@high')
  const opus = referenceOf(pairs, { model: 'opus', effort: 'high' })
  assert.equal(pair.id, 'muse/muse-wonder-full-1.0@high')
  assert.deepEqual([pair.model, pair.family, pair.effort, pair.group, pair.costPerTaskUsd], ['muse-wonder-full-1.0', 'muse-wonder-full-1.0', 'high', 'muse', null])
  assert.deepEqual([pair.slug, pair.intelligence], [opus.slug, opus.intelligence])
  assert.match(pair.ownerDecision, /anivel de opus/)
  const wonder1 = pairs.find((p) => p.id === 'muse/muse-wonder-1.0@max')
  // Wonder 1.0 max is 43.6 on the scale of 2026-11-14. Spark xhigh is an estimate now, so it carries an owner decision with the low, medium and high rows.
  assert.deepEqual([wonder1.intelligence, wonder1.costPerTaskUsd, wonder1.group], [43.6, 6.952, 'muse'])
  assert.match(wonder1.ownerDecision, /Las dos respuestas es lo reocmendado/)
  assert.deepEqual(pairs.filter((p) => p.ownerDecision !== undefined).map((p) => p.id), ['muse/muse-spark-1.3@low', 'muse/muse-spark-1.3@medium', 'muse/muse-spark-1.3@high', 'muse/muse-spark-1.3@xhigh', pair.id, 'muse/muse-wonder-1.0@max'])
  assert.deepEqual(pairs.filter((p) => p.costPerTaskUsd === null).map((p) => p.id).sort(), [pair.id])
  const xhigh = pairs.find((p) => p.id === 'muse/muse-spark-1.3@xhigh')
  assert.deepEqual([xhigh.intelligence, xhigh.costPerTaskUsd], [34.2, 1.438])
  const estimated = Object.fromEntries(['low', 'medium', 'high'].map((effort) => [effort, pairs.find((p) => p.id === `muse/muse-spark-1.3@${effort}`)]))
  assert.deepEqual([estimated.low.costPerTaskUsd, estimated.medium.costPerTaskUsd, estimated.high.costPerTaskUsd], [0.232, 0.534, 0.824])
  for (const [effort, row] of Object.entries(estimated)) {
    assert.match(row.ownerDecision, /cost.{0,120}estimat/i, `${effort}: says the cost is an estimate`)
  }
})

test('the Spark estimates carry their reference and distance, and their points are the reference plus the distance', () => {
  const { pairs } = loadPairs()
  const byId = (id) => pairs.find((p) => p.id === id)
  const expected = { low: -0.8, medium: -2.1, high: -0.9, xhigh: -0.4 }
  for (const [effort, distance] of Object.entries(expected)) {
    const row = byId(`muse/muse-spark-1.3@${effort}`)
    assert.equal(row.estimateOf, `claude/haiku@${effort}`, effort)
    assert.equal(typeof row.estimateDistance, 'number', effort)
    assert.equal(row.estimateDistance, distance, effort)
    const ref = byId(row.estimateOf)
    assert.ok(ref && ref.harness === 'claude', `${effort}: the reference is a Claude row`)
    assert.equal(row.intelligence, Math.round((ref.intelligence + row.estimateDistance) * 10) / 10, effort)
  }
})

test('referenceOf gives the native pair of a model and effort, and throws for any other', () => {
  const { pairs } = loadPairs()
  assert.equal(referenceOf(pairs, { model: 'sonnet', effort: 'xhigh' }).intelligence, 49.9)
  assert.equal(referenceOf(pairs, { model: 'opus', effort: 'max' }).id, 'claude/opus@max')
  assert.throws(() => referenceOf(pairs, { model: 'gpt', effort: 'high' }), /no reference pair for gpt high/)
})

test('AETHER_PAIRS_CONFIG names another table, and a table that breaks a rule is refused', (t) => {
  const dir = tempDir(t)
  const good = JSON.parse(fs.readFileSync(pairsPath({}), 'utf8'))
  const write = (name, value) => {
    const file = path.join(dir, name)
    fs.writeFileSync(file, JSON.stringify(value))
    return file
  }
  assert.equal(pairsPath({ AETHER_PAIRS_CONFIG: '/x/pairs.json' }), '/x/pairs.json')
  assert.equal(loadPairs(write('ok.json', good)).pairs.length, 51)
  const mutate = (fn) => {
    const copy = JSON.parse(JSON.stringify(good))
    fn(copy)
    return write(`bad-${Math.random()}.json`, copy)
  }
  assert.throws(() => loadPairs(mutate((c) => c.pairs.push({ ...c.pairs[0] }))), /pairs config .*duplicate/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs.find((p) => p.harness === 'grok').group = null })), /pairs config .*group/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs[0].effort = 'ultra' })), /pairs config .*effort/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs[0].intelligence = '40' })), /pairs config .*intelligence/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs[0].slug = '' })), /pairs config .*slug/)
  assert.throws(() => loadPairs(mutate((c) => { delete c.pairs[1].slug })), /pairs config .*slug/)
  assert.throws(() => loadPairs(mutate((c) => { c.pairs.find((p) => p.id === 'muse/muse-wonder-full-1.0@high').ownerDecision = '' })), /pairs config .*ownerDecision/)
  assert.throws(() => loadPairs(path.join(dir, 'missing.json')), /pairs config/)
})

test('checked and costEstimate are optional non-empty strings of a pair', (t) => {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'pairs.json'), 'utf8'))
  const file = path.join(tempDir(t), 'pairs.json')
  for (const field of ['checked', 'costEstimate']) {
    for (const bad of ['', 3, null]) {
      const table = structuredClone(base)
      table.pairs.find((pair) => pair.harness === 'codex')[field] = bad
      fs.writeFileSync(file, JSON.stringify(table))
      assert.throws(() => loadPairs(file), new RegExp(`${field} must be a non-empty string when present`))
    }
  }
})
