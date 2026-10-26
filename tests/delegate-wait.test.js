'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const HOOKS = path.join(__dirname, '..', 'plugins', 'aether', 'hooks')
let mod
test.before(async () => {
  mod = await import(path.join(HOOKS, 'delegate-wait.mjs'))
})

// `answers` is what each `aether-delegate wait` prints, in order; an Error is a run that fails. The clock is
// simulated: a wait that answers { done: false } lasted the seconds it asked for.
function make(answers) {
  const state = { now: 0, runs: [] }
  const queue = [...answers]
  const $ = {
    clock: { now: async () => state.now },
    process: {
      run: async (argv, init) => {
        state.runs.push({ argv, init })
        const next = queue.shift()
        if (next === undefined) throw new Error('no more answers')
        if (next instanceof Error) throw next
        if (next.done === false) state.now += Number(argv[argv.indexOf('--seconds') + 1]) * 1000
        return { exitCode: 0, stdout: `noise\n${JSON.stringify(next)}\n`, stderr: '' }
      },
    },
  }
  return { $, state }
}
const CTX = { root: '/plugin', id: 'task-a', session: 's1' }
const DONE = { done: true, ok: true, status: 'ok', text: 'branch aether/x/task-1' }

test('the constants stay under the ten minutes of $.process.run', () => {
  assert.ok(mod.WAIT_TIMEOUT_MS < 600000)
  assert.ok(mod.WAIT_SECONDS * 1000 < mod.WAIT_TIMEOUT_MS)
})

test('waitSteps yields a beat after every wait that did not end, before it waits again (the stall limit of the engine)', async () => {
  const { $, state } = make([{ done: false }, { done: false }, DONE])
  const steps = mod.waitSteps($, CTX)
  const first = await steps.next()
  assert.deepEqual([first.done, first.value], [false, { beat: true, waitedMs: 540000 }])
  assert.equal(state.runs.length, 1, 'the first beat comes before the second wait')
  const second = await steps.next()
  assert.deepEqual([second.done, second.value], [false, { beat: true, waitedMs: 1080000 }])
  assert.equal(state.runs.length, 2)
  const last = await steps.next()
  assert.deepEqual([last.done, last.value], [true, { ok: true, status: 'ok', text: 'branch aether/x/task-1' }])
  assert.ok(mod.WAIT_TIMEOUT_MS < mod.STALL_MS, 'no wait can go as long as the engine tolerates without an event')
})

test('a failed wait gives a beat before its retry, so a hung wait and its retry never go 600 s without an event', async () => {
  const { $, state } = make([new Error('hung'), DONE])
  const steps = mod.waitSteps($, CTX)
  const first = await steps.next()
  assert.deepEqual([first.done, first.value.beat], [false, true])
  assert.equal(state.runs.length, 1, 'the beat comes before the retry')
  const last = await steps.next()
  assert.deepEqual([last.done, last.value], [true, { ok: true, status: 'ok', text: 'branch aether/x/task-1' }])
  assert.equal(state.runs.length, 2)
})

test('two failed waits in a row give one beat and then end the wait', async () => {
  const { $ } = make([new Error('a'), new Error('b')])
  const steps = mod.waitSteps($, CTX)
  assert.equal((await steps.next()).value.beat, true)
  assert.deepEqual(await steps.next(), { done: true, value: { ok: false, status: 'wait-failed', text: null } })
})

test('a delegate that ends on the first wait yields no beat', async () => {
  const { $ } = make([DONE])
  const steps = mod.waitSteps($, CTX)
  const next = await steps.next()
  assert.equal(next.done, true)
  assert.equal(next.value.ok, true)
})

test('the heartbeat text names the minutes and ends with a newline', () => {
  assert.equal(mod.heartbeatText(540000), '[Aether: the delegate is still working, 9 min so far]\n')
  assert.equal(mod.heartbeatText(1080000), '[Aether: the delegate is still working, 18 min so far]\n')
})
