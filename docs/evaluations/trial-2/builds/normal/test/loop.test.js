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

test('time going backwards gives no ticks and no progress', () => {
  const loop = createLoop({ startMs: 1000 })
  assert.deepEqual(loop.advance(900, 100), { ticks: 0, alpha: 0 })
  assert.deepEqual(loop.advance(1040, 100), { ticks: 0, alpha: 0.4 })
})

test('five ticks due are all run, and a sixth is the first one dropped', () => {
  const five = createLoop({ startMs: 0 })
  assert.deepEqual(five.advance(500, 100), { ticks: 5, alpha: 0 })
  assert.deepEqual(five.advance(560, 100), { ticks: 0, alpha: 0.6 })
  const six = createLoop({ startMs: 0 })
  assert.deepEqual(six.advance(630, 100), { ticks: 5, alpha: 0.3 })
  assert.deepEqual(six.advance(670, 100), { ticks: 0, alpha: 0.7 })
  assert.deepEqual(six.advance(710, 100), { ticks: 1, alpha: 0.1 })
})

test('a new tick length applies from the next call on', () => {
  const loop = createLoop({ startMs: 0 })
  assert.deepEqual(loop.advance(230, 100), { ticks: 2, alpha: 0.3 })
  assert.deepEqual(loop.advance(260, 60), { ticks: 1, alpha: 0 })
  assert.deepEqual(loop.advance(290, 60), { ticks: 0, alpha: 0.5 })
})

test('the progress stays within [0, 1) whatever the numbers are', () => {
  const loop = createLoop({ startMs: 0 })
  let now = 0
  for (let i = 0; i < 2000; i++) {
    now += (i * 7919) % 41 / 3
    const { ticks, alpha } = loop.advance(now, 16.7 + (i % 5))
    assert.ok(Number.isInteger(ticks) && ticks >= 0 && ticks <= 5)
    assert.ok(alpha >= 0 && alpha < 1, `alpha ${alpha} at call ${i}`)
  }
})

test('a tick length that is not positive runs nothing', () => {
  const loop = createLoop({ startMs: 0 })
  assert.deepEqual(loop.advance(500, 0), { ticks: 0, alpha: 0 })
  assert.deepEqual(loop.advance(500, NaN), { ticks: 0, alpha: 0 })
})
