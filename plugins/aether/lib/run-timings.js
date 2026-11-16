'use strict'

// The durations of the work around the models of a swarm run (spec 036 R18): each gate pass
// (`gate`, recorded by lib/wt-gate.js), each merge's tests (`merge-tests`), the baseline
// (`baseline`) and each stuck wait (`wait-stuck`). Every record is one line of
// <runDir>/timings.jsonl; `wait-quota` is not one of them: the report calculates it from the
// autonomous runs (quotaWaitOf, below). A timing must never stop a run, so a failed write is
// swallowed; only an unknown class throws.
// Family: none.

const fs = require('node:fs')
const path = require('node:path')

// The classes that a bin records. `wait-quota` is not one of them: the report calculates it (below).
const CLASSES = ['gate', 'merge-tests', 'baseline', 'wait-stuck']

// Appends one line {"class":<klass>,"ms":<integer>,"at":<ISO>} to <runDir>/timings.jsonl
// (one write per line). Throws on a class not in CLASSES; never throws on a failed write
// (a timing must not stop a run). A duration that is not a finite number, as from a record
// whose date cannot be read, has nothing to record: it writes nothing.
function recordTiming(runDir, klass, ms) {
  if (!CLASSES.includes(klass)) throw new Error(`unknown timing class: ${klass}`)
  const rounded = Math.round(ms)
  if (!Number.isFinite(rounded)) return
  try {
    if (!fs.existsSync(runDir)) return
    fs.appendFileSync(path.join(runDir, 'timings.jsonl'), JSON.stringify({ class: klass, ms: rounded, at: new Date().toISOString() }) + '\n')
  } catch {
    // A timing must not stop a run.
  }
}

// Reads the file: { byClass: { gate: { count, ms }, ... }, totalMs };
// missing file or bad lines => { byClass: {}, totalMs: 0, none: true }.
// A line that is not JSON, or whose class is not recorded or whose ms is not a finite
// number, is a bad line and is skipped.
function timingsOf(runDir) {
  let text
  try {
    text = fs.readFileSync(path.join(runDir, 'timings.jsonl'), 'utf8')
  } catch {
    return { byClass: {}, totalMs: 0, none: true }
  }
  const byClass = {}
  let totalMs = 0
  let found = false
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (!entry || typeof entry !== 'object') continue
    if (!CLASSES.includes(entry.class)) continue
    if (typeof entry.ms !== 'number' || !Number.isFinite(entry.ms)) continue
    const slot = (byClass[entry.class] ||= { count: 0, ms: 0 })
    slot.count++
    slot.ms += entry.ms
    totalMs += entry.ms
    found = true
  }
  if (!found) return { byClass: {}, totalMs: 0, none: true }
  return { byClass, totalMs }
}

// The quota wait of one swarm run: the quota pauses of the autonomous runs in
// <mainRoot>/.aether/autonomy/*/run.json (`quotaPauses`) whose `savedUnits` name the run
// (`swarmRun === runId`). Each pause counts from `started` to `resumeAt`, or to `now` when
// `resumeAt` is later. Returns { count: 0, ms: 0 } when none names the run;
// a run.json that cannot be read or whose dates are not valid is skipped.
function quotaWaitOf(mainRoot, runId, now = Date.now()) {
  const intervals = quotaIntervals(mainRoot, runId, now)
  return { count: intervals.length, ms: intervals.reduce((sum, [start, end]) => sum + (end - start), 0) }
}

// autonomy.js keeps pausedMsOf private. Match its date checks and clamping here;
// keep the swarm predicate shared by the summed figures and wall-clock union.
function quotaIntervals(mainRoot, runId, now) {
  let names
  const root = path.join(mainRoot, '.aether', 'autonomy')
  try {
    names = fs.readdirSync(root)
  } catch {
    return []
  }
  const intervals = []
  for (const name of names) {
    let run
    try {
      run = JSON.parse(fs.readFileSync(path.join(root, name, 'run.json'), 'utf8'))
    } catch {
      continue
    }
    if (!run || typeof run !== 'object' || !Array.isArray(run.quotaPauses)) continue
    for (const pause of run.quotaPauses) {
      if (!pause || typeof pause !== 'object') continue
      if (!Array.isArray(pause.savedUnits) || !pause.savedUnits.some((unit) => unit && unit.swarmRun === runId)) continue
      const started = Date.parse(pause.started)
      const until = Math.min(Date.parse(pause.resumeAt), now)
      if (!Number.isFinite(started) || !Number.isFinite(until) || started > now) continue
      intervals.push([started, Math.max(started, until)])
    }
  }
  return intervals
}

// Merges overlapping [start, end] intervals and returns their total duration in ms.
function unionMs(intervals) {
  if (intervals.length === 0) return 0
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let [curStart, curEnd] = sorted[0]
  let total = 0
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i]
    if (start <= curEnd) {
      if (end > curEnd) curEnd = end
    } else {
      total += curEnd - curStart
      curStart = start
      curEnd = end
    }
  }
  return total + (curEnd - curStart)
}

// Wall-clock union of every recorded timing interval [at - ms, at] and every matching quota pause.
function timingWallMs(mainRoot, runDir, runId, now = Date.now()) {
  const intervals = []
  try {
    const text = fs.readFileSync(path.join(runDir, 'timings.jsonl'), 'utf8')
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      if (!entry || typeof entry !== 'object') continue
      if (!CLASSES.includes(entry.class)) continue
      if (typeof entry.ms !== 'number' || !Number.isFinite(entry.ms) || entry.ms <= 0) continue
      const at = Date.parse(entry.at)
      if (!Number.isFinite(at)) continue
      intervals.push([at - entry.ms, at])
    }
  } catch {
    // Missing or unreadable timings file contributes no intervals.
  }
  intervals.push(...quotaIntervals(mainRoot, runId, now))
  return Math.round(unionMs(intervals))
}

module.exports = { CLASSES, recordTiming, timingsOf, quotaWaitOf, timingWallMs }
