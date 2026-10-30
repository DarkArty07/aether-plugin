'use strict'

// Codex in a lane, end to end, with the real runner and the fake codex (tests/fixtures/fake-codex.js): a unit runs
// in its own worktree, a clean answer comes back with its usage and the quota that call left, every way a call can
// fail ends as a failed call, a quota mark follows the reading rather than the words, and a delegate runs on Codex.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const lanes = require('../plugins/aether/lib/lanes.js')
const marks = require('../plugins/aether/lib/lane-marks.js')
const { choose, runArgs, idleHarnesses } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { WT_BIN, runBin, commitIn, tempDir, makeRepo } = require('./helpers.js')
const fx = require('./lane-fixtures.js')

const FAKE_CODEX = path.join(__dirname, 'fixtures', 'fake-codex.js')
const RATE_LIMITS = path.join(__dirname, 'fixtures', 'codex', 'rate-limits.json')
const MODEL = 'gpt-6.1-terra'
const IMPLEMENT = 'task-1-1-implement'
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, message || `${actual} is not ${expected}`)

const DONE = { status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' }
const READY = { verdict: 'ready', findings: [], declined: [], summary: 'Ready.' }
const answering = (answer, extra = {}) => ({ answer: JSON.stringify(answer), ...extra })

const flags = (digest, { role = 'implementer', task = 'task-1', model = MODEL, effort = 'medium' } = {}) =>
  ['--role', role, ...(task ? ['--task', task] : []), '--model', model, '--effort', effort, '--digest', digest]

function setScript(env, script) {
  return { ...env, AETHER_FAKE_CODEX_SCRIPT: JSON.stringify(script) }
}

// Rewrites the test's rate-limits file from the fixture, then applies mutate.
function limits(env, mutate) {
  const reading = JSON.parse(fs.readFileSync(RATE_LIMITS, 'utf8'))
  if (mutate) mutate(reading)
  fs.writeFileSync(env.AETHER_FAKE_CODEX_RATE_LIMITS, JSON.stringify(reading))
}

// The fixture's resets are fixed dates (2026-10-30 for the 5-hour window, 2026-11-06 for the weekly one). Once a
// window's reset has passed, a reading that shows the window full is not a confirmed mark (a reset in the past is
// not confirmed). A full window under test keeps both resets ahead of now, on both copies Codex reads, so the
// test does not depend on the calendar.
function fillPrimary(reading) {
  const now = Math.floor(Date.now() / 1000)
  for (const limit of [reading.rateLimits, reading.rateLimitsByLimitId.codex]) {
    limit.primary.usedPercent = 100
    limit.primary.resetsAt = now + 3 * 60 * 60
    limit.secondary.resetsAt = now + 6 * 24 * 60 * 60
  }
}

function codexEnv(t, script, { command = FAKE_CODEX } = {}) {
  fs.chmodSync(FAKE_CODEX, 0o755)
  const env = fx.laneEnv(t, { mutate: (config) => { config.harnesses.codex.command = command } })
  const dir = path.dirname(env.AETHER_DATA_DIR)
  const full = {
    ...env,
    AETHER_LANE_HARNESSES: 'codex',
    AETHER_FAKE_CODEX_LOG: path.join(dir, 'codex.log'),
    AETHER_FAKE_CODEX_RATE_LIMITS: path.join(dir, 'rate-limits.json'),
    AETHER_FAKE_CODEX_STATE: path.join(dir, 'codex-state'),
    OPENAI_API_KEY: 'secret-key',
  }
  limits(full)
  return setScript(full, script)
}

// One entry per `exec`. The quota read is `app-server` and is not a call.
function codexCalls(env) {
  if (!fs.existsSync(env.AETHER_FAKE_CODEX_LOG)) return []
  return fs.readFileSync(env.AETHER_FAKE_CODEX_LOG, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((entry) => entry.kind === 'exec')
}

const markFiles = (env) => {
  const dir = marks.marksDir(env.AETHER_DATA_DIR)
  return fs.existsSync(dir) ? fs.readdirSync(dir) : []
}

function codexRun(t, script, options) {
  const { args } = fx.laneRun(t)
  return { args, env: codexEnv(t, script, options) }
}

function startImplementer(args, env) {
  const digest = fx.writePrompt(args, IMPLEMENT, 'You are implementing task-1: Task 1 title.')
  return fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
}

function finishImplementer(args, env) {
  const start = startImplementer(args, env)
  assert.equal(start.json.started, true, start.stdout + start.stderr)
  return fx.waitDone(args, IMPLEMENT, env)
}

function runImplementer(t, script, options) {
  const { args, env } = codexRun(t, script, options)
  const start = startImplementer(args, env)
  const done = start.json && start.json.started === true ? fx.waitDone(args, IMPLEMENT, env) : null
  return { args, env, start, done }
}

const callEntries = (env) => lanes.readLog(env.AETHER_DATA_DIR).filter((entry) => entry.kind === 'call')

const threadStarted = `${JSON.stringify({ type: 'thread.started', thread_id: 't1' })}\n`

function writeBrief(repo, lines) {
  const file = path.join(repo.dir, 'brief.md')
  fs.writeFileSync(file, lines.join('\n') + '\n')
  repo.git('add', 'brief.md')
  repo.git('commit', '-q', '-m', 'brief')
  return file
}

function runDelegate(repo, env, { brief, model = 'haiku', effort = 'high', owns = 'src/**', tests = null, session = 's1' } = {}) {
  const args = ['delegate', '--brief', brief, '--model', model, '--effort', effort, '--owns', owns]
  if (tests !== null) args.push('--tests', tests)
  if (session !== null) args.push('--session', session)
  return runBin(fx.LANE_BIN, args, repo.dir, env)
}

test('a unit runs in Codex in its own worktree, safely, and comes back with its usage and the quota that call left (R7)', (t) => {
  const { args, env, done } = runImplementer(t, answering(DONE, { files: { 'src/t1/a.js': 'x' } }))
  assert.equal(done.status, 'ok', done.detail)
  const [call, ...others] = codexCalls(env)
  assert.equal(others.length, 0)
  assert.equal(call.cwd, path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-1'))
  for (const word of ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--output-schema']) assert.ok(call.argv.includes(word), word)
  assert.equal(call.argv[call.argv.indexOf('--model') + 1], 'gpt-6.1-terra')
  assert.ok(call.argv.includes('model_reasoning_effort=medium'), 'the effort of the pair goes as it is')
  assert.equal(call.apiKey, null, 'the key of the caller does not reach the call')
  assert.equal(done.lane.harness, 'codex')
  assert.deepEqual([done.lane.usage.input, done.lane.usage.total], [1000, 1200])
  assert.equal(done.lane.quota.unknown, false)
  near(done.lane.quota.remaining, 0.99, 'the weekly window, the longest')
})

test('a reviewer gets the structured object it asked for, and a missing field or prose is a failed call', (t) => {
  const { repo, args } = fx.laneRun(t)
  const unit = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], args.repoRoot).json.path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  runBin(WT_BIN, ['diff', args.runId, 'task-1'], args.repoRoot)
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], args.repoRoot).json.merged, true)
  runBin(WT_BIN, ['diff', args.runId, '--final'], args.repoRoot)
  const env = codexEnv(t, {})
  const reviewFlags = { role: 'reviewer', task: null, model: 'gpt-6.1-sol', effort: 'high' }

  const review = (call, script) => {
    const digest = fx.writePrompt(args, call, 'Final review.')
    const start = fx.lane(args, 'start', [call, ...flags(digest, reviewFlags)], setScript(env, script))
    assert.equal(start.json.started, true, start.stdout + start.stderr)
    assert.equal(start.json.model, 'gpt-6.1-sol')
    return fx.waitDone(args, call, env)
  }
  const prose = [
    JSON.stringify({ type: 'thread.started', thread_id: 't1' }),
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'I read the package and it looks fine.' } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 200, reasoning_output_tokens: 0 } }),
  ].join('\n') + '\n'

  const whole = review('final-review-1', answering(READY))
  assert.deepEqual([whole.status, whole.result], ['ok', READY], whole.detail)

  const short = { ...READY }
  delete short.summary
  const missing = review('final-review-2', answering(short))
  assert.equal(missing.status, 'failed')
  assert.match(missing.detail, /missing /)
  assert.equal(missing.result, null)

  const spoken = review('final-review-3', { stdout: prose })
  assert.deepEqual([spoken.status, spoken.detail, spoken.result], ['failed', 'no structured output', null])
  assert.equal(codexCalls(env).length, 3)
})

test('every way a call can fail ends as a failed call with its cause and no question for the owner (R8)', (t) => {
  const missing = runImplementer(t, {}, { command: '/nowhere/codex' })
  assert.deepEqual(missing.start.json, { unavailable: 'not-installed' })
  assert.equal(fs.existsSync(missing.env.AETHER_FAKE_CODEX_LOG), false, 'nothing logged')
  assert.deepEqual(callEntries(missing.env), [])
  assert.equal(Object.hasOwn(missing.start.json, 'question'), false)

  const cases = [
    ['no session', { exit: 1, stderr: 'Not logged in. Run codex login.\n' }, 'exit 1: Not logged in. Run codex login.'],
    ['died midway', { exit: 137, stdout: threadStarted }, null],
    ['no answer', { stdout: '' }, 'no result'],
  ]
  for (const [name, script, detail] of cases) {
    const { env, done } = runImplementer(t, script)
    assert.equal(done.status, 'failed', `${name}: ${done.detail}`)
    if (detail === null) assert.ok(done.detail.startsWith('exit 137'), done.detail)
    else assert.equal(done.detail, detail)
    assert.deepEqual(markFiles(env), [], name)
    assert.equal(done.result, null, name)
    assert.equal(Object.hasOwn(done, 'question'), false, name)
    const entries = callEntries(env)
    assert.equal(entries.length, 1, name)
    assert.equal(entries[0].status, 'failed', name)
    assert.equal(entries[0].detail, done.detail, name)
  }
})

test('a refusal for quota is the reading, not the words: the same stderr is a plain failure while the reading is healthy, and a quota failure with a mark once it shows the window full (R11)', (t) => {
  const stderr = 'You have hit your usage limit. Try again later.\n'
  const script = { exit: 1, stderr }
  const healthy = runImplementer(t, script)
  assert.equal(healthy.done.status, 'failed', healthy.done.detail)
  assert.equal(healthy.done.detail, 'exit 1: You have hit your usage limit. Try again later.')
  assert.deepEqual(markFiles(healthy.env), [])

  const full = codexRun(t, { ...script, sleepMs: 800 })
  const start = startImplementer(full.args, full.env)
  assert.equal(start.json.started, true, start.stdout + start.stderr)
  limits(full.env, fillPrimary)
  const done = fx.waitDone(full.args, IMPLEMENT, full.env)
  assert.equal(done.status, 'quota', done.detail)
  assert.deepEqual(markFiles(full.env), ['codex__codex.json'])
  const mark = marks.liveMark(full.env.AETHER_DATA_DIR, 'codex', 'codex', Date.now())
  assert.equal(mark.confirmed, true)
  assert.notEqual(mark.reason, 'quota refusal')
})

test('the mark heals by itself: a fresh healthy reading lifts it, and a reset that has passed ends it (R11)', (t) => {
  const stderr = 'You have hit your usage limit. Try again later.\n'
  const { args, env } = codexRun(t, { exit: 1, stderr, sleepMs: 800 })
  assert.equal(startImplementer(args, env).json.started, true)
  limits(env, fillPrimary)
  const done = fx.waitDone(args, IMPLEMENT, env)
  assert.equal(done.status, 'quota', done.detail)
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'codex', 'codex', Date.now()).confirmed, true)

  limits(env)
  const report = runBin(fx.LANE_BIN, ['quota', 'codex', '--json'], tempDir(t), env)
  assert.equal(report.status, 0, report.stderr)
  const group = report.json.harnesses.codex.groups.codex
  assert.equal(group.mark, null)
  assert.equal(group.usable, true)

  const past = Date.now() - 60 * 1000
  const file = marks.markFile(env.AETHER_DATA_DIR, 'codex', 'codex')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify({ harness: 'codex', group: 'codex', at: past - 60 * 1000, until: past, confirmed: true })}\n`)
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'codex', 'codex', Date.now()), null)
})

test('the quota view and the choice treat Codex as any harness (R10)', (t) => {
  const env = codexEnv(t, {})
  const report = runBin(fx.LANE_BIN, ['quota', 'codex', '--json'], tempDir(t), env)
  assert.equal(report.status, 0, report.stderr)
  const codex = report.json.harnesses.codex
  assert.equal(codex.installed, true)
  assert.equal(codex.version, 'codex-cli 0.166.0')
  const group = codex.groups.codex
  assert.deepEqual(Object.keys(group.windows), ['5h', 'weekly'])
  near(group.windows['5h'].remaining, 0.94)
  near(group.windows.weekly.remaining, 0.99)
  assert.equal(group.usable, true)
  // The view echoes the table command. The suite points that command at the fake, never at `codex` on PATH.
  assert.equal(group.source.command, FAKE_CODEX)

  const { pairs } = loadPairs()
  const config = lanes.loadConfig(env.AETHER_LANES_CONFIG)
  const view = { installed: () => true, enabled: ['codex'] }
  assert.deepEqual(runArgs(config, pairs, view).harnesses, ['codex'])
  assert.deepEqual(idleHarnesses(config, pairs, view), [])

  const decision = choose({
    pairs,
    reference: { model: 'sonnet', effort: 'high' },
    harnesses: { codex: report.json.harnesses.codex },
  })
  assert.equal(decision.picked.id, 'codex/gpt-6.1-terra@high')
})

test('an editing delegate runs on Codex in its own worktree and comes back as a unit branch the Lead merges, and its reviewer is another pair (R20)', (t) => {
  const repo = makeRepo(t)
  const env = codexEnv(t, [
    answering(DONE, { files: { 'src/new.js': 'hello' }, commit: 'add new' }),
    answering(READY),
  ])
  const brief = writeBrief(repo, ['Write src/new.js saying hello'])
  const headBefore = repo.git('rev-parse', 'HEAD')
  const r = runDelegate(repo, env, { brief, tests: 'node -e "process.exit(0)"' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const json = r.json
  assert.equal(json.status, 'done', JSON.stringify(json))
  assert.equal(json.pair.harness, 'codex')
  assert.equal(json.pair.id, 'codex/gpt-6.1-terra@low')
  assert.equal(repo.git('show', `${json.branch}:src/new.js`), 'hello')
  assert.equal(repo.git('status', '--porcelain'), '')
  assert.equal(repo.git('rev-parse', 'HEAD'), headBefore)
  assert.equal(json.review.status, 'done')
  assert.notEqual(json.review.pair.id, json.pair.id, 'the reviewer is Sol')
  assert.ok(json.review.pair.id.includes('gpt-6.1-sol'), json.review.pair.id)
  assert.equal(json.review.verdict, 'ready')
})

test('with Codex failing, an editing delegate passes to the next pair or ends without a candidate, with no question for the owner (R8, R20)', (t) => {
  const repo = makeRepo(t)
  const env = codexEnv(t, { exit: 1, stderr: 'Not logged in. Run codex login.\n' })
  const brief = writeBrief(repo, ['Write src/new.js saying hello'])
  const headBefore = repo.git('rev-parse', 'HEAD')
  const r = runDelegate(repo, env, { brief, tests: 'node -e "process.exit(0)"' })
  const json = r.json
  assert.ok(json.status === 'failed' || json.status === 'no-candidate', r.stdout + r.stderr)
  assert.match(JSON.stringify(json), /exit 1: Not logged in/)
  assert.equal(repo.git('status', '--porcelain'), '')
  assert.equal(repo.git('rev-parse', 'HEAD'), headBefore)
  assert.equal(Object.hasOwn(json, 'question'), false)
})

test('a reviewing lane on Codex may read with its shell, because that is its only tool, and every other harness keeps the rule of no commands', () => {
  const calls = require('../plugins/aether/lib/lane-calls.js')
  const notes = [calls.laneNote('supervisor', 'codex'), calls.laneNote('reviewer', 'codex'), calls.unitReviewerNote('codex')]
  for (const note of notes) {
    assert.match(note, /your only tool is the shell, so use it to read/)
    assert.match(note, /do not change any file/)
    assert.doesNotMatch(note, /do not run commands/)
  }
  for (const harness of ['agy', 'grok', 'muse']) {
    for (const note of [calls.laneNote('supervisor', harness), calls.laneNote('reviewer', harness), calls.unitReviewerNote(harness)]) assert.match(note, /Your review is read-only: do not run commands, and do not change any file\./)
  }
})
