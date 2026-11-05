'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { newRunId, isRunId, assertRunId, assertTaskId, ensureExcluded, writeJson, readJson } = require('../plugins/aether/lib/run.js')
const { tempDir } = require('./helpers.js')

test('newRunId has a date, a time and four hex characters', () => {
  const id = newRunId(new Date(2026, 9, 7, 21, 5, 9))
  assert.match(id, /^20261007-210509-[0-9a-f]{4}$/)
  assert.equal(isRunId(id), true)
})

test('ids that could escape .aether are refused', () => {
  assert.throws(() => assertRunId('../x'), /invalid run id/)
  assert.throws(() => assertTaskId('task-1/../../x'), /invalid task id/)
  assert.doesNotThrow(() => assertTaskId('task-12'))
})

test('ensureExcluded adds the patterns once', (t) => {
  const dir = tempDir(t)
  ensureExcluded(dir)
  ensureExcluded(dir)
  assert.equal(fs.readFileSync(path.join(dir, 'info', 'exclude'), 'utf8'), '/.aether/\n/.aether-tmp/\n/.aether-exam/\n')
})

test('ensureExcluded keeps the existing content', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(path.join(dir, 'info'))
  fs.writeFileSync(path.join(dir, 'info', 'exclude'), 'node_modules')
  ensureExcluded(dir)
  assert.equal(fs.readFileSync(path.join(dir, 'info', 'exclude'), 'utf8'), 'node_modules\n/.aether/\n/.aether-tmp/\n/.aether-exam/\n')
})

test('writeJson writes a temporary file beside the target and renames it over the target (R8)', (t) => {
  const dir = tempDir(t)
  const target = path.join(dir, 'nested', 'units.json')
  writeJson(target, { a: 1 })
  assert.deepEqual(readJson(target), { a: 1 })
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['units.json'])

  const real = fs.writeFileSync
  const written = []
  t.mock.method(fs, 'writeFileSync', (file, ...rest) => {
    written.push(String(file))
    return real(file, ...rest)
  })
  writeJson(target, { a: 2 })
  t.mock.restoreAll()
  assert.equal(written.length, 1)
  assert.notEqual(written[0], target, 'it never writes the target in place')
  assert.equal(path.dirname(written[0]), path.dirname(target), 'the temporary file is in the same directory')
  assert.deepEqual(readJson(target), { a: 2 })
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['units.json'])
})

test('a crash while writing leaves the previous file whole and no temporary file (R8)', (t) => {
  const dir = tempDir(t)
  const target = path.join(dir, 'graph.json')
  writeJson(target, { a: 1 })
  const real = fs.writeFileSync
  t.mock.method(fs, 'writeFileSync', (file, data, ...rest) => {
    real(file, String(data).slice(0, 4), ...rest)
    throw new Error('simulated crash')
  })
  assert.throws(() => writeJson(target, { a: 2, big: 'x'.repeat(100) }), /simulated crash/)
  t.mock.restoreAll()
  assert.deepEqual(readJson(target), { a: 1 })
  assert.deepEqual(fs.readdirSync(dir), ['graph.json'])
})

// ---- dataDir (installable spec R11) ----
const os = require('node:os')
const { dataDir } = require('../plugins/aether/lib/run.js')

// A plugin root laid out as Claude Code's plugin cache lays it out, under a plugins root.
function cacheRoot(plugins, marketplace = 'aether-plugin', plugin = 'aether', version = '0.7.0') {
  const root = path.join(plugins, 'cache', marketplace, plugin, version)
  fs.mkdirSync(root, { recursive: true })
  return root
}

test('dataDir: AETHER_DATA_DIR wins over everything', (t) => {
  const cfg = tempDir(t)
  const root = cacheRoot(path.join(cfg, 'plugins'))
  assert.equal(dataDir({ AETHER_DATA_DIR: '/somewhere/data', CLAUDE_CONFIG_DIR: cfg }, root), '/somewhere/data')
})

test('dataDir: an installed copy uses the data directory Claude Code gives the plugin', (t) => {
  const cfg = tempDir(t)
  const root = cacheRoot(path.join(cfg, 'plugins'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg }, root), path.join(cfg, 'plugins', 'data', 'aether-aether-plugin'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg + '/' }, root), path.join(cfg, 'plugins', 'data', 'aether-aether-plugin'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg, AETHER_DATA_DIR: '' }, root), path.join(cfg, 'plugins', 'data', 'aether-aether-plugin'))
})

test('dataDir: CLAUDE_CODE_PLUGIN_CACHE_DIR moves the plugins root, and the id replaces other characters with -', (t) => {
  const base = tempDir(t)
  const plugins = path.join(base, 'plugin cache')
  const root = cacheRoot(plugins, 'my.market', 'aether', '1.0.0')
  const env = { CLAUDE_CODE_PLUGIN_CACHE_DIR: plugins, CLAUDE_CONFIG_DIR: path.join(base, 'cfg') }
  assert.equal(dataDir(env, root), path.join(plugins, 'data', 'aether-my-market'))
})

test('dataDir: a copy loaded in place uses aether-inline, even under a directory merely named cache', (t) => {
  const base = tempDir(t)
  const cfg = path.join(base, 'cfg')
  const inline = path.join(base, 'repo', 'plugins', 'aether')
  fs.mkdirSync(inline, { recursive: true })
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg }, inline), path.join(cfg, 'plugins', 'data', 'aether-inline'))
  const lookalike = cacheRoot(path.join(base, 'work'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg }, lookalike), path.join(cfg, 'plugins', 'data', 'aether-inline'))
  const tooDeep = path.join(cfg, 'plugins', 'cache', 'aether-plugin', 'aether', '0.7.0', 'bin')
  fs.mkdirSync(tooDeep, { recursive: true })
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: cfg }, tooDeep), path.join(cfg, 'plugins', 'data', 'aether-inline'))
})

test('dataDir: a config directory reached through a symbolic link still finds the cache root', (t) => {
  const base = tempDir(t)
  const cfg = path.join(base, 'real-config')
  const root = cacheRoot(path.join(cfg, 'plugins'))
  const link = path.join(base, 'link-config')
  fs.symlinkSync(cfg, link)
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: link }, root), path.join(link, 'plugins', 'data', 'aether-aether-plugin'))
})

test('dataDir: without CLAUDE_CONFIG_DIR the plugins root is ~/.claude/plugins, and the default root is this plugin', () => {
  assert.equal(dataDir({}, '/nowhere/plugins/aether'), path.join(os.homedir(), '.claude', 'plugins', 'data', 'aether-inline'))
  assert.equal(dataDir({ CLAUDE_CONFIG_DIR: '/cfg' }), path.join('/cfg', 'plugins', 'data', 'aether-inline'))
})

