import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createSnakeView, HEADING } from '../src/render/snake-view.js'
import { THEME, gridToWorld } from '../src/render/theme.js'
import { createGame, start, tick, turn } from '../src/game.js'

const close = (a, b) => Math.abs(a - b) < 1e-6

function setup() {
  const scene = new THREE.Scene()
  const view = createSnakeView({ scene, theme: THEME, width: 20, height: 20 })
  return { scene, view }
}

test('the view puts the head, each body segment and the food on their cells', () => {
  const { scene, view } = setup()
  const game = start(createGame({ seed: 1 }))
  view.update(game, 1, 0)
  const head = scene.getObjectByName('snake-head')
  const food = scene.getObjectByName('food')
  const at = (cell) => gridToWorld(cell.x, cell.y, 20, 20)
  assert.ok(close(head.position.x, at(game.snake[0]).x) && close(head.position.z, at(game.snake[0]).z))
  assert.ok(close(food.position.x, at(game.food).x) && close(food.position.z, at(game.food).z))
  const segments = view.segmentPositions()
  assert.equal(segments.length, game.snake.length - 1)
  segments.forEach((p, i) => assert.ok(close(p.x, at(game.snake[i + 1]).x) && close(p.z, at(game.snake[i + 1]).z), `segment ${i}`))
})

test('the head moves smoothly between cells and turns to face its direction', () => {
  const { scene, view } = setup()
  let game = start(createGame({ seed: 1 }))
  view.update(game, 1, 0)
  game = tick(game)
  view.update(game, 0.5, 16)
  const head = scene.getObjectByName('snake-head')
  const from = gridToWorld(10, 10, 20, 20)
  const to = gridToWorld(11, 10, 20, 20)
  assert.ok(close(head.position.x, (from.x + to.x) / 2), `halfway: ${head.position.x}`)
  game = tick(turn(game, 'up'))
  view.update(game, 1, 32)
  assert.ok(close(head.rotation.y, HEADING.up), `facing up: ${head.rotation.y}`)
})

test('the body grows with the snake, and an eat effect runs out', () => {
  const { view } = setup()
  let game = start(createGame({ seed: 1 }))
  view.update(game, 1, 0)
  game = tick({ ...game, food: { x: 11, y: 10 } })
  view.onEat({ x: 11, y: 10 })
  view.update(game, 1, 100)
  assert.equal(view.segmentPositions().length, 3)
  assert.ok(view.activeEffects() > 0)
  view.update(game, 1, 2500)
  assert.equal(view.activeEffects(), 0)
})

test('dispose removes the snake and the food from the scene', () => {
  const { scene, view } = setup()
  view.update(start(createGame({ seed: 1 })), 1, 0)
  view.dispose()
  assert.equal(scene.getObjectByName('snake-head'), undefined)
  assert.equal(scene.getObjectByName('food'), undefined)
})

test('a won game has no food left, so the view hides the food and keeps running', () => {
  const { scene, view } = setup()
  const game = start(createGame({ seed: 1 }))
  view.update(game, 1, 0)
  view.update({ ...game, status: 'won', food: null }, 1, 16)
  assert.equal(scene.getObjectByName('food').visible, false)
  view.update(game, 1, 32)
  assert.equal(scene.getObjectByName('food').visible, true)
})
