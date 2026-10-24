'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const { redact } = require(path.join(PLUGIN, 'lib', 'observe-redact.js'))
const dev = require(path.join(PLUGIN, 'lib', 'observe-dev.js'))

const KEY = 'sk-ant-api03-' + 'A1b2C3d4'.repeat(6)
const GH = 'ghp_' + 'a1B2c3D4e5'.repeat(3) + 'abcdef'
const AWS = 'AKIAIOSFODNN7EXAMPLE'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const HEX = 'ab12'.repeat(10)

test('redact removes keys, tokens and secret-named values and keeps the rest (R11)', () => {
  const text = [
    `ANTHROPIC_API_KEY=${KEY}`, `token ${GH}`, `aws ${AWS}`, `jwt ${JWT}`, 'Authorization: Bearer abc123def456ghi789',
    'password: hunter2hunter2', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\n-----END PRIVATE KEY-----',
    `hex ${HEX}`, 'the build failed with ENOENT on line 12',
  ].join('\n')
  const out = redact(text)
  for (const secret of [KEY, GH, AWS, JWT, 'abc123def456ghi789', 'hunter2hunter2', 'MIIEvQIBADANBgkq', HEX]) assert.equal(out.includes(secret), false, secret)
  assert.ok(out.includes('the build failed with ENOENT on line 12'))
  assert.ok(out.includes('[redacted]'))
  assert.equal(redact('plain text'), 'plain text')
})

const lines = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n'
const U = (text) => ({ type: 'user', message: { role: 'user', content: text } })
const A = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const TU = (name, input) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } })
const TR = (text) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: text }] } })

test('fragmentFrom takes the last records, cut and redacted, never the whole conversation (R11)', () => {
  const records = []
  for (let i = 0; i < 20; i++) records.push(U(`early message ${i}`))
  records.push(A('I will run the build'), TU('Bash', { command: `curl -H "Authorization: Bearer ${KEY}" x` }), TR(`ENOENT: no such file ${'x'.repeat(2000)}`), U('please look at it'))
  const fragment = dev.fragmentFrom(lines(records) + 'not json\n', { records: 6, maxChars: 400 })
  assert.deepEqual(fragment.map((r) => r.role), ['user', 'user', 'assistant', 'assistant', 'user', 'user'])
  assert.deepEqual(fragment.map((r) => r.kind), ['text', 'text', 'text', 'tool_use', 'tool_result', 'text'])
  assert.ok(fragment.every((r) => r.text.length <= 400))
  const json = JSON.stringify(fragment)
  assert.ok(json.includes('ENOENT'))
  assert.equal(json.includes(KEY), false)
  assert.equal(json.includes('early message 0'), false)
})

test('captureFragment writes a private file under observe/dev, caps them and never throws (R11)', (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 't.jsonl')
  fs.writeFileSync(file, lines([U('start'), TR(`ENOENT near ${GH}`)]))
  const written = dev.captureFragment({ dataDir: dir, session: 's-1', event: 'PostToolUseFailure', input: { transcript_path: file }, now: 1700 })
  assert.equal(written, path.join(dir, 'observe', 'dev', 's-1', '1700-PostToolUseFailure.json'))
  assert.equal(fs.statSync(written).mode & 0o777, 0o600)
  const saved = fs.readFileSync(written, 'utf8')
  assert.ok(saved.includes('ENOENT'))
  assert.equal(saved.includes(GH), false)
  assert.equal(JSON.parse(saved).event, 'PostToolUseFailure')
  assert.equal(dev.captureFragment({ dataDir: dir, session: 's-1', event: 'StopFailure', input: { transcript_path: path.join(dir, 'missing.jsonl') }, now: 1 }), null)
  assert.equal(dev.captureFragment({ dataDir: dir, session: 's-1', event: 'StopFailure', input: {}, now: 1 }), null)
  assert.equal(dev.captureFragment({ dataDir: dir, session: 's-1', event: 'StopFailure', input: null, now: 1 }), null)
  for (let i = 0; i < 50; i++) assert.ok(dev.captureFragment({ dataDir: dir, session: 's-2', event: 'PreCompact', input: { transcript_path: file }, now: i }))
  assert.equal(dev.captureFragment({ dataDir: dir, session: 's-2', event: 'PreCompact', input: { transcript_path: file }, now: 99 }), null)
  assert.equal(fs.readdirSync(path.join(dir, 'observe', 'dev', 's-2')).length, 50)
})
