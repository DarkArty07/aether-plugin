'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, PLUGIN } = require('./helpers.js')

const { runWatch, launch, readResult, noticeLine, markNoticed } = require(path.join(PLUGIN, 'lib', 'model-watch.js'))

const sha1 = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex')

const TABLE = {
  harnesses: {
    agy: { models: ['a1'] },
    grok: { models: ['g1'] },
    codex: { models: ['c1'] },
  },
}

const CONFIG = {
  perHarnessSeconds: 10,
  totalSeconds: 30,
  captureVia: {
    agy: { args: ['models'] },
    grok: { args: ['models'] },
    codex: { file: '~/.codex/models_cache.json' },
    muse: null,
  },
}

test('runWatch records new models and failed harnesses without throwing', async (t) => {
  const dir = tempDir(t)
  const res = await runWatch({
    dataDir: dir,
    mainRoot: dir,
    harnesses: ['agy', 'grok'],
    now: 1700000000000,
    table: TABLE,
    config: CONFIG,
    listModels: async (name) => {
      if (name === 'agy') return { status: 'ok', ids: ['a1', 'a2'] }
      return { status: 'failed', reason: 'cli error' }
    },
  })

  assert.equal(res.harnesses.agy.status, 'ok')
  assert.deepEqual(res.harnesses.agy.new, ['a2'])
  assert.equal(res.harnesses.grok.status, 'failed')
  assert.equal(res.harnesses.grok.reason, 'cli error')

  const saved = readResult(dir)
  assert.deepEqual(saved, res)
})

test('runWatch runs at most once per calendar day unless force is true', async (t) => {
  const dir = tempDir(t)
  let calls = 0
  const listModels = async () => {
    calls += 1
    return { status: 'ok', ids: ['a1'] }
  }
  const day1 = new Date(2026, 10, 16, 10, 0, 0).getTime()
  const day1Later = new Date(2026, 10, 16, 18, 0, 0).getTime()

  await runWatch({ dataDir: dir, mainRoot: dir, harnesses: ['agy'], now: day1, table: TABLE, config: CONFIG, listModels })
  assert.equal(calls, 1)

  await runWatch({ dataDir: dir, mainRoot: dir, harnesses: ['agy'], now: day1Later, table: TABLE, config: CONFIG, listModels })
  assert.equal(calls, 1)

  await runWatch({ dataDir: dir, mainRoot: dir, harnesses: ['agy'], now: day1Later, force: true, table: TABLE, config: CONFIG, listModels })
  assert.equal(calls, 2)
})

test('runWatch cuts remaining harnesses with skipped total-timeout when totalSeconds is exhausted', async (t) => {
  const dir = tempDir(t)
  const slowConfig = { ...CONFIG, totalSeconds: 0.03 }
  const res = await runWatch({
    dataDir: dir,
    mainRoot: dir,
    harnesses: ['agy', 'grok', 'codex'],
    now: 1700000000000,
    table: TABLE,
    config: slowConfig,
    listModels: async (name) => {
      await new Promise((r) => setTimeout(r, 40))
      return { status: 'ok', ids: [name] }
    },
  })

  assert.equal(res.harnesses.agy.status, 'ok')
  assert.equal(res.harnesses.grok.skipped, 'total-timeout')
  assert.equal(res.harnesses.codex.skipped, 'total-timeout')
})

test('runWatch only reads intersection with captureVia (ignores claude and cursor)', async (t) => {
  const dir = tempDir(t)
  const seen = []
  await runWatch({
    dataDir: dir,
    mainRoot: dir,
    harnesses: ['claude', 'cursor', 'agy'],
    now: 1700000000000,
    table: TABLE,
    config: CONFIG,
    listModels: async (name) => {
      seen.push(name)
      return { status: 'ok', ids: ['a1'] }
    },
  })
  assert.deepEqual(seen, ['agy'])
})

test('launch respects isLead, stamp, and swallows spawn errors', (t) => {
  const dir = tempDir(t)
  let spawns = 0
  let unrefCalled = false
  let spawnOpts = null
  const fakeSpawn = (_cmd, _args, opts) => {
    spawns += 1
    spawnOpts = opts
    return {
      on: () => {},
      unref: () => { unrefCalled = true },
    }
  }

  launch({ dataDir: dir, mainRoot: dir, isLead: false, harnesses: ['agy'], spawn: fakeSpawn, config: CONFIG })
  assert.equal(spawns, 0)

  const today = Date.now()
  fs.mkdirSync(path.join(dir, 'model-watch'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'model-watch', 'stamp.json'), JSON.stringify({ at: today }))
  launch({ dataDir: dir, mainRoot: dir, isLead: true, harnesses: ['agy'], spawn: fakeSpawn, config: CONFIG, now: today })
  assert.equal(spawns, 0)

  const yesterday = today - 2 * 24 * 60 * 60 * 1000
  fs.writeFileSync(path.join(dir, 'model-watch', 'stamp.json'), JSON.stringify({ at: yesterday }))
  launch({ dataDir: dir, mainRoot: dir, isLead: true, harnesses: ['agy'], spawn: fakeSpawn, config: CONFIG, now: today })
  assert.equal(spawns, 1)
  assert.equal(spawnOpts.detached, true)
  assert.equal(spawnOpts.stdio, 'ignore')
  assert.equal(unrefCalled, true)

  assert.doesNotThrow(() => {
    launch({
      dataDir: dir,
      mainRoot: dir,
      isLead: true,
      harnesses: ['agy'],
      spawn: () => { throw new Error('spawn failed') },
      config: CONFIG,
      now: today,
    })
  })
})

test('noticeLine formatting, 400 char cap, markNoticed, and re-appearing new id', async (t) => {
  const dir = tempDir(t)
  assert.equal(noticeLine(null), null)
  assert.equal(noticeLine({ at: 1, harnesses: { grok: { status: 'ok', new: [], retired: [], noticed: false } } }), null)

  const one = {
    at: 1,
    harnesses: {
      grok: { status: 'ok', new: ['a', 'b'], retired: ['c'], noticed: false },
    },
  }
  assert.equal(noticeLine(one), 'Aether: new models in grok: a, b; retired: c.')

  const hugeIds = Array.from({ length: 60 }, (_, i) => `very-long-model-name-${String(i).padStart(3, '0')}`)
  const hugeLine = noticeLine({
    at: 1,
    harnesses: {
      grok: { status: 'ok', new: hugeIds, retired: [], noticed: false },
    },
  })
  assert.ok(hugeLine.length <= 400, `length was ${hugeLine.length}`)
  assert.match(hugeLine, /and \d+ more$/)

  const day1 = new Date(2026, 10, 16, 10, 0, 0).getTime()
  await runWatch({
    dataDir: dir,
    mainRoot: dir,
    harnesses: ['grok'],
    now: day1,
    table: TABLE,
    config: CONFIG,
    listModels: async () => ({ status: 'ok', ids: ['g1', 'g2'] }),
  })
  assert.equal(noticeLine(readResult(dir)), 'Aether: new models in grok: g2.')

  markNoticed(dir)
  assert.equal(noticeLine(readResult(dir)), null)

  await runWatch({
    dataDir: dir,
    mainRoot: dir,
    harnesses: ['grok'],
    now: day1,
    force: true,
    table: TABLE,
    config: CONFIG,
    listModels: async () => ({ status: 'ok', ids: ['g1', 'g2', 'g3'] }),
  })
  assert.equal(noticeLine(readResult(dir)), 'Aether: new models in grok: g2, g3.')
})

test('R8: runWatch, noticeLine, and markNoticed never modify pairs.json, prices.json, or harness-models.json', async (t) => {
  const dir = tempDir(t)
  const files = [
    path.join(PLUGIN, 'config', 'pairs.json'),
    path.join(PLUGIN, 'config', 'prices.json'),
    path.join(PLUGIN, 'config', 'models', 'harness-models.json'),
  ]
  const before = files.map(sha1)

  await runWatch({
    dataDir: dir,
    mainRoot: dir,
    harnesses: ['grok'],
    now: Date.now(),
    listModels: async () => ({ status: 'ok', ids: ['grok-4.7', 'grok-new'] }),
  })
  noticeLine(readResult(dir))
  markNoticed(dir)

  const after = files.map(sha1)
  assert.deepEqual(after, before)
})

test('aether-observe models-read worker exits 0 and writes result.json', (t) => {
  const dir = tempDir(t)
  const binDir = tempDir(t)
  const fakeAgy = path.join(binDir, 'agy')
  fs.writeFileSync(fakeAgy, '#!/bin/sh\necho "m1"\n')
  fs.chmodSync(fakeAgy, 0o755)

  const bin = path.join(PLUGIN, 'bin', 'aether-observe')
  const r = spawnSync('node', [bin, 'models-read'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      AETHER_DATA_DIR: dir,
      AETHER_LANE_HARNESSES: 'agy,muse',
    },
    timeout: 5000,
  })
  assert.equal(r.status, 0)
  const parsed = JSON.parse(r.stdout.trim())
  assert.equal(parsed.harnesses.agy.status, 'ok')
  assert.deepEqual(parsed.harnesses.agy.new, ['m1'])
  assert.equal(parsed.harnesses.muse.status, 'no-capture')
})

test('runWatch with real listModels kills hanging child on totalSeconds and skips remaining', async (t) => {
  const dir = tempDir(t)
  const binDir = tempDir(t)
  const fakeAgy = path.join(binDir, 'agy')
  fs.writeFileSync(fakeAgy, '#!/bin/sh\nsleep 30\n')
  fs.chmodSync(fakeAgy, 0o755)
  const fakeGrok = path.join(binDir, 'grok')
  fs.writeFileSync(fakeGrok, '#!/bin/sh\necho "g1"\n')
  fs.chmodSync(fakeGrok, 0o755)

  const started = Date.now()
  const res = await runWatch({
    dataDir: dir,
    mainRoot: dir,
    harnesses: ['agy', 'grok'],
    now: 1700000000000,
    table: TABLE,
    config: {
      perHarnessSeconds: 0.5,
      totalSeconds: 0.12,
      captureVia: {
        agy: { args: ['models'] },
        grok: { args: ['models'] },
      },
    },
    env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
  })
  const elapsed = Date.now() - started
  assert.ok(elapsed < 2000, `runWatch took too long: ${elapsed}ms`)
  assert.equal(res.harnesses.agy.status, 'timeout')
  assert.equal(res.harnesses.grok.skipped, 'total-timeout')
})
