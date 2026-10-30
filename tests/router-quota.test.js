'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const quota = require('../plugins/aether/lib/router-quota.js')
const readingsLib = require('../plugins/aether/lib/lane-readings.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const config = lanes.loadConfig(lanes.CONFIG_FILE)
const NOW = Date.parse('2026-10-15T21:32:00-06:00')
const H = 3600 * 1000
const MIN = 60 * 1000
const win = (remaining, hours) => ({ remaining, resetsAt: new Date(NOW + hours * H).toISOString() })
const weekly = (remaining, hours) => ({ windows: { weekly: win(remaining, hours) } })
const gemini = (remaining, hours) => ({ windows: { '5h': win(1, 5), weekly: win(remaining, hours) } })
const GROK = { readAt: NOW - 2 * MIN, groups: { grok: weekly(0.95, 29.6) } }
const agy = (groups, readAt = NOW - 2 * MIN) => ({ readAt, groups })

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
  assert.equal(quota.lifeMs(config, 'muse'), 30 * MIN)
  assert.equal(quota.MUSE_WAIT_MS, 20000, 'a decision waits at least this when muse is among the waiting harnesses')
  const stale = (readings) => quota.staleHarnesses({ readings, config, harnesses: ['agy', 'grok'], now: NOW })
  assert.deepEqual(stale({ agy: { readAt: NOW - 11 * MIN, groups: {} }, grok: { readAt: NOW - 29 * MIN, groups: {} } }), ['agy'])
  assert.deepEqual(stale({ agy: { readAt: NOW - 9 * MIN, groups: {} }, grok: { readAt: NOW - 31 * MIN, groups: {} } }), ['grok'])
  assert.deepEqual(stale({ agy: { readAt: NOW - 10 * MIN, groups: {} }, grok: null }), ['agy', 'grok'], 'a reading as old as its life is not valid')
  assert.deepEqual(stale({ agy: { readAt: NOW + MIN, groups: {} }, grok: { readAt: NOW, groups: {} } }), ['agy'])
  assert.deepEqual(quota.staleHarnesses({ readings: { agy: null, muse: null }, config, harnesses: ['agy', 'codex', 'muse'], now: NOW }), ['agy', 'codex', 'muse'], 'only agy, codex, grok and muse are asked about')
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
})

test('the module neither launches a process nor chooses a harness itself (R9)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'router-quota.js'), 'utf8')
  assert.ok(!/child_process/.test(source))
  assert.ok(!/orderCandidates/.test(source))
  assert.ok(!/chooseHarness|servableHarnesses/.test(source), 'the choice is the one function of superdelegation')
  assert.ok(!/markDry/.test(source))
})
