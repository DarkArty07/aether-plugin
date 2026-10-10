'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { createCursor } = require('../plugins/aether/lib/harness/cursor.js')

const GROUPS = { cursor: 'Cursor models' }
const ZERO = { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }
const APPROVE = '{"verdict":"approve","summary":"done"}'

// The one JSON object cursor-agent prints, with the answer in the given field.
const printed = (fields) => JSON.stringify({ type: 'result', ...fields, usage: { input_tokens: 700, output_tokens: 90 } })

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

test('cursor reports its quota as unknown for each group, without running the CLI', () => {
  const { exec, calls } = stubExec([])
  const cursor = createCursor({ groups: GROUPS, exec })
  assert.equal(cursor.name, 'cursor')
  assert.equal(cursor.schemaInPrompt, true)
  assert.deepEqual(cursor.quota(), { groups: { cursor: { unknown: true, windows: {} } } })
  assert.deepEqual(calls, [])
})

test('argv runs one trusted, headless prompt with the model and JSON output', () => {
  const cursor = createCursor({ command: '/opt/cursor-agent', groups: GROUPS })
  assert.deepEqual(cursor.argv({ model: 'gpt-5', schemaFile: '/r/schema.json', timeoutSeconds: 2700, prompt: 'P' }), [
    '/opt/cursor-agent',
    '-p',
    '--trust',
    '--approve-mcps',
    '--force',
    'P',
    '--model',
    'gpt-5',
    '--output-format',
    'json',
  ])
  assert.equal(createCursor({ groups: GROUPS }).argv({ model: 'm', prompt: 'P' })[0], 'cursor-agent')
})

test('modelArg gives cursor the bare model id, and argv takes no effort: the table level is not used until a real call shows how', () => {
  const cursor = createCursor({ command: 'cursor-agent', groups: GROUPS })
  assert.equal(cursor.modelArg({ model: 'gpt-5', level: 'high' }), 'gpt-5')
  assert.deepEqual(cursor.argv({ model: 'gpt-5', level: 'high', prompt: 'P' }), [
    'cursor-agent',
    '-p',
    '--trust',
    '--approve-mcps',
    '--force',
    'P',
    '--model',
    'gpt-5',
    '--output-format',
    'json',
  ])
})

test('parse reads a clean run: the result field is the answer, its JSON the structured output, the usage object the usage', () => {
  const cursor = createCursor({ groups: GROUPS })
  assert.deepEqual(cursor.parse({ stdout: printed({ result: APPROVE }), stderr: '', exitCode: 0 }, { required: ['verdict'] }), {
    clean: true,
    reason: null,
    structured: { verdict: 'approve', summary: 'done' },
    usage: { input: 700, output: 90, thinking: 0, cacheRead: 0, total: 790 },
    conversation: null,
  })
})

test('the answer is the result field alone, so other text fields do not stand in for it', () => {
  const cursor = createCursor({ groups: GROUPS })
  assert.equal(cursor.parse({ stdout: printed({ response: APPROVE }), stderr: '', exitCode: 0 }).reason, 'no result')
  assert.equal(cursor.parse({ stdout: printed({ result: 7, text: APPROVE }), stderr: '', exitCode: 0 }).reason, 'no result')
})

test('parse finds the JSON in a fenced block inside prose', () => {
  const cursor = createCursor({ groups: GROUPS })
  const result = `Checked the change.\n\n\`\`\`json\n${APPROVE}\n\`\`\`\n\nDone.`
  const parsed = cursor.parse({ stdout: printed({ result }), stderr: '', exitCode: 0 }, { required: ['verdict'] })
  assert.equal(parsed.clean, true)
  assert.deepEqual(parsed.structured, { verdict: 'approve', summary: 'done' })
})

test('parse fails a structured output that lacks a required field, with no structured output', () => {
  const cursor = createCursor({ groups: GROUPS })
  const parsed = cursor.parse({ stdout: printed({ result: APPROVE }), stderr: '', exitCode: 0 }, { required: ['files'] })
  assert.deepEqual([parsed.clean, parsed.reason, parsed.structured], [false, 'missing files', null])
})

test('parse fails a non-zero exit with the first non-empty stderr line', () => {
  const cursor = createCursor({ groups: GROUPS })
  const stdout = printed({ result: APPROVE })
  assert.equal(cursor.parse({ stdout, stderr: '\nError: not logged in\n', exitCode: 1 }).reason, 'exit 1: Error: not logged in')
  assert.equal(cursor.parse({ stdout, stderr: '', exitCode: 4 }).reason, 'exit 4')
})

test('parse reads a quota line in stderr first, and in stdout only outside the answer of a run that did not exit 0', () => {
  const cursor = createCursor({ groups: GROUPS })
  const stdout = printed({ result: APPROVE })
  assert.equal(cursor.parse({ stdout, stderr: 'Error: rate limit exceeded\n', exitCode: 1 }).reason, 'quota: Error: rate limit exceeded')
  const limited = JSON.stringify({ type: 'error', message: 'Too many requests' })
  // The stdout quota check runs only for a run that did not exit 0, and quotes the message, not the JSON line.
  assert.equal(cursor.parse({ stdout: limited, stderr: '', exitCode: 1 }).reason, 'quota: Too many requests')
  assert.equal(cursor.parse({ stdout: limited, stderr: '', exitCode: 0 }).reason, 'no result')
})

test('a clean answer stays clean, whatever it says about limits', () => {
  const cursor = createCursor({ groups: GROUPS })
  const result = `${APPROVE} The rate limit of the API is documented.`
  const parsed = cursor.parse({ stdout: printed({ result }), stderr: '', exitCode: 0 }, { required: ['verdict'] })
  assert.deepEqual([parsed.clean, parsed.reason], [true, null])
})

test('a non-zero cursor run reads limit words in its result as an exit, and in its other fields as a quota', () => {
  const cursor = createCursor({ groups: GROUPS })
  const result = printed({ result: 'the rate limit is documented' })
  assert.equal(cursor.parse({ stdout: result, stderr: 'Error: not logged in\n', exitCode: 1 }).reason, 'exit 1: Error: not logged in')
  const failed = printed({ result: APPROVE, message: 'Too many requests' })
  assert.equal(cursor.parse({ stdout: failed, stderr: '', exitCode: 1 }).reason, 'quota: Too many requests')
  assert.equal(cursor.parse({ stdout: printed({ result: APPROVE }), stderr: '' }).reason, 'exit unknown')
})

test('parse fails empty or unreadable output as no result, with zero usage', () => {
  const cursor = createCursor({ groups: GROUPS })
  for (const stdout of ['', 'hello, no JSON here']) {
    assert.deepEqual(cursor.parse({ stdout, stderr: '', exitCode: 0 }, { required: ['verdict'] }), {
      clean: false,
      reason: 'no result',
      structured: null,
      usage: ZERO,
      conversation: null,
    })
  }
  // An empty answer is still a run: its usage is kept.
  const blank = cursor.parse({ stdout: printed({ result: '' }), stderr: '', exitCode: 0 })
  assert.deepEqual([blank.reason, blank.usage], ['no result', { input: 700, output: 90, thinking: 0, cacheRead: 0, total: 790 }])
})

test('usage is zero when cursor reports none, and takes total_tokens when it is given', () => {
  const cursor = createCursor({ groups: GROUPS })
  assert.deepEqual(cursor.parse({ stdout: JSON.stringify({ result: APPROVE }), stderr: '', exitCode: 0 }).usage, ZERO)
  const withTotal = JSON.stringify({ result: APPROVE, usage: { input_tokens: 700, output_tokens: 90, total_tokens: 800 } })
  assert.deepEqual(cursor.parse({ stdout: withTotal, stderr: '', exitCode: 0 }).usage, { input: 700, output: 90, thinking: 0, cacheRead: 0, total: 800 })
})

test('usageDelta gives the current usage, since cursor reports each call on its own', () => {
  const cursor = createCursor({ groups: GROUPS })
  const current = { input: 700, output: 90, thinking: 0, cacheRead: 0, total: 790 }
  assert.equal(cursor.usageDelta({ input: 1, output: 1, thinking: 0, cacheRead: 0, total: 2 }, current), current)
  assert.equal(cursor.usageDelta(null, current), current)
})

test('version gives the trimmed first line of cursor-agent --version, or null when it cannot be read', () => {
  const { exec, calls } = stubExec([ok('2026.10.01-abc\nbuild details\n')])
  assert.equal(createCursor({ groups: GROUPS, exec }).version(), '2026.10.01-abc')
  assert.deepEqual(calls[0].argv, ['cursor-agent', '--version'])
  assert.equal(createCursor({ groups: GROUPS, exec: stubExec([{ status: 1, stdout: '', stderr: 'x' }]).exec }).version(), null)
  assert.equal(createCursor({ groups: GROUPS, exec: stubExec([new Error('ENOENT')]).exec }).version(), null)
})

test('installed follows the PATH for cursor-agent', (t) => {
  const dir = tempDir(t)
  const exe = path.join(dir, 'cursor-agent')
  fs.writeFileSync(exe, '#!/bin/sh\n')
  fs.chmodSync(exe, 0o755)
  assert.equal(createCursor({ groups: GROUPS, env: { PATH: dir } }).installed(), true)
  assert.equal(createCursor({ groups: GROUPS, env: { PATH: '/nowhere' } }).installed(), false)
})
