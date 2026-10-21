'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, diffPackage, merge, finalPackage } = require('../plugins/aether/lib/worktrees.js')
const work = require('../plugins/aether/lib/lane-work.js')

function run(t, tasks = [task(1)]) {
  const repo = makeRepo(t)
  const args = compile(repo, plan(tasks))
  return { repo, args }
}
const git = (repo, dir, ...rest) => repo.git('-C', dir, ...rest)

test('prepareImplementer makes the unit worktree and hands it the brief', (t) => {
  const { repo, args } = run(t)
  const { workdir, brief } = work.prepareImplementer(repo.dir, args.runId, 'task-1')
  assert.equal(workdir, path.join(repo.dir, '.aether', 'worktrees', args.runId, 'task-1'))
  assert.equal(brief, path.join(workdir, '.aether-tmp', 'brief.md'))
  assert.equal(fs.readFileSync(brief, 'utf8'), fs.readFileSync(args.tasks['task-1'].brief, 'utf8'))
  assert.equal(git(repo, workdir, 'status', '--porcelain'), '')
})

test("a supervisor's copy sits at the unit branch's tip with the brief and the package, and goes away", (t) => {
  const { repo, args } = run(t)
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const call = 'task-1-1-supervise'
  const copy = work.prepareReader(repo.dir, args.runId, call, { taskId: 'task-1' })
  assert.equal(copy.workdir, work.readerDir(repo.dir, args.runId, call))
  assert.equal(git(repo, copy.workdir, 'rev-parse', 'HEAD'), git(repo, unit, 'rev-parse', 'HEAD'))
  assert.deepEqual(fs.readdirSync(path.join(copy.workdir, '.aether-tmp')).sort(), ['brief.md', 'package.diff'])
  assert.equal(fs.readFileSync(copy.package, 'utf8'), fs.readFileSync(path.join(args.runDir, 'packages', 'task-1.diff'), 'utf8'))
  assert.equal(work.removeReader(repo.dir, args.runId, call), true)
  assert.equal(fs.existsSync(copy.workdir), false)
  assert.equal(repo.git('worktree', 'list').includes(copy.workdir), false)
  assert.equal(work.removeReader(repo.dir, args.runId, call), false)
})

test("the final reviewer's copy sits at the integration branch's tip with the run's package", (t) => {
  const { repo, args } = run(t)
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  finalPackage(repo.dir, args.runId)
  const copy = work.prepareReader(repo.dir, args.runId, 'final-review')
  assert.equal(copy.brief, null)
  assert.equal(git(repo, copy.workdir, 'rev-parse', 'HEAD'), repo.git('rev-parse', args.integration.branch))
  assert.deepEqual(fs.readdirSync(path.join(copy.workdir, '.aether-tmp')), ['package.diff'])
  work.removeReader(repo.dir, args.runId, 'final-review')
})

test('checkOwns lists committed, uncommitted and untracked files outside Owns, and nothing else', (t) => {
  const { repo, args } = run(t)
  const unit = work.prepareImplementer(repo.dir, args.runId, 'task-1').workdir
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  assert.deepEqual(work.checkOwns(repo.dir, args.runId, 'task-1'), { ok: true })
  commitIn(repo, unit, 'other/committed.js', 'x\n', 'outside')
  fs.writeFileSync(path.join(unit, 'README.md'), 'changed\n')
  fs.mkdirSync(path.join(unit, 'loose'))
  fs.writeFileSync(path.join(unit, 'loose', 'new.js'), 'x\n')
  fs.writeFileSync(path.join(unit, 'src', 't1', 'b.js'), 'inside\n')
  assert.deepEqual(work.checkOwns(repo.dir, args.runId, 'task-1'), { ok: false, files: ['README.md', 'loose/new.js', 'other/committed.js'] })
})

test('checkIntegration lets a merge move the branch forward, and catches a dirty worktree or a rewind', (t) => {
  const { repo, args } = run(t, [task(1), task(2)])
  work.prepareImplementer(repo.dir, args.runId, 'task-1')
  const before = work.snapshot(repo.dir, args.runId, { taskId: 'task-1' })
  const other = ensure(repo.dir, args.runId, 'task-2').path
  commitIn(repo, other, 'src/t2/a.js', 'two\n', 'add t2')
  assert.equal(merge(repo.dir, args.runId, 'task-2').merged, true)
  assert.deepEqual(work.checkIntegration(repo.dir, args.runId, before), { ok: true })

  fs.writeFileSync(path.join(repo.dir, 'stray.txt'), 'x\n')
  assert.deepEqual(work.checkIntegration(repo.dir, args.runId, before), { ok: false, detail: 'the integration worktree changed during the lane call' })
  fs.rmSync(path.join(repo.dir, 'stray.txt'))

  const moved = work.snapshot(repo.dir, args.runId)
  repo.git('reset', '-q', '--hard', 'HEAD~1')
  assert.deepEqual(work.checkIntegration(repo.dir, args.runId, moved), {
    ok: false,
    detail: 'the integration branch was rewound or rewritten during the lane call',
  })
})

test("checkIntegration of a delegate run (watched: false) lets the Lead's checkout change, and still catches a rewind", (t) => {
  const { repo, args } = run(t)
  const graphPath = path.join(args.runDir, 'graph.json')
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'))
  fs.writeFileSync(graphPath, `${JSON.stringify({ ...graph, integration: { ...graph.integration, watched: false } })}\n`)
  work.prepareImplementer(repo.dir, args.runId, 'task-1')
  const before = work.snapshot(repo.dir, args.runId, { taskId: 'task-1' })
  fs.writeFileSync(path.join(repo.dir, 'lead-at-work.txt'), 'x\n')
  assert.deepEqual(work.checkIntegration(repo.dir, args.runId, before), { ok: true })
  fs.rmSync(path.join(repo.dir, 'lead-at-work.txt'))
  fs.writeFileSync(path.join(repo.dir, 'extra.txt'), 'x\n')
  repo.git('add', 'extra.txt')
  repo.git('commit', '-q', '-m', 'extra')
  const moved = work.snapshot(repo.dir, args.runId)
  repo.git('reset', '-q', '--hard', 'HEAD~1')
  assert.deepEqual(work.checkIntegration(repo.dir, args.runId, moved), {
    ok: false,
    detail: 'the integration branch was rewound or rewritten during the lane call',
  })
})

test('checkUnitUnchanged catches a read-only call that wrote to the unit, committed or not', (t) => {
  const { repo, args } = run(t)
  const unit = work.prepareImplementer(repo.dir, args.runId, 'task-1').workdir
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  const before = work.snapshot(repo.dir, args.runId, { taskId: 'task-1' })
  assert.deepEqual(work.checkUnitUnchanged(repo.dir, args.runId, 'task-1', before), { ok: true })
  fs.writeFileSync(path.join(unit, 'src', 't1', 'z.js'), 'x\n')
  const changed = { ok: false, detail: 'the unit worktree changed during a read-only lane call' }
  assert.deepEqual(work.checkUnitUnchanged(repo.dir, args.runId, 'task-1', before), changed)
  git(repo, unit, 'add', '-A')
  git(repo, unit, 'commit', '-q', '-m', 'sneaky')
  assert.deepEqual(work.checkUnitUnchanged(repo.dir, args.runId, 'task-1', before), changed)
})

test('finishImplementer commits what agy left, then packages the unit and reads its head', (t) => {
  const { repo, args } = run(t)
  const unit = work.prepareImplementer(repo.dir, args.runId, 'task-1').workdir
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  fs.writeFileSync(path.join(unit, 'src', 't1', 'b.js'), 'two\n')
  const done = work.finishImplementer(repo.dir, args.runId, 'task-1')
  assert.equal(done.committed, true)
  assert.equal(git(repo, unit, 'log', '-1', '--format=%s'), work.COMMIT_MESSAGE)
  assert.equal(work.COMMIT_MESSAGE, 'lanes: commit the work the external agent left uncommitted')
  assert.equal(git(repo, unit, 'status', '--porcelain'), '')
  assert.equal(done.head, git(repo, unit, 'rev-parse', 'HEAD'))
  assert.ok(fs.readFileSync(done.package, 'utf8').includes(`Head: ${done.head}`))
  assert.equal(work.finishImplementer(repo.dir, args.runId, 'task-1').committed, false)
})

test('prepareReader replaces a leftover copy of the same call, and removeReader clears a plain leftover directory', (t) => {
  const { repo, args } = run(t)
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const call = 'task-1-1-supervise'
  const first = work.prepareReader(repo.dir, args.runId, call, { taskId: 'task-1' })
  fs.writeFileSync(path.join(first.workdir, 'scribble.txt'), 'left behind\n')
  const second = work.prepareReader(repo.dir, args.runId, call, { taskId: 'task-1' })
  assert.equal(second.workdir, first.workdir)
  assert.equal(fs.existsSync(path.join(second.workdir, 'scribble.txt')), false)
  assert.equal(git(repo, second.workdir, 'status', '--porcelain'), '')
  work.removeReader(repo.dir, args.runId, call)
  fs.mkdirSync(path.join(first.workdir, 'junk'), { recursive: true })
  assert.equal(work.removeReader(repo.dir, args.runId, call), true)
  assert.equal(fs.existsSync(first.workdir), false)
})

test('a copy needs a package, and a call id cannot leave the lanes folder', (t) => {
  const { repo, args } = run(t)
  ensure(repo.dir, args.runId, 'task-1')
  assert.throws(() => work.prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' }), /package\.diff/)
  assert.equal(fs.existsSync(work.readerDir(repo.dir, args.runId, 'task-1-1-supervise')), false)
  assert.equal(repo.git('worktree', 'list').includes('.aether/lanes'), false)
  assert.throws(() => work.readerDir(repo.dir, args.runId, '../../worktrees'), /invalid call id/)
  assert.throws(() => work.removeReader(repo.dir, args.runId, '..'), /invalid call id/)
})

test('checkIntegration is ok when nothing moved, and a snapshot without a task has no unit', (t) => {
  const { repo, args } = run(t)
  const before = work.snapshot(repo.dir, args.runId)
  assert.equal(before.unit, null)
  assert.deepEqual(work.checkIntegration(repo.dir, args.runId, before), { ok: true })
})

test('checkUnitUnchanged flags a unit worktree that appeared or vanished', (t) => {
  const { repo, args } = run(t)
  const none = work.snapshot(repo.dir, args.runId, { taskId: 'task-1' })
  assert.equal(none.unit, null)
  assert.deepEqual(work.checkUnitUnchanged(repo.dir, args.runId, 'task-1', none), { ok: true })
  work.prepareImplementer(repo.dir, args.runId, 'task-1')
  const changed = { ok: false, detail: 'the unit worktree changed during a read-only lane call' }
  assert.deepEqual(work.checkUnitUnchanged(repo.dir, args.runId, 'task-1', none), changed)
})

test('finishImplementer refuses a unit that has no worktree, and never commits in the checkout around it', (t) => {
  const { repo, args } = run(t)
  fs.mkdirSync(path.join(repo.dir, '.aether', 'worktrees', args.runId, 'task-1'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, 'stray.txt'), 'x\n')
  assert.throws(() => work.finishImplementer(repo.dir, args.runId, 'task-1'), /is not a worktree/)
  assert.equal(repo.git('log', '-1', '--format=%s'), 'base')
})
