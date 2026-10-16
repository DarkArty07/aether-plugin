'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const HOOKS = path.join(__dirname, '..', 'plugins', 'aether', 'hooks')
let createRouter
test.before(async () => {
  ;({ createRouter } = await import(path.join(HOOKS, 'router.mjs')))
})

const CTX = { session: 's1', dataDir: '/data', root: '/plugin' }
const line = (value) => ({ exitCode: 0, stdout: `log line\n${JSON.stringify(value)}\n`, stderr: '' })
const EV = { subagent_type: 'general-purpose', description: 'Audit the API', prompt: 'Read src/ and report.', model: undefined, effort: undefined }

function make({ processes = [], complete = { isAnswered: true, text: '{"shape":1}' } } = {}) {
  const calls = { runs: [], writes: [], completes: [] }
  const queue = [...processes]
  const $ = {
    clock: { now: async () => 1000 },
    fs: { write: async (file, text) => { calls.writes.push({ file, text }) } },
    process: {
      run: async (argv, init) => {
        calls.runs.push({ argv, init })
        const answer = queue.shift()
        if (answer === undefined) throw new Error('no more process answers')
        if (answer instanceof Error) throw answer
        return answer
      },
    },
    model: {
      complete: async (request) => {
        calls.completes.push(request)
        if (complete instanceof Error) throw complete
        return complete
      },
    },
  }
  return { $, calls }
}
const recorder = () => { const seen = []; return { seen, next: async (event) => { seen.push(event); return { model: 'x', agentId: 'agent-1' } } } }
const PLAN = { id: 'r1', skip: false, args: null, notes: [], external: null }
const ASK = { id: 'r1', skip: false, ask: { transport: 'complete', model: 'haiku', effort: 'low', prompt: 'P', maxTokens: 600, timeoutMs: 3000 }, args: null, notes: [], external: null }

test('an aether agent is not routed, and nothing is run (R9)', async () => {
  const { $, calls } = make()
  const { seen, next } = recorder()
  await createRouter().toolCall($, { ...EV, subagent_type: 'aether:judge' }, next, CTX)
  assert.deepEqual(seen, [{ ...EV, subagent_type: 'aether:judge' }])
  assert.equal(calls.runs.length, 0)
  assert.equal(calls.writes.length, 0)
})

test('the router asks the model between begin and finish, rewrites model and effort, and tells the Lead', async () => {
  const { $, calls } = make({ processes: [line(ASK), line({ ...PLAN, args: { model: 'haiku', effort: 'high' }, notes: ['Aether router: this delegate runs on claude haiku at high.'] })] })
  const { seen, next } = recorder()
  const result = await createRouter().toolCall($, EV, next, CTX)
  assert.deepEqual(calls.completes, [{ model: 'haiku', effort: 'low', prompt: 'P', maxTokens: 600, timeoutMs: 3000 }])
  const [begin, finish] = calls.runs.map((r) => r.argv)
  assert.deepEqual(begin.slice(0, 5), ['node', '/plugin/bin/aether-route', 'begin', '--session', 's1'])
  assert.equal(begin[5], '--input')
  assert.ok(begin[6].startsWith('/data/router/in/'))
  assert.deepEqual(finish.slice(0, 4), ['node', '/plugin/bin/aether-route', 'finish', '--id'])
  assert.equal(finish[4], 'r1')
  assert.equal(finish[5], '--answer-file')
  const input = calls.writes.find((w) => w.file === begin[6])
  assert.deepEqual(JSON.parse(input.text), { subagent_type: 'general-purpose', description: 'Audit the API', prompt: 'Read src/ and report.' })
  assert.equal(calls.writes.find((w) => w.file === finish[6]).text, '{"shape":1}')
  assert.deepEqual(seen, [{ ...EV, model: 'haiku', effort: 'high' }])
  assert.deepEqual(result.context, ['Aether router: this delegate runs on claude haiku at high.'])
  assert.equal(result.agentId, 'agent-1')
})

test('in record mode the launch does not wait for the decider: the call goes on at once and the decision is made in the background (R7)', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const { $, calls } = make({ processes: [line({ ...ASK, background: true }), line(PLAN)] })
  $.model.complete = async (request) => { calls.completes.push(request); await gate; return { isAnswered: true, text: '{"shape":1}' } }
  const router = createRouter()
  const { seen, next } = recorder()
  const result = await router.toolCall($, EV, next, CTX)
  assert.deepEqual(seen, [EV], 'the call left as the Lead made it')
  assert.equal(result.agentId, 'agent-1')
  assert.equal(result.context, undefined)
  assert.equal(calls.runs.length, 1, 'only begin has run: finish waits for the model')
  release()
  await router.drain()
  assert.equal(calls.completes.length, 1)
  const finish = calls.runs[1].argv
  assert.deepEqual(finish.slice(2, 6), ['finish', '--id', 'r1', '--answer-file'])
  assert.equal(calls.writes.find((w) => w.file === finish[6]).text, '{"shape":1}')
})

test('in record mode with Jev the bin decides in the background, with the decide verb', async () => {
  const { $, calls } = make({ processes: [line({ ...PLAN, background: true, decide: true }), line(PLAN)] })
  const router = createRouter()
  const { seen, next } = recorder()
  await router.toolCall($, EV, next, CTX)
  assert.deepEqual(seen, [EV])
  await router.drain()
  assert.deepEqual(calls.runs[1].argv, ['node', '/plugin/bin/aether-route', 'decide', '--id', 'r1'])
  assert.equal(calls.completes.length, 0)
})

test('a background decision that fails never reaches the Lead or the launch (R25)', async () => {
  for (const second of [new Error('process refused'), { exitCode: 1, stdout: '', stderr: 'x' }]) {
    const { $ } = make({ processes: [line({ ...ASK, background: true }), second] })
    const router = createRouter()
    const { seen, next } = recorder()
    const result = await router.toolCall($, EV, next, CTX)
    await router.drain()
    assert.deepEqual(seen, [EV])
    assert.equal(result.context, undefined)
  }
  const { $ } = make({ complete: new Error('boom'), processes: [line({ ...ASK, background: true }), line(PLAN)] })
  const router = createRouter()
  await router.toolCall($, EV, recorder().next, CTX)
  await router.drain()
})

test('the processes get the time that the decider and the quota wait can take at their largest (10 s each, D11)', async () => {
  const jev = make({ processes: [line({ ...PLAN, args: { model: 'haiku', effort: 'high' }, notes: ['n'] })] })
  await createRouter().toolCall(jev.$, EV, recorder().next, CTX)
  assert.equal(jev.calls.runs[0].init.timeoutMs, 25000, 'begin of Jev in advise or command holds the decision and the quota wait: 10 s + 10 s + 5 s of margin')
  const haiku = make({ processes: [line(ASK), line(PLAN)] })
  await createRouter().toolCall(haiku.$, EV, recorder().next, CTX)
  assert.equal(haiku.calls.runs[1].init.timeoutMs, 15000, 'finish holds the quota wait: 10 s + 5 s')
  const background = make({ processes: [line({ ...PLAN, background: true, decide: true }), line(PLAN)] })
  const router = createRouter()
  await router.toolCall(background.$, EV, recorder().next, CTX)
  await router.drain()
  assert.equal(background.calls.runs[1].init.timeoutMs, 25000, 'decide of Jev holds the decision and the quota wait')
})

test('a model that does not answer is a failure the bin turns into the fallback', async () => {
  for (const [complete, code] of [[new Error('the call timed out'), 'timeout'], [{ isAnswered: false, reason: 'timeout' }, 'timeout'], [{ isAnswered: false, reason: 'refused' }, 'empty'], [new Error('boom'), 'empty']]) {
    const { $, calls } = make({ complete, processes: [line(ASK), line({ ...PLAN, args: { model: 'sonnet', effort: 'high' }, notes: ['Aether router: the decider failed.'] })] })
    const { seen, next } = recorder()
    await createRouter().toolCall($, EV, next, CTX)
    const finish = calls.runs[1].argv
    assert.deepEqual(finish.slice(2, 6), ['finish', '--id', 'r1', '--failure'], code)
    assert.equal(finish[6], code)
    assert.equal(seen[0].model, 'sonnet')
  }
})

test('any failure of the router leaves the call as the Lead made it (R25)', async () => {
  const cases = [
    [{ exitCode: 1, stdout: '', stderr: 'SyntaxError' }],
    [{ exitCode: 0, stdout: 'not json\n', stderr: '' }],
    [new Error('process refused')],
    [line({ id: null, skip: true, why: 'aether-agent', args: null, notes: [], external: null })],
    [line(ASK), { exitCode: 1, stdout: '', stderr: '' }],
  ]
  for (const processes of cases) {
    const { $ } = make({ processes })
    const { seen, next } = recorder()
    await createRouter().toolCall($, EV, next, CTX)
    assert.deepEqual(seen, [EV])
  }
})

test('with notes and no rewrite the Lead is told and the call is unchanged (advise)', async () => {
  const { $ } = make({ processes: [line({ ...PLAN, notes: ['Aether router: it would run on claude haiku at high.'] })] })
  const { seen, next } = recorder()
  const result = await createRouter().toolCall($, EV, next, CTX)
  assert.deepEqual(seen, [EV])
  assert.deepEqual(result.context, ['Aether router: it would run on claude haiku at high.'])
})

test('an external delegate is answered by the mod without a model request, and a failure leaves it to Claude (R18, R26)', async () => {
  const external = { id: 'r1', harness: 'grok', model: 'grok-4.7', effort: 'low', group: 'grok', timeoutMs: 570000, fallback: { model: 'haiku', effort: 'high' } }
  const router = createRouter()
  const { $, calls } = make({ processes: [line({ ...PLAN, args: { model: 'haiku', effort: 'high' }, notes: ['n'], external }), line({ ok: true, status: 'ok', text: 'The audit found 3 callers.' })] })
  const { next } = recorder()
  await router.toolCall($, EV, next, CTX)
  router.bind(EV, 'agent-7')
  let modelSteps = 0
  const step = router.step($, { agentId: 'agent-7', index: 0, turnId: 't1' }, async function* () { modelSteps++; return { answer: 'from model' } }, CTX)
  const yielded = []
  let finished
  for (;;) {
    const r = await step.next()
    if (r.done) { finished = r.value; break }
    yielded.push(r.value)
  }
  assert.deepEqual(calls.runs[1].argv, ['node', '/plugin/bin/aether-route', 'delegate', '--session', 's1', '--id', 'r1'])
  assert.equal(calls.runs[1].init.timeoutMs, 570000)
  assert.deepEqual(yielded, [{ kind: 'text', index: 0, text: 'The audit found 3 callers.' }, { kind: 'stop', stopReason: 'end_turn', usage: null }])
  assert.equal(finished.answer, 'The audit found 3 callers.')
  assert.equal(modelSteps, 0, 'the delegate made no model request')

  const router2 = createRouter()
  const failing = make({ processes: [line({ ...PLAN, args: { model: 'haiku', effort: 'high' }, notes: ['n'], external }), line({ ok: false, status: 'failed', text: '', detail: 'exit 1' })] })
  await router2.toolCall(failing.$, EV, recorder().next, CTX)
  router2.bind(EV, 'agent-8')
  let ran = 0
  const fallback = router2.step(failing.$, { agentId: 'agent-8', index: 0, turnId: 't2' }, async function* () { ran++; return { answer: 'from the Claude delegate' } }, CTX)
  const last = await fallback.next()
  assert.equal(last.done, true)
  assert.equal(last.value.answer, 'from the Claude delegate')
  assert.equal(ran, 1, 'the delegate runs in Claude at the rung the call already carries')
})

test('an agent that was not routed, or a later step, is left to the model', async () => {
  const router = createRouter()
  const { $, calls } = make()
  const step = router.step($, { agentId: 'other', index: 0, turnId: 't' }, async function* () { return { answer: 'model' } }, CTX)
  assert.equal((await step.next()).value.answer, 'model')
  assert.equal(calls.runs.length, 0)
})

test('register.js wires the router in the three hooks and keeps the meter and the ops', () => {
  const source = fs.readFileSync(path.join(HOOKS, 'register.js'), 'utf8')
  assert.ok(source.includes("import { createRouter } from './router.mjs'"))
  assert.ok(/on\('tool\.call', \{ tool: 'Agent' \}/.test(source))
  assert.ok(source.includes('router.bind('))
  assert.ok(source.includes('router.step('))
  assert.ok(source.includes("on('agent.offer'"))
  assert.ok(source.includes('parseOpsPrompt'))
  assert.ok(!/from '\.\.\/lib|require\(/.test(fs.readFileSync(path.join(HOOKS, 'router.mjs'), 'utf8')), 'the mod does not import lib/')
})
