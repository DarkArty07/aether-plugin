'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { makeRepo, compile, commitIn, useDataDir, age, ageRun, tempDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, merge, removeUnit, diffPackage, sweepRun, sweepStale } = require('../plugins/aether/lib/worktrees.js')
const { prepareReader } = require('../plugins/aether/lib/lane-work.js')

test('removeUnit deletes the worktree and branch, and can keep a patch', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  const r = removeUnit(repo.dir, args.runId, 'task-1', { keepPatch: true })
  assert.deepEqual(r, { removed: true, patch: path.join(args.runDir, 'patches', 'task-1.patch') })
  assert.match(fs.readFileSync(r.patch, 'utf8'), /\+one/)
  assert.equal(fs.existsSync(unit.path), false)
  assert.equal(repo.git('branch', '--list', unit.branch), '')
  assert.doesNotMatch(repo.git('worktree', 'list', '--porcelain'), /task-1/)
})

test('removeUnit keeps committed, uncommitted and untracked work of an unmerged unit in a patch that applies', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n\n\n', 'add a with trailing blank lines')
  fs.writeFileSync(path.join(unit.path, 'src', 't1', 'a.js'), 'one\ntwo\n\n\n')
  fs.writeFileSync(path.join(unit.path, 'src', 't1', 'new.js'), 'untracked\n')
  const r = removeUnit(repo.dir, args.runId, 'task-1')
  assert.equal(r.patch, path.join(args.runDir, 'patches', 'task-1.patch'))
  const text = fs.readFileSync(r.patch, 'utf8')
  assert.match(text, /\+two/)
  assert.match(text, /\+untracked/)
  repo.git('apply', '--check', r.patch)
  assert.equal(fs.existsSync(unit.path), false)
})

test('removeUnit keeps no patch for a merged, clean unit', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  assert.deepEqual(removeUnit(repo.dir, args.runId, 'task-1'), { removed: true, patch: null })
})

test('removeUnit refuses ids that could escape .aether', (t) => {
  const repo = makeRepo(t)
  assert.throws(() => removeUnit(repo.dir, '../../x', 'task-1'), /invalid run id/)
  assert.throws(() => removeUnit(repo.dir, '20261007-000000-abcd', '../task-1'), /invalid task id/)
})

test('sweepRun removes every worktree and branch of a run, and nothing else', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  ensure(repo.dir, args.runId, 'task-1')
  ensure(repo.dir, args.runId, 'task-2')
  const r = sweepRun(repo.dir, args.runId)
  assert.equal(r.removedWorktrees.length, 2)
  assert.deepEqual(r.removedBranches.sort(), [`aether/${args.runId}/task-1`, `aether/${args.runId}/task-2`])
  assert.deepEqual(r.remaining, { worktrees: [], branches: [] })
  assert.equal(repo.git('branch', '--show-current'), 'feature/x')
  assert.ok(fs.existsSync(args.runDir))
})

test('sweepStale removes runs untouched for longer than the limit and records them', (t) => {
  const data = useDataDir(t)
  const repo = makeRepo(t)
  const old = compile(repo, plan([task(1), task(2)]))
  ensure(repo.dir, old.runId, 'task-1')
  const fresh = compile(repo, plan([task(1), task(2)]))
  ageRun(old, 48)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [old.runId] })
  assert.equal(fs.existsSync(old.runDir), false)
  assert.equal(repo.git('branch', '--list', `aether/${old.runId}/*`), '')
  assert.ok(fs.existsSync(fresh.runDir))
  const records = fs.readFileSync(path.join(data, 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(records.length, 1)
  assert.equal(records[0].runId, old.runId)
  assert.equal(records[0].status, 'abandoned')
})

test('sweepStale cleans leftovers whose run directory is already gone', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  fs.rmSync(args.runDir, { recursive: true, force: true })
  fs.rmSync(unit.path, { recursive: true, force: true })
  assert.deepEqual(sweepStale(repo.dir), { swept: [args.runId] })
  assert.equal(repo.git('branch', '--list', unit.branch), '')
  assert.doesNotMatch(repo.git('worktree', 'list', '--porcelain'), /task-1/)
})

test('sweepStale keeps a run whose unit worktree was touched recently', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  age(args.runDir, 48)
  fs.writeFileSync(path.join(unit.path, 'work.txt'), 'fresh\n')
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [] })
  assert.ok(fs.existsSync(unit.path))
})

test('sweepStale records the tips of unmerged unit branches before deleting them', (t) => {
  const data = useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'unit work')
  const tip = repo.git('rev-parse', unit.branch)
  ageRun(args, 48)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [args.runId] })
  const record = JSON.parse(fs.readFileSync(path.join(data, 'runs.jsonl'), 'utf8').trim().split('\n').pop())
  assert.deepEqual(record.branches, [{ branch: unit.branch, tip }])
})

test('Aether leaves the registration of an unrelated worktree alone', (t) => {
  const repo = makeRepo(t)
  const userWt = path.join(tempDir(t, 'aether-user-wt-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'user/topic', userWt)
  const moved = userWt + '-away'
  fs.renameSync(userWt, moved)
  const args = compile(repo, plan([task(1), task(2)]))
  ensure(repo.dir, args.runId, 'task-1')
  removeUnit(repo.dir, args.runId, 'task-1')
  sweepRun(repo.dir, args.runId)
  fs.renameSync(moved, userWt)
  assert.equal(repo.git('-C', userWt, 'branch', '--show-current'), 'user/topic')
})

test('sweepRun with finish also deletes the run directory', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  ensure(repo.dir, args.runId, 'task-1')
  const r = sweepRun(repo.dir, args.runId, { finish: true })
  assert.deepEqual(r.remaining, { worktrees: [], branches: [] })
  assert.equal(fs.existsSync(args.runDir), false)
})

test('sweepRun saves the unmerged work of each unit it removes as a patch', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  ensure(repo.dir, args.runId, 'task-2')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  fs.writeFileSync(path.join(unit.path, 'src', 't1', 'b.js'), 'two\n')
  const r = sweepRun(repo.dir, args.runId)
  const patch = path.join(args.runDir, 'patches', 'task-1.patch')
  assert.deepEqual(r.patches, [patch])
  const text = fs.readFileSync(patch, 'utf8')
  assert.match(text, /\+one/)
  assert.match(text, /\+two/)
  assert.deepEqual(r.remaining, { worktrees: [], branches: [] })
})

test('sweepRun keeps a unit whose unmerged work it cannot save', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  // The integration branch is gone, so the unit's base cannot be found.
  repo.git('switch', '-q', '-c', 'elsewhere')
  repo.git('branch', '-D', 'feature/x')
  const r = sweepRun(repo.dir, args.runId, { finish: true })
  assert.deepEqual(r.patches, [])
  assert.deepEqual(r.remaining, { worktrees: ['task-1'], branches: [`aether/${args.runId}/task-1`] })
  assert.ok(fs.existsSync(path.join(unit.path, 'src', 't1', 'a.js')))
  assert.ok(fs.existsSync(args.runDir))
})

// A long-running process in its own group, marked as a lane call's.
function laneProcess(t, marker) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, AETHER_LANE_CALL: marker },
  })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  t.after(() => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // already gone
    }
  })
  return { pid: child.pid, exited }
}

test("sweepRun stops a run's lane processes and removes its lane copies", async (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const copy = prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' })
  const lane = laneProcess(t, `${args.runId}/task-1-1-implement`)
  const dir = path.join(args.runDir, 'lanes', 'task-1-1-implement')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'pid'), String(lane.pid))
  const r = sweepRun(repo.dir, args.runId)
  assert.deepEqual(r.lanes, { stopped: ['task-1-1-implement'], removed: ['task-1-1-supervise'], remaining: [] })
  await lane.exited
  assert.equal(fs.existsSync(copy.workdir), false)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'lanes', args.runId)), false)
  assert.equal(repo.git('worktree', 'list').includes('.aether/lanes'), false)
  assert.deepEqual(r.remaining, { worktrees: [], branches: [] })
})

test('sweepStale removes a Designer state untouched for a day, with its process, and keeps a fresh one', async (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const designs = path.join(repo.dir, '.aether', 'design')
  const old = path.join(designs, '20261007-100000-aaaa')
  const fresh = path.join(designs, '20261008-100000-bbbb')
  for (const dir of [old, fresh]) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'state.json'), '{}')
  }
  const lane = laneProcess(t, 'design/20261007-100000-aaaa')
  fs.writeFileSync(path.join(old, 'pid'), String(lane.pid))
  age(old, 48)
  assert.deepEqual(sweepStale(repo.dir), { swept: [], designs: ['20261007-100000-aaaa'] })
  await lane.exited
  assert.equal(fs.existsSync(old), false)
  assert.equal(fs.existsSync(fresh), true)
})

test('sweepStale cleans lane copies whose run directory is already gone', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const copy = prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' })
  fs.rmSync(args.runDir, { recursive: true, force: true })
  assert.deepEqual(sweepStale(repo.dir), { swept: [args.runId] })
  assert.equal(fs.existsSync(copy.workdir), false)
})

test('sweepRun drops the registration of a lane copy whose directory was deleted, and only that one', (t) => {
  const repo = makeRepo(t)
  const userWt = path.join(tempDir(t, 'aether-user-wt-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'user/topic', userWt)
  const moved = userWt + '-away'
  fs.renameSync(userWt, moved)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const copy = prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' })
  fs.rmSync(copy.workdir, { recursive: true, force: true })
  const r = sweepRun(repo.dir, args.runId)
  assert.deepEqual(r.lanes, { stopped: [], removed: ['task-1-1-supervise'], remaining: [] })
  assert.equal(repo.git('worktree', 'list').includes('.aether/lanes'), false)
  fs.renameSync(moved, userWt)
  assert.equal(repo.git('-C', userWt, 'branch', '--show-current'), 'user/topic')
})

test('sweepRun reports no lane activity for a run that never used a lane', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  ensure(repo.dir, args.runId, 'task-1')
  assert.deepEqual(sweepRun(repo.dir, args.runId).lanes, { stopped: [], removed: [], remaining: [] })
})

test('sweepRun leaves a process alone when its pid file names one that is not the call\'s', async (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const stranger = laneProcess(t, `${args.runId}/some-other-call`)
  const dir = path.join(args.runDir, 'lanes', 'task-1-1-implement')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'agy.pid'), String(stranger.pid))
  assert.deepEqual(sweepRun(repo.dir, args.runId).lanes.stopped, [])
  process.kill(stranger.pid, 0)
})

test('sweepStale keeps a design state that something touched recently, and ignores loose files in design/', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const designs = path.join(repo.dir, '.aether', 'design')
  const busy = path.join(designs, '20261008-100000-cccc')
  fs.mkdirSync(busy, { recursive: true })
  fs.writeFileSync(path.join(busy, 'state.json'), '{}')
  fs.writeFileSync(path.join(designs, 'note.txt'), 'not a design')
  age(busy, 48)
  // One file inside was written just now: the state is in use.
  fs.writeFileSync(path.join(busy, 'state.json'), '{"round":2}')
  assert.deepEqual(sweepStale(repo.dir), { swept: [] })
  assert.equal(fs.existsSync(busy), true)
  assert.equal(fs.existsSync(path.join(designs, 'note.txt')), true)
})
