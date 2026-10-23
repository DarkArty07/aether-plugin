'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const fs = require('node:fs')
const log = require('../plugins/aether/lib/delegate-log.js')
const { journalFile } = require('../plugins/aether/lib/router-log.js')
const { delegatesReport } = require('../plugins/aether/lib/delegate-report.js')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-report')
let clock = 0
const at = (entry) => ({ session: 's1', time: (clock += 10), ...entry })
const launch = (task, step, attempt, launchKind) => at({ kind: 'launch', task, step, attempt, launchKind, description: `d-${task}`, effort: 'high', edits: false })
const verdict = (task, step, attempt, v, next, extra = {}) => at({ kind: 'verdict', task, step, attempt, verdict: v, next, reason: null, cause: next.cause ?? null, input: { kind: 'x', findings: [], reason: null, fromScratch: false }, ...extra })

function world(t) {
  const dataDir = tempDir(t, 'aether-data-')
  const add = (...entries) => entries.forEach((e) => log.appendEntry(dataDir, e))
  add(launch('t1', 'haiku', 1, 'first'), verdict('t1', 'haiku', 1, 'approved', { step: null, kind: 'done', cause: null }))
  add(launch('t2', 'haiku', 1, 'first'), verdict('t2', 'haiku', 1, 'fix', { step: 'haiku', kind: 'fix', cause: 'fix' }),
    launch('t2', 'haiku', 2, 'fix'), verdict('t2', 'haiku', 2, 'approved', { step: null, kind: 'done', cause: null }))
  add(launch('t3', 'haiku', 1, 'first'), verdict('t3', 'haiku', 1, 'infeasible', { step: 'sonnet', kind: 'rise', cause: 'infeasible' }, { reason: 'wrong layer' }),
    launch('t3', 'sonnet', 2, 'rise'), verdict('t3', 'sonnet', 2, 'approved', { step: null, kind: 'done', cause: null }))
  add(launch('t4', 'haiku', 1, 'first'), at({ kind: 'relaunch', task: 't4', of: 't3' }))
  return dataDir
}

test('per step: the tasks, the attempts, the corrections, the approved, the rises with their cause and the infeasible with their reason (C11, R17)', (t) => {
  const { ladder } = delegatesReport({ dataDir: world(t) })
  const [haiku, sonnet, opus] = ladder.steps
  assert.deepEqual([haiku.step, haiku.tasks, haiku.attempts, haiku.corrections, haiku.approved], ['haiku', 4, 5, 1, 2])
  assert.deepEqual(haiku.rises, { exhausted: 0, repeated: 0, infeasible: 1 })
  assert.deepEqual(haiku.infeasible, [{ task: 't3', reason: 'wrong layer' }])
  assert.deepEqual([sonnet.tasks, sonnet.attempts, sonnet.approved], [1, 1, 1])
  assert.deepEqual([opus.step, opus.tasks, opus.attempts], ['opus', 0, 0])
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
  assert.deepEqual([row.applied, row.ranOn.harness, row.ranOn.model], ['rewritten', 'claude', 'sonnet'])
})

test('the rows of the old journal are read too, read only, and the ladder counts only the new log (R18)', (t) => {
  const dataDir = world(t)
  const file = journalFile(dataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const lines = [
    { kind: 'decision', id: 'old-1', time: 5, session: 's1', description: 'old one', applied: 'external', ranOn: null, rescue: { harness: 'claude', model: 'sonnet', effort: 'high' } },
    { kind: 'outcome', id: 'old-1', time: 6, session: 's1', status: 'ok', harness: 'agy', model: 'm-a', effort: 'low' },
    { kind: 'decision', id: 'old-2', time: 7, session: 's1', description: 'old two', applied: 'external', ranOn: null, rescue: { harness: 'claude', model: 'sonnet', effort: 'high' } },
    { kind: 'outcome', id: 'old-2', time: 8, session: 's1', status: 'failed', harness: 'agy', model: 'm-a', effort: 'low' },
  ]
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  const before = fs.readFileSync(file, 'utf8')
  const { delegations, ladder } = delegatesReport({ dataDir })
  assert.equal(delegations.length, 6)
  const one = delegations.find((d) => d.id === 'old-1')
  assert.deepEqual([one.description, one.applied, one.ranOn.harness, one.fallback, one.attempts], ['old one', 'external', 'agy', null, 1])
  const two = delegations.find((d) => d.id === 'old-2')
  assert.deepEqual([two.ranOn.model, two.fallback], ['sonnet', 'external failed'])
  assert.equal(ladder.steps[0].tasks, 4)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
})

test('session and since filter the report', (t) => {
  const dataDir = world(t)
  log.appendEntry(dataDir, { kind: 'launch', task: 'z', session: 'other', time: 1, step: 'haiku', attempt: 1, launchKind: 'first', description: 'z' })
  assert.equal(delegatesReport({ dataDir, session: 's1' }).delegations.length, 4)
  assert.equal(delegatesReport({ dataDir, session: 'other' }).delegations.length, 1)
})

test('aether-report --delegates prints the report as one JSON line', (t) => {
  const dataDir = world(t)
  const out = spawnSync(process.execPath, [BIN, '--delegates', '--session', 's1'], { encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dataDir } })
  assert.equal(out.status, 0)
  assert.equal(JSON.parse(out.stdout.trim()).ladder.steps.length, 3)
})

test('a task whose external delegate ended ok ran on its pair; one that did not ran on Claude with the reason (R18)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const outcome = (id, status) => at({ kind: 'outcome', id, attempt: 1, status, harness: 'agy', model: 'm-a', effort: 'low' })
  log.appendEntry(dataDir, launch('ok', 'haiku', 1, 'first'))
  log.appendEntry(dataDir, outcome('ok', 'ok'))
  log.appendEntry(dataDir, launch('bad', 'haiku', 1, 'first'))
  log.appendEntry(dataDir, outcome('bad', 'failed'))
  const { delegations } = delegatesReport({ dataDir })
  const ok = delegations.find((d) => d.id === 'ok')
  assert.deepEqual([ok.applied, ok.ranOn.harness, ok.ranOn.model, ok.fallback], ['external', 'agy', 'm-a', null])
  const bad = delegations.find((d) => d.id === 'bad')
  assert.deepEqual([bad.ranOn.harness, bad.ranOn.model, bad.fallback], ['claude', 'haiku', 'external failed'])
})

test('a refused relaunch is not an attempt and not where the task ran (issue 85)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const outcome = at({ kind: 'outcome', id: 'done', attempt: 1, status: 'ok', harness: 'agy', model: 'm-a', effort: 'low' })
  const refused = at({ kind: 'launch', task: 'done', step: null, attempt: 2, launchKind: 'refused', description: 'again', effort: 'low', edits: false })
  for (const entry of [launch('done', 'haiku', 1, 'first'), outcome, verdict('done', 'haiku', 1, 'approved', { step: null, kind: 'done', cause: null }), refused]) log.appendEntry(dataDir, entry)
  const row = delegatesReport({ dataDir }).delegations.find((d) => d.id === 'done')
  assert.deepEqual([row.attempts, row.step, row.applied, row.ranOn.harness, row.ranOn.model, row.fallback], [1, 'haiku', 'external', 'agy', 'm-a', null])
  assert.equal(delegatesReport({ dataDir }).ladder.steps[0].attempts, 1)
  // A task with nothing but a refused launch in the window has no row.
  const other = tempDir(t, 'aether-data-')
  log.appendEntry(other, at({ kind: 'launch', task: 'lone', step: null, attempt: 1, launchKind: 'refused', description: 'x', effort: 'low', edits: false }))
  assert.deepEqual(delegatesReport({ dataDir: other }).delegations, [])
})

test('an old-journal row whose id is a task of the new log gives way to the new one', (t) => {
  const dataDir = world(t)
  const file = journalFile(dataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ kind: 'decision', id: 't1', time: 5, session: 's1', description: 'old t1', applied: 'external' }) + '\n')
  const rows = delegatesReport({ dataDir }).delegations.filter((d) => d.id === 't1')
  assert.deepEqual(rows.map((d) => d.description), ['d-t1'])
})
