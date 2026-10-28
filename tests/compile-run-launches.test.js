'use strict'

// Issue #111: a relaunch rewrites graph.json with only the units it selected. A compile with --run must
// still know the units of every earlier launch, merged or adopted by hand, and offer only the pending ones.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, WT_BIN, makeRepo, writePlan, commitIn, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

const compileRun = (repo, text, ...rest) => runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), ...rest], repo.dir)

// Ensures, commits and merges one unit of a run, then removes its worktree, as the swarm does.
function mergeUnit(repo, runId, n) {
  const one = runBin(WT_BIN, ['ensure', runId, `task-${n}`], repo.dir).json
  commitIn(repo, one.path, `src/t${n}/a.js`, `${n}\n`, `task ${n}`)
  assert.equal(runBin(WT_BIN, ['merge', runId, `task-${n}`], repo.dir).json.merged, true)
  runBin(WT_BIN, ['remove', runId, `task-${n}`], repo.dir)
}

test('a compile with --run after a relaunch offers only the units no launch merged', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3), task(4), task(5)])
  const first = compileRun(repo, text)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId } = first.json
  mergeUnit(repo, runId, 1)
  mergeUnit(repo, runId, 2)
  // The second launch selects other units, so its graph.json holds only them.
  const second = compileRun(repo, text, '--run', runId, '--only', 'task-3,task-4')
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.deepEqual(Object.keys(second.json.tasks).sort(), ['task-3', 'task-4'])
  mergeUnit(repo, runId, 3)
  const third = compileRun(repo, text, '--run', runId)
  assert.equal(third.status, 0, third.stdout + third.stderr)
  assert.deepEqual(third.json.alreadyMerged, ['task-1', 'task-2', 'task-3'])
  assert.deepEqual(third.json.waves.flat().sort(), ['task-4', 'task-5'])
  assert.deepEqual(Object.keys(third.json.tasks).sort(), ['task-4', 'task-5'])
})

test('a unit the Lead adopted by hand in an earlier launch counts as merged', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3), task(4)])
  const first = compileRun(repo, text)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId } = first.json
  commitIn(repo, repo.dir, 'src/t1/a.js', 'one\n', 'task 1 by hand')
  const sha = repo.git('rev-parse', 'HEAD')
  const adopted = runBin(WT_BIN, ['adopt', runId, 'task-1', '--commit', sha, '--reason', 'applied by hand'], repo.dir)
  assert.equal(adopted.status, 0, adopted.stdout + adopted.stderr)
  mergeUnit(repo, runId, 2)
  const second = compileRun(repo, text, '--run', runId, '--only', 'task-3')
  assert.equal(second.status, 0, second.stdout + second.stderr)
  mergeUnit(repo, runId, 3)
  const third = compileRun(repo, text, '--run', runId)
  assert.equal(third.status, 0, third.stdout + third.stderr)
  assert.deepEqual(third.json.alreadyMerged, ['task-1', 'task-2', 'task-3'])
  assert.deepEqual(third.json.waves.flat(), ['task-4'])
  assert.deepEqual(Object.keys(third.json.tasks), ['task-4'])
})

test('a brand-new run with no earlier launch is compiled as before', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2)])
  const fresh = compileRun(repo, text)
  assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr)
  assert.equal(fresh.json.alreadyMerged, undefined)
  assert.deepEqual(Object.keys(fresh.json.tasks).sort(), ['task-1', 'task-2'])
  const again = compileRun(repo, text, '--run', fresh.json.runId)
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.equal(again.json.alreadyMerged, undefined)
  assert.deepEqual(Object.keys(again.json.tasks).sort(), ['task-1', 'task-2'])
})

test('the sweep of a relaunched run removes the branch of a unit an earlier launch merged', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3)])
  const first = compileRun(repo, text)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId } = first.json
  const one = runBin(WT_BIN, ['ensure', runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'task 1')
  assert.equal(runBin(WT_BIN, ['merge', runId, 'task-1'], repo.dir).json.merged, true)
  const second = compileRun(repo, text, '--run', runId, '--only', 'task-2')
  assert.equal(second.status, 0, second.stdout + second.stderr)
  mergeUnit(repo, runId, 2)
  assert.equal(runBin(WT_BIN, ['save', runId], repo.dir).status, 0)
  const sweep = runBin(WT_BIN, ['sweep', '--run', runId], repo.dir)
  assert.equal(sweep.status, 0, sweep.stdout + sweep.stderr)
  assert.equal(repo.git('branch', '--list', `aether/${runId}/task-1`), '')
  assert.equal(fs.existsSync(path.join(first.json.runDir, 'patches', 'task-1.patch')), false)
})
