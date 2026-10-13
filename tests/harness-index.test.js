'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const harnesses = require('../plugins/aether/lib/harness/index.js')

const SETTINGS = { command: '/opt/x', groups: { g: 'G' } }

test('the known harnesses are agy, codex, grok and cursor, in that order', () => {
  assert.deepEqual(harnesses.HARNESS_NAMES, ['agy', 'codex', 'grok', 'cursor'])
})

test('createAdapter builds agy from its module', () => {
  const agy = harnesses.createAdapter('agy', SETTINGS)
  assert.equal(agy.name, 'agy')
  assert.equal(typeof agy.quota, 'function')
  assert.equal(typeof agy.argv, 'function')
  assert.equal(agy.installed(), false)
})

test('createAdapter names the harness when its module is missing, and builds it when the module is there', () => {
  // codex, grok and cursor come from another change: this checks whichever state the tree is in.
  if (fs.existsSync(path.join(PLUGIN, 'lib', 'harness', 'codex.js'))) {
    assert.equal(typeof harnesses.createAdapter('codex', SETTINGS).quota, 'function')
  } else {
    assert.throws(() => harnesses.createAdapter('codex', SETTINGS), /harness codex cannot be loaded/)
  }
})

test('createAdapter throws, naming the harness, for a name that is not known', () => {
  assert.throws(() => harnesses.createAdapter('nope', SETTINGS), /unknown harness: nope/)
  assert.throws(() => harnesses.createAdapter('../lanes', SETTINGS), /unknown harness: \.\.\/lanes/)
})

test('registerAdapter adds a factory under any name, called with the command and groups, and unregisterAdapter removes it', () => {
  const seen = []
  harnesses.registerAdapter('fake', (options) => {
    seen.push(options)
    return { name: 'fake' }
  })
  try {
    assert.deepEqual(harnesses.createAdapter('fake', SETTINGS), { name: 'fake' })
    assert.deepEqual(seen, [{ command: '/opt/x', groups: { g: 'G' } }])
  } finally {
    harnesses.unregisterAdapter('fake')
  }
  assert.throws(() => harnesses.createAdapter('fake', SETTINGS), /unknown harness: fake/)
})
