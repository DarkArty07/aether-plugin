'use strict'

// R14: the Muse reader speaks JSON-RPC 2.0 over `muse serve` with the
// read-only flags, asks initialize, initialized and model/list and nothing
// else, and never leaves a process behind. Every test uses a fake `muse`
// executable put first on PATH; the real `muse` is never called.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const { listMuseModels } = require(path.join(PLUGIN, 'lib', 'muse-models.js'))

const FIVE_IDS = ['muse-wonder-1.0', 'muse-wonder-full-1.0', 'muse-ember-1.0', 'muse-spark-1.3', 'muse-spark-1.2']

function serverScript() {
  return `#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const dir = process.env.FAKE_MUSE_DIR
fs.writeFileSync(path.join(dir, 'pid'), String(process.pid))
fs.writeFileSync(path.join(dir, 'argv.json'), JSON.stringify(process.argv.slice(2)))
const mode = process.env.FAKE_MUSE_MODE
if (mode === 'exit1') process.exit(1)
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let idx
  while ((idx = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, idx)
    buf = buf.slice(idx + 1)
    if (!line.trim()) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.method) fs.appendFileSync(path.join(dir, 'log.jsonl'), JSON.stringify({ method: msg.method }) + '\\n')
    if (msg.method === 'initialize') {
      if (mode === 'hang') continue
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'muse' } } }) + '\\n')
    } else if (msg.method === 'model/list') {
      if (mode === 'hang') continue
      if (mode === 'error') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32600, message: 'bad' } }) + '\\n')
      } else if (mode === 'empty') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { models: [] } }) + '\\n')
      } else if (mode === 'noarray') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: {} }) + '\\n')
      } else if (mode === 'garbage') {
        process.stdout.write('this is not json\\n')
      } else if (mode === 'fallback') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { models: [{ id: 'second' }, { modelId: 'first' }, { modelId: 'third', id: 'ignored' }] } }) + '\\n')
      } else if (mode === 'five') {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { models: [{ modelId: 'muse-wonder-1.0' }, { modelId: 'muse-wonder-full-1.0' }, { modelId: 'muse-ember-1.0' }, { modelId: 'muse-spark-1.3' }, { modelId: 'muse-spark-1.2' }], profileId: null, providerId: 'meta', source: 'providerCatalog' } }) + '\\n')
      } else {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { models: [{ modelId: 'muse-wonder-1.0' }, { modelId: 'muse-ember-1.0' }], profileId: null, providerId: 'meta', source: 'providerCatalog' } }) + '\\n')
      }
    }
  }
})
`
}

function fakeMuse(t, mode) {
  const dir = tempDir(t, 'aether-fake-muse-')
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin, { recursive: true })
  const file = path.join(bin, 'muse')
  // The hang fake is a shell script on purpose: it starts in milliseconds
  // even under CPU load, while a node runtime may take longer than the
  // 300 ms limit to answer nothing. It never answers and stays alive until
  // the reader cuts it.
  if (mode === 'hang') {
    fs.writeFileSync(file, '#!/bin/sh\necho $$ > "$FAKE_MUSE_DIR/pid"\nexec sleep 30\n', { mode: 0o755 })
  } else {
    fs.writeFileSync(file, serverScript(), { mode: 0o755 })
  }
  fs.chmodSync(file, 0o755)
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, FAKE_MUSE_DIR: dir, FAKE_MUSE_MODE: mode }
  return {
    env,
    dir,
    methods() {
      const log = path.join(dir, 'log.jsonl')
      if (!fs.existsSync(log)) return []
      return fs.readFileSync(log, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l).method)
    },
    argv() {
      const argvFile = path.join(dir, 'argv.json')
      if (!fs.existsSync(argvFile)) return null
      return JSON.parse(fs.readFileSync(argvFile, 'utf8'))
    },
    pid() {
      const pidFile = path.join(dir, 'pid')
      if (!fs.existsSync(pidFile)) return null
      return Number(fs.readFileSync(pidFile, 'utf8').trim())
    },
  }
}

async function assertGone(pid) {
  assert.ok(Number.isInteger(pid) && pid > 0, `expected a pid, got ${pid}`)
  const deadline = Date.now() + 3000
  for (;;) {
    let alive = true
    try {
      process.kill(pid, 0)
    } catch (err) {
      if (err && err.code === 'ESRCH') alive = false
      else alive = false
    }
    if (!alive) return
    if (Date.now() > deadline) assert.fail(`process ${pid} still alive`)
    await new Promise((r) => setTimeout(r, 25))
  }
}

test('R14: the reader asks initialize, initialized and model/list and nothing else, with the read-only flags', async (t) => {
  const w = fakeMuse(t, 'ok')
  const res = await listMuseModels({ env: w.env, timeoutMs: 5000 })
  assert.deepEqual(res, { status: 'ok', ids: ['muse-wonder-1.0', 'muse-ember-1.0'] })
  assert.deepEqual(w.methods(), ['initialize', 'initialized', 'model/list'])
  assert.deepEqual(w.argv(), ['serve', '--no-session-log', '--disable-shell', '--disable-write'])
  await assertGone(w.pid()) // the process is closed after the reply
})

test('R14: it keeps the id key as a fallback and the order given', async (t) => {
  const w = fakeMuse(t, 'fallback')
  const res = await listMuseModels({ env: w.env, timeoutMs: 5000 })
  assert.deepEqual(res, { status: 'ok', ids: ['second', 'first', 'third'] })
  assert.deepEqual(w.methods(), ['initialize', 'initialized', 'model/list'])
  await assertGone(w.pid())
})

test('R14: a server that never answers is cut at the limit and its process is gone', async (t) => {
  const w = fakeMuse(t, 'hang')
  const started = Date.now()
  const res = await listMuseModels({ env: w.env, timeoutMs: 300 })
  assert.equal(res.status, 'timeout')
  assert.ok(Date.now() - started < 3000)
  await assertGone(w.pid())
})

test('R14: exit 1, an error reply, an empty list and a garbage line are failed with a reason', async (t) => {
  for (const mode of ['exit1', 'error', 'empty', 'noarray', 'garbage']) {
    const w = fakeMuse(t, mode)
    const res = await listMuseModels({ env: w.env, timeoutMs: 3000 })
    assert.equal(res.status, 'failed', mode)
    assert.ok(typeof res.reason === 'string' && res.reason.length > 0, `${mode} has a reason`)
    const pid = w.pid()
    if (pid !== null) await assertGone(pid)
  }
})

test('R14: a PATH with no muse is not-installed', async (t) => {
  const empty = tempDir(t, 'aether-empty-path-')
  const res = await listMuseModels({ env: { ...process.env, PATH: empty }, timeoutMs: 3000 })
  assert.equal(res.status, 'not-installed')
  assert.ok(res.reason.includes('not found on PATH'), res.reason)
})

module.exports = { FIVE_IDS }
