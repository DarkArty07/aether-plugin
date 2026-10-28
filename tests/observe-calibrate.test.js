'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const c = require(path.join(PLUGIN, 'lib', 'observe-calibrate.js'))
const CFG = {
  approval: { minAttempts: 5, lowRate: 0.2 }, pairSpeed: { minCalls: 5, ratio: 0.5 }, pairFailureRate: { minCalls: 5, maxRate: 0.4 },
  designRounds: { maxRounds: 6 }, cost: { minCalls: 3, ratio: 2 },
}
const L = (task, step, launchKind = 'first', attempt = 1) => ({ kind: 'launch', task, step, attempt, launchKind, time: attempt, session: 's-1' })
const V = (task, step, verdict) => ({ kind: 'verdict', task, step, verdict, time: 1, session: 's-1' })

test('approvalByStep counts launches, approvals, fixes and rises per step', () => {
  const entries = [
    L('a', 'haiku'), V('a', 'haiku', 'approved'),
    L('b', 'haiku'), V('b', 'haiku', 'fix'), L('b', 'haiku', 'fix', 2), V('b', 'haiku', 'fix'), L('b', 'sonnet', 'rise', 3), V('b', 'sonnet', 'approved'),
    { kind: 'launch', task: 'c', step: null, launchKind: 'refused' },
  ]
  assert.deepEqual(c.approvalByStep(entries), {
    haiku: { launches: 3, approved: 1, fixes: 1, rises: 0 },
    sonnet: { launches: 1, approved: 1, fixes: 0, rises: 1 },
  })
})

test('a step that almost never approves is flagged with its numbers and a proposal (E6)', () => {
  const six = Array.from({ length: 6 }, (_, i) => L(`t${i}`, 'haiku', 'first', 1))
  const found = c.calibrationSignals({ delegateEntries: six }, CFG)
  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'approval-low:haiku')
  assert.equal(found[0].kind, 'calibration')
  assert.deepEqual(found[0].numbers, { step: 'haiku', launches: 6, approved: 0, rate: 0 })
  assert.match(found[0].proposal, /haiku/)
  assert.deepEqual(c.calibrationSignals({ delegateEntries: six.slice(0, 4) }, CFG), [])
})

const PAIR = { id: 'agy/gemini-3.8-flash@medium', harness: 'agy', group: 'flash', effort: 'medium', outputTokensPerSecond: 100, costPerTaskUsd: 0.1, intelligence: 33 }
const KEY = 'agy/flash@medium'

test('a pair far below its sheet speed, or failing too often, is flagged', () => {
  const lanes = { [KEY]: { calls: 5, ok: 2, outputTokens: 5000, durationMs: 500000, usd: 0, pricedCalls: 0 } }
  const found = c.calibrationSignals({ lanes, pairs: [PAIR] }, CFG)
  assert.deepEqual(found.map((f) => f.id).sort(), [`pair-failing-rate:${KEY}`, `pair-slow:${KEY}`])
  const slow = found.find((f) => f.type === 'pair-slow')
  assert.deepEqual(slow.numbers, { observed: 10, ficha: 100, calls: 5 })
  assert.deepEqual(found.find((f) => f.type === 'pair-failing-rate').numbers, { calls: 5, ok: 2, rate: 0.6 })
  const fine = { [KEY]: { calls: 5, ok: 5, outputTokens: 5000, durationMs: 50000, usd: 0, pricedCalls: 0 } }
  assert.deepEqual(c.calibrationSignals({ lanes: fine, pairs: [PAIR] }, CFG), [])
  assert.deepEqual(c.calibrationSignals({ lanes, pairs: [{ ...PAIR, outputTokensPerSecond: null }] }, CFG).map((f) => f.type), ['pair-failing-rate'])
})

test('a design role with more rounds than the limit in one design is flagged (E6)', () => {
  assert.deepEqual(c.calibrationSignals({ seats: { 'd1/judge': 6 } }, CFG), [])
  const found = c.calibrationSignals({ seats: { 'd1/judge': 7 } }, CFG)
  assert.equal(found[0].id, 'design-rounds:d1/judge')
  assert.deepEqual(found[0].numbers, { rounds: 7, design: 'd1', seat: 'judge' })
})

test('an estimated cost far from the real one is flagged; a null sheet cost is not', () => {
  const lanes = { [KEY]: { calls: 3, ok: 3, outputTokens: 300, durationMs: 3000, usd: 3.3, pricedCalls: 3 } }
  const found = c.calibrationSignals({ lanes, pairs: [PAIR] }, CFG)
  assert.equal(found.length, 1)
  assert.equal(found[0].id, `cost-mismatch:${KEY}`)
  assert.ok(Math.abs(found[0].numbers.actual - 1.1) < 1e-9)
  assert.equal(found[0].numbers.ficha, 0.1)
  assert.equal(found[0].numbers.calls, 3)
  assert.deepEqual(c.calibrationSignals({ lanes, pairs: [{ ...PAIR, costPerTaskUsd: null }] }, CFG), [])
})

test('producing the signals changes no configuration value (R6)', () => {
  const root = path.join(PLUGIN)
  const files = [...fs.readdirSync(path.join(root, 'config')).filter((n) => n.endsWith('.json')).map((n) => path.join(root, 'config', n)),
    ...fs.readdirSync(path.join(root, 'agents')).map((n) => path.join(root, 'agents', n))]
  const hash = () => files.map((f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')).join()
  const before = hash()
  c.calibrationSignals({ delegateEntries: [L('a', 'haiku')], lanes: { [KEY]: { calls: 5, ok: 0, outputTokens: 1, durationMs: 1000000, usd: 9, pricedCalls: 5 } }, seats: { 'd/j': 9 }, pairs: [PAIR] }, CFG)
  assert.equal(hash(), before)
  assert.deepEqual(c.calibrationSignals({}, CFG), [])
})

test('proposals say that the adjustment is not applied (acceptance)', () => {
  const entries = [
    ...Array.from({ length: 6 }, (_, i) => L(`t${i}`, 'haiku', 'first', 1)),
  ]
  const lanes = {
    'agy/flash@medium': { calls: 5, ok: 1, outputTokens: 2500, durationMs: 500000, usd: 5.0, pricedCalls: 5 },
  }
  const seats = { 'd1/writer': 8 }
  const signals = c.calibrationSignals({ delegateEntries: entries, lanes, seats, pairs: [PAIR] }, CFG)
  assert.equal(signals.length, 5)
  for (const s of signals) {
    assert.match(s.proposal, /Not applied automatically\.$/)
  }
})

test('the five signals are written in English, like the rest of the observation (acceptance)', () => {
  const entries = Array.from({ length: 6 }, (_, i) => L(`t${i}`, 'haiku', 'first', 1))
  const lanes = { [KEY]: { calls: 5, ok: 1, outputTokens: 2500, durationMs: 500000, usd: 5.0, pricedCalls: 5 } }
  const signals = c.calibrationSignals({ delegateEntries: entries, lanes, seats: { 'd1/writer': 8 }, pairs: [PAIR] }, CFG)
  const byType = Object.fromEntries(signals.map((s) => [s.type, s]))
  assert.deepEqual(Object.keys(byType).sort(), ['approval-low', 'cost-mismatch', 'design-rounds', 'pair-failing-rate', 'pair-slow'])
  assert.equal(byType['approval-low'].title, 'Low approval rate at step haiku')
  assert.equal(byType['approval-low'].evidence[0], 'Step "haiku": 0 approvals in 6 launches (rate: 0)')
  assert.equal(byType['pair-slow'].title, `Observed speed of ${KEY} below its sheet`)
  assert.equal(byType['pair-failing-rate'].title, `High failure rate in pair ${KEY}`)
  assert.equal(byType['cost-mismatch'].title, `Cost mismatch in pair ${KEY}`)
  assert.equal(byType['design-rounds'].title, 'Too many rounds in the writer role of design d1')
  for (const s of signals) {
    assert.match(s.proposal, /^Proposal: /)
    assert.doesNotMatch(`${s.title} ${s.evidence.join(' ')} ${s.proposal}`, /Propuesta|Baja|Velocidad|Desfase|Exceso|rondas|aprobaciones|lanzamientos|llamadas|costo|fallos|tasa|por tarea|No se aplica/)
  }
})

test('observe-calibrate.js uses no network or process module (R12)', () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'lib', 'observe-calibrate.js'), 'utf8')
  assert.doesNotMatch(source, /node:(http|https|http2|net|tls|dgram|dns|child_process)|child_process|\bfetch\s*\(/)
})
