import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createSnakeView, HEADING } from '../src/render/snake-view.js'
import { THEME, gridToWorld } from '../src/render/theme.js'
import { createGame, restart, start, tick, turn } from '../src/game.js'

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

const at = (cell) => gridToWorld(cell.x, cell.y, 20, 20)
const sameAs = (p, cell) => close(p.x, at(cell).x) && close(p.z, at(cell).z)
const running = () => start(createGame({ seed: 1 }))
const advance = (game, ticks) => Array.from({ length: ticks }).reduce((g) => tick(g), game)
// The game as it is after the snake eats a meal straight ahead.
const eatAhead = (game) => tick({ ...game, food: { x: game.snake[0].x + 1, y: game.snake[0].y } })
const uniformsOf = (scene) => scene.getObjectByName('snake-view').userData.uniforms

// Every geometry, material and texture reachable from the scene.
function resources(scene) {
  const found = new Set()
  scene.traverse((o) => {
    if (o.geometry) found.add(o.geometry)
    for (const m of [].concat(o.material ?? [])) {
      found.add(m)
      if (m.map) found.add(m.map)
    }
  })
  return found
}

test('the food is hidden while there is none, and stays in the scene', () => {
  const { scene, view } = setup()
  const game = running()
  view.update({ ...game, food: null }, 1, 0)
  const food = scene.getObjectByName('food')
  assert.ok(food, 'still in the scene')
  assert.equal(food.visible, false)
  view.update(game, 1, 16)
  assert.equal(food.visible, true)
})

test('the food bobs and its cell follows the game', () => {
  const { scene, view } = setup()
  const game = running()
  view.update(game, 1, 1000)
  const food = scene.getObjectByName('food')
  const heights = new Set()
  for (let t = 1000; t < 3000; t += 100) {
    view.update(game, 1, t)
    heights.add(food.position.y.toFixed(3))
  }
  assert.ok(heights.size > 5, 'it moves up and down')
  view.update({ ...game, food: { x: 3, y: 4 } }, 1, 3100)
  assert.ok(close(food.position.x, at({ x: 3, y: 4 }).x) && close(food.position.z, at({ x: 3, y: 4 }).z))
})

test('at alpha 0 the segments are on the previous cells and move linearly to the new ones', () => {
  const { view } = setup()
  const before = running()
  view.update(before, 1, 0)
  const after = tick(before)
  view.update(after, 0, 16)
  view.segmentPositions().forEach((p, i) => assert.ok(sameAs(p, before.snake[i + 1]), `segment ${i} starts where it was`))
  for (const alpha of [0.25, 0.75]) {
    view.update(after, alpha, 32)
    view.segmentPositions().forEach((p, i) => {
      const from = at(before.snake[i + 1])
      const to = at(after.snake[i + 1])
      assert.ok(close(p.x, from.x + (to.x - from.x) * alpha) && close(p.z, from.z + (to.z - from.z) * alpha), `segment ${i} at ${alpha}`)
    })
  }
  view.update(after, 1, 48)
  view.segmentPositions().forEach((p, i) => assert.ok(sameAs(p, after.snake[i + 1])))
})

test('a new tail segment grows out of the old tail cell', () => {
  const { view } = setup()
  const before = running()
  view.update(before, 1, 0)
  const after = eatAhead(before)
  assert.equal(after.snake.length, before.snake.length + 1)
  view.update(after, 0, 16)
  const segments = view.segmentPositions()
  assert.equal(segments.length, 3)
  const tail = before.snake[before.snake.length - 1]
  assert.ok(sameAs(segments[2], tail), 'the new tail starts on the old tail')
  view.update(after, 1, 32)
  assert.ok(sameAs(view.segmentPositions()[2], after.snake[3]))
})

test('several ticks in one frame still move one cell', () => {
  const { view } = setup()
  const before = running()
  view.update(before, 1, 0)
  const after = advance(before, 4)
  view.update(after, 0, 16)
  const n = after.snake.length
  view.segmentPositions().forEach((p, i) => assert.ok(sameAs(p, after.snake[Math.min(i + 2, n - 1)]), `segment ${i} is one cell behind`))
})

test('a restart that skips reset() snaps instead of sliding', () => {
  const { view } = setup()
  const game = advance(running(), 5)
  view.update(game, 1, 0)
  const fresh = restart(game)
  view.update(fresh, 0.5, 16)
  assert.equal(fresh.ticks, 0)
  view.segmentPositions().forEach((p, i) => assert.ok(sameAs(p, fresh.snake[i + 1]), `segment ${i}`))
})

test('reset() clears the interpolation and the effects, and restores the look', () => {
  const { scene, view } = setup()
  let game = running()
  view.update(game, 1, 0)
  game = eatAhead(game)
  view.onEat({ x: 11, y: 10 })
  view.onGameOver()
  view.update({ ...game, status: 'over' }, 1, 100)
  assert.ok(view.activeEffects() > 0)
  view.update({ ...game, status: 'over' }, 1, 3000)
  assert.ok(uniformsOf(scene).uLife.value < 0.2, 'dead after the crash')
  view.reset()
  assert.equal(view.activeEffects(), 0)
  assert.deepEqual(view.segmentPositions(), [])
  assert.equal(uniformsOf(scene).uLife.value, 1)
  assert.equal(uniformsOf(scene).uFlash.value, 0)
  const fresh = running()
  view.update(fresh, 0.5, 3016)
  view.segmentPositions().forEach((p, i) => assert.ok(sameAs(p, fresh.snake[i + 1]), 'snapped to the new game'))
  assert.equal(uniformsOf(scene).uLife.value, 1)
})

test('the head turns the short way round and ends exactly on its heading', () => {
  for (const [from, to] of [['right', 'up'], ['right', 'down'], ['up', 'left'], ['left', 'up'], ['down', 'right'], ['up', 'right']]) {
    const { scene, view } = setup()
    const game = { ...running(), direction: from }
    view.update(game, 1, 0)
    const head = scene.getObjectByName('snake-head')
    assert.equal(head.rotation.y, HEADING[from], `starts facing ${from}`)
    const next = { ...game, direction: to, ticks: game.ticks + 1 } // one tick on, turned
    view.update(next, 0, 16)
    assert.ok(close(head.rotation.y, HEADING[from]), `${from} -> ${to} begins where it was`)
    let last = head.rotation.y
    let travelled = 0
    for (let alpha = 0.1; alpha < 1; alpha += 0.1) {
      view.update(next, alpha, 16 + alpha * 100)
      travelled += Math.abs(head.rotation.y - last)
      last = head.rotation.y
    }
    view.update(next, 1, 200)
    assert.equal(head.rotation.y, HEADING[to], `${from} -> ${to} ends exactly on the heading`)
    assert.ok(travelled <= Math.PI / 2 + 1e-6, `${from} -> ${to} turns a quarter, not three: ${travelled}`)
  }
})

test('an effect starts at the next update, and ends within 2 seconds of it', () => {
  const { view } = setup()
  const game = running()
  view.update(game, 1, 0)
  view.onEat({ x: 4, y: 4 })
  assert.equal(view.activeEffects(), 1, 'counted while it waits for a clock')
  view.update(game, 1, 50000)
  assert.equal(view.activeEffects(), 1, 'started at 50000, not at 0')
  view.update(game, 1, 51400)
  assert.equal(view.activeEffects(), 1)
  view.update(game, 1, 52000)
  assert.equal(view.activeEffects(), 0)
})

test('a meal bursts when the head arrives, a tick after the rules ate it', () => {
  const { view } = setup()
  const game = running()
  view.update(game, 1, 0)
  const after = eatAhead(game)
  view.onEat({ x: 11, y: 10 })
  view.update(after, 0, 1000)
  assert.equal(view.activeEffects(), 1)
  view.update(after, 1, 2600)
  assert.equal(view.activeEffects(), 1, `still going at 2.6 s: it began ${after.tickMs} ms after 1 s`)
  view.update(after, 1, 2700)
  assert.equal(view.activeEffects(), 0)
})

test('game over runs a visible effect that ends, and leaves the snake dim until reset', () => {
  const { scene, view } = setup()
  const game = advance(running(), 3)
  view.update(game, 1, 0)
  const over = { ...game, status: 'over' }
  view.onGameOver()
  assert.equal(view.activeEffects(), 1)
  view.update(over, 0, 1000)
  const uniforms = uniformsOf(scene)
  assert.ok(uniforms.uFlash.value > 0.5, `flashes the danger color: ${uniforms.uFlash.value}`)
  view.update(over, 0, 1500)
  assert.ok(uniforms.uLife.value < 1, 'the glow drains')
  view.update(over, 0, 2900)
  assert.equal(view.activeEffects(), 0, 'the effect ran out in under 2 seconds')
  assert.ok(uniforms.uLife.value < 0.2, `stays dim: ${uniforms.uLife.value}`)
  assert.equal(uniforms.uFlash.value, 0)
  view.update(over, 0, 60000)
  assert.ok(uniforms.uLife.value < 0.2, 'still dim a minute later')
})

test('once the game is over the snake stays on its last cells whatever alpha says', () => {
  const { scene, view } = setup()
  const game = advance(running(), 3)
  view.update(advance(running(), 2), 1, 0)
  view.update({ ...game, status: 'over' }, 0.1, 16)
  assert.ok(sameAs(scene.getObjectByName('snake-head').position, game.snake[0]))
  view.segmentPositions().forEach((p, i) => assert.ok(sameAs(p, game.snake[i + 1])))
})

test('more meals than slots recycle the oldest and never throw', () => {
  const { scene, view } = setup()
  const game = running()
  view.update(game, 1, 0)
  const count = resources(scene).size
  for (let i = 0; i < 20; i++) {
    view.onEat({ x: i % 20, y: 3 })
    view.update(game, 1, 100 + i * 10)
  }
  assert.ok(view.activeEffects() > 0 && view.activeEffects() <= 6, `${view.activeEffects()} live`)
  view.update(game, 1, 100 + 20 * 10 + 2000)
  assert.equal(view.activeEffects(), 0)
  assert.equal(resources(scene).size, count)
})

test('updates, meals and crashes create no geometry, material or texture', () => {
  const { scene, view } = setup()
  let game = running()
  view.update(game, 1, 0)
  const before = resources(scene)
  const objects = new Set()
  scene.traverse((o) => objects.add(o))
  let now = 0
  for (let i = 0; i < 9; i++) {
    game = i === 4 ? eatAhead(game) : tick(game)
    if (i === 4) view.onEat(game.snake[0])
    for (const alpha of [0, 0.3, 0.6, 0.9]) view.update(game, alpha, (now += 16))
  }
  view.onGameOver()
  for (let i = 0; i < 150; i++) view.update({ ...game, status: 'over' }, 0, (now += 16))
  view.reset()
  view.update(running(), 0, (now += 16))
  const after = resources(scene)
  assert.equal(after.size, before.size)
  for (const r of before) assert.ok(after.has(r), 'the same objects')
  scene.traverse((o) => assert.ok(objects.has(o), `no new scene object: ${o.name || o.type}`))
})

test('the particles and the body stay finite', () => {
  const { scene, view } = setup()
  let game = running()
  view.update(game, 1, 0)
  game = eatAhead(game)
  view.onEat(game.snake[0])
  for (let t = 16; t < 2400; t += 40) view.update(game, 0.4, t)
  view.onGameOver()
  for (let t = 2400; t < 4600; t += 40) view.update({ ...game, status: 'over' }, 0, t)
  scene.traverse((o) => {
    for (const attribute of Object.values(o.geometry?.attributes ?? {})) assert.ok(attribute.array.every(Number.isFinite), `${o.name}: finite attributes`)
    if (o.isInstancedMesh) assert.ok(o.instanceMatrix.array.every(Number.isFinite), `${o.name}: finite matrices`)
  })
})

test('the body is instanced, lies on the board, and has a joint for every segment', () => {
  const { scene, view } = setup()
  const game = advance(running(), 4)
  view.update(game, 0.5, 0)
  const body = scene.getObjectByName('snake-body')
  const links = scene.getObjectByName('snake-links')
  assert.ok(body.isInstancedMesh && links.isInstancedMesh)
  assert.equal(body.count, game.snake.length - 1)
  assert.equal(links.count, game.snake.length - 1)
  assert.ok(body.instanceMatrix.count >= 20 * 20 - 1, 'room for the longest snake')
  assert.equal(body.castShadow, true)
  for (let i = 0; i < body.count; i++) {
    const y = body.instanceMatrix.array[i * 16 + 13]
    const radius = body.instanceMatrix.array[i * 16 + 5]
    assert.ok(y >= radius - 1e-9 && y < 1, `segment ${i} rests on the board (y ${y}, radius ${radius})`)
  }
})

test('the head is its own object, and nothing reuses the names of the world', () => {
  const { scene, view } = setup()
  view.update(running(), 1, 0)
  const head = scene.getObjectByName('snake-head')
  assert.ok(!head.isInstancedMesh && head.children.length >= 3, 'a built head, not a ball of the body')
  const taken = new Set(['world', 'board', 'walls', 'trim', 'caustics', 'seafloor', 'decor'])
  scene.traverse((o) => assert.ok(!taken.has(o.name), `${o.name} is the world's`))
})

test('dispose frees every geometry, material and texture it made', () => {
  const { scene, view } = setup()
  view.update(running(), 1, 0)
  const made = resources(scene)
  assert.ok(made.size > 10)
  const freed = new Set()
  for (const r of made) r.addEventListener('dispose', () => freed.add(r))
  view.dispose()
  assert.equal(scene.children.length, 0)
  for (const r of made) assert.ok(freed.has(r), `${r.type} ${r.name || r.uuid} was not disposed`)
})
