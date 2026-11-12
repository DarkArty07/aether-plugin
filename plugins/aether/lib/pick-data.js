'use strict'

// Prepares the quota view one harness gives to choose, for a delegate, a swarm call and a design seat.
// Those three call this function; none of them keeps its own copy of the preparation.
// Family: none.

const { isObject } = require('./common.js')
const laneMarks = require('./lane-marks.js')
const { readAllMarks } = require('./router-marks.js')
const order = require('./lane-order.js')
const { STALE_MS } = require('./harness/grok-quota.js')

const MINUTE_MS = 60 * 1000

const pad = (n) => String(n).padStart(2, '0')

// The machine's local time, with its offset from UTC. quota's report prints the same clock.
function localTime(ms) {
  const d = new Date(ms)
  const offset = -d.getTimezoneOffset()
  const hours = Math.trunc(Math.abs(offset) / 60)
  const minutes = Math.abs(offset) % 60
  const zone = `UTC${offset < 0 ? '-' : '+'}${hours}${minutes === 0 ? '' : `:${pad(minutes)}`}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${zone}`
}

// Where a group's reading came from. A reading with a source of its own keeps it; one that only has windows was
// read from the CLI at readAt. A reading with neither has no source.
function sourceOf(reading, windows, { command, now, readAt, lifeMs }) {
  if (!isObject(reading)) return null
  let source
  if (isObject(reading.source)) {
    source = { ...reading.source, stale: reading.source.ageMinutes * MINUTE_MS > lifeMs }
  } else if (Object.keys(windows).length > 0) {
    const at = Number.isFinite(readAt) ? readAt : now
    source = { command, ts: new Date(at).toISOString(), ageMinutes: Math.max(0, Math.floor((now - at) / MINUTE_MS)), stale: false }
  } else {
    return null
  }
  if (reading.usedPercentAbsent !== undefined) Object.assign(source, { usedPercent: reading.usedPercent, usedPercentAbsent: reading.usedPercentAbsent })
  return source
}

// One group as quota and status show it, and as choose reads it: the numbers of lane-order.js, the label, the
// local time of each reset and the source.
function groupView(label, reading, { reserve, now, command, mark = null, readAt = now, lifeMs = STALE_MS }) {
  const view = order.groupView(reading, { reserve, now, mark })
  const windows = Object.fromEntries(
    Object.entries(view.windows).map(([name, w]) => [name, w.hoursLeft === null ? w : { ...w, resetsLocal: localTime(Date.parse(w.resetsAt)) }]),
  )
  return {
    label: label ?? null,
    unknown: view.unknown,
    usable: view.usable,
    priority: view.priority,
    remaining: view.remaining,
    resetsAt: view.resetsAt,
    usedPercentAbsent: view.usedPercentAbsent,
    mark: view.mark,
    windows,
    source: sourceOf(reading, windows, { command, now, readAt, lifeMs }),
  }
}

// Marks already read by the caller win. Otherwise the router side reads through readAllMarks and everyone else
// through liveMarks. Neither path writes a mark file of its own; a lifted mark goes through the lift callback.
function marksOf({ marks, dataDir, now, markSource }) {
  if (Array.isArray(marks)) return marks
  if (markSource === 'router') return readAllMarks(dataDir, now)
  return laneMarks.liveMarks(dataDir, now)
}

// The view of one harness that choose takes: installed, with one group view per group of the lane table.
// objectGroups drops a group reading that is not an object (the delegate's readings). extraGroups also keeps a
// group that only the reading names (the swarm). A liftable mark is cleared, and honorLiftResult keeps it when
// the lift callback says the file is still there. groupError is the harness's failed reading, on every group.
function pickData(config, name, reading, { marks, now, lift, lifeMs, extraGroups = false, objectGroups = false, groupError, honorLiftResult = false, dataDir, markSource } = {}) {
  const settings = config.harnesses[name]
  const reserve = config.reserve
  const listed = Object.keys(settings.groups ?? {})
  const fromReading = extraGroups && isObject(reading?.groups) ? Object.keys(reading.groups) : []
  const keys = extraGroups ? [...new Set([...listed, ...fromReading])] : listed
  const heldMarks = marksOf({ marks, dataDir, now, markSource })
  const groups = {}
  for (const key of keys) {
    const stored = isObject(reading?.groups) && Object.hasOwn(reading.groups, key) ? reading.groups[key] : null
    const raw = stored !== null && (!objectGroups || isObject(stored)) ? stored : null
    let held = heldMarks.filter((mark) => mark.harness === name && mark.group === key && mark.until > now)
    const lifted = raw !== null && held.length > 0 && held.every((mark) => laneMarks.liftable(mark, raw, { readAt: reading.readAt, reserve, lifeMs, now }))
    if (lifted) {
      let kept = false
      for (const mark of held) {
        let result = true
        if (typeof lift === 'function') result = lift(mark)
        else if (dataDir) result = laneMarks.liftMark(dataDir, mark)
        if (honorLiftResult && result === false) kept = true
      }
      if (!kept) held = []
    }
    const view = groupView(settings.groups?.[key], raw ?? { unknown: true, windows: {} }, {
      reserve, now, command: settings.command, mark: held.length > 0 ? held[0] : null, readAt: reading?.readAt ?? now, lifeMs,
    })
    groups[key] = groupError === undefined ? view : { ...view, error: groupError }
  }
  return { command: settings.command, installed: true, groups }
}

module.exports = { pickData, groupView, localTime }
