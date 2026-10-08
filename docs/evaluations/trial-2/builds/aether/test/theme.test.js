import test from 'node:test'
import assert from 'node:assert/strict'
import { CELL, THEME, gridToWorld, lerp, easeOutCubic, clamp01, bodyColor } from '../src/render/theme.js'

test('gridToWorld centers the board on the origin, one CELL per cell', () => {
  assert.equal(CELL, 1)
  assert.deepEqual(gridToWorld(0, 0, 20, 20), { x: -9.5, z: -9.5 })
  assert.deepEqual(gridToWorld(19, 19, 20, 20), { x: 9.5, z: 9.5 })
  assert.deepEqual(gridToWorld(2, 1, 5, 3), { x: 0, z: 0 })
})

test('lerp, easeOutCubic and clamp01 behave at their ends', () => {
  assert.equal(lerp(2, 6, 0.25), 3)
  assert.equal(easeOutCubic(0), 0)
  assert.equal(easeOutCubic(1), 1)
  assert.ok(easeOutCubic(0.5) > 0.5)
  assert.deepEqual([clamp01(-1), clamp01(0.3), clamp01(4)], [0, 0.3, 1])
})

test('THEME has a name, every color as a 24-bit integer, and bloom settings', () => {
  assert.equal(typeof THEME.name, 'string')
  assert.ok(THEME.name.trim().length > 0)
  for (const name of ['background', 'fog', 'board', 'boardAlt', 'wall', 'snakeHead', 'snakeBody', 'snakeTail', 'food', 'particle', 'accent']) {
    const color = THEME.colors[name]
    assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff, name)
  }
  for (const name of ['strength', 'radius', 'threshold']) assert.equal(typeof THEME.bloom[name], 'number', name)
})

test('bodyColor runs from the body color behind the head to the tail color', () => {
  assert.equal(bodyColor(1, 10), THEME.colors.snakeBody)
  assert.equal(bodyColor(9, 10), THEME.colors.snakeTail)
  const middle = bodyColor(5, 10)
  assert.ok(Number.isInteger(middle) && middle >= 0 && middle <= 0xffffff)
})
