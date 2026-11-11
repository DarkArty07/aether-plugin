'use strict'

// Issue #112: a test run that the gate cut at its time limit is a normal failure, never a repeated finding.

const test = require('node:test')
const assert = require('node:assert/strict')
const ladder = require('../plugins/aether/lib/ladder.js')

const L = ladder.loadLadder()
const [R0, R1, R2] = L.rungs
const F = (n) => ({ file: `src/f${n}.js`, line: n, what: `missing case ${n}` })
const fix = (...findings) => ({ kind: 'fix', findings, reason: null, fromScratch: false })
const CUT = { file: 'npm test', what: 'superó el tiempo límite' }
const OUT = (file) => fix({ file, line: null, what: 'fuera de Owns' })

// Judges the verdicts in order, each on the state the one before left; returns every answer.
function run(verdicts, ladderValue = L) {
  let state = ladder.newState(ladderValue)
  return verdicts.map((verdict) => {
    const answer = ladder.judge(state, verdict, ladderValue)
    if (answer.accepted) state = answer.state
    return answer
  })
}

test('the gate cut is one named finding, and the gate and the ladder share it', () => {
  assert.deepEqual(ladder.GATE_CUT, CUT)
  assert.equal(Object.isFrozen(ladder.GATE_CUT), true)
})

test('two cuts in a row rise one rung each like any failed attempt, and do not block or count as a repeat', () => {
  const answers = run([fix(CUT), fix(CUT)])
  assert.deepEqual(answers.map((a) => [a.next.kind, a.next.step, a.next.cause]), [['rise', R1.step, 'failed'], ['rise', R2.step, 'failed']])
  assert.equal(answers[1].state.repeats, 0)
})

test('a cut does not start a streak: the same real finding after a cut is the first of its run', () => {
  const [, second] = run([fix(CUT), fix(F(1))])
  assert.equal(second.next.kind, 'rise')
  assert.equal(second.state.repeats, 1)
})

test('a cut between two verdicts with the same outside-Owns finding does not hide the repetition', () => {
  const answers = run([OUT('tests/a.test.js'), fix(CUT), OUT('tests/a.test.js')])
  assert.equal(answers[0].next.kind, 'rise')
  assert.equal(answers[1].next.kind, 'rise')
  assert.equal(answers[1].state.repeats, 1)
  assert.deepEqual([answers[2].next.kind, answers[2].next.cause, answers[2].state.status], ['blocked', 'blocked-outside-owns', 'blocked'])
})

test('a cut is recognized however the verdict writes it: case and spacing do not matter', () => {
  const spaced = { file: 'npm   test', what: 'Superó  el tiempo límite' }
  const [, second] = run([fix(spaced), fix(CUT)])
  assert.equal(second.next.kind, 'rise')
  assert.equal(second.state.repeats, 0)
})
