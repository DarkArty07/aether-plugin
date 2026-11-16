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

// Issue #113: save lists the units of every launch, and keeps the work of an unmerged unit of an earlier one.
test('save after a relaunch lists the units of the earlier launches and keeps the branch of an unmerged one', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3)])
  const first = compileRun(repo, text)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId } = first.json
  mergeUnit(repo, runId, 1)
  const two = runBin(WT_BIN, ['ensure', runId, 'task-2'], repo.dir).json
  commitIn(repo, two.path, 'src/t2/a.js', '2\n', 'task 2')
  const second = compileRun(repo, text, '--run', runId, '--only', 'task-3')
  assert.equal(second.status, 0, second.stdout + second.stderr)
  const saved = runBin(WT_BIN, ['save', runId], repo.dir)
  assert.equal(saved.status, 0, saved.stdout + saved.stderr)
  const { units } = JSON.parse(fs.readFileSync(path.join(first.json.runDir, 'saved.json'), 'utf8'))
  assert.deepEqual(units.map((u) => u.task), ['task-1', 'task-2', 'task-3'])
  const byTask = Object.fromEntries(units.map((u) => [u.task, u]))
  assert.equal(byTask['task-1'].merged, true)
  assert.equal(byTask['task-2'].merged, false)
  assert.equal(byTask['task-2'].branch, `aether/${runId}/task-2`)
  assert.notEqual(repo.git('branch', '--list', `aether/${runId}/task-2`), '')
})

test('recompiling with --only of 10 in a 54-task plan offers only the 10th after 9 merge and preserves selections[1]', (t) => {
  const repo = makeRepo(t)
  const text = plan(Array.from({ length: 54 }, (_, i) => task(i + 1)))
  const selected = Array.from({ length: 10 }, (_, i) => `task-${i + 1}`)
  const first = compileRun(repo, text, '--only', selected.join(','))
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId, runDir } = first.json
  for (let n = 1; n <= 9; n++) mergeUnit(repo, runId, n)

  const second = compileRun(repo, text, '--run', runId)
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.deepEqual(Object.keys(second.json.tasks), ['task-10'])
  assert.deepEqual(second.json.alreadyMerged, selected.slice(0, 9))

  const state = JSON.parse(fs.readFileSync(path.join(runDir, 'state.json'), 'utf8'))
  assert.equal(state.launches, 2)
  assert.deepEqual(state.selections, [selected, selected])
})

test('a run whose first launch had no --only (null) still offers the whole plan minus merged', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3), task(4)])
  const first = compileRun(repo, text)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId, runDir } = first.json
  mergeUnit(repo, runId, 1)

  const second = compileRun(repo, text, '--run', runId)
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.deepEqual(Object.keys(second.json.tasks).sort(), ['task-2', 'task-3', 'task-4'])
  const state = JSON.parse(fs.readFileSync(path.join(runDir, 'state.json'), 'utf8'))
  assert.deepEqual(state.selections, [null, null])
})

test('a run without selections (legacy state) derives its selection from units.json', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3), task(4), task(5)])
  const first = compileRun(repo, text, '--only', 'task-1,task-2,task-3')
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId, runDir } = first.json
  const statePath = path.join(runDir, 'state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  delete state.selections
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')

  mergeUnit(repo, runId, 1)
  const second = compileRun(repo, text, '--run', runId)
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.deepEqual(Object.keys(second.json.tasks).sort(), ['task-2', 'task-3'])
})

test('two launches with distinct --only combine as their union on --run without --only', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3), task(4), task(5)])
  const first = compileRun(repo, text, '--only', 'task-1,task-2')
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId, runDir } = first.json
  mergeUnit(repo, runId, 1)
  const second = compileRun(repo, text, '--run', runId, '--only', 'task-3,task-4')
  assert.equal(second.status, 0, second.stdout + second.stderr)
  mergeUnit(repo, runId, 3)

  const third = compileRun(repo, text, '--run', runId)
  assert.equal(third.status, 0, third.stdout + third.stderr)
  assert.deepEqual(Object.keys(third.json.tasks).sort(), ['task-2', 'task-4'])
  const state = JSON.parse(fs.readFileSync(path.join(runDir, 'state.json'), 'utf8'))
  assert.equal(state.launches, 3)
  assert.deepEqual(state.selections[2], ['task-1', 'task-2', 'task-3', 'task-4'])
})

test('an explicit --only on recompile overrides the saved selection', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3), task(4), task(5)])
  const first = compileRun(repo, text, '--only', 'task-1,task-2')
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId } = first.json

  const second = compileRun(repo, text, '--run', runId, '--only', 'task-5')
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.deepEqual(Object.keys(second.json.tasks), ['task-5'])
  assert.equal(second.json.alreadyMerged, undefined)
})

test('recompile warns on stderr when offered tasks grow beyond previous launch, and stays silent otherwise', (t) => {
  const repo = makeRepo(t)
  const text = plan([task(1), task(2), task(3), task(4), task(5), task(6)])
  const first = compileRun(repo, text, '--only', 'task-1,task-2,task-3')
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const { runId } = first.json

  // Equal count (3 -> 3): no warning
  const equal = compileRun(repo, text, '--run', runId)
  assert.equal(equal.status, 0, equal.stdout + equal.stderr)
  assert.doesNotMatch(equal.stderr, /recompile offers \d+ tasks, the previous launch offered \d+/)

  // Smaller count (3 -> 2): no warning
  const smaller = compileRun(repo, text, '--run', runId, '--only', 'task-1,task-2')
  assert.equal(smaller.status, 0, smaller.stdout + smaller.stderr)
  assert.doesNotMatch(smaller.stderr, /recompile offers \d+ tasks, the previous launch offered \d+/)

  // Larger count (2 -> 6, or 3 -> 6): warning
  const first3 = compileRun(repo, text, '--only', 'task-1,task-2,task-3')
  assert.equal(first3.status, 0, first3.stdout + first3.stderr)
  const grown = compileRun(repo, text, '--run', first3.json.runId, '--only', 'task-1,task-2,task-3,task-4,task-5,task-6')
  assert.equal(grown.status, 0, grown.stdout + grown.stderr)
  assert.match(grown.stderr, /recompile offers 6 tasks, the previous launch offered 3/)
})
