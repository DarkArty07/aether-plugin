'use strict'

// Runs the swarm workflow (plugins/aether/workflows/run.workflow.js) in Node with the workflow
// runtime's functions stubbed. Agents answer from scripted handlers, so a test checks the
// control flow and the order of calls without spending tokens. Ops commands for aether-wt and
// aether-lane answer as the bins would; a lane handler can replace the aether-lane answers.

const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const SCRIPT = path.join(PLUGIN, 'workflows', 'run.workflow.js')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

// The runtime replays a resumed run by repeating its calls, so a workflow may not read the
// clock or random numbers. These stand-ins make any such read fail the test.
function forbidden(what) {
  return () => {
    throw new Error(`${what} is not allowed in a workflow`)
  }
}
function NoDate() {
  throw new Error('Date is not allowed in a workflow')
}
NoDate.now = forbidden('Date.now()')
const NoRandomMath = Object.create(Math, { random: { value: forbidden('Math.random()') } })

function loadWorkflow() {
  const source = fs.readFileSync(SCRIPT, 'utf8')
  if (!source.startsWith('export const meta = {')) throw new Error('run.workflow.js must start with `export const meta = {`')
  const body = source.replace('export const meta', 'const meta')
  if (/^\s*(import|export)\b|\bimport\s*\(/m.test(body)) throw new Error('a workflow cannot import modules')
  return new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'Date', 'Math', 'require', 'process', body)
}

// What a clean aether-wt prints for each command the workflow gives the ops agent.
function aetherWt(call, state) {
  const [first, second] = call.command.rest
  switch (call.command.verb) {
    case 'merge':
      state.merged.add(second)
      return { merged: true, commit: `merge-${second}` }
    case 'remove':
      return { removed: true, patch: state.merged.has(second) ? null : path.join(state.args.runDir, 'patches', `${second}.patch`) }
    case 'diff':
      return { path: path.join(state.args.runDir, 'packages', 'final.diff'), base: state.args.integration.base, head: 'f1a1' }
    case 'salvage':
      return { salvaged: false, files: [], committed: [], left: [], head: null, package: null }
    case 'sweep':
      return { removedWorktrees: [], removedBranches: [], remaining: { worktrees: [], branches: [] } }
    default:
      throw new Error(`unexpected command for run ${first}: ${call.command.line}`)
  }
}

const LEVEL = { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' }
const GROUP = { 'gemini-3.8-flash': 'gemini', 'claude-sonnet-5-5': 'claude', 'claude-opus-5-5': 'claude', 'gpt-5.5-codex': 'openai' }
// The harness that runs a model when it is not agy's. A lane call names only its model, so this stands in for aether-lane's choice.
const HARNESS_OF = { 'gpt-5.5-codex': 'codex' }

// The lane block of a finished call, built from the flags its start was given.
function laneOf(started) {
  return {
    harness: HARNESS_OF[started.model] || 'agy',
    model: `${started.model}-${LEVEL[started.effort]}`,
    group: GROUP[started.model],
    effort: started.effort,
    durationMs: 1000,
    usage: { input: 1000, output: 200, thinking: 0, cacheRead: 500, total: 1200 },
    conversation: `conv-${started.call}`,
  }
}

// What aether-lane prints for a finished call, with the digest it computes.
function laneAnswer({ status = 'ok', result = null, lane, detail = '', files = null }) {
  const answer = { done: true, status, result, lane, detail }
  if (files) answer.files = files
  answer.digest = lanes.resultDigest({ result, lane })
  return answer
}

// What a clean aether-lane prints: every group usable, every call started, and every wait done
// with the role's default answer.
function aetherLane(call, defaults) {
  switch (call.command.verb) {
    case 'status':
      return { harnesses: { agy: { installed: true, version: '1.3.2', groups: { gemini: { usable: true }, claude: { usable: true } } } } }
    case 'start':
      return { started: true, model: `${call.lane.model}-${LEVEL[call.lane.effort]}`, group: GROUP[call.lane.model] }
    case 'wait':
    case 'result': {
      if (!call.started) return { error: `no such lane call: ${call.lane.call}` }
      const role = call.started.role
      const result = defaults[role]({ role, unit: call.started.task || null, n: 1, lane: call.started })
      return laneAnswer({ result, lane: laneOf(call.started) })
    }
    case 'stop':
      return { stopped: [call.lane.call] }
    default:
      throw new Error(`unexpected aether-lane command: ${call.command.line}`)
  }
}

// Default answers: every implementer finishes, every supervisor approves, the final reviewer
// passes, and every ops command succeeds.
function defaultHandlers(state) {
  const defaults = {
    implementer: () => ({ status: 'DONE', summary: 'Implemented the brief.', head: 'abc1234', tests: '3/3 pass', concerns: '', question: '' }),
    supervisor: () => ({ verdict: 'approve', findings: [], ruling: 'Approve: the diff meets the brief.', guidance: '', question: '' }),
    reviewer: () => ({ verdict: 'ready', findings: [], declined: [], summary: 'Ready to merge.' }),
    ops: (call) => aetherWt(call, state),
  }
  defaults.lane = (call) => aetherLane(call, defaults)
  return defaults
}

function parseCommand(prompt) {
  const m = prompt.match(/(aether-wt|aether-lane) ([a-z]+)((?: [^\s']+)*)/)
  if (!m) return null
  return { tool: m[1], line: m[0], verb: m[2], rest: m[3].trim().split(' ').filter(Boolean) }
}

// The run, the call and the --flags of an aether-lane command.
function laneFlags(rest) {
  const flags = { run: rest[0], call: rest[1] }
  for (let i = 2; i < rest.length; i += 2) flags[rest[i].replace(/^--/, '')] = rest[i + 1]
  return flags
}

function payloadOf(prompt) {
  const m = /^=== aether-lane payload: (.+) ===$/m.exec(prompt)
  return m ? { path: m[1], text: prompt.slice(m.index + m[0].length + 1) } : null
}

// The args as the stubs see them. Invalid input is the workflow's to reject, not the harness's.
function parseLeniently(args) {
  let value = args
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

// Lets the other units' calls start before this one goes on.
function tick() {
  return new Promise((resolve) => setImmediate(resolve))
}

// Runs the workflow with `args`. A handler in `overrides` replaces the default for its role and
// gets (call, fallback): `call` describes the agent call, with `n` counting this role's calls for
// the unit (ops: for the unit and command); `fallback` is the default handler. An ops handler
// returns what aether-wt would print, or null for an agent that failed. `overrides.lane` answers
// aether-lane commands the same way, and may also return a string, printed as it is.
//
// An aether-lane call also carries `lane` (its run, call and flags), `payload` ({ path, text }, for
// a start), `digestOk` (for a start: whether --digest matches the payload) and `started` (for a
// wait, result or stop: the flags its start was given).
//
// Resolves to { result, error, calls, events, logs, maxActive }. `events` holds "start <key>" and
// "end <key>" lines in order, where <key> is the role (and ops command) plus the unit.
async function runWorkflow(args, overrides = {}) {
  const state = { args: parseLeniently(args), merged: new Set(), lanes: {} }
  const defaults = defaultHandlers(state)
  const calls = []
  const events = []
  const logs = []
  const active = {}
  const maxActive = {}

  async function agent(prompt, opts = {}) {
    if (!opts.agentType) throw new Error('every agent call needs an agentType')
    const role = opts.agentType.replace(/^aether:/, '')
    if (!['implementer', 'supervisor', 'reviewer', 'ops'].includes(role)) throw new Error(`unknown agent type: ${opts.agentType}`)
    const unitMatch = (opts.label || '').match(/^(task-\d+):/)
    const command = role === 'ops' ? parseCommand(prompt) : null
    const isLane = Boolean(command && command.tool === 'aether-lane')
    const call = {
      role,
      model: opts.model,
      effort: opts.effort,
      label: opts.label,
      phase: opts.phase,
      schema: opts.schema,
      prompt,
      unit: unitMatch ? unitMatch[1] : null,
      command,
      lane: isLane ? laneFlags(command.rest) : null,
      payload: isLane ? payloadOf(prompt) : null,
    }
    if (isLane && command.verb === 'start') {
      call.digestOk = Boolean(call.payload) && lanes.digest(call.payload.text) === call.lane.digest
      state.lanes[call.lane.call] = call.lane
    }
    if (isLane && command.verb !== 'start') call.started = state.lanes[call.lane.call] || null
    const kind = command ? (isLane ? `ops:lane-${command.verb}` : `ops:${command.verb}`) : role
    call.n = calls.filter((c) => c.unit === call.unit && c.kind === kind).length + 1
    call.kind = kind
    calls.push(call)
    const key = call.unit ? `${kind} ${call.unit}` : kind
    active[kind] = (active[kind] || 0) + 1
    maxActive[kind] = Math.max(maxActive[kind] || 0, active[kind])
    events.push(`start ${key}`)
    try {
      await tick()
      const handler = isLane ? overrides.lane || defaults.lane : overrides[role] || defaults[role]
      const answer = await handler(call, isLane ? defaults.lane : defaults[role])
      if (role !== 'ops' || answer === null) return answer
      if (typeof answer === 'string') return { exitCode: 0, stdout: answer }
      return { exitCode: answer.error ? 1 : 0, stdout: `${JSON.stringify(answer)}\n` }
    } finally {
      await tick()
      active[kind]--
      events.push(`end ${key}`)
    }
  }

  const parallel = (thunks) => Promise.all(thunks.map((thunk) => thunk()))
  const pipeline = forbidden('pipeline() in this harness')
  const phase = (title) => events.push(`phase ${title}`)
  const log = (message) => logs.push(String(message))

  let result = null
  let error = null
  try {
    result = await loadWorkflow()(agent, parallel, pipeline, phase, log, args, NoDate, NoRandomMath, undefined, undefined)
  } catch (err) {
    error = err
  }
  return { result, error, calls, events, logs, maxActive }
}

module.exports = { runWorkflow, laneAnswer, laneOf, HARNESS_OF }
