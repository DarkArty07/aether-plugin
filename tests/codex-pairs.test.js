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
  'gpt-6.2-sol': { base: 'gpt-6-2-sol', points: [40.6, 52.7, 54.9, 55.7, 57.3] },
  'gpt-6.1-terra': { base: 'gpt-6-1-terra', points: [29.4, 38.2, 42.4, 45.3, 51.3] },
  'gpt-6-luna': { base: 'gpt-6-luna', points: [9.7, 18.5, 21.4, 23.5, 27.9] },
}
// The cost per index task that AA's model pages gave on 2026-11-17 (spec 022, redone by the 2026-11-17 reading):
// all fifteen pairs are measured, none is an estimate any more.
const MEASURED = {
  'gpt-6.2-sol': [0.184, 0.406, 0.564, 0.648, 1.014],
  'gpt-6.1-terra': [0.071, 0.169, 0.259, 0.401, 0.961],
  'gpt-6-luna': [0.005, 0.042, 0.073, 0.104, 0.152],
}

test('the table has the fifteen pairs of Sol, Terra and Luna with the figures of the photo of the model pages, read on 2026-11-17 (R12)', () => {
  assert.equal(pairs.filter((pair) => pair.harness === 'codex').length, 15)
  for (const [model, { base, points }] of Object.entries(AA)) {
    EFFORTS.forEach((effort, i) => {
      const row = pairs.find((pair) => pair.id === `codex/${model}@${effort}`)
      assert.ok(row, `${model} at ${effort}`)
      assert.deepEqual([row.harness, row.group, row.family, row.model, row.effort], ['codex', 'codex', model, model, effort])
      assert.equal(row.slug, effort === 'max' ? base : `${base}-${effort}`)
      assert.equal(row.intelligence, points[i])
      assert.equal(row.checked, '2026-11-17')
      assert.equal(row.costEstimate, undefined, 'a measured cost carries no estimate mark')
      assert.equal(typeof row.costPerTaskUsd, 'number')
    })
  }
})

test('the cost of each Codex pair is the one AA measured, and none is marked as an estimate (R13 of spec 022, redone on 2026-11-17)', () => {
  for (const [model, costs] of Object.entries(MEASURED)) {
    EFFORTS.forEach((effort, i) => assert.equal(pairs.find((pair) => pair.id === `codex/${model}@${effort}`).costPerTaskUsd, costs[i], `${model} at ${effort}`))
  }
  assert.equal(pairs.filter((pair) => pair.harness === 'codex' && pair.costEstimate !== undefined).length, 0)
})

// Every cupo renews at the same moment, so only the cost and the points decide.
const open = { usable: true, unknown: false, mark: null, resetsAt: '2026-11-17T00:00:00.000Z' }
const view = (group) => ({ installed: true, groups: { [group]: open } })
const CODEX_ONLY = { codex: view('codex') }
const ALL = { agy: { installed: true, groups: { argon: open, hydrogen: open, claude: open } }, grok: view('grok'), muse: view('muse'), codex: view('codex') }
const picked = (model, effort, harnesses) => choose({ pairs, reference: { model, effort }, harnesses }).picked?.id ?? null

// On the scale AA published on 2026-10-29, re-read on 2026-11-17 with GPT-6.2 Sol in place of GPT-6.1 Sol. The steps
// the owner approved on 2026-11-17 are Terra low, Terra medium, Sol low and Sol medium; with AA's costs of
// 2026-10-30 they were Terra low, Sol low, Terra high and Sol xhigh.
test('C6: with Codex alone the rule puts the first step on Terra low, its correction on Terra medium, Sonnet high on Sol low and Opus high on Sol medium (R17)', () => {
  assert.equal(picked('haiku', 'high', CODEX_ONLY), 'codex/gpt-6.1-terra@low')
  assert.equal(picked('haiku', 'xhigh', CODEX_ONLY), 'codex/gpt-6.1-terra@medium')
  assert.equal(picked('sonnet', 'high', CODEX_ONLY), 'codex/gpt-6.2-sol@low')
  assert.equal(picked('opus', 'high', CODEX_ONLY), 'codex/gpt-6.2-sol@medium')
})

test('the Expected result: haiku high takes Terra low, haiku xhigh Terra medium, sonnet high Sol low, opus high Sol medium and opus xhigh Sol max', () => {
  assert.equal(picked('haiku', 'high', CODEX_ONLY), 'codex/gpt-6.1-terra@low')
  assert.equal(picked('haiku', 'xhigh', CODEX_ONLY), 'codex/gpt-6.1-terra@medium')
  assert.equal(picked('sonnet', 'high', CODEX_ONLY), 'codex/gpt-6.2-sol@low')
  assert.equal(picked('opus', 'high', CODEX_ONLY), 'codex/gpt-6.2-sol@medium')
  assert.equal(picked('opus', 'xhigh', CODEX_ONLY), 'codex/gpt-6.2-sol@max')
})

test('R17: with the four harnesses open on the same reset, the pair the rule chooses by cost is fixed, for the brief to report', () => {
  assert.equal(picked('haiku', 'high', ALL), 'codex/gpt-6.1-terra@low')
  assert.equal(picked('haiku', 'xhigh', ALL), 'codex/gpt-6.1-terra@medium', 'Terra medium 38.2 points at US$ 0.169 against Sol low 40.6 at US$ 0.184')
  assert.equal(picked('sonnet', 'high', ALL), 'codex/gpt-6.2-sol@low')
  assert.equal(picked('opus', 'high', ALL), 'codex/gpt-6.2-sol@medium', 'Sol medium 52.7 points at US$ 0.406 against Terra max 51.3 at US$ 0.961: both reach Opus high at 51.8 minus 1')
})

// The premise changed with the scale: Luna max (27.9) is 2 points under Haiku high (29.9), so it still wins no Haiku-high ask or above, but Luna
// medium (18.5) reaches Haiku low (18.6) and, at US$ 0.042, is the cheapest pair that does.
test('R18: Luna max is in the table and under Haiku high minus 1 point, so only the Haiku low ask reaches Luna: at Luna medium', () => {
  assert.ok(pairs.some((pair) => pair.id === 'codex/gpt-6-luna@max'))
  assert.equal(picked('haiku', 'low', CODEX_ONLY), 'codex/gpt-6-luna@medium')
  for (const reference of pairs.filter((pair) => pair.harness === 'claude' && pair.id !== 'claude/haiku@low')) {
    const id = picked(reference.model, reference.effort, CODEX_ONLY)
    assert.ok(id === null || !id.startsWith('codex/gpt-6-luna'), `${reference.id} -> ${id}`)
  }
})

// Plan D2 of the 2026-11-17 reading (A133): for each of the 15 asks of Haiku, Sonnet and Opus the pair the rule gives,
// with Codex alone and with the four harnesses open.
const D2 = [
  ['haiku', 'low', 'codex/gpt-6-luna@medium'], ['haiku', 'medium', 'codex/gpt-6.1-terra@low'], ['haiku', 'high', 'codex/gpt-6.1-terra@low'],
  ['haiku', 'xhigh', 'codex/gpt-6.1-terra@medium'], ['haiku', 'max', 'codex/gpt-6.1-terra@medium'],
  ['sonnet', 'low', 'codex/gpt-6.1-terra@low'], ['sonnet', 'medium', 'codex/gpt-6.1-terra@medium'], ['sonnet', 'high', 'codex/gpt-6.2-sol@low'],
  ['sonnet', 'xhigh', 'codex/gpt-6.2-sol@medium'], ['sonnet', 'max', 'codex/gpt-6.2-sol@high'],
  ['opus', 'low', 'codex/gpt-6.1-terra@medium'], ['opus', 'medium', 'codex/gpt-6.2-sol@medium'], ['opus', 'high', 'codex/gpt-6.2-sol@medium'],
  ['opus', 'xhigh', 'codex/gpt-6.2-sol@max'], ['opus', 'max', null],
]

test('R4 of spec 023, redone on 2026-11-17 (A133): for each of the 15 asks of Haiku, Sonnet and Opus the rule gives the pair of plan D2, with Codex alone and with the four harnesses open', () => {
  for (const [model, effort, expected] of D2) {
    assert.equal(picked(model, effort, CODEX_ONLY), expected, `${model} ${effort} with Codex alone`)
    assert.equal(picked(model, effort, ALL), expected, `${model} ${effort} with the four harnesses open`)
  }
})
