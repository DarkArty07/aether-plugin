'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { choose } = require('../plugins/aether/lib/superdelegation.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const claude = (model, effort, intelligence, code, cost = 1) => ({
  id: `claude/${model}@${effort}`, slug: `claude-${model}-${effort}`, harness: 'claude', model, family: `claude-${model}`, effort, group: null,
  intelligence, costPerTaskUsd: cost, outputTokensPerSecond: null, timeToFirstTokenS: null, code, codeCostPerTaskUsd: 1, codeMinutesPerTask: 1,
})
const ext = (effort, intelligence, cost, code) => ({
  id: `agy/m@${effort}`, slug: `m-${effort}`, harness: 'agy', model: 'm', family: 'm', effort, group: 'g',
  intelligence, costPerTaskUsd: cost, outputTokensPerSecond: null, timeToFirstTokenS: null,
  ...(code === undefined ? {} : { code, codeCostPerTaskUsd: 1, codeMinutesPerTask: 1 }),
})
const LANES = { harnesses: { agy: { models: { m: { roles: ['implementer', 'supervisor', 'reviewer', 'judge'] } } } } }
const view = (state) => ({ agy: { installed: true, groups: { g: state } } })
const OPEN = { usable: true, unknown: false, mark: null, resetsAt: '2026-11-20T00:00:00Z' }
const DRY = { usable: false, unknown: false, mark: null, resetsAt: '2026-11-20T00:00:00Z' }
// The reference: Sonnet high, 41.1 points and 43.94 in code, so the floors are 40.1 and 42.9.
const SONNET = claude('sonnet', 'high', 41.1, 43.94)
const ask = (rows, over = {}) => choose({ pairs: [SONNET, ...rows], reference: { model: 'sonnet', effort: 'high' }, harnesses: view(OPEN), lanes: LANES, role: 'implementer', ...over })
const why = (decision, id) => decision.candidates.find((c) => c.id === id).why

test('an implementer call leaves out a pair that reaches the points but not the code floor, and says why', () => {
  const decision = ask([ext('medium', 41.2, 0.5, 29.29), ext('high', 50.8, 1.8, 54.04)])
  assert.equal(decision.picked.id, 'agy/m@high')
  assert.equal(why(decision, 'agy/m@medium'), 'below-code')
  assert.match(decision.reason, /; below the code floor of 42\.9 \(the reference's code 43\.94 minus 1\): agy\/m@medium/)
})

test('the code floor is the code of the reference minus one point, in tenths: 42.9 passes and 42.8 does not', () => {
  assert.equal(why(ask([ext('medium', 45, 0.5, 42.9)]), 'agy/m@medium'), null)
  assert.equal(why(ask([ext('medium', 45, 0.5, 42.8)]), 'agy/m@medium'), 'below-code')
})

test('a pair with no code figure is judged by intelligence alone, and the reason says so', () => {
  const decision = ask([ext('medium', 45, 0.5)])
  assert.equal(decision.picked.id, 'agy/m@medium')
  assert.match(decision.reason, /; agy\/m@medium has no code figure, so it was judged by intelligence alone$/)
  // A pair with a code figure that passes carries no such phrase.
  assert.doesNotMatch(ask([ext('medium', 45, 0.5, 50)]).reason, /no code figure/)
})

test('when every pair is below the code floor the native pair takes the call, and the reason names the floor, not the quota', () => {
  const decision = ask([ext('medium', 45, 0.5, 20), ext('high', 50, 1.5, 30)])
  assert.equal(decision.picked, null)
  assert.match(decision.reason, /^native claude\/sonnet@high: no external pair is a candidate/)
  assert.match(decision.reason, /below the code floor of 42\.9/)
})

test('a pair that is below the code floor and in a dry quota does not make the reason say every quota that reaches the points is dry', () => {
  const onlyLow = ask([ext('medium', 45, 0.5, 20)], { harnesses: view(DRY) })
  assert.doesNotMatch(onlyLow.reason, /is dry/)
  const reaching = ask([ext('medium', 45, 0.5, 20), ext('high', 50, 1.5, 50)], { harnesses: view(DRY) })
  assert.match(reaching.reason, /every quota with a pair that reaches 40\.1 points is dry/)
})

test('a supervisor, a reviewer, a design seat (judge), a call with no role and a reference with no code are judged by intelligence alone', () => {
  const rows = [ext('medium', 41.2, 0.5, 29.29)]
  // The pair reaches the points and has 29.29 in code against a floor of 42.9: only an implementer call leaves it out.
  for (const role of ['supervisor', 'reviewer', 'judge', undefined]) {
    const decision = ask(rows, { role })
    assert.equal(decision.picked.id, 'agy/m@medium', String(role))
    assert.equal(why(decision, 'agy/m@medium'), null, String(role))
    assert.doesNotMatch(decision.reason, /code floor|code figure/, String(role))
  }
  const noCode = { ...SONNET }
  delete noCode.code
  assert.equal(choose({ pairs: [noCode, ...rows], reference: { model: 'sonnet', effort: 'high' }, harnesses: view(OPEN), lanes: LANES, role: 'implementer' }).picked.id, 'agy/m@medium')
})

test('loadPairs checks the code figure of an external row when it is there', (t) => {
  const dir = tempDir(t, 'aether-pairs-code-')
  const write = (row) => {
    const file = path.join(dir, 'pairs.json')
    fs.writeFileSync(file, JSON.stringify({ fetchedAt: '2026-11-13', pairs: [SONNET, row] }))
    return file
  }
  assert.equal(loadPairs(write(ext('medium', 41.2, 0.5))).pairs.length, 2)
  assert.equal(loadPairs(write(ext('medium', 41.2, 0.5, 29.29))).pairs.length, 2)
  assert.throws(() => loadPairs(write(ext('medium', 41.2, 0.5, 120))), /agy\/m@medium\): code must be a number from 0 to 100/)
  assert.throws(() => loadPairs(write(ext('medium', 41.2, 0.5, -1))), /code must be a number from 0 to 100/)
})
