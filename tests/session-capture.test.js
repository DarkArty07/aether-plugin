'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir } = require('./helpers.js')
const { main: sessionStart, bootstrapParts } = require('../plugins/aether/lib/session-start.js')
const { markSession, readMark, touchSession, repoSessions } = require('../plugins/aether/lib/session.js')

const AETHER = { hook_event_name: 'SessionStart', session_id: 's-cap-1', source: 'startup', agent_type: 'aether:lead' }

function runStart(cwd, dataDir, sessionId, { source = 'startup', pluginRoot = PLUGIN } = {}) {
  let output = ''
  sessionStart({
    input: { ...AETHER, session_id: sessionId, source },
    cwd,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, AETHER_DATA_DIR: dataDir },
    stdout: { write(s) { output += s } },
  })
  return output
}

test('session record holds plugin version and a stable bootstrap sha256 that changes when a rule changes', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const expectedVersion = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version
  const expectedHash = crypto.createHash('sha256').update(bootstrapParts(PLUGIN).map((p) => p.context).join('')).digest('hex')

  runStart(repo.dir, data, 's-cap-1')
  runStart(repo.dir, data, 's-cap-2')

  const first = readMark(data, 's-cap-1')
  const second = readMark(data, 's-cap-2')
  assert.equal(first.plugin, expectedVersion)
  assert.match(first.bootstrap, /^[0-9a-f]{64}$/)
  assert.equal(first.bootstrap, expectedHash)
  assert.equal(second.bootstrap, first.bootstrap, 'same rules give the same fingerprint in every session')
  assert.equal('model' in first, false, 'Lead model is not added to the session record')

  // Copy the plugin root and edit using-aether/SKILL.md -> different bootstrap fingerprint.
  const editedRoot = tempDir(t, 'aether-plugin-copy-')
  fs.cpSync(path.join(PLUGIN, '.claude-plugin'), path.join(editedRoot, '.claude-plugin'), { recursive: true })
  fs.cpSync(path.join(PLUGIN, 'skills', 'using-aether'), path.join(editedRoot, 'skills', 'using-aether'), { recursive: true })
  const skillPath = path.join(editedRoot, 'skills', 'using-aether', 'SKILL.md')
  fs.writeFileSync(skillPath, fs.readFileSync(skillPath, 'utf8') + '\nEdited rule.\n')

  runStart(repo.dir, data, 's-cap-3', { pluginRoot: editedRoot })
  const edited = readMark(data, 's-cap-3')
  assert.equal(edited.plugin, expectedVersion)
  assert.match(edited.bootstrap, /^[0-9a-f]{64}$/)
  assert.notEqual(edited.bootstrap, first.bootstrap, 'edited rule gives a different fingerprint')
})

test('later updates keep plugin and bootstrap, and older records without them still read', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')

  runStart(repo.dir, data, 's-cap-update')
  const initial = readMark(data, 's-cap-update')
  assert.ok(initial.plugin)
  assert.match(initial.bootstrap, /^[0-9a-f]{64}$/)

  assert.equal(touchSession(data, 's-cap-update', initial.lastActivity + 5000), true)
  const touched = readMark(data, 's-cap-update')
  assert.equal(touched.plugin, initial.plugin)
  assert.equal(touched.bootstrap, initial.bootstrap)
  assert.equal(touched.lastActivity, initial.lastActivity + 5000)

  runStart(repo.dir, data, 's-cap-update', { source: 'resume' })
  const resumed = readMark(data, 's-cap-update')
  assert.equal(resumed.plugin, initial.plugin)
  assert.equal(resumed.bootstrap, initial.bootstrap)

  // Older record without plugin or bootstrap still reads.
  markSession(data, 's-legacy', 1000, { repo: repo.dir, claude: null })
  const legacy = readMark(data, 's-legacy')
  assert.equal(legacy.session, 's-legacy')
  assert.equal(legacy.plugin, undefined)
  assert.equal(legacy.bootstrap, undefined)
  assert.equal(touchSession(data, 's-legacy', 2000), true)
  assert.equal(repoSessions(data, repo.dir).some((r) => r.session === 's-legacy'), true)
})
