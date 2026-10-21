'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, commitIn, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { spawnSync } = require('node:child_process')
const wt = require('../plugins/aether/lib/worktrees.js')

const show = (repo, spec) => spawnSync('git', ['show', spec], { cwd: repo.dir, encoding: 'utf8' }).stdout

function writeAt(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

// task-1 merged, task-2 with uncommitted work inside and outside Owns, task-3 never ensured.
function interrupted(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2), task(3)]))
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir).json.merged, true)
  runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  const two = runBin(WT_BIN, ['ensure', args.runId, 'task-2'], repo.dir).json
  commitIn(repo, two.path, 'src/t2/b.js', 'two\n', 'add b')
  writeAt(path.join(two.path, 'src', 't2', 'wip.js'), 'wip\n')
  writeAt(path.join(two.path, 'elsewhere.js'), 'stray\n')
  return { repo, args, two }
}

test('aether-wt save commits each unit on its branch and writes saved.json', (t) => {
  const { repo, args, two } = interrupted(t)
  const r = runBin(WT_BIN, ['save', args.runId], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.run, args.runId)
  assert.equal(r.json.path, path.join(args.runDir, 'saved.json'))
  assert.deepEqual(JSON.parse(fs.readFileSync(r.json.path, 'utf8')), { run: r.json.run, at: r.json.at, units: r.json.units })
  const [u1, u2, u3] = r.json.units
  assert.deepEqual([u1.task, u1.merged, u1.salvaged], ['task-1', true, false])
  assert.deepEqual([u2.task, u2.merged, u2.salvaged, u2.branch], ['task-2', false, true, `aether/${args.runId}/task-2`])
  assert.deepEqual(u2.committed, ['src/t2/wip.js'])
  assert.deepEqual(u2.left, ['elsewhere.js'])
  assert.deepEqual([u3.task, u3.branch, u3.head], ['task-3', null, null])
  // The saved work is a commit on the branch: it survives the worktree going away.
  const head = repo.git('rev-parse', u2.branch)
  assert.equal(head, u2.head)
  assert.equal(show(repo, `${u2.branch}:src/t2/wip.js`), 'wip\n')
  assert.match(repo.git('log', '-1', '--format=%s', u2.branch), /aether: task-2 work saved/)
  // What Owns does not cover stayed in the worktree, named and uncommitted.
  assert.equal(fs.readFileSync(path.join(two.path, 'elsewhere.js'), 'utf8'), 'stray\n')
  // No origin was ever consulted: save has no push to give.
  assert.equal(repo.git('remote', '-v'), '')
})

test('mergedUnits sees a merged unit after its branch is gone, and only units of the graph', (t) => {
  const { repo, args } = interrupted(t)
  assert.deepEqual(wt.mergedUnits(repo.dir, args.runId), ['task-1'])
})
