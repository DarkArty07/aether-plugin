'use strict'

// Issue 003: a unit that ended without its report may still hold the work. `aether-wt salvage` commits
// what the task owns, and writes the package a supervisor reviews.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, commitIn, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

function unit(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const ensured = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir)
  assert.equal(ensured.status, 0, ensured.stdout)
  return { repo, args, worktree: ensured.json.path, branch: ensured.json.branch }
}

function write(worktree, file, text) {
  const target = path.join(worktree, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
}

test('salvage commits the uncommitted files the task owns, writes the package, and the unit then merges', (t) => {
  const { repo, args, worktree, branch } = unit(t)
  write(worktree, 'src/t1/a.js', 'one\n')
  write(worktree, 'src/t1/deep/b.js', 'two\n')
  const r = runBin(WT_BIN, ['salvage', args.runId, 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.salvaged, true)
  assert.deepEqual(r.json.files, ['src/t1/a.js', 'src/t1/deep/b.js'])
  assert.deepEqual(r.json.committed, ['src/t1/a.js', 'src/t1/deep/b.js'])
  assert.deepEqual(r.json.left, [])
  assert.equal(r.json.head, repo.git('rev-parse', branch))
  assert.equal(r.json.package, path.join(args.runDir, 'packages', 'task-1.diff'))
  assert.match(fs.readFileSync(r.json.package, 'utf8'), /src\/t1\/a\.js/)
  assert.equal(repo.git('-C', worktree, 'status', '--porcelain'), '')
  const merged = runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir)
  assert.equal(merged.json.merged, true, merged.stdout)
})

test('salvage leaves a file outside Owns uncommitted and names it', (t) => {
  const { repo, args, worktree } = unit(t)
  write(worktree, 'src/t1/a.js', 'one\n')
  write(worktree, 'src/elsewhere.js', 'not mine\n')
  const r = runBin(WT_BIN, ['salvage', args.runId, 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.salvaged, true)
  assert.deepEqual(r.json.files, ['src/t1/a.js'])
  assert.deepEqual(r.json.left, ['src/elsewhere.js'])
  assert.match(repo.git('-C', worktree, 'status', '--porcelain'), /\?\? src\/elsewhere\.js/)
})

test('salvage of only files outside Owns salvages nothing', (t) => {
  const { repo, args, worktree } = unit(t)
  write(worktree, 'src/elsewhere.js', 'not mine\n')
  const r = runBin(WT_BIN, ['salvage', args.runId, 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual([r.json.salvaged, r.json.files, r.json.committed, r.json.left], [false, [], [], ['src/elsewhere.js']])
})

test('salvage of a unit that committed but gave no report writes its package and commits nothing more', (t) => {
  const { repo, args, worktree, branch } = unit(t)
  commitIn(repo, worktree, 'src/t1/a.js', 'one\n', 'add a')
  const before = repo.git('rev-parse', branch)
  const r = runBin(WT_BIN, ['salvage', args.runId, 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual([r.json.salvaged, r.json.files, r.json.committed, r.json.head], [true, ['src/t1/a.js'], [], before])
  assert.ok(fs.existsSync(r.json.package))
  assert.equal(repo.git('rev-parse', branch), before)
})

test('salvage of a unit with no work, or with no worktree, says so and changes nothing', (t) => {
  const { repo, args } = unit(t)
  const empty = runBin(WT_BIN, ['salvage', args.runId, 'task-1'], repo.dir)
  assert.equal(empty.status, 0, empty.stdout + empty.stderr)
  assert.deepEqual([empty.json.salvaged, empty.json.files, empty.json.committed, empty.json.left, empty.json.package], [false, [], [], [], null])
  const never = runBin(WT_BIN, ['salvage', args.runId, 'task-2'], repo.dir)
  assert.equal(never.status, 0, never.stdout + never.stderr)
  assert.equal(never.json.salvaged, false)
  assert.equal(never.json.reason, 'no-worktree')
})

test('salvage commits a deletion of an owned file, and refuses a task that is not in the run', (t) => {
  const repo = makeRepo(t)
  // The file is in the integration branch before the run, so the unit's deletion is a change of its own.
  commitIn(repo, repo.dir, 'src/t1/old.js', 'old\n', 'add old')
  const args = compile(repo, plan([task(1), task(2)]))
  const worktree = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json.path
  fs.rmSync(path.join(worktree, 'src/t1/old.js'))
  const r = runBin(WT_BIN, ['salvage', args.runId, 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual([r.json.salvaged, r.json.files, r.json.committed], [true, ['src/t1/old.js'], ['src/t1/old.js']])
  assert.equal(repo.git('-C', worktree, 'status', '--porcelain'), '')
  const bad = runBin(WT_BIN, ['salvage', args.runId, 'task-9'], repo.dir)
  assert.equal(bad.status, 1)
  assert.match(bad.json.error, /task-9 is not in run/)
})
