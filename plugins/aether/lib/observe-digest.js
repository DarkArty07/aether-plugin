'use strict'

// The durable summary of self-observation: observe/summary.json keeps, per session, counts and nothing else, so
// that the prune of the raw files (events, faults, lane logs, dev fragments) loses no figure. A digest always
// comes before the prune that deletes its sources. The summary is never pruned, and a digest never removes an
// entry: a session with no source on disk keeps the entry it had.

const fs = require('node:fs')
const path = require('node:path')
const { eventsFile, faultsDir, devDir, summaryFile, readEvents, readFaults } = require('./observe.js')
const { logFile, laneTokens } = require('./lanes.js')
const { loadPrices, priceEntry } = require('./prices.js')

const DAY_MS = 24 * 60 * 60 * 1000
const SESSION_ID = /^[A-Za-z0-9_-]+$/

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isSession = (value) => typeof value === 'string' && SESSION_ID.test(value)
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

// Writes through a temporary file of the same directory and a rename, so a reader sees the old file or the new one.
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temp, text)
    fs.renameSync(temp, file)
  } catch (err) {
    fs.rmSync(temp, { force: true })
    throw err
  }
}

function readSummary(dataDir) {
  try {
    const summary = JSON.parse(fs.readFileSync(summaryFile(dataDir), 'utf8'))
    if (isObject(summary) && summary.version === 1 && isObject(summary.sessions)) return summary
  } catch {}
  return { version: 1, sessions: {} }
}

// Maps keep a key such as __proto__ an ordinary key; Object.fromEntries turns them into plain objects.
function bump(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by)
}

// What one session left in each source: the events, the faults and the lane log, already filtered by session.
function entryOf(events, faults, laneEntries, prices) {
  const times = []
  const out = {}

  if (events.length) {
    const kinds = new Map()
    const tools = new Map()
    for (const event of events) {
      times.push(event.time)
      bump(kinds, String(event.kind))
      if (event.kind === 'PostToolUseFailure' && typeof event.tool === 'string') bump(tools, event.tool)
    }
    out.events = Object.fromEntries(kinds)
    out.toolFailures = Object.fromEntries(tools)
  }

  if (faults.length) {
    const sources = new Map()
    for (const fault of faults) {
      if (typeof fault.time === 'number' && Number.isFinite(fault.time)) times.push(fault.time)
      bump(sources, typeof fault.source === 'string' ? fault.source : 'unknown')
    }
    out.faults = Object.fromEntries(sources)
  }

  if (laneEntries.length) {
    const groups = new Map()
    const seats = new Map()
    for (const item of laneEntries) {
      times.push(item.time)
      if (item.kind === 'call' && typeof item.harness === 'string' && typeof item.group === 'string' && typeof item.effort === 'string') {
        const key = `${item.harness}/${item.group}@${item.effort}`
        if (!groups.has(key)) groups.set(key, { calls: 0, ok: 0, outputTokens: 0, durationMs: 0, usd: 0, pricedCalls: 0 })
        const lane = groups.get(key)
        const usage = isObject(item.usage) ? item.usage : {}
        lane.calls += 1
        if (item.status === 'ok') lane.ok += 1
        lane.outputTokens += finite(usage.output)
        lane.durationMs += finite(item.durationMs)
        // Priced as /spend and aether-report price a lane call: laneTokens adds the thinking tokens that agy counts.
        const usd = priceEntry({ model: item.model, ...laneTokens(usage), agent: 'lane' }, prices)
        if (usd !== null) {
          lane.usd += usd
          lane.pricedCalls += 1
        }
      }
      if ((item.kind === 'call' || item.kind === 'seat') && typeof item.seat === 'string') {
        const owner = item.design ?? item.run ?? 'none'
        bump(seats, `${typeof owner === 'string' ? owner : 'none'}/${item.seat}`)
      }
    }
    out.lanes = Object.fromEntries(groups)
    out.seats = Object.fromEntries(seats)
  }

  if (times.length) {
    out.first = Math.min(...times)
    out.last = Math.max(...times)
  }
  return out
}

// The new figures replace the old ones source by source; a source that is gone (already pruned) leaves the
// old figures as they were, and the span only widens.
function merge(previous, fresh) {
  const before = isObject(previous) ? previous : {}
  const pick = (name) => (fresh[name] !== undefined ? fresh[name] : before[name] !== undefined ? before[name] : {})
  const spans = [before.first, fresh.first].filter((n) => typeof n === 'number')
  const ends = [before.last, fresh.last].filter((n) => typeof n === 'number')
  return {
    first: spans.length ? Math.min(...spans) : 0,
    last: ends.length ? Math.max(...ends) : 0,
    events: pick('events'),
    toolFailures: pick('toolFailures'),
    faults: pick('faults'),
    lanes: pick('lanes'),
    seats: pick('seats'),
  }
}

const hasSource = (fresh) => Object.keys(fresh).length > 0

// Stores the entries (id -> fresh figures) in the summary, one atomic write; returns the entries as stored.
function store(dataDir, fresh) {
  const summary = readSummary(dataDir)
  const sessions = new Map(Object.entries(summary.sessions))
  const stored = new Map()
  for (const [id, figures] of fresh) {
    if (!hasSource(figures)) {
      if (sessions.has(id)) stored.set(id, sessions.get(id))
      continue
    }
    const entry = merge(sessions.get(id), figures)
    sessions.set(id, entry)
    stored.set(id, entry)
  }
  if (stored.size) writeAtomic(summaryFile(dataDir), `${JSON.stringify({ version: 1, sessions: Object.fromEntries(sessions) })}\n`)
  return stored
}

function groupBySession(items) {
  const bySession = new Map()
  for (const item of items) {
    if (!isSession(item.session)) continue
    if (!bySession.has(item.session)) bySession.set(item.session, [])
    bySession.get(item.session).push(item)
  }
  return bySession
}

// The entries of the lane log, by session. A session's entries are the ones in its own file, whatever their own
// `session` field says (lanes.js readLog attributes by that field, which would split or merge files).
function readLaneSessions(dataDir) {
  const bySession = new Map()
  let names = []
  try {
    names = fs.readdirSync(path.dirname(logFile(dataDir, 'x'))).filter((name) => name.endsWith('.jsonl')).sort()
  } catch {}
  for (const name of names) {
    const id = name.slice(0, -'.jsonl'.length)
    if (id === 'unknown' || !isSession(id)) continue
    let text
    try {
      text = fs.readFileSync(logFile(dataDir, id), 'utf8')
    } catch {
      continue
    }
    const items = []
    for (const line of text.split('\n')) {
      let item
      try {
        item = JSON.parse(line)
      } catch {
        continue
      }
      if (isObject(item) && typeof item.time === 'number' && Number.isFinite(item.time)) items.push(item)
    }
    if (items.length) bySession.set(id, items)
  }
  return bySession
}

function sourcesOf(dataDir) {
  return {
    events: groupBySession(readEvents(dataDir)),
    faults: groupBySession(readFaults(dataDir)),
    lanes: readLaneSessions(dataDir),
  }
}

function freshFor(sources, id, prices) {
  return entryOf(sources.events.get(id) || [], sources.faults.get(id) || [], sources.lanes.get(id) || [], prices)
}

// Recomputes the entry of one session from what is on disk and stores it; returns it. With no source the entry
// that existed stays as it was (and is returned), or the entry is the empty one when there was none.
function digestSession(dataDir, session, { prices = loadPrices() } = {}) {
  const sources = sourcesOf(dataDir)
  const stored = store(dataDir, new Map([[session, freshFor(sources, session, prices)]]))
  return stored.get(session) || merge(undefined, {})
}

function digestAll(dataDir, { prices = loadPrices() } = {}) {
  const sources = sourcesOf(dataDir)
  const ids = [...new Set([...sources.events.keys(), ...sources.faults.keys(), ...sources.lanes.keys()])].sort()
  store(dataDir, new Map(ids.map((id) => [id, freshFor(sources, id, prices)])))
  return ids
}

// Digests everything, then removes what is older than `days`: event lines by their time, fault files and dev
// folders by their modification time. The lane log and the usage files are pruned by their own modules, after this.
function pruneObserve(dataDir, { days = 30, now = Date.now() } = {}) {
  digestAll(dataDir)
  const cutoff = now - days * DAY_MS
  const removed = { events: 0, faults: 0, dev: 0 }

  let text = null
  try {
    text = fs.readFileSync(eventsFile(dataDir), 'utf8')
  } catch {}
  if (text !== null) {
    const kept = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let time
      try {
        time = JSON.parse(line).time
      } catch {}
      if (typeof time === 'number' && time < cutoff) removed.events += 1
      else kept.push(line)
    }
    if (removed.events) writeAtomic(eventsFile(dataDir), kept.length ? `${kept.join('\n')}\n` : '')
  }

  const sweep = (dir, entryFilter, key) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).filter(entryFilter)
    } catch {}
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      let written
      try {
        written = fs.statSync(full).mtimeMs
      } catch {
        continue
      }
      if (written > cutoff) continue
      fs.rmSync(full, { recursive: true, force: true })
      removed[key] += 1
    }
  }
  sweep(faultsDir(dataDir), (entry) => entry.isFile() && entry.name.endsWith('.json'), 'faults')
  sweep(devDir(dataDir), (entry) => entry.isDirectory(), 'dev')
  return removed
}

module.exports = { readSummary, digestSession, digestAll, pruneObserve }
