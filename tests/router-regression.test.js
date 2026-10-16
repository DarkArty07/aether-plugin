'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crit = require('../plugins/aether/lib/router-criterion.js')

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'router', 'briefs.json'), 'utf8'))
const criterion = crit.loadCriterion()

test('there are 14 briefs, each with its recorded answers and its expected decision (R5)', () => {
  assert.equal(fixtures.length, 14)
  assert.equal(new Set(fixtures.map((f) => f.id)).size, 14)
  for (const f of fixtures) {
    assert.equal(f.source, 'synthetic')
    assert.ok(f.brief.description && f.brief.prompt, f.id)
    assert.ok(['A', 'B', 'C', 'D'].includes(f.floor), f.id)
    assert.deepEqual(Object.keys(f.expected).sort(), ['axis', 'gate', 'incoherent', 'level', 'lowConfidence', 'readOnly'], f.id)
  }
})

test('the committed criterion gives every brief the decision expected of it (R5)', () => {
  assert.deepEqual(crit.regress(criterion, fixtures), [])
})

test('the expected decisions are the ones of the table of the task, brief by brief', () => {
  const by = Object.fromEntries(fixtures.map((f) => [f.id, f.expected]))
  assert.deepEqual(by['audit-legal'], { level: 'D', axis: 'general', readOnly: true, lowConfidence: false, incoherent: false, gate: true })
  assert.deepEqual(by['vague-thoughts'], { level: 'C', axis: 'general', readOnly: false, lowConfidence: true, incoherent: false, gate: false })
  assert.deepEqual(by['incoherent-shape'], { level: 'C', axis: 'general', readOnly: false, lowConfidence: false, incoherent: true, gate: false })
  assert.deepEqual(by['rename-calls'], { level: 'A', axis: 'code', readOnly: false, lowConfidence: false, incoherent: false, gate: false })
  assert.deepEqual(by['lookup-big'], { level: 'C', axis: 'general', readOnly: true, lowConfidence: false, incoherent: false, gate: false })
})

test('changing the criterion moves a decision, and the regression says which (C2, scenario 12)', () => {
  const noAdjust = { ...structuredClone(criterion), adjust: [] }
  const moved = crit.regress(noAdjust, fixtures)
  assert.ok(moved.length >= 4, moved.join('\n'))
  assert.ok(moved.some((line) => line.startsWith('implement-endpoint:')))
  const surveyUp = structuredClone(criterion)
  surveyUp.base.survey = 'C'
  assert.ok(crit.regress(surveyUp, fixtures).some((line) => line.startsWith('survey-vendors:')))
  const noGate = { ...structuredClone(criterion), gates: [] }
  assert.ok(crit.regress(noGate, fixtures).some((line) => line.startsWith('grade-interviews:') || line.startsWith('audit-legal:')))
})
