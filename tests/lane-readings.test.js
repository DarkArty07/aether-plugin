'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const readings = require('../plugins/aether/lib/lane-readings.js')
const { createAgy } = require('../plugins/aether/lib/harness/agy.js')
const { createGrok } = require('../plugins/aether/lib/harness/grok.js')

const NOW = Date.parse('2026-10-14T06:08:00Z')
const MIN = 60 * 1000
const SETTINGS = { quotaLifeMinutes: 10, groups: { flash: 'Gemini Models', claude: 'Claude and GPT models' } }
const group = (remaining) => ({ windows: { weekly: { remaining, resetsAt: '2026-10-21T03:35:44Z' } } })

// An adapter whose reading launches a process, as agy's does, counting its readings.
function processAdapter(values = [0.9, 0.8, 0.7]) {
  const adapter = {
    quotaCost: 'process',
    reads: 0,
    failNext: false,
    quota() {
      if (adapter.failNext) throw new Error('agy /usage failed: exit 1')
      const remaining = values[Math.min(adapter.reads, values.length - 1)]
      adapter.reads += 1
      return { groups: { flash: group(remaining), claude: group(remaining) } }
    },
  }
  return adapter
}

const read = (adapter, dataDir, extra = {}) => readings.readGroups(adapter, { harness: 'agy', settings: SETTINGS, dataDir, now: NOW, ...extra })

test('a reading that launches a process is kept for its life, and a group is not read twice inside it', (t) => {
  const dataDir = tempDir(t)
  const adapter = processAdapter()
  const first = read(adapter, dataDir)
  assert.deepEqual([first.cached, first.readAt, first.groups.flash.windows.weekly.remaining, adapter.reads], [false, NOW, 0.9, 1])
  const second = read(adapter, dataDir, { now: NOW + 9 * MIN + 59000 })
  assert.deepEqual([second.cached, second.readAt, second.groups.flash.windows.weekly.remaining, adapter.reads], [true, NOW, 0.9, 1])
  const third = read(adapter, dataDir, { now: NOW + 10 * MIN })
  assert.deepEqual([third.cached, third.readAt, third.groups.flash.windows.weekly.remaining, adapter.reads], [false, NOW + 10 * MIN, 0.8, 2])
  assert.equal(read(adapter, dataDir, { now: NOW + 11 * MIN }).cached, true)
  assert.equal(adapter.reads, 2)
  assert.equal(readings.cacheFile(dataDir, 'agy'), path.join(dataDir, 'lanes', 'quota', 'agy.json'))
})

test('a fresh reading, as a call takes when it ends, is always read and renews the kept one', (t) => {
  const dataDir = tempDir(t)
  const adapter = processAdapter()
  read(adapter, dataDir)
  const fresh = read(adapter, dataDir, { now: NOW + MIN, fresh: true })
  assert.deepEqual([fresh.cached, fresh.groups.claude.windows.weekly.remaining, adapter.reads], [false, 0.8, 2])
  const next = read(adapter, dataDir, { now: NOW + 2 * MIN })
  assert.deepEqual([next.cached, next.readAt, next.groups.claude.windows.weekly.remaining, adapter.reads], [true, NOW + MIN, 0.8, 2])
})

test('a reading that fails throws, writes nothing, and leaves the kept reading as it was', (t) => {
  const dataDir = tempDir(t)
  const adapter = processAdapter()
  read(adapter, dataDir)
  adapter.failNext = true
  assert.throws(() => read(adapter, dataDir, { now: NOW + 20 * MIN }), /agy \/usage failed: exit 1/)
  assert.throws(() => read(adapter, dataDir, { now: NOW + MIN, fresh: true }), /agy \/usage failed/)
  adapter.failNext = false
  assert.deepEqual([read(adapter, dataDir, { now: NOW + 2 * MIN }).cached, adapter.reads], [true, 1])
  const empty = tempDir(t)
  adapter.failNext = true
  assert.throws(() => read(adapter, empty), /agy \/usage failed/)
  assert.equal(fs.existsSync(path.join(empty, 'lanes')), false)
})

test('a kept reading is not used when its time is ahead of the clock, it is unreadable, or it lacks a group of the table', (t) => {
  const dataDir = tempDir(t)
  const adapter = processAdapter()
  read(adapter, dataDir, { now: NOW + 5 * MIN })
  assert.equal(read(adapter, dataDir, { now: NOW }).cached, false)
  const file = readings.cacheFile(dataDir, 'agy')
  fs.writeFileSync(file, '{not json')
  assert.equal(read(adapter, dataDir, { now: NOW + MIN }).cached, false)
  fs.writeFileSync(file, JSON.stringify({ harness: 'agy', readAt: NOW + MIN, groups: { flash: group(0.5) } }))
  assert.equal(read(adapter, dataDir, { now: NOW + 2 * MIN }).cached, false)
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).groups).sort(), ['claude', 'flash'])
})

test('each harness keeps its own reading, and a life of zero minutes keeps none', (t) => {
  const dataDir = tempDir(t)
  const agy = processAdapter()
  const other = processAdapter([0.4])
  read(agy, dataDir)
  const second = readings.readGroups(other, { harness: 'codex', settings: SETTINGS, dataDir, now: NOW + MIN })
  assert.deepEqual([second.cached, second.groups.flash.windows.weekly.remaining], [false, 0.4])
  assert.equal(read(agy, dataDir, { now: NOW + 2 * MIN }).groups.flash.windows.weekly.remaining, 0.9)
  const none = tempDir(t)
  const adapter = processAdapter()
  for (let i = 0; i < 3; i++) read(adapter, none, { settings: { ...SETTINGS, quotaLifeMinutes: 0 } })
  assert.equal(adapter.reads, 3)
  assert.equal(fs.existsSync(path.join(none, 'lanes')), false)
})

test('a life the table does not give is ten minutes', (t) => {
  const dataDir = tempDir(t)
  const adapter = processAdapter()
  const settings = { groups: SETTINGS.groups }
  readings.readGroups(adapter, { harness: 'agy', settings, dataDir, now: NOW })
  assert.equal(readings.readGroups(adapter, { harness: 'agy', settings, dataDir, now: NOW + 9 * MIN }).cached, true)
  assert.equal(readings.readGroups(adapter, { harness: 'agy', settings, dataDir, now: NOW + 10 * MIN }).cached, false)
  assert.equal(readings.DEFAULT_LIFE_MINUTES, 10)
})

test('a reading that only reads a file is never kept: the adapter is asked each time and no file is written', (t) => {
  const dataDir = tempDir(t)
  let reads = 0
  const adapter = { quota: () => ({ groups: { grok: group(++reads / 10) } }) }
  const settings = { quotaLifeMinutes: 30, groups: { grok: 'Grok plan' } }
  const first = readings.readGroups(adapter, { harness: 'grok', settings, dataDir, now: NOW })
  const second = readings.readGroups(adapter, { harness: 'grok', settings, dataDir, now: NOW + MIN })
  assert.deepEqual([first.cached, second.cached, reads, second.groups.grok.windows.weekly.remaining], [false, false, 2, 0.2])
  assert.equal(fs.existsSync(path.join(dataDir, 'lanes')), false)
})

test("agy's reading launches a process and is kept; grok's reads a log and is not", () => {
  assert.equal(createAgy({}).quotaCost, 'process')
  assert.equal(createGrok({}).quotaCost, undefined)
})

test('a kept reading is not served once one of its windows has reset: the group is read again', (t) => {
  const dataDir = tempDir(t)
  const adapter = processAdapter()
  const reset = new Date(NOW + 2 * MIN).toISOString()
  const later = new Date(NOW + 5 * MIN + 2 * MIN).toISOString()
  const ending = (remaining, resetsAt) => ({ windows: { weekly: { remaining, resetsAt: '2026-10-21T03:35:44Z' }, '5h': { remaining, resetsAt } } })
  adapter.quota = () => ({ groups: { flash: adapter.reads++ === 0 ? ending(0.01, reset) : ending(1, later), claude: ending(0.9, later) } })
  assert.equal(read(adapter, dataDir).groups.flash.windows['5h'].remaining, 0.01)
  const inside = read(adapter, dataDir, { now: NOW + 2 * MIN - 1 })
  assert.deepEqual([inside.cached, adapter.reads], [true, 1])
  const after = read(adapter, dataDir, { now: NOW + 2 * MIN })
  assert.deepEqual([after.cached, adapter.reads, after.groups.flash.windows['5h'].remaining], [false, 2, 1])
  assert.equal(read(adapter, dataDir, { now: NOW + 3 * MIN }).cached, true, 'the new reading is kept')
  // A reset that was already behind the reading when it was taken is not one that came since.
  const behind = tempDir(t)
  const stale = { quota: () => ({ groups: { flash: ending(0.5, '2026-10-01T00:00:00Z'), claude: ending(0.5, '2026-10-01T00:00:00Z') } }), quotaCost: 'process' }
  read(stale, behind)
  assert.equal(read(stale, behind, { now: NOW + MIN }).cached, true)
})

test('a reading whose save fails is still returned, and the failed save leaves no temporary file', (t) => {
  const dataDir = tempDir(t)
  const adapter = processAdapter()
  const file = readings.cacheFile(dataDir, 'agy')
  fs.mkdirSync(file, { recursive: true })
  const first = read(adapter, dataDir)
  assert.deepEqual([first.cached, first.groups.flash.windows.weekly.remaining, adapter.reads], [false, 0.9, 1])
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['agy.json'])
  const blocked = tempDir(t)
  fs.writeFileSync(path.join(blocked, 'lanes'), 'not a directory')
  assert.equal(read(processAdapter(), blocked).groups.claude.windows.weekly.remaining, 0.9)
})
