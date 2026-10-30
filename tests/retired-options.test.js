'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { GROUPS } = require('./retired-patterns.js')

const ROOT = path.join(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8'))
const READERS = {
  superdelegation: 'plugins/aether/lib/superdelegation.js',
  harnesses: 'plugins/aether/lib/session.js',
  ops: 'plugins/aether/bin/aether-session-start',
  deadlines: 'plugins/aether/lib/session.js',
  quotabrake: 'plugins/aether/lib/session.js',
  brakepush: 'plugins/aether/lib/session.js',
  observedev: 'plugins/aether/lib/observe.js',
  autoissue: 'plugins/aether/lib/observe.js',
}

test('the manifest declares neither retired option, and the option table has no row for them', () => {
  for (const key of ['lan' + 'es', 'sea' + 'ts']) {
    assert.equal(Object.hasOwn(manifest.userConfig, key), false, key)
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8'), new RegExp('^\\| `' + key + '` \\|', 'm'))
  }
  assert.doesNotMatch(manifest.userConfig.superdelegation.description, /Replaces the/)
  assert.deepEqual(Object.keys(manifest.userConfig).sort(), Object.keys(READERS).sort())
})

test('each remaining userConfig key is named by its reader', () => {
  for (const [key, file] of Object.entries(READERS)) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    const env = 'CLAUDE_PLUGIN_OPTION_' + key.toUpperCase()
    assert.ok(text.includes(key) || text.includes(env), `${key} has no reader in ${file}`)
  }
})

test('the formats group exists and is built for the four compatibility branches', () => {
  assert.equal(GROUPS.formats.length, 4)
  for (const pattern of GROUPS.formats) assert.ok(pattern instanceof RegExp)
})

test('only cursor is said to be untested with a real account, in the manifest and in the option table', () => {
  const sentence = 'Cursor is not tested with a real account.'
  assert.ok(manifest.userConfig.harnesses.description.endsWith(sentence))
  assert.equal(/Codex and Cursor are not tested/.test(manifest.userConfig.harnesses.description), false)
  assert.ok(fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8').includes(sentence))
})
