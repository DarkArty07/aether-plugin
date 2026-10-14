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

test('grok reports its quota as unknown for each group when its log has no reading, without running the CLI', (t) => {
  const { exec, calls } = stubExec([])
  const grok = createGrok({ groups: GROUPS, exec, logFile: path.join(tempDir(t), 'unified.jsonl') })
  assert.equal(grok.name, 'grok')
  assert.equal(grok.schemaInPrompt, true)
  assert.deepEqual(grok.quota(), { groups: { grok: { unknown: true, windows: {} } } })
  assert.deepEqual(calls, [])
})

test("quota gives each group the newest reading of grok's log, with its age, for as long as its period lasts", (t) => {
  const { exec, calls } = stubExec([])
  const logFile = path.join(tempDir(t), 'unified.jsonl')
  fs.writeFileSync(logFile, fs.readFileSync(path.join(__dirname, 'fixtures', 'grok-billing.jsonl')))
  let now = Date.parse('2026-10-14T06:00:00Z')
  const grok = createGrok({ groups: { grok: 'Grok plan', other: 'Other' }, exec, logFile, now: () => now })
  const reading = {
    windows: { weekly: { remaining: 1, resetsAt: '2026-10-17T09:08:51.805Z' } },
    source: { log: logFile, ts: '2026-10-14T05:45:16.241Z', pid: 531322, version: '1.0.41', ageMinutes: 14 },
    usedPercent: null,
    usedPercentAbsent: true,
  }
  assert.deepEqual(grok.quota(), { groups: { grok: reading, other: reading } })
  // Two days later the reading is old but its period still runs: it keeps its values, and its age says how old it is.
  now = Date.parse('2026-10-16T06:00:00Z')
  const later = grok.quota().groups.grok
  assert.deepEqual([later.windows, later.source.ageMinutes], [reading.windows, 2894])
  // Once the period has ended the reading is worth nothing.
  now = Date.parse('2026-10-17T09:08:52Z')
  assert.deepEqual(grok.quota(), { groups: { grok: { unknown: true, windows: {} }, other: { unknown: true, windows: {} } } })
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

test('modelArg gives grok the bare model id, and argv takes the table level as --reasoning-effort', () => {
  const grok = createGrok({ command: 'grok', groups: GROUPS })
  assert.equal(grok.modelArg({ model: 'grok-4', level: 'high' }), 'grok-4')
  assert.deepEqual(grok.argv({ model: 'grok-4', level: 'high', prompt: 'P' }), [
    'grok',
    '-p',
    'P',
    '--always-approve',
    '--model',
    'grok-4',
    '--reasoning-effort',
    'high',
    '--output-format',
    'json',
  ])
})

test('parse reads the stdout grok 1.0.41 prints: the text, the usage with reasoning and cache tokens', () => {
  const grok = createGrok({ groups: GROUPS })
  // The text joins the words of every turn, so the answer's JSON is the last object after the prose.
  const stdout = JSON.stringify({
    text: `I'll read the file and answer.${APPROVE}`,
    stopReason: 'end_turn',
    usage: { input_tokens: 20086, cache_read_input_tokens: 1152, output_tokens: 54, reasoning_tokens: 48, total_tokens: 21292 },
    num_turns: 2,
    total_cost_usd: 0.0279,
  })
  assert.deepEqual(grok.parse({ stdout, stderr: '', exitCode: 0 }, { required: ['verdict'] }), {
    clean: true,
    reason: null,
    structured: { verdict: 'approve', summary: 'done' },
    usage: { input: 20086, output: 54, thinking: 48, cacheRead: 1152, total: 21292 },
    conversation: null,
  })
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

test('parse reads a quota line in stderr first, and in stdout only outside the answer of a run that did not exit 0', () => {
  const grok = createGrok({ groups: GROUPS })
  const stdout = printed({ result: APPROVE })
  assert.equal(grok.parse({ stdout, stderr: 'Error: 429 Too Many Requests\n', exitCode: 1 }).reason, 'quota: Error: 429 Too Many Requests')
  const limited = JSON.stringify({ error: 'You exceeded your current quota' })
  // The stdout quota check runs only for a run that did not exit 0, and quotes the message, not the JSON line.
  assert.equal(grok.parse({ stdout: limited, stderr: '', exitCode: 1 }).reason, 'quota: You exceeded your current quota')
  assert.equal(grok.parse({ stdout: limited, stderr: '', exitCode: 0 }).reason, 'no result')
})

test('a clean answer stays clean, whatever the other fields and the answer say about limits', () => {
  const grok = createGrok({ groups: GROUPS })
  const result = `${APPROVE} The rate limit of the API is documented.`
  const parsed = grok.parse({ stdout: printed({ result, error: 'rate limit exceeded' }), stderr: '', exitCode: 0 }, { required: ['verdict'] })
  assert.deepEqual([parsed.clean, parsed.reason], [true, null])
})

test('a non-zero grok run reads limit words in its answer as an exit, and in its other fields as a quota', () => {
  const grok = createGrok({ groups: GROUPS })
  const answer = printed({ result: 'the rate limit is documented' })
  assert.equal(grok.parse({ stdout: answer, stderr: 'Error: unknown model\n', exitCode: 1 }).reason, 'exit 1: Error: unknown model')
  assert.equal(grok.parse({ stdout: answer, stderr: '', exitCode: 1 }).reason, 'exit 1')
  const failed = printed({ result: APPROVE, error: 'rate limit exceeded' })
  assert.equal(grok.parse({ stdout: failed, stderr: '', exitCode: 1 }).reason, 'quota: rate limit exceeded')
  assert.equal(grok.parse({ stdout: printed({ result: APPROVE }), stderr: '' }).reason, 'exit unknown')
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
