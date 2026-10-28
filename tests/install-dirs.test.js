'use strict'

// Issue 114: a run relaunched from another install keeps its records in that install's data directory. The readers of a
// report sum the directories of every install beside the one they are given (run.installDirs), and a record that is in
// two of them counts once. The layout is <tmp>/plugins/data/<install>, as the plugin's data directories are.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const run = require('../plugins/aether/lib/run.js')
const { appendLog, readAllLogs } = require('../plugins/aether/lib/lanes.js')
const delegateLog = require('../plugins/aether/lib/delegate-log.js')
const { seatsReport, readUsage } = require('../plugins/aether/lib/report.js')
const { spendReport } = require('../plugins/aether/lib/spend.js')
const { delegatesReport } = require('../plugins/aether/lib/delegate-report.js')
const { MIN, T0, PRICES, usdOf, meter, writeParts, laneCall, outcome, ageFile } = require('./spend-fixtures.js')

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)

// The installed release's directory and the development tree's, under one plugins data root.
function installs(t) {
  const data = path.join(tempDir(t), 'plugins', 'data')
  return { installed: path.join(data, 'aether-aether-plugin'), inline: path.join(data, 'aether-inline') }
}

test('installDirs gives the given directory first and the other installs beside it, and only itself outside a plugins data root', (t) => {
  const { installed, inline } = installs(t)
  assert.deepEqual(run.installDirs(installed), [installed, inline])
  assert.deepEqual(run.installDirs(inline), [inline, installed])
  const lone = tempDir(t)
  assert.deepEqual(run.installDirs(lone), [lone])
})

test('readAllLogs still reads the lane logs of every install, each entry once', (t) => {
  const { installed, inline } = installs(t)
  const same = { kind: 'call', seat: 'judge', time: T0, status: 'ok', model: 'm-a' }
  appendLog(installed, 's1', same)
  appendLog(inline, 's1', same)
  appendLog(inline, 's1', { kind: 'call', seat: 'writer', time: T0 + MIN, status: 'ok', model: 'm-a' })
  assert.deepEqual(readAllLogs(installed).map((entry) => entry.seat), ['judge', 'writer'])
})

test('seats count the design seats\' rounds that live only in the other install', (t) => {
  const { installed, inline } = installs(t)
  appendLog(installed, 's1', { kind: 'call', seat: 'judge', time: T0, status: 'ok', harness: 'agy', group: 'agy', model: 'm-a', effort: 'high', usage: { input: 1e6 } })
  appendLog(inline, 's1', { kind: 'call', seat: 'writer', time: T0 + MIN, status: 'quota', harness: 'agy', group: 'agy', model: 'm-a', effort: 'high', usage: {} })
  const r = seatsReport({ dataDir: installed, prices: PRICES })
  assert.equal(r.rounds, 2)
  assert.equal(r.bySeat.writer.rounds, 1)
  assert.deepEqual(r.bySeat.writer.reasons, { 'external quota': 1 })
  assert.equal(r.lanes.calls, 2)
})

test('seats count a round that is in both installs once', (t) => {
  const { installed, inline } = installs(t)
  const same = { kind: 'call', seat: 'judge', time: T0, status: 'ok', harness: 'agy', group: 'agy', model: 'm-a', effort: 'high', usage: { input: 1e6 } }
  appendLog(installed, 's1', same)
  appendLog(inline, 's1', same)
  assert.equal(seatsReport({ dataDir: installed, prices: PRICES }).rounds, 1)
})

test('spend counts a lane call, an outcome and a usage session that live only in the other install', (t) => {
  const { installed, inline } = installs(t)
  writeParts(inline, 's1', [{ agents: {}, entries: [meter(0, 'm-a', null, 'input')] }])
  laneCall(inline, 's1', 1, 'm-b', 'input')
  outcome(inline, 's1', 2, 'm-a', 'input')
  const r = spendReport({ dataDir: installed, session: 's1', prices: PRICES })
  assert.equal(r.recorded, true)
  assert.equal(r.complete, true)
  close(r.usd, usdOf({ model: 'm-a', input: 1e6 }) + usdOf({ model: 'm-b', agent: 'lane', input: 1e6 }) + usdOf({ model: 'm-a', agent: 'lane', input: 1e6 }))
  assert.equal(r.harness.calls, 2)
})

test('spend counts a lane call and an outcome that are in both installs once', (t) => {
  const { installed, inline } = installs(t)
  laneCall(installed, 's1', 1, 'm-b', 'input')
  laneCall(inline, 's1', 1, 'm-b', 'input')
  outcome(installed, 's1', 2, 'm-a', 'input')
  outcome(inline, 's1', 2, 'm-a', 'input')
  const r = spendReport({ dataDir: installed, session: 's1', prices: PRICES })
  close(r.usd, usdOf({ model: 'm-b', agent: 'lane', input: 1e6 }) + usdOf({ model: 'm-a', agent: 'lane', input: 1e6 }))
  assert.equal(r.harness.calls, 2)
})

test('a usage session directory in both installs is read from the first one that has it', (t) => {
  const { installed, inline } = installs(t)
  writeParts(installed, 's1', [{ agents: {}, entries: [meter(0, 'm-a', null, 'input')] }])
  writeParts(inline, 's1', [{ agents: {}, entries: [meter(1, 'm-b', null, 'input')] }])
  const r = spendReport({ dataDir: installed, session: 's1', prices: PRICES })
  assert.deepEqual(Object.keys(r.byModel), ['m-a'])
  close(r.usd, usdOf({ model: 'm-a', input: 1e6 }))
  assert.deepEqual(readUsage(installed).get('s1').entries.map((entry) => entry.model), ['m-a'])
})

test('the --spend session written to last is looked up in every install', (t) => {
  const { installed, inline } = installs(t)
  laneCall(installed, 'early', 1, 'm-a', 'input')
  ageFile(path.join(installed, 'lanes', 'early.jsonl'), 2)
  laneCall(inline, 'late', 5, 'm-a', 'input')
  assert.equal(spendReport({ dataDir: installed, prices: PRICES }).session, 'late')
})

test('the delegate report counts a launch that is only in the other install, and one in both once', (t) => {
  const { installed, inline } = installs(t)
  const launch = { kind: 'launch', task: 'other', session: 's1', time: 5, step: 'haiku', attempt: 1, launchKind: 'first', description: 'relaunched', effort: 'low', edits: false }
  delegateLog.appendEntry(inline, launch)
  delegateLog.appendEntry(installed, { ...launch, task: 'both', time: 6 })
  delegateLog.appendEntry(inline, { ...launch, task: 'both', time: 6 })
  const report = delegatesReport({ dataDir: installed })
  assert.deepEqual(report.delegations.map((row) => row.id), ['other', 'both'])
  assert.equal(report.ladder.steps[0].attempts, 2)
})

test('figures from one directory are as they were: the same records give the same spend in a lone directory', (t) => {
  const { installed } = installs(t)
  const lone = tempDir(t)
  for (const dir of [installed, lone]) {
    writeParts(dir, 's1', [{ agents: { a1: { type: 'aether:judge' } }, entries: [meter(0, 'm-a', null, 'input'), meter(1, 'm-b', 'a1', 'output')] }])
    laneCall(dir, 's1', 2, 'm-b', 'cacheRead')
    outcome(dir, 's1', 3, 'm-a', 'input')
  }
  assert.deepEqual(spendReport({ dataDir: installed, session: 's1', prices: PRICES }), spendReport({ dataDir: lone, session: 's1', prices: PRICES }))
})

test('one install keeps every line it holds, an identical pair included: only a copy in another install is left out', (t) => {
  const { installed } = installs(t)
  const call = { kind: 'call', seat: 'judge', time: T0, status: 'ok', harness: 'agy', group: 'agy', model: 'm-a', effort: 'high', usage: { input: 1e6 } }
  appendLog(installed, 's1', call)
  appendLog(installed, 's1', call)
  assert.equal(seatsReport({ dataDir: installed, prices: PRICES }).rounds, 2)
  const launch = { kind: 'launch', task: 'pair', session: 's1', time: 9, step: 'haiku', attempt: 1, launchKind: 'first', description: 'twice', effort: 'low', edits: false }
  delegateLog.appendEntry(installed, launch)
  delegateLog.appendEntry(installed, launch)
  assert.equal(delegatesReport({ dataDir: installed }).ladder.steps[0].attempts, 2)
})

// A task id is only unique within an install: the ladder reads its state through readEntries, which must not take in
// the entries another install holds for the same id; only a report sums (readAllEntries).
test('the ladder reads the delegate log of its own install alone, and a report reads every install', (t) => {
  const { installed, inline } = installs(t)
  const launch = { kind: 'launch', task: 'fix-1', session: 's1', time: 5, step: 'haiku', attempt: 1, launchKind: 'first', description: 'same id', effort: 'low', edits: false }
  delegateLog.appendEntry(installed, launch)
  delegateLog.appendEntry(inline, { ...launch, session: 's2', time: 6, step: 'sonnet', attempt: 3 })
  assert.deepEqual(delegateLog.readEntries(installed, { task: 'fix-1' }).map((e) => e.attempt), [1])
  assert.deepEqual(delegateLog.readEntries(inline, { task: 'fix-1' }).map((e) => e.attempt), [3])
  assert.deepEqual(delegateLog.readAllEntries(installed, { task: 'fix-1' }).map((e) => e.attempt), [1, 3])
})
