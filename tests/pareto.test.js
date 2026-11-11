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
// without an effort suffix the page is max); the code figure is the fraction times 100.
function tableOfEvidence() {
  const pages = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'))
  return Object.values(pages).map((page) => {
    const [, model, , , effort = 'max'] = page.slug.split('-')
    const code = page.evals['terminalbench-4-0']
    return {
      harness: 'claude', model, effort,
      intelligence: round(page.scalars.intelligenceIndex, 1),
      costPerTaskUsd: round(page.objects.intelligenceIndexCostPerTask.cost.total, 3),
      code: round(code.score * 100, 2),
      codeCostPerTaskUsd: round(code.costUsd, 3),
    }
  })
}

// A row of a sample table: model names that exist in no table of the project.
const row = (model, effort, intelligence, costPerTaskUsd, code, codeCostPerTaskUsd) =>
  ({ harness: 'claude', model, effort, intelligence, costPerTaskUsd, code, codeCostPerTaskUsd })
const BASE = [
  row('haiku-5', 'high', 20, 0.1, 10, 0.1),
  row('haiku-5', 'xhigh', 30, 0.2, 20, 0.2),
  row('sonnet-5', 'high', 40, 1, 35, 1),
  row('sonnet-5', 'xhigh', 50, 3, 45, 3),
]
const OPUS_6 = [row('opus-6', 'high', 62, 2, 60, 2.5), row('opus-6', 'xhigh', 70, 4, 66, 4.5)]

test('the law gives the five steps of the figures of 2026-11-10, each one up in code and in intelligence', () => {
  const rungs = ladderFrom(tableOfEvidence(), LAW)
  assert.deepEqual(names(rungs), ['haiku high', 'haiku xhigh', 'sonnet high', 'opus high', 'opus xhigh'])
  for (let i = 1; i < rungs.length; i++) {
    assert.ok(rungs[i].code > rungs[i - 1].code, `code up at ${i}`)
    assert.ok(rungs[i].intelligence > rungs[i - 1].intelligence, `intelligence up at ${i}`)
  }
})

test('sonnet xhigh is out: opus high gives more intelligence for less cost per task, though sonnet xhigh gives more code', () => {
  const table = tableOfEvidence()
  const get = (model, effort) => table.find((r) => r.model === model && r.effort === effort)
  assert.ok(get('opus', 'high').intelligence > get('sonnet', 'xhigh').intelligence)
  assert.ok(get('opus', 'high').costPerTaskUsd < get('sonnet', 'xhigh').costPerTaskUsd)
  assert.ok(get('sonnet', 'xhigh').code > get('opus', 'high').code)
  assert.ok(!names(ladderFrom(table, LAW)).includes('sonnet xhigh'))
})

test('a new Opus before the new Sonnet gives a ladder with five steps, with no code change', () => {
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6], LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5 high', 'opus-6 high', 'opus-6 xhigh'])
})

test('a new Sonnet before the new Opus gives another valid ladder, with four steps', () => {
  const table = [
    BASE[0], BASE[1],
    row('sonnet-6', 'high', 45, 1.2, 40, 1.2), row('sonnet-6', 'xhigh', 58, 2.5, 55, 2.8),
    row('opus-5', 'high', 52, 3.5, 50, 4), row('opus-5', 'xhigh', 57, 6, 54, 8),
  ]
  assert.deepEqual(names(ladderFrom(table, LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-6 high', 'sonnet-6 xhigh'])
})

test('a model with no code figures neither enters nor knocks anybody out, however good its intelligence', () => {
  const noCode = row('opus-7', 'high', 90, 0.5, null, null)
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, noCode], LAW)), names(ladderFrom([...BASE, ...OPUS_6], LAW)))
  const rows = ladderFrom([noCode, { ...noCode, code: undefined }], LAW)
  assert.deepEqual(rows, [])
})

test('a pair that is not up by the minimum jump in both figures does not make a step of its own: the cheaper stays', () => {
  // Intelligence 39 and code 34 at costs 0.9 and 0.95 against sonnet-5 high at 40 and 35 at cost 1: neither knocks the other out, and sonnet-5 high is up one point in both figures, so the cheaper stays.
  const nearer = row('sonnet-5b', 'high', 39, 0.9, 34, 0.95)
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, nearer], LAW)), ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5b high', 'opus-6 high', 'opus-6 xhigh'])
  // The minimum is data: with a minimum of 0.5 both stay, in the order of intelligence.
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, nearer], { ...LAW, minJumpPoints: 0.5 })),
    ['haiku-5 high', 'haiku-5 xhigh', 'sonnet-5b high', 'sonnet-5 high', 'opus-6 high', 'opus-6 xhigh'])
})

test('a pair that goes up in one figure and down in the other is not a step above: the cheaper stays', () => {
  const sideways = row('zeta', 'high', 45, 1.5, 30, 0.5)
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, sideways], LAW)), names(ladderFrom([...BASE, ...OPUS_6], LAW)))
})

test('the efforts that are candidates are data, and the law changes neither the table nor the law', () => {
  const table = Object.freeze([...BASE, ...OPUS_6].map((r) => Object.freeze({ ...r })))
  const law = Object.freeze({ candidateEfforts: Object.freeze(['xhigh']), minJumpPoints: 2 })
  assert.deepEqual(names(ladderFrom(table, law)), ['haiku-5 xhigh', 'opus-6 xhigh'])
})

test('rows of another harness are not read', () => {
  const other = { ...row('opus-6', 'high', 99, 0.1, 99, 0.1), harness: 'agy' }
  assert.deepEqual(names(ladderFrom([...BASE, ...OPUS_6, other], LAW)), names(ladderFrom([...BASE, ...OPUS_6], LAW)))
})

test('diffLadder names the step that is missing, extra or changed, and is empty when the two agree', () => {
  const law = [{ model: 'a', effort: 'high' }, { model: 'b', effort: 'high' }, { model: 'b', effort: 'xhigh' }]
  assert.deepEqual(diffLadder(law, law), [])
  assert.deepEqual(diffLadder([law[0], law[2]], law), ['changed rung 2: stored b xhigh, the law gives b high', 'missing rung 3: b xhigh'])
  assert.deepEqual(diffLadder(law, [law[0]]), ['extra rung 2: b high', 'extra rung 3: b xhigh'])
})

