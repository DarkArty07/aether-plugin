'use strict'

// The /harnesses panel shows the options the session uses, not the ones the owner typed. The libs validate them (a
// router mode that is not listed is record, a harness name that is not known is dropped, and so on) and the mod cannot
// require the libs, so hooks/panel-view.mjs holds copies of their lists and rules. This compares the two on a table, and
// the manifest's lists with both.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const session = require(path.join(PLUGIN, 'lib', 'session.js'))
const lanes = require(path.join(PLUGIN, 'lib', 'lanes.js'))
const harness = require(path.join(PLUGIN, 'lib', 'harness', 'index.js'))
const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))

let view
test.before(async () => {
  view = await import(path.join(PLUGIN, 'hooks', 'panel-view.mjs'))
})

// What the session start hook and the router read: the option as the environment holds it, text, or nothing.
const env = (name, value) => (value === undefined ? {} : { [name]: String(value) })

const ROUTERS = ['record', 'advise', 'command', 'Command', 'COMMAND', ' command', 'command ', 'advise,', '', 'x', undefined]
const DECIDERS = ['haiku', 'jev', 'JEV', 'Jev', ' jev', 'jev ', '', 'x', undefined]
const SEATS = ['native', 'balanced', 'robust', 'Robust', 'ROBUST', ' native ', '\trobust', '', 'fast', 'balanced,', undefined]
const HARNESSES = ['agy', 'agy,grok', ' Grok, AGY ', 'gork', 'agy,gork,grok', '', ',,', 'AGY,agy,cursor,codex', 'cursor', 'codex,codex', 'agy,muse', 'MUSE,agy', 'muse,muse', 'grok;agy', 'x', undefined]
const LANES = [true, false, 'true', 'false', 'TRUE', 'True', 'on', 'yes', '1', 1, '', undefined]

test('the lists of the mod are the lists of the libs', () => {
  assert.deepEqual(view.HARNESS_NAMES, harness.HARNESS_NAMES)
  assert.deepEqual(view.ROUTER_MODES, session.ROUTER_MODES)
  assert.deepEqual(view.ROUTER_DECIDERS, session.ROUTER_DECIDERS)
  // The seat choices are not exported: each is known to the lib, and nothing else is.
  for (const name of view.SEAT_CHOICES) assert.deepEqual(lanes.seatsChoice({ AETHER_SEATS: name }), { name, known: true })
  assert.equal(lanes.seatsChoice({ AETHER_SEATS: 'fast' }).known, false)
  assert.equal(view.SEAT_CHOICES.length, 3)
})

test('the manifest lists exactly what the libs accept for the router, the decider and the seats, and its defaults are what they fall back to', () => {
  const fields = manifest.userConfig
  assert.deepEqual(fields.router.options, session.ROUTER_MODES)
  assert.deepEqual(fields.decider.options, session.ROUTER_DECIDERS)
  assert.deepEqual(fields.seats.options, view.SEAT_CHOICES)
  const defaults = session.routerSettingsFrom({})
  assert.equal(fields.router.default, defaults.mode)
  assert.equal(fields.decider.default, defaults.decider)
  assert.equal(fields.seats.default, lanes.seatsChoice({}).name)
  assert.equal(fields.harnesses.options, undefined, 'free text')
  assert.equal(fields.fallback.options, undefined, 'free text')
  assert.equal(fields.deadlines.options, undefined, 'free text')
})

test('the router mode and the decider the panel shows are the ones the router settings hold', () => {
  for (const router of ROUTERS) {
    for (const decider of DECIDERS) {
      const used = session.routerSettingsFrom({ ...env('CLAUDE_PLUGIN_OPTION_ROUTER', router), ...env('CLAUDE_PLUGIN_OPTION_DECIDER', decider) })
      const shown = view.settingsOf({ router, decider })
      assert.equal(shown.router, used.mode, `router ${JSON.stringify(router)}`)
      assert.equal(shown.decider, used.decider, `decider ${JSON.stringify(decider)}`)
    }
  }
})

test('the lanes switch the panel shows is the one the router settings and the session start hold', () => {
  for (const value of LANES) {
    const used = session.routerSettingsFrom(env('CLAUDE_PLUGIN_OPTION_LANES', value))
    assert.equal(view.settingsOf({ lanes: value }).lanes, used.lanes, `lanes ${JSON.stringify(value)}`)
    // aether-session-start exports AETHER_LANES=on exactly when the option is the text true.
    assert.equal(view.settingsOf({ lanes: value }).lanes, String(value) === 'true')
  }
})

test('the harnesses the panel shows are the ones the router settings and the lanes enable', () => {
  for (const value of HARNESSES) {
    const used = session.routerSettingsFrom(env('CLAUDE_PLUGIN_OPTION_HARNESSES', value)).harnesses
    const enabled = lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: value })
    assert.deepEqual(used, enabled)
    assert.deepEqual(view.settingsOf({ harnesses: value }).harnesses, enabled, `harnesses ${JSON.stringify(value)}`)
  }
  // The option may reach the mod as a list.
  assert.deepEqual(view.settingsOf({ harnesses: ['grok', 'agy'] }).harnesses, lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'grok,agy' }))
})

test('the seats the panel shows are the design seats the session start exports', () => {
  for (const value of SEATS) {
    const used = lanes.seatsChoice(env('AETHER_SEATS', value)).name
    assert.equal(view.settingsOf({ seats: value }).seats, used, `seats ${JSON.stringify(value)}`)
  }
})

test('all of it together, on every row of a product of the tables', () => {
  for (const router of ROUTERS.slice(0, 6)) {
    for (const seats of SEATS.slice(0, 6)) {
      for (const harnesses of HARNESSES.slice(0, 6)) {
        const options = { lanes: true, router, decider: 'jev', seats, harnesses }
        const used = session.routerSettingsFrom({
          ...env('CLAUDE_PLUGIN_OPTION_LANES', options.lanes),
          ...env('CLAUDE_PLUGIN_OPTION_ROUTER', router),
          ...env('CLAUDE_PLUGIN_OPTION_DECIDER', options.decider),
          ...env('CLAUDE_PLUGIN_OPTION_HARNESSES', harnesses),
        })
        assert.deepEqual(view.settingsOf(options), { lanes: used.lanes, router: used.mode, decider: used.decider, seats: lanes.seatsChoice(env('AETHER_SEATS', seats)).name, harnesses: used.harnesses })
      }
    }
  }
})
