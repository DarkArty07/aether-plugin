'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { irreversibleClass } = require('../plugins/aether/lib/guard.js')
const { markSession } = require('../plugins/aether/lib/session.js')
const { readPending } = require('../plugins/aether/lib/pending.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const GUARD_BIN = path.join(PLUGIN, 'bin', 'aether-guard')
const MERGE = 'git merge --no-ff feature/saludo'
const REASON = (cls) =>
  `Aether added this ${cls} command to the owner's list (.aether/pending.jsonl): it is irreversible and no grant covers it. Go on with the work that does not depend on it, and put it in your brief's "Espera tu sí".`

// A repository on main, with a feature branch checked out in a second one.
function mainRepo(t) {
  const repo = makeRepo(t)
  repo.git('switch', '-q', 'main')
  return repo
}

// Runs aether-guard on a Bash call from session s1 in cwd, as guard.test.js does.
function guardBash(t, command, { cwd, mode, configDir = tempDir(t, 'aether-claude-') }) {
  const data = tempDir(t, 'aether-data-')
  markSession(data, 's1')
  const env = { ...process.env, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir }
  delete env.AETHER_IRREVERSIBLE
  if (mode !== undefined) env.AETHER_IRREVERSIBLE = mode
  const stdin = JSON.stringify({ session_id: 's1', hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } })
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8', env })
}

test('a git merge run on main is merge-main, from the text and the branch of its directory', (t) => {
  const repo = mainRepo(t)
  assert.equal(irreversibleClass(MERGE, repo.dir), 'merge-main')
  assert.equal(irreversibleClass('git merge --ff-only feature/saludo', repo.dir), 'merge-main')
  assert.equal(irreversibleClass('bash -c "git merge feature/saludo"', repo.dir), 'merge-main')
  assert.equal(irreversibleClass('git merge --abort', repo.dir), null)
})

test('a merge on main is recorded in log mode and refused in enforce mode', (t) => {
  const log = mainRepo(t)
  const logged = guardBash(t, MERGE, { cwd: log.dir })
  assert.equal(logged.status, 0, logged.stderr)
  assert.equal(logged.stdout, '')
  const entries = readPending(log.dir)
  assert.deepEqual(entries.map((e) => [e.class, e.command, e.mode]), [['merge-main', MERGE, 'log']])

  const enforce = mainRepo(t)
  const refused = guardBash(t, MERGE, { cwd: enforce.dir, mode: 'enforce' })
  assert.equal(refused.status, 0, refused.stderr)
  assert.deepEqual(JSON.parse(refused.stdout), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON('merge-main') },
  })
  assert.deepEqual(readPending(enforce.dir).map((e) => [e.class, e.mode]), [['merge-main', 'enforce']])
})

test('a merge into a feature branch is not merge-main, even when it names main', (t) => {
  const repo = makeRepo(t)
  assert.equal(irreversibleClass(MERGE, repo.dir), null)
  assert.equal(irreversibleClass('git merge main', repo.dir), null)
  assert.equal(irreversibleClass('git merge --no-ff feature/saludo', repo.dir), null)
  for (const mode of [undefined, 'enforce']) {
    const r = guardBash(t, 'git merge main', { cwd: repo.dir, mode })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'pending.jsonl')), false)
})

test('a switch to main first in the same line makes the merge merge-main, from any branch', (t) => {
  const repo = makeRepo(t)
  assert.equal(irreversibleClass(`git checkout main && ${MERGE}`, repo.dir), 'merge-main')
  assert.equal(irreversibleClass(`git switch main && ${MERGE}`, repo.dir), 'merge-main')
  assert.equal(irreversibleClass(`git checkout master && ${MERGE}`, repo.dir), 'merge-main')
  assert.equal(irreversibleClass(`git checkout main && ${MERGE}`), 'merge-main')
  const r = guardBash(t, `git checkout main && ${MERGE}`, { cwd: repo.dir, mode: 'enforce' })
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, REASON('merge-main'))
  assert.deepEqual(readPending(repo.dir).map((e) => [e.class, e.mode]), [['merge-main', 'enforce']])
})

test('a switch to a feature branch before the merge keeps it unclassified, even from main', (t) => {
  const repo = mainRepo(t)
  assert.equal(irreversibleClass('git switch feature/x && git merge main', repo.dir), null)
  assert.equal(irreversibleClass('git checkout -b feature/new && git merge main', repo.dir), null)
  assert.equal(irreversibleClass(`git checkout feature/x && ${MERGE}`, repo.dir), null)
  // A switch back to main after the feature branch makes the merge merge-main again.
  assert.equal(irreversibleClass('git switch feature/x && git switch main && git merge main', repo.dir), 'merge-main')
})

test('git -C dir merge is merge-main when dir is on main, whatever the cwd', (t) => {
  const main = mainRepo(t)
  const feature = makeRepo(t)
  assert.equal(irreversibleClass(`git -C ${main.dir} merge --no-ff feature/saludo`, feature.dir), 'merge-main')
  assert.equal(irreversibleClass(`git -C ${main.dir} merge --no-ff feature/saludo`), 'merge-main')
  assert.equal(irreversibleClass(`git -C ${feature.dir} merge --no-ff feature/saludo`), null)
  assert.equal(irreversibleClass('git -C ../other merge main', main.dir), null)
  assert.equal(irreversibleClass(`git -C ${feature.dir} merge main`, main.dir), null)
  assert.equal(irreversibleClass(`git -C ${feature.dir} checkout main && git -C ${feature.dir} merge x`, main.dir), 'merge-main')
  assert.equal(irreversibleClass(`git -C ${feature.dir} checkout main && git merge x`, main.dir), 'merge-main')
})

test('cd into the main checkout first makes the merge merge-main for the rest of the line', (t) => {
  const main = mainRepo(t)
  const feature = makeRepo(t)
  assert.equal(irreversibleClass(`cd ${main.dir} && ${MERGE}`, feature.dir), 'merge-main')
  assert.equal(irreversibleClass(`cd ${feature.dir} && ${MERGE}`, main.dir), null)
  assert.equal(irreversibleClass(`cd ${feature.dir}; cd ${main.dir} && ${MERGE}`, feature.dir), 'merge-main')
})

test('a merge in a unit worktree is merge-main only when the worktree is on main', (t) => {
  const repo = mainRepo(t)
  const unit = path.join(tempDir(t, 'aether-unit-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'unit/x', unit, 'main')
  assert.equal(irreversibleClass(MERGE, unit), null)
  assert.equal(irreversibleClass(`git -C ${unit} merge --no-ff feature/saludo`, repo.dir), null)
  assert.equal(irreversibleClass('aether-wt merge run-1 T1', repo.dir), null)
  assert.equal(irreversibleClass('aether-wt merge run-1 T1', unit), null)
  const r = guardBash(t, MERGE, { cwd: unit, mode: 'enforce' })
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'pending.jsonl')), false)
})

test('a branch that cannot be read never makes a merge merge-main, and nothing throws', (t) => {
  const plain = tempDir(t, 'aether-plain-')
  assert.equal(irreversibleClass(MERGE, plain), null)
  assert.equal(irreversibleClass(MERGE), null)
  assert.equal(irreversibleClass(MERGE, path.join(plain, 'missing')), null)
  const detached = mainRepo(t)
  detached.git('checkout', '-q', '--detach')
  assert.equal(irreversibleClass(MERGE, detached.dir), null)
  assert.equal(irreversibleClass(`git checkout --detach && ${MERGE}`, mainRepo(t).dir), null)
  const r = guardBash(t, MERGE, { cwd: plain, mode: 'enforce' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
})

test('a merge on main that a grant for merge-main covers is allowed silently, in either mode', (t) => {
  const repo = mainRepo(t)
  const configDir = tempDir(t, 'aether-claude-')
  const quote = 'apruebo merge a main en esta ocasion'
  const projects = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(projects, { recursive: true })
  const message = { type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: '2026-10-09T19:32:31.611Z', message: { role: 'user', content: quote } }
  fs.writeFileSync(path.join(projects, 's1.jsonl'), JSON.stringify(message) + '\n')
  assert.equal(autonomy.grant(repo.dir, { class: 'merge-main', quote, session: 's1' }, { configDir }).ok, true)
  for (const mode of [undefined, 'enforce']) {
    const r = guardBash(t, MERGE, { cwd: repo.dir, mode, configDir })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'pending.jsonl')), false)
})
