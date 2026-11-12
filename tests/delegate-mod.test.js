'use strict'

const log = require('../plugins/aether/lib/delegate-log.js')
const { unverdictedDelegates } = require('../plugins/aether/lib/delegate-report.js')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo, tempDir, PLUGIN, NO_LANES_CONFIG } = require('./helpers.js')

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
// One step of the model as the engine streams it: the text of its answer in block 0, then the stop that ends its response.
async function* streamed({ answer, stopReason }) {
  if (answer !== '') yield { kind: 'text', index: 0, text: answer }
  yield { kind: 'stop', stopReason, usage: null }
  return { turnId: 't', index: 0, answer, toolUses: [], stopReason, usage: null }
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
  // The files of a delegate are keyed by session and id (issue 148): the mod hands its session to start and to every wait.
  const startArgv = calls.runs[1].argv
  assert.deepEqual(startArgv.slice(startArgv.indexOf('--session')), ['--session', CTX.session])
  assert.ok(calls.runs.slice(2).every((run) => run.argv.includes('--session') && run.argv.includes(CTX.session)), 'every wait carries the session')
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

const READ_ONLY_EXTERNAL = { ...EXTERNAL, edits: false }
const answersOf = (calls) => calls.runs.filter((r) => r.argv[2] === 'answer')
// The line a rescued route puts on its answer, for a plan with no pair and an end with no reason (PLAN's args are haiku high).
const LINE = (detail) => `Aether: the external attempt did not deliver (${detail}); this task ran on Claude haiku high instead.`

test('a read-only external delegate that does not deliver is answered by the model: its answer is recorded for the attempt (R6, issue 83)', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, external: READ_ONLY_EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: false, status: 'quota', text: null }], answer: [{ recorded: true }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  const model = () => { asked += 1; return streamed({ answer: 'from the model', stopReason: 'end_turn' }) }
  const { chunks, result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.equal(asked, 1)
  assert.deepEqual(chunks, [
    { kind: 'text', index: 0, text: 'from the model' },
    { kind: 'text', index: 1, text: LINE('quota') },
    { kind: 'stop', stopReason: 'end_turn', usage: null },
  ], 'the line is a text chunk of its own, before the stop')
  assert.equal(result.answer, `from the model\n\n${LINE('quota')}`)
  const recorded = answersOf(calls)
  assert.equal(recorded.length, 1, 'the answer of the attempt is recorded once')
  assert.deepEqual(recorded[0].argv.slice(recorded[0].argv.indexOf('--task')), ['--task', 't1', '--attempt', '1', '--text', 'from the model'])
})

test('the rescue of a read-only external delegate records its answer once, at the last step, not at the first', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, external: READ_ONLY_EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: false, status: 'quota', text: null }], answer: [{ recorded: true }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  const replies = [{ answer: '', stopReason: 'tool_use' }, { answer: 'found it', stopReason: 'end_turn' }]
  const model = () => streamed(replies.shift())
  const first = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.equal(first.result.stopReason, 'tool_use')
  assert.deepEqual(first.chunks, [{ kind: 'stop', stopReason: 'tool_use', usage: null }], 'a step that calls a tool yields no line')
  assert.equal(answersOf(calls).length, 0, 'a step that calls a tool records nothing')
  const second = await collect(delegates.step($, { index: 1, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.deepEqual(second.chunks, [
    { kind: 'text', index: 0, text: 'found it' },
    { kind: 'text', index: 1, text: LINE('quota') },
    { kind: 'stop', stopReason: 'end_turn', usage: null },
  ], 'the line is yielded once, before the stop of the step that ends the turn')
  assert.equal(second.result.answer, `found it\n\n${LINE('quota')}`)
  const recorded = answersOf(calls)
  assert.equal(recorded.length, 1)
  assert.deepEqual(recorded[0].argv.slice(recorded[0].argv.indexOf('--task')), ['--task', 't1', '--attempt', '1', '--text', 'found it'])
})

test('a read-only external delegate that delivers records no answer: the agent ends at its first step', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, external: READ_ONLY_EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: true, status: 'ok', text: 'branch aether/r/task-1' }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  const model = async function* () { asked += 1; return { answer: 'from the model', stopReason: 'end_turn' } }
  const { result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.equal(result.answer, 'branch aether/r/task-1')
  assert.equal(asked, 0, 'no model request')
  assert.equal(answersOf(calls).length, 0, 'the delegate delivered: nothing to answer')
})

test('the rescue of an editing external delegate records the end of its attempt once, at its last step (spec 031, C1)', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: false, status: 'off', text: null }], answer: [{ recorded: true }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  const model = () => streamed({ answer: 'done, in the worktree', stopReason: 'end_turn' })
  const { chunks, result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.deepEqual(chunks, [
    { kind: 'text', index: 0, text: 'done, in the worktree' },
    { kind: 'text', index: 1, text: LINE('off') },
    { kind: 'stop', stopReason: 'end_turn', usage: null },
  ])
  assert.equal(result.answer, `done, in the worktree\n\n${LINE('off')}`)
  const recorded = answersOf(calls)
  assert.equal(recorded.length, 1)
  assert.deepEqual(recorded[0].argv.slice(recorded[0].argv.indexOf('--task')), ['--task', 't1', '--attempt', '1', '--text', 'done, in the worktree'])
})

test('an editing external delegate that delivers records no end: its result line is the arrival (spec 031, C1)', async () => {
  const { $, calls } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: true, status: 'ok', text: 'branch aether/r/task-1' }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  const model = async function* () { asked += 1; return { answer: 'from the model', stopReason: 'end_turn' } }
  const { result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.equal(result.answer, 'branch aether/r/task-1')
  assert.equal(asked, 0)
  assert.equal(answersOf(calls).length, 0)
})

test('an external delegate that fails after beats shows the beats and then the answer of the model (R14)', async () => {
  const { $ } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: false }, { done: true, ok: false, status: 'no-candidate', text: null }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  let asked = 0
  const model = () => { asked += 1; return streamed({ answer: 'from the model', stopReason: 'end_turn' }) }
  const { chunks, result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, model, CTX))
  assert.equal(asked, 1)
  assert.deepEqual(chunks, [
    { kind: 'text', index: 0, text: '[Aether: the delegate is still working, 9 min so far]\n' },
    { kind: 'text', index: 0, text: 'from the model' },
    { kind: 'text', index: 1, text: LINE('no-candidate') },
    { kind: 'stop', stopReason: 'end_turn', usage: null },
  ])
  assert.equal(result.answer, `from the model\n\n${LINE('no-candidate')}`)
})

test('a rescue line after a heartbeat takes the block after it, when the model writes no text', async () => {
  const { $ } = make({ begin: [{ ...PLAN, external: EXTERNAL }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: false }, { done: true, ok: false, status: 'off', text: null }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  const { chunks, result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, () => streamed({ answer: '', stopReason: 'end_turn' }), CTX))
  assert.deepEqual(chunks, [
    { kind: 'text', index: 0, text: '[Aether: the delegate is still working, 9 min so far]\n' },
    { kind: 'text', index: 1, text: LINE('off') },
    { kind: 'stop', stopReason: 'end_turn', usage: null },
  ], 'the heartbeat is block 0, so the line is block 1')
  assert.equal(result.answer, LINE('off'))
})

test('the rescue line names the pair the plan holds in plan.external.pair, not a step note (#240)', async () => {
  const pair = { harness: 'muse', model: 'muse-2', effort: 'high' }
  const { $ } = make({ begin: [{ ...PLAN, external: { ...EXTERNAL, pair } }], start: [{ started: true, id: 't1', pid: 1 }], wait: [{ done: true, ok: false, status: 'off', reason: 'quota gone', text: null }] })
  const delegates = createDelegates()
  await delegates.toolCall($, EV, recorder().next, CTX)
  delegates.bind($, { ...EV, model: 'haiku', effort: 'high' }, 'agent-1', CTX)
  const { result } = await collect(delegates.step($, { index: 0, agentId: 'agent-1', turnId: 't' }, () => streamed({ answer: 'from the model', stopReason: 'end_turn' }), CTX))
  assert.equal(result.answer, 'from the model\n\nAether: the external attempt on muse muse-2 high did not deliver (off: quota gone); this task ran on Claude haiku high instead.')
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

test('the whole delegation cycle with the real aether-delegate: begin on haiku-high, approve refused, fix rises to haiku-xhigh, then sonnet-high, approve (R13)', async (t) => {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-e2e-deleg-')
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true })
  fs.writeFileSync(
    path.join(dataDir, 'sessions', 's-e2e.delegate.json'),
    JSON.stringify({ lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }),
  )
  const env = { ...process.env, AETHER_DATA_DIR: dataDir, AETHER_LANES_CONFIG: NO_LANES_CONFIG }
  const ctx = { session: 's-e2e', dataDir, root: PLUGIN }
  const $ = {
    clock: { now: async () => Date.now() },
    fs: { write: async (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8') } },
    process: {
      run: async (argv, init = {}) => {
        const r = spawnSync(argv[0], argv.slice(1), { cwd: (init && init.cwd) || repo.dir, env, encoding: 'utf8', timeout: (init && init.timeoutMs) || 30000 })
        return { exitCode: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
      },
    },
  }
  const verdict = (...args) => {
    const r = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-delegate'), 'verdict', '--session', 's-e2e', '--task', 't-e2e', ...args], { cwd: repo.dir, env, encoding: 'utf8' })
    return JSON.parse(r.stdout.trim().split('\n').pop())
  }
  const brief = 'AETHER-TASK: t-e2e\nAETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\nImplement src/a.js.'
  const delegates = createDelegates()
  const seen = []
  const launch = (extra = {}) => delegates.toolCall($, { subagent_type: 'general-purpose', description: 'e2e', prompt: brief, ...extra }, async (event) => (seen.push(event), {}), ctx)

  await launch({ model: 'opus', effort: 'max' })
  assert.deepEqual([seen[0].model, seen[0].effort], ['haiku', 'high'])

  const refused = verdict('--verdict', 'approve', '--worktree', repo.dir)
  assert.equal(refused.ok, false, 'an approve with no edited file is refused')

  const finding = 'src/a.js:1: missing module.exports'
  const first = verdict('--verdict', 'fix', '--finding', finding)
  assert.deepEqual([first.ok, first.next.kind, first.next.step, first.next.cause], [true, 'rise', 'haiku-xhigh', 'failed'])
  await launch()
  assert.deepEqual([seen[1].model, seen[1].effort], ['haiku', 'xhigh'])
  assert.match(seen[1].prompt, /## Findings to fix/)

  const second = verdict('--verdict', 'fix', '--finding', finding)
  assert.deepEqual([second.ok, second.next.kind, second.next.step, second.next.cause], [true, 'rise', 'sonnet-high', 'failed'])
  await launch()
  assert.deepEqual([seen[2].model, seen[2].effort], ['sonnet', 'high'])

  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'module.exports = 1\n')
  const approved = verdict('--verdict', 'approve', '--worktree', repo.dir)
  assert.equal(approved.ok, true, JSON.stringify(approved))
})

test('an editing delegate on Claude leaves an ended line when its agent ends, and the real verdict still checks its worktree (spec 031, C1)', async (t) => {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-e2e-ended-')
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'sessions', 's-end.delegate.json'), JSON.stringify({ lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }))
  const env = { ...process.env, AETHER_DATA_DIR: dataDir, AETHER_LANES_CONFIG: NO_LANES_CONFIG }
  const ctx = { session: 's-end', dataDir, root: PLUGIN }
  const $ = {
    clock: { now: async () => Date.now() },
    fs: { write: async (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8') } },
    process: {
      run: async (argv, init = {}) => {
        const r = spawnSync(argv[0], argv.slice(1), { cwd: (init && init.cwd) || repo.dir, env, encoding: 'utf8', timeout: (init && init.timeoutMs) || 30000 })
        return { exitCode: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' }
      },
    },
  }
  const brief = 'AETHER-TASK: t-end\nAETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\nImplement src/a.js.'
  const delegates = createDelegates()
  const seen = []
  await delegates.toolCall($, { subagent_type: 'general-purpose', description: 'end', prompt: brief }, async (event) => (seen.push(event), {}), ctx)
  delegates.bind($, seen[0], 'agent-end', ctx)
  assert.equal(delegates.has('agent-end'), true, 'the mod routes an attempt that edits on Claude')
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's-end' }), [], 'while the agent runs, nothing has arrived')

  const model = async function* () { return { answer: 'done, in the worktree', stopReason: 'end_turn' } }
  await collect(delegates.step($, { index: 0, agentId: 'agent-end', turnId: 't' }, model, ctx))
  const written = log.readEntries(dataDir, { task: 't-end' }).filter((e) => e.kind !== 'launch')
  assert.deepEqual(written.map((e) => [e.kind, e.attempt, e.session, Object.hasOwn(e, 'text')]), [['ended', 1, 's-end', false]])
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's-end' }), [{ task: 't-end', session: 's-end', attempt: 1, step: 'haiku-high' }])

  fs.mkdirSync(path.join(repo.dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'module.exports = 1\n')
  const judged = spawnSync(process.execPath, [path.join(PLUGIN, 'bin', 'aether-delegate'), 'verdict', '--session', 's-end', '--task', 't-end', '--verdict', 'approve', '--worktree', repo.dir], { cwd: repo.dir, env, encoding: 'utf8' })
  const approved = JSON.parse(judged.stdout.trim().split('\n').pop())
  assert.equal(approved.ok, true, JSON.stringify(approved))
  assert.deepEqual(unverdictedDelegates({ dataDir, session: 's-end' }), [])
})
