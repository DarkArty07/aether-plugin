'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { readCodexQuota, windowsFrom } = require('../plugins/aether/lib/harness/codex-quota.js')
const { createCodex } = require('../plugins/aether/lib/harness/codex.js')
const { readGroups } = require('../plugins/aether/lib/lane-readings.js')

const FAKE = path.join(__dirname, 'fixtures', 'fake-codex.js')
const RATE_LIMITS = path.join(__dirname, 'fixtures', 'codex', 'rate-limits.json')
const GROUPS = { codex: 'Codex plan' }
const iso = (seconds) => new Date(seconds * 1000).toISOString()
const MIN = 60 * 1000
const base = () => JSON.parse(fs.readFileSync(RATE_LIMITS, 'utf8'))
const envFor = (t, extra = {}) => ({ ...process.env, AETHER_FAKE_CODEX_LOG: path.join(tempDir(t), 'log'), AETHER_FAKE_CODEX_RATE_LIMITS: RATE_LIMITS, ...extra })
const appServerLog = (env) => fs.readFileSync(env.AETHER_FAKE_CODEX_LOG, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((entry) => entry.kind === 'app-server')

test('windowsFrom gives the two windows with the share left and the reset', () => {
  assert.deepEqual(windowsFrom(base()), { '5h': { remaining: 0.94, resetsAt: iso(1793337189) }, weekly: { remaining: 0.99, resetsAt: iso(1793923989) } })
})

test('windowsFrom: the limit of codex wins, a full window reads zero, a refused account reads empty, an odd window is named by its minutes', () => {
  const byId = base()
  byId.rateLimitsByLimitId.codex.primary.usedPercent = 50
  assert.equal(windowsFrom(byId)['5h'].remaining, 0.5)
  const plain = base()
  delete plain.rateLimitsByLimitId
  plain.rateLimits.primary.usedPercent = 100
  assert.equal(windowsFrom(plain)['5h'].remaining, 0)
  assert.equal(windowsFrom(plain).weekly.remaining, 0.99)
  const refused = { ...base(), ordinaryUsageAllowed: false }
  assert.deepEqual(Object.values(windowsFrom(refused)).map((w) => w.remaining), [0, 0])
  const odd = base()
  odd.rateLimitsByLimitId.codex.primary.windowDurationMins = 60
  assert.deepEqual(Object.keys(windowsFrom(odd)), ['60m', 'weekly'])
  assert.throws(() => windowsFrom({}), /codex rate limits: no windows/)
})

test('readCodexQuota reads the windows from account/rateLimits/read alone, once for each group of the table', (t) => {
  const env = envFor(t)
  const out = readCodexQuota({ command: FAKE, env, groups: { codex: 'Codex plan', other: 'Other' } })
  assert.deepEqual(Object.keys(out.groups), ['codex', 'other'])
  assert.deepEqual(out.groups.codex, { windows: windowsFrom(base()) })
  assert.deepEqual(out.groups.other, out.groups.codex)
  const methods = appServerLog(env).at(-1).methods
  assert.deepEqual(methods, ['initialize', 'initialized', 'account/rateLimits/read'], 'no model call, nothing else is asked')
})

test('a server that errors, exits, does not answer or is not there is a failure, never an invented reading, and a server that hangs is killed', (t) => {
  assert.throws(() => readCodexQuota({ command: FAKE, env: envFor(t, { AETHER_FAKE_CODEX_APPSERVER: 'error' }), groups: GROUPS }), /codex rate limits.*not signed in/)
  assert.throws(() => readCodexQuota({ command: FAKE, env: envFor(t, { AETHER_FAKE_CODEX_APPSERVER: 'exit' }), groups: GROUPS }), /codex rate limits/)
  assert.throws(() => readCodexQuota({ command: '/nowhere/codex', env: process.env, groups: GROUPS }), /codex rate limits/)
  const pidFile = path.join(tempDir(t), 'pid')
  const started = Date.now()
  assert.throws(() => readCodexQuota({ command: FAKE, env: envFor(t, { AETHER_FAKE_CODEX_APPSERVER: 'hang', AETHER_FAKE_CODEX_PID: pidFile }), groups: GROUPS, timeoutMs: 500 }), /codex rate limits.*timed out/)
  assert.ok(Date.now() - started < 6000)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  const deadline = Date.now() + 3000
  const alive = () => { try { process.kill(pid, 0); return true } catch { return false } }
  while (alive() && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  assert.equal(alive(), false, 'the server does not outlive the reading')
})

test('the adapter reads its quota through the reader and declares that a reading costs a process', (t) => {
  const codex = createCodex({ command: FAKE, groups: GROUPS, env: envFor(t) })
  assert.equal(codex.quotaCost, 'process')
  assert.deepEqual(codex.quota(), { groups: { codex: { windows: windowsFrom(base()) } } })
})

test('lane-readings keeps the reading for its life, and a reading older than its life is read again (R9)', (t) => {
  const env = envFor(t)
  const dataDir = tempDir(t)
  const codex = createCodex({ command: FAKE, groups: GROUPS, env })
  const settings = { groups: GROUPS, quotaLifeMinutes: 10 }
  const t0 = Date.parse('2026-10-29T21:00:00Z')
  assert.equal(readGroups(codex, { harness: 'codex', settings, dataDir, now: t0 }).cached, false)
  assert.equal(readGroups(codex, { harness: 'codex', settings, dataDir, now: t0 + 5 * MIN }).cached, true)
  assert.equal(readGroups(codex, { harness: 'codex', settings, dataDir, now: t0 + 11 * MIN }).cached, false)
  assert.equal(appServerLog(env).filter((entry) => entry.methods.length === 1).length, 2, 'two servers were started, not three')
})

test('the shared lane environment never names the real codex (Global Constraints)', (t) => {
  const env = require('./lane-fixtures.js').laneEnv(t)
  assert.equal(JSON.parse(fs.readFileSync(env.AETHER_LANES_CONFIG, 'utf8')).harnesses.codex.command, '/nowhere/codex')
})

test('no code of the reader opens the owner\'s credentials or names an API key', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'harness', 'codex-quota.js'), 'utf8')
  const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  assert.equal(/auth\.json|OPENAI_API_KEY|CODEX_HOME/.test(code), false)
})

test('the server of the reading never gets OPENAI_API_KEY or another secret of the caller (R19)', (t) => {
  const env = envFor(t, { OPENAI_API_KEY: 'secret-key', GITHUB_TOKEN: 'gh-secret' })
  readCodexQuota({ command: FAKE, env, groups: GROUPS })
  const entries = appServerLog(env)
  assert.ok(entries.length > 0, 'the fake server was reached')
  for (const entry of entries) assert.equal(entry.apiKey, null)
})
