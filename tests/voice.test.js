'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir } = require('./helpers.js')
const { ownerMessages, findTranscript, render } = require('../plugins/aether/lib/voice.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const VOICE_BIN = path.join(PLUGIN, 'bin', 'aether-voice')

// Records shaped like Claude Code 2.1.294 transcripts.
const human = (content, time = '2026-10-08T18:00:00.000Z', extra = {}) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content }, ...extra })
const record = (fields) => JSON.stringify({ type: 'user', isSidechain: false, timestamp: '2026-10-08T18:00:00.000Z', ...fields })

test('keeps the owner messages in order, with their times', () => {
  const lines = [
    human('hola', '2026-10-08T18:00:00.000Z'),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }),
    human('diseña esto', '2026-10-08T18:05:00.000Z'),
  ]
  assert.deepEqual(ownerMessages(lines), [
    { time: '2026-10-08T18:00:00.000Z', text: 'hola', typed: false },
    { time: '2026-10-08T18:05:00.000Z', text: 'diseña esto', typed: false },
  ])
})

test('joins text blocks and marks images', () => {
  const content = [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    { type: 'text', text: '[Image #1] mira esto' },
    { type: 'text', text: 'y esto' },
  ]
  assert.deepEqual(ownerMessages([human(content)]), [{ time: '2026-10-08T18:00:00.000Z', text: '[image]\n\n[Image #1] mira esto\n\ny esto', typed: false }])
})

test('leaves out tool results, skill loads, notifications, sidechains and compaction summaries', () => {
  const lines = [
    record({ toolUseResult: { stdout: 'x' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }] } }),
    record({ isMeta: true, sourceToolUseID: 't2', message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: /x' }] } }),
    record({ origin: { kind: 'task-notification' }, message: { role: 'user', content: '<task-notification> done' } }),
    human('a prompt inside a subagent', undefined, { isSidechain: true }),
    record({ isCompactSummary: true, message: { role: 'user', content: 'This session is being continued from a previous conversation.' } }),
    human('the only one'),
  ]
  assert.deepEqual(ownerMessages(lines).map((m) => m.text), ['the only one'])
})

test('a human message that starts with "<" is still the owner speaking', () => {
  assert.deepEqual(ownerMessages([human('<div> esto no se ve bien')]).map((m) => m.text), ['<div> esto no se ve bien'])
})

test('records without an origin field fall back to their shape', () => {
  const lines = [
    record({ message: { role: 'user', content: 'an older record from the owner' } }),
    record({ message: { role: 'user', content: '<command-name>/model</command-name>' } }),
    record({ isMeta: true, message: { role: 'user', content: 'a meta record' } }),
  ]
  assert.deepEqual(ownerMessages(lines).map((m) => m.text), ['an older record from the owner'])
})

// Issue 014: the shapes below are Claude Code's records for a message typed mid-turn.
const queued = (prompt, time = '2026-10-08T18:10:00.000Z', extra = {}) =>
  JSON.stringify({ type: 'attachment', isSidechain: false, timestamp: time, attachment: { type: 'queued_command', prompt, commandMode: 'prompt', humanTurn: true, timestamp: time, ...extra } })

test('a message the owner sends mid-turn counts as their words (issue 014)', () => {
  const lines = [human('hola'), queued('ire a dormir trbaja autonomamente'), human('sigo aqui', '2026-10-08T18:20:00.000Z')]
  assert.deepEqual(ownerMessages(lines), [
    { time: '2026-10-08T18:00:00.000Z', text: 'hola', typed: false },
    { time: '2026-10-08T18:10:00.000Z', text: 'ire a dormir trbaja autonomamente', typed: false },
    { time: '2026-10-08T18:20:00.000Z', text: 'sigo aqui', typed: false },
  ])
})

test('queued commands that are not owner prompts stay out (issue 014)', () => {
  const lines = [
    queued('<task-notification> done', '2026-10-08T18:10:00.000Z', { commandMode: 'task-notification' }),
    JSON.stringify({ type: 'queue-operation', operation: 'enqueue', timestamp: '2026-10-08T18:11:00.000Z', content: 'ire a dormir trbaja autonomamente' }),
    JSON.stringify({ type: 'attachment', isSidechain: true, timestamp: '2026-10-08T18:12:00.000Z', attachment: { type: 'queued_command', prompt: 'a subagent prompt', commandMode: 'prompt' } }),
  ]
  assert.deepEqual(ownerMessages(lines), [])
})

test('cuts a message over the limit and says how much was cut', () => {
  const [long] = ownerMessages([human('a'.repeat(8010))])
  assert.equal(long.text, `${'a'.repeat(8000)}\n[… 10 more characters cut]`)
  const [short] = ownerMessages([human('b'.repeat(30))], { maxChars: 20 })
  assert.equal(short.text, `${'b'.repeat(20)}\n[… 10 more characters cut]`)
})

test('skips lines that are empty or not JSON', () => {
  assert.deepEqual(ownerMessages(['{not json', '', human('ok')]).map((m) => m.text), ['ok'])
})

test('render numbers the messages under a heading with the session id', () => {
  const messages = [
    { time: '2026-10-08T18:00:00.000Z', text: 'hola' },
    { time: '2026-10-08T18:05:00.000Z', text: 'sí' },
  ]
  assert.equal(
    render('s-1', messages),
    "# The owner's messages (session s-1)\n\n## 1. 2026-10-08T18:00:00.000Z\n\nhola\n\n## 2. 2026-10-08T18:05:00.000Z\n\nsí\n",
  )
  assert.equal(render('s-1', []), "# The owner's messages (session s-1)\n\nNo messages from the owner yet.\n")
})

test('findTranscript looks for the session in every project folder', (t) => {
  const config = tempDir(t, 'aether-config-')
  const dir = path.join(config, 'projects', '-home-someone-repo--worktrees-x')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'abc.jsonl'), '')
  assert.equal(findTranscript('abc', { configDir: config }), path.join(dir, 'abc.jsonl'))
  assert.equal(findTranscript('missing', { configDir: config }), null)
  assert.equal(findTranscript('../abc', { configDir: config }), null)
  assert.equal(findTranscript('abc', { configDir: path.join(config, 'nowhere') }), null)
})

function voice(args, env) {
  return spawnSync(process.execPath, [VOICE_BIN, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
}

function transcript(t, sessionId, lines) {
  const config = tempDir(t, 'aether-config-')
  const dir = path.join(config, 'projects', '-repo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), lines.join('\n') + '\n')
  return config
}

test('aether-voice prints the owner messages of the session in CLAUDE_CODE_SESSION_ID', (t) => {
  const config = transcript(t, 'sess-1', [human('hola'), human('sí, es buena idea', '2026-10-08T18:05:00.000Z')])
  const r = voice([], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: 'sess-1' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(
    r.stdout,
    "# The owner's messages (session sess-1)\n\n## 1. 2026-10-08T18:00:00.000Z\n\nhola\n\n## 2. 2026-10-08T18:05:00.000Z\n\nsí, es buena idea\n",
  )
})

test('aether-voice --session wins over the environment', (t) => {
  const config = transcript(t, 'lead', [human('from the lead session')])
  const r = voice(['--session', 'lead'], { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: 'other' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /from the lead session/)
})

test('aether-voice fails clearly without a session id or a transcript', (t) => {
  const config = tempDir(t, 'aether-config-')
  for (const args of [[], ['--session']]) {
    const r = voice(args, { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: '' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /no session id/i)
    assert.equal(r.stdout, '')
  }
  const r = voice(['--session', 'nope'], { CLAUDE_CONFIG_DIR: config })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /no transcript for session nope/i)
})

// From the final review of run 20261008-134400-d48f.
test('meta, compaction and tool records are left out even when they carry a human origin', () => {
  const lines = [
    human('a compaction summary', undefined, { isCompactSummary: true }),
    human('a skill load', undefined, { isMeta: true }),
    human('a tool result', undefined, { toolUseResult: { stdout: 'x' } }),
    human('the owner'),
  ]
  assert.deepEqual(ownerMessages(lines).map((m) => m.text), ['the owner'])
})

test('findTranscript skips folders it cannot read instead of throwing', (t) => {
  const config = tempDir(t, 'aether-config-')
  const locked = path.join(config, 'projects', '-a-locked')
  const open = path.join(config, 'projects', '-b-open')
  fs.mkdirSync(locked, { recursive: true })
  fs.mkdirSync(open, { recursive: true })
  fs.writeFileSync(path.join(config, 'projects', 'stray-file'), '')
  fs.writeFileSync(path.join(open, 'abc.jsonl'), '')
  fs.chmodSync(locked, 0o000)
  try {
    assert.equal(findTranscript('abc', { configDir: config }), path.join(open, 'abc.jsonl'))
  } finally {
    fs.chmodSync(locked, 0o755)
  }
})

// Spec 034: a message is typed only when its record's entrypoint is cli, the entrypoint Claude Code gives a session with a terminal.
test('a message is typed only from a cli entrypoint', () => {
  const typedAt = (entrypoint) => ownerMessages([human('una frase del dueño', undefined, { entrypoint })])[0].typed
  assert.equal(typedAt('cli'), true)
  assert.equal(typedAt('sdk-cli'), false)
  assert.equal(typedAt('desktop'), false)
  assert.equal(typedAt(undefined), false)
  assert.equal(typedAt(42), false)
})

// The queued prompt carries its own entrypoint on the attachment record, read in real transcripts (spec 034, D1).
const queuedAt = (prompt, entrypoint, time = '2026-10-08T18:10:00.000Z') =>
  JSON.stringify({ type: 'attachment', isSidechain: false, timestamp: time, ...(entrypoint === undefined ? {} : { entrypoint }), attachment: { type: 'queued_command', prompt, commandMode: 'prompt', humanTurn: true, timestamp: time } })

test('a queued prompt is typed from its own record, and its text and time do not change', () => {
  const at = (entrypoint) => ownerMessages([queuedAt('cambia de rama tras el turno', entrypoint)])
  assert.deepEqual(at('cli'), [{ time: '2026-10-08T18:10:00.000Z', text: 'cambia de rama tras el turno', typed: true }])
  assert.deepEqual(at('sdk-cli'), [{ time: '2026-10-08T18:10:00.000Z', text: 'cambia de rama tras el turno', typed: false }])
  assert.deepEqual(at(undefined), [{ time: '2026-10-08T18:10:00.000Z', text: 'cambia de rama tras el turno', typed: false }])
})

test('grant takes its quote only from a typed queued prompt (spec 034)', (t) => {
  const quote = 'apruebo merge a main en esta ocasion y en todas las futuras'
  for (const [entrypoint, accepted] of [['cli', true], ['sdk-cli', false], [undefined, false]]) {
    const configDir = tempDir(t, 'aether-config-')
    const folder = path.join(configDir, 'projects', '-repo')
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'queued.jsonl'), queuedAt(quote, entrypoint) + '\n')
    const mainRoot = tempDir(t, 'aether-repo-')
    const r = autonomy.grant(mainRoot, { class: 'merge-main', quote, session: 'queued' }, { configDir })
    assert.equal(r.ok, accepted, `entrypoint ${entrypoint}: ${r.reason || ''}`)
  }
})

test('aether-voice fails clearly when it cannot read the transcript', (t) => {
  if (process.getuid && process.getuid() === 0) return t.skip('root reads any file')
  const config = transcript(t, 'locked', [human('x')])
  const file = path.join(config, 'projects', '-repo', 'locked.jsonl')
  fs.chmodSync(file, 0o000)
  try {
    const r = voice(['--session', 'locked'], { CLAUDE_CONFIG_DIR: config })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /cannot read the transcript of session locked/)
    assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace')
  } finally {
    fs.chmodSync(file, 0o644)
  }
})
