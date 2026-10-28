'use strict'

// The mod's spawn path (register.js: agent.spawn, and the Agent call of the delegate ladder) driven as the engine drives a
// hook: when the hook throws, its .catch runs with a next the engine keeps replay-safe (the Caught type of the mod API).
// register.js imports two JSX panels that Node does not load, so a stub stands in for each.

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { registerHooks } = require('node:module')
const { pathToFileURL } = require('node:url')
const { PLUGIN } = require('./helpers.js')

const PANEL_STUB = 'data:text/javascript,export%20function%20registerPanel()%7B%7D%3B%20export%20function%20registerSpend()%7B%7D%3B'
registerHooks({
  resolve(specifier, context, next) {
    if (/\/(panel|spend-panel)\.jsx$/.test(specifier)) return { url: PANEL_STUB, shortCircuit: true, format: 'module' }
    return next(specifier, context)
  },
})
const loaded = import(pathToFileURL(path.join(PLUGIN, 'hooks', 'register.js')).href)

// A copy of the plugin loaded with --plugin-dir: another root, and no data directory in the environment.
const COPY = '/home/u/work/copy/plugins/aether'
const SPAWN = { tool_use_id: 'toolu_1', prompt: 'AETHER-TASK: t1\nFix it.', description: 'Fix it', subagentType: 'general-purpose', model: 'haiku' }
const AGENT_CALL = { subagent_type: 'general-purpose', description: 'Fix it', prompt: 'AETHER-TASK: t1\nFix it.', model: 'opus', effort: 'max' }

// The hooks register.js declares, by name: each holds its hook and the handler of its .catch.
async function hooks() {
  const { register } = await loaded
  const table = {}
  const on = (name, ...rest) => {
    const entry = { hook: rest[rest.length - 1], catch: null }
    table[name] = entry
    return { catch(handler) { entry.catch = handler; return this } }
  }
  register(on, {})
  return table
}

// The engine's run of a hook. A hook that throws is run again by its .catch, whose next is replay-safe: after the hook
// called next, a later call gives what that call settled to, and runs nothing beneath again. `called` says whether it did.
async function run(entry, $, e, next) {
  const state = { called: false, settled: null }
  const replaySafe = Object.defineProperty((event) => {
    if (state.settled === null) {
      state.called = true
      state.settled = next(event).then((value) => ({ value }), (error) => ({ error }))
    }
    return state.settled.then((outcome) => {
      if ('error' in outcome) throw outcome.error
      return outcome.value
    })
  }, 'called', { get: () => state.called })
  try {
    return await entry.hook($, e, replaySafe)
  } catch {
    return entry.catch($, e, replaySafe)
  }
}

// The fake calls of $ the spawn path makes. The session's marker is the file that makes it Aether's.
function dollar({ id, root = PLUGIN, env = {}, runCode = 0 }) {
  const writes = []
  const $ = {
    session: { id: async () => id, version: async () => ({ version: '2.1.312' }) },
    plugin: { root, name: 'aether' },
    env: { get: async (name) => env[name] },
    clock: { now: async () => 1000 },
    fs: {
      exists: async (file) => file.endsWith(`/sessions/${id}.json`),
      list: async () => [],
      write: async (file, text) => { writes.push({ file, text }) },
    },
    process: { run: async () => ({ exitCode: runCode, stdout: '', stderr: '' }) },
  }
  return { $, writes }
}

// Fault records are written after the call returns: one turn of the event loop lets them land.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const faultsOf = (writes) => {
  const last = writes.filter((w) => w.file.includes('/observe/faults/')).pop()
  return last ? JSON.parse(last.text).faults : []
}

test('the spawn handler does not throw for an input it can read as unknown, in the plugin or in a copy of it (R1)', async () => {
  const table = await hooks()
  const events = [
    { prompt: 'Fix it.', subagentType: 'bonsai', model: 'bonsai', description: 'Fix it' },
    { prompt: 'Fix it.' },
    { prompt: 42, subagentType: 7, model: null, description: ['x'], workflow: 'run' },
    { prompt: undefined, subagentType: 'aether:ops', workflow: { runId: null, agentIndex: 3 } },
    { prompt: '=== aether-lane payload: /nope/../x ===', subagentType: 'aether:ops', workflow: null },
    { prompt: 'aether-wt merge', subagentType: 'aether:ops', workflow: {} },
  ]
  const answers = [{ model: 'bonsai', agentId: 'agent-1' }, { model: 'bonsai' }, { deny: 'refused' }, undefined, 'text', { agentId: 7, model: 'x' }]
  let n = 0
  for (const root of [PLUGIN, COPY]) {
    const env = root === PLUGIN ? { AETHER_DATA_DIR: '/data' } : { HOME: '/home/u' }
    for (const event of events) {
      for (const answer of answers) {
        n += 1
        const id = `s-unknown-${n}`
        const { $, writes } = dollar({ id, root, env })
        const out = await run(table['agent.spawn'], $, { ...SPAWN, ...event }, async () => answer)
        assert.deepEqual(out, answer)
        await settle()
        assert.deepEqual(faultsOf(writes), [], `${id} records no fault`)
      }
    }
  }
})

test('the spawn of a copy of the plugin is checked in the data directory of the copy (R11)', async () => {
  const table = await hooks()
  const { $, writes } = dollar({ id: 's-copy', root: COPY, env: { HOME: '/home/u' } })
  const out = await run(table['agent.spawn'], $, SPAWN, async () => ({ model: 'haiku', agentId: 'agent-7' }))
  assert.deepEqual(out, { model: 'haiku', agentId: 'agent-7' })
  await settle()
  assert.deepEqual(writes, [], 'the copy is an Aether session of its own data directory and writes nothing else')
})

test('an Agent spawn the engine refuses is recorded once as spawn-failed with the kind of its error, and the call fails once (R1)', async () => {
  const table = await hooks()
  const { $, writes } = dollar({ id: 's-refused', env: { AETHER_DATA_DIR: '/data' } })
  const error = new TypeError('the engine refused the model ZEBRA')
  let spawns = 0
  const next = async () => {
    spawns += 1
    throw error
  }
  await assert.rejects(run(table['agent.spawn'], $, SPAWN, next), (thrown) => thrown === error)
  assert.equal(spawns, 1, 'the engine is asked once: the catch replays nothing it already ran')
  await settle()
  assert.deepEqual(faultsOf(writes), [{ time: 1000, source: 'register.on-agent-spawn', class: 'spawn-failed', kind: 'TypeError' }])
  assert.equal(JSON.stringify(writes).includes('ZEBRA'), false)
})

test('a failure of the spawn handler before its next leaves handler-threw with no kind (R1)', async () => {
  const table = await hooks()
  const { $, writes } = dollar({ id: 's-own', env: { AETHER_DATA_DIR: '/data' } })
  // The session is checked as Aether first, as the hook does before any failure can come: the record needs that answer.
  await table['agent.spawn'].hook($, SPAWN, async () => ({ model: 'haiku', agentId: 'agent-1' }))
  let spawns = 0
  const next = Object.defineProperty(async () => {
    spawns += 1
    return { model: 'haiku', agentId: 'agent-2' }
  }, 'called', { value: false })
  assert.deepEqual(await table['agent.spawn'].catch($, SPAWN, next), { model: 'haiku', agentId: 'agent-2' })
  assert.equal(spawns, 1)
  await settle()
  assert.deepEqual(faultsOf(writes), [{ time: 1000, source: 'register.on-agent-spawn', class: 'handler-threw' }])
})

test('a delegate whose begin fails leaves handler-threw with the kind of the error, and the Agent call goes on as the Lead made it (R1)', async () => {
  const table = await hooks()
  const { $, writes } = dollar({ id: 's-begin', env: { AETHER_DATA_DIR: '/data' }, runCode: 1 })
  let seen = null
  const out = await run(table['tool.call'], $, AGENT_CALL, async (e) => {
    seen = e
    return { ok: true }
  })
  assert.deepEqual(seen, AGENT_CALL)
  assert.deepEqual(out, { ok: true })
  await settle()
  assert.deepEqual(faultsOf(writes), [{ time: 1000, source: 'delegate.begin', class: 'handler-threw', kind: 'Error' }])
})
