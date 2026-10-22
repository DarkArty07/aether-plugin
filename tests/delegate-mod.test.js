'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const HOOKS = path.join(__dirname, '..', 'plugins', 'aether', 'hooks')
let createDelegates
test.before(async () => {
  ;({ createDelegates } = await import(path.join(HOOKS, 'delegate.mjs')))
})

const CTX = { session: 's1', dataDir: '/data', root: '/plugin' }
const out = (value) => ({ exitCode: 0, stdout: `log line\n${JSON.stringify(value)}\n`, stderr: '' })
const EV = { subagent_type: 'general-purpose', description: 'Fix it', prompt: 'AETHER-TASK: t1\nAETHER-OWNS: src/**\nFix it.', model: 'opus', effort: 'max' }
const PLAN = { id: 't1', skip: false, step: 'haiku', kind: 'first', attempt: 1, args: { model: 'haiku', effort: 'high' }, notes: ['Aether delegate task t1: step haiku, attempt 1'], external: null }
const EXTERNAL = { id: 't1', edits: true, timeoutMs: 570000, pin: null }

// `verbs` answers each verb (argv[2]) from a queue. Every `wait` that says { done: false } moves the clock 540 s.
function make(verbs) {
  const calls = { runs: [], writes: [] }
  const queues = Object.fromEntries(Object.entries(verbs).map(([verb, list]) => [verb, [...list]]))
  const state = { now: 1000 }
  const $ = {
    clock: { now: async () => state.now },
    fs: { write: async (file, text) => { calls.writes.push({ file, text }) } },
    process: {
      run: async (argv, init) => {
        calls.runs.push({ argv, init })
        const next = queues[argv[2]]?.shift()
        if (next === undefined) throw new Error(`no answer for ${argv[2]}`)
        if (next instanceof Error) throw next
        if (argv[2] === 'wait' && next.done === false) state.now += 540000
        return out(next)
      },
    },
  }
  return { $, calls, state }
}
const recorder = () => { const seen = []; return { seen, next: async (event) => (seen.push(event), { model: 'x', agentId: 'agent-1' }) } }
const collect = async (generator) => {
  const chunks = []
  let step = await generator.next()
  while (step.done !== true) { chunks.push(step.value); step = await generator.next() }
  return { chunks, result: step.value }
}

test('an aether agent is not touched and nothing runs', async () => {
  const { $, calls } = make({})
  const { seen, next } = recorder()
  await createDelegates().toolCall($, { ...EV, subagent_type: 'aether:judge' }, next, CTX)
  assert.deepEqual(seen, [{ ...EV, subagent_type: 'aether:judge' }])
  assert.equal(calls.runs.length + calls.writes.length, 0)
})

test('the plan decides the model and effort, whatever the Lead asked; its notes reach the Lead (C1, E2)', async () => {
  const { $, calls } = make({ begin: [PLAN] })
  const { seen, next } = recorder()
  const result = await createDelegates().toolCall($, EV, async (event) => (seen.push(event), { context: ['earlier'] }), CTX)
  assert.deepEqual([seen[0].model, seen[0].effort], ['haiku', 'high'])
  assert.deepEqual(result.context, ['earlier', PLAN.notes[0]])
  assert.deepEqual(calls.runs[0].argv.slice(0, 3), ['node', '/plugin/bin/aether-delegate', 'begin'])
  assert.ok(calls.writes[0].file.startsWith('/data/delegates/in/'))
  void next
})

test('a plan that rewrites the prompt (a correction on Claude) puts the new prompt on the call', async () => {
  const { $ } = make({ begin: [{ ...PLAN, args: { ...PLAN.args, prompt: 'Fix it.\n## Findings to fix\nsrc/a.js:3: empty case' } }] })
  const { seen, next } = recorder()
  await createDelegates().toolCall($, EV, next, CTX)
  assert.ok(seen[0].prompt.includes('## Findings to fix'))
})

test('the isolation of the plan lands on the call when the task edits (R13)', async () => {
  const { $ } = make({ begin: [{ ...PLAN, args: { ...PLAN.args, isolation: 'worktree' } }] })
  const { seen, next } = recorder()
  await createDelegates().toolCall($, EV, next, CTX)
  assert.equal(seen[0].isolation, 'worktree')
})

test('a failing or skipped begin leaves the call as the Lead made it', async () => {
  for (const verbs of [{ begin: [new Error('boom')] }, { begin: [{ id: null, skip: true, args: null, notes: [], external: null }] }]) {
    const { $ } = make(verbs)
    const { seen, next } = recorder()
    await createDelegates().toolCall($, EV, next, CTX)
    assert.deepEqual(seen, [EV])
  }
})

test('an external delegate is the first step of its agent: started, waited for, and answered with no model request (C9, E10)', async () => {
  const { $, calls, state } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: false }, { done: false }, { done: true, ok: true, status: 'ok', text: 'branch aether/r/task-1' }] })
  const delegates = createDelegates()
  const { next } = recorder()
  await delegates.toolCall($, EV, next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  assert.equal(delegates.has('agent-1'), true)
  let asked = 0
  const generator = delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, async function* () { asked += 1; return {} }, CTX)
  // The generator is driven by hand: a step that waited for the delegate and only then yielded its beats would pass a
  // test that collects every chunk first, and the engine kills a step that emits nothing for 600 s (Task 17).
  const runs = () => calls.runs.map((r) => r.argv[2])
  const first = await generator.next()
  assert.deepEqual(first.value, { kind: 'text', index: 0, text: '[Aether: the delegate is still working, 9 min so far]\n' })
  assert.deepEqual(runs(), ['begin', 'start', 'wait'], 'the first beat comes before the second wait')
  const second = await generator.next()
  assert.deepEqual(second.value, { kind: 'text', index: 0, text: '[Aether: the delegate is still working, 18 min so far]\n' })
  assert.deepEqual(runs(), ['begin', 'start', 'wait', 'wait'], 'the second beat comes before the third wait')
  const answer = await generator.next()
  assert.deepEqual(answer.value, { kind: 'text', index: 0, text: 'branch aether/r/task-1' })
  const stop = await generator.next()
  assert.deepEqual(stop.value, { kind: 'stop', stopReason: 'end_turn', usage: null })
  const end = await generator.next()
  assert.equal(end.done, true)
  assert.equal(end.value.answer, 'branch aether/r/task-1', 'the answer of the agent has no beats')
  assert.equal(asked, 0, 'no model request')
  assert.deepEqual(runs(), ['begin', 'start', 'wait', 'wait', 'wait'])
  assert.ok(state.now - 1000 > 600000, 'the simulated delegate took more than 10 minutes')
  for (const run of calls.runs) assert.ok(run.init.timeoutMs < 600000)
})

test('a failed wait gives a beat before its retry (the engine kills a step that emits nothing for 600 s)', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [new Error('hung'), { done: true, ok: true, status: 'ok', text: 'branch aether/r/task-1' }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  const generator = delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, async function* () { return {} }, CTX)
  const first = await generator.next()
  assert.equal(first.value.kind, 'text')
  assert.equal(first.value.text, '[Aether: the delegate is still working, 0 min so far]\n', 'the clock of the test moves only on a wait that answers { done: false }')
  assert.deepEqual(calls.runs.map((r) => r.argv[2]), ['begin', 'start', 'wait'], 'the beat comes before the retry')
  assert.equal((await generator.next()).value.text, 'branch aether/r/task-1')
})

test('an external delegate that does not deliver is left to the model, at the model of the plan (R14)', async () => {
  const { $ } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: false, status: 'no-candidate', text: null }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, async function* () { asked += 1; return { answer: 'from the model' } }, CTX))
  assert.equal(asked, 1)
})

test('an external delegate that fails after beats shows the beats and then the answer of the model (R14)', async () => {
  const { $ } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: false }, { done: true, ok: false, status: 'no-candidate', text: null }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  const model = async function* () { asked += 1; yield { kind: 'text', index: 0, text: 'from the model' }; return { answer: 'from the model' } }
  const { chunks, result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.equal(asked, 1)
  assert.deepEqual(chunks, [
    { kind: 'text', index: 0, text: '[Aether: the delegate is still working, 9 min so far]\n' },
    { kind: 'text', index: 0, text: 'from the model' },
  ])
  assert.equal(result.answer, 'from the model')
})

test('a read-only delegate on Claude goes through the model untouched, and its last answer is recorded with no model request of the mod (R6)', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, answerOf: { task: 't1', attempt: 1 } }], answer: [{ recorded: true }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  assert.equal(delegates.has('agent-1'), true)
  let asked = 0
  const step = (index, result) => collect(delegates.step($, { index, agentId: 'agent-1', turnId: 't' }, async function* () { asked += 1; return result }, CTX))
  const tool = await step(0, { answer: '', stopReason: 'tool_use' })
  assert.equal(tool.result.stopReason, 'tool_use')
  assert.deepEqual(calls.runs.map((r) => r.argv[2]), ['begin'], 'a step that calls a tool records nothing')
  const last = await step(1, { answer: 'found it', stopReason: 'end_turn' })
  assert.equal(last.result.answer, 'found it')
  assert.equal(asked, 2, 'every step still goes to the model')
  const run = calls.runs.at(-1)
  assert.deepEqual(run.argv.slice(2, 4), ['answer', '--session'])
  assert.deepEqual(run.argv.slice(run.argv.indexOf('--task')), ['--task', 't1', '--attempt', '1', '--text', 'found it'])
  assert.ok(run.init.timeoutMs <= 15000)
})

test('a failing answer record never breaks the step of a read-only delegate on Claude', async () => {
  const { $ } = make({ begin: [{ ...PLAN, answerOf: { task: 't1', attempt: 1 } }], answer: [new Error('boom')] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  const { result } = await collect(delegates.step($, { index: 3, agentId: 'agent-1', turnId: 't' }, async function* () { return { answer: 'found it', stopReason: 'end_turn' } }, CTX))
  assert.equal(result.answer, 'found it')
})

test('a later step of the same agent is never taken over', async () => {
  const { $ } = make({ begin: [{ ...PLAN, external: EXTERNAL }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  await collect(delegates.step($, { index: 1, agentId: 'agent-1', turnId: 't' }, async function* () { asked += 1; return {} }, CTX))
  assert.equal(asked, 1)
})
