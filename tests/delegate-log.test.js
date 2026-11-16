'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const LIB = path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'delegate-log.js')

test('an entry is appended as one line and read back in order', (t) => {
  const dir = tempDir(t)
  assert.equal(log.appendEntry(dir, { kind: 'launch', task: 'a', session: 's1', time: 10 }), true)
  assert.equal(log.appendEntry(dir, { kind: 'verdict', task: 'a', session: 's1', time: 20 }), true)
  assert.equal(log.logFile(dir), path.join(dir, 'delegates', 'log.jsonl'))
  assert.deepEqual(log.readEntries(dir).map((e) => e.kind), ['launch', 'verdict'])
  assert.equal(fs.readFileSync(log.logFile(dir), 'utf8').split('\n').filter(Boolean).length, 2)
})

test('the filters: task (the task or the id field), session and since', (t) => {
  const dir = tempDir(t)
  log.appendEntry(dir, { kind: 'launch', task: 'a', session: 's1', time: 10 })
  log.appendEntry(dir, { kind: 'outcome', id: 'a', session: 's1', time: 15 })
  log.appendEntry(dir, { kind: 'launch', task: 'b', session: 's2', time: 20 })
  assert.deepEqual(log.readEntries(dir, { task: 'a' }).map((e) => e.kind), ['launch', 'outcome'])
  assert.deepEqual(log.readEntries(dir, { session: 's2' }).map((e) => e.task), ['b'])
  assert.equal(log.readEntries(dir, { since: 16 }).length, 1)
})

test('no file reads as an empty log, and a broken line is skipped', (t) => {
  const dir = tempDir(t)
  assert.deepEqual(log.readEntries(dir), [])
  log.appendEntry(dir, { kind: 'launch', task: 'a', time: 1 })
  fs.appendFileSync(log.logFile(dir), '{not json\n')
  log.appendEntry(dir, { kind: 'verdict', task: 'a', time: 2 })
  assert.deepEqual(log.readEntries(dir).map((e) => e.kind), ['launch', 'verdict'])
})

test('a long text is cut so that a line stays small', (t) => {
  const dir = tempDir(t)
  log.appendEntry(dir, { kind: 'outcome', id: 'a', time: 1, detail: 'x'.repeat(9000), nested: { more: 'y'.repeat(9000) } })
  const [entry] = log.readEntries(dir)
  assert.ok(entry.detail.length <= log.MAX_TEXT + 1 && entry.detail.endsWith('…'))
  assert.ok(entry.nested.more.length <= log.MAX_TEXT + 1)
})

test('an entry that cannot be written gives false, never an error', (t) => {
  const dir = tempDir(t)
  fs.writeFileSync(path.join(dir, 'delegates'), 'a file where the folder should be')
  assert.equal(log.appendEntry(dir, { kind: 'launch', task: 'a', time: 1 }), false)
})

test('twenty processes appending at once leave twenty whole lines (R16)', async (t) => {
  const dir = tempDir(t)
  const children = Array.from({ length: 20 }, (_, n) => new Promise((resolve, reject) => {
    const script = `require(${JSON.stringify(LIB)}).appendEntry(${JSON.stringify(dir)}, { kind: 'outcome', id: 't', time: Date.now(), n: ${n}, detail: 'x'.repeat(3000) })`
    const child = spawn(process.execPath, ['-e', script])
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  }))
  await Promise.all(children)
  const lines = fs.readFileSync(log.logFile(dir), 'utf8').split('\n').filter(Boolean)
  assert.equal(lines.length, 20)
  assert.deepEqual(lines.map((line) => JSON.parse(line).n).sort((a, b) => a - b), [...Array(20).keys()])
})

test('exports MAX_TEXT and cuts long strings in arrays and deep objects', (t) => {
  const dir = tempDir(t)
  assert.equal(log.MAX_TEXT, 4000)
  log.appendEntry(dir, {
    kind: 'result',
    task: 'c',
    arr: ['short', 'z'.repeat(5000), { inside: 'w'.repeat(6000) }]
  })
  const [entry] = log.readEntries(dir)
  assert.equal(entry.arr[0], 'short')
  assert.equal(entry.arr[1].length, log.MAX_TEXT + 1)
  assert.ok(entry.arr[1].endsWith('…'))
  assert.equal(entry.arr[2].inside.length, log.MAX_TEXT + 1)
  assert.ok(entry.arr[2].inside.endsWith('…'))
})

test('does not touch or create the retired journal', (t) => {
  const dir = tempDir(t)
  log.appendEntry(dir, { kind: 'launch', task: 't1', session: 's1', time: 100 })
  assert.equal(fs.existsSync(path.join(dir, 'rout' + 'er', 'dec' + 'isions.jsonl')), false)
})

test('resultRunId and delegateAttemptWindows extract finished, failed and in-flight editing attempts', (t) => {
  const dir = tempDir(t)
  const run1 = '20261116-010000-1111'
  assert.equal(log.resultRunId({ branch: `aether/${run1}/task-1` }), run1)
  assert.equal(log.resultRunId({ worktree: `/tmp/repo/.aether/worktrees/${run1}/task-1` }), run1)
  assert.equal(log.resultRunId({ branch: 'main', worktree: null }), null)

  log.appendEntry(dir, { kind: 'launch', time: 100, session: 's1', task: 't1', attempt: 1, edits: true })
  log.appendEntry(dir, { kind: 'result', time: 200, session: 's1', task: 't1', attempt: 1, branch: `aether/${run1}/task-1` })
  log.appendEntry(dir, { kind: 'launch', time: 300, session: 's1', task: 't2', attempt: 1, edits: true })
  log.appendEntry(dir, { kind: 'result', time: 450, session: 's1', task: 't2', attempt: 1, ok: false, branch: null })
  log.appendEntry(dir, { kind: 'launch', time: 500, session: 's1', task: 't3', attempt: 1, edits: true })
  log.appendEntry(dir, { kind: 'launch', time: 550, session: 's1', task: 't-claude', attempt: 1, edits: true })
  log.appendEntry(dir, { kind: 'ended', time: 580, session: 's1', task: 't-claude', attempt: 1 })
  log.appendEntry(dir, { kind: 'launch', time: 600, session: 's1', task: 'ro', attempt: 1, edits: false })

  const windows = log.delegateAttemptWindows(dir)
  assert.equal(windows.byRunId.get(run1), 200)
  assert.equal(windows.attempts.length, 3)
  assert.deepEqual(
    windows.attempts.map((a) => ({ task: a.task, launchTime: a.launchTime, resultTime: a.resultTime, runId: a.runId })),
    [
      { task: 't1', launchTime: 100, resultTime: 200, runId: run1 },
      { task: 't2', launchTime: 300, resultTime: 450, runId: null },
      { task: 't3', launchTime: 500, resultTime: null, runId: null },
    ],
  )
})

