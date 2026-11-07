'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { REAL_HOME, SESSION_BIN, PLUGIN, LEAD_START, makeRepo, tempDir, runSessionStart } = require('./helpers.js')

const realProjects = path.join(REAL_HOME, '.claude', 'projects')
const continuityFiles = () => (fs.existsSync(realProjects) ? fs.readdirSync(realProjects, { recursive: true }).filter((e) => e.includes(`${path.sep}continuity${path.sep}`)).sort() : [])

test('a test run points the Claude config folder and the home at a temporary folder, not at the real ones', () => {
  assert.ok(REAL_HOME && REAL_HOME !== os.tmpdir())
  for (const name of ['CLAUDE_CONFIG_DIR', 'HOME']) {
    assert.ok(process.env[name] && process.env[name].startsWith(fs.realpathSync(os.tmpdir())), `${name} is ${process.env[name]}`)
    assert.ok(!process.env[name].startsWith(REAL_HOME), `${name} is not under the real home`)
  }
  assert.equal(os.homedir(), process.env.HOME)
})

test('a Lead session started through the helpers writes nothing under the real ~/.claude/projects (R44)', (t) => {
  const before = continuityFiles()
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }
  const r = runSessionStart(repo.dir, env, { ...LEAD_START, session_id: 'isolation-check' })
  assert.equal(r.status, 0)
  assert.deepEqual(continuityFiles(), before)
  assert.ok(SESSION_BIN)
})
