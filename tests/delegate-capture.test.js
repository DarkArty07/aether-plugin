'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const prune = require('../plugins/aether/lib/delegate-prune.js')
const { spendReport, outcomesFile } = require('../plugins/aether/lib/spend.js')
const { PRICES, T0, outcome } = require('./spend-fixtures.js')

const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const EXTERNAL = { lanes: true, harnesses: ['grok'], deadlines: { quotaMs: 1 } }
const GROK = { id: 'grok/grok-4.7@high', harness: 'grok', model: 'grok-4.7', effort: 'high', group: 'grok' }

test('launch on Claude and on another harness both record repo and brief, and write the brief file', async (t) => {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')

  const nativePrompt = 'AETHER-TASK: t-claude\nAETHER-OWNS: a.txt\nBuild the feature.'
  const nativePlan = await task.begin(
    { session: 's1', event: { subagent_type: 'general-purpose', description: 'claude launch', prompt: nativePrompt } },
    { dataDir, cwd: repo.dir, now: () => 1000, settings: NATIVE },
  )
  assert.ok(nativePlan.step)
  const [nativeLaunch] = log.readEntries(dataDir, { task: 't-claude' }).filter((e) => e.kind === 'launch')
  assert.equal(nativeLaunch.repo, repo.dir)
  assert.equal(nativeLaunch.brief, `briefs/${log.fileKey('s1', 't-claude')}-1.md`)
  const nativeBriefPath = path.join(dataDir, 'delegates', nativeLaunch.brief)
  assert.equal(fs.existsSync(nativeBriefPath), true)
  const nativeBriefText = fs.readFileSync(nativeBriefPath, 'utf8')
  assert.equal(nativeBriefText, nativePlan.args.prompt ?? nativePrompt)
  assert.ok(nativeBriefText.includes('Build the feature.'))
  assert.ok(!nativeLaunch.brief.includes('Build the feature.'), 'launch line holds the path, not the text')

  const extPrompt = 'AETHER-TASK: t-ext\nAETHER-OWNS: b.txt\nBuild the external feature.'
  const extPlan = await task.begin(
    { session: 's1', event: { subagent_type: 'general-purpose', description: 'ext launch', prompt: extPrompt } },
    { dataDir, cwd: repo.dir, now: () => 2000, settings: EXTERNAL, pickPair: async () => ({ pick: GROK, quota: [] }) },
  )
  assert.ok(extPlan.step)
  const [extLaunch] = log.readEntries(dataDir, { task: 't-ext' }).filter((e) => e.kind === 'launch')
  assert.equal(extLaunch.repo, repo.dir)
  assert.equal(extLaunch.brief, `briefs/${log.fileKey('s1', 't-ext')}-1.md`)
  const extBriefPath = path.join(dataDir, 'delegates', extLaunch.brief)
  assert.equal(fs.existsSync(extBriefPath), true)
  assert.ok(fs.readFileSync(extBriefPath, 'utf8').includes('Build the external feature.'))
})

test('pruneDelegateLog archives launch lines alongside outcomes and spendReport gives the same figures', async (t) => {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const DAY = 86400000
  const now = T0 + 40 * DAY

  const plan = await task.begin(
    { session: 's-old', event: { subagent_type: 'general-purpose', description: 'old task', prompt: 'AETHER-TASK: t-old\nAETHER-OWNS: a.txt\nWork.' } },
    { dataDir, cwd: repo.dir, now: () => T0, settings: NATIVE },
  )
  assert.ok(plan.step)
  const expectedUsd = outcome(dataDir, 's-old', 1, 'm-b', 'output')
  const before = spendReport({ dataDir, session: 's-old', prices: PRICES })

  const res = prune.pruneDelegateLog(dataDir, { days: 30, now })
  assert.deepEqual(res, { pruned: ['s-old'] })
  assert.equal(log.readEntries(dataDir, { session: 's-old' }).length, 0)

  const archivedLines = fs.readFileSync(outcomesFile(dataDir, 's-old'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  const archivedLaunch = archivedLines.find((e) => e.kind === 'launch')
  const archivedOutcome = archivedLines.find((e) => e.kind === 'outcome')
  assert.ok(archivedLaunch, 'archived launch line is preserved')
  assert.ok(archivedOutcome, 'archived outcome line is preserved')
  const expectedBase = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.dir, encoding: 'utf8' }).trim()
  assert.equal(archivedLaunch.base, expectedBase)
  assert.equal(archivedLaunch.repo, repo.dir)
  assert.equal(archivedLaunch.brief, `briefs/${log.fileKey('s-old', 't-old')}-1.md`)

  const after = spendReport({ dataDir, session: 's-old', prices: PRICES })
  assert.ok(Math.abs(after.usd - expectedUsd) < 1e-9)
  assert.equal(after.usd, before.usd)
  assert.equal(after.harness.calls, before.harness.calls)
  assert.equal(after.complete, true)
})
