'use strict'

// The marks of the pairs whose delegate ran out of time (lib/router-slow.js): per pair, not per quota group, 60
// minutes, never shortened, and only read while live.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const slow = require('../plugins/aether/lib/router-slow.js')

const NOW = Date.parse('2026-10-21T12:00:00Z')
const MIN = 60 * 1000
const GROK_HIGH = { harness: 'grok', model: 'grok-4.7', effort: 'high' }
const pair = (harness, model, effort, group) => ({ id: `${harness}/${model}@${effort}`, harness, model, effort, group })
const PAIRS = [pair('grok', 'grok-4.7', 'high', 'grok'), pair('grok', 'grok-4.7', 'low', 'grok'), pair('agy', 'gemini-4-argon', 'high', 'gemini'), pair('claude', 'sonnet', 'high', null)]
const fileOf = (dataDir, name) => path.join(dataDir, 'router', 'slow', name)

test('the mark lasts 60 minutes, holds the pair, and is written under router/slow', (t) => {
  assert.equal(slow.SLOW_MINUTES, 60)
  const dataDir = tempDir(t)
  const mark = slow.markSlow(dataDir, GROK_HIGH, { now: NOW })
  assert.deepEqual(mark, { harness: 'grok', model: 'grok-4.7', effort: 'high', at: NOW, until: NOW + 60 * MIN })
  const file = fileOf(dataDir, 'grok__grok-4.7__high.json')
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), mark)
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['grok__grok-4.7__high.json'], 'no temporary file is left')
})

test('a live mark is never shortened: a later one extends it, an earlier one leaves it as it is', (t) => {
  const dataDir = tempDir(t)
  slow.markSlow(dataDir, GROK_HIGH, { now: NOW })
  const later = slow.markSlow(dataDir, GROK_HIGH, { now: NOW + 20 * MIN })
  assert.equal(later.until, NOW + 80 * MIN)
  const earlier = slow.markSlow(dataDir, GROK_HIGH, { now: NOW + 5 * MIN })
  assert.equal(earlier.until, NOW + 80 * MIN, 'the live mark that ends later is kept')
  assert.equal(JSON.parse(fs.readFileSync(fileOf(dataDir, 'grok__grok-4.7__high.json'), 'utf8')).until, NOW + 80 * MIN)
})

test('an expired mark is ignored, and a new one replaces it', (t) => {
  const dataDir = tempDir(t)
  slow.markSlow(dataDir, GROK_HIGH, { now: NOW })
  assert.deepEqual(slow.slowPairIds(dataDir, PAIRS, NOW + 59 * MIN), ['grok/grok-4.7@high'])
  assert.deepEqual(slow.slowPairIds(dataDir, PAIRS, NOW + 60 * MIN), [], 'it ends at until')
  assert.deepEqual(slow.slowPairIds(dataDir, PAIRS, NOW + 3 * 60 * MIN), [])
  const again = slow.markSlow(dataDir, GROK_HIGH, { now: NOW + 3 * 60 * MIN })
  assert.equal(again.until, NOW + 4 * 60 * MIN)
})

test('the mark is per pair, not per quota group: the same model at another effort and the same harness stay available', (t) => {
  const dataDir = tempDir(t)
  slow.markSlow(dataDir, GROK_HIGH, { now: NOW })
  assert.deepEqual(slow.slowPairIds(dataDir, PAIRS, NOW), ['grok/grok-4.7@high'], 'grok 4.7 at low shares the group and is not out')
  slow.markSlow(dataDir, { harness: 'agy', model: 'gemini-4-argon', effort: 'high' }, { now: NOW })
  assert.deepEqual(slow.slowPairIds(dataDir, PAIRS, NOW), ['grok/grok-4.7@high', 'agy/gemini-4-argon@high'], 'in the order of the table')
})

test('only the pairs of the table are named: a mark of a pair the table lacks is ignored', (t) => {
  const dataDir = tempDir(t)
  slow.markSlow(dataDir, { harness: 'grok', model: 'grok-9', effort: 'high' }, { now: NOW })
  assert.deepEqual(slow.slowPairIds(dataDir, PAIRS, NOW), [])
})

test('no directory, odd files and unreadable ones are ignored, and never throw', (t) => {
  const dataDir = tempDir(t)
  assert.deepEqual(slow.slowPairIds(dataDir, PAIRS, NOW), [], 'no directory')
  slow.markSlow(dataDir, GROK_HIGH, { now: NOW })
  const dir = path.join(dataDir, 'router', 'slow')
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json')
  fs.writeFileSync(path.join(dir, 'array.json'), '[1, 2]')
  fs.writeFileSync(path.join(dir, 'strings.json'), JSON.stringify({ harness: 'agy', model: 'gemini-4-argon', effort: 'high', until: 'later' }))
  fs.writeFileSync(path.join(dir, 'nothing.json'), JSON.stringify({ harness: 'agy', model: 'gemini-4-argon', effort: 'high' }))
  fs.writeFileSync(path.join(dir, 'huge.json'), JSON.stringify({ harness: 'agy', model: 'gemini-4-argon', effort: 'high', at: NOW, until: NOW + 365 * 24 * 60 * MIN }))
  fs.mkdirSync(path.join(dir, 'a-directory.json'))
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x')
  assert.deepEqual(slow.slowPairIds(dataDir, PAIRS, NOW), ['grok/grok-4.7@high'])
  assert.deepEqual(slow.slowPairIds(dataDir, null, NOW), [], 'a table that is not a list names nothing')
  // A damaged file does not stop the next mark from replacing it.
  fs.writeFileSync(fileOf(dataDir, 'grok__grok-4.7__high.json'), 'garbage')
  assert.equal(slow.markSlow(dataDir, GROK_HIGH, { now: NOW }).until, NOW + 60 * MIN)
})
