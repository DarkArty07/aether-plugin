'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const log = require('../plugins/aether/lib/router-log.js')
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

test('an external delegate that did not end ok shows its fallback', (t) => {
  const dir = tempDir(t)
  log.appendEntry(dir, decision('e1', { applied: 'external', ranOn: { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' } }))
  log.appendEntry(dir, { kind: 'outcome', id: 'e1', time: 1100, session: 's1', harness: 'agy', model: 'gemini-3.8-flash', effort: 'medium', status: 'quota', durationMs: 10, usage: { input: 0, output: 0, thinking: 0, cacheRead: 0 }, quotaSpent: [], detail: 'out of quota' })
  const [row] = delegatesReport({ dataDir: dir, prices }).delegations
  assert.equal(row.fallback, 'external quota')
  assert.deepEqual(row.ranOn, { harness: 'claude', model: 'claude-haiku-5-5', effort: 'high' })
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
