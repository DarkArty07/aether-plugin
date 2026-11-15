'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { ladderFrom, diffLadder } = require('../plugins/aether/lib/pareto.js')

const LAW = { candidateEfforts: ['high', 'xhigh'], minJumpPoints: 2 }
const EVIDENCE = path.join(__dirname, '..', 'specs', '032-pareto-ladder', 'evidence', 'aa-pages-claude-2026-11-10.json')
const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits
const names = (rungs) => rungs.map((rung) => `${rung.model} ${rung.effort}`)

// The table of the extract of 2026-11-10: the model and the effort come from the slug (claude-<model>-5-5[-<effort>];
// without an effort suffix the page is max). Only the Intelligence Index and its cost per task are read.
function tableOfEvidence() {
  const pages = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'))
  return Object.values(pages).map((page) => {
    const [, model, , , effort = 'max'] = page.slug.split('-')
    return {
      harness: 'claude', model, effort,
      intelligence: round(page.scalars.intelligenceIndex, 1),
      costPerTaskUsd: round(page.objects.intelligenceIndexCostPerTask.cost.total, 3),
    }
  })
}

// A row of a sample table: model names that exist in no table of the project.
const row = (model, effort, intelligence, costPerTaskUsd) => ({ harness: 'claude', model, effort, intelligence, costPerTaskUsd })
const BASE = [
  row('haiku-5', 'high', 20, 0.1),
  row('haiku-5', 'xhigh', 30, 0.2),
  row('sonnet-5', 'high', 40, 1),
  row('sonnet-5', 'xhigh', 50, 3),
]
const OPUS_6 = [row('opus-6', 'high', 62, 2), row('opus-6', 'xhigh', 70, 4)]

test('the law gives the five steps of the figures of 2026-11-10, each one up in intelligence', () => {
  const rungs = ladderFrom(tableOfEvidence(), LAW)
  assert.deepEqual(names(rungs), ['haiku high', 'haiku xhigh', 'sonnet high', 'opus high', 'opus xhigh'])
  for (let i = 1; i < rungs.length; i++) {
    assert.ok(rungs[i].intelligence > rungs[i - 1].intelligence, `intelligence up at ${i}`)
  }
})

test('sonnet xhigh is out: opus high gives more intelligence for less cost per task', () => {
  const table = tableOfEvidence()
  const get = (model, effort) => table.find((r) => r.model === model && r.effort === effort)
  assert.ok(get('opus', 'high').intelligence > get('sonnet', 'xhigh').intelligence)
  assert.ok(get('opus', 'high').costPerTaskUsd < get('sonnet', 'xhigh').costPerTaskUsd)
  assert.ok(!names(ladderFrom(table, LAW)).includes('sonnet xhigh'))
})

test('a new Opus before the new Sonnet gives a ladder with five steps', () => {
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6], LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5 high', 'opus-6 high', 'opus-6 xhigh'])
})

test('a new Sonnet before the new Opus gives another valid ladder, with four steps', () => {
  const table = [
    BASE[0], BASE[1],
    row('sonnet-6', 'high', 45, 1.2), row('sonnet-6', 'xhigh', 58, 2.5),
    row('opus-5', 'high', 52, 3.5), row('opus-5', 'xhigh', 57, 6),
  ]
  assert.deepEqual(names(ladderFrom(table, LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-6 high', 'sonnet-6 xhigh'])
})

test('a Claude row with no code field is still a candidate: the law reads only intelligence and cost per task', () => {
  const plain = { harness: 'claude', model: 'opus-7', effort: 'high', intelligence: 90, costPerTaskUsd: 0.5 }
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, plain], LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'opus-7 high'])
  assert.deepEqual(ladderFrom([plain], LAW), [{ model: 'opus-7', effort: 'high', intelligence: 90 }])
})

test('a row with no cost per task is not in the pool, however good its intelligence', () => {
  const noCost = row('opus-7', 'high', 90, null)
  assert.deepEqual(ladderFrom([...BASE, ...OPUS_6, noCost], LAW), ladderFrom([...BASE, ...OPUS_6], LAW))
  assert.deepEqual(ladderFrom([noCost], LAW), [])
})

test('a step of less than the minimum jump in intelligence does not make a rung of its own: the cheaper stays', () => {
  // Intelligence 39 at cost 0.9 against sonnet-5 high at 40 and cost 1: one point is under the minimum of 2, so the cheaper stays.
  const nearer = row('sonnet-5b', 'high', 39, 0.9)
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, nearer], LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5b high', 'opus-6 high', 'opus-6 xhigh'])
  // The minimum is data: with a minimum of 0.5 both stay, in the order of intelligence.
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, nearer], { ...LAW, minJumpPoints: 0.5 })),
    ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5b high', 'sonnet-5 high', 'opus-6 high', 'opus-6 xhigh'])
})

test('a row higher in intelligence by the minimum jump and dearer is a step of its own', () => {
  const dearer = row('zeta', 'high', 45, 1.5)
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, dearer], LAW)),
    ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5 high', 'zeta high', 'opus-6 high', 'opus-6 xhigh'])
})

test('a row under the minimum jump replaces the last rung, and the jump is checked against the rung before it', () => {
  // All rows cost the same, so none is dominated: only the jump decides.
  const table = [row('alpha', 'high', 8, 1), row('beta', 'high', 10, 1), row('gamma', 'high', 12, 1), row('delta', 'high', 13, 1)]
  assert.deepEqual(names(ladderFrom(table.slice(0, 3), LAW)), ['alpha high', 'beta high', 'gamma high'])
  // Delta is one point above gamma at the same cost: gamma goes, and delta is three points above beta, so beta stays.
  assert.deepEqual(names(ladderFrom(table, LAW)), ['alpha high', 'beta high', 'delta high'])
  assert.deepEqual(names(ladderFrom(table.slice(1), LAW)), ['beta high', 'delta high'])
})

test('equal cost prefers higher intelligence when the minimum jump is not met', () => {
  const table = [row('alpha', 'high', 10, 1), row('beta', 'high', 11, 1)]
  assert.deepEqual(names(ladderFrom(table, LAW)), ['beta high'])
  assert.deepEqual(names(ladderFrom([...table].reverse(), LAW)), ['beta high'])
})

test('integer hundredths make an exact 2.00 jump qualify', () => {
  const first = row('alpha', 'high', 10.104, 1)
  const second = row('beta', 'high', 12.103, 2)
  // Raw subtraction is below two; rounding each figure to hundredths gives 2.00.
  assert.ok(second.intelligence - first.intelligence < 2)
  assert.deepEqual(names(ladderFrom([first, second], LAW)), ['alpha high', 'beta high'])
  const below = { ...second, intelligence: first.intelligence + 1.99 }
  assert.deepEqual(names(ladderFrom([first, below], LAW)), ['alpha high'])
})

test('the efforts that are candidates are data, and the law changes neither the table nor the law', () => {
  const table = Object.freeze([...BASE, ...OPUS_6].map((r) => Object.freeze({ ...r })))
  const law = Object.freeze({ candidateEfforts: Object.freeze(['xhigh']), minJumpPoints: 2 })
  assert.deepEqual(names(ladderFrom(table, law)), ['haiku-5 xhigh', 'opus-6 xhigh'])
})

test('rows of another harness are not read', () => {
  const other = { ...row('opus-6', 'high', 99, 0.1), harness: 'agy' }
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, other], LAW)), names(ladderFrom([...BASE, ...OPUS_6], LAW)))
})

test('diffLadder names the step that is missing, extra or changed, and is empty when the two agree', () => {
  const law = [{ model: 'a', effort: 'high' }, { model: 'b', effort: 'high' }, { model: 'b', effort: 'xhigh' }]
  assert.deepEqual(diffLadder(law, law), [])
  assert.deepEqual(diffLadder([law[0], law[2]], law), ['changed rung 2: stored b xhigh, the law gives b high', 'missing rung 3: b xhigh'])
  assert.deepEqual(diffLadder(law, [law[0]]), ['extra rung 2: b high', 'extra rung 3: b xhigh'])
})
