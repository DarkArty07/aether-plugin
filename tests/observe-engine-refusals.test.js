'use strict'

// Issue 152: 25 refusals of an Agent spawn by the engine were recorded as spawn-failed faults, and the automatic issue
// that followed could not be diagnosed or fixed (the text of the error is never kept, R10). A source whose faults are
// all engine refusals stays local friction: counted in the reading, with no issue drafted and none filed.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const observe = require(path.join(PLUGIN, 'lib', 'observe.js'))
const { readObservations } = require(path.join(PLUGIN, 'lib', 'observe-read.js'))

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const faultFile = (dir, session, faults) => write(path.join(dir, 'observe', 'faults', `${session}.json`), JSON.stringify({ session, count: faults.length, faults }))
const reading = (dir) => readObservations({ dataDir: dir, now: 100, pairs: [], cfg: observe.loadObserveConfig() })
const draft = (dir, name) => path.join(dir, 'observe', 'issues', `fault-${name}.md`)

const refusals = (n) => Array.from({ length: n }, (_, i) => ({ time: i + 1, source: 'register.on-agent-spawn', class: 'spawn-failed', kind: 'Error' }))

test('a source whose faults are all engine refusals is local friction, counted, with no issue drafted', (t) => {
  const dir = tempDir(t)
  faultFile(dir, 's-1', refusals(25))
  const { items } = reading(dir)
  const item = items.find((entry) => entry.id === 'fault:register.on-agent-spawn')
  assert.ok(item, 'the refusals are still in the reading')
  assert.equal(item.kind, 'friction')
  assert.equal(item.numbers.count, 25)
  assert.equal(fs.existsSync(draft(dir, 'register.on-agent-spawn')), false)
})

test('a source with an engine refusal and a real fault of the mod stays a failure with its issue drafted', (t) => {
  const dir = tempDir(t)
  faultFile(dir, 's-1', [...refusals(3), { time: 9, source: 'register.on-agent-spawn', class: 'handler-threw', kind: 'TypeError' }])
  const { items } = reading(dir)
  const item = items.find((entry) => entry.id === 'fault:register.on-agent-spawn')
  assert.equal(item.kind, 'failure')
  assert.equal(fs.existsSync(draft(dir, 'register.on-agent-spawn')), true)
})

test('a source with only real faults of the mod is still a failure with its issue drafted', (t) => {
  const dir = tempDir(t)
  faultFile(dir, 's-1', [{ time: 1, source: 'register.flush', class: 'write-failed' }])
  const { items } = reading(dir)
  assert.equal(items.find((entry) => entry.id === 'fault:register.flush').kind, 'failure')
  assert.equal(fs.existsSync(draft(dir, 'register.flush')), true)
})
