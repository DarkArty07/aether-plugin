// Aether usage meter (spec §10). Records every model request of an Aether session (the main session's,
// subagents' and workflow agents') with its tokens and timing, so aether-report can price a run.
// The meter only observes: a failure in it never changes, delays past a write, or blocks a request.
// It also saves each aether-lane payload an ops agent carries to the file its marker names (lanes spec §6.1):
// a lane call's prompt, or a design round's message to <repo>/.aether-tmp/seats/<session>/message.md.
//
// It answers the ops agents of aether:run itself (decision A30): when a workflow spawns aether:ops with a
// prompt that ops-command.mjs accepts, the agent's first step runs that aether-wt or aether-lane command with
// $.process.run, no shell, and ends the agent with the StructuredOutput call aether:run's schema asks for,
// without a model request. Any workflow in an Aether session gets that answer, for any repository and run
// the prompt names. Any other prompt, a command that $.process.run refuses or cannot start, and a bin that
// fails to load go to the model as before. Otherwise, once the mod has run an agent's command, the agent's
// model never runs it: a command still running at its timeout, or ended without its line, is reported.
//
// Only an Aether session is metered (installable spec R9): one whose Lead started it (classic.SessionStart
// with agent_type aether:lead), or one that has a marker <data dir>/sessions/<session>.json, which only
// aether-session-start writes. In any other session the meter records and writes nothing, and the agents
// of the aether plugin are not offered.
//
// It hands the Lead's delegates to the delegate router (router.mjs, spec 006): the Agent calls of an Aether
// session whose subagent_type is not aether:*, the spawn of each routed delegate (which the router records, so
// aether-report can price it), and the first step of a delegate the router runs on another harness. The router
// never breaks a call: any failure in it leaves the call as the Lead made it.
//
// It also gives an Aether session the /harnesses command (panel.jsx): a pane with the delegation settings and the quota
// of each harness, drawn without a model. The Lead's SessionStart declares the command; the command and the pane ask
// this file whether the session is Aether's (aetherSession) when they are used, never at session start, so that the
// first answer kept for the session is the meter's own.
//
// It also gives an Aether session the /spend command (spend-panel.jsx): a pane with the list-price spend of this
// session, drawn without a model. The Lead's SessionStart declares the command; the command and the pane ask
// this file whether the session is Aether's (aetherSession) when they are used, never at session start, so that the
// first answer kept for the session is the meter's own.
//
// It also runs the quota brake (spec 011, quota-brake.mjs): after each metered step it reads the session's rate-limit
// windows, and when one crosses the threshold it warns the owner once, records the crossing with aether-autonomy, tells
// the Lead through the plugin's own prompt to stop the run's work, and arms a wake-up for the window's reset. The brake
// only observes a step: no failure in it changes the step's answer.
//
// Files: <data dir>/usage/<session>/<n>.json, each { session, part, claudeCode, agents, entries }
// with up to PART_SIZE entries. A reloaded module starts after the parts already on disk.

import { PAYLOAD_PATH, parseOpsPrompt } from './ops-command.mjs'
import { registerPanel } from './panel.jsx'
import { registerSpend } from './spend-panel.jsx'
import { brakePromptFor, crossingsOf, initialBrakeState, jsonFrom, notifyFor, resumePromptFor } from './quota-brake.mjs'
import { createRouter } from './router.mjs'

const PART_SIZE = 1000
const FLUSH_EVERY = 20
const LEAD = 'aether:lead'
const OPS = 'aether:ops'
// The tool a workflow agent with a schema ends with (measured on Claude Code 2.1.296).
const STRUCTURED_OUTPUT = 'StructuredOutput'
// The exit code of a command the mod stopped at its timeout, as timeout(1) gives.
const TIMED_OUT = 124
// An ops agent whose command the mod ran (in a session's `ops`).
const ANSWERED = 'answered'
// What node prints when a bin fails to load: a node too old for its syntax, or a missing file.
const LOAD_FAILURE = /\b(SyntaxError|Cannot find module)\b/
const SESSION_ID = /^[A-Za-z0-9-]+$/
// A brake call to aether-autonomy: a small read or write of the run's JSON.
const BRAKE_TIMEOUT_MS = 10000
// How often the brake may ask for its settings again while a crossing waits for a run to pause.
const BRAKE_RECHECK_MS = 60000

// session id → { id, aether, dataDir, ready, entries, agents, written, writing, pending, ops, brake }
// `ops` holds each ops agent's command until its first step, agent id → { cwd, bin, args, timeoutMs },
// then ANSWERED once the mod has run it.
const sessions = new Map()

const router = createRouter()

const PAYLOAD_MARKER = /^=== aether-lane payload: (.+) ===$/m

const tokens = (value) => (Number.isFinite(value) ? value : 0)
const effortOf = (value) => (typeof value === 'string' && value !== '' ? value : null)

const asText = (value) => (typeof value === 'string' && value !== '' ? value : null)
const withoutTrailingSlashes = (path) => path.replace(/\/+$/, '')
const dataId = (text) => text.replace(/[^A-Za-z0-9_-]/g, '-')

// The data directory (installable spec R11, R12), from the values the mod can read. Paths are compared
// as given: a mod cannot resolve links.
export function dataDirFrom({ env, root, name }) {
  const given = asText(env && env.AETHER_DATA_DIR)
  if (given) return given
  const cacheDir = asText(env && env.CLAUDE_CODE_PLUGIN_CACHE_DIR)
  const configDir = asText(env && env.CLAUDE_CONFIG_DIR)
  const home = asText(env && env.HOME) || ''
  const pluginsRoot = withoutTrailingSlashes(cacheDir || `${configDir ? withoutTrailingSlashes(configDir) : `${withoutTrailingSlashes(home)}/.claude`}/plugins`)
  const cachePrefix = `${pluginsRoot}/cache/`
  const pluginRoot = typeof root === 'string' ? withoutTrailingSlashes(root) : ''
  if (pluginRoot.startsWith(cachePrefix)) {
    const [marketplace, plugin, version, ...rest] = pluginRoot.slice(cachePrefix.length).split('/')
    const segments = [marketplace, plugin, version]
    if (rest.length === 0 && segments.every((segment) => segment && segment !== '.' && segment !== '..')) {
      return `${pluginsRoot}/data/${dataId(`${plugin}@${marketplace}`)}`
    }
  }
  return `${pluginsRoot}/data/${dataId(`${asText(name) || 'aether'}@inline`)}`
}

// The data directory of this process, read through the mod's own interfaces.
async function readDataDir($) {
  // A failed or refused read counts as unset. Each name is a literal, so the kit can list them.
  const read = async (get) => {
    try {
      return await get
    } catch {
      return undefined
    }
  }
  const env = {
    AETHER_DATA_DIR: await read($.env.get('AETHER_DATA_DIR')),
    CLAUDE_CODE_PLUGIN_CACHE_DIR: await read($.env.get('CLAUDE_CODE_PLUGIN_CACHE_DIR')),
    CLAUDE_CONFIG_DIR: await read($.env.get('CLAUDE_CONFIG_DIR')),
    HOME: await read($.env.get('HOME')),
  }
  let root
  let name
  try {
    root = $.plugin.root
    name = $.plugin.name
  } catch {
    // A missing value counts as undefined.
  }
  return dataDirFrom({ env, root, name })
}

function sessionOf(id) {
  let state = sessions.get(id)
  if (!state) {
    state = { id, aether: undefined, opsOff: undefined, brake: undefined, dataDir: null, ready: null, entries: [], agents: {}, written: 0, writing: false, pending: false, ops: new Map() }
    sessions.set(id, state)
  }
  return state
}

// The session this event belongs to, or null when its id cannot be read or cannot be a marker's name.
async function currentSession($) {
  try {
    const id = await $.session.id()
    return typeof id === 'string' && SESSION_ID.test(id) ? sessionOf(id) : null
  } catch {
    return null
  }
}

// Whether the session is Aether. The first answer is kept for the session; a failed or refused check
// counts as not Aether. A SessionStart from the Lead that arrives meanwhile wins.
async function isAether($, state) {
  if (state.aether !== undefined) return state.aether
  let answer = false
  try {
    state.dataDir ??= readDataDir($)
    answer = (await $.fs.exists(`${await state.dataDir}/sessions/${state.id}.json`)) === true
  } catch {
    answer = false
  }
  if (state.aether === undefined) state.aether = answer
  return state.aether
}

// The session of this event when it is an Aether session, else null.
export async function aetherSession($) {
  const state = await currentSession($)
  return state && (await isAether($, state)) ? state : null
}

async function init($, state) {
  state.dataDir ??= readDataDir($)
  const dir = `${await state.dataDir}/usage/${state.id}`
  let firstPart = 0
  try {
    for (const entry of await $.fs.list(dir)) {
      const m = /^(\d+)\.json$/.exec(entry.name)
      if (m) firstPart = Math.max(firstPart, Number(m[1]) + 1)
    }
  } catch {
    firstPart = 0 // no parts yet
  }
  let claudeCode = null
  try {
    claudeCode = (await $.session.version()).version
  } catch {
    claudeCode = null
  }
  return { dir, firstPart, claudeCode }
}

function setup($, state) {
  if (!state.ready) state.ready = init($, state)
  return state.ready
}

// Writes the parts that gained entries since the last write.
async function writeParts($, state) {
  const where = await setup($, state)
  const total = state.entries.length
  if (total === state.written) return
  for (let i = Math.floor(state.written / PART_SIZE); i <= Math.floor((total - 1) / PART_SIZE); i++) {
    const part = where.firstPart + i
    const body = { session: state.id, part, claudeCode: where.claudeCode, agents: state.agents, entries: state.entries.slice(i * PART_SIZE, (i + 1) * PART_SIZE) }
    await $.fs.write(`${where.dir}/${part}.json`, JSON.stringify(body))
  }
  state.written = total
}

// One write at a time: a hook that finds a write in progress leaves its entries to that write.
async function flush($, state) {
  if (state.writing) {
    state.pending = true
    return
  }
  state.writing = true
  try {
    do {
      state.pending = false
      await writeParts($, state)
    } while (state.pending)
  } catch {
    // The entries stay in memory, and the next flush writes them.
  } finally {
    state.writing = false
  }
}

// Writes what every Aether session still holds.
async function flushAll($) {
  for (const state of sessions.values()) {
    if (state.aether === true) await flush($, state)
  }
}

// The payload of an ops prompt and the file its first marker names, or null when the prompt
// carries no marker or the marker names a place a lane does not write.
function lanePayload(e) {
  if (e.subagentType !== 'aether:ops' || typeof e.prompt !== 'string') return null
  const marker = PAYLOAD_MARKER.exec(e.prompt)
  if (!marker) return null
  const path = marker[1]
  if (!path.startsWith('/') || path.split('/').some((segment) => segment === '.' || segment === '..')) return null
  if (!PAYLOAD_PATH.test(path)) return null
  const end = marker.index + marker[0].length
  return { path, payload: e.prompt.slice(e.prompt.charAt(end) === '\n' ? end + 1 : end) }
}

// Writes the payload, then the spawn record beside it. A failure leaves the spawn unchanged.
async function saveLanePayload($, e, session) {
  try {
    const lane = lanePayload(e)
    if (!lane) return
    await $.fs.write(lane.path, lane.payload)
    const workflow = e.workflow || {}
    const spawn = {
      session,
      workflowRunId: workflow.runId ?? null,
      agentIndex: workflow.agentIndex ?? null,
    }
    await $.fs.write(`${lane.path.slice(0, lane.path.lastIndexOf('/'))}/spawn.json`, JSON.stringify(spawn))
  } catch {
    // The lane finds no payload and reports it; the spawn goes on.
  }
}

// What a command that ran but returned no result may have left behind.
function leftBehind(command) {
  // aether-wt merge commits the merge before it runs the tests, and reverts only after them.
  if (command.args[0] === 'merge') return 'its merge commit may be on the integration branch without its tests: check its git log before a relaunch'
  return 'what it changed is unknown'
}

// Whether the session's ops option is off: the session-start hook leaves <id>.ops-off beside the marker. The first
// answer is kept; a failed or refused check counts as on, which is the default.
async function opsOff($, state) {
  if (state.opsOff !== undefined) return state.opsOff
  let off = false
  try {
    state.dataDir ??= readDataDir($)
    off = (await $.fs.exists(`${await state.dataDir}/sessions/${state.id}.ops-off`)) === true
  } catch {
    off = false
  }
  state.opsOff = off
  return off
}

// The command an ops agent carries, when the mod may run it, else null. Only an agent a workflow spawned
// with a schema has the StructuredOutput tool the answer calls; aether:run always passes one.
function opsCommand(e, $) {
  if (e.subagentType !== OPS || !e.workflow) return null
  try {
    const command = parseOpsPrompt(e.prompt)
    // The PATH form names the compiling version's bins (issue 008): when they are not this
    // mod's own, the model runs the prompt, and its PATH puts that version's bin first.
    if (command && command.binDir !== undefined && command.binDir !== `${$.plugin.root}/bin`) return null
    return command
  } catch {
    return null
  }
}

// The four calls the router makes, spelled here: the engine follows $ only into this file's own functions.
function routerCalls($) {
  return {
    clock: { now: () => $.clock.now() },
    fs: { write: (path, text) => $.fs.write(path, text) },
    process: { run: (argv, init) => $.process.run(argv, init) },
    model: { complete: (request) => $.model.complete(request) },
  }
}

// What the router needs of an Aether session, or null when it cannot be read.
async function routerContext($, state) {
  try {
    state.dataDir ??= readDataDir($)
    return { session: state.id, dataDir: await state.dataDir, root: $.plugin.root }
  } catch {
    return null
  }
}

// One step of the model, metered: its request's tokens and timing join the session's entries.
async function* meteredStep($, state, e, next) {
  let started = null
  try {
    started = await $.clock.now()
  } catch {
    started = null
  }
  const result = yield* next(e)
  try {
    const usage = result && result.usage
    if (usage) {
      const ended = await $.clock.now()
      state.entries.push({
        t: ended,
        ms: started === null ? null : ended - started,
        agent: e.agentId || null,
        model: usage.model || e.model || null,
        effort: effortOf(e.effort),
        input: tokens(usage.input_tokens),
        output: tokens(usage.output_tokens),
        cacheRead: tokens(usage.cache_read_input_tokens),
        cacheWrite: tokens(usage.cache_creation_input_tokens),
      })
      if (state.entries.length - state.written >= FLUSH_EVERY) await flush($, state)
    }
  } catch {
    // Observing only.
  }
  return result
}

// One call to aether-autonomy for the brake: the object it printed, or null when it failed or printed none.
async function autonomyCall($, args) {
  const out = await $.process.run(['node', `${$.plugin.root}/bin/aether-autonomy`, ...args], { timeoutMs: BRAKE_TIMEOUT_MS })
  return out && out.exitCode === 0 ? jsonFrom(out.stdout) : null
}

// Arms the wake-up for one pause, once per pause: at its resume hour the plugin's own message asks the Lead
// to continue the run. A resume hour already past submits it at once.
async function armResume($, brake, run, resumeAt) {
  const at = Date.parse(resumeAt)
  if (!run || !Number.isFinite(at)) return
  const armedFor = `${run}:${resumeAt}`
  if (brake.armedFor === armedFor) return
  brake.armedFor = armedFor
  const ms = at - (await $.clock.now())
  if (ms <= 0) {
    await $.prompt.submit({ text: resumePromptFor({ run, resumeAt }) })
    return
  }
  $.clock.after(ms, async () => {
    try {
      await $.prompt.submit({ text: resumePromptFor({ run, resumeAt }) })
    } catch {
      // The session ended first; the next one rearms from its settings.
    }
  })
}

// The five-hour reading among the windows, in the shape crossingsOf accepts, or null.
function fiveHourReading(rateLimits) {
  if (!Array.isArray(rateLimits)) return null
  for (const entry of rateLimits) {
    if (entry && entry.kind === 'five_hour' && Number.isFinite(entry.percentUsed) && typeof entry.resetsAt === 'string') return entry
  }
  return null
}

// Records one crossing with the bin, with how its warning fared: the bin's answer, or null.
async function recordCrossing($, state, crossing, threshold, notify) {
  return autonomyCall($, [
    'brake-crossing', '--kind', crossing.kind, '--percent', String(crossing.percentUsed), '--resets-at', crossing.resetsAt,
    '--threshold', String(threshold), '--notify', notify.sent ? 'sent' : 'failed',
    ...(!notify.sent && notify.reason ? ['--notify-reason', notify.reason] : []),
    '--session', state.id,
  ])
}

// What a recorded crossing does: a new five-hour pause tells the Lead to stop the run's work (the plugin's
// own message, never as the owner's words) and arms its wake-up. Any five-hour answer but no-run is
// remembered for that reset hour, so neither the settings nor the crossing is asked for it again.
async function brakeRecorded($, state, crossing, record) {
  const brake = state.brake
  const wasPaused = brake.pausedResetsAt === crossing.resetsAt
  if (record && crossing.kind === 'five_hour' && record.reason !== 'no-run') brake.pausedResetsAt = crossing.resetsAt
  if (!record || crossing.kind !== 'five_hour' || record.paused !== true || !record.run || !record.resumeAt) return
  if (record.duplicate !== true && !wasPaused) {
    await $.prompt.submit({ text: brakePromptFor({ ...crossing, threshold: brake.settings.threshold, run: record.run, resumeAt: record.resumeAt }) })
  }
  await armResume($, brake, record.run, record.resumeAt)
}

// The quota brake after one metered step. The first step asks aether-autonomy for the brake's settings (a
// failure leaves the brake inert for the session, never retried per step); each step then reads the
// windows and acts on a fresh crossing. Observing only: the body is caught whole.
async function brakeStep($, state) {
  // turn.step fires for every agent of the session, so in a swarm steps overlap: one step at a time handles a crossing, and
  // a step that finds another one at work leaves it to that one (the next step reads the windows again).
  if (state.brakeBusy) return
  state.brakeBusy = true
  try {
    await brakeStepOnce($, state)
  } finally {
    state.brakeBusy = false
  }
}

async function brakeStepOnce($, state) {
  try {
    if (state.brake === null) return
    const now = await $.clock.now()
    if (state.brake === undefined) {
      let settings = null
      try {
        settings = await autonomyCall($, ['brake-settings', '--session', state.id])
      } catch {
        settings = null
      }
      if (!settings) {
        state.brake = null
        return
      }
      state.brake = {
        settings,
        state: initialBrakeState(settings),
        armedFor: null,
        pausedResetsAt: settings.paused ? settings.paused.resetsAt : null,
        settingsCheckedAt: now,
      }
      if (settings.paused) await armResume($, state.brake, settings.paused.run, settings.paused.resumeAt)
    }
    const brake = state.brake
    const usage = await $.session.usage()
    const rateLimits = usage && usage.rateLimits
    const five = fiveHourReading(rateLimits)
    // A run can open after its window was warned about: while the window stays at or over the threshold
    // with no pause seen for its reset hour, the settings are asked again, at most once a minute. A
    // failed re-ask keeps the settings it had and still counts, so no step spawns it twice in a row.
    if (five && five.percentUsed >= brake.settings.threshold && brake.pausedResetsAt !== five.resetsAt && now - brake.settingsCheckedAt >= BRAKE_RECHECK_MS) {
      let settings = null
      try {
        settings = await autonomyCall($, ['brake-settings', '--session', state.id])
      } catch {
        settings = null
      }
      if (settings) brake.settings = settings
      brake.settingsCheckedAt = now
    }
    const decided = crossingsOf(rateLimits, brake.settings.threshold, brake.state)
    brake.state = decided.state
    let fiveRecorded = false
    for (const crossing of decided.crossings) {
      const notice = notifyFor(crossing, brake.settings.threshold)
      let notify
      try {
        const result = await $.ui.notify(notice.text, { title: notice.title })
        notify = result && result.isSent ? { sent: true, reason: null } : { sent: false, reason: (result && result.reason) || 'refused' }
      } catch {
        notify = { sent: false, reason: 'error' }
      }
      if (crossing.kind === 'five_hour') fiveRecorded = true
      const record = await recordCrossing($, state, crossing, brake.settings.threshold, notify)
      await brakeRecorded($, state, crossing, record)
    }
    // The warning and the pause do not share a dedupe: a window warned about earlier (here or in an
    // earlier session) still pauses an open run that has no pause for its reset hour. The warning for
    // that hour was already given, so this recording says it was sent and does not repeat it.
    if (five && !fiveRecorded && five.percentUsed >= brake.settings.threshold && brake.pausedResetsAt !== five.resetsAt) {
      const settings = brake.settings
      if (settings.openRun && (!settings.paused || settings.paused.resetsAt !== five.resetsAt)) {
        const crossing = { kind: 'five_hour', percentUsed: five.percentUsed, resetsAt: five.resetsAt }
        const record = await recordCrossing($, state, crossing, settings.threshold, { sent: true, reason: null })
        await brakeRecorded($, state, crossing, record)
      }
    }
  } catch {
    // Observing only.
  }
}

export function register(on, options) {
  registerPanel(on, options)
  registerSpend(on)

  on('classic.SessionStart', async ($, e, next) => {
    if (e && e.agent_type === LEAD && typeof e.session_id === 'string' && SESSION_ID.test(e.session_id)) {
      sessionOf(e.session_id).aether = true
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.offer', async ($, e, next) => {
    if (e.agent === LEAD) return { isOffered: false }
    if (typeof e.agent === 'string' && e.agent.startsWith('aether:') && !(await aetherSession($))) return { isOffered: false }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The Lead's delegates go through the router; an aether:* agent is never routed (R9).
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const state = await aetherSession($)
    if (!state) return next(e)
    const ctx = await routerContext($, state)
    if (!ctx) return next(e)
    return router.toolCall(routerCalls($), e, next, ctx)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const state = await aetherSession($)
    if (!state) return next(e)
    await saveLanePayload($, e, state.id)
    const result = await next(e)
    if (result && result.agentId) {
      state.agents[result.agentId] = { type: e.subagentType || null, description: e.description || null }
      // The delegate router links the agent to its decision (and keeps an external delegate for its first step).
      const ctx = await routerContext($, state)
      if (ctx) router.bind(routerCalls($), e, result.agentId, ctx)
      const command = opsCommand(e, $)
      if (command && !(await opsOff($, state))) state.ops.set(result.agentId, command)
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const state = await aetherSession($)
    if (!state) return yield* next(e)
    // A delegate the router runs on another harness: its first step is that harness's answer, or the model's.
    if (router.has(e.agentId)) {
      const ctx = await routerContext($, state)
      if (ctx) return yield* router.step(routerCalls($), e, (event) => meteredStep($, state, event, next), ctx)
    }
    const command = e.agentId ? state.ops.get(e.agentId) : undefined
    if (command === ANSWERED) {
      // The agent goes on after the mod's answer, so its answer was not taken. The model would run the
      // command a second time: end the agent instead, and let the workflow see an ops failure.
      const answer = 'Not run again: the Aether mod already ran this command, and its answer was not taken.'
      yield { kind: 'text', index: 0, text: answer }
      yield { kind: 'stop', stopReason: 'end_turn', usage: null }
      return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn', usage: null }
    }
    if (command) state.ops.delete(e.agentId)
    if (command && e.index === 0) {
      let out = null
      let began = null
      try {
        began = await $.clock.now()
      } catch {
        began = null
      }
      try {
        out = await $.process.run(['node', `${$.plugin.root}/bin/${command.bin}`, ...command.args], { cwd: command.cwd, timeoutMs: command.timeoutMs })
        // The bins print a JSON line whenever they finish. A failure without it is a bin that failed to load,
        // which changed nothing, so the model runs the prompt through the Bash tool's environment; or one
        // that ended mid-way, killed for instance, which is reported and never run again.
        if (out.exitCode !== 0 && (typeof out.stdout !== 'string' || out.stdout.trim() === '')) {
          const stderr = typeof out.stderr === 'string' ? out.stderr.trim() : ''
          if (LOAD_FAILURE.test(stderr)) {
            out = null
          } else {
            const last = stderr === '' ? '' : ` (${stderr.split('\n').pop().trim().slice(0, 200)})`
            const error = `${command.bin} ${command.args[0]} exited ${out.exitCode} and printed nothing${last}; ${leftBehind(command)}`
            out = { exitCode: out.exitCode, stdout: `${JSON.stringify({ error })}\n` }
          }
        }
      } catch (err) {
        // Stopped at its timeout, the command ran: report it, and leave nothing for the model to run again.
        let ended = null
        try {
          ended = await $.clock.now()
        } catch {
          ended = null
        }
        const stopped = /still running after/.test(String(err && err.message)) || (began !== null && ended !== null && ended - began >= command.timeoutMs)
        if (stopped) {
          const error = `${command.bin} ${command.args[0]} was still running after ${command.timeoutMs / 1000} s and was stopped; ${leftBehind(command)}`
          out = { exitCode: TIMED_OUT, stdout: `${JSON.stringify({ error })}\n` }
        }
      }
      if (out) {
        // The answer the model would give: one StructuredOutput call. It records no usage.
        state.ops.set(e.agentId, ANSWERED)
        const input = { exitCode: out.exitCode, stdout: out.stdout }
        yield { kind: 'tool', index: 0, id: `toolu_aether_ops_${e.agentId}`, name: STRUCTURED_OUTPUT }
        yield { kind: 'input', index: 0, json: JSON.stringify(input) }
        yield { kind: 'stop', stopReason: 'tool_use', usage: null }
        return { turnId: e.turnId, index: e.index, answer: '', toolUses: [{ name: STRUCTURED_OUTPUT, input }], stopReason: 'tool_use', usage: null }
      }
      // $.process.run refused or could not start the command, or the bin failed to load: the model runs the prompt.
    }
    const result = yield* meteredStep($, state, e, next)
    await brakeStep($, state)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    await flushAll($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await flushAll($)
    return next(e)
  })
}
