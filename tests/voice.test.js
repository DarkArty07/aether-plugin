'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir } = require('./helpers.js')
const { ownerMessages, findTranscript, render } = require('../plugins/aether/lib/voice.js')

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
    { time: '2026-10-08T18:00:00.000Z', text: 'hola' },
    { time: '2026-10-08T18:05:00.000Z', text: 'diseña esto' },
  ])
})

test('joins text blocks and marks images', () => {
  const content = [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    { type: 'text', text: '[Image #1] mira esto' },
    { type: 'text', text: 'y esto' },
  ]
  assert.deepEqual(ownerMessages([human(content)]), [{ time: '2026-10-08T18:00:00.000Z', text: '[image]\n\n[Image #1] mira esto\n\ny esto' }])
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
