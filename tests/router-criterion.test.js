'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crit = require('../plugins/aether/lib/router-criterion.js')

const criterion = crit.loadCriterion()
const answers = (over = {}) => ({
  shape: { choice: 'explore', confidence: 0.95 },
  stakes: { score: 1.1, confidence: 0.95 },
  reads_a_lot: { score: 0.5, confidence: 0.9 },
  pinned_by_checks: { noul: 0.2, confidence: 0.9 },
  needs_judgment: { noul: 0.3, confidence: 0.9 },
  edits_files: { noul: 0.03, confidence: 0.95 },
  many_steps: { noul: 0.1, confidence: 0.9 },
  ...over,
})
const shape = (choice, confidence = 0.95) => ({ shape: { choice, confidence } })

test('the committed criterion is valid and asks the seven questions of the evidence (R3)', () => {
  assert.deepEqual(crit.validateCriterion(criterion), [])
  assert.deepEqual(Object.keys(criterion.questions), crit.QUESTION_IDS)
  assert.deepEqual(Object.keys(criterion.questions.shape.criteria), ['lookup', 'explore', 'survey', 'mechanical_edit', 'implement', 'debug', 'audit', 'design', 'evaluate', 'other'])
  assert.equal(criterion.questions.shape.criteria.other, null)
  assert.equal(criterion.questions.stakes.criteria.length, 4)
  assert.equal(criterion.questions.edits_files.type, 'noul')
  assert.equal(criterion.deciderTimeoutMs, undefined, 'the time limits are options (R11)')
  assert.equal(criterion.standardRung, undefined, 'the fallback rung is an option (R11)')
  assert.equal(typeof criterion.about, 'string')
})

test('validateCriterion names each problem', () => {
  const bad = (change) => crit.validateCriterion(change(structuredClone(criterion)))
  assert.ok(bad((c) => { delete c.base.survey; return c }).some((p) => p.includes('survey')))
  assert.ok(bad((c) => { c.base.lookup = 'E'; return c }).some((p) => p.includes('lookup')))
  assert.ok(bad((c) => { c.adjust[0].question = 'nope'; return c }).some((p) => p.includes('nope')))
  assert.ok(bad((c) => { c.gates = ['audit', 'banana']; return c }).some((p) => p.includes('banana')))
  assert.throws(() => crit.loadCriterion('/nonexistent/criterion.json'))
})

test('a base level, with no adjustment, no gate and a clear answer', () => {
  const d = crit.decide(criterion, answers(), { floor: 'C' })
  assert.equal(d.level, 'B')
  assert.equal(d.decidedLevel, 'B')
  assert.equal(d.axis, 'general')
  assert.equal(d.readOnly, true)
  assert.deepEqual(d.flags, { lowConfidence: false, incoherent: false, gate: false })
  assert.equal(d.confidence, 0.95)
  assert.ok(d.reason.includes('explore'))
  assert.ok(d.reason.includes('base B'))
})

test('a task that edits or tests uses the code axis (R14); one that reads uses general intelligence', () => {
  assert.equal(crit.axisOf(criterion, answers(shape('implement'))), 'code')
  assert.equal(crit.axisOf(criterion, answers(shape('debug'))), 'code')
  assert.equal(crit.axisOf(criterion, answers(shape('audit'))), 'general')
  assert.equal(crit.axisOf(criterion, answers(shape('banana'))), 'general')
  assert.equal(crit.decide(criterion, answers(shape('implement', 0.9)), { floor: 'A' }).axis, 'code')
})

test('high stakes and many steps each raise the level one step, and the level stops at D', () => {
  const stakes = answers({ ...shape('audit'), stakes: { score: 2.74, confidence: 0.95 } })
  assert.equal(crit.decide(criterion, stakes, { floor: 'A' }).level, 'C')
  const both = answers({ ...shape('lookup'), stakes: { score: 2.6, confidence: 0.95 }, many_steps: { noul: 0.9, confidence: 0.9 } })
  assert.equal(crit.decide(criterion, both, { floor: 'A' }).level, 'C')
  const top = answers({ ...shape('design'), stakes: { score: 2.9, confidence: 0.95 }, many_steps: { noul: 0.9, confidence: 0.9 } })
  assert.equal(crit.decide(criterion, top, { floor: 'A' }).level, 'D')
})

test('a quality gate never goes below the level the Lead asked (R6, scenario 7)', () => {
  const audit = answers(shape('audit'))
  const kept = crit.decide(criterion, audit, { floor: 'D' })
  assert.equal(kept.level, 'D')
  assert.equal(kept.decidedLevel, 'B')
  assert.equal(kept.flags.gate, true)
  assert.ok(kept.reason.includes('gate'))
  assert.equal(crit.decide(criterion, answers(shape('evaluate')), { floor: 'C' }).level, 'C')
  assert.equal(crit.decide(criterion, audit, { floor: 'A' }).level, 'B', 'a gate may go up on its own')
  assert.equal(crit.decide(criterion, answers(shape('lookup')), { floor: 'D' }).level, 'A', 'a task that is not a gate may go down')
})

test('low confidence does not go below the Lead (R4, scenario 15)', () => {
  const vague = answers({ ...shape('other', 0.3), stakes: { score: 1, confidence: 0.2 } })
  const d = crit.decide(criterion, vague, { floor: 'C' })
  assert.equal(d.level, 'C')
  assert.equal(d.flags.lowConfidence, true)
  assert.equal(d.readOnly, false)
  assert.ok(d.reason.includes('low confidence'))
  assert.equal(crit.decide(criterion, answers(shape('survey', 0.48)), { floor: 'C' }).flags.lowConfidence, true)
  assert.equal(crit.decide(criterion, answers({ stakes: { score: 1, confidence: 0.45 } }), { floor: 'C' }).flags.lowConfidence, false)
  assert.equal(crit.decide(criterion, answers({ stakes: { score: 1, confidence: 0.39 } }), { floor: 'C' }).flags.lowConfidence, true)
})

test('an incoherent answer keeps the Lead level (R4)', () => {
  const cases = [
    answers(shape('banana')),
    (() => { const a = answers(); delete a.stakes; return a })(),
    answers({ stakes: { score: 7, confidence: 0.9 } }),
    answers({ edits_files: { noul: 1.4, confidence: 0.9 } }),
    answers({ many_steps: { noul: 0.1, confidence: 1.5 } }),
    answers({ stakes: { score: 'high', confidence: 0.9 } }),
  ]
  for (const bad of cases) {
    assert.equal(typeof crit.checkAnswers(criterion, bad), 'string')
    const d = crit.decide(criterion, bad, { floor: 'C' })
    assert.equal(d.level, 'C')
    assert.equal(d.flags.incoherent, true)
    assert.equal(d.decidedLevel, null)
    assert.equal(d.readOnly, false)
  }
  assert.equal(crit.checkAnswers(criterion, answers()), null)
})

test('read-only needs a low probability of editing and enough confidence in it', () => {
  assert.equal(crit.decide(criterion, answers({ edits_files: { noul: 0.6, confidence: 0.95 } }), { floor: 'C' }).readOnly, false)
  assert.equal(crit.decide(criterion, answers({ edits_files: { noul: 0.1, confidence: 0.4 } }), { floor: 'C' }).readOnly, false)
  assert.equal(crit.decide(criterion, answers({ edits_files: { noul: 0.49, confidence: 0.5 } }), { floor: 'C' }).readOnly, true)
})

test('decide refuses a floor that is not a level', () => {
  assert.throws(() => crit.decide(criterion, answers(), { floor: 'E' }))
  assert.throws(() => crit.decide(criterion, answers(), {}))
})
