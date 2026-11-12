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
    fs.mkdirSync(runDir, { recursive: true })
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
  let names
  try {
    names = fs.readdirSync(path.join(mainRoot, '.aether', 'autonomy'))
  } catch {
    return { count: 0, ms: 0 }
  }
  let count = 0
  let ms = 0
  for (const name of names) {
    let run
    try {
      run = JSON.parse(fs.readFileSync(path.join(mainRoot, '.aether', 'autonomy', name, 'run.json'), 'utf8'))
    } catch {
      continue
    }
    if (!run || typeof run !== 'object' || !Array.isArray(run.quotaPauses)) continue
    for (const pause of run.quotaPauses) {
      if (!pause || typeof pause !== 'object') continue
      if (!Array.isArray(pause.savedUnits) || !pause.savedUnits.some((unit) => unit && unit.swarmRun === runId)) continue
      const started = Date.parse(pause.started)
      const resumeAt = Date.parse(pause.resumeAt)
      if (!Number.isFinite(started) || !Number.isFinite(resumeAt)) continue
      count++
      ms += Math.max(0, Math.min(resumeAt, now) - started)
    }
  }
  return { count, ms }
}

module.exports = { CLASSES, recordTiming, timingsOf, quotaWaitOf }
