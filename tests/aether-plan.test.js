'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, writePlan, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

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
  assert.deepEqual(args.integration, { branch: 'feature/x', worktree: repo.dir })
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
