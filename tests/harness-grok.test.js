'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { createGrok } = require('../plugins/aether/lib/harness/grok.js')

const GROUPS = { grok: 'Grok models' }
const ZERO = { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }
const APPROVE = '{"verdict":"approve","summary":"done"}'

// The one JSON object grok prints, with the answer in the given field.
const printed = (fields) => JSON.stringify({ ...fields, usage: { input_tokens: 500, output_tokens: 50 } })

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

test('grok reports its quota as unknown for each group, without running the CLI', () => {
  const { exec, calls } = stubExec([])
  const grok = createGrok({ groups: GROUPS, exec })
  assert.equal(grok.name, 'grok')
  assert.equal(grok.schemaInPrompt, true)
  assert.deepEqual(grok.quota(), { groups: { grok: { unknown: true, windows: {} } } })
  assert.deepEqual(calls, [])
})

test('argv runs one headless prompt that approves its actions, with the model and JSON output', () => {
  const grok = createGrok({ command: '/opt/grok', groups: GROUPS })
  assert.deepEqual(grok.argv({ model: 'grok-4', schemaFile: '/r/schema.json', timeoutSeconds: 2700, prompt: 'P' }), [
    '/opt/grok',
    '-p',
    'P',
    '--always-approve',
    '--model',
    'grok-4',
    '--output-format',
    'json',
  ])
  assert.equal(createGrok({ groups: GROUPS }).argv({ model: 'm', prompt: 'P' })[0], 'grok')
})

test('parse reads a clean run: the result field is the answer, its JSON the structured output, the usage object the usage', () => {
  const grok = createGrok({ groups: GROUPS })
  assert.deepEqual(grok.parse({ stdout: printed({ result: APPROVE }), stderr: '', exitCode: 0 }, { required: ['verdict'] }), {
    clean: true,
    reason: null,
    structured: { verdict: 'approve', summary: 'done' },
    usage: { input: 500, output: 50, thinking: 0, cacheRead: 0, total: 550 },
    conversation: null,
  })
})

test('the answer is the first string field among result, response, text and output', () => {
  const grok = createGrok({ groups: GROUPS })
  const verdict = (fields) => grok.parse({ stdout: printed(fields), stderr: '', exitCode: 0 }, { required: ['verdict'] }).structured?.verdict ?? null
  assert.equal(verdict({ result: APPROVE, response: '{"verdict":"reject"}' }), 'approve')
  assert.equal(verdict({ result: 7, response: APPROVE }), 'approve')
  assert.equal(verdict({ text: APPROVE, output: '{"verdict":"reject"}' }), 'approve')
  assert.equal(verdict({ output: APPROVE }), 'approve')
  // The first string field is the answer even when a later one holds the JSON.
  assert.equal(grok.parse({ stdout: printed({ response: 'nothing', text: APPROVE }), stderr: '', exitCode: 0 }).reason, 'no structured output')
})

test('parse finds the JSON in a fenced block inside prose', () => {
  const grok = createGrok({ groups: GROUPS })
  const result = `Checked the change.\n\n\`\`\`json\n${APPROVE}\n\`\`\`\n\nDone.`
  const parsed = grok.parse({ stdout: printed({ result }), stderr: '', exitCode: 0 }, { required: ['verdict'] })
  assert.equal(parsed.clean, true)
  assert.deepEqual(parsed.structured, { verdict: 'approve', summary: 'done' })
})

test('parse fails a structured output that lacks a required field, with no structured output', () => {
  const grok = createGrok({ groups: GROUPS })
  const parsed = grok.parse({ stdout: printed({ result: APPROVE }), stderr: '', exitCode: 0 }, { required: ['files'] })
  assert.deepEqual([parsed.clean, parsed.reason, parsed.structured], [false, 'missing files', null])
})

test('parse fails a non-zero exit with the first non-empty stderr line', () => {
  const grok = createGrok({ groups: GROUPS })
  const stdout = printed({ result: APPROVE })
  assert.equal(grok.parse({ stdout, stderr: '\nError: unknown model\n', exitCode: 1 }).reason, 'exit 1: Error: unknown model')
  assert.equal(grok.parse({ stdout, stderr: '', exitCode: 3 }).reason, 'exit 3')
})

test('parse fails a quota message in stderr or stdout before any other rule', () => {
  const grok = createGrok({ groups: GROUPS })
  const stdout = printed({ result: APPROVE })
  assert.equal(grok.parse({ stdout, stderr: 'Error: 429 Too Many Requests\n', exitCode: 1 }).reason, 'quota: Error: 429 Too Many Requests')
  const limited = JSON.stringify({ error: 'You exceeded your current quota' })
  assert.equal(grok.parse({ stdout: limited, stderr: '', exitCode: 0 }).reason, 'quota: {"error":"You exceeded your current quota"}')
})

test('parse fails empty or unreadable output as no result, with zero usage', () => {
  const grok = createGrok({ groups: GROUPS })
  for (const stdout of ['', 'hello, no JSON here']) {
    assert.deepEqual(grok.parse({ stdout, stderr: '', exitCode: 0 }, { required: ['verdict'] }), {
      clean: false,
      reason: 'no result',
      structured: null,
      usage: ZERO,
      conversation: null,
    })
  }
  // An empty answer is still a run: its usage is kept.
  const blank = grok.parse({ stdout: printed({ result: '' }), stderr: '', exitCode: 0 })
  assert.deepEqual([blank.reason, blank.usage], ['no result', { input: 500, output: 50, thinking: 0, cacheRead: 0, total: 550 }])
})

test('usage is zero when grok reports none, and takes total_tokens when it is given', () => {
  const grok = createGrok({ groups: GROUPS })
  assert.deepEqual(grok.parse({ stdout: JSON.stringify({ result: APPROVE }), stderr: '', exitCode: 0 }).usage, ZERO)
  const withTotal = JSON.stringify({ result: APPROVE, usage: { input_tokens: 500, output_tokens: 50, total_tokens: 600 } })
  assert.deepEqual(grok.parse({ stdout: withTotal, stderr: '', exitCode: 0 }).usage, { input: 500, output: 50, thinking: 0, cacheRead: 0, total: 600 })
})

test('usageDelta gives the current usage, since grok reports each call on its own', () => {
  const grok = createGrok({ groups: GROUPS })
  const current = { input: 500, output: 50, thinking: 0, cacheRead: 0, total: 550 }
  assert.equal(grok.usageDelta({ input: 1, output: 1, thinking: 0, cacheRead: 0, total: 2 }, current), current)
  assert.equal(grok.usageDelta(null, current), current)
})

test('version gives the trimmed first line of grok --version, or null when it cannot be read', () => {
  const { exec, calls } = stubExec([ok('grok 1.4.0\n')])
  assert.equal(createGrok({ groups: GROUPS, exec }).version(), 'grok 1.4.0')
  assert.deepEqual(calls[0].argv, ['grok', '--version'])
  assert.equal(createGrok({ groups: GROUPS, exec: stubExec([{ status: 1, stdout: '', stderr: 'x' }]).exec }).version(), null)
  assert.equal(createGrok({ groups: GROUPS, exec: stubExec([new Error('ENOENT')]).exec }).version(), null)
})

test('installed follows the PATH', (t) => {
  const dir = tempDir(t)
  const exe = path.join(dir, 'grok')
  fs.writeFileSync(exe, '#!/bin/sh\n')
  fs.chmodSync(exe, 0o755)
  assert.equal(createGrok({ groups: GROUPS, env: { PATH: dir } }).installed(), true)
  assert.equal(createGrok({ groups: GROUPS, env: { PATH: '/nowhere' } }).installed(), false)
})
