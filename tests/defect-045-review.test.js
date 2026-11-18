'use strict'

// R8: the cap of 10 minors rules the whole sliced review, and REVIEW_FINDINGS
// extends FINDINGS with fix (in run.workflow.js and in lib/lane-schemas.js).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, PLUGIN } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

// One task per area: one slice per task, in task order.
const slicedArgs = (t, count) => compile(makeRepo(t), plan(Array.from({ length: count }, (_, i) => task(i + 1, { area: `a${i + 1}` }))))

// Runs the sliced final review with one canned slice answer per slice, in slice
// order. `slices[i]` is the findings list the i-th slice reports.
async function runSlicedReview(t, slices) {
  const run = await runWorkflow(slicedArgs(t, slices.length), {
    reviewer: (call) => {
      const m = /slice (\d+)\//.exec(call.label || '')
      const n = m ? Number(m[1]) : call.n
      return { verdict: 'ready-with-fixes', findings: slices[n - 1], declined: [], summary: `slice ${n}` }
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(run.result.finalReview.slices, slices.length)
  return run.result
}

const minor = (n, i) => ({ severity: 'minor', title: `s${n}-minor-${i + 1}`, file: 'a.js', evidence: 'e', fix: 'f' })
const important = (n) => ({ severity: 'important', title: `s${n}-important`, file: 'a.js', evidence: 'e', fix: 'f' })

test('R8: four slices of six minors and one important give four importants, ten minors and minorsOmitted 14', async (t) => {
  const slice = (n) => ({
    verdict: 'ready-with-fixes',
    summary: `slice ${n}`,
    findings: [...Array.from({ length: 6 }, (_, i) => minor(n, i)), important(n)],
  })
  const result = await runSlicedReview(t, [1, 2, 3, 4].map(slice).map((s) => s.findings))
  const f = result.finalReview
  assert.deepEqual(
    f.findings.filter((x) => x.severity === 'important').map((x) => x.title),
    ['s1-important', 's2-important', 's3-important', 's4-important'],
  )
  const minors = f.findings.filter((x) => x.severity === 'minor').map((x) => x.title)
  assert.equal(minors.length, 10)
  assert.deepEqual(minors.slice(0, 6), ['s1-minor-1', 's1-minor-2', 's1-minor-3', 's1-minor-4', 's1-minor-5', 's1-minor-6'])
  assert.deepEqual(minors.slice(6), ['s2-minor-1', 's2-minor-2', 's2-minor-3', 's2-minor-4'])
  assert.equal(f.minorsOmitted, 14)
  assert.ok(f.summary.includes('14 minor findings were omitted'))
})

test('R8: with ten minors or fewer minorsOmitted is absent', async (t) => {
  const two = [1, 2].map((n) => Array.from({ length: 3 }, (_, i) => minor(n, i)))
  const result = await runSlicedReview(t, two)
  const f = result.finalReview
  assert.equal(f.findings.filter((x) => x.severity === 'minor').length, 6)
  assert.ok(!('minorsOmitted' in f), 'minorsOmitted must be absent')
  assert.ok(!f.summary.includes('minor findings were omitted'))
  assert.equal(f.summary, 'Slice 1 (task-1): slice 1\nSlice 2 (task-2): slice 2')
})

test('R8: REVIEW_FINDINGS is FINDINGS plus fix, in both files', () => {
  const workflowSource = fs.readFileSync(path.join(PLUGIN, 'workflows', 'run.workflow.js'), 'utf8')
  const laneSource = fs.readFileSync(path.join(PLUGIN, 'lib', 'lane-schemas.js'), 'utf8')
  const workflowBlock = workflowSource.slice(workflowSource.indexOf('const FINDINGS = {'), workflowSource.indexOf('const OPS_SCHEMA = {'))
  const laneBlock = laneSource.slice(laneSource.indexOf('const FINDINGS = {'), laneSource.indexOf('const JUDGE_SCHEMA = {'))
  const reviewBlockOf = (source) => source.slice(source.indexOf('const REVIEW_FINDINGS = {'), source.indexOf('const IMPLEMENTER_SCHEMA = {'))
  // REVIEW_FINDINGS extends FINDINGS with fix: built by spreading FINDINGS, never rewritten by hand.
  for (const [name, source] of [['run.workflow.js', workflowSource], ['lane-schemas.js', laneSource]]) {
    const block = reviewBlockOf(source)
    assert.ok(block.includes('...FINDINGS'), `${name}: REVIEW_FINDINGS spreads FINDINGS`)
    assert.ok(block.includes('...FINDINGS.items'), `${name}: REVIEW_FINDINGS spreads FINDINGS.items`)
    assert.ok(block.includes("...FINDINGS.items.required, 'fix'"), `${name}: REVIEW_FINDINGS extends required with fix`)
    assert.ok(block.includes('...FINDINGS.items.properties'), `${name}: REVIEW_FINDINGS spreads FINDINGS.items.properties`)
  }
  const workflow = new Function(`${workflowBlock}; return { FINDINGS, REVIEW_FINDINGS }`)()
  const lane = new Function(`${laneBlock}; return { FINDINGS, REVIEW_FINDINGS }`)()
  for (const [name, schemas] of [['run.workflow.js', workflow], ['lane-schemas.js', lane]]) {
    assert.deepEqual(schemas.REVIEW_FINDINGS.items.properties, { ...schemas.FINDINGS.items.properties, fix: schemas.REVIEW_FINDINGS.items.properties.fix }, name)
    assert.ok(schemas.REVIEW_FINDINGS.items.properties.fix, `${name}: fix property`)
    assert.equal(schemas.REVIEW_FINDINGS.items.properties.fix.type, 'string', name)
    assert.deepEqual(schemas.REVIEW_FINDINGS.items.required, [...schemas.FINDINGS.items.required, 'fix'], name)
  }
  assert.deepEqual(lane.REVIEW_FINDINGS, workflow.REVIEW_FINDINGS)
})
