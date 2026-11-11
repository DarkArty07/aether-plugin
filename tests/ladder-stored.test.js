'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { ladderFrom, diffLadder } = require('../plugins/aether/lib/pareto.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { loadLadder } = require('../plugins/aether/lib/ladder.js')

const names = (rungs) => rungs.map((r) => `${r.model} ${r.effort}`)

test('the stored ladder is what the law gives on the table of today: five rungs', () => {
  const ladder = loadLadder()
  const computed = ladderFrom(loadPairs().pairs, ladder.law)
  assert.deepEqual(names(computed), ['haiku high', 'haiku xhigh', 'sonnet high', 'opus high', 'opus xhigh'])
  assert.deepEqual(diffLadder(ladder.rungs, computed), [])
})

test('an edit of the stored ladder or of the table fails the check, and the message names the rung', () => {
  const ladder = loadLadder()
  const { pairs } = loadPairs()
  const edited = ladder.rungs.map((r) => (r.step === 'opus-high' ? { ...r, model: 'sonnet', effort: 'xhigh' } : r))
  assert.deepEqual(diffLadder(edited, ladderFrom(pairs, ladder.law)), ['changed rung 4: stored sonnet xhigh, the law gives opus high'])
  assert.deepEqual(diffLadder(ladder.rungs.slice(0, 4), ladderFrom(pairs, ladder.law)), ['missing rung 5: opus xhigh'])
  // Sonnet xhigh made cheaper than Opus high comes in and Opus high goes out: the stored ladder no longer matches the table.
  const cheaper = pairs.map((p) => (p.id === 'claude/sonnet@xhigh' ? { ...p, costPerTaskUsd: 3 } : p))
  assert.ok(diffLadder(ladder.rungs, ladderFrom(cheaper, ladder.law)).length > 0)
})
