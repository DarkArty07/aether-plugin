'use strict'

// Quota marks written by the delegate router, kept apart from the swarm's marks.
// agy states an explicit refusal («Individual quota reached», «Resets in <duration>»). The router turns that into a
// mark in its own store, `<dataDir>/router/lanes/marks/`, of the same shape lane-marks.js reads. The swarm's store is
// only read here, never written, so a router refusal does not change what the swarm's marks hold.

const fs = require('node:fs')
const path = require('node:path')
const laneMarks = require('./lane-marks.js')

const REFUSAL_DEFAULT_MINUTES = 60
const MINUTE_MS = 60 * 1000
const REFUSAL_RE = /individual quota reached/i
// The duration is a run of <n>d, <n>h, <n>m, <n>s parts in that order, any subset, with no spaces.
const RESET_RE = /resets in ((?:\d+d)?(?:\d+h)?(?:\d+m)?(?:\d+s)?)(?!\w)/i
const DURATION_UNIT_MS = { d: 86400000, h: 3600000, m: 60000, s: 1000 }
const DURATION_PART_RE = /(\d+)([dhms])/g

function durationMs(duration) {
  let total = 0
  for (const [, amount, unit] of duration.matchAll(DURATION_PART_RE)) {
    total += Number(amount) * DURATION_UNIT_MS[unit]
  }
  return total
}

// Returns null unless text is a string holding agy's explicit quota refusal. resetMs is the time the message states,
// or null when it states none.
function quotaRefusal(text) {
  if (typeof text !== 'string' || !REFUSAL_RE.test(text)) return null
  const reset = RESET_RE.exec(text)
  if (!reset || reset[1] === '') return { resetMs: null }
  return { resetMs: durationMs(reset[1]) }
}

function routerMarksRoot(dataDir) {
  return path.join(dataDir, 'router')
}

function writeAtomic(targetPath, content) {
  const dir = path.dirname(targetPath)
  fs.mkdirSync(dir, { recursive: true })
  const base = path.basename(targetPath)
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`)
  try {
    fs.writeFileSync(tmp, content)
    fs.renameSync(tmp, targetPath)
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {}
  }
}

// Writes the router's mark for a quota refusal and returns it. A live router mark for the same harness and group that
// ends later is kept as it is: a mark never shortens. Returns null, and writes nothing, when text is no refusal.
function markRefusal(dataDir, { harness, group, text, now = Date.now() }) {
  const refusal = quotaRefusal(text)
  if (!refusal) return null
  const span = refusal.resetMs === null ? REFUSAL_DEFAULT_MINUTES * MINUTE_MS : refusal.resetMs
  const until = Math.min(now + span, now + laneMarks.MAX_MARK_MS - MINUTE_MS)
  const root = routerMarksRoot(dataDir)
  const existing = laneMarks.liveMark(root, harness, group, now)
  if (existing && existing.until >= until) return existing
  const mark = {
    harness,
    group,
    at: now,
    until,
    confirmed: true,
    resetsAt: new Date(until).toISOString(),
    usedPercentAbsent: false,
    source: 'router',
    reason: 'quota refusal',
  }
  writeAtomic(laneMarks.markFile(root, harness, group), JSON.stringify(mark, null, 2) + '\n')
  return mark
}

// The live marks of the swarm (read only) and of the router, sorted by harness and group.
function readAllMarks(dataDir, now = Date.now()) {
  const swarm = laneMarks.liveMarks(dataDir, now).map((mark) => ({ ...mark, source: 'swarm' }))
  const router = laneMarks.liveMarks(routerMarksRoot(dataDir), now).map((mark) => ({ ...mark, source: 'router' }))
  return [...swarm, ...router].sort((a, b) => {
    const keyA = `${a.harness}/${a.group}`
    const keyB = `${b.harness}/${b.group}`
    return keyA < keyB ? -1 : (keyA > keyB ? 1 : 0)
  })
}

module.exports = {
  REFUSAL_DEFAULT_MINUTES,
  quotaRefusal,
  routerMarksRoot,
  markRefusal,
  readAllMarks,
}
