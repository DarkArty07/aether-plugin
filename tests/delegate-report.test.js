'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const fs = require('node:fs')
const log = require('../plugins/aether/lib/delegate-log.js')
const { delegatesReport, unverdictedTasks, unverdictedDelegates } = require('../plugins/aether/lib/delegate-report.js')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-report')
let clock = 0
const at = (entry) => ({ session: 's1', time: (clock += 10), ...entry })
const launch = (task, step, attempt, launchKind) => at({ kind: 'launch', task, step, attempt, launchKind, description: `d-${task}`, effort: 'high', edits: false })
const verdict = (task, step, attempt, v, next, extra = {}) => at({ kind: 'verdict', task, step, attempt, verdict: v, next, reason: null, cause: next.cause ?? null, input: { kind: 'x', findings: [], reason: null, fromScratch: false }, ...extra })

function world(t) {
  const dataDir = tempDir(t, 'aether-data-')
  const add = (...entries) => entries.forEach((e) => log.appendEntry(dataDir, e))
  add(launch('t1', 'haiku-high', 1, 'first'), verdict('t1', 'haiku-high', 1, 'approved', { step: null, kind: 'done', cause: null }))
  add(launch('t2', 'haiku-high', 1, 'first'), verdict('t2', 'haiku-high', 1, 'fix', { step: 'haiku-xhigh', kind: 'rise', cause: 'failed' }),
    launch('t2', 'haiku-xhigh', 2, 'rise'), verdict('t2', 'haiku-xhigh', 2, 'approved', { step: null, kind: 'done', cause: null }))
  add(launch('t3', 'haiku-high', 1, 'first'), verdict('t3', 'haiku-high', 1, 'infeasible', { step: 'haiku-xhigh', kind: 'rise', cause: 'infeasible' }, { reason: 'wrong layer' }),
    launch('t3', 'haiku-xhigh', 2, 'rise'), verdict('t3', 'haiku-xhigh', 2, 'approved', { step: null, kind: 'done', cause: null }))
  add(launch('t4', 'haiku-high', 1, 'first'), at({ kind: 'relaunch', task: 't4', of: 't3' }))
  return dataDir
}

test('per step: the tasks, the attempts, the approved, the rises with their cause and the infeasible with their reason (C11, R17)', (t) => {
  const { ladder } = delegatesReport({ dataDir: world(t) })
  assert.equal(ladder.steps.length, 5)
  const [hHigh, hXhigh, sHigh, oHigh, oXhigh] = ladder.steps
  assert.deepEqual([hHigh.step, hHigh.tasks, hHigh.attempts, hHigh.approved], ['haiku-high', 4, 4, 1])
  assert.equal('corrections' in hHigh, false)
  assert.deepEqual(hHigh.rises, { failed: 1, infeasible: 1 })
  assert.deepEqual(hHigh.infeasible, [{ task: 't3', reason: 'wrong layer' }])
  assert.deepEqual([hXhigh.step, hXhigh.tasks, hXhigh.attempts, hXhigh.approved], ['haiku-xhigh', 2, 2, 2])
  assert.deepEqual(hXhigh.rises, { failed: 0, infeasible: 0 })
  assert.deepEqual([sHigh.step, sHigh.tasks, sHigh.attempts], ['sonnet-high', 0, 0])
  assert.deepEqual([oHigh.step, oHigh.tasks, oHigh.attempts], ['opus-high', 0, 0])
  assert.deepEqual([oXhigh.step, oXhigh.tasks, oXhigh.attempts], ['opus-xhigh', 0, 0])
})

test('a relaunch under another id shows linked to the first task (R1)', (t) => {
  assert.deepEqual(delegatesReport({ dataDir: world(t) }).ladder.relaunches, [{ task: 't4', of: 't3' }])
})

test('the rows keep the fields the /harnesses panel reads', (t) => {
  const { delegations } = delegatesReport({ dataDir: world(t) })
  assert.equal(delegations.length, 4)
  const row = delegations.find((d) => d.id === 't3')
  assert.equal(row.description, 'd-t3')
  assert.equal(typeof row.time, 'number')
  assert.deepEqual([row.applied, row.ranOn.harness, row.ranOn.model], ['rewritten', 'claude', 'haiku'])
})

test('session and since filter the report', (t) => {
  const dataDir = world(t)
  log.appendEntry(dataDir, { kind: 'launch', task: 'z', session: 'other', time: 1, step: 'haiku-high', attempt: 1, launchKind: 'first', description: 'z' })
  assert.equal(delegatesReport({ dataDir, session: 's1' }).delegations.length, 4)
  assert.equal(delegatesReport({ dataDir, session: 'other' }).delegations.length, 1)
})

test('two sessions that used the same task id are two rows, each with its own attempts (issue 148)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const mine = (e) => ({ session: 'a', ...e })
  const other = (e) => ({ session: 'b', ...e })
  const entries = [
    mine({ kind: 'launch', task: 'same', time: 1, step: 'haiku-high', attempt: 1, launchKind: 'first', description: 'mine' }),
    other({ kind: 'launch', task: 'same', time: 2, step: 'haiku-high', attempt: 1, launchKind: 'first', description: 'theirs' }),
    other({ kind: 'launch', task: 'same', time: 3, step: 'haiku-high', attempt: 2, launchKind: 'rise', description: 'theirs' }),
  ]
  entries.forEach((e) => log.appendEntry(dataDir, e))
  const { delegations, ladder } = delegatesReport({ dataDir })
  assert.deepEqual(delegations.map((d) => [d.id, d.session, d.description, d.attempts]).sort(), [['same', 'a', 'mine', 1], ['same', 'b', 'theirs', 2]])
  assert.equal(ladder.steps[0].tasks, 2, 'two tasks of two sessions are two tasks')
})

test('aether-report --delegates prints the report as one JSON line', (t) => {
  const dataDir = world(t)
  const out = spawnSync(process.execPath, [BIN, '--delegates', '--session', 's1'], { encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dataDir } })
  assert.equal(out.status, 0)
  assert.equal(JSON.parse(out.stdout.trim()).ladder.steps.length, 5)
})

test('a task whose external delegate ended ok ran on its pair; one that did not ran on Claude with the reason (R18)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const outcome = (id, status) => at({ kind: 'outcome', id, attempt: 1, status, harness: 'agy', model: 'm-a', effort: 'low' })
  log.appendEntry(dataDir, launch('ok', 'haiku-high', 1, 'first'))
  log.appendEntry(dataDir, outcome('ok', 'ok'))
  log.appendEntry(dataDir, launch('bad', 'haiku-high', 1, 'first'))
  log.appendEntry(dataDir, outcome('bad', 'failed'))
  const { delegations } = delegatesReport({ dataDir })
  const ok = delegations.find((d) => d.id === 'ok')
  assert.deepEqual([ok.applied, ok.ranOn.harness, ok.ranOn.model, ok.fallback], ['external', 'agy', 'm-a', null])
  const bad = delegations.find((d) => d.id === 'bad')
  assert.deepEqual([bad.ranOn.harness, bad.ranOn.model, bad.fallback], ['claude', 'haiku', 'external failed'])
})

test('a refused relaunch is not an attempt and not where the task ran (issue 85)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const first = launch('done', 'haiku-high', 1, 'first')
  const outcome = at({ kind: 'outcome', id: 'done', attempt: 1, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low' })
  const refused = at({ kind: 'launch', task: 'done', step: null, attempt: 2, launchKind: 'refused', description: 'again', effort: 'low', edits: false })
  for (const entry of [first, outcome, verdict('done', 'haiku-high', 1, 'approved', { step: null, kind: 'done', cause: null }), refused]) log.appendEntry(dataDir, entry)
  const row = delegatesReport({ dataDir }).delegations.find((d) => d.id === 'done')
  assert.deepEqual([row.attempts, row.step, row.applied, row.ranOn.harness, row.ranOn.model, row.fallback], [1, 'haiku-high', 'external', 'agy', 'm-a', null])
  assert.equal(delegatesReport({ dataDir }).ladder.steps[0].attempts, 1)
  // A task with nothing but a refused launch in the window has no row.
  const other = tempDir(t, 'aether-data-')
  log.appendEntry(other, at({ kind: 'launch', task: 'lone', step: null, attempt: 1, launchKind: 'refused', description: 'x', effort: 'low', edits: false }))
  assert.deepEqual(delegatesReport({ dataDir: other }).delegations, [])
})

test('an editing task has no outcome: where it ran comes from its result (issue 86)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const edit = (task) => at({ kind: 'launch', task, step: 'haiku', attempt: 1, launchKind: 'first', description: `d-${task}`, effort: 'high', edits: true })
  const result = (task, extra) => at({ kind: 'result', task, attempt: 1, ...extra })
  const PAIR = { id: 'agy/gemini-3.8-flash@medium', harness: 'agy', model: 'gemini-3.8-flash', effort: 'medium' }
  for (const entry of [edit('on-agy'), result('on-agy', { ok: true, status: 'done', pair: PAIR }), edit('rescued'), result('rescued', { ok: false, status: 'no-candidate', pair: null })]) log.appendEntry(dataDir, entry)
  const rows = Object.fromEntries(delegatesReport({ dataDir }).delegations.map((d) => [d.id, d]))
  assert.deepEqual([rows['on-agy'].applied, rows['on-agy'].ranOn, rows['on-agy'].fallback], ['external', { harness: 'agy', model: 'gemini-3.8-flash', effort: 'medium' }, null])
  assert.deepEqual([rows.rescued.applied, rows.rescued.ranOn.harness, rows.rescued.ranOn.model, rows.rescued.fallback], ['external', 'claude', 'haiku', 'external no-candidate'])
})

test('a later attempt that ran on Claude is not credited to the pair of an earlier one (issue 86)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const first = launch('up', 'haiku', 1, 'first')
  const outcome = at({ kind: 'outcome', id: 'up', attempt: 1, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low' })
  for (const entry of [first, outcome, launch('up', 'sonnet', 2, 'rise')]) log.appendEntry(dataDir, entry)
  const row = delegatesReport({ dataDir }).delegations.find((d) => d.id === 'up')
  assert.deepEqual([row.applied, row.ranOn.harness, row.ranOn.model, row.fallback, row.attempts], ['rewritten', 'claude', 'sonnet', null, 2])
})

test('a row of a task the owner placed carries authorized, and no other row does (spec 021, item 11)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const authorized = { model: 'opus', scope: 'task', task: 'p1', quote: 'despliega un agente en Opus', quoteTime: '2026-10-29T10:00:00.000Z' }
  const placed = { ...launch('p1', 'opus', 1, 'first'), authorized }
  for (const entry of [placed, verdict('p1', 'opus', 1, 'approved', { step: null, kind: 'done', cause: null }), launch('p2', 'haiku', 1, 'first')]) {
    log.appendEntry(dataDir, entry)
  }
  const rows = Object.fromEntries(delegatesReport({ dataDir }).delegations.map((d) => [d.id, d]))
  assert.deepEqual(rows.p1.authorized, { model: 'opus', scope: 'task' })
  assert.equal(Object.hasOwn(rows.p2, 'authorized'), false)
})

test('delegatesReport lists tasks whose latest launch has an outcome or result and no verdict', (t) => {
  const dataDir = tempDir(t, 'aether-del-unverdicted-')
  log.appendEntry(dataDir, launch('pending-res', 'sonnet', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'result', task: 'pending-res', attempt: 1, ok: true, status: 'done' }))
  log.appendEntry(dataDir, launch('in-flight', 'haiku', 1, 'first'))
  log.appendEntry(dataDir, launch('judged-task', 'sonnet', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'result', task: 'judged-task', attempt: 1, ok: true, status: 'done' }))
  log.appendEntry(dataDir, verdict('judged-task', 'sonnet', 1, 'approved', { step: null, kind: 'done', cause: null }))

  const report = delegatesReport({ dataDir, session: 's1' })
  assert.deepEqual(report.unverdicted, [{ task: 'pending-res', session: 's1', attempt: 1, step: 'sonnet' }])
  assert.equal(Object.hasOwn(report.ladder, 'unverdicted'), false)
  const byId = new Map(report.delegations.map((d) => [d.id, d]))
  assert.equal(byId.get('pending-res').unverdicted, true)
  assert.equal(byId.get('in-flight').unverdicted, false)
  assert.equal(byId.get('judged-task').unverdicted, false)
})

test('delegatesReport flags fix attempt when verdict is followed by a new launch and answer without verdict', (t) => {
  const dataDir = tempDir(t, 'aether-del-retry-unverdicted-')
  log.appendEntry(dataDir, launch('t1', 'haiku', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'result', task: 't1', attempt: 1, ok: true, status: 'done' }))
  log.appendEntry(dataDir, verdict('t1', 'haiku', 1, 'fix', { step: 'haiku', kind: 'fix', cause: 'fix' }))
  log.appendEntry(dataDir, launch('t1', 'haiku', 2, 'fix'))
  log.appendEntry(dataDir, at({ kind: 'answer', task: 't1', attempt: 2, text: 'fixed answer' }))

  const report = delegatesReport({ dataDir, session: 's1' })
  assert.deepEqual(report.unverdicted, [{ task: 't1', session: 's1', attempt: 2, step: 'haiku' }])
})

test('unverdicted helpers isolate sessions and use log order after the latest launch', (t) => {
  const dataDir = tempDir(t, 'aether-del-pending-')
  const entries = [
    { kind: 'launch', task: 'same', session: 'a', time: 10, step: 'haiku' },
    { kind: 'outcome', id: 'same', session: 'a', time: 10, status: 'ok' },
    { kind: 'launch', task: 'same', session: 'b', time: 20, step: 'sonnet' },
    { kind: 'answer', task: 'same', session: 'b', time: 19 },
    { kind: 'launch', task: 'retry', session: 'a', time: 10, step: 'haiku' },
    { kind: 'result', task: 'retry', session: 'a', time: 11 },
    { kind: 'launch', task: 'retry', session: 'a', time: 12, step: 'haiku' },
  ]
  entries.forEach((entry) => log.appendEntry(dataDir, entry))
  const expected = [{ task: 'same', session: 'a', attempt: 1, step: 'haiku' }]
  assert.deepEqual(unverdictedTasks(entries), expected)
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 'a' }), expected)
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 'b' }), [])
  assert.deepEqual(unverdictedDelegates({ dataDir, since: 11 }), [])
})

test('failed outcomes and results remain in flight until an outcome or result succeeds', (t) => {
  const dataDir = tempDir(t, 'aether-del-in-flight-')
  const entries = [
    launch('chain', 'haiku', 1, 'first'),
    at({ kind: 'outcome', id: 'chain', status: 'quota' }),
    launch('edit', 'haiku', 1, 'first'),
    at({ kind: 'result', task: 'edit', ok: false, status: 'failed' }),
  ]
  entries.forEach((entry) => log.appendEntry(dataDir, entry))
  let report = delegatesReport({ dataDir })
  assert.deepEqual(report.unverdicted, [])
  assert.ok(report.delegations.every((row) => !row.unverdicted))
  log.appendEntry(dataDir, at({ kind: 'outcome', id: 'chain', status: 'ok' }))
  log.appendEntry(dataDir, at({ kind: 'result', task: 'edit', ok: true, status: 'done' }))
  report = delegatesReport({ dataDir })
  assert.deepEqual(report.unverdicted, [
    { task: 'chain', session: 's1', attempt: 1, step: 'haiku' },
    { task: 'edit', session: 's1', attempt: 1, step: 'haiku' },
  ])
  assert.ok(report.delegations.every((row) => row.unverdicted))
})

test('since preserves the latest launch attempt number in unverdicted', (t) => {
  const dataDir = tempDir(t, 'aether-del-since-')
  const first = launch('retry', 'haiku', 1, 'first')
  const latest = launch('retry', 'sonnet', 2, 'rise')
  for (const entry of [first, latest, at({ kind: 'answer', task: 'retry', attempt: 2 })]) log.appendEntry(dataDir, entry)
  assert.deepEqual(delegatesReport({ dataDir, since: latest.time }).unverdicted,
    [{ task: 'retry', session: 's1', attempt: 2, step: 'sonnet' }])
})

test('aether-report --delegates prints unverdicted tasks in its JSON', (t) => {
  const dataDir = tempDir(t, 'aether-del-cli-')
  for (const entry of [launch('pending', 'haiku', 3, 'fix'), at({ kind: 'answer', task: 'pending', attempt: 3 })]) log.appendEntry(dataDir, entry)
  const out = spawnSync(process.execPath, [BIN, '--delegates'], { encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dataDir } })
  assert.ifError(out.error)
  assert.equal(out.status, 0, out.stderr)
  assert.deepEqual(JSON.parse(out.stdout).unverdicted, [{ task: 'pending', session: 's1', attempt: 3, step: 'haiku' }])
})

test('a verdict after the launch excludes the task even with an earlier timestamp', (t) => {
  const dataDir = tempDir(t, 'aether-del-verdict-time-')
  const entries = [
    { ...launch('judged', 'haiku', 1, 'first'), time: 10 },
    at({ kind: 'result', task: 'judged', time: 11, ok: true, status: 'done' }),
    verdict('judged', 'haiku', 1, 'approved', { step: null, kind: 'done', cause: null }, { time: 9 }),
  ]
  entries.forEach((entry) => log.appendEntry(dataDir, entry))
  const report = delegatesReport({ dataDir })
  assert.deepEqual(report.unverdicted, [])
  assert.equal(report.delegations[0].unverdicted, false)
})

for (const decision of ['fix', 'infeasible']) {
  test(`a ${decision} verdict without a new result excludes the task`, (t) => {
    const dataDir = tempDir(t, 'aether-del-judged-')
    log.appendEntry(dataDir, launch('judged', 'haiku', 1, 'first'))
    log.appendEntry(dataDir, at({ kind: 'result', task: 'judged', ok: true, status: 'done' }))
    log.appendEntry(dataDir, verdict('judged', 'haiku', 1, decision,
      { step: decision === 'fix' ? 'haiku' : 'sonnet', kind: decision === 'fix' ? 'fix' : 'rise', cause: decision }))
    const report = delegatesReport({ dataDir })
    assert.deepEqual(report.unverdicted, [])
    assert.equal(report.delegations[0].unverdicted, false)
  })
}

const editing = (task, attempt, launchKind) => ({ ...launch(task, 'haiku', attempt, launchKind), edits: true })

test('an attempt that edits on Claude is unverdicted once its ended line is in the log, and not before it or after its verdict (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-del-ended-')
  log.appendEntry(dataDir, editing('e-running', 1, 'first'))
  log.appendEntry(dataDir, editing('e-ended', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'ended', task: 'e-ended', attempt: 1 }))
  log.appendEntry(dataDir, editing('e-judged', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'ended', task: 'e-judged', attempt: 1 }))
  log.appendEntry(dataDir, verdict('e-judged', 'haiku', 1, 'approved', { step: null, kind: 'done', cause: null }))

  const report = delegatesReport({ dataDir, session: 's1' })
  assert.deepEqual(report.unverdicted, [{ task: 'e-ended', session: 's1', attempt: 1, step: 'haiku' }])
  const byId = new Map(report.delegations.map((d) => [d.id, d]))
  assert.deepEqual(['e-running', 'e-ended', 'e-judged'].map((id) => byId.get(id).unverdicted), [false, true, false])
  assert.deepEqual([byId.get('e-ended').applied, byId.get('e-ended').ranOn], ['rewritten', { harness: 'claude', model: 'haiku', effort: 'high' }])
})

test('a fix verdict and a new launch hide the earlier ended line until the new attempt ends too (spec 031, C1)', (t) => {
  const dataDir = tempDir(t, 'aether-del-ended-fix-')
  log.appendEntry(dataDir, editing('t1', 1, 'first'))
  log.appendEntry(dataDir, at({ kind: 'ended', task: 't1', attempt: 1 }))
  log.appendEntry(dataDir, verdict('t1', 'haiku', 1, 'fix', { step: 'haiku', kind: 'fix', cause: 'fix' }))
  log.appendEntry(dataDir, editing('t1', 2, 'fix'))
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [])
  log.appendEntry(dataDir, at({ kind: 'ended', task: 't1', attempt: 2 }))
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [{ task: 't1', session: 's1', attempt: 2, step: 'haiku' }])
})

test('late results from an earlier attempt do not mark the latest attempt unverdicted', (t) => {
  for (const kind of ['ended', 'answer']) {
    const dataDir = tempDir(t, 'aether-del-late-')
    log.appendEntry(dataDir, editing('t1', 1, 'first'))
    log.appendEntry(dataDir, editing('t1', 2, 'fix'))
    log.appendEntry(dataDir, at({ kind, task: 't1', attempt: 1 }))
    assert.deepEqual(unverdictedDelegates({ dataDir, session: 's1' }), [])
    log.appendEntry(dataDir, at({ kind, task: 't1', attempt: 2 }))
    assert.equal(unverdictedDelegates({ dataDir, session: 's1' }).length, 1)
  }
})
