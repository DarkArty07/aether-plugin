'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useDataDir, tempDir, age } = require('./helpers.js')
const { T0, MIN, OPUS, SONNET, HAIKU, GEMINI, sampleUsage, writeUsage, finishedRun, sampleLaneLog, laneResult } = require('./report-fixtures.js')
const { writeJson } = require('../plugins/aether/lib/run.js')
const { appendLog } = require('../plugins/aether/lib/lanes.js')
const { report, finalize, pruneUsage } = require('../plugins/aether/lib/report.js')
const { ensure } = require('../plugins/aether/lib/worktrees.js')

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
    blocked: 1,
    skipped: 0,
    notRun: 0,
    escalated: 1,
    climbed: 0,
    attempts: 5,
    agents: 12,
    launches: 1,
    findings: { critical: 1, important: 2, minor: 2 },
    finalReview: { status: 'done', verdict: 'ready-with-fixes', findings: { critical: 0, important: 1, minor: 2 }, reviews: 1 },
    tests: { command: 'true', exitCode: 0, passed: true, timedOut: false },
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
  const config = tempDir(t, 'aether-claude-config-')
  fs.mkdirSync(path.join(config, 'plugins'))
  fs.writeFileSync(
    path.join(config, 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'superpowers@claude-plugins-official': [{ scope: 'user', version: '6.4.1' }] } }),
  )
  const previous = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = config
  t.after(() => (previous === undefined ? delete process.env.CLAUDE_CONFIG_DIR : (process.env.CLAUDE_CONFIG_DIR = previous)))
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
  assert.deepEqual(record.versions, { aether: manifest.version, superpowers: '6.4.1', claudeCode: '2.1.294' })
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
  assert.equal(run.overflow, 2)

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
  assert.deepEqual([empty.lanes.version, empty.lanes.run.groups, empty.lanes.run.overflow], [null, {}, 0])
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
