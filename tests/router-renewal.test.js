'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, tempDir } = require('./helpers.js')
const renewal = require('../plugins/aether/lib/router-renewal.js')
const quota = require('../plugins/aether/lib/router-quota.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const NOW = Date.parse('2026-10-15T22:30:00Z')
const SEC = 1000
const clock = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms }, slept: () => t } }

test('renewalArgv is the renew verb of aether-delegate, which saves the reading where the pair choice reads it', () => {
  assert.deepEqual(renewal.renewalArgv('grok'), [process.execPath, path.join(PLUGIN, 'bin', 'aether-delegate'), 'renew', '--harness', 'grok'])
  assert.deepEqual(renewal.renewalArgv('agy', { node: 'node', pluginRoot: '/p' }), ['node', '/p/bin/aether-delegate', 'renew', '--harness', 'agy'])
  assert.deepEqual(renewal.RENEWABLE, ['agy', 'grok'])
})

const config = lanes.loadConfig(lanes.CONFIG_FILE)
const MIN = 60 * SEC
const weeklyIn = (hours) => ({ windows: { weekly: { remaining: 0.9, resetsAt: new Date(NOW + hours * 3600 * SEC).toISOString() } } })
// grok's adapter reads only its log, and its log has nothing; agy's must not be asked by peekReadings.
const peekAdapter = (name) => (name === 'agy'
  ? { quotaCost: 'process', quota() { throw new Error('must not run') } }
  : { quotaCost: 'log', quota: () => ({ groups: { grok: { unknown: true, windows: {} } } }) })
const peek = (dataDir, now) => quota.peekReadings({ dataDir, config, harnesses: ['agy', 'grok'], createAdapter: peekAdapter, now })

test('renewReading saves grok\'s refreshed reading where the router reads it, valid for its life (R23, A-6)', async (t) => {
  const dataDir = tempDir(t)
  const acp = { ...weeklyIn(48), source: { method: 'acp', log: null, ageMinutes: 0 } }
  const asked = []
  const refreshers = { grok: async (settings) => { asked.push(settings); return acp } }
  const readGroups = () => { throw new Error('grok\'s adapter reads only its log: it is not asked') }
  const saved = await renewal.renewReading({ harness: 'grok', settings: config.harnesses.grok, dataDir, now: () => NOW, refreshers, readGroups })
  assert.deepEqual(saved, { readAt: NOW, groups: { grok: acp } })
  assert.deepEqual(asked, [config.harnesses.grok])
  const file = quota.readingFile(dataDir, 'grok')
  assert.equal(file, path.join(dataDir, 'router', 'readings', 'grok.json'))
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { readAt: NOW, groups: { grok: acp } })
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['grok.json'], 'no temporary file is left')

  assert.deepEqual(peek(dataDir, NOW + 5 * MIN).grok, { readAt: NOW, groups: { grok: acp } })
  assert.deepEqual(quota.staleHarnesses({ readings: peek(dataDir, NOW + 29 * MIN), config, harnesses: ['grok'], now: NOW + 29 * MIN }), [])
  assert.deepEqual(quota.staleHarnesses({ readings: peek(dataDir, NOW + 30 * MIN), config, harnesses: ['grok'], now: NOW + 30 * MIN }), ['grok'], 'stale again once its life has passed')
})

test('renewReading takes agy\'s reading fresh through readGroups, and saves it too', async (t) => {
  const dataDir = tempDir(t)
  const groups = { gemini: weeklyIn(10), claude: weeklyIn(40) }
  const calls = []
  const adapter = { quotaCost: 'process' }
  const createAdapter = (name, settings) => { calls.push(['create', name, settings]); return adapter }
  const readGroups = (given, options) => { calls.push(['read', given, options]); return { groups, readAt: options.now, cached: false } }
  const saved = await renewal.renewReading({ harness: 'agy', settings: config.harnesses.agy, dataDir, now: () => NOW, createAdapter, readGroups, refreshers: {} })
  assert.deepEqual(saved, { readAt: NOW, groups })
  assert.deepEqual(calls, [
    ['create', 'agy', config.harnesses.agy],
    ['read', adapter, { harness: 'agy', settings: config.harnesses.agy, dataDir, now: NOW, fresh: true }],
  ])
  assert.deepEqual(JSON.parse(fs.readFileSync(quota.readingFile(dataDir, 'agy'), 'utf8')), { readAt: NOW, groups })
  assert.deepEqual(quota.staleHarnesses({ readings: peek(dataDir, NOW + 9 * MIN), config, harnesses: ['agy'], now: NOW + 9 * MIN }), [])
  assert.deepEqual(quota.staleHarnesses({ readings: peek(dataDir, NOW + 10 * MIN), config, harnesses: ['agy'], now: NOW + 10 * MIN }), ['agy'])
})

test('renewReading writes nothing when no reading comes, and renews only agy and grok', async (t) => {
  const dataDir = tempDir(t)
  await assert.rejects(renewal.renewReading({ harness: 'grok', settings: config.harnesses.grok, dataDir, now: () => NOW, refreshers: { grok: async () => null } }), /no new reading/)
  await assert.rejects(renewal.renewReading({ harness: 'grok', settings: config.harnesses.grok, dataDir, now: () => NOW, refreshers: { grok: async () => { throw new Error('acp down') } } }), /acp down/)
  const failing = () => { throw new Error('agy /usage failed') }
  await assert.rejects(renewal.renewReading({ harness: 'agy', settings: config.harnesses.agy, dataDir, now: () => NOW, createAdapter: () => ({}), readGroups: failing, refreshers: {} }), /agy \/usage failed/)
  await assert.rejects(renewal.renewReading({ harness: 'codex', settings: config.harnesses.codex, dataDir, now: () => NOW }), /agy or grok/)
  await assert.rejects(renewal.renewReading({ harness: 'agy', settings: undefined, dataDir, now: () => NOW }), /lane table/)
  assert.equal(fs.existsSync(path.join(dataDir, 'router', 'readings')), false)
})

test('a renewal starts once, and a second decision that finds it running does not start another (R23)', (t) => {
  const dataDir = tempDir(t)
  const spawned = []
  const spawn = (harness) => { spawned.push(harness); return 4242 }
  const first = renewal.startRenewal({ dataDir, harness: 'agy', now: NOW, alive: () => true, spawn })
  assert.deepEqual(first, { started: true, running: true })
  assert.deepEqual(JSON.parse(fs.readFileSync(renewal.lockFile(dataDir, 'agy'), 'utf8')), { pid: 4242, since: NOW })
  assert.equal(renewal.lockFile(dataDir, 'agy'), path.join(dataDir, 'router', 'renewing', 'agy.json'))
  const second = renewal.startRenewal({ dataDir, harness: 'agy', now: NOW + 30 * SEC, alive: () => true, spawn })
  assert.deepEqual(second, { started: false, running: true })
  assert.deepEqual(spawned, ['agy'])
  const other = renewal.startRenewal({ dataDir, harness: 'grok', now: NOW + 30 * SEC, alive: () => true, spawn })
  assert.deepEqual(other, { started: true, running: true }, 'one at a time per harness, not one overall')
  assert.deepEqual(spawned, ['agy', 'grok'])
})

test('a lock that is old, or whose process died, does not hold the next renewal', (t) => {
  const dataDir = tempDir(t)
  const spawned = []
  const spawn = (harness) => { spawned.push(harness); return 7 }
  renewal.startRenewal({ dataDir, harness: 'agy', now: NOW, alive: () => true, spawn })
  const old = renewal.startRenewal({ dataDir, harness: 'agy', now: NOW + renewal.RENEWAL_LIFE_MS + 1, alive: () => true, spawn })
  assert.deepEqual(old, { started: true, running: true })
  const dead = renewal.startRenewal({ dataDir, harness: 'agy', now: NOW + renewal.RENEWAL_LIFE_MS + 2 * SEC, alive: () => false, spawn })
  assert.deepEqual(dead, { started: true, running: true })
  assert.equal(spawned.length, 3)
})

test('two decisions at once start one renewal: the lock is taken before the process is launched', (t) => {
  const dataDir = tempDir(t)
  let nested = null
  const first = renewal.startRenewal({
    dataDir, harness: 'agy', now: NOW, alive: () => true,
    spawn: () => {
      nested = renewal.startRenewal({ dataDir, harness: 'agy', now: NOW, alive: () => true, spawn: () => { throw new Error('a second renewal started') } })
      return 7
    },
  })
  assert.deepEqual(first, { started: true, running: true })
  assert.deepEqual(nested, { started: false, running: true })
})

test('a process that cannot start leaves no lock, and a harness that is not agy or grok is never renewed', (t) => {
  const dataDir = tempDir(t)
  const failed = renewal.startRenewal({ dataDir, harness: 'agy', now: NOW, spawn: () => { throw new Error('ENOENT') } })
  assert.deepEqual(failed, { started: false, running: false })
  assert.equal(fs.existsSync(renewal.lockFile(dataDir, 'agy')), false)
  for (const harness of ['codex', 'cursor', '../agy', '']) {
    assert.deepEqual(renewal.startRenewal({ dataDir, harness, now: NOW, spawn: () => { throw new Error('must not run') } }), { started: false, running: false }, harness)
  }
})

test('spawnRenewal launches a process that outlives the caller, with the argv it is given', async (t) => {
  const dir = tempDir(t)
  const marker = path.join(dir, 'ran')
  const pid = renewal.spawnRenewal('agy', { argv: [process.execPath, '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x')`] })
  assert.equal(Number.isInteger(pid), true)
  for (let i = 0; i < 50 && !fs.existsSync(marker); i++) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(fs.existsSync(marker), true)
})

test('waitForReading returns at once when the reading is valid, and waits no longer than waitMs when it is not (A-6)', async () => {
  const now = clock()
  assert.deepEqual(await renewal.waitForReading({ isValid: () => true, waitMs: 3000, now: now.now, sleep: now.sleep }), { valid: true, waitedMs: 0 })
  assert.equal(now.slept(), 0)

  const soon = clock()
  let calls = 0
  const late = await renewal.waitForReading({ isValid: () => ++calls >= 3, waitMs: 3000, now: soon.now, sleep: soon.sleep, pollMs: 250 })
  assert.deepEqual(late, { valid: true, waitedMs: 500 })

  const never = clock()
  assert.deepEqual(await renewal.waitForReading({ isValid: () => false, waitMs: 3000, now: never.now, sleep: never.sleep }), { valid: false, waitedMs: 3000 })
  assert.equal(never.slept(), 3000)

  const odd = clock()
  assert.deepEqual(await renewal.waitForReading({ isValid: () => false, waitMs: 1000, now: odd.now, sleep: odd.sleep, pollMs: 400 }), { valid: false, waitedMs: 1000 })
  assert.equal(odd.slept(), 1000, 'the last sleep is shortened so the wait does not pass waitMs')

  const broken = clock()
  assert.equal((await renewal.waitForReading({ isValid: () => { throw new Error('x') }, waitMs: 500, now: broken.now, sleep: broken.sleep })).valid, false)
})
