'use strict'

// Issue 285: a delegate attempt's one-unit run without result.json closes its window
// at the attempt's result time in delegates/log.jsonl rather than growing with "now".

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, tempDir, useDataDir, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { T0, MIN, OPUS, writeUsage } = require('./report-fixtures.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { report } = require('../plugins/aether/lib/report.js')
const delegateLog = require('../plugins/aether/lib/delegate-log.js')
const run = require('../plugins/aether/lib/run.js')

const HOUR = 60 * MIN
const SESSION = 'sess-delegate-285'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const cents = (x) => Math.round(x * 100) / 100
const entry = (minutes, model, agent, kind, ms = 1000, effort = null) => ({
  t: T0 + minutes * MIN,
  ms,
  agent,
  model,
  effort,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  [kind]: 1e6,
})

function ownerConfig(t) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  const line = {
    type: 'user',
    isSidechain: false,
    origin: { kind: 'human' },
    entrypoint: 'sdk-cli',
    timestamp: '2026-10-08T00:00:00.000Z',
    message: { role: 'user', content: HOURS },
  }
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), JSON.stringify(line) + '\n')
  return configDir
}

function makeDelegateRun(repo, { runId, compiledAtMs, briefText = null }) {
  const dir = run.runDir(repo.dir, runId)
  const briefPath = path.join(dir, 'briefs', 'task-1.md')
  fs.mkdirSync(path.dirname(briefPath), { recursive: true })
  if (briefText !== null) fs.writeFileSync(briefPath, briefText)
  run.writeJson(path.join(dir, 'graph.json'), {
    runId,
    repoRoot: repo.dir,
    runDir: dir,
    plan: null,
    spec: null,
    waves: [['task-1']],
    tasks: {
      'task-1': {
        number: 1,
        title: 'delegate',
        tier: 'haiku',
        tierReason: 'delegate',
        effort: 'medium',
        area: 'delegate',
        owns: ['src/**'],
        dependsOn: [],
        brief: briefPath,
      },
    },
  })
  run.writeJson(path.join(dir, 'state.json'), {
    runId,
    status: 'compiled',
    plan: null,
    compiledAt: new Date(compiledAtMs).toISOString(),
    launches: 1,
  })
  return dir
}

function writeDelegateBrief(dataDir, { session = SESSION, taskId, attempt, text }) {
  const file = path.join(dataDir, 'delegates', 'briefs', `${delegateLog.fileKey(session, taskId)}-${attempt}.md`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

test('a finished delegate run does not grow between two values of now', (t) => {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)

  // Native requests: 5m inside the delegate attempt, 30m and 60m after it ended.
  writeUsage(dataDir, SESSION, [
    {
      agents: {},
      entries: [entry(5, OPUS, null, 'input'), entry(30, OPUS, null, 'input'), entry(60, OPUS, null, 'input')],
    },
  ])

  const runId = '20261116-010000-1111'
  makeDelegateRun(repo, { runId, compiledAtMs: T0 })
  delegateLog.appendEntry(dataDir, {
    kind: 'launch',
    time: T0 - 1000,
    session: SESSION,
    task: 't1',
    step: 'haiku',
    attempt: 1,
    edits: true,
  })
  delegateLog.appendEntry(dataDir, {
    kind: 'result',
    time: T0 + 10 * MIN,
    session: SESSION,
    task: 't1',
    attempt: 1,
    ok: true,
    status: 'done',
    branch: run.unitBranch(runId, 'task-1'),
    worktree: run.unitWorktree(repo.dir, runId, 'task-1'),
  })

  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const at40m = autonomy.status(repo.dir, { now: T0 + 40 * MIN, dataDir })
  const at90m = autonomy.status(repo.dir, { now: T0 + 90 * MIN, dataDir })

  const expected = cents(report(repo.dir, runId, { dataDir, tests: false, now: T0 + 10 * MIN }).lanes.totals.run.totalUsd)
  assert.equal(at40m.usd.spent, expected)
  assert.equal(at90m.usd.spent, expected)
  assert.deepEqual(at40m.swarms, { runs: [{ run: runId, usd: expected }], unreadable: [] })
  assert.deepEqual(at90m.swarms, at40m.swarms)
})

test('several finished delegate runs plus later native spend of the Lead count only what fell inside their real windows', (t) => {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)

  // Requests:
  // - 5m: inside run 1 [0m, 10m]
  // - 15m: gap between run 1 and run 2 (must NOT count)
  // - 25m: inside run 2 [20m, 30m]
  // - 45m: later Lead turn after both finished (must NOT count)
  writeUsage(dataDir, SESSION, [
    {
      agents: {},
      entries: [
        entry(5, OPUS, null, 'input'),
        entry(15, OPUS, null, 'input'),
        entry(25, OPUS, null, 'input'),
        entry(45, OPUS, null, 'input'),
      ],
    },
  ])

  const r1 = '20261116-010000-2001'
  const r2 = '20261116-012000-2002'
  makeDelegateRun(repo, { runId: r1, compiledAtMs: T0 })
  makeDelegateRun(repo, { runId: r2, compiledAtMs: T0 + 20 * MIN })

  delegateLog.appendEntry(dataDir, { kind: 'launch', time: T0 - 1000, session: SESSION, task: 't1', attempt: 1, edits: true })
  delegateLog.appendEntry(dataDir, {
    kind: 'result',
    time: T0 + 10 * MIN,
    session: SESSION,
    task: 't1',
    attempt: 1,
    ok: true,
    status: 'done',
    branch: run.unitBranch(r1, 'task-1'),
    worktree: run.unitWorktree(repo.dir, r1, 'task-1'),
  })

  delegateLog.appendEntry(dataDir, { kind: 'launch', time: T0 + 20 * MIN - 1000, session: SESSION, task: 't2', attempt: 1, edits: true })
  delegateLog.appendEntry(dataDir, {
    kind: 'result',
    time: T0 + 30 * MIN,
    session: SESSION,
    task: 't2',
    attempt: 1,
    ok: true,
    status: 'done',
    branch: run.unitBranch(r2, 'task-1'),
    worktree: run.unitWorktree(repo.dir, r2, 'task-1'),
  })

  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const st1 = autonomy.status(repo.dir, { now: T0 + 40 * MIN, dataDir })
  const st2 = autonomy.status(repo.dir, { now: T0 + 60 * MIN, dataDir })

  const u1 = report(repo.dir, r1, { dataDir, tests: false, now: T0 + 10 * MIN }).lanes.totals.run.totalUsd
  const u2 = report(repo.dir, r2, { dataDir, tests: false, now: T0 + 30 * MIN }).lanes.totals.run.totalUsd
  assert.equal(st1.usd.spent, cents(u1 + u2))
  assert.equal(st2.usd.spent, st1.usd.spent)
})

test('an attempt in flight still counts until now', (t) => {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)

  writeUsage(dataDir, SESSION, [
    {
      agents: {},
      entries: [entry(5, OPUS, null, 'input'), entry(30, OPUS, null, 'input')],
    },
  ])

  const runId = '20261116-010000-3001'
  const briefText = 'in-flight brief\n'
  makeDelegateRun(repo, { runId, compiledAtMs: T0, briefText })
  writeDelegateBrief(dataDir, { taskId: 't-open', attempt: 1, text: briefText })
  delegateLog.appendEntry(dataDir, { kind: 'launch', time: T0 - 1000, session: SESSION, task: 't-open', attempt: 1, edits: true })

  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const at15m = autonomy.status(repo.dir, { now: T0 + 15 * MIN, dataDir })
  const at45m = autonomy.status(repo.dir, { now: T0 + 45 * MIN, dataDir })

  const expected15 = cents(report(repo.dir, runId, { dataDir, tests: false, now: T0 + 15 * MIN }).lanes.totals.run.totalUsd)
  const expected45 = cents(report(repo.dir, runId, { dataDir, tests: false, now: T0 + 45 * MIN }).lanes.totals.run.totalUsd)
  assert.equal(at15m.usd.spent, expected15)
  assert.equal(at45m.usd.spent, expected45)
  assert.ok(at45m.usd.spent > at15m.usd.spent)
})

test('a failed attempt run is closed (with brief match and without brief match)', (t) => {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)

  // 5m inside failed run 1 [0m, 10m], 25m inside failed run 2 [20m, 30m], 45m after both.
  writeUsage(dataDir, SESSION, [
    {
      agents: {},
      entries: [entry(5, OPUS, null, 'input'), entry(25, OPUS, null, 'input'), entry(45, OPUS, null, 'input')],
    },
  ])

  // Run 1: failed (no-candidate) with brief file present (branch: null in result).
  const r1 = '20261116-010000-4001'
  const brief1 = 'failed task 1 brief\n'
  makeDelegateRun(repo, { runId: r1, compiledAtMs: T0, briefText: brief1 })
  writeDelegateBrief(dataDir, { taskId: 'tf1', attempt: 1, text: brief1 })
  delegateLog.appendEntry(dataDir, { kind: 'launch', time: T0 - 1000, session: SESSION, task: 'tf1', attempt: 1, edits: true })
  delegateLog.appendEntry(dataDir, {
    kind: 'result',
    time: T0 + 10 * MIN,
    session: SESSION,
    task: 'tf1',
    attempt: 1,
    ok: false,
    status: 'no-candidate',
    branch: null,
    worktree: null,
  })

  // Run 2: timed out / failed without brief file on disk (fallback to launch..result time window).
  const r2 = '20261116-012000-4002'
  makeDelegateRun(repo, { runId: r2, compiledAtMs: T0 + 20 * MIN, briefText: null })
  delegateLog.appendEntry(dataDir, { kind: 'launch', time: T0 + 20 * MIN - 1000, session: SESSION, task: 'tf2', attempt: 1, edits: true })
  delegateLog.appendEntry(dataDir, {
    kind: 'result',
    time: T0 + 30 * MIN,
    session: SESSION,
    task: 'tf2',
    attempt: 1,
    ok: false,
    status: 'failed',
    branch: null,
    worktree: null,
    reason: 'timed out',
  })

  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const at40m = autonomy.status(repo.dir, { now: T0 + 40 * MIN, dataDir })
  const at70m = autonomy.status(repo.dir, { now: T0 + 70 * MIN, dataDir })

  const u1 = report(repo.dir, r1, { dataDir, tests: false, now: T0 + 10 * MIN }).lanes.totals.run.totalUsd
  const u2 = report(repo.dir, r2, { dataDir, tests: false, now: T0 + 30 * MIN }).lanes.totals.run.totalUsd
  assert.equal(at40m.usd.spent, cents(u1 + u2))
  assert.equal(at70m.usd.spent, at40m.usd.spent)
})

test('a swarm run without result.json that is alive is unchanged', (t) => {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)

  writeUsage(dataDir, SESSION, [
    {
      agents: {},
      entries: [entry(5, OPUS, null, 'input'), entry(30, OPUS, null, 'input')],
    },
  ])

  const args = compile(repo, plan([task(1), task(2)]))
  const stateFile = path.join(args.runDir, 'state.json')
  run.writeJson(stateFile, { ...run.readJson(stateFile), compiledAt: new Date(T0).toISOString() })

  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const at15m = autonomy.status(repo.dir, { now: T0 + 15 * MIN, dataDir })
  const at45m = autonomy.status(repo.dir, { now: T0 + 45 * MIN, dataDir })
  assert.ok(at45m.usd.spent > at15m.usd.spent)
})

test('a delegate run swept as abandoned keeps its abandonedEnd rule', (t) => {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)

  // 5m before last activity (10m), 20m after last activity (10m) but before result.time (30m).
  writeUsage(dataDir, SESSION, [
    {
      agents: {},
      entries: [entry(5, OPUS, null, 'input'), entry(20, OPUS, null, 'input'), entry(45, OPUS, null, 'input')],
    },
  ])

  const runId = '20261116-010000-5001'
  const dir = makeDelegateRun(repo, { runId, compiledAtMs: T0, briefText: 'abandoned delegate\n' })
  const d0 = new Date(T0)
  for (const f of ['graph.json', 'state.json', path.join('briefs', 'task-1.md')]) {
    fs.utimesSync(path.join(dir, f), d0, d0)
  }
  const activityFile = path.join(dir, 'timings.jsonl')
  fs.writeFileSync(activityFile, JSON.stringify({ class: 'compile', ms: 100, at: new Date(T0 + 10 * MIN).toISOString() }) + '\n')
  const d10 = new Date(T0 + 10 * MIN)
  fs.utimesSync(activityFile, d10, d10)

  run.appendRecord({
    runId,
    status: 'abandoned',
    sweptAt: new Date(T0 + 25 * HOUR).toISOString(),
    repo: repo.dir,
    removedWorktrees: 1,
    removedBranches: 0,
    branches: [],
  }, dataDir)

  delegateLog.appendEntry(dataDir, {
    kind: 'result',
    time: T0 + 30 * MIN,
    session: SESSION,
    task: 'ta',
    attempt: 1,
    ok: true,
    status: 'done',
    branch: run.unitBranch(runId, 'task-1'),
    worktree: run.unitWorktree(repo.dir, runId, 'task-1'),
  })

  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const st = autonomy.status(repo.dir, { now: T0 + 27 * HOUR, dataDir })
  const expectedAt10m = cents(report(repo.dir, runId, { dataDir, tests: false, now: T0 + 10 * MIN }).lanes.totals.run.totalUsd)
  assert.equal(st.usd.spent, expectedAt10m)
})

test('a swarm graph under an id named in the delegate log is not capped at the delegate result', (t) => {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)

  writeUsage(dataDir, SESSION, [
    {
      agents: {},
      entries: [entry(5, OPUS, null, 'input'), entry(30, OPUS, null, 'input')],
    },
  ])

  const args = compile(repo, plan([task(1), task(2)]))
  const stateFile = path.join(args.runDir, 'state.json')
  run.writeJson(stateFile, { ...run.readJson(stateFile), compiledAt: new Date(T0).toISOString() })

  delegateLog.appendEntry(dataDir, {
    kind: 'result',
    time: T0 + 10 * MIN,
    session: SESSION,
    task: 't-old',
    attempt: 1,
    ok: true,
    status: 'done',
    branch: run.unitBranch(args.runId, 'task-1'),
    worktree: run.unitWorktree(repo.dir, args.runId, 'task-1'),
  })

  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const at45m = autonomy.status(repo.dir, { now: T0 + 45 * MIN, dataDir })
  const expected = cents(report(repo.dir, args.runId, { dataDir, tests: false, now: T0 + 45 * MIN }).lanes.totals.run.totalUsd)
  assert.equal(at45m.usd.spent, expected)
})

test('a failed external run closes via time-window fallback despite an overlapping Claude editing launch', (t) => {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)

  writeUsage(dataDir, SESSION, [
    {
      agents: {},
      entries: [entry(5, OPUS, null, 'input'), entry(30, OPUS, null, 'input')],
    },
  ])

  const r1 = '20261116-010000-6001'
  makeDelegateRun(repo, { runId: r1, compiledAtMs: T0, briefText: null })
  delegateLog.appendEntry(dataDir, { kind: 'launch', time: T0 - 2000, session: SESSION, task: 't-claude', attempt: 1, edits: true })
  delegateLog.appendEntry(dataDir, { kind: 'ended', time: T0 + 15 * MIN, session: SESSION, task: 't-claude', attempt: 1 })
  delegateLog.appendEntry(dataDir, { kind: 'launch', time: T0 - 1000, session: SESSION, task: 't-ext', attempt: 1, edits: true })
  delegateLog.appendEntry(dataDir, {
    kind: 'result',
    time: T0 + 10 * MIN,
    session: SESSION,
    task: 't-ext',
    attempt: 1,
    ok: false,
    status: 'failed',
    branch: null,
    worktree: null,
  })

  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const at40m = autonomy.status(repo.dir, { now: T0 + 40 * MIN, dataDir })
  const at70m = autonomy.status(repo.dir, { now: T0 + 70 * MIN, dataDir })
  const expectedAt10m = cents(report(repo.dir, r1, { dataDir, tests: false, now: T0 + 10 * MIN }).lanes.totals.run.totalUsd)
  assert.equal(at40m.usd.spent, expectedAt10m)
  assert.equal(at70m.usd.spent, expectedAt10m)
})

test('a delegate run with result.json keeps the end result.json gives even when the log has a result line', (t) => {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)

  writeUsage(dataDir, SESSION, [
    {
      agents: {},
      entries: [entry(5, OPUS, null, 'input'), entry(15, OPUS, null, 'input'), entry(35, OPUS, null, 'input')],
    },
  ])

  const runId = '20261116-010000-7001'
  const dir = makeDelegateRun(repo, { runId, compiledAtMs: T0 })
  const resultFile = path.join(dir, 'result.json')
  fs.writeFileSync(resultFile, JSON.stringify({ runId, status: 'done' }) + '\n')
  const d25 = new Date(T0 + 25 * MIN)
  fs.utimesSync(resultFile, d25, d25)

  delegateLog.appendEntry(dataDir, { kind: 'launch', time: T0 - 1000, session: SESSION, task: 't1', attempt: 1, edits: true })
  delegateLog.appendEntry(dataDir, {
    kind: 'result',
    time: T0 + 10 * MIN,
    session: SESSION,
    task: 't1',
    attempt: 1,
    ok: true,
    status: 'done',
    branch: run.unitBranch(runId, 'task-1'),
    worktree: run.unitWorktree(repo.dir, runId, 'task-1'),
  })

  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const st = autonomy.status(repo.dir, { now: T0 + 45 * MIN, dataDir })
  const expected = cents(report(repo.dir, runId, { dataDir, tests: false, now: T0 + 45 * MIN }).lanes.totals.run.totalUsd)
  assert.equal(st.usd.spent, expected)
})
