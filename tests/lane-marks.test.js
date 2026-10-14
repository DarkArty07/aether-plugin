'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const marks = require('../plugins/aether/lib/lane-marks.js')

const NOW = Date.parse('2026-10-14T06:08:00Z')
const MIN = 60 * 1000
const RESERVE = 0.05
const WEEKLY_RESET = '2026-10-16T04:41:07Z'
const dry = (extra = {}) => ({ windows: { weekly: { remaining: 0.002, resetsAt: WEEKLY_RESET }, '5h': { remaining: 1, resetsAt: '2026-10-14T09:41:07Z' } }, ...extra })
const mark = (dir, fields) => marks.markDry(dir, { harness: 'agy', group: 'claude', reserve: RESERVE, now: NOW, ...fields })

test('a call that ended for quota while a reading with an explicit balance shows the group under the reserve holds it until the reset', (t) => {
  const dir = tempDir(t)
  const m = mark(dir, { reading: dry() })
  assert.deepEqual(m, {
    harness: 'agy',
    group: 'claude',
    at: NOW,
    until: Date.parse(WEEKLY_RESET),
    confirmed: true,
    resetsAt: '2026-10-16T04:41:07.000Z',
    usedPercentAbsent: false,
  })
  assert.deepEqual(marks.liveMark(dir, 'agy', 'claude', NOW + MIN), m)
  assert.equal(marks.liveMark(dir, 'agy', 'claude', Date.parse(WEEKLY_RESET)), null, 'at the reset it is over')
})

test('with two windows under the reserve the mark lasts until the later reset, and a window above it does not count', (t) => {
  const dir = tempDir(t)
  const reading = { windows: { weekly: { remaining: 0.01, resetsAt: '2026-10-16T04:41:07Z' }, '5h': { remaining: 0.04, resetsAt: '2026-10-14T09:41:07Z' } } }
  assert.equal(mark(dir, { reading }).until, Date.parse('2026-10-16T04:41:07Z'))
  const only5h = { windows: { weekly: { remaining: 0.9, resetsAt: '2026-10-20T00:00:00Z' }, '5h': { remaining: 0.04, resetsAt: '2026-10-14T09:41:07Z' } } }
  assert.equal(mark(tempDir(t), { reading: only5h }).until, Date.parse('2026-10-14T09:41:07Z'))
})

test('in any other case the mark lasts 60 minutes: a rate limit, no reading, an unknown balance, or a share read as 0% used', (t) => {
  const readings = {
    'a rate limit with plenty left': { windows: { weekly: { remaining: 0.8, resetsAt: WEEKLY_RESET } } },
    'no reading': null,
    unknown: { unknown: true, windows: {} },
    'a balance that is unknown': { windows: { weekly: { remaining: null, resetsAt: WEEKLY_RESET } } },
    'a share read as 0% used': { windows: { weekly: { remaining: 1, resetsAt: WEEKLY_RESET } }, usedPercentAbsent: true },
    'a reset already past': { windows: { weekly: { remaining: 0, resetsAt: '2026-10-14T05:00:00Z' } } },
    'a reset that cannot be read': { windows: { weekly: { remaining: 0, resetsAt: 'soon' } } },
  }
  for (const [name, reading] of Object.entries(readings)) {
    const dir = tempDir(t)
    const m = mark(dir, { reading })
    assert.deepEqual([m.until, m.confirmed, m.resetsAt], [NOW + 60 * MIN, false, null], name)
    assert.equal(marks.liveMark(dir, 'agy', 'claude', NOW + 59 * MIN) !== null, true, name)
    assert.equal(marks.liveMark(dir, 'agy', 'claude', NOW + 60 * MIN), null, name)
  }
  assert.equal(mark(tempDir(t), { reading: readings['a share read as 0% used'] }).usedPercentAbsent, true)
  assert.equal(mark(tempDir(t), { minutes: 15 }).until, NOW + 15 * MIN, 'the length comes from the table')
})

test('another call for quota renews an unconfirmed mark, and nothing shortens a mark that holds longer', (t) => {
  const dir = tempDir(t)
  mark(dir, {})
  const renewed = mark(dir, { now: NOW + 30 * MIN })
  assert.deepEqual([renewed.at, renewed.until], [NOW + 30 * MIN, NOW + 90 * MIN])
  assert.equal(marks.liveMark(dir, 'agy', 'claude', NOW + 80 * MIN).until, NOW + 90 * MIN)
  const confirmed = mark(dir, { reading: dry(), now: NOW + 31 * MIN })
  assert.equal(confirmed.until, Date.parse(WEEKLY_RESET))
  const later = mark(dir, { now: NOW + 32 * MIN })
  assert.deepEqual([later.until, later.confirmed], [Date.parse(WEEKLY_RESET), true])
  assert.equal(marks.liveMark(dir, 'agy', 'claude', NOW + 33 * MIN).confirmed, true)
})

test('a mark survives a new process: it is a file in the data directory, one per group', (t) => {
  const dir = tempDir(t)
  mark(dir, {})
  marks.markDry(dir, { harness: 'grok', group: 'grok', reserve: RESERVE, now: NOW + MIN })
  const file = marks.markFile(dir, 'agy', 'claude')
  assert.equal(file, path.join(dir, 'lanes', 'marks', 'agy__claude.json'))
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).group, 'claude')
  assert.deepEqual(marks.liveMarks(dir, NOW + 2 * MIN).map((m) => `${m.harness}/${m.group}`), ['agy/claude', 'grok/grok'])
  assert.deepEqual(marks.liveMarks(dir, NOW + 60 * MIN + 30000).map((m) => `${m.harness}/${m.group}`), ['grok/grok'])
  assert.equal(marks.liveMark(dir, 'agy', 'gemini', NOW + MIN), null)
  assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(), ['agy__claude.json', 'grok__grok.json'], 'no temporary file is left')
})

test('a mark file that is missing, unreadable or without a time is no mark, and a group key cannot leave the directory', (t) => {
  const dir = tempDir(t)
  assert.equal(marks.liveMark(dir, 'agy', 'claude', NOW), null)
  assert.deepEqual(marks.liveMarks(dir, NOW), [])
  fs.mkdirSync(marks.marksDir(dir), { recursive: true })
  fs.writeFileSync(marks.markFile(dir, 'agy', 'claude'), '{not json')
  fs.writeFileSync(marks.markFile(dir, 'agy', 'gemini'), JSON.stringify({ harness: 'agy', group: 'gemini' }))
  assert.equal(marks.liveMark(dir, 'agy', 'claude', NOW), null)
  assert.equal(marks.liveMark(dir, 'agy', 'gemini', NOW), null)
  assert.deepEqual(marks.liveMarks(dir, NOW), [])
  marks.markDry(dir, { harness: 'agy', group: '../../escape', reserve: RESERVE, now: NOW })
  assert.deepEqual(fs.readdirSync(dir), ['lanes'])
  assert.equal(path.dirname(marks.markFile(dir, 'a/b', '../c')), marks.marksDir(dir))
  assert.notEqual(marks.liveMark(dir, 'agy', '../../escape', NOW + MIN), null)
})
