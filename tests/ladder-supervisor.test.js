'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { supervisorOf } = require('../plugins/aether/lib/ladder.js')

const RUNGS = [
  { step: 'haiku-high', model: 'haiku', effort: 'high' }, { step: 'haiku-xhigh', model: 'haiku', effort: 'xhigh' },
  { step: 'sonnet-high', model: 'sonnet', effort: 'high' }, { step: 'opus-high', model: 'opus', effort: 'high' },
  { step: 'opus-xhigh', model: 'opus', effort: 'xhigh' },
]
const ladder = (over = {}) => ({ law: {}, repeatBlocked: 2, supervisorFloor: 3, rungs: RUNGS, ...over })
const of = (l, step) => { const s = supervisorOf(l, step); return `${s.model} ${s.effort}` }

test('with the ladder of today the supervisor of each step is the card\'s: Sonnet high, Sonnet high, Opus high, Opus xhigh, Opus xhigh', () => {
  assert.deepEqual(RUNGS.map((r) => of(ladder(), r.step)), ['sonnet high', 'sonnet high', 'opus high', 'opus xhigh', 'opus xhigh'])
})

test('with another ladder the supervisor is the next step, never under the floor, and the last supervises itself', () => {
  assert.deepEqual(RUNGS.map((r) => of(ladder({ supervisorFloor: 1 }), r.step)), ['haiku xhigh', 'sonnet high', 'opus high', 'opus xhigh', 'opus xhigh'])
  const short = ladder({ rungs: RUNGS.slice(3) })
  assert.deepEqual(short.rungs.map((r) => of(short, r.step)), ['opus xhigh', 'opus xhigh'])
})

test('the supervisor is never weaker than the author, on any ladder and any floor', () => {
  for (const supervisorFloor of [1, 2, 3, 4, 5, 9]) {
    const l = ladder({ supervisorFloor })
    for (const [i, rung] of RUNGS.entries()) assert.ok(RUNGS.findIndex((r) => r.step === supervisorOf(l, rung.step).step) >= i, `${supervisorFloor}/${rung.step}`)
  }
})
