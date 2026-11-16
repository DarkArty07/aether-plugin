'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useDataDir } = require('./helpers.js')
const { T0, MIN, sampleUsage, finishedRun, sampleLaneLog } = require('./report-fixtures.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { report, finalize } = require('../plugins/aether/lib/report.js')
const { A, B, C, HOUR, setupRuns } = require('./run-session-fixture.js')

const cents = (x) => Math.round(x * 100) / 100

function setSession(runDir, session) {
  const file = path.join(runDir, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (session === null) delete state.session
  else state.session = session
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n')
}

// One finished swarm run (compiled at the fixtures' T0) launched by `session`, and the runs of A and B, both open
// since an hour before it and each with a 30 dollar ceiling.
function scenario(t, session) {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  setSession(args.runDir, session)
  const s = setupRuns(t, { ids: [A, B, C], repo, dataDir })
  const a = s.open(A, { usd: 30 }, T0 - HOUR)
  const b = s.open(B, { usd: 30 }, T0 - HOUR + 1000)
  const figure = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.totals.run.totalUsd
  const st = (session, now = T0 + 10 * MIN) => autonomy.status(repo.dir, { session, dataDir, now })
  return { ...s, args, a, b, figure, st }
}

test('C4: the work of a swarm counts in the run of the session that launched it and not in the other open run', (t) => {
  const s = scenario(t, A)
  const forA = s.st(A)
  const forB = s.st(B)
  assert.deepEqual(forA.swarms.runs, [{ run: s.args.runId, usd: cents(s.figure) }])
  assert.equal(forA.usd.spent, cents(s.figure))
  assert.deepEqual(forB.swarms.runs, [])
  assert.equal(forB.usd.spent, 0)
})

test('R8: a swarm with no session recorded counts by the window in every open run whose window holds it, as before', (t) => {
  const s = scenario(t, null)
  assert.equal(s.st(A).usd.spent, cents(s.figure))
  assert.equal(s.st(B).usd.spent, cents(s.figure))
})

test('C4: a finalized swarm keeps the session that launched it', (t) => {
  const s = scenario(t, A)
  finalize(s.repo.dir, s.args.runId, { tests: false, now: T0 + 40 * MIN })
  assert.equal(fs.existsSync(s.args.runDir), false)
  const forA = s.st(A, T0 + 50 * MIN)
  assert.deepEqual(forA.swarms.runs.map((r) => r.run), [s.args.runId])
  assert.ok(forA.usd.spent > 0)
  assert.deepEqual(s.st(B, T0 + 50 * MIN).swarms.runs, [])
})

test('R7: after continue, the run counts the work of the sessions before it as well', (t) => {
  const s = scenario(t, A)
  assert.equal(autonomy.continueRun(s.repo.dir, s.a.run.id, { session: C, now: T0 + 5 * MIN }).ok, true)
  const forC = s.st(C)
  assert.equal(forC.id, s.a.run.id)
  assert.equal(forC.usd.spent, cents(s.figure))
  assert.deepEqual(s.st(B).swarms.runs, [])
})

test('R8: a run with no session counts every swarm in its window, even stamped ones', (t) => {
  const s = scenario(t, A)
  s.patch(s.a.run.id, (r) => { delete r.session })
  const st = autonomy.status(s.repo.dir, { id: s.a.run.id, dataDir: s.dataDir, now: T0 + 10 * MIN })
  assert.equal(st.usd.spent, cents(s.figure))
})

test('C4: a swarm whose launching session has no usage file falls back to report without session', (t) => {
  const s = scenario(t, C)
  const r = s.open(C, { usd: 30 }, T0 - HOUR + 2000)
  const st = s.st(C)
  assert.equal(st.id, r.run.id)
  assert.deepEqual(st.swarms.runs, [{ run: s.args.runId, usd: cents(s.figure) }])
  assert.deepEqual(st.swarms.unreadable, [])
})
