'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, runBin, PLAN_BIN, commitIn } = require('./helpers.js')

test('aether-plan next-spec returns 001 when no specs exist anywhere', (t) => {
  const repo = makeRepo(t)
  const r = runBin(PLAN_BIN, ['next-spec'], repo.dir)
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(r.json, { next: '001', highest: null, where: [] })
})

test('aether-plan next-spec finds the highest number on another local branch and skips refs without specs/', (t) => {
  const repo = makeRepo(t)
  // main has no specs/ folder; feature/x has 005; another local branch has 012.
  commitIn(repo, repo.dir, 'specs/005-alpha/spec.md', '# 005\n', 'add 005')
  repo.git('switch', '-q', '-c', 'feature/other', 'main')
  commitIn(repo, repo.dir, 'specs/012-beta/spec.md', '# 012\n', 'add 012')
  repo.git('switch', '-q', 'feature/x')

  const r = runBin(PLAN_BIN, ['next-spec'], repo.dir)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.next, '013')
  assert.equal(r.json.highest, '012')
  assert.ok(r.json.where.includes('feature/other'), JSON.stringify(r.json))
})

test('aether-plan next-spec finds the highest number on a remote-tracking branch', (t) => {
  const repo = makeRepo(t)
  const bare = tempDir(t, 'aether-remote-')
  repo.git('init', '--bare', '-q', bare)
  commitIn(repo, repo.dir, 'specs/004-local/spec.md', '# 004\n', 'add 004')

  // Push a higher spec from a second repo into the bare remote, then fetch it as a remote-tracking branch.
  const pusher = makeRepo(t, { prefix: 'aether-pusher-' })
  pusher.git('checkout', '-q', 'main')
  commitIn(pusher, pusher.dir, 'specs/038-remote/spec.md', '# 038\n', 'add 038')
  pusher.git('-c', 'protocol.file.allow=always', 'push', '-q', bare, 'main')

  repo.git('remote', 'add', 'origin', bare)
  repo.git('-c', 'protocol.file.allow=always', 'fetch', '-q', 'origin')

  const r = runBin(PLAN_BIN, ['next-spec'], repo.dir)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.next, '039')
  assert.equal(r.json.highest, '038')
  assert.ok(r.json.where.includes('origin/main'), JSON.stringify(r.json))
})

test('aether-plan next-spec counts an uncommitted folder in another worktree on disk', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'specs/010-committed/spec.md', '# 010\n', 'add 010')
  const wtDir = tempDir(t, 'aether-wt-')
  fs.rmSync(wtDir, { recursive: true, force: true })
  repo.git('worktree', 'add', '-q', '-b', 'wt-branch', wtDir, 'main')
  t.after(() => {
    try {
      repo.git('worktree', 'remove', '--force', wtDir)
    } catch {
      // ignore if already removed
    }
  })

  // Uncommitted folder in the other worktree.
  fs.mkdirSync(path.join(wtDir, 'specs', '027-uncommitted'), { recursive: true })

  const r = runBin(PLAN_BIN, ['next-spec'], repo.dir)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.next, '028')
  assert.equal(r.json.highest, '027')
  assert.ok(r.json.where.includes(wtDir), JSON.stringify(r.json))
})

test('aether-plan next-spec falls back to working tree specs/ outside a git repository and ignores non-directories', (t) => {
  const dir = tempDir(t, 'aether-nongit-')
  fs.mkdirSync(path.join(dir, 'specs', '003-local'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'specs', '099-not-a-dir'), 'ignore\n')

  const r = runBin(PLAN_BIN, ['next-spec'], dir)
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(r.json, { next: '004', highest: '003', where: [dir] })
})
