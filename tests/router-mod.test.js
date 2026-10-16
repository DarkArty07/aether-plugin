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

// `processes` answers the runs in the order they come; `verbs` answers each by its verb (argv[2]), for runs that race.
function make({ processes = [], verbs = null, complete = { isAnswered: true, text: '{"shape":1}' } } = {}) {
  const calls = { runs: [], writes: [], completes: [] }
  const queue = [...processes]
  const $ = {
    clock: { now: async () => 1000 },
    fs: { write: async (file, text) => { calls.writes.push({ file, text }) } },
    process: {
      run: async (argv, init) => {
        calls.runs.push({ argv, init })
        if (verbs) {
          if (!Object.hasOwn(verbs, argv[2])) throw new Error(`no answer for ${argv[2]}`)
          if (verbs[argv[2]] instanceof Error) throw verbs[argv[2]]
          return verbs[argv[2]]
        }
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

const SPAWNED = (agentId, id = 'r1') => line({ spawned: true, id, agentId })
const spawnArgv = (agentId, id = 'r1') => ['node', '/plugin/bin/aether-route', 'spawn', '--session', 's1', '--id', id, '--agent', agentId]
const verbsRun = (calls) => calls.runs.map((r) => r.argv[2])

test('an external delegate is linked to its agent, then answered by the mod without a model request, and a failure leaves it to Claude (R18, R26)', async () => {
  const external = { id: 'r1', harness: 'grok', model: 'grok-4.7', effort: 'low', group: 'grok', timeoutMs: 570000, fallback: { model: 'haiku', effort: 'high' } }
  const router = createRouter()
  const { $, calls } = make({ verbs: { begin: line({ ...PLAN, args: { model: 'haiku', effort: 'high' }, notes: ['n'], external }), spawn: SPAWNED('agent-7'), delegate: line({ ok: true, status: 'ok', text: 'The audit found 3 callers.' }) } })
  const { next } = recorder()
  await router.toolCall($, EV, next, CTX)
  router.bind($, EV, 'agent-7', CTX)
  assert.equal(router.has('agent-7'), true)
  let modelSteps = 0
  const step = router.step($, { agentId: 'agent-7', index: 0, turnId: 't1' }, async function* () { modelSteps++; return { answer: 'from model' } }, CTX)
  const yielded = []
  let finished
  for (;;) {
    const r = await step.next()
    if (r.done) { finished = r.value; break }
    yielded.push(r.value)
  }
  await router.drain()
  assert.deepEqual(verbsRun(calls).sort(), ['begin', 'delegate', 'spawn'], 'the spawn verb and the delegate each ran once')
  assert.deepEqual(calls.runs.find((r) => r.argv[2] === 'spawn').argv, spawnArgv('agent-7'))
  const delegate = calls.runs.find((r) => r.argv[2] === 'delegate')
  assert.deepEqual(delegate.argv, ['node', '/plugin/bin/aether-route', 'delegate', '--session', 's1', '--id', 'r1'])
  assert.equal(delegate.init.timeoutMs, 570000)
  assert.deepEqual(yielded, [{ kind: 'text', index: 0, text: 'The audit found 3 callers.' }, { kind: 'stop', stopReason: 'end_turn', usage: null }])
  assert.equal(finished.answer, 'The audit found 3 callers.')
  assert.equal(modelSteps, 0, 'the delegate made no model request')
  assert.equal(router.has('agent-7'), false, 'the delegate runs once')

  const router2 = createRouter()
  const failing = make({ verbs: { begin: line({ ...PLAN, args: { model: 'haiku', effort: 'high' }, notes: ['n'], external }), spawn: SPAWNED('agent-8'), delegate: line({ ok: false, status: 'failed', text: '', detail: 'exit 1' }) } })
  await router2.toolCall(failing.$, EV, recorder().next, CTX)
  router2.bind(failing.$, EV, 'agent-8', CTX)
  let ran = 0
  const fallback = router2.step(failing.$, { agentId: 'agent-8', index: 0, turnId: 't2' }, async function* () { ran++; return { answer: 'from the Claude delegate' } }, CTX)
  const last = await fallback.next()
  assert.equal(last.done, true)
  assert.equal(last.value.answer, 'from the Claude delegate')
  assert.equal(ran, 1, 'the delegate runs in Claude at the rung the call already carries')
  await router2.drain()
  assert.equal(verbsRun(failing.calls).filter((verb) => verb === 'spawn').length, 1, 'the rerun is linked to the same decision, so its tokens are priced')
})

test('a routed delegate that runs on Claude is linked to its agent: the mod runs the spawn verb once, in the background (R27, R30)', async () => {
  const final = { ...PLAN, args: { model: 'haiku', effort: 'high' }, notes: ['n'] }
  // The three ways a plan gets its id: the final plan, begin's id on the ask path, and begin's id in record mode.
  const cases = [
    ['a final plan', { begin: line(final) }],
    ['the ask path', { begin: line(ASK), finish: line(final) }],
    ['record mode with the model', { begin: line({ ...ASK, background: true }), finish: line(PLAN) }],
    ['record mode with Jev', { begin: line({ ...PLAN, background: true, decide: true }), decide: line(PLAN) }],
  ]
  for (const [name, verbs] of cases) {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const { $, calls } = make({ verbs: { ...verbs, spawn: gate.then(() => SPAWNED('agent-1')) } })
    const router = createRouter()
    await router.toolCall($, EV, recorder().next, CTX)
    const bound = router.bind($, EV, 'agent-1', CTX)
    assert.equal(bound, undefined, `${name}: bind starts the work and returns, it does not wait for it`)
    const spawns = calls.runs.filter((r) => r.argv[2] === 'spawn')
    assert.equal(spawns.length, 1, name)
    assert.deepEqual(spawns[0].argv, spawnArgv('agent-1'), name)
    assert.equal(typeof spawns[0].init.timeoutMs, 'number', name)
    let drained = false
    const drain = router.drain().then(() => { drained = true })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(drained, false, `${name}: drain waits for the spawn verb`)
    release()
    await drain
    assert.equal(calls.runs.filter((r) => r.argv[2] === 'spawn').length, 1, `${name}: once`)
    assert.equal(router.has('agent-1'), false, `${name}: no first step is taken from the model`)
  }
})

test('two calls with the same prompt are linked to their own agents, in order', async () => {
  const router = createRouter()
  const { $, calls } = make({ processes: [line({ ...PLAN, id: 'r1' }), line({ ...PLAN, id: 'r2' }), SPAWNED('agent-1', 'r1'), SPAWNED('agent-2', 'r2')] })
  await router.toolCall($, EV, recorder().next, CTX)
  await router.toolCall($, EV, recorder().next, CTX)
  router.bind($, EV, 'agent-1', CTX)
  router.bind($, EV, 'agent-2', CTX)
  await router.drain()
  assert.deepEqual(calls.runs.slice(2).map((r) => r.argv), [spawnArgv('agent-1', 'r1'), spawnArgv('agent-2', 'r2')])
  router.bind($, EV, 'agent-3', CTX)
  await router.drain()
  assert.equal(calls.runs.length, 4, 'a spawn with no call waiting is left alone')
})

test('an aether agent, a skipped plan and an unrouted prompt leave no spawn call (R9)', async () => {
  const judge = { ...EV, subagent_type: 'aether:judge', prompt: 'Review the spec.' }
  const aether = make()
  const router = createRouter()
  await router.toolCall(aether.$, judge, recorder().next, CTX)
  router.bind(aether.$, judge, 'agent-1', CTX)
  await router.drain()
  assert.equal(aether.calls.runs.length, 0)

  const skipped = make({ processes: [line({ id: null, skip: true, why: 'no-settings', args: null, notes: [], external: null })] })
  const router2 = createRouter()
  await router2.toolCall(skipped.$, EV, recorder().next, CTX)
  router2.bind(skipped.$, EV, 'agent-2', CTX)
  await router2.drain()
  assert.deepEqual(verbsRun(skipped.calls), ['begin'])

  const failed = make({ processes: [{ exitCode: 1, stdout: '', stderr: 'SyntaxError' }] })
  const router3 = createRouter()
  await router3.toolCall(failed.$, EV, recorder().next, CTX)
  router3.bind(failed.$, EV, 'agent-3', CTX)
  await router3.drain()
  assert.deepEqual(verbsRun(failed.calls), ['begin'])

  const other = make({ processes: [line(PLAN)] })
  const router4 = createRouter()
  await router4.toolCall(other.$, EV, recorder().next, CTX)
  router4.bind(other.$, { ...EV, prompt: 'Another prompt.' }, 'agent-4', CTX)
  router4.bind(other.$, { subagent_type: 'general-purpose' }, 'agent-5', CTX)
  router4.bind(other.$, EV, '', CTX)
  await router4.drain()
  assert.deepEqual(verbsRun(other.calls), ['begin'])
})

test('a spawn verb that fails never breaks the spawn, the call or the delegate (R25)', async () => {
  const external = { id: 'r1', harness: 'grok', model: 'grok-4.7', effort: 'low', group: 'grok', timeoutMs: 570000, fallback: { model: 'haiku', effort: 'high' } }
  const failures = [new Error('process refused'), { exitCode: 1, stdout: '', stderr: 'SyntaxError' }, { exitCode: 0, stdout: 'not json\n', stderr: '' }, { exitCode: 0, stdout: '', stderr: '' }, line({ error: 'cannot write the decision log' })]
  for (const spawn of failures) {
    const router = createRouter()
    const { $ } = make({ verbs: { begin: line({ ...PLAN, args: { model: 'haiku', effort: 'high' }, notes: ['n'], external }), spawn, delegate: line({ ok: true, status: 'ok', text: 'answer' }) } })
    const { seen, next } = recorder()
    const result = await router.toolCall($, EV, next, CTX)
    assert.equal(result.agentId, 'agent-1', 'the spawn is the engine\'s, and the router did not touch it')
    assert.deepEqual(seen, [{ ...EV, model: 'haiku', effort: 'high' }])
    assert.doesNotThrow(() => router.bind($, EV, 'agent-7', CTX))
    await assert.doesNotReject(router.drain())
    const step = router.step($, { agentId: 'agent-7', index: 0, turnId: 't' }, async function* () { return { answer: 'from model' } }, CTX)
    let last
    for (;;) {
      const r = await step.next()
      if (r.done) { last = r.value; break }
    }
    assert.equal(last.answer, 'answer', 'the external delegate still runs at its first step')
  }
  // With no process, no context or no calls at all, bind still returns.
  const router = createRouter()
  await router.toolCall(make({ processes: [line(PLAN)] }).$, EV, recorder().next, CTX)
  assert.doesNotThrow(() => router.bind(undefined, EV, 'agent-1', undefined))
  await assert.doesNotReject(router.drain())
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
