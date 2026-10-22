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

test('a delegate of more than 10 minutes is waited for with waits that each stay under the engine limit (R20)', async () => {
  const { $, state } = make([{ done: false }, { done: false }, { done: false }, DONE])
  const result = await mod.waitForDelegate($, CTX)
  assert.deepEqual(result, { ok: true, status: 'ok', text: 'branch aether/x/task-1' })
  assert.equal(state.runs.length, 4)
  assert.ok(state.now > 600000, 'the simulated delegate outlasted the 10 minutes of one command')
  for (const run of state.runs) {
    assert.ok(run.init.timeoutMs < 600000, `timeoutMs ${run.init.timeoutMs}`)
    assert.deepEqual(run.argv.slice(0, 3), ['node', '/plugin/bin/aether-delegate', 'wait'])
    assert.equal(run.argv[run.argv.indexOf('--id') + 1], 'task-a')
  }
})

test('one failed wait is retried', async () => {
  const { $, state } = make([new Error('boom'), DONE])
  assert.equal((await mod.waitForDelegate($, CTX)).ok, true)
  assert.equal(state.runs.length, 2)
})

test('two failed waits in a row end the wait without throwing', async () => {
  const { $ } = make([new Error('a'), new Error('b')])
  assert.deepEqual(await mod.waitForDelegate($, CTX), { ok: false, status: 'wait-failed', text: null })
})

test('a delegate that never ends is given up on after MAX_WAIT_MS', async () => {
  const { $, state } = make(Array.from({ length: 100 }, () => ({ done: false })))
  const result = await mod.waitForDelegate($, CTX)
  assert.deepEqual(result, { ok: false, status: 'timeout', text: null })
  assert.ok(state.now >= mod.MAX_WAIT_MS)
  assert.ok(state.runs.length <= Math.ceil(mod.MAX_WAIT_MS / (mod.WAIT_SECONDS * 1000)) + 1)
})

test('a delegate that ended without an answer says so as it is', async () => {
  const { $ } = make([{ done: true, ok: false, status: 'no-candidate', text: null }])
  assert.deepEqual(await mod.waitForDelegate($, CTX), { ok: false, status: 'no-candidate', text: null })
})

test('the constants stay under the ten minutes of $.process.run', () => {
  assert.ok(mod.WAIT_TIMEOUT_MS < 600000)
  assert.ok(mod.WAIT_SECONDS * 1000 < mod.WAIT_TIMEOUT_MS)
})
