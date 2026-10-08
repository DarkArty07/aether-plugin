import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRandom, randomInt } from '../src/rng.js'

test('nextRandom is deterministic, and its values stay in [0, 1)', () => {
  let state = 42
  const values = []
  for (let i = 0; i < 1000; i++) {
    const r = nextRandom(state)
    assert.ok(r.value >= 0 && r.value < 1)
    assert.ok(Number.isInteger(r.state) && r.state >= 0 && r.state <= 0xffffffff)
    values.push(r.value)
    state = r.state
  }
  let again = 42
  for (const value of values) {
    const r = nextRandom(again)
    assert.equal(r.value, value)
    again = r.state
  }
})

test('randomInt returns every integer in [0, n)', () => {
  let state = 7
  const seen = new Set()
  for (let i = 0; i < 500; i++) {
    const r = randomInt(state, 5)
    assert.ok(Number.isInteger(r.value) && r.value >= 0 && r.value < 5)
    seen.add(r.value)
    state = r.state
  }
  assert.equal(seen.size, 5)
})
