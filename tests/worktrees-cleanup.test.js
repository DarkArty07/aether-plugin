'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { makeRepo, compile, commitIn, useDataDir, age, ageRun, tempDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, merge, removeUnit, diffPackage, sweepRun, sweepStale } = require('../plugins/aether/lib/worktrees.js')
const run = require('../plugins/aether/lib/run.js')
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

test('sweepStale retains leftovers whose run directory is already gone', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  fs.rmSync(args.runDir, { recursive: true, force: true })
  fs.rmSync(unit.path, { recursive: true, force: true })
  assert.deepEqual(sweepStale(repo.dir), { swept: [] })
  assert.notEqual(repo.git('branch', '--list', unit.branch), '')
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

test('sweepStale records the tips of merged unit branches before deleting them (R6)', (t) => {
  const data = useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'unit work')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  const tip = repo.git('rev-parse', unit.branch)
  ageRun(args, 48)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [args.runId] })
  const record = JSON.parse(fs.readFileSync(path.join(data, 'runs.jsonl'), 'utf8').trim().split('\n').pop())
  assert.deepEqual(record.branches, [{ branch: unit.branch, tip }])
})

test('sweepRun of an interrupted run keeps only the unmerged branches, with their work committed', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const one = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  const two = ensure(repo.dir, args.runId, 'task-2')
  fs.mkdirSync(path.join(two.path, 'src', 't2'), { recursive: true })
  fs.writeFileSync(path.join(two.path, 'src', 't2', 'b.js'), 'two\n')
  fs.writeFileSync(path.join(args.runDir, 'saved.json'), '{}\n')
  const r = sweepRun(repo.dir, args.runId, { finish: true })
  assert.deepEqual(r.removedBranches, [one.branch])
  assert.deepEqual(r.savedBranches, [{ task: 'task-2', branch: two.branch, head: repo.git('rev-parse', two.branch) }])
  assert.equal(repo.git('show', `${two.branch}:src/t2/b.js`), 'two')
  assert.deepEqual(r.remaining, { worktrees: [], branches: [two.branch] })
  assert.equal(r.finished, false)
  assert.ok(fs.existsSync(args.runDir))
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

test('sweepRun --finish keeps the run directory, the patch and the branch of an unmerged unit, and removes a merged one (R6)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const one = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, one.path, 'src/t1/a.js', 'unmerged work\n', 'work on task-1')
  const two = ensure(repo.dir, args.runId, 'task-2')
  commitIn(repo, two.path, 'src/t2/a.js', 'merged work\n', 'work on task-2')
  assert.equal(merge(repo.dir, args.runId, 'task-2').merged, true)

  const r = sweepRun(repo.dir, args.runId, { finish: true })
  const patch = path.join(args.runDir, 'patches', 'task-1.patch')
  assert.deepEqual(r.patches, [patch])
  assert.equal(r.finished, false)
  assert.deepEqual(r.retainedBranches, [one.branch])
  assert.ok(r.remaining.branches.includes(one.branch))
  assert.match(fs.readFileSync(patch, 'utf8'), /\+unmerged work/)
  assert.equal(fs.existsSync(path.join(args.runDir, 'graph.json')), true)
  assert.notEqual(repo.git('branch', '--list', one.branch), '')
  assert.equal(repo.git('branch', '--list', two.branch), '')
})

test('sweepRun --finish still removes the run directory when everything is merged (R6)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const one = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, one.path, 'src/t1/a.js', 'work\n', 'work on task-1')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  const r = sweepRun(repo.dir, args.runId, { finish: true })
  assert.equal(r.finished, true)
  assert.equal(fs.existsSync(args.runDir), false)
})

test('sweepStale keeps the directory, the graph, the patch and the branch of a run with unmerged work, and records it once (R7)', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const one = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, one.path, 'src/t1/a.js', 'unmerged work\n', 'work on task-1')
  const patch = path.join(args.runDir, 'patches', 'task-1.patch')
  const abandoned = () => fs.readFileSync(path.join(run.dataDir(), 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.runId === args.runId && r.status === 'abandoned')

  ageRun(args, 48)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [] })
  assert.equal(fs.existsSync(patch), true)
  assert.equal(fs.existsSync(path.join(args.runDir, 'graph.json')), true)
  assert.notEqual(repo.git('branch', '--list', one.branch), '')

  ageRun(args, 96)
  assert.deepEqual(sweepStale(repo.dir, { hours: 24 }), { swept: [] })
  assert.equal(fs.existsSync(patch), true, 'a second sweep does not delete the patch')
  assert.equal(abandoned().length, 1, 'the run is recorded as abandoned once')
})

test('sweepRun saves the unmerged work of each unit as a patch and retains its branch (R6)', (t) => {
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
  assert.deepEqual(r.retainedBranches, [unit.branch])
  assert.deepEqual(r.remaining, { worktrees: [], branches: [unit.branch] })
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

// A long-running process in a session and group of its own, marked as a lane call's, or unmarked
// when marker is null.
function laneProcess(t, marker) {
  const env = { ...process.env }
  delete env.AETHER_LANE_CALL
  if (marker) env.AETHER_LANE_CALL = marker
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore', env })
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
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
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
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'worktrees', 'lanes', args.runId)), false)
  assert.equal(repo.git('worktree', 'list').includes('.aether/worktrees/lanes'), false)
  assert.deepEqual(r.remaining, { worktrees: [], branches: [] })
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
  assert.deepEqual(sweepStale(repo.dir), { swept: [] })
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
  assert.equal(repo.git('worktree', 'list').includes('.aether/worktrees/lanes'), false)
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
  // Another run's call: the sweep of this run ends every call of this run, whatever names it.
  const stranger = laneProcess(t, '20990101-000000-abcd/task-1-1-implement')
  const dir = path.join(args.runDir, 'lanes', 'task-1-1-implement')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'agy.pid'), String(stranger.pid))
  assert.deepEqual(sweepRun(repo.dir, args.runId).lanes.stopped, [])
  process.kill(stranger.pid, 0)
})

// Whether pid is a live process, not a zombie.
function alive(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat[stat.lastIndexOf(')') + 2] !== 'Z'
  } catch {
    return false
  }
}

test("sweepRun ends every process marked as one of the run's calls, in sessions of their own and without pid files, and nothing else", { timeout: 30000 }, async (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const implement = laneProcess(t, `${args.runId}/task-1-1-implement`)
  const review = laneProcess(t, `${args.runId}/final-review`)
  const otherRun = laneProcess(t, '20990101-000000-abcd/task-1-1-implement')
  const unmarked = laneProcess(t, null)
  assert.deepEqual(sweepRun(repo.dir, args.runId).lanes.stopped, ['final-review', 'task-1-1-implement'])
  await Promise.all([implement.exited, review.exited])
  assert.deepEqual([alive(otherRun.pid), alive(unmarked.pid)], [true, true])
})

for (const interrupted of [false, true]) {
  test(`repeated sweeps preserve committed, uncommitted and untracked work (interrupted=${interrupted})`, (t) => {
    const repo = makeRepo(t)
    const args = compile(repo, plan([task(1)]))
    const unit = ensure(repo.dir, args.runId, 'task-1')
    commitIn(repo, unit.path, 'src/t1/a.js', 'committed\n', 'unit work')
    fs.writeFileSync(path.join(unit.path, 'src/t1/a.js'), 'committed\nuncommitted\n')
    fs.writeFileSync(path.join(unit.path, 'outside-owns.txt'), 'untracked\n')
    if (interrupted) fs.writeFileSync(path.join(args.runDir, 'saved.json'), '{}')
    const first = sweepRun(repo.dir, args.runId, { finish: true })
    const patch = path.join(args.runDir, 'patches/task-1.patch')
    const contents = fs.readFileSync(patch)
    assert.match(contents.toString(), /\+uncommitted/)
    assert.match(contents.toString(), /\+untracked/)
    assert.equal(fs.existsSync(unit.path), false)
    assert.equal(first.finished, false)
    const second = sweepRun(repo.dir, args.runId, { finish: true })
    assert.equal(second.finished, false)
    assert.deepEqual(fs.readFileSync(patch), contents)
    repo.git('apply', '--check', patch)
    assert.notEqual(repo.git('branch', '--list', unit.branch), '')
  })
}

for (const graphState of ['missing', 'malformed']) {
  for (const interrupted of [false, true]) {
    test(`sweep keeps dirty worktrees when graph is ${graphState} (interrupted=${interrupted})`, (t) => {
      const repo = makeRepo(t)
      const args = compile(repo, plan([task(1)]))
      const unit = ensure(repo.dir, args.runId, 'task-1')
      commitIn(repo, unit.path, 'src/t1/a.js', 'committed\n', 'unit work')
      fs.writeFileSync(path.join(unit.path, 'src/t1/a.js'), 'dirty\n')
      fs.writeFileSync(path.join(unit.path, 'untracked.txt'), 'untracked\n')
      if (interrupted) fs.writeFileSync(path.join(args.runDir, 'saved.json'), '{}')
      const graph = path.join(args.runDir, 'graph.json')
      if (graphState === 'missing') fs.unlinkSync(graph)
      else fs.writeFileSync(graph, '{broken')
      for (let i = 0; i < 2; i++) {
        const result = sweepRun(repo.dir, args.runId, { finish: true })
        assert.equal(result.finished, false)
        assert.ok(result.remaining.worktrees.includes('task-1'))
        assert.ok(result.remaining.branches.includes(unit.branch))
        assert.equal(fs.readFileSync(path.join(unit.path, 'src/t1/a.js'), 'utf8'), 'dirty\n')
        assert.equal(fs.readFileSync(path.join(unit.path, 'untracked.txt'), 'utf8'), 'untracked\n')
      }
    })
  }
}

for (const stale of [false, true]) {
  test(`missing run directory preserves dirty worktree and branch (stale=${stale})`, (t) => {
    useDataDir(t)
    const repo = makeRepo(t)
    const args = compile(repo, plan([task(1)]))
    const unit = ensure(repo.dir, args.runId, 'task-1')
    fs.writeFileSync(path.join(unit.path, 'unsaved.txt'), 'unsaved\n')
    fs.rmSync(args.runDir, { recursive: true })
    if (stale) assert.deepEqual(sweepStale(repo.dir), { swept: [] })
    else sweepRun(repo.dir, args.runId, { finish: true })
    assert.equal(fs.readFileSync(path.join(unit.path, 'unsaved.txt'), 'utf8'), 'unsaved\n')
    assert.notEqual(repo.git('branch', '--list', unit.branch), '')
  })

  test(`recreated worktree and existing patch are preserved (stale=${stale})`, (t) => {
    useDataDir(t)
    const repo = makeRepo(t)
    const args = compile(repo, plan([task(1)]))
    const unit = ensure(repo.dir, args.runId, 'task-1')
    commitIn(repo, unit.path, 'src/t1/a.js', 'committed\n', 'work')
    fs.writeFileSync(path.join(unit.path, 'old.txt'), 'old unsaved\n')
    sweepRun(repo.dir, args.runId)
    const patch = path.join(args.runDir, 'patches/task-1.patch')
    const original = fs.readFileSync(patch)
    ensure(repo.dir, args.runId, 'task-1')
    fs.writeFileSync(path.join(unit.path, 'new.txt'), 'new unsaved\n')
    if (stale) { ageRun(args, 48); sweepStale(repo.dir) } else sweepRun(repo.dir, args.runId)
    assert.deepEqual(fs.readFileSync(patch), original)
    assert.equal(fs.readFileSync(path.join(unit.path, 'new.txt'), 'utf8'), 'new unsaved\n')
    assert.notEqual(repo.git('branch', '--list', unit.branch), '')
  })

  test(`unreadable graph preserves marker without branch or worktree (stale=${stale})`, (t) => {
    useDataDir(t)
    const repo = makeRepo(t)
    const args = compile(repo, plan([task(1)]))
    const marker = path.join(args.runDir, 'unverified/task-1.json')
    fs.mkdirSync(path.dirname(marker), { recursive: true })
    fs.writeFileSync(marker, JSON.stringify({ commit: repo.git('rev-parse', 'HEAD') }))
    fs.writeFileSync(path.join(args.runDir, 'graph.json'), '{broken')
    if (stale) { ageRun(args, 48); assert.deepEqual(sweepStale(repo.dir), { swept: [] }) }
    else assert.equal(sweepRun(repo.dir, args.runId, { finish: true }).finished, false)
    assert.ok(fs.existsSync(marker))
  })
}

test('adopted branch with later commits is retained', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  const { adoptUnit } = require('../plugins/aether/lib/worktrees.js')
  adoptUnit(repo.dir, args.runId, 'task-1', { commit: repo.git('rev-parse', 'HEAD'), reason: 'integrated manually' })
  commitIn(repo, unit.path, 'src/t1/a.js', 'later\n', 'later work')
  const result = sweepRun(repo.dir, args.runId, { finish: true })
  assert.deepEqual(result.retainedBranches, [unit.branch])
  assert.notEqual(repo.git('branch', '--list', unit.branch), '')
})

test('stale sweep records actual removals once even with a live marker', (t) => {
  const data = useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'work\n', 'work')
  const marker = path.join(args.runDir, 'unverified/task-1.json')
  fs.mkdirSync(path.dirname(marker), { recursive: true })
  fs.writeFileSync(marker, JSON.stringify({ commit: repo.git('rev-parse', 'HEAD') }))
  for (let i = 0; i < 2; i++) { ageRun(args, 48); assert.deepEqual(sweepStale(repo.dir), { swept: [] }) }
  const records = fs.readFileSync(path.join(data, 'runs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  const abandoned = records.filter((record) => record.status === 'abandoned')
  assert.equal(abandoned.length, 1)
  assert.equal(abandoned[0].removedWorktrees, 1)
  assert.equal(abandoned[0].removedBranches, 0)
  assert.deepEqual(abandoned[0].branches, [])
})
