// Hidden acceptance suite for trial 2 (Snake 3D). Every case follows from docs/spec.md, and none
// repeats a test the plan gives. Run it against a finished build, which must have node_modules:
//   TASKS_ROOT=<build> node --test acceptance-suite.js
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.env.TASKS_ROOT
if (!ROOT) throw new Error('set TASKS_ROOT to the build under test')
const load = (file) => import(pathToFileURL(path.join(ROOT, file)).href)
const THREE = await import(pathToFileURL(path.join(ROOT, 'node_modules/three/build/three.module.js')).href)
const close = (a, b) => Math.abs(a - b) < 1e-6
const key = (c) => `${c.x},${c.y}`

// rules

test('boards outside 4 to 64 cells, or not whole, are refused', async () => {
  const { createGame } = await load('src/game.js')
  for (const size of [{ width: 3 }, { height: 65 }, { width: 4.5 }]) assert.throws(() => createGame(size), /invalid board/, JSON.stringify(size))
  assert.doesNotThrow(() => createGame({ width: 4, height: 64 }))
})

test('the default game is 20 x 20 and remembers its seed', async () => {
  const { createGame } = await load('src/game.js')
  const g = createGame({ seed: 77 })
  assert.deepEqual([g.width, g.height, g.seed], [20, 20, 77])
})

test('a 4 x 4 game starts with the snake in the middle and its body to the left', async () => {
  const { createGame } = await load('src/game.js')
  assert.deepEqual(createGame({ width: 4, height: 4 }).snake, [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }])
})

test('the first food is never on the snake, whatever the seed', async () => {
  const { createGame } = await load('src/game.js')
  for (let seed = 0; seed < 100; seed++) {
    const g = createGame({ width: 6, height: 6, seed })
    assert.equal(g.snake.some((c) => key(c) === key(g.food)), false, `seed ${seed}`)
  }
})

test('turning the same way, a third queued turn, and reversing the last queued turn are ignored', async () => {
  const { createGame, start, turn } = await load('src/game.js')
  const g = start(createGame({ seed: 1 }))
  assert.deepEqual(turn(g, 'right').queue, [])
  assert.deepEqual(turn(turn(g, 'up'), 'down').queue, ['up'])
  assert.deepEqual(turn(turn(turn(g, 'up'), 'left'), 'down').queue, ['up', 'left'])
})

test('turns are ignored while paused or over, and start, pause and tick only act in their states', async () => {
  const { createGame, start, turn, tick, togglePause } = await load('src/game.js')
  const ready = createGame({ seed: 1 })
  const paused = togglePause(start(ready))
  assert.deepEqual(turn(paused, 'up').queue, [])
  const over = { ...start(ready), status: 'over' }
  assert.deepEqual(turn(over, 'up').queue, [])
  assert.equal(start(over).status, 'over')
  assert.equal(togglePause(ready).status, 'ready')
  assert.equal(togglePause(over).status, 'over')
  assert.deepEqual(tick(over), over)
  assert.deepEqual(tick({ ...over, status: 'won' }), { ...over, status: 'won' })
  assert.deepEqual(turn(ready, 'up').queue, ['up'])
})

test('from level 2, each food is worth 20 points', async () => {
  const { createGame, start, tick } = await load('src/game.js')
  let g = { ...start(createGame({ seed: 4 })), level: 2, foodsEaten: 5, score: 50 }
  g = tick({ ...g, food: { x: 11, y: 10 } })
  assert.equal(g.score, 70)
})

test('a collision does not count as a tick, and leaves the snake as it was', async () => {
  const { createGame, start, tick } = await load('src/game.js')
  let g = start(createGame({ width: 6, height: 6, seed: 1 }))
  g = { ...g, food: { x: 0, y: 0 } }
  g = tick(tick(g))
  assert.equal(g.status, 'running')
  const before = g
  g = tick(g)
  assert.equal(g.status, 'over')
  assert.deepEqual(g.snake, before.snake)
  assert.equal(g.ticks, before.ticks)
})

test('new food takes the only free cell', async () => {
  const { createGame, start, tick } = await load('src/game.js')
  const base = start(createGame({ width: 4, height: 4, seed: 1 }))
  const cells = [[1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [2, 1], [3, 1], [3, 0], [2, 0], [1, 0]]
  const snake = cells.map(([x, y]) => ({ x, y }))
  const g = tick({ ...base, snake, direction: 'left', queue: [], food: { x: 0, y: 3 } })
  assert.equal(g.status, 'running')
  assert.deepEqual(g.food, { x: 0, y: 0 })
})

test('restart seeds the new game from the current random state', async () => {
  const { createGame, start, tick, restart } = await load('src/game.js')
  const g = tick({ ...start(createGame({ seed: 12 })), food: { x: 11, y: 10 } })
  assert.equal(restart(g).seed, g.rng)
})

test('the random state stays a 32-bit unsigned integer, from any seed', async () => {
  const { nextRandom, randomInt } = await load('src/rng.js')
  for (const seed of [0, 1, 0xffffffff]) {
    const r = nextRandom(seed)
    assert.ok(Number.isInteger(r.state) && r.state >= 0 && r.state <= 0xffffffff, `seed ${seed}`)
  }
  let state = 3
  let hits = 0
  for (let i = 0; i < 2000; i++) {
    const r = randomInt(state, 1000)
    state = r.state
    if (r.value === 999) hits++
  }
  assert.ok(hits <= 10, 'values spread across the range')
})

// input and storage

test('Escape and the capital letters work too', async () => {
  const { keyToCommand } = await load('src/input.js')
  const cases = { Escape: 'pause', P: 'pause', R: 'restart', W: 'up', A: 'left', s: 'down', d: 'right' }
  for (const [k, command] of Object.entries(cases)) assert.equal(keyToCommand(k), command, k)
})

test('a swipe exactly as long as the minimum counts', async () => {
  const { swipeToDirection } = await load('src/input.js')
  assert.equal(swipeToDirection(30, 0), 'right')
  assert.equal(swipeToDirection(29, 0), null)
})

test('a touch end without a touch start sends nothing', async () => {
  const { attachInput } = await load('src/input.js')
  const listeners = {}
  const target = { addEventListener: (t, fn) => (listeners[t] ||= []).push(fn), removeEventListener() {} }
  const commands = []
  attachInput(target, (c) => commands.push(c))
  for (const fn of listeners.touchend || []) fn({ changedTouches: [{ clientX: 100, clientY: 20 }] })
  assert.deepEqual(commands, [])
})

test('a stored score that is not a whole number is ignored, and a bad score saves nothing worse', async () => {
  const { HIGH_SCORE_KEY, loadHighScore, saveHighScore } = await load('src/storage.js')
  const data = { [HIGH_SCORE_KEY]: '12.5' }
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = String(v)) }
  assert.equal(loadHighScore(storage), 0)
  data[HIGH_SCORE_KEY] = '30'
  assert.equal(saveHighScore(storage, -5), 30)
  assert.equal(saveHighScore(storage, Number.NaN), 30)
  assert.equal(loadHighScore(storage), 30)
})

// theme, world, view

test('gridToWorld centers boards that are not square', async () => {
  const { gridToWorld } = await load('src/render/theme.js')
  assert.deepEqual(gridToWorld(0, 0, 12, 8), { x: -5.5, z: -3.5 })
  assert.deepEqual(gridToWorld(11, 7, 12, 8), { x: 5.5, z: 3.5 })
})

test('the world fits boards that are not square, with walls around the board', async () => {
  const { buildWorld } = await load('src/render/world.js')
  const { THEME } = await load('src/render/theme.js')
  const world = buildWorld({ width: 12, height: 8, theme: THEME })
  const boardBox = new THREE.Box3().setFromObject(world.getObjectByName('board'))
  const size = boardBox.getSize(new THREE.Vector3())
  assert.ok(Math.abs(size.x - 12) <= 0.5 && Math.abs(size.z - 8) <= 0.5, `${size.x} x ${size.z}`)
  const wallsBox = new THREE.Box3().setFromObject(world.getObjectByName('walls'))
  assert.ok(wallsBox.min.x < boardBox.min.x + 0.01 && wallsBox.max.x > boardBox.max.x - 0.01, 'walls span the board in x')
  assert.ok(wallsBox.min.z < boardBox.min.z + 0.01 && wallsBox.max.z > boardBox.max.z - 0.01, 'walls span the board in z')
})

test('the camera frames the board at extreme aspects, looking at its center', async () => {
  const { frameCamera } = await load('src/render/world.js')
  for (const aspect of [21 / 9, 9 / 21]) {
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000)
    frameCamera(camera, { width: 20, height: 20, aspect })
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
      const p = new THREE.Vector3(x, 0, z).project(camera)
      assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1, `aspect ${aspect.toFixed(2)}, corner ${x},${z}`)
    }
    const center = new THREE.Vector3(0, 0, 0).project(camera)
    assert.ok(Math.abs(center.x) < 0.05 && Math.abs(center.y) < 0.5, `center at ${center.x.toFixed(2)},${center.y.toFixed(2)}`)
  }
})

async function view(width = 20, height = 20) {
  const { createSnakeView } = await load('src/render/snake-view.js')
  const { THEME } = await load('src/render/theme.js')
  const scene = new THREE.Scene()
  const before = scene.children.length
  return { scene, before, view: createSnakeView({ scene, theme: THEME, width, height }) }
}

test('a long snake shows every segment on its cell', async () => {
  const { createGame, start } = await load('src/game.js')
  const { gridToWorld } = await load('src/render/theme.js')
  const { view: v } = await view()
  const snake = Array.from({ length: 20 }, (_, i) => ({ x: 19 - i, y: 5 }))
  const game = { ...start(createGame({ seed: 1 })), snake, food: { x: 0, y: 0 } }
  v.update(game, 1, 0)
  const segments = v.segmentPositions()
  assert.equal(segments.length, 19)
  segments.forEach((p, i) => {
    const at = gridToWorld(snake[i + 1].x, snake[i + 1].y, 20, 20)
    assert.ok(close(p.x, at.x) && close(p.z, at.z), `segment ${i}`)
  })
})

test('the head faces each of the four directions', async () => {
  const { createGame, start } = await load('src/game.js')
  const { HEADING } = await load('src/render/snake-view.js')
  const { scene, view: v } = await view()
  const base = start(createGame({ seed: 1 }))
  let t = 0
  for (const direction of ['up', 'down', 'left', 'right']) {
    v.update({ ...base, direction, ticks: ++t }, 1, t * 16)
    const angle = scene.getObjectByName('snake-head').rotation.y
    const diff = Math.atan2(Math.sin(angle - HEADING[direction]), Math.cos(angle - HEADING[direction]))
    assert.ok(Math.abs(diff) < 1e-3, `${direction}: ${angle}`)
  }
})

test('the food follows its cell', async () => {
  const { createGame, start } = await load('src/game.js')
  const { gridToWorld } = await load('src/render/theme.js')
  const { scene, view: v } = await view()
  const g = start(createGame({ seed: 1 }))
  v.update({ ...g, food: { x: 2, y: 3 } }, 1, 0)
  v.update({ ...g, food: { x: 15, y: 4 }, ticks: 1 }, 1, 16)
  const at = gridToWorld(15, 4, 20, 20)
  const food = scene.getObjectByName('food')
  assert.ok(close(food.position.x, at.x) && close(food.position.z, at.z))
})

test('after reset, the view shows a new game from its start', async () => {
  const { createGame, start, tick, restart } = await load('src/game.js')
  const { gridToWorld } = await load('src/render/theme.js')
  const { scene, view: v } = await view()
  let g = start(createGame({ seed: 1 }))
  for (let i = 0; i < 4; i++) {
    g = tick({ ...g, food: { x: g.snake[0].x + 1, y: g.snake[0].y } })
    v.update(g, 1, i * 16)
  }
  v.reset()
  const fresh = restart(g)
  v.update(fresh, 1, 200)
  assert.equal(v.segmentPositions().length, 2)
  const at = gridToWorld(10, 10, 20, 20)
  const head = scene.getObjectByName('snake-head')
  assert.ok(close(head.position.x, at.x) && close(head.position.z, at.z))
})

test('dispose leaves the scene as it found it', async () => {
  const { createGame, start } = await load('src/game.js')
  const { scene, before, view: v } = await view()
  v.update(start(createGame({ seed: 1 })), 1, 0)
  v.onEat({ x: 3, y: 3 })
  v.update(start(createGame({ seed: 1 })), 1, 16)
  v.dispose()
  assert.equal(scene.children.length, before)
})

// HUD and loop

test('every screen has a title and a hint, and newBest is false unless set', async () => {
  const { hudModel } = await load('src/hud.js')
  for (const status of ['ready', 'paused', 'over', 'won']) {
    const { panel } = hudModel({ status, score: 5, highScore: 9, level: 2 })
    assert.ok(panel.title.trim() && panel.hint.trim(), status)
    assert.equal(panel.newBest, false, status)
  }
  assert.deepEqual(Object.keys(hudModel({ status: 'running', score: 0, highScore: 0, level: 1 })).sort(), ['best', 'level', 'panel', 'score'])
})

test('the loop keeps its progress when the tick length changes, and time going back counts as 0', async () => {
  const { createLoop } = await load('src/loop.js')
  const loop = createLoop({ startMs: 0 })
  assert.deepEqual(loop.advance(60, 100), { ticks: 0, alpha: 0.6 })
  assert.deepEqual(loop.advance(90, 50), { ticks: 1, alpha: 0.8 })
  assert.deepEqual(loop.advance(50, 50), { ticks: 0, alpha: 0.8 })
})
