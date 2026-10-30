'use strict'

// Issue 104: a swarm call killed at its time cap writes the slow mark of its pair (lib/router-slow.js), and
// `aether-lane pick` leaves out the pairs that hold a live mark, as router-pick does, for the mark's life.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const pairs = require('../plugins/aether/lib/pairs.js')
const slow = require('../plugins/aether/lib/router-slow.js')
const calls = require('../plugins/aether/lib/lane-calls.js')
const work = require('../plugins/aether/lib/lane-work.js')
const fx = require('./lane-fixtures.js')

const HOUR = 3600 * 1000
const MIN = 60 * 1000
const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString()
// agy's quota as the fake reports it (tests/lane-pick.test.js): the Claude group renews first.
const claudeFirst = { 'Gemini Models': [0.9, 0.9, null, inHours(200)], 'Claude and GPT models': [0.9, 0.9, null, inHours(40)] }
const agyEnv = (t, options) => ({ ...fx.laneEnv(t, options), AETHER_LANE_HARNESSES: 'agy' })
const pick = (args, env, flags, call = 'task-1-1-implement') => fx.lane(args, 'pick', [call, ...flags], env)
const SONNET_XHIGH = ['--role', 'implementer', '--model', 'sonnet', '--effort', 'xhigh']
const OPUS_MEDIUM = { harness: 'agy', model: 'claude-opus-5-5', effort: 'medium' }
const OPUS_MEDIUM_ID = 'agy/claude-opus-5-5@medium'
const IMPLEMENT = 'task-1-1-implement'
const whyOf = (r) => Object.fromEntries(r.json.candidates.map((c) => [c.id, c.why]))

// Sets this process's environment to env for one test, and puts each variable back after it.
function useEnv(t, env) {
  for (const [name, value] of Object.entries(env)) {
    const previous = process.env[name]
    t.after(() => {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    })
    process.env[name] = value
  }
}

// Runs one implementer call on the Opus medium pair in this process, as start would have recorded it, with the kill
// grace of graceSeconds, and returns its result. The prompt is the lines after the first.
async function runOpusCall(t, lines, { timeoutSeconds, graceSeconds }) {
  const env = agyEnv(t, { quota: claudeFirst })
  useEnv(t, env)
  const { args } = fx.laneRun(t)
  const { workdir } = work.prepareImplementer(args.repoRoot, args.runId, 'task-1')
  fx.writePrompt(args, IMPLEMENT, ['You are implementing task-1: Task 1 title.', ...lines].join('\n'))
  const dir = path.join(args.runDir, 'lanes', IMPLEMENT)
  const info = {
    runId: args.runId,
    call: IMPLEMENT,
    role: 'implementer',
    task: 'task-1',
    harness: 'agy',
    model: 'claude-opus-5-5',
    laneModel: 'claude-opus-5-5',
    group: 'claude',
    effort: 'medium',
    level: 'medium',
    timeoutSeconds,
    workdir,
    quotaBefore: null,
    session: null,
    startedAt: Date.now(),
  }
  fs.writeFileSync(path.join(dir, 'call.json'), `${JSON.stringify(info)}\n`)
  await calls.runCall(args.repoRoot, args.runId, IMPLEMENT, { graceSeconds })
  return { args, env, done: JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')) }
}

test('a swarm call killed at its time cap writes the slow mark of its pair, and the next pick skips that pair', async (t) => {
  const { args, env, done } = await runOpusCall(t, ['FAKE-AGY: sleep 30'], { timeoutSeconds: 1, graceSeconds: 1 })
  assert.equal(done.status, 'failed', done.detail)
  assert.match(done.detail, /exit 137/)
  assert.deepEqual(slow.slowPairIds(env.AETHER_DATA_DIR, pairs.loadPairs().pairs, Date.now()), [OPUS_MEDIUM_ID])
  const next = pick(args, env, SONNET_XHIGH)
  assert.equal(next.status, 0, next.stdout + next.stderr)
  assert.equal(whyOf(next)[OPUS_MEDIUM_ID], 'excluded')
  assert.notEqual(next.json.picked.id, OPUS_MEDIUM_ID)
  const byFlag = pick(args, env, [...SONNET_XHIGH, '--exclude', OPUS_MEDIUM_ID])
  assert.equal(next.json.picked.id, byFlag.json.picked.id, 'the pair is left out as an excluded pair is')
})

test('a swarm call that ends by itself writes no slow mark', async (t) => {
  const { env, done } = await runOpusCall(t, ['FAKE-AGY: exit-error some failure'], { timeoutSeconds: 1, graceSeconds: 1 })
  assert.equal(done.status, 'failed', done.detail)
  assert.doesNotMatch(done.detail, /exit 137/)
  assert.deepEqual(slow.slowPairIds(env.AETHER_DATA_DIR, pairs.loadPairs().pairs, Date.now()), [])
})

test('a slow mark holds its pair for an hour, and a mark that has run out holds nothing', (t) => {
  // Sonnet xhigh asks 49.6. Opus medium is 48.1, below the floor, so the pair this quota picks is Opus high.
  const opusHigh = { harness: 'agy', model: 'claude-opus-5-5', effort: 'high' }
  const opusHighId = 'agy/claude-opus-5-5@high'
  const { args } = fx.laneRun(t)
  const live = agyEnv(t, { quota: claudeFirst })
  slow.markSlow(live.AETHER_DATA_DIR, opusHigh, { now: Date.now() - 59 * MIN })
  const held = pick(args, live, SONNET_XHIGH)
  assert.equal(held.status, 0, held.stdout + held.stderr)
  assert.equal(whyOf(held)[opusHighId], 'excluded')
  assert.equal(held.json.picked, null, 'no other implementer pair reaches Sonnet xhigh')

  const expired = agyEnv(t, { quota: claudeFirst })
  slow.markSlow(expired.AETHER_DATA_DIR, opusHigh, { now: Date.now() - 61 * MIN })
  const again = pick(args, expired, SONNET_XHIGH)
  assert.equal(again.json.picked.id, opusHighId)
  assert.equal(whyOf(again)[opusHighId], null, 'it is a candidate again')
})

test('a slow mark of one pair does not hide another effort of the same model', (t) => {
  const { args } = fx.laneRun(t)
  const env = agyEnv(t, { quota: claudeFirst })
  slow.markSlow(env.AETHER_DATA_DIR, OPUS_MEDIUM, { now: Date.now() })
  const r = pick(args, env, SONNET_XHIGH)
  assert.equal(whyOf(r)['agy/claude-opus-5-5@high'], null, 'opus at high is not excluded')
  assert.equal(whyOf(r)[OPUS_MEDIUM_ID], 'excluded')
  assert.equal(r.json.picked.id, 'agy/claude-opus-5-5@high')
})

test('when every pair of the table is held by a slow mark, pick gives no pair and the native fallback, and logs it', (t) => {
  const { args } = fx.laneRun(t)
  const env = agyEnv(t, { quota: claudeFirst })
  for (const pair of pairs.loadPairs().pairs.filter((p) => p.harness === 'agy')) slow.markSlow(env.AETHER_DATA_DIR, pair, { now: Date.now() })
  const r = pick(args, env, SONNET_XHIGH)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.picked, null)
  assert.equal(r.json.native.id, 'claude/sonnet@xhigh')
  assert.match(r.json.reason, /^native claude\/sonnet@xhigh:/)
  assert.ok(r.json.candidates.filter((c) => c.id.startsWith('agy/')).every((c) => c.why === 'excluded'))
})
