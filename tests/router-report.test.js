'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const log = require('../plugins/aether/lib/router-log.js')
const route = require('../plugins/aether/lib/route.js')
const session = require('../plugins/aether/lib/session.js')
const { delegatesReport } = require('../plugins/aether/lib/router-report.js')
const { loadPrices, priceEntry } = require('../plugins/aether/lib/prices.js')
const { runBin } = require('./helpers.js')

const prices = loadPrices()
const decision = (id, over = {}) => ({
  kind: 'decision', id, time: 1000, session: 's1', mode: 'command', decider: 'haiku', description: `task ${id}`,
  task: { promptChars: 10, excerpt: 'x' }, requested: null, asked: null, override: null, answers: null,
  decision: { harness: 'claude', model: 'claude-haiku-5-5', alias: 'haiku', effort: 'high', level: 'B', axis: 'general', reason: 'shape explore (0.95); base B', confidence: 0.95, status: 'measured', readOnly: true },
  flags: { lowConfidence: false, incoherent: false, gate: false }, quota: null, fallback: null, applied: 'rewritten', ranOn: { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' }, latencyMs: 900, deciderCost: null,
  ...over,
})
const USAGE_ENTRY = { t: 1500, ms: 500, agent: 'agent-1', model: 'claude-haiku-5-5', effort: 'high', input: 1000, output: 500, cacheRead: 2000, cacheWrite: 100 }

function fixture(t) {
  const dir = tempDir(t)
  log.appendEntry(dir, decision('d1'))
  log.appendEntry(dir, { kind: 'spawn', id: 'd1', time: 1001, session: 's1', agentId: 'agent-1' })
  log.appendEntry(dir, decision('d2', { requested: { model: 'opus', effort: 'high' }, override: 'needs Opus for the legal contract', decision: null, flags: null, applied: 'kept', ranOn: { harness: 'claude', model: 'opus', effort: 'high' } }))
  log.appendEntry(dir, decision('d3', { fallback: 'decider: timeout', decision: null, flags: null }))
  log.appendEntry(dir, decision('d4', { applied: 'external', decision: { ...decision('x').decision, harness: 'grok', model: 'grok-4.7', alias: null, effort: 'low' }, ranOn: { harness: 'grok', model: 'grok-4.7', effort: 'low' } }))
  log.appendEntry(dir, { kind: 'outcome', id: 'd4', time: 1100, session: 's1', harness: 'grok', model: 'grok-4.7', effort: 'low', status: 'ok', durationMs: 4000, usage: { input: 10, output: 5, thinking: 0, cacheRead: 0 }, quotaSpent: [{ window: 'weekly', fraction: 0.01 }], detail: '' })
  log.appendEntry(dir, decision('d5', { mode: 'record', applied: 'inherited', ranOn: null }))
  log.appendEntry(dir, decision('d6', { session: 's2' }))
  fs.mkdirSync(path.join(dir, 'usage', 's1'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'usage', 's1', '0.json'), JSON.stringify({ session: 's1', part: 0, claudeCode: '2.1.301', agents: { 'agent-1': { type: 'general-purpose', description: 'task d1' } }, entries: [USAGE_ENTRY] }))
  return dir
}

test('each delegation shows its rung, reason, confidence, decider and what it cost (R30, C13)', (t) => {
  const dir = fixture(t)
  const report = delegatesReport({ dataDir: dir, session: 's1', prices })
  assert.deepEqual(report.delegations.map((d) => d.id), ['d1', 'd2', 'd3', 'd4', 'd5'])
  const d1 = report.delegations[0]
  assert.equal(d1.decider, 'haiku')
  assert.equal(d1.mode, 'command')
  assert.equal(d1.reason, 'shape explore (0.95); base B')
  assert.equal(d1.confidence, 0.95)
  assert.equal(d1.agentId, 'agent-1')
  assert.equal(d1.applied, 'rewritten')
  assert.ok(Math.abs(d1.costUsd - priceEntry(USAGE_ENTRY, prices)) < 1e-12)
  const d2 = report.delegations[1]
  assert.equal(d2.override, 'needs Opus for the legal contract')
  assert.equal(d2.decision, null)
  assert.equal(d2.reason, null)
  assert.equal(d2.costUsd, null)
  assert.equal(report.delegations[2].fallback, 'decider: timeout')
  const d4 = report.delegations[3]
  assert.deepEqual(d4.ranOn, { harness: 'grok', model: 'grok-4.7', effort: 'low' })
  assert.deepEqual(d4.quotaSpent, [{ window: 'weekly', fraction: 0.01 }])
  assert.equal(d4.costUsd, null)
})

test('the spawn that aether-route writes joins a decision to its agent: the report shows the agent and what its requests cost', (t) => {
  const dir = tempDir(t)
  log.appendEntry(dir, decision('j1'))
  fs.mkdirSync(path.join(dir, 'usage', 's1'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'usage', 's1', '0.json'), JSON.stringify({ session: 's1', part: 0, claudeCode: '2.1.301', agents: { 'agent-1': { type: 'general-purpose', description: 'task j1' } }, entries: [USAGE_ENTRY] }))
  const [before] = delegatesReport({ dataDir: dir, session: 's1', prices }).delegations
  assert.equal(before.agentId, null, 'nothing links the decision to its agent yet')
  assert.equal(before.costUsd, null)

  const bin = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-route')
  const spawned = runBin(bin, ['spawn', '--session', 's1', '--id', 'j1', '--agent', 'agent-1'], dir, { AETHER_DATA_DIR: dir })
  assert.equal(spawned.status, 0, spawned.stderr)
  assert.deepEqual(spawned.json, { spawned: true, id: 'j1', agentId: 'agent-1' })

  const { delegations: [row], totals } = delegatesReport({ dataDir: dir, session: 's1', prices })
  assert.equal(row.agentId, 'agent-1')
  assert.ok(priceEntry(USAGE_ENTRY, prices) > 0)
  assert.ok(Math.abs(row.costUsd - priceEntry(USAGE_ENTRY, prices)) < 1e-12)
  assert.ok(Math.abs(totals.costUsd - priceEntry(USAGE_ENTRY, prices)) < 1e-12)
})

// An external decision as route.js writes it: the weekly window of grok renews first, so this read-only task leaves for grok.
const NOW = Date.parse('2026-10-15T21:32:00-06:00')
const ANSWERS = {
  shape: { choice: 'explore', confidence: 0.95 },
  stakes: { score: 1.1, confidence: 0.95 },
  reads_a_lot: { score: 0.5, confidence: 0.9 },
  pinned_by_checks: { noul: 0.2, confidence: 0.9 },
  needs_judgment: { noul: 0.3, confidence: 0.9 },
  edits_files: { noul: 0.03, confidence: 0.95 },
  many_steps: { noul: 0.1, confidence: 0.9 },
}
async function externalDecision(dir, id) {
  const router = { mode: 'command', decider: 'haiku', fallback: { alias: 'sonnet', effort: 'high' }, deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 }, lanes: true, harnesses: ['grok'] }
  session.markSession(dir, 's1', NOW, { router })
  const readings = { grok: { readAt: NOW - 60000, groups: { grok: { windows: { weekly: { remaining: 0.95, resetsAt: new Date(NOW + 29.6 * 3600000).toISOString() } } } } } }
  const deps = { dataDir: dir, now: () => NOW, newId: () => id, readings: () => readings, marks: () => [], installed: () => true, renew: () => ({ started: true }), sleep: async () => {} }
  const event = { subagent_type: 'general-purpose', description: 'Audit the API usage in src/', prompt: 'Read src/ and report each call that skips the retry wrapper.' }
  const first = await route.begin({ session: 's1', event }, deps)
  const plan = await route.finish({ id: first.id, answer: JSON.stringify(ANSWERS) }, deps)
  assert.equal(plan.external.harness, 'grok', 'the fixture is an external decision')
  return log.readJournal(dir).find((e) => e.kind === 'decision' && e.id === id)
}
const outcome = (id, status, over = {}) => ({ kind: 'outcome', id, time: 1100, session: 's1', harness: 'grok', model: 'grok-4.7', effort: 'low', status, durationMs: 10, usage: { input: 0, output: 0, thinking: 0, cacheRead: 0 }, quotaSpent: [], detail: '', ...over })

test('an external delegate that did not end ok shows the Claude rung that reran it and what the rerun cost', async (t) => {
  const dir = tempDir(t)
  const entry = await externalDecision(dir, 'e1')
  assert.deepEqual(entry.ranOn, { harness: 'grok', model: 'grok-4.7', effort: 'low' }, 'the decision names the external rung')
  log.appendEntry(dir, { kind: 'spawn', id: 'e1', time: 1001, session: 's1', agentId: 'agent-2' })
  log.appendEntry(dir, outcome('e1', 'quota', { detail: 'out of quota' }))
  const rerun = { t: 1600, ms: 700, agent: 'agent-2', model: 'claude-haiku-5-5', effort: 'high', input: 3000, output: 800, cacheRead: 1000, cacheWrite: 0 }
  fs.mkdirSync(path.join(dir, 'usage', 's1'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'usage', 's1', '0.json'), JSON.stringify({ session: 's1', part: 0, claudeCode: '2.1.301', agents: { 'agent-2': { type: 'general-purpose', description: 'Audit the API usage in src/' } }, entries: [rerun] }))
  const { delegations: [row], totals } = delegatesReport({ dataDir: dir, prices })
  assert.equal(row.fallback, 'external quota')
  assert.deepEqual(row.ranOn, entry.rescue)
  assert.deepEqual(row.ranOn, { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' }, 'what the agent ran on, not the rung that failed')
  assert.ok(priceEntry(rerun, prices) > 0)
  assert.ok(Math.abs(row.costUsd - priceEntry(rerun, prices)) < 1e-12, 'the rerun spent tokens')
  assert.ok(Math.abs(totals.costUsd - priceEntry(rerun, prices)) < 1e-12)
  assert.equal(totals.fallback, 1)
})

test('an external delegate that ended ok shows the rung it ran on and costs no tokens', async (t) => {
  const dir = tempDir(t)
  await externalDecision(dir, 'e3')
  log.appendEntry(dir, outcome('e3', 'ok', { model: 'grok-4.7-low', quotaSpent: [{ window: 'weekly', fraction: 0.01 }] }))
  const [row] = delegatesReport({ dataDir: dir, prices }).delegations
  assert.equal(row.fallback, null)
  assert.deepEqual(row.ranOn, { harness: 'grok', model: 'grok-4.7-low', effort: 'low' })
  assert.equal(row.costUsd, null)
  assert.deepEqual(row.quotaSpent, [{ window: 'weekly', fraction: 0.01 }])
})

test('per run it counts the delegations decided, overridden and in fallback', (t) => {
  const dir = fixture(t)
  const { totals } = delegatesReport({ dataDir: dir, session: 's1', prices })
  assert.equal(totals.delegations, 5)
  assert.equal(totals.decided, 2)
  assert.equal(totals.overridden, 1)
  assert.equal(totals.fallback, 1)
  assert.equal(totals.inherited, 1)
  assert.equal(totals.recorded, 1)
  assert.ok(Math.abs(totals.costUsd - priceEntry(USAGE_ENTRY, prices)) < 1e-12)
  assert.equal(delegatesReport({ dataDir: dir, session: 'nobody', prices }).delegations.length, 0)
  assert.equal(delegatesReport({ dataDir: dir, prices }).delegations.length, 6)
})

test('aether-report --delegates prints the report', (t) => {
  const dir = fixture(t)
  const bin = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-report')
  const r = runBin(bin, ['--delegates', '--session', 's1'], dir, { AETHER_DATA_DIR: dir })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.delegations.length, 5)
  assert.equal(r.json.totals.overridden, 1)
})
