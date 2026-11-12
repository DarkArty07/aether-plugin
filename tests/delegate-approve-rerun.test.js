'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, tempDir } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }

function world(t, { cwd = null } = {}) {
  const dataDir = tempDir(t, 'aether-data-')
  let n = 0
  const deps = {
    dataDir,
    cwd: cwd ?? dataDir,
    now: () => 1000 + (n += 1),
    settings: NATIVE,
    newId: () => `gen-${n}`,
    pickPair: async () => ({ pick: null, quota: [] }),
  }
  return { dataDir, deps }
}

const call = (prompt) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt } })
const BRIEF = (id, more = '') => `AETHER-TASK: ${id}\n${more}Do the work.`

test('stored result failed only on tests + --worktree whose tests pass -> approve accepted', async (t) => {
  const repo = makeRepo(t)
  const { deps, dataDir } = world(t, { cwd: repo.dir })
  const owns = 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\n'
  await task.begin(call(BRIEF('t1', owns)), deps)
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'hello\n')
  log.appendEntry(dataDir, {
    kind: 'result',
    task: 't1',
    attempt: 1,
    session: 's1',
    time: 5000,
    ok: true,
    pair: null,
    checks: {
      kind: 'edits',
      ok: false,
      empty: false,
      outside: [],
      tests: 'fail',
      failures: ['flaky_test'],
      reasons: ['tests failed (not ok: flaky_test)'],
    },
  })
  const approved = await task.verdict({ task: 't1', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(approved.ok, true, approved.error)
  assert.equal(approved.verdict, 'approved')
  const entries = log.readEntries(dataDir, { task: 't1' })
  assert.equal(entries.at(-1).verdict, 'approved')
})

test('stored result failed only on tests + --worktree whose tests still fail -> refused, message names failing test', async (t) => {
  const repo = makeRepo(t)
  const { deps, dataDir } = world(t, { cwd: repo.dir })
  const owns = 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "console.log(\'not ok 1 - test_broken\'); process.exit(1)"\n'
  await task.begin(call(BRIEF('t2', owns)), deps)
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'hello\n')
  log.appendEntry(dataDir, {
    kind: 'result',
    task: 't2',
    attempt: 1,
    session: 's1',
    time: 5000,
    ok: true,
    pair: null,
    checks: {
      kind: 'edits',
      ok: false,
      empty: false,
      outside: [],
      tests: 'fail',
      failures: ['flaky_test'],
      reasons: ['tests failed (not ok: flaky_test)'],
    },
  })
  const refused = await task.verdict({ task: 't2', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /checks failed: tests failed \(not ok: test_broken\)/)
})

test('stored result failed on a file outside Owns -> refused even with --worktree', async (t) => {
  const repo = makeRepo(t)
  const { deps, dataDir } = world(t, { cwd: repo.dir })
  const owns = 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\n'
  await task.begin(call(BRIEF('t3', owns)), deps)
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'hello\n')
  log.appendEntry(dataDir, {
    kind: 'result',
    task: 't3',
    attempt: 1,
    session: 's1',
    time: 5000,
    ok: true,
    pair: null,
    checks: {
      kind: 'edits',
      ok: false,
      empty: false,
      outside: ['docs/forbidden.md'],
      tests: 'fail',
      failures: ['flaky_test'],
      reasons: ['files outside owns: docs/forbidden.md', 'tests failed (not ok: flaky_test)'],
    },
  })
  const refused = await task.verdict({ task: 't3', verdict: 'approve', worktree: repo.dir }, deps)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /files outside owns: docs\/forbidden\.md/)
})
