'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { createCodex } = require('../plugins/aether/lib/harness/codex.js')

const GROUPS = { gpt: 'GPT models', other: 'Other models' }
const ZERO = { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }
const USAGE = { input: 1000, output: 200, thinking: 0, cacheRead: 800, total: 1200 }
const APPROVE = '{"verdict":"approve","summary":"done"}'

// The events codex exec --json prints, one JSON object per line.
const jsonl = (...events) => `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
const reasoning = { type: 'item.completed', item: { id: 'item_0', type: 'reasoning', text: 'checking the diff' } }
const message = (text) => ({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text } })
const turn = (usage) => ({ type: 'turn.completed', usage })
const CODEX_USAGE = { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 200 }

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

test('codex reports its quota as unknown for each group, without running the CLI', () => {
  const { exec, calls } = stubExec([])
  const codex = createCodex({ groups: GROUPS, exec })
  assert.equal(codex.name, 'codex')
  assert.equal(codex.schemaInPrompt, true)
  assert.deepEqual(codex.quota(), {
    groups: {
      gpt: { unknown: true, windows: {} },
      other: { unknown: true, windows: {} },
    },
  })
  assert.deepEqual(calls, [])
})

test('argv runs one headless exec with the prompt, the model, JSON events and a workspace-write sandbox', () => {
  const codex = createCodex({ command: '/opt/codex', groups: GROUPS })
  assert.deepEqual(codex.argv({ model: 'gpt-5-codex', schemaFile: '/r/schema.json', timeoutSeconds: 2700, prompt: 'P' }), [
    '/opt/codex',
    'exec',
    'P',
    '--model',
    'gpt-5-codex',
    '--json',
    '--sandbox',
    'workspace-write',
  ])
  assert.equal(createCodex({ groups: GROUPS }).argv({ model: 'm', prompt: 'P' })[0], 'codex')
})

test('parse reads a clean run: the last agent message is the answer, its JSON the structured output, the turn its usage', () => {
  const codex = createCodex({ groups: GROUPS })
  const stdout = jsonl(reasoning, message('first draft'), message(APPROVE), turn(CODEX_USAGE))
  assert.deepEqual(codex.parse({ stdout, stderr: '', exitCode: 0 }, { required: ['verdict'] }), {
    clean: true,
    reason: null,
    structured: { verdict: 'approve', summary: 'done' },
    usage: USAGE,
    conversation: null,
  })
})

test('parse finds the JSON in a fenced block inside prose', () => {
  const codex = createCodex({ groups: GROUPS })
  const text = `Reviewed the diff.\n\n\`\`\`json\n${APPROVE}\n\`\`\`\n\nNothing else.`
  const parsed = codex.parse({ stdout: jsonl(message(text), turn(CODEX_USAGE)), stderr: '', exitCode: 0 }, { required: ['verdict'] })
  assert.equal(parsed.clean, true)
  assert.deepEqual(parsed.structured, { verdict: 'approve', summary: 'done' })
})

test('parse fails a structured output that lacks a required field, with no structured output', () => {
  const codex = createCodex({ groups: GROUPS })
  const parsed = codex.parse({ stdout: jsonl(message(APPROVE), turn(CODEX_USAGE)), stderr: '', exitCode: 0 }, { required: ['verdict', 'files'] })
  assert.deepEqual([parsed.clean, parsed.reason, parsed.structured], [false, 'missing files', null])
})

test('parse fails a non-zero exit with the first non-empty stderr line, even when the answer is there', () => {
  const codex = createCodex({ groups: GROUPS })
  const stdout = jsonl(message(APPROVE), turn(CODEX_USAGE))
  assert.equal(codex.parse({ stdout, stderr: '\n\nerror: model not found\nmore\n', exitCode: 1 }).reason, 'exit 1: error: model not found')
  assert.equal(codex.parse({ stdout, stderr: '', exitCode: 2 }).reason, 'exit 2')
})

test('parse fails a quota message in stderr or stdout before any other rule', () => {
  const codex = createCodex({ groups: GROUPS })
  const stdout = jsonl(message(APPROVE), turn(CODEX_USAGE))
  assert.equal(codex.parse({ stdout, stderr: 'ERROR: Rate limit reached\n', exitCode: 1 }).reason, 'quota: ERROR: Rate limit reached')
  const limited = codex.parse({ stdout: 'Error: usage limit reached\n', stderr: '', exitCode: 1 })
  assert.deepEqual([limited.clean, limited.reason], [false, 'quota: Error: usage limit reached'])
})

test('parse fails empty output as no result, and an answer with no JSON as no structured output', () => {
  const codex = createCodex({ groups: GROUPS })
  assert.deepEqual(codex.parse({ stdout: '', stderr: '', exitCode: 0 }, { required: ['verdict'] }), {
    clean: false,
    reason: 'no result',
    structured: null,
    usage: ZERO,
    conversation: null,
  })
  assert.equal(codex.parse({ stdout: jsonl(message('   '), turn(CODEX_USAGE)), stderr: '', exitCode: 0 }).reason, 'no result')
  assert.equal(codex.parse({ stdout: jsonl(message('Looks good, no JSON here.')), stderr: '', exitCode: 0 }).reason, 'no structured output')
})

test('usage is read from the last turn that reports it, skipping lines that are not events, and is zero when none does', () => {
  const codex = createCodex({ groups: GROUPS })
  const earlier = turn({ input_tokens: 5, cached_input_tokens: 0, output_tokens: 1 })
  const twoTurns = `WARN starting up\n${jsonl(message(APPROVE), earlier, turn(CODEX_USAGE))}`
  assert.deepEqual(codex.parse({ stdout: twoTurns, stderr: '', exitCode: 0 }).usage, USAGE)
  assert.deepEqual(codex.parse({ stdout: jsonl(message(APPROVE)), stderr: '', exitCode: 0 }).usage, ZERO)
  // A failed run still reports the usage its events carry.
  assert.deepEqual(codex.parse({ stdout: jsonl(message('no json'), turn(CODEX_USAGE)), stderr: '', exitCode: 1 }).usage, USAGE)
  assert.deepEqual(codex.parse({ stdout: 'garbage', stderr: '', exitCode: 0 }).usage, ZERO)
})

test('usageDelta gives the current usage, since codex reports each call on its own', () => {
  const codex = createCodex({ groups: GROUPS })
  assert.equal(codex.usageDelta({ input: 5, output: 5, thinking: 0, cacheRead: 0, total: 10 }, USAGE), USAGE)
  assert.equal(codex.usageDelta(null, USAGE), USAGE)
})

test('version gives the trimmed first line of codex --version, or null when it cannot be read', () => {
  const { exec, calls } = stubExec([ok('  codex-cli 0.9.1  \nsecond line\n')])
  assert.equal(createCodex({ groups: GROUPS, exec }).version(), 'codex-cli 0.9.1')
  assert.deepEqual(calls[0].argv, ['codex', '--version'])
  assert.equal(createCodex({ groups: GROUPS, exec: stubExec([ok('')]).exec }).version(), null)
  assert.equal(createCodex({ groups: GROUPS, exec: stubExec([{ status: 2, stdout: '', stderr: 'unknown flag' }]).exec }).version(), null)
  assert.equal(createCodex({ groups: GROUPS, exec: stubExec([new Error('ENOENT')]).exec }).version(), null)
})

test('installed follows the PATH', (t) => {
  const dir = tempDir(t)
  const exe = path.join(dir, 'codex')
  fs.writeFileSync(exe, '#!/bin/sh\n')
  fs.chmodSync(exe, 0o755)
  assert.equal(createCodex({ groups: GROUPS, env: { PATH: dir } }).installed(), true)
  assert.equal(createCodex({ groups: GROUPS, env: { PATH: '/nowhere' } }).installed(), false)
})
