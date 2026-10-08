# Snake 3D Implementation Plan

**Goal:** Build Snake 3D as `docs/spec.md` describes: a three.js snake game judged on graphics, creativity, playability and 3D quality.

**Architecture:**
- Pure rules (`src/game.js`, `src/rng.js`), input, storage and the HUD model can all be tested in Node.
- A render layer builds on a theme (`src/render/`): the world, the camera, and the snake view with its effects.
- `src/main.js` wires them with a fixed-timestep loop (`src/loop.js`).

**Spec:** `docs/spec.md`

## Global Constraints

- **The browser side:** ES modules with no build step. three.js 0.186.1 comes from `node_modules` through the import map in `index.html`; there is no CDN and no other dependency.
- **The tests:** Node.js 22 with ES modules (`"type": "module"`). `npm test` runs `node --test`, and tests may import `three`. Run `npm ci` in a fresh checkout or worktree before testing.
- **Purity:** the rules, input mapping, storage, theme helpers, HUD model and loop are pure, or take their dependencies as arguments.
- **Performance:** nothing creates geometries or materials per tick or per frame.
- **Error messages** start with the spec's prefixes.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 160

---

### Task 1: The rules

**Aether:**
- Tier: haiku — exact tests pin down pure functions
- Area: core
- Owns: `src/rng.js`, `src/game.js`, `test/rng.test.js`, `test/game.test.js`
- Depends on: none

**Interfaces:**
- `src/rng.js` exports `nextRandom(state) → { value, state }` and `randomInt(state, n) → { value, state }` (mulberry32; `state` is a 32-bit unsigned integer).
- `src/game.js` exports `createGame({ width, height, seed })`, `start(game)`, `turn(game, direction)`, `tick(game)`, `togglePause(game)` and `restart(game)`, each returning a new game; and `DIRECTIONS`, mapping each direction to its `{ x, y }` step.
- The game state's fields are exactly the spec's table.

**Failing tests:** write `test/rng.test.js` exactly as follows, and watch it fail first.

```js
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
```

**Failing tests:** write `test/game.test.js` exactly as follows, and watch it fail first.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, start, turn, tick, togglePause, restart } from '../src/game.js'

const key = (cell) => `${cell.x},${cell.y}`
const onSnake = (game, cell) => game.snake.some((c) => key(c) === key(cell))

test('a new game is ready, with a three-cell snake in the middle moving right, and food off the snake', () => {
  const g = createGame({ width: 20, height: 20, seed: 1 })
  assert.equal(g.status, 'ready')
  assert.deepEqual(g.snake, [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }])
  assert.equal(g.direction, 'right')
  assert.deepEqual([g.score, g.foodsEaten, g.level, g.tickMs, g.ticks], [0, 0, 1, 150, 0])
  assert.ok(g.food.x >= 0 && g.food.x < 20 && g.food.y >= 0 && g.food.y < 20)
  assert.equal(onSnake(g, g.food), false)
})

test('tick does nothing until the game starts, then moves the snake one cell', () => {
  const g = createGame({ seed: 1 })
  assert.deepEqual(tick(g), g)
  const moved = tick(start(g))
  assert.deepEqual(moved.snake, [{ x: 11, y: 10 }, { x: 10, y: 10 }, { x: 9, y: 10 }])
  assert.equal(moved.ticks, 1)
})

test('the functions return new games and leave their input unchanged', () => {
  const g = start(createGame({ seed: 1 }))
  const copy = structuredClone(g)
  tick(g)
  turn(g, 'up')
  togglePause(g)
  restart(g)
  assert.deepEqual(g, copy)
})

test('a turn takes effect on the next tick, and reversing is ignored', () => {
  let g = start(createGame({ seed: 1 }))
  g = tick(turn(g, 'left'))
  assert.deepEqual(g.snake[0], { x: 11, y: 10 })
  g = tick(turn(g, 'up'))
  assert.deepEqual(g.snake[0], { x: 11, y: 9 })
  assert.equal(g.direction, 'up')
})

test('two quick turns are kept for the next two ticks', () => {
  let g = start(createGame({ seed: 1 }))
  g = turn(turn(g, 'up'), 'left')
  g = tick(g)
  assert.deepEqual(g.snake[0], { x: 10, y: 9 })
  g = tick(g)
  assert.deepEqual(g.snake[0], { x: 9, y: 9 })
})

test('eating grows the snake, scores 10 times the level, and puts new food on a free cell', () => {
  let g = start(createGame({ seed: 3 }))
  g = tick({ ...g, food: { x: 11, y: 10 } })
  assert.equal(g.snake.length, 4)
  assert.deepEqual(g.snake[0], { x: 11, y: 10 })
  assert.deepEqual([g.score, g.foodsEaten], [10, 1])
  assert.equal(onSnake(g, g.food), false)
})

test('every fifth food raises the level and speeds the game up, down to 60 ms', () => {
  let g = start(createGame({ seed: 5 }))
  for (let i = 0; i < 5; i++) {
    const head = g.snake[0]
    g = tick({ ...g, food: { x: head.x + 1, y: head.y } })
  }
  assert.deepEqual([g.level, g.tickMs, g.score], [2, 135, 50])
  const head = g.snake[0]
  g = tick({ ...g, tickMs: 65, foodsEaten: 9, food: { x: head.x + 1, y: head.y } })
  assert.deepEqual([g.level, g.tickMs], [3, 60])
})

test('hitting a wall ends the game, and the snake stays put', () => {
  let g = start(createGame({ width: 20, height: 20, seed: 1 }))
  for (let i = 0; i < 9; i++) g = tick(g)
  assert.equal(g.status, 'running')
  assert.equal(g.snake[0].x, 19)
  g = tick(g)
  assert.equal(g.status, 'over')
  assert.deepEqual(g.snake[0], { x: 19, y: 10 })
})

test('running into the body ends the game, but the cell the tail leaves is free', () => {
  const base = start(createGame({ seed: 1 }))
  const body = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }]
  let g = { ...base, snake: body, direction: 'left', queue: [], food: { x: 0, y: 0 } }
  assert.equal(tick(turn(g, 'down')).status, 'over')
  const square = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }]
  g = { ...base, snake: square, direction: 'left', queue: [], food: { x: 0, y: 0 } }
  const next = tick(turn(g, 'down'))
  assert.equal(next.status, 'running')
  assert.deepEqual(next.snake[0], { x: 5, y: 6 })
})

test('pause stops the ticks until the game resumes', () => {
  let g = togglePause(start(createGame({ seed: 1 })))
  assert.equal(g.status, 'paused')
  assert.deepEqual(tick(g), g)
  g = togglePause(g)
  assert.equal(g.status, 'running')
})

test('eating the last free cell wins the game', () => {
  const base = start(createGame({ width: 4, height: 4, seed: 1 }))
  const cells = [[1, 3], [2, 3], [3, 3], [3, 2], [2, 2], [1, 2], [0, 2], [0, 1], [1, 1], [2, 1], [3, 1], [3, 0], [2, 0], [1, 0], [0, 0]]
  const snake = cells.map(([x, y]) => ({ x, y }))
  const g = tick({ ...base, snake, direction: 'left', queue: [], food: { x: 0, y: 3 } })
  assert.equal(g.status, 'won')
  assert.equal(g.snake.length, 16)
  assert.equal(g.food, null)
})

test('restart makes a new ready game on the same board', () => {
  const g = tick(start(createGame({ width: 12, height: 10, seed: 9 })))
  const r = restart(g)
  assert.equal(r.status, 'ready')
  assert.deepEqual([r.width, r.height, r.score, r.ticks, r.snake.length, r.level, r.tickMs], [12, 10, 0, 0, 3, 1, 150])
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Rules" section.

**Acceptance:** `npm test` passes; neither module imports three.js or touches the DOM.

### Task 2: Keyboard and touch input

**Aether:**
- Tier: haiku — exact tests pin down small functions
- Area: ui
- Owns: `src/input.js`, `test/input.test.js`
- Depends on: none

**Interfaces:**
- `src/input.js` exports `keyToCommand(key)`, `swipeToDirection(dx, dy, minDistance = 30)` and `attachInput(target, onCommand) → detach`.

**Failing tests:** write `test/input.test.js` exactly as follows, and watch it fail first.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { keyToCommand, swipeToDirection, attachInput } from '../src/input.js'

test('keyToCommand maps the arrows, WASD, pause and restart keys', () => {
  const cases = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', S: 'down', a: 'left', D: 'right', ' ': 'pause', p: 'pause', Enter: 'restart', r: 'restart', x: null, Shift: null }
  for (const [key, command] of Object.entries(cases)) assert.equal(keyToCommand(key), command, key)
})

test('swipeToDirection follows the dominant axis and ignores short swipes', () => {
  assert.equal(swipeToDirection(50, 10), 'right')
  assert.equal(swipeToDirection(-50, 20), 'left')
  assert.equal(swipeToDirection(5, -60), 'up')
  assert.equal(swipeToDirection(0, 45), 'down')
  assert.equal(swipeToDirection(10, 12), null)
  assert.equal(swipeToDirection(20, 0, 15), 'right')
})

// Stands in for window: records the listeners and fires plain event objects at them.
function fakeTarget() {
  const listeners = {}
  return {
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn)
    },
    fire: (type, event) => (listeners[type] || []).forEach((fn) => fn(event)),
  }
}

test('attachInput sends the commands of game keys, prevents their default, and detaches', () => {
  const target = fakeTarget()
  const commands = []
  let prevented = 0
  const press = (key) => target.fire('keydown', { key, preventDefault: () => prevented++ })
  const detach = attachInput(target, (command) => commands.push(command))
  press('ArrowUp')
  press('q')
  press(' ')
  assert.deepEqual(commands, ['up', 'pause'])
  assert.equal(prevented, 2)
  detach()
  press('ArrowDown')
  assert.deepEqual(commands, ['up', 'pause'])
})

test('attachInput turns a swipe into a direction', () => {
  const target = fakeTarget()
  const commands = []
  attachInput(target, (command) => commands.push(command))
  target.fire('touchstart', { touches: [{ clientX: 100, clientY: 100 }] })
  target.fire('touchend', { changedTouches: [{ clientX: 100, clientY: 20 }] })
  assert.deepEqual(commands, ['up'])
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Input" section.

**Acceptance:** `npm test` passes.

### Task 3: The high score

**Aether:**
- Tier: haiku — exact tests pin down two small functions
- Area: core
- Owns: `src/storage.js`, `test/storage.test.js`
- Depends on: none

**Interfaces:**
- `src/storage.js` exports `HIGH_SCORE_KEY`, `loadHighScore(storage)` and `saveHighScore(storage, score)`.

**Failing tests:** write `test/storage.test.js` exactly as follows, and watch it fail first.

```js
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
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "High score" section.

**Acceptance:** `npm test` passes.

### Task 4: The art direction: theme and helpers

**Aether:**
- Tier: sonnet — the theme sets the whole game's look; creative judgment the tests cannot pin down
- Area: render
- Owns: `src/render/theme.js`, `test/theme.test.js`
- Depends on: none

**Interfaces:**
- `src/render/theme.js` exports `CELL`, `THEME = { name, colors, bloom }`, `gridToWorld(x, y, width, height) → { x, z }`, `lerp`, `easeOutCubic`, `clamp01` and `bodyColor(index, length)`.

**Failing tests:** write `test/theme.test.js` exactly as follows, and watch it fail first.

```js
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
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Look and 3D" section.

**Acceptance:** `npm test` passes. The theme is a deliberate, coherent art direction with a name and a mood. The world, the snake view, the HUD and the effects all build on it, so choose the palette for contrast and readability: the snake and the food must stand out against the board.

### Task 5: The HUD and the page

**Aether:**
- Tier: sonnet — UI layout and styling the tests cannot pin down
- Area: ui
- Owns: `index.html`, `styles.css`, `src/hud.js`, `test/hud.test.js`
- Depends on: Task 4 — styles the HUD in the theme's palette and mood

**Interfaces:**
- `src/hud.js` exports `hudModel({ status, score, highScore, level, isNewBest }) → { score, best, level, panel }` (pure) and `createHud(root) → { update(model), element }` (DOM).
- `index.html` holds `<canvas id="game">`, `<div id="hud">`, the spec's import map, `styles.css`, and `src/main.js` as a module (Task 8 writes `src/main.js`).

**Failing tests:** write `test/hud.test.js` exactly as follows, and watch it fail first.

```js
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
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "HUD and screens" section.

**Acceptance:** `npm test` passes. The HUD is readable over the scene, fits a 390 × 844 phone and a desktop, and the page has no scrollbars. The HUD's typography, colors and panels carry the theme in `src/render/theme.js` (Task 4).

### Task 6: The 3D world and the camera

**Aether:**
- Tier: sonnet — 3D scene composition and lighting the tests cannot fully pin down
- Area: render
- Owns: `src/render/world.js`, `test/world.test.js`
- Depends on: Task 4 — builds the world from THEME, CELL and gridToWorld

**Interfaces:**
- `src/render/world.js` exports `buildWorld({ width, height, theme }) → THREE.Group` and `frameCamera(camera, { width, height, aspect })`.
- Consumes `CELL`, `THEME` and `gridToWorld` from `src/render/theme.js` (Task 4).

**Failing tests:** write `test/world.test.js` exactly as follows, and watch it fail first.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildWorld, frameCamera } from '../src/render/world.js'
import { THEME } from '../src/render/theme.js'

test('buildWorld holds a board that spans the cells, walls, and a shadow-casting light', () => {
  const world = buildWorld({ width: 20, height: 20, theme: THEME })
  assert.equal(world.name, 'world')
  const board = world.getObjectByName('board')
  const walls = world.getObjectByName('walls')
  assert.ok(board && (board.isMesh || board.isInstancedMesh), 'board mesh')
  assert.ok(walls, 'walls')
  assert.equal(board.receiveShadow, true)
  const size = new THREE.Box3().setFromObject(board).getSize(new THREE.Vector3())
  assert.ok(Math.abs(size.x - 20) <= 0.5 && Math.abs(size.z - 20) <= 0.5, `board size ${size.x} x ${size.z}`)
  const lights = []
  world.traverse((o) => o.isDirectionalLight && o.castShadow && lights.push(o))
  assert.ok(lights.length >= 1, 'a shadow-casting directional light')
})

test('frameCamera keeps the whole board in view from an angle, in landscape and portrait', () => {
  for (const aspect of [16 / 9, 9 / 16, 1]) {
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000)
    frameCamera(camera, { width: 20, height: 20, aspect })
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
      const p = new THREE.Vector3(x, 0, z).project(camera)
      assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1, `aspect ${aspect.toFixed(2)}, corner ${x},${z}`)
    }
    assert.ok(camera.position.y > 0, 'above the board')
    assert.ok(Math.hypot(camera.position.x, camera.position.z) > 1, 'at an angle, not straight down')
  }
})
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Look and 3D" section.

**Acceptance:** `npm test` passes. The board, walls, lights and any decoration make a scene worth looking at: real depth, shadows, and an atmosphere that fits the theme. Nothing creates geometries or materials per frame.

### Task 7: The snake, the food and the effects

**Aether:**
- Tier: sonnet — animation, interpolation and visual effects the tests cannot fully pin down
- Area: render
- Owns: `src/render/snake-view.js`, `test/snake-view.test.js`
- Depends on: Task 1 — draws the game state that createGame and tick produce
- Depends on: Task 4 — uses THEME, CELL, gridToWorld and bodyColor

**Interfaces:**
- `src/render/snake-view.js` exports `HEADING` and `createSnakeView({ scene, theme, width, height }) → { update(game, alpha, timeMs), segmentPositions(), onEat(cell), onGameOver(), activeEffects(), reset(), dispose() }`.
- Consumes the game state of `src/game.js` (Task 1) and the theme helpers of `src/render/theme.js` (Task 4).

**Failing tests:** write `test/snake-view.test.js` exactly as follows, and watch it fail first.

```js
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
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Look and 3D" section.

**Acceptance:** `npm test` passes. The snake moves smoothly, its head is distinct and faces its way, the food is animated, eating bursts, and game over has a visible effect. Body segments come from an `InstancedMesh` or a pool, and nothing creates geometries or materials per tick or per frame.

### Task 8: The game loop and the wiring

**Aether:**
- Tier: sonnet — integration of every module with rendering and post-processing
- Area: ui
- Owns: `src/main.js`, `src/loop.js`, `test/loop.test.js`
- Depends on: Task 1 — runs the rules
- Depends on: Task 2 — reads the input
- Depends on: Task 3 — keeps the high score
- Depends on: Task 5 — shows the HUD in index.html
- Depends on: Task 6 — builds the world and frames the camera
- Depends on: Task 7 — draws the snake and the effects

**Interfaces:**
- `src/loop.js` exports `createLoop({ startMs }) → { advance(nowMs, tickMs) → { ticks, alpha }, reset(nowMs) }` (pure).
- `src/main.js` exports nothing; it wires every module and defines `window.snake` with `getState()` and `getRenderInfo()`, exactly as the spec says.

**Failing tests:** write `test/loop.test.js` exactly as follows, and watch it fail first.

```js
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
```

**Implementation:** make these tests pass within the Interfaces, following the spec's "Game loop and wiring" section.

**Acceptance:** `npm test` passes, and `npm start` serves a game that plays as the spec describes: the title screen, start, turning, eating with its effect, levelling up with visible feedback, pause, game over with its effect, restart, the high score, `?seed=`, resizing, and the debug API. The renderer uses antialiasing, shadows, ACES Filmic tone mapping and sRGB output, and caps the pixel ratio at 2.
