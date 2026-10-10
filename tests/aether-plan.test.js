'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, writePlan, runBin, tempDir, NO_LANES_CONFIG, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { CONFIG_FILE, loadConfig, lanesArgs } = require('../plugins/aether/lib/lanes.js')

test('check prints the waves of a valid plan', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)]))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json, { ok: true, tasks: 3, waves: [['task-1', 'task-3'], ['task-2']], warnings: [] })
})

test('check exits 1 and lists every error', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1)], { execution: [] }))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 1)
  assert.equal(r.json.ok, false)
  assert.deepEqual(r.json.errors, ['Aether Execution: "Test command" is missing.'])
})

test('compile writes the graph, briefs and state for the integration branch', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)]))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const args = r.json
  assert.match(args.runId, /^\d{8}-\d{6}-[0-9a-f]{4}$/)
  assert.equal(args.repoRoot, repo.dir)
  assert.equal(args.runDir, path.join(repo.dir, '.aether', 'runs', args.runId))
  assert.deepEqual(args.integration, { branch: 'feature/x', worktree: repo.dir, base: repo.git('rev-parse', 'HEAD') })
  assert.deepEqual(args.waves, [['task-1', 'task-3'], ['task-2']])
  assert.equal(args.testCommand, 'true')
  assert.deepEqual(args.ladder, { haiku: 2, sonnet: 2, opus: 1 })
  assert.equal(args.maxAgents, 200)
  assert.equal(args.tasks['task-2'].brief, path.join(args.runDir, 'briefs', 'task-2.md'))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(args.runDir, 'graph.json'), 'utf8')), args)
  assert.equal(JSON.parse(fs.readFileSync(path.join(args.runDir, 'state.json'), 'utf8')).status, 'compiled')
  assert.match(fs.readFileSync(args.tasks['task-2'].brief, 'utf8'), /### Task 2: Task 2 title/)
  assert.equal(repo.git('status', '--porcelain'), '?? plan.md')
})

test('compile refuses main unless --allow-main, and refuses a detached HEAD', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  repo.git('switch', '-q', 'main')
  let r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.errors[0], /refusing to compile on main/)
  r = runBin(PLAN_BIN, ['compile', file, '--allow-main'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  repo.git('switch', '-q', '--detach', 'HEAD')
  r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.errors[0], /detached HEAD/)
})

test('compile --run reuses a run id and --only narrows the tasks', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { depends: 'Task 1 — uses it' }), task(3)]))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir).json
  const again = runBin(PLAN_BIN, ['compile', file, '--run', first.runId, '--only', 'task-2'], repo.dir)
  assert.equal(again.status, 0, again.stdout)
  assert.equal(again.json.runId, first.runId)
  assert.deepEqual(again.json.waves, [['task-2']])
  assert.deepEqual(Object.keys(again.json.tasks), ['task-2'])
})

test('compile refuses an invalid run id', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const r = runBin(PLAN_BIN, ['compile', file, '--run', '../evil'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.errors[0], /invalid run id/)
})

test('compile refuses --only or --run without a value, and creates no run', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  let r = runBin(PLAN_BIN, ['compile', file, '--only'], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['--only needs a comma-separated list of tasks, such as task-2,task-3.'])
  r = runBin(PLAN_BIN, ['compile', file, '--only', '--allow-main'], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['--only needs a comma-separated list of tasks, such as task-2,task-3.'])
  r = runBin(PLAN_BIN, ['compile', file, '--only', ''], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['The selection names no tasks.'])
  r = runBin(PLAN_BIN, ['compile', file, '--run'], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['--run needs a run id.'])
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether')), false)
})

test('compile warns when the integration worktree is the main checkout, and not from a linked worktree', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  repo.git('add', 'plan.md')
  repo.git('commit', '-q', '-m', 'plan')
  let r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stderr, /warning: the integration worktree is the main checkout/)
  const linked = path.join(repo.dir, '.worktrees', 'feature-y')
  repo.git('worktree', 'add', '-q', '-b', 'feature/y', linked)
  r = runBin(PLAN_BIN, ['compile', path.join(linked, 'plan.md')], linked)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.integration.worktree, linked)
  assert.doesNotMatch(r.stderr, /main checkout/)
})

test('compile --run on an existing run keeps its first compile time and archives the last result', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir).json
  const statePath = path.join(first.runDir, 'state.json')
  const firstState = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  assert.equal(firstState.launches, 1)
  for (const launch of [1, 2]) {
    fs.writeFileSync(path.join(first.runDir, 'result.json'), `{"launch":${launch}}`)
    const r = runBin(PLAN_BIN, ['compile', file, '--run', first.runId, '--only', 'task-2'], repo.dir)
    assert.equal(r.status, 0, r.stdout)
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  assert.equal(state.compiledAt, firstState.compiledAt)
  assert.equal(state.launches, 3)
  assert.equal(fs.readFileSync(path.join(first.runDir, 'result-1.json'), 'utf8'), '{"launch":1}')
  assert.equal(fs.readFileSync(path.join(first.runDir, 'result-2.json'), 'utf8'), '{"launch":2}')
  assert.equal(fs.existsSync(path.join(first.runDir, 'result.json')), false)
})

test('compile gives every task its effort and review, and the brief its starting rung', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { tier: 'sonnet high — wiring the tests pin down', review: 'xhigh — UI states' })]))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(
    ['task-1', 'task-2'].map((id) => [r.json.tasks[id].tier, r.json.tasks[id].effort, r.json.tasks[id].review]),
    [
      ['haiku', 'xhigh', 'high'],
      ['sonnet', 'high', 'xhigh'],
    ],
  )
  assert.match(fs.readFileSync(r.json.tasks['task-1'].brief, 'utf8'), /^- Tier: haiku xhigh — complete code$/m)
})

test('check refuses Sonnet below high with its message, and no other', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { tier: 'sonnet medium — x' })]))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['Task 2: sonnet medium is not used for implementers; Sonnet and Opus run at high, xhigh or max.'])
})

// A lane table whose agy is `command`, in a temporary directory.
function laneTable(t, command) {
  const dir = tempDir(t)
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  config.harnesses.agy.command = command(dir)
  const file = path.join(dir, 'lanes.json')
  fs.writeFileSync(file, JSON.stringify(config))
  return file
}
function executable(dir) {
  const exe = path.join(dir, 'agy')
  fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n')
  fs.chmodSync(exe, 0o755)
  return exe
}

test('compile gives the run its lanes when the table and the harness are there, and none with --no-lanes', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = laneTable(t, executable)
  const on = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file })
  assert.equal(on.status, 0, on.stdout + on.stderr)
  assert.deepEqual(on.json.lanes, lanesArgs(loadConfig(file), { installed: () => true }))
  assert.equal(Object.keys(on.json).pop(), 'lanes')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(on.json.runDir, 'graph.json'), 'utf8')).lanes, on.json.lanes)
  const off = runBin(PLAN_BIN, ['compile', md, '--no-lanes'], repo.dir, { AETHER_LANES_CONFIG: file })
  assert.equal(off.status, 0, off.stdout + off.stderr)
  assert.equal(off.json.lanes, null)
})

test('compile gives no lanes when the harness is missing or there is no table', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const missing = laneTable(t, (dir) => path.join(dir, 'no-agy'))
  assert.equal(runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: missing }).json.lanes, null)
  assert.equal(runBin(PLAN_BIN, ['compile', md], repo.dir).json.lanes, null)
  assert.equal(fs.existsSync(NO_LANES_CONFIG), false)
  assert.equal(compile(repo, plan([task(1)])).lanes, null)
})

test('compile refuses a broken lane table before writing anything', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, '{')
  const r = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file })
  assert.equal(r.status, 1)
  assert.equal(r.json.ok, false)
  assert.ok(r.json.errors[0].startsWith(`lanes config ${file}: `), r.json.errors[0])
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'runs')), false)
})

test('compile runs native, and says why on stderr, when the lanes option is off', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = laneTable(t, executable)
  for (const value of ['off', '']) {
    const r = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_LANES: value })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.json.lanes, null)
    assert.ok(r.stderr.includes("aether-plan: lanes are off: the aether plugin's lanes option is not on\n"), r.stderr)
  }
  const quiet = runBin(PLAN_BIN, ['compile', md, '--no-lanes'], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_LANES: 'off' })
  assert.equal(quiet.status, 0, quiet.stdout + quiet.stderr)
  assert.equal(quiet.json.lanes, null)
  assert.ok(!quiet.stderr.includes('lanes are off'), quiet.stderr)
})

test('with the lanes option off, a broken lane table is not even read', (t) => {
  const repo = makeRepo(t)
  const md = writePlan(repo.dir, plan([task(1)]))
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, '{')
  const r = runBin(PLAN_BIN, ['compile', md], repo.dir, { AETHER_LANES_CONFIG: file, AETHER_LANES: 'off' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.lanes, null)
})
