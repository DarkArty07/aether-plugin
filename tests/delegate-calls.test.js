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

const GROUPS = { gemini: 'Gemini Models', claude: 'Claude and GPT models' }

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
const rung = { model: 'gemini-3.8-flash', effort: 'medium', group: 'gemini' }
const run = (s, prompt, over = {}) => delegate.runDelegate({
  cwd: s.repo.dir, id: 'd-1', harness: 'agy', rung, task: { description: 'audit the retry wrapper', prompt }, config: s.config, dataDir: s.dataDir, ...over,
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
  assert.ok(Array.isArray(out.quotaSpent))
  const [call] = s.modelCalls()
  assert.equal(call.argv[call.argv.indexOf('--model') + 1], 'gemini-3.8-flash-medium')
  assert.equal(call.argv[call.argv.indexOf('--print-timeout') + 1], `${CLI_MAX_SECONDS}s`, 'the reviewer timeout of the table, 1200 s, is cut to the most a delegate may run')
  assert.ok(call.argv.includes('--dangerously-skip-permissions'))
  assert.ok(call.cwd.endsWith(path.join('.aether', 'delegates', 'd-1', 'wt')))
  assert.equal(s.repo.git('rev-parse', 'HEAD'), head)
  assert.equal(worktrees(s), 1, 'the disposable worktree is gone')
  assert.equal(fs.existsSync(path.join(s.repo.dir, '.aether', 'delegates', 'd-1', 'wt')), false)
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
  assert.equal(fs.existsSync(path.join(edited.repo.dir, '.aether', 'delegates', 'd-1')), false)

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
  assert.equal(out.status, 'failed', 'the readings before and after still show balance')
  assert.ok(out.detail.includes(message))
  assert.equal(worktrees(s), 1)
})

test('the native effort of the rung reaches the CLI without going through the levels of the lane table (R16)', async (t) => {
  const s = setup(t)
  s.config.harnesses.agy.models['gemini-3.8-flash'].levels = { medium: 'low' }
  const out = await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "ok"}')
  assert.equal(out.status, 'ok', out.detail)
  assert.equal(out.modelArg, 'gemini-3.8-flash-medium', 'the table would say low: the router does not read it')
  const { createAdapter } = require('../plugins/aether/lib/harness/index.js')
  const grok = createAdapter('grok', s.config.harnesses.grok)
  const argv = delegate.delegateArgv(grok, { model: 'grok-4.7', effort: 'xhigh', group: 'grok' }, { prompt: 'p', schemaFile: '/x', timeoutSeconds: 60 })
  assert.ok(argv.join(' ').includes('--reasoning-effort xhigh'), 'the swarm sends high for xhigh: the lane table maps it')
  assert.ok(argv.includes('grok-4.7'))
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
  assert.equal((await run(t2, 'Audit.', { harness: 'codex' })).status, 'unavailable')
  assert.equal((await run(t2, 'Audit.', { rung: { model: 'no-such-model', effort: 'low', group: 'gemini' } })).status, 'unavailable')
  assert.equal(t2.modelCalls().length, 0)
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
  assert.ok(Object.hasOwn(saved.groups, 'gemini'), 'the reading after is saved')
  const second = await run(s, 'Audit.\nFAKE-AGY: answer {"answer": "two"}', { id: 'd-2' })
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
