'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, commitIn, runBin, tempDir, age } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

test('aether-wt drives a unit from ensure to sweep, one JSON object per call', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  let r = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.created, true)
  commitIn(repo, r.json.path, 'src/t1/a.js', 'one\n', 'add a')
  r = runBin(WT_BIN, ['diff', args.runId, 'task-1'], repo.dir)
  assert.ok(fs.existsSync(r.json.path))
  r = runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir)
  assert.equal(r.json.merged, true)
  r = runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  assert.deepEqual(r.json, { removed: true, patch: null })
  r = runBin(WT_BIN, ['sweep', '--run', args.runId], repo.dir)
  assert.deepEqual(r.json.remaining, { worktrees: [], branches: [] })
})

test('aether-wt works from inside a unit worktree', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const first = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  const second = runBin(WT_BIN, ['ensure', args.runId, 'task-2'], first.path)
  assert.equal(second.status, 0, second.stdout)
  assert.equal(second.json.path, path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-2'))
})

test('aether-wt reports errors as JSON and exits 1', (t) => {
  const repo = makeRepo(t)
  let r = runBin(WT_BIN, ['ensure', 'bad-id', 'task-1'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /invalid run id/)
  r = runBin(WT_BIN, ['launch'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /^usage: aether-wt/)
})

test('aether-wt sweep --stale accepts an hour limit', (t) => {
  const data = tempDir(t, 'aether-data-')
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  age(args.runDir, 3)
  const r = runBin(WT_BIN, ['sweep', '--stale', '--hours', '2'], repo.dir, { AETHER_DATA_DIR: data })
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json, { swept: [args.runId] })
})

test('aether-wt sweep --run --finish deletes the run directory', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const r = runBin(WT_BIN, ['sweep', '--run', args.runId, '--finish'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(fs.existsSync(args.runDir), false)
})

test('aether-wt diff <run> --final writes the package of the whole run', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const r = runBin(WT_BIN, ['diff', args.runId, '--final'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.path, path.join(args.runDir, 'packages', 'final.diff'))
  assert.equal(r.json.base, args.integration.base)
})
