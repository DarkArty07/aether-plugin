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

test('hudModel marks a new best only on the over and won panels', () => {
  const panel = (status, isNewBest) => hudModel({ status, score: 50, highScore: 50, level: 2, isNewBest }).panel
  assert.equal(panel('over', true).newBest, true)
  assert.equal(panel('won', true).newBest, true)
  assert.equal(panel('over', false).newBest, false)
  assert.equal(panel('over', undefined).newBest, false)
  assert.equal(panel('ready', true).newBest, false)
  assert.equal(panel('paused', true).newBest, false)
})

test('hudModel names Enter on the won panel, and gives every panel a title and a hint', () => {
  const won = hudModel({ status: 'won', score: 999, highScore: 999, level: 9 }).panel
  assert.match(won.hint, /enter/i)
  for (const status of ['ready', 'paused', 'over', 'won']) {
    const panel = hudModel({ status, score: 0, highScore: 0, level: 1 }).panel
    assert.match(panel.title, /\S/, status)
    assert.match(panel.hint, /\S/, status)
    assert.deepEqual(Object.keys(panel).sort(), ['hint', 'kind', 'newBest', 'title'], status)
  }
})

test('hudModel returns only score, best, level and panel, and a fresh panel on each call', () => {
  const a = hudModel({ status: 'paused', score: 1, highScore: 2, level: 3 })
  assert.deepEqual(Object.keys(a).sort(), ['best', 'level', 'panel', 'score'])
  const b = hudModel({ status: 'paused', score: 1, highScore: 2, level: 3 })
  assert.notEqual(a.panel, b.panel)
  assert.deepEqual(a, b)
})
