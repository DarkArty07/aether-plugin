'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// The aether-lane forms of the mod's closed list: the wave's `status <run> --refresh`, and superdelegation's `pick`, `took` and `pause`.
// `aether-lane choice` is no longer one of them.

const MODULE = path.join(__dirname, '..', 'plugins', 'aether', 'hooks', 'ops-command.mjs')

let parseOpsPrompt
let OPS_TIMEOUT_MS
test.before(async () => {
  ;({ parseOpsPrompt, OPS_TIMEOUT_MS } = await import(MODULE))
})

const RUN = '20261014-060800-ab12'
const SHORT = 'Run this command with the Bash tool, once, exactly as written:'
const CLOSING = 'Then return its exit code and its complete standard output, exactly as printed. Do not run anything else, and do not fix or retry anything.'
const CALL = 'task-1-1-implement'

// The message aether:run's opsPrompt builds for a command with no payload (run.workflow.js), line for line.
const LONG = "Run this command with the Bash tool, once, exactly as written, with the Bash tool's timeout set to 600000:"
const prompt = (command, long = false) => [long ? LONG : SHORT, '', `cd '/repo' && ${command}`, '', CLOSING].join('\n')

test('choice is no longer a form of the closed list, with any flags it once took', () => {
  const flags = '--role implementer --tier haiku --effort xhigh --pick grok:grok-4.7 --order grok:grok-4.7:0.013331:picked'
  for (const command of [`aether-lane choice ${RUN} ${CALL} ${flags}`, `aether-lane choice ${RUN} final-review --role reviewer --tier opus --effort high --pick native --order agy:m:1:picked`, `aether-lane choice ${RUN} ${CALL}`]) {
    assert.equal(parseOpsPrompt(prompt(command)), null, command)
  }
})

test("the wave's quota step asks for the refresh: status <run> --refresh, and no other flag", () => {
  const args = (command) => parseOpsPrompt(prompt(command, true))
  assert.deepEqual(args(`aether-lane status ${RUN} --refresh`), { cwd: '/repo', bin: 'aether-lane', args: ['status', RUN, '--refresh'], timeoutMs: OPS_TIMEOUT_MS })
  assert.notEqual(parseOpsPrompt(prompt(`aether-lane status ${RUN}`)), null, 'the form without the flag is still accepted')
  for (const command of [`aether-lane status ${RUN} --refresh --refresh`, `aether-lane status ${RUN} --force`, `aether-lane status ${RUN} refresh`, 'aether-lane status --refresh', `aether-lane status ${RUN} --refresh extra`, `aether-wt status ${RUN} --refresh`, `aether-lane status ${RUN} --refresh;id`]) {
    assert.equal(parseOpsPrompt(prompt(command)), null, command)
  }
})

const PAIR = 'agy/claude-opus-5-5@medium'

test('pick, took and pause parse to their argument vectors', () => {
  const forms = [
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort xhigh`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort xhigh --exclude ${PAIR}`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort xhigh --exclude ${PAIR},grok/grok-4.7@low,muse/muse-wonder-full-1.0@high`,
    `aether-lane pick ${RUN} task-1-1-supervise --role supervisor --model sonnet --effort high --author claude-sonnet-5-5`,
    `aether-lane pick ${RUN} final-review --role reviewer --model opus --effort max --exclude ${PAIR} --author gemini-4-argon`,
    `aether-lane took ${RUN} ${CALL} --by agy:claude-opus-5-5 --cause chosen`,
    `aether-lane took ${RUN} final-review --by native --cause wait-limit`,
    `aether-lane took ${RUN} ${CALL} --by muse:muse-wonder-full-1.0 --cause chosen`,
    'aether-lane pause --seconds 60',
  ]
  for (const command of forms) {
    assert.deepEqual(parseOpsPrompt(prompt(command)), { cwd: '/repo', bin: 'aether-lane', args: command.split(' ').slice(1), timeoutMs: OPS_TIMEOUT_MS }, command)
  }
})

test('pick, took and pause refuse a value or an order they do not take', () => {
  const refused = [
    `aether-lane pick ${RUN} ${CALL} --role judge --model sonnet --effort high`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model gpt --effort high`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort ultra`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort high --exclude agy/x`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort high --author A;B`,
    `aether-lane pick ${RUN} ${CALL} --role implementer --model sonnet --effort high --author gemini-4-argon --exclude ${PAIR}`,
    `aether-lane pick ${RUN} bad-call --role implementer --model sonnet --effort high`,
    `aether-lane took ${RUN} ${CALL} --by native --cause because`,
    `aether-lane took ${RUN} ${CALL} --cause chosen --by native`,
    'aether-lane pause --seconds -1',
    'aether-lane pause --seconds 1000',
    'aether-lane pause 60',
  ]
  for (const command of refused) assert.equal(parseOpsPrompt(prompt(command)), null, command)
})
