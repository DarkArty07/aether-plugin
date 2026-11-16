'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { A, B, C, QUOTE, MIN, HOUR, T0, setupRuns } = require('./run-session-fixture.js')

const LATER = T0 + 2 * HOUR

test('R15: continue makes the named run the run of the session that calls, and that session works it with its ceilings', (t) => {
  const { repo, dataDir, configDir, open, read } = setupRuns(t)
  const a = open(A, { hours: 1 })
  const done = autonomy.continueRun(repo.dir, a.run.id, { session: B, now: T0 + 10 * MIN })
  assert.deepEqual([done.ok, done.from], [true, A])
  const run = read(a.run.id)
  assert.equal(run.session, B)
  assert.deepEqual(run.previousSessions, [A])
  assert.equal(run.ceilings.hours, 1)
  const diary = fs.readFileSync(a.diary, 'utf8')
  assert.ok(diary.includes('## Continuación') && diary.includes(A) && diary.includes(B), diary)
  assert.equal(autonomy.status(repo.dir, { session: B, dataDir, now: T0 + 20 * MIN }).id, a.run.id)
  assert.equal(autonomy.launchRefusal(repo.dir, { session: B, dataDir, now: LATER }).stop, 'time')
  assert.equal(autonomy.spend(repo.dir, 2, 'seat/y', { session: B, dataDir, now: LATER }).id, a.run.id)
  assert.equal(autonomy.extend(repo.dir, { hours: 5, quote: QUOTE, session: B }, { configDir, now: LATER }).ok, true)
  assert.equal(autonomy.end(repo.dir, 'done', { session: B, now: LATER }).outcome, 'done')
})

test('R15: continue is refused for an unknown caller, for a session that has another run, and for a run that is not open', (t) => {
  const { repo, open, raw } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const before = raw(a.run.id)
  const unknown = autonomy.continueRun(repo.dir, a.run.id, { session: null })
  assert.equal(unknown.ok, false)
  assert.match(unknown.reason, /session/)
  const busy = autonomy.continueRun(repo.dir, a.run.id, { session: B })
  assert.equal(busy.ok, false)
  assert.ok(busy.reason.includes(b.run.id), busy.reason)
  autonomy.end(repo.dir, 'done', { id: b.run.id })
  const closed = autonomy.continueRun(repo.dir, b.run.id, { session: C })
  assert.equal(closed.ok, false)
  assert.match(closed.reason, /is not open/)
  assert.equal(autonomy.continueRun(repo.dir, 'auto-20200101-000000-abcd', { session: C }).ok, false)
  assert.equal(raw(a.run.id), before)
})

test('R15: continue on a run that is already the caller\'s changes nothing, and on a run with no session it keeps no previous one', (t) => {
  const { repo, open, patch, read, raw } = setupRuns(t)
  const a = open(A)
  const before = raw(a.run.id)
  const same = autonomy.continueRun(repo.dir, a.run.id, { session: A })
  assert.deepEqual([same.ok, same.unchanged], [true, true])
  assert.equal(raw(a.run.id), before)
  patch(a.run.id, (run) => { delete run.session })
  assert.equal(autonomy.continueRun(repo.dir, a.run.id, { session: C }).ok, true)
  assert.equal(read(a.run.id).session, C)
  assert.deepEqual(read(a.run.id).previousSessions, [])
})

test('R13 and R15: continue reads no transcript, preserves pauses and spend, chains previousSessions, and a refusal leaves the diary intact', (t) => {
  const { repo, dataDir, open, patch, read, raw } = setupRuns(t)
  const a = open(A, { hours: 2, usd: 15 })
  const b = open(B)
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
  autonomy.spend(repo.dir, 3.5, 'seat/z', { session: A, dataDir, now: T0 + MIN })
  const diaryBeforeRefusal = fs.readFileSync(a.diary, 'utf8')
  assert.equal(autonomy.continueRun(repo.dir, a.run.id, { session: B }).ok, false)
  assert.equal(fs.readFileSync(a.diary, 'utf8'), diaryBeforeRefusal)

  const stranger = 'sess-with-no-transcript-and-no-mark'
  const first = autonomy.continueRun(repo.dir, a.run.id, { session: C, now: T0 + 5 * MIN })
  assert.deepEqual([first.ok, first.from], [true, A])
  const second = autonomy.continueRun(repo.dir, a.run.id, { session: stranger, now: T0 + 10 * MIN })
  assert.deepEqual([second.ok, second.from], [true, C])
  const run = read(a.run.id)
  assert.equal(run.session, stranger)
  assert.deepEqual(run.previousSessions, [A, C])
  assert.deepEqual(run.ceilings, { hours: 2, usd: 15, source: { hours: 'owner', usd: 'owner' } })
  assert.deepEqual(run.quotaPauses, [pause])
  assert.deepEqual(run.spend.map((e) => e.usd), [3.5])
  assert.equal(raw(b.run.id).includes(stranger), false)
})

test('R15: after continue, the earlier session cannot start a new run on its already-used ExitPlanMode approval', (t) => {
  const { repo, dataDir, configDir, open } = setupRuns(t)
  const transcript = path.join(configDir, 'projects', '-home-owner-project', `${A}.jsonl`)
  const quoteLine = JSON.stringify({
    type: 'user',
    isSidechain: false,
    origin: { kind: 'human' },
    timestamp: new Date(T0 - 6 * MIN).toISOString(),
    message: { role: 'user', content: QUOTE },
  })
  const approval = JSON.stringify({
    type: 'assistant',
    timestamp: new Date(T0 - 5 * MIN).toISOString(),
    message: { role: 'assistant', content: [{ type: 'tool_use', id: 'p1', name: 'ExitPlanMode', input: {} }] },
  })
  const approvalResult = JSON.stringify({
    type: 'user',
    timestamp: new Date(T0 - 4 * MIN).toISOString(),
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'p1', is_error: false, content: 'User has approved your plan.' }] },
  })
  fs.writeFileSync(transcript, [quoteLine, approval, approvalResult].join('\n') + '\n')

  const a = open(A, {}, T0)
  assert.equal(a.ok, true)
  assert.equal(autonomy.continueRun(repo.dir, a.run.id, { session: B, now: T0 + 5 * MIN }).ok, true)
  const second = autonomy.start(repo.dir, { quote: QUOTE, session: A }, { configDir, dataDir, now: T0 + 10 * MIN })
  assert.equal(second.ok, false)
  assert.match(second.reason, /ExitPlanMode/)
})
