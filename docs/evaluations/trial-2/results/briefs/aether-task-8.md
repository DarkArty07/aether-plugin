# Brief: Task 8: The game loop and the wiring

- Plan: /home/darkarty/.cache/aether-trial2/aether/repo/.worktrees/trial/docs/plan.md
- Spec: docs/spec.md
- Tier: sonnet — integration of every module with rendering and post-processing
- Area: ui
- Owns: src/main.js, src/loop.js, test/loop.test.js

Change only the files your task owns. Exact values in the task text are requirements: use them verbatim.

## Global Constraints

- **The browser side:** ES modules with no build step. three.js 0.186.1 comes from `node_modules` through the import map in `index.html`; there is no CDN and no other dependency.
- **The tests:** Node.js 22 with ES modules (`"type": "module"`). `npm test` runs `node --test`, and tests may import `three`. Run `npm ci` in a fresh checkout or worktree before testing.
- **Purity:** the rules, input mapping, storage, theme helpers, HUD model and loop are pure, or take their dependencies as arguments.
- **Performance:** nothing creates geometries or materials per tick or per frame.
- **Error messages** start with the spec's prefixes.

## Task

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
