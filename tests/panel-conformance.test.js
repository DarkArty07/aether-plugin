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
const HARNESSES = ['agy', 'agy,grok', ' Grok, AGY ', 'gork', 'agy,gork,grok', '', ',,', 'AGY,agy,cursor,codex', 'cursor', 'codex,codex', 'agy,muse', 'MUSE,agy', 'muse,muse', 'grok;agy', 'x', undefined]
const SUPERDELEGATION = [true, false, 'true', 'false', '', undefined]
const LANES = [true, false, 'true', 'false', 'TRUE', 'True', 'on', 'yes', '1', 1, '', undefined]

test('the lists of the mod are the lists of the libs', () => {
  assert.deepEqual(view.HARNESS_NAMES, harness.HARNESS_NAMES)
  assert.deepEqual(view.ROUTER_MODES, session.ROUTER_MODES)
  assert.deepEqual(view.ROUTER_DECIDERS, session.ROUTER_DECIDERS)
})

test('the manifest lists exactly what the libs accept for the router and the decider, and its defaults are what they fall back to', () => {
  const fields = manifest.userConfig
  assert.deepEqual(fields.router.options, session.ROUTER_CHOICES)
  assert.deepEqual(fields.decider.options, session.ROUTER_DECIDERS)
  const defaults = session.routerSettingsFrom({})
  assert.equal(fields.router.default, 'auto', 'the router default is auto: superdelegation decides')
  assert.equal(defaults.mode, 'record', 'with nothing set, the router only records')
  assert.equal(session.routerSettingsFrom({ CLAUDE_PLUGIN_OPTION_ROUTER: 'auto' }).mode, 'record', 'auto with superdelegation off records')
  assert.equal(session.routerSettingsFrom({ CLAUDE_PLUGIN_OPTION_ROUTER: 'auto', CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }).mode, 'command', 'auto with superdelegation on commands')
  assert.equal(session.routerSettingsFrom({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }).mode, 'command', 'with superdelegation on it commands')
  assert.equal(session.routerSettingsFrom({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true', CLAUDE_PLUGIN_OPTION_ROUTER: 'advise' }).mode, 'advise', 'a mode the owner set holds')
  assert.equal(fields.decider.default, defaults.decider)
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

test('the switch the panel shows is the one the router settings hold, for every pair of superdelegation and lanes', () => {
  for (const sd of SUPERDELEGATION) {
    for (const old of LANES) {
      const used = session.routerSettingsFrom({ ...env('CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', sd), ...env('CLAUDE_PLUGIN_OPTION_LANES', old) })
      assert.equal(view.settingsOf({ superdelegation: sd, lanes: old }).lanes, used.lanes, `superdelegation ${JSON.stringify(sd)}, lanes ${JSON.stringify(old)}`)
    }
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

test('all of it together, on every row of a product of the tables', () => {
  for (const router of ROUTERS.slice(0, 6)) {
    for (const superdelegation of SUPERDELEGATION) {
      for (const harnesses of HARNESSES.slice(0, 6)) {
        const options = { superdelegation, lanes: 'true', router, decider: 'jev', harnesses }
        const used = session.routerSettingsFrom({
          ...env('CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', superdelegation),
          ...env('CLAUDE_PLUGIN_OPTION_LANES', options.lanes),
          ...env('CLAUDE_PLUGIN_OPTION_ROUTER', router),
          ...env('CLAUDE_PLUGIN_OPTION_DECIDER', options.decider),
          ...env('CLAUDE_PLUGIN_OPTION_HARNESSES', harnesses),
        })
        assert.deepEqual(view.settingsOf(options), { lanes: used.lanes, router: used.mode, decider: used.decider, harnesses: used.harnesses })
      }
    }
  }
})
