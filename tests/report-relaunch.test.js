'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useDataDir, tempDir } = require('./helpers.js')
const { T0, MIN, GEMINI, finishedRun, sampleLaneLog } = require('./report-fixtures.js')
const { writeJson } = require('../plugins/aether/lib/run.js')
const { appendLog } = require('../plugins/aether/lib/lanes.js')
const { report } = require('../plugins/aether/lib/report.js')

const at = (minutes) => T0 + minutes * MIN

// A lane call of the run, finished at `minutes` and started at `startedMinutes`, with one million input tokens.
function laneCall(dataDir, runId, { call, task, minutes, startedMinutes }) {
  appendLog(dataDir, 'run-session', {
    kind: 'call',
    time: at(minutes),
    startedAt: at(startedMinutes),
    session: 'run-session',
    run: runId,
    design: null,
    call,
    role: 'implementer',
    task,
    harness: 'agy',
    model: GEMINI,
    group: 'gemini',
    effort: 'xhigh',
    status: 'ok',
    durationMs: (minutes - startedMinutes) * MIN,
    conversation: 'c',
    detail: '',
    usage: { input: 1e6, output: 0, thinking: 0, cacheRead: 0, total: 1e6 },
    quotaBefore: null,
    quotaAfter: null,
  })
}

// Two launches of one run. The first launch saved its result as result-1.json at T0 + 30 minutes (finishedRun), and the
// relaunch saved result.json at T0 + 50 minutes. The first launch logged sampleLaneLog's three calls to the installed
// release's data directory. The relaunch ran from a development tree, whose data directory is aether-inline (run.js
// dataDir), and logged two calls there. Both directories sit under one plugins/data root.
function twoLaunches(t) {
  useDataDir(t)
  const dataRoot = path.join(tempDir(t, 'aether-plugins-'), 'plugins', 'data')
  const installed = path.join(dataRoot, 'aether-aether-plugin')
  const development = path.join(dataRoot, 'aether-inline')
  const { repo, args } = finishedRun(t)
  fs.renameSync(path.join(args.runDir, 'result.json'), path.join(args.runDir, 'result-1.json'))
  const latest = path.join(args.runDir, 'result.json')
  writeJson(latest, { units: [], finalReview: { status: 'done', verdict: 'ready', findings: [] }, agents: { total: 1 } })
  fs.utimesSync(latest, new Date(at(50)), new Date(at(50)))
  sampleLaneLog(installed, args.runId)
  laneCall(development, args.runId, { call: 'task-7-1-implement', task: 'task-7', minutes: 42, startedMinutes: 40 })
  laneCall(development, args.runId, { call: 'task-8-1-implement', task: 'task-8', minutes: 46, startedMinutes: 44 })
  return { repo, args, installed, development }
}

test('a relaunch from a development tree adds its lane calls: the report sums both launches (issue 107)', (t) => {
  const { repo, args, installed } = twoLaunches(t)
  const { run, totals } = report(repo.dir, args.runId, { dataDir: installed, tests: false }).lanes
  // Three calls of the first launch and two of the relaunch.
  assert.equal(run.calls, 5)
  assert.equal(run.tokens.input, 4e6)
  assert.equal(run.groups.gemini.calls, 4)
  assert.equal(totals.run.lanesUsd, run.usd)
})

test('a call written to two data directories is counted once', (t) => {
  const { repo, args, installed, development } = twoLaunches(t)
  const copied = fs.readFileSync(path.join(development, 'lanes', 'run-session.jsonl'), 'utf8')
  fs.mkdirSync(path.join(installed, 'lanes'), { recursive: true })
  fs.appendFileSync(path.join(installed, 'lanes', 'run-session.jsonl'), copied)
  const { run } = report(repo.dir, args.runId, { dataDir: installed, tests: false }).lanes
  assert.equal(run.calls, 5)
})
