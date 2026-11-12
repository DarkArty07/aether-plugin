'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadLadder, newState, effortFor, judge, stateOf } = require('../plugins/aether/lib/ladder.js')

const L = {
  law: { candidateEfforts: ['high', 'xhigh'], minJumpPoints: 2 },
  supervisorFloor: 3,
  repeatBlocked: 2,
  rungs: [
    { step: 'haiku-high', model: 'haiku', effort: 'high' },
    { step: 'haiku-xhigh', model: 'haiku', effort: 'xhigh' },
    { step: 'sonnet-high', model: 'sonnet', effort: 'high' },
    { step: 'opus-high', model: 'opus', effort: 'high' },
    { step: 'opus-xhigh', model: 'opus', effort: 'xhigh' },
  ],
}
const fix = (file, what) => ({ kind: 'fix', findings: [{ file, what }] })
const OUT = (file) => fix(file, 'changes outside Owns')

test('every rejected attempt rises one rung with that rung\'s effort, and the fifth leaves the task exhausted', () => {
  let state = newState(L)
  const seen = []
  for (let n = 1; n <= 5; n++) {
    const answer = judge(state, fix(`src/f${n}.js`, `missing case ${n}`), L)
    assert.equal(answer.accepted, true)
    state = answer.state
    seen.push([answer.next.kind, answer.next.cause, answer.next.step, answer.next.effort])
  }
  assert.deepEqual(seen, [
    ['rise', 'failed', 'haiku-xhigh', 'xhigh'], ['rise', 'failed', 'sonnet-high', 'high'], ['rise', 'failed', 'opus-high', 'high'],
    ['rise', 'failed', 'opus-xhigh', 'xhigh'], ['exhausted', 'exhausted', null, null],
  ])
  assert.deepEqual([state.status, state.attempts], ['exhausted', 5])
  assert.equal(judge(state, { kind: 'approve' }, L).accepted, false)
})

test('the same findings twice are two rises, not a block: there is no rise by repeated findings any more', () => {
  const a = judge(newState(L), fix('src/a.js', 'missing case'), L)
  const b = judge(a.state, fix('src/a.js', 'missing case'), L)
  assert.deepEqual([a.next.step, b.next.step, b.next.cause], ['haiku-xhigh', 'sonnet-high', 'failed'])
})

test('infeasible with a reason rises one rung; without a reason it is refused', () => {
  assert.equal(judge(newState(L), { kind: 'infeasible' }, L).accepted, false)
  const answer = judge(newState(L), { kind: 'infeasible', reason: 'the brief asks for a file nobody owns' }, L)
  assert.deepEqual([answer.next.kind, answer.next.cause, answer.next.step], ['rise', 'infeasible', 'haiku-xhigh'])
})

test('the same change outside Owns twice blocks the task on the rung it is on, across a rise', () => {
  const first = judge(newState(L), OUT('tests/x.test.js'), L)
  assert.equal(first.next.kind, 'rise')
  const second = judge(first.state, OUT('tests/x.test.js'), L)
  assert.deepEqual([second.next.kind, second.next.cause, second.state.status, second.state.step], ['blocked', 'blocked-outside-owns', 'blocked', 'haiku-xhigh'])
  assert.match(second.next.reason, /outside Owns/)
})

test('a change outside Owns in two different files is two rises, and the repeat count is data', () => {
  const first = judge(newState(L), OUT('tests/x.test.js'), L)
  assert.equal(judge(first.state, OUT('tests/y.test.js'), L).next.kind, 'rise')
  const loose = { ...L, repeatBlocked: 3 }
  const a = judge(newState(loose), OUT('tests/x.test.js'), loose)
  const b = judge(a.state, OUT('tests/x.test.js'), loose)
  assert.equal(b.next.kind, 'rise')
  assert.equal(judge(b.state, OUT('tests/x.test.js'), loose).next.kind, 'blocked')
})

test('the same gate evidence in two BLOCKED attempt reports blocks the task, with a rise between them (issue 188)', () => {
  // The key is the gate's red tests, not the sentence (see tests/ladder-blocked-key.test.js). The rise between the two
  // reports keeps blockedKey and blockedCount (rise spreads the state), so the second report still counts as a repeat.
  const RED = [{ file: 'npm test', what: 'falló: a' }]
  const attempt = (reason) => ({ kind: 'attempt', status: 'BLOCKED', reason, findings: RED })
  const first = judge(newState(L), attempt('the test I cannot touch fails'), L)
  assert.equal(first.next, null)
  const risen = judge(first.state, fix('src/a.js', 'missing case'), L)
  assert.equal(risen.next.step, 'haiku-xhigh')
  const second = judge(risen.state, attempt('a different wording of the same red test'), L)
  assert.deepEqual([second.next.kind, second.next.cause, second.state.status, second.state.step], ['blocked', 'blocked-same-cause', 'blocked', 'haiku-xhigh'])
})

test('the effort of a rung is the rung\'s, and stateOf folds the recorded verdicts from the rung a task starts on', () => {
  assert.equal(effortFor(L, 'sonnet-high'), 'high')
  assert.throws(() => effortFor(L, 'nope'), /unknown step nope/)
  const state = stateOf([fix('src/a.js', 'one'), fix('src/b.js', 'two')], L, 'sonnet-high')
  assert.deepEqual([state.step, state.attempts, state.status], ['opus-xhigh', 2, 'open'])
})

test('a missing repeatBlocked is refused, and invalid configured counts are rejected', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const write = (data) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aether-ladder-')), 'ladder.json')
    fs.writeFileSync(file, JSON.stringify(data))
    return file
  }
  const { repeatBlocked, ...withoutCount } = L
  assert.throws(() => loadLadder(write(withoutCount)), /ladder: missing repeatBlocked/)
  for (const bad of [0, -1, 1.5, 'two']) {
    assert.throws(() => loadLadder(write({ ...L, repeatBlocked: bad })), /ladder: repeatBlocked/, `${bad}`)
  }
})

test('an empty sentence is no reset of the BLOCKED streak: with no red test the key is one fixed value (issue 188)', () => {
  const blocked = (reason) => ({ kind: 'attempt', status: 'BLOCKED', reason, findings: [] })
  const first = judge(newState(L), blocked('the test I cannot touch fails'), L)
  assert.equal(first.next, null)
  const again = judge(first.state, blocked(''), L)
  assert.deepEqual([again.next.kind, again.next.cause], ['blocked', 'blocked-same-cause'])
  assert.equal(again.state.blockedCount, 2)
  // A DONE report (not BLOCKED) is what clears the streak: the workflow sends it as an attempt with that status.
  const cleared = judge(first.state, { kind: 'attempt', status: 'DONE', reason: '', findings: [] }, L)
  assert.deepEqual([cleared.state.blockedKey, cleared.state.blockedCount], [null, 0])
})

test('a ladder config missing supervisorFloor, repeatBlocked or law throws ladder: missing <name>', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const write = (data) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aether-ladder-')), 'ladder.json')
    fs.writeFileSync(file, JSON.stringify(data))
    return file
  }
  const { supervisorFloor, ...withoutFloor } = L
  assert.throws(() => loadLadder(write(withoutFloor)), /ladder: missing supervisorFloor/)
  const { repeatBlocked, ...withoutCount } = L
  assert.throws(() => loadLadder(write(withoutCount)), /ladder: missing repeatBlocked/)
  const { law, ...withoutLaw } = L
  assert.throws(() => loadLadder(write(withoutLaw)), /ladder: missing law/)
})

test('loadLadder reads the stored ladder and refuses a rung with no effort, an effort that does not exist and a repeated step', () => {
  const shipped = loadLadder()
  assert.deepEqual(shipped.rungs.map((r) => r.step), ['haiku-high', 'haiku-xhigh', 'sonnet-high', 'opus-high', 'opus-xhigh'])
  assert.deepEqual([shipped.repeatBlocked, shipped.supervisorFloor, shipped.law.minJumpPoints], [2, 3, 2])
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const write = (data) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aether-ladder-')), 'ladder.json')
    fs.writeFileSync(file, JSON.stringify(data))
    return file
  }
  assert.throws(() => loadLadder(write({ ...L, rungs: [{ step: 'a', model: 'a' }] })), /ladder: rungs\[0\]/)
  assert.throws(() => loadLadder(write({ ...L, rungs: [{ step: 'a', model: 'a', effort: 'huge' }] })), /effort/)
  assert.throws(() => loadLadder(write({ ...L, rungs: [L.rungs[0], L.rungs[0]] })), /same step/)
  assert.throws(() => loadLadder(write({ ...L, supervisorFloor: 0 })), /supervisorFloor/)
})
