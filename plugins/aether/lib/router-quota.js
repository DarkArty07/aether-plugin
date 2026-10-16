'use strict'

// The router's choice of harness by quota (R20 to R23). Among the groups of agy and grok that can serve the level of
// a task, it takes the one whose weekly window renews first (the owner's rule, R21). It reads only readings that
// already exist, so it never waits for a quota call and never starts a process: a group without a valid reading is
// out, and a renewal of the reading is another module's work. The order of the swarm's quota policy is not used.

const fs = require('node:fs')
const { createAdapter: defaultCreateAdapter } = require('./harness/index.js')
const { groupView } = require('./lane-order.js')
const readings = require('./lane-readings.js')
const { pickRung } = require('./router-rungs.js')

// R20: the only harnesses the router may choose.
const EXTERNAL = ['agy', 'grok']
const MINUTE_MS = 60000

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function lifeMs(config, harness) {
  const minutes = config?.harnesses?.[harness]?.quotaLifeMinutes
  return (typeof minutes === 'number' && minutes > 0 ? minutes : readings.DEFAULT_LIFE_MINUTES) * MINUTE_MS
}

// The saved reading of a harness whose reading launches a process: whatever its age.
function savedReading(dataDir, harness) {
  try {
    const data = JSON.parse(fs.readFileSync(readings.cacheFile(dataDir, harness), 'utf8'))
    if (!isObject(data) || typeof data.readAt !== 'number' || !isObject(data.groups)) return null
    return { readAt: data.readAt, groups: data.groups }
  } catch {
    return null
  }
}

// The reading of a harness whose adapter reads a log. Its age is the largest one a group gives. An answer with no
// reading at all (every group unknown and none with an age) is not a reading taken now.
function loggedReading(adapter, now) {
  try {
    const groups = adapter.quota()?.groups
    if (!isObject(groups)) return null
    let age = null
    let hasReading = false
    for (const group of Object.values(groups)) {
      const minutes = group?.source?.ageMinutes
      if (typeof minutes === 'number' && Number.isFinite(minutes)) age = Math.max(age ?? 0, minutes)
      if (isObject(group) && group.unknown !== true) hasReading = true
    }
    if (age === null && !hasReading) return null
    return { readAt: age === null ? now : now - age * MINUTE_MS, groups }
  } catch {
    return null
  }
}

// The readings that already exist for the harnesses named. No process is launched (R23).
function peekReadings({ dataDir, config, harnesses, createAdapter = defaultCreateAdapter, now = Date.now() }) {
  const result = {}
  for (const harness of harnesses) {
    const settings = config?.harnesses?.[harness]
    if (!settings) {
      result[harness] = null
      continue
    }
    let adapter
    try {
      adapter = createAdapter(harness, settings)
    } catch {
      result[harness] = null
      continue
    }
    result[harness] = adapter.quotaCost === 'process' ? savedReading(dataDir, harness) : loggedReading(adapter, now)
  }
  return result
}

// The same rule as hasReset in lane-readings.js: a window whose reset was ahead of the reading and has come since.
function hasReset(groups, readAt, now) {
  return Object.values(groups).some((group) =>
    Object.values(isObject(group) && isObject(group.windows) ? group.windows : {}).some((window) => {
      const resetsAt = isObject(window) && typeof window.resetsAt === 'string' ? Date.parse(window.resetsAt) : NaN
      return resetsAt > readAt && resetsAt <= now
    }),
  )
}

function isStale(reading, harnessLife, now) {
  return reading == null ||
    typeof reading.readAt !== 'number' ||
    reading.readAt > now ||
    now - reading.readAt >= harnessLife ||
    hasReset(isObject(reading.groups) ? reading.groups : {}, reading.readAt, now)
}

// The harnesses of EXTERNAL named in `harnesses` that have no valid reading.
function staleHarnesses({ readings: byHarness, config, harnesses, now }) {
  return harnesses
    .filter((name) => EXTERNAL.includes(name))
    .filter((name) => isStale(byHarness?.[name], lifeMs(config, name), now))
}

// The groups of the external harnesses, in the order of the table.
function tableGroups(config) {
  const entries = []
  for (const [harness, settings] of Object.entries(config.harnesses || {})) {
    if (!EXTERNAL.includes(harness)) continue
    for (const group of Object.keys(settings.groups || {})) entries.push({ harness, group })
  }
  return entries
}

function chooseHarness({ level, axis, rungs, config, enabled, installed, readings: byHarness, marks, now }) {
  const stale = new Set(staleHarnesses({ readings: byHarness, config, harnesses: EXTERNAL, now }))
  const candidates = []

  const considered = tableGroups(config).map(({ harness, group }, order) => {
    const reading = byHarness?.[harness] ?? null
    const rung = pickRung(rungs, { harness, level, axis, group })
    const valid = !stale.has(harness) && isObject(reading?.groups?.[group]) ? reading.groups[group] : null
    const view = valid ? groupView(valid, { reserve: config.reserve, now }) : null
    const readingAgeMin = reading && typeof reading.readAt === 'number' ? Math.max(0, Math.floor((now - reading.readAt) / MINUTE_MS)) : null
    const entry = {
      harness,
      group,
      model: rung?.model ?? null,
      effort: rung?.effort ?? null,
      state: 'excluded',
      why: null,
      note: null,
      windowName: view?.windowName ?? null,
      remaining: view?.windowName ? view.remaining : null,
      hoursLeft: view?.windowName ? view.hoursLeft : null,
      resetsAt: view?.windowName ? view.resetsAt : null,
      readingAgeMin,
      rank: null,
    }
    const exclude = (why, note = null) => Object.assign(entry, { state: 'excluded', why, note })

    if (!enabled.includes(harness)) return exclude('not-enabled')
    if (!installed(harness)) return exclude('not-installed')
    if (marks.some((mark) => mark.harness === harness && mark.group === group && mark.until > now)) {
      // A reading with balance does not lift a mark (R22).
      return exclude('mark', view && view.usable && !view.unknown ? 'marca vigente; la lectura con saldo no la desmiente' : 'marca vigente')
    }
    if (!view) {
      return exclude('no-reading', readingAgeMin === null ? 'sin lectura; ninguna guardada' : `sin lectura; la última tiene ${readingAgeMin} min`)
    }
    if (!view.usable) return exclude('reserve')
    if (view.unknown || view.windowName === null) return exclude('no-balance')
    if (!rung) return Object.assign(entry, { state: 'unserved', why: 'no-rung' })
    Object.assign(entry, { state: 'candidate' })
    candidates.push({ entry, rung, order, resetMs: Date.parse(view.resetsAt) })
    return entry
  })

  // R21: the weekly window that renews first, then the one with more balance, then the order of the table.
  candidates.sort((a, b) => a.resetMs - b.resetMs || b.entry.remaining - a.entry.remaining || a.order - b.order)
  candidates.forEach((candidate, rank) => { candidate.entry.rank = rank })

  const first = candidates[0]
  return { pick: first ? { harness: first.entry.harness, rung: first.rung } : null, considered }
}

module.exports = { EXTERNAL, lifeMs, peekReadings, staleHarnesses, chooseHarness }
