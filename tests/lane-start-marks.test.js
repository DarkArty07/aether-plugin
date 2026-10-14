'use strict'

// Spec 002, R13 and R14 in lib/lane-calls.js: a start that finds a group dry, and a call that ends for quota, leave a
// dry mark on disk; a start respects a live mark; a reading is kept for its life; a finished call reports its group.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const lanes = require('../plugins/aether/lib/lanes.js')
const marks = require('../plugins/aether/lib/lane-marks.js')
const work = require('../plugins/aether/lib/lane-work.js')
const calls = require('../plugins/aether/lib/lane-calls.js')
const { registerAdapter, unregisterAdapter } = require('../plugins/aether/lib/harness/index.js')
const fx = require('./lane-fixtures.js')

const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' })
const IMPLEMENT = 'task-1-1-implement'
const MIN = 60 * 1000
const RESERVE = 0.05
// Far enough ahead that a test run never passes it.
const FUTURE = new Date(Date.now() + 72 * 3600 * 1000).toISOString()
const flags = (digest) => ['--role', 'implementer', '--task', 'task-1', '--model', 'gemini-3.8-flash', '--effort', 'xhigh', '--digest', digest]
const usageCalls = (env) => fx.agyCalls(env).filter((c) => c.argv[1] === '/usage')
const groupQuota = (gemini) => ({ 'Gemini Models': gemini, 'Claude and GPT models': [0.9, 0.9] })

// A table entry for a second harness with one model, which replaces sonnet and serves implementers.
function codexEntry() {
  const levels = { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' }
  return {
    command: fx.FAKE_AGY,
    maxParallel: 1,
    waitSeconds: 60,
    timeouts: { implementer: 60, supervisor: 60, reviewer: 60 },
    groups: { codex: 'codex models' },
    models: { 'gpt-codex': { group: 'codex', replaces: 'sonnet', roles: ['implementer'], levels } },
  }
}

// Starts the implementer call of a fresh run with `lines` as its prompt, and waits for it.
function runCall(t, lines, env) {
  const { args } = fx.laneRun(t)
  const digest = fx.writePrompt(args, IMPLEMENT, ['You are implementing task-1: Task 1 title.', ...lines].join('\n'))
  const start = fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  assert.equal(start.json.started, true, start.stdout + start.stderr)
  return fx.waitDone(args, IMPLEMENT, env)
}

test('a start refuses a group a live mark holds, without reading its quota, and does not renew the mark', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  const digest = fx.writePrompt(args, IMPLEMENT, 'the message')
  const held = marks.markDry(env.AETHER_DATA_DIR, { harness: 'agy', group: 'gemini', reserve: RESERVE, now: Date.now() - 10 * MIN })
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env).json, { unavailable: 'quota' })
  assert.equal(usageCalls(env).length, 0)
  assert.deepEqual(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'gemini'), held)
  assert.equal(fx.agyTurns(env).length, 0)
})

test('a start that finds the group under the reserve, with a balance read, holds it until the reset', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { quota: groupQuota([0.9, 0.04, null, FUTURE]) })
  const digest = fx.writePrompt(args, IMPLEMENT, 'the message')
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env).json, { unavailable: 'quota' })
  const mark = marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'gemini')
  assert.deepEqual([mark.confirmed, mark.until, mark.resetsAt], [true, Date.parse(FUTURE), new Date(FUTURE).toISOString()])
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'claude'), null, 'the other group of the harness is not held')
})

test('a start that finds the group under the reserve, with a reset it cannot confirm, holds it for the length the table gives, 60 minutes by default', (t) => {
  for (const [minutes, expected] of [[undefined, 60], [15, 15]]) {
    const { args } = fx.laneRun(t)
    // The fake's default weekly reset is a date long past, so the reading cannot confirm the mark until the reset.
    const env = fx.laneEnv(t, { quota: groupQuota([0.9, 0.04]), mutate: (config) => minutes !== undefined && (config.dryMarkMinutes = minutes) })
    const digest = fx.writePrompt(args, IMPLEMENT, 'the message')
    assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env).json, { unavailable: 'quota' })
    const mark = marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'gemini')
    assert.deepEqual([mark.confirmed, mark.resetsAt, mark.until - mark.at], [false, null, expected * MIN])
  }
})

test('a start whose reading fails leaves the group unknown: the call starts, nothing is held, and the final reading fails the same way', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  fs.writeFileSync(env.AETHER_FAKE_AGY_QUOTA_FILE, 'unreadable')
  const digest = fx.writePrompt(args, IMPLEMENT, `You are implementing task-1: Task 1 title.\nFAKE-AGY: answer ${DONE}`)
  const start = fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  assert.equal(start.json.started, true, start.stdout + start.stderr)
  const done = fx.waitDone(args, IMPLEMENT, env)
  assert.equal(done.status, 'ok', done.detail)
  assert.equal(done.lane.quota, undefined, 'a final reading that cannot be read gives no group reading to report')
  assert.deepEqual(marks.liveMarks(env.AETHER_DATA_DIR), [])
  const call = JSON.parse(fs.readFileSync(path.join(args.runDir, 'lanes', IMPLEMENT, 'call.json'), 'utf8'))
  assert.equal(call.quotaBefore, null)
})

test('a reading is kept for the life the table gives: two starts launch /usage once, and a life of zero launches it each time', (t) => {
  for (const [life, startsReads] of [[undefined, 1], [0, 2]]) {
    const env = fx.laneEnv(t, { mutate: (config) => life !== undefined && (config.harnesses.agy.quotaLifeMinutes = life) })
    const runs = [fx.laneRun(t), fx.laneRun(t)]
    // Each call sleeps, so it has not ended, and read /usage again, when the second start returns.
    const done = runs.map(({ args }) => {
      const digest = fx.writePrompt(args, IMPLEMENT, `You are implementing task-1: Task 1 title.\nFAKE-AGY: sleep 2\nFAKE-AGY: answer ${DONE}`)
      assert.equal(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env).json.started, true)
      return args
    })
    assert.equal(usageCalls(env).length, startsReads, `life ${life}`)
    for (const args of done) fx.waitDone(args, IMPLEMENT, env)
    assert.equal(usageCalls(env).length, startsReads + 2, 'each call reads /usage afresh when it ends')
  }
})

test('a call that ends for quota holds its group until the reset when its final reading shows it under the reserve, and a call that fails does not', (t) => {
  const env = fx.laneEnv(t)
  const low = JSON.stringify(groupQuota([0.9, 0.01, null, FUTURE]))
  const quota = runCall(t, ['FAKE-AGY: write src/t1/partial.js half', `FAKE-AGY: write-abs ${env.AETHER_FAKE_AGY_QUOTA_FILE} ${low}`, 'FAKE-AGY: exit-error'], env)
  assert.equal(quota.status, 'quota', quota.detail)
  const mark = marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'gemini')
  assert.deepEqual([mark.confirmed, mark.until], [true, Date.parse(FUTURE)])
  assert.deepEqual(quota.lane.quota.usable, false)

  const other = fx.laneEnv(t)
  const failed = runCall(t, ['FAKE-AGY: write src/t1/half.js half', 'FAKE-AGY: timeout'], other)
  assert.equal(failed.status, 'failed')
  assert.equal(marks.liveMark(other.AETHER_DATA_DIR, 'agy', 'gemini'), null)
  assert.deepEqual(marks.liveMarks(other.AETHER_DATA_DIR), [])
})

test('a call of a harness that reports no quota, which ends for a quota line in its output, holds its group for the default length', async (t) => {
  // codex stands for any harness without a reader: only the output can say it ran dry, and the group has no balance.
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { mutate: (config) => (config.harnesses.codex = codexEntry()) })
  for (const [name, value] of Object.entries({ ...env, AETHER_LANE_HARNESSES: 'agy,codex' })) {
    const previous = process.env[name]
    t.after(() => (previous === undefined ? delete process.env[name] : (process.env[name] = previous)))
    process.env[name] = value
  }
  registerAdapter('codex', () => ({
    name: 'codex',
    installed: () => true,
    version: () => '9.1.0',
    quota: () => ({ groups: { codex: { unknown: true, windows: {} } } }),
    modelArg: ({ model }) => model,
    argv: () => [fx.FAKE_AGY, '-p', 'FAKE-AGY: exit-error'],
    parse: () => ({ clean: false, reason: 'quota: Error: usage limit reached', structured: null, usage: {}, conversation: null }),
  }))
  t.after(() => unregisterAdapter('codex'))
  const { workdir } = work.prepareImplementer(args.repoRoot, args.runId, 'task-1')
  fx.writePrompt(args, IMPLEMENT, 'You are implementing task-1: Task 1 title.')
  const dir = path.join(args.runDir, 'lanes', IMPLEMENT)
  const info = { runId: args.runId, call: IMPLEMENT, role: 'implementer', task: 'task-1', harness: 'codex', model: 'gpt-codex', laneModel: 'gpt-codex', group: 'codex', effort: 'high', level: 'high', timeoutSeconds: 60, workdir, quotaBefore: null, session: null, startedAt: Date.now() }
  fs.writeFileSync(path.join(dir, 'call.json'), `${JSON.stringify(info)}\n`)
  await calls.runCall(args.repoRoot, args.runId, IMPLEMENT)
  const done = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'))
  assert.deepEqual([done.status, done.detail], ['quota', 'quota: Error: usage limit reached'])
  const mark = marks.liveMark(env.AETHER_DATA_DIR, 'codex', 'codex')
  assert.deepEqual([mark.confirmed, mark.resetsAt, mark.until - mark.at], [false, null, 60 * MIN])
  // Its reading has no balance, so the result says the group is unknown and unusable only because of the mark.
  assert.deepEqual([done.lane.quota.unknown, done.lane.quota.usable, done.lane.quota.priority], [true, false, null])
})

test("a finished call reports its group's final reading: whether it is usable, its balance, its reset and its priority", (t) => {
  const env = fx.laneEnv(t, { quota: groupQuota([0.9, 0.8, null, FUTURE]) })
  const done = runCall(t, [`FAKE-AGY: answer ${DONE}`], env)
  assert.equal(done.status, 'ok', done.detail)
  const { quota } = done.lane
  assert.deepEqual([quota.usable, quota.unknown, quota.remaining, quota.resetsAt, quota.usedPercentAbsent], [true, false, 0.8, new Date(FUTURE).toISOString(), false])
  assert.ok(quota.priority > 0.8 / 74 && quota.priority < 0.8 / 71, String(quota.priority))
  assert.equal(done.digest, lanes.resultDigest({ result: done.result, lane: done.lane }))

  // A final reading that cannot be read gives no group reading to report.
  const unreadable = fx.laneEnv(t)
  const failed = runCall(t, [`FAKE-AGY: write-abs ${unreadable.AETHER_FAKE_AGY_QUOTA_FILE} unreadable`, 'FAKE-AGY: exit-error'], unreadable)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.lane.quota, undefined)
})
