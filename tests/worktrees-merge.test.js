'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { makeRepo, compile, commitIn, WT_BIN, NO_LANES_CONFIG, PLAN_BIN, runBin, writePlan } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, merge, unitStatus, mergedUnits, removeUnit, sweepRun } = require('../plugins/aether/lib/worktrees.js')

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

test('status reads the merge from git, and a second merge is the merge it already has (issue 002)', (t) => {
  const { repo, args, unit } = setup(t)
  assert.deepEqual(unitStatus(repo.dir, args.runId, 'task-1'), { merged: false, branch: unit.branch, commit: null, head: repo.git('rev-parse', unit.branch) })
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const before = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(before.merged, false)
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, true)
  const after = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(after.merged, true)
  assert.equal(after.commit, r.commit)
  assert.equal(after.commit, repo.git('rev-parse', 'HEAD'))
  const headBefore = repo.git('rev-parse', 'HEAD')
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), { merged: true, commit: r.commit, already: true })
  assert.equal(repo.git('rev-parse', 'HEAD'), headBefore, 'no second merge commit')
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

test('merge sees both sides of a rename, so a unit cannot move a file it does not own', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, repo.dir, 'src/t2/shared.js', 'shared\n', 'task 2 owns this')
  repo.git('-C', unit.path, 'merge', '-q', 'feature/x')
  fs.mkdirSync(path.join(unit.path, 'src', 't1'), { recursive: true })
  repo.git('-C', unit.path, 'mv', 'src/t2/shared.js', 'src/t1/shared.js')
  repo.git('-C', unit.path, 'commit', '-q', '-m', 'move it')
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), { merged: false, reason: 'ownership', files: ['src/t2/shared.js'] })
})

test('merge accepts owned files with non-ASCII names', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/café.md', 'hola\n', 'add café')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
})

test('merge refuses when the integration worktree is on another branch', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  repo.git('switch', '-q', 'main')
  const before = repo.git('rev-parse', 'main')
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), {
    merged: false,
    reason: 'wrong-branch',
    detail: 'the integration worktree is on main, not feature/x',
  })
  assert.equal(repo.git('rev-parse', 'main'), before)
})

test('merge reports uncommitted work when the unit committed nothing', (t) => {
  const { repo, args, unit } = setup(t)
  fs.mkdirSync(path.join(unit.path, 'src', 't1'), { recursive: true })
  fs.writeFileSync(path.join(unit.path, 'src', 't1', 'a.js'), 'one\n')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.reason, 'empty')
  assert.deepEqual(r.uncommitted, ['src/t1/a.js'])
})

test('merge says so when the integration worktree is gone', (t) => {
  const repo = makeRepo(t)
  const integration = path.join(repo.dir, '.worktrees', 'int')
  repo.git('worktree', 'add', '-q', '-b', 'feature/int', integration)
  fs.writeFileSync(path.join(integration, 'plan.md'), plan([task(1), task(2)]))
  const args = compile({ ...repo, dir: integration }, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  fs.rmSync(integration, { recursive: true, force: true })
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), {
    merged: false,
    reason: 'missing-integration',
    detail: `the integration worktree ${integration} is missing`,
  })
})

test('merge reports a failed merge that is not a conflict as merge-failed', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  // An untracked file in the integration worktree stands where the unit's file would go.
  fs.mkdirSync(path.join(repo.dir, 'src', 't1'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'local\n')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, false)
  assert.equal(r.reason, 'merge-failed')
  assert.match(r.detail, /would be overwritten/)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'local\n')
})

// A test command that reports each name as a failing TAP test, then exits 1.
function failingTests(...names) {
  return `printf '${names.map((name, i) => `not ok ${i + 1} - ${name}\\n`).join('')}'; exit 1`
}

function setTestCommand(runDir, command) {
  const file = path.join(runDir, 'graph.json')
  const graph = JSON.parse(fs.readFileSync(file, 'utf8'))
  graph.testCommand = command
  fs.writeFileSync(file, JSON.stringify(graph))
}

function writeBaseline(runDir, signatures) {
  const baseline = { recordedAt: new Date().toISOString(), exitCode: 1, signatures, timedOut: false }
  fs.writeFileSync(path.join(runDir, 'baseline.json'), JSON.stringify(baseline))
}

test('merge keeps a unit whose failing tests all already fail in the baseline, and names them', (t) => {
  const { repo, args, unit } = setup(t)
  setTestCommand(args.runDir, failingTests('known'))
  writeBaseline(args.runDir, ['known'])
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), {
    merged: true,
    commit: repo.git('rev-parse', 'HEAD'),
    knownFailures: ['known'],
  })
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'one\n')
})

test('merge undoes a unit that adds a failure the baseline does not list, and names it', (t) => {
  const { repo, args, unit } = setup(t)
  setTestCommand(args.runDir, failingTests('known', 'fresh'))
  writeBaseline(args.runDir, ['known'])
  const before = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, false)
  assert.equal(r.reason, 'tests')
  assert.equal(r.reverted, true)
  assert.deepEqual(r.newFailures, ['fresh'])
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(fs.existsSync(path.join(repo.dir, 'src', 't1', 'a.js')), false)
})

test('merge without a baseline undoes a failing unit, as before', (t) => {
  const { repo, args, unit } = setup(t)
  setTestCommand(args.runDir, failingTests('known'))
  fs.rmSync(path.join(args.runDir, 'baseline.json'), { force: true })
  const before = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const { output, ...r } = merge(repo.dir, args.runId, 'task-1')
  assert.match(output, /not ok 1 - known/)
  assert.deepEqual(r, { merged: false, reason: 'tests', exitCode: 1, timedOut: false, reverted: true })
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
})

test('merge undoes a unit whose failure names no test, even with a baseline', (t) => {
  const { repo, args, unit } = setup(t)
  setTestCommand(args.runDir, 'echo boom; exit 3')
  writeBaseline(args.runDir, ['known'])
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, false)
  assert.equal(r.reason, 'tests')
  assert.equal(r.reverted, true)
  assert.equal(r.newFailures, undefined)
})

// A merge killed while the plan's tests are running: the test command touches `signal` and then
// sleeps, so the kill lands after the merge commit and inside the tests (issue #2).
function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function killMerge(child) {
  if (!child || !child.pid) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      // Already gone.
    }
  }
}

async function cutDuringTests(t, repo, args) {
  const signal = path.join(args.runDir, 'test-running')
  fs.rmSync(signal, { force: true })
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; exec sleep 30`)
  const child = spawn(process.execPath, [WT_BIN, 'merge', args.runId, 'task-1'], {
    cwd: repo.dir,
    env: { ...process.env, AETHER_LANES_CONFIG: NO_LANES_CONFIG },
    detached: true,
    stdio: 'ignore',
  })
  t.after(() => killMerge(child))
  const deadline = Date.now() + 15000
  while (!fs.existsSync(signal) && Date.now() < deadline) await pause(20)
  assert.ok(fs.existsSync(signal), 'the merge did not reach its tests')
  killMerge(child)
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const code = await Promise.race([exited, pause(5000).then(() => 'still-running')])
  assert.notEqual(code, 'still-running', 'the cut merge did not die')
}

test('a merge killed while its tests run is unverified, not merged (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const before = repo.git('rev-parse', 'HEAD')
  await cutDuringTests(t, repo, args)
  const status = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(status.merged, false)
  assert.equal(status.unverified, true)
  assert.equal(status.branch, unit.branch)
  assert.equal(status.commit, repo.git('rev-parse', 'HEAD'))
  assert.notEqual(status.commit, before)
  assert.equal(repo.git('log', '-1', '--format=%s'), `Merge ${unit.branch}`)
  assert.deepEqual(mergedUnits(repo.dir, args.runId), [])
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'one\n')
})

test('rerunning the merge of an unverified unit with passing tests merges it once (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const commit = repo.git('rev-parse', 'HEAD')
  const merges = repo.git('rev-list', '--count', '--merges', 'HEAD')
  setTestCommand(args.runDir, 'true')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.deepEqual(r, { merged: true, commit, rerun: true })
  assert.equal(repo.git('rev-parse', 'HEAD'), commit, 'no second merge commit')
  assert.equal(repo.git('rev-list', '--count', '--merges', 'HEAD'), merges)
  assert.equal(repo.git('log', '-1', '--format=%s'), `Merge ${unit.branch}`)
  const after = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(after.merged, true)
  assert.equal(after.unverified, undefined)
  assert.equal(after.commit, commit)
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), { merged: true, commit, already: true })
  assert.deepEqual(mergedUnits(repo.dir, args.runId), ['task-1'])
})

test('rerunning the merge of an unverified unit with failing tests reverts it (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const parent = repo.git('rev-parse', 'HEAD')
  await cutDuringTests(t, repo, args)
  setTestCommand(args.runDir, 'echo boom; exit 3')
  const { output, ...r } = merge(repo.dir, args.runId, 'task-1')
  assert.match(output, /boom/)
  assert.deepEqual(r, { merged: false, reason: 'tests', exitCode: 3, timedOut: false, reverted: true })
  assert.equal(repo.git('rev-parse', 'HEAD'), parent)
  assert.equal(fs.existsSync(path.join(repo.dir, 'src', 't1', 'a.js')), false)
  const status = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(status.merged, false)
  assert.equal(status.unverified, undefined)
  assert.equal(status.commit, null)
  // The marker is gone, so a later merge is a new one, the same as any unit whose tests failed.
  setTestCommand(args.runDir, 'true')
  const again = merge(repo.dir, args.runId, 'task-1')
  assert.equal(again.merged, true)
  assert.equal(again.rerun, undefined)
  assert.equal(repo.git('rev-list', '--count', '--merges', 'HEAD'), '1')
})

test('a rerun of a cut unit reverts that unit and leaves an earlier merge in place (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  const earlier = ensure(repo.dir, args.runId, 'task-2')
  commitIn(repo, earlier.path, 'src/t2/a.js', 'two\n', 'add b')
  assert.equal(merge(repo.dir, args.runId, 'task-2').merged, true)
  const kept = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const status = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(status.unverified, true)
  assert.equal(status.commit, repo.git('rev-parse', 'HEAD'))
  assert.notEqual(status.commit, kept)
  setTestCommand(args.runDir, 'echo boom; exit 3')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.reason, 'tests')
  assert.equal(r.reverted, true)
  assert.equal(repo.git('rev-parse', 'HEAD'), kept)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't2', 'a.js'), 'utf8'), 'two\n')
  assert.equal(fs.existsSync(path.join(repo.dir, 'src', 't1', 'a.js')), false)
  assert.equal(unitStatus(repo.dir, args.runId, 'task-2').merged, true)
  assert.deepEqual(mergedUnits(repo.dir, args.runId), ['task-2'])
})

test('a rerun cut while its tests run leaves the one merge commit unverified (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const commit = repo.git('rev-parse', 'HEAD')
  const merges = repo.git('rev-list', '--count', '--merges', 'HEAD')
  await cutDuringTests(t, repo, args)
  assert.equal(repo.git('rev-parse', 'HEAD'), commit, 'the rerun made no second merge commit')
  assert.equal(repo.git('rev-list', '--count', '--merges', 'HEAD'), merges)
  const status = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(status.merged, false)
  assert.equal(status.unverified, true)
  assert.equal(status.commit, commit)
})

function markerFile(runDir, taskId) {
  return path.join(runDir, 'unverified', `${taskId}.json`)
}

function readMarker(runDir, taskId) {
  return JSON.parse(fs.readFileSync(markerFile(runDir, taskId), 'utf8'))
}

// A kill in the post-merge hook: the merge commit is already on the branch, and the marker
// has not been filled in yet. The hook waits so the test can stop the process there.
async function cutDuringMerge(t, repo, args) {
  const signal = path.join(args.runDir, 'merge-committed')
  const testsRan = path.join(args.runDir, 'tests-ran')
  fs.rmSync(signal, { force: true })
  fs.rmSync(testsRan, { force: true })
  const hooks = path.join(repo.dir, '.git', 'hooks')
  fs.mkdirSync(hooks, { recursive: true })
  repo.git('config', 'core.hooksPath', hooks)
  const hook = path.join(hooks, 'post-merge')
  fs.writeFileSync(hook, `#!/bin/sh\ntouch ${shQuote(signal)}\nsleep 30\n`)
  fs.chmodSync(hook, 0o755)
  setTestCommand(args.runDir, `touch ${shQuote(testsRan)}`)
  const child = spawn(process.execPath, [WT_BIN, 'merge', args.runId, 'task-1'], {
    cwd: repo.dir,
    env: { ...process.env, AETHER_LANES_CONFIG: NO_LANES_CONFIG },
    detached: true,
    stdio: 'ignore',
  })
  t.after(() => {
    killMerge(child)
    fs.rmSync(hook, { force: true })
  })
  const deadline = Date.now() + 15000
  while (!fs.existsSync(signal) && Date.now() < deadline) await pause(20)
  assert.ok(fs.existsSync(signal), 'the merge did not reach its post-merge hook')
  killMerge(child)
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const code = await Promise.race([exited, pause(5000).then(() => 'still-running')])
  assert.notEqual(code, 'still-running', 'the cut merge did not die')
  fs.rmSync(hook, { force: true })
  return { testsRan }
}

test('a merge killed while its tests run stays unverified when the unit tip moved and when the branch is gone (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/b.js', 'more\n', 'more after the merge')
  const moved = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(moved.merged, false)
  assert.equal(moved.unverified, true)
  assert.equal(moved.commit, mergeCommit)
  assert.equal(moved.branch, unit.branch)
  assert.equal(moved.head, repo.git('rev-parse', unit.branch))
  assert.notEqual(moved.head, mergeCommit)
  assert.throws(() => repo.git('merge-base', '--is-ancestor', unit.branch, 'HEAD'))
  assert.deepEqual(mergedUnits(repo.dir, args.runId), [])
  repo.git('worktree', 'remove', '--force', unit.path)
  repo.git('branch', '-D', unit.branch)
  const gone = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(gone.merged, false)
  assert.equal(gone.unverified, true)
  assert.equal(gone.commit, mergeCommit)
  assert.equal(gone.branch, null)
  assert.equal(gone.head, null)
  assert.deepEqual(mergedUnits(repo.dir, args.runId), [])
})

test('a kill between git merge and the marker fill still leaves a marker (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const { testsRan } = await cutDuringMerge(t, repo, args)
  assert.equal(fs.existsSync(testsRan), false, 'the tests must not have started')
  assert.equal(repo.git('log', '-1', '--format=%s'), `Merge ${unit.branch}`)
  const marker = readMarker(args.runDir, 'task-1')
  assert.equal(marker.commit ?? null, null)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  const status = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(status.merged, false)
  assert.equal(status.unverified, true)
  assert.equal(status.commit, mergeCommit)
  assert.deepEqual(mergedUnits(repo.dir, args.runId), [])
  const text = plan([task(1), task(2)])
  const again = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', args.runId], repo.dir)
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.equal(again.json.alreadyMerged, undefined)
  assert.doesNotMatch(again.stderr, /already merged/)
  const merges = repo.git('rev-list', '--count', '--merges', 'HEAD')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.deepEqual(r, { merged: true, commit: mergeCommit, rerun: true })
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit, 'no second merge commit')
  assert.equal(repo.git('rev-list', '--count', '--merges', 'HEAD'), merges)
  assert.equal(unitStatus(repo.dir, args.runId, 'task-1').unverified, undefined)
})

test('a buried unverified commit is refused and nothing is reset (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  commitIn(repo, repo.dir, 'src/t2/note.js', 'note\n', 'land on top of the unverified merge')
  const buried = repo.git('rev-parse', 'HEAD')
  const signal = path.join(args.runDir, 'tests-ran')
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.deepEqual(r, { merged: false, reason: 'unverified-buried', commit: mergeCommit })
  assert.equal(repo.git('rev-parse', 'HEAD'), buried)
  assert.equal(fs.existsSync(signal), false, 'a buried marker runs no tests')
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'one\n')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't2', 'note.js'), 'utf8'), 'note\n')
})

test("another unit's merge is refused with unverified-other and runs no tests (issue #2)", async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  const signal = path.join(args.runDir, 'tests-ran')
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)
  const other = ensure(repo.dir, args.runId, 'task-2')
  commitIn(repo, other.path, 'src/t2/a.js', 'two\n', 'add b')
  const r = merge(repo.dir, args.runId, 'task-2')
  assert.deepEqual(r, { merged: false, reason: 'unverified-other', task: 'task-1', commit: mergeCommit })
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit)
  assert.equal(fs.existsSync(signal), false, 'a merge on top of an unverified commit runs no tests')
  assert.equal(fs.existsSync(path.join(repo.dir, 'src', 't2', 'a.js')), false)
  assert.equal(unitStatus(repo.dir, args.runId, 'task-1').unverified, true)
})

test('a merge that fails before its tests leaves no marker (issue #2)', (t) => {
  const conflicted = setup(t)
  commitIn(conflicted.repo, conflicted.repo.dir, 'src/t1/a.js', 'integration\n', 'integration side')
  commitIn(conflicted.repo, conflicted.unit.path, 'src/t1/a.js', 'unit\n', 'unit side')
  const conflict = merge(conflicted.repo.dir, conflicted.args.runId, 'task-1')
  assert.equal(conflict.reason, 'conflict')
  assert.equal(fs.existsSync(markerFile(conflicted.args.runDir, 'task-1')), false)

  const owned = setup(t)
  commitIn(owned.repo, owned.unit.path, 'README.md', 'changed\n', 'touch readme')
  const ownership = merge(owned.repo.dir, owned.args.runId, 'task-1')
  assert.equal(ownership.reason, 'ownership')
  assert.equal(fs.existsSync(markerFile(owned.args.runDir, 'task-1')), false)

  const blocked = setup(t)
  commitIn(blocked.repo, blocked.unit.path, 'src/t1/a.js', 'one\n', 'add a')
  fs.mkdirSync(path.join(blocked.repo.dir, 'src', 't1'), { recursive: true })
  fs.writeFileSync(path.join(blocked.repo.dir, 'src', 't1', 'a.js'), 'local\n')
  const failed = merge(blocked.repo.dir, blocked.args.runId, 'task-1')
  assert.equal(failed.reason, 'merge-failed')
  assert.equal(fs.existsSync(markerFile(blocked.args.runDir, 'task-1')), false)
})

test('a rerun cut twice leaves the marker, remove keeps the branch and patch, and another merge is refused (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  await cutDuringTests(t, repo, args)
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit)
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(unitStatus(repo.dir, args.runId, 'task-1').unverified, true)
  const signal = path.join(args.runDir, 'tests-ran')
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)
  const other = ensure(repo.dir, args.runId, 'task-2')
  commitIn(repo, other.path, 'src/t2/a.js', 'two\n', 'add b')
  const refused = merge(repo.dir, args.runId, 'task-2')
  assert.deepEqual(refused, { merged: false, reason: 'unverified-other', task: 'task-1', commit: mergeCommit })
  assert.equal(fs.existsSync(signal), false)
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit)
  const removed = removeUnit(repo.dir, args.runId, 'task-1')
  assert.equal(removed.patch, path.join(args.runDir, 'patches', 'task-1.patch'))
  assert.match(fs.readFileSync(removed.patch, 'utf8'), /\+one/)
  assert.equal(fs.existsSync(unit.path), false)
  assert.match(repo.git('branch', '--list', unit.branch), new RegExp(unit.branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(fs.existsSync(markerFile(args.runDir, 'task-1')), true)
})

test('sweep keeps the branch and patch of an unverified unit (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const r = sweepRun(repo.dir, args.runId)
  const patch = path.join(args.runDir, 'patches', 'task-1.patch')
  assert.deepEqual(r.patches, [patch])
  assert.match(fs.readFileSync(patch, 'utf8'), /\+one/)
  assert.deepEqual(r.remaining.branches, [unit.branch])
  assert.deepEqual(r.remaining.worktrees, [])
  assert.equal(fs.existsSync(markerFile(args.runDir, 'task-1')), true)
  assert.equal(repo.git('rev-parse', 'HEAD'), readMarker(args.runDir, 'task-1').commit)
})

test('merge does not judge a test run that timed out, even when its output names only known failures', (t) => {
  const { repo, args, unit } = setup(t)
  // `exec` makes sleep the process that the timeout stops.
  setTestCommand(args.runDir, "printf 'not ok 1 - known\\n'; exec sleep 30")
  writeBaseline(args.runDir, ['known'])
  const before = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = merge(repo.dir, args.runId, 'task-1', { timeoutMs: 500 })
  assert.match(r.output, /not ok 1 - known/)
  assert.equal(r.merged, false)
  assert.equal(r.timedOut, true)
  assert.equal(r.newFailures, undefined)
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
})
