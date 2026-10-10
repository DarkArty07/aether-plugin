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
