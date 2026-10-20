'use strict'

// Spec 002, R3, R6, R10, R12, R15 and R16 through the bin: `aether-lane status` gives each group's view and the dry
// marks, and no order of candidates (the pair rule of spec 009 chooses); with --refresh, which only the workflow's
// quota step of each wave gives, it first refreshes grok's reading when it is stale.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, runBin } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const marks = require('../plugins/aether/lib/lane-marks.js')
const fx = require('./lane-fixtures.js')

const FAKE_GROK = path.join(__dirname, 'fixtures', 'fake-grok-acp.js')
const MIN = 60 * 1000
const HOUR = 3600 * 1000
const RUN = '20261014-060800-ab12'
const inHours = (hours) => new Date(Date.now() + hours * HOUR).toISOString()
const usageCalls = (env) => fx.agyCalls(env).filter((c) => c.argv[1] === '/usage')

// A run whose graph lists two harnesses, a table whose grok is the fake that speaks ACP, an agy quota
// with Gemini full for 200 hours and Claude under the reserve, and a grok log whose one line is ageMinutes old, for a
// period of 50 more hours with no creditUsagePercent (so Grok's priority is 1/50).
function statusEnv(t, { ageMinutes = 5, agyQuota = null, extra = {} } = {}) {
  fs.chmodSync(FAKE_GROK, 0o755)
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, {
    quota: agyQuota ?? { 'Gemini Models': [0.9, 0.9, null, inHours(200)], 'Claude and GPT models': [0.9, 0.02, null, inHours(40)] },
    mutate: (config) => {
      config.harnesses.grok.command = FAKE_GROK
      config.harnesses.codex.command = '/nowhere/codex'
      config.harnesses.cursor.command = '/nowhere/cursor-agent'
    },
  })
  const logFile = path.join(env.HOME, '.grok', 'logs', 'unified.jsonl')
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  const entry = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'grok-billing.jsonl'), 'utf8').trim().split('\n')[1])
  entry.ts = new Date(Date.now() - ageMinutes * MIN).toISOString()
  entry.ctx.config.currentPeriod.end = inHours(50)
  fs.writeFileSync(logFile, `${JSON.stringify(entry)}\n`)
  const graphFile = path.join(args.runDir, 'graph.json')
  fs.writeFileSync(
    graphFile,
    JSON.stringify({ ...JSON.parse(fs.readFileSync(graphFile, 'utf8')), lanes: { harnesses: ['agy', 'grok'] } }),
  )
  const run = { ...env, AETHER_LANE_HARNESSES: 'agy,grok', ...extra }
  return { args, env: run, logFile }
}

test('status gives each group its view and the live marks, and no order of candidates', (t) => {
  const { args, env } = statusEnv(t)
  const r = fx.lane(args, 'status', [], env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const { harnesses } = r.json
  assert.match(r.json.time, /^\d{4}-\d\d-\d\dT/)
  const grok = harnesses.grok.groups.grok
  assert.deepEqual([harnesses.grok.enabled, harnesses.grok.installed, grok.usable, grok.unknown, grok.usedPercentAbsent, grok.source.ageMinutes], [true, true, true, false, true, 5])
  assert.ok(Math.abs(grok.priority - 1 / 50) < 0.001, String(grok.priority))
  assert.deepEqual([harnesses.agy.groups.gemini.usable, harnesses.agy.groups.claude.usable, harnesses.agy.groups.claude.label], [true, false, 'Claude and GPT models'])
  assert.ok(Math.abs(harnesses.agy.groups.gemini.priority - 0.9 / 200) < 0.001, String(harnesses.agy.groups.gemini.priority))
  assert.deepEqual(r.json.marks, [])
  assert.equal(Object.hasOwn(r.json, 'order'), false)
})

test('a dry mark holds its group in the groups and the list of marks', (t) => {
  const { args, env } = statusEnv(t)
  const mark = marks.markDry(env.AETHER_DATA_DIR, { harness: 'grok', group: 'grok', reserve: 0.05, now: Date.now() - 5 * MIN })
  const r = fx.lane(args, 'status', [], env)
  const grok = r.json.harnesses.grok.groups.grok
  assert.deepEqual([grok.usable, grok.mark.until, grok.mark.confirmed], [false, mark.until, false])
  assert.deepEqual(r.json.marks, [mark])
})

test('status keeps a reading that launches a process for its life, and logs one reading per harness each time', (t) => {
  const { args, env } = statusEnv(t)
  fx.lane(args, 'status', [], env)
  fx.lane(args, 'status', [], env)
  assert.equal(usageCalls(env).length, 1)
  const entries = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'reading')
  assert.deepEqual(entries.map((e) => [e.harness, e.run]).sort(), [['agy', args.runId], ['agy', args.runId], ['grok', args.runId], ['grok', args.runId]])
  assert.deepEqual(Object.keys(entries.find((e) => e.harness === 'agy').groups).sort(), ['claude', 'gemini'])
  // The quota command is a deliberate reading, and takes a new one.
  const quota = runBin(fx.LANE_BIN, ['quota', 'agy', '--json'], args.repoRoot, env)
  assert.equal(quota.status, 0, quota.stdout + quota.stderr)
  assert.equal(usageCalls(env).length, 2)
})

test('a reading that fails leaves the groups of its harness unknown', (t) => {
  const { args, env } = statusEnv(t)
  fs.writeFileSync(env.AETHER_FAKE_AGY_QUOTA_FILE, 'unreadable')
  const r = fx.lane(args, 'status', [], env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const agy = r.json.harnesses.agy
  assert.match(agy.error, /agy \/usage failed/)
  assert.deepEqual([agy.groups.gemini.unknown, agy.groups.gemini.usable, agy.groups.claude.unknown], [true, true, true])
})

test("the wave's quota step, status --refresh, refreshes a stale grok reading over ACP before it reads, and says how it was taken", (t) => {
  const grokLog = path.join(tempDir(t), 'acp.log')
  const { args, env, logFile } = statusEnv(t, { ageMinutes: 45 })
  const withFake = { ...env, AETHER_FAKE_ACP_LOG: grokLog, AETHER_FAKE_ACP_END_IN_HOURS: '48', AETHER_FAKE_ACP_LOG_LINES: logFile }
  const r = fx.lane(args, 'status', ['--refresh'], withFake)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const grok = r.json.harnesses.grok
  assert.deepEqual([grok.refreshed, grok.refreshMethod, grok.groups.grok.source.ageMinutes], [true, 'acp', 0])
  assert.ok(Math.abs(grok.groups.grok.priority - 1 / 48) < 0.001, String(grok.groups.grok.priority))
  // The fake logs every start, `grok --version` among them: the sessions are the starts that ask for the agent.
  const sessions = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((e) => e.argv && e.argv[0] === 'agent') : [])
  assert.deepEqual(sessions(grokLog).map((e) => e.argv), [['agent', '--no-leader', 'stdio']])
  assert.equal(r.json.harnesses.agy.refreshed, undefined)

  // A reading inside its life of 30 minutes is not refreshed: grok is not started at all.
  const fresh = statusEnv(t, { ageMinutes: 5 })
  fs.rmSync(grokLog, { force: true })
  const second = fx.lane(fresh.args, 'status', ['--refresh'], { ...fresh.env, AETHER_FAKE_ACP_LOG: grokLog })
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.equal(second.json.harnesses.grok.refreshed, undefined)
  assert.deepEqual(sessions(grokLog), [])
})

test("the wave's quota step uses grok's ACP answer itself, with no line in grok's log", (t) => {
  const grokLog = path.join(tempDir(t), 'acp.log')
  const { args, env, logFile } = statusEnv(t, { ageMinutes: 45 })
  // No AETHER_FAKE_ACP_LOG_LINES: the fake leaves nothing in grok's log, so only the answer can carry the new reading.
  const withFake = { ...env, AETHER_FAKE_ACP_LOG: grokLog, AETHER_FAKE_ACP_END_IN_HOURS: '48' }
  const r = fx.lane(args, 'status', ['--refresh'], withFake)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const grok = r.json.harnesses.grok
  assert.deepEqual([grok.refreshed, grok.refreshMethod, grok.groups.grok.source.method, grok.groups.grok.source.ageMinutes], [true, 'acp', 'acp', 0])
  assert.ok(Math.abs(grok.groups.grok.priority - 1 / 48) < 0.001, String(grok.groups.grok.priority))
  assert.equal(fs.readFileSync(logFile, 'utf8').trim().split('\n').length, 1, 'the log still holds its one old line')
  const [reading] = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'reading' && e.harness === 'grok')
  assert.equal(reading.groups.grok.source.method, 'acp', 'the reading in the lane log is the answer too')

  // With no log at all grok is not unknown.
  fs.rmSync(logFile)
  const noLog = fx.lane(args, 'status', ['--refresh'], withFake)
  assert.equal(noLog.status, 0, noLog.stdout + noLog.stderr)
  assert.deepEqual([noLog.json.harnesses.grok.refreshMethod, noLog.json.harnesses.grok.groups.grok.unknown], ['acp', false])
})

test('a status run by hand does not refresh, even when the reading is stale, and only --refresh is accepted after the run', (t) => {
  const grokLog = path.join(tempDir(t), 'acp.log')
  const { args, env, logFile } = statusEnv(t, { ageMinutes: 45 })
  const withFake = { ...env, AETHER_FAKE_ACP_LOG: grokLog, AETHER_FAKE_ACP_END_IN_HOURS: '48', AETHER_FAKE_ACP_LOG_LINES: logFile }
  const r = fx.lane(args, 'status', [], withFake)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual([r.json.harnesses.grok.refreshed, r.json.harnesses.grok.refreshMethod, r.json.harnesses.grok.groups.grok.source.ageMinutes], [undefined, undefined, 45])
  const sessions = fs.existsSync(grokLog) ? fs.readFileSync(grokLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((e) => e.argv && e.argv[0] === 'agent') : []
  assert.deepEqual(sessions, [])
  for (const extra of [['--now'], ['--refresh', '--refresh'], ['refresh']]) {
    const bad = fx.lane(args, 'status', extra, withFake)
    assert.equal(bad.status, 1, extra.join(' '))
    assert.deepEqual(bad.json, { error: 'usage: aether-lane status <run> [--refresh]' }, extra.join(' '))
  }
})

test('choice is no longer a command: the bin refuses it and logs nothing', (t) => {
  const { args, env } = statusEnv(t)
  const r = runBin(fx.LANE_BIN, ['choice', args.runId, 'task-1-1-implement', '--role', 'implementer', '--tier', 'haiku', '--effort', 'xhigh', '--pick', 'native', '--order', 'a:b:1:picked'], args.repoRoot, env)
  assert.equal(r.status, 1)
  assert.equal(lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'choice').length, 0)
})
