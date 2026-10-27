'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, WT_BIN, makeRepo, writePlan, commitIn, runBin } = require('./helpers.js')
const { spawnSync } = require('node:child_process')
const { task, plan } = require('./plan-fixtures.js')

// A run whose task-1 is merged (its branch closed), its task-2 half done and on its branch.
function interruptedRun(t) {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3, { depends: 'Task 2 — needs its output' })])
  const first = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text)], repo.dir)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const args = first.json
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir).json.merged, true)
  runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  const two = runBin(WT_BIN, ['ensure', args.runId, 'task-2'], repo.dir).json
  fs.mkdirSync(path.join(two.path, 'src', 't2'), { recursive: true })
  fs.writeFileSync(path.join(two.path, 'src', 't2', 'wip.js'), 'wip\n')
  assert.equal(runBin(WT_BIN, ['save', args.runId], repo.dir).status, 0)
  return { repo, text, args, two }
}

test('a relaunch leaves the units already merged out of the graph', (t) => {
  const { repo, text, args } = interruptedRun(t)
  const r = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', args.runId], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.alreadyMerged, ['task-1'])
  assert.deepEqual(Object.keys(r.json.tasks).sort(), ['task-2', 'task-3'])
  assert.deepEqual(r.json.waves, [['task-2'], ['task-3']])
  assert.match(r.stderr, new RegExp(`aether-plan: task-1 is already merged in run ${args.runId}; it is not relaunched`))
  const graph = JSON.parse(fs.readFileSync(path.join(args.runDir, 'graph.json'), 'utf8'))
  assert.deepEqual(graph.alreadyMerged, ['task-1'])
  // The work saved on the unit branch is still the one the relaunch continues from.
  assert.equal(spawnSync('git', ['show', `aether/${args.runId}/task-2:src/t2/wip.js`], { cwd: repo.dir, encoding: 'utf8' }).stdout, 'wip\n')
})

test('an explicit --only still names its own tasks, merged or not', (t) => {
  const { repo, text, args } = interruptedRun(t)
  const r = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', args.runId, '--only', 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.alreadyMerged, undefined)
  assert.deepEqual(Object.keys(r.json.tasks), ['task-1'])
})

test('a run with everything merged compiles to an empty graph', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1)])
  const first = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text)], repo.dir)
  const args = first.json
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir).json.merged, true)
  runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  const r = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', args.runId], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual([r.json.alreadyMerged, r.json.waves, r.json.tasks], [['task-1'], [], {}])
})

test('a first compile and a run id with no prior graph do not mention alreadyMerged', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2)])
  const fresh = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text)], repo.dir)
  assert.equal(fresh.json.alreadyMerged, undefined)
  const named = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', '20261021-110000-beef'], repo.dir)
  assert.equal(named.status, 0, named.stdout + named.stderr)
  assert.equal(named.json.alreadyMerged, undefined)
  assert.deepEqual(Object.keys(named.json.tasks).sort(), ['task-1', 'task-2'])
})
