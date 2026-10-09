'use strict'

// The run's merge lock: a merge commits before it runs the tests and resets the branch when they
// fail, so it holds <runDir>/merging meanwhile, and a lane call's checks read git only between merges.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { WT_BIN, NO_LANES_CONFIG, commitIn } = require('./helpers.js')
const { task } = require('./plan-fixtures.js')
const { ensure, merge } = require('../plugins/aether/lib/worktrees.js')
const work = require('../plugins/aether/lib/lane-work.js')
const fx = require('./lane-fixtures.js')

const IMPLEMENT = 'task-1-1-implement'
const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' })
const lockOf = (args) => path.join(args.runDir, 'merging')
const tipOf = (args) => fx.git(args.repoRoot, 'rev-parse', args.integration.branch)
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function setTestCommand(args, command) {
  const file = path.join(args.runDir, 'graph.json')
  const graph = JSON.parse(fs.readFileSync(file, 'utf8'))
  graph.testCommand = command
  fs.writeFileSync(file, JSON.stringify(graph))
}

// A unit of the run with one commit inside its Owns.
function unitWithWork(repo, args, n) {
  const unit = ensure(repo.dir, args.runId, `task-${n}`).path
  commitIn(repo, unit, `src/t${n}/a.js`, `${n}\n`, `add t${n}`)
  return unit
}

// The pid of a process that has exited.
function deadPid() {
  return spawnSync(process.execPath, ['-e', '']).pid
}

// A merge whose tests fail, acted out by another process: it takes the lock, commits on the
// integration branch, leaves an untracked file while its "tests" run for holdMs, then undoes both and
// drops the lock. Resolves once the commit and the file are there, to { exited }.
async function failingMerge(args, holdMs) {
  const script = `
    const fs = require('node:fs')
    const { execFileSync } = require('node:child_process')
    const [lock, dir, holdMs] = process.argv.slice(1)
    const git = (...a) => execFileSync('git', a, { cwd: dir })
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, time: Date.now() }), { flag: 'wx' })
    fs.writeFileSync(dir + '/merged.txt', 'm\\n')
    git('add', 'merged.txt')
    git('commit', '-q', '-m', 'Merge M')
    fs.writeFileSync(dir + '/test-output.tmp', 'x\\n')
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(holdMs))
    fs.rmSync(dir + '/test-output.tmp')
    git('reset', '-q', '--hard', 'HEAD~1')
    fs.rmSync(lock)
  `
  const child = spawn(process.execPath, ['-e', script, lockOf(args), args.repoRoot, String(holdMs)], { stdio: 'ignore' })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const output = path.join(args.repoRoot, 'test-output.tmp')
  const deadline = Date.now() + 15000
  while (!fs.existsSync(output) && Date.now() < deadline) await pause(20)
  assert.ok(fs.existsSync(output), 'the simulated merge did not start')
  return { exited }
}

test('merge holds the run lock while it runs, through passing and failing tests, and drops it after', (t) => {
  const { repo, args } = fx.laneRun(t, [task(1), task(2)])
  unitWithWork(repo, args, 1)
  unitWithWork(repo, args, 2)
  setTestCommand(args, `test -f '${lockOf(args)}'`)
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  assert.equal(fs.existsSync(lockOf(args)), false)
  setTestCommand(args, `test -f '${lockOf(args)}' && exit 3`)
  const failed = merge(repo.dir, args.runId, 'task-2')
  assert.deepEqual([failed.merged, failed.exitCode, failed.reverted], [false, 3, true])
  assert.equal(fs.existsSync(lockOf(args)), false)
})

test('merge replaces a stale lock, whether its process is gone or it is older than 30 minutes', (t) => {
  const { repo, args } = fx.laneRun(t, [task(1), task(2)])
  unitWithWork(repo, args, 1)
  unitWithWork(repo, args, 2)
  fs.writeFileSync(lockOf(args), JSON.stringify({ pid: deadPid(), time: Date.now() }))
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  assert.equal(fs.existsSync(lockOf(args)), false)
  fs.writeFileSync(lockOf(args), JSON.stringify({ pid: process.pid, time: Date.now() - 31 * 60 * 1000 }))
  assert.equal(merge(repo.dir, args.runId, 'task-2').merged, true)
  assert.equal(fs.existsSync(lockOf(args)), false)
})

test('a snapshot and a check taken during a merge that fails its tests wait for it, and see no change', { timeout: 60000 }, async (t) => {
  const { repo, args } = fx.laneRun(t)
  work.prepareImplementer(repo.dir, args.runId, 'task-1')
  const tip = tipOf(args)
  const quiet = work.snapshot(repo.dir, args.runId, { taskId: 'task-1' })

  const first = await failingMerge(args, 800)
  const before = work.snapshot(repo.dir, args.runId, { taskId: 'task-1' })
  assert.equal(fs.existsSync(lockOf(args)), false)
  assert.deepEqual(before, quiet)
  assert.equal(before.integration.tip, tip)
  await first.exited

  const second = await failingMerge(args, 800)
  assert.deepEqual(work.checkIntegration(repo.dir, args.runId, before), { ok: true })
  assert.equal(tipOf(args), tip)
  await second.exited
})

test('a stale lock does not hold up a snapshot or a check', { timeout: 20000 }, (t) => {
  const { repo, args } = fx.laneRun(t)
  for (const lock of [
    { pid: deadPid(), time: Date.now() },
    { pid: process.pid, time: Date.now() - 31 * 60 * 1000 },
  ]) {
    fs.writeFileSync(lockOf(args), JSON.stringify(lock))
    const startedAt = Date.now()
    const before = work.snapshot(repo.dir, args.runId)
    assert.deepEqual(work.checkIntegration(repo.dir, args.runId, before), { ok: true })
    assert.ok(Date.now() - startedAt < 5000)
  }
})

test('a merge that fails its tests in the middle of a lane call does not block the call', { timeout: 60000 }, async (t) => {
  const { repo, args } = fx.laneRun(t, [task(1), task(2)])
  const env = fx.laneEnv(t)
  ensure(repo.dir, args.runId, 'task-1')
  unitWithWork(repo, args, 2)
  setTestCommand(args, 'sleep 2; exit 1')
  const tip = tipOf(args)
  const merging = spawn(process.execPath, [WT_BIN, 'merge', args.runId, 'task-2'], {
    cwd: repo.dir,
    env: { ...process.env, AETHER_LANES_CONFIG: NO_LANES_CONFIG },
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  let mergeOut = ''
  merging.stdout.on('data', (chunk) => (mergeOut += chunk))
  const merged = new Promise((resolve) => merging.once('close', resolve))
  const deadline = Date.now() + 15000
  while (tipOf(args) === tip && Date.now() < deadline) await pause(20)
  assert.notEqual(tipOf(args), tip, 'the merge commit did not appear')

  const message = ['You are implementing task-1: Task 1 title.', 'FAKE-AGY: sleep 3', 'FAKE-AGY: write src/t1/a.js one', 'FAKE-AGY: commit add a', `FAKE-AGY: answer ${DONE}`].join('\n')
  const digest = fx.writePrompt(args, IMPLEMENT, message)
  const flags = ['--role', 'implementer', '--task', 'task-1', '--model', 'gemini-3.8-flash', '--effort', 'xhigh', '--digest', digest]
  assert.equal(fx.lane(args, 'start', [IMPLEMENT, ...flags], env).json.started, true)
  const done = fx.waitDone(args, IMPLEMENT, env)
  await merged
  assert.deepEqual([JSON.parse(mergeOut).reason, JSON.parse(mergeOut).reverted], ['tests', true])
  assert.equal(done.status, 'ok', done.detail)
  assert.equal(tipOf(args), tip)
})
