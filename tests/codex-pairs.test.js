'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { choose } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const { pairs } = loadPairs()
const prices = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'prices.json'), 'utf8'))
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const AA = {
  'gpt-6.1-sol': { base: 'gpt-6-1-sol', points: [34.5, 46.1, 50.2, 52.3, 54.5] },
  'gpt-6.1-terra': { base: 'gpt-6-1-terra', points: [29.2, 38.1, 42.3, 45.0, 51.0] },
  'gpt-6-luna': { base: 'gpt-6-luna', points: [9.7, 18.3, 21.4, 23.3, 27.8] },
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length / 2
  return sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : (sorted[middle - 1] + sorted[middle]) / 2
}
const outputPrice = (model) => prices.models[model].output
// What AA measured at `max` on 2026-10-26 (the AA cost per task of 2026-10-26, quoted in the spec 022 plan, D5): these two rows carry it with no estimate mark.
const MEASURED = { 'codex/gpt-6.1-sol@max': 0.724, 'codex/gpt-6-luna@max': 0.068 }
const ANCHOR = { 'gpt-6.1-sol': 0.724, 'gpt-6-luna': 0.068, 'gpt-6.1-terra': 0.724 * outputPrice('gpt-6.1-terra') / outputPrice('gpt-6.1-sol') }

test('the table has the fifteen pairs of Sol, Terra and Luna with the figures of AA of 2026-10-29 and their date (R12)', () => {
  assert.equal(pairs.filter((pair) => pair.harness === 'codex').length, 15)
  for (const [model, { base, points }] of Object.entries(AA)) {
    EFFORTS.forEach((effort, i) => {
      const row = pairs.find((pair) => pair.id === `codex/${model}@${effort}`)
      assert.ok(row, `${model} at ${effort}`)
      assert.deepEqual([row.harness, row.group, row.family, row.model, row.effort], ['codex', 'codex', model, model, effort])
      assert.equal(row.slug, effort === 'max' ? base : `${base}-${effort}`)
      assert.equal(row.intelligence, points[i])
      assert.equal(row.checked, '2026-10-29')
      if (MEASURED[row.id] === undefined) assert.ok(typeof row.costEstimate === 'string' && row.costEstimate.length > 0, 'the estimate is marked in its row')
      else assert.equal(row.costEstimate, undefined, 'a measured cost carries no estimate mark')
      assert.equal(typeof row.costPerTaskUsd, 'number')
    })
  }
})

test('the cost of each pair is the measured one or the anchored estimate of the A96 curve method, recomputed from the table (R13)', () => {
  const units = pairs.filter((pair) => (pair.harness === 'claude' || pair.harness === 'grok') && typeof pair.costPerTaskUsd === 'number')
  const curve = Object.fromEntries(EFFORTS.map((effort) => [effort, median(units.filter((pair) => pair.effort === effort).map((pair) => pair.costPerTaskUsd / outputPrice(pair.model)))]))
  const expectedCurve = { low: 0.0375, medium: 0.067, high: 0.1255, xhigh: 0.2205, max: 0.42 }
  for (const effort of EFFORTS) assert.ok(Math.abs(curve[effort] - expectedCurve[effort]) < 1e-9, `${effort}: ${curve[effort]}`)
  for (const row of pairs.filter((pair) => pair.harness === 'codex')) {
    assert.equal(row.costPerTaskUsd, Math.round((ANCHOR[row.model] * curve[row.effort] / curve.max) * 1000) / 1000, row.id)
    if (MEASURED[row.id] !== undefined) assert.equal(row.costPerTaskUsd, MEASURED[row.id], `${row.id} keeps the cost AA measured`)
  }
})

// Every cupo renews at the same moment, so only the cost and the points decide.
const open = { usable: true, unknown: false, mark: null, resetsAt: '2026-10-30T00:00:00.000Z' }
const view = (group) => ({ installed: true, groups: { [group]: open } })
const CODEX_ONLY = { codex: view('codex') }
const ALL = { agy: { installed: true, groups: { argon: open, flash: open, claude: open } }, grok: view('grok'), muse: view('muse'), codex: view('codex') }
const picked = (model, effort, harnesses) => choose({ pairs, reference: { model, effort }, harnesses }).picked?.id ?? null

// On the scale AA published on 2026-10-29 (spec 023, plan D2). The steps the owner approved on 2026-10-29, on the table that mixed two scales,
// were Terra medium, Terra high, Sol medium and Sol max; with every row on one scale Terra covers the four.
test('C6: with Codex alone the rule puts the first step on Terra low, its correction on Terra medium, Sonnet high on Terra high and Opus high on Terra max (R17)', () => {
  assert.equal(picked('haiku', 'high', CODEX_ONLY), 'codex/gpt-6.1-terra@low')
  assert.equal(picked('haiku', 'xhigh', CODEX_ONLY), 'codex/gpt-6.1-terra@medium')
  assert.equal(picked('sonnet', 'high', CODEX_ONLY), 'codex/gpt-6.1-terra@high')
  assert.equal(picked('opus', 'high', CODEX_ONLY), 'codex/gpt-6.1-terra@max')
})

test('R17: with the four harnesses open on the same reset, the pair the rule chooses by cost is fixed, for the brief to report', () => {
  assert.equal(picked('haiku', 'high', ALL), 'codex/gpt-6.1-terra@low')
  assert.equal(picked('haiku', 'xhigh', ALL), 'codex/gpt-6.1-terra@medium')
  assert.equal(picked('sonnet', 'high', ALL), 'codex/gpt-6.1-terra@high')
  assert.equal(picked('opus', 'high', ALL), 'codex/gpt-6.1-terra@max', '0.362 (estimated) against Sol max at 0.724 (measured): both reach Opus high at 51.7 minus 1')
})

// The premise changed with the scale: Luna max (27.8) is 1.8 points under Haiku high (29.6), so it still wins no Haiku-high ask or above, but Luna
// medium (18.3) reaches Haiku low (18.6) and, at US$ 0.011, is the cheapest pair that does.
test('R18: Luna max is in the table and under Haiku high minus 1 point, so only the Haiku low ask reaches Luna: at Luna medium', () => {
  assert.ok(pairs.some((pair) => pair.id === 'codex/gpt-6-luna@max'))
  assert.equal(picked('haiku', 'low', CODEX_ONLY), 'codex/gpt-6-luna@medium')
  for (const reference of pairs.filter((pair) => pair.harness === 'claude' && pair.id !== 'claude/haiku@low')) {
    const id = picked(reference.model, reference.effort, CODEX_ONLY)
    assert.ok(id === null || !id.startsWith('codex/gpt-6-luna'), `${reference.id} -> ${id}`)
  }
})

// Plan D2 of spec 023: what the rule gives for every ask of the three Claude models on the table of one scale (R4).
const D2 = [
  ['haiku', 'low', 'codex/gpt-6-luna@medium'], ['haiku', 'medium', 'codex/gpt-6.1-terra@low'], ['haiku', 'high', 'codex/gpt-6.1-terra@low'],
  ['haiku', 'xhigh', 'codex/gpt-6.1-terra@medium'], ['haiku', 'max', 'codex/gpt-6.1-terra@medium'],
  ['sonnet', 'low', 'codex/gpt-6.1-terra@low'], ['sonnet', 'medium', 'codex/gpt-6.1-terra@medium'], ['sonnet', 'high', 'codex/gpt-6.1-terra@high'],
  ['sonnet', 'xhigh', 'codex/gpt-6.1-sol@high'], ['sonnet', 'max', 'codex/gpt-6.1-sol@max'],
  ['opus', 'low', 'codex/gpt-6.1-terra@medium'], ['opus', 'medium', 'codex/gpt-6.1-sol@high'], ['opus', 'high', 'codex/gpt-6.1-terra@max'],
  ['opus', 'xhigh', null], ['opus', 'max', null],
]

test('R4 of spec 023: for each of the 15 asks of Haiku, Sonnet and Opus the rule gives the pair of plan D2, with Codex alone and with the four harnesses open', () => {
  for (const [model, effort, expected] of D2) {
    assert.equal(picked(model, effort, CODEX_ONLY), expected, `${model} ${effort} with Codex alone`)
    assert.equal(picked(model, effort, ALL), expected, `${model} ${effort} with the four harnesses open`)
  }
})
