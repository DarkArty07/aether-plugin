'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const quota = require('../plugins/aether/lib/router-quota.js')
const readingsLib = require('../plugins/aether/lib/lane-readings.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { loadRungs } = require('../plugins/aether/lib/router-rungs.js')

const config = lanes.loadConfig(lanes.CONFIG_FILE)
const rungs = loadRungs()
const NOW = Date.parse('2026-10-15T21:32:00-06:00')
const H = 3600 * 1000
const MIN = 60 * 1000
const win = (remaining, hours) => ({ remaining, resetsAt: new Date(NOW + hours * H).toISOString() })
const weekly = (remaining, hours) => ({ windows: { weekly: win(remaining, hours) } })
const gemini = (remaining, hours) => ({ windows: { '5h': win(1, 5), weekly: win(remaining, hours) } })
const GROK = { readAt: NOW - 2 * MIN, groups: { grok: weekly(0.95, 29.6) } }
const agy = (groups, readAt = NOW - 2 * MIN) => ({ readAt, groups })
const base = { level: 'B', axis: 'general', rungs, config, enabled: ['agy', 'grok'], installed: () => true, marks: [], now: NOW }
const find = (result, harness, group) => result.considered.find((c) => c.harness === harness && c.group === group)

test('scenario 8: the weekly window that renews first wins, on the level B rung of its harness (R21)', () => {
  const r = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: gemini(1, 60) }), grok: GROK } })
  assert.equal(r.pick.harness, 'grok')
  assert.equal(r.pick.rung.model, 'grok-4.7')
  assert.equal(r.pick.rung.effort, 'low')
  const g = find(r, 'agy', 'gemini')
  assert.equal(g.state, 'candidate')
  assert.equal(g.windowName, 'weekly')
  assert.equal(g.remaining, 1)
  assert.equal(g.hoursLeft, 60)
  assert.equal(g.rank, 1)
  const k = find(r, 'grok', 'grok')
  assert.equal(k.windowName, 'weekly')
  assert.equal(k.remaining, 0.95)
  assert.equal(k.hoursLeft, 29.6)
  assert.equal(k.rank, 0)
  assert.equal(k.model, 'grok-4.7')
  assert.equal(k.effort, 'low')
})

test('scenario 17: a group under the reserve is out, although the literal rule would take it first', () => {
  const dry = { agy: agy({ claude: weekly(0, 1.1) }), grok: GROK }
  const r = quota.chooseHarness({ ...base, readings: dry })
  assert.equal(r.pick.harness, 'grok')
  const c = find(r, 'agy', 'claude')
  assert.equal(c.state, 'excluded')
  assert.equal(c.why, 'reserve')
  assert.equal(c.hoursLeft, 1.1)

  // The exclusion is the quota's, not a missing rung: with a table that measured agy's Claude rung, a group with
  // balance would win because it renews in 1.1 h, and the same group at 0 % is still out.
  const measured = structuredClone(rungs)
  const rung = measured.rungs.find((x) => x.harness === 'agy' && x.model === 'claude-sonnet-5-5' && x.effort === 'medium')
  Object.assign(rung, { status: 'measured', why: null, levels: { general: 'B', code: 'B' }, priceOutput: 10 })
  assert.equal(quota.chooseHarness({ ...base, rungs: measured, readings: dry }).pick.harness, 'grok')
  const alive = quota.chooseHarness({ ...base, rungs: measured, readings: { agy: agy({ claude: weekly(0.9, 1.1) }), grok: GROK } })
  assert.equal(alive.pick.harness, 'agy', 'the literal rule would take it')
  assert.equal(alive.pick.rung.model, 'claude-sonnet-5-5')

  // With the table as it is, agy serves no level B under a Claude name (A-12): a group with balance is unserved.
  const unserved = quota.chooseHarness({ ...base, readings: { agy: agy({ claude: weekly(0.9, 1.1) }), grok: GROK } })
  assert.equal(find(unserved, 'agy', 'claude').state, 'unserved')
  assert.equal(find(unserved, 'agy', 'claude').why, 'no-rung')
  assert.equal(unserved.pick.harness, 'grok')
})

test('scenario 18: agy wins when its weekly window renews first, with the level B rung of the Gemini group', () => {
  const r = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: gemini(0.8, 10) }), grok: GROK } })
  assert.equal(r.pick.harness, 'agy')
  assert.equal(r.pick.rung.model, 'gemini-3.8-flash')
  assert.equal(r.pick.rung.effort, 'medium')
  const g = find(r, 'agy', 'gemini')
  assert.equal(g.windowName, 'weekly')
  assert.equal(g.remaining, 0.8)
  assert.equal(g.hoursLeft, 10)
})

test('scenario 19: with two groups that have balance, the owner rule decides, not the balance per hour of A49', () => {
  const r = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: gemini(0.1, 10) }), grok: GROK } })
  assert.equal(r.pick.harness, 'agy', 'agy renews first, with 10 % left: A49 (0.01 against 0.032) would take grok, and is pending')
  assert.equal(find(r, 'agy', 'gemini').state, 'candidate')
})

test('two windows that renew together: the one with more balance goes first, then the order of the table', () => {
  const more = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: gemini(0.5, 24) }), grok: { ...GROK, groups: { grok: weekly(0.9, 24) } } } })
  assert.equal(more.pick.harness, 'grok')
  const same = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: gemini(0.9, 24) }), grok: { ...GROK, groups: { grok: weekly(0.9, 24) } } } })
  assert.equal(same.pick.harness, 'agy', 'agy comes first in the table of lanes.json')
})

test('scenario 9: a level only Claude serves gives no pick, and every group says why', () => {
  const readings = { agy: agy({ gemini: gemini(1, 60), claude: weekly(0.9, 40) }), grok: GROK }
  const r = quota.chooseHarness({ ...base, level: 'D', readings })
  assert.equal(r.pick, null)
  assert.equal(r.considered.length, 3)
  assert.ok(r.considered.every((c) => c.state === 'unserved' && c.why === 'no-rung'))
})

test('a harness that is not installed or not enabled is out, and codex is never a candidate (R20)', () => {
  const readings = { agy: agy({ gemini: gemini(1, 60) }), grok: GROK }
  const noGrok = quota.chooseHarness({ ...base, readings, installed: (name) => name !== 'grok' })
  assert.equal(noGrok.pick.harness, 'agy')
  assert.equal(find(noGrok, 'grok', 'grok').why, 'not-installed')
  const onlyAgy = quota.chooseHarness({ ...base, readings, enabled: ['agy'] })
  assert.equal(find(onlyAgy, 'grok', 'grok').why, 'not-enabled')
  const none = quota.chooseHarness({ ...base, readings, enabled: ['codex', 'cursor'] })
  assert.equal(none.pick, null)
  assert.ok(none.considered.every((c) => ['agy', 'grok'].includes(c.harness)))
})

test('R23: a group without a valid reading is out, and is never ordered by harnesses or by an old reading', () => {
  const oldAgy = agy({ gemini: gemini(1, 5) }, NOW - 11 * MIN)
  const r = quota.chooseHarness({ ...base, readings: { agy: oldAgy, grok: GROK } })
  assert.equal(r.pick.harness, 'grok', 'agy would win by its reset, but its reading is 11 minutes old and its life is 10')
  const g = find(r, 'agy', 'gemini')
  assert.equal(g.state, 'excluded')
  assert.equal(g.why, 'no-reading')
  assert.equal(g.note, 'sin lectura; la última tiene 11 min')
  assert.equal(g.readingAgeMin, 11)
  assert.equal(g.rank, null)

  const nothing = quota.chooseHarness({ ...base, readings: { agy: null, grok: null } })
  assert.equal(nothing.pick, null, 'agy is first in harnesses and still is not chosen without a reading')
  assert.ok(nothing.considered.every((c) => c.state === 'excluded' && c.why === 'no-reading'))
  assert.equal(find(nothing, 'agy', 'gemini').note, 'sin lectura; ninguna guardada')

  const oldGrok = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: gemini(1, 60) }), grok: { ...GROK, readAt: NOW - 31 * MIN } } })
  assert.equal(oldGrok.pick.harness, 'agy')
  assert.equal(find(oldGrok, 'grok', 'grok').why, 'no-reading')
  const future = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: gemini(1, 60) }, NOW + MIN), grok: GROK } })
  assert.equal(find(future, 'agy', 'gemini').why, 'no-reading', 'a reading from the future is not valid')
  const missingGroup = quota.chooseHarness({ ...base, readings: { agy: agy({ claude: weekly(0.9, 40) }), grok: GROK } })
  assert.equal(find(missingGroup, 'agy', 'gemini').why, 'no-reading', 'a valid reading of the harness that lacks the group')
})

test('a group whose balance cannot be read is out, not guessed', () => {
  const r = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: { unknown: true, windows: {} } }), grok: GROK } })
  assert.equal(find(r, 'agy', 'gemini').why, 'no-balance')
  assert.equal(r.pick.harness, 'grok')
})

test('scenario 16 and R22: a reading with balance does not lift a dry mark', () => {
  const MARK = { harness: 'agy', group: 'gemini', at: NOW - 40 * H, until: NOW + 43 * H }
  const marks = [MARK]
  const copy = structuredClone(marks)
  const r = quota.chooseHarness({ ...base, marks, readings: { agy: agy({ gemini: gemini(0.98, 60) }), grok: GROK } })
  const g = find(r, 'agy', 'gemini')
  assert.equal(g.state, 'excluded')
  assert.equal(g.why, 'mark')
  assert.equal(g.note, 'marca vigente; la lectura con saldo no la desmiente')
  assert.equal(r.pick.harness, 'grok')
  assert.deepEqual(marks, copy, 'the mark is not changed')

  const dry = quota.chooseHarness({ ...base, marks, readings: { agy: agy({ gemini: gemini(0.02, 60) }), grok: GROK } })
  assert.equal(find(dry, 'agy', 'gemini').why, 'mark')
  assert.equal(find(dry, 'agy', 'gemini').note, 'marca vigente')
  const noReading = quota.chooseHarness({ ...base, marks, readings: { agy: null, grok: GROK } })
  assert.equal(find(noReading, 'agy', 'gemini').why, 'mark', 'the mark comes before the missing reading')

  const expired = quota.chooseHarness({ ...base, marks: [{ ...MARK, until: NOW - 1 }], readings: { agy: agy({ gemini: gemini(0.98, 5) }), grok: GROK } })
  assert.equal(expired.pick.harness, 'agy', 'a mark that has expired holds nothing')
  const other = quota.chooseHarness({ ...base, marks: [{ harness: 'agy', group: 'claude', at: NOW, until: NOW + H }], readings: { agy: agy({ gemini: gemini(0.98, 5) }), grok: GROK } })
  assert.equal(other.pick.harness, 'agy', 'a mark of another group holds nothing')
})

test('scenario 20: the mark the router left after a refusal holds the group the same way', () => {
  const routerMark = { harness: 'agy', group: 'gemini', at: NOW, until: NOW + 588147000, source: 'router' }
  const r = quota.chooseHarness({ ...base, marks: [routerMark], readings: { agy: agy({ gemini: gemini(0.98, 5) }), grok: GROK } })
  assert.equal(find(r, 'agy', 'gemini').why, 'mark')
  assert.equal(r.pick.harness, 'grok')
})

test('peekReadings serves the saved agy reading whatever its age, and never asks the adapter (R23)', (t) => {
  const dataDir = tempDir(t)
  const file = readingsLib.cacheFile(dataDir, 'agy')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const groups = { gemini: gemini(1, 60), claude: weekly(0.9, 40) }
  fs.writeFileSync(file, JSON.stringify({ harness: 'agy', readAt: NOW - 72 * H, groups }))
  const grokReading = { ...weekly(0.95, 29.6), source: { ageMinutes: 12 } }
  const createAdapter = (name) => (name === 'agy'
    ? { quotaCost: 'process', quota() { throw new Error('must not run') } }
    : { quotaCost: 'log', quota: () => ({ groups: { grok: grokReading } }) })
  const got = quota.peekReadings({ dataDir, config, harnesses: ['agy', 'grok'], createAdapter, now: NOW })
  assert.deepEqual(got.agy, { readAt: NOW - 72 * H, groups })
  assert.deepEqual(got.grok, { readAt: NOW - 12 * MIN, groups: { grok: grokReading } })
})

test('peekReadings gives null for a missing file and for a log that fails', (t) => {
  const createAdapter = (name) => (name === 'agy'
    ? { quotaCost: 'process', quota() { throw new Error('must not run') } }
    : { quotaCost: 'log', quota() { throw new Error('no log') } })
  const got = quota.peekReadings({ dataDir: tempDir(t), config, harnesses: ['agy', 'grok'], createAdapter, now: NOW })
  assert.deepEqual(got, { agy: null, grok: null })
})

test('peekReadings reads a grok answer with no reading as no reading, so its renewal starts (R23)', (t) => {
  const unknown = { groups: { grok: { unknown: true, windows: {} } } }
  const createAdapter = (name) => (name === 'agy'
    ? { quotaCost: 'process', quota() { throw new Error('must not run') } }
    : { quotaCost: 'log', quota: () => unknown })
  const got = quota.peekReadings({ dataDir: tempDir(t), config, harnesses: ['agy', 'grok'], createAdapter, now: NOW })
  assert.equal(got.grok, null, 'unknownQuota has no source: it is not a reading taken now')
  assert.deepEqual(quota.staleHarnesses({ readings: got, config, harnesses: ['grok'], now: NOW }), ['grok'])
  const r = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: gemini(1, 60) }), grok: got.grok } })
  const k = find(r, 'grok', 'grok')
  assert.equal(k.why, 'no-reading')
  assert.equal(k.note, 'sin lectura; ninguna guardada')
  assert.equal(r.pick.harness, 'agy')
})

test('peekReadings takes the newest of the reading it reads and the router\'s own renewed one (R23)', (t) => {
  const dataDir = tempDir(t)
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const old = { gemini: gemini(0.5, 60) }
  const renewed = { gemini: gemini(0.4, 60) }
  write(readingsLib.cacheFile(dataDir, 'agy'), { harness: 'agy', readAt: NOW - 2 * MIN, groups: old })
  write(quota.readingFile(dataDir, 'agy'), { readAt: NOW - 20 * MIN, groups: renewed })
  const grokLog = { ...weekly(0.95, 29.6), source: { ageMinutes: 12 } }
  const grokAcp = { ...weekly(0.9, 29.6), source: { method: 'acp', log: null, ageMinutes: 0 } }
  write(quota.readingFile(dataDir, 'grok'), { readAt: NOW - MIN, groups: { grok: grokAcp } })
  let log = { groups: { grok: { unknown: true, windows: {} } } }
  const createAdapter = (name) => (name === 'agy'
    ? { quotaCost: 'process', quota() { throw new Error('must not run') } }
    : { quotaCost: 'log', quota: () => log })
  const peek = () => quota.peekReadings({ dataDir, config, harnesses: ['agy', 'grok'], createAdapter, now: NOW })

  assert.deepEqual(peek().agy, { readAt: NOW - 2 * MIN, groups: old }, 'agy as before: its saved reading is newer')
  assert.deepEqual(peek().grok, { readAt: NOW - MIN, groups: { grok: grokAcp } }, 'grok\'s log has nothing: the renewed reading counts')
  write(quota.readingFile(dataDir, 'agy'), { readAt: NOW - MIN, groups: renewed })
  assert.deepEqual(peek().agy, { readAt: NOW - MIN, groups: renewed })
  log = { groups: { grok: grokLog } }
  assert.deepEqual(peek().grok, { readAt: NOW - MIN, groups: { grok: grokAcp } }, 'a log line 12 minutes old is older')
  write(quota.readingFile(dataDir, 'grok'), { readAt: NOW - 40 * MIN, groups: { grok: grokAcp } })
  assert.deepEqual(peek().grok, { readAt: NOW - 12 * MIN, groups: { grok: grokLog } }, 'a newer log line wins')
})

test('a router reading that is missing, unreadable or malformed is no reading', (t) => {
  const createAdapter = (name) => (name === 'agy'
    ? { quotaCost: 'process', quota() { throw new Error('must not run') } }
    : { quotaCost: 'log', quota: () => ({ groups: { grok: { unknown: true, windows: {} } } }) })
  for (const content of [null, '{ not json', '[]', 'null', JSON.stringify({ readAt: 'yesterday', groups: {} }), JSON.stringify({ readAt: NOW, groups: [] }), JSON.stringify({ readAt: NOW })]) {
    const dataDir = tempDir(t)
    if (content !== null) {
      for (const harness of ['agy', 'grok']) {
        fs.mkdirSync(path.dirname(quota.readingFile(dataDir, harness)), { recursive: true })
        fs.writeFileSync(quota.readingFile(dataDir, harness), content)
      }
    }
    const got = quota.peekReadings({ dataDir, config, harnesses: ['agy', 'grok'], createAdapter, now: NOW })
    assert.deepEqual(got, { agy: null, grok: null }, String(content))
  }
  const dir = tempDir(t)
  fs.mkdirSync(quota.readingFile(dir, 'grok'), { recursive: true })
  assert.equal(quota.peekReadings({ dataDir: dir, config, harnesses: ['grok'], createAdapter, now: NOW }).grok, null, 'a directory in its place')
})

test('the life of a reading is the one of its harness, and staleHarnesses names those that are not valid', () => {
  assert.equal(quota.lifeMs(config, 'agy'), 10 * MIN)
  assert.equal(quota.lifeMs(config, 'grok'), 30 * MIN)
  const stale = (readings) => quota.staleHarnesses({ readings, config, harnesses: ['agy', 'grok'], now: NOW })
  assert.deepEqual(stale({ agy: { readAt: NOW - 11 * MIN, groups: {} }, grok: { readAt: NOW - 29 * MIN, groups: {} } }), ['agy'])
  assert.deepEqual(stale({ agy: { readAt: NOW - 9 * MIN, groups: {} }, grok: { readAt: NOW - 31 * MIN, groups: {} } }), ['grok'])
  assert.deepEqual(stale({ agy: { readAt: NOW - 10 * MIN, groups: {} }, grok: null }), ['agy', 'grok'], 'a reading as old as its life is not valid')
  assert.deepEqual(stale({ agy: { readAt: NOW + MIN, groups: {} }, grok: { readAt: NOW, groups: {} } }), ['agy'])
  assert.deepEqual(quota.staleHarnesses({ readings: { agy: null }, config, harnesses: ['agy', 'codex'], now: NOW }), ['agy'], 'only agy and grok are asked about')
})

test('a reading with a window that has reset since it was taken is not valid, as in readGroups (R23)', () => {
  const at = (ms) => new Date(NOW + ms).toISOString()
  const groups = (resetsAt) => ({ gemini: { windows: { weekly: { remaining: 0.9, resetsAt } } } })
  const stale = (resetsAt) => quota.staleHarnesses({ readings: { agy: { readAt: NOW - 5 * MIN, groups: groups(resetsAt) } }, config, harnesses: ['agy'], now: NOW })
  assert.deepEqual(stale(at(-2 * MIN)), ['agy'], 'the window reset between the reading and now')
  assert.deepEqual(stale(at(0)), ['agy'], 'a reset at now has come')
  assert.deepEqual(stale(at(-6 * MIN)), [], 'a reset already behind the reading was not waiting for anything')
  assert.deepEqual(stale(at(2 * MIN)), [], 'a reset still ahead')
  assert.deepEqual(stale('not a date'), [])
  const r = quota.chooseHarness({ ...base, readings: { agy: agy({ gemini: { windows: { '5h': win(1, 5), weekly: { remaining: 0.9, resetsAt: at(-2 * MIN) } } } }, NOW - 5 * MIN), grok: GROK } })
  assert.equal(find(r, 'agy', 'gemini').why, 'no-reading', 'the refilled window makes the old balance untrue')
  assert.equal(r.pick.harness, 'grok')
})

test('the module neither launches a process nor takes the order of A49 (R9, R21)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'router-quota.js'), 'utf8')
  assert.ok(!/child_process/.test(source))
  assert.ok(!/orderCandidates/.test(source))
  assert.ok(!/markDry/.test(source))
})
