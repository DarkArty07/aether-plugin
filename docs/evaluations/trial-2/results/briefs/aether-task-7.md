# Brief: Task 7: The snake, the food and the effects

- Plan: /home/darkarty/.cache/aether-trial2/aether/repo/.worktrees/trial/docs/plan.md
- Spec: docs/spec.md
- Tier: sonnet — animation, interpolation and visual effects the tests cannot fully pin down
- Area: render
- Owns: src/render/snake-view.js, test/snake-view.test.js

Change only the files your task owns. Exact values in the task text are requirements: use them verbatim.

## Global Constraints

- **The browser side:** ES modules with no build step. three.js 0.186.1 comes from `node_modules` through the import map in `index.html`; there is no CDN and no other dependency.
- **The tests:** Node.js 22 with ES modules (`"type": "module"`). `npm test` runs `node --test`, and tests may import `three`. Run `npm ci` in a fresh checkout or worktree before testing.
- **Purity:** the rules, input mapping, storage, theme helpers, HUD model and loop are pure, or take their dependencies as arguments.
- **Performance:** nothing creates geometries or materials per tick or per frame.
- **Error messages** start with the spec's prefixes.

## Task

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
