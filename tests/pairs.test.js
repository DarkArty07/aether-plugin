'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { loadPairs, pairsPath, pairId, referenceOf } = require('../plugins/aether/lib/pairs.js')

const EVIDENCE = path.join(__dirname, 'fixtures', 'aa-pairs-2026-10-19.json')
const NATIVE = { Haiku: 'haiku', Sonnet: 'sonnet', Opus: 'opus' }
const EXTERNAL = { 'Gemini 4 Argon': 'gemini-4-argon', 'Gemini 3.8 Flash': 'gemini-3.8-flash', 'Grok 4.7': 'grok-4.7' }

function modelOf(name) {
  const native = Object.keys(NATIVE).find((word) => name.startsWith(`Claude ${word}`))
  if (native) return NATIVE[native]
  return EXTERNAL[Object.keys(EXTERNAL).find((word) => name.startsWith(word))]
}

test('the table holds the 22 pairs of the evidence with the same figures, six Claude pairs for agy and the six pairs of Muse', () => {
  const { pairs } = loadPairs()
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8')).pairs
  assert.equal(evidence.length, 22)
  for (const row of evidence) {
    const found = pairs.find((p) => p.harness === row.harness && p.model === modelOf(row.name) && p.effort === row.effort)
    assert.ok(found, `${row.name} is in the table`)
    assert.equal(found.slug, row.slug, row.name)
    assert.equal(found.intelligence, row.intelligence, row.name)
    assert.equal(found.costPerTaskUsd, row.costPerTaskUsd ?? null, row.name)
    assert.equal(found.id, pairId(found.harness, found.model, found.effort))
  }
  assert.equal(pairs.length, 34)
  assert.equal(pairs.filter((p) => p.harness === 'agy' && p.family.startsWith('claude-')).length, 6)
  assert.equal(pairs.filter((p) => p.harness === 'muse').length, 6)
  assert.equal(new Set(pairs.map((p) => p.id)).size, 34)
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

test('C16: the Muse pair has the figure of Opus high, no cost and the owner words, and the three estimated Spark pairs carry estimated costs with an owner decision too', () => {
  const { pairs } = loadPairs()
  const pair = pairs.find((p) => p.id === 'muse/muse-wonder-full-1.0@high')
  const opus = referenceOf(pairs, { model: 'opus', effort: 'high' })
  assert.equal(pair.id, 'muse/muse-wonder-full-1.0@high')
  assert.deepEqual([pair.model, pair.family, pair.effort, pair.group, pair.costPerTaskUsd], ['muse-wonder-full-1.0', 'muse-wonder-full-1.0', 'high', 'muse', null])
  assert.deepEqual([pair.slug, pair.intelligence], [opus.slug, opus.intelligence])
  assert.match(pair.ownerDecision, /anivel de opus/)
  assert.deepEqual(pairs.filter((p) => p.ownerDecision !== undefined).map((p) => p.id), ['muse/muse-spark-1.3@low', 'muse/muse-spark-1.3@medium', 'muse/muse-spark-1.3@high', pair.id])
  assert.deepEqual(pairs.filter((p) => p.costPerTaskUsd === null).map((p) => p.id).sort(), ['agy/gemini-3.8-flash@low', pair.id])
  const estimated = Object.fromEntries(['low', 'medium', 'high'].map((effort) => [effort, pairs.find((p) => p.id === `muse/muse-spark-1.3@${effort}`)]))
  assert.deepEqual([estimated.low.costPerTaskUsd, estimated.medium.costPerTaskUsd, estimated.high.costPerTaskUsd], [0.19, 0.43, 0.66])
  for (const [effort, row] of Object.entries(estimated)) {
    assert.match(row.ownerDecision, /cost.{0,120}estimat/i, `${effort}: says the cost is an estimate`)
  }
})

test('referenceOf gives the native pair of a model and effort, and throws for any other', () => {
  const { pairs } = loadPairs()
  assert.equal(referenceOf(pairs, { model: 'sonnet', effort: 'xhigh' }).intelligence, 51.9)
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
  assert.equal(loadPairs(write('ok.json', good)).pairs.length, 34)
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
