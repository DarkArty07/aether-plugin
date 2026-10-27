'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, SESSION_BIN, makeRepo, tempDir } = require('./helpers.js')
const session = require('../plugins/aether/lib/session.js')

test('the manifest carries the two quota-brake options', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.userConfig.quotabrake.type, 'string')
  assert.equal(manifest.userConfig.quotabrake.default, '95')
  assert.equal(manifest.userConfig.quotabrake.title, 'Quota brake')
  assert.equal(manifest.userConfig.brakepush.type, 'boolean')
  assert.equal(manifest.userConfig.brakepush.default, false)
  assert.ok(manifest.userConfig.quotabrake.description.includes('five-hour window'))
  assert.ok(manifest.userConfig.brakepush.description.includes('origin'))
})

test('parseThreshold keeps a percent and falls back to 95 for anything else', () => {
  assert.equal(session.DEFAULT_THRESHOLD, 95)
  for (const good of ['95', '80', '92.5', ' 90 ', '1', '100']) assert.equal(session.parseThreshold(good), Number(good), good)
  for (const bad of [undefined, null, '', ' ', 'abc', '95%', '0', '-5', '100.1', '101', 'NaN', 'Infinity', 42, true]) {
    assert.equal(session.parseThreshold(bad), 95, String(bad))
  }
})

test('brakeSettingsFrom reads the plugin options and defaults both', () => {
  assert.deepEqual(session.brakeSettingsFrom({}), { threshold: 95, push: false })
  assert.deepEqual(session.brakeSettingsFrom({ CLAUDE_PLUGIN_OPTION_QUOTABRAKE: '87.5', CLAUDE_PLUGIN_OPTION_BRAKEPUSH: 'true' }), { threshold: 87.5, push: true })
  assert.deepEqual(session.brakeSettingsFrom({ CLAUDE_PLUGIN_OPTION_QUOTABRAKE: 'nope', CLAUDE_PLUGIN_OPTION_BRAKEPUSH: 'false' }), { threshold: 95, push: false })
  assert.deepEqual(session.brakeSettingsFrom({ CLAUDE_PLUGIN_OPTION_BRAKEPUSH: 'TRUE' }), { threshold: 95, push: false })
})

test('brakeFile sits beside the marker and refuses an id that could leave the directory', (t) => {
  const data = tempDir(t)
  assert.equal(session.brakeFile(data, 's1'), path.join(data, 'sessions', 's1.brake.json'))
  assert.throws(() => session.brakeFile(data, '../x'), /invalid session id/)
})

test('markSession writes the brake file, a null brake removes a stale one, and readBrakeSettings validates it', (t) => {
  const data = tempDir(t)
  session.markSession(data, 's1', 1234, { brake: { threshold: 88, push: true } })
  assert.deepEqual(session.readBrakeSettings(data, 's1'), { threshold: 88, push: true })
  session.markSession(data, 's1', 1235, { brake: null })
  assert.equal(fs.existsSync(session.brakeFile(data, 's1')), false)
  assert.equal(session.readBrakeSettings(data, 's1'), null)
  session.markSession(data, 's1', 1236)
  assert.equal(fs.existsSync(session.brakeFile(data, 's1')), false)
  for (const bad of [{ threshold: '88', push: true }, { threshold: 88 }, { threshold: 0, push: false }, { threshold: 88, push: 'yes' }, [1, 2], 'x']) {
    fs.mkdirSync(path.dirname(session.brakeFile(data, 's1')), { recursive: true })
    fs.writeFileSync(session.brakeFile(data, 's1'), JSON.stringify(bad))
    assert.equal(session.readBrakeSettings(data, 's1'), null, JSON.stringify(bad))
  }
  assert.equal(session.readBrakeSettings(data, '../x'), null)
})

test('pruneSessions deletes the brake file of a pruned session', (t) => {
  const data = tempDir(t)
  session.markSession(data, 's1', 1000, { brake: { threshold: 90, push: false } })
  const old = new Date(1000)
  fs.utimesSync(session.markerFile(data, 's1'), old, old)
  assert.deepEqual(session.pruneSessions(data, { days: 30, now: 1000 + 31 * 24 * 60 * 60 * 1000 }), ['s1'])
  assert.equal(fs.existsSync(session.brakeFile(data, 's1')), false)
})

test('session start writes the brake file for the Lead and adds no brake export', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t, 'aether-env-'), 'env')
  fs.writeFileSync(envFile, '')
  // Without the session's own Aether and plugin-option variables, which would change the env file this test reads.
  const own = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(AETHER_|CLAUDE_PLUGIN_OPTION_)/.test(name)))
  const env = { ...own, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_QUOTABRAKE: '90', CLAUDE_PLUGIN_OPTION_BRAKEPUSH: 'true' }
  const lead = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' }
  let r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, encoding: 'utf8', input: JSON.stringify(lead), env })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'sessions', 's1.brake.json'), 'utf8')), { threshold: 90, push: true })
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export AETHER_SUPERDELEGATION=off\nexport AETHER_LANE_HARNESSES=agy\n')
  r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, encoding: 'utf8', input: JSON.stringify({ ...lead, session_id: 's2', agent_type: 'general-purpose' }), env })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(path.join(data, 'sessions', 's2.brake.json')), false)
  assert.equal(fs.existsSync(path.join(data, 'sessions', 's2.json')), false)
})
