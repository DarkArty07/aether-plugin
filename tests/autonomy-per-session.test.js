'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { A, B, C, QUOTE, OFF_QUOTE, MIN, HOUR, T0, setupRuns } = require('./run-session-fixture.js')

const LATER = T0 + 2 * HOUR
const sorted = (list) => [...list].sort()

test('R1: two sessions of one project each open a run, each with its folder, ceilings and diary', (t) => {
  const { repo, open, read } = setupRuns(t)
  const a = open(A, { hours: 2 })
  const b = open(B, { usd: 10 })
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  assert.notEqual(a.run.id, b.run.id)
  assert.ok(fs.existsSync(a.diary) && fs.existsSync(b.diary) && a.diary !== b.diary)
  assert.equal(read(a.run.id).session, A)
  assert.equal(read(b.run.id).session, B)
  assert.equal(read(a.run.id).ceilings.hours, 2)
  assert.equal(read(b.run.id).ceilings.usd, 10)
  assert.equal(read(a.run.id).ended, null)
  assert.deepEqual(sorted(autonomy.openRuns(repo.dir).map((x) => x.run.id)), sorted([a.run.id, b.run.id]))
})

test('R2: a session with a run open cannot open another, the message names it, and another session still can', (t) => {
  const { open } = setupRuns(t)
  const a = open(A)
  assert.throws(() => open(A), new RegExp(`run ${a.run.id} is already open`))
  assert.equal(open(B).ok, true)
})

test('R3: the lapsed time ceiling of A refuses the launches of A and never those of B or of a session with no run', (t) => {
  const { repo, dataDir, open } = setupRuns(t)
  const a = open(A, { hours: 1 })
  open(B)
  const refusal = autonomy.launchRefusal(repo.dir, { session: A, dataDir, now: LATER })
  assert.equal(refusal.stop, 'time')
  assert.equal(refusal.id, a.run.id)
  assert.equal(autonomy.launchRefusal(repo.dir, { session: B, dataDir, now: LATER }), null)
  assert.equal(autonomy.launchRefusal(repo.dir, { session: C, dataDir, now: LATER }), null)
})

test('R4: status, spend, extend, brake-off and end act on the run of the session that calls and on no other', (t) => {
  const { repo, dataDir, configDir, open, read, raw } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const aBefore = raw(a.run.id)
  assert.equal(autonomy.status(repo.dir, { session: B, dataDir, now: T0 + MIN }).id, b.run.id)
  assert.equal(autonomy.spend(repo.dir, 4, 'seat/x', { session: B, dataDir, now: T0 + MIN }).id, b.run.id)
  assert.deepEqual(read(b.run.id).spend.map((e) => e.usd), [4])
  assert.equal(autonomy.extend(repo.dir, { hours: 20, quote: QUOTE, session: B }, { configDir, now: T0 + MIN }).ok, true)
  assert.equal(read(b.run.id).ceilings.hours, 20)
  assert.equal(autonomy.brakeOff(repo.dir, { quote: OFF_QUOTE, session: B }, { configDir, now: T0 + MIN }).ok, true)
  assert.equal(read(b.run.id).brakeOff.quote, OFF_QUOTE)
  assert.equal(autonomy.end(repo.dir, 'done', { session: B, now: T0 + 2 * MIN }).id, b.run.id)
  assert.equal(read(b.run.id).outcome, 'done')
  assert.equal(raw(a.run.id), aBefore, 'the run of A is byte for byte what it was')
})

test('R5: with several runs open, a caller that does not say its session changes none and the message lists them', (t) => {
  const { repo, dataDir, open, raw } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const before = [raw(a.run.id), raw(b.run.id)]
  const names = [a.run.id, b.run.id, A, B]
  assert.throws(() => autonomy.spend(repo.dir, 1, 's', { dataDir, now: LATER }), (err) => names.every((piece) => err.message.includes(piece)))
  assert.throws(() => autonomy.end(repo.dir, 'done', { now: LATER }), (err) => names.every((piece) => err.message.includes(piece)))
  const st = autonomy.status(repo.dir, { dataDir, now: LATER })
  assert.equal(st.selected, false)
  assert.deepEqual(sorted(st.runs.map((r) => r.id)), sorted([a.run.id, b.run.id]))
  assert.deepEqual([raw(a.run.id), raw(b.run.id)], before)
})

test('R5: with one run open, a caller that does not say its session acts on it, as today', (t) => {
  const { repo, dataDir, open } = setupRuns(t)
  const a = open(A)
  assert.equal(autonomy.status(repo.dir, { dataDir, now: LATER }).id, a.run.id)
  assert.equal(autonomy.spend(repo.dir, 1, 's', { dataDir, now: LATER }).id, a.run.id)
  assert.equal(autonomy.end(repo.dir, 'done', { now: LATER }).id, a.run.id)
})

test('R5b: a known session with no run of its own changes no run of another and the message names it, its session and both ways out', (t) => {
  const { repo, dataDir, configDir, open, raw } = setupRuns(t)
  const a = open(A)
  const id = a.run.id
  const before = raw(id)
  const has = (text) => [id, A, `aether-autonomy continue ${id}`, `aether-autonomy end ${id} --outcome incomplete`].every((piece) => text.includes(piece))
  assert.throws(() => autonomy.spend(repo.dir, 1, 's', { session: C, dataDir, now: LATER }), (err) => has(err.message))
  assert.throws(() => autonomy.end(repo.dir, 'done', { session: C, now: LATER }), (err) => has(err.message))
  const widened = autonomy.extend(repo.dir, { hours: 99, quote: QUOTE, session: C }, { configDir, now: LATER })
  assert.equal(widened.ok, false)
  assert.ok(has(widened.reason), widened.reason)
  const off = autonomy.brakeOff(repo.dir, { quote: OFF_QUOTE, session: C }, { configDir, now: LATER })
  assert.equal(off.ok, false)
  assert.ok(has(off.reason), off.reason)
  const st = autonomy.status(repo.dir, { session: C, dataDir, now: LATER })
  assert.deepEqual([st.id, st.session, st.foreign], [id, A, true])
  assert.equal(raw(id), before)
})

test('R5b: with several runs of other sessions, status lists them and nothing changes', (t) => {
  const { repo, dataDir, open, raw } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const before = [raw(a.run.id), raw(b.run.id)]
  const st = autonomy.status(repo.dir, { session: C, dataDir, now: LATER })
  assert.equal(st.selected, false)
  assert.deepEqual(sorted(st.runs.map((r) => r.id)), sorted([a.run.id, b.run.id]))
  assert.deepEqual([raw(a.run.id), raw(b.run.id)], before)
})

test('R5b and R12: a run of the previous format, with no session and none of the brake fields, is acted on as today', (t) => {
  const { repo, dataDir, open, patch, read } = setupRuns(t)
  const a = open(A)
  patch(a.run.id, (run) => {
    for (const key of ['session', 'brakeOff', 'quotaPauses', 'quotaCrossings', 'ceilingChanges']) delete run[key]
  })
  const st = autonomy.status(repo.dir, { session: C, dataDir, now: LATER })
  assert.equal(st.id, a.run.id)
  assert.equal('foreign' in st, false)
  assert.equal(autonomy.spend(repo.dir, 1, 's', { session: C, dataDir, now: LATER }).id, a.run.id)
  assert.equal(autonomy.end(repo.dir, 'done', { session: C, now: LATER }).id, a.run.id)
  assert.equal(read(a.run.id).outcome, 'done')
})

test('R12: with one session the keys of start, status and run.json are those of today', (t) => {
  const { repo, dataDir, open, read } = setupRuns(t)
  const a = open(A)
  assert.deepEqual(Object.keys(a).sort(), ['diary', 'ok', 'run', 'runFile'])
  assert.deepEqual(Object.keys(read(a.run.id)).sort(), ['brakeOff', 'ceilingChanges', 'ceilings', 'ended', 'id', 'outcome', 'quotaCrossings', 'quotaPauses', 'quote', 'quoteTime', 'session', 'spend', 'started'])
  const st = autonomy.status(repo.dir, { session: A, dataDir, now: T0 + MIN })
  assert.deepEqual(Object.keys(st).sort(), ['diary', 'hours', 'id', 'idle', 'idleMinutes', 'open', 'quota', 'session', 'started', 'stop', 'swarms', 'usd'])
})

test('C3 and R6: status and end reach the run of another session by its id, with no check of who opened it', (t) => {
  const { repo, dataDir, open, read } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const stranger = 'sess-with-no-transcript-and-no-mark'
  const st = autonomy.status(repo.dir, { session: stranger, id: a.run.id, dataDir, now: LATER })
  assert.deepEqual([st.id, st.session], [a.run.id, A])
  assert.equal(autonomy.end(repo.dir, 'incomplete', { session: stranger, id: a.run.id, now: LATER }).outcome, 'incomplete')
  assert.notEqual(read(a.run.id).ended, null)
  assert.equal(read(b.run.id).ended, null)
  assert.deepEqual(autonomy.status(repo.dir, { id: a.run.id, dataDir, now: LATER }), { open: false })
  assert.throws(() => autonomy.status(repo.dir, { id: 'auto-20200101-000000-abcd', dataDir }), /no run auto-20200101-000000-abcd/)
  assert.throws(() => autonomy.end(repo.dir, 'done', { id: a.run.id, now: LATER }), /run .* is not open/)
})

test('R6: the quota-pause message names the run another session left open, and with one run it is the text of today', (t) => {
  const { repo, dataDir, open, patch } = setupRuns(t)
  const a = open(A)
  const pause = {
    started: new Date(T0).toISOString(),
    percentUsed: 96,
    threshold: 95,
    resetsAt: new Date(T0 + 3 * HOUR).toISOString(),
    resumeAt: new Date(T0 + 3 * HOUR + 2 * MIN).toISOString(),
    notify: { sent: true, reason: null },
    savedUnits: [],
  }
  patch(a.run.id, (run) => { run.quotaPauses.push(pause) })
  const today = `autonomous run ${a.run.id} is paused by the quota brake (96% used; resumeAt ${pause.resumeAt}); it is paused, not ended; start nothing of this run and wait until it resumes; and only an old run that another session left open is closed, with: aether-autonomy end --outcome incomplete`
  assert.equal(autonomy.launchRefusal(repo.dir, { session: A, dataDir, now: T0 + MIN }).message, today)
  const b = open(B)
  const message = autonomy.launchRefusal(repo.dir, { session: A, dataDir, now: T0 + MIN }).message
  assert.ok(message.includes(`aether-autonomy end ${b.run.id} --outcome incomplete`), message)
  assert.ok(!message.includes('aether-autonomy end --outcome incomplete'), message)
})
