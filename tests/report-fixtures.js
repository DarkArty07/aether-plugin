'use strict'

// A finished swarm run for the report tests: compiled at T0, its result saved 30 minutes later,
// and usage files for the run's session and for another session running at the same time.

const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { readJson, writeJson } = require('../plugins/aether/lib/run.js')

const T0 = Date.parse('2026-10-08T01:00:00.000Z')
const MIN = 60 * 1000
const finding = (severity) => ({ severity, title: `${severity} finding`, file: 'src/a.js:1', evidence: 'x' })

function sampleResult(runId) {
  return {
    runId,
    units: [
      { id: 'task-1', status: 'merged', tiers: ['haiku'], attempts: 1, rounds: [{ verdict: 'approve', findings: [finding('minor')] }] },
      {
        id: 'task-2',
        status: 'merged',
        tiers: ['haiku', 'sonnet'],
        attempts: 3,
        rounds: [
          { verdict: 'retry', findings: [finding('important')] },
          { verdict: 'retry', findings: [finding('important'), finding('minor')] },
          { verdict: 'approve', findings: [] },
        ],
      },
      { id: 'task-3', status: 'blocked', tiers: ['haiku'], attempts: 1, question: 'Which format?', rounds: [{ verdict: 'block', findings: [finding('critical')] }] },
    ],
    finalReview: { status: 'done', verdict: 'ready-with-fixes', findings: [finding('important'), finding('minor'), finding('minor')], declined: [], summary: 'ok' },
    cleanup: { removedWorktrees: [], removedBranches: [], remaining: { worktrees: [], branches: [] } },
    agents: { total: 12, byRole: {}, byModel: {} },
    error: null,
  }
}

// One request, priced simply: a million tokens of one kind.
function entry(minutes, model, agent, kind, ms = 1000) {
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, [kind]: 1e6 }
  return { t: T0 + minutes * MIN, ms, agent, model, ...tokens }
}

const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const HAIKU = 'claude-haiku-5-5'

function writeUsage(dataDir, session, parts) {
  parts.forEach((part, i) => {
    writeJson(path.join(dataDir, 'usage', session, `${i}.json`), { session, part: i, claudeCode: '2.1.294', ...part })
  })
}

// The run's session, in two parts: main requests before, during and after the run, and one
// request from each aether agent. Another session has main requests during the run.
function sampleUsage(dataDir) {
  writeUsage(dataDir, 'run-session', [
    {
      agents: { i1: { type: 'aether:implementer', description: 'task-1: implement on haiku (attempt 1)' } },
      entries: [entry(-5, OPUS, null, 'input'), entry(1, OPUS, null, 'input'), entry(5, HAIKU, 'i1', 'output', MIN)],
    },
    {
      agents: {
        i1: { type: 'aether:implementer', description: 'task-1: implement on haiku (attempt 1)' },
        s1: { type: 'aether:supervisor', description: 'task-1: supervise attempt 1' },
        r1: { type: 'aether:reviewer', description: 'final review' },
      },
      entries: [entry(10, SONNET, 's1', 'input'), entry(20, OPUS, 'r1', 'output', 2 * MIN), entry(31, OPUS, null, 'input')],
    },
  ])
  writeUsage(dataDir, 'other-session', [{ agents: {}, entries: [entry(2, SONNET, null, 'input'), entry(3, SONNET, null, 'input'), entry(4, SONNET, null, 'input')] }])
}

function finishedRun(t, { result = true, testCommand = 'true' } = {}) {
  const repo = makeRepo(t)
  const args = compile(
    repo,
    plan([task(1), task(2), task(3, { depends: 'Task 1 — uses it' })], { execution: [`- Test command: \`${testCommand}\``] }),
  )
  const stateFile = path.join(args.runDir, 'state.json')
  writeJson(stateFile, { ...readJson(stateFile), compiledAt: new Date(T0).toISOString() })
  if (result) {
    const file = path.join(args.runDir, 'result.json')
    writeJson(file, sampleResult(args.runId))
    fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
  }
  return { repo, args }
}

module.exports = { T0, MIN, OPUS, SONNET, HAIKU, sampleResult, sampleUsage, writeUsage, finishedRun }
