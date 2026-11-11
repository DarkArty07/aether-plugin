'use strict'

// Issue 189: Codex's network is open only for the calls that edit code (the swarm's implementer, which the Lead's editing
// delegates run too) and closed for the rest (the supervisor, the reviewers, a read-only delegate and a design seat). The
// owner's decision of 2026-11-11. Each caller is driven for real, with the fake codex (tests/fixtures/fake-codex.js).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { runBin, makeRepo } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const delegate = require('../plugins/aether/lib/delegate-calls.js')

const FAKE_CODEX = path.join(__dirname, 'fixtures', 'fake-codex.js')
const RATE_LIMITS = path.join(__dirname, 'fixtures', 'codex', 'rate-limits.json')
const IMPLEMENT = 'task-1-1-implement'
const FEATURE = 'specs/001-demo'
const NETWORK = 'sandbox_workspace_write.network_access=true'
const OPEN = "run the task's tests yourself"
const CLOSED = 'cannot start a child process with pipes'

const DONE = { status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' }
const READY = { verdict: 'ready', findings: [], declined: [], summary: 'Ready.' }
const SUPERVISED = { verdict: 'approve', summary: 'The unit does what the brief asks.', findings: [] }
const JUDGE = { verdict: 'revise', findings: [], openQuestions: [], summary: 'Revise.' }
const answering = (answer, extra = {}) => ({ answer: JSON.stringify(answer), ...extra })
const flags = (digest, { role = 'implementer', task = 'task-1', model = 'gpt-6.1-terra', effort = 'medium' } = {}) =>
  ['--role', role, ...(task ? ['--task', task] : []), '--model', model, '--effort', effort, '--digest', digest]

// The check of every Codex argv: the sandbox stays on, and the note in front of the prompt matches the network.
function assertOpen(argv, label) {
  const at = argv.indexOf(NETWORK)
  assert.ok(at > 0 && argv[at - 1] === '-c', `${label}: -c ${NETWORK}`)
  assert.equal(argv[argv.indexOf('--sandbox') + 1], 'workspace-write', label)
  assert.ok(argv[1].includes(OPEN), `${label}: the note says the network is open`)
  assert.equal(argv[1].includes(CLOSED), false, `${label}: the note does not say the network is closed`)
}

function assertClosed(argv, label) {
  assert.equal(argv.some((arg) => arg.includes('network_access')), false, `${label}: no network_access`)
  assert.equal(argv[argv.indexOf('--sandbox') + 1], 'workspace-write', label)
  assert.ok(argv[1].includes(CLOSED), `${label}: the note says the network is closed`)
  assert.equal(argv[1].includes(OPEN), false, `${label}: the note does not say the network is open`)
}

// The fake codex of the lane tests: its log, its rate limits and its script (one entry per exec).
function codexEnv(t, script, mutate = null) {
  fs.chmodSync(FAKE_CODEX, 0o755)
  const env = fx.laneEnv(t, { mutate: (config) => { config.harnesses.codex.command = FAKE_CODEX; if (mutate) mutate(config) } })
  const dir = path.dirname(env.AETHER_DATA_DIR)
  const full = {
    ...env,
    AETHER_LANE_HARNESSES: 'codex',
    AETHER_FAKE_CODEX_LOG: path.join(dir, 'codex.log'),
    AETHER_FAKE_CODEX_RATE_LIMITS: path.join(dir, 'rate-limits.json'),
    AETHER_FAKE_CODEX_STATE: path.join(dir, 'codex-state'),
    AETHER_FAKE_CODEX_SCRIPT: JSON.stringify(script),
  }
  fs.writeFileSync(full.AETHER_FAKE_CODEX_RATE_LIMITS, fs.readFileSync(RATE_LIMITS, 'utf8'))
  return full
}

// One entry per exec; the quota read (app-server) is not a call.
function codexCalls(env) {
  if (!fs.existsSync(env.AETHER_FAKE_CODEX_LOG)) return []
  return fs.readFileSync(env.AETHER_FAKE_CODEX_LOG, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((entry) => entry.kind === 'exec')
}

function startImplementer(args, env) {
  const digest = fx.writePrompt(args, IMPLEMENT, 'You are implementing task-1: Task 1 title.')
  const start = fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  assert.equal(start.json.started, true, start.stdout + start.stderr)
  return fx.waitDone(args, IMPLEMENT, env)
}

function writeBrief(repo, lines) {
  const file = path.join(repo.dir, 'brief.md')
  fs.writeFileSync(file, lines.join('\n') + '\n')
  repo.git('add', 'brief.md')
  repo.git('commit', '-q', '-m', 'brief')
  return file
}

test('the swarm implementer runs Codex with the network open, and its prompt says so (issue 189)', (t) => {
  const { args } = fx.laneRun(t)
  const env = codexEnv(t, [answering(DONE, { files: { 'src/t1/a.js': 'x' } })])
  const done = startImplementer(args, env)
  assert.equal(done.status, 'ok', done.detail)
  const [call] = codexCalls(env)
  assertOpen(call.argv, 'implementer')
})

test('an editing delegate of the Lead runs its implementer with the network open and its reviewer with it closed (issue 189)', (t) => {
  const repo = makeRepo(t)
  const env = codexEnv(t, [answering(DONE, { files: { 'src/new.js': 'hello' }, commit: 'add new' }), answering(READY)])
  const brief = writeBrief(repo, ['Write src/new.js saying hello'])
  const r = runBin(fx.LANE_BIN, ['delegate', '--brief', brief, '--model', 'haiku', '--effort', 'high', '--owns', 'src/**', '--tests', 'node -e "process.exit(0)"', '--session', 's1'], repo.dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const [implementer, reviewer, ...others] = codexCalls(env)
  assert.equal(others.length, 0)
  assertOpen(implementer.argv, 'editing delegate, implementer')
  assertClosed(reviewer.argv, 'editing delegate, reviewer')
})

test('the swarm supervisor and reviewer run Codex with the network closed (issue 189)', (t) => {
  const { args } = fx.laneRun(t)
  const base = codexEnv(t, [answering(DONE, { files: { 'src/t1/a.js': 'x' } }), answering(SUPERVISED)])
  startImplementer(args, base)
  const digest = fx.writePrompt(args, 'task-1-1-supervise', 'Supervise the unit.')
  const started = fx.lane(args, 'start', ['task-1-1-supervise', ...flags(digest, { role: 'supervisor', task: 'task-1', model: 'gpt-6.1-terra', effort: 'medium' })], base)
  assert.equal(started.json.started, true, started.stdout + started.stderr)
  fx.waitDone(args, 'task-1-1-supervise', base)
  const calls = codexCalls(base)
  assert.equal(calls.length, 2)
  assertOpen(calls[0].argv, 'implementer')
  assertClosed(calls[1].argv, 'supervisor')
})

test('a read-only delegate on Codex runs with the network closed (issue 189)', async (t) => {
  const env = codexEnv(t, [answering({ answer: 'found 3 callers' })])
  const saved = {}
  for (const key of ['AETHER_FAKE_CODEX_LOG', 'AETHER_FAKE_CODEX_RATE_LIMITS', 'AETHER_FAKE_CODEX_STATE', 'AETHER_FAKE_CODEX_SCRIPT']) {
    saved[key] = process.env[key]
    process.env[key] = env[key]
  }
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const repo = makeRepo(t)
  const config = JSON.parse(fs.readFileSync(env.AETHER_LANES_CONFIG, 'utf8'))
  const out = await delegate.runDelegate({
    cwd: repo.dir,
    id: `codex-network-${process.pid}`,
    harness: 'codex',
    rung: { model: 'gpt-6.1-terra', effort: 'low', group: 'codex' },
    task: { description: 'audit the retry wrapper', prompt: 'List the callers of fetchUser.' },
    config,
    dataDir: env.AETHER_DATA_DIR,
  })
  assert.equal(out.status, 'ok', out.detail)
  const [call] = codexCalls(env)
  assertClosed(call.argv, 'read-only delegate')
})

test('a design seat on Codex runs with the network closed (issue 189)', (t) => {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, FEATURE), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, FEATURE, 'spec.md'), '# Demo\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'spec')
  // The shipped table gives Codex no design seat: this test lets Sol judge, and nothing else changes.
  const env = codexEnv(t, [answering(JUDGE)], (config) => { config.harnesses.codex.models['gpt-6.1-sol'].roles.push('judge') })
  const dir = path.join(repo.dir, '.aether', 'tmp', 'seats', 's1')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'message.md'), 'Review.\n')
  const digest = lanes.digest('Review.\n')
  const started = runBin(fx.LANE_BIN, ['seat-start', 'judge', '--session', 's1', '--feature', FEATURE, '--superdelegation', 'on', '--harnesses', 'codex', '--author', 'sonnet', '--digest', digest], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const id = started.json.id
  const deadline = Date.now() + 60000
  let done = null
  while (Date.now() < deadline && done === null) {
    const r = runBin(fx.LANE_BIN, ['seat-wait', id, '--max', '5'], repo.dir, env)
    if (r.json && r.json.error) throw new Error(r.json.error)
    if (r.json && r.json.done) done = r.json
  }
  assert.notEqual(done, null, 'the seat round finished')
  const [call] = codexCalls(env)
  assertClosed(call.argv, 'design seat')
})
