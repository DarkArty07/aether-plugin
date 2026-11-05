'use strict'

// The 30-day prune of the delegate log (R12): outcomes are archived first, lines of other sessions and lines it cannot
// read stay, and a session that cannot be archived is kept.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const prune = require('../plugins/aether/lib/delegate-prune.js')
const { failuresFile } = require('../plugins/aether/lib/spend-archive.js')
const { spendReport, outcomesFile } = require('../plugins/aether/lib/spend.js')
const { PRICES, T0, MIN, outcome, usdOf } = require('./spend-fixtures.js')

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('pruneDelegateLog archives the outcomes of sessions idle past the window, keeps a line appended meanwhile, and leaves --spend exact (R12)', (t) => {
  const dataDir = tempDir(t, 'aether-del-prune-')
  const DAY = 86400000
  const now = T0 + 40 * DAY
  const price = outcome(dataDir, 's-old', 1, 'm-b', 'output')
  log.appendEntry(dataDir, { kind: 'launch', task: 't-old', attempt: 1, session: 's-old', time: T0, step: 'haiku' })
  log.appendEntry(dataDir, { kind: 'launch', task: 't-new', attempt: 1, session: 's-new', time: now - DAY, step: 'haiku' })
  close(spendReport({ dataDir, session: 's-old', prices: PRICES }).usd, price)

  const file = log.logFile(dataDir)
  const real = fs.readFileSync
  let injected = false
  t.mock.method(fs, 'readFileSync', function (target, ...rest) {
    const out = real.call(this, target, ...rest)
    if (!injected && target === file) {
      injected = true
      fs.appendFileSync(file, JSON.stringify({ kind: 'launch', task: 't-live', attempt: 1, session: 's-live', time: now, step: 'haiku' }) + '\n')
    }
    return out
  })
  const res = prune.pruneDelegateLog(dataDir, { days: 30, now })
  t.mock.restoreAll()

  assert.deepEqual(res, { pruned: ['s-old'] })
  assert.deepEqual([...new Set(log.readEntries(dataDir).map((e) => e.session))].sort(), ['s-live', 's-new'])
  assert.equal(fs.readFileSync(outcomesFile(dataDir, 's-old'), 'utf8').trim().split('\n').length, 1)
  const after = spendReport({ dataDir, session: 's-old', prices: PRICES })
  close(after.usd, price)
  assert.equal(after.harness.calls, 1)
  assert.equal(after.complete, true)
  assert.deepEqual(prune.pruneDelegateLog(dataDir, { days: 30, now }), { pruned: [] })
})

test('pruneDelegateLog leaves an empty data directory empty (R12)', (t) => {
  const dataDir = tempDir(t, 'aether-del-prune-')
  assert.deepEqual(prune.pruneDelegateLog(dataDir, { days: 30, now: Date.now() }), { pruned: [] })
  assert.deepEqual(fs.readdirSync(dataDir), [])
})

test('an outcome of an idle session that arrives while the prune runs is archived too, never lost (R12)', (t) => {
  const dataDir = tempDir(t, 'aether-del-prune-')
  const DAY = 86400000
  const now = T0 + 40 * DAY
  const first = outcome(dataDir, 's-old', 1, 'm-b', 'output')
  const file = log.logFile(dataDir)
  const archived = outcomesFile(dataDir, 's-old')
  const late = { kind: 'outcome', id: 'd-5', time: T0 + 5 * MIN, session: 's-old', status: 'ok', harness: 'agy', model: 'm-b', effort: 'low', durationMs: 1, usage: { output: 1e6 }, attempt: 1 }
  const real = fs.renameSync
  let injected = false
  t.mock.method(fs, 'renameSync', function (from, to, ...rest) {
    const out = real.call(this, from, to, ...rest)
    if (!injected && String(to) === archived) {
      injected = true
      fs.appendFileSync(file, JSON.stringify(late) + '\n')
    }
    return out
  })
  const res = prune.pruneDelegateLog(dataDir, { days: 30, now })
  t.mock.restoreAll()
  assert.deepEqual(res, { pruned: ['s-old'] })
  assert.equal(log.readEntries(dataDir).some((e) => e.session === 's-old'), false)
  close(spendReport({ dataDir, session: 's-old', prices: PRICES }).usd, first + usdOf({ model: 'm-b', agent: 'lane', output: 1e6 }))
})

test('pruneDelegateLog keeps a session whose outcomes cannot be archived, and removes old launch files (R12)', (t) => {
  if (process.getuid && process.getuid() === 0) return t.skip('chmod does not stop root')
  const dataDir = tempDir(t, 'aether-del-prune-')
  const DAY = 86400000
  const now = T0 + 40 * DAY
  outcome(dataDir, 's-stuck', 1, 'm-b', 'output')
  fs.mkdirSync(path.join(dataDir, 'spend'), { recursive: true })
  fs.chmodSync(path.join(dataDir, 'spend'), 0o500)
  t.after(() => { if (fs.existsSync(path.join(dataDir, 'spend'))) fs.chmodSync(path.join(dataDir, 'spend'), 0o700) })
  const folders = ['in', 'briefs', 'external', 'results', 'run', 'patches', 'answers']
  for (const sub of folders) {
    const oldFile = path.join(dataDir, 'delegates', sub, 'old.dat')
    const freshFile = path.join(dataDir, 'delegates', sub, 'fresh.dat')
    fs.mkdirSync(path.dirname(oldFile), { recursive: true })
    fs.writeFileSync(oldFile, '{}')
    fs.writeFileSync(freshFile, '{}')
    fs.utimesSync(oldFile, new Date(now - 31 * DAY), new Date(now - 31 * DAY))
    fs.utimesSync(freshFile, new Date(now - DAY), new Date(now - DAY))
  }
  const res = prune.pruneDelegateLog(dataDir, { days: 30, now })
  assert.deepEqual(res, { pruned: [] })
  assert.equal(log.readEntries(dataDir, { session: 's-stuck' }).length, 1)
  for (const sub of folders) {
    assert.equal(fs.existsSync(path.join(dataDir, 'delegates', sub, 'old.dat')), false, sub)
    assert.equal(fs.existsSync(path.join(dataDir, 'delegates', sub, 'fresh.dat')), true, sub)
  }
})

test('pruneDelegateLog judges a session by its newest entry, and keeps sessions with no numeric time, entries with no session and unreadable lines (R12)', (t) => {
  const dataDir = tempDir(t, 'aether-del-prune-')
  const DAY = 86400000
  const now = T0 + 40 * DAY
  const file = log.logFile(dataDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const lines = [
    JSON.stringify({ kind: 'launch', task: 'a', session: 's-mixed', time: T0 }),
    JSON.stringify({ kind: 'launch', task: 'b', session: 's-mixed', time: now - DAY }),
    JSON.stringify({ kind: 'launch', task: 'c', session: 's-old', time: T0 }),
    JSON.stringify({ kind: 'launch', task: 'd', session: 's-untimed' }),
    JSON.stringify({ kind: 'launch', task: 'e', session: 's-strtime', time: 'yesterday' }),
    JSON.stringify({ kind: 'launch', task: 'f' }),
    '{ not json',
  ]
  fs.writeFileSync(file, lines.join('\n') + '\n')
  assert.deepEqual(prune.pruneDelegateLog(dataDir, { days: 30, now }), { pruned: ['s-old'] })
  const kept = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  assert.deepEqual(kept, lines.filter((line) => !line.includes('"s-old"')))
})

test('pruneDelegateLog keeps a session whose second archive, under the lock, fails, and leaves a trace of it (R12)', (t) => {
  const dataDir = tempDir(t, 'aether-del-prune-')
  const DAY = 86400000
  const now = T0 + 40 * DAY
  outcome(dataDir, 's-old', 1, 'm-b', 'output')
  const archived = outcomesFile(dataDir, 's-old')
  const real = fs.renameSync
  let renames = 0
  t.mock.method(fs, 'renameSync', function (from, to, ...rest) {
    if (String(to) === archived && ++renames === 2) throw new Error('disk full')
    return real.call(this, from, to, ...rest)
  })
  const res = prune.pruneDelegateLog(dataDir, { days: 30, now })
  t.mock.restoreAll()
  assert.deepEqual(res, { pruned: [] })
  assert.equal(log.readEntries(dataDir, { session: 's-old' }).length, 1)
  assert.match(JSON.parse(fs.readFileSync(failuresFile(dataDir), 'utf8'))['delegates/s-old'].error, /disk full/)
})
