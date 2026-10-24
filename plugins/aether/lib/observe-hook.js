'use strict'

// The handler of the five observation hooks. It takes from the hook's input only the fields listed in EVENTS, and
// appendEvent keeps only identifiers from them. The rest of the input is never read here; the development
// installation hands the whole input to captureFragment, which is the one that opens anything.

const { appendEvent, observeMode } = require('./observe.js')
const { isAetherSession } = require('./session.js')
const run = require('./run.js')

const EVENTS = Object.freeze({
  PostToolUse: ['tool_name'],
  PostToolUseFailure: ['tool_name', 'is_interrupt'],
  StopFailure: ['error'],
  PreCompact: ['trigger'],
  SessionEnd: ['reason'],
})

const NOTHING = Object.freeze({ recorded: false, fragment: null })
const FRAGMENT_EVENTS = new Set(['PostToolUseFailure', 'StopFailure', 'PostToolUse'])

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

// The main checkout of the repository that holds cwd (a worktree or a subfolder gives the main one), or null.
function mainRootOf(cwd) {
  if (typeof cwd !== 'string' || !cwd) return null
  try {
    const { repoPaths } = require('./git.js')
    return repoPaths(cwd).mainRoot || null
  } catch {
    return null
  }
}

function endSession(dataDir, session, input, now, env) {
  const { digestSession } = require('./observe-digest.js')
  const { readObservations } = require('./observe-read.js')
  try {
    digestSession(dataDir, session)
    // The development installation keeps the owner's corrections before the reading, so that this same reading has them.
    if (observeMode(env) === 'dev') require('./observe-dev.js').captureCorrections({ dataDir, session, input, now })
    readObservations({ dataDir, repoRoot: mainRootOf(input.cwd), now })
  } catch {
    // The event is already recorded; a failed reading must not turn it into nothing.
  }
}

function handleHook(input, { dataDir = run.dataDir(), env = process.env, now = Date.now() } = {}) {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ...NOTHING }
    const event = input.hook_event_name
    if (typeof event !== 'string' || !has(EVENTS, event)) return { ...NOTHING }
    const session = input.session_id
    if (!isAetherSession(dataDir, session)) return { ...NOTHING }
    if (event === 'PostToolUse' && input.tool_name !== 'ScheduleWakeup') return { ...NOTHING }

    const raw = { time: now, session, kind: event }
    if (event === 'PostToolUse' || event === 'PostToolUseFailure') raw.tool = input.tool_name
    if (event === 'PostToolUseFailure') raw.interrupted = input.is_interrupt
    if (event === 'StopFailure') raw.class = input.error
    if (event === 'PreCompact') raw.trigger = input.trigger
    if (event === 'SessionEnd') raw.reason = input.reason
    const recorded = appendEvent(dataDir, raw)

    if (event === 'SessionEnd') endSession(dataDir, session, input, now, env)

    let fragment = null
    if (observeMode(env) === 'dev' && FRAGMENT_EVENTS.has(event)) {
      const { captureFragment } = require('./observe-dev.js')
      fragment = captureFragment({ dataDir, session, event, input, now })
    }
    return { recorded, fragment }
  } catch {
    return { ...NOTHING }
  }
}

module.exports = { EVENTS, handleHook }
