'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { makeRepo, compile, commitIn, WT_BIN, NO_LANES_CONFIG, PLAN_BIN, runBin, writePlan, useDataDir, ageRun } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, merge, settleUnit, unitStatus, mergedUnits, removeUnit, sweepRun, sweepStale, writeUnverifiedMarker, abortUnfinishedMerge } = require('../plugins/aether/lib/worktrees.js')
const { finalize } = require('../plugins/aether/lib/report.js')
const run = require('../plugins/aether/lib/run.js')
const common = require('../plugins/aether/lib/common.js')

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

function deliverWidened(t, repo, args, unit, widen) {
  const stuck = require('../plugins/aether/lib/wt-stuck.js')
  const { digest } = require('../plugins/aether/lib/lanes.js')
  const payload = run.stuckPayloadFile(repo.dir, args.runId, 'task-1')
  const text = JSON.stringify({ reason: 'the ladder is spent (exhausted)' })
  fs.mkdirSync(path.dirname(payload), { recursive: true })
  fs.writeFileSync(payload, text)
  stuck.stuckBegin(repo.dir, args.runId, 'task-1', { payload, digest: digest(text) })
  stuck.deliverFix(repo.dir, args.runId, 'task-1', { commit: repo.git('-C', unit.path, 'rev-parse', 'HEAD'), reason: 'the test lives outside Owns', ...(widen === undefined ? {} : { widen }) })
}

test('merge takes the widened file of a delivered fix (issue #258)', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  commitIn(repo, unit.path, 'docs/extra.md', 'extra\n', 'the fix outside Owns')
  deliverWidened(t, repo, args, unit, 'docs/extra.md')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, true)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'docs', 'extra.md'), 'utf8'), 'extra\n')
})

test('merge still refuses another outside file the widen list does not name (issue #258)', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'docs/extra.md', 'extra\n', 'the widened fix')
  commitIn(repo, unit.path, 'README.md', 'changed\n', 'another file outside Owns')
  deliverWidened(t, repo, args, unit, 'docs/extra.md')
  const before = repo.git('rev-parse', 'HEAD')
  assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), { merged: false, reason: 'ownership', files: ['README.md'] })
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
})

test('merge refuses the widened file once the wait ended, and without a widen list (issue #258)', (t) => {
  const stuck = require('../plugins/aether/lib/wt-stuck.js')
  for (const close of ['ended', 'plain']) {
    const { repo, args, unit } = setup(t)
    commitIn(repo, unit.path, 'docs/extra.md', 'extra\n', 'the fix outside Owns')
    deliverWidened(t, repo, args, unit, 'docs/extra.md')
    if (close === 'ended') stuck.stuckEnd(repo.dir, args.runId, 'task-1', 'merged')
    else {
      const file = run.stuckFile(repo.dir, args.runId, 'task-1')
      const record = JSON.parse(fs.readFileSync(file, 'utf8'))
      delete record.delivered.widen
      fs.writeFileSync(file, JSON.stringify(record))
    }
    const before = repo.git('rev-parse', 'HEAD')
    assert.deepEqual(merge(repo.dir, args.runId, 'task-1'), { merged: false, reason: 'ownership', files: ['docs/extra.md'] }, close)
    assert.equal(repo.git('rev-parse', 'HEAD'), before)
  }
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

// A kill inside git merge, before it commits. commit-msg runs once MERGE_HEAD is written and
// before the merge commit exists, so a kill there leaves the worktree mid-merge (issue #2).
// pre-merge-commit is too early: on current git it runs before MERGE_HEAD is written.
async function cutBeforeCommit(t, repo, args) {
  const signal = path.join(args.runDir, 'merge-prepared')
  const testsRan = path.join(args.runDir, 'tests-ran')
  fs.rmSync(signal, { force: true })
  fs.rmSync(testsRan, { force: true })
  const hooks = path.join(repo.dir, '.git', 'hooks')
  fs.mkdirSync(hooks, { recursive: true })
  repo.git('config', 'core.hooksPath', hooks)
  const hook = path.join(hooks, 'commit-msg')
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
  assert.ok(fs.existsSync(signal), 'the merge did not reach its commit-msg hook')
  killMerge(child)
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const code = await Promise.race([exited, pause(5000).then(() => 'still-running')])
  assert.notEqual(code, 'still-running', 'the cut merge did not die')
  fs.rmSync(hook, { force: true })
  return { testsRan }
}

function mergeHeadPath(repo) {
  return path.resolve(repo.dir, repo.git('rev-parse', '--git-path', 'MERGE_HEAD'))
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

test('a rerun refuses when the unit branch has commits the unverified merge does not (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  const mergedTip = repo.git('rev-parse', unit.branch)
  commitIn(repo, unit.path, 'src/t1/b.js', 'more\n', 'commit Y after the cut')
  const moved = repo.git('rev-parse', unit.branch)
  const signal = path.join(args.runDir, 'tests-ran')
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.deepEqual(r, { merged: false, reason: 'unverified-moved', commit: mergeCommit })
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit, 'a moved branch resets nothing')
  assert.equal(repo.git('rev-parse', unit.branch), moved)
  assert.equal(fs.existsSync(signal), false, 'a moved branch runs no tests')
  const status = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(status.merged, false)
  assert.equal(status.unverified, true)
  assert.equal(status.commit, mergeCommit)
  assert.deepEqual(mergedUnits(repo.dir, args.runId), [])
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  // The branch tip is the commit the merge already took. The rerun is the one it was.
  repo.git('-C', unit.path, 'reset', '--hard', mergedTip)
  const passed = path.join(args.runDir, 'rerun-passed')
  setTestCommand(args.runDir, `touch ${shQuote(passed)}; true`)
  const again = merge(repo.dir, args.runId, 'task-1')
  assert.deepEqual(again, { merged: true, commit: mergeCommit, rerun: true })
  assert.equal(fs.existsSync(passed), true)
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit, 'no second merge commit')
  assert.equal(unitStatus(repo.dir, args.runId, 'task-1').unverified, undefined)
  assert.deepEqual(mergedUnits(repo.dir, args.runId), ['task-1'])
})

test("a marker of a task left out of the graph still refuses another unit's merge (issue #2)", async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  const narrowed = compile(repo, plan([task(1), task(2)]), ['--run', args.runId, '--only', 'task-2'])
  assert.equal(narrowed.tasks['task-1'], undefined)
  assert.ok(narrowed.tasks['task-2'])
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  const signal = path.join(args.runDir, 'tests-ran')
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)
  const other = ensure(repo.dir, args.runId, 'task-2')
  commitIn(repo, other.path, 'src/t2/a.js', 'two\n', 'add b')
  const r = merge(repo.dir, args.runId, 'task-2')
  assert.deepEqual(r, { merged: false, reason: 'unverified-other', task: 'task-1', commit: mergeCommit })
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit)
  assert.equal(fs.existsSync(signal), false, 'a merge on top of an unverified commit runs no tests')
  assert.equal(fs.existsSync(path.join(repo.dir, 'src', 't2', 'a.js')), false)
})

test('a marker with no commit does not take an older verified merge of the same unit (issue #2)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  const verified = repo.git('rev-parse', 'HEAD')
  const parent = repo.git('rev-parse', 'HEAD^1')
  const mergedTip = repo.git('rev-parse', unit.branch)
  commitIn(repo, unit.path, 'src/t1/b.js', 'more\n', 'a second merge, killed before it commits')
  const { testsRan } = await cutBeforeCommit(t, repo, args)
  assert.equal(fs.existsSync(testsRan), false, 'the tests must not have started')
  assert.equal(repo.git('rev-parse', 'HEAD'), verified, 'a kill before the commit does not move the branch')
  const marker = readMarker(args.runDir, 'task-1')
  assert.equal(marker.commit ?? null, null)
  assert.equal(marker.before, verified)
  assert.notEqual(repo.git('rev-parse', `${verified}^1`), marker.before)
  // merge --abort drops MERGE_HEAD and leaves the marker, so the next merge is the fallback and not the abort.
  repo.git('merge', '--abort')
  assert.equal(fs.existsSync(mergeHeadPath(repo)), false)
  repo.git('-C', unit.path, 'reset', '--hard', mergedTip)
  const status = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(status.unverified, undefined)
  assert.equal(status.merged, true)
  assert.equal(status.commit, verified)
  setTestCommand(args.runDir, 'echo boom; exit 3')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, true)
  assert.equal(r.already, true)
  assert.equal(repo.git('rev-parse', 'HEAD'), verified)
  assert.notEqual(repo.git('rev-parse', 'HEAD'), parent)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'one\n')
  assert.equal(fs.existsSync(path.join(repo.dir, 'src', 't1', 'b.js')), false)
})

test("the next merge aborts a leftover MERGE_HEAD when this unit's marker has no commit (issue #2)", async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const before = repo.git('rev-parse', 'HEAD')
  const { testsRan } = await cutBeforeCommit(t, repo, args)
  assert.equal(fs.existsSync(testsRan), false)
  assert.equal(fs.existsSync(mergeHeadPath(repo)), true)
  assert.equal(readMarker(args.runDir, 'task-1').commit ?? null, null)
  setTestCommand(args.runDir, 'true')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, true)
  assert.equal(r.rerun, undefined)
  assert.equal(fs.existsSync(mergeHeadPath(repo)), false)
  assert.equal(fs.existsSync(markerFile(args.runDir, 'task-1')), false)
  assert.notEqual(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(repo.git('log', '-1', '--format=%s'), `Merge ${unit.branch}`)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'one\n')
})

test('finalize and sweepStale keep a run directory whose unverified commit is on the integration branch (issue #2)', async (t) => {
  useDataDir(t)
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  repo.git('worktree', 'remove', '--force', unit.path)
  repo.git('branch', '-D', unit.branch)
  const finished = sweepRun(repo.dir, args.runId, { finish: true })
  assert.equal(finished.finished, false)
  assert.equal(fs.existsSync(args.runDir), true)
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  ageRun(args, 48)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [] })
  assert.equal(fs.existsSync(markerFile(args.runDir, 'task-1')), true)
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit)
  assert.equal(finished.unverified, true)
  const out = finalize(repo.dir, args.runId, { tests: false })
  assert.equal(out.cleanup.finished, false)
  assert.equal(out.cleanup.unverified, true)
  assert.equal(fs.existsSync(args.runDir), true)
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(repo.git('merge-base', '--is-ancestor', mergeCommit, 'HEAD'), '')
  // sweepStale on a finalized run with a live marker appends no abandoned record twice
  const countBefore = fs
    .readFileSync(path.join(run.dataDir(), 'runs.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((r) => r.runId === args.runId && r.status === 'abandoned').length
  ageRun(args, 48)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [] })
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [] })
  const records = fs
    .readFileSync(path.join(run.dataDir(), 'runs.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((r) => r.runId === args.runId)
  assert.equal(records.filter((r) => r.status === 'abandoned').length, countBefore, 'sweepStale on a finalized run must append no abandoned record')
  assert.equal(records[records.length - 1].status, 'finalized')
})

test('merge stops the whole process group of a test run that timed out (R9)', (t) => {
  const { repo, args, unit } = setup(t)
  const pidFile = path.join(args.runDir, 'child.pid')
  setTestCommand(args.runDir, `sleep 60 & echo $! > '${pidFile}'; wait`)
  writeBaseline(args.runDir, [])
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const started = Date.now()
  const r = merge(repo.dir, args.runId, 'task-1', { timeoutMs: 500 })
  assert.equal(r.merged, false)
  assert.equal(r.timedOut, true)
  assert.ok(Date.now() - started < 10000)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      common.sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false)
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

test('a marker whose content is empty, truncated or {} is read as unverified with unknown commit (issue #2)', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, true)
  assert.deepEqual(mergedUnits(repo.dir, args.runId), ['task-1'])
  assert.equal(unitStatus(repo.dir, args.runId, 'task-1').merged, true)

  const file = markerFile(args.runDir, 'task-1')
  fs.mkdirSync(path.dirname(file), { recursive: true })

  for (const content of ['', '{"commit":', '{}']) {
    fs.writeFileSync(file, content)
    const status = unitStatus(repo.dir, args.runId, 'task-1')
    assert.equal(status.merged, false, `content: ${JSON.stringify(content)}`)
    assert.equal(status.unverified, true, `content: ${JSON.stringify(content)}`)
    assert.equal(status.commit, null, `content: ${JSON.stringify(content)}`)
    assert.deepEqual(mergedUnits(repo.dir, args.runId), [], `content: ${JSON.stringify(content)}`)
  }
})

test('the marker writes go through a temporary file and a rename (issue #2)', (t) => {
  const { repo, args, unit } = setup(t)
  const file = markerFile(args.runDir, 'task-1')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify({ commit: 'old-commit' })}\n`)

  const originalRenameSync = fs.renameSync
  t.after(() => {
    fs.renameSync = originalRenameSync
  })
  fs.renameSync = (src, dest) => {
    if (dest === file) throw new Error('simulated rename failure')
    return originalRenameSync(src, dest)
  }

  assert.throws(
    () => {
      writeUnverifiedMarker(repo.dir, args.runId, 'task-1', 'new-commit')
    },
    /simulated rename failure/,
  )

  assert.equal(fs.readFileSync(file, 'utf8'), `${JSON.stringify({ commit: 'old-commit' })}\n`)
})

test('abortUnfinishedMerge leaves a MERGE_HEAD of another branch alone (issue #2)', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')

  const integrationBranch = args.integration.branch
  repo.git('checkout', integrationBranch)
  repo.git('branch', 'other-branch')
  commitIn(repo, repo.dir, 'src/main.js', 'main\n', 'integration commit')
  repo.git('checkout', 'other-branch')
  commitIn(repo, repo.dir, 'src/other.js', 'other\n', 'other commit')
  repo.git('checkout', integrationBranch)
  repo.git('merge', '--no-commit', '--no-ff', 'other-branch')

  const mergeHead = mergeHeadPath(repo)
  assert.equal(fs.existsSync(mergeHead), true, 'MERGE_HEAD must exist')

  // Set up an unverified marker for task-1 with no commit
  const file = markerFile(args.runDir, 'task-1')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify({ commit: null, before: repo.git('rev-parse', 'HEAD') })}\n`)

  // Run merge for task-1: it must leave MERGE_HEAD of other-branch alone and refuse dirty-integration
  const r = merge(repo.dir, args.runId, 'task-1')
  assert.equal(r.merged, false)
  assert.equal(r.reason, 'dirty-integration')
  assert.equal(fs.existsSync(mergeHead), true, 'MERGE_HEAD of other-branch must not be aborted')
})

function integrationWorktree(repo, args) {
  return run.readJson(path.join(run.runDir(repo.dir, args.runId), 'graph.json')).integration.worktree
}

function mergeLockPath(args) {
  return path.join(args.runDir, 'merging')
}

// A merge cut during its tests, then one commit on the integration branch: the marker's commit is buried.
async function buriedUnverified(t, repo, args, unit) {
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  const worktree = integrationWorktree(repo, args)
  commitIn(repo, worktree, 'src/t2/note.js', 'note\n', 'land on top of the unverified merge')
  return { mergeCommit, tip: repo.git('rev-parse', 'HEAD'), worktree }
}

test('settle clears a buried unverified commit when the tests pass (issue #78)', async (t) => {
  const { repo, args, unit } = setup(t)
  const { mergeCommit, tip } = await buriedUnverified(t, repo, args, unit)
  setTestCommand(args.runDir, 'true')
  assert.deepEqual(settleUnit(repo.dir, args.runId, 'task-1'), { settled: true, task: 'task-1', commit: mergeCommit, tip })
  assert.equal(fs.existsSync(markerFile(args.runDir, 'task-1')), false)
  assert.equal(unitStatus(repo.dir, args.runId, 'task-1').merged, true)
  assert.equal(repo.git('rev-parse', 'HEAD'), tip)
})

test('settle keeps a buried marker and the tip when the tests fail (issue #78)', async (t) => {
  const { repo, args, unit } = setup(t)
  const { mergeCommit, tip } = await buriedUnverified(t, repo, args, unit)
  setTestCommand(args.runDir, 'echo boom; exit 3')
  const { output, ...r } = settleUnit(repo.dir, args.runId, 'task-1')
  assert.match(output, /boom/)
  assert.deepEqual(r, { settled: false, reason: 'tests', exitCode: 3, timedOut: false })
  assert.equal(repo.git('rev-parse', 'HEAD'), tip)
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'one\n')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't2', 'note.js'), 'utf8'), 'note\n')
})

test('settle clears an unverified-moved marker and does not count the new unit commit as merged (issue #78)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  commitIn(repo, unit.path, 'src/t1/b.js', 'more\n', 'commit after the cut')
  const moved = merge(repo.dir, args.runId, 'task-1')
  assert.deepEqual(moved, { merged: false, reason: 'unverified-moved', commit: mergeCommit })
  setTestCommand(args.runDir, 'true')
  assert.deepEqual(settleUnit(repo.dir, args.runId, 'task-1'), {
    settled: true,
    task: 'task-1',
    commit: mergeCommit,
    tip: mergeCommit,
  })
  assert.equal(fs.existsSync(markerFile(args.runDir, 'task-1')), false)
  const status = unitStatus(repo.dir, args.runId, 'task-1')
  assert.equal(status.merged, false)
  assert.equal(status.unverified, undefined)
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit)
  assert.notEqual(repo.git('rev-parse', unit.branch), mergeCommit)
})

test('settle runs the tests for a marker that names only before when the merge commit is on the branch (issue #78)', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  const before = repo.git('rev-parse', 'HEAD^1')
  writeUnverifiedMarker(repo.dir, args.runId, 'task-1', null, before)
  const signal = path.join(args.runDir, 'settle-ran')
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)
  assert.deepEqual(settleUnit(repo.dir, args.runId, 'task-1'), { settled: true, task: 'task-1', commit: null, tip: mergeCommit })
  assert.equal(fs.existsSync(signal), true)
  assert.equal(fs.existsSync(markerFile(args.runDir, 'task-1')), false)
})

test('settle runs the tests for a marker with neither commit nor before, and clears it only on a pass (issue #78)', (t) => {
  for (const content of ['{}\n', '{\n']) {
    const { repo, args } = setup(t)
    const file = markerFile(args.runDir, 'task-1')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
    const tip = repo.git('rev-parse', 'HEAD')
    const signal = path.join(args.runDir, 'settle-ran')
    setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)
    assert.deepEqual(settleUnit(repo.dir, args.runId, 'task-1'), { settled: true, task: 'task-1', commit: null, tip }, content)
    assert.equal(fs.existsSync(signal), true, content)
    assert.equal(fs.existsSync(file), false, content)
  }
  const { repo, args } = setup(t)
  const file = markerFile(args.runDir, 'task-1')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{\n')
  const tip = repo.git('rev-parse', 'HEAD')
  setTestCommand(args.runDir, 'echo boom; exit 3')
  const failed = settleUnit(repo.dir, args.runId, 'task-1')
  assert.equal(failed.settled, false)
  assert.equal(failed.reason, 'tests')
  assert.equal(fs.readFileSync(file, 'utf8'), '{\n')
  assert.equal(repo.git('rev-parse', 'HEAD'), tip)
})

test('settle refuses a marker that is not live and clears nothing (issue #78)', async (t) => {
  const reset = setup(t)
  commitIn(reset.repo, reset.unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, reset.repo, reset.args)
  const mergeCommit = reset.repo.git('rev-parse', 'HEAD')
  const parent = reset.repo.git('rev-parse', 'HEAD^1')
  reset.repo.git('reset', '--hard', parent)
  const resetAway = settleUnit(reset.repo.dir, reset.args.runId, 'task-1')
  assert.equal(resetAway.settled, false)
  assert.equal(resetAway.reason, 'not-live')
  assert.equal(typeof resetAway.detail, 'string')
  assert.equal(readMarker(reset.args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(reset.repo.git('rev-parse', 'HEAD'), parent)

  const { repo, args } = setup(t)
  const before = repo.git('rev-parse', 'HEAD')
  writeUnverifiedMarker(repo.dir, args.runId, 'task-1', null, before)
  const absent = settleUnit(repo.dir, args.runId, 'task-1')
  assert.equal(absent.settled, false)
  assert.equal(absent.reason, 'not-live')
  assert.equal(readMarker(args.runDir, 'task-1').before, before)
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
})

test('settle refuses before it judges the marker, and changes nothing (issue #78)', async (t) => {
  const none = setup(t)
  const noneHead = none.repo.git('rev-parse', 'HEAD')
  setTestCommand(none.args.runDir, `touch ${shQuote(path.join(none.args.runDir, 'ran'))}; true`)
  assert.deepEqual(settleUnit(none.repo.dir, none.args.runId, 'task-1'), { settled: false, reason: 'no-marker' })
  assert.equal(fs.existsSync(path.join(none.args.runDir, 'ran')), false)
  assert.equal(none.repo.git('rev-parse', 'HEAD'), noneHead)

  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  const signal = path.join(args.runDir, 'ran')
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)

  fs.writeFileSync(path.join(repo.dir, 'README.md'), 'uncommitted\n')
  const dirty = settleUnit(repo.dir, args.runId, 'task-1')
  assert.equal(dirty.settled, false)
  assert.equal(dirty.reason, 'dirty-integration')
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(fs.existsSync(signal), false)
  fs.writeFileSync(path.join(repo.dir, 'README.md'), 'fixture\n')

  const mergeHead = mergeHeadPath(repo)
  fs.writeFileSync(mergeHead, `${mergeCommit}\n`)
  const mid = settleUnit(repo.dir, args.runId, 'task-1')
  assert.equal(mid.settled, false)
  assert.equal(mid.reason, 'merge-in-progress')
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(fs.existsSync(signal), false)
  fs.rmSync(mergeHead, { force: true })

  const indexLock = path.resolve(repo.dir, repo.git('rev-parse', '--git-path', 'index.lock'))
  fs.writeFileSync(indexLock, '')
  const locked = settleUnit(repo.dir, args.runId, 'task-1')
  assert.equal(locked.settled, false)
  assert.equal(locked.reason, 'index-locked')
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit)
  assert.equal(fs.existsSync(signal), false)
  fs.rmSync(indexLock, { force: true })

  repo.git('switch', '-q', 'main')
  const other = settleUnit(repo.dir, args.runId, 'task-1')
  assert.equal(other.settled, false)
  assert.equal(other.reason, 'wrong-branch')
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(repo.git('rev-parse', '--abbrev-ref', 'HEAD'), 'main')
  repo.git('switch', '-q', 'feature/x')

  const graphFile = path.join(args.runDir, 'graph.json')
  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'))
  graph.integration.worktree = path.join(repo.dir, 'missing-integration')
  fs.writeFileSync(graphFile, JSON.stringify(graph))
  const missing = settleUnit(repo.dir, args.runId, 'task-1')
  assert.equal(missing.settled, false)
  assert.equal(missing.reason, 'missing-integration')
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  assert.equal(repo.git('rev-parse', 'HEAD'), mergeCommit)
})

test('a dirty worktree with a marker that names no commit is refused and the marker stays (issue #78)', (t) => {
  const { repo, args } = setup(t)
  const file = markerFile(args.runDir, 'task-1')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '{}\n')
  fs.writeFileSync(path.join(repo.dir, 'README.md'), 'uncommitted\n')
  const tip = repo.git('rev-parse', 'HEAD')
  const signal = path.join(args.runDir, 'ran')
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)
  const r = settleUnit(repo.dir, args.runId, 'task-1')
  assert.equal(r.settled, false)
  assert.equal(r.reason, 'dirty-integration')
  assert.equal(fs.readFileSync(file, 'utf8'), '{}\n')
  assert.equal(repo.git('rev-parse', 'HEAD'), tip)
  assert.equal(fs.existsSync(signal), false)
})

test('settle works for a task that --only dropped from the graph (issue #78)', async (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  await cutDuringTests(t, repo, args)
  const mergeCommit = repo.git('rev-parse', 'HEAD')
  const narrowed = compile(repo, plan([task(1), task(2)]), ['--run', args.runId, '--only', 'task-2'])
  assert.equal(narrowed.tasks['task-1'], undefined)
  assert.equal(readMarker(args.runDir, 'task-1').commit, mergeCommit)
  const signal = path.join(args.runDir, 'settle-ran')
  setTestCommand(args.runDir, `touch ${shQuote(signal)}; true`)
  assert.deepEqual(settleUnit(repo.dir, args.runId, 'task-1'), { settled: true, task: 'task-1', commit: mergeCommit, tip: mergeCommit })
  assert.equal(fs.existsSync(signal), true)
  assert.equal(fs.existsSync(markerFile(args.runDir, 'task-1')), false)
})

test('settle takes the merge lock and drops it, also when it refuses (issue #78)', async (t) => {
  const refused = setup(t)
  const stale = mergeLockPath(refused.args)
  fs.writeFileSync(stale, JSON.stringify({ pid: 2147483646, time: Date.now() }))
  assert.deepEqual(settleUnit(refused.repo.dir, refused.args.runId, 'task-1'), { settled: false, reason: 'no-marker' })
  assert.equal(fs.existsSync(stale), false)

  const { repo, args, unit } = setup(t)
  const { mergeCommit, tip } = await buriedUnverified(t, repo, args, unit)
  const lock = mergeLockPath(args)
  setTestCommand(args.runDir, `test -f ${shQuote(lock)}`)
  assert.deepEqual(settleUnit(repo.dir, args.runId, 'task-1'), { settled: true, task: 'task-1', commit: mergeCommit, tip })
  assert.equal(fs.existsSync(lock), false)
})

test('aether-wt settle prints the result and exits 0, and exits 1 for an invalid task id (issue #78)', (t) => {
  const { repo, args, unit } = setup(t)
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  const commit = repo.git('rev-parse', 'HEAD')
  writeUnverifiedMarker(repo.dir, args.runId, 'task-1', commit)
  const passed = runBin(WT_BIN, ['settle', args.runId, 'task-1'], repo.dir)
  assert.equal(passed.status, 0, passed.stdout)
  assert.equal(passed.stdout.trim().split('\n').length, 1)
  assert.deepEqual(passed.json, { settled: true, task: 'task-1', commit, tip: commit })
  const refused = runBin(WT_BIN, ['settle', args.runId, 'task-1'], repo.dir)
  assert.equal(refused.status, 0, refused.stdout)
  assert.deepEqual(refused.json, { settled: false, reason: 'no-marker' })
  const bad = runBin(WT_BIN, ['settle', args.runId, 'nope'], repo.dir)
  assert.equal(bad.status, 1)
  assert.match(bad.json.error, /invalid task id/)
})

test('settle passes on the baseline of known failures and names them (issue #78)', async (t) => {
  const { repo, args, unit } = setup(t)
  const { mergeCommit, tip } = await buriedUnverified(t, repo, args, unit)
  setTestCommand(args.runDir, failingTests('known'))
  writeBaseline(args.runDir, ['known'])
  assert.deepEqual(settleUnit(repo.dir, args.runId, 'task-1'), {
    settled: true,
    task: 'task-1',
    commit: mergeCommit,
    tip,
    knownFailures: ['known'],
  })
  assert.equal(fs.existsSync(markerFile(args.runDir, 'task-1')), false)
  assert.equal(repo.git('rev-parse', 'HEAD'), tip)
})
