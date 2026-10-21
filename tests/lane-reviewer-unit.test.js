'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const fx = require('./lane-fixtures.js')

const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote a.js.', head: '', tests: '1/1 pass', concerns: '', question: '' })
const READY = JSON.stringify({ verdict: 'ready', findings: [], declined: [], summary: 'The diff does what the brief asks.' })
const flags = (digest, { role, model, effort, task = 'task-1' }) => ['--role', role, ...(task ? ['--task', task] : []), '--model', model, '--effort', effort, '--digest', digest]

// A compiled run whose unit branch holds one committed file, as a finished implementer leaves it.
function preparedUnit(t) {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  const call = 'task-1-1-implement'
  const digest = fx.writePrompt(args, call, `Do task-1.\nFAKE-AGY: write src/t1/a.js one\nFAKE-AGY: commit add a\nFAKE-AGY: answer ${DONE}`)
  assert.equal(fx.lane(args, 'start', [call, ...flags(digest, { role: 'implementer', model: 'claude-sonnet-5-5', effort: 'high' })], env).json.started, true)
  assert.equal(fx.waitDone(args, call, env).status, 'ok')
  const unit = path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-1')
  return { args, env, unit }
}

test('a reviewer call with a task reviews a disposable copy of the unit branch, with its brief and package, then the copy is removed', (t) => {
  const { args, env, unit } = preparedUnit(t)
  const call = 'task-1-review-1'
  const digest = fx.writePrompt(args, call, `Review the diff of task-1.\nFAKE-AGY: answer ${READY}`)
  const start = fx.lane(args, 'start', [call, ...flags(digest, { role: 'reviewer', model: 'claude-opus-5-5', effort: 'high' })], env)
  assert.deepEqual(start.json, { started: true, model: 'claude-opus-5-5-high', group: 'claude' })
  const done = fx.waitDone(args, call, env)
  assert.deepEqual([done.status, done.result.verdict], ['ok', 'ready'])
  const copy = path.join(args.repoRoot, '.aether', 'lanes', args.runId, call)
  const turn = fx.agyTurns(env).find((turn) => turn.cwd === copy)
  assert.ok(turn, 'the reviewer ran in the unit copy')
  assert.deepEqual([turn.head, turn.files], [fx.git(unit, 'rev-parse', 'HEAD'), ['brief.md', 'package.diff']])
  assert.equal(fx.argAfter(turn.argv, '--print-timeout'), '1200s', "the reviewer's own timeout")
  assert.ok(turn.argv[1].startsWith(fx.roleBody('reviewer')))
  assert.ok(turn.argv[1].includes("a disposable copy of the unit's branch, not of the integration branch; the unit's brief (brief.md) and the review package (package.diff) are in its .aether-tmp/ folder"), 'the unit note')
  assert.ok(!turn.argv[1].includes('Aether final reviewer'), 'the unit reviewer is not told it is the final reviewer')
  assert.equal(fs.existsSync(copy), false)
  assert.equal(fx.git(args.repoRoot, 'worktree', 'list').includes(copy), false)
})

test('a reviewer call with a task that writes to the real unit worktree is blocked', (t) => {
  const { args, env, unit } = preparedUnit(t)
  const call = 'task-1-review-1'
  const digest = fx.writePrompt(args, call, `FAKE-AGY: write-abs ${path.join(unit, 'src', 't1', 'z.js')} x\nFAKE-AGY: answer ${READY}`)
  fx.lane(args, 'start', [call, ...flags(digest, { role: 'reviewer', model: 'claude-opus-5-5', effort: 'high' })], env)
  const done = fx.waitDone(args, call, env)
  assert.deepEqual([done.status, done.detail, done.result], ['blocked', 'the unit worktree changed during a read-only lane call', null])
})

test('a reviewer call with a task that is not in the run is unavailable, and without a task it still reviews the integration branch', (t) => {
  const { args, env } = preparedUnit(t)
  const missing = fx.writePrompt(args, 'task-9-review-1', `FAKE-AGY: answer ${READY}`)
  const start = fx.lane(args, 'start', ['task-9-review-1', ...flags(missing, { role: 'reviewer', model: 'claude-opus-5-5', effort: 'high', task: 'task-9' })], env)
  assert.deepEqual(start.json, { unavailable: 'workspace' })
  // The final reviewer of today keeps its own test in tests/aether-lane.test.js, which this task does not change.
})
