'use strict'

// Muse in a lane, end to end, with the real runner and the fake muse (tests/fixtures/fake-muse.js): a unit runs in its
// own worktree, a clean answer comes back with its usage and the quota that call left, every way a call can fail ends
// as a failed call (and only the quota data of a failure leaves a mark), the observation and its marks agree on what is
// newer, the quota view and the order treat Muse as any other harness, and a stopped call takes its children with it.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const lanes = require('../plugins/aether/lib/lanes.js')
const marks = require('../plugins/aether/lib/lane-marks.js')
const order = require('../plugins/aether/lib/lane-order.js')
const { WT_BIN, runBin, commitIn, tempDir } = require('./helpers.js')
const fx = require('./lane-fixtures.js')

const FAKE_MUSE = path.join(__dirname, 'fixtures', 'fake-muse.js')
const SMOKE = path.join(__dirname, '..', 'scripts', 'lane-smoke.js')
const MODEL = 'muse-spark-1.3'
const IMPLEMENT = 'task-1-1-implement'
const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)

const DONE = { status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' }
const READY = { verdict: 'ready', findings: [], declined: [], summary: 'Ready.' }

// The records of `muse exec --json`, as far as the adapter reads them: one JSON object per line.
let sequence = 0
const record = (type, payload) =>
  JSON.stringify({ schema_version: 1, id: `id-${++sequence}`, stream: { kind: 'session', id: 's1' }, sequence, recorded_at: sequence, record_type: 'event', durability: 'durable', causation_id: 'c1', payload_type: type, payload_schema_version: 1, payload })
const completed = (text) => record('run.terminal.completed', { kind: 'run_terminal', terminal: 'completed', reason: null, text })
const failedTurn = (reason) => record('run.terminal.failed', { kind: 'run_terminal', terminal: 'failed', reason, text: null })
const usageRecord = (allowance = null) =>
  record('run.usage', { kind: 'run_usage', allowance, calls: 1, completed_calls: 1, failed_calls: 0, cancelled_calls: 0, children_included: false, models: [{ model: MODEL, calls: 1, input_tokens: 1000, output_tokens: 200, cached_tokens: 300, reasoning_tokens: 50 }] })
const lines = (...items) => `${items.join('\n')}\n`
const allowanceOf = (used5h, usedWeek, now = Date.now()) => ({ tier: 'power', window: { usedPercent: used5h, resetsAtMs: now + 3 * HOUR, windowDurationMins: 300 }, weekly: { usedPercent: usedWeek, resetsAtMs: now + 5 * DAY } })

// A script of the fake muse that answers with `answer`, and the allowance a run reports when it has one.
const answering = (answer, allowance = null, extra = {}) => ({ stdout: lines(completed(JSON.stringify(answer)), usageRecord(allowance)), ...extra })

const flags = (digest, { role = 'implementer', task = 'task-1' } = {}) => ['--role', role, ...(task ? ['--task', task] : []), '--model', MODEL, '--effort', 'xhigh', '--digest', digest]

// The lane table's muse entry, as the plan's tests copy and change it: the fake muse as its command, one model, and
// waits that a test never reaches. The table maps an effort to low, medium or high only (lanes.js refuses any other
// value, and the runner loads the table through it), so xhigh maps to high, as it does for every other harness.
function museEntry(config, { command, models }) {
  return {
    ...config.harnesses.muse,
    command,
    waitSeconds: 60,
    timeouts: { implementer: 60, supervisor: 60, reviewer: 60 },
    models: models ? { [MODEL]: { group: 'muse', replaces: 'sonnet', roles: ['implementer', 'supervisor', 'reviewer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' } } } : {},
  }
}

// The environment of one test: the real lane table with the fake muse in it, muse the only enabled harness, the script
// the fake acts out, its log, and a key that must not reach the call.
function setScript(env, script) {
  return { ...env, AETHER_FAKE_MUSE_SCRIPT: JSON.stringify(script) }
}

function museEnv(t, script, { models = true, command = FAKE_MUSE } = {}) {
  fs.chmodSync(FAKE_MUSE, 0o755)
  const env = fx.laneEnv(t, { mutate: (config) => (config.harnesses.muse = museEntry(config, { command, models })) })
  return setScript(
    { ...env, AETHER_LANE_HARNESSES: 'muse', AETHER_FAKE_MUSE_LOG: path.join(path.dirname(env.AETHER_DATA_DIR), 'muse.log'), META_API_KEY: 'secret-key' },
    script,
  )
}

// What the fake muse logged: one entry per `exec`.
function museCalls(env) {
  if (!fs.existsSync(env.AETHER_FAKE_MUSE_LOG)) return []
  return fs.readFileSync(env.AETHER_FAKE_MUSE_LOG, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

const observedFile = (env) => path.join(env.AETHER_DATA_DIR, 'lanes', 'quota', 'muse-observed.json')
const readObserved = (env) => JSON.parse(fs.readFileSync(observedFile(env), 'utf8'))
function writeObserved(env, observation) {
  fs.mkdirSync(path.dirname(observedFile(env)), { recursive: true })
  fs.writeFileSync(observedFile(env), typeof observation === 'string' ? observation : JSON.stringify(observation))
}
const markFiles = (env) => {
  const dir = marks.marksDir(env.AETHER_DATA_DIR)
  return fs.existsSync(dir) ? fs.readdirSync(dir) : []
}

// A compiled run with the fake muse's table, ready to start calls.
function museRun(t, script, options) {
  const { args } = fx.laneRun(t)
  return { args, env: museEnv(t, script, options) }
}

// Starts the implementer call of task-1 with `env`'s script. The prompt is written once and kept by every later start.
function startImplementer(args, env) {
  const digest = fx.writePrompt(args, IMPLEMENT, 'You are implementing task-1: Task 1 title.')
  return fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
}

// Starts the call and waits for its result; the start must have gone ahead.
function finishImplementer(args, env) {
  const start = startImplementer(args, env)
  assert.equal(start.json.started, true, start.stdout + start.stderr)
  return fx.waitDone(args, IMPLEMENT, env)
}

function runImplementer(t, script, options) {
  const { args, env } = museRun(t, script, options)
  const start = startImplementer(args, env)
  const done = start.json && start.json.started === true ? fx.waitDone(args, IMPLEMENT, env) : null
  return { args, env, start, done }
}

const callInfo = (args, call = IMPLEMENT) => JSON.parse(fs.readFileSync(path.join(args.runDir, 'lanes', call, 'call.json'), 'utf8'))

test('a unit runs in Muse in its own worktree, safely, and comes back with its usage and the quota that call left (US2, R3, R4)', (t) => {
  const { args, env, start, done } = runImplementer(t, answering(DONE, allowanceOf(72, 40), { files: { 'src/t1/a.js': 'x' } }))
  assert.deepEqual(start.json, { started: true, model: MODEL, group: 'muse' })
  assert.equal(done.status, 'ok', done.detail)
  assert.equal(done.result.status, 'DONE')
  assert.match(done.result.head, /^[0-9a-f]{40}$/)

  const [call, ...others] = museCalls(env)
  assert.equal(others.length, 0)
  assert.equal(call.cwd, callInfo(args).workdir)
  assert.equal(call.cwd, path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-1'))
  for (const word of ['exec', '--json', '--contributor-mode', 'off', '--max-model-steps', '200', '--output-schema']) assert.ok(call.argv.includes(word), word)
  assert.equal(call.argv[call.argv.indexOf('--model') + 1], MODEL)
  assert.equal(call.argv[call.argv.indexOf('--reasoning-effort') + 1], 'high', 'the effort xhigh goes as the level the table maps it to')
  for (const flag of ['--yolo', '--disable-sandbox', '--trust-workspace', '--api-key-stdin']) assert.equal(call.argv.includes(flag), false, flag)
  assert.equal(call.metaApiKey, false, 'the key of the caller does not reach the call')

  assert.equal(done.lane.harness, 'muse')
  assert.deepEqual([done.lane.usage.input, done.lane.usage.total], [1000, 1200])
  // The quota after the call is read once the call's own allowance is kept: the weekly window, the longest, has 60% left.
  const { quota } = done.lane
  assert.equal(quota.unknown, false)
  near(quota.remaining, 0.6)
  assert.equal(quota.usable, true)
  const observed = readObserved(env)
  assert.deepEqual([observed.window.usedPercent, observed.weekly.usedPercent], [72, 40])
})

test('a reviewer gets the structured object it asked for, and a missing field or prose is a failed call (US3)', (t) => {
  const { repo, args } = fx.laneRun(t)
  const unit = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], args.repoRoot).json.path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  runBin(WT_BIN, ['diff', args.runId, 'task-1'], args.repoRoot)
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], args.repoRoot).json.merged, true)
  runBin(WT_BIN, ['diff', args.runId, '--final'], args.repoRoot)
  const env = museEnv(t, {})

  const review = (call, script) => {
    const digest = fx.writePrompt(args, call, 'Final review.')
    const start = fx.lane(args, 'start', [call, ...flags(digest, { role: 'reviewer', task: null })], setScript(env, script))
    assert.deepEqual(start.json, { started: true, model: MODEL, group: 'muse' }, start.stdout + start.stderr)
    return fx.waitDone(args, call, env)
  }
  const whole = review('final-review-1', answering(READY))
  assert.deepEqual([whole.status, whole.result], ['ok', READY], whole.detail)

  const short = { ...READY }
  delete short.summary
  const missing = review('final-review-2', answering(short))
  assert.equal(missing.status, 'failed')
  assert.match(missing.detail, /missing /)
  assert.equal(missing.result, null)

  const prose = review('final-review-3', { stdout: lines(completed('I read the package and it looks fine.'), usageRecord()) })
  assert.deepEqual([prose.status, prose.detail, prose.result], ['failed', 'no structured output', null])
  assert.equal(museCalls(env).length, 3)
})

test('a muse that is not installed starts no call: the start says so, and the table gives the harness no call (US4)', (t) => {
  const missing = path.join(tempDir(t), 'no-muse')
  const { args, env } = museRun(t, {}, { command: missing })
  assert.deepEqual(startImplementer(args, env).json, { unavailable: 'not-installed' })
  assert.equal(fs.existsSync(env.AETHER_FAKE_MUSE_LOG), false, 'no process was launched')
  assert.deepEqual(markFiles(env), [])

  const installed = (name, harness) => lanes.commandInstalled(harness.command)
  const config = lanes.loadConfig(env.AETHER_LANES_CONFIG)
  assert.equal(lanes.lanesArgs(config, { installed, enabled: ['muse'] }), null)
  const [idle] = lanes.idleHarnesses(config, { installed, enabled: ['muse'] })
  assert.equal(idle.name, 'muse')
  assert.match(idle.reason, /is not installed/)

  // The same table with the fake muse gives the harness its calls.
  const present = lanes.loadConfig(museEnv(t, {}).AETHER_LANES_CONFIG)
  assert.deepEqual(lanes.lanesArgs(present, { installed, enabled: ['muse'] }).harnesses, ['muse'])
})

const FAILURES = [
  ['it asks for a session (authRequired)', { stdout: lines(failedTurn({ kind: 'authRequired', message: 'sign in first', retryable: false }), usageRecord()), exit: 1 }, 'muse authRequired: sign in first'],
  ['its sandbox does not start (environmentError)', { stdout: lines(failedTurn({ kind: 'environmentError', message: 'bwrap: no permissions', retryable: false }), usageRecord()), exit: 1 }, 'muse environmentError: bwrap: no permissions'],
  ['it reaches its step limit (stepLimit)', { stdout: lines(failedTurn({ kind: 'stepLimit', message: 'reached 200 steps', retryable: false }), usageRecord()), exit: 1 }, 'muse stepLimit: reached 200 steps'],
  ['the account does not give the model (modelError)', { stdout: lines(failedTurn({ kind: 'modelError', message: 'muse-wonder-full-1.0 is not in your plan', retryable: false }), usageRecord()), exit: 1 }, 'muse modelError: muse-wonder-full-1.0 is not in your plan'],
  ['it exits with a code and no records', { stderr: 'error: bad flag\n', exit: 2 }, 'exit 2: error: bad flag'],
  ['its output cannot be read', { stdout: 'hello', exit: 0 }, 'unreadable output'],
]
for (const [name, script, reason] of FAILURES) {
  test(`when ${name} the call fails with the reason, leaves no mark, and runs once (US5, US8, US9, US10; R11, R13)`, (t) => {
    const { env, done } = runImplementer(t, script)
    assert.equal(done.status, 'failed', done.detail)
    assert.equal(done.detail, reason)
    assert.equal(done.result, null)
    assert.deepEqual(markFiles(env), [], 'a failure is not a quota failure: no mark')
    assert.deepEqual(marks.liveMarks(env.AETHER_DATA_DIR), [])
    // It is not repeated, not even with the sandbox off, and nothing logs in.
    const calls = museCalls(env)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].argv[0], 'exec')
    assert.equal(calls[0].argv.includes('--disable-sandbox'), false)
    assert.equal(calls[0].argv.some((word) => /^(login|logout|auth)$/.test(word)), false)
  })
}

test('a call that ends for quota leaves the 60-minute mark of the other harnesses, and a healthy observation newer than the mark lifts it (US6, R16)', (t) => {
  const resetsAtMs = Date.now() + 4 * HOUR
  const quotaFailure = { stdout: lines(failedTurn({ kind: 'modelError', message: 'limit', quota: { limitKind: 'tierLimit', resetsAtMs } }), usageRecord()), exit: 1 }
  const { args, env } = museRun(t, quotaFailure)
  const dataDir = env.AETHER_DATA_DIR
  const done = finishImplementer(args, env)
  assert.equal(done.status, 'quota', done.detail)
  assert.equal(done.detail, `quota: muse tierLimit, resets ${new Date(resetsAtMs).toISOString()}`)

  // The mark is the 60-minute one of the other harnesses: not confirmed, with no window of Muse's own.
  assert.deepEqual(markFiles(env), ['muse__muse.json'])
  const mark = marks.liveMark(dataDir, 'muse', 'muse')
  assert.deepEqual([mark.confirmed, mark.until - mark.at, mark.resetsAt], [false, 60 * MIN, null])
  const observed = readObserved(env)
  assert.equal(Object.hasOwn(observed, 'exhaustedUntilMs'), false)
  assert.deepEqual([observed.window, observed.weekly], [null, null])
  assert.equal(museCalls(env).length, 1)

  // While the mark lives, a start is refused and runs nothing.
  assert.deepEqual(startImplementer(args, env).json, { unavailable: 'quota' })
  // An observation from before the mark is what the call saw: it does not lift the mark.
  writeObserved(env, { observedAt: mark.at - 1000, window: { usedPercent: 10, resetsAtMs: Date.now() + 3 * HOUR }, weekly: { usedPercent: 10, resetsAtMs: Date.now() + 5 * DAY } })
  assert.deepEqual(startImplementer(args, env).json, { unavailable: 'quota' })
  assert.equal(fs.existsSync(marks.markFile(dataDir, 'muse', 'muse')), true)
  assert.equal(museCalls(env).length, 1)

  // A healthy observation made after the mark lifts it, and the call goes ahead.
  writeObserved(env, { observedAt: Date.now(), window: { usedPercent: 10, resetsAtMs: Date.now() + 3 * HOUR }, weekly: { usedPercent: 10, resetsAtMs: Date.now() + 5 * DAY } })
  const clean = setScript(env, answering(DONE, null, { files: { 'src/t1/a.js': 'x' } }))
  const lifted = finishImplementer(args, clean)
  assert.equal(lifted.status, 'ok', lifted.detail)
  assert.equal(marks.liveMark(dataDir, 'muse', 'muse'), null)
  assert.deepEqual(markFiles(env), [])
  assert.equal(museCalls(env).length, 2)
})

test('words about quota in a failure are not quota: only the quota data of the failure is (US6, R16)', (t) => {
  const words = { stdout: lines(failedTurn({ kind: 'modelError', message: 'quota exceeded: HTTP 429 too many requests' }), usageRecord()), exit: 1 }
  const { env, done } = runImplementer(t, words)
  assert.equal(done.status, 'failed', done.detail)
  assert.equal(done.detail, 'muse modelError: quota exceeded: HTTP 429 too many requests')
  assert.deepEqual(markFiles(env), [])
})

test('a quota failure with the allowance of a 5 h window used up holds the group until that reset, as for the other harnesses (US6, R16)', (t) => {
  const now = Date.now()
  const allowance = allowanceOf(100, 10, now)
  const resetsAtMs = allowance.window.resetsAtMs
  const script = { stdout: lines(failedTurn({ kind: 'modelError', message: 'limit', quota: { limitKind: 'tierLimit', resetsAtMs } }), usageRecord(allowance)), exit: 1 }
  const { args, env } = museRun(t, script)
  const done = finishImplementer(args, env)
  assert.equal(done.status, 'quota', done.detail)
  const mark = marks.liveMark(env.AETHER_DATA_DIR, 'muse', 'muse')
  assert.deepEqual([mark.confirmed, mark.until, mark.resetsAt], [true, resetsAtMs, new Date(resetsAtMs).toISOString()])
  // The failure's own allowance replaced what was kept before it.
  const observed = readObserved(env)
  assert.deepEqual([observed.window, observed.weekly], [allowance.window, allowance.weekly].map(({ usedPercent, resetsAtMs: reset }) => ({ usedPercent, resetsAtMs: reset })))
  assert.deepEqual(startImplementer(args, env).json, { unavailable: 'quota' })
  assert.equal(museCalls(env).length, 1)
})

test('aether-lane quota shows Muse as installed with its version and the windows of the last allowance, and unknown without one (US7, R14)', (t) => {
  const env = museEnv(t, {}, { models: false })
  const cwd = tempDir(t)
  const quota = (...rest) => runBin(fx.LANE_BIN, ['quota', ...rest, 'muse'], cwd, env)

  writeObserved(env, { observedAt: Date.now(), window: { usedPercent: 72, resetsAtMs: Date.now() + 3 * HOUR }, weekly: { usedPercent: 40, resetsAtMs: Date.now() + 5 * DAY } })
  const report = quota('--json')
  assert.equal(report.status, 0, report.stderr)
  const { muse } = report.json.harnesses
  assert.deepEqual([muse.installed, muse.version], [true, '1.4.11'])
  const group = muse.groups.muse
  assert.equal(group.unknown, false)
  near(group.windows['5h'].remaining, 0.28)
  near(group.windows.weekly.remaining, 0.6)
  for (const name of ['5h', 'weekly']) {
    assert.equal(typeof group.windows[name].resetsAt, 'string', name)
    assert.equal(typeof group.windows[name].resetsLocal, 'string', name)
  }
  assert.equal(group.source.command, 'muse exec --json')

  for (const [name, setup] of [['no observation', () => fs.rmSync(observedFile(env))], ['a corrupt observation', () => writeObserved(env, '{not json')]]) {
    setup()
    const unknown = quota('--json')
    assert.equal(unknown.status, 0, name)
    assert.equal(unknown.json.harnesses.muse.groups.muse.unknown, true, name)
    const text = quota()
    assert.equal(text.status, 0, name)
    assert.ok(text.stdout.includes('unknown, used until a call fails for quota'), `${name}: ${text.stdout}`)
  }
})

test('the order treats Muse as it treats the other harnesses: priority, reserve, mark and installation (US2, R15)', (t) => {
  const env = museEnv(t, {}, { models: false })
  const cwd = tempDir(t)
  const candidates = [
    { harness: 'agy', model: 'gemini-3.8-flash', group: 'gemini' },
    { harness: 'muse', model: MODEL, group: 'muse' },
  ]
  const ordered = (environment = env) => {
    const report = runBin(fx.LANE_BIN, ['quota', '--json', 'muse'], cwd, environment).json
    return order.orderCandidates(candidates, { muse: report.harnesses.muse })
  }
  const names = (entries) => entries.map((entry) => `${entry.harness}:${entry.model}`)
  const observe = (used) => writeObserved(env, { observedAt: Date.now(), window: { usedPercent: used, resetsAtMs: Date.now() + 3 * HOUR }, weekly: { usedPercent: used, resetsAtMs: Date.now() + 5 * DAY } })

  // 28% left with the reset far off: Muse has a reading and agy has none, so Muse goes first.
  observe(72)
  let result = ordered()
  assert.deepEqual(names(result.ordered), [`muse:${MODEL}`, 'agy:gemini-3.8-flash'])
  assert.deepEqual(result.ordered.map((entry) => entry.state), ['priority', 'unknown'])
  assert.deepEqual(result.excluded, [])

  // 3% left is under the reserve of 5%.
  observe(97)
  result = ordered()
  assert.deepEqual(names(result.ordered), ['agy:gemini-3.8-flash'])
  assert.deepEqual(result.excluded.map((entry) => [entry.harness, entry.why]), [['muse', 'reserve']])

  // A live mark holds the group whatever else is known.
  fs.rmSync(observedFile(env))
  marks.markDry(env.AETHER_DATA_DIR, { harness: 'muse', group: 'muse', reserve: 0.05, now: Date.now() })
  result = ordered()
  assert.deepEqual(result.excluded.map((entry) => [entry.harness, entry.why]), [['muse', 'marked']])

  // A command that is not installed.
  const absent = museEnv(t, {}, { models: false, command: path.join(tempDir(t), 'no-muse') })
  result = ordered(absent)
  assert.deepEqual(result.excluded.map((entry) => [entry.harness, entry.why]), [['muse', 'not-installed']])
  assert.deepEqual(names(result.ordered), ['agy:gemini-3.8-flash'])
})

test('stop ends a muse that is running with the processes it started, and the call is logged as stopped (US10, R7)', async (t) => {
  const childPid = path.join(tempDir(t), 'child.pid')
  const { args, env: base } = museRun(t, { child: true, sleepMs: 120000 })
  const env = { ...base, AETHER_FAKE_MUSE_CHILD_PID: childPid }
  assert.equal(startImplementer(args, env).json.started, true)
  await fx.waitForFile(childPid)
  const child = Number(fs.readFileSync(childPid, 'utf8'))
  t.after(() => fx.killQuietly(child))
  const dir = path.join(args.runDir, 'lanes', IMPLEMENT)
  await fx.waitForFile(path.join(dir, 'agy.pid'))
  const muse = Number(fs.readFileSync(path.join(dir, 'agy.pid'), 'utf8'))
  const runner = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'))
  assert.equal(fx.alive(child), true, 'the child of muse runs before the stop')

  assert.deepEqual(fx.lane(args, 'stop', [IMPLEMENT], env).json, { stopped: [IMPLEMENT] })
  const deadline = Date.now() + 10000
  while ((fx.alive(child) || fx.alive(muse) || fx.alive(runner)) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual([fx.alive(runner), fx.alive(muse), fx.alive(child)], [false, false, false])
  const entries = lanes.readLog(env.AETHER_DATA_DIR).filter((entry) => entry.kind === 'call')
  assert.deepEqual(entries.map((entry) => [entry.harness, entry.call, entry.status]), [['muse', IMPLEMENT, 'stopped']])
})

test('the real-call script can call Muse through the PATH, with the model named or the table\'s own (US12, R23)', (t) => {
  fs.chmodSync(FAKE_MUSE, 0o755)
  const bin = tempDir(t, 'muse-bin-')
  fs.symlinkSync(FAKE_MUSE, path.join(bin, 'muse'))
  const script = { files: { 'hello.txt': 'lane ok' }, stdout: lines(completed('{"status":"done","file":"hello.txt"}'), usageRecord()) }
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, AETHER_DATA_DIR: path.join(tempDir(t, 'muse-data-'), 'data'), AETHER_FAKE_MUSE_SCRIPT: JSON.stringify(script) }
  delete env.META_API_KEY

  const ok = spawnSync(process.execPath, [SMOKE, 'muse', MODEL], { encoding: 'utf8', env })
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.ok(ok.stdout.includes('"ok":true'), ok.stdout)
  t.after(() => fs.rmSync(JSON.parse(ok.stdout.trim().split('\n').pop()).dir, { recursive: true, force: true }))

  // The table has a Muse model, so a call that names none takes the table's first one.
  const bare = spawnSync(process.execPath, [SMOKE, 'muse'], { encoding: 'utf8', env })
  assert.equal(bare.status, 0, bare.stdout + bare.stderr)
  assert.ok(bare.stdout.includes('"model":"muse-wonder-full-1.0"'), bare.stdout)
  t.after(() => fs.rmSync(JSON.parse(bare.stdout.trim().split('\n').pop()).dir, { recursive: true, force: true }))
})
