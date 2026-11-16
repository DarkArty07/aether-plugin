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

  const muse = await listModels('muse', { env: { PATH: agyBin } })
  assert.equal(muse.status, 'no-capture')
  assert.equal(muse.reason, 'no capture means without a model call')

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

test('model-watch.json captureVia only uses ["models"] or a cache file (R1)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'model-watch.json'), 'utf8'))
  assert.equal(cfg.perHarnessSeconds, 10)
  assert.equal(cfg.totalSeconds, 30)
  for (const [name, entry] of Object.entries(cfg.captureVia)) {
    if (entry === null) continue
    if (entry.args) {
      assert.deepEqual(entry.args, ['models'], `${name} args`)
    } else {
      assert.equal(typeof entry.file, 'string', `${name} file`)
    }
  }
  assert.equal(Object.hasOwn(cfg.captureVia, 'claude'), false)
  assert.equal(Object.hasOwn(cfg.captureVia, 'cursor'), false)
})
