import test from 'node:test'
import assert from 'node:assert/strict'
import { hudModel } from '../src/hud.js'

test('hudModel shows the score, the best and the level as text, and no panel while running', () => {
  assert.deepEqual(hudModel({ status: 'running', score: 40, highScore: 90, level: 2 }), { score: '40', best: '90', level: '2', panel: null })
})

test('hudModel gives each screen its panel, with a title and a hint that names the keys', () => {
  const ready = hudModel({ status: 'ready', score: 0, highScore: 0, level: 1 }).panel
  assert.equal(ready.kind, 'ready')
  assert.match(ready.hint, /arrow/i)
  const paused = hudModel({ status: 'paused', score: 10, highScore: 10, level: 1 }).panel
  assert.equal(paused.kind, 'paused')
  assert.match(paused.hint, /space/i)
  const over = hudModel({ status: 'over', score: 120, highScore: 120, level: 3, isNewBest: true }).panel
  assert.deepEqual([over.kind, over.newBest], ['over', true])
  assert.match(over.title, /\S/)
  assert.match(over.hint, /enter/i)
  assert.equal(hudModel({ status: 'won', score: 999, highScore: 999, level: 9 }).panel.kind, 'won')
})

test('hudModel hints name the tap too, for touch players', () => {
  for (const status of ['ready', 'paused', 'over', 'won']) {
    assert.match(hudModel({ status, score: 0, highScore: 0, level: 1 }).panel.hint, /tap/i, status)
  }
})
