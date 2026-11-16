'use strict'

// Issue 285: a swarm run swept as abandoned closes its window at its last recorded
// activity (or sweptAt) rather than "now", and quota-brake skips it.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, useDataDir, runBin, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { T0, MIN, OPUS, writeUsage } = require('./report-fixtures.js')
const entry = (minutes, model, agent, kind, ms = 1000, effort = null) => ({ t: T0 + minutes * MIN, ms, agent, model, effort, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, [kind]: 1e6 })
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { report } = require('../plugins/aether/lib/report.js')
const run = require('../plugins/aether/lib/run.js')

const HOUR = 60 * MIN
const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const WT = path.join(PLUGIN, 'bin', 'aether-wt')
const SESSION = 'sess-abandoned-285'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const cents = (x) => Math.round(x * 100) / 100

function ownerConfig(t) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  const line = { type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: '2026-10-08T00:00:00.000Z', message: { role: 'user', content: HOURS } }
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), JSON.stringify(line) + '\n')
  return configDir
}

function setTimes(target, ms) {
  const d = new Date(ms)
  fs.utimesSync(target, d, d)
}

function setTreeTimes(dir, ms) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) setTreeTimes(full, ms)
    else if (entry.isFile()) setTimes(full, ms)
  }
}

function setupAbandonedScenario(t, { withSavedJson = false, utimesOnGraph = true } = {}) {
  const dataDir = useDataDir(t)
  // Native requests:
  // - 5m: inside the 20-minute swarm activity
  // - 60m: after last activity (20m), before sweptAt (25h)
  // - 26h: after sweptAt (25h)
  // - 30h: later still
  writeUsage(dataDir, 'run-session', [
    {
      agents: {},
      entries: [
        entry(5, OPUS, null, 'input'),
        entry(60, OPUS, null, 'input'),
        entry(26 * 60, OPUS, null, 'input'),
        entry(30 * 60, OPUS, null, 'input'),
      ],
    },
  ])

  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const stateFile = path.join(args.runDir, 'state.json')
  run.writeJson(stateFile, { ...run.readJson(stateFile), compiledAt: new Date(T0).toISOString() })

  const activityFile = path.join(args.runDir, 'timings.jsonl')
  fs.writeFileSync(activityFile, JSON.stringify({ class: 'compile', ms: 100, at: new Date(T0 + 20 * MIN).toISOString() }) + '\n')

  if (utimesOnGraph) {
    setTreeTimes(args.runDir, T0)
    setTimes(activityFile, T0 + 20 * MIN)
  } else {
    setTreeTimes(args.runDir, T0 - MIN)
  }

  const sweptAt = T0 + 25 * HOUR
  if (withSavedJson) {
    const savedFile = path.join(args.runDir, 'saved.json')
    run.writeJson(savedFile, { runId: args.runId, units: [] })
    setTimes(savedFile, T0 + 27 * HOUR)
  }

  run.appendRecord({
    runId: args.runId,
    status: 'abandoned',
    sweptAt: new Date(sweptAt).toISOString(),
    repo: repo.dir,
    removedWorktrees: 1,
    removedBranches: 0,
    branches: [],
  }, dataDir)

  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  return { dataDir, repo, runId: args.runId, runDir: args.runDir, sweptAt }
}

test('an abandoned swarm run closes its window at its last recorded activity and never grows with now', (t) => {
  const s = setupAbandonedScenario(t)
  const at27h = autonomy.status(s.repo.dir, { now: T0 + 27 * HOUR, dataDir: s.dataDir })
  const at31h = autonomy.status(s.repo.dir, { now: T0 + 31 * HOUR, dataDir: s.dataDir })

  // Only the 5m request happened before last recorded activity (20m).
  const expectedAt20m = cents(report(s.repo.dir, s.runId, { dataDir: s.dataDir, tests: false, now: T0 + 20 * MIN }).lanes.totals.run.totalUsd)
  assert.equal(at27h.usd.spent, expectedAt20m)
  assert.deepEqual(at27h.swarms, { runs: [{ run: s.runId, usd: expectedAt20m }], unreadable: [] })
  assert.equal(at31h.usd.spent, at27h.usd.spent)
  assert.deepEqual(at31h.swarms, at27h.swarms)
})

test('an abandoned swarm run ignores saved.json mtime and caps at sweptAt when files lack older mtimes', (t) => {
  const s = setupAbandonedScenario(t, { withSavedJson: true, utimesOnGraph: false })
  const at27h = autonomy.status(s.repo.dir, { now: T0 + 27 * HOUR, dataDir: s.dataDir })
  const at31h = autonomy.status(s.repo.dir, { now: T0 + 31 * HOUR, dataDir: s.dataDir })

  const expectedAtSwept = cents(report(s.repo.dir, s.runId, { dataDir: s.dataDir, tests: false, now: s.sweptAt }).lanes.totals.run.totalUsd)
  assert.equal(at27h.usd.spent, expectedAtSwept)
  assert.equal(at31h.usd.spent, at27h.usd.spent)
  assert.deepEqual(at31h.swarms, at27h.swarms)
})

test('a second swarm run overlapping an abandoned run does not extend the abandoned window to now', (t) => {
  const s = setupAbandonedScenario(t)
  const second = compile(s.repo, plan([task(1)]))
  const secondState = path.join(second.runDir, 'state.json')
  run.writeJson(secondState, { ...run.readJson(secondState), compiledAt: new Date(T0 + 25 * HOUR + 30 * MIN).toISOString() })
  const secondResult = path.join(second.runDir, 'result.json')
  run.writeJson(secondResult, { runId: second.runId, units: [] })
  setTimes(secondResult, T0 + 26 * HOUR + 10 * MIN)

  const at27h = autonomy.status(s.repo.dir, { now: T0 + 27 * HOUR, dataDir: s.dataDir })
  const at31h = autonomy.status(s.repo.dir, { now: T0 + 31 * HOUR, dataDir: s.dataDir })
  assert.equal(at31h.usd.spent, at27h.usd.spent)
  assert.deepEqual(at31h.swarms, at27h.swarms)
  // Only 5m (abandoned) + 26h (second run) should be counted, NOT 60m or 30h.
  const onlyFirst = report(s.repo.dir, s.runId, { dataDir: s.dataDir, tests: false, now: T0 + 20 * MIN }).lanes.totals.run.totalUsd
  const onlySecond = report(s.repo.dir, second.runId, { dataDir: s.dataDir, tests: false, now: T0 + 27 * HOUR }).lanes.totals.run.totalUsd
  assert.equal(at27h.usd.spent, cents(onlyFirst + onlySecond))
})

test('quota-brake skips an abandoned swarm run, writes no saved.json, and names it in skipped', (t) => {
  const repo = makeRepo(t)
  const configDir = ownerConfig(t)
  const dataDir = useDataDir(t)
  const env = { CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_SESSION_ID: SESSION, AETHER_DATA_DIR: dataDir }
  const cli = (args) => runBin(BIN, args, repo.dir, env)

  const started = cli(['start', '--quote', HOURS])
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const autoId = started.json.started.id
  const runFile = path.join(repo.dir, '.aether', 'autonomy', autoId, 'run.json')
  const state = JSON.parse(fs.readFileSync(runFile, 'utf8'))
  state.started = new Date(Date.now() - 60_000).toISOString()
  fs.writeFileSync(runFile, JSON.stringify(state))

  const crossing = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', new Date(Date.now() + 3600_000).toISOString(), '--threshold', '95', '--notify', 'sent'])
  assert.equal(crossing.status, 0, crossing.stdout + crossing.stderr)

  const abandoned = compile(repo, plan([task(1)]))
  run.appendRecord({
    runId: abandoned.runId,
    status: 'abandoned',
    sweptAt: new Date().toISOString(),
    repo: repo.dir,
    removedWorktrees: 0,
    removedBranches: 0,
    branches: [],
  }, dataDir)

  const live = compile(repo, plan([task(1)]))
  const wt = runBin(WT, ['ensure', live.runId, 'task-1'], repo.dir)
  assert.equal(wt.status, 0, wt.stdout + wt.stderr)
  fs.mkdirSync(path.join(wt.json.path, 'src', 't1'), { recursive: true })
  fs.writeFileSync(path.join(wt.json.path, 'src', 't1', 'wip.js'), 'wip\n')

  const scanned = cli(['quota-brake'])
  assert.equal(scanned.status, 0, scanned.stdout + scanned.stderr)
  assert.deepEqual(scanned.json.saved, [live.runId])
  assert.deepEqual(scanned.json.skipped, [abandoned.runId])
  assert.equal(fs.existsSync(path.join(abandoned.runDir, 'saved.json')), false)
  assert.equal(fs.existsSync(path.join(live.runDir, 'saved.json')), true)

  const named = cli(['quota-brake', '--run', abandoned.runId])
  assert.equal(named.status, 0, named.stdout + named.stderr)
  assert.deepEqual(named.json.saved, [])
  assert.deepEqual(named.json.skipped, [abandoned.runId])
  assert.equal(fs.existsSync(path.join(abandoned.runDir, 'saved.json')), false)
})

test('manual spend for a swarm run inside the window is deduplicated, not counted twice', (t) => {
  const dataDir = useDataDir(t)
  writeUsage(dataDir, 'run-session', [{ agents: {}, entries: [entry(5, OPUS, null, 'input')] }])
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const stateFile = path.join(args.runDir, 'state.json')
  run.writeJson(stateFile, { ...run.readJson(stateFile), compiledAt: new Date(T0).toISOString() })
  const resFile = path.join(args.runDir, 'result.json')
  run.writeJson(resFile, { runId: args.runId, units: [] })
  setTimes(resFile, T0 + 20 * MIN)

  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 100 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const nativeFigure = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.totals.run.totalUsd
  assert.ok(nativeFigure > 0)

  const below = autonomy.spend(repo.dir, nativeFigure / 2, args.runId, { now: T0 + 25 * MIN, dataDir })
  assert.equal(below.usd.spent, cents(nativeFigure))

  const above = autonomy.spend(repo.dir, nativeFigure + 5, args.runId, { now: T0 + 25 * MIN, dataDir })
  assert.equal(above.usd.spent, cents(nativeFigure + 5))
})

test('abandoned then interrupted-saved is not abandoned: window opens to now and quota-brake saves it', (t) => {
  const s = setupAbandonedScenario(t)
  // Same sweptAt timestamp as sweepStale writes when branches are kept for relaunch.
  run.appendRecord({
    runId: s.runId,
    status: 'interrupted-saved',
    sweptAt: new Date(s.sweptAt).toISOString(),
    repo: s.repo.dir,
  }, s.dataDir)

  const at27h = autonomy.status(s.repo.dir, { now: T0 + 27 * HOUR, dataDir: s.dataDir })
  const expectedAt27h = cents(report(s.repo.dir, s.runId, { dataDir: s.dataDir, tests: false, now: T0 + 27 * HOUR }).lanes.totals.run.totalUsd)
  assert.equal(at27h.usd.spent, expectedAt27h)
  assert.ok(at27h.usd.spent > cents(report(s.repo.dir, s.runId, { dataDir: s.dataDir, tests: false, now: T0 + 20 * MIN }).lanes.totals.run.totalUsd))

  const env = { CLAUDE_CONFIG_DIR: ownerConfig(t), CLAUDE_CODE_SESSION_ID: SESSION, AETHER_DATA_DIR: s.dataDir }
  const cli = (args) => runBin(BIN, args, s.repo.dir, env)
  const crossing = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', new Date(Date.now() + 3600_000).toISOString(), '--threshold', '95', '--notify', 'sent'])
  assert.equal(crossing.status, 0, crossing.stdout + crossing.stderr)

  const braked = cli(['quota-brake', '--run', s.runId])
  assert.equal(braked.status, 0, braked.stdout + braked.stderr)
  assert.deepEqual(braked.json.saved, [s.runId])
  assert.equal(braked.json.skipped, undefined)
  assert.equal(fs.existsSync(path.join(s.runDir, 'saved.json')), true)
})

test('abandonedRuns: with identical timestamps the later record wins, and a record with no readable time never displaces an earlier abandoned', (t) => {
  const repo = makeRepo(t)
  const dataDir = useDataDir(t)
  const sameTime = new Date(T0).toISOString()

  const id1 = '20261116-100000-aa11'
  run.appendRecord({ runId: id1, status: 'abandoned', repo: repo.dir, sweptAt: sameTime }, dataDir)
  run.appendRecord({ runId: id1, status: 'finalized', repo: repo.dir, finalizedAt: sameTime }, dataDir)
  assert.equal(autonomy.abandonedRuns(repo.dir, dataDir).has(id1), false, 'later record with identical timestamp wins')

  const id2 = '20261116-100000-bb22'
  run.appendRecord({ runId: id2, status: 'abandoned', repo: repo.dir, sweptAt: sameTime }, dataDir)
  run.appendRecord({ runId: id2, status: 'finalized', repo: repo.dir }, dataDir)
  assert.equal(autonomy.abandonedRuns(repo.dir, dataDir).has(id2), true, 'record with no readable time never displaces earlier abandoned')
})

test('abandoned then finalized counts as finished', (t) => {
  const s = setupAbandonedScenario(t)
  const finalizedReport = report(s.repo.dir, s.runId, { dataDir: s.dataDir, tests: false, now: T0 + 27 * HOUR })
  run.appendRecord({
    runId: s.runId,
    status: 'finalized',
    finalizedAt: new Date(T0 + 27 * HOUR).toISOString(),
    repo: s.repo.dir,
    report: finalizedReport,
  }, s.dataDir)
  // Remove the run directory as finalize does when nothing is retained.
  fs.rmSync(s.runDir, { recursive: true, force: true })

  const at31h = autonomy.status(s.repo.dir, { now: T0 + 31 * HOUR, dataDir: s.dataDir })
  assert.equal(at31h.usd.spent, cents(finalizedReport.lanes.totals.run.totalUsd))
  assert.deepEqual(at31h.swarms, { runs: [{ run: s.runId, usd: cents(finalizedReport.lanes.totals.run.totalUsd) }], unreadable: [] })
  assert.equal(autonomy.abandonedRuns(s.repo.dir, s.dataDir).has(s.runId), false)
})

test('an abandoned record with a missing or invalid sweptAt ends at last activity or start, never at now', (t) => {
  for (const [label, sweptAtValue, withActivity] of [
    ['missing sweptAt with activity', undefined, true],
    ['invalid sweptAt without activity', 'not-a-timestamp', false],
  ]) {
    const dataDir = useDataDir(t)
    writeUsage(dataDir, 'run-session', [
      {
        agents: {},
        entries: [
          entry(5, OPUS, null, 'input'),
          entry(60, OPUS, null, 'input'),
          entry(26 * 60, OPUS, null, 'input'),
        ],
      },
    ])
    const repo = makeRepo(t)
    const args = compile(repo, plan([task(1)]))
    const stateFile = path.join(args.runDir, 'state.json')
    run.writeJson(stateFile, { ...run.readJson(stateFile), compiledAt: new Date(T0).toISOString() })
    setTreeTimes(args.runDir, T0)
    if (withActivity) {
      const activityFile = path.join(args.runDir, 'timings.jsonl')
      fs.writeFileSync(activityFile, '{}\n')
      setTimes(activityFile, T0 + 20 * MIN)
    }
    const rec = { runId: args.runId, status: 'abandoned', repo: repo.dir }
    if (sweptAtValue !== undefined) rec.sweptAt = sweptAtValue
    run.appendRecord(rec, dataDir)

    const configDir = ownerConfig(t)
    const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir })
    assert.equal(started.ok, true, label)

    const at27h = autonomy.status(repo.dir, { now: T0 + 27 * HOUR, dataDir })
    const at31h = autonomy.status(repo.dir, { now: T0 + 31 * HOUR, dataDir })
    const expectedEnd = withActivity ? T0 + 20 * MIN : T0
    const expectedUsd = cents(report(repo.dir, args.runId, { dataDir, tests: false, now: expectedEnd }).lanes.totals.run.totalUsd)
    assert.equal(at27h.usd.spent, expectedUsd, label)
    assert.equal(at31h.usd.spent, expectedUsd, label)
  }
})

test('a finalized record in one install file read before an abandoned one in another wins when it is later', (t) => {
  const root = tempDir(t, 'aether-multi-install-')
  const dataRoot = path.join(root, 'data')
  const inlineDir = path.join(dataRoot, 'aether-inline')
  const pluginDir = path.join(dataRoot, 'aether-aether-plugin')
  fs.mkdirSync(inlineDir, { recursive: true })
  fs.mkdirSync(pluginDir, { recursive: true })

  writeUsage(inlineDir, 'run-session', [
    {
      agents: {},
      entries: [
        entry(5, OPUS, null, 'input'),
        entry(26 * 60, OPUS, null, 'input'),
      ],
    },
  ])

  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const stateFile = path.join(args.runDir, 'state.json')
  run.writeJson(stateFile, { ...run.readJson(stateFile), compiledAt: new Date(T0).toISOString() })
  setTreeTimes(args.runDir, T0)

  const finalizedReport = report(repo.dir, args.runId, { dataDir: inlineDir, tests: false, now: T0 + 27 * HOUR })
  // inlineDir is read first by installDirs(inlineDir), pluginDir second.
  run.appendRecord({
    runId: args.runId,
    status: 'finalized',
    finalizedAt: new Date(T0 + 27 * HOUR).toISOString(),
    repo: repo.dir,
    report: finalizedReport,
  }, inlineDir)
  run.appendRecord({
    runId: args.runId,
    status: 'abandoned',
    sweptAt: new Date(T0 + 25 * HOUR).toISOString(),
    repo: repo.dir,
  }, pluginDir)

  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 1000 }, { configDir, now: T0 - HOUR, dataDir: inlineDir })
  assert.equal(started.ok, true)

  assert.equal(autonomy.abandonedRuns(repo.dir, inlineDir).has(args.runId), false)
  const at31h = autonomy.status(repo.dir, { now: T0 + 31 * HOUR, dataDir: inlineDir })
  assert.equal(at31h.usd.spent, cents(finalizedReport.lanes.totals.run.totalUsd))
})

test('a run whose folder shows activity after sweptAt (other than saved.json) is alive again: not capped, not skipped', (t) => {
  const s = setupAbandonedScenario(t)
  // Simulate a relaunch via `aether-plan compile --run <id>` (which writes graph.json/state.json with fresh mtime, without appending to runs.jsonl).
  const relaunched = compile(s.repo, plan([task(1)]), ['--run', s.runId])
  assert.equal(relaunched.runId, s.runId)
  // Ensure the relaunch file mtimes are strictly after sweptAt.
  setTimes(path.join(s.runDir, 'graph.json'), s.sweptAt + 30 * MIN)

  const at27h = autonomy.status(s.repo.dir, { now: T0 + 27 * HOUR, dataDir: s.dataDir })
  const expectedAt27h = cents(report(s.repo.dir, s.runId, { dataDir: s.dataDir, tests: false, now: T0 + 27 * HOUR }).lanes.totals.run.totalUsd)
  assert.equal(at27h.usd.spent, expectedAt27h)
  assert.ok(at27h.usd.spent > cents(report(s.repo.dir, s.runId, { dataDir: s.dataDir, tests: false, now: T0 + 20 * MIN }).lanes.totals.run.totalUsd))

  const env = { CLAUDE_CONFIG_DIR: ownerConfig(t), CLAUDE_CODE_SESSION_ID: SESSION, AETHER_DATA_DIR: s.dataDir }
  const cli = (args) => runBin(BIN, args, s.repo.dir, env)
  const crossing = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', new Date(Date.now() + 3600_000).toISOString(), '--threshold', '95', '--notify', 'sent'])
  assert.equal(crossing.status, 0, crossing.stdout + crossing.stderr)

  const braked = cli(['quota-brake', '--run', s.runId])
  assert.equal(braked.status, 0, braked.stdout + braked.stderr)
  assert.deepEqual(braked.json.saved, [s.runId])
  assert.equal(braked.json.skipped, undefined)
  assert.equal(fs.existsSync(path.join(s.runDir, 'saved.json')), true)
})
