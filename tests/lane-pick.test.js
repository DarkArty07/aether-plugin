'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { PLUGIN, runBin, tempDir } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const marks = require('../plugins/aether/lib/lane-marks.js')
const { latestReadings } = require('../plugins/aether/lib/lane-pick.js')
const { readingFile } = require('../plugins/aether/lib/router-quota.js')
const fx = require('./lane-fixtures.js')

const LANE_BIN = path.join(PLUGIN, 'bin', 'aether-lane')
const HOUR = 3600 * 1000
const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString()
// agy's quota as the fake reports it (tests/lane-status.test.js): [5 h remaining, weekly remaining, null, weekly reset]
const claudeFirst = { 'Gemini Models': [0.9, 0.9, null, inHours(200)], 'Claude and GPT models': [0.9, 0.9, null, inHours(40)] }
const geminiFirst = { 'Gemini Models': [0.9, 0.9, null, inHours(40)], 'Claude and GPT models': [0.9, 0.9, null, inHours(200)] }
const bothDry = { 'Gemini Models': [0.9, 0.02, null, inHours(40)], 'Claude and GPT models': [0.9, 0.02, null, inHours(40)] }
// The lanes of these tests are agy's alone, whatever AETHER_LANE_HARNESSES the shell that runs them exports.
const agyEnv = (t, options) => ({ ...fx.laneEnv(t, options), AETHER_LANE_HARNESSES: 'agy' })
const CALL = 'task-1-1-implement'
const SONNET_XHIGH = ['--role', 'implementer', '--model', 'sonnet', '--effort', 'xhigh']
const pick = (args, env, flags, call = CALL) => fx.lane(args, 'pick', [call, ...flags], env)
const logged = (env, kind) => lanes.readLog(env.AETHER_DATA_DIR).filter((entry) => entry.kind === kind)

test('pick gives the pair of the quota that renews first, asks the points of the reference pair and logs the choice', (t) => {
  const { args } = fx.laneRun(t)
  const env = agyEnv(t, { quota: claudeFirst })
  const r = pick(args, env, SONNET_XHIGH)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.requested, 49.6)
  assert.equal(r.json.reference.id, 'claude/sonnet@xhigh')
  assert.equal(r.json.picked.id, 'agy/claude-opus-5-5@high')
  assert.equal(r.json.native.id, 'claude/sonnet@xhigh')
  assert.deepEqual([r.json.call, r.json.role], [CALL, 'implementer'])
  const [entry] = logged(env, 'choice')
  assert.deepEqual([entry.run, entry.call, entry.role, entry.requested, entry.picked.id], [args.runId, CALL, 'implementer', 49.6, 'agy/claude-opus-5-5@high'])
  assert.equal(typeof entry.reason, 'string')
  assert.ok(Array.isArray(entry.candidates) && entry.candidates.every((c) => c.id && c.outcome))
  // Argon does not list implementer, and Opus medium (48.1) is below the floor of 48.6, so Gemini renewing first still leaves Opus high as the only pair.
  assert.equal(pick(args, agyEnv(t, { quota: geminiFirst }), SONNET_XHIGH).json.picked.id, 'agy/claude-opus-5-5@high')
})

test('R5: a pair whose model lacks the role in its roles list is not picked, for each swarm role', (t) => {
  const { args } = fx.laneRun(t)
  const env = agyEnv(t, { quota: geminiFirst })
  const whyOf = (r) => Object.fromEntries(r.json.candidates.map((c) => [c.id, c.why]))
  // gemini-4-argon lists judge, writer and examiner only: no swarm call goes to it, though its window renews first.
  const implementer = pick(args, env, SONNET_XHIGH)
  assert.equal(implementer.status, 0, implementer.stdout + implementer.stderr)
  assert.notEqual(implementer.json.picked.model, 'gemini-4-argon')
  assert.equal(whyOf(implementer)['agy/gemini-4-argon@high'], 'role')
  // gemini-3.8-flash lists implementer only: a supervisor or a reviewer call never goes to it.
  for (const role of ['supervisor', 'reviewer']) {
    const r = pick(args, env, ['--role', role, '--model', 'sonnet', '--effort', 'xhigh'], `task-1-1-${role}`)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.notEqual(r.json.picked && r.json.picked.model, 'gemini-3.8-flash', role)
    assert.equal(whyOf(r)['agy/gemini-3.8-flash@medium'], 'role', role)
    assert.equal(whyOf(r)['agy/gemini-4-argon@high'], 'role', role)
  }
})

test('issue 038: a refusal of Argon leaves the Flash pairs to the swarm, and a refusal of Flash leaves Argon, though both read the one Gemini window', (t) => {
  const { args } = fx.laneRun(t)
  const HAIKU_HIGH = ['--role', 'implementer', '--model', 'haiku', '--effort', 'high']
  const refused = (env, group) => marks.markDry(env.AETHER_DATA_DIR, { harness: 'agy', group, reserve: 0.05, now: Date.now() - 5 * 60 * 1000, refusal: { resetMs: 135 * HOUR } })
  const states = (r) => Object.fromEntries(r.json.candidates.filter((c) => c.id.startsWith('agy/gemini')).map((c) => [c.id, c.why]))

  assert.equal(pick(args, agyEnv(t, { quota: geminiFirst }), HAIKU_HIGH).json.picked.id, 'agy/gemini-3.8-flash@medium', 'with no mark, Flash is the cheapest pair of the Gemini window')

  const argon = agyEnv(t, { quota: geminiFirst })
  refused(argon, 'argon')
  const flash = pick(args, argon, HAIKU_HIGH)
  assert.equal(flash.status, 0, flash.stdout + flash.stderr)
  assert.equal(flash.json.picked.id, 'agy/gemini-3.8-flash@medium')
  assert.equal(states(flash)['agy/gemini-4-argon@high'], 'role')
  assert.ok(Object.entries(states(flash)).filter(([id]) => id.includes('flash')).every(([, why]) => why !== 'dry'))

  const other = agyEnv(t, { quota: geminiFirst })
  refused(other, 'flash')
  const kept = pick(args, other, HAIKU_HIGH)
  assert.equal(kept.json.picked.id, 'agy/claude-sonnet-5-5@medium')
  assert.ok(Object.entries(states(kept)).filter(([id]) => id.includes('flash')).every(([, why]) => why === 'dry'))
  assert.equal(states(kept)['agy/gemini-4-argon@high'], 'role')
})

test('pick with every quota dry gives no pair and the native pair of the reference, and logs it', (t) => {
  const { args } = fx.laneRun(t)
  const env = agyEnv(t, { quota: bothDry })
  const r = pick(args, env, SONNET_XHIGH)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.picked, null)
  assert.equal(r.json.native.id, 'claude/sonnet@xhigh')
  assert.equal(logged(env, 'choice')[0].picked, null)
})

test('pick excludes the pairs it is told, and a review never lands on the author model', (t) => {
  const { args } = fx.laneRun(t)
  const env = agyEnv(t, { quota: claudeFirst })
  const next = pick(args, env, [...SONNET_XHIGH, '--exclude', 'agy/claude-opus-5-5@medium,agy/gemini-4-argon@high'])
  assert.equal(next.json.picked.id, 'agy/claude-opus-5-5@high')
  const review = agyEnv(t, { quota: bothDry })
  const judge = pick(args, review, ['--role', 'supervisor', '--model', 'opus', '--effort', 'high', '--author', 'claude-opus-5-5'], 'task-1-1-supervise')
  assert.equal(judge.json.picked, null)
  assert.equal(judge.json.native.model, 'sonnet')
  const implementer = pick(args, review, ['--role', 'implementer', '--model', 'opus', '--effort', 'high', '--author', 'claude-opus-5-5'])
  assert.equal(implementer.json.native.model, 'opus')
})

test('pick refuses what it cannot read, with exit 1 and an error', (t) => {
  const { args } = fx.laneRun(t)
  const env = agyEnv(t, { quota: claudeFirst })
  for (const flags of [
    ['--role', 'implementer', '--model', 'gpt', '--effort', 'high'],
    ['--role', 'implementer', '--model', 'sonnet', '--effort', 'ultra'],
    ['--role', 'judge', '--model', 'sonnet', '--effort', 'high'],
    ['--role', 'implementer', '--model', 'sonnet'],
    [...SONNET_XHIGH, '--exclude', 'agy/x'],
    [...SONNET_XHIGH, '--author', 'Bad Family'],
  ]) {
    const r = pick(args, env, flags)
    assert.equal(r.status, 1, JSON.stringify(flags))
    assert.equal(typeof r.json.error, 'string', JSON.stringify(flags))
  }
  assert.equal(pick(args, env, SONNET_XHIGH, 'not-a-call').status, 1)
})

test('took logs who ran the call and why, and refuses a cause it does not know', (t) => {
  const { args } = fx.laneRun(t)
  const env = agyEnv(t)
  const ok = fx.lane(args, 'took', [CALL, '--by', 'agy:claude-opus-5-5', '--cause', 'chosen'], env)
  assert.deepEqual(ok.json, { logged: true })
  const native = fx.lane(args, 'took', ['final-review', '--by', 'native', '--cause', 'no-candidate'], env)
  assert.deepEqual(native.json, { logged: true })
  const entries = logged(env, 'took')
  assert.deepEqual(entries.map((e) => [e.run, e.call, e.by, e.cause]), [[args.runId, CALL, 'agy:claude-opus-5-5', 'chosen'], [args.runId, 'final-review', 'native', 'no-candidate']])
  assert.deepEqual(fx.lane(args, 'took', ['final-review-slice-3', '--by', 'native', '--cause', 'no-candidate'], env).json, { logged: true })
  assert.equal(fx.lane(args, 'took', ['final-review-slice-x', '--by', 'native', '--cause', 'no-candidate'], env).status, 1)
  assert.equal(fx.lane(args, 'took', [CALL, '--by', 'native', '--cause', 'because'], env).status, 1)
  assert.equal(fx.lane(args, 'took', [CALL, '--by', 'agy claude', '--cause', 'chosen'], env).status, 1)
})

test('the refreshed reading of grok is saved, so a later pick within its life does not refresh it again', async (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const config = { reserve: 0.05, harnesses: { grok: { command: 'grok', quotaLifeMinutes: 30, groups: { grok: 'Grok' }, models: {} } } }
  const NEW = { windows: {}, source: { method: 'acp', ageMinutes: 0 } }
  let asked = 0
  const deps = {
    dataDir,
    createAdapter: () => ({ quotaCost: 'log', quota: () => ({ groups: { grok: { unknown: true, windows: {} } } }) }),
    refreshStale: async () => (asked++, { grok: { refreshed: true, method: 'acp', reading: NEW } }),
  }
  const now = Date.now()
  assert.deepEqual(await latestReadings(config, ['grok'], { ...deps, now }), { grok: NEW })
  assert.equal(asked, 1)
  assert.ok(fs.existsSync(readingFile(dataDir, 'grok')), 'the reading is saved where the router reads it')
  assert.deepEqual(await latestReadings(config, ['grok'], { ...deps, now: now + 10 * 60 * 1000 }), { grok: NEW })
  assert.equal(asked, 1, 'a second process within quotaLifeMinutes does not refresh again')
  await latestReadings(config, ['grok'], { ...deps, now: now + 31 * 60 * 1000 })
  assert.equal(asked, 2, 'past its life it is refreshed again')
})

test('a pick renews a stale muse reading through its refresher, the way it renews grok', async (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const config = { reserve: 0.05, harnesses: { muse: { command: 'muse', quotaLifeMinutes: 30, groups: { muse: 'Muse' }, models: {} } } }
  const NEW = { windows: {}, source: { command: 'muse exec --json', method: 'exec', ageMinutes: 0 } }
  let asked = 0
  const deps = {
    dataDir,
    createAdapter: () => ({ quotaCost: 'log', quota: () => ({ groups: { muse: { unknown: true, windows: {} } } }) }),
    refreshStale: async () => (asked++, { muse: { refreshed: true, method: 'exec', reading: NEW } }),
  }
  const now = Date.now()
  assert.deepEqual(await latestReadings(config, ['muse'], { ...deps, now }), { muse: NEW })
  assert.equal(asked, 1)
  assert.ok(fs.existsSync(readingFile(dataDir, 'muse')), 'the reading is saved where the router reads it')
  assert.deepEqual(await latestReadings(config, ['muse'], { ...deps, now: now + 10 * 60 * 1000 }), { muse: NEW })
  assert.equal(asked, 1, 'a second process within quotaLifeMinutes does not refresh again')
})

test('C16: pick gives the Muse pair, by the owner decision, to an Opus high call, and nothing to an Opus xhigh one', (t) => {
  const FAKE_MUSE = path.join(__dirname, 'fixtures', 'fake-muse.js')
  fs.chmodSync(FAKE_MUSE, 0o755)
  const { args } = fx.laneRun(t)
  const env = { ...fx.laneEnv(t, { mutate: (config) => { config.harnesses.muse.command = FAKE_MUSE } }), AETHER_LANE_HARNESSES: 'muse' }
  const file = path.join(env.AETHER_DATA_DIR, 'lanes', 'quota', 'muse-observed.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ observedAt: Date.now(), window: { usedPercent: 10, resetsAtMs: Date.now() + 3 * HOUR }, weekly: { usedPercent: 10, resetsAtMs: Date.now() + 5 * 24 * HOUR } }))
  const high = pick(args, env, ['--role', 'implementer', '--model', 'opus', '--effort', 'high'])
  assert.equal(high.status, 0, high.stdout + high.stderr)
  assert.deepEqual([high.json.requested, high.json.picked.id], [51.7, 'muse/muse-wonder-full-1.0@high'])
  const xhigh = pick(args, env, ['--role', 'implementer', '--model', 'opus', '--effort', 'xhigh'])
  assert.equal(xhigh.json.picked, null)
  assert.equal(xhigh.json.native.id, 'claude/opus@xhigh')
})

test('pause waits the seconds it is given, from 1 to 120, and refuses any other value', (t) => {
  const env = agyEnv(t)
  const started = Date.now()
  const r = runBin(LANE_BIN, ['pause', '--seconds', '1'], process.cwd(), env)
  assert.deepEqual(r.json, { paused: 1 })
  assert.ok(Date.now() - started >= 900)
  for (const bad of ['0', '121', 'x', '-1', '1.5']) assert.equal(runBin(LANE_BIN, ['pause', '--seconds', bad], process.cwd(), env).status, 1, bad)
  assert.equal(runBin(LANE_BIN, ['pause'], process.cwd(), env).status, 1)
})
