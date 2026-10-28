'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const digest = require(path.join(PLUGIN, 'lib', 'observe-digest.js'))
const { readObservations } = require(path.join(PLUGIN, 'lib', 'observe-read.js'))

const DAY = 24 * 60 * 60 * 1000
const MARK = 'ZEBRA-KIND-4410'

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map((e) => path.join(dir, e)).filter((f) => fs.statSync(f).isFile()) : [])
const faultFile = (dir, session, faults) => write(path.join(dir, 'observe', 'faults', `${session}.json`), JSON.stringify({ session, count: faults.length, faults }))
const reading = (dir) => readObservations({ dataDir: dir, now: 100, pairs: [], cfg: observe.loadObserveConfig() })

test('readFaults keeps a kind of the closed list, and a fault without a kind still reads (R1)', (t) => {
  const dir = tempDir(t)
  faultFile(dir, 's-1', [
    { time: 1, source: 'delegate.begin', class: 'handler-threw', kind: 'TypeError' },
    { time: 2, source: 'register.flush', class: 'write-failed' },
  ])
  assert.deepEqual(observe.readFaults(dir), [
    { session: 's-1', time: 1, source: 'delegate.begin', class: 'handler-threw', kind: 'TypeError' },
    { session: 's-1', time: 2, source: 'register.flush', class: 'write-failed' },
  ])
})

test('readFaults drops a kind that is not in the closed list and copies none of it (R10)', (t) => {
  const dir = tempDir(t)
  faultFile(dir, 's-1', [
    { time: 1, source: 'delegate.begin', class: 'handler-threw', kind: MARK },
    { time: 2, source: 'delegate.begin', class: 'handler-threw', kind: { name: MARK } },
    { time: 3, source: 'delegate.begin', class: 'handler-threw', kind: 'Error' },
  ])
  const faults = observe.readFaults(dir)
  assert.deepEqual(faults.map((f) => 'kind' in f), [false, false, true])
  assert.equal(JSON.stringify(faults).includes(MARK), false)
})

test('FAULT_KINDS in lib/observe.js is the list of FAULT_KINDS in hooks/fault-trace.mjs, word for word (R1)', () => {
  const text = fs.readFileSync(path.join(PLUGIN, 'hooks', 'fault-trace.mjs'), 'utf8')
  const declared = /^export const FAULT_KINDS = \[(.*)\]$/m.exec(text)
  assert.ok(declared, 'the list is declared in fault-trace.mjs')
  const listed = [...declared[1].matchAll(/'([^']*)'/g)].map((m) => m[1])
  assert.deepEqual(observe.FAULT_KINDS, listed)
})

test('the digest counts the kinds of each session and keeps them when the raw file is pruned (R8)', (t) => {
  const dir = tempDir(t)
  const now = Date.UTC(2026, 9, 27)
  faultFile(dir, 's-old', [
    { time: 10, source: 'delegate.begin', class: 'handler-threw', kind: 'TypeError' },
    { time: 11, source: 'delegate.begin', class: 'handler-threw', kind: 'TypeError' },
    { time: 12, source: 'register.flush', class: 'write-failed', kind: 'other' },
    { time: 13, source: 'register.flush', class: 'write-failed' },
    { time: 14, source: 'register.flush', class: 'write-failed', kind: MARK },
  ])
  const file = path.join(dir, 'observe', 'faults', 's-old.json')
  fs.utimesSync(file, new Date(now - 40 * DAY), new Date(now - 40 * DAY))
  digest.digestAll(dir)
  assert.deepEqual(digest.readSummary(dir).sessions['s-old'].faultKinds, { TypeError: 2, other: 1 })
  assert.deepEqual(digest.pruneObserve(dir, { days: 30, now }), { events: 0, faults: 1, dev: 0 })
  digest.digestAll(dir)
  assert.deepEqual(digest.readSummary(dir).sessions['s-old'].faultKinds, { TypeError: 2, other: 1 })
  assert.equal(JSON.stringify(digest.readSummary(dir)).includes(MARK), false)
})

test('the draft of a fault names the kinds beside its class, counted, and a fault without a kind still drafts (E7, C4)', (t) => {
  const dir = tempDir(t)
  faultFile(dir, 's-1', [
    { time: 1, source: 'delegate.begin', class: 'handler-threw', kind: 'TypeError' },
    { time: 2, source: 'delegate.begin', class: 'handler-threw', kind: 'TypeError' },
    { time: 3, source: 'delegate.begin', class: 'handler-threw', kind: 'RangeError' },
    { time: 4, source: 'delegate.begin', class: 'handler-threw', kind: MARK },
    { time: 5, source: 'delegate.begin', class: 'handler-threw' },
    { time: 6, source: 'register.flush', class: 'write-failed' },
  ])
  const { items } = reading(dir)
  const draft = fs.readFileSync(path.join(dir, 'observe', 'issues', 'fault-delegate.begin.md'), 'utf8')
  assert.ok(draft.includes('Class handler-threw: 5 faults still on disk (TypeError ×2, RangeError ×1)'), draft)
  assert.equal(draft.includes(MARK), false)
  const plain = fs.readFileSync(path.join(dir, 'observe', 'issues', 'fault-register.flush.md'), 'utf8')
  assert.ok(plain.includes('Class write-failed: 1 faults still on disk'), plain)
  assert.equal(plain.includes('('), false)
  assert.equal(items.find((i) => i.id === 'fault:delegate.begin').numbers.count, 5)
})

test('a kind outside the closed list reaches no file the observation writes (R10)', (t) => {
  const dir = tempDir(t)
  faultFile(dir, 's-1', [
    { time: 1, source: 'delegate.begin', class: 'handler-threw', kind: MARK },
    { time: 2, source: 'register.flush', class: 'write-failed', kind: MARK },
  ])
  const result = reading(dir)
  assert.equal(JSON.stringify(result).includes(MARK), false)
  // observe/faults/ is the mod's own record, written by hand here: the observation writes everything else.
  const written = files(path.join(dir, 'observe')).filter((file) => !file.includes(`${path.sep}faults${path.sep}`))
  assert.ok(written.some((file) => file.includes(`${path.sep}issues${path.sep}`)), 'the drafts are written')
  for (const file of written) assert.equal(fs.readFileSync(file, 'utf8').includes(MARK), false, file)
  for (const session of Object.values(digest.readSummary(dir).sessions)) assert.equal(JSON.stringify(session).includes(MARK), false)
})
