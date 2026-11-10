import { expect, mock, test } from 'claude-code/testing'

// Tests for the delegate ladder in the mod: register.js hands the Lead's Agent calls to
// delegate.mjs, which asks bin/aether-delegate for the plan and runs the delegate's steps
// itself when it runs on another harness. The bin is answered from a queue here (the whole
// cycle against the real bin is in tests/delegate-mod.test.js); what these tests drive is
// the engine: tool.call, agent.spawn and turn.step. Run them with `claude plugin test plugins/aether`.

type Run = { argv: string[]; init: Record<string, unknown> }
type Write = { path: string; text: string }

const PLAN = { id: 't1', skip: false, step: 'haiku', kind: 'first', attempt: 1, args: { model: 'haiku', effort: 'high' }, notes: ['Aether delegate task t1: step haiku, attempt 1'], external: null }
const EXTERNAL = { id: 't1', edits: true, timeoutMs: 570000, pin: null }

// Answers what the mod asks Claude Code for. `verbs` answers each verb of aether-delegate
// (argv[2]) from a queue; every `wait` that says { done: false } moves the clock 540 s.
// The brake's calls to aether-autonomy fail, which leaves the brake inert (its own tests
// cover it). `replies` answers each step that reaches the model.
function stubs(on, { marked = true, verbs = {} as Record<string, unknown[]>, replies = [] as Record<string, unknown>[] } = {}) {
  const runs: Run[] = []
  const writes: Write[] = []
  const toolCalls: any[] = []
  const counts = { modelSteps: 0 }
  let agents = 0
  const clock = mock.clock(on, { now: 1000 })
  mock.env(on, { HOME: '/home/u', AETHER_DATA_DIR: '/home/u/aether-data' })
  on('session.id', () => ({ value: 's1' }))
  on('session.version', () => ({ value: { version: '2.1.296', base: '2.1.296', builtAt: '2026-10-09T00:00:00Z' } }))
  on('fs.list', () => ({ value: [] }))
  on('fs.exists', ($, e) => ({ value: marked && e.path.endsWith('/sessions/s1.json') }))
  on('fs.write', ($, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('agent.spawn', () => {
    agents += 1
    return { model: 'claude-haiku-5-5', agentId: `agent-${agents}` }
  })
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* ($, e) {
    counts.modelSteps++
    const reply = replies.length > 0 ? replies.shift()! : { answer: 'from the model', stopReason: 'end_turn' }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null, ...reply }
  })
  on('process.run', async ($, e) => {
    if (e.argv[2] === 'brake-settings' || e.argv[2] === 'brake-crossing') return { value: { exitCode: 1, stdout: '', stderr: '' } }
    runs.push({ argv: [...e.argv], init: { ...(e.init || {}) } })
    const queue = (verbs[e.argv[2]] ??= [])
    const next = queue.shift()
    if (next === undefined) throw new Error(`no answer for ${e.argv[2]}`)
    if (next instanceof Error) throw next
    if (e.argv[2] === 'wait' && (next as any).done === false) await clock.advance(540000)
    return { value: { exitCode: 0, stdout: `log line\n${JSON.stringify(next)}\n`, stderr: '' } }
  })
  on('tool.call', ($, e) => {
    toolCalls.push({ ...e })
    return { result: { context: ['earlier'] } }
  })
  return { runs, writes, toolCalls, counts }
}

const call = ($, prompt: string, extra = {}) =>
  ($.tool as any).call({ tool: 'Agent', subagent_type: 'general-purpose', description: 'task', prompt, model: 'opus', effort: 'max', ...extra })

const spawn = ($, prompt: string) =>
  $.agent.spawn({ tool_use_id: 'tu1', prompt, description: 'task', subagentType: 'general-purpose', model: 'haiku', background: false, fork: false })

// One step of the agent, read to the end: the chunks it yielded and its result.
async function collect(stream: any) {
  const chunks: any[] = []
  let s = await stream.next()
  while (s.done !== true) {
    chunks.push(s.value)
    s = await stream.next()
  }
  return { chunks, result: s.value }
}

const step = ($, fields: Record<string, unknown>) =>
  collect($.turn.step({ turnId: 't', model: 'claude-haiku-5-5', messageCount: 7, ...fields }))

test('an Agent call the Lead made is rewritten with the plan model and effort, and its notes reach the Lead as context', async ($, on) => {
  const { runs, writes, toolCalls } = stubs(on, { verbs: { begin: [PLAN] } })
  const prompt = 'AETHER-TASK: t1\nAETHER-OWNS: src/**\nFix it.'
  const out = await call($, prompt)
  expect(toolCalls.length).toBe(1)
  expect(toolCalls[0].subagent_type).toBe('general-purpose')
  expect(toolCalls[0].prompt).toBe(prompt)
  expect([toolCalls[0].model, toolCalls[0].effort]).toEqual(['haiku', 'high'])
  expect(out.result).toEqual({ context: ['earlier'] })
  expect(out.context).toEqual([PLAN.notes[0]])
  expect(runs[0].argv.slice(0, 3)).toEqual(['node', runs[0].argv[1], 'begin'])
  expect(runs[0].argv[1].endsWith('/bin/aether-delegate')).toBe(true)
  expect(writes[0].path.startsWith('/home/u/aether-data/delegates/in/')).toBe(true)
})

test('an aether:judge call is not touched and process.run is not invoked', async ($, on) => {
  const { runs, writes, toolCalls } = stubs(on)
  const event = { tool: 'Agent', subagent_type: 'aether:judge', description: 'judge it', prompt: 'Judge this.', model: 'opus', effort: 'max' }
  const out = await ($.tool as any).call(event)
  expect({ ...toolCalls[0], tool_use_id: undefined }).toEqual({ ...event, tool_use_id: undefined })
  expect(out.result).toEqual({ context: ['earlier'] })
  expect(runs).toEqual([])
  expect(writes).toEqual([])
})

test('an external delegate runs its first step with start and wait, and ends with no model request', async ($, on) => {
  const { runs, toolCalls, counts } = stubs(on, {
    verbs: {
      begin: [{ ...PLAN, external: EXTERNAL }],
      start: [{ started: true, id: 't1', pid: 1 }],
      wait: [{ done: false }, { done: false }, { done: true, ok: true, status: 'ok', text: 'branch aether/r/task-1' }],
    },
  })
  await call($, 'AETHER-TASK: t1\nDo it on another harness.')
  const spawned = await spawn($, toolCalls[0].prompt)
  const agentId = spawned.agentId
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-haiku-5-5', messageCount: 7, agentId })
  const verbs = () => runs.map((r) => r.argv[2])
  const first = await stream.next()
  expect(first.value).toEqual({ kind: 'text', index: 0, text: '[Aether: the delegate is still working, 9 min so far]\n' })
  expect(verbs()).toEqual(['begin', 'start', 'wait'])
  const startArgv = runs[1].argv
  expect(startArgv.slice(startArgv.indexOf('--session'))).toEqual(['--session', 's1'])
  const second = await stream.next()
  expect(second.value).toEqual({ kind: 'text', index: 0, text: '[Aether: the delegate is still working, 18 min so far]\n' })
  expect(verbs()).toEqual(['begin', 'start', 'wait', 'wait'])
  expect(runs.slice(2).every((run) => run.argv.includes('--session') && run.argv.includes('s1'))).toBe(true)
  const answer = await stream.next()
  expect(answer.value).toEqual({ kind: 'text', index: 0, text: 'branch aether/r/task-1' })
  const stop = await stream.next()
  expect(stop.value).toEqual({ kind: 'stop', stopReason: 'end_turn', usage: null })
  const end = await stream.next()
  expect(end.done).toBe(true)
  expect(end.value.answer).toBe('branch aether/r/task-1')
  expect(counts.modelSteps).toBe(0)
  expect(verbs()).toEqual(['begin', 'start', 'wait', 'wait', 'wait'])
  for (const run of runs) expect(run.init.timeoutMs).toBeLessThan(600000)
})

test('a read-only delegate on Claude goes through the model, and its last answer is recorded with answer', async ($, on) => {
  const { runs, toolCalls, counts } = stubs(on, {
    verbs: { begin: [{ ...PLAN, answerOf: { task: 't1', attempt: 1 } }], answer: [{ recorded: true }] },
    replies: [
      { answer: '', stopReason: 'tool_use' },
      { answer: 'found it', stopReason: 'end_turn' },
    ],
  })
  await call($, 'AETHER-TASK: t1\nAnswer this.')
  const spawned = await spawn($, toolCalls[0].prompt)
  const agentId = spawned.agentId
  const answered = () => runs.filter((r) => r.argv[2] === 'answer')
  const first = await step($, { index: 0, agentId })
  expect(first.result.stopReason).toBe('tool_use')
  expect(answered().length).toBe(0)
  const last = await step($, { index: 1, agentId })
  expect(last.result.answer).toBe('found it')
  expect(counts.modelSteps).toBe(2)
  expect(answered().length).toBe(1)
  const run = answered()[0]
  expect(run.argv.slice(2, 4)).toEqual(['answer', '--session'])
  expect(run.argv.slice(run.argv.indexOf('--task'))).toEqual(['--task', 't1', '--attempt', '1', '--text', 'found it'])
  expect(run.init.timeoutMs).toBeLessThanOrEqual(15000)
})

test('a begin that fails leaves the call as the Lead made it', async ($, on) => {
  const { runs, toolCalls } = stubs(on, { verbs: { begin: [new Error('boom')] } })
  const out = await call($, 'AETHER-TASK: t1\nFix it.')
  expect([toolCalls[0].model, toolCalls[0].effort]).toEqual(['opus', 'max'])
  expect(out.result).toEqual({ context: ['earlier'] })
  expect(runs.map((r) => r.argv[2])).toEqual(['begin'])
})

test('the rescue of an editing external delegate records the end of its attempt with answer', async ($, on) => {
  const { runs, toolCalls, counts } = stubs(on, {
    verbs: {
      begin: [{ ...PLAN, external: EXTERNAL }],
      start: [{ started: true, id: 't1', pid: 1 }],
      wait: [{ done: true, ok: false, status: 'off', text: null }],
      answer: [{ recorded: true }],
    },
  })
  await call($, 'AETHER-TASK: t1\nAETHER-OWNS: src/**\nDo it.')
  const spawned = await spawn($, toolCalls[0].prompt)
  const rescued = await step($, { index: 0, agentId: spawned.agentId })
  expect(rescued.result.answer).toBe('from the model')
  expect(counts.modelSteps).toBe(1)
  const answered = runs.filter((r) => r.argv[2] === 'answer')
  expect(answered.length).toBe(1)
  expect(answered[0].argv.slice(answered[0].argv.indexOf('--task'))).toEqual(['--task', 't1', '--attempt', '1', '--text', 'from the model'])
  expect(answered[0].init.timeoutMs).toBeLessThanOrEqual(15000)
})
