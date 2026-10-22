'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const session = require('../plugins/aether/lib/session.js')

test('the settings of a session are superdelegation, harnesses and the quota deadline, and nothing of the removed options (E12)', () => {
  const env = {
    CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true',
    CLAUDE_PLUGIN_OPTION_HARNESSES: 'grok',
    CLAUDE_PLUGIN_OPTION_DEADLINES: 'haiku=5,jev=3,quota=2',
    CLAUDE_PLUGIN_OPTION_ROUTER: 'command',
    CLAUDE_PLUGIN_OPTION_DECIDER: 'jev',
    CLAUDE_PLUGIN_OPTION_FALLBACK: 'opus:max',
  }
  assert.deepEqual(session.delegateSettingsFrom(env), { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 2000 } })
})

test('the quota deadline defaults to 3 s and counts 10 s at most', () => {
  assert.equal(session.delegateSettingsFrom({}).deadlines.quotaMs, 3000)
  assert.equal(session.delegateSettingsFrom({ CLAUDE_PLUGIN_OPTION_DEADLINES: 'quota=99' }).deadlines.quotaMs, 10000)
})

test('the quota deadline keeps its default when the value is wrong, and haiku= and jev= alone change nothing', () => {
  const quotaMs = (deadlines) => session.delegateSettingsFrom({ CLAUDE_PLUGIN_OPTION_DEADLINES: deadlines }).deadlines.quotaMs
  assert.equal(quotaMs('quota=1.5'), 1500)
  assert.equal(quotaMs(' quota = 4 '), 4000)
  for (const bad of ['quota=0', 'quota=abc', 'quota=', 'quota', '', 'haiku=5,jev=2', '=,=']) assert.equal(quotaMs(bad), 3000, bad)
})

test('superdelegation and harnesses follow the option rules, with the legacy lanes option still read', () => {
  const settings = (env) => session.delegateSettingsFrom(env)
  assert.deepEqual(settings({}), { lanes: false, harnesses: ['agy'], deadlines: { quotaMs: 3000 } })
  assert.equal(settings({ CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', CLAUDE_PLUGIN_OPTION_LANES: 'true' }).lanes, false, 'a superdelegation that was set wins over lanes')
  assert.equal(settings({ CLAUDE_PLUGIN_OPTION_LANES: 'true' }).lanes, true, 'the legacy lanes option counts as superdelegation on')
  assert.equal(settings({ CLAUDE_PLUGIN_OPTION_LANES: 'yes' }).lanes, false)
  assert.deepEqual(settings({ CLAUDE_PLUGIN_OPTION_HARNESSES: 'agy,grok' }).harnesses, ['agy', 'grok'])
})

test('delegateFile sits beside the marker and refuses an id that could leave the directory', (t) => {
  const dir = tempDir(t)
  assert.equal(session.delegateFile(dir, 's1'), path.join(dir, 'sessions', 's1.delegate.json'))
  assert.throws(() => session.delegateFile(dir, '../x'), /invalid session id/)
})

test('markSession writes the delegate file, and removes a stale one when given none; readDelegateSettings reads it back', (t) => {
  const dir = tempDir(t)
  const settings = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 3000 } }
  session.markSession(dir, 's1', 1, { delegate: settings })
  assert.deepEqual(session.readDelegateSettings(dir, 's1'), settings)
  assert.ok(fs.existsSync(path.join(dir, 'sessions', 's1.delegate.json')))
  session.markSession(dir, 's1', 2, { delegate: null })
  assert.equal(session.readDelegateSettings(dir, 's1'), null)
  session.markSession(dir, 's1', 3, { delegate: settings })
  session.markSession(dir, 's1', 4)
  assert.equal(fs.existsSync(path.join(dir, 'sessions', 's1.delegate.json')), false, 'a session resumed without the settings keeps none')
})

test('an invalid delegate file reads as null', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(path.join(dir, 'sessions'))
  fs.writeFileSync(path.join(dir, 'sessions', 's1.delegate.json'), '{"lanes":"yes"}')
  assert.equal(session.readDelegateSettings(dir, 's1'), null)
})

test('a missing, unreadable or incomplete delegate file reads as null, and a good one is returned in its own shape', (t) => {
  const dir = tempDir(t)
  assert.equal(session.readDelegateSettings(dir, 's1'), null, 'missing')
  assert.equal(session.readDelegateSettings(dir, '../x'), null, 'an invalid session id never throws')
  fs.mkdirSync(path.join(dir, 'sessions'))
  const file = path.join(dir, 'sessions', 's1.delegate.json')
  const good = { lanes: false, harnesses: ['agy'], deadlines: { quotaMs: 3000 } }
  fs.writeFileSync(file, 'not json')
  assert.equal(session.readDelegateSettings(dir, 's1'), null)
  for (const change of [{ lanes: undefined }, { harnesses: 'agy' }, { harnesses: [1] }, { deadlines: undefined }, { deadlines: { quotaMs: 0 } }, { deadlines: { quotaMs: '3000' } }]) {
    fs.writeFileSync(file, JSON.stringify({ ...good, ...change }))
    assert.equal(session.readDelegateSettings(dir, 's1'), null, JSON.stringify(change))
  }
  fs.writeFileSync(file, JSON.stringify({ ...good, extra: 1 }))
  assert.deepEqual(session.readDelegateSettings(dir, 's1'), good)
})

test('pruneSessions removes the delegate file with its marker, and the router file of an older version', (t) => {
  const dir = tempDir(t)
  session.markSession(dir, 'old', 1, { delegate: { lanes: false, harnesses: ['agy'], deadlines: { quotaMs: 3000 } } })
  fs.writeFileSync(path.join(dir, 'sessions', 'old.router.json'), '{}')
  const past = new Date(Date.now() - 40 * 24 * 3600 * 1000)
  fs.utimesSync(session.markerFile(dir, 'old'), past, past)
  assert.deepEqual(session.pruneSessions(dir, { days: 30 }), ['old'])
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sessions')), [])
})
