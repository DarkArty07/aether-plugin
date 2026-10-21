// The quota brake's pure decision (spec 011): which rate-limit readings cross the threshold, and the exact
// texts the brake sends. register.js holds the effects (the settings and crossing calls, the notice, the
// prompts and the resume timer); this file only decides, so crossingsOf never mutates what it is given.

const KINDS = ['five_hour', 'seven_day']

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// A reading the brake can act on: one of the two windows, a finite percent and a reset hour in text.
const validReading = (entry) =>
  isObject(entry) && KINDS.includes(entry.kind) && Number.isFinite(entry.percentUsed) && typeof entry.resetsAt === 'string'

// The notice state a session starts with: a window already warned about for a reset hour starts above it,
// so a new session does not warn again for the same crossing.
export function initialBrakeState(settings) {
  const notified = (settings && settings.notified) || {}
  const state = {}
  for (const kind of KINDS) state[kind] = { above: Boolean(notified[kind]), resetsAt: notified[kind] ?? null }
  return state
}

// The crossings in one reading of the windows (five_hour before seven_day) and the notice state after it.
// A window at or over the threshold crosses unless it was already above for that same reset hour; one that
// dips below stops being above, so rising again warns again. A window with no valid reading keeps its
// state, and no valid reading at all changes nothing.
export function crossingsOf(rateLimits, threshold, state) {
  if (!Array.isArray(rateLimits) || rateLimits.length === 0) return { crossings: [], state }
  const readings = []
  for (const kind of KINDS) {
    for (const entry of rateLimits) if (validReading(entry) && entry.kind === kind) readings.push(entry)
  }
  if (readings.length === 0) return { crossings: [], state }
  const next = {}
  for (const kind of KINDS) {
    const before = (state && state[kind]) || {}
    next[kind] = { above: Boolean(before.above), resetsAt: before.resetsAt ?? null }
  }
  const crossings = []
  for (const entry of readings) {
    const above = entry.percentUsed >= threshold
    if (above && !(next[entry.kind].above && next[entry.kind].resetsAt === entry.resetsAt)) {
      crossings.push({ kind: entry.kind, percentUsed: entry.percentUsed, resetsAt: entry.resetsAt })
    }
    next[entry.kind] = { above, resetsAt: entry.resetsAt }
  }
  return { crossings, state: next }
}

// The owner's notice for a crossing: the weekly window only warns, and its text says so.
export function notifyFor(crossing, threshold) {
  const percent = String(crossing.percentUsed)
  const limit = String(threshold)
  const text =
    crossing.kind === 'seven_day'
      ? `La ventana semanal de Claude llegó al ${percent}% (umbral ${limit}%) y se reinicia a las ${crossing.resetsAt}. Es solo un aviso: nada se detiene.`
      : `La ventana de 5 horas de Claude llegó al ${percent}% (umbral ${limit}%) y se reinicia a las ${crossing.resetsAt}.`
  return { title: 'Aether: freno de cuota', text }
}

// The plugin's own message that stops the run's work at a crossing (never submitted as the owner's words).
export function brakePromptFor({ percentUsed, threshold, resetsAt, run, resumeAt }) {
  return `Aether quota brake: the five_hour window is at ${percentUsed}% (threshold ${threshold}%) and resets at ${resetsAt}. Autonomous run ${run} is now paused by the quota brake until ${resumeAt}. Stop every running workflow, delegate task and lane call of this run now (TaskStop, aether-lane stop), save each swarm unit with aether-wt save and record it with aether-autonomy quota-saved, and start nothing new. Do not end the run: it resumes by itself after the reset.`
}

// The plugin's own message that wakes the Lead when the window has reset.
export function resumePromptFor({ run, resumeAt }) {
  return `Aether quota brake: the five_hour window has reset and autonomous run ${run} was paused until ${resumeAt}. Read the run's diary, run aether-autonomy status, and when its stop is no longer quota, relaunch the same swarm run from the saved branches (aether-plan compile --run with the same id, as the diary's Estado says) and continue the run.`
}

// The object a bin printed on its last line, or null when it printed none.
export function jsonFrom(stdout) {
  const lines = typeof stdout === 'string' ? stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '') : []
  if (lines.length === 0) return null
  try {
    const value = JSON.parse(lines[lines.length - 1])
    return isObject(value) ? value : null
  } catch {
    return null
  }
}
