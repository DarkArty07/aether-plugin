import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoop } from '../src/loop.js'

test('the loop counts the ticks that are due and the progress toward the next one', () => {
  const loop = createLoop({ startMs: 1000 })
  assert.deepEqual(loop.advance(1000, 100), { ticks: 0, alpha: 0 })
  assert.deepEqual(loop.advance(1050, 100), { ticks: 0, alpha: 0.5 })
  assert.deepEqual(loop.advance(1230, 100), { ticks: 2, alpha: 0.3 })
})

test('the loop runs at most five ticks per call, and drops the rest', () => {
  const loop = createLoop({ startMs: 0 })
  assert.deepEqual(loop.advance(10000, 100), { ticks: 5, alpha: 0 })
  assert.deepEqual(loop.advance(10050, 100), { ticks: 0, alpha: 0.5 })
})

test('reset puts the next tick a full tick away', () => {
  const loop = createLoop({ startMs: 0 })
  loop.advance(80, 100)
  loop.reset(500)
  assert.deepEqual(loop.advance(560, 100), { ticks: 0, alpha: 0.6 })
})
