'use strict'

// The summary a prune leaves for a session (spend/<id>.json, read by lib/spend.js). Before pruneUsage or pruneLog
// deletes a session's meter parts or its lane log, archiveSpend adds what that source spent to the session's summary.
// The summary is only added to, never replaced. Its mark per source (`through`) is the newest time it holds of that
// source, and lib/spend.js skips what is still on disk at or before the mark: an archive repeated, a delete that
// failed after the archive, or a read between the two count every event once. The router's journal is not archived:
// nobody prunes it.

const fs = require('node:fs')
const crypto = require('node:crypto')
const { loadPrices } = require('./prices.js')
const { isTime, later, isSessionId, spendDir, summaryFile, emptyTally, tallyOf, mergeTallies, readUsageEvents, readLaneEvents, readSummary } = require('./spend.js')

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
// Two prunes may archive the same id at once. Just before it writes, it reads the summary again: when that summary's
// mark of this source is already at or past the one this archive reaches, another prune of the same source got as far,
// and it writes nothing. Otherwise it adds its stretch to the summary it has just read, past that summary's mark, so a
// stretch the other source archived meanwhile is kept. That check does not look at the other source: a rename of the
// other source's prune that falls between this reread and this rename is overwritten (plan, Risks; no lock is added).
// It throws when the summary cannot be written, and the caller then keeps the raw files.
function archiveSpend(dataDir, session, source, { prices = loadPrices() } = {}) {
  if (!Object.hasOwn(READERS, source)) throw new Error(`unknown spend source: ${source}`)
  if (!isSessionId(session)) return nothing()
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
}

module.exports = { archiveSpend }
