'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')

const { compare, listModels } = require(path.join(PLUGIN, 'lib', 'model-listing.js'))

function fakeSpawn({ stdout = '', stderr = '', code = 0, error = null, hang = false } = {}) {
  return () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.killed = false
    child.kill = () => {
      child.killed = true
      if (hang) {
        process.nextTick(() => child.emit('close', null))
      }
    }
    if (!hang) {
      process.nextTick(() => {
        if (error) {
          child.emit('error', error)
          return
        }
        if (stdout) child.stdout.emit('data', Buffer.from(stdout))
        if (stderr) child.stderr.emit('data', Buffer.from(stderr))
        child.emit('close', code)
      })
    }
    return child
  }
}

function makeFakeBin(t, name) {
  const binDir = tempDir(t)
  const file = path.join(binDir, name)
  fs.writeFileSync(file, '#!/bin/sh\nexit 0\n')
  fs.chmodSync(file, 0o755)
  return binDir
}

test('compare: knows models, superseded, outOfScope, calledNotListed, object ids, and effort suffixes', () => {
  const table = {
    harnesses: {
      grok: {
        models: ['a'],
        superseded: { b: {} },
        outOfScope: { c: {} },
      },
      codex: {
        models: [{ id: 'x' }, 'y'],
      },
      muse: {
        models: ['m1'],
        calledNotListed: { 'm-called': {} },
      },
      agy: {
        models: ['gemini-4-argon'],
      },
    },
  }

  assert.deepEqual(compare('grok', ['a', 'b'], table), { new: [], retired: [] })
  assert.deepEqual(compare('grok', ['a', 'z'], table), { new: ['z'], retired: [] })

  const tableRetired = { harnesses: { grok: { models: ['a', 'q'] } } }
  assert.deepEqual(compare('grok', ['a'], tableRetired), { new: [], retired: ['q'] })

  assert.deepEqual(compare('codex', ['x', 'y'], table), { new: [], retired: [] })
  assert.deepEqual(compare('muse', ['m1', 'm-called'], table), { new: [], retired: [] })
  assert.deepEqual(compare('agy', ['gemini-4-argon-high'], table), { new: [], retired: [] })
})

test('compare: does not mutate the table object', () => {
  const table = {
    harnesses: {
      grok: {
        models: ['a', { id: 'b' }],
        superseded: { c: { by: 'a' } },
        outOfScope: { d: { reason: 'old' } },
      },
    },
  }
  const before = structuredClone(table)
  const res = compare('grok', ['a', 'z'], table)
  assert.deepEqual(res, { new: ['z'], retired: ['b'] })
  assert.deepEqual(table, before)
})

test('listModels: handles ok, failed, timeout, not-installed, no-capture, and codex cache file', async (t) => {
  const agyBin = makeFakeBin(t, 'agy')
  const ok = await listModels('agy', {
    env: { PATH: agyBin },
    spawn: fakeSpawn({ stdout: 'model-1\nmodel-2\n' }),
  })
  assert.deepEqual(ok, { status: 'ok', ids: ['model-1', 'model-2'] })

  const failed = await listModels('agy', {
    env: { PATH: agyBin },
    spawn: fakeSpawn({ stderr: 'boom', code: 1 }),
  })
  assert.equal(failed.status, 'failed')
  assert.ok(failed.reason.length > 0)

  const timedOut = await listModels('agy', {
    env: { PATH: agyBin },
    timeoutMs: 30,
    spawn: fakeSpawn({ hang: true }),
  })
  assert.equal(timedOut.status, 'timeout')
  assert.ok(timedOut.reason.length > 0)

  const missing = await listModels('agy', {
    env: { PATH: tempDir(t) },
    spawn: fakeSpawn({ stdout: 'should-not-run' }),
  })
  assert.equal(missing.status, 'not-installed')

  const museMissing = await listModels('muse', { env: { PATH: agyBin } })
  assert.equal(museMissing.status, 'not-installed')
  assert.ok(museMissing.reason.includes('not found on PATH'), museMissing.reason)

  for (const name of ['claude', 'cursor']) {
    const res = await listModels(name, { env: { PATH: agyBin } })
    assert.equal(res.status, 'no-capture', name)
  }

  const codexBin = makeFakeBin(t, 'codex')
  const home = tempDir(t)
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true })
  fs.writeFileSync(
    path.join(home, '.codex', 'models_cache.json'),
    JSON.stringify({ models: [{ slug: 'gpt-6.1-sol' }, { slug: 'gpt-6.1-terra' }] }),
  )
  const codex = await listModels('codex', { env: { PATH: codexBin }, home })
  assert.deepEqual(codex, { status: 'ok', ids: ['gpt-6.1-sol', 'gpt-6.1-terra'] })
})

test('listModels: muse serve gets a scrubbed env with auto-update off', async (t) => {
  const dir = tempDir(t)
  const configPath = path.join(dir, 'model-watch.json')
  fs.writeFileSync(configPath, JSON.stringify({
    perHarnessSeconds: 2,
    totalSeconds: 10,
    captureVia: { muse: { msp: true } },
  }))
  const lanesConfigPath = path.join(dir, 'lanes.json')
  fs.writeFileSync(lanesConfigPath, JSON.stringify({ harnesses: {} }))

  const binDir = tempDir(t)
  const fake = path.join(binDir, 'muse')
  fs.writeFileSync(fake, `#!/usr/bin/env node
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const dir = ${JSON.stringify(dir)}
fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify(process.env))
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
    if (msg.method === 'initialize') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'muse' } } }) + '\\n')
    } else if (msg.method === 'model/list') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { models: [{ modelId: 'muse-wonder-1.0' }, { modelId: 'muse-ember-1.0' }] } }) + '\\n')
    }
  }
})
`)
  fs.chmodSync(fake, 0o755)

  const found = await listModels('muse', {
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      META_API_KEY: 'owner-secret-1',
      SOME_SECRET_TOKEN: 'owner-secret-2',
    },
    configPath,
    lanesConfigPath,
    timeoutMs: 5000,
  })
  assert.deepEqual(found, { status: 'ok', ids: ['muse-wonder-1.0', 'muse-ember-1.0'] })

  const seen = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'))
  assert.equal(seen.MUSE_NO_AUTO_UPDATE, '1')
  assert.ok(!Object.hasOwn(seen, 'META_API_KEY'), 'owner api key stays out of the muse process')
  assert.ok(!Object.hasOwn(seen, 'SOME_SECRET_TOKEN'), 'owner secret token stays out of the muse process')
  assert.ok(typeof seen.PATH === 'string' && seen.PATH.includes(binDir), 'PATH still reaches the process')
  assert.ok(typeof seen.HOME === 'string' && seen.HOME.length > 0, 'HOME still reaches the process')
})

test('model-watch.json captureVia only uses ["models"], a cache file or the muse serve reading (R1)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'model-watch.json'), 'utf8'))
  assert.equal(cfg.perHarnessSeconds, 10)
  assert.equal(cfg.totalSeconds, 30)
  for (const [name, entry] of Object.entries(cfg.captureVia)) {
    if (entry === null) continue
    if (entry.msp === true) {
      assert.equal(name, 'muse', 'only muse is read over serve')
      continue
    }
    if (entry.args) {
      assert.deepEqual(entry.args, ['models'], `${name} args`)
    } else {
      assert.equal(typeof entry.file, 'string', `${name} file`)
    }
  }
  assert.deepEqual(cfg.captureVia.muse, { msp: true })
  assert.equal(Object.hasOwn(cfg.captureVia, 'claude'), false)
  assert.equal(Object.hasOwn(cfg.captureVia, 'cursor'), false)
})

test("listModels: muse over serve returns the ids, and not-installed without the command (R14)", async (t) => {
  const dir = tempDir(t)
  const configPath = path.join(dir, 'model-watch.json')
  fs.writeFileSync(configPath, JSON.stringify({
    perHarnessSeconds: 2,
    totalSeconds: 10,
    captureVia: { muse: { msp: true } },
  }))
  const lanesConfigPath = path.join(dir, 'lanes.json')
  fs.writeFileSync(lanesConfigPath, JSON.stringify({ harnesses: {} }))

  const binDir = tempDir(t)
  const fake = path.join(binDir, 'muse')
  fs.writeFileSync(fake, `#!/usr/bin/env node
'use strict'
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
    if (msg.method === 'initialize') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'muse' } } }) + '\\n')
    } else if (msg.method === 'model/list') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { models: [{ modelId: 'muse-wonder-1.0' }, { modelId: 'muse-ember-1.0' }] } }) + '\\n')
    }
  }
})
`)
  fs.chmodSync(fake, 0o755)

  const found = await listModels('muse', {
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
    configPath,
    lanesConfigPath,
    timeoutMs: 5000,
  })
  assert.deepEqual(found, { status: 'ok', ids: ['muse-wonder-1.0', 'muse-ember-1.0'] })

  const missing = await listModels('muse', {
    env: { PATH: tempDir(t) },
    configPath,
    lanesConfigPath,
  })
  assert.equal(missing.status, 'not-installed')
  assert.ok(missing.reason.includes('not found on PATH'), missing.reason)
})
