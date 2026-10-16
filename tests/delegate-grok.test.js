'use strict'

// A read-only delegate on grok (R19), on the simulated CLI of tests/fixtures/fake-grok.js: the answer schema in the
// prompt, grok's output parsed, the quota read from grok's log, and the run inside the disposable worktree.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, tempDir } = require('./helpers.js')
const delegate = require('../plugins/aether/lib/delegate-calls.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const FAKE_GROK = path.join(__dirname, 'fixtures', 'fake-grok.js')
const rung = { model: 'grok-4.7', effort: 'xhigh', group: 'grok' }

// A lane table whose grok is the fake, a HOME whose grok log holds one billing line (30% of the week used, the period
// ending in 50 hours), and the fake's call log. HOME is process-wide while the test runs, as the adapter reads the log
// from it.
function setup(t) {
  fs.chmodSync(FAKE_GROK, 0o755)
  const dir = tempDir(t, 'aether-delegate-grok-')
  const config = JSON.parse(fs.readFileSync(lanes.CONFIG_FILE, 'utf8'))
  config.harnesses.grok.command = FAKE_GROK
  const home = path.join(dir, 'home')
  const callLog = path.join(dir, 'grok.log')
  const logFile = path.join(home, '.grok', 'logs', 'unified.jsonl')
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  const billing = { creditUsagePercent: 30, currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', start: new Date(Date.now() - 118 * 3600000).toISOString(), end: new Date(Date.now() + 50 * 3600000).toISOString() } }
  fs.writeFileSync(logFile, `${JSON.stringify({ ts: new Date().toISOString(), src: 'shell', pid: 1, ver: '1.0.41', lvl: 'info', msg: 'billing: fetched credits config', ctx: { config: billing } })}\n`)
  const keep = {}
  for (const [key, value] of Object.entries({ HOME: home, AETHER_FAKE_GROK_LOG: callLog })) {
    keep[key] = process.env[key]
    process.env[key] = value
  }
  t.after(() => {
    for (const [key, value] of Object.entries(keep)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  const repo = makeRepo(t)
  const calls = () => (fs.existsSync(callLog) ? fs.readFileSync(callLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
  return { config, repo, dataDir: path.join(dir, 'data'), calls }
}
const run = (s, prompt, over = {}) => delegate.runDelegate({
  cwd: s.repo.dir, id: 'g-1', harness: 'grok', rung, task: { description: 'audit the retry wrapper', prompt }, config: s.config, dataDir: s.dataDir, ...over,
})
const worktrees = (s) => s.repo.git('worktree', 'list').split('\n').length

test('a read-only delegate runs on grok in the disposable worktree, with the schema in its prompt, and its answer comes back (R19)', async (t) => {
  const s = setup(t)
  const head = s.repo.git('rev-parse', 'HEAD')
  const out = await run(s, 'List the callers of fetchUser.\nFAKE-GROK: answer {"answer": "found 3 callers"}\nFAKE-GROK: billing 35')
  assert.equal(out.status, 'ok', out.detail)
  assert.equal(out.text, 'found 3 callers')
  assert.equal(out.harness, 'grok')
  assert.equal(out.modelArg, 'grok-4.7')
  assert.equal(out.usage.input, 1000)
  assert.equal(out.usage.output, 200)
  assert.equal(out.quotaBefore.windows.weekly.remaining, 0.7)
  assert.equal(out.quotaAfter.windows.weekly.remaining, 0.65, 'the reading after comes from the line the CLI wrote to grok\'s log')
  assert.deepEqual(out.quotaSpent, [{ window: 'weekly', fraction: 0.05 }])
  const [call] = s.calls()
  assert.equal(s.calls().length, 1)
  assert.equal(call.argv[call.argv.indexOf('--model') + 1], 'grok-4.7')
  assert.equal(call.argv[call.argv.indexOf('--reasoning-effort') + 1], 'xhigh', 'the native effort of the rung reaches the CLI')
  assert.equal(call.argv[call.argv.indexOf('--output-format') + 1], 'json')
  assert.ok(call.argv.includes('--always-approve'))
  assert.ok(!call.argv.some((arg) => arg.startsWith('--') && arg.includes('schema')), 'grok takes no schema file')
  assert.ok(call.prompt.includes('You run as a read-only delegate'))
  assert.ok(call.prompt.includes('"required": [\n    "answer"\n  ]'), 'the answer schema is in the prompt, since the CLI takes none')
  assert.ok(call.cwd.endsWith(path.join('.aether', 'delegates', 'g-1', 'wt')), call.cwd)
  assert.equal(call.marker, 'delegate/g-1')
  assert.equal(s.repo.git('rev-parse', 'HEAD'), head)
  assert.equal(worktrees(s), 1, 'the disposable worktree is gone')
  assert.equal(fs.existsSync(path.join(s.repo.dir, '.aether', 'delegates', 'g-1')), false, 'and so is the temporary directory')
})

test('a delegate on grok that changes a file is a violation, and the change never reaches the repository (R19)', async (t) => {
  const s = setup(t)
  const out = await run(s, 'Audit.\nFAKE-GROK: write notes.txt hello\nFAKE-GROK: answer {"answer": "done"}')
  assert.equal(out.status, 'violation')
  assert.ok(out.detail.includes('notes.txt'))
  assert.equal(out.text, '')
  assert.equal(fs.existsSync(path.join(s.repo.dir, 'notes.txt')), false)
  assert.equal(worktrees(s), 1)
  assert.equal(fs.existsSync(path.join(s.repo.dir, '.aether', 'delegates', 'g-1')), false)
})
