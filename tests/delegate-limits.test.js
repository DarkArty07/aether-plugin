'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const limits = require('../plugins/aether/lib/delegate-limits.js')

// The engine's $.process.run refuses a timeoutMs above ten minutes.
const ENGINE_MAX_MS = 600000

test('the worst case of a delegate fits the limit the mod gives the engine, which fits the engine', () => {
  assert.equal(limits.worstCaseMs(), (2 * limits.READING_MAX_SECONDS + limits.CLI_MAX_SECONDS + limits.KILL_GRACE_SECONDS) * 1000)
  assert.ok(limits.worstCaseMs() <= limits.EXTERNAL_LIMIT_MS, `${limits.worstCaseMs()} ms of worst case against ${limits.EXTERNAL_LIMIT_MS} ms`)
  assert.ok(limits.EXTERNAL_LIMIT_MS <= ENGINE_MAX_MS, `${limits.EXTERNAL_LIMIT_MS} ms is more than the engine allows`)
})

test('the limits are the ones the router promises', () => {
  assert.equal(limits.CLI_MAX_SECONDS, 360)
  assert.equal(limits.KILL_GRACE_SECONDS, 60)
  assert.equal(limits.READING_MAX_SECONDS, 60)
  assert.equal(limits.EXTERNAL_LIMIT_MS, 570000)
})

test('cliSeconds takes the reviewer timeout of the harness when it is smaller than the most a delegate may run', () => {
  assert.equal(limits.cliSeconds({ timeouts: { reviewer: 120 } }), 120)
  assert.equal(limits.cliSeconds({ timeouts: { reviewer: limits.CLI_MAX_SECONDS } }), limits.CLI_MAX_SECONDS)
})

test('cliSeconds never goes over the most a delegate may run', () => {
  assert.equal(limits.cliSeconds({ timeouts: { reviewer: 1200 } }), limits.CLI_MAX_SECONDS)
  assert.equal(limits.cliSeconds({ timeouts: { reviewer: limits.CLI_MAX_SECONDS + 1 } }), limits.CLI_MAX_SECONDS)
})

test('cliSeconds is the most a delegate may run when the setting is missing or invalid', () => {
  for (const settings of [undefined, null, {}, { timeouts: null }, { timeouts: {} }, { timeouts: { implementer: 5 } }]) {
    assert.equal(limits.cliSeconds(settings), limits.CLI_MAX_SECONDS, JSON.stringify(settings))
  }
  for (const reviewer of [0, -5, NaN, Infinity, -Infinity, '120', null, true, [], {}]) {
    assert.equal(limits.cliSeconds({ timeouts: { reviewer } }), limits.CLI_MAX_SECONDS, String(reviewer))
  }
})
