'use strict'

// The summary a prune leaves for a session (spend/<id>.json, read by lib/spend.js). Before pruneUsage or pruneLog
// deletes a session's meter parts or its lane log, archiveSpend adds what that source spent to the session's summary.
// The summary is only added to, never replaced. Its mark per source (`through`) is the newest time it holds of that
// source, and lib/spend.js skips what is still on disk at or before the mark: an archive repeated, a delete that
// failed after the archive, or a read between the two count every event once. archiveOutcomes archives delegate
// outcome lines in spend/<id>.outcomes.jsonl before the delegate log is pruned. A prune that could not archive a session leaves a trace of it (noteFailure, at the end).
// Family: spend.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { withLock, writeAtomic } = require('./common.js')
const delegateLog = require('./delegate-log.js')
const { loadPrices } = require('./prices.js')
const { isTime, later, isSessionId, spendDir, summaryFile, outcomesFile, emptyTally, tallyOf, mergeTallies, readUsageEvents, readLaneEvents, readSummary } = require('./spend.js')

// 'usage' = the meter's parts (usage/<id>/<n>.json), 'lanes' = the lane log (lanes/<id>.jsonl, its calls only).
const READERS = { usage: readUsageEvents, lanes: readLaneEvents }

const nothing = () => ({ archived: false, events: 0 })

// The newest numeric time among `events`, or null.
function newestTime(events) {
  let newest = null
  for (const event of events) if (isTime(event.time)) newest = later(newest, event.time)
  return newest
}

// The summary to add to, from a readSummary result: the one on disk, or an empty one. A summary on disk that cannot be
// read is started over, and what is added to it is incomplete.
function baseOf(found, session) {
  if (found.readable) return { summary: found.summary, complete: true }
  return { summary: { version: 1, session, writtenAt: null, through: { usage: null, lanes: null }, tally: emptyTally() }, complete: !found.exists }
}

// Writes the whole summary or nothing: to a temporary of the same directory, renamed over spend/<id>.json.
function writeSummary(dataDir, session, summary) {
  const file = summaryFile(dataDir, session)
  fs.mkdirSync(spendDir(dataDir), { recursive: true })
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(summary, null, 2)}\n`)
    fs.renameSync(temporary, file)
  } catch (err) {
    try {
      fs.rmSync(temporary, { force: true })
    } catch {}
    throw err
  }
}

// Adds to the summary of `session` what a prune is about to delete of `source`, and returns { archived, events }:
// whether it wrote, and how many events it added. It writes nothing for a name that is not a session id, for a source
// with no files, and when a file vanished while it read (another prune is deleting it, and archived it first).
//
// archiveSpend and archiveOutcomes run under the session lock spend/.<id>.lock.
// The summary is reread before writing so its through marks and existing tally are preserved.
// A write failure throws, and the caller then keeps the raw files.
function archiveSpend(dataDir, session, source, { prices = loadPrices() } = {}) {
  if (!Object.hasOwn(READERS, source)) throw new Error(`unknown spend source: ${source}`)
  if (!isSessionId(session)) return nothing()
  return withLock(path.join(dataDir, 'spend', '.' + session), () => {
    const first = baseOf(readSummary(dataDir, session), session)
    const read = READERS[source](dataDir, session, { after: first.summary.through[source], prices })
    if (!read.exists || read.vanished) return nothing()
    const reach = later(first.summary.through[source], newestTime(read.events))

    const base = baseOf(readSummary(dataDir, session), session)
    const mark = base.summary.through[source]
    if (isTime(mark) && (reach === null || mark >= reach)) return nothing()
    const events = read.events.filter((event) => !(isTime(mark) && isTime(event.time) && event.time <= mark))
    const stretch = { ...tallyOf(events), complete: read.complete && base.complete }
    const through = { usage: base.summary.through.usage, lanes: base.summary.through.lanes }
    through[source] = later(mark, newestTime(events))
    writeSummary(dataDir, session, {
      version: 1,
      session,
      writtenAt: later(base.summary.writtenAt, read.writtenAt),
      through,
      tally: mergeTallies(base.summary.tally, stretch),
    })
    return { archived: true, events: events.length }
  }, { waitMs: 10000, staleMs: 60000 })
}

// Preserves exact outcome lines before the caller removes them from the delegate log.
function archiveOutcomes(dataDir, session) {
  if (!isSessionId(session)) return { archived: false, lines: 0 }
  return withLock(path.join(dataDir, 'spend', '.' + session), () => {
    let text
    try {
      text = fs.readFileSync(delegateLog.logFile(dataDir), 'utf8')
    } catch (err) {
      if (err.code === 'ENOENT') return { archived: false, lines: 0 }
      throw err
    }
    const selected = text.split('\n').filter((line) => {
      try {
        const entry = JSON.parse(line)
        return entry !== null && entry.kind === 'outcome' && entry.session === session
      } catch { return false }
    })
    if (!selected.length) return { archived: false, lines: 0 }
    const file = outcomesFile(dataDir, session)
    let previous = ''
    try {
      previous = fs.readFileSync(file, 'utf8')
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    const union = new Set(previous.split('\n').filter((line) => line.length > 0))
    const before = union.size
    for (const line of selected) union.add(line)
    writeAtomic(file, [...union].join('\n') + '\n')
    const saved = new Set(fs.readFileSync(file, 'utf8').split('\n'))
    if (!selected.every((line) => saved.has(line))) throw new Error('outcome archive verification failed')
    return { archived: true, lines: union.size - before }
  }, { waitMs: 10000, staleMs: 60000 })
}

// --- the trace of a prune that skipped a session -----------------------------------------------------------

const failuresFile = (dataDir) => path.join(dataDir, 'prune-failures.json')

// A prune that cannot archive a session keeps its raw files and tries again at the next session start, and until now
// said nothing, so a session that can never be archived was skipped for good without a word. This leaves one trace of
// it: <dataDir>/prune-failures.json, { "<source>/<session>": { time, error } }. There is one entry per session and
// source that is stuck, replaced by the next failure of the same pair and removed when a prune gets through, so the
// file is as long as the list of stuck sessions and no longer. The prune is housekeeping that must never throw into the
// session start, and neither does its trace: these two return false when they could not write.
function readFailures(dataDir) {
  try {
    const table = JSON.parse(fs.readFileSync(failuresFile(dataDir), 'utf8'))
    return table !== null && typeof table === 'object' && !Array.isArray(table) ? table : {}
  } catch {
    return {}
  }
}

function noteFailure(dataDir, key, err, now = Date.now()) {
  try {
    const table = readFailures(dataDir)
    const error = String((err && err.message) || err).slice(0, 500)
    Object.defineProperty(table, key, { value: { time: now, error }, enumerable: true, writable: true, configurable: true })
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(failuresFile(dataDir), `${JSON.stringify(table, null, 2)}\n`)
    return true
  } catch {
    return false
  }
}

// Takes `key` out of the trace once the thing it names went through; the file goes with its last entry.
function clearFailure(dataDir, key) {
  try {
    const table = readFailures(dataDir)
    if (!Object.hasOwn(table, key)) return true
    delete table[key]
    if (Object.keys(table).length === 0) fs.rmSync(failuresFile(dataDir), { force: true })
    else fs.writeFileSync(failuresFile(dataDir), `${JSON.stringify(table, null, 2)}\n`)
    return true
  } catch {
    return false
  }
}

module.exports = { archiveSpend, archiveOutcomes, failuresFile, noteFailure, clearFailure }
