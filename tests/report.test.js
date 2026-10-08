'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useDataDir, tempDir, age } = require('./helpers.js')
const { T0, MIN, OPUS, SONNET, HAIKU, sampleUsage, writeUsage, finishedRun } = require('./report-fixtures.js')
const { writeJson } = require('../plugins/aether/lib/run.js')
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
