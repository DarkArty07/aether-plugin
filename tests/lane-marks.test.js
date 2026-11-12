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
    // Issue 015's odd reading: the spent window resets in the future, the other six days ago.
    'a past reset on a window above the reserve': { windows: { weekly: { remaining: 0.01, resetsAt: '2026-10-18T07:22:02Z' }, '5h': { remaining: 0.9, resetsAt: '2026-10-09T05:53:31Z' } } },
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

test('calls that end for quota together never shorten a confirmed mark: the 60-minute mark of one does not replace the reset mark of another', async (t) => {
  const dir = tempDir(t)
  const trials = 150
  // Every process marks the same group of the same trial at the same moment, trial after trial, the one with a reading
  // showing the group under the reserve among the ones with none.
  const script = `
    const fs = require('node:fs')
    const marks = require(${JSON.stringify(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'lane-marks.js'))})
    const [dir, startFile, confirmed, trials, now, reading] = process.argv.slice(1)
    while (!fs.existsSync(startFile)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
    const start = Number(fs.readFileSync(startFile, 'utf8'))
    for (let i = 0; i < Number(trials); i++) {
      while (Date.now() < start + i * 8) {}
      marks.markDry(dir, { harness: 'agy', group: 'g' + i, reading: confirmed === '1' ? JSON.parse(reading) : null, reserve: ${RESERVE}, now: Number(now) })
    }`
  const startFile = path.join(dir, 'start')
  const children = ['1', '0', '0', '0'].map(
    (confirmed) =>
      new Promise((resolve, reject) => {
        const child = require('node:child_process').spawn(process.execPath, ['-e', script, dir, startFile, confirmed, trials, NOW, JSON.stringify(dry())], { stdio: 'ignore' })
        child.on('error', reject)
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`a marking process exited with ${code}`))))
      }),
  )
  fs.writeFileSync(startFile, String(Date.now() + 300))
  await Promise.all(children)
  const shortened = []
  for (let i = 0; i < trials; i++) {
    const m = marks.liveMark(dir, 'agy', `g${i}`, NOW)
    if (!m || m.until !== Date.parse(WEEKLY_RESET)) shortened.push(i)
  }
  assert.deepEqual(shortened, [])
  assert.equal(fs.readdirSync(marks.marksDir(dir)).some((name) => !name.endsWith('.json') || name.startsWith('.')), false, 'no lock or temporary file is left')
})

test('a lock left by a process that died is broken after a while, and a mark is still written when the lock cannot be had', (t) => {
  const dir = tempDir(t)
  const file = marks.markFile(dir, 'agy', 'claude')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.lock`, '')
  const old = new Date(Date.now() - 60 * 1000)
  fs.utimesSync(`${file}.lock`, old, old)
  assert.equal(mark(dir, {}).until, NOW + 60 * MIN)
  assert.equal(fs.existsSync(`${file}.lock`), false)
  const held = tempDir(t)
  const heldFile = marks.markFile(held, 'agy', 'claude')
  fs.mkdirSync(path.dirname(heldFile), { recursive: true })
  fs.writeFileSync(`${heldFile}.lock`, '')
  assert.equal(mark(held, {}).until, NOW + 60 * MIN)
  assert.notEqual(marks.liveMark(held, 'agy', 'claude', NOW), null)
  assert.equal(fs.existsSync(`${heldFile}.lock`), true, 'a lock that is not ours is left alone')
})

test('a mark whose end is not a time, or lies beyond the longest a mark can hold, is no mark', (t) => {
  const dir = tempDir(t)
  const week = 7 * 24 * 60 * MIN
  assert.equal(marks.MAX_MARK_MS > week, true, 'the weekly window fits')
  fs.mkdirSync(marks.marksDir(dir), { recursive: true })
  const write = (group, until) => fs.writeFileSync(marks.markFile(dir, 'agy', group), JSON.stringify({ harness: 'agy', group, at: NOW, until, confirmed: false }))
  write('week', NOW + week)
  write('huge', 1e300)
  write('year', NOW + 365 * 24 * 60 * MIN)
  write('string', 'soon')
  write('nan', null)
  assert.deepEqual(marks.liveMarks(dir, NOW).map((m) => m.group), ['week'])
  assert.notEqual(marks.liveMark(dir, 'agy', 'week', NOW), null)
  for (const group of ['huge', 'year', 'string', 'nan']) assert.equal(marks.liveMark(dir, 'agy', group, NOW), null, group)
})

test('a mark written under a clock far ahead stops holding once the clock is right, and a reset beyond the longest window is not trusted', (t) => {
  const dir = tempDir(t)
  const ahead = NOW + 365 * 24 * 60 * MIN
  mark(dir, { now: ahead })
  assert.equal(marks.liveMark(dir, 'agy', 'claude', NOW), null)
  const far = { windows: { weekly: { remaining: 0, resetsAt: new Date(NOW + 30 * 24 * 60 * MIN).toISOString() } } }
  const m = mark(tempDir(t), { reading: far })
  assert.deepEqual([m.until, m.confirmed], [NOW + 60 * MIN, false])
})

// ---- a reading whose source is older than the mark does not lift it ----

const LIFE = 30 * MIN
const iso = (ms) => new Date(ms).toISOString()
const healthy = (extra = {}) => ({ windows: { weekly: { remaining: 0.9, resetsAt: '2026-10-20T00:00:00Z' }, '5h': { remaining: 0.9, resetsAt: '2026-10-14T09:41:07Z' } }, ...extra })
// A reading taken ten minutes after the mark was written, whose source (when it has one) is the given one.
const liftWith = (dir, source) =>
  marks.liftIfHealthy(dir, { harness: 'agy', group: 'claude', reading: healthy(source === undefined ? {} : { source }), readAt: NOW + 10 * MIN, reserve: RESERVE, lifeMs: LIFE, now: NOW + 10 * MIN })

test('a healthy reading taken after the mark but from a source older than the mark does not lift it, and a source as new as the mark does', (t) => {
  const dir = tempDir(t)
  const held = mark(dir, {})
  assert.deepEqual([held.confirmed, held.until - held.at], [false, 60 * MIN])
  // The reading was taken now, yet what it read was written before the call that ended for quota.
  assert.deepEqual(liftWith(dir, { command: 'muse exec --json', ts: iso(NOW - 1000), ageMinutes: 0 }), held)
  assert.equal(fs.existsSync(marks.markFile(dir, 'agy', 'claude')), true, 'the mark file is still there')
  assert.equal(liftWith(dir, { command: 'muse exec --json', ts: iso(NOW), ageMinutes: 0 }), null, 'a source written at the moment of the mark is not older than it')
  assert.equal(fs.existsSync(marks.markFile(dir, 'agy', 'claude')), false)

  const later = tempDir(t)
  mark(later, {})
  assert.equal(liftWith(later, { command: 'muse exec --json', ts: iso(NOW + MIN), ageMinutes: 0 }), null)
  assert.equal(marks.liveMark(later, 'agy', 'claude', NOW + 10 * MIN), null)
})

// Grok's reading comes from its log, and its source carries the time of the log line (grok-quota.js): a line written
// before the mark no longer lifts it, though the reading was taken after it. A headless grok call writes no line.
test('a healthy grok reading from a log line older than the mark does not lift it, and a line written after the mark does', (t) => {
  const grokMark = (dir) => marks.markDry(dir, { harness: 'grok', group: 'grok', reserve: RESERVE, now: NOW })
  const grokLift = (dir, lineTime) =>
    marks.liftIfHealthy(dir, {
      harness: 'grok',
      group: 'grok',
      reading: { windows: { weekly: { remaining: 0.9, resetsAt: '2026-10-20T00:00:00Z' } }, source: { log: '/home/owner/.grok/logs/unified.jsonl', ts: iso(lineTime), pid: 1234, version: '1.0.62', ageMinutes: 5 } },
      readAt: NOW + 10 * MIN,
      reserve: RESERVE,
      lifeMs: LIFE,
      now: NOW + 10 * MIN,
    })
  const dir = tempDir(t)
  const held = grokMark(dir)
  assert.deepEqual(grokLift(dir, NOW - 5 * MIN), held, 'the line is older than the mark')
  assert.equal(fs.existsSync(marks.markFile(dir, 'grok', 'grok')), true)
  assert.equal(grokLift(dir, NOW + 2 * MIN), null, 'a line written after the mark lifts it')
  assert.equal(fs.existsSync(marks.markFile(dir, 'grok', 'grok')), false)
})

test('a healthy reading with no source, or a source with no readable time, lifts a mark as it did before', (t) => {
  const sources = { 'no source': undefined, 'a source with no time': { command: 'agy' }, 'a time that cannot be read': { ts: 'soon' }, 'a time that is null': { ts: null } }
  for (const [name, source] of Object.entries(sources)) {
    const dir = tempDir(t)
    mark(dir, {})
    assert.equal(liftWith(dir, source), null, name)
    assert.equal(fs.existsSync(marks.markFile(dir, 'agy', 'claude')), false, name)
  }
})

test('the source rule needs the time of the mark: a mark without one is lifted by a healthy reading whatever its source says', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(marks.marksDir(dir), { recursive: true })
  fs.writeFileSync(marks.markFile(dir, 'agy', 'claude'), JSON.stringify({ harness: 'agy', group: 'claude', until: NOW + 30 * MIN, confirmed: false }))
  assert.notEqual(marks.liveMark(dir, 'agy', 'claude', NOW + 10 * MIN), null)
  assert.equal(liftWith(dir, { ts: iso(NOW - 60 * MIN) }), null)
})

// ---- one mark store (task 22): the old router directory migrates into lanes/marks/ ----

const oldMarksDir = (dataDir) => path.join(dataDir, 'router', 'lanes', 'marks')

function writeOldMark(dataDir, name, mark) {
  const dir = oldMarksDir(dataDir)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, name), typeof mark === 'string' ? mark : JSON.stringify(mark))
}

const swarmMarkAt = (until, extra = {}) => ({ harness: 'agy', group: 'gemini', at: NOW, until, confirmed: true, resetsAt: new Date(until).toISOString(), usedPercentAbsent: false, source: 'swarm', reason: 'dry mark', ...extra })
const routerMarkAt = (until, extra = {}) => ({ harness: 'agy', group: 'gemini', at: NOW, until, confirmed: false, resetsAt: null, usedPercentAbsent: false, source: 'router', reason: 'quota refusal', ...extra })

test('lane-marks.js never requires router-marks.js: the old path is a literal', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'lane-marks.js'), 'utf8')
  assert.ok(!/require\(['"]\.\/router-marks/.test(source))
  assert.ok(source.includes(path.posix.join('router', 'lanes', 'marks')))
})

test('migrateRouterMarks moves a mark from the old router directory into the single store', (t) => {
  const dir = tempDir(t)
  const stored = routerMarkAt(NOW + 60 * MIN, { statedResetMs: null, statedResetAt: null })
  writeOldMark(dir, 'agy__gemini.json', stored)
  const result = marks.migrateRouterMarks(dir)
  assert.deepEqual(result, { moved: ['agy__gemini.json'], skipped: [] })
  assert.deepEqual(JSON.parse(fs.readFileSync(marks.markFile(dir, 'agy', 'gemini'), 'utf8')), stored)
  assert.equal(fs.existsSync(path.join(oldMarksDir(dir), 'agy__gemini.json')), false)
})

test('liveMark and liveMarks run the migration on the first read', (t) => {
  const dir = tempDir(t)
  writeOldMark(dir, 'agy__gemini.json', routerMarkAt(NOW + 60 * MIN))
  assert.notEqual(marks.liveMark(dir, 'agy', 'gemini', NOW + MIN), null, 'the first liveMark sees the old mark')
  assert.equal(fs.existsSync(path.join(oldMarksDir(dir), 'agy__gemini.json')), false, 'and the move happened on that read')

  const other = tempDir(t)
  writeOldMark(other, 'agy__gemini.json', routerMarkAt(NOW + 60 * MIN))
  assert.deepEqual(marks.liveMarks(other, NOW + MIN).map((m) => m.group), ['gemini'])
  assert.equal(fs.existsSync(path.join(oldMarksDir(other), 'agy__gemini.json')), false)
})

test('migrating twice costs nothing: an empty or missing old folder migrates nothing and creates nothing', (t) => {
  const missing = tempDir(t)
  assert.deepEqual(marks.migrateRouterMarks(missing), { moved: [], skipped: [] })
  assert.equal(fs.existsSync(path.join(missing, 'router')), false)
  assert.equal(fs.existsSync(path.join(missing, 'lanes')), false)

  const dir = tempDir(t)
  writeOldMark(dir, 'agy__gemini.json', routerMarkAt(NOW + 60 * MIN))
  assert.deepEqual(marks.migrateRouterMarks(dir).moved, ['agy__gemini.json'])
  assert.deepEqual(marks.migrateRouterMarks(dir), { moved: [], skipped: [] })
  assert.deepEqual(JSON.parse(fs.readFileSync(marks.markFile(dir, 'agy', 'gemini'), 'utf8')).until, NOW + 60 * MIN)
})

test('collision: the later router mark wins and the swarm reason is kept in alsoReasons', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(marks.marksDir(dir), { recursive: true })
  fs.writeFileSync(marks.markFile(dir, 'agy', 'gemini'), JSON.stringify(swarmMarkAt(NOW + 30 * MIN)))
  writeOldMark(dir, 'agy__gemini.json', routerMarkAt(NOW + 60 * MIN))
  assert.deepEqual(marks.migrateRouterMarks(dir), { moved: ['agy__gemini.json'], skipped: [] })
  const kept = JSON.parse(fs.readFileSync(marks.markFile(dir, 'agy', 'gemini'), 'utf8'))
  assert.equal(kept.until, NOW + 60 * MIN, 'the mark never shortens')
  assert.equal(kept.reason, 'quota refusal')
  assert.deepEqual(kept.alsoReasons, [{ source: 'swarm', reason: 'dry mark', until: NOW + 30 * MIN }])
  assert.equal(fs.existsSync(path.join(oldMarksDir(dir), 'agy__gemini.json')), false)
  assert.deepEqual(fs.readdirSync(marks.marksDir(dir)), ['agy__gemini.json'])
})

test('collision: the later swarm mark is kept and the router reason is kept in alsoReasons', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(marks.marksDir(dir), { recursive: true })
  fs.writeFileSync(marks.markFile(dir, 'agy', 'gemini'), JSON.stringify(swarmMarkAt(NOW + 90 * MIN)))
  writeOldMark(dir, 'agy__gemini.json', routerMarkAt(NOW + 60 * MIN))
  marks.migrateRouterMarks(dir)
  const kept = JSON.parse(fs.readFileSync(marks.markFile(dir, 'agy', 'gemini'), 'utf8'))
  assert.equal(kept.until, NOW + 90 * MIN)
  assert.equal(kept.reason, 'dry mark', 'harness, group, reset time and reason keep their meaning')
  assert.deepEqual(kept.alsoReasons, [{ source: 'router', reason: 'quota refusal', until: NOW + 60 * MIN }])
  assert.equal(fs.existsSync(path.join(oldMarksDir(dir), 'agy__gemini.json')), false)
  assert.deepEqual(fs.readdirSync(marks.marksDir(dir)), ['agy__gemini.json'])
})

test('collision with equal ends keeps the mark already in the store', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(marks.marksDir(dir), { recursive: true })
  fs.writeFileSync(marks.markFile(dir, 'agy', 'gemini'), JSON.stringify(swarmMarkAt(NOW + 60 * MIN)))
  writeOldMark(dir, 'agy__gemini.json', routerMarkAt(NOW + 60 * MIN))
  marks.migrateRouterMarks(dir)
  const kept = JSON.parse(fs.readFileSync(marks.markFile(dir, 'agy', 'gemini'), 'utf8'))
  assert.equal(kept.reason, 'dry mark')
  assert.deepEqual(kept.alsoReasons, [{ source: 'router', reason: 'quota refusal', until: NOW + 60 * MIN }])
  assert.equal(fs.existsSync(path.join(oldMarksDir(dir), 'agy__gemini.json')), false)
})

test('an expired mark in either store is moved or merged the same way and stays expired', (t) => {
  const moved = tempDir(t)
  const expired = routerMarkAt(NOW - MIN, { at: NOW - 120 * MIN })
  writeOldMark(moved, 'agy__gemini.json', expired)
  marks.migrateRouterMarks(moved)
  assert.deepEqual(JSON.parse(fs.readFileSync(marks.markFile(moved, 'agy', 'gemini'), 'utf8')), expired)
  assert.equal(marks.liveMark(moved, 'agy', 'gemini', NOW), null, 'it stays expired')

  const merged = tempDir(t)
  fs.mkdirSync(marks.marksDir(merged), { recursive: true })
  const live = swarmMarkAt(NOW + 60 * MIN)
  fs.writeFileSync(marks.markFile(merged, 'agy', 'gemini'), JSON.stringify(live))
  writeOldMark(merged, 'agy__gemini.json', expired)
  marks.migrateRouterMarks(merged)
  const kept = JSON.parse(fs.readFileSync(marks.markFile(merged, 'agy', 'gemini'), 'utf8'))
  assert.equal(kept.until, NOW + 60 * MIN, 'the live store mark wins over the expired old one')
  assert.deepEqual(kept.alsoReasons, [{ source: 'router', reason: 'quota refusal', until: NOW - MIN }])
  assert.equal(fs.existsSync(path.join(oldMarksDir(merged), 'agy__gemini.json')), false)
})

test('a file in the old folder that cannot be read as a mark stays and is named in skipped', (t) => {
  const dir = tempDir(t)
  writeOldMark(dir, 'agy__gemini.json', '{not json')
  writeOldMark(dir, 'grok__grok.json', JSON.stringify({ harness: 'grok', group: 'grok', at: NOW }))
  writeOldMark(dir, 'muse__muse.json', JSON.stringify(routerMarkAt(NOW + 60 * MIN, { harness: 'muse', group: 'muse' })))
  const result = marks.migrateRouterMarks(dir)
  assert.deepEqual(result.skipped.sort(), ['agy__gemini.json', 'grok__grok.json'])
  assert.deepEqual(result.moved, ['muse__muse.json'])
  assert.equal(fs.existsSync(path.join(oldMarksDir(dir), 'agy__gemini.json')), true, 'a damaged file is never deleted')
  assert.equal(fs.existsSync(path.join(oldMarksDir(dir), 'grok__grok.json')), true)
  assert.notEqual(marks.liveMark(dir, 'muse', 'muse', NOW + MIN), null, 'the readable mark still moves')
  const again = marks.migrateRouterMarks(dir)
  assert.deepEqual(again.skipped.sort(), ['agy__gemini.json', 'grok__grok.json'], 'damaged files are reported again, never moved')
})
