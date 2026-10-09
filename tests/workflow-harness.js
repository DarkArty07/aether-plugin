'use strict'

// Runs the swarm workflow (plugins/aether/workflows/run.workflow.js) in Node with the workflow
// runtime's functions stubbed. Agents answer from scripted handlers, so a test checks the
// control flow and the order of calls without spending tokens.

const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

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
    case 'sweep':
      return { removedWorktrees: [], removedBranches: [], remaining: { worktrees: [], branches: [] } }
    default:
      throw new Error(`unexpected command for run ${first}: ${call.command.line}`)
  }
}

// Default answers: every implementer finishes, every supervisor approves, the final reviewer
// passes, and every ops command succeeds.
function defaultHandlers(state) {
  return {
    implementer: () => ({ status: 'DONE', summary: 'Implemented the brief.', head: 'abc1234', tests: '3/3 pass', concerns: '', question: '' }),
    supervisor: () => ({ verdict: 'approve', findings: [], ruling: 'Approve: the diff meets the brief.', guidance: '', question: '' }),
    reviewer: () => ({ verdict: 'ready', findings: [], declined: [], summary: 'Ready to merge.' }),
    ops: (call) => aetherWt(call, state),
  }
}

function parseCommand(prompt) {
  const m = prompt.match(/aether-wt ([a-z]+)((?: [^\s']+)*)/)
  if (!m) return null
  return { line: m[0], verb: m[1], rest: m[2].trim().split(' ').filter(Boolean) }
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
// returns what aether-wt would print, or null for an agent that failed.
//
// Resolves to { result, error, calls, events, logs, maxActive }. `events` holds "start <key>" and
// "end <key>" lines in order, where <key> is the role (and ops command) plus the unit.
async function runWorkflow(args, overrides = {}) {
  const state = { args: parseLeniently(args), merged: new Set() }
  const defaults = defaultHandlers(state)
  const calls = []
  const events = []
  const logs = []
  const active = {}
  const maxActive = {}

  async function agent(prompt, opts = {}) {
    if (!opts.agentType) throw new Error('every agent call needs an agentType')
    const role = opts.agentType.replace(/^aether:/, '')
    if (!defaults[role]) throw new Error(`unknown agent type: ${opts.agentType}`)
    const unitMatch = (opts.label || '').match(/^(task-\d+):/)
    const call = {
      role,
      model: opts.model,
      effort: opts.effort,
      label: opts.label,
      phase: opts.phase,
      schema: opts.schema,
      prompt,
      unit: unitMatch ? unitMatch[1] : null,
      command: role === 'ops' ? parseCommand(prompt) : null,
    }
    const kind = call.command ? `${role}:${call.command.verb}` : role
    call.n = calls.filter((c) => c.unit === call.unit && c.kind === kind).length + 1
    call.kind = kind
    calls.push(call)
    const key = call.unit ? `${kind} ${call.unit}` : kind
    active[kind] = (active[kind] || 0) + 1
    maxActive[kind] = Math.max(maxActive[kind] || 0, active[kind])
    events.push(`start ${key}`)
    try {
      await tick()
      const handler = overrides[role] || defaults[role]
      const answer = await handler(call, defaults[role])
      if (role !== 'ops' || answer === null) return answer
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

module.exports = { runWorkflow }
