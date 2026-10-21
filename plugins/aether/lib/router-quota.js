'use strict'

// The router's readings of the quota of the harnesses it renews: agy and grok. It reads only readings that already
// exist, so it never waits for a quota call and never starts a process: a harness without a valid reading is stale,
// and a renewal of the reading is another module's work (router-renewal.js). Which pair takes a delegate is not
// decided here: it is the one choice function of superdelegation (lib/superdelegation.js), which lib/router-pick.js
// feeds with these readings. Muse has no quota command and its adapter keeps what a call reported, so it has no
// reading to renew.

const fs = require('node:fs')
const path = require('node:path')
const { createAdapter: defaultCreateAdapter } = require('./harness/index.js')
const readings = require('./lane-readings.js')

// The harnesses whose quota reading the router keeps and renews.
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

// The router's own reading of a harness, which its background renewal saves (router-renewal.js renewReading): grok's
// refresh answers over ACP and leaves no line in grok's log, so the reading the router waits for is kept here.
function readingFile(dataDir, harness) {
  return path.join(dataDir, 'router', 'readings', `${encodeURIComponent(harness)}.json`)
}

// The router's reading of a harness, whatever its age, or null when the file is missing, unreadable or malformed.
function routerReading(dataDir, harness) {
  try {
    const data = JSON.parse(fs.readFileSync(readingFile(dataDir, harness), 'utf8'))
    if (!isObject(data) || typeof data.readAt !== 'number' || !Number.isFinite(data.readAt) || !isObject(data.groups)) return null
    return { readAt: data.readAt, groups: data.groups }
  } catch {
    return null
  }
}

// The newer of two readings, either of which may be null; on a tie, the first.
function newest(a, b) {
  if (a === null || b === null) return a ?? b
  return b.readAt > a.readAt ? b : a
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

// The readings that already exist for the harnesses named: for each, the newer of the one its adapter keeps (agy's saved
// reading, grok's log) and the router's own. No process is launched (R23).
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
    const kept = adapter.quotaCost === 'process' ? savedReading(dataDir, harness) : loggedReading(adapter, now)
    result[harness] = newest(kept, routerReading(dataDir, harness))
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

module.exports = { EXTERNAL, lifeMs, readingFile, peekReadings, staleHarnesses }
