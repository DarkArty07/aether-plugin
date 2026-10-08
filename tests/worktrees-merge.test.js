'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, merge } = require('../plugins/aether/lib/worktrees.js')

function setup(t, options) {
  const repo = makeRepo(t, options)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  return { repo, args, unit }
}

test('merge brings an owned, tested unit into the integration branch', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.deepEqual(r, { merged: true, commit: repo.git('rev-parse', 'HEAD') })
  assert.equal(repo.git('log', '-1', '--format=%s'), `Merge ${unit.branch}`)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'one\n')
})

test("merge refuses files outside the unit's Owns", (t) => {
  const { repo, args, unit } = setup(t)
  const before = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'README.md', 'changed\n', 'touch readme')
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), { merged: false, reason: 'ownership', files: ['README.md'] })
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
})

test('merge refuses a unit that committed nothing', (t) => {
  const { repo, args, unit } = setup(t)
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), {
    merged: false,
    reason: 'empty',
    detail: `${unit.branch} has no changes to merge`,
  })
})

test('merge aborts on a conflict and leaves the integration branch clean', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, repo.dir, 'src/t1/a.js', 'integration\n', 'integration side')
  const before = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/a.js', 'unit\n', 'unit side')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, false)
  assert.equal(r.reason, 'conflict')
  assert.deepEqual(r.files, ['src/t1/a.js'])
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(repo.git('status', '--porcelain', '--untracked-files=no'), '')
})

test('merge undoes itself when the tests fail', (t) => {
  const { repo, args, unit } = setup(t)
  const graphFile = path.join(args.runDir, 'graph.json')
  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'))
  graph.testCommand = 'echo boom; exit 3'
  fs.writeFileSync(graphFile, JSON.stringify(graph))
  const before = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, false)
  assert.equal(r.reason, 'tests')
  assert.equal(r.exitCode, 3)
  assert.equal(r.reverted, true)
  assert.equal(r.timedOut, false)
  assert.match(r.output, /boom/)
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(fs.existsSync(path.join(repo.dir, 'src', 't1', 'a.js')), false)
})

test('merge refuses a dirty integration worktree', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  fs.writeFileSync(path.join(repo.dir, 'README.md'), 'uncommitted\n')
  assert.equal(merge(repo.dir, args.runId, 'task-1').reason, 'dirty-integration')
})

test('merge works when the repository path contains spaces', (t) => {
  const { repo, args, unit } = setup(t, { prefix: 'aether test repo ' })
  assert.match(repo.dir, / /)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
})
