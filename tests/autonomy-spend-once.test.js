'use strict'

// Issue 252: an autonomous run's dollar ceiling counts each native request once even when
// swarm runs overlap in time; lane calls of each run still count.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, useDataDir, compile } = require('./helpers.js')
const { plan, task } = require('./plan-fixtures.js')
const { T0, MIN, OPUS, GEMINI, sampleUsage, finishedRun, sampleResult, sampleLaneLog } = require('./report-fixtures.js')
const { readJson, writeJson, appendRecord } = require('../plugins/aether/lib/run.js')
const { appendLog } = require('../plugins/aether/lib/lanes.js')
const { loadPrices, priceEntry } = require('../plugins/aether/lib/prices.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { report, finalize } = require('../plugins/aether/lib/report.js')

const HOUR = 60 * MIN
const SESSION = 'sess-owner-252'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const cents = (x) => Math.round(x * 100) / 100

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

test('two aether-wt runs whose windows overlap and share native requests count each request once', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)

  // First run: compiled at T0, result saved at T0 + 30 min
  const { repo, args: run1 } = finishedRun(t)
  sampleLaneLog(dataDir, run1.runId)

  // Second run in the same repository: compiled at T0 + 10 min, result saved at T0 + 40 min
  // Overlaps with run 1 from T0 + 10 min to T0 + 30 min, sharing native requests at 10 and 20 min.
  const run2 = compile(
    repo,
    plan([task(1), task(2)], { execution: ['- Test command: `true`'] }),
  )
  const state2 = path.join(run2.runDir, 'state.json')
  writeJson(state2, { ...readJson(state2), compiledAt: new Date(T0 + 10 * MIN).toISOString() })
  const result2 = path.join(run2.runDir, 'result.json')
  writeJson(result2, sampleResult(run2.runId))
  fs.utimesSync(result2, new Date(T0 + 40 * MIN), new Date(T0 + 40 * MIN))
  sampleLaneLog(dataDir, run2.runId)

  // Open autonomous run covering both swarm runs
  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 500 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)

  const rep1 = report(repo.dir, run1.runId, { dataDir, tests: false })
  const rep2 = report(repo.dir, run2.runId, { dataDir, tests: false })
  const fig1 = rep1.lanes.totals.run
  const fig2 = rep2.lanes.totals.run

  // Both runs have lane calls
  assert.ok(fig1.lanesUsd > 0, 'run 1 has lane spend')
  assert.ok(fig2.lanesUsd > 0, 'run 2 has lane spend')

  const naiveSum = cents(fig1.totalUsd + fig2.totalUsd)

  const st = autonomy.status(repo.dir, { now: T0 + 50 * MIN, dataDir })

  // swarms.runs lists each run's own figure
  const expectedRuns = [
    { run: run1.runId, usd: cents(fig1.totalUsd) },
    { run: run2.runId, usd: cents(fig2.totalUsd) },
  ].sort((a, b) => a.run.localeCompare(b.run))

  assert.deepEqual(st.swarms.runs, expectedRuns)
  assert.deepEqual(st.swarms.unreadable, [])

  // The spend counts native requests in the overlapping window once, so it is strictly less than naiveSum
  assert.ok(st.usd.spent < naiveSum, `spent ${st.usd.spent} must be less than naive sum ${naiveSum}`)

  // Deduplicated calculation:
  // Native requests in [T0, T0 + 40m]: entries at 1m, 5m, 10m, 20m, 31m (all counted once).
  // Native requests in run 1: 1m, 5m, 10m, 20m ($26.50).
  // Native requests in run 2: 10m, 20m, 31m ($26.00).
  // Shared requests at 10m and 20m cost $22.00 together.
  const sharedNativeUsd = 22
  const expectedSpent = cents(fig1.lanesUsd + fig2.lanesUsd + (fig1.nativeUsd + fig2.nativeUsd - sharedNativeUsd))
  assert.equal(st.usd.spent, expectedSpent)
})

// The two overlapping runs of the first test, with their live lanes figures.
function twoOverlappingRuns(t) {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args: run1 } = finishedRun(t)
  sampleLaneLog(dataDir, run1.runId)
  const run2 = compile(
    repo,
    plan([task(1), task(2)], { execution: ['- Test command: `true`'] }),
  )
  const state2 = path.join(run2.runDir, 'state.json')
  writeJson(state2, { ...readJson(state2), compiledAt: new Date(T0 + 10 * MIN).toISOString() })
  const result2 = path.join(run2.runDir, 'result.json')
  writeJson(result2, sampleResult(run2.runId))
  fs.utimesSync(result2, new Date(T0 + 40 * MIN), new Date(T0 + 40 * MIN))
  sampleLaneLog(dataDir, run2.runId)
  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 500 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)
  const fig1 = report(repo.dir, run1.runId, { dataDir, tests: false }).lanes.totals.run
  const fig2 = report(repo.dir, run2.runId, { dataDir, tests: false }).lanes.totals.run
  return { dataDir, repo, run1: run1.runId, run2: run2.runId, fig1, fig2 }
}

// The deduplicated spend of the two overlapping runs: both lanes plus each native
// request in [T0, T0 + 40m] once; the shared requests at 10m and 20m cost $22 together.
function dedupedOf(fig1, fig2) {
  return cents(fig1.lanesUsd + fig2.lanesUsd + (fig1.nativeUsd + fig2.nativeUsd - 22))
}

function sortedRuns(figs) {
  return figs.map(([run, fig]) => ({ run, usd: cents(fig.totalUsd) })).sort((a, b) => a.run.localeCompare(b.run))
}

test('overlapping runs: a recorded figure above a run\'s own figure adds only the excess (issue 191)', (t) => {
  const s = twoOverlappingRuns(t)
  const deduped = dedupedOf(s.fig1, s.fig2)
  const after = autonomy.spend(s.repo.dir, s.fig1.totalUsd + 10, s.run1, { now: T0 + 45 * MIN, dataDir: s.dataDir })
  assert.equal(after.usd.spent, cents(deduped + 10))
  assert.deepEqual(after.swarms.runs, sortedRuns([[s.run1, s.fig1], [s.run2, s.fig2]]))
})

test('overlapping runs: a recorded figure below a run\'s own figure adds nothing (issue 191)', (t) => {
  const s = twoOverlappingRuns(t)
  const deduped = dedupedOf(s.fig1, s.fig2)
  assert.ok(5 < s.fig1.totalUsd, 'the recorded figure must stay below the run\'s own figure')
  const after = autonomy.spend(s.repo.dir, 5, s.run1, { now: T0 + 45 * MIN, dataDir: s.dataDir })
  assert.equal(after.usd.spent, deduped)
})

// One lane call of a run inside its window, so a run with no native usage still has lanes.
function laneCallInWindow(dataDir, runId, minutes) {
  const at = T0 + minutes * MIN
  appendLog(dataDir, 'run-session', {
    kind: 'call',
    time: at,
    startedAt: at - MIN,
    harness: 'agy',
    conversation: 'c',
    detail: '',
    durationMs: MIN,
    run: runId,
    design: null,
    call: `task-9-${minutes}-implement`,
    role: 'implementer',
    task: 'task-9',
    model: GEMINI,
    group: 'gemini',
    effort: 'xhigh',
    status: 'ok',
    usage: { input: 1e6, output: 0, thinking: 0, cacheRead: 0, total: 1e6 },
  })
}

test('two disjoint windows do not count a native request in the gap between them', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args: run1 } = finishedRun(t)
  sampleLaneLog(dataDir, run1.runId)
  // Second run compiled at T0 + 40m with its result at T0 + 50m: the native request
  // at 31m sits in the gap (T0 + 30m, T0 + 40m) between the two windows.
  const run2 = compile(
    repo,
    plan([task(1), task(2)], { execution: ['- Test command: `true`'] }),
  )
  const state2 = path.join(run2.runDir, 'state.json')
  writeJson(state2, { ...readJson(state2), compiledAt: new Date(T0 + 40 * MIN).toISOString() })
  const result2 = path.join(run2.runDir, 'result.json')
  writeJson(result2, sampleResult(run2.runId))
  fs.utimesSync(result2, new Date(T0 + 50 * MIN), new Date(T0 + 50 * MIN))
  sampleLaneLog(dataDir, run2.runId)
  laneCallInWindow(dataDir, run2.runId, 42)
  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 500 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)
  const fig1 = report(repo.dir, run1.runId, { dataDir, tests: false }).lanes.totals.run
  const fig2 = report(repo.dir, run2.runId, { dataDir, tests: false }).lanes.totals.run
  assert.ok(fig2.lanesUsd > 0, 'run 2 has lane spend inside its window')
  assert.equal(fig2.nativeUsd, 0, 'run 2 has no native requests inside its window')
  const st = autonomy.status(repo.dir, { now: T0 + 60 * MIN, dataDir })
  // Run 1's native requests plus both lanes; the gap request at 31m is nowhere.
  assert.equal(st.usd.spent, cents(fig1.lanesUsd + fig2.lanesUsd + fig1.nativeUsd))
  const gapPrice = priceEntry(
    { t: T0 + 31 * MIN, ms: 1000, agent: null, model: OPUS, effort: null, input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 },
    loadPrices(),
  )
  assert.ok(gapPrice > 0, 'the gap request has a price, so counting it would show')
  assert.ok(st.usd.spent < cents(fig1.lanesUsd + fig2.lanesUsd + fig1.nativeUsd + gapPrice))
})

test('overlapping runs whose session usage is gone count each overlapping group\'s native spend once', (t) => {
  const s = twoOverlappingRuns(t)
  const native1 = s.fig1.totalUsd - s.fig1.lanesUsd
  const native2 = s.fig2.totalUsd - s.fig2.lanesUsd
  assert.ok(native1 > 0 && native2 > 0, 'both runs must bring native spend to the fallback')
  // Finalize both runs so their figures survive the usage files, then lose the usage.
  finalize(s.repo.dir, s.run1, { dataDir: s.dataDir, now: T0 + 45 * MIN })
  finalize(s.repo.dir, s.run2, { dataDir: s.dataDir, now: T0 + 45 * MIN })
  fs.rmSync(path.join(s.dataDir, 'usage'), { recursive: true, force: true })
  const st = autonomy.status(s.repo.dir, { now: T0 + 50 * MIN, dataDir: s.dataDir })
  // The two windows overlap, so they are one group: lanes of both plus the largest native figure.
  assert.equal(st.usd.spent, cents(s.fig1.lanesUsd + s.fig2.lanesUsd + Math.max(native1, native2)))
  assert.ok(st.usd.spent < cents(s.fig1.totalUsd + s.fig2.totalUsd), 'adding each native figure would double count')
  assert.deepEqual(st.swarms.runs, sortedRuns([[s.run1, s.fig1], [s.run2, s.fig2]]))
  assert.deepEqual(st.swarms.unreadable, [])
})

test('a run without a finite window keeps its lanes and falls back to its standalone native figure', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args: run1 } = finishedRun(t)
  sampleLaneLog(dataDir, run1.runId)
  // A second run recorded with a start inside the autonomous run but no end: its window
  // is unknown, so its native requests cannot be placed on the union.
  const ghostId = '20261008-013000-ab12'
  const ghostLanes = 10
  const ghostTotal = 50
  appendRecord({
    runId: ghostId,
    status: 'finalized',
    finalizedAt: new Date(T0 + 45 * MIN).toISOString(),
    repo: repo.dir,
    plan: 'x',
    versions: {},
    report: {
      usage: { session: 'run-session' },
      speed: { run: { start: new Date(T0 + 10 * MIN).toISOString() } },
      lanes: { totals: { run: { nativeUsd: ghostTotal - ghostLanes, lanesUsd: ghostLanes, totalUsd: ghostTotal, coveredShare: 0.2 } } },
    },
  }, dataDir)
  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 500 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)
  const fig1 = report(repo.dir, run1.runId, { dataDir, tests: false }).lanes.totals.run
  const st = autonomy.status(repo.dir, { now: T0 + 50 * MIN, dataDir })
  assert.equal(st.usd.spent, cents(fig1.lanesUsd + ghostLanes + fig1.nativeUsd + (ghostTotal - ghostLanes)))
  assert.deepEqual(st.swarms.runs, [{ run: run1.runId, usd: cents(fig1.totalUsd) }, { run: ghostId, usd: ghostTotal }].sort((a, b) => a.run.localeCompare(b.run)))
})

test('a session-less run overlapping a normal run keeps its standalone native figure (issue 252)', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args: run1 } = finishedRun(t)
  sampleLaneLog(dataDir, run1.runId)
  // A second run with a finite window but no usage.session: no iterated session
  // admits it, so the union cannot place its native requests.
  const ghostId = '20261008-014000-cd34'
  const ghostLanes = 10
  const ghostTotal = 50
  appendRecord({
    runId: ghostId,
    status: 'finalized',
    finalizedAt: new Date(T0 + 45 * MIN).toISOString(),
    repo: repo.dir,
    plan: 'x',
    versions: {},
    report: {
      usage: {},
      speed: { run: { start: new Date(T0 + 10 * MIN).toISOString(), end: new Date(T0 + 20 * MIN).toISOString() } },
      lanes: { totals: { run: { nativeUsd: ghostTotal - ghostLanes, lanesUsd: ghostLanes, totalUsd: ghostTotal, coveredShare: 0.2 } } },
    },
  }, dataDir)
  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 500 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)
  const fig1 = report(repo.dir, run1.runId, { dataDir, tests: false }).lanes.totals.run
  const st = autonomy.status(repo.dir, { now: T0 + 50 * MIN, dataDir })
  assert.equal(st.usd.spent, cents(fig1.totalUsd + ghostTotal))
  assert.deepEqual(st.swarms.runs, [{ run: run1.runId, usd: cents(fig1.totalUsd) }, { run: ghostId, usd: ghostTotal }].sort((a, b) => a.run.localeCompare(b.run)))
  assert.deepEqual(st.swarms.unreadable, [])
})

test('runs with no finite start fall back to their standalone native figures (issue 252)', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo } = finishedRun(t)
  // No live swarm run is counted here: remove the live run's directory so only the
  // two finalized records below, neither with a finite start, remain.
  fs.rmSync(path.join(repo.dir, '.aether', 'runs'), { recursive: true, force: true })
  const ghosts = [
    { runId: '20261008-015000-aa11', lanesUsd: 10, totalUsd: 50 },
    { runId: '20261008-016000-bb22', lanesUsd: 5, totalUsd: 30 },
  ]
  for (const g of ghosts) {
    appendRecord({
      runId: g.runId,
      status: 'finalized',
      finalizedAt: new Date(T0 + 45 * MIN).toISOString(),
      repo: repo.dir,
      plan: 'x',
      versions: {},
      report: {
        usage: { session: 'run-session' },
        speed: { run: {} },
        lanes: { totals: { run: { nativeUsd: g.totalUsd - g.lanesUsd, lanesUsd: g.lanesUsd, totalUsd: g.totalUsd, coveredShare: 0.2 } } },
      },
    }, dataDir)
  }
  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 500 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)
  const st = autonomy.status(repo.dir, { now: T0 + 50 * MIN, dataDir })
  assert.equal(st.usd.spent, cents(ghosts.reduce((sum, g) => sum + g.totalUsd, 0)))
  assert.deepEqual(st.swarms.runs, ghosts.map((g) => ({ run: g.runId, usd: g.totalUsd })).sort((a, b) => a.run.localeCompare(b.run)))
})

test('a finalized record with no finite start counts only when its finalizedAt falls inside the run (issue 252)', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo } = finishedRun(t)
  fs.rmSync(path.join(repo.dir, '.aether', 'runs'), { recursive: true, force: true })
  const ghosts = [
    { runId: '20261008-015000-cc33', finalizedAt: undefined },
    { runId: '20261008-016000-dd44', finalizedAt: new Date(T0 - 3 * HOUR).toISOString() },
  ]
  for (const g of ghosts) {
    appendRecord({
      runId: g.runId,
      status: 'finalized',
      ...(g.finalizedAt ? { finalizedAt: g.finalizedAt } : {}),
      repo: repo.dir,
      plan: 'x',
      versions: {},
      report: {
        usage: { session: 'run-session' },
        speed: { run: {} },
        lanes: { totals: { run: { nativeUsd: 40, lanesUsd: 10, totalUsd: 50, coveredShare: 0.2 } } },
      },
    }, dataDir)
  }
  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd: 500 }, { configDir, now: T0 - HOUR, dataDir })
  assert.equal(started.ok, true)
  const st = autonomy.status(repo.dir, { now: T0 + 50 * MIN, dataDir })
  assert.equal(st.usd.spent, 0)
  assert.deepEqual(st.swarms.runs, [])
})

test('a usage read failure falls back to the per-run figures and names the runs, without throwing', (t) => {
  const s = twoOverlappingRuns(t)
  // Finalize both runs so their figures survive the usage files, then break the usage root.
  finalize(s.repo.dir, s.run1, { dataDir: s.dataDir, now: T0 + 45 * MIN })
  finalize(s.repo.dir, s.run2, { dataDir: s.dataDir, now: T0 + 45 * MIN })
  fs.rmSync(path.join(s.dataDir, 'usage'), { recursive: true, force: true })
  fs.writeFileSync(path.join(s.dataDir, 'usage'), 'not a directory')
  let st = null
  assert.doesNotThrow(() => { st = autonomy.status(s.repo.dir, { now: T0 + 50 * MIN, dataDir: s.dataDir }) })
  // The per-run fallback adds each run's own rounded figure, as before issue 252.
  assert.equal(st.usd.spent, cents(cents(s.fig1.totalUsd) + cents(s.fig2.totalUsd)))
  assert.deepEqual(st.swarms.runs, sortedRuns([[s.run1, s.fig1], [s.run2, s.fig2]]))
  assert.deepEqual(st.swarms.unreadable, [s.run1, s.run2].sort())
})
