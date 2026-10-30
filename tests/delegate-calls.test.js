'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo } = require('./helpers.js')
const { laneEnv } = require('./lane-fixtures.js')
const delegate = require('../plugins/aether/lib/delegate-calls.js')
const { CLI_MAX_SECONDS } = require('../plugins/aether/lib/delegate-limits.js')

const readingsLib = require('../plugins/aether/lib/lane-readings.js')
const lanesLib = require('../plugins/aether/lib/lanes.js')

const PID = process.pid
const DEFAULT_ID = `d-1-${PID}`
const ID2 = `d-2-${PID}`
const ID3 = `d-3-${PID}`

const GROUPS = { argon: 'Gemini Models', flash: 'Gemini Models', claude: 'Claude and GPT models' }

function setup(t, { quota = null } = {}) {
  const env = laneEnv(t, { quota })
  const keep = {}
  for (const key of ['AETHER_FAKE_AGY_LOG', 'AETHER_FAKE_AGY_STATE', 'AETHER_FAKE_AGY_QUOTA_FILE']) {
    keep[key] = process.env[key]
    process.env[key] = env[key]
  }
  t.after(() => {
    for (const [key, value] of Object.entries(keep)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const config = JSON.parse(fs.readFileSync(env.AETHER_LANES_CONFIG, 'utf8'))
  const repo = makeRepo(t)
  const calls = () => (fs.existsSync(env.AETHER_FAKE_AGY_LOG) ? fs.readFileSync(env.AETHER_FAKE_AGY_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
  const modelCalls = () => calls().filter((c) => c.argv.includes('--model'))
  const usageCalls = () => calls().filter((c) => c.argv.includes('/usage'))
  return { env, config, repo, dataDir: env.AETHER_DATA_DIR, modelCalls, usageCalls }
}
const rung = { model: 'gemini-3.8-flash', effort: 'medium', group: 'flash' }
const run = (s, prompt, over = {}) => delegate.runDelegate({
  cwd: s.repo.dir, id: DEFAULT_ID, harness: 'agy', rung, task: { description: 'audit the retry wrapper', prompt }, config: s.config, dataDir: s.dataDir, ...over,
})
const worktrees = (s) => s.repo.git('worktree', 'list').split('\n').length

test('a read-only delegate runs on agy with the model of the rung, and its answer comes back (R18)', async (t) => {
  const s = setup(t)
  const head = s.repo.git('rev-parse', 'HEAD')
  const out = await run(s, 'List the callers of fetchUser.\nFAKE-AGY: answer {"answer": "found 3 callers"}')
  assert.equal(out.status, 'ok', out.detail)
  assert.equal(out.text, 'found 3 callers')
  assert.equal(out.harness, 'agy')
  assert.equal(out.modelArg, 'gemini-3.8-flash-medium')
  assert.equal(out.usage.input, 1000)
  assert.equal(out.usage.output, 200)
  assert.equal(out.timedOut, false, 'a call that ended by itself did not run out of time')
  assert.ok(Array.isArray(out.quotaSpent))
  const [call] = s.modelCalls()
  assert.equal(call.argv[call.argv.indexOf('--model') + 1], 'gemini-3.8-flash-medium')
  assert.equal(call.argv[call.argv.indexOf('--print-timeout') + 1], `${CLI_MAX_SECONDS}s`, 'the reviewer timeout of the table, 1200 s, is cut to the most a delegate may run')
  assert.ok(call.argv.includes('--dangerously-skip-permissions'))
  assert.ok(call.cwd.endsWith(path.join('.aether', 'delegates', DEFAULT_ID, 'wt')))
  assert.equal(s.repo.git('rev-parse', 'HEAD'), head)
  assert.equal(worktrees(s), 1, 'the disposable worktree is gone')
  assert.equal(fs.existsSync(path.join(s.repo.dir, '.aether', 'delegates', DEFAULT_ID, 'wt')), false)
})

test('a checkout with uncommitted work is dirty: the disposable copy would not see it, so nothing is read or launched', async (t) => {
  const edited = setup(t)
  fs.writeFileSync(path.join(edited.repo.dir, 'README.md'), 'fixture, edited by the Lead\n')
  const out = await run(edited, 'Audit.\nFAKE-AGY: answer {"answer": "x"}')
  assert.equal(out.status, 'dirty')
  assert.match(out.detail, /uncommitted/)
  assert.match(out.detail, /README\.md/)
  assert.match(out.detail, /would not see/)
  assert.equal(out.text, '')
  assert.equal(out.quotaBefore, null, 'the quota was not read')
  assert.deepEqual(out.quotaSpent, [])
  assert.equal(edited.modelCalls().length, 0)
  assert.equal(edited.usageCalls().length, 0, 'the check comes before the quota reading')
  assert.equal(worktrees(edited), 1)
  assert.equal(fs.existsSync(path.join(edited.repo.dir, '.aether', 'delegates', DEFAULT_ID)), false)

  const added = setup(t)
  fs.writeFileSync(path.join(added.repo.dir, 'notes.txt'), 'new, not committed\n')
  const untracked = await run(added, 'Audit.')
  assert.equal(untracked.status, 'dirty', 'an untracked file is work the copy would not have')
  assert.match(untracked.detail, /notes\.txt/)

  const staged = setup(t)
  fs.writeFileSync(path.join(staged.repo.dir, 'staged.txt'), 'staged\n')
  staged.repo.git('add', 'staged.txt')
  assert.equal((await run(staged, 'Audit.')).status, 'dirty', 'a staged change is not committed either')

  const many = setup(t)
  for (let i = 1; i <= 8; i++) fs.writeFileSync(path.join(many.repo.dir, `f${i}.txt`), 'x\n')
  const detail = (await run(many, 'Audit.')).detail
  assert.match(detail, /3 more/, 'the detail names the first files and counts the rest')
  assert.ok(detail.length < 400)
})

test('a committed checkout runs; the directories Aether keeps in it, and the files git ignores, do not make it dirty', async (t) => {
  const s = setup(t)
  // Another delegate going on at the same time has its directory in .aether/; the repository does not ignore it yet.
  fs.mkdirSync(path.join(s.repo.dir, '.aether', 'delegates', 'other'), { recursive: true })
  fs.writeFileSync(path.join(s.repo.dir, '.aether', 'delegates', 'other', 'stdout'), 'busy\n')
  fs.writeFileSync(path.join(s.repo.dir, '.gitignore'), 'scratch/\n')
  s.repo.git('add', '.gitignore')
  s.repo.git('commit', '-q', '-m', 'ignore scratch')
  fs.mkdirSync(path.join(s.repo.dir, 'scratch'))
  fs.writeFileSync(path.join(s.repo.dir, 'scratch', 'big.log'), 'x\n')
  const out = await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "clean"}')
  assert.equal(out.status, 'ok', out.detail)
  assert.equal(out.text, 'clean')
  const exclude = fs.readFileSync(path.join(s.repo.dir, '.git', 'info', 'exclude'), 'utf8')
  assert.ok(exclude.includes('/.aether/'), 'Aether keeps its directory out of git, as every other Aether command that makes it does')
})

test('a delegate that changes a file is a violation, and the change never reaches the repository (R19)', async (t) => {
  const s = setup(t)
  const out = await run(s, 'Audit.\nFAKE-AGY: write notes.txt hello\nFAKE-AGY: answer {"answer": "done"}')
  assert.equal(out.status, 'violation')
  assert.ok(out.detail.includes('notes.txt'))
  assert.deepEqual(out.changed, ['notes.txt'], 'the violation names the files it touched')
  assert.equal(out.text, '')
  assert.equal(fs.existsSync(path.join(s.repo.dir, 'notes.txt')), false)
  assert.equal(worktrees(s), 1)
})

test('an agy that fails is a failed delegate, with its reason (R26)', async (t) => {
  const s = setup(t)
  const out = await run(s, 'Audit.\nFAKE-AGY: exit-error model not found: gemini-3.8-flash-medium')
  assert.equal(out.status, 'failed')
  assert.ok(out.detail.includes('model not found'))
  assert.equal(out.text, '')
  assert.equal(worktrees(s), 1)
})

test('a refusal for the individual quota arrives whole in the detail, for the router to read (R22b)', async (t) => {
  const s = setup(t)
  const message = 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.'
  const out = await run(s, `Audit.\nFAKE-AGY: exit-error ${message}`)
  assert.equal(out.status, 'quota', 'the readings before and after still show balance, and the refusal is the quota\'s verdict')
  assert.ok(out.detail.includes(message))
  assert.deepEqual(out.usage, { input: 0, output: 0, thinking: 0, cacheRead: 0 }, 'a refusal at the start used nothing')
  assert.equal(worktrees(s), 1)
})

test('maxCliSeconds caps the CLI limit of the harness\'s settings, and unset leaves it as it is', async (t) => {
  const s = setup(t)
  const limitOf = (call) => call.argv[call.argv.indexOf('--print-timeout') + 1]
  assert.equal((await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "a"}', { maxCliSeconds: 200 })).status, 'ok')
  assert.equal((await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "b"}', { id: ID2, maxCliSeconds: CLI_MAX_SECONDS + 100 })).status, 'ok')
  assert.equal((await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "c"}', { id: ID3, maxCliSeconds: null })).status, 'ok')
  assert.deepEqual(s.modelCalls().map(limitOf), ['200s', `${CLI_MAX_SECONDS}s`, `${CLI_MAX_SECONDS}s`])
})

test('issue 035: the note every delegate gets bounds the work to about 20 tool calls and asks for what was not checked', async (t) => {
  assert.equal(delegate.DELEGATE_TOOL_BUDGET, 20)
  assert.ok(delegate.DELEGATE_NOTE.includes('use at most about 20 tool calls (every read and search counts)'), delegate.DELEGATE_NOTE)
  assert.match(delegate.DELEGATE_NOTE, /saying in the answer what you did not check/)
  const s = setup(t)
  assert.equal((await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "x"}')).status, 'ok')
  const [call] = s.modelCalls()
  assert.ok(call.argv.some((arg) => arg.includes('use at most about 20 tool calls')), 'the note reaches the CLI in the prompt')
})

test('issue 035: a call killed at its limit is timedOut and failed, even when the quota reading afterwards is under the reserve', async (t) => {
  const quotaFile = (s) => s.env.AETHER_FAKE_AGY_QUOTA_FILE
  const settled = (s) => {
    s.config.harnesses.agy.timeouts = { ...s.config.harnesses.agy.timeouts, reviewer: 1 }
    return { graceSeconds: 1 }
  }
  // The fake sleeps past the limit and its grace; before it sleeps it drains the group, so the reading after the call
  // is under the reserve, which on any other ending would make the call a quota failure.
  const drained = JSON.stringify({ 'Gemini Models': [0.9, 0.02], 'Claude and GPT models': [0.9, 0.9] })
  const s = setup(t)
  const out = await run(s, `Audit.\nFAKE-AGY: write-abs ${quotaFile(s)} ${drained}\nFAKE-AGY: sleep 30\nFAKE-AGY: answer {"answer": "late"}`, settled(s))
  assert.equal(out.timedOut, true)
  assert.equal(out.status, 'failed', 'running out of time is not a refusal, whatever the reading says')
  assert.match(out.detail, /^ran out of time: killed at \d+(?:\.\d+)? s, exit 137$/)
  assert.equal(out.text, '')
  assert.equal(lanesLib.usable(out.quotaAfter, s.config.reserve), false, 'the reading after was under the reserve')
  assert.equal(worktrees(s), 1, 'the worktree is gone')

  // The same drained reading on a call that ends by itself is still the quota's verdict.
  const quick = setup(t)
  const ended = await run(quick, `Audit.\nFAKE-AGY: write-abs ${quotaFile(quick)} ${drained}\nFAKE-AGY: exit-error some failure`)
  assert.equal(ended.timedOut, false)
  assert.equal(ended.status, 'quota')
})

test('issue 035: every outcome that did not run out of time says so, launched or not', async (t) => {
  const s = setup(t)
  s.config.harnesses.codex.command = '/nonexistent/codex'
  assert.equal((await run(s, 'Audit.\nFAKE-AGY: exit-error model not found')).timedOut, false)
  assert.equal((await run(s, 'Audit.', { harness: 'codex', id: ID2 })).timedOut, false)
  const under = setup(t, { quota: { 'Gemini Models': [0.9, 0.02], 'Claude and GPT models': [0.9, 0.9] } })
  assert.equal((await run(under, 'Audit.')).timedOut, false)
  const dirty = setup(t)
  fs.writeFileSync(path.join(dirty.repo.dir, 'README.md'), 'edited\n')
  assert.equal((await run(dirty, 'Audit.')).timedOut, false)
})

test('a group under the reserve is a quota failure, and agy is not launched (R26)', async (t) => {
  const s = setup(t, { quota: { 'Gemini Models': [0.9, 0.02], 'Claude and GPT models': [0.9, 0.9] } })
  const out = await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "x"}')
  assert.equal(out.status, 'quota')
  assert.equal(s.modelCalls().length, 0)
  assert.equal(worktrees(s), 1)
})

test('a harness that is not installed or has no such model is unavailable, with nothing launched', async (t) => {
  const s = setup(t)
  s.config.harnesses.agy.command = '/nonexistent/agy'
  assert.equal((await run(s, 'Audit.')).status, 'unavailable')
  const t2 = setup(t)
  t2.config.harnesses.codex.command = '/nonexistent/codex'
  assert.equal((await run(t2, 'Audit.', { harness: 'codex' })).status, 'unavailable')
  assert.equal((await run(t2, 'Audit.', { rung: { model: 'no-such-model', effort: 'low', group: 'flash' } })).status, 'unavailable')
  assert.equal(t2.modelCalls().length, 0)
})

test('a read-only delegate runs on muse with the model of the pair, and its answer comes back', async (t) => {
  const s = setup(t)
  const fake = path.join(__dirname, 'fixtures', 'fake-muse.js')
  fs.chmodSync(fake, 0o755)
  s.config.harnesses.muse.command = fake
  const record = (type, payload) => JSON.stringify({ schema_version: 1, id: 'id-1', stream: { kind: 'session', id: 's1' }, sequence: 1, recorded_at: 1, record_type: 'event', durability: 'durable', causation_id: 'c1', payload_type: type, payload_schema_version: 1, payload })
  const answer = JSON.stringify({ answer: 'found 3 callers' })
  const keep = { script: process.env.AETHER_FAKE_MUSE_SCRIPT, log: process.env.AETHER_FAKE_MUSE_LOG }
  process.env.AETHER_FAKE_MUSE_SCRIPT = JSON.stringify({ stdout: `${record('run.terminal.completed', { kind: 'run_terminal', terminal: 'completed', reason: null, text: answer })}\n` })
  process.env.AETHER_FAKE_MUSE_LOG = path.join(path.dirname(s.dataDir), 'muse.log')
  t.after(() => {
    for (const [key, value] of [['AETHER_FAKE_MUSE_SCRIPT', keep.script], ['AETHER_FAKE_MUSE_LOG', keep.log]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const head = s.repo.git('rev-parse', 'HEAD')
  const out = await run(s, 'List the callers of fetchUser.', { harness: 'muse', rung: { model: 'muse-wonder-full-1.0', effort: 'high', group: 'muse' } })
  assert.equal(out.status, 'ok', out.detail)
  assert.equal(out.text, 'found 3 callers')
  assert.equal(out.harness, 'muse')
  const [call] = fs.readFileSync(process.env.AETHER_FAKE_MUSE_LOG, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.ok(call.argv.includes('muse-wonder-full-1.0'), call.argv.join(' '))
  assert.equal(call.metaApiKey, false, 'no key of the owner reaches the call')
  assert.ok(call.cwd.endsWith(path.join('.aether', 'delegates', DEFAULT_ID, 'wt')), 'in the disposable worktree')
  assert.equal(s.repo.git('rev-parse', 'HEAD'), head)
  assert.equal(worktrees(s), 1, 'the disposable worktree is gone')
})

test('a read-only delegate runs on codex with the model of the pair, and its answer comes back', async (t) => {
  const s = setup(t)
  const fake = path.join(__dirname, 'fixtures', 'fake-codex.js')
  fs.chmodSync(fake, 0o755)
  s.config.harnesses.codex = {
    command: fake,
    groups: { codex: 'Codex plan' },
    quotaLifeMinutes: 10,
    waitSeconds: 60,
    timeouts: { implementer: 60, supervisor: 60, reviewer: 60 },
    models: { 'gpt-6.1-terra': { group: 'codex', roles: ['implementer', 'supervisor'] } },
  }
  const log = path.join(path.dirname(s.dataDir), 'codex.log')
  const keep = { script: process.env.AETHER_FAKE_CODEX_SCRIPT, log: process.env.AETHER_FAKE_CODEX_LOG, limits: process.env.AETHER_FAKE_CODEX_RATE_LIMITS }
  process.env.AETHER_FAKE_CODEX_SCRIPT = JSON.stringify({ answer: '{"answer":"audited"}' })
  process.env.AETHER_FAKE_CODEX_LOG = log
  process.env.AETHER_FAKE_CODEX_RATE_LIMITS = path.join(__dirname, 'fixtures', 'codex', 'rate-limits.json')
  t.after(() => {
    for (const [key, value] of [['AETHER_FAKE_CODEX_SCRIPT', keep.script], ['AETHER_FAKE_CODEX_LOG', keep.log], ['AETHER_FAKE_CODEX_RATE_LIMITS', keep.limits]]) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const out = await run(s, 'List the callers of fetchUser.', { harness: 'codex', rung: { model: 'gpt-6.1-terra', effort: 'high', group: 'codex' } })
  assert.equal(out.status, 'ok', out.detail)
  assert.equal(out.text, 'audited')
  const execs = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((entry) => entry.kind === 'exec')
  assert.equal(execs.length, 1)
  assert.ok(execs[0].argv.includes('--model') && execs[0].argv[execs[0].argv.indexOf('--model') + 1] === 'gpt-6.1-terra', execs[0].argv.join(' '))
  assert.ok(execs[0].cwd.endsWith(path.join('.aether', 'delegates', DEFAULT_ID, 'wt')), 'in the disposable worktree')
})

test('the id must be a plain name', async (t) => {
  const s = setup(t)
  await assert.rejects(run(s, 'Audit.', { id: '../escape' }), /id/)
  await assert.rejects(run(s, 'Audit.', { id: '' }), /id/)
})

test('the quota goes through the saved reading: the one before is served from it, and the one after renews it (R23)', async (t) => {
  const s = setup(t)
  const first = await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "one"}')
  assert.equal(first.status, 'ok', first.detail)
  assert.equal(s.usageCalls().length, 2, 'no saved reading yet: the reading before and the one after')
  const saved = JSON.parse(fs.readFileSync(readingsLib.cacheFile(s.dataDir, 'agy'), 'utf8'))
  assert.equal(saved.harness, 'agy')
  assert.ok(Object.hasOwn(saved.groups, 'flash'), 'the reading after is saved')
  const second = await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "two"}', { id: ID2 })
  assert.equal(second.status, 'ok', second.detail)
  assert.equal(s.usageCalls().length, 3, 'the reading before came from the saved one: only the reading after started agy')
})

test('quotaSpent is what each window lost between two readings of the same reset', () => {
  const win = (remaining, resetsAt = '2026-10-17T00:00:00Z') => ({ remaining, resetsAt })
  const before = { windows: { weekly: win(0.95), '5h': win(0.9, '2026-10-15T05:00:00Z') } }
  const after = { windows: { weekly: win(0.93), '5h': win(0.9, '2026-10-15T10:00:00Z') } }
  assert.deepEqual(delegate.quotaSpent(before, after), [{ window: 'weekly', fraction: 0.02 }])
  assert.deepEqual(delegate.quotaSpent(null, after), [])
  assert.deepEqual(delegate.quotaSpent(before, null), [])
  assert.deepEqual(delegate.quotaSpent({ windows: { weekly: win(0.5) } }, { windows: { weekly: win(0.6) } }), [{ window: 'weekly', fraction: 0 }])
})
