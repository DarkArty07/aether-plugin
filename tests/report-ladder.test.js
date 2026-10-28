'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useDataDir } = require('./helpers.js')
const { T0, MIN, finishedRun } = require('./report-fixtures.js')
const { writeJson } = require('../plugins/aether/lib/run.js')
const { report, finalize } = require('../plugins/aether/lib/report.js')

const none = { exhausted: 0, repeated: 0, infeasible: 0 }
const ladder = (over = {}) => ({ steps: ['haiku'], firstTry: true, corrections: 0, rises: { ...none }, gateRejections: 0, filled: 0, ...over })
const unit = (id, status, block) => ({ id, status, tiers: ['haiku high'], attempts: 1, rounds: [], ...(block ? { ladder: block } : {}) })

function save(args, name, units, minutes) {
  const file = path.join(args.runDir, name)
  writeJson(file, { runId: args.runId, units, finalReview: { status: 'done', verdict: 'ready', findings: [] }, agents: { total: 9 } })
  fs.utimesSync(file, new Date(T0 + minutes * MIN), new Date(T0 + minutes * MIN))
}

test('the report counts first-try approvals, corrections, rises by cause, gate rejections and filled retries', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  save(args, 'result.json', [
    unit('task-1', 'merged', ladder()),
    unit('task-2', 'merged', ladder({ steps: ['haiku', 'sonnet'], firstTry: false, corrections: 3, rises: { ...none, repeated: 1 }, gateRejections: 2, filled: 1 })),
    unit('task-3', 'merged', ladder({ steps: ['haiku', 'sonnet', 'opus'], firstTry: false, corrections: 6, rises: { exhausted: 1, repeated: 0, infeasible: 1 } })),
  ], 30)
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual(
    { ...quality.ladder, units: undefined },
    { firstTry: 1, corrections: 9, rises: { exhausted: 1, repeated: 1, infeasible: 1 }, gateRejections: 2, filled: 1, units: undefined },
  )
  assert.deepEqual(quality.ladder.units.map((u) => [u.id, u.steps, u.firstTry, u.corrections]), [
    ['task-1', ['haiku'], true, 0],
    ['task-2', ['haiku', 'sonnet'], false, 3],
    ['task-3', ['haiku', 'sonnet', 'opus'], false, 6],
  ])
})

test('a unit that did not merge is no first-try approval', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  save(args, 'result.json', [unit('task-1', 'blocked', ladder())], 30)
  assert.equal(report(repo.dir, args.runId, { tests: false }).quality.ladder.firstTry, 0)
})

test('a result from before the change has no ladder block, and its report is read as it was', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.equal(quality.ladder, null)
  assert.equal(typeof quality.attempts, 'number')
  assert.equal(typeof quality.escalated, 'number')
})

test('counts add across launches, the steps are the union in order, and first-try is the last launch\'s', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  save(args, 'result-1.json', [unit('task-1', 'blocked', ladder({ firstTry: false, corrections: 2, gateRejections: 1 }))], 20)
  save(args, 'result.json', [
    unit('task-1', 'merged', ladder({ steps: ['haiku', 'sonnet'], firstTry: false, corrections: 1, rises: { ...none, repeated: 1 } })),
    unit('task-2', 'merged', ladder()),
  ], 30)
  const { quality } = report(repo.dir, args.runId, { tests: false })
  const one = quality.ladder.units.find((u) => u.id === 'task-1')
  assert.deepEqual([one.steps, one.corrections, one.gateRejections, one.rises.repeated, one.firstTry], [['haiku', 'sonnet'], 3, 1, 1, false])
  assert.equal(quality.ladder.firstTry, 1)
  assert.equal(quality.ladder.corrections, 3)
})

test('finalize writes the ladder counts to runs.jsonl, and a line from before the change is left as it was and still reads', (t) => {
  const dataDir = useDataDir(t)
  const before = JSON.stringify({ runId: '20250101-000000-aaaa', status: 'finalized', finalizedAt: '2025-01-01T00:00:00.000Z', repo: '/old', plan: null, versions: {}, report: { quality: { attempts: 3, climbed: 1, escalated: 0 } } })
  fs.writeFileSync(path.join(dataDir, 'runs.jsonl'), `${before}\n`)
  const { repo, args } = finishedRun(t)
  save(args, 'result.json', [unit('task-1', 'merged', ladder({ corrections: 2 }))], 30)
  finalize(repo.dir, args.runId, { tests: false, now: T0 + 40 * MIN })
  const lines = fs.readFileSync(path.join(dataDir, 'runs.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(lines.length, 2)
  assert.deepEqual(lines[0], JSON.parse(before))
  assert.equal(lines[0].report.quality.ladder, undefined)
  assert.deepEqual([lines[1].report.quality.ladder.firstTry, lines[1].report.quality.ladder.corrections], [1, 2])
})
