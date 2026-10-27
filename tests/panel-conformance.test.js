'use strict'

// The /harnesses panel shows the options the session uses, not the ones the owner typed. The libs validate them (a
// harness name that is not known is dropped, and so on) and the mod cannot require the libs, so hooks/panel-view.mjs
// holds copies of their lists and rules. This compares the two on a table: what the panel shows against what
// lib/session.js delegateSettingsFrom hands the delegates.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const session = require(path.join(PLUGIN, 'lib', 'session.js'))
const lanes = require(path.join(PLUGIN, 'lib', 'lanes.js'))
const harness = require(path.join(PLUGIN, 'lib', 'harness', 'index.js'))

let view
test.before(async () => {
  view = await import(path.join(PLUGIN, 'hooks', 'panel-view.mjs'))
})

// What the session start hook reads: the option as the environment holds it, text, or nothing.
const env = (name, value) => (value === undefined ? {} : { [name]: String(value) })

const HARNESSES = ['agy', 'agy,grok', ' Grok, AGY ', 'gork', 'agy,gork,grok', '', ',,', 'AGY,agy,cursor,codex', 'cursor', 'codex,codex', 'agy,muse', 'MUSE,agy', 'muse,muse', 'grok;agy', 'x', undefined]
const SUPERDELEGATION = [true, false, 'true', 'false', '', undefined]

test('the harness names of the mod are the names of the libs', () => {
  assert.deepEqual(view.HARNESS_NAMES, harness.HARNESS_NAMES)
})

test('the switch the panel shows is the one the delegate settings hold, for every value of superdelegation', () => {
  for (const sd of [undefined, 'true', 'false', '', 'on', 'TRUE', 'yes']) {
    const used = session.delegateSettingsFrom(sd === undefined ? {} : { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: sd })
    assert.equal(view.settingsOf(sd === undefined ? {} : { superdelegation: sd }).lanes, used.lanes, `superdelegation ${JSON.stringify(sd)}`)
  }
})

test('the harnesses the panel shows are the ones the delegate settings and the lanes enable', () => {
  for (const value of HARNESSES) {
    const used = session.delegateSettingsFrom(env('CLAUDE_PLUGIN_OPTION_HARNESSES', value)).harnesses
    const enabled = lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: value })
    assert.deepEqual(used, enabled)
    assert.deepEqual(view.settingsOf({ harnesses: value }).harnesses, enabled, `harnesses ${JSON.stringify(value)}`)
  }
  // The option may reach the mod as a list.
  assert.deepEqual(view.settingsOf({ harnesses: ['grok', 'agy'] }).harnesses, lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'grok,agy' }))
})

test('all of it together, on every row of a product of the tables', () => {
  for (const superdelegation of SUPERDELEGATION) {
    for (const harnesses of HARNESSES) {
      const options = { superdelegation, harnesses }
      const used = session.delegateSettingsFrom({
        ...env('CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', superdelegation),
        ...env('CLAUDE_PLUGIN_OPTION_HARNESSES', harnesses),
      })
      assert.deepEqual(view.settingsOf(options), { lanes: used.lanes, harnesses: used.harnesses })
    }
  }
})
