'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useDataDir, age } = require('./helpers.js')
const { T0, MIN, OPUS, SONNET, HAIKU, GEMINI, sampleUsage, writeUsage, finishedRun, sampleLaneLog, laneResult } = require('./report-fixtures.js')
const { writeJson } = require('../plugins/aether/lib/run.js')
const { appendLog } = require('../plugins/aether/lib/lanes.js')
const { report, finalize, pruneUsage, seatsReport } = require('../plugins/aether/lib/report.js')
const { ensure, adoptUnit } = require('../plugins/aether/lib/worktrees.js')

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
const iso = (ms) => new Date(ms).toISOString()

test('report times the run, the swarm and the session, and picks the session that ran aether agents', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const r = report(repo.dir, args.runId, { tests: false })
  assert.equal(r.runId, args.runId)
  assert.deepEqual(r.usage, { session: 'run-session', claudeCode: '2.1.294', runRequests: 4, sessionRequests: 6 })
  assert.deepEqual(r.speed.run, { start: iso(T0), end: iso(T0 + 30 * MIN), ms: 30 * MIN })
  assert.deepEqual(r.speed.swarm, { start: iso(T0 + 4 * MIN), end: iso(T0 + 20 * MIN), ms: 16 * MIN })
  assert.deepEqual(r.speed.session, { start: iso(T0 - 5 * MIN - 1000), end: iso(T0 + 31 * MIN), ms: 36 * MIN + 1000 })
})

test('report prices the run window and the whole session, by model and by role', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const { cost } = report(repo.dir, args.runId, { tests: false })
  close(cost.run.usd, 4 + 0.5 + 2 + 20)
  close(cost.session.usd, 4 + 4 + 0.5 + 2 + 20 + 4)
  assert.equal(cost.run.requests, 4)
  close(cost.run.byModel[OPUS].usd, 24)
  close(cost.run.byModel[HAIKU].usd, 0.5)
  close(cost.run.byModel[SONNET].usd, 2)
  assert.deepEqual(cost.run.byModel[OPUS].tokens, { input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 })
  assert.deepEqual(Object.keys(cost.run.byRole).sort(), ['aether:implementer', 'aether:reviewer', 'aether:supervisor', 'main'])
  close(cost.run.byRole.main.usd, 4)
  close(cost.run.byRole['aether:reviewer'].usd, 20)
  assert.deepEqual(cost.run.unpriced, [])
  assert.match(cost.basis, /OpenRouter/)
})

test('report counts quality from the saved result, and runs the tests at integration', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const { quality } = report(repo.dir, args.runId)
  assert.deepEqual(quality, {
    units: 3,
    merged: 2,
    adopted: 0,
    integrated: 2,
    adoptedUnits: [],
    blocked: 1,
    questions: 1,
    skipped: 0,
    notRun: 0,
    escalated: 1,
    climbed: 0,
    attempts: 5,
    agents: 12,
    launches: 1,
    findings: { critical: 1, important: 2, minor: 2 },
    finalReview: { status: 'done', verdict: 'ready-with-fixes', findings: { critical: 0, important: 1, minor: 2 }, reviews: 1 },
    tests: { command: 'true', exitCode: 0, passed: true, timedOut: false, knownFailuresOnly: false },
  })
})

test('report says so when the tests fail at integration, or when nothing was measured', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t, { result: false, testCommand: 'false' })
  const r = report(repo.dir, args.runId)
  assert.equal(r.quality.tests.passed, false)
  assert.equal(r.quality.tests.exitCode, 1)
  assert.equal(r.quality.units, null)
  assert.equal(r.quality.climbed, null)
  assert.equal(r.quality.questions, null)
  assert.equal(r.radar.robust.testsPassed, false)
  assert.equal(r.cost, null)
  assert.deepEqual(r.usage, { session: null, claudeCode: null, runRequests: 0, sessionRequests: 0 })
  assert.match(r.notes.join('\n'), /no usage recorded/)
  assert.match(r.notes.join('\n'), /no result\.json/)
})

test('report uses the session it is given, and refuses one that does not exist or a missing run', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  assert.equal(report(repo.dir, args.runId, { session: 'other-session', tests: false }).usage.session, 'other-session')
  assert.throws(() => report(repo.dir, args.runId, { session: 'nope', tests: false }), /usage session nope not found/)
  assert.throws(() => report(repo.dir, '20991231-000000-abcd', { tests: false }), /run 20991231-000000-abcd not found/)
})

test('finalize appends the record with versions, then removes the run and its leftovers', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const unit = ensure(repo.dir, args.runId, 'task-2')
  const out = finalize(repo.dir, args.runId, { tests: false, now: T0 + 40 * MIN })
  const lines = fs.readFileSync(path.join(dataDir, 'runs.jsonl'), 'utf8').trim().split('\n')
  const record = JSON.parse(lines[lines.length - 1])
  assert.equal(record.runId, args.runId)
  assert.equal(record.status, 'finalized')
  assert.equal(record.finalizedAt, iso(T0 + 40 * MIN))
  assert.equal(record.repo, repo.dir)
  // The aether version comes from the manifest, so a version bump does not break this test.
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.deepEqual(record.versions, { aether: manifest.version, claudeCode: '2.1.294' })
  close(record.report.cost.run.usd, 26.5)
  assert.deepEqual(out.cleanup.remaining, { worktrees: [], branches: [] })
  assert.equal(fs.existsSync(args.runDir), false)
  assert.equal(fs.existsSync(unit.path), false)
})

test('a session whose only part is unreadable is skipped, not fatal', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  fs.mkdirSync(path.join(dataDir, 'usage', 'broken'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'usage', 'broken', '0.json'), '{"session": "broken", "entries": [')
  fs.mkdirSync(path.join(dataDir, 'usage', 'empty'))
  const { repo, args } = finishedRun(t)
  assert.equal(report(repo.dir, args.runId, { tests: false }).usage.session, 'run-session')
})

test('report adds up every launch of a relaunched run', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  // aether-plan compile --run archived the first launch's result; the relaunch merged task-3 on sonnet
  fs.renameSync(path.join(args.runDir, 'result.json'), path.join(args.runDir, 'result-1.json'))
  const minor = { severity: 'minor', title: 't', file: 'f', evidence: 'e' }
  const file = path.join(args.runDir, 'result.json')
  writeJson(file, {
    units: [{ id: 'task-3', status: 'merged', tiers: ['sonnet'], attempts: 1, rounds: [{ verdict: 'approve', findings: [minor] }] }],
    finalReview: { status: 'done', verdict: 'ready', findings: [] },
    agents: { total: 5 },
  })
  fs.utimesSync(file, new Date(T0 + 50 * MIN), new Date(T0 + 50 * MIN))
  const { quality, speed } = report(repo.dir, args.runId, { tests: false })
  assert.equal(speed.run.end, iso(T0 + 50 * MIN))
  assert.deepEqual(
    { launches: quality.launches, units: quality.units, merged: quality.merged, blocked: quality.blocked, escalated: quality.escalated, attempts: quality.attempts, agents: quality.agents },
    { launches: 2, units: 3, merged: 3, blocked: 0, escalated: 2, attempts: 6, agents: 17 },
  )
  assert.deepEqual(quality.findings, { critical: 1, important: 2, minor: 3 })
  assert.deepEqual(quality.finalReview, { status: 'done', verdict: 'ready', findings: { critical: 0, important: 1, minor: 2 }, reviews: 2 })
})

test('report reads only the usage sessions written to since the run began', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  // This session's entries fall in the window, but its files were last written before the run.
  const many = Array.from({ length: 5 }, (_, i) => ({ t: T0 + (i + 1) * MIN, ms: 1, agent: 'x', model: HAIKU, input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }))
  writeUsage(dataDir, 'old-session', [{ agents: { x: { type: 'aether:implementer', description: 'old' } }, entries: many }])
  const old = path.join(dataDir, 'usage', 'old-session')
  for (const name of ['', '0.json']) fs.utimesSync(path.join(old, name), new Date(T0 - 60 * MIN), new Date(T0 - 60 * MIN))
  const { repo, args } = finishedRun(t)
  assert.equal(report(repo.dir, args.runId, { tests: false }).usage.session, 'run-session')
})

test('pruneUsage deletes the usage sessions not written to within the retention period', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  age(path.join(dataDir, 'usage', 'other-session'), 24 * 31)
  assert.deepEqual(pruneUsage(dataDir, { days: 30 }), { pruned: ['other-session'] })
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'other-session')), false)
  assert.ok(fs.existsSync(path.join(dataDir, 'usage', 'run-session')))
  assert.deepEqual(pruneUsage(path.join(dataDir, 'nowhere'), { days: 30 }), { pruned: [] })
})

test('report gives cost, output tokens and time by role, model and effort', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const { cost } = report(repo.dir, args.runId, { tests: false })
  const byEffort = cost.run.byEffort
  assert.deepEqual(Object.keys(byEffort).sort(), [
    'aether:implementer claude-haiku-5-5 medium',
    'aether:reviewer claude-opus-5-5 high',
    'aether:supervisor claude-sonnet-5-5 xhigh',
    'main claude-opus-5-5 unknown',
  ])
  const implementer = byEffort['aether:implementer claude-haiku-5-5 medium']
  close(implementer.usd, 0.5)
  assert.deepEqual([implementer.requests, implementer.outputTokens, implementer.ms], [1, 1e6, MIN])
  const reviewer = byEffort['aether:reviewer claude-opus-5-5 high']
  close(reviewer.usd, 20)
  assert.deepEqual([reviewer.requests, reviewer.outputTokens, reviewer.ms], [1, 1e6, 2 * MIN])
  const main = byEffort['main claude-opus-5-5 unknown']
  close(main.usd, 4)
  assert.deepEqual([main.requests, main.outputTokens], [1, 0])
  // The whole session also counts the main requests before and after the run, which carry no effort.
  assert.equal(cost.session.byEffort['main claude-opus-5-5 unknown'].requests, 3)
})

test('report lists each agent of the run in the order of its first request, with its label, model and effort', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const { cost } = report(repo.dir, args.runId, { tests: false })
  const { agents } = cost.run
  assert.deepEqual(
    agents.map(({ usd, ...rest }) => rest),
    [
      { agent: null, type: 'main', label: null, model: OPUS, effort: null, requests: 1, outputTokens: 0, ms: 1000 },
      { agent: 'i1', type: 'aether:implementer', label: 'task-1: implement on haiku medium (attempt 1)', model: HAIKU, effort: 'medium', requests: 1, outputTokens: 1e6, ms: MIN },
      { agent: 's1', type: 'aether:supervisor', label: 'task-1: supervise attempt 1 on sonnet xhigh', model: SONNET, effort: 'xhigh', requests: 1, outputTokens: 0, ms: 1000 },
      { agent: 'r1', type: 'aether:reviewer', label: 'final review', model: OPUS, effort: 'high', requests: 1, outputTokens: 1e6, ms: 2 * MIN },
    ],
  )
  close(agents[0].usd, 4)
  close(agents[3].usd, 20)
  assert.equal(cost.session.agents, undefined)
})

test('an agent that ran at several efforts lists them in the order it used them', (t) => {
  const dataDir = useDataDir(t)
  const at = (minutes, effort) => ({ t: T0 + minutes * MIN, ms: 1000, agent: 'a1', model: HAIKU, effort, input: 0, output: 1, cacheRead: 0, cacheWrite: 0 })
  writeUsage(dataDir, 'one-agent', [
    {
      agents: { a1: { type: 'aether:implementer', description: 'task-1: implement on haiku medium (attempt 1)' } },
      entries: [at(1, 'medium'), at(2, 'xhigh'), at(3, 'medium'), at(4, null)],
    },
  ])
  const { repo, args } = finishedRun(t)
  const [item] = report(repo.dir, args.runId, { session: 'one-agent', tests: false }).cost.run.agents
  assert.deepEqual([item.agent, item.model, item.effort, item.requests, item.outputTokens], ['a1', HAIKU, 'medium, xhigh', 4, 4])
})

test('report counts climbs apart from escalations, from the rungs in each unit\'s tiers', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const file = path.join(args.runDir, 'result.json')
  writeJson(file, {
    units: [
      { id: 'task-1', status: 'merged', tiers: ['haiku medium', 'haiku xhigh'], attempts: 2, rounds: [] },
      { id: 'task-2', status: 'merged', tiers: ['haiku xhigh', 'sonnet xhigh'], attempts: 3, rounds: [] },
      { id: 'task-3', status: 'merged', tiers: ['sonnet high', 'sonnet xhigh', 'opus xhigh'], attempts: 3, rounds: [] },
    ],
    finalReview: { status: 'done', verdict: 'ready', findings: [] },
    agents: { total: 9 },
  })
  fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual([quality.climbed, quality.escalated], [2, 2])
})

test('a relaunch on the same model is no escalation, and a relaunch on another model is one', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  writeJson(path.join(args.runDir, 'result-1.json'), {
    units: [
      { id: 'task-1', status: 'merged', tiers: ['haiku xhigh'], attempts: 1, rounds: [] },
      { id: 'task-2', status: 'blocked', tiers: ['haiku medium'], attempts: 1, rounds: [] },
      { id: 'task-3', status: 'blocked', tiers: ['haiku xhigh'], attempts: 1, rounds: [] },
    ],
    agents: { total: 6 },
  })
  const file = path.join(args.runDir, 'result.json')
  writeJson(file, {
    units: [
      { id: 'task-2', status: 'merged', tiers: ['haiku medium'], attempts: 1, rounds: [] },
      { id: 'task-3', status: 'merged', tiers: ['sonnet xhigh'], attempts: 1, rounds: [] },
    ],
    agents: { total: 4 },
  })
  fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual([quality.launches, quality.escalated, quality.climbed], [2, 1, 0])
})

test('a unit skipped in the first launch and run in the relaunch is no escalation', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  writeJson(path.join(args.runDir, 'result-1.json'), {
    units: [
      { id: 'task-1', status: 'merged', tiers: ['haiku xhigh'], attempts: 1, rounds: [] },
      { id: 'task-2', status: 'skipped', tiers: [], attempts: 0, rounds: [] },
      { id: 'task-3', status: 'skipped', tiers: [], attempts: 0, rounds: [] },
    ],
    agents: { total: 3 },
  })
  const file = path.join(args.runDir, 'result.json')
  writeJson(file, {
    units: [
      { id: 'task-2', status: 'merged', tiers: ['haiku xhigh'], attempts: 1, rounds: [] },
      { id: 'task-3', status: 'merged', tiers: ['sonnet xhigh'], attempts: 1, rounds: [] },
    ],
    agents: { total: 4 },
  })
  fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual([quality.launches, quality.escalated, quality.climbed], [2, 0, 0])
})

test('report adds the lanes: calls, tokens and dollars by group, model and role, quota per window, and the share the plans covered', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  writeJson(path.join(args.runDir, 'result.json'), laneResult(args.runId))
  fs.utimesSync(path.join(args.runDir, 'result.json'), new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
  sampleLaneLog(dataDir, args.runId)
  const r = report(repo.dir, args.runId, { dataDir, tests: false })
  const { run, session, totals } = r.lanes
  assert.equal(r.lanes.version, '1.3.2')

  assert.equal(run.calls, 3)
  close(run.usd, 11.575)
  assert.deepEqual(run.tokens, { input: 2e6, output: 1e6, cacheRead: 1e6 })
  assert.equal(run.groups.gemini.calls, 2)
  close(run.groups.gemini.usd, 1.575)
  assert.deepEqual(run.groups.gemini.tokens, { input: 2e6, output: 0, cacheRead: 1e6 })
  close(run.groups.gemini.quota['5h'].consumed, 0.05)
  assert.equal(run.groups.gemini.quota['5h'].resets, 1)
  close(run.groups.gemini.quota.weekly.consumed, 0.02)
  close(run.groups.claude.quota['5h'].consumed, 0.02)
  close(run.groups.claude.quota.weekly.consumed, 0.005)
  assert.deepEqual(run.byModel[GEMINI], { calls: 2, ok: 1, failed: 1, quota: 0, violation: 0, blocked: 0, usd: run.byModel[GEMINI].usd })
  close(run.byModel[GEMINI].usd, 1.575)
  close(run.byModel['claude-sonnet-5-5-high'].usd, 10)
  assert.deepEqual(Object.keys(run.byRole).sort(), ['implementer', 'supervisor'])
  assert.equal(run.byRole.implementer.calls, 2)
  assert.deepEqual(run.attempts, { [GEMINI]: { attempts: 2, approved: 1 } })

  assert.equal(session.calls, 4)
  close(session.usd, 31.575)
  close(session.groups.claude.quota['5h'].consumed, 0.07)
  close(session.groups.claude.quota.weekly.consumed, 0.01)
  assert.equal(session.byRole.designer.calls, 1)

  close(totals.run.nativeUsd, r.cost.run.usd)
  close(totals.run.lanesUsd, 11.575)
  close(totals.run.totalUsd, r.cost.run.usd + 11.575)
  close(totals.run.coveredShare, 11.575 / (r.cost.run.usd + 11.575))
  close(totals.session.nativeUsd, r.cost.session.usd)
  close(totals.session.lanesUsd, 31.575)
})

test('a run without lane calls reports empty lanes, and an unpriced lane model is noted', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const empty = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.equal(empty.lanes.run.calls, 0)
  assert.equal(empty.lanes.totals.run.lanesUsd, 0)
  assert.equal(empty.lanes.totals.run.coveredShare, 0)
  assert.deepEqual([empty.lanes.version, empty.lanes.run.groups], [null, {}])
  assert.deepEqual(empty.lanes.run.byHarness, {})
  appendLog(dataDir, 'run-session', {
    kind: 'call', time: T0 + 5 * MIN, startedAt: T0 + 4 * MIN, session: 'run-session', run: args.runId, design: null, call: 'task-1-1-implement',
    role: 'implementer', task: 'task-1', harness: 'agy', model: 'mystery-1-high', group: 'gemini', effort: 'xhigh', status: 'ok', durationMs: MIN,
    usage: { input: 1e6, output: 0, thinking: 0, cacheRead: 0, total: 1e6 }, conversation: 'c', quotaBefore: null, quotaAfter: null, detail: '',
  })
  const noted = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.equal(noted.lanes.run.calls, 1)
  assert.equal(noted.lanes.run.usd, 0)
  assert.ok(noted.notes.includes('no price for lane model mystery-1-high'))
})

test('finalize records the agy version the lane log saw', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  const { record } = finalize(repo.dir, args.runId, { dataDir, tests: false })
  assert.equal(record.versions.agy, '1.3.2')
})

test('report counts a question only when the unit\'s latest launch ends it blocked with one', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  writeJson(path.join(args.runDir, 'result-1.json'), {
    units: [
      { id: 'task-1', status: 'blocked', tiers: ['haiku'], attempts: 1, question: 'Which format?', rounds: [] },
      { id: 'task-2', status: 'blocked', tiers: ['haiku'], attempts: 1, rounds: [] },
    ],
    agents: { total: 2 },
  })
  const file = path.join(args.runDir, 'result.json')
  writeJson(file, {
    units: [
      { id: 'task-1', status: 'blocked', tiers: ['haiku'], attempts: 1, rounds: [] },
      { id: 'task-2', status: 'blocked', tiers: ['haiku'], attempts: 1, question: 'Which API?', rounds: [] },
      { id: 'task-3', status: 'blocked', tiers: ['haiku'], attempts: 1, question: '', rounds: [] },
      { id: 'task-4', status: 'merged', tiers: ['haiku'], attempts: 1, question: 'Which tier?', rounds: [] },
    ],
    agents: { total: 4 },
  })
  fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual([quality.blocked, quality.questions], [3, 1])
})

test('report splits the lane calls by harness, and a call with no harness counts as agy', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  // Two codex calls, and one call logged before the harness was named. Each is a million output tokens of haiku: $0.50.
  const at = (minutes) => T0 + minutes * MIN
  const call = (minutes, fields) =>
    appendLog(dataDir, 'run-session', {
      kind: 'call',
      time: at(minutes),
      startedAt: at(minutes - 1),
      session: 'run-session',
      run: args.runId,
      design: null,
      role: 'implementer',
      task: 'task-3',
      model: HAIKU,
      group: 'codex',
      effort: 'high',
      durationMs: MIN,
      usage: { input: 0, output: 1e6, thinking: 0, cacheRead: 0, total: 1e6 },
      conversation: 'c',
      quotaBefore: null,
      quotaAfter: null,
      detail: '',
      ...fields,
    })
  call(15, { harness: 'codex', call: 'task-3-1-implement', status: 'ok' })
  call(18, { harness: 'codex', call: 'task-3-2-implement', status: 'quota' })
  call(21, { call: 'task-3-1-supervise', role: 'supervisor', status: 'failed' })
  const r = report(repo.dir, args.runId, { dataDir, tests: false })
  const { byHarness } = r.lanes.run
  assert.deepEqual(Object.keys(byHarness).sort(), ['agy', 'codex'])
  assert.deepEqual(
    { ...byHarness.codex, usd: 0 },
    { calls: 2, ok: 1, failed: 0, quota: 1, violation: 0, blocked: 0, usd: 0, tokens: { input: 0, output: 2e6, cacheRead: 0 } },
  )
  close(byHarness.codex.usd, 1)
  assert.deepEqual(
    { ...byHarness.agy, usd: 0 },
    { calls: 4, ok: 2, failed: 2, quota: 0, violation: 0, blocked: 0, usd: 0, tokens: { input: 2e6, output: 2e6, cacheRead: 1e6 } },
  )
  close(byHarness.agy.usd, 12.075)
  assert.equal(r.lanes.session.byHarness.agy.calls, 5)
  assert.deepEqual(r.radar.delegation.byHarness, { agy: 4, codex: 2 })
})

test('report gives the RADAR figures from the run, its lanes, its cost and its quality', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  const { radar } = report(repo.dir, args.runId, { dataDir })
  const nativeUsd = 26.5
  const lanesUsd = 11.575
  assert.deepEqual(Object.keys(radar), ['rapid', 'autonomous', 'delegation', 'affordable', 'robust'])
  assert.deepEqual(radar.rapid, { runMs: 30 * MIN, attempts: 5, climbed: 0, escalated: 1 })
  assert.deepEqual(radar.autonomous, { questions: 1 })
  assert.equal(radar.delegation.laneCalls, 3)
  close(radar.delegation.nativeUsd, nativeUsd)
  close(radar.delegation.lanesUsd, lanesUsd)
  close(radar.delegation.laneShare, lanesUsd / (nativeUsd + lanesUsd))
  assert.deepEqual(radar.delegation.byHarness, { agy: 3 })
  close(radar.affordable.totalUsd, nativeUsd + lanesUsd)
  close(radar.affordable.nativeUsd, nativeUsd)
  close(radar.affordable.lanesUsd, lanesUsd)
  assert.deepEqual(radar.robust, {
    merged: 2,
    adopted: 0,
    blocked: 1,
    testsPassed: true,
    testsKnownFailuresOnly: false,
    findings: { critical: 1, important: 2, minor: 2 },
    finalVerdict: 'ready-with-fixes',
  })
})

test('a RADAR figure is null where nothing measured it: no usage and no saved result', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t, { result: false })
  const { radar } = report(repo.dir, args.runId, { tests: false, now: T0 + 10 * MIN })
  assert.deepEqual(radar, {
    rapid: { runMs: 10 * MIN, attempts: null, climbed: null, escalated: null },
    autonomous: { questions: null },
    delegation: { laneCalls: 0, nativeUsd: null, lanesUsd: 0, laneShare: null, byHarness: {}, byGroup: {}, work: { calls: 0, external: 0, native: 0, externalShare: null }, quotaByHarness: {} },
    affordable: { totalUsd: null, nativeUsd: null, lanesUsd: 0 },
    robust: { merged: null, adopted: null, blocked: null, testsPassed: null, testsKnownFailuresOnly: null, findings: null, finalVerdict: null },
  })
})

test('with usage but no saved result, the cost and lane figures are known and the quality figures are null', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t, { result: false })
  const { radar } = report(repo.dir, args.runId, { dataDir, tests: false, now: T0 + 12 * MIN })
  assert.deepEqual(radar.rapid, { runMs: 12 * MIN, attempts: null, climbed: null, escalated: null })
  assert.deepEqual(radar.autonomous, { questions: null })
  assert.deepEqual([radar.delegation.laneCalls, radar.delegation.lanesUsd, radar.delegation.laneShare, radar.delegation.byHarness], [0, 0, 0, {}])
  close(radar.delegation.nativeUsd, 6.5)
  close(radar.affordable.nativeUsd, 6.5)
  close(radar.affordable.totalUsd, 6.5)
  assert.deepEqual(radar.robust, { merged: null, adopted: null, blocked: null, testsPassed: null, testsKnownFailuresOnly: null, findings: null, finalVerdict: null })
})

test('the note for a run with no usage tells how to start an Aether session', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t, { result: false, testCommand: 'false' })
  const r = report(repo.dir, args.runId)
  assert.ok(r.notes.includes('no usage recorded during the run: was the session started with claude --agent aether:lead?'), r.notes.join('\n'))
})

test('the lane log gives each harness its newest version, and lanes.version stays the agy version', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  const reading = (minutes, harness, version) =>
    appendLog(dataDir, 'run-session', { kind: 'reading', time: T0 + minutes * MIN, run: args.runId, design: null, harness, version, groups: {} })
  reading(2, 'codex', '0.40.0')
  reading(3, 'grok', '0.9.1')
  reading(4, 'codex', '0.41.0')
  reading(5, 'cursor', null)
  const r = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual(r.lanes.versions, { agy: '1.3.2', codex: '0.41.0', grok: '0.9.1' })
  assert.equal(r.lanes.version, '1.3.2')
})

test("a lane reading that names no harness is agy's, and the newest agy reading wins", (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const reading = (minutes, fields) =>
    appendLog(dataDir, 'run-session', { kind: 'reading', time: T0 + minutes * MIN, run: args.runId, design: null, groups: {}, ...fields })
  reading(1, { version: '1.2.0' })
  let r = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual([r.lanes.version, r.lanes.versions], ['1.2.0', { agy: '1.2.0' }])
  reading(2, { harness: 'agy', version: '1.3.2' })
  r = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual(r.lanes.versions, { agy: '1.3.2' })
})

test('finalize records the version of each lane harness the log saw, agy as before', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  appendLog(dataDir, 'run-session', { kind: 'reading', time: T0 + 2 * MIN, run: args.runId, design: null, harness: 'codex', version: '0.41.0', groups: {} })
  const { record } = finalize(repo.dir, args.runId, { dataDir, tests: false })
  assert.equal(record.versions.agy, '1.3.2')
  assert.equal(record.versions.codex, '0.41.0')
  assert.deepEqual(Object.keys(record.versions).sort(), ['aether', 'agy', 'claudeCode', 'codex'])
})

test('report counts the rounds of every lane harness by model, and a native round counts nowhere', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const round = (provider, verdict) => ({ verdict, findings: [], provider })
  const file = path.join(args.runDir, 'result.json')
  writeJson(file, {
    units: [
      { id: 'task-1', status: 'merged', tiers: [], attempts: 2, rounds: [round('codex gpt-test-1', 'retry'), round('codex gpt-test-1', 'approve')] },
      { id: 'task-2', status: 'merged', tiers: [], attempts: 1, rounds: [round('grok grok-test-1', 'approve')] },
      { id: 'task-3', status: 'merged', tiers: [], attempts: 2, rounds: [round('cursor cursor-test-1', 'retry'), round('native', 'approve')] },
    ],
    finalReview: { status: 'done', verdict: 'ready', findings: [] },
    agents: { total: 5 },
  })
  fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
  const { lanes } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual(lanes.run.attempts, {
    'gpt-test-1': { attempts: 2, approved: 1 },
    'grok-test-1': { attempts: 1, approved: 1 },
    'cursor-test-1': { attempts: 1, approved: 0 },
  })
})

test('the test command is known-failures-only when it fails on what the baseline lists, and on nothing else', (t) => {
  useDataDir(t)
  const command = "echo 'not ok 1 - adds'; exit 1"
  const { repo, args } = finishedRun(t, { result: false, testCommand: command })
  const baseline = path.join(args.runDir, 'baseline.json')
  writeJson(baseline, { recordedAt: iso(T0), exitCode: 1, signatures: ['adds'], timedOut: false })
  const { quality, radar } = report(repo.dir, args.runId)
  assert.deepEqual(quality.tests, { command, exitCode: 1, passed: false, timedOut: false, knownFailuresOnly: true })
  assert.equal(radar.robust.testsKnownFailuresOnly, true)
  writeJson(baseline, { recordedAt: iso(T0), exitCode: 1, signatures: ['other'], timedOut: false })
  assert.equal(report(repo.dir, args.runId).quality.tests.knownFailuresOnly, false)
  fs.rmSync(baseline)
  assert.equal(report(repo.dir, args.runId).quality.tests.knownFailuresOnly, false)
})

test('the test command is not known-failures-only when it passed, or was killed rather than finished', (t) => {
  useDataDir(t)
  const judged = (testCommand) => {
    const { repo, args } = finishedRun(t, { result: false, testCommand })
    writeJson(path.join(args.runDir, 'baseline.json'), { recordedAt: iso(T0), exitCode: 1, signatures: ['adds'], timedOut: false })
    return report(repo.dir, args.runId).quality.tests
  }
  assert.equal(judged('true').knownFailuresOnly, false)
  // A command killed by a signal did not finish, so its output cannot show that only known tests fail.
  const killed = judged("echo 'not ok 1 - adds'; kill -9 $$")
  assert.deepEqual([killed.exitCode, killed.timedOut, killed.knownFailuresOnly], [null, false, false])
})


test('report counts a unit the Lead adopted as integrated, with how, and no longer as blocked', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  // task-3 ended blocked in the swarm; the Lead integrated it by hand, and its commit is on the branch.
  const sha = repo.git('rev-parse', 'HEAD')
  adoptUnit(repo.dir, args.runId, 'task-3', { commit: sha, reason: 'applied its saved patch by hand' })
  const r = report(repo.dir, args.runId, { tests: false })
  const { quality } = r
  assert.deepEqual(
    { units: quality.units, merged: quality.merged, adopted: quality.adopted, integrated: quality.integrated, blocked: quality.blocked, questions: quality.questions },
    { units: 3, merged: 2, adopted: 1, integrated: 3, blocked: 0, questions: 0 },
  )
  assert.deepEqual(quality.adoptedUnits, [{ id: 'task-3', commit: sha, reason: 'applied its saved patch by hand', was: 'blocked' }])
  assert.ok(r.notes.some((n) => n === `task-3 was integrated by hand at ${sha.slice(0, 10)}: applied its saved patch by hand`), r.notes.join('\n'))
  assert.deepEqual([r.radar.robust.merged, r.radar.robust.adopted, r.radar.robust.blocked], [2, 1, 0])
})

test('a unit the swarm merged is not counted as adopted, and a report with no adoption has none', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const sha = repo.git('rev-parse', 'HEAD')
  const none = report(repo.dir, args.runId, { tests: false }).quality
  assert.deepEqual([none.adopted, none.integrated, none.adoptedUnits], [0, 2, []])
  adoptUnit(repo.dir, args.runId, 'task-1', { commit: sha, reason: 'redundant' })
  const same = report(repo.dir, args.runId, { tests: false }).quality
  assert.deepEqual([same.merged, same.adopted, same.integrated, same.adoptedUnits], [2, 0, 2, []])
})

// ---- spec 002, R16 and R18: the balance of each group, and what each call chose ----

// A grok group's reading in the shape the adapter gives, read as 0% used, and a window of agy's.
const grokGroup = (remaining, extra = {}) => ({ windows: { weekly: { remaining, resetsAt: '2026-10-17T09:08:51.805Z' } }, usedPercent: null, usedPercentAbsent: true, ...extra })
const agyGroup = (weekly, fiveHour) => ({ windows: { weekly: { remaining: weekly, resetsAt: '2026-10-21T03:35:44.000Z' }, '5h': { remaining: fiveHour, resetsAt: iso(T0 + 4 * 3600 * 1000) } } })

function choiceEntry(runId, minutes, fields) {
  return { kind: 'choice', time: T0 + minutes * MIN, session: null, run: runId, design: null, requested: 46.8, reference: { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', intelligence: 46.8 }, native: { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', family: 'claude-sonnet-5-5', intelligence: 46.8 }, ...fields }
}
const tookEntry = (runId, minutes, fields) => ({ kind: 'took', time: T0 + minutes * MIN, session: null, run: runId, ...fields })
const OPUS_MEDIUM = { id: 'agy/claude-opus-5-5@medium', harness: 'agy', model: 'claude-opus-5-5', effort: 'medium', group: 'claude', family: 'claude-opus-5-5', intelligence: 51.2, costPerTaskUsd: 1.34 }

test('report gives, per group, the balance at the start and at the end of the run, the next reset, and the calls', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  const at = (minutes) => T0 + minutes * MIN
  const call = (minutes, startedMinutes, fields) =>
    appendLog(dataDir, 'run-session', { kind: 'call', time: at(minutes), startedAt: at(startedMinutes), conversation: 'c', detail: '', durationMs: (minutes - startedMinutes) * MIN, usage: { input: 1e6, output: 0, thinking: 0, cacheRead: 0, total: 1e6 }, ...fields })
  appendLog(dataDir, 'run-session', { kind: 'reading', time: at(1), run: args.runId, design: null, harness: 'grok', version: '1.0.52', groups: { grok: grokGroup(1) } })
  appendLog(dataDir, 'run-session', { kind: 'reading', time: at(1), run: args.runId, design: null, harness: 'agy', version: '1.3.2', groups: { gemini: agyGroup(1, 1) } })
  call(8, 5, { run: args.runId, design: null, call: 'task-1-1-implement', role: 'implementer', task: 'task-1', harness: 'grok', model: 'grok-4.7', group: 'grok', effort: 'xhigh', status: 'ok', quotaBefore: grokGroup(1), quotaAfter: grokGroup(0.97) })
  call(15, 10, { run: args.runId, design: null, call: 'task-2-1-implement', role: 'implementer', task: 'task-2', harness: 'agy', model: GEMINI, group: 'gemini', effort: 'xhigh', status: 'ok', quotaBefore: agyGroup(1, 1), quotaAfter: agyGroup(0.99, 0.8) })
  const { lanes, radar } = report(repo.dir, args.runId, { dataDir, tests: false })
  const { grok, gemini } = lanes.run.groups
  assert.deepEqual(grok.balance, {
    start: { weekly: 1 },
    end: { weekly: { remaining: 0.97, resetsAt: '2026-10-17T09:08:51.805Z' } },
    nextReset: '2026-10-17T09:08:51.805Z',
    usedPercentAbsent: true,
  })
  assert.equal(grok.calls, 1)
  assert.deepEqual(gemini.balance, {
    start: { weekly: 1, '5h': 1 },
    end: { weekly: { remaining: 0.99, resetsAt: '2026-10-21T03:35:44.000Z' }, '5h': { remaining: 0.8, resetsAt: iso(T0 + 4 * 3600 * 1000) } },
    nextReset: '2026-10-21T03:35:44.000Z',
    usedPercentAbsent: false,
  })
  assert.deepEqual(radar.delegation.byGroup, { grok: { calls: 1, balance: grok.balance }, gemini: { calls: 1, balance: gemini.balance } })
})

// A reading and a grok call as the lane log writes them, for the balance tests below.
const readingEntry = (runId, minutes, harness, groups) => ({ kind: 'reading', time: T0 + minutes * MIN, run: runId, design: null, harness, version: '1.0.52', groups })
const laneCall = (runId, minutes, startedMinutes, fields) => ({
  kind: 'call', time: T0 + minutes * MIN, startedAt: T0 + startedMinutes * MIN, conversation: 'c', detail: '', durationMs: (minutes - startedMinutes) * MIN,
  usage: { input: 1e6, output: 0, thinking: 0, cacheRead: 0, total: 1e6 },
  run: runId, design: null, call: 'task-1-1-implement', role: 'implementer', task: 'task-1', harness: 'grok', model: 'grok-4.7', group: 'grok', effort: 'xhigh', status: 'ok', ...fields,
})

test('a reading logged after the run ended, such as a hand-run status, does not move the balance at the end or the next reset', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  appendLog(dataDir, 'run-session', readingEntry(args.runId, 1, 'grok', { grok: grokGroup(1) }))
  appendLog(dataDir, 'run-session', laneCall(args.runId, 8, 5, { quotaBefore: grokGroup(1), quotaAfter: grokGroup(0.9) }))
  const before = report(repo.dir, args.runId, { dataDir, tests: false })
  // Two days later, after the period turned over: the reading belongs to that moment, not to the run.
  const later = grokGroup(0.2)
  later.windows.weekly.resetsAt = '2026-10-28T03:35:44.000Z'
  appendLog(dataDir, 'run-session', readingEntry(args.runId, 2 * 24 * 60, 'grok', { grok: later }))
  const after = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual(after.lanes.run.groups.grok.balance, before.lanes.run.groups.grok.balance)
  assert.deepEqual(after.lanes.run.groups.grok.balance.end, { weekly: { remaining: 0.9, resetsAt: '2026-10-17T09:08:51.805Z' } })
  assert.equal(after.lanes.run.groups.grok.balance.nextReset, '2026-10-17T09:08:51.805Z')
  assert.deepEqual(after.radar.delegation.byGroup, before.radar.delegation.byGroup)
})

test('a group the run read but never called gets its balance with no calls, so every call going native still shows the quota', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  appendLog(dataDir, 'run-session', readingEntry(args.runId, 1, 'agy', { gemini: agyGroup(1, 1), claude: agyGroup(0.02, 0.5) }))
  appendLog(dataDir, 'run-session', readingEntry(args.runId, 20, 'agy', { gemini: agyGroup(1, 1), claude: agyGroup(0.02, 0.5) }))
  const { lanes, radar } = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual(Object.keys(lanes.run.groups).sort(), ['claude', 'gemini'])
  const { gemini, claude } = lanes.run.groups
  assert.equal(gemini.calls, 0)
  assert.equal(gemini.usd, 0)
  assert.deepEqual(gemini.balance.start, { weekly: 1, '5h': 1 })
  assert.equal(gemini.balance.nextReset, '2026-10-21T03:35:44.000Z')
  assert.equal(claude.calls, 0)
  assert.deepEqual(claude.balance.end.weekly, { remaining: 0.02, resetsAt: '2026-10-21T03:35:44.000Z' })
  assert.deepEqual(radar.delegation.byGroup, { gemini: { calls: 0, balance: gemini.balance }, claude: { calls: 0, balance: claude.balance } })
  // A reading of another run, or one after this run ended, seeds nothing.
  appendLog(dataDir, 'run-session', readingEntry('20261001-000000-aaaa', 5, 'grok', { grok: grokGroup(1) }))
  appendLog(dataDir, 'run-session', readingEntry(args.runId, 2 * 24 * 60, 'grok', { grok: grokGroup(1) }))
  assert.deepEqual(Object.keys(report(repo.dir, args.runId, { dataDir, tests: false }).lanes.run.groups).sort(), ['claude', 'gemini'])
})

test('the next reset and the 0%-used flag come from the latest reading that has windows, not from an unknown reading after it', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  appendLog(dataDir, 'run-session', laneCall(args.runId, 8, 5, { quotaBefore: grokGroup(1), quotaAfter: { unknown: true, windows: {} } }))
  const { balance } = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.run.groups.grok
  assert.deepEqual(balance.end, { weekly: { remaining: 1, resetsAt: '2026-10-17T09:08:51.805Z' } })
  assert.equal(balance.nextReset, '2026-10-17T09:08:51.805Z')
  assert.equal(balance.usedPercentAbsent, true)
})

test('a lane-log reading with a null window does not stop the report, and the window is skipped', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  appendLog(dataDir, 'run-session', readingEntry(args.runId, 1, 'agy', { gemini: { windows: { weekly: null } } }))
  appendLog(dataDir, 'run-session', laneCall(args.runId, 8, 5, { harness: 'agy', model: GEMINI, group: 'gemini', quotaBefore: agyGroup(1, 1), quotaAfter: agyGroup(0.99, 0.8) }))
  const { balance } = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.run.groups.gemini
  assert.deepEqual(balance.start, { weekly: 1, '5h': 1 })
  assert.equal(balance.end.weekly.remaining, 0.99)
})

test('a reset that cannot be read as a time gives no next reset, and a group with no reading gives no balance', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  const { run } = report(repo.dir, args.runId, { dataDir, tests: false }).lanes
  // The sample log writes its resets as R1, W1: the balance still gives the shares, and no next reset.
  assert.deepEqual(run.groups.gemini.balance.start, { '5h': 0.9, weekly: 0.96 })
  assert.deepEqual(run.groups.gemini.balance.end, { '5h': { remaining: 0.7, resetsAt: 'R3' }, weekly: { remaining: 0.94, resetsAt: 'W1' } })
  assert.equal(run.groups.gemini.balance.nextReset, null)
  appendLog(dataDir, 'run-session', { kind: 'call', time: T0 + 14 * MIN, startedAt: T0 + 13 * MIN, run: args.runId, design: null, call: 'task-9-1-implement', role: 'implementer', task: 'task-9', harness: 'codex', model: 'gpt-codex', group: 'codex', effort: 'high', status: 'failed', usage: {}, quotaBefore: null, quotaAfter: null, detail: '', durationMs: MIN })
  const again = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.run
  assert.equal(again.groups.codex.balance, null)
})

test('report lists, per call, the reference pair, the pair that took it, why, and how long it took', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  const candidates = [{ id: OPUS_MEDIUM.id, outcome: 'picked', why: null }, { id: 'grok/grok-4.7@high', outcome: 'passed', why: 'below' }]
  appendLog(dataDir, null, choiceEntry(args.runId, 12, { call: 'task-1-1-supervise', role: 'supervisor', picked: null, reason: 'native: every eligible quota is dry', candidates: [] }))
  appendLog(dataDir, null, choiceEntry(args.runId, 4, { call: 'task-1-1-implement', role: 'implementer', picked: OPUS_MEDIUM, reason: 'took agy/claude-opus-5-5@medium', candidates }))
  appendLog(dataDir, null, tookEntry(args.runId, 9, { call: 'task-1-1-implement', by: 'agy:claude-opus-5-5', cause: 'chosen' }))
  appendLog(dataDir, null, tookEntry(args.runId, 14, { call: 'task-1-1-supervise', by: 'native', cause: 'no-candidate' }))
  // Another run's, and one after the run ended, are not this run's.
  appendLog(dataDir, null, choiceEntry('20261001-000000-aaaa', 5, { call: 'task-1-1-implement', role: 'implementer', picked: null, reason: 'x', candidates: [] }))
  appendLog(dataDir, null, choiceEntry(args.runId, 45, { call: 'task-3-1-implement', role: 'implementer', picked: null, reason: 'late', candidates: [] }))
  const { lanes, radar } = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual(lanes.run.choices, [
    { call: 'task-1-1-implement', role: 'implementer', reference: { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', intelligence: 46.8 }, requested: 46.8, picked: OPUS_MEDIUM, by: 'agy:claude-opus-5-5', cause: 'chosen', reason: 'took agy/claude-opus-5-5@medium', ms: 5 * MIN, candidates },
    { call: 'task-1-1-supervise', role: 'supervisor', reference: { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', intelligence: 46.8 }, requested: 46.8, picked: null, by: 'native', cause: 'no-candidate', reason: 'native: every eligible quota is dry', ms: 2 * MIN, candidates: [] },
  ])
  assert.deepEqual(radar.delegation.work, { calls: 2, external: 1, native: 1, externalShare: 0.5 })
  assert.equal(report(repo.dir, args.runId, { dataDir: useDataDir(t), tests: false }).lanes.run.choices.length, 0)
})

test('a call whose pick was repeated keeps the last choice and the first time; a call with no took has no duration', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  appendLog(dataDir, null, choiceEntry(args.runId, 3, { call: 'task-1-1-implement', role: 'implementer', picked: OPUS_MEDIUM, reason: 'first', candidates: [] }))
  appendLog(dataDir, null, choiceEntry(args.runId, 5, { call: 'task-1-1-implement', role: 'implementer', picked: null, reason: 'second', candidates: [] }))
  appendLog(dataDir, null, tookEntry(args.runId, 8, { call: 'task-1-1-implement', by: 'native', cause: 'failed' }))
  appendLog(dataDir, null, choiceEntry(args.runId, 6, { call: 'final-review', role: 'reviewer', picked: null, reason: 'open', candidates: [] }))
  const { choices } = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.run
  assert.deepEqual(choices.map((c) => [c.call, c.reason, c.by, c.cause, c.ms]), [['task-1-1-implement', 'second', 'native', 'failed', 5 * MIN], ['final-review', 'open', null, null, null]])
})

test('the RADAR figures say how much of the work left Claude and what each harness quota consumed', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  appendLog(dataDir, null, tookEntry(args.runId, 5, { call: 'task-1-1-implement', by: 'agy:gemini-3.8-flash', cause: 'chosen' }))
  appendLog(dataDir, null, tookEntry(args.runId, 6, { call: 'task-2-1-implement', by: 'native', cause: 'no-candidate' }))
  appendLog(dataDir, null, tookEntry(args.runId, 7, { call: 'task-3-1-implement', by: 'native', cause: 'failed' }))
  const { radar } = report(repo.dir, args.runId, { dataDir, tests: false })
  assert.deepEqual(radar.delegation.work, { calls: 3, external: 1, native: 2, externalShare: 1 / 3 })
  assert.ok(radar.delegation.quotaByHarness.agy['5h'].consumed > 0)
  assert.equal(typeof radar.delegation.lanesUsd, 'number')
})

test('the report repeats what the session ignored or read as on', (t) => {
  const { repo, args } = finishedRun(t)
  const env = { AETHER_SUPERDELEGATION: 'on', AETHER_SUPERDELEGATION_LEGACY: 'lanes-as-on,seats-ignored' }
  const { superdelegation } = report(repo.dir, args.runId, { dataDir: useDataDir(t), tests: false, env })
  assert.equal(superdelegation.on, true)
  assert.deepEqual(superdelegation.legacy, [
    'The lanes option is on and superdelegation is not set, so superdelegation counts as on. Set superdelegation to choose it yourself.',
    'The seats option no longer exists (native, balanced and robust are gone): its value is ignored.',
  ])
  assert.deepEqual(report(repo.dir, args.runId, { dataDir: useDataDir(t), tests: false, env: {} }).superdelegation, { on: null, legacy: [] })
})

test('a choice written in the old shape does not break the report', (t) => {
  const dataDir = useDataDir(t)
  const { repo, args } = finishedRun(t)
  appendLog(dataDir, null, { kind: 'choice', time: T0 + 4 * MIN, session: null, run: args.runId, design: null, call: 'task-1-1-implement', role: 'implementer', tier: 'haiku', effort: 'xhigh', picked: { harness: 'grok', model: 'grok-4.7' }, candidates: [], reason: 'old' })
  const [choice] = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.run.choices
  assert.deepEqual([choice.call, choice.reason, choice.reference, choice.requested, choice.ms], ['task-1-1-implement', 'old', null, null, null])
})

test('report notes a split pass and how many sub-attempts it had', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const file = path.join(args.runDir, 'result.json')
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
  saved.units[1].rounds[2].split = true
  saved.units[1].rounds[2].attempt = 3
  saved.units[1].rounds[2].subAttempts = 4
  writeJson(file, saved)
  const { notes } = report(repo.dir, args.runId, { tests: false })
  assert.ok(notes.includes('task-2 attempt 3 was a split pass of 4 sub-attempts'), notes.join('\n'))
})

test('a design round shows its reference and reason when the seat entry brings them', (t) => {
  const dataDir = useDataDir(t)
  const reference = { id: 'claude/opus@high', model: 'opus', effort: 'high', intelligence: 51.2 }
  appendLog(dataDir, 's1', { kind: 'seat', time: T0, session: 's1', seat: 'judge', status: 'native', reason: 'no-external', reference })
  appendLog(dataDir, 's1', { kind: 'seat', time: T0 + MIN, session: 's1', seat: 'judge', status: 'native', reason: 'no-table' })
  const { bySeat } = seatsReport({ dataDir, session: 's1' })
  assert.deepEqual(bySeat.judge.rounds, 2)
  assert.deepEqual(bySeat.judge.decisions, [{ status: 'native', reason: 'no-external', reference }])
})
