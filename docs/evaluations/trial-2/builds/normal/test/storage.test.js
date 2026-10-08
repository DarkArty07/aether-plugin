import test from 'node:test'
import assert from 'node:assert/strict'
import { HIGH_SCORE_KEY, loadHighScore, saveHighScore } from '../src/storage.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => (data[k] = String(v)) }
}

test('loadHighScore reads the stored score, and gives 0 when it is missing or invalid', () => {
  assert.equal(HIGH_SCORE_KEY, 'snake3d.highScore')
  assert.equal(loadHighScore(memoryStorage({ [HIGH_SCORE_KEY]: '120' })), 120)
  assert.equal(loadHighScore(memoryStorage()), 0)
  assert.equal(loadHighScore(memoryStorage({ [HIGH_SCORE_KEY]: 'abc' })), 0)
  assert.equal(loadHighScore(memoryStorage({ [HIGH_SCORE_KEY]: '-5' })), 0)
})

test('saveHighScore keeps the best score and returns it', () => {
  const s = memoryStorage({ [HIGH_SCORE_KEY]: '50' })
  assert.equal(saveHighScore(s, 30), 50)
  assert.equal(s.data[HIGH_SCORE_KEY], '50')
  assert.equal(saveHighScore(s, 80), 80)
  assert.equal(s.data[HIGH_SCORE_KEY], '80')
})

test('a missing or failing storage never throws', () => {
  const broken = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  }
  assert.equal(loadHighScore(broken), 0)
  assert.equal(saveHighScore(broken, 40), 40)
  assert.equal(loadHighScore(undefined), 0)
})
