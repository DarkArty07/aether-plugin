'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, makeRepo, compile, tempDir, age } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure } = require('../plugins/aether/lib/worktrees.js')

function start(cwd, data) {
  const r = spawnSync(process.execPath, [SESSION_BIN], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data },
  })
  return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr }
}

test('session start injects the Aether bootstrap', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.out.hookSpecificOutput.hookEventName, 'SessionStart')
  const context = r.out.hookSpecificOutput.additionalContext
  assert.match(context, /^Aether mode is active\./)
  assert.match(context, /# Aether mode/)
  assert.match(context, /aether-plan check/)
  assert.doesNotMatch(context, /disable-model-invocation/)
})

test('session start sweeps stale runs and says so', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  age(args.runDir, 48)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.out.hookSpecificOutput.additionalContext.endsWith(`Aether swept 1 stale run(s): ${args.runId}.`))
  assert.equal(fs.existsSync(unit.path), false)
})

test('session start works outside a git repository', (t) => {
  const r = start(tempDir(t), tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.out.hookSpecificOutput.additionalContext, /swept|could not sweep/)
})
