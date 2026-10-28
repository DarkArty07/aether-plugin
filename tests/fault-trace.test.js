'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { PLUGIN } = require('./helpers.js')

const load = () => import(pathToFileURL(path.join(PLUGIN, 'hooks', 'fault-trace.mjs')).href)

function fake({ failWrite = false, now = 123, env = {}, unreadable = false } = {}) {
  const writes = []
  const $ = {
    fs: { write: async (file, text) => { if (failWrite) throw new Error('disk full ZEBRA'); writes.push([file, JSON.parse(text)]) } },
    clock: { now: async () => now },
    env: unreadable ? undefined : { get: async (name) => env[name] },
    plugin: { root: '/home/u/cache/aether-plugin/aether/0.24.1', name: 'aether' },
  }
  return { $, writes }
}

test('recordFault writes the source and the class of the fault and nothing else (R1)', async () => {
  const { recordFault } = await load()
  const { $, writes } = fake()
  const state = { id: 's-1', dataDir: Promise.resolve('/d') }
  await recordFault($, state, 'register.flush', 'write-failed')
  assert.deepEqual(writes, [['/d/observe/faults/s-1-123.json', { session: 's-1', count: 1, faults: [{ time: 123, source: 'register.flush', class: 'write-failed' }] }]])
  await recordFault($, state, 'delegate.begin', 'handler-threw')
  assert.equal(writes[1][1].count, 2)
  assert.deepEqual(writes[1][1].faults.map((f) => f.source), ['register.flush', 'delegate.begin'])
})

test('a reloaded copy of the module writes a record of its own and never replaces the one of an earlier copy (R1)', async () => {
  const { recordFault } = await load()
  const earlier = fake({ now: 100 })
  const first = { id: 's-1', dataDir: '/d' }
  await recordFault(earlier.$, first, 'register.flush', 'write-failed')
  await recordFault(earlier.$, first, 'register.flush', 'write-failed')
  // A reloaded copy starts with an empty state: its record is named by its own start, and counts from one.
  const later = fake({ now: 200 })
  await recordFault(later.$, { id: 's-1', dataDir: '/d' }, 'delegate.begin', 'handler-threw')
  const files = new Map(later.writes.map(([file, body]) => [file, body]))
  assert.deepEqual(earlier.writes.map(([file]) => file), ['/d/observe/faults/s-1-100.json', '/d/observe/faults/s-1-100.json'])
  assert.equal(files.get('/d/observe/faults/s-1-200.json').count, 1)
  assert.equal(earlier.writes[1][1].count, 2)
})

test('a fault recorded before init resolves the data directory itself, from the environment (R1)', async () => {
  const { recordFault } = await load()
  const { $, writes } = fake({ env: { AETHER_DATA_DIR: '/data' } })
  const state = { id: 's-1', dataDir: null }
  await recordFault($, state, 'register.on-session-start', 'handler-threw', 'TypeError')
  assert.deepEqual(writes.map(([file]) => file), ['/data/observe/faults/s-1-123.json'])
  assert.equal(await state.dataDir, '/data')
})

test('a source or class outside the lists is stored as a fixed word, never as text (R1)', async () => {
  const { recordFault } = await load()
  const { $, writes } = fake()
  await recordFault($, { id: 's-1', dataDir: '/d' }, 'free text ZEBRA', 'oops ZEBRA')
  assert.deepEqual(writes[0][1].faults[0], { time: 123, source: 'unknown', class: 'unclassified' })
  assert.equal(JSON.stringify(writes).includes('ZEBRA'), false)
})

test('recordFault never throws: a failing disk, a missing data directory and a rejected one', async () => {
  const { recordFault } = await load()
  const bad = fake({ failWrite: true })
  await recordFault(bad.$, { id: 's-1', dataDir: '/d' }, 'register.flush', 'write-failed')
  const none = fake({ unreadable: true })
  await recordFault(none.$, { id: 's-1', dataDir: null }, 'register.flush', 'write-failed')
  await recordFault(none.$, { id: 's-1', dataDir: Promise.reject(new Error('x')) }, 'register.flush', 'write-failed')
  assert.deepEqual(none.writes, [])
})

test('it keeps the first 100 faults and goes on counting', async () => {
  const { recordFault } = await load()
  const { $, writes } = fake()
  const state = { id: 's-1', dataDir: '/d' }
  for (let i = 0; i < 105; i++) await recordFault($, state, 'register.flush', 'write-failed')
  const last = writes[writes.length - 1][1]
  assert.equal(last.faults.length, 100)
  assert.equal(last.count, 105)
})

test('a fault keeps the kind of the error it caught, from a closed list, and has no kind when nothing was thrown (R1)', async () => {
  const { recordFault, errorKind } = await load()
  const { $, writes } = fake()
  const state = { id: 's-1', dataDir: '/d' }
  await recordFault($, state, 'delegate.begin', 'handler-threw', errorKind(new TypeError('ZEBRA')))
  await recordFault($, state, 'delegate.bind', 'handler-threw', errorKind({ constructor: 'ZEBRA' }))
  await recordFault($, state, 'register.flush', 'write-failed', 'ZEBRA')
  await recordFault($, state, 'register.flush', 'write-failed')
  const faults = writes[writes.length - 1][1].faults
  assert.deepEqual(faults.map((f) => f.kind), ['TypeError', 'other', 'other', undefined])
  assert.equal('kind' in faults[3], false)
  assert.equal(JSON.stringify(writes).includes('ZEBRA'), false)
})

test('errorKind names the built-in error classes and nothing else, and never reads a message (R1)', async () => {
  const { errorKind } = await load()
  class ShardError extends Error {}
  assert.equal(errorKind(new Error('ZEBRA')), 'Error')
  assert.equal(errorKind(new RangeError('ZEBRA')), 'RangeError')
  assert.equal(errorKind(new ShardError('ZEBRA')), 'other')
  assert.equal(errorKind('ZEBRA'), 'other')
  assert.equal(errorKind(null), 'other')
  assert.equal(errorKind(undefined), 'other')
  assert.equal(errorKind({ get constructor() { throw new Error('ZEBRA') } }), 'other')
})
