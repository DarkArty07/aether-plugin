'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const marks = require('../plugins/aether/lib/router-marks.js')
const laneMarks = require('../plugins/aether/lib/lane-marks.js')

const NOW = Date.parse('2026-10-15T22:30:00Z')
const MIN = 60 * 1000
const H = 60 * MIN
// What agy printed on 2026-10-15 for three real calls (evidence, section 5)
const REAL = 'exit 3: Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.'
const REAL_MS = ((163 * 60 + 22) * 60 + 27) * 1000

test('R22b: the explicit refusal of agy is recognized and gives its reset, with the real message', () => {
  assert.equal(REAL_MS, 588147000)
  assert.deepEqual(marks.quotaRefusal(REAL), { resetMs: REAL_MS })
  assert.deepEqual(marks.quotaRefusal('Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h20m6s.'), { resetMs: ((163 * 60 + 20) * 60 + 6) * 1000 })
  assert.deepEqual(marks.quotaRefusal('Individual quota reached. Resets in 2h.'), { resetMs: 2 * H })
  assert.deepEqual(marks.quotaRefusal('Individual quota reached. Resets in 45m30s'), { resetMs: 45 * MIN + 30000 })
  assert.deepEqual(marks.quotaRefusal('individual QUOTA reached. Resets in 1d2h.'), { resetMs: 26 * H })
  assert.deepEqual(marks.quotaRefusal('exit 3: Individual quota reached'), { resetMs: null })
})

test('R22b: what is not that refusal gives null', () => {
  for (const text of ['exit 1: model not found: gemini-3.8-flash-medium', 'quota: out of tokens', 'Resets in 2h', '', '   ', null, undefined, 42, {}]) {
    assert.equal(marks.quotaRefusal(text), null, String(text))
  }
})

test('R22: a refusal leaves the router mark until the reset the message states, in the router store only', (t) => {
  const dataDir = tempDir(t)
  const mark = marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: REAL, now: NOW })
  assert.equal(mark.harness, 'agy')
  assert.equal(mark.group, 'gemini')
  assert.equal(mark.at, NOW)
  assert.equal(mark.until, NOW + REAL_MS)
  assert.equal(mark.confirmed, true)
  assert.equal(mark.source, 'router')
  assert.equal(mark.resetsAt, new Date(NOW + REAL_MS).toISOString())
  const file = laneMarks.markFile(marks.routerMarksRoot(dataDir), 'agy', 'gemini')
  assert.equal(file, path.join(dataDir, 'router', 'lanes', 'marks', 'agy__gemini.json'))
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).until, NOW + REAL_MS)
  assert.notEqual(laneMarks.liveMark(marks.routerMarksRoot(dataDir), 'agy', 'gemini', NOW + MIN), null, 'lane-marks.js reads it as one of its own')
  assert.equal(fs.existsSync(path.join(dataDir, 'lanes')), false, 'the swarm store is not created or written')
  assert.deepEqual(laneMarks.liveMarks(dataDir, NOW + MIN), [])
})

test('R22: without a reset in the message the mark lasts 60 minutes, and a reset beyond 8 days is bounded', (t) => {
  const dataDir = tempDir(t)
  const none = marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: 'Individual quota reached', now: NOW })
  assert.equal(none.until, NOW + 60 * MIN)
  const far = marks.markRefusal(dataDir, { harness: 'agy', group: 'claude', text: 'Individual quota reached. Resets in 400h.', now: NOW })
  assert.equal(far.until, NOW + laneMarks.MAX_MARK_MS - MIN)
  assert.notEqual(laneMarks.liveMark(marks.routerMarksRoot(dataDir), 'agy', 'claude', NOW + MIN), null)
})

test('a mark never shortens, and a text that is not a refusal writes nothing', (t) => {
  const dataDir = tempDir(t)
  marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: REAL, now: NOW })
  const again = marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: 'Individual quota reached. Resets in 2h.', now: NOW + MIN })
  assert.equal(again.until, NOW + REAL_MS, 'the later end is kept')
  const other = tempDir(t)
  assert.equal(marks.markRefusal(other, { harness: 'agy', group: 'gemini', text: 'exit 1: model not found', now: NOW }), null)
  assert.equal(fs.existsSync(path.join(other, 'router')), false)
})

test('readAllMarks joins the swarm marks, which it only reads, and the router marks', (t) => {
  const dataDir = tempDir(t)
  laneMarks.markDry(dataDir, { harness: 'agy', group: 'claude', reading: null, reserve: 0.05, now: NOW, minutes: 60 })
  marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: REAL, now: NOW })
  const all = marks.readAllMarks(dataDir, NOW + MIN)
  assert.deepEqual(all.map((m) => [m.harness, m.group, m.source]), [['agy', 'claude', 'swarm'], ['agy', 'gemini', 'router']])
  assert.equal(typeof all[1].until, 'number')
  const later = marks.readAllMarks(dataDir, NOW + 61 * MIN)
  assert.deepEqual(later.map((m) => [m.group, m.source]), [['gemini', 'router']], 'the swarm mark of 60 minutes has ended; the router one holds until its reset')
  assert.deepEqual(marks.readAllMarks(tempDir(t), NOW), [])
  assert.deepEqual(marks.readAllMarks(dataDir, NOW + REAL_MS + MIN), [])
})

test('the module never writes the swarm store or calls markDry (R9, R22)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'router-marks.js'), 'utf8')
  assert.ok(!/markDry/.test(source))
})
