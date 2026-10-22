'use strict'

// The list-price spend of one session, whole (`aether-report --spend`): every request the usage meter kept
// (usage/<id>/<n>.json), every call of another harness (lanes/<id>.jsonl) and every `outcome` of the router's
// journal that belongs to the id, priced from config/prices.json and added into one Tally. A prune keeps what it
// deletes as a summary (spend/<id>.json, written by lib/spend-archive.js); the figure is that summary plus what is
// still on disk. This module only reads. It reads each source on its own: readUsage and readLog drop what they
// cannot read, and a dropped request is a dollar that vanishes.

const fs = require('node:fs')
const path = require('node:path')
const run = require('./run.js')
const { loadPrices, priceEntry } = require('./prices.js')
const { laneTokens } = require('./lanes.js')
const { journalFile } = require('./router-log.js')

const SESSION_ID = /^[A-Za-z0-9_-]+$/
// A gap strictly longer than this between two events of a session is a resumption.
const GAP_MS = 3600000
const PART = /^\d+\.json$/
const READ_ATTEMPTS = 3

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isTime = (value) => typeof value === 'number' && Number.isFinite(value)
const numberOrZero = (value) => (isTime(value) ? value : 0)
const textOrUnknown = (value) => (typeof value === 'string' && value !== '' ? value : 'unknown')

// An id of a session. `unknown` fits the pattern but is the lane log's file for what arrives with no session.
function isSessionId(id) {
  return typeof id === 'string' && SESSION_ID.test(id) && id !== 'unknown'
}

const spendDir = (dataDir) => path.join(dataDir, 'spend')
const summaryFile = (dataDir, id) => path.join(spendDir(dataDir), `${id}.json`)
const usageDir = (dataDir, id) => path.join(dataDir, 'usage', id)
const laneFile = (dataDir, id) => path.join(dataDir, 'lanes', `${id}.jsonl`)

// --- the Tally ---------------------------------------------------------------------------------------------

function emptyTally() {
  return {
    usd: 0,
    leadUsd: 0,
    agentsUsd: 0,
    byModel: {},
    byEffort: {},
    byRole: {},
    harness: { calls: 0, usd: 0, byModel: {} },
    unpriced: [],
    first: null,
    last: null,
    resumptions: 0,
    complete: true,
  }
}

// Sets `key` as an own property, so a name such as `__proto__` is only a name.
function own(table, key, value) {
  Object.defineProperty(table, key, { value, enumerable: true, writable: true, configurable: true })
}

// The bucket of `key`, created when absent.
function slot(table, key, fresh) {
  if (!Object.hasOwn(table, key)) own(table, key, fresh())
  return table[key]
}

// Adds `usd` and one to `count` ('requests' or 'calls') in the bucket of `key`.
function bump(table, key, usd, count, by = 1) {
  const bucket = slot(table, key, () => ({ usd: 0, [count]: 0 }))
  bucket.usd += usd
  bucket[count] += by
}

// Turns a list of events (SpendEvent, see the exports) into a Tally.
function tallyOf(events) {
  const tally = emptyTally()
  const unpriced = new Set()
  const times = []
  for (const event of events) {
    if (isTime(event.time)) times.push(event.time)
    const meter = event.source === 'meter'
    if (!meter) tally.harness.calls += 1
    if (event.usd === null) {
      unpriced.add(event.model)
      continue
    }
    tally.usd += event.usd
    bump(tally.byModel, event.model, event.usd, 'requests')
    bump(tally.byEffort, `${event.model} ${event.effort || 'unknown'}`, event.usd, 'requests')
    if (meter) {
      if (event.lead) tally.leadUsd += event.usd
      else tally.agentsUsd += event.usd
      bump(tally.byRole, event.role ?? (event.lead ? 'main' : 'agent'), event.usd, 'requests')
    } else {
      tally.harness.usd += event.usd
      bump(tally.harness.byModel, event.model, event.usd, 'calls')
    }
  }
  tally.unpriced = [...unpriced].sort()
  times.sort((a, b) => a - b)
  if (times.length > 0) {
    tally.first = times[0]
    tally.last = times[times.length - 1]
  }
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > GAP_MS) tally.resumptions += 1
  return tally
}

function mergeBuckets(a, b, count) {
  const merged = {}
  for (const table of [a, b]) for (const [key, bucket] of Object.entries(table)) bump(merged, key, bucket.usd, count, bucket[count])
  return merged
}

const earlier = (a, b) => (a === null ? b : b === null ? a : Math.min(a, b))
const later = (a, b) => (a === null ? b : b === null ? a : Math.max(a, b))

// Two Tallies as one: dollars and counts add. Resumptions add with no gap for the cut between the two parts: what a
// summary keeps and what is still on disk are two stretches of one session, and the cut is no gap in it.
function mergeTallies(a, b) {
  return {
    usd: a.usd + b.usd,
    leadUsd: a.leadUsd + b.leadUsd,
    agentsUsd: a.agentsUsd + b.agentsUsd,
    byModel: mergeBuckets(a.byModel, b.byModel, 'requests'),
    byEffort: mergeBuckets(a.byEffort, b.byEffort, 'requests'),
    byRole: mergeBuckets(a.byRole, b.byRole, 'requests'),
    harness: { calls: a.harness.calls + b.harness.calls, usd: a.harness.usd + b.harness.usd, byModel: mergeBuckets(a.harness.byModel, b.harness.byModel, 'calls') },
    unpriced: [...new Set([...a.unpriced, ...b.unpriced])].sort(),
    first: earlier(a.first, b.first),
    last: later(a.last, b.last),
    resumptions: a.resumptions + b.resumptions,
    complete: a.complete && b.complete,
  }
}

// --- reading the files -------------------------------------------------------------------------------------

const missing = (err) => err && err.code === 'ENOENT'

// The event of a call of another harness, from a lane-log call or a journal outcome, priced as a lane's call.
function harnessEvent(source, entry, prices) {
  const model = textOrUnknown(entry.model)
  return {
    source,
    time: isTime(entry.time) ? entry.time : null,
    model,
    effort: entry.effort || null,
    usd: priceEntry({ model, ...laneTokens(entry.usage ?? {}), agent: 'lane' }, prices),
  }
}

// Whether an event is already inside a summary: its time is numeric and at or before the mark.
const archived = (time, after) => after !== null && isTime(time) && time <= after

function emptyRead() {
  return { exists: false, events: [], complete: true, writtenAt: null, vanished: false }
}

// The role of an agent's request: the type the meter stored for it, `agent` when it stored none.
function roleOf(agents, id) {
  const type = Object.hasOwn(agents, id) && isObject(agents[id]) ? agents[id].type : null
  return typeof type === 'string' && type !== '' ? type : 'agent'
}

function meterEvent(entry, agents, prices) {
  const model = textOrUnknown(entry.model)
  const tokens = { input: numberOrZero(entry.input), output: numberOrZero(entry.output), cacheRead: numberOrZero(entry.cacheRead), cacheWrite: numberOrZero(entry.cacheWrite) }
  const lead = !entry.agent
  return {
    source: 'meter',
    time: isTime(entry.t) ? entry.t : null,
    model,
    effort: entry.effort || null,
    usd: priceEntry({ model, ...tokens, agent: entry.agent || null }, prices),
    lead,
    role: lead ? 'main' : roleOf(agents, entry.agent),
  }
}

// The meter's requests of session `id` after the mark `after`. Parts are read one by one, in numeric order; one that
// cannot be read makes the read incomplete and the others are kept.
function readUsageEvents(dataDir, id, { after = null, prices = loadPrices() } = {}) {
  const out = emptyRead()
  if (!isSessionId(id)) return out
  const dir = usageDir(dataDir, id)
  let names
  try {
    names = fs.readdirSync(dir)
  } catch (err) {
    if (!missing(err)) {
      out.exists = true
      out.complete = false
    }
    return out
  }
  const parts = names.filter((name) => PART.test(name)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  out.exists = parts.length > 0
  const agents = {}
  const entries = []
  for (const name of parts) {
    const file = path.join(dir, name)
    let part
    try {
      part = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!isObject(part) || !Array.isArray(part.entries)) throw new Error('not a usage part')
      out.writtenAt = later(out.writtenAt, fs.statSync(file).mtimeMs)
    } catch (err) {
      if (missing(err)) out.vanished = true
      else out.complete = false
      continue
    }
    if (isObject(part.agents)) for (const [key, value] of Object.entries(part.agents)) own(agents, key, value)
    entries.push(...part.entries)
  }
  for (const entry of entries) {
    if (!isObject(entry)) {
      out.complete = false
      continue
    }
    if (archived(entry.t, after)) continue
    out.events.push(meterEvent(entry, agents, prices))
  }
  return out
}

// The calls of other harnesses in lanes/<id>.jsonl, and only there. An entry with no session takes the file's id; one
// that names another session is not this one's. A line that cannot be read is skipped, as the lane log's reader does.
function readLaneEvents(dataDir, id, { after = null, prices = loadPrices() } = {}) {
  const out = emptyRead()
  if (!isSessionId(id)) return out
  const file = laneFile(dataDir, id)
  let text
  try {
    fs.statSync(file)
    out.exists = true
    text = fs.readFileSync(file, 'utf8')
    out.writtenAt = fs.statSync(file).mtimeMs
  } catch (err) {
    if (missing(err)) out.vanished = out.exists
    else {
      out.exists = true
      out.complete = false
    }
    return out
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (!isObject(entry) || entry.kind !== 'call') continue
    if ((entry.session ?? id) !== id) continue
    if (archived(entry.time, after)) continue
    out.events.push(harnessEvent('call', entry, prices))
  }
  return out
}

// The time a broken journal line still shows: `"time":<digits>`.
function timeOfBroken(line) {
  const found = /"time"\s*:\s*(\d+)/.exec(line)
  return found ? Number(found[1]) : null
}

// The `outcome` entries of session `id` in the router's journal, one event each (the journal writes one per attempt,
// and attempts share the delegation's id). The journal is one file for every session and nobody prunes it, so a line
// that cannot be read makes this session incomplete only when it falls inside the session's span: the readable lines
// that are the session's, of any kind. By its time when the broken line shows one, by its place in the file when not.
function readOutcomeEvents(dataDir, id, { prices = loadPrices() } = {}) {
  const out = { events: [], complete: true }
  if (!isSessionId(id)) return out
  let text
  try {
    text = fs.readFileSync(journalFile(dataDir), 'utf8')
  } catch (err) {
    if (!missing(err)) out.complete = false
    return out
  }
  const broken = []
  const span = { first: Infinity, last: -Infinity, early: Infinity, late: -Infinity }
  text.split('\n').forEach((line, position) => {
    if (!line.trim()) return
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      entry = null
    }
    if (!isObject(entry)) {
      broken.push({ position, time: timeOfBroken(line) })
      return
    }
    if (entry.session !== id) return
    span.first = Math.min(span.first, position)
    span.last = Math.max(span.last, position)
    if (isTime(entry.time)) {
      span.early = Math.min(span.early, entry.time)
      span.late = Math.max(span.late, entry.time)
    }
    if (entry.kind === 'outcome') out.events.push(harnessEvent('outcome', entry, prices))
  })
  const timed = span.early <= span.late
  for (const line of broken) {
    const inside = line.time !== null && timed ? line.time >= span.early && line.time <= span.late : line.position >= span.first && line.position <= span.last
    if (inside) out.complete = false
  }
  return out
}

// --- the summary -------------------------------------------------------------------------------------------

const isBuckets = (table, count) => isObject(table) && Object.values(table).every((bucket) => isObject(bucket) && isTime(bucket.usd) && isTime(bucket[count]))
const isMark = (value) => value === null || isTime(value)

function isTally(tally) {
  return (
    isObject(tally) &&
    isTime(tally.usd) &&
    isTime(tally.leadUsd) &&
    isTime(tally.agentsUsd) &&
    isBuckets(tally.byModel, 'requests') &&
    isBuckets(tally.byEffort, 'requests') &&
    isBuckets(tally.byRole, 'requests') &&
    isObject(tally.harness) &&
    isTime(tally.harness.calls) &&
    isTime(tally.harness.usd) &&
    isBuckets(tally.harness.byModel, 'calls') &&
    Array.isArray(tally.unpriced) &&
    tally.unpriced.every((model) => typeof model === 'string') &&
    isMark(tally.first) &&
    isMark(tally.last) &&
    isTime(tally.resumptions) &&
    typeof tally.complete === 'boolean'
  )
}

function isSummary(summary, id) {
  return isObject(summary) && summary.version === 1 && summary.session === id && isMark(summary.writtenAt) && isObject(summary.through) && isMark(summary.through.usage) && isMark(summary.through.lanes) && isTally(summary.tally)
}

// The summary a prune left for session `id`: { exists, readable, summary }. One that exists and is not readable (or is
// not a summary of this id) is not a zero: the report calls it incomplete.
function readSummary(dataDir, id) {
  if (!isSessionId(id)) return { exists: false, readable: false, summary: null }
  let summary
  try {
    summary = JSON.parse(fs.readFileSync(summaryFile(dataDir, id), 'utf8'))
  } catch (err) {
    return { exists: !missing(err), readable: false, summary: null }
  }
  if (!isSummary(summary, id)) return { exists: true, readable: false, summary: null }
  return { exists: true, readable: true, summary }
}

// --- the session by default --------------------------------------------------------------------------------

function newestIn(dir) {
  try {
    let newest = fs.statSync(dir).mtimeMs
    for (const name of fs.readdirSync(dir)) newest = Math.max(newest, fs.statSync(path.join(dir, name)).mtimeMs)
    return newest
  } catch {
    return null
  }
}

function listing(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

// The session written to last among those with files of their own: a usage directory, a lane log or a summary,
// by a name that is an id. The newest time wins; a tie goes to the greater id as text. The journal does not decide.
function latestSession(dataDir) {
  const times = new Map()
  const note = (id, time) => {
    if (!isSessionId(id) || !isTime(time)) return
    if (!times.has(id) || time > times.get(id)) times.set(id, time)
  }
  for (const entry of listing(path.join(dataDir, 'usage'))) if (entry.isDirectory() && isSessionId(entry.name)) note(entry.name, newestIn(usageDir(dataDir, entry.name)))
  for (const entry of listing(path.join(dataDir, 'lanes'))) {
    const id = entry.name.slice(0, -'.jsonl'.length)
    if (!entry.isFile() || !entry.name.endsWith('.jsonl') || !isSessionId(id)) continue
    try {
      note(id, fs.statSync(laneFile(dataDir, id)).mtimeMs)
    } catch {}
  }
  for (const entry of listing(spendDir(dataDir))) {
    const id = entry.name.slice(0, -'.json'.length)
    if (!entry.isFile() || !entry.name.endsWith('.json') || !isSessionId(id)) continue
    const { summary } = readSummary(dataDir, id)
    let time = summary ? summary.writtenAt : null
    if (!isTime(time)) {
      try {
        time = fs.statSync(summaryFile(dataDir, id)).mtimeMs
      } catch {
        time = null
      }
    }
    note(id, time)
  }
  let best = null
  for (const [id, time] of times) if (best === null || time > best.time || (time === best.time && id > best.id)) best = { id, time }
  return best ? best.id : null
}

// --- the report --------------------------------------------------------------------------------------------

const isoOrNull = (ms) => (isTime(ms) && Number.isFinite(new Date(ms).getTime()) ? new Date(ms).toISOString() : null)

// The summary and the raw sources, read in a way that counts each event once. A prune writes the summary before it
// deletes the raw files, so a file that vanished, or a summary that changed while the raw files were read, means a
// prune ran in between: read it all again.
function gather(dataDir, id, prices) {
  let found
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
    const summary = readSummary(dataDir, id)
    const through = summary.readable ? summary.summary.through : { usage: null, lanes: null }
    const usage = readUsageEvents(dataDir, id, { after: through.usage, prices })
    const lanes = readLaneEvents(dataDir, id, { after: through.lanes, prices })
    found = { summary, usage, lanes }
    if (!usage.vanished && !lanes.vanished && JSON.stringify(readSummary(dataDir, id)) === JSON.stringify(summary)) break
  }
  return found
}

function shaped(session, recorded, complete, tally, prices) {
  const none = !recorded
  return {
    session,
    recorded,
    complete,
    basis: `${prices.basis}, ${prices.snapshot}`,
    currency: 'USD',
    usd: none ? null : tally.usd,
    leadUsd: none ? null : tally.leadUsd,
    agentsUsd: none ? null : tally.agentsUsd,
    byModel: tally.byModel,
    byEffort: tally.byEffort,
    byRole: tally.byRole,
    harness: tally.harness,
    unpriced: tally.unpriced,
    firstRequest: isoOrNull(tally.first),
    lastRequest: isoOrNull(tally.last),
    resumptions: none ? null : tally.resumptions,
    resumptionsApproximate: true,
  }
}

// The JSON of `aether-report --spend`: the list-price spend of `session`, or of the one written last. A session with
// no record at all says so (`recorded: false`, no dollars) and is never reported as zero dollars.
function spendReport({ dataDir = run.dataDir(), session = null, prices = loadPrices() } = {}) {
  if (session !== null && !isSessionId(session)) throw new Error(`bad session id: ${session}`)
  const id = session ?? latestSession(dataDir)
  if (id === null) return shaped(null, false, true, emptyTally(), prices)
  const { summary, usage, lanes } = gather(dataDir, id, prices)
  const outcomes = readOutcomeEvents(dataDir, id, { prices })
  const recorded = usage.exists || lanes.exists || summary.exists || outcomes.events.length > 0
  if (!recorded) return shaped(id, false, true, emptyTally(), prices)
  const onDisk = tallyOf([...usage.events, ...lanes.events, ...outcomes.events])
  const tally = mergeTallies(summary.readable ? summary.summary.tally : emptyTally(), onDisk)
  const complete = tally.complete && usage.complete && lanes.complete && outcomes.complete && (!summary.exists || summary.readable)
  return shaped(id, true, complete, tally, prices)
}

module.exports = {
  SESSION_ID,
  GAP_MS,
  isSessionId,
  spendDir,
  summaryFile,
  emptyTally,
  tallyOf,
  mergeTallies,
  readUsageEvents,
  readLaneEvents,
  readOutcomeEvents,
  readSummary,
  latestSession,
  spendReport,
}
