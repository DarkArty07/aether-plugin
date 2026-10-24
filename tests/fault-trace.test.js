'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { PLUGIN } = require('./helpers.js')

const load = () => import(pathToFileURL(path.join(PLUGIN, 'hooks', 'fault-trace.mjs')).href)

function fake({ failWrite = false } = {}) {
  const writes = []
  const $ = {
    fs: { write: async (file, text) => { if (failWrite) throw new Error('disk full ZEBRA'); writes.push([file, JSON.parse(text)]) } },
    clock: { now: async () => 123 },
  }
  return { $, writes }
}

test('recordFault writes the source and the class of the fault and nothing else (R1)', async () => {
  const { recordFault } = await load()
  const { $, writes } = fake()
  const state = { id: 's-1', dataDir: Promise.resolve('/d') }
  await recordFault($, state, 'register.flush', 'write-failed')
  assert.deepEqual(writes, [['/d/observe/faults/s-1.json', { session: 's-1', count: 1, faults: [{ time: 123, source: 'register.flush', class: 'write-failed' }] }]])
  await recordFault($, state, 'delegate.begin', 'handler-threw')
  assert.equal(writes[1][1].count, 2)
  assert.deepEqual(writes[1][1].faults.map((f) => f.source), ['register.flush', 'delegate.begin'])
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
  const none = fake()
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
