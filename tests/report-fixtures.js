'use strict'

// A finished swarm run for the report tests: compiled at T0, its result saved 30 minutes later,
// and usage files for the run's session and for another session running at the same time.

const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { readJson, writeJson } = require('../plugins/aether/lib/run.js')
const { appendLog } = require('../plugins/aether/lib/lanes.js')

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
function entry(minutes, model, agent, kind, ms = 1000, effort = null) {
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, [kind]: 1e6 }
  return { t: T0 + minutes * MIN, ms, agent, model, effort, ...tokens }
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
// request from each aether agent, at its effort. Another session has main requests during the run.
function sampleUsage(dataDir) {
  const implementer = { type: 'aether:implementer', description: 'task-1: implement on haiku medium (attempt 1)' }
  writeUsage(dataDir, 'run-session', [
    {
      agents: { i1: implementer },
      entries: [entry(-5, OPUS, null, 'input'), entry(1, OPUS, null, 'input'), entry(5, HAIKU, 'i1', 'output', MIN, 'medium')],
    },
    {
      agents: {
        i1: implementer,
        s1: { type: 'aether:supervisor', description: 'task-1: supervise attempt 1 on sonnet xhigh' },
        r1: { type: 'aether:reviewer', description: 'final review' },
      },
      entries: [entry(10, SONNET, 's1', 'input', 1000, 'xhigh'), entry(20, OPUS, 'r1', 'output', 2 * MIN, 'high'), entry(31, OPUS, null, 'input')],
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

const GEMINI = 'gemini-3.8-flash-high'
const AGY_SONNET = 'claude-sonnet-5-5-high'
const AGY_OPUS = 'claude-opus-5-5-high'
const quota = (fiveHour, fiveReset, weekly, weeklyReset) => ({
  windows: { '5h': { remaining: fiveHour, resetsAt: fiveReset }, weekly: { remaining: weekly, resetsAt: weeklyReset } },
})

// The run session's lane log: a reading and three lane calls of the run, then one Designer round of
// another design in the same session. Each call's tokens are a million of one or two kinds.
function sampleLaneLog(dataDir, runId) {
  const at = (minutes) => T0 + minutes * MIN
  const call = (minutes, startedMinutes, fields) =>
    appendLog(dataDir, 'run-session', {
      kind: 'call',
      time: at(minutes),
      startedAt: at(startedMinutes),
      harness: 'agy',
      conversation: 'c',
      detail: '',
      durationMs: (minutes - startedMinutes) * MIN,
      ...fields,
    })
  appendLog(dataDir, 'run-session', {
    kind: 'reading',
    time: at(1),
    run: runId,
    design: null,
    harness: 'agy',
    version: '1.3.2',
    groups: { gemini: quota(0.9, 'R1', 0.96, 'W1'), claude: quota(0.97, 'R2', 0.98, 'W2') },
  })
  call(6, 3, {
    run: runId, design: null, call: 'task-1-1-implement', role: 'implementer', task: 'task-1', model: GEMINI, group: 'gemini', effort: 'xhigh', status: 'ok',
    usage: { input: 1e6, output: 0, thinking: 0, cacheRead: 0, total: 1e6 },
    quotaBefore: quota(0.9, 'R1', 0.96, 'W1'), quotaAfter: quota(0.85, 'R1', 0.95, 'W1'),
  })
  call(9, 7, {
    run: runId, design: null, call: 'task-1-1-supervise', role: 'supervisor', task: 'task-1', model: AGY_SONNET, group: 'claude', effort: 'high', status: 'ok',
    usage: { input: 0, output: 1e6, thinking: 0, cacheRead: 0, total: 1e6 },
    quotaBefore: quota(0.97, 'R2', 0.98, 'W2'), quotaAfter: quota(0.95, 'R2', 0.975, 'W2'),
  })
  call(12, 10, {
    run: runId, design: null, call: 'task-2-1-implement', role: 'implementer', task: 'task-2', model: GEMINI, group: 'gemini', effort: 'xhigh', status: 'failed',
    usage: { input: 1e6, output: 0, thinking: 0, cacheRead: 1e6, total: 1e6 },
    quotaBefore: quota(0.85, 'R1', 0.95, 'W1'), quotaAfter: quota(0.7, 'R3', 0.94, 'W1'),
  })
  call(40, 35, {
    run: null, design: '20261008-020000-beef', call: 'round-1', role: 'designer', task: null, model: AGY_OPUS, group: 'claude', effort: 'xhigh', status: 'ok',
    usage: { input: 0, output: 1e6, thinking: 0, cacheRead: 0, total: 1e6 },
    quotaBefore: quota(0.95, 'R2', 0.975, 'W2'), quotaAfter: quota(0.9, 'R2', 0.97, 'W2'),
  })
}

// A saved result whose rounds name their providers, with two calls that found the lanes full.
function laneResult(runId) {
  const result = sampleResult(runId)
  result.units[0].rounds = [
    { verdict: 'retry', findings: [], provider: `agy ${GEMINI}` },
    { verdict: 'approve', findings: [], provider: `agy ${GEMINI}` },
  ]
  result.units[0].attempts = 2
  result.lanes = { calls: 3, ok: 2, failed: 1, quota: 0, violation: 0, blocked: 0, unavailable: 0, dry: [] }
  return result
}

module.exports = {
  T0,
  MIN,
  OPUS,
  SONNET,
  HAIKU,
  GEMINI,
  AGY_SONNET,
  AGY_OPUS,
  sampleResult,
  sampleUsage,
  writeUsage,
  finishedRun,
  sampleLaneLog,
  laneResult,
}
