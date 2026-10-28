'use strict'

// Issue #112: a test run that the gate cut at its time limit is a correction, never a repeated finding.

const test = require('node:test')
const assert = require('node:assert/strict')
const ladder = require('../plugins/aether/lib/ladder.js')

const L = ladder.loadLadder()
const [HAIKU, SONNET] = L.rungs
const F = (n) => ({ file: `src/f${n}.js`, line: n, what: `missing case ${n}` })
const fix = (...findings) => ({ kind: 'fix', findings, reason: null, fromScratch: false })
const CUT = { file: 'npm test', what: 'superó el tiempo límite' }

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

test('two cuts in a row are two corrections on the same rung, never a rise', () => {
  const answers = run([fix(CUT), fix(CUT)])
  assert.deepEqual(answers.map((a) => [a.next.kind, a.next.step, a.next.cause]), [['fix', HAIKU.step, 'fix'], ['fix', HAIKU.step, 'fix']])
  assert.equal(answers[1].state.correctionsUsed, 2)
  assert.equal(answers[1].state.repeats, 0)
})

test('many cuts in a row spend the corrections and then rise by the cap, not by the repeat rule', () => {
  const answers = run(Array.from({ length: HAIKU.corrections + 1 }, () => fix(CUT)))
  assert.ok(answers.slice(0, HAIKU.corrections).every((a) => a.next.kind === 'fix'))
  assert.deepEqual([answers.at(-1).next.kind, answers.at(-1).next.cause], ['rise', 'exhausted'])
})

test('a cut does not start a streak: the same real finding after a cut is the first of its run', () => {
  const [, second] = run([fix(CUT), fix(F(1))])
  assert.equal(second.next.kind, 'fix')
  assert.equal(second.state.repeats, 1)
})

test('the same real finding twice in a row still rises as before', () => {
  const [, second] = run([fix(F(1)), fix(F(1))])
  assert.deepEqual([second.next.kind, second.next.step, second.next.cause], ['rise', SONNET.step, 'repeated'])
})

test('a cut between two verdicts with the same real finding does not hide the repetition', () => {
  // The cut is noise: it spends a correction but neither counts as a repeat nor breaks the run of F(1).
  const answers = run([fix(F(1)), fix(CUT), fix(F(1))])
  assert.deepEqual([answers[1].next.kind, answers[1].state.repeats], ['fix', 1])
  assert.deepEqual([answers[2].next.kind, answers[2].next.step, answers[2].next.cause], ['rise', SONNET.step, 'repeated'])
})

test('a cut mixed with a real finding keeps the real finding\'s repeat count', () => {
  const [, second] = run([fix(F(1), CUT), fix(F(1), CUT)])
  assert.deepEqual([second.next.kind, second.next.step, second.next.cause], ['rise', SONNET.step, 'repeated'])
  // The cut in one verdict is not a different finding from the other: F(1) alone, then F(1) with the cut, still repeat.
  const [, mixed] = run([fix(F(1)), fix(F(1), CUT)])
  assert.equal(mixed.next.cause, 'repeated')
  // A mixed verdict with another real finding is not a repeat, cut or no cut.
  assert.equal(run([fix(F(1), CUT), fix(F(2), CUT)])[1].next.kind, 'fix')
})

test('a cut is recognized however the verdict writes it: case and spacing do not matter', () => {
  const spaced = { file: 'npm   test', what: 'Superó  el tiempo límite' }
  const [, second] = run([fix(spaced), fix(CUT)])
  assert.equal(second.next.kind, 'fix')
  assert.notEqual(second.next.cause, 'repeated')
})

test('a cut-only verdict on a ladder with repeatFindings 0 still does not rise by the repeat rule', () => {
  const zero = { ...L, repeatFindings: 0 }
  assert.deepEqual([run([fix(CUT)], zero)[0].next.kind, run([fix(CUT)], zero)[0].next.cause], ['fix', 'fix'])
})
