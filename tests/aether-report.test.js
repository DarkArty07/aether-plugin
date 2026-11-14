'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, runBin, useDataDir, tempDir, makeRepo } = require('./helpers.js')
const { T0, MIN, sampleUsage, finishedRun } = require('./report-fixtures.js')
const { appendLog } = require('../plugins/aether/lib/lanes.js')
const reg = require('../plugins/aether/lib/skill-registry.js')

const REPORT_BIN = path.join(PLUGIN, 'bin', 'aether-report')

test('aether-report --run prints the report, and --no-tests skips the tests', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  let r = runBin(REPORT_BIN, ['--run', args.runId], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.usage.session, 'run-session')
  assert.equal(r.json.quality.tests.passed, true)
  assert.equal(r.json.radar.robust.testsPassed, true)
  r = runBin(REPORT_BIN, ['--run', args.runId, '--no-tests', '--session', 'other-session'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.quality.tests, null)
  assert.equal(r.json.radar.robust.testsPassed, null)
  assert.equal(r.json.usage.session, 'other-session')
})

test('aether-report finalize records the run and deletes its directory', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const r = runBin(REPORT_BIN, ['finalize', '--run', args.runId, '--no-tests'], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.record.status, 'finalized')
  assert.equal(fs.existsSync(args.runDir), false)
  const lines = fs.readFileSync(path.join(dataDir, 'runs.jsonl'), 'utf8').trim().split('\n')
  assert.equal(JSON.parse(lines[lines.length - 1]).runId, args.runId)
})

test('aether-report price prices a claude -p output at OpenRouter prices', (t) => {
  const dir = tempDir(t)
  const file = path.join(dir, 'out.json')
  fs.writeFileSync(
    file,
    JSON.stringify({
      total_cost_usd: 0.5,
      modelUsage: { 'claude-sonnet-5-5': { inputTokens: 1e6, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 1e6, costUSD: 0.5 } },
    }),
  )
  let r = runBin(REPORT_BIN, ['price', file, '--main-model', 'claude-sonnet-5-5'], dir)
  assert.equal(r.status, 0, r.stdout)
  assert.ok(Math.abs(r.json.totalUsd - 6) < 1e-9, String(r.json.totalUsd))
  r = runBin(REPORT_BIN, ['price', file], dir)
  assert.ok(Math.abs(r.json.totalUsd - 4.5) < 1e-9, String(r.json.totalUsd))
})

test('aether-report reports errors as JSON and exits 1', (t) => {
  useDataDir(t)
  const { repo } = finishedRun(t)
  let r = runBin(REPORT_BIN, ['--run', '20991231-000000-abcd'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /run 20991231-000000-abcd not found/)
  r = runBin(REPORT_BIN, ['--run'], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /--run needs a value/)
  r = runBin(REPORT_BIN, [], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /^usage: aether-report/)
})

test('aether-report --run prints the per-call choices and the delegated work', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const reference = { id: 'claude/sonnet@high', model: 'sonnet', effort: 'high', intelligence: 46.8 }
  appendLog(dataDir, null, { kind: 'choice', time: T0 + 4 * MIN, session: null, run: args.runId, design: null, call: 'task-1-1-implement', role: 'implementer', requested: 46.8, reference, picked: null, reason: 'native', candidates: [] })
  appendLog(dataDir, null, { kind: 'took', time: T0 + 6 * MIN, session: null, run: args.runId, call: 'task-1-1-implement', by: 'native', cause: 'no-candidate' })
  const r = runBin(REPORT_BIN, ['--run', args.runId, '--no-tests'], repo.dir, { AETHER_SUPERDELEGATION: 'off' })
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json.lanes.run.choices.map((c) => [c.call, c.reference, c.by, c.ms]), [['task-1-1-implement', reference, 'native', 2 * MIN]])
  assert.deepEqual(r.json.radar.delegation.work, { calls: 1, external: 0, native: 1, externalShare: 0 })
  assert.deepEqual(r.json.radar.delegation.quotaByHarness, {})
  assert.equal(r.json.superdelegation.on, false)
})

test('aether-report --delegates without a log prints the ladder steps with zero counts and no delegations', (t) => {
  useDataDir(t)
  const r = runBin(REPORT_BIN, ['--delegates'], tempDir(t))
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json.delegations, [])
  assert.ok(r.json.ladder.steps.length > 0 && r.json.ladder.steps.every((s) => s.tasks === 0 && s.attempts === 0))
  assert.equal('totals' in r.json, false)
})

test('aether-report --skills reports per project and period and reproduces the #269 figures without reading conversations (R17, R18, R21, C8)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-report-skills-')
  const preDir = path.join(repo.dir, '.agents', 'skills', 'artificial-analysis')
  fs.mkdirSync(preDir, { recursive: true })
  fs.writeFileSync(path.join(preDir, 'SKILL.md'), '---\nname: artificial-analysis\ndescription: AA\n---\nbody\n')
  repo.git('add', '.agents/skills/artificial-analysis/SKILL.md')
  repo.git('commit', '-m', 'existing')
  const commitSec = Number.parseInt(repo.git('log', '-n', '1', '--format=%ct'), 10)
  const t0 = (commitSec + 10) * 1000

  for (let i = 0; i < 4; i++) {
    reg.recordCreated(data, { time: t0 + i, session: 's1', repo: repo.dir, name: 'artificial-analysis', path: preDir, type: 'project' })
  }
  reg.recordCreated(data, { time: t0 + 10, session: 's2', repo: `${repo.dir}/.aether/work/delegates/d1/wt`, name: 'diseno-de-juego', path: `${repo.dir}/.aether/work/delegates/d1/wt/.agents/skills/diseno-de-juego`, type: 'project' })
  reg.recordCreated(data, { time: t0 + 11, session: 's2', repo: repo.dir, name: 'diseno-de-juego', path: `${repo.dir}/.agents/skills/diseno-de-juego`, type: 'project' })
  reg.recordCreated(data, { time: t0 + 20, session: 's3', repo: '/gone/a', name: 'criterio-del-dueno', path: '/gone/a/.claude/skills/criterio-del-dueno', type: 'project' })
  reg.recordCreated(data, { time: t0 + 30, session: 's4', repo: '/gone/b', name: 'direccion-de-arte', path: '/gone/b/.claude/skills/direccion-de-arte', type: 'project' })

  const r = runBin(REPORT_BIN, ['--skills'], repo.dir, { AETHER_DATA_DIR: data })
  assert.equal(r.status, 0, r.stderr)
  const out = r.json
  assert.equal(out.mode, 'skills')
  assert.equal(out.totals.createdRaw, 8)
  assert.equal(out.totals.created, 3)
  assert.deepEqual(out.created.map((s) => s.name), ['diseno-de-juego', 'criterio-del-dueno', 'direccion-de-arte'])
  assert.equal(out.totals.downloaded, 0)
  assert.equal(out.totals.agentUses, 0)

  const later = runBin(REPORT_BIN, ['--skills', '--since', String(t0 + 25)], repo.dir, { AETHER_DATA_DIR: data })
  assert.deepEqual(later.json.created.map((s) => s.name), ['direccion-de-arte'])
})
