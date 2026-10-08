# Brief: Task 4: The art direction: theme and helpers

- Plan: /home/darkarty/.cache/aether-trial2/aether/repo/.worktrees/trial/docs/plan.md
- Spec: docs/spec.md
- Tier: sonnet — the theme sets the whole game's look; creative judgment the tests cannot pin down
- Area: render
- Owns: src/render/theme.js, test/theme.test.js

Change only the files your task owns. Exact values in the task text are requirements: use them verbatim.

## Global Constraints

- **The browser side:** ES modules with no build step. three.js 0.186.1 comes from `node_modules` through the import map in `index.html`; there is no CDN and no other dependency.
- **The tests:** Node.js 22 with ES modules (`"type": "module"`). `npm test` runs `node --test`, and tests may import `three`. Run `npm ci` in a fresh checkout or worktree before testing.
- **Purity:** the rules, input mapping, storage, theme helpers, HUD model and loop are pure, or take their dependencies as arguments.
- **Performance:** nothing creates geometries or materials per tick or per frame.
- **Error messages** start with the spec's prefixes.

## Task

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
