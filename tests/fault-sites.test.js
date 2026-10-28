'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (name) => fs.readFileSync(path.join(PLUGIN, 'hooks', name), 'utf8')
const SOURCES = {
  'register.js': ['register.marker-check', 'register.flush', 'register.lane-payload', 'register.delegate-context', 'register.meter-step', 'register.brake-settings-start',
    'register.brake-settings-recheck', 'register.brake-step', 'register.on-session-start', 'register.on-agent-offer', 'register.on-tool-call', 'register.on-agent-spawn', 'register.ops-run'],
  'delegate.mjs': ['delegate.step', 'delegate.answer', 'delegate.begin', 'delegate.bind'],
}
// register.js has one more catch than the audit of plan 014: the spawn's own try around next(e), which records the refusal
// of the engine's spawn with the kind of its error (spawn-failed), so that the failure is not taken for the mod's.
// The two catches of readDataDir moved to fault-trace.mjs with that function, which recordFault now calls itself.
const CATCH_LINES = { 'register.js': 24, 'delegate.mjs': 5, 'quota-brake.mjs': 1 }

test('every real catch of the audit names its source (R1)', () => {
  for (const [file, sources] of Object.entries(SOURCES)) {
    const text = read(file)
    for (const source of sources) assert.ok(text.includes(`'${source}'`), `${file} records ${source}`)
  }
})

test('the sources of fault-trace.mjs are exactly the 17 audited ones', async () => {
  const { pathToFileURL } = require('node:url')
  const { FAULT_SOURCES } = await import(pathToFileURL(path.join(PLUGIN, 'hooks', 'fault-trace.mjs')).href)
  assert.deepEqual([...FAULT_SOURCES].sort(), Object.values(SOURCES).flat().sort())
})

test('the number of catch lines is the audited one: a new catch needs a new audit (R1)', () => {
  for (const [file, count] of Object.entries(CATCH_LINES)) {
    assert.equal(read(file).split('\n').filter((line) => /\bcatch\b/.test(line)).length, count, file)
  }
})
