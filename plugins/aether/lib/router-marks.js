'use strict'

// Quota marks written by the delegate router, in the single mark store the swarm reads and writes:
// `<dataDir>/lanes/marks/`. agy and Muse state an explicit refusal in words (quota-refusal.js). The router turns that
// into a mark in the single store, of the same shape lane-marks.js reads, so a router refusal is seen by the swarm.
// Marks left under the old `<dataDir>/router/lanes/marks/` directory are moved into the single store on the first
// read (lane-marks.js `migrateRouterMarks`).
// Family: router.

const { writeAtomic } = require('./common.js')
const laneMarks = require('./lane-marks.js')
const { quotaRefusal } = require('./quota-refusal.js')

const REFUSAL_DEFAULT_MINUTES = 60
const MINUTE_MS = 60 * 1000

// The root the router reads and writes marks under: the data directory itself, so `markFile` lands in the single
// store. Kept for callers that address the store through it; it names no other folder.
function routerMarksRoot(dataDir) {
  return dataDir
}

// A harness that names its own quota failures, as Muse does with structured quota data («quota: muse weekly limit,
// resets ...»), leaves a refusal as well as the explicit wordings of quota-refusal.js (agy's «Individual quota
// reached», Muse's subscription 429). No other words of a message count.
const QUOTA_REASON_RE = /^quota: /

function refusalOf(text) {
  const agy = quotaRefusal(text)
  if (agy) return agy
  return typeof text === 'string' && QUOTA_REASON_RE.test(text) ? { resetMs: null } : null
}

// Writes the router's mark for a quota refusal, for REFUSAL_DEFAULT_MINUTES, and returns it. A live router mark for the same harness and group that
// ends later is kept as it is: a mark never shortens. Returns null, and writes nothing, when text is no refusal.
function markRefusal(dataDir, { harness, group, text, now = Date.now() }) {
  const refusal = refusalOf(text)
  if (!refusal) return null
  // The mark holds the default length, not the reset the message states: agy's quotas change between days and the
  // stated reset was once wrong, and a refused call costs a failed process and no tokens. The reset is kept as stated.
  const until = now + REFUSAL_DEFAULT_MINUTES * MINUTE_MS
  const root = routerMarksRoot(dataDir)
  const existing = laneMarks.liveMark(root, harness, group, now)
  if (existing && existing.until >= until) return existing
  const mark = {
    harness,
    group,
    at: now,
    until,
    confirmed: false,
    resetsAt: null,
    usedPercentAbsent: false,
    source: 'router',
    reason: 'quota refusal',
    statedResetMs: refusal.resetMs > 0 ? refusal.resetMs : null,
    ...(typeof refusal.resetsAt === 'string' || refusal.resetsAt === null ? { statedResetAt: refusal.resetsAt } : {}),
  }
  writeAtomic(laneMarks.markFile(root, harness, group), JSON.stringify(mark, null, 2) + '\n')
  return mark
}

// The live marks of the single store, sorted by harness and group. A mark the router wrote keeps its stored
// `source: 'router'`; a mark without one came from the swarm and reads as `'swarm'`.
// known(harness, group), when given, leaves out the marks of a group the lane table does not have.
function readAllMarks(dataDir, now = Date.now(), known = null) {
  try {
    laneMarks.migrateRouterMarks(dataDir)
  } catch {}
  return laneMarks.liveMarks(dataDir, now, known).map((mark) => (mark.source === undefined ? { ...mark, source: 'swarm' } : { ...mark }))
}

module.exports = {
  REFUSAL_DEFAULT_MINUTES,
  quotaRefusal,
  refusalOf,
  routerMarksRoot,
  markRefusal,
  readAllMarks,
}
