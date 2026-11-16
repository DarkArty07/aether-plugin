'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { A, B, C, OFF_QUOTE, MIN, HOUR, T0, setupRuns } = require('./run-session-fixture.js')

const NOW = T0 + 10 * MIN
const RESET = new Date(T0 + 3 * HOUR).toISOString()
const RESUME = new Date(T0 + 3 * HOUR + autonomy.RESUME_MARGIN_MS).toISOString()
const crossing = { kind: 'five_hour', percentUsed: 96, resetsAt: RESET, threshold: 95, notify: { sent: true, reason: null } }
const stopOf = (s, session, now = NOW) => autonomy.status(s.repo.dir, { session, dataDir: s.dataDir, now }).stop

function stampSwarm(repo, swarmId, state) {
  const dir = path.join(repo.dir, '.aether', 'runs', swarmId)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ runId: swarmId, status: 'compiled', ...state }))
}
const unit = { task: 'task-1', branch: 'aether/x/task-1', head: 'abc123', merged: false }

test('R9 and R14: a crossing pauses every open run and answers with the run of the session that calls', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  const r = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: B })
  assert.deepEqual([r.recorded, r.paused, r.run, r.resumeAt], [true, true, b.run.id, RESUME])
  assert.deepEqual(r.runs.map((x) => x.run).sort(), [a.run.id, b.run.id].sort())
  for (const id of [a.run.id, b.run.id]) assert.equal(s.read(id).quotaPauses.length, 1)
  assert.deepEqual([stopOf(s, A), stopOf(s, B)], ['quota', 'quota'])
})

test('C5: the brake-off of one run resumes that run and leaves the other paused until its own resumeAt', (t) => {
  const s = setupRuns(t)
  s.open(A)
  s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  assert.equal(autonomy.brakeOff(s.repo.dir, { quote: OFF_QUOTE, session: A }, { configDir: s.configDir, now: NOW }).ok, true)
  assert.deepEqual([stopOf(s, A), stopOf(s, B)], [null, 'quota'])
  const after = T0 + 3 * HOUR + 3 * MIN
  assert.deepEqual([stopOf(s, A, after), stopOf(s, B, after)], [null, null])
})

test('R14: a crossing from a known session with no run of its own pauses every run and answers with no run, so nothing is armed for it', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  const r = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: C })
  assert.deepEqual([r.recorded, r.paused, r.run, r.reason], [true, false, null, 'no-run'])
  assert.equal(r.runs.length, 2)
  assert.equal(r.resumeAt, undefined)
  for (const id of [a.run.id, b.run.id]) assert.equal(s.read(id).quotaPauses.length, 1)
})

test('R14: a crossing from an unknown session answers with the first open run; a repeat is a duplicate for each run', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  const first = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir })
  assert.deepEqual([first.paused, first.run], [true, a.run.id])
  assert.equal(first.runs.length, 2)
  const again = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW + MIN, dataDir: s.dataDir })
  assert.equal(again.duplicate, true)
  assert.equal(again.runs.every((x) => x.duplicate === true), true)
  for (const id of [a.run.id, b.run.id]) assert.equal(s.read(id).quotaPauses.length, 1)
})

test('R9: the session whose run another session\'s crossing paused gets a duplicate answer for its own run', (t) => {
  const s = setupRuns(t)
  s.open(A)
  const b = s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  const r = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW + MIN, dataDir: s.dataDir, session: B })
  assert.deepEqual([r.run, r.paused, r.duplicate, r.resumeAt], [b.run.id, true, true, RESUME])
  assert.equal(s.read(b.run.id).quotaPauses.length, 1)
})

test('R14: a run with its brake off records the crossing without pausing, and the other run is paused', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  autonomy.brakeOff(s.repo.dir, { quote: OFF_QUOTE, session: A }, { configDir: s.configDir, now: NOW })
  const r = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  assert.deepEqual([r.run, r.paused, r.brakeOff], [a.run.id, false, true])
  assert.equal(s.read(a.run.id).quotaPauses.length, 0)
  assert.equal(s.read(a.run.id).quotaCrossings.length, 1)
  assert.equal(s.read(b.run.id).quotaPauses.length, 1)
})

test('R14: brake-settings gives the pause of the run of the session that calls, and of any run when the session is unknown', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  autonomy.brakeOff(s.repo.dir, { quote: OFF_QUOTE, session: B }, { configDir: s.configDir, now: NOW })
  const forA = autonomy.brakeSettings(s.repo.dir, { session: A, now: NOW, dataDir: s.dataDir })
  assert.deepEqual([forA.openRun, forA.brakeOff, forA.paused.run], [a.run.id, false, a.run.id])
  const forB = autonomy.brakeSettings(s.repo.dir, { session: B, now: NOW, dataDir: s.dataDir })
  assert.deepEqual([forB.openRun, forB.brakeOff, forB.paused], [b.run.id, true, null])
  const forC = autonomy.brakeSettings(s.repo.dir, { session: C, now: NOW, dataDir: s.dataDir })
  assert.deepEqual([forC.openRun, forC.paused], [null, null])
  assert.equal(autonomy.brakeSettings(s.repo.dir, { now: NOW, dataDir: s.dataDir }).paused.run, a.run.id)
})

test('R14: the saved units of a swarm are noted in the run of the session that launched it', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  stampSwarm(s.repo, '20261116-100500-ab12', { session: B, compiledAt: new Date(T0 + 5 * MIN).toISOString() })
  const r = autonomy.recordSaved(s.repo.dir, { run: '20261116-100500-ab12', at: NOW, units: [unit] }, { now: NOW })
  assert.deepEqual([r.recorded, r.run], [true, b.run.id])
  assert.equal(s.read(b.run.id).quotaPauses[0].savedUnits.length, 1)
  assert.equal(s.read(a.run.id).quotaPauses[0].savedUnits.length, 0)
})

test('R14: with no session in the swarm state the units go to every open run whose window holds its start, and with none nothing is noted', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  stampSwarm(s.repo, '20261116-100600-cd34', { session: null, compiledAt: new Date(T0 + 5 * MIN).toISOString() })
  const inside = autonomy.recordSaved(s.repo.dir, { run: '20261116-100600-cd34', at: NOW, units: [unit] }, { now: NOW })
  assert.equal(inside.recorded, true)
  assert.deepEqual([...inside.runs].sort(), [a.run.id, b.run.id].sort())
  stampSwarm(s.repo, '20261116-070000-ef56', { compiledAt: new Date(T0 - 3 * HOUR).toISOString() })
  const outside = autonomy.recordSaved(s.repo.dir, { run: '20261116-070000-ef56', at: NOW, units: [unit] }, { now: NOW })
  assert.deepEqual([outside.recorded, outside.reason], [false, 'no-attribution'])
})
