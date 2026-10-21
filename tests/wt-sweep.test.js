'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { WT_BIN, makeRepo, compile, commitIn, runBin, tempDir, ageRun } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

const show = (repo, spec) => spawnSync('git', ['show', spec], { cwd: repo.dir, encoding: 'utf8' }).stdout
const owned = (...parts) => parts.join('/')

function writeAt(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

function unit(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  return { repo, args, one }
}

function pauseFor(repo, swarmRun, branch) {
  const dir = path.join(repo.dir, '.aether', 'autonomy', 'auto-20261021-100000-abcd')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({
    quotaPauses: [{ savedUnits: [{ swarmRun, task: 'task-1', branch, head: null }] }],
  }))
}

test('ensure commits the work it finds in the worktree before handing it back', (t) => {
  const { repo, args, one } = unit(t)
  assert.deepEqual([one.created, one.salvaged], [true, false])
  writeAt(path.join(one.path, 'src', 't1', 'draft.js'), 'draft\n')
  const second = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  assert.deepEqual([second.created, second.salvaged], [false, true])
  assert.equal(show(repo, `${one.branch}:${owned('src', 't1', 'draft.js')}`), 'draft\n')
  const clean = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  assert.equal(clean.salvaged, false)
})

test('remove commits the unit before deleting its worktree', (t) => {
  const { repo, args, one } = unit(t)
  commitIn(repo, one.path, owned('src', 't1', 'a.js'), 'a\n', 'add a')
  writeAt(path.join(one.path, 'src', 't1', 'draft.js'), 'draft\n')
  const r = runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(Object.keys(r.json).sort(), ['patch', 'removed'])
  assert.equal(r.json.removed, true)
  const patch = fs.readFileSync(r.json.patch, 'utf8')
  assert.ok(patch.includes(owned('src', 't1', 'a.js')), 'the committed file is in the patch')
  assert.ok(patch.includes(owned('src', 't1', 'draft.js')), 'the draft committed by the salvage is in the patch')
  assert.equal(fs.existsSync(one.path), false)
  assert.equal(repo.git('branch', '--list', one.branch), '')
})

test('sweep --finish without a marker removes the branch', (t) => {
  const { repo, args, one } = unit(t)
  const junk = path.join(repo.dir, '.aether', 'autonomy', 'auto-20261021-100000-eeee')
  fs.mkdirSync(junk, { recursive: true })
  fs.writeFileSync(path.join(junk, 'run.json'), '{')
  writeAt(path.join(one.path, 'src', 't1', 'wip.js'), 'wip\n')
  const r = runBin(WT_BIN, ['sweep', '--run', args.runId, '--finish'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.savedBranches, [])
  assert.equal(r.json.finished, true)
  assert.equal(fs.existsSync(args.runDir), false)
  assert.deepEqual(r.json.remaining, { worktrees: [], branches: [] })
})

test('commits past the base, with no marker, are still swept', (t) => {
  const { repo, args, one } = unit(t)
  commitIn(repo, one.path, owned('src', 't1', 'a.js'), 'a\n', 'add a')
  const r = runBin(WT_BIN, ['sweep', '--run', args.runId, '--finish'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.savedBranches, [])
  assert.equal(r.json.finished, true)
  assert.equal(repo.git('branch', '--list', one.branch), '')
  assert.equal(fs.existsSync(args.runDir), false)
})

test('a recorded pause keeps a branch that only points at its base', (t) => {
  const { repo, args, one } = unit(t)
  pauseFor(repo, args.runId, one.branch)
  const r = runBin(WT_BIN, ['sweep', '--run', args.runId, '--finish'], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.savedBranches, [{ task: 'task-1', branch: one.branch, head: repo.git('rev-parse', one.branch) }])
  assert.equal(repo.git('rev-parse', one.branch), repo.git('rev-parse', 'feature/x'))
  assert.equal(r.json.finished, false)
  assert.equal(fs.existsSync(args.runDir), true)
  assert.deepEqual(r.json.remaining, { worktrees: [], branches: [one.branch] })
})

test('after save, sweep keeps the branch and stale records the run once', (t) => {
  const data = tempDir(t, 'aether-data-')
  const { repo, args, one } = unit(t)
  assert.equal(runBin(WT_BIN, ['save', args.runId], repo.dir).status, 0)
  writeAt(path.join(one.path, 'src', 't1', 'wip.js'), 'wip\n')
  const finish = runBin(WT_BIN, ['sweep', '--run', args.runId, '--finish'], repo.dir)
  assert.equal(finish.status, 0, finish.stdout + finish.stderr)
  assert.deepEqual(finish.json.savedBranches.map((b) => b.task), ['task-1'])
  assert.equal(finish.json.savedBranches[0].head, repo.git('rev-parse', one.branch))
  assert.equal(finish.json.finished, false)
  assert.equal(fs.existsSync(args.runDir), true)
  assert.deepEqual(finish.json.remaining.worktrees, [])
  assert.equal(finish.json.patches.length, 1)
  assert.equal(show(repo, `${one.branch}:${owned('src', 't1', 'wip.js')}`), 'wip\n')
  assert.match(repo.git('log', '-1', '--format=%s', one.branch), /aether: task-1 work saved/)
  ageRun(args, 3)
  const stale = () => runBin(WT_BIN, ['sweep', '--stale', '--hours', '2'], repo.dir, { AETHER_DATA_DIR: data })
  const first = stale()
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.deepEqual(first.json, { swept: [] })
  ageRun(args, 3)
  const second = stale()
  assert.deepEqual(second.json, { swept: [] })
  const log = fs.readFileSync(path.join(data, 'runs.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(log.map((e) => e.status), ['interrupted-saved'])
  assert.deepEqual(Object.keys(log[0]).sort(), ['repo', 'runId', 'status', 'sweptAt'])
  assert.equal(log[0].runId, args.runId)
  assert.ok(repo.git('branch', '--list', one.branch).includes(one.branch))
  assert.equal(fs.existsSync(args.runDir), true)
})
