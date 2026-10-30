'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { choose } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const { pairs } = loadPairs()
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const AA = {
  'gpt-6.1-sol': { base: 'gpt-6-1-sol', points: [34.5, 46.1, 50.2, 52.3, 54.5] },
  'gpt-6.1-terra': { base: 'gpt-6-1-terra', points: [29.2, 38.1, 42.3, 45.0, 51.0] },
  'gpt-6-luna': { base: 'gpt-6-luna', points: [9.7, 18.3, 21.4, 23.3, 27.8] },
}
// The cost per index task that AA's model pages gave on 2026-10-30 (spec 023): all fifteen pairs are measured, none is an estimate any more.
// On 2026-10-26 only Sol max (0.724) and Luna max (0.068) were known, and the other thirteen were estimates anchored on them; AA's re-score
// changed the basis of the cost (Sol max is 1.272 now), and the pages of the other thirteen rows could be read.
const MEASURED = {
  'gpt-6.1-sol': [0.161, 0.359, 0.591, 0.764, 1.272],
  'gpt-6.1-terra': [0.071, 0.169, 0.259, 0.401, 0.961],
  'gpt-6-luna': [0.005, 0.042, 0.073, 0.104, 0.152],
}

test('the table has the fifteen pairs of Sol, Terra and Luna with the figures of AA of 2026-10-29, read again on 2026-10-30 (R12)', () => {
  assert.equal(pairs.filter((pair) => pair.harness === 'codex').length, 15)
  for (const [model, { base, points }] of Object.entries(AA)) {
    EFFORTS.forEach((effort, i) => {
      const row = pairs.find((pair) => pair.id === `codex/${model}@${effort}`)
      assert.ok(row, `${model} at ${effort}`)
      assert.deepEqual([row.harness, row.group, row.family, row.model, row.effort], ['codex', 'codex', model, model, effort])
      assert.equal(row.slug, effort === 'max' ? base : `${base}-${effort}`)
      assert.equal(row.intelligence, points[i])
      assert.equal(row.checked, '2026-10-30')
      assert.equal(row.costEstimate, undefined, 'a measured cost carries no estimate mark')
      assert.equal(typeof row.costPerTaskUsd, 'number')
    })
  }
})

test('the cost of each Codex pair is the one AA measured on 2026-10-30, and none is marked as an estimate (R13 of spec 022, redone by spec 023)', () => {
  for (const [model, costs] of Object.entries(MEASURED)) {
    EFFORTS.forEach((effort, i) => assert.equal(pairs.find((pair) => pair.id === `codex/${model}@${effort}`).costPerTaskUsd, costs[i], `${model} at ${effort}`))
  }
  assert.equal(pairs.filter((pair) => pair.harness === 'codex' && pair.costEstimate !== undefined).length, 0)
})

// Every cupo renews at the same moment, so only the cost and the points decide.
const open = { usable: true, unknown: false, mark: null, resetsAt: '2026-10-30T00:00:00.000Z' }
const view = (group) => ({ installed: true, groups: { [group]: open } })
const CODEX_ONLY = { codex: view('codex') }
const ALL = { agy: { installed: true, groups: { argon: open, flash: open, claude: open } }, grok: view('grok'), muse: view('muse'), codex: view('codex') }
const picked = (model, effort, harnesses) => choose({ pairs, reference: { model, effort }, harnesses }).picked?.id ?? null

// On the scale AA published on 2026-10-29 and its costs of 2026-10-30. The steps the owner approved on 2026-10-29, on a table that mixed two scales,
// were Terra medium, Terra high, Sol medium and Sol max; on the points of 2026-10-29 with the old costs they became Terra low, medium, high and max;
// with AA's costs of 2026-10-30 they are Terra low, Sol low, Terra high and Sol xhigh.
test('C6: with Codex alone the rule puts the first step on Terra low, its correction on Sol low, Sonnet high on Terra high and Opus high on Sol xhigh (R17)', () => {
  assert.equal(picked('haiku', 'high', CODEX_ONLY), 'codex/gpt-6.1-terra@low')
  assert.equal(picked('haiku', 'xhigh', CODEX_ONLY), 'codex/gpt-6.1-sol@low')
  assert.equal(picked('sonnet', 'high', CODEX_ONLY), 'codex/gpt-6.1-terra@high')
  assert.equal(picked('opus', 'high', CODEX_ONLY), 'codex/gpt-6.1-sol@xhigh')
})

test('R17: with the four harnesses open on the same reset, the pair the rule chooses by cost is fixed, for the brief to report', () => {
  assert.equal(picked('haiku', 'high', ALL), 'codex/gpt-6.1-terra@low')
  assert.equal(picked('haiku', 'xhigh', ALL), 'codex/gpt-6.1-sol@low', 'Sol low 34.5 points at US$ 0.161 against Terra medium 38.1 at US$ 0.169')
  assert.equal(picked('sonnet', 'high', ALL), 'codex/gpt-6.1-terra@high')
  assert.equal(picked('opus', 'high', ALL), 'codex/gpt-6.1-sol@xhigh', 'Sol xhigh 52.3 points at US$ 0.764 against Terra max 51.0 at US$ 0.961: both reach Opus high at 51.7 minus 1')
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

// Plan D2 of spec 023, with the costs of AA of 2026-10-30 (A102): what the rule gives for every ask of the three Claude models on the table of one scale (R4).
const D2 = [
  ['haiku', 'low', 'codex/gpt-6-luna@medium'], ['haiku', 'medium', 'codex/gpt-6.1-terra@low'], ['haiku', 'high', 'codex/gpt-6.1-terra@low'],
  ['haiku', 'xhigh', 'codex/gpt-6.1-sol@low'], ['haiku', 'max', 'codex/gpt-6.1-terra@medium'],
  ['sonnet', 'low', 'codex/gpt-6.1-terra@low'], ['sonnet', 'medium', 'codex/gpt-6.1-sol@low'], ['sonnet', 'high', 'codex/gpt-6.1-terra@high'],
  ['sonnet', 'xhigh', 'codex/gpt-6.1-sol@high'], ['sonnet', 'max', 'codex/gpt-6.1-sol@max'],
  ['opus', 'low', 'codex/gpt-6.1-sol@low'], ['opus', 'medium', 'codex/gpt-6.1-sol@high'], ['opus', 'high', 'codex/gpt-6.1-sol@xhigh'],
  ['opus', 'xhigh', null], ['opus', 'max', null],
]

test('R4 of spec 023: for each of the 15 asks of Haiku, Sonnet and Opus the rule gives the pair of plan D2, with Codex alone and with the four harnesses open', () => {
  for (const [model, effort, expected] of D2) {
    assert.equal(picked(model, effort, CODEX_ONLY), expected, `${model} ${effort} with Codex alone`)
    assert.equal(picked(model, effort, ALL), expected, `${model} ${effort} with the four harnesses open`)
  }
})
