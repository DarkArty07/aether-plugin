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

test('R22: a refusal leaves the router mark for 60 minutes, whatever reset the message states, and keeps that reset as stated, in the single store', (t) => {
  const dataDir = tempDir(t)
  const mark = marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: REAL, now: NOW })
  assert.equal(mark.harness, 'agy')
  assert.equal(mark.group, 'gemini')
  assert.equal(mark.at, NOW)
  assert.equal(mark.until, NOW + 60 * MIN, 'agy said 163 h and was wrong once; a refused call costs no tokens')
  assert.equal(mark.statedResetMs, REAL_MS)
  assert.equal(mark.confirmed, false)
  assert.equal(mark.source, 'router')
  assert.equal(mark.reason, 'quota refusal')
  assert.equal(mark.resetsAt, null)
  const file = laneMarks.markFile(marks.routerMarksRoot(dataDir), 'agy', 'gemini')
  assert.equal(file, path.join(dataDir, 'lanes', 'marks', 'agy__gemini.json'))
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).until, NOW + 60 * MIN)
  assert.notEqual(laneMarks.liveMark(marks.routerMarksRoot(dataDir), 'agy', 'gemini', NOW + MIN), null, 'lane-marks.js reads it as one of its own')
  assert.equal(laneMarks.liveMark(marks.routerMarksRoot(dataDir), 'agy', 'gemini', NOW + 61 * MIN), null, 'it has ended, and the group is tried again')
  assert.equal(fs.existsSync(path.join(dataDir, 'router')), false, 'the old router directory is not created')
  assert.deepEqual(laneMarks.liveMarks(dataDir, NOW + MIN).map((m) => m.group), ['gemini'], 'the swarm reads what the router wrote')
})

test('R22: a message with no reset, or a reset of 400 h, holds 60 minutes too, and says what it stated', (t) => {
  const dataDir = tempDir(t)
  const none = marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: 'Individual quota reached', now: NOW })
  assert.deepEqual([none.until, none.statedResetMs], [NOW + 60 * MIN, null])
  const far = marks.markRefusal(dataDir, { harness: 'agy', group: 'claude', text: 'Individual quota reached. Resets in 400h.', now: NOW })
  assert.deepEqual([far.until, far.statedResetMs], [NOW + 60 * MIN, 400 * H])
  assert.notEqual(laneMarks.liveMark(marks.routerMarksRoot(dataDir), 'agy', 'claude', NOW + MIN), null)
})

test('a mark never shortens, and a text that is not a refusal writes nothing', (t) => {
  const dataDir = tempDir(t)
  marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: REAL, now: NOW })
  const again = marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: 'Individual quota reached. Resets in 2h.', now: NOW - 30 * MIN })
  assert.equal(again.until, NOW + 60 * MIN, 'the later end is kept')
  assert.equal(again.statedResetMs, REAL_MS)
  const renewed = marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: 'Individual quota reached. Resets in 2h.', now: NOW + 30 * MIN })
  assert.equal(renewed.until, NOW + 90 * MIN, 'a refusal again renews it')
  const other = tempDir(t)
  assert.equal(marks.markRefusal(other, { harness: 'agy', group: 'gemini', text: 'exit 1: model not found', now: NOW }), null)
  assert.equal(fs.existsSync(path.join(other, 'lanes')), false, 'a text that is not a refusal writes nothing')
})

test('readAllMarks reads the single store: a swarm mark and a router mark', (t) => {
  const dataDir = tempDir(t)
  laneMarks.markDry(dataDir, { harness: 'agy', group: 'claude', reading: null, reserve: 0.05, now: NOW, minutes: 30 })
  marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: REAL, now: NOW })
  const all = marks.readAllMarks(dataDir, NOW + MIN)
  assert.deepEqual(all.map((m) => [m.harness, m.group, m.source]), [['agy', 'claude', 'swarm'], ['agy', 'gemini', 'router']])
  assert.equal(typeof all[1].until, 'number')
  const later = marks.readAllMarks(dataDir, NOW + 31 * MIN)
  assert.deepEqual(later.map((m) => [m.group, m.source]), [['gemini', 'router']], 'the swarm mark of 30 minutes has ended; the router one holds its 60')
  assert.deepEqual(marks.readAllMarks(tempDir(t), NOW), [])
  assert.deepEqual(marks.readAllMarks(dataDir, NOW + 61 * MIN), [])
})

test('the module writes the single store through markFile and never calls markDry (R9, R22)', (t) => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'router-marks.js'), 'utf8')
  assert.ok(!/markDry/.test(source))
  const dataDir = tempDir(t)
  marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: REAL, now: NOW })
  assert.equal(fs.existsSync(laneMarks.markFile(dataDir, 'agy', 'gemini')), true)
  assert.equal(fs.existsSync(path.join(dataDir, 'router')), false)
})

test('issue 75: Muse\'s subscription-quota 429 leaves the router\'s 60 minute mark, and another 429 does not', (t) => {
  const dataDir = tempDir(t)
  const text = 'API error 429 [request_id=req-75]: Subscription quota exhausted. Your usage window resets at 2026-10-26T00:00:00Z. (rate_limit_error)'
  const mark = marks.markRefusal(dataDir, { harness: 'muse', group: 'muse', text, now: NOW })
  assert.deepEqual([mark.until, mark.reason, mark.statedResetMs, mark.statedResetAt], [NOW + 60 * MIN, 'quota refusal', null, '2026-10-26T00:00:00.000Z'])
  assert.notEqual(laneMarks.liveMark(dataDir, 'muse', 'muse', NOW + MIN), null, 'the swarm reads the mark in the single store')
  const other = tempDir(t)
  assert.equal(marks.markRefusal(other, { harness: 'muse', group: 'muse', text: 'API error 429: Too many requests. (rate_limit_error)', now: NOW }), null)
  assert.equal(fs.existsSync(path.join(other, 'lanes')), false)
})

// ---- one mark store (task 22): the router reads and writes lanes/marks/ ----

const oldMarksDir = (dataDir) => path.join(dataDir, 'router', 'lanes', 'marks')

function writeOldMark(dataDir, name, mark) {
  const dir = oldMarksDir(dataDir)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, name), typeof mark === 'string' ? mark : JSON.stringify(mark))
}

test('routerMarksRoot names no other folder: the router reads and writes the single store', (t) => {
  const dataDir = tempDir(t)
  assert.equal(marks.routerMarksRoot(dataDir), dataDir)
  assert.equal(laneMarks.markFile(marks.routerMarksRoot(dataDir), 'agy', 'gemini'), laneMarks.markFile(dataDir, 'agy', 'gemini'))
})

test('a mark left in the old router directory is found by the router read and the swarm read, and moved to lanes/marks/ once with the same content', (t) => {
  const dataDir = tempDir(t)
  const stored = { harness: 'agy', group: 'gemini', at: NOW, until: NOW + 60 * MIN, confirmed: false, resetsAt: null, usedPercentAbsent: false, source: 'router', reason: 'quota refusal', statedResetMs: REAL_MS, statedResetAt: null }
  writeOldMark(dataDir, 'agy__gemini.json', stored)
  assert.deepEqual(marks.readAllMarks(dataDir, NOW + MIN).map((m) => [m.harness, m.group]), [['agy', 'gemini']])
  assert.deepEqual(laneMarks.liveMark(dataDir, 'agy', 'gemini', NOW + MIN), stored)
  assert.deepEqual(JSON.parse(fs.readFileSync(laneMarks.markFile(dataDir, 'agy', 'gemini'), 'utf8')), stored)
  assert.equal(fs.existsSync(path.join(oldMarksDir(dataDir), 'agy__gemini.json')), false, 'the old file is gone')
  assert.deepEqual(fs.readdirSync(laneMarks.marksDir(dataDir)), ['agy__gemini.json'], 'one file remains')
  assert.equal(laneMarks.liveMarks(dataDir, NOW + MIN).length, 1, 'a second read still sees one mark')
  assert.equal(fs.existsSync(path.join(oldMarksDir(dataDir), 'agy__gemini.json')), false)
})

test('an expired mark in the old router directory is moved and stays expired', (t) => {
  const dataDir = tempDir(t)
  const stored = { harness: 'agy', group: 'gemini', at: NOW - 120 * MIN, until: NOW - 60 * MIN, confirmed: false, resetsAt: null, usedPercentAbsent: false, source: 'router', reason: 'quota refusal', statedResetMs: null, statedResetAt: null }
  writeOldMark(dataDir, 'agy__gemini.json', stored)
  assert.deepEqual(marks.readAllMarks(dataDir, NOW), [])
  assert.equal(laneMarks.liveMark(dataDir, 'agy', 'gemini', NOW), null)
  assert.deepEqual(JSON.parse(fs.readFileSync(laneMarks.markFile(dataDir, 'agy', 'gemini'), 'utf8')), stored, 'the expired mark is moved as it is')
  assert.equal(fs.existsSync(path.join(oldMarksDir(dataDir), 'agy__gemini.json')), false)
})

test('a mark written by the router appears in the swarm view', (t) => {
  const dataDir = tempDir(t)
  marks.markRefusal(dataDir, { harness: 'agy', group: 'gemini', text: REAL, now: NOW })
  const swarm = laneMarks.liveMark(dataDir, 'agy', 'gemini', NOW + MIN)
  assert.notEqual(swarm, null)
  assert.equal(swarm.source, 'router')
  assert.equal(swarm.until, NOW + 60 * MIN)
  assert.deepEqual(laneMarks.liveMarks(dataDir, NOW + MIN).map((m) => m.group), ['gemini'])
  assert.equal(fs.existsSync(oldMarksDir(dataDir)), false, 'the old folder is never created')
})

test('collision through the router read: the later router mark wins and keeps the swarm reason in alsoReasons', (t) => {
  const dataDir = tempDir(t)
  const swarmMark = { harness: 'agy', group: 'gemini', at: NOW, until: NOW + 30 * MIN, confirmed: true, resetsAt: new Date(NOW + 30 * MIN).toISOString(), usedPercentAbsent: false, source: 'swarm', reason: 'dry mark' }
  fs.mkdirSync(laneMarks.marksDir(dataDir), { recursive: true })
  fs.writeFileSync(laneMarks.markFile(dataDir, 'agy', 'gemini'), JSON.stringify(swarmMark))
  const routerMark = { harness: 'agy', group: 'gemini', at: NOW, until: NOW + 60 * MIN, confirmed: false, resetsAt: null, usedPercentAbsent: false, source: 'router', reason: 'quota refusal', statedResetMs: REAL_MS, statedResetAt: null }
  writeOldMark(dataDir, 'agy__gemini.json', routerMark)
  assert.deepEqual(marks.readAllMarks(dataDir, NOW + MIN).map((m) => [m.harness, m.group, m.source]), [['agy', 'gemini', 'router']])
  const kept = JSON.parse(fs.readFileSync(laneMarks.markFile(dataDir, 'agy', 'gemini'), 'utf8'))
  assert.equal(kept.until, NOW + 60 * MIN, 'the later router mark is kept, so the mark never shortens')
  assert.deepEqual(kept.alsoReasons, [{ source: 'swarm', reason: 'dry mark', until: NOW + 30 * MIN }])
  assert.equal(fs.existsSync(path.join(oldMarksDir(dataDir), 'agy__gemini.json')), false)
  assert.deepEqual(fs.readdirSync(laneMarks.marksDir(dataDir)), ['agy__gemini.json'])
})

test('collision through the router read: the later swarm mark is kept and names the router reason', (t) => {
  const dataDir = tempDir(t)
  const swarmMark = { harness: 'agy', group: 'gemini', at: NOW, until: NOW + 90 * MIN, confirmed: true, resetsAt: new Date(NOW + 90 * MIN).toISOString(), usedPercentAbsent: false, source: 'swarm', reason: 'dry mark' }
  fs.mkdirSync(laneMarks.marksDir(dataDir), { recursive: true })
  fs.writeFileSync(laneMarks.markFile(dataDir, 'agy', 'gemini'), JSON.stringify(swarmMark))
  writeOldMark(dataDir, 'agy__gemini.json', { harness: 'agy', group: 'gemini', at: NOW, until: NOW + 60 * MIN, confirmed: false, resetsAt: null, usedPercentAbsent: false, source: 'router', reason: 'quota refusal', statedResetMs: null, statedResetAt: null })
  assert.deepEqual(marks.readAllMarks(dataDir, NOW + MIN).map((m) => [m.harness, m.group, m.source]), [['agy', 'gemini', 'swarm']])
  const kept = JSON.parse(fs.readFileSync(laneMarks.markFile(dataDir, 'agy', 'gemini'), 'utf8'))
  assert.equal(kept.until, NOW + 90 * MIN)
  assert.deepEqual(kept.alsoReasons, [{ source: 'router', reason: 'quota refusal', until: NOW + 60 * MIN }])
  assert.equal(fs.existsSync(path.join(oldMarksDir(dataDir), 'agy__gemini.json')), false)
  assert.deepEqual(fs.readdirSync(laneMarks.marksDir(dataDir)), ['agy__gemini.json'])
})

test('collision with equal ends keeps the mark already in the store', (t) => {
  const dataDir = tempDir(t)
  const swarmMark = { harness: 'agy', group: 'gemini', at: NOW, until: NOW + 60 * MIN, confirmed: true, resetsAt: new Date(NOW + 60 * MIN).toISOString(), usedPercentAbsent: false, source: 'swarm', reason: 'dry mark' }
  fs.mkdirSync(laneMarks.marksDir(dataDir), { recursive: true })
  fs.writeFileSync(laneMarks.markFile(dataDir, 'agy', 'gemini'), JSON.stringify(swarmMark))
  writeOldMark(dataDir, 'agy__gemini.json', { harness: 'agy', group: 'gemini', at: NOW, until: NOW + 60 * MIN, confirmed: false, resetsAt: null, usedPercentAbsent: false, source: 'router', reason: 'quota refusal', statedResetMs: null, statedResetAt: null })
  marks.readAllMarks(dataDir, NOW + MIN)
  const kept = JSON.parse(fs.readFileSync(laneMarks.markFile(dataDir, 'agy', 'gemini'), 'utf8'))
  assert.equal(kept.reason, 'dry mark', 'the tie keeps the store mark')
  assert.deepEqual(kept.alsoReasons, [{ source: 'router', reason: 'quota refusal', until: NOW + 60 * MIN }])
  assert.equal(fs.existsSync(path.join(oldMarksDir(dataDir), 'agy__gemini.json')), false)
  assert.deepEqual(fs.readdirSync(laneMarks.marksDir(dataDir)), ['agy__gemini.json'])
})

test('a damaged file in the old folder stays in place and is named in skipped', (t) => {
  const dataDir = tempDir(t)
  writeOldMark(dataDir, 'agy__gemini.json', '{not json')
  writeOldMark(dataDir, 'grok__grok.json', { harness: 'grok', group: 'grok' })
  const result = laneMarks.migrateRouterMarks(dataDir)
  assert.deepEqual(result.skipped.sort(), ['agy__gemini.json', 'grok__grok.json'])
  assert.equal(fs.existsSync(path.join(oldMarksDir(dataDir), 'agy__gemini.json')), true, 'a damaged file is never deleted')
  assert.equal(fs.existsSync(path.join(oldMarksDir(dataDir), 'grok__grok.json')), true)
  assert.equal(fs.existsSync(laneMarks.markFile(dataDir, 'agy', 'gemini')), false)
})

test('a quota failure that a harness declares itself, as Muse\'s, leaves the same 60 minute mark, and the words of any other message do not', (t) => {
  const dataDir = tempDir(t)
  const mark = marks.markRefusal(dataDir, { harness: 'muse', group: 'muse', text: 'quota: muse weekly limit, resets 2026-10-22T10:00:00.000Z', now: NOW })
  assert.equal(mark.until, NOW + 60 * MIN)
  assert.equal(mark.statedResetMs, null)
  assert.equal(laneMarks.liveMark(dataDir, 'muse', 'muse', NOW + MIN).harness, 'muse', 'the swarm reads the mark in the single store')
  assert.equal(fs.existsSync(path.join(dataDir, 'router')), false, 'the old router directory is not written')
  const other = tempDir(t)
  for (const text of ['the quota of muse group muse cannot be read', 'muse is at or under the reserve', 'exit 1: quota exceeded somewhere', 'failed: quota: not at the start']) {
    assert.equal(marks.markRefusal(other, { harness: 'muse', group: 'muse', text, now: NOW }), null, text)
  }
  assert.equal(fs.existsSync(path.join(other, 'lanes')), false)
})
