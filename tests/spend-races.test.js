'use strict'

// The race guards of the spend code, with the order of the race fixed. The four-process race in spend-prune.test.js
// leaves the order to the scheduler; here a test makes the file system do, at an exact point of a read, what a prune or
// the usage meter would do there (a summary written, a file deleted, a part caught half written) by wrapping one `fs`
// method for its first call on a path.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useDataDir, tempDir } = require('./helpers.js')
const { MIN, T0, PRICES, meter, writeParts, laneCall, summaryOf, writeSummary, archivedTally, ageFile, outcome } = require('./spend-fixtures.js')
const { spendReport, readUsageEvents, outcomesFile } = require('../plugins/aether/lib/spend.js')
const { archiveSpend, archiveOutcomes } = require('../plugins/aether/lib/spend-archive.js')
const { pruneUsage } = require('../plugins/aether/lib/report.js')
const { pruneLog, logFile } = require('../plugins/aether/lib/lanes.js')

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
const report = (dataDir, session) => spendReport({ dataDir, session, prices: PRICES })
const summaryPath = (dataDir, id) => path.join(dataDir, 'spend', `${id}.json`)
const onDisk = (dataDir, id) => JSON.parse(fs.readFileSync(summaryPath(dataDir, id), 'utf8'))

// Wraps fs[method] for the rest of the test. `act(calls)` runs before the real call of the first call whose first
// argument matches `match`, or of each of them with `every`; `calls` counts the matching calls so far, from 1. What
// `act` does through other `fs` methods, or through this one, is not counted. The real call always follows.
function wrap(t, method, match, act, { every = false } = {}) {
  const real = fs[method]
  let calls = 0
  let acting = false
  t.mock.method(fs, method, function (...args) {
    if (!acting && typeof args[0] === 'string' && match(args[0])) {
      calls++
      if (every || calls === 1) {
        acting = true
        try {
          act(calls)
        } finally {
          acting = false
        }
      }
    }
    return real.apply(this, args)
  })
}

const inDir = (dir) => (file) => file === dir
const isFile = (file) => (candidate) => candidate === file

test('archiveSpend adds to the summary it rereads just before it writes, so a stretch another prune archived meanwhile is kept', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input'), meter(1, 'm-a', null, 'input')] }])
  // The lane prune writes its summary after the usage archive read the (missing) summary and before it rereads it.
  const lanes = summaryOf('s1', { through: { usage: null, lanes: T0 + 5 * MIN } })
  wrap(t, 'readdirSync', inDir(path.join(dataDir, 'usage', 's1')), () => writeSummary(dataDir, 's1', lanes))
  assert.deepEqual(archiveSpend(dataDir, 's1', 'usage', { prices: PRICES }), { archived: true, events: 2 })
  const summary = onDisk(dataDir, 's1')
  assert.equal(summary.through.lanes, T0 + 5 * MIN)
  assert.equal(summary.through.usage, T0 + MIN)
  close(summary.tally.usd, archivedTally().usd + 2)
  assert.equal(summary.tally.harness.calls, 1)
})

test('archiveSpend writes nothing when another prune of the same source got as far while it read', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input'), meter(1, 'm-a', null, 'input')] }])
  const further = summaryOf('s1', { through: { usage: T0 + 10 * MIN, lanes: null } })
  wrap(t, 'readdirSync', inDir(path.join(dataDir, 'usage', 's1')), () => writeSummary(dataDir, 's1', further))
  assert.deepEqual(archiveSpend(dataDir, 's1', 'usage', { prices: PRICES }), { archived: false, events: 0 })
  const summary = onDisk(dataDir, 's1')
  assert.equal(summary.through.usage, T0 + 10 * MIN)
  close(summary.tally.usd, archivedTally().usd)
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'spend')), ['s1.json'])
})

test('archiveSpend adds only past the mark of the summary it rereads, once', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input'), meter(1, 'm-a', null, 'input'), meter(2, 'm-a', null, 'input')] }])
  // Another prune of the same source archived the first request meanwhile.
  const partial = summaryOf('s1', { through: { usage: T0, lanes: null } })
  wrap(t, 'readdirSync', inDir(path.join(dataDir, 'usage', 's1')), () => writeSummary(dataDir, 's1', partial))
  assert.deepEqual(archiveSpend(dataDir, 's1', 'usage', { prices: PRICES }), { archived: true, events: 2 })
  assert.equal(onDisk(dataDir, 's1').through.usage, T0 + 2 * MIN)
  close(onDisk(dataDir, 's1').tally.usd, archivedTally().usd + 2)
})

test('archiveSpend writes nothing when a part vanished before it was read: another prune is deleting it, and archived it first', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }, { entries: [meter(1, 'm-a', null, 'input')] }])
  const second = path.join(dataDir, 'usage', 's1', '1.json')
  wrap(t, 'readFileSync', isFile(second), () => fs.rmSync(second))
  assert.deepEqual(archiveSpend(dataDir, 's1', 'usage', { prices: PRICES }), { archived: false, events: 0 })
  assert.deepEqual(fs.existsSync(path.join(dataDir, 'spend')) ? fs.readdirSync(path.join(dataDir, 'spend')) : [], [])
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 's1', '0.json')), true)
})

test('archiveSpend writes nothing when the lane log vanished before it was read', (t) => {
  const dataDir = useDataDir(t)
  laneCall(dataDir, 's1', 1, 'm-a')
  const file = logFile(dataDir, 's1')
  wrap(t, 'readFileSync', isFile(file), () => fs.rmSync(file))
  assert.deepEqual(archiveSpend(dataDir, 's1', 'lanes', { prices: PRICES }), { archived: false, events: 0 })
  assert.deepEqual(fs.existsSync(path.join(dataDir, 'spend')) ? fs.readdirSync(path.join(dataDir, 'spend')) : [], [])
})

test('a prune whose session was archived and deleted by another prune meanwhile does not throw and does not count it twice', (t) => {
  const dataDir = useDataDir(t)
  laneCall(dataDir, 's1', 1, 'm-b', 'output')
  ageFile(logFile(dataDir, 's1'), 31 * 24)
  const figure = report(dataDir, 's1')
  const file = logFile(dataDir, 's1')
  // The other prune archives and deletes before this prune takes the session lock.
  wrap(t, 'statSync', isFile(file), () => {
    archiveSpend(dataDir, 's1', 'lanes', { prices: PRICES })
    fs.rmSync(file)
  })
  assert.doesNotThrow(() => pruneLog(dataDir, { days: 30, prices: PRICES }))
  assert.equal(onDisk(dataDir, 's1').tally.harness.calls, 1)
  assert.deepEqual(report(dataDir, 's1'), figure)
})

test('a prune skips a log that another prune deleted between the listing and the stat', (t) => {
  const dataDir = useDataDir(t)
  laneCall(dataDir, 's1', 1, 'm-a')
  const file = logFile(dataDir, 's1')
  ageFile(file, 31 * 24)
  wrap(t, 'statSync', isFile(file), () => fs.rmSync(file))
  let result
  assert.doesNotThrow(() => (result = pruneLog(dataDir, { days: 30, prices: PRICES })))
  assert.deepEqual(result, { pruned: [] })
  assert.deepEqual(fs.existsSync(path.join(dataDir, 'spend')) ? fs.readdirSync(path.join(dataDir, 'spend')) : [], [])
})

test('a prune skips a usage session that another prune deleted between the listing and the stat', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const dir = path.join(dataDir, 'usage', 's1')
  for (const name of fs.readdirSync(dir)) ageFile(path.join(dir, name), 31 * 24)
  ageFile(dir, 31 * 24)
  wrap(t, 'statSync', isFile(dir), () => fs.rmSync(dir, { recursive: true }))
  let result
  assert.doesNotThrow(() => (result = pruneUsage(dataDir, { days: 30, prices: PRICES })))
  assert.deepEqual(result, { pruned: [] })
  assert.deepEqual(fs.existsSync(path.join(dataDir, 'spend')) ? fs.readdirSync(path.join(dataDir, 'spend')) : [], [])
})

test('a figure read while a prune archives and deletes is each event once: the read goes again', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }, { entries: [meter(1, 'm-a', null, 'input')] }])
  laneCall(dataDir, 's1', 2, 'm-b', 'output')
  const whole = report(dataDir, 's1')
  const second = path.join(dataDir, 'usage', 's1', '1.json')
  // A prune of the meter's parts runs between the read of part 0 and the read of part 1: summary first, then delete.
  wrap(t, 'readFileSync', isFile(second), () => {
    archiveSpend(dataDir, 's1', 'usage', { prices: PRICES })
    fs.rmSync(path.join(dataDir, 'usage', 's1'), { recursive: true })
  })
  const r = report(dataDir, 's1')
  assert.deepEqual(r, whole)
  assert.equal(r.complete, true)
})

test('a read that still races a prune after its last attempt is not complete: a part vanished on every attempt', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const dir = path.join(dataDir, 'usage', 's1')
  const real = fs.readdirSync
  let listings = 0
  // A part that is listed and gone when it is read, every time.
  t.mock.method(fs, 'readdirSync', function (target, ...rest) {
    const names = real.call(this, target, ...rest)
    if (target !== dir) return names
    listings++
    return [...names, '9.json']
  })
  const r = report(dataDir, 's1')
  assert.equal(listings, 3)
  assert.equal(r.recorded, true)
  assert.equal(r.complete, false)
  close(r.usd, 1)
})

test('a read that finds a part gone once, and the figure settled on the next attempt, is complete', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const dir = path.join(dataDir, 'usage', 's1')
  const real = fs.readdirSync
  let listings = 0
  t.mock.method(fs, 'readdirSync', function (target, ...rest) {
    const names = real.call(this, target, ...rest)
    if (target !== dir) return names
    return ++listings === 1 ? [...names, '9.json'] : names
  })
  const r = report(dataDir, 's1')
  assert.equal(listings, 2)
  assert.equal(r.complete, true)
  close(r.usd, 1)
})

test('a read that finds the summary changed on every attempt is not complete', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  writeSummary(dataDir, 's1', summaryOf('s1', { writtenAt: T0 }))
  // A summary that changes between the first read of it and the check that follows the raw files, on every attempt.
  wrap(t, 'readdirSync', inDir(path.join(dataDir, 'usage', 's1')), (calls) => writeSummary(dataDir, 's1', summaryOf('s1', { writtenAt: T0 + calls })), { every: true })
  const r = report(dataDir, 's1')
  assert.equal(r.recorded, true)
  assert.equal(r.complete, false)
})

test('a read that finds the summary changed once, and then steady, is complete', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  writeSummary(dataDir, 's1', summaryOf('s1', { writtenAt: T0 }))
  wrap(t, 'readdirSync', inDir(path.join(dataDir, 'usage', 's1')), () => writeSummary(dataDir, 's1', summaryOf('s1', { writtenAt: T0 + 1 })))
  assert.equal(report(dataDir, 's1').complete, true)
})

test('a part caught while the meter rewrites it is read again once before it counts as unreadable', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }, { entries: [meter(1, 'm-a', null, 'input')] }])
  const second = path.join(dataDir, 'usage', 's1', '1.json')
  const real = fs.readFileSync
  let reads = 0
  // The first read of part 1 finds it half written; the next finds it whole.
  t.mock.method(fs, 'readFileSync', function (file, ...rest) {
    if (file === second && ++reads === 1) return '{"session":"s1","part":1,"agents":{},"entr'
    return real.call(this, file, ...rest)
  })
  const read = readUsageEvents(dataDir, 's1', { prices: PRICES })
  assert.equal(reads, 2)
  assert.deepEqual([read.events.length, read.complete, read.vanished], [2, true, false])
  const r = report(dataDir, 's1')
  assert.equal(r.complete, true)
  close(r.usd, 2)
})

test('a part that is unreadable on the second read too makes the figure incomplete, with the other parts kept', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }, { entries: [meter(1, 'm-a', null, 'input')] }])
  const second = path.join(dataDir, 'usage', 's1', '1.json')
  const real = fs.readFileSync
  let reads = 0
  t.mock.method(fs, 'readFileSync', function (file, ...rest) {
    if (file === second) {
      reads++
      return '{"session":"s1","part":1,"agents":{},"entr'
    }
    return real.call(this, file, ...rest)
  })
  const read = readUsageEvents(dataDir, 's1', { prices: PRICES })
  assert.equal(reads, 2)
  assert.deepEqual([read.events.length, read.complete], [1, false])
})

test('a part that vanished is not read a second time', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const ghost = path.join(dataDir, 'usage', 's1', '9.json')
  const real = fs.readdirSync
  let reads = 0
  t.mock.method(fs, 'readdirSync', function (target, ...rest) {
    const names = real.call(this, target, ...rest)
    return target === path.dirname(ghost) ? [...names, '9.json'] : names
  })
  const realRead = fs.readFileSync
  t.mock.method(fs, 'readFileSync', function (file, ...rest) {
    if (file === ghost) reads++
    return realRead.call(this, file, ...rest)
  })
  const read = readUsageEvents(dataDir, 's1', { prices: PRICES })
  assert.equal(reads, 1)
  assert.deepEqual([read.vanished, read.complete], [true, true])
})

test('archiveSpend holds the session lock while it renames the summary, and releases it (R10)', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const lock = path.join(dataDir, 'spend', '.s1.lock')
  let heldDuringRename = null
  wrap(t, 'renameSync', (file) => file.startsWith(summaryPath(dataDir, 's1')), () => { heldDuringRename = fs.existsSync(lock) })
  assert.deepEqual(archiveSpend(dataDir, 's1', 'usage', { prices: PRICES }), { archived: true, events: 1 })
  assert.equal(heldDuringRename, true)
  assert.equal(fs.existsSync(lock), false)
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'spend-archive.js'), 'utf8'), /nobody prunes it|no lock is added/)
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'spend.js'), 'utf8'), /nobody prunes them/)
})

test('a stale session lock does not stop archiveSpend (R10)', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 's1', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  const lock = path.join(dataDir, 'spend', '.s1.lock')
  fs.mkdirSync(path.dirname(lock), { recursive: true })
  fs.writeFileSync(lock, '')
  ageFile(lock, 1)
  assert.deepEqual(archiveSpend(dataDir, 's1', 'usage', { prices: PRICES }), { archived: true, events: 1 })
})

test('archiveOutcomes keeps the outcomes of a session in its own file, and the report counts them once while the log holds them and after it is gone (R12)', (t) => {
  const dataDir = useDataDir(t)
  const price = outcome(dataDir, 's-d', 3, 'm-b', 'output')
  close(report(dataDir, 's-d').usd, price)
  assert.deepEqual(archiveOutcomes(dataDir, 's-d'), { archived: true, lines: 1 })
  assert.deepEqual(archiveOutcomes(dataDir, 's-d'), { archived: true, lines: 0 })
  assert.equal(fs.readFileSync(outcomesFile(dataDir, 's-d'), 'utf8').trim().split('\n').length, 1)
  for (const phase of ['log still holds the outcome', 'log is gone']) {
    const after = report(dataDir, 's-d')
    close(after.usd, price)
    assert.equal(after.harness.calls, 1, phase)
    assert.equal(after.complete, true, phase)
    fs.rmSync(path.join(dataDir, 'delegates', 'log.jsonl'), { force: true })
  }
  assert.deepEqual(archiveOutcomes(dataDir, 's-d'), { archived: false, lines: 0 })
})

test('the same outcome in two installs is counted once, and a different one is never hidden (R12)', (t) => {
  const root = tempDir(t, 'aether-installs-')
  const home = path.join(root, 'data', 'aether-aether-plugin')
  const other = path.join(root, 'data', 'aether-inline')
  const same = outcome(home, 's-x', 2, 'm-b', 'output')
  outcome(other, 's-x', 2, 'm-b', 'output')
  const apart = outcome(other, 's-x', 1, 'm-b', 'output')
  close(report(home, 's-x').usd, same + apart)
  assert.deepEqual(archiveOutcomes(home, 's-x'), { archived: true, lines: 1 })
  fs.rmSync(path.join(home, 'delegates', 'log.jsonl'), { force: true })
  close(report(home, 's-x').usd, same + apart)
  close(report(other, 's-x').usd, same + apart)
})

test('archiveOutcomes throws when the log cannot be read, so the caller keeps it (R12)', (t) => {
  const dataDir = useDataDir(t)
  fs.mkdirSync(path.join(dataDir, 'delegates', 'log.jsonl'), { recursive: true })
  assert.throws(() => archiveOutcomes(dataDir, 's-e'))
  assert.equal(fs.existsSync(outcomesFile(dataDir, 's-e')), false)
})

test('archiveOutcomes preserves exact lines, skips other sessions and malformed JSON, and rejects invalid ids', (t) => {
  const dataDir = useDataDir(t)
  assert.deepEqual(archiveOutcomes(dataDir, '../bad'), { archived: false, lines: 0 })
  outcome(dataDir, 's-exact', 1, 'm-b', 'output')
  const file = path.join(dataDir, 'delegates', 'log.jsonl')
  const original = fs.readFileSync(file, 'utf8').trim()
  const distinct = ' ' + original
  fs.appendFileSync(file, distinct + '\n{broken\n' + JSON.stringify({ kind: 'outcome', session: 'other' }) + '\n')
  assert.deepEqual(archiveOutcomes(dataDir, 's-exact'), { archived: true, lines: 2 })
  assert.equal(fs.readFileSync(outcomesFile(dataDir, 's-exact'), 'utf8'), original + '\n' + distinct + '\n')
  assert.equal(report(dataDir, 's-exact').harness.calls, 2)
})

test('archiveOutcomes holds and releases the lock, and throws if its saved lines cannot be verified', (t) => {
  const dataDir = useDataDir(t)
  outcome(dataDir, 's-verify', 1, 'm-b', 'output')
  const file = outcomesFile(dataDir, 's-verify')
  const lock = path.join(dataDir, 'spend', '.s-verify.lock')
  wrap(t, 'renameSync', (temporary) => temporary.includes('.s-verify.outcomes.jsonl.'), () => assert.equal(fs.existsSync(lock), true))
  wrap(t, 'readFileSync', isFile(file), (calls) => {
    if (calls === 2) fs.writeFileSync(file, '')
  }, { every: true })
  assert.throws(() => archiveOutcomes(dataDir, 's-verify'), /verification failed/)
  assert.equal(fs.existsSync(lock), false)
  assert.equal(fs.existsSync(path.join(dataDir, 'delegates', 'log.jsonl')), true)
})

test('duplicate outcome lines in one log count once before and after pruning', (t) => {
  const dataDir = useDataDir(t)
  const price = outcome(dataDir, 's-duplicate', 1, 'm-b', 'output')
  const log = path.join(dataDir, 'delegates', 'log.jsonl')
  fs.appendFileSync(log, fs.readFileSync(log, 'utf8'))
  const before = report(dataDir, 's-duplicate')
  close(before.usd, price)
  assert.equal(before.harness.calls, 1)
  assert.deepEqual(archiveOutcomes(dataDir, 's-duplicate'), { archived: true, lines: 1 })
  fs.rmSync(log)
  assert.deepEqual(report(dataDir, 's-duplicate'), before)
})

test('archiving new outcomes preserves older archived lines absent from the log', (t) => {
  const dataDir = useDataDir(t)
  const oldPrice = outcome(dataDir, 's-old', 1, 'm-b', 'output')
  const log = path.join(dataDir, 'delegates', 'log.jsonl')
  const oldLine = fs.readFileSync(log, 'utf8')
  assert.deepEqual(archiveOutcomes(dataDir, 's-old'), { archived: true, lines: 1 })
  fs.rmSync(log)
  const newPrice = outcome(dataDir, 's-old', 2, 'm-b', 'output')
  const newLine = fs.readFileSync(log, 'utf8')
  assert.deepEqual(archiveOutcomes(dataDir, 's-old'), { archived: true, lines: 1 })
  assert.equal(fs.readFileSync(outcomesFile(dataDir, 's-old'), 'utf8'), oldLine + newLine)
  fs.rmSync(log)
  close(report(dataDir, 's-old').usd, oldPrice + newPrice)
})

test('a readable log with no matching outcome produces no archive', (t) => {
  const dataDir = useDataDir(t)
  outcome(dataDir, 'other', 1, 'm-b', 'output')
  assert.deepEqual(archiveOutcomes(dataDir, 's-absent'), { archived: false, lines: 0 })
  assert.equal(fs.existsSync(outcomesFile(dataDir, 's-absent')), false)
})

test('an atomic outcome archive write failure throws and leaves the log intact', (t) => {
  const dataDir = useDataDir(t)
  outcome(dataDir, 's-write', 1, 'm-b', 'output')
  const log = path.join(dataDir, 'delegates', 'log.jsonl')
  const original = fs.readFileSync(log, 'utf8')
  wrap(t, 'renameSync', (file) => file.includes('.s-write.outcomes.jsonl.'), () => { throw new Error('write failed') })
  assert.throws(() => archiveOutcomes(dataDir, 's-write'), /write failed/)
  assert.equal(fs.readFileSync(log, 'utf8'), original)
  assert.equal(fs.existsSync(outcomesFile(dataDir, 's-write')), false)
})

test('report reads every log before archives during an archive and delete race', (t) => {
  const root = tempDir(t, 'aether-installs-')
  const home = path.join(root, 'data', 'aether-aether-plugin')
  const other = path.join(root, 'data', 'aether-inline')
  const price = outcome(other, 's-race', 1, 'm-b', 'output')
  const logs = [home, other].map((dir) => path.join(dir, 'delegates', 'log.jsonl'))
  const archives = [home, other].map((dir) => outcomesFile(dir, 's-race'))
  const seen = []
  const real = fs.readFileSync
  let racing = false
  t.mock.method(fs, 'readFileSync', function (file, ...args) {
    if (!racing && (logs.includes(file) || archives.includes(file))) {
      seen.push(file)
      if (archives.includes(file) && !racing) {
        racing = true
        assert.deepEqual(archiveOutcomes(other, 's-race'), { archived: true, lines: 1 })
        fs.rmSync(logs[1])
      }
    }
    return real.call(this, file, ...args)
  })
  const result = report(home, 's-race')
  assert.deepEqual(new Set(seen.slice(0, 2)), new Set(logs))
  assert.ok(archives.includes(seen[2]))
  close(result.usd, price)
  assert.equal(result.harness.calls, 1)
  assert.equal(result.complete, true)
})
