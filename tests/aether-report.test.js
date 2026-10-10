'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, runBin, useDataDir, tempDir } = require('./helpers.js')
const { sampleUsage, finishedRun } = require('./report-fixtures.js')

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
