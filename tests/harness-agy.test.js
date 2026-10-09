'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { createAgy } = require('../plugins/aether/lib/harness/agy.js')

const GROUPS = { gemini: 'Gemini Models', claude: 'Claude and GPT models' }
const ZERO = { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 }

// The shape agy 1.3.2 printed for /usage on 2026-10-08, with one group added that the table does not name.
const USAGE = {
  conversation_id: '',
  status: 'SUCCESS',
  response: 'Gemini Models\tWeekly Limit Remaining\t96%',
  duration_seconds: 0,
  num_turns: 0,
  usage: ZERO,
  command: {
    name: 'usage',
    data: {
      groups: [
        {
          name: 'Gemini Models',
          buckets: [
            { id: 'gemini-weekly', window: 'weekly', remaining_fraction: 0.9608922600746155, reset_time: '2026-10-14T03:35:44Z' },
            { id: 'gemini-5h', window: '5h', remaining_fraction: 0.9534739255905151, reset_time: '2026-10-09T05:53:31Z' },
          ],
        },
        {
          name: 'Claude and GPT models',
          buckets: [
            { id: '3p-weekly', window: 'weekly', remaining_fraction: 0.9796000123023987, reset_time: '2026-10-16T04:41:07Z' },
            { id: '3p-5h', window: '5h', remaining_fraction: 0.9709720015525818, reset_time: '2026-10-09T09:41:07Z' },
          ],
        },
        { name: 'Other Models', buckets: [{ id: 'o-5h', window: '5h', remaining_fraction: 0.5, reset_time: 'x' }] },
      ],
    },
  },
}

function stubExec(answers) {
  const calls = []
  const exec = (argv, options) => {
    calls.push({ argv, options })
    const answer = answers.shift()
    if (answer instanceof Error) throw answer
    return answer
  }
  return { exec, calls }
}
const ok = (stdout) => ({ status: 0, stdout, stderr: '' })
const success = (fields = {}) =>
  JSON.stringify({
    conversation_id: 'c-1',
    status: 'SUCCESS',
    response: '{"verdict":"approve","toolAction":"respond","toolSummary":"done"}',
    structured_output: { verdict: 'approve' },
    duration_seconds: 4,
    num_turns: 1,
    usage: { input_tokens: 1000, output_tokens: 200, thinking_tokens: 0, cache_read_tokens: 8132, total_tokens: 1200 },
    ...fields,
  })

test("quota reads each configured group's windows from /usage", () => {
  const { exec, calls } = stubExec([ok(JSON.stringify(USAGE))])
  const agy = createAgy({ command: '/opt/agy', groups: GROUPS, exec })
  assert.equal(agy.name, 'agy')
  assert.deepEqual(agy.quota(), {
    groups: {
      gemini: {
        windows: {
          weekly: { remaining: 0.9608922600746155, resetsAt: '2026-10-14T03:35:44Z' },
          '5h': { remaining: 0.9534739255905151, resetsAt: '2026-10-09T05:53:31Z' },
        },
      },
      claude: {
        windows: {
          weekly: { remaining: 0.9796000123023987, resetsAt: '2026-10-16T04:41:07Z' },
          '5h': { remaining: 0.9709720015525818, resetsAt: '2026-10-09T09:41:07Z' },
        },
      },
    },
  })
  assert.deepEqual(calls[0].argv, ['/opt/agy', '-p', '/usage', '--output-format', 'json'])
  assert.equal(calls[0].options.timeoutMs, 60000)
})

test('quota fails loudly on a failed or unreadable /usage', () => {
  const failed = createAgy({ groups: GROUPS, exec: stubExec([{ status: 1, stdout: '', stderr: 'not logged in\n' }]).exec })
  assert.throws(() => failed.quota(), /^Error: agy \/usage failed: exit 1: not logged in$/)
  const garbled = createAgy({ groups: GROUPS, exec: stubExec([ok('nope')]).exec })
  assert.throws(() => garbled.quota(), /^Error: agy \/usage failed: unreadable output$/)
})

test('argv runs one print-mode turn with the model, the schema, the timeout and, to resume, the conversation', () => {
  const agy = createAgy({ command: 'agy', groups: GROUPS })
  assert.deepEqual(agy.argv({ model: 'gemini-3.8-flash-high', schemaFile: '/r/schema.json', timeoutSeconds: 2700, prompt: 'P' }), [
    'agy',
    '-p',
    'P',
    '--model',
    'gemini-3.8-flash-high',
    '--output-format',
    'json',
    '--json-schema',
    '/r/schema.json',
    '--dangerously-skip-permissions',
    '--print-timeout',
    '2700s',
  ])
  assert.deepEqual(agy.argv({ model: 'm', schemaFile: 's', timeoutSeconds: 10, prompt: 'P', conversation: 'c-1' }).slice(-2), ['--conversation', 'c-1'])
})

test('parse accepts only a clean result: exit 0, SUCCESS, no stderr, a response and the structured output', () => {
  const agy = createAgy({ groups: GROUPS })
  assert.deepEqual(agy.parse({ stdout: success(), stderr: '', exitCode: 0 }, { required: ['verdict'] }), {
    clean: true,
    reason: null,
    structured: { verdict: 'approve' },
    usage: { input: 1000, output: 200, thinking: 0, cacheRead: 8132, total: 1200 },
    conversation: 'c-1',
    response: '{"verdict":"approve","toolAction":"respond","toolSummary":"done"}',
    error: '',
  })
  const reason = (raw, options = {}) => agy.parse(raw, { required: ['verdict'], ...options }).reason
  const invalidModel = JSON.stringify({ conversation_id: '', status: 'ERROR', error: 'model not found: x', response: '', usage: ZERO })
  assert.equal(reason({ stdout: invalidModel, stderr: 'Error: model not found\n', exitCode: 1 }), 'exit 1: model not found: x')
  assert.equal(agy.parse({ stdout: invalidModel, stderr: '', exitCode: 1 }).error, 'model not found: x')
  assert.equal(reason({ stdout: '', stderr: 'invalid schema', exitCode: 1 }), 'exit 1')
  assert.equal(reason({ stdout: 'not json', stderr: '', exitCode: 0 }), 'unreadable output')
  assert.equal(reason({ stdout: success({ status: 'ERROR', error: 'boom' }), stderr: '', exitCode: 0 }), 'status ERROR: boom')
  assert.equal(
    reason({ stdout: success({ response: '' }), stderr: '[agy] print timeout 900s reached, returning partial output\n', exitCode: 0 }),
    'stderr: [agy] print timeout 900s reached, returning partial output',
  )
  assert.equal(reason({ stdout: success({ response: '  ' }), stderr: '', exitCode: 0 }), 'empty response')
  assert.equal(reason({ stdout: success({ structured_output: undefined }), stderr: '', exitCode: 0 }), 'no structured output')
  assert.equal(reason({ stdout: success({ structured_output: '{"verdict":"approve"}' }), stderr: '', exitCode: 0 }), 'no structured output')
  assert.equal(reason({ stdout: success({ structured_output: { ruling: 'x' } }), stderr: '', exitCode: 0 }), 'no structured output')
  assert.equal(reason({ stdout: success({ conversation_id: 'c-2' }), stderr: '', exitCode: 0 }, { conversation: 'c-1' }), 'conversation c-2 instead of c-1')
  assert.equal(reason({ stdout: success(), stderr: '', exitCode: 0 }, { conversation: 'c-1' }), null)
  const unreadable = agy.parse({ stdout: '', stderr: '', exitCode: 0 })
  assert.deepEqual([unreadable.clean, unreadable.structured, unreadable.conversation, unreadable.usage], [
    false,
    null,
    null,
    { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 },
  ])
})

test('usageDelta gives one turn of a conversation whose usage is cumulative', () => {
  const agy = createAgy({ groups: GROUPS })
  const first = { input: 1000, output: 200, thinking: 0, cacheRead: 0, total: 1200 }
  const second = { input: 3000, output: 300, thinking: 50, cacheRead: 17985, total: 3300 }
  assert.deepEqual(agy.usageDelta(first, second), { input: 2000, output: 100, thinking: 50, cacheRead: 17985, total: 2100 })
  assert.deepEqual(agy.usageDelta(null, first), first)
  assert.deepEqual(agy.usageDelta(second, first), { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 })
})

test('installed follows the PATH, and version reads agy --version or gives null', (t) => {
  const dir = tempDir(t)
  const exe = path.join(dir, 'agy')
  fs.writeFileSync(exe, '#!/bin/sh\n')
  fs.chmodSync(exe, 0o755)
  assert.equal(createAgy({ groups: GROUPS, env: { PATH: dir } }).installed(), true)
  assert.equal(createAgy({ groups: GROUPS, env: { PATH: '/nowhere' } }).installed(), false)
  const { exec, calls } = stubExec([ok('agy 1.3.2\n')])
  assert.equal(createAgy({ groups: GROUPS, exec }).version(), '1.3.2')
  assert.deepEqual(calls[0].argv, ['agy', '--version'])
  assert.equal(createAgy({ groups: GROUPS, exec: stubExec([{ status: 2, stdout: '', stderr: 'unknown flag' }]).exec }).version(), null)
  assert.equal(createAgy({ groups: GROUPS, exec: stubExec([new Error('ENOENT')]).exec }).version(), null)
})
