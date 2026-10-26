'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const ladder = require('../plugins/aether/lib/ladder.js')

const L = ladder.loadLadder()
const F = (n) => ({ file: `src/f${n}.js`, line: n, what: `missing case ${n}` })
const fix = (...ns) => ({ kind: 'fix', findings: ns.map(F), reason: null, fromScratch: false })
const APPROVE = { kind: 'approve', findings: [], reason: null, fromScratch: false }

// Judges the verdicts in order, each on the state the one before left; returns every answer.
function run(verdicts, ladderValue = L) {
  let state = ladder.newState(ladderValue)
  return verdicts.map((verdict) => {
    const answer = ladder.judge(state, verdict, ladderValue)
    if (answer.accepted) state = answer.state
    return answer
  })
}

test('the shipped file holds the numbers the owner approved (R15, D1, D7)', () => {
  assert.deepEqual(L.rungs.map((r) => [r.step, r.model, r.corrections]), [['haiku', 'haiku', 5], ['sonnet', 'sonnet', 2], ['opus', 'opus', 1]])
  assert.equal(L.repeatFindings, 2)
  assert.equal(ladder.effortFor(L, 'haiku', 'first'), 'high')
  assert.equal(ladder.effortFor(L, 'haiku', 'fix'), 'xhigh')
  assert.equal(ladder.effortFor(L, 'sonnet', 'fix'), 'high')
  assert.equal(ladder.effortFor(L, 'sonnet', 'rise'), 'high')
  assert.equal(ladder.effortFor(L, 'opus', 'fix'), 'high')
  assert.equal(ladder.effortFor(L, 'opus', 'rise'), 'high')
})

test('Haiku has five corrections, and the step rises right after the fifth (C2)', () => {
  const answers = run([1, 2, 3, 4, 5, 6].map((n) => fix(n)))
  assert.deepEqual(answers.slice(0, 5).map((a) => [a.next.kind, a.next.step]), Array(5).fill(['fix', 'haiku']))
  assert.equal(answers[4].state.correctionsUsed, 5)
  assert.deepEqual([answers[5].next.kind, answers[5].next.step, answers[5].next.cause], ['rise', 'sonnet', 'exhausted'])
  assert.equal(answers[5].next.effort, 'high')
  assert.equal(answers[5].next.carry, true)
})

test('Sonnet has two corrections and Opus one; after Opus there is no fourth step (C2, C5, E8)', () => {
  const answers = run(Array.from({ length: 11 }, (_, n) => fix(n + 1)))
  assert.equal(answers[5].next.step, 'sonnet')
  assert.deepEqual(answers.slice(6, 8).map((a) => a.next.kind), ['fix', 'fix'])
  assert.deepEqual([answers[8].next.kind, answers[8].next.step], ['rise', 'opus'])
  assert.deepEqual([answers[9].next.kind, answers[9].next.step], ['fix', 'opus'])
  assert.deepEqual([answers[10].next.kind, answers[10].next.step, answers[10].state.status], ['exhausted', null, 'exhausted'])
  assert.equal(ladder.judge(answers[10].state, fix(12), L).accepted, false)
})

test('the same findings twice in a row rise, though corrections are left (C3, E4)', () => {
  const [first, second] = run([fix(1), fix(1)])
  assert.equal(first.next.kind, 'fix')
  assert.deepEqual([second.next.kind, second.next.step, second.next.cause], ['rise', 'sonnet', 'repeated'])
  assert.equal(second.state.correctionsUsed, 0)
})

test('the same findings in another order or on another line are the same; one more finding is not', () => {
  assert.equal(run([fix(1, 2), fix(2, 1)])[1].next.cause, 'repeated')
  const moved = { ...fix(1), findings: [{ ...F(1), line: 99 }] }
  assert.equal(run([fix(1), moved])[1].next.cause, 'repeated')
  assert.equal(run([fix(1), fix(1, 2)])[1].next.kind, 'fix')
})

test('an infeasible declaration needs a written reason; without one it is rejected and the step does not move (C3, E6)', () => {
  const none = { kind: 'infeasible', findings: [], reason: null, fromScratch: false }
  const blank = { ...none, reason: '   ' }
  const [a, b, ok] = run([none, blank, { ...none, reason: 'the design is wrong for this model' }])
  assert.equal(a.accepted, false)
  assert.equal(b.accepted, false)
  assert.match(a.error, /reason/)
  assert.deepEqual([ok.accepted, ok.next.kind, ok.next.step, ok.next.cause], [true, 'rise', 'sonnet', 'infeasible'])
})

test('starting from scratch needs a reason and drops the carry; a plain rise carries the work (C4, E7)', () => {
  const scratch = { kind: 'infeasible', findings: [], reason: 'wrong approach', fromScratch: true }
  const [rejected, accepted] = run([{ ...scratch, reason: null }, scratch])
  assert.equal(rejected.accepted, false)
  assert.equal(accepted.next.carry, false)
  assert.equal(run([{ ...scratch, fromScratch: false }])[0].next.carry, true)
})

test('a finding with no file or no what is not a correction (R2)', () => {
  assert.equal(ladder.judge(ladder.newState(L), { ...fix(1), findings: [{ file: '', line: 1, what: 'x' }] }, L).accepted, false)
  assert.equal(ladder.judge(ladder.newState(L), { ...fix(1), findings: [{ file: 'a.js', line: null, what: '' }] }, L).accepted, false)
  assert.equal(ladder.judge(ladder.newState(L), { ...fix(1), findings: [] }, L).accepted, false)
  assert.equal(ladder.judge(ladder.newState(L), { ...fix(1), findings: [{ file: 'a.js', line: null, what: 'no line is fine' }] }, L).accepted, true)
})

test('parseFinding', () => {
  assert.deepEqual(ladder.parseFinding('src/a.js:12: missing check'), { file: 'src/a.js', line: 12, what: 'missing check' })
  assert.deepEqual(ladder.parseFinding('src/a.js: missing check'), { file: 'src/a.js', line: null, what: 'missing check' })
  assert.equal(ladder.parseFinding('missing check'), null)
  assert.equal(ladder.parseFinding('src/a.js:12:'), null)
})

test('approve closes the task and nothing is accepted after it', () => {
  const [done, after] = run([APPROVE, fix(1)])
  assert.deepEqual([done.accepted, done.next.kind, done.state.status], [true, 'done', 'approved'])
  assert.equal(after.accepted, false)
})

test('the caps come from the file: a ladder with one correction each rises on the second fix (C11)', (t) => {
  const file = path.join(tempDir(t), 'ladder.json')
  const small = { rungs: L.rungs.map((r) => ({ ...r, corrections: 1 })), repeatFindings: 3 }
  fs.writeFileSync(file, JSON.stringify(small))
  const loaded = ladder.loadLadder(file)
  const [first, second] = run([fix(1), fix(2)], loaded)
  assert.deepEqual([first.next.kind, second.next.kind, second.next.cause], ['fix', 'rise', 'exhausted'])
  // the same findings twice, below repeatFindings 3, still spend the step's only correction: the cap rises, not the repeat rule
  const [one, again] = run([fix(1), fix(1)], loaded)
  assert.deepEqual([one.next.kind, again.next.kind, again.next.cause], ['fix', 'rise', 'exhausted'])
  const roomy = { rungs: L.rungs.map((r) => ({ ...r, corrections: 2 })), repeatFindings: 3 }
  assert.equal(run([fix(1), fix(1)], roomy)[1].next.kind, 'fix', 'repeatFindings 3 does not rise on two when the cap leaves room')
})

test('a ladder file with a missing step or a bad cap is refused', (t) => {
  const dir = tempDir(t)
  const bad = path.join(dir, 'bad.json')
  fs.writeFileSync(bad, JSON.stringify({ rungs: [{ step: 'haiku', model: 'haiku', corrections: -1, effort: { first: 'high', retry: 'xhigh' } }], repeatFindings: 2 }))
  assert.throws(() => ladder.loadLadder(bad))
})

test('stateOf folds the recorded inputs to the state the judging left', () => {
  const inputs = [1, 2, 3, 4, 5, 6, 7].map((n) => fix(n))
  const direct = run(inputs).at(-1).state
  assert.deepEqual(ladder.stateOf(inputs, L), direct)
  assert.equal(ladder.stateOf(inputs, L).step, 'sonnet')
})
