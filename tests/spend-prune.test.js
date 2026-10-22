'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { once } = require('node:events')
const { PLUGIN, SESSION_BIN, useDataDir, age, tempDir } = require('./helpers.js')
const { MIN, T0, PRICES, iso, meter, writeParts, laneCall, outcome, ageFile } = require('./spend-fixtures.js')
const { spendReport } = require('../plugins/aether/lib/spend.js')
const { archiveSpend } = require('../plugins/aether/lib/spend-archive.js')
const { pruneUsage } = require('../plugins/aether/lib/report.js')
const { pruneLog, logFile } = require('../plugins/aether/lib/lanes.js')
const { pruneSessions } = require('../plugins/aether/lib/session.js')

const DAY = 24 * 3600 * 1000
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)
const spend = (dataDir, session) => spendReport({ dataDir, session, prices: PRICES })
const summaryPath = (dataDir, id) => path.join(dataDir, 'spend', `${id}.json`)
const readSummary = (dataDir, id) => JSON.parse(fs.readFileSync(summaryPath(dataDir, id), 'utf8'))
const prune = (dataDir, extra = {}) => [pruneUsage(dataDir, { days: 30, prices: PRICES, ...extra }), pruneLog(dataDir, { days: 30, prices: PRICES, ...extra })]

// A session with meter parts (two parts, a judge among them), a lane call and an outcome in the journal.
function world(dataDir, id = 'old') {
  const agents = { j1: { type: 'aether:judge' } }
  writeParts(dataDir, id, [
    { agents, entries: [meter(0, 'm-a', null, 'input', 'high'), meter(1, 'm-b', 'j1', 'output', 'xhigh')] },
    { agents, entries: [meter(2, 'm-a', null, 'cacheWrite')] },
  ])
  laneCall(dataDir, id, 3, 'm-b', 'output')
  outcome(dataDir, id, 4, 'm-a')
}
function ageAll(dataDir, id, days) {
  age(path.join(dataDir, 'usage', id), days * 24)
  ageFile(logFile(dataDir, id), days * 24)
}

test('E4: a pruned session keeps its figure; a later prune adds the new stretch and does not replace the summary', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  ageAll(dataDir, 'old', 31)
  const before = spend(dataDir, 'old')
  assert.equal(before.harness.calls, 2)
  assert.deepEqual(prune(dataDir), [{ pruned: ['old'] }, { pruned: ['old'] }])
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'old')), false)
  assert.equal(fs.existsSync(logFile(dataDir, 'old')), false)
  const summary = readSummary(dataDir, 'old')
  assert.equal(summary.session, 'old')
  assert.equal(summary.tally.harness.calls, 1)
  assert.ok(fs.readFileSync(path.join(dataDir, 'router', 'decisions.jsonl'), 'utf8').includes('"kind":"outcome"'))
  assert.deepEqual(spend(dataDir, 'old'), before)
  writeParts(dataDir, 'old', [{ entries: [meter(1000, 'm-a', null, 'output')] }])
  const resumed = spend(dataDir, 'old')
  close(resumed.usd, before.usd + 2)
  // R7: with a summary, resumptions are the summary's count plus the gaps between events still on disk.
  // The outcome at T0+4 min stays in the journal and the new meter request is at T0+1000 min, so that gap counts as 1.
  assert.equal(resumed.resumptions, 1)
  assert.equal(resumed.lastRequest, iso(T0 + 1000 * MIN))
  age(path.join(dataDir, 'usage', 'old'), 31 * 24)
  prune(dataDir)
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'old')), false)
  close(readSummary(dataDir, 'old').tally.usd, before.usd - 1 + 2)
  const again = spend(dataDir, 'old')
  // D-b: the second prune folds the new request into the summary and leaves the outcome alone on disk.
  // There is no join across the cut, so the count goes back to 0. Every other field stays equal.
  assert.equal(again.resumptions, 0)
  const rest = ({ resumptions, ...fields }) => fields
  assert.deepEqual(rest(again), rest(resumed))
})

test('which prune runs first does not change the summary', (t) => {
  const a = useDataDir(t)
  world(a)
  ageAll(a, 'old', 31)
  pruneUsage(a, { days: 30, prices: PRICES })
  pruneLog(a, { days: 30, prices: PRICES })
  const first = readSummary(a, 'old')
  const b = useDataDir(t)
  world(b)
  ageAll(b, 'old', 31)
  pruneLog(b, { days: 30, prices: PRICES })
  pruneUsage(b, { days: 30, prices: PRICES })
  const second = readSummary(b, 'old')
  assert.deepEqual(second.tally, first.tally)
  assert.deepEqual(second.through, first.through)
})

test('archiving twice, or with the raw files still there, counts every event once', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  const before = spend(dataDir, 'old')
  assert.deepEqual(archiveSpend(dataDir, 'old', 'usage', { prices: PRICES }).archived, true)
  const once = readSummary(dataDir, 'old')
  archiveSpend(dataDir, 'old', 'usage', { prices: PRICES })
  assert.deepEqual(readSummary(dataDir, 'old').tally, once.tally)
  assert.deepEqual(spend(dataDir, 'old'), before)
  archiveSpend(dataDir, 'old', 'lanes', { prices: PRICES })
  assert.deepEqual(spend(dataDir, 'old'), before)
})

test('a session whose summary cannot be written is not deleted', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  ageAll(dataDir, 'old', 31)
  fs.writeFileSync(path.join(dataDir, 'spend'), 'a file where the directory should be')
  assert.deepEqual(prune(dataDir), [{ pruned: [] }, { pruned: [] }])
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'old', '0.json')), true)
  assert.equal(fs.existsSync(logFile(dataDir, 'old')), true)
})

test('what is not a session id is deleted as before and leaves no summary', (t) => {
  const dataDir = useDataDir(t)
  writeParts(dataDir, 'not an id', [{ entries: [meter(0, 'm-a', null, 'input')] }])
  laneCall(dataDir, null, 1, 'm-a')
  fs.writeFileSync(path.join(dataDir, 'lanes', 'bad name.jsonl'), '{}\n')
  age(path.join(dataDir, 'usage', 'not an id'), 31 * 24)
  ageFile(path.join(dataDir, 'lanes', 'unknown.jsonl'), 31 * 24)
  ageFile(path.join(dataDir, 'lanes', 'bad name.jsonl'), 31 * 24)
  assert.deepEqual(prune(dataDir), [{ pruned: ['not an id'] }, { pruned: ['bad name', 'unknown'] }])
  assert.equal(fs.existsSync(path.join(dataDir, 'spend')) ? fs.readdirSync(path.join(dataDir, 'spend')).length : 0, 0)
})

test('an unreadable part is archived as incomplete, and the figure stays incomplete', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  fs.writeFileSync(path.join(dataDir, 'usage', 'old', '1.json'), '{"session":"old","ent')
  ageAll(dataDir, 'old', 31)
  const before = spend(dataDir, 'old')
  assert.equal(before.complete, false)
  prune(dataDir)
  assert.equal(readSummary(dataDir, 'old').tally.complete, false)
  assert.deepEqual(spend(dataDir, 'old'), before)
})

test('pruning one session does not touch another, and no prune deletes a summary', (t) => {
  const dataDir = useDataDir(t)
  world(dataDir, 'old')
  world(dataDir, 'fresh')
  ageAll(dataDir, 'old', 31)
  prune(dataDir)
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'fresh', '0.json')), true)
  assert.equal(fs.existsSync(logFile(dataDir, 'fresh')), true)
  assert.equal(fs.existsSync(summaryPath(dataDir, 'fresh')), false)
  const far = Date.now() + 400 * DAY
  pruneUsage(dataDir, { days: 30, now: far, prices: PRICES })
  pruneLog(dataDir, { days: 30, now: far, prices: PRICES })
  pruneSessions(dataDir, { days: 30, now: far })
  assert.equal(fs.existsSync(summaryPath(dataDir, 'old')), true)
  assert.equal(fs.existsSync(summaryPath(dataDir, 'fresh')), true)
})

test('C5: four prunes at once leave one readable summary, no temporaries and the same figure', async (t) => {
  const dataDir = useDataDir(t)
  world(dataDir)
  ageAll(dataDir, 'old', 31)
  const before = spend(dataDir, 'old')
  const lib = path.join(PLUGIN, 'lib')
  const script = `
    const { pruneUsage } = require(${JSON.stringify(path.join(lib, 'report.js'))})
    const { pruneLog } = require(${JSON.stringify(path.join(lib, 'lanes.js'))})
    const prices = JSON.parse(process.argv[2])
    pruneUsage(process.argv[1], { days: 30, prices })
    pruneLog(process.argv[1], { days: 30, prices })`
  const children = [0, 1, 2, 3].map(() => spawn(process.execPath, ['-e', script, dataDir, JSON.stringify(PRICES)], { stdio: ['ignore', 'ignore', 'pipe'] }))
  const errors = children.map((child) => {
    let text = ''
    child.stderr.on('data', (chunk) => (text += chunk))
    return () => text
  })
  const codes = await Promise.all(children.map(async (child) => (await once(child, 'exit'))[0]))
  assert.deepEqual(codes, [0, 0, 0, 0], errors.map((e) => e()).join(''))
  assert.deepEqual(fs.readdirSync(path.join(dataDir, 'spend')), ['old.json'])
  assert.ok(readSummary(dataDir, 'old'))
  assert.deepEqual(spend(dataDir, 'old'), before)
})

test('session start archives a session before it prunes it', (t) => {
  const dataDir = useDataDir(t)
  const entries = [{ t: T0, ms: 1, agent: null, model: 'claude-opus-5-5', effort: 'low', input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 }]
  fs.mkdirSync(path.join(dataDir, 'usage', 'old'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'usage', 'old', '0.json'), JSON.stringify({ session: 'old', part: 0, claudeCode: '2.1.296', agents: {}, entries }))
  age(path.join(dataDir, 'usage', 'old'), 31 * 24)
  const before = spendReport({ dataDir })
  assert.equal(before.session, 'old')
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: dataDir }
  for (const key of ['CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_LANES', 'CLAUDE_PLUGIN_OPTION_HARNESSES', 'CLAUDE_PLUGIN_OPTION_OPS', 'CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', 'CLAUDE_PLUGIN_OPTION_SEATS']) delete env[key]
  const r = spawnSync(process.execPath, [SESSION_BIN], { cwd: tempDir(t), encoding: 'utf8', env, input: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'now', source: 'startup', agent_type: 'aether:lead' }) })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(fs.existsSync(path.join(dataDir, 'usage', 'old')), false)
  assert.deepEqual(spendReport({ dataDir, session: 'old' }), { ...before, session: 'old' })
})
