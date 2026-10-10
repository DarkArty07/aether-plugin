'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tempDir } = require('./helpers.js')

const FAKE = path.join(__dirname, 'fixtures', 'fake-model.js')

// Starts the fake model and resolves with its port once it prints "listening <port>".
function startFake(t, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [FAKE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    t.after(() => child.kill('SIGTERM'))
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
      const m = /^listening (\d+)\n/.exec(out)
      if (m) resolve(Number(m[1]))
    })
    child.once('exit', (code) => reject(new Error(`the fake model exited with ${code}: ${out}`)))
  })
}

const post = (port, url, body) =>
  fetch(`http://127.0.0.1:${port}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// The frames of an event-stream body, as [{ event, data }].
function frames(text) {
  return text
    .trim()
    .split('\n\n')
    .map((frame) => {
      const [eventLine, dataLine] = frame.split('\n')
      return { event: eventLine.replace(/^event: /, ''), data: JSON.parse(dataLine.replace(/^data: /, '')) }
    })
}

const TOOLS = [{ name: 'Bash', input_schema: { type: 'object' } }]
const user = (text) => ({ role: 'user', content: [{ type: 'text', text }] })
const toolResult = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] }

test('record mode binds a free port, writes it, saves each request and answers 400', async (t) => {
  const out = tempDir(t)
  const port = await startFake(t, ['--out', out])
  assert.ok(port > 0)
  assert.equal(fs.readFileSync(path.join(out, 'port'), 'utf8'), `${port}\n`)
  const r = await post(port, '/v1/messages?beta=true', { model: 'claude-sonnet-5-5', stream: true, tools: TOOLS, messages: [user('hi')] })
  assert.equal(r.status, 400)
  assert.deepEqual(await r.json(), { type: 'error', error: { type: 'invalid_request_error', message: 'fake model' } })
  const saved = JSON.parse(fs.readFileSync(path.join(out, 'req-1.json'), 'utf8'))
  assert.equal(saved.url, '/v1/messages?beta=true')
  assert.equal(saved.body.model, 'claude-sonnet-5-5')
})

test('count_tokens answers a fixed count and is not saved, and other paths get 404', async (t) => {
  const out = tempDir(t)
  const port = await startFake(t, ['--out', out])
  const r = await post(port, '/v1/messages/count_tokens?beta=true', { model: 'm', messages: [] })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { input_tokens: 100 })
  assert.equal((await post(port, '/v1/other', {})).status, 404)
  assert.equal(fs.existsSync(path.join(out, 'req-1.json')), false)
})

test('script mode streams the scripted tool call, then the next reply after a tool result', async (t) => {
  const out = tempDir(t)
  const script = path.join(out, 'script.json')
  fs.writeFileSync(script, JSON.stringify([{ match: 'HELLO', replies: [{ bash: 'echo hi' }, { text: 'bye' }] }]))
  const port = await startFake(t, ['--out', out, '--script', script])
  const first = await post(port, '/v1/messages', { model: 'claude-haiku-5-5', stream: true, tools: TOOLS, messages: [user('say HELLO')] })
  assert.equal(first.status, 200)
  assert.match(first.headers.get('content-type'), /text\/event-stream/)
  const f = frames(await first.text())
  assert.deepEqual(
    f.map((x) => x.event),
    ['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'],
  )
  assert.equal(f[0].data.message.model, 'claude-haiku-5-5')
  assert.deepEqual(f[1].data.content_block, { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} })
  assert.deepEqual(JSON.parse(f[2].data.delta.partial_json), { command: 'echo hi', description: 'fake model' })
  assert.equal(f[4].data.delta.stop_reason, 'tool_use')
  const second = await post(port, '/v1/messages', {
    model: 'claude-haiku-5-5',
    stream: true,
    tools: TOOLS,
    messages: [user('say HELLO'), { role: 'assistant', content: [] }, toolResult],
  })
  const g = frames(await second.text())
  assert.deepEqual(g[1].data.content_block, { type: 'text', text: '' })
  assert.deepEqual(g[2].data.delta, { type: 'text_delta', text: 'bye' })
  assert.equal(g[4].data.delta.stop_reason, 'end_turn')
  const log = fs.readFileSync(path.join(out, 'fake.log'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(log.map((l) => [l.n, l.k, l.reply]), [[1, 0, 'Bash'], [2, 1, 'text']])
})

test('no tools, a match hidden in a system reminder, and a missing reply give text; a tool block comes back whole', async (t) => {
  const out = tempDir(t)
  const script = path.join(out, 'script.json')
  fs.writeFileSync(script, JSON.stringify([{ match: 'HELLO', replies: [{ tool: 'Write', input: { file_path: '/x', content: 'y' } }] }]))
  const port = await startFake(t, ['--out', out, '--script', script])
  const noTools = await post(port, '/v1/messages', { model: 'm', messages: [user('HELLO')] })
  assert.deepEqual((await noTools.json()).content, [{ type: 'text', text: 'ok' }])
  const hidden = await post(port, '/v1/messages', {
    model: 'm',
    tools: TOOLS,
    messages: [{ role: 'user', content: [{ type: 'text', text: '<system-reminder>HELLO</system-reminder>' }, { type: 'text', text: 'other' }] }],
  })
  const body = await hidden.json()
  assert.equal(body.stop_reason, 'end_turn')
  assert.deepEqual(body.content, [{ type: 'text', text: 'ok' }])
  const tool = await post(port, '/v1/messages', { model: 'm', tools: TOOLS, messages: [user('HELLO')] })
  const call = await tool.json()
  assert.equal(call.stop_reason, 'tool_use')
  assert.deepEqual(call.content, [{ type: 'tool_use', id: 'toolu_3', name: 'Write', input: { file_path: '/x', content: 'y' } }])
  const after = await post(port, '/v1/messages', { model: 'm', tools: TOOLS, messages: [user('HELLO'), { role: 'assistant', content: [] }, toolResult] })
  assert.deepEqual((await after.json()).content, [{ type: 'text', text: 'done' }])
})
