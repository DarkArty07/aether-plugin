'use strict'

// Issue 191: an open autonomous run counts the spend of its swarm runs by itself. The figure of each swarm run is the
// lanes total of aether-report --run; a figure recorded with `spend --source <runId>` is not added twice.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, useDataDir } = require('./helpers.js')
const { T0, MIN, sampleUsage, finishedRun, sampleLaneLog } = require('./report-fixtures.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { report, finalize } = require('../plugins/aether/lib/report.js')

const HOUR = 60 * MIN
const SESSION = 'sess-owner-191'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const cents = (x) => Math.round(x * 100) / 100

// A Claude config directory whose one transcript holds the owner's quote of the ceilings.
function ownerConfig(t) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  const line = { type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: '2026-10-08T00:00:00.000Z', message: { role: 'user', content: HOURS } }
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), JSON.stringify(line) + '\n')
  return configDir
}

// A finished swarm run (compiled at T0, its lane calls and usage in the data directory), and an open autonomous run
// started at `runAt` in the same repository, with a dollar ceiling of `usd`.
function scenario(t, { runAt = T0 - HOUR, usd = 30 } = {}) {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  const configDir = ownerConfig(t)
  const started = autonomy.start(repo.dir, { quote: HOURS, session: SESSION, usd }, { configDir, now: runAt, dataDir })
  assert.equal(started.ok, true)
  return { dataDir, repo, runId: args.runId, run: started.run }
}

// What aether-report --run gives as the run's lanes total, read at this moment.
function figureOf({ repo, runId, dataDir }) {
  return report(repo.dir, runId, { dataDir, tests: false }).lanes.totals.run.totalUsd
}

test('an open run counts its swarm runs by itself, with no spend recorded, and stops on cost (issue 191)', (t) => {
  const s = scenario(t)
  const figure = figureOf(s)
  assert.ok(figure > s.run.ceilings.usd, `the swarm must spend more than the ceiling, it spent ${figure}`)
  const st = autonomy.status(s.repo.dir, { now: T0 + 10 * MIN, dataDir: s.dataDir })
  assert.equal(st.stop, 'cost')
  assert.equal(st.usd.spent, cents(figure))
  assert.deepEqual(st.swarms, { runs: [{ run: s.runId, usd: cents(figure) }], unreadable: [] })
})

test('a figure recorded for the swarm run id is not added twice: the larger of the two counts', (t) => {
  const s = scenario(t)
  const figure = figureOf(s)
  const smaller = autonomy.spend(s.repo.dir, 5, s.runId, { now: T0, dataDir: s.dataDir })
  assert.equal(smaller.usd.spent, cents(figure))
  const larger = autonomy.spend(s.repo.dir, figure + 10, s.runId, { now: T0, dataDir: s.dataDir })
  assert.equal(larger.usd.spent, cents(figure + 10))
  assert.equal(autonomy.status(s.repo.dir, { now: T0 + 10 * MIN, dataDir: s.dataDir }).usd.spent, cents(figure + 10))
})

test('a figure recorded under another label, such as a seat, is added to the swarm figure', (t) => {
  const s = scenario(t)
  const figure = figureOf(s)
  const after = autonomy.spend(s.repo.dir, 7, 'seat/design-191', { now: T0, dataDir: s.dataDir })
  assert.equal(after.usd.spent, cents(figure + 7))
})

test('a swarm run compiled before the autonomous run started is not counted', (t) => {
  const s = scenario(t, { runAt: T0 + HOUR })
  const st = autonomy.status(s.repo.dir, { now: T0 + 2 * HOUR, dataDir: s.dataDir })
  assert.deepEqual([st.usd.spent, st.stop], [0, null])
  assert.deepEqual(st.swarms, { runs: [], unreadable: [] })
})

test('a swarm run whose records cannot be read counts as 0 and is named, and status does not throw', (t) => {
  const s = scenario(t)
  fs.writeFileSync(path.join(s.repo.dir, '.aether', 'runs', s.runId, 'graph.json'), '{not json')
  let st = null
  assert.doesNotThrow(() => { st = autonomy.status(s.repo.dir, { now: T0 + 10 * MIN, dataDir: s.dataDir }) })
  assert.deepEqual([st.usd.spent, st.stop], [0, null])
  assert.deepEqual(st.swarms, { runs: [], unreadable: [s.runId] })
})

test('a swarm run that was finalized is counted from its record after its folder is gone', (t) => {
  const s = scenario(t)
  const figure = figureOf(s)
  finalize(s.repo.dir, s.runId, { dataDir: s.dataDir, now: T0 + 40 * MIN })
  const st = autonomy.status(s.repo.dir, { now: T0 + 50 * MIN, dataDir: s.dataDir })
  assert.equal(st.usd.spent, cents(figure))
  assert.deepEqual(st.swarms.runs, [{ run: s.runId, usd: cents(figure) }])
})
