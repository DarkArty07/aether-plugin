'use strict'

// Issue 188, first gap: a BLOCKED report is keyed by the evidence the gate found, not by the model's sentence.
// Each replay is the sequence the workflow sends to the ladder: an attempt verdict for a BLOCKED report (or for any
// report after one), then the gate's fix verdict when the gate found red tests.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { newState, judge } = require('../plugins/aether/lib/ladder.js')

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

// What the gate gives a red test: the file is 'npm test', not the file the test is in.
const red = (...names) => names.map((name) => ({ file: 'npm test', what: `falló: ${name}` }))
const blocked = (reason, findings = []) => ({ kind: 'attempt', status: 'BLOCKED', reason, findings })
const done = () => ({ kind: 'attempt', status: 'DONE', reason: '', findings: [] })
const fix = (findings) => ({ kind: 'fix', findings })

// Folds the inputs the way stateOf does, keeping every answer.
function replay(inputs) {
  let state = newState(L)
  const answers = []
  for (const input of inputs) {
    const answer = judge(state, input, L)
    answers.push(answer)
    assert.equal(answer.accepted, true, answer.error || answer.rejection)
    state = answer.state
  }
  return { state, answers, last: answers[answers.length - 1] }
}

test('case 1: three red tests found again under two BLOCKED sentences block the unit on sonnet-high, never Opus', () => {
  const RED3 = red('a', 'b', 'c')
  const { state, answers, last } = replay([
    fix(RED3), // attempt 1, DONE_WITH_CONCERNS, gate finds the three red tests: rise to haiku-xhigh
    blocked('the failing tests are in a file I do not own', RED3), // attempt 2, BLOCKED
    fix(RED3), // gate finds the same three: rise to sonnet-high
    blocked('cannot make the suite green inside my Owns', RED3), // attempt 3, BLOCKED, another wording
  ])
  assert.deepEqual([answers[0].next.step, answers[2].next.step], ['haiku-xhigh', 'sonnet-high'])
  assert.deepEqual([last.next.kind, last.next.cause, last.next.step], ['blocked', 'blocked-same-cause', null])
  assert.deepEqual([state.status, state.step], ['blocked', 'sonnet-high'])
  assert.equal(answers.some((a) => a.state && a.state.step && a.state.step.startsWith('opus')), false)
})

test('case 2: a single red test under a different BLOCKED sentence each time blocks after the second attempt', () => {
  const ONE = red('a')
  const { answers, last } = replay([
    blocked('the test is not mine', ONE),
    fix(ONE),
    blocked('a fixture I cannot write', ONE),
  ])
  assert.deepEqual([last.next.kind, last.next.cause, last.state.status], ['blocked', 'blocked-same-cause', 'blocked'])
  assert.equal(answers[0].next, null, 'the first BLOCKED report does not block')
})

test('case 3: two BLOCKED reports with different sentences and no gate findings block after the second', () => {
  const { answers, last } = replay([
    blocked('the spec and the test disagree'),
    blocked('I need the API of another unit'),
  ])
  assert.equal(answers[0].next, null)
  assert.deepEqual([last.next.kind, last.next.cause], ['blocked', 'blocked-same-cause'])
})

test('case 3b: an empty sentence is no reset any more: two empty BLOCKED reports block too', () => {
  const { state, last } = replay([blocked(''), blocked('')])
  assert.deepEqual([last.next.cause, state.status], ['blocked-same-cause', 'blocked'])
})

test('case 4: two BLOCKED reports whose gate findings differ are two different causes, so the count starts again', () => {
  const { state, last } = replay([
    blocked('cannot run it', red('a')),
    fix(red('a')),
    blocked('cannot run it', red('b')),
  ])
  assert.deepEqual([last.next, last.state.status, last.state.blockedCount], [null, 'open', 1])
  assert.equal(state.blockedCount, 1)
})

test('case 5: a DONE attempt the gate rejects between two BLOCKED reports starts the count again, as the workflow sends it', () => {
  // The existing rule (tests/ladder.test.js, "with a rise between them"): a rise keeps blockedKey and blockedCount,
  // so two BLOCKED reports with a fix verdict between them still block. The workflow sends an attempt verdict for a
  // DONE report too (previousBlocked), and that verdict clears the streak; so here the second BLOCKED is count 1.
  const RED = red('a')
  const { state, last } = replay([
    blocked('the test is not mine', RED),
    done(),
    fix(RED),
    blocked('the test is not mine', RED),
  ])
  assert.equal(last.next, null)
  assert.deepEqual([state.status, state.blockedCount], ['open', 1])
})

test('the sentence lives in its own state field, and the key is the evidence, not the sentence', () => {
  const { state, last } = replay([blocked('  Cannot   touch it ', red('a'))])
  assert.equal(state.blockedReason, 'Cannot   touch it')
  assert.equal(state.blockedKey.includes('cannot'), false)
  assert.equal(last.state.blockedKey, 'npm test|falló: a')
})

test('a BLOCKED report whose gate cut only (no red test) has the one fixed key, whatever the sentence', () => {
  const CUT = [{ file: 'npm test', what: 'superó el tiempo límite' }]
  const first = replay([blocked('a', CUT)]).state.blockedKey
  const second = replay([blocked('b')]).state.blockedKey
  assert.equal(first, second)
  assert.equal(replay([blocked('a', CUT), blocked('b', CUT)]).last.next.cause, 'blocked-same-cause')
})

// The command, not the pure judge: the bin reads the payload file the ops agent's prompt carries, checks its digest and
// hands the findings to judge. With one sentence in both reports, only the findings tell two causes apart, so the second
// case fails if a field is dropped on the way.
function setup(t) {
  const repo = makeRepo(t)
  return { repo, args: compile(repo, plan([task(1), task(2)])) }
}

function attemptThroughBin(s, body) {
  const dir = path.join(s.args.runDir, 'ladder')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'task-1-verdict.json')
  const text = JSON.stringify(body)
  fs.writeFileSync(file, text)
  const r = runBin(WT_BIN, ['ladder', s.args.runId, 'task-1', '--verdict', 'attempt', '--payload', file, '--digest', lanes.digest(text)], s.repo.dir)
  assert.equal(r.status, 0, r.stdout)
  return r.json
}

test('through the bin, a BLOCKED attempt is keyed by its findings: the same red test under two sentences blocks the unit', (t) => {
  const s = setup(t)
  const RED = [{ file: 'npm test', what: 'falló: a' }]
  const first = attemptThroughBin(s, { status: 'BLOCKED', reason: 'the test is not mine', findings: RED })
  assert.deepEqual([first.accepted, first.status, first.blockedCount], [true, 'open', 1])
  const second = attemptThroughBin(s, { status: 'BLOCKED', reason: 'a fixture I cannot write', findings: RED })
  assert.deepEqual([second.status, second.cause, second.reason], ['blocked', 'blocked-same-cause', 'a fixture I cannot write'])
})

test('through the bin, the same sentence under different red tests is two causes, and the unit is not blocked', (t) => {
  const s = setup(t)
  attemptThroughBin(s, { status: 'BLOCKED', reason: 'cannot run it', findings: [{ file: 'npm test', what: 'falló: a' }] })
  const second = attemptThroughBin(s, { status: 'BLOCKED', reason: 'cannot run it', findings: [{ file: 'npm test', what: 'falló: b' }] })
  assert.deepEqual([second.status, second.blockedCount], ['open', 1])
})
