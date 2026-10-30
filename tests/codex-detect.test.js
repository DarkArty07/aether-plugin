'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { runBin, tempDir } = require('./helpers.js')
const fx = require('./lane-fixtures.js')

const FAKE = path.join(__dirname, 'fixtures', 'fake-codex.js')
const RATE_LIMITS = path.join(__dirname, 'fixtures', 'codex', 'rate-limits.json')

const quotaOf = (t, command) => {
  fs.chmodSync(FAKE, 0o755)
  const env = { ...fx.laneEnv(t, { mutate: (config) => (config.harnesses.codex.command = command) }), AETHER_FAKE_CODEX_RATE_LIMITS: RATE_LIMITS }
  return runBin(fx.LANE_BIN, ['quota', 'codex', '--json'], tempDir(t), env)
}

test('with a codex that exists the quota report says it is installed, its version, and both windows (R2)', (t) => {
  const r = quotaOf(t, FAKE)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const codex = r.json.harnesses.codex
  assert.deepEqual([codex.installed, codex.version], [true, 'codex-cli 0.166.0'])
  assert.deepEqual(Object.keys(codex.groups.codex.windows), ['5h', 'weekly'])
})

test('without a codex it says not installed, with no version and no groups, and nothing breaks (R2)', (t) => {
  const r = quotaOf(t, '/nowhere/codex')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual([r.json.harnesses.codex.installed, r.json.harnesses.codex.version, r.json.harnesses.codex.groups], [false, null, {}])
})

test('the option says that only Cursor is untested, and the guide says what the manifest says (R1)', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', '.claude-plugin', 'plugin.json'), 'utf8'))
  const description = plugin.userConfig.harnesses.description
  assert.ok(description.includes('agy, codex, grok, cursor, muse'))
  assert.ok(description.endsWith('Cursor is not tested with a real account.'))
  assert.equal(/Codex and Cursor are not tested/.test(description), false)
  const options = fs.readFileSync(path.join(__dirname, '..', 'docs', 'guide', 'options.md'), 'utf8')
  assert.ok(options.includes('Cursor is not tested with a real account.'))
  assert.equal(/Codex and Cursor/.test(options), false)
})
