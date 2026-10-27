'use strict'

// Quota marks written by the delegate router, kept apart from the swarm's marks.
// agy and Muse state an explicit refusal in words (quota-refusal.js). The router turns that into a
// mark in its own store, `<dataDir>/router/lanes/marks/`, of the same shape lane-marks.js reads. The swarm's store is
// only read here, never written, so a router refusal does not change what the swarm's marks hold.
// Family: router.

const path = require('node:path')
const { writeAtomic } = require('./common.js')
const laneMarks = require('./lane-marks.js')
const { quotaRefusal } = require('./quota-refusal.js')

const REFUSAL_DEFAULT_MINUTES = 60
const MINUTE_MS = 60 * 1000

function routerMarksRoot(dataDir) {
  return path.join(dataDir, 'router')
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

// The live marks of the swarm (read only) and of the router, sorted by harness and group.
// known(harness, group), when given, leaves out the marks of a group the lane table does not have.
function readAllMarks(dataDir, now = Date.now(), known = null) {
  const swarm = laneMarks.liveMarks(dataDir, now, known).map((mark) => ({ ...mark, source: 'swarm' }))
  const router = laneMarks.liveMarks(routerMarksRoot(dataDir), now, known).map((mark) => ({ ...mark, source: 'router' }))
  return [...swarm, ...router].sort((a, b) => {
    const keyA = `${a.harness}/${a.group}`
    const keyB = `${b.harness}/${b.group}`
    return keyA < keyB ? -1 : (keyA > keyB ? 1 : 0)
  })
}

module.exports = {
  REFUSAL_DEFAULT_MINUTES,
  quotaRefusal,
  refusalOf,
  routerMarksRoot,
  markRefusal,
  readAllMarks,
}
