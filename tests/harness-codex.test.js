'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const { createCodex, CODEX_NOTE } = require('../plugins/aether/lib/harness/codex.js')

const GROUPS = { codex: 'Codex plan' }
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

const FAKE = path.join(__dirname, 'fixtures', 'fake-codex.js')
const CODE = path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'harness', 'codex.js')
const schemaIn = (t) => {
  const file = path.join(tempDir(t), 'schema.json')
  fs.writeFileSync(file, JSON.stringify({ type: 'object', properties: { answer: { type: 'string' }, extra: { type: 'string' } }, required: ['answer'] }))
  return file
}

test('argv runs one headless exec: the model and effort of the pair, JSON events, the sandbox on, no approvals, none of the owner\'s setup', (t) => {
  const schemaFile = schemaIn(t)
  const codex = createCodex({ command: '/opt/codex', groups: GROUPS })
  assert.deepEqual(codex.argv({ model: 'gpt-6.1-terra', level: 'medium', schemaFile, timeoutSeconds: 2700, prompt: 'P' }), [
    '/opt/codex', 'exec', `${CODEX_NOTE}\n\nP`, '--model', 'gpt-6.1-terra', '-c', 'model_reasoning_effort=medium', '--json', '--sandbox', 'workspace-write',
    '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--disable', 'hooks', '--disable', 'apps', '--disable', 'browser_use', '--disable', 'browser_use_external', '--disable', 'computer_use', '--disable', 'plugins', '--disable', 'multi_agent', '-c', 'approval_policy=never',
    '--output-schema', schemaFile,
  ])
  const bare = createCodex({ groups: GROUPS }).argv({ model: 'm', level: 'low', prompt: 'P' })
  assert.equal(bare[0], 'codex')
  assert.equal(bare.includes('--output-schema'), false)
})

test('the prompt carries the note that keeps the owner\'s AGENTS.md orders out, and nothing else changes in it', () => {
  const argv = createCodex({ groups: GROUPS }).argv({ model: 'm', level: 'low', prompt: 'DO THE TASK' })
  assert.equal(argv[2], `${CODEX_NOTE}\n\nDO THE TASK`)
  assert.match(CODEX_NOTE, /headless worker/)
  assert.match(CODEX_NOTE, /start no subagents/)
  assert.match(CODEX_NOTE, /do not run git add or git commit/, 'the sandbox keeps .git read-only, so codex must leave the commit to Aether')
  assert.equal(argv.some((arg) => arg.startsWith('project_doc_max_bytes')), false, 'the option that did not work is gone')
})

test('the effort goes to codex under the name of the pair, for each of the five levels', () => {
  const codex = createCodex({ groups: GROUPS })
  for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
    assert.ok(codex.argv({ model: 'gpt-6-luna', level, prompt: 'P' }).includes(`model_reasoning_effort=${level}`), level)
  }
})

test('argv passes none of the flags that open the sandbox or reach the owner\'s setup', () => {
  const argv = createCodex({ groups: GROUPS }).argv({ model: 'm', level: 'high', prompt: 'P' })
  for (const flag of ['--dangerously-bypass-approvals-and-sandbox', '--dangerously-bypass-hook-trust', '--full-auto', '--approve-for-me', '--add-dir', '--oss', '--profile', '-p', '--cd', '--worktree']) {
    assert.equal(argv.includes(flag), false, flag)
  }
})

test('the schema file is rewritten strict for codex, and codex gets it in --output-schema, not in the prompt', (t) => {
  const schemaFile = schemaIn(t)
  const codex = createCodex({ groups: GROUPS })
  assert.equal(codex.schemaInPrompt, false)
  codex.argv({ model: 'm', level: 'low', schemaFile, prompt: 'P' })
  const written = JSON.parse(fs.readFileSync(schemaFile, 'utf8'))
  assert.equal(written.additionalProperties, false)
  assert.deepEqual(written.required, ['answer', 'extra'])
  const missing = path.join(tempDir(t), 'nope.json')
  assert.ok(codex.argv({ model: 'm', level: 'low', schemaFile: missing, prompt: 'P' }).includes(missing), 'a missing file does not stop argv')
})

test('modelArg gives codex the bare model id, since its effort goes in its own flag', () => {
  assert.equal(createCodex({ groups: GROUPS }).modelArg({ model: 'gpt-5-codex', level: 'high' }), 'gpt-5-codex')
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

test('a quota word is no quota failure by itself: only a datum or a reading makes one', () => {
  const codex = createCodex({ groups: GROUPS })
  const ok = jsonl(message(APPROVE), turn(CODEX_USAGE))
  assert.equal(codex.parse({ stdout: ok, stderr: 'ERROR: Rate limit reached\n', exitCode: 1 }).reason, 'exit 1: ERROR: Rate limit reached')
  assert.equal(codex.parse({ stdout: 'Error: usage limit reached\n', stderr: '', exitCode: 1 }).reason, 'exit 1')
  assert.equal(codex.parse({ stdout: jsonl({ type: 'error', message: 'usage limit reached' }), stderr: '', exitCode: 1 }).reason, 'exit 1')
  assert.equal(codex.parse({ stdout: jsonl({ type: 'turn.failed', error: { message: 'You have hit your usage limit' } }), stderr: '', exitCode: 1 }).reason, 'exit 1')
})

test('a clean answer stays clean, whatever the command output or the answer text says about limits', () => {
  const codex = createCodex({ groups: GROUPS })
  const commandOutput = { type: 'item.completed', item: { id: 'item_2', type: 'command_execution', aggregated_output: '# pass 429\n', exit_code: 0 } }
  const limitTalk = message('{"verdict":"approve","summary":"done"} The rate limit of the API is documented.')
  for (const stdout of [jsonl(commandOutput, message(APPROVE), turn(CODEX_USAGE)), jsonl(limitTalk, turn(CODEX_USAGE))]) {
    const parsed = codex.parse({ stdout, stderr: '', exitCode: 0 }, { required: ['verdict'] })
    assert.deepEqual([parsed.clean, parsed.reason], [true, null])
  }
})

test('a non-zero codex run with no quota text gives its exit and the first stderr line', () => {
  const codex = createCodex({ groups: GROUPS })
  const stdout = jsonl({ type: 'error', message: 'sandbox denied' })
  assert.equal(codex.parse({ stdout, stderr: 'error: sandbox denied\n', exitCode: 2 }).reason, 'exit 2: error: sandbox denied')
})

test('parse without an exit code is a non-zero exit, exit unknown', () => {
  const codex = createCodex({ groups: GROUPS })
  assert.equal(codex.parse({ stdout: jsonl(message(APPROVE), turn(CODEX_USAGE)), stderr: '' }, { required: ['verdict'] }).reason, 'exit unknown')
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

test('the fake codex runs the argv of the adapter in a working directory, and parse reads what it prints', (t) => {
  const cwd = tempDir(t)
  const log = path.join(tempDir(t), 'log')
  const env = { ...process.env, AETHER_FAKE_CODEX_LOG: log, AETHER_FAKE_CODEX_SCRIPT: JSON.stringify({ answer: APPROVE, files: { 'out.txt': 'x' } }) }
  const codex = createCodex({ command: FAKE, groups: GROUPS })
  const argv = codex.argv({ model: 'gpt-6-luna', level: 'low', prompt: 'P' })
  const r = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(fs.readFileSync(path.join(cwd, 'out.txt'), 'utf8'), 'x')
  const parsed = codex.parse({ stdout: r.stdout, stderr: r.stderr, exitCode: r.status }, { required: ['verdict'] })
  assert.deepEqual([parsed.clean, parsed.structured, parsed.usage], [true, { verdict: 'approve', summary: 'done' }, USAGE])
  const [entry] = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(entry.kind, 'exec')
  assert.equal(fs.realpathSync(entry.cwd), fs.realpathSync(cwd))
})

test('the real events of codex exec --json, captured on 2026-10-29, read as a clean run', () => {
  const stdout = fs.readFileSync(path.join(__dirname, 'fixtures', 'codex', 'exec-events.jsonl'), 'utf8')
  const parsed = createCodex({ groups: GROUPS }).parse({ stdout, stderr: '', exitCode: 0 }, { required: [] })
  assert.equal(parsed.clean, true, parsed.reason)
  assert.deepEqual(parsed.structured, { ok: true })
  assert.ok(parsed.usage.input > 0 && parsed.usage.output > 0, JSON.stringify(parsed.usage))
})

test('no code of the adapter opens the owner\'s credentials or uses an API key, and the comment about unchecked events is gone', () => {
  const source = fs.readFileSync(CODE, 'utf8')
  const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  assert.equal(/auth\.json|OPENAI_API_KEY|CODEX_HOME/.test(code), false)
  assert.equal(/not yet checked against the installed codex/.test(source), false)
})
