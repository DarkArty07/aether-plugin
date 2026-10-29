# Snake 3D: tasks

**Spec:** [spec.md](spec.md)

Plan: [plan.md](plan.md). The requirement ids `R1` to `R13` and the criteria `C1` to `C4` are defined in the plan. The user stories of the checklist: US1 play the game correctly and smoothly, US2 see a good-looking 3D scene (theme "Neon Dusk"), US3 read the HUD and the screens.

## Global Constraints

- Node.js 22, ES modules (`"type": "module"`), no semicolons, two-space indent, single quotes, no TypeScript, no build step. The only dependency is `three` 0.186.1. Do not edit `package.json`, `package-lock.json`, `scripts/serve.js` or `README.md`.
- Tests use `node:test` and `node:assert/strict`, live in `test/<name>.test.js`, and are run with `node --test <file>`. `node --test` runs every `.js` file under `test/`, so never put helper files there: helpers live inside the test file.
- Work test-first: write the test file exactly as given, run it and see it fail, then write the code until it passes. Do not weaken a test. If a test seems wrong, say so in the report instead of editing it.
- Change only the files in your `Owns` line. Do not touch `specs/` or `.specify/`.
- Pure modules `src/rng.js`, `src/game.js`, `src/loop.js`, `src/storage.js`, `src/render/theme.js`, `src/app.js` and `hudModel` in `src/hud.js` import neither `three` nor use the DOM. `src/input.js` and `src/hud.js` never read a global `document` or `window` at import time or at call time: `createHud` uses `root.ownerDocument`, `attachInput` uses the `target` it is given.
- `src/render/world.js` and `src/render/snake-view.js` may import `three`, but must build and update their objects without a WebGL context, a canvas, `document` or `window` (a `THREE.Scene` and a `THREE.PerspectiveCamera` are enough). They create no geometry or material per tick or per frame: everything is created once, and pooled.
- Game vocabulary: the grid has `x` growing to the right and `y` growing down; directions are the strings `'up'`, `'down'`, `'left'`, `'right'`; commands are those four plus `'pause'` and `'restart'`; game status is `'ready'`, `'running'`, `'paused'`, `'over'` or `'won'`. The game state is a plain object and every game function returns a new one without changing its input.
- Theme "Neon Dusk" (the one look for every visual task): the palette, the bloom values and the fonts live in `src/render/theme.js` only. Other modules import `THEME` and never write a colour literal, except `styles.css`, which uses the same hex values: background `#07061a`, accent `#ff3d9a`, mint `#3dffd6`, cyan `#20c8ff`, violet `#9b5cff`, amber `#ffb52e`, ink `#e9e6ff`.
- Colours given as `0x......` are 24-bit integers. `new THREE.Color(hex)` is used for them.
- Shadow type is `THREE.PCFShadowMap` (r186 removed `PCFSoftShadowMap`).

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] [US1] Seeded random numbers (mulberry32) in src/rng.js → Task 1
- [ ] T002 [P] [US1] Key, swipe and input listener in src/input.js → Task 2
- [ ] T003 [P] [US1] High score storage that never throws in src/storage.js → Task 3
- [ ] T004 [P] [US1] Fixed-step game loop with a 5-tick cap in src/loop.js → Task 4
- [ ] T005 [P] [US2] Theme "Neon Dusk", grid mapping and helpers in src/render/theme.js → Task 5
- [ ] T006 [P] [US3] HUD model and HUD builder in src/hud.js → Task 6
- [ ] T007 [P] [US1] Game rules in src/game.js → Task 7
- [ ] T008 [P] [US2] Board, walls, lights, decoration and camera framing in src/render/world.js → Task 8
- [ ] T009 [P] [US2] Snake, food and effects with interpolation in src/render/snake-view.js → Task 9
- [ ] T010 [P] [US3] Page shell and HUD styling in index.html and styles.css → Task 10
- [ ] T011 [US1] Game flow, high score wiring and debug state in src/app.js → Task 11
- [ ] T012 [US2] Renderer, bloom, resize and boot in src/main.js → Task 12

### Task 1: Seeded random numbers

**Aether:**
- Review: high — every seeded game, food placement and effect depends on these exact numbers
- Area: rules
- Owns: `src/rng.js`, `test/rng.test.js`
- Depends on: none
- Serves: R2

**Interfaces:**

```ts
// src/rng.js: pure, no imports
export function nextRandom(state)    // state: uint32 -> { value: number in [0, 1), state: uint32 }
export function randomInt(state, n)  // n: integer >= 1 -> { value: integer in [0, n), state: uint32 }; throws Error('invalid range: ' + n) otherwise
```

`nextRandom` is mulberry32. With `state` a 32-bit unsigned integer:

```js
const next = (state + 0x6D2B79F5) >>> 0
let t = next
t = Math.imul(t ^ (t >>> 15), t | 1)
t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next }
```

`randomInt(state, n)` calls `nextRandom(state)` once and returns `{ value: Math.floor(value * n), state }`. Neither function reads or writes anything else.

**Tests (write first):** `test/rng.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRandom, randomInt } from '../src/rng.js'

test('nextRandom follows the mulberry32 vectors for seed 1', () => {
  const expected = [
    [0.6270739405881613, 1831565814],
    [0.002735721180215478, 3663131627],
    [0.5274470399599522, 1199730144],
  ]
  let state = 1
  for (const [value, next] of expected) {
    const r = nextRandom(state)
    assert.equal(r.value, value)
    assert.equal(r.state, next)
    state = r.state
  }
})

test('nextRandom at the edges of the state range', () => {
  assert.deepEqual(nextRandom(0), { value: 0.26642920868471265, state: 1831565813 })
  assert.deepEqual(nextRandom(4294967295), { value: 0.8964226141106337, state: 1831565812 })
})

test('values stay in [0, 1) and states stay unsigned 32-bit over 10000 draws', () => {
  let state = 12345
  for (let i = 0; i < 10000; i++) {
    const r = nextRandom(state)
    assert.ok(r.value >= 0 && r.value < 1)
    assert.ok(Number.isInteger(r.state) && r.state >= 0 && r.state <= 4294967295)
    state = r.state
  }
})

test('nextRandom is deterministic', () => {
  assert.deepEqual(nextRandom(777), nextRandom(777))
  assert.notDeepEqual(nextRandom(777), nextRandom(778))
})

test('randomInt returns an integer in [0, n) and the same state as nextRandom', () => {
  let state = 99
  const seen = new Set()
  for (let i = 0; i < 600; i++) {
    const r = randomInt(state, 6)
    assert.ok(Number.isInteger(r.value) && r.value >= 0 && r.value < 6)
    assert.equal(r.state, nextRandom(state).state)
    assert.equal(r.value, Math.floor(nextRandom(state).value * 6))
    seen.add(r.value)
    state = r.state
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5])
})

test('randomInt with n = 1 is always 0', () => {
  let state = 5
  for (let i = 0; i < 50; i++) {
    const r = randomInt(state, 1)
    assert.equal(r.value, 0)
    state = r.state
  }
})

test('randomInt rejects a range that is not an integer of at least 1', () => {
  for (const n of [0, -1, 1.5, NaN, Infinity, undefined, '3']) {
    assert.throws(() => randomInt(1, n), /invalid range/, String(n))
  }
})
```

**Acceptance:** `node --test test/rng.test.js` passes. `src/rng.js` has no imports.

### Task 2: Input

**Aether:**
- Area: core
- Owns: `src/input.js`, `test/input.test.js`
- Depends on: none
- Serves: R4

**Interfaces:**

```ts
// src/input.js: no imports, no global document/window
export function keyToCommand(key)                       // string -> 'up'|'down'|'left'|'right'|'pause'|'restart'|null
export function swipeToDirection(dx, dy, minDistance = 30) // -> 'up'|'down'|'left'|'right'|null
export function attachInput(target, onCommand)          // -> detach(): void
```

- `keyToCommand`: `ArrowUp`/`w`/`W` give `'up'`; `ArrowDown`/`s`/`S` give `'down'`; `ArrowLeft`/`a`/`A` give `'left'`; `ArrowRight`/`d`/`D` give `'right'`; `' '`, `p`, `P`, `Escape` give `'pause'`; `Enter`, `r`, `R` give `'restart'`; anything else (including non-strings) gives `null`.
- `swipeToDirection`: `null` when `Math.hypot(dx, dy) < minDistance`. Otherwise the dominant axis: `|dx| >= |dy|` is horizontal (`dx > 0` is `'right'`, else `'left'`), otherwise vertical (`dy > 0` is `'down'`, since `y` grows down, else `'up'`).
- `attachInput(target, onCommand)` registers three listeners on `target` with `addEventListener`: `keydown`, `touchstart`, `touchend`. `target` is any object with `addEventListener(type, fn)` and `removeEventListener(type, fn)`.
  - `keydown`: if `event.ctrlKey`, `event.metaKey` or `event.altKey` is true, do nothing at all (the browser shortcuts such as Ctrl+R must keep working). Otherwise compute `keyToCommand(event.key)`; if it is `null`, do nothing. Else call `event.preventDefault()`, and call `onCommand(command)`, except that when `event.repeat === true` and the command is `'pause'` or `'restart'`, do not call `onCommand` (a held key must not toggle the pause again and again). Direction keys with `repeat` still call `onCommand`.
  - `touchstart`: remember `{ x, y }` from `event.changedTouches[0]` (or `event.touches[0]`): `clientX`, `clientY`.
  - `touchend`: if a start is remembered, take the point of `event.changedTouches[0]`, compute `swipeToDirection(endX - startX, endY - startY)`, forget the start, and call `onCommand(direction)` when it is not `null`. Touch events are not prevented. A `touchend` with no remembered start does nothing and never throws.
  - Returns `detach()`, which removes the three listeners (calling it twice is safe).

**Tests (write first):** `test/input.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { keyToCommand, swipeToDirection, attachInput } from '../src/input.js'

function fakeTarget() {
  const handlers = new Map()
  return {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type).add(fn)
    },
    removeEventListener(type, fn) {
      handlers.get(type)?.delete(fn)
    },
    dispatch(type, event) {
      for (const fn of [...(handlers.get(type) ?? [])]) fn(event)
    },
    listenerCount() {
      let n = 0
      for (const set of handlers.values()) n += set.size
      return n
    },
  }
}
const keydown = (key, extra = {}) => ({ key, prevented: false, preventDefault() { this.prevented = true }, ...extra })
const touch = (x, y) => ({ changedTouches: [{ clientX: x, clientY: y }], touches: [{ clientX: x, clientY: y }], preventDefault() {} })

test('arrows and WASD, in either case', () => {
  const table = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', W: 'up', a: 'left', A: 'left', s: 'down', S: 'down', d: 'right', D: 'right',
  }
  for (const [key, command] of Object.entries(table)) assert.equal(keyToCommand(key), command, key)
})

test('pause and restart keys', () => {
  for (const key of [' ', 'p', 'P', 'Escape']) assert.equal(keyToCommand(key), 'pause', key)
  for (const key of ['Enter', 'r', 'R']) assert.equal(keyToCommand(key), 'restart', key)
})

test('anything else gives null', () => {
  for (const key of ['x', 'Tab', '1', 'Shift', '', 'ArrowUpp', undefined, null, 42]) assert.equal(keyToCommand(key), null, String(key))
})

test('swipeToDirection uses the dominant axis and the minimum distance', () => {
  assert.equal(swipeToDirection(50, 0), 'right')
  assert.equal(swipeToDirection(-50, 0), 'left')
  assert.equal(swipeToDirection(0, 50), 'down')
  assert.equal(swipeToDirection(0, -50), 'up')
  assert.equal(swipeToDirection(10, 60), 'down')
  assert.equal(swipeToDirection(60, -10), 'right')
  assert.equal(swipeToDirection(40, 40), 'right')
  assert.equal(swipeToDirection(20, 20), null)
  assert.equal(swipeToDirection(0, 0), null)
  assert.equal(swipeToDirection(30, 0), 'right')
  assert.equal(swipeToDirection(29, 0), null)
  assert.equal(swipeToDirection(20, 0, 10), 'right')
  assert.equal(swipeToDirection(5, 0, 10), null)
})

test('attachInput: keys call onCommand and prevent the default of game keys', () => {
  const target = fakeTarget()
  const commands = []
  attachInput(target, (c) => commands.push(c))
  const up = keydown('ArrowUp')
  target.dispatch('keydown', up)
  const space = keydown(' ')
  target.dispatch('keydown', space)
  const other = keydown('x')
  target.dispatch('keydown', other)
  assert.deepEqual(commands, ['up', 'pause'])
  assert.equal(up.prevented, true)
  assert.equal(space.prevented, true)
  assert.equal(other.prevented, false)
})

test('attachInput: keys with a modifier are left to the browser', () => {
  const target = fakeTarget()
  const commands = []
  attachInput(target, (c) => commands.push(c))
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    const e = keydown('r', extra)
    target.dispatch('keydown', e)
    assert.equal(e.prevented, false)
  }
  assert.deepEqual(commands, [])
})

test('attachInput: a held pause or restart key does not repeat, a held arrow does', () => {
  const target = fakeTarget()
  const commands = []
  attachInput(target, (c) => commands.push(c))
  const space = keydown(' ', { repeat: true })
  target.dispatch('keydown', space)
  target.dispatch('keydown', keydown('Enter', { repeat: true }))
  target.dispatch('keydown', keydown('ArrowLeft', { repeat: true }))
  assert.deepEqual(commands, ['left'])
  assert.equal(space.prevented, true)
})

test('attachInput: a swipe gives a direction, a short touch gives nothing', () => {
  const target = fakeTarget()
  const commands = []
  attachInput(target, (c) => commands.push(c))
  target.dispatch('touchstart', touch(100, 100))
  target.dispatch('touchend', touch(180, 110))
  target.dispatch('touchstart', touch(100, 100))
  target.dispatch('touchend', touch(105, 105))
  target.dispatch('touchstart', touch(100, 100))
  target.dispatch('touchend', touch(95, 20))
  target.dispatch('touchend', touch(300, 300))
  assert.deepEqual(commands, ['right', 'up'])
})

test('attachInput: detach removes every listener and is safe to call twice', () => {
  const target = fakeTarget()
  const commands = []
  const detach = attachInput(target, (c) => commands.push(c))
  assert.equal(target.listenerCount(), 3)
  detach()
  assert.equal(target.listenerCount(), 0)
  target.dispatch('keydown', keydown('ArrowUp'))
  detach()
  assert.deepEqual(commands, [])
})
```

**Acceptance:** `node --test test/input.test.js` passes. The module reads no global.

### Task 3: High score storage

**Aether:**
- Review: high — it writes the player's saved score and must never throw
- Area: core
- Owns: `src/storage.js`, `test/storage.test.js`
- Depends on: none
- Serves: R5

**Interfaces:**

```ts
// src/storage.js: no imports
export const HIGH_SCORE_KEY = 'snake3d.highScore'
export function loadHighScore(storage)        // storage: { getItem, setItem } | null | undefined -> non-negative integer
export function saveHighScore(storage, score) // -> the best of the stored score and score
```

- `loadHighScore(storage)`: reads `storage.getItem(HIGH_SCORE_KEY)`. Returns the number when the value is a string made only of decimal digits (`/^\d+$/`) and `Number(value)` is a safe integer; returns 0 for anything else (null, `''`, `'-5'`, `'12.5'`, `'1e3'`, `'abc'`, a missing `storage`, or a `getItem` that throws).
- `saveHighScore(storage, score)`: `score` counts only when `Number.isSafeInteger(score) && score >= 0`, otherwise it counts as 0. `best = Math.max(loadHighScore(storage), score)`. When `best` is greater than the stored value, it calls `storage.setItem(HIGH_SCORE_KEY, String(best))`. It returns `best` even when `storage` is missing or `setItem` throws.
- Neither function ever throws.

**Tests (write first):** `test/storage.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { HIGH_SCORE_KEY, loadHighScore, saveHighScore } from '../src/storage.js'

const memory = (initial = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
  }
}

test('the key', () => {
  assert.equal(HIGH_SCORE_KEY, 'snake3d.highScore')
})

test('loadHighScore reads a stored non-negative integer', () => {
  assert.equal(loadHighScore(memory({ [HIGH_SCORE_KEY]: '42' })), 42)
  assert.equal(loadHighScore(memory({ [HIGH_SCORE_KEY]: '0' })), 0)
})

test('loadHighScore gives 0 for anything else', () => {
  for (const bad of [null, '', '-5', '12.5', '1e3', 'abc', ' 7', '99999999999999999999']) {
    assert.equal(loadHighScore(memory({ [HIGH_SCORE_KEY]: bad })), 0, String(bad))
  }
  assert.equal(loadHighScore(memory()), 0)
})

test('loadHighScore never throws', () => {
  assert.equal(loadHighScore(undefined), 0)
  assert.equal(loadHighScore(null), 0)
  assert.equal(loadHighScore({}), 0)
  assert.equal(loadHighScore({ getItem() { throw new Error('denied') } }), 0)
})

test('saveHighScore keeps the best and returns it', () => {
  const s = memory({ [HIGH_SCORE_KEY]: '10' })
  assert.equal(saveHighScore(s, 5), 10)
  assert.equal(s.data[HIGH_SCORE_KEY], '10')
  assert.equal(saveHighScore(s, 20), 20)
  assert.equal(s.data[HIGH_SCORE_KEY], '20')
  assert.equal(loadHighScore(s), 20)
})

test('saveHighScore on an empty storage', () => {
  const s = memory()
  assert.equal(saveHighScore(s, 30), 30)
  assert.equal(s.data[HIGH_SCORE_KEY], '30')
})

test('saveHighScore ignores a score that is not a non-negative integer', () => {
  for (const bad of [NaN, -1, 3.7, 'x', undefined, null, Infinity]) {
    const s = memory({ [HIGH_SCORE_KEY]: '10' })
    assert.equal(saveHighScore(s, bad), 10, String(bad))
    assert.equal(s.data[HIGH_SCORE_KEY], '10')
  }
})

test('saveHighScore never throws, even without a working storage', () => {
  assert.equal(saveHighScore(undefined, 5), 5)
  assert.equal(saveHighScore(null, 5), 5)
  assert.equal(saveHighScore({ getItem() { throw new Error('x') }, setItem() { throw new Error('y') } }, 8), 8)
  assert.equal(saveHighScore({ getItem: () => '3', setItem() { throw new Error('full') } }, 8), 8)
})
```

**Acceptance:** `node --test test/storage.test.js` passes.

### Task 4: Game loop

**Aether:**
- Area: core
- Owns: `src/loop.js`, `test/loop.test.js`
- Depends on: none
- Serves: R11

**Interfaces:**

```ts
// src/loop.js: pure, no imports
export function createLoop({ startMs = 0 } = {}) // -> { advance(nowMs, tickMs), reset(nowMs) }
// advance(nowMs, tickMs) -> { ticks: integer 0..5, alpha: number in [0, 1) }
// reset(nowMs) -> void
```

State: `prev` (last time seen, starts at `startMs`) and `acc` (milliseconds accumulated, starts at 0).

`advance(nowMs, tickMs)`:
1. `dt = Math.max(0, nowMs - prev)`; then `prev = Math.max(prev, nowMs)`. Time going backwards counts as 0 and does not move `prev` back.
2. If `tickMs` is not a finite number greater than 0, return `{ ticks: 0, alpha: 0 }` and leave `acc` unchanged.
3. `acc += dt`; `ticks = Math.floor(acc / tickMs)`. If `ticks > 5`, set `ticks = 5` and `acc = 0` (the rest is dropped). Otherwise `acc = Math.max(0, acc - ticks * tickMs)`.
4. Return `{ ticks, alpha: acc / tickMs }`. `alpha` is always in [0, 1).

`reset(nowMs)`: `prev = nowMs`, `acc = 0` (the next tick is a full `tickMs` away). `tickMs` may change from one call to the next; `acc` stays in milliseconds.

**Tests (write first):** `test/loop.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createLoop } from '../src/loop.js'

const close = (a, b) => Math.abs(a - b) < 1e-9

test('no tick before tickMs, alpha is the progress', () => {
  const loop = createLoop({ startMs: 1000 })
  assert.deepEqual(loop.advance(1000, 150), { ticks: 0, alpha: 0 })
  const r = loop.advance(1075, 150)
  assert.equal(r.ticks, 0)
  assert.ok(close(r.alpha, 0.5))
})

test('one tick at tickMs and the remainder is carried', () => {
  const loop = createLoop({ startMs: 0 })
  const a = loop.advance(200, 150)
  assert.equal(a.ticks, 1)
  assert.ok(close(a.alpha, 50 / 150))
  const b = loop.advance(300, 150)
  assert.equal(b.ticks, 1)
  assert.ok(close(b.alpha, 0))
})

test('several ticks in one call', () => {
  const loop = createLoop({ startMs: 0 })
  const r = loop.advance(450, 150)
  assert.equal(r.ticks, 3)
  assert.ok(close(r.alpha, 0))
})

test('at most 5 ticks per call, and the rest is dropped', () => {
  const loop = createLoop({ startMs: 0 })
  const r = loop.advance(100000, 150)
  assert.equal(r.ticks, 5)
  assert.ok(r.alpha >= 0 && r.alpha < 1)
  const next = loop.advance(100150, 150)
  assert.equal(next.ticks, 1)
  assert.ok(close(next.alpha, 0))
})

test('alpha is always in [0, 1) and ticks in 0..5', () => {
  const loop = createLoop({ startMs: 0 })
  let now = 0
  for (let i = 0; i < 2000; i++) {
    now += (i * 37) % 400
    const { ticks, alpha } = loop.advance(now, 60 + (i % 5) * 20)
    assert.ok(Number.isInteger(ticks) && ticks >= 0 && ticks <= 5)
    assert.ok(alpha >= 0 && alpha < 1)
  }
})

test('time going backwards counts as 0', () => {
  const loop = createLoop({ startMs: 0 })
  const a = loop.advance(100, 150)
  assert.ok(close(a.alpha, 100 / 150))
  const back = loop.advance(50, 150)
  assert.equal(back.ticks, 0)
  assert.ok(close(back.alpha, 100 / 150))
  const same = loop.advance(100, 150)
  assert.equal(same.ticks, 0)
  assert.ok(close(same.alpha, 100 / 150))
  const later = loop.advance(160, 150)
  assert.equal(later.ticks, 1)
  assert.ok(close(later.alpha, 10 / 150))
})

test('reset makes the next tick a full tickMs away', () => {
  const loop = createLoop({ startMs: 0 })
  loop.advance(100, 150)
  loop.reset(500)
  assert.deepEqual(loop.advance(500, 150), { ticks: 0, alpha: 0 })
  assert.equal(loop.advance(649, 150).ticks, 0)
  assert.equal(loop.advance(650, 150).ticks, 1)
})

test('resuming at a given alpha: reset(now - alpha * tickMs) continues from that alpha', () => {
  const loop = createLoop({ startMs: 0 })
  loop.reset(10000 - 0.5 * 150)
  const r = loop.advance(10000, 150)
  assert.equal(r.ticks, 0)
  assert.ok(close(r.alpha, 0.5))
})

test('a new tickMs applies at once', () => {
  const loop = createLoop({ startMs: 0 })
  loop.advance(100, 150)
  const r = loop.advance(100, 60)
  assert.equal(r.ticks, 1)
  assert.ok(close(r.alpha, 40 / 60))
})

test('an invalid tickMs gives no ticks', () => {
  const loop = createLoop({ startMs: 0 })
  for (const bad of [0, -5, NaN, Infinity, undefined]) {
    assert.deepEqual(loop.advance(1000, bad), { ticks: 0, alpha: 0 }, String(bad))
  }
})
```

**Acceptance:** `node --test test/loop.test.js` passes.

### Task 5: Theme "Neon Dusk"

**Aether:**
- Area: render
- Owns: `src/render/theme.js`, `test/theme.test.js`
- Depends on: none
- Serves: R6

**Interfaces:**

```ts
// src/render/theme.js: pure, no imports
export const CELL = 1
export const THEME = {
  name: 'Neon Dusk',
  colors: { background: 0x07061a, fog: 0x0b0826, board: 0x15133d, boardAlt: 0x1b1850, wall: 0x2c2780,
            snakeHead: 0x3dffd6, snakeBody: 0x20c8ff, snakeTail: 0x9b5cff, food: 0xffb52e,
            particle: 0xffe08a, accent: 0xff3d9a },
  bloom: { strength: 0.85, radius: 0.55, threshold: 0.62 },
}
export function gridToWorld(x, y, width, height) // -> { x, z }
export function lerp(a, b, t)                     // a + (b - a) * t
export function clamp01(t)                        // clamps to [0, 1]
export function easeOutCubic(t)                   // 1 - (1 - clamp01(t)) ** 3
export function bodyColor(index, length)          // -> 24-bit integer
```

- `gridToWorld(x, y, width, height)` returns `{ x: (x - width / 2 + 0.5) * CELL, z: (y - height / 2 + 0.5) * CELL }`: the board is centred on the origin, cell centres are at half-cell offsets, and the grid `y` is the world `z`.
- `bodyColor(index, length)`: `t = length <= 2 ? 0 : clamp01((index - 1) / (length - 2))`. Each of the red, green and blue channels is `Math.round(lerp(from, to, t))` with `from` from `snakeBody` and `to` from `snakeTail`, repacked into one 24-bit integer. Index 1 gives `snakeBody` and index `length - 1` gives `snakeTail` (for `length >= 3`).
- Freeze nothing and add nothing else to `THEME`. The palette above is the whole look and the tests pin it.

**Tests (write first):** `test/theme.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { CELL, THEME, gridToWorld, lerp, clamp01, easeOutCubic, bodyColor } from '../src/render/theme.js'

test('CELL is 1', () => {
  assert.equal(CELL, 1)
})

test('THEME is Neon Dusk with the pinned palette and bloom', () => {
  assert.equal(THEME.name, 'Neon Dusk')
  assert.deepEqual(THEME.colors, {
    background: 0x07061a, fog: 0x0b0826, board: 0x15133d, boardAlt: 0x1b1850, wall: 0x2c2780,
    snakeHead: 0x3dffd6, snakeBody: 0x20c8ff, snakeTail: 0x9b5cff, food: 0xffb52e,
    particle: 0xffe08a, accent: 0xff3d9a,
  })
  assert.deepEqual(THEME.bloom, { strength: 0.85, radius: 0.55, threshold: 0.62 })
})

test('every colour is a 24-bit integer', () => {
  for (const [key, value] of Object.entries(THEME.colors)) {
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffff, key)
  }
})

test('gridToWorld centres the board on the origin', () => {
  assert.deepEqual(gridToWorld(0, 0, 20, 20), { x: -9.5, z: -9.5 })
  assert.deepEqual(gridToWorld(19, 19, 20, 20), { x: 9.5, z: 9.5 })
  assert.deepEqual(gridToWorld(10, 10, 20, 20), { x: 0.5, z: 0.5 })
  assert.deepEqual(gridToWorld(1, 2, 4, 4), { x: -0.5, z: 0.5 })
  assert.deepEqual(gridToWorld(0, 0, 5, 3), { x: -2, z: -1 })
  assert.deepEqual(gridToWorld(4, 2, 5, 3), { x: 2, z: 1 })
})

test('lerp', () => {
  assert.equal(lerp(0, 10, 0.5), 5)
  assert.equal(lerp(2, 4, 0), 2)
  assert.equal(lerp(2, 4, 1), 4)
  assert.equal(lerp(0, 10, 2), 20)
})

test('clamp01', () => {
  assert.equal(clamp01(-3), 0)
  assert.equal(clamp01(0.25), 0.25)
  assert.equal(clamp01(7), 1)
})

test('easeOutCubic', () => {
  assert.equal(easeOutCubic(0), 0)
  assert.equal(easeOutCubic(1), 1)
  assert.equal(easeOutCubic(0.5), 0.875)
  assert.equal(easeOutCubic(-1), 0)
  assert.equal(easeOutCubic(2), 1)
})

const channels = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
const mix = (a, b, t) => {
  const A = channels(a)
  const B = channels(b)
  return (Math.round(lerp(A[0], B[0], t)) << 16) | (Math.round(lerp(A[1], B[1], t)) << 8) | Math.round(lerp(A[2], B[2], t))
}

test('bodyColor runs from snakeBody at index 1 to snakeTail at the last index', () => {
  const { snakeBody, snakeTail } = THEME.colors
  assert.equal(bodyColor(1, 10), snakeBody)
  assert.equal(bodyColor(9, 10), snakeTail)
  assert.equal(bodyColor(5, 10), mix(snakeBody, snakeTail, 4 / 8))
  assert.equal(bodyColor(2, 4), mix(snakeBody, snakeTail, 0.5))
  assert.equal(bodyColor(1, 3), snakeBody)
  assert.equal(bodyColor(2, 3), snakeTail)
  assert.equal(bodyColor(1, 2), snakeBody)
})

test('bodyColor clamps an index outside the body', () => {
  assert.equal(bodyColor(0, 10), THEME.colors.snakeBody)
  assert.equal(bodyColor(99, 10), THEME.colors.snakeTail)
})
```

**Acceptance:** `node --test test/theme.test.js` passes. The module has no imports.

### Task 6: HUD model and HUD builder

**Aether:**
- Area: ui
- Owns: `src/hud.js`, `test/hud.test.js`
- Depends on: none
- Serves: R10

**Interfaces:**

```ts
// src/hud.js: no imports, no global document/window
export function hudModel({ status, score, highScore, level, isNewBest })
  // -> { score: string, best: string, level: string, panel: null | { kind, title, hint, newBest } }
export function createHud(root)  // root: a DOM element (or a minimal stand-in) -> { update(model), element }
```

`hudModel` (pure):
- `score` is `String(score)`, `best` is `String(highScore)`, `level` is `String(level)`. A value that is not a finite number becomes `'0'` for the score and the best, and `'1'` for the level.
- `panel` is `null` for `'running'` and for any unknown status. Otherwise `{ kind: status, title, hint, newBest }`:

| status | title | hint |
|---|---|---|
| `ready` | `SNAKE 3D` | `Arrow keys, WASD or swipe to start` |
| `paused` | `PAUSED` | `Space or tap to resume` |
| `over` | `GAME OVER` | `Enter or tap to play again` |
| `won` | `BOARD CLEARED` | `Enter or tap to play again` |

- `newBest` is `Boolean(isNewBest)` for `over` and `won`, and `false` for `ready` and `paused`.

`createHud(root)` builds this DOM, appends `element` to `root` and returns `{ update(model), element }` where `element` is the `div.hud-root`. It only uses `root.ownerDocument.createElement(tag)` and, on the elements it makes, `appendChild`, `setAttribute`, `className` and `textContent`. It never reads a global `document` or `window`. The class names and attributes are the contract with `styles.css` (Task 10):

```
div.hud-root
  div.hud-bar
    div.hud-stat.hud-score   span.hud-label "SCORE"   span.hud-value
    div.hud-stat.hud-best    span.hud-label "BEST"    span.hud-value
    div.hud-stat.hud-level   span.hud-label "LEVEL"   span.hud-value
  div.hud-panel   attributes: data-kind ("ready" | "paused" | "over" | "won"), data-visible ("true" | "false")
    div.hud-badge  attribute: data-visible ("true" | "false"); text "NEW BEST"
    h1.hud-title
    p.hud-hint
```

`update(model)` writes the three values into the `.hud-value` spans; when `model.panel` is `null` it sets the panel's `data-visible` to `"false"` (and leaves the rest); otherwise it sets `data-visible="true"`, `data-kind` to `panel.kind`, the title and the hint text, and the badge's `data-visible` to `String(panel.newBest)`. Before the first `update`, the panel has `data-visible="false"`. A `className` is a space-separated string such as `'hud-stat hud-score'`.

**Tests (write first):** `test/hud.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { hudModel, createHud } from '../src/hud.js'

test('hudModel: the running screen has no panel', () => {
  assert.deepEqual(hudModel({ status: 'running', score: 120, highScore: 300, level: 3, isNewBest: false }), {
    score: '120', best: '300', level: '3', panel: null,
  })
})

test('hudModel: each screen has its title and hint', () => {
  const base = { score: 0, highScore: 0, level: 1, isNewBest: false }
  assert.deepEqual(hudModel({ ...base, status: 'ready' }).panel, {
    kind: 'ready', title: 'SNAKE 3D', hint: 'Arrow keys, WASD or swipe to start', newBest: false,
  })
  assert.deepEqual(hudModel({ ...base, status: 'paused' }).panel, {
    kind: 'paused', title: 'PAUSED', hint: 'Space or tap to resume', newBest: false,
  })
  assert.deepEqual(hudModel({ ...base, status: 'over' }).panel, {
    kind: 'over', title: 'GAME OVER', hint: 'Enter or tap to play again', newBest: false,
  })
  assert.deepEqual(hudModel({ ...base, status: 'won' }).panel, {
    kind: 'won', title: 'BOARD CLEARED', hint: 'Enter or tap to play again', newBest: false,
  })
})

test('hudModel: the hints name the keys', () => {
  const base = { score: 0, highScore: 0, level: 1, isNewBest: false }
  assert.match(hudModel({ ...base, status: 'ready' }).panel.hint, /arrow/i)
  assert.match(hudModel({ ...base, status: 'paused' }).panel.hint, /space/i)
  assert.match(hudModel({ ...base, status: 'over' }).panel.hint, /enter/i)
  assert.match(hudModel({ ...base, status: 'won' }).panel.hint, /enter/i)
})

test('hudModel: newBest only on the game over and won screens', () => {
  const base = { score: 50, highScore: 50, level: 2, isNewBest: true }
  assert.equal(hudModel({ ...base, status: 'over' }).panel.newBest, true)
  assert.equal(hudModel({ ...base, status: 'won' }).panel.newBest, true)
  assert.equal(hudModel({ ...base, status: 'ready' }).panel.newBest, false)
  assert.equal(hudModel({ ...base, status: 'paused' }).panel.newBest, false)
})

test('hudModel: odd input does not throw', () => {
  assert.equal(hudModel({ status: 'weird', score: 1, highScore: 1, level: 1 }).panel, null)
  const m = hudModel({ status: 'running' })
  assert.deepEqual([m.score, m.best, m.level], ['0', '0', '1'])
  const n = hudModel({ status: 'running', score: NaN, highScore: undefined, level: 'x' })
  assert.deepEqual([n.score, n.best, n.level], ['0', '0', '1'])
})

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase()
    this.children = []
    this.attrs = {}
    this.className = ''
    this.textContent = ''
  }
  appendChild(child) { this.children.push(child); return child }
  setAttribute(k, v) { this.attrs[k] = String(v) }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null }
  all() { return [this, ...this.children.flatMap((c) => c.all())] }
  has(cls) { return this.className.split(/\s+/).includes(cls) }
  byClass(cls) { return this.all().find((e) => e.has(cls)) }
}
function makeRoot() {
  const doc = { createElement: (tag) => new FakeEl(tag) }
  const root = new FakeEl('div')
  root.ownerDocument = doc
  return root
}

test('createHud: builds the structure inside root and returns { update, element }', () => {
  assert.equal(typeof document, 'undefined')
  const root = makeRoot()
  const hud = createHud(root)
  assert.equal(typeof hud.update, 'function')
  assert.ok(root.children.includes(hud.element))
  assert.ok(hud.element.has('hud-root'))
  for (const cls of ['hud-bar', 'hud-stat', 'hud-score', 'hud-best', 'hud-level', 'hud-label', 'hud-value', 'hud-panel', 'hud-badge', 'hud-title', 'hud-hint']) {
    assert.ok(hud.element.byClass(cls), cls)
  }
  assert.equal(hud.element.byClass('hud-panel').getAttribute('data-visible'), 'false')
  assert.equal(hud.element.byClass('hud-title').tagName, 'H1')
  assert.equal(hud.element.byClass('hud-hint').tagName, 'P')
  assert.equal(hud.element.byClass('hud-badge').textContent, 'NEW BEST')
  assert.equal(hud.element.byClass('hud-score').byClass('hud-label').textContent, 'SCORE')
  assert.equal(hud.element.byClass('hud-best').byClass('hud-label').textContent, 'BEST')
  assert.equal(hud.element.byClass('hud-level').byClass('hud-label').textContent, 'LEVEL')
})

test('createHud: update writes the numbers and the panel', () => {
  const root = makeRoot()
  const hud = createHud(root)
  const value = (cls) => hud.element.byClass(cls).byClass('hud-value').textContent
  const panel = hud.element.byClass('hud-panel')
  const badge = hud.element.byClass('hud-badge')

  hud.update(hudModel({ status: 'running', score: 120, highScore: 300, level: 3, isNewBest: false }))
  assert.deepEqual([value('hud-score'), value('hud-best'), value('hud-level')], ['120', '300', '3'])
  assert.equal(panel.getAttribute('data-visible'), 'false')

  hud.update(hudModel({ status: 'ready', score: 0, highScore: 300, level: 1, isNewBest: false }))
  assert.equal(panel.getAttribute('data-visible'), 'true')
  assert.equal(panel.getAttribute('data-kind'), 'ready')
  assert.equal(hud.element.byClass('hud-title').textContent, 'SNAKE 3D')
  assert.equal(hud.element.byClass('hud-hint').textContent, 'Arrow keys, WASD or swipe to start')
  assert.equal(badge.getAttribute('data-visible'), 'false')

  hud.update(hudModel({ status: 'over', score: 400, highScore: 400, level: 4, isNewBest: true }))
  assert.equal(panel.getAttribute('data-kind'), 'over')
  assert.equal(hud.element.byClass('hud-title').textContent, 'GAME OVER')
  assert.equal(badge.getAttribute('data-visible'), 'true')
  assert.equal(value('hud-best'), '400')

  hud.update(hudModel({ status: 'over', score: 20, highScore: 400, level: 1, isNewBest: false }))
  assert.equal(badge.getAttribute('data-visible'), 'false')

  hud.update(hudModel({ status: 'running', score: 0, highScore: 400, level: 1, isNewBest: false }))
  assert.equal(panel.getAttribute('data-visible'), 'false')
})
```

**Acceptance:** `node --test test/hud.test.js` passes. Importing `src/hud.js` in Node touches no global.

### Task 7: Game rules

**Aether:**
- Review: xhigh — a wrong rule (collision, tail, food, score, level) breaks every game and the 'plays well' criterion
- Area: rules
- Owns: `src/game.js`, `test/game.test.js`
- Depends on: Task 1 — `game.js` imports `randomInt` from `src/rng.js` and its test imports `rng.js`
- Serves: R3

**Interfaces:**

```ts
// src/game.js: pure. Only import: { randomInt } from './rng.js'
export function createGame({ width = 20, height = 20, seed = 1 } = {})
export function start(game)
export function turn(game, direction)
export function tick(game)
export function togglePause(game)
export function restart(game)
```

The state is a plain object with the fields `width`, `height`, `snake` (array of `{x, y}`, head first), `direction`, `queue`, `food` (`{x, y}` or `null`), `score`, `foodsEaten`, `level`, `tickMs`, `status`, `rng`, `seed`, `ticks`, exactly as in the spec's table. Every function returns a new object and never mutates its input or any nested array or cell (the tests deep-freeze their inputs). A function whose input is ignored may return the same object it received.

- `createGame`: `width` and `height` must be integers (`Number.isInteger`) from 4 to 64, otherwise `throw new Error('invalid board: ' + width + 'x' + height)`. `rng = seed >>> 0`, `seed` is kept as given. Snake: head at `(Math.floor(width / 2), Math.floor(height / 2))`, then the two cells to its left; `direction: 'right'`, `queue: []`, `score: 0`, `foodsEaten: 0`, `level: 1`, `tickMs: 150`, `status: 'ready'`, `ticks: 0`. The food: the free cells are listed row by row (`y` outer loop, `x` inner loop), skipping the snake; `{ value: i, state } = randomInt(rng, free.length)`; `food = free[i]`; `rng = state`.
- `start`: `'ready'` becomes `'running'`; any other status is returned unchanged.
- `turn(game, direction)`: acts only while `status` is `'ready'` or `'running'`. `direction` must be one of the four strings. Let `last = queue.at(-1) ?? game.direction`. It is ignored when `direction === last`, when `direction` is the opposite of `last` (up/down, left/right), or when `queue.length >= 2`. Otherwise it returns the game with `direction` appended to a copy of `queue`.
- `tick(game)`: only acts while `status === 'running'`; otherwise returns the game unchanged. In order:
  1. `dir = queue[0] ?? game.direction`; the new `queue` is the old one without its first element; the head target is the head plus the step of `dir` (`up` is `y - 1`, `down` is `y + 1`, `left` is `x - 1`, `right` is `x + 1`).
  2. The target is fatal when it is outside the board, or when it equals a cell of `snake.slice(0, -1)` (the tail cell counts as free, because it is about to be left). A fatal tick returns `{ ...game, direction: dir, queue: newQueue, status: 'over' }`: the snake does not move and `ticks` does not rise.
  3. Otherwise the new snake is `[target, ...snake]`, and its last cell is dropped unless the target equals `game.food`. On food: `score += 10 * level` (the level before it rises), `foodsEaten += 1`, and when the new `foodsEaten % 5 === 0` then `level += 1` and `tickMs = Math.max(60, tickMs - 15)`. New food: free cells of the new snake listed row by row, `randomInt(rng, free.length)`, and `rng` takes the new state. When there is no free cell, `food = null` and `status = 'won'`. When no food was eaten, `food` and `rng` stay as they were.
  4. `ticks` rises by 1, and `direction` is `dir`.
- `togglePause`: `'running'` and `'paused'` swap; any other status is returned unchanged.
- `restart(game)`: `createGame({ width: game.width, height: game.height, seed: game.rng })`.

**Tests (write first):** `test/game.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame, start, turn, tick, togglePause, restart } from '../src/game.js'
import { randomInt } from '../src/rng.js'

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}
const cell = (x, y) => ({ x, y })
const key = (c) => `${c.x},${c.y}`
const running = (o = {}) => deepFreeze({
  ...createGame({ width: 8, height: 8, seed: 3 }),
  status: 'running',
  snake: [cell(4, 4), cell(3, 4), cell(2, 4)],
  food: cell(0, 0),
  direction: 'right',
  queue: [],
  ...o,
})
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

test('createGame: defaults', () => {
  const g = createGame()
  assert.equal(g.width, 20)
  assert.equal(g.height, 20)
  assert.deepEqual(g.snake, [cell(10, 10), cell(9, 10), cell(8, 10)])
  assert.equal(g.direction, 'right')
  assert.deepEqual(g.queue, [])
  assert.equal(g.status, 'ready')
  assert.equal(g.score, 0)
  assert.equal(g.foodsEaten, 0)
  assert.equal(g.level, 1)
  assert.equal(g.tickMs, 150)
  assert.equal(g.ticks, 0)
  assert.equal(g.seed, 1)
  assert.ok(Number.isInteger(g.rng) && g.rng >= 0 && g.rng <= 4294967295)
  assert.ok(g.food.x >= 0 && g.food.x < 20 && g.food.y >= 0 && g.food.y < 20)
  assert.ok(!g.snake.some((c) => key(c) === key(g.food)))
})

test('createGame: the head is at the middle of any board', () => {
  const g = createGame({ width: 7, height: 5, seed: 9 })
  assert.deepEqual(g.snake, [cell(3, 2), cell(2, 2), cell(1, 2)])
})

test('createGame: invalid boards throw', () => {
  for (const [width, height] of [[3, 10], [10, 3], [65, 10], [10, 65], [4.5, 10], ['10', 10], [NaN, 10], [0, 0]]) {
    assert.throws(() => createGame({ width, height }), /^Error: invalid board/, `${width}x${height}`)
  }
  assert.doesNotThrow(() => createGame({ width: 4, height: 4 }))
  assert.doesNotThrow(() => createGame({ width: 64, height: 64 }))
})

test('createGame: deterministic by seed, and the food is always free', () => {
  assert.deepEqual(createGame({ seed: 5 }), createGame({ seed: 5 }))
  for (let seed = 1; seed <= 200; seed++) {
    const g = createGame({ width: 6, height: 6, seed })
    assert.ok(!g.snake.some((c) => key(c) === key(g.food)), String(seed))
  }
})

test('start: ready becomes running, other statuses are unchanged', () => {
  const ready = deepFreeze(createGame({ seed: 2 }))
  assert.equal(start(ready).status, 'running')
  assert.equal(ready.status, 'ready')
  for (const status of ['running', 'paused', 'over', 'won']) {
    assert.equal(start(running({ status })).status, status)
  }
})

test('turn: queues while ready or running', () => {
  const ready = deepFreeze(createGame({ seed: 2 }))
  const g = turn(ready, 'up')
  assert.deepEqual(g.queue, ['up'])
  assert.equal(g.status, 'ready')
  assert.deepEqual(ready.queue, [])
  assert.deepEqual(turn(running(), 'down').queue, ['down'])
})

test('turn: ignores the same direction and the reverse of the current one', () => {
  assert.deepEqual(turn(running(), 'right').queue, [])
  assert.deepEqual(turn(running(), 'left').queue, [])
})

test('turn: compares with the last queued direction, and the queue holds 2', () => {
  let g = running()
  g = turn(g, 'up')
  assert.deepEqual(turn(g, 'up').queue, ['up'])
  assert.deepEqual(turn(g, 'down').queue, ['up'])
  g = turn(g, 'left')
  assert.deepEqual(g.queue, ['up', 'left'])
  assert.deepEqual(turn(g, 'down').queue, ['up', 'left'])
  assert.deepEqual(turn(g, 'up').queue, ['up', 'left'])
})

test('turn: ignored when paused, over or won, and for unknown directions', () => {
  for (const status of ['paused', 'over', 'won']) assert.deepEqual(turn(running({ status }), 'up').queue, [])
  assert.deepEqual(turn(running(), 'sideways').queue, [])
})

test('tick: only acts while running', () => {
  for (const status of ['ready', 'paused', 'over', 'won']) {
    const g = running({ status })
    assert.equal(tick(g), g, status)
  }
})

test('tick: moves one cell, keeps the length, counts the tick', () => {
  const g = running()
  const n = tick(g)
  assert.deepEqual(n.snake, [cell(5, 4), cell(4, 4), cell(3, 4)])
  assert.equal(n.ticks, 1)
  assert.equal(n.score, 0)
  assert.equal(n.status, 'running')
  assert.deepEqual(n.food, g.food)
  assert.equal(n.rng, g.rng)
  assert.deepEqual(g.snake, [cell(4, 4), cell(3, 4), cell(2, 4)])
})

test('tick: takes the queued directions one per tick', () => {
  const g = running({ queue: ['up', 'left'] })
  const a = tick(g)
  assert.deepEqual(a.snake[0], cell(4, 3))
  assert.equal(a.direction, 'up')
  assert.deepEqual(a.queue, ['left'])
  const b = tick(a)
  assert.deepEqual(b.snake[0], cell(3, 3))
  assert.equal(b.direction, 'left')
  assert.deepEqual(b.queue, [])
})

test('tick: leaving the board ends the game and the snake does not move', () => {
  const cases = [
    ['right', cell(7, 4)],
    ['left', cell(0, 4)],
    ['up', cell(4, 0)],
    ['down', cell(4, 7)],
  ]
  for (const [dir, head] of cases) {
    const [dx, dy] = STEP[dir]
    const snake = [head, cell(head.x - dx, head.y - dy), cell(head.x - 2 * dx, head.y - 2 * dy)]
    const g = running({ snake, direction: dir })
    const n = tick(g)
    assert.equal(n.status, 'over', dir)
    assert.deepEqual(n.snake, snake, dir)
    assert.equal(n.ticks, 0, dir)
    assert.equal(n.score, 0, dir)
  }
})

test('tick: hitting the body ends the game', () => {
  const snake = [cell(2, 2), cell(2, 3), cell(3, 3), cell(3, 2), cell(3, 1)]
  const n = tick(running({ snake, direction: 'right' }))
  assert.equal(n.status, 'over')
  assert.deepEqual(n.snake, snake)
  assert.equal(n.ticks, 0)
})

test('tick: the cell the tail is about to leave counts as free', () => {
  const snake = [cell(2, 2), cell(2, 3), cell(3, 3), cell(3, 2)]
  const n = tick(running({ snake, direction: 'right' }))
  assert.equal(n.status, 'running')
  assert.deepEqual(n.snake, [cell(3, 2), cell(2, 2), cell(2, 3), cell(3, 3)])
  assert.equal(n.ticks, 1)
})

test('tick: eating grows the snake, scores 10 x level, and places new free food', () => {
  const g = running({ food: cell(5, 4) })
  const n = tick(g)
  assert.deepEqual(n.snake, [cell(5, 4), cell(4, 4), cell(3, 4), cell(2, 4)])
  assert.equal(n.score, 10)
  assert.equal(n.foodsEaten, 1)
  assert.equal(n.level, 1)
  assert.equal(n.tickMs, 150)
  assert.equal(n.ticks, 1)
  assert.notEqual(n.rng, g.rng)
  assert.ok(n.food && n.food.x >= 0 && n.food.x < 8 && n.food.y >= 0 && n.food.y < 8)
  assert.ok(!n.snake.some((c) => key(c) === key(n.food)))
})

test('tick: every 5th food raises the level and speeds up the game', () => {
  const n = tick(running({ food: cell(5, 4), foodsEaten: 4, score: 40 }))
  assert.equal(n.foodsEaten, 5)
  assert.equal(n.level, 2)
  assert.equal(n.tickMs, 135)
  assert.equal(n.score, 50)
  const m = tick(running({ food: cell(5, 4), foodsEaten: 5, score: 50, level: 2, tickMs: 135 }))
  assert.equal(m.score, 70)
  assert.equal(m.level, 2)
  assert.equal(m.tickMs, 135)
})

test('tick: tickMs never goes below 60', () => {
  const a = tick(running({ food: cell(5, 4), foodsEaten: 9, level: 2, tickMs: 70 }))
  assert.equal(a.level, 3)
  assert.equal(a.tickMs, 60)
  const b = tick(running({ food: cell(5, 4), foodsEaten: 14, level: 3, tickMs: 60 }))
  assert.equal(b.level, 4)
  assert.equal(b.tickMs, 60)
})

test('tick: filling the board wins', () => {
  const snake = [
    cell(1, 0), cell(2, 0), cell(3, 0), cell(3, 1), cell(2, 1), cell(1, 1), cell(0, 1),
    cell(0, 2), cell(1, 2), cell(2, 2), cell(3, 2), cell(3, 3), cell(2, 3), cell(1, 3), cell(0, 3),
  ]
  const g = deepFreeze({
    ...createGame({ width: 4, height: 4, seed: 1 }),
    status: 'running', direction: 'left', queue: [], snake, food: cell(0, 0),
  })
  const n = tick(g)
  assert.equal(n.snake.length, 16)
  assert.equal(n.status, 'won')
  assert.equal(n.food, null)
  assert.equal(n.score, 10)
  assert.equal(n.ticks, 1)
})

test('togglePause: running and paused swap, others are unchanged', () => {
  assert.equal(togglePause(running()).status, 'paused')
  assert.equal(togglePause(running({ status: 'paused' })).status, 'running')
  for (const status of ['ready', 'over', 'won']) assert.equal(togglePause(running({ status })).status, status)
})

test('restart: a new ready game on the same board, seeded from the current random state', () => {
  const played = tick(running({ food: cell(5, 4) }))
  const r = restart(played)
  assert.equal(r.status, 'ready')
  assert.equal(r.width, 8)
  assert.equal(r.height, 8)
  assert.equal(r.score, 0)
  assert.equal(r.ticks, 0)
  assert.equal(r.seed, played.rng)
  assert.deepEqual(r, createGame({ width: 8, height: 8, seed: played.rng }))
})

function walk(seed) {
  let rs = 99 + seed
  let g = start(createGame({ width: 5, height: 5, seed }))
  const dirs = ['up', 'down', 'left', 'right']
  let steps = 0
  for (; steps < 400 && g.status === 'running'; steps++) {
    const r = randomInt(rs, 4)
    rs = r.state
    g = tick(turn(g, dirs[r.value]))
    const keys = new Set(g.snake.map(key))
    assert.equal(keys.size, g.snake.length, 'cells are distinct')
    for (const c of g.snake) assert.ok(c.x >= 0 && c.x < 5 && c.y >= 0 && c.y < 5, 'in bounds')
    if (g.food) {
      assert.ok(!keys.has(key(g.food)), 'food is free')
      assert.ok(g.food.x >= 0 && g.food.x < 5 && g.food.y >= 0 && g.food.y < 5)
    }
    assert.equal(g.snake.length, 3 + g.foodsEaten)
    assert.ok(g.queue.length <= 2)
  }
  return { g, steps }
}

test('invariants hold over seeded random walks, which are deterministic', () => {
  let eaten = 0
  let steps = 0
  for (let seed = 1; seed <= 40; seed++) {
    const a = walk(seed)
    assert.deepEqual(a.g, walk(seed).g)
    eaten += a.g.foodsEaten
    steps += a.steps
  }
  assert.ok(steps > 100)
  assert.ok(eaten > 0)
})
```

**Acceptance:** `node --test test/game.test.js` passes. `src/game.js` imports only `./rng.js`, no `three`, no DOM.

### Task 8: World, board and camera framing

**Aether:**
- Review: high — the framing must keep the board in view at every aspect and never look straight down
- Area: render
- Owns: `src/render/world.js`, `test/world.test.js`
- Depends on: Task 5 — it imports `CELL`, `gridToWorld`, `lerp`, `clamp01` and `THEME` from `src/render/theme.js`
- Depends on: Task 1 — it imports `nextRandom` from `src/rng.js` to place the stars
- Serves: R7, R9

**Interfaces:**

```ts
// src/render/world.js: imports 'three' and './theme.js' (and { nextRandom } from '../rng.js'). Uses no document/window/canvas/WebGL.
export function buildWorld({ width, height, theme }) // -> THREE.Group named 'world'
export function frameCamera(camera, { width, height, aspect, yaw = 0 }) // -> distance (number); sets the camera
export function fogRange(distance) // -> { near: 1.6 * distance, far: 3.2 * distance }
```

`buildWorld` returns a `THREE.Group` named `'world'` (no texture, no image, no canvas; every colour from `theme.colors`; created once). It holds:
- `board`: an `InstancedMesh` named `'board'` with `width * height` instances of one shared `BoxGeometry(1, 0.3, 1)` and one `MeshStandardMaterial` (colour white, roughness 0.85, metalness 0.05). Instance `y * width + x` sits at `gridToWorld(x, y, width, height)` with its top face at world y = 0 (centre at y = -0.15), and its colour (`setColorAt`) is `theme.colors.board` when `(x + y) % 2 === 0` and `theme.colors.boardAlt` otherwise. `receiveShadow = true`, `frustumCulled = false`. Set every matrix and colour first, set `instanceMatrix.needsUpdate` and `instanceColor.needsUpdate` to true, then call `board.computeBoundingBox()`. Its bounding box is exactly `width x height` and centred on the origin in x and z.
- `grid`: a `LineSegments` of the cell lines on the board (one shared `BufferGeometry`, one `LineBasicMaterial` in `theme.colors.accent`, `transparent: true`, `opacity: 0.12`) at y = 0.003.
- `plinth`: a box a little larger than the board (margin 0.6, height 0.5, top at y = -0.3), in `theme.colors.wall`, receives shadows.
- `walls`: a `THREE.Group` named `'walls'`: four rails around the board (height 0.5, thickness 0.35, just outside the board edge, in `theme.colors.wall`, `castShadow` and `receiveShadow`), each with a thin `MeshBasicMaterial` strip on top in `theme.colors.accent` multiplied by 1.4 (so the bloom takes it), and four corner pylons (taller, 0.9) with a glowing cap. The walls enclose the board: their bounding box is larger than the board in x and z.
- `floor`: a dark circle below the plinth (`theme.colors.background`), `receiveShadow`, at y = -0.85, of radius `0.75 * max(width, height) + 4`. It is small on purpose: the tilted camera looks down past the far edge of the board and must see the stars there, not the floor.
- `stars`: a `THREE.Points` named `'stars'`, about 400 points on a full sphere shell around the origin (radius 60 to 90; for each point three `nextRandom` draws give `u = 2 * v1 - 1` for the height, an angle `2 * PI * v2`, and the radius `60 + 30 * v3`; the point is `(r * sqrt(1 - u * u) * cos(angle), r * u, r * sqrt(1 - u * u) * sin(angle))`), so that the tilted camera, which looks down at the board, sees them in the void behind and around it. Vertex colours white, cyan and pink, `PointsMaterial` with `size: 2`, `sizeAttenuation: false`, `fog: false`, `vertexColors: true`. The positions come from `nextRandom` seeded with 7, so two builds are identical.
- Lights: a `THREE.HemisphereLight(0x6a5cff, 0x120d2e, 0.7)`; a key `THREE.DirectionalLight(0xcfd8ff, 2.4)` with `castShadow = true`, `shadow.mapSize` 2048 x 2048, an orthographic shadow camera with `left/bottom = -m`, `right/top = m` for `m = max(width, height) * 0.75 + 2`, `near` 1, `far` large enough to reach the board, `shadow.bias = -0.0004`, `shadow.normalBias = 0.03`, positioned at `(-0.45 * S, 1.0 * S, 0.55 * S)` for `S = max(width, height)`, with its `target` added to the group at the origin; a rim `THREE.DirectionalLight(theme.colors.accent, 1.1)` on the opposite side (`(0.6 * S, 0.5 * S, -0.7 * S)`), no shadow.

`frameCamera(camera, { width, height, aspect, yaw = 0 })`:
- Elevation (degrees above the board plane): `lerp(50, 62, clamp01((1 - aspect) / 0.5))`. Convert to radians. The camera sits at `distance * (sin(yaw) * cos(el), sin(el), cos(yaw) * cos(el))` and looks at `(0, 0, 0)`.
- `distance` is found by a binary search of 24 steps over `[1, 1000]`: the smallest distance for which the 8 corners `(±(width / 2 + 0.5), y, ±(height / 2 + 0.5))` for `y` in `{0, 0.6}` all project inside `|ndc.x| <= 0.92` and `|ndc.y| <= 0.92` (and in front of the camera). Use module-level `Vector3` instances so a call allocates nothing per step.
- It sets `camera.aspect = aspect`, `camera.near = 0.1`, `camera.far = 6 * distance`, calls `camera.updateProjectionMatrix()`, positions the camera, `camera.lookAt(0, 0, 0)`, `camera.updateMatrixWorld(true)`, and returns `distance`. It leaves `camera.fov` as it is.

**Tests (write first):** `test/world.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildWorld, frameCamera, fogRange } from '../src/render/world.js'
import { THEME } from '../src/render/theme.js'

test('the test environment has no DOM', () => {
  assert.equal(typeof document, 'undefined')
  assert.equal(typeof window, 'undefined')
})

test('buildWorld returns a Group named world with a board and walls', () => {
  const world = buildWorld({ width: 20, height: 20, theme: THEME })
  assert.equal(world.isGroup, true)
  assert.equal(world.name, 'world')
  assert.ok(world.getObjectByName('board'))
  assert.ok(world.getObjectByName('walls'))
})

test('the board spans width x height, is centred, receives shadows and is a checker', () => {
  for (const [w, h] of [[20, 20], [4, 4], [30, 10]]) {
    const world = buildWorld({ width: w, height: h, theme: THEME })
    world.updateMatrixWorld(true)
    const board = world.getObjectByName('board')
    assert.equal(board.isInstancedMesh, true)
    assert.equal(board.count, w * h)
    assert.equal(board.receiveShadow, true)
    const box = new THREE.Box3().setFromObject(board)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    assert.ok(Math.abs(size.x - w) < 1e-6 && Math.abs(size.z - h) < 1e-6, `${w}x${h}`)
    assert.ok(Math.abs(center.x) < 1e-6 && Math.abs(center.z) < 1e-6)
    assert.ok(Math.abs(box.max.y) < 1e-6)
    const color = new THREE.Color()
    board.getColorAt(0, color)
    assert.equal(color.getHex(), THEME.colors.board)
    board.getColorAt(1, color)
    assert.equal(color.getHex(), THEME.colors.boardAlt)
    board.getColorAt(w, color)
    assert.equal(color.getHex(), THEME.colors.boardAlt)
    board.getColorAt(w + 1, color)
    assert.equal(color.getHex(), THEME.colors.board)
  }
})

test('the walls enclose the board and cast shadows', () => {
  const world = buildWorld({ width: 20, height: 12, theme: THEME })
  world.updateMatrixWorld(true)
  const walls = world.getObjectByName('walls')
  let meshes = 0
  let casters = 0
  walls.traverse((o) => {
    if (o.isMesh) {
      meshes++
      if (o.castShadow) casters++
    }
  })
  assert.ok(meshes >= 4)
  assert.ok(casters >= 4)
  const size = new THREE.Box3().setFromObject(walls).getSize(new THREE.Vector3())
  assert.ok(size.x >= 20 + 0.5)
  assert.ok(size.z >= 12 + 0.5)
})

test('a shadow-casting directional light covers the board', () => {
  const world = buildWorld({ width: 20, height: 20, theme: THEME })
  const lights = []
  world.traverse((o) => {
    if (o.isDirectionalLight && o.castShadow) lights.push(o)
  })
  assert.ok(lights.length >= 1)
  const light = lights[0]
  assert.ok(light.shadow.mapSize.x >= 1024 && light.shadow.mapSize.y >= 1024)
  const cam = light.shadow.camera
  assert.ok(cam.right - cam.left >= 20)
  assert.ok(cam.top - cam.bottom >= 20)
  assert.ok(light.target.parent, 'the light target is in the scene graph')
})

test('no texture is used, and the stars are the same on every build', () => {
  const a = buildWorld({ width: 20, height: 20, theme: THEME })
  a.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const m of mats) assert.ok(!m.map, `${o.name || o.type} has a texture`)
  })
  const b = buildWorld({ width: 20, height: 20, theme: THEME })
  const pa = a.getObjectByName('stars').geometry.getAttribute('position').array
  const pb = b.getObjectByName('stars').geometry.getAttribute('position').array
  assert.ok(pa.length >= 300 * 3)
  assert.deepEqual([...pa], [...pb])
})

const ASPECTS = [390 / 844, 0.75, 1, 16 / 9, 21 / 9, 3]
const BOARDS = [[20, 20], [4, 4], [64, 64], [30, 10], [10, 30]]
const elevationDeg = (camera) => (Math.asin(camera.position.y / camera.position.length()) * 180) / Math.PI

test('frameCamera keeps the whole board in view at any aspect, from above at an angle', () => {
  for (const aspect of ASPECTS) {
    for (const [width, height] of BOARDS) {
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
      const distance = frameCamera(camera, { width, height, aspect })
      camera.updateMatrixWorld(true)
      assert.equal(camera.aspect, aspect)
      assert.ok(Math.abs(distance - camera.position.length()) < 1e-6)
      assert.ok(camera.far > distance)
      let widest = 0
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const p = new THREE.Vector3((sx * width) / 2, 0, (sz * height) / 2).project(camera)
          const where = `aspect ${aspect.toFixed(2)} board ${width}x${height}`
          assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1, where)
          assert.ok(p.z > -1 && p.z < 1, where)
          widest = Math.max(widest, Math.abs(p.x), Math.abs(p.y))
        }
      }
      assert.ok(widest >= 0.6, 'the board fills the view')
      const el = elevationDeg(camera)
      assert.ok(el >= 35 && el <= 75, `elevation ${el}`)
      const forward = camera.getWorldDirection(new THREE.Vector3())
      const toCenter = camera.position.clone().negate().normalize()
      assert.ok(forward.dot(toCenter) > 0.9999, 'looks at the centre')
    }
  }
})

test('frameCamera: the portrait view is steeper than the landscape one, and calling it twice is stable', () => {
  const portrait = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  const landscape = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  frameCamera(portrait, { width: 20, height: 20, aspect: 390 / 844 })
  frameCamera(landscape, { width: 20, height: 20, aspect: 16 / 9 })
  assert.ok(elevationDeg(portrait) > elevationDeg(landscape))
  const before = portrait.position.clone()
  frameCamera(portrait, { width: 20, height: 20, aspect: 390 / 844 })
  assert.ok(before.distanceTo(portrait.position) < 1e-9)
})

test('frameCamera: yaw turns the camera around the board and the board still fits', () => {
  for (const aspect of [390 / 844, 16 / 9]) {
    for (const yaw of [-0.3, 0.3]) {
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
      frameCamera(camera, { width: 20, height: 20, aspect, yaw })
      camera.updateMatrixWorld(true)
      assert.ok(Math.abs(camera.position.x) > 0.5)
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const p = new THREE.Vector3(sx * 10, 0, sz * 10).project(camera)
          assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1)
        }
      }
    }
  }
  const flat = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  frameCamera(flat, { width: 20, height: 20, aspect: 1 })
  assert.ok(Math.abs(flat.position.x) < 1e-9)
})

test('fogRange', () => {
  const r = fogRange(100)
  assert.ok(Math.abs(r.near - 160) < 1e-9)
  assert.ok(Math.abs(r.far - 320) < 1e-9)
})

test('the board is not fogged, and the stars are in the frame of a camera framed by frameCamera', () => {
  for (const aspect of [390 / 844, 1, 16 / 9]) {
    const world = buildWorld({ width: 20, height: 20, theme: THEME })
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    const distance = frameCamera(camera, { width: 20, height: 20, aspect })
    camera.updateMatrixWorld(true)
    const { near } = fogRange(distance)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        assert.ok(camera.position.distanceTo(new THREE.Vector3(sx * 10.6, 0, sz * 10.6)) <= near, 'the far corner is before the fog')
      }
    }
    const pos = world.getObjectByName('stars').geometry.getAttribute('position')
    let seen = 0
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).project(camera)
      if (Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z > -1 && p.z < 1) seen++
    }
    assert.ok(seen >= 8, `aspect ${aspect.toFixed(2)}: ${seen} stars in view`)
  }
})
```

**Acceptance:** `node --test test/world.test.js` passes with no WebGL, canvas or DOM. All objects are created in `buildWorld`; `frameCamera` and `fogRange` create no geometry or material.

### Task 9: Snake view, food and effects

**Aether:**
- Review: xhigh — the interpolation, the head's turn and the pooled effects are the core of the 3D quality; a mistake shows as teleporting segments or a leak
- Area: render
- Owns: `src/render/snake-view.js`, `test/snake-view.test.js`
- Depends on: Task 5 — it imports `gridToWorld`, `bodyColor`, `lerp`, `clamp01`, `easeOutCubic` and `THEME` from `src/render/theme.js`
- Depends on: Task 1 — it uses `nextRandom` from `src/rng.js` for deterministic sparks
- Serves: R8, R12

**Interfaces:**

```ts
// src/render/snake-view.js: imports 'three', './theme.js', '../rng.js'. Uses no document/window/canvas/WebGL.
export const HEADING = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 }
export function createSnakeView({ scene, theme, width, height }) // -> view
// view = {
//   update(game, alpha, timeMs),   // call every frame
//   segmentPositions(),            // -> [{ x, z }] from the neck to the tail, the head not included
//   onEat(cell),                   // cell: { x, y } in grid coordinates
//   onLevelUp(),
//   onGameOver(),
//   reset(),
//   activeEffects(),               // -> number of live effects
//   cameraKick(),                  // -> { x, y, z } camera offset in world units, a reused object, all 0 when idle
//   dispose(),
// }
```

`update(game, alpha, timeMs)` reads from `game` only: `snake` (cells `{x, y}`, head first), `direction`, `ticks`, `food` (`{x, y}` or `null`), `status`. It may be called any number of times per tick with different `alpha`.

Everything the view adds goes into `scene` (directly or inside one identity `Group` named `'snake'`). Design (also see plan D4 and D5):

**Interpolation.** Keep two snapshots of world positions, `from` and `to` (preallocated `Float32Array`s of `2 * width * height`, plus their lengths). `lastTicks` is the `game.ticks` of the previous `update`.
- On the first `update`, or when `game.ticks !== lastTicks + 1` and `game.ticks !== lastTicks`: snap, `from = to = ` the current cells (no motion).
- When `game.ticks === lastTicks + 1`: `from` becomes the previous `to`; `to` is built from `game.snake` with `gridToWorld`. If the new snake is longer than `from`, the missing `from` entries are copies of the last `from` entry (the new tail grows out of the old tail).
- When `game.ticks === lastTicks`: keep `from` and `to`.
- Segment `i` is at `lerp(from[i], to[i], clamp01(alpha))` in x and z. The head is segment 0. Because each segment moves to the cell the one ahead of it held, a step is at most one cell and a turn never cuts a corner.
- The previous heading and `HEADING[game.direction]` drive the head's turn: `delta` is the difference wrapped to (-π, π]; `rotation.y = prevHeading + delta * easeOutCubic(clamp01(alpha / 0.6))`; when `alpha >= 0.6` set `rotation.y = HEADING[game.direction]` exactly. At the first `update` or a snap the heading is `HEADING[game.direction]`. `prevHeading` is `HEADING` of the direction seen at the previous tick.

**Objects (all created once in `createSnakeView`, names are part of the contract):**
- `'snake-head'`: a `Group` modeled facing +Z: an ellipsoid (a `SphereGeometry(0.5, 24, 16)` mesh scaled 0.95 / 0.8 / 1.05, `MeshStandardMaterial` in `theme.colors.snakeHead`, emissive the same colour, `emissiveIntensity` 0.35), two white eyes with dark pupils on the front-top, and a pink tongue (`theme.colors.accent`) that flicks on a 1.2 s cycle (`scale.z` and `visible`). The group's y bobs by ±0.03. `castShadow` on the ellipsoid. The head is not part of the body instanced mesh.
- `'snake-body'`: an `InstancedMesh` of one shared `SphereGeometry(0.42, 20, 14)` and one `MeshStandardMaterial` (white, roughness 0.35, metalness 0.1), capacity `width * height`, `castShadow = true`, `frustumCulled = false`. Instance `k` is segment `k + 1`; `mesh.count = snake.length - 1`. Scale tapers from 1 at the neck to 0.6 at the tail, times a wave (`1 + 0.04 * sin(timeMs * 0.008 - i * 0.6)`), times the swallow bump (see effects). Instance colour is `bodyColor(i, length)`, rewritten only when `ticks` or the length changed, not every frame. y is 0.42.
- `'snake-glow'`: a second `InstancedMesh` (sphere radius 0.17, `MeshBasicMaterial`) with the same count, one stud above each body segment (y 0.42 + 0.3 × scale), instance colour = the body colour × 1.6 (so it goes above 1 and blooms). During a level-up the multiplier is boosted ×2.5 fading out; after game over it is dimmed.
- `'food'`: a `Group` with a faceted crystal (`OctahedronGeometry(0.3)` scaled 1 / 1.35 / 1, `flatShading`, `MeshStandardMaterial` in `theme.colors.food`, emissive the same colour, `emissiveIntensity` 0.8, `castShadow`). Its `position.x`/`z` are exactly the world position of `game.food`; `position.y = 0.55 + 0.12 * sin(timeMs * 0.004)`; `rotation.y = timeMs * 0.0025`; `scale` pulses by ±8 percent; it pops in with `easeOutCubic` over 300 ms from the first `update` that sees a new food cell. `visible = false` when `game.food` is `null`. Also `'food-ring'` (a flat `RingGeometry` lying on the board at y 0.02, additive, pulsing, on the food cell) and `'food-light'` (a `PointLight` in the food colour, intensity 6, distance 6, no shadow, at the food, y 0.9).
- `'particles'`: an `InstancedMesh` of 160 slots (small `OctahedronGeometry(0.07)`, `MeshBasicMaterial`, `vertexColors`-style instance colours), `mesh.count` is the number of live particles. Plus a pool of 6 shockwave `RingGeometry` meshes (additive, `transparent`, flat on the board).
- Every pool is preallocated. No geometry, material or mesh is created after `createSnakeView` returns.

**Effects.** Each starts at `startMs = ` the `timeMs` of the last `update` (0 before any). An effect has expired when `timeMs - startMs >= duration`. `activeEffects()` is the number of effects not expired at the last `update` (an effect started after the last `update` counts). Durations: eat 900 ms, level-up 1400 ms, game over 1800 ms: all under 2000 ms. When a pool is full, the oldest entry is reused. Sparks use `nextRandom` from a state kept in the view, seeded with 12345.
- `onEat(cell)`: 28 sparks from the cell (up and out, gravity, shrinking, 0.7 to 0.9 s, colours alternating `food` and `particle`), one shockwave ring on the cell (scale 0.3 to 2.4, fading, 0.6 s, food colour), and a swallow bump: segment `i` gets scale × `(1 + 0.35 * exp(-((i - front) ** 2) / 2))` with `front = (timeMs - startMs) * 0.012`.
- `onLevelUp()`: one accent shockwave ring from the middle of the board to `0.75 * max(width, height)` in 1.2 s, and the stud boost.
- `onGameOver()`: 60 sparks from the head and from every third segment, an accent ring at the head (1 s), a camera kick (see below), and a persistent dim: body and studs fade to about 35 percent over 0.8 s, kept until `reset()`.
- `cameraKick()`: `{ x, y, z }` in world units; during the first 600 ms after `onGameOver` it is a damped oscillation (amplitude `0.35 * (1 - elapsed / 600)`); otherwise all zeros. It returns the same object every call.
- `reset()`: expires every effect, hides the particles and rings (`particles.count = 0`), clears the dim and the bump, and clears the interpolation state (the next `update` snaps).
- `dispose()`: removes everything the view added from `scene` (and nothing else) and calls `dispose()` on every geometry and material it created, and on its instanced meshes.
- `segmentPositions()` returns the current interpolated `{ x, z }` of segments 1 to `length - 1`, as of the last `update`.

**Tests (write first):** `test/snake-view.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createSnakeView, HEADING } from '../src/render/snake-view.js'
import { THEME, gridToWorld } from '../src/render/theme.js'

const W = 20
const H = 20
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const cells = (...xy) => xy.map(([x, y]) => ({ x, y }))
const game = (snake, direction, ticks, extra = {}) => ({
  status: 'running', width: W, height: H, snake, direction, queue: [], food: { x: 15, y: 15 }, level: 1, ticks, ...extra,
})
const wp = (x, y) => gridToWorld(x, y, W, H)
const near = (a, b, eps = 1e-5) => Math.abs(a - b) < eps
const worldPos = (obj) => {
  obj.updateWorldMatrix(true, false)
  return new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld)
}
function setup(extra = () => {}) {
  const scene = new THREE.Scene()
  extra(scene)
  const view = createSnakeView({ scene, theme: THEME, width: W, height: H })
  return { scene, view, head: () => scene.getObjectByName('snake-head'), food: () => scene.getObjectByName('food') }
}
function resources(scene) {
  const g = new Set()
  const m = new Set()
  scene.traverse((o) => {
    if (o.geometry) g.add(o.geometry.uuid)
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
    for (const x of mats) m.add(x.uuid)
  })
  return { g: [...g].sort(), m: [...m].sort() }
}
function countObjects(scene) {
  let n = 0
  scene.traverse(() => { n++ })
  return n
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const angleDist = (a, b) => Math.abs(wrap(a - b))

function walk() {
  const dirs = []
  for (let rep = 0; rep < 4; rep++) dirs.push(...Array(6).fill('right'), 'down', 'down', ...Array(6).fill('left'), 'down', 'down')
  let snake = cells([10, 2], [9, 2], [8, 2])
  const states = [game(snake, 'right', 0)]
  dirs.forEach((d, i) => {
    const head = { x: snake[0].x + DELTA[d][0], y: snake[0].y + DELTA[d][1] }
    const grow = (i + 1) % 7 === 0
    snake = [head, ...(grow ? snake : snake.slice(0, -1))]
    states.push(game(snake, d, i + 1))
  })
  return states
}

test('HEADING is the spec table', () => {
  assert.deepEqual(HEADING, { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 })
})

test('createSnakeView adds the head and the food, uses no DOM', () => {
  assert.equal(typeof document, 'undefined')
  const { scene, head, food } = setup()
  assert.ok(head() && head().isObject3D)
  assert.ok(food() && food().isObject3D)
  assert.equal(head().isInstancedMesh, undefined)
  assert.ok(scene.getObjectByName('snake-body').isInstancedMesh)
})

test('at alpha 1 the head and the body sit on their cells', () => {
  const { view, head } = setup()
  view.update(game(cells([5, 5], [4, 5], [3, 5]), 'right', 0), 1, 0)
  const p = worldPos(head())
  assert.ok(near(p.x, wp(5, 5).x) && near(p.z, wp(5, 5).z))
  const segs = view.segmentPositions()
  assert.equal(segs.length, 2)
  assert.ok(near(segs[0].x, wp(4, 5).x) && near(segs[0].z, wp(4, 5).z))
  assert.ok(near(segs[1].x, wp(3, 5).x) && near(segs[1].z, wp(3, 5).z))
})

test('positions move linearly from the previous tick to the current one', () => {
  const { view, head } = setup()
  const a = game(cells([5, 5], [4, 5], [3, 5]), 'right', 0)
  const b = game(cells([6, 5], [5, 5], [4, 5]), 'right', 1)
  view.update(a, 1, 0)
  for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
    view.update(b, alpha, 16)
    const p = worldPos(head())
    assert.ok(near(p.x, wp(5, 5).x + alpha), `head x at ${alpha}`)
    assert.ok(near(p.z, wp(5, 5).z))
    const s = view.segmentPositions()
    assert.ok(near(s[0].x, wp(4, 5).x + alpha), `neck x at ${alpha}`)
    assert.ok(near(s[1].x, wp(3, 5).x + alpha), `tail x at ${alpha}`)
  }
})

test('no segment teleports: a zigzag walk with growth stays continuous', () => {
  const { view, head } = setup()
  let prev = null
  for (const g of walk()) {
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      view.update(g, alpha, g.ticks * 100 + alpha * 100)
      const now = [worldPos(head()), ...view.segmentPositions().map((p) => new THREE.Vector3(p.x, 0, p.z))]
      now[0].y = 0
      if (prev) {
        const limit = alpha === 0 ? 1e-5 : 0.25 + 1e-5
        for (let i = 0; i < Math.min(prev.length, now.length); i++) {
          assert.ok(prev[i].distanceTo(now[i]) <= limit, `tick ${g.ticks} alpha ${alpha} segment ${i}`)
        }
      }
      prev = now
    }
  }
})

test('at alpha 1 the head faces HEADING[direction], whatever the previous direction', () => {
  for (const from of Object.keys(DELTA)) {
    for (const to of Object.keys(DELTA)) {
      const { view, head } = setup()
      view.update(game(cells([10, 10], [9, 10], [8, 10]), from, 0), 1, 0)
      const [dx, dy] = DELTA[to]
      view.update(game(cells([10 + dx, 10 + dy], [10, 10], [9, 10]), to, 1), 1, 16)
      assert.equal(head().rotation.y, HEADING[to], `${from} -> ${to}`)
    }
  }
})

test('the head eases toward its new heading by the short way', () => {
  const { view, head } = setup()
  view.update(game(cells([10, 10], [10, 11], [10, 12]), 'up', 0), 1, 0)
  const b = game(cells([9, 10], [10, 10], [10, 11]), 'left', 1)
  const dist = []
  for (const alpha of [0, 0.1, 0.2, 0.3, 0.45]) {
    view.update(b, alpha, 16)
    dist.push(angleDist(head().rotation.y, HEADING.left))
  }
  assert.ok(Math.abs(dist[0] - Math.PI / 2) < 1e-6)
  for (let i = 1; i < dist.length; i++) assert.ok(dist[i] < dist[i - 1], `step ${i}`)
  assert.ok(dist.at(-1) > 0)
  view.update(b, 1, 16)
  assert.equal(head().rotation.y, HEADING.left)
})

test('growth: the new tail comes out of the old tail', () => {
  const { view } = setup()
  view.update(game(cells([5, 5], [4, 5], [3, 5]), 'right', 0), 1, 0)
  const b = game(cells([6, 5], [5, 5], [4, 5], [3, 5]), 'right', 1)
  view.update(b, 0, 16)
  let s = view.segmentPositions()
  assert.equal(s.length, 3)
  assert.ok(near(s[2].x, wp(3, 5).x))
  assert.ok(near(s[1].x, wp(3, 5).x))
  view.update(b, 1, 16)
  s = view.segmentPositions()
  assert.ok(near(s[0].x, wp(5, 5).x) && near(s[1].x, wp(4, 5).x) && near(s[2].x, wp(3, 5).x))
})

test('a jump of more than one tick snaps instead of sliding', () => {
  const { view, head } = setup()
  view.update(game(cells([5, 5], [4, 5], [3, 5]), 'right', 0), 1, 0)
  view.update(game(cells([12, 9], [11, 9], [10, 9]), 'right', 9), 0, 16)
  const p = worldPos(head())
  assert.ok(near(p.x, wp(12, 9).x) && near(p.z, wp(12, 9).z))
})

test('the body is instanced: the object count does not grow with the snake', () => {
  const long = Array.from({ length: 30 }, (_, i) => ({ x: i % 20, y: Math.floor(i / 20) }))
  const { scene, view } = setup()
  view.update(game(cells([5, 5], [4, 5], [3, 5]), 'right', 0), 1, 0)
  const before = countObjects(scene)
  view.update(game(long, 'right', 0), 1, 16)
  assert.equal(countObjects(scene), before)
  const body = scene.getObjectByName('snake-body')
  assert.equal(body.count, 29)
  assert.equal(body.castShadow, true)
  assert.equal(view.segmentPositions().length, 29)
})

test('the food sits on its cell, animates, hides when null', () => {
  const { view, food } = setup()
  const g = game(cells([5, 5], [4, 5], [3, 5]), 'right', 0, { food: { x: 7, y: 3 } })
  view.update(g, 1, 0)
  let p = worldPos(food())
  assert.ok(near(p.x, wp(7, 3).x) && near(p.z, wp(7, 3).z))
  view.update(g, 1, 1000)
  const a = [food().position.y, food().rotation.y, food().scale.x]
  view.update(g, 1, 1300)
  const b = [food().position.y, food().rotation.y, food().scale.x]
  assert.ok(a.some((v, i) => Math.abs(v - b[i]) > 1e-6), 'the food animates')
  view.update({ ...g, food: { x: 2, y: 2 } }, 1, 1400)
  p = worldPos(food())
  assert.ok(near(p.x, wp(2, 2).x) && near(p.z, wp(2, 2).z))
  view.update({ ...g, food: null }, 1, 1500)
  assert.equal(food().visible, false)
  view.update(g, 1, 1600)
  assert.equal(food().visible, true)
})

test('effects: each one ends within 2 seconds', () => {
  const { scene, view } = setup()
  const g = game(cells([5, 5], [4, 5], [3, 5]), 'right', 0)
  view.update(g, 1, 1000)
  assert.equal(view.activeEffects(), 0)
  view.onEat({ x: 5, y: 5 })
  assert.equal(view.activeEffects(), 1)
  view.onLevelUp()
  assert.equal(view.activeEffects(), 2)
  view.onGameOver()
  assert.equal(view.activeEffects(), 3)
  const particles = scene.getObjectByName('particles')
  view.update(g, 1, 1100)
  assert.ok(particles.count > 0)
  assert.ok(particles.count <= 160)
  view.update(g, 1, 3000)
  assert.equal(view.activeEffects(), 0)
  assert.equal(particles.count, 0)
})

test('an eat effect alone is over well before 2 seconds', () => {
  const { view } = setup()
  const g = game(cells([5, 5], [4, 5], [3, 5]), 'right', 0)
  view.update(g, 1, 500)
  view.onEat({ x: 6, y: 5 })
  view.update(g, 1, 2500)
  assert.equal(view.activeEffects(), 0)
})

test('many effects at once neither throw nor create objects', () => {
  const { scene, view } = setup()
  const g = game(cells([5, 5], [4, 5], [3, 5]), 'right', 0)
  view.update(g, 1, 0)
  const before = resources(scene)
  const count = countObjects(scene)
  for (let i = 0; i < 60; i++) {
    view.onEat({ x: i % 20, y: (i * 7) % 20 })
    view.onLevelUp()
    view.onGameOver()
  }
  view.update(g, 1, 50)
  assert.ok(scene.getObjectByName('particles').count <= 160)
  assert.deepEqual(resources(scene), before)
  assert.equal(countObjects(scene), count)
})

test('no geometry or material is created per tick or per frame', () => {
  const { scene, view } = setup()
  const states = walk()
  view.update(states[0], 1, 0)
  const before = resources(scene)
  let t = 0
  for (const g of states) {
    for (const alpha of [0, 0.5, 1]) {
      view.update(g, alpha, (t += 16))
    }
    if (g.ticks % 7 === 0) view.onEat({ x: g.snake[0].x, y: g.snake[0].y })
    if (g.ticks % 20 === 0) view.onLevelUp()
  }
  view.onGameOver()
  view.update(states.at(-1), 1, (t += 16))
  assert.deepEqual(resources(scene), before)
})

test('reset clears the effects and the interpolation', () => {
  const { scene, view, head } = setup()
  view.update(game(cells([5, 5], [4, 5], [3, 5]), 'right', 3), 1, 0)
  view.onEat({ x: 5, y: 5 })
  view.onGameOver()
  view.update(game(cells([5, 5], [4, 5], [3, 5]), 'right', 3), 1, 100)
  view.reset()
  assert.equal(view.activeEffects(), 0)
  assert.equal(scene.getObjectByName('particles').count, 0)
  view.update(game(cells([9, 9], [8, 9], [7, 9]), 'right', 1), 0, 200)
  const p = worldPos(head())
  assert.ok(near(p.x, wp(9, 9).x) && near(p.z, wp(9, 9).z))
})

test('cameraKick is zero when idle, non-zero right after a game over, zero again later', () => {
  const { view } = setup()
  const g = game(cells([5, 5], [4, 5], [3, 5]), 'right', 0)
  view.update(g, 1, 1000)
  let k = view.cameraKick()
  assert.deepEqual([k.x, k.y, k.z], [0, 0, 0])
  view.onGameOver()
  view.update(g, 1, 1050)
  k = view.cameraKick()
  assert.ok([k.x, k.y, k.z].every(Number.isFinite))
  assert.ok(Math.hypot(k.x, k.y, k.z) > 0)
  assert.equal(view.cameraKick(), k)
  view.update(g, 1, 3000)
  k = view.cameraKick()
  assert.deepEqual([k.x, k.y, k.z], [0, 0, 0])
})

test('the head, the body and the food cast shadows', () => {
  const { scene, head, food } = setup()
  const casters = (root) => {
    let n = 0
    root.traverse((o) => { if (o.isMesh && o.castShadow) n++ })
    return n
  }
  assert.ok(casters(head()) >= 1)
  assert.ok(casters(food()) >= 1)
  assert.equal(scene.getObjectByName('snake-body').castShadow, true)
})

test('dispose removes only what the view added and frees every geometry and material', () => {
  const keep = new THREE.Group()
  const { scene, view } = setup((s) => s.add(keep))
  view.update(game(cells([5, 5], [4, 5], [3, 5]), 'right', 0), 1, 0)
  view.onEat({ x: 5, y: 5 })
  const freed = new Set()
  const all = new Set()
  const wrapDispose = (r) => {
    if (!r || all.has(r.uuid)) return
    all.add(r.uuid)
    const original = r.dispose.bind(r)
    r.dispose = () => { freed.add(r.uuid); original() }
  }
  scene.traverse((o) => {
    wrapDispose(o.geometry)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) wrapDispose(m)
  })
  assert.ok(all.size >= 6)
  view.dispose()
  assert.deepEqual(scene.children, [keep])
  assert.equal(scene.getObjectByName('snake-head'), undefined)
  assert.equal(scene.getObjectByName('food'), undefined)
  for (const id of all) assert.ok(freed.has(id), `not disposed: ${id}`)
})
```

**Acceptance:** `node --test test/snake-view.test.js` passes with no WebGL, canvas or DOM. After `createSnakeView` returns, no geometry, material or mesh is created.

### Task 10: Page shell and HUD styling

**Aether:**
- Area: ui
- Owns: `index.html`, `styles.css`, `test/page.test.js`
- Depends on: Task 6 — `styles.css` styles the class names and attributes that `src/hud.js` builds
- Serves: R1, R10

**Interfaces:**

`index.html` (exactly these parts; no CDN, no external URL):
- `<!doctype html>`, `<html lang="en">`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<title>Snake 3D</title>`, `<meta name="theme-color" content="#07061a">`, `<link rel="stylesheet" href="styles.css">`.
- In the body: `<canvas id="game"></canvas>`, `<div id="hud"></div>`, then (the import map before the module):

  ```html
  <script type="importmap">
    { "imports": { "three": "./node_modules/three/build/three.module.js", "three/addons/": "./node_modules/three/examples/jsm/" } }
  </script>
  <script type="module" src="./src/main.js"></script>
  ```

  and a `<noscript>` line saying the game needs JavaScript.

`styles.css` (theme "Neon Dusk"; system fonts only; no `@import`, no `url(...)`):
- `:root` custom properties: `--bg: #07061a`, `--ink: #e9e6ff`, `--accent: #ff3d9a`, `--mint: #3dffd6`, `--cyan: #20c8ff`, `--violet: #9b5cff`, `--amber: #ffb52e`, `--glass: rgba(10, 8, 34, 0.72)`, `--font-text: system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`, `--font-num: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace`.
- `html, body`: margin 0, height 100%, `overflow: hidden`, background `var(--bg)`, `touch-action: none`, `overscroll-behavior: none`, `-webkit-user-select: none; user-select: none`, color `var(--ink)`, font `var(--font-text)`.
- `#game`: `position: fixed; inset: 0; width: 100%; height: 100%; display: block; outline: none`.
- `#hud`: `position: fixed; inset: 0; pointer-events: none`.
- `.hud-root`: `position: absolute; inset: 0`.
- `.hud-bar`: `position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;` padding `calc(env(safe-area-inset-top) + 12px) calc(env(safe-area-inset-right) + 16px) 0 calc(env(safe-area-inset-left) + 16px)`.
- `.hud-stat`: a column; `.hud-label`: 11px, uppercase, `letter-spacing: 0.22em`, color `var(--cyan)` at 0.8 opacity; `.hud-value`: `font-family: var(--font-num); font-variant-numeric: tabular-nums;` white-ish with a soft glow (`text-shadow: 0 0 12px rgba(61, 255, 214, 0.45)`). `.hud-score .hud-value`: `font-size: clamp(28px, 9vw, 44px); font-weight: 700`; `.hud-best .hud-value`, `.hud-level .hud-value`: `font-size: clamp(18px, 5vw, 24px)`. `.hud-score` is on the left; `.hud-best` and `.hud-level` sit on the right (the bar groups them, text aligned right).
- `.hud-panel`: `position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 14px; text-align: center; padding: 24px; pointer-events: auto; cursor: pointer; background: radial-gradient(ellipse at center, rgba(7, 6, 26, 0.55), rgba(7, 6, 26, 0.15))`, a card feel on its content (`backdrop-filter: blur(8px)`; the card itself is a pseudo-box or the panel's inner width is `min(86vw, 420px)` with `background: var(--glass)`, `border: 1px solid rgba(255, 61, 154, 0.4)`, `border-radius: 18px`, padding 28px); `.hud-panel[data-visible="false"], .hud-badge[data-visible="false"] { display: none }` (written as `[data-visible="false"]`).
- `.hud-title`: `margin: 0; font-size: clamp(30px, 9vw, 56px); font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;` a mint-to-pink gradient (`linear-gradient(90deg, var(--mint), var(--accent))` with `-webkit-background-clip: text; background-clip: text; color: transparent`) and `filter: drop-shadow(0 0 14px rgba(255, 61, 154, 0.5))`.
- `.hud-hint`: `margin: 0; font-size: clamp(14px, 4vw, 18px); color: var(--ink); opacity: 0.85; letter-spacing: 0.04em`.
- `.hud-badge`: `NEW BEST` pill: accent border and text, `letter-spacing: 0.2em`, small caps size 13px, with a `@keyframes hud-pulse` animation (scale 1 to 1.08 and glow).
- `.hud-panel[data-kind="over"] .hud-title` uses an accent-to-amber gradient; `.hud-panel[data-kind="won"] .hud-title` uses an amber-to-mint gradient (both written with the `[data-kind="..."]` selector).
- `@media (max-width: 480px)`: the bar gap is 8px and padding sides 12px; the card padding is 20px.
- `@media (prefers-reduced-motion: reduce)`: animations are off (`animation: none`).

**Tests (write first):** `test/page.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

test('index.html: canvas, hud, viewport, title, stylesheet', () => {
  assert.match(html, /<canvas id="game"/)
  assert.match(html, /<div id="hud"/)
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/)
  assert.match(html, /<title>Snake 3D<\/title>/)
  assert.match(html, /<html lang="en">/)
  assert.match(html, /<link rel="stylesheet" href="(\.\/)?styles\.css">/)
})

test('index.html: the import map maps three and three/addons/ and comes before the module', () => {
  const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)
  assert.ok(m, 'import map present')
  assert.deepEqual(JSON.parse(m[1]), {
    imports: {
      three: './node_modules/three/build/three.module.js',
      'three/addons/': './node_modules/three/examples/jsm/',
    },
  })
  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/)
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'))
})

test('no CDN or external URL anywhere', () => {
  assert.doesNotMatch(html, /https?:\/\//)
  assert.doesNotMatch(css, /https?:\/\//)
  assert.doesNotMatch(css, /@import|url\(/)
})

test('styles.css styles every class the HUD builds', () => {
  for (const sel of ['#game', '#hud', '.hud-root', '.hud-bar', '.hud-stat', '.hud-score', '.hud-best', '.hud-level', '.hud-label', '.hud-value', '.hud-panel', '.hud-badge', '.hud-title', '.hud-hint', '[data-visible="false"]', '[data-kind="over"]', '[data-kind="won"]']) {
    assert.ok(css.includes(sel), sel)
  }
})

test('styles.css: full-window canvas, no scrollbars, phone-friendly HUD', () => {
  assert.match(css, /overflow:\s*hidden/)
  assert.match(css, /touch-action:\s*none/)
  assert.match(css, /position:\s*fixed/)
  assert.match(css, /env\(safe-area-inset-top\)/)
  assert.match(css, /@media[^{]*max-width/)
  assert.match(css, /backdrop-filter/)
  assert.match(css, /tabular-nums/)
  assert.match(css, /pointer-events:\s*none/)
  assert.match(css, /pointer-events:\s*auto/)
  assert.match(css, /clamp\(/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /@keyframes/)
})

test('styles.css carries the Neon Dusk palette and system fonts', () => {
  for (const hex of ['#07061a', '#ff3d9a', '#3dffd6', '#20c8ff', '#9b5cff', '#ffb52e']) {
    assert.ok(css.toLowerCase().includes(hex), hex)
  }
  assert.match(css, /system-ui/)
  assert.match(css, /ui-monospace/)
})
```

**Acceptance:** `node --test test/page.test.js` passes. Opening the page shows a full-window canvas with no scrollbars; at 390 x 844 the HUD bar fits on one row and the panel card is at most 86 percent of the width.

### Task 11: Game flow, high score wiring and debug state

**Aether:**
- Review: xhigh — pause/resume timing, the 5-tick cap, and the single high-score write decide whether the game is stable and the player's best is kept
- Area: app
- Owns: `src/app.js`, `test/app.test.js`
- Depends on: Task 7 — it drives the game rules (createGame, start, turn, tick, togglePause, restart)
- Depends on: Task 3 — it loads and saves the high score (loadHighScore, saveHighScore)
- Depends on: Task 4 — it advances the game with createLoop
- Depends on: Task 6 — it builds the HUD model with hudModel
- Serves: R12, R13, R5, R11

**Interfaces:**

```ts
// the app module: pure logic. Imports the game, loop and storage modules and hudModel from the hud module (same folder, './name.js'). No three, no DOM.
export function parseSeed(search)   // '?seed=42' -> 42; no valid integer -> null
export function createApp({ seed, width = 20, height = 20, storage, view, hud, startMs = 0, initialGame })
// -> {
//   command(cmd, nowMs),   // cmd: 'up'|'down'|'left'|'right'|'pause'|'restart'
//   tap(nowMs),
//   frame(nowMs),
//   autoPause(nowMs),
//   getState(),
// }
```

Injected objects (the tests pass fakes): `storage` is `{ getItem, setItem }` or anything (`loadHighScore` and `saveHighScore` never throw); `view` has `update(game, alpha, timeMs)`, `onEat(cell)`, `onLevelUp()`, `onGameOver()`, `reset()`; `hud` has `update(model)`. `initialGame` (optional, for tests) replaces `createGame({ width, height, seed })`.

- `parseSeed(search)`: reads the `seed` parameter with `new URLSearchParams(search)`. When its value matches `/^-?\d+$/` and `Number(value)` is a safe integer, returns `Number(value) >>> 0`; otherwise returns `null`.
- State kept by the app: `game`; `loop = createLoop({ startMs })`; `highScore = loadHighScore(storage)`; `newBest` (false); `lastAlpha` (0); `lastModel` (a JSON string, initially none).
- `command(cmd, nowMs)`:
  - a direction: in `ready`, `game = start(turn(game, cmd))` and `loop.reset(nowMs)`; in `running`, `game = turn(game, cmd)`; otherwise ignored.
  - `'pause'`: in `running`, `game = togglePause(game)` (the status becomes `paused`; `lastAlpha` is kept as the frozen alpha); in `paused`, `game = togglePause(game)` and `loop.reset(nowMs - lastAlpha * game.tickMs)` (so the loop continues from the same alpha); otherwise ignored.
  - `'restart'`: in `ready`, `game = start(game)` and `loop.reset(nowMs)`; in `over` or `won`, `game = start(restart(game))`, `newBest = false`, `lastAlpha = 0`, `view.reset()`, `loop.reset(nowMs)`; in `running` or `paused`, ignored (an accidental Enter must not cost the player their game).
- `tap(nowMs)`: `ready` runs `command('restart', nowMs)`; `paused` runs `command('pause', nowMs)`; `over` and `won` run `command('restart', nowMs)`; `running` is ignored.
- `autoPause(nowMs)`: when `running`, it runs `command('pause', nowMs)`; otherwise it does nothing.
- `frame(nowMs)`:
  1. When `game.status === 'running'`: `{ ticks, alpha } = loop.advance(nowMs, game.tickMs)`; `lastAlpha = alpha`. Apply `tick` `ticks` times; after each tick compare with the game before it: if `foodsEaten` rose, call `view.onEat(game.snake[0])` (the cell where the head now is); if `level` rose, call `view.onLevelUp()`; if the status became `over`, call `view.onGameOver()` and finish the game; if it became `won`, call `view.onLevelUp()` and finish the game. After a status change away from `running`, stop applying ticks.
  2. "Finish the game": `previous = highScore`; `highScore = saveHighScore(storage, game.score)`; `newBest = game.score > previous`. This runs once per game.
  3. `alphaToShow`: `lastAlpha` while `running` or `paused`, and 1 in `ready`, `over` and `won`.
  4. Call `view.update(game, alphaToShow, nowMs)`.
  5. Build `hudModel({ status: game.status, score: game.score, highScore: Math.max(highScore, game.score), level: game.level, isNewBest: newBest })`; call `hud.update(model)` only when `JSON.stringify(model)` differs from the last call (the first call always goes through).
- `getState()` returns a fresh plain object, never the internal one: `{ status, score, highScore: Math.max(highScore, game.score), level, length: game.snake.length, head: { x, y }, food: { x, y } | null, direction, width, height, tickMs, foodsEaten, ticks }`. Reading it changes nothing.

**Tests (write first):** `test/app.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp, parseSeed } from '../src/app.js'
import { createGame } from '../src/game.js'

const memoryStorage = (initial = {}) => {
  const data = { ...initial }
  const writes = []
  return {
    data,
    writes,
    getItem: (k) => (k in data ? data[k] : null),
    setItem(k, v) { data[k] = String(v); writes.push([k, String(v)]) },
  }
}
const fakeView = () => {
  const calls = []
  return {
    calls,
    update: (...args) => calls.push(['update', ...args]),
    onEat: (c) => calls.push(['eat', c]),
    onLevelUp: () => calls.push(['levelUp']),
    onGameOver: () => calls.push(['gameOver']),
    reset: () => calls.push(['reset']),
    count: (n) => calls.filter((c) => c[0] === n).length,
    last: (n) => calls.filter((c) => c[0] === n).at(-1),
  }
}
const fakeHud = () => {
  const models = []
  return { models, update: (m) => models.push(m) }
}
const make = (opts = {}) => {
  const view = fakeView()
  const hud = fakeHud()
  const storage = opts.storage ?? memoryStorage()
  const app = createApp({ seed: 1, view, hud, storage, startMs: 0, ...opts })
  return { app, view, hud, storage }
}
const crafted = (o = {}) => ({
  ...createGame({ width: 8, height: 8, seed: 2 }),
  snake: [{ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 4 }],
  direction: 'right',
  food: { x: 6, y: 4 },
  ...o,
})
const close = (a, b) => Math.abs(a - b) < 1e-6

test('parseSeed', () => {
  assert.equal(parseSeed('?seed=42'), 42)
  assert.equal(parseSeed('?x=1&seed=7'), 7)
  assert.equal(parseSeed('?seed=007'), 7)
  assert.equal(parseSeed('?seed=-1'), 4294967295)
  assert.equal(parseSeed('?seed=99999999999'), 99999999999 >>> 0)
  for (const bad of ['', '?', '?seed=', '?seed=abc', '?seed=1.5', '?seed=1e3', '?other=3']) assert.equal(parseSeed(bad), null, bad)
})

test('getState has exactly the debug fields and the starting values', () => {
  const { app } = make({ storage: memoryStorage({ 'snake3d.highScore': '120' }) })
  const s = app.getState()
  assert.deepEqual(Object.keys(s).sort(), ['direction', 'food', 'foodsEaten', 'head', 'height', 'highScore', 'length', 'level', 'score', 'status', 'tickMs', 'ticks', 'width'])
  assert.equal(s.status, 'ready')
  assert.equal(s.length, 3)
  assert.deepEqual(s.head, { x: 10, y: 10 })
  assert.equal(s.direction, 'right')
  assert.equal(s.width, 20)
  assert.equal(s.height, 20)
  assert.equal(s.tickMs, 150)
  assert.equal(s.ticks, 0)
  assert.equal(s.score, 0)
  assert.equal(s.highScore, 120)
  assert.ok(Number.isInteger(s.food.x) && Number.isInteger(s.food.y))
})

test('getState hands out copies and never changes the game', () => {
  const { app } = make()
  const s = app.getState()
  s.head.x = 99
  s.score = 7
  s.food = null
  const again = app.getState()
  assert.equal(again.head.x, 10)
  assert.equal(again.score, 0)
  assert.ok(again.food)
  assert.notEqual(app.getState(), app.getState())
})

test('the same seed gives the same game', () => {
  assert.deepEqual(make({ seed: 7 }).app.getState(), make({ seed: 7 }).app.getState())
})

test('the title screen: frame shows the ready panel, the view is at alpha 1, the hud updates once', () => {
  const { app, view, hud } = make()
  for (let t = 0; t < 5; t++) app.frame(t * 16)
  assert.equal(hud.models.length, 1)
  assert.equal(hud.models[0].panel.kind, 'ready')
  const u = view.last('update')
  assert.equal(u[2], 1)
  assert.equal(u[3], 64)
  assert.equal(u[1].status, 'ready')
})

test('an arrow key starts the game and turns; ticks come from frame()', () => {
  const { app } = make()
  app.command('up', 0)
  assert.equal(app.getState().status, 'running')
  app.frame(149)
  assert.equal(app.getState().ticks, 0)
  app.frame(150)
  const s = app.getState()
  assert.equal(s.ticks, 1)
  assert.deepEqual(s.head, { x: 10, y: 9 })
  assert.equal(s.direction, 'up')
})

test('Enter starts without turning, pause does nothing on the title screen', () => {
  const { app } = make()
  app.command('pause', 0)
  assert.equal(app.getState().status, 'ready')
  app.command('restart', 0)
  assert.equal(app.getState().status, 'running')
  app.frame(150)
  assert.deepEqual(app.getState().head, { x: 11, y: 10 })
})

test('a long stall runs at most 5 ticks', () => {
  const { app } = make()
  app.command('right', 0)
  app.frame(100000)
  const s = app.getState()
  assert.equal(s.ticks, 5)
  assert.equal(s.status, 'running')
  assert.equal(s.head.x, 15)
})

test('pause freezes the game and resume continues without a jump', () => {
  const { app, view, hud } = make()
  app.command('right', 0)
  app.frame(100)
  assert.ok(close(view.last('update')[2], 100 / 150))
  app.command('pause', 100)
  assert.equal(app.getState().status, 'paused')
  app.frame(10000)
  assert.equal(app.getState().ticks, 0)
  assert.ok(close(view.last('update')[2], 100 / 150))
  assert.equal(hud.models.at(-1).panel.kind, 'paused')
  app.command('pause', 10000)
  assert.equal(app.getState().status, 'running')
  app.frame(10000)
  assert.ok(close(view.last('update')[2], 100 / 150))
  app.frame(10040)
  assert.equal(app.getState().ticks, 0)
  assert.ok(close(view.last('update')[2], 140 / 150))
  app.frame(10060)
  assert.equal(app.getState().ticks, 1)
})

test('eating calls onEat with the head cell and the score rises', () => {
  const { app, view } = make({ initialGame: { ...crafted(), status: 'running' } })
  app.frame(150)
  assert.deepEqual(view.calls.find((c) => c[0] === 'eat')[1], { x: 6, y: 4 })
  assert.equal(app.getState().score, 10)
  assert.equal(app.getState().length, 4)
})

test('every 5th food calls onLevelUp once', () => {
  const { app, view } = make({ initialGame: { ...crafted({ foodsEaten: 4, score: 40 }), status: 'running' } })
  app.frame(150)
  assert.equal(view.count('levelUp'), 1)
  const s = app.getState()
  assert.equal(s.level, 2)
  assert.equal(s.tickMs, 135)
})

test('game over saves the high score once, calls onGameOver once, and marks a new best', () => {
  const storage = memoryStorage({ 'snake3d.highScore': '5' })
  const { app, view, hud } = make({ storage, initialGame: { ...crafted(), status: 'running' } })
  for (const t of [150, 300, 450, 600, 750, 900]) app.frame(t)
  const s = app.getState()
  assert.equal(s.status, 'over')
  assert.ok(s.score >= 10)
  assert.equal(view.count('gameOver'), 1)
  assert.equal(storage.data['snake3d.highScore'], String(s.score))
  assert.equal(storage.writes.length, 1)
  assert.equal(s.highScore, s.score)
  const model = hud.models.at(-1)
  assert.equal(model.panel.kind, 'over')
  assert.equal(model.panel.newBest, true)
  assert.equal(model.best, String(s.score))
  assert.equal(view.last('update')[2], 1)
})

test('game over below the best does not mark a new best and keeps the stored best', () => {
  const storage = memoryStorage({ 'snake3d.highScore': '999' })
  const { app, hud } = make({ storage, initialGame: { ...crafted(), status: 'running' } })
  for (const t of [150, 300, 450, 600]) app.frame(t)
  assert.equal(app.getState().status, 'over')
  assert.equal(storage.data['snake3d.highScore'], '999')
  assert.equal(hud.models.at(-1).panel.newBest, false)
  assert.equal(hud.models.at(-1).best, '999')
})

test('Enter after game over starts a new running game at once; Enter while running is ignored', () => {
  const storage = memoryStorage({ 'snake3d.highScore': '999' })
  const { app, view } = make({ storage, initialGame: { ...crafted(), status: 'running' } })
  for (const t of [150, 300, 450, 600]) app.frame(t)
  assert.equal(app.getState().status, 'over')
  app.command('restart', 700)
  let s = app.getState()
  assert.equal(s.status, 'running')
  assert.equal(s.score, 0)
  assert.equal(s.length, 3)
  assert.equal(s.ticks, 0)
  assert.equal(s.highScore, 999)
  assert.equal(view.count('reset'), 1)
  app.frame(849)
  assert.equal(app.getState().ticks, 0)
  app.frame(850)
  assert.equal(app.getState().ticks, 1)
  app.command('restart', 860)
  s = app.getState()
  assert.equal(s.ticks, 1)
  assert.equal(view.count('reset'), 1)
})

test('keys that do not apply are ignored in over and won', () => {
  const { app } = make({ initialGame: { ...crafted(), status: 'over' } })
  app.command('up', 0)
  app.command('pause', 0)
  assert.equal(app.getState().status, 'over')
})

test('filling the board wins, celebrates with onLevelUp, saves the score', () => {
  const snake = [
    { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 3 },
  ]
  const initialGame = { ...createGame({ width: 4, height: 4, seed: 1 }), status: 'running', direction: 'left', queue: [], snake, food: { x: 0, y: 0 } }
  const storage = memoryStorage()
  const { app, view, hud } = make({ storage, initialGame })
  app.frame(150)
  assert.equal(app.getState().status, 'won')
  assert.equal(app.getState().food, null)
  assert.equal(view.count('levelUp'), 1)
  assert.equal(hud.models.at(-1).panel.kind, 'won')
  assert.equal(storage.data['snake3d.highScore'], '10')
})

test('tap: starts, resumes, plays again, and does nothing while running', () => {
  const { app } = make()
  app.tap(0)
  assert.equal(app.getState().status, 'running')
  app.tap(10)
  assert.equal(app.getState().status, 'running')
  app.command('pause', 20)
  assert.equal(app.getState().status, 'paused')
  app.command('restart', 25)
  assert.equal(app.getState().status, 'paused', 'Enter does not discard a paused game')
  app.tap(30)
  assert.equal(app.getState().status, 'running')
  const over = make({ initialGame: { ...crafted(), status: 'over' } })
  over.app.tap(0)
  assert.equal(over.app.getState().status, 'running')
})

test('autoPause pauses a running game and ignores other states', () => {
  const { app } = make()
  app.autoPause(0)
  assert.equal(app.getState().status, 'ready')
  app.command('right', 0)
  app.autoPause(50)
  assert.equal(app.getState().status, 'paused')
  app.autoPause(60)
  assert.equal(app.getState().status, 'paused')
})

test('a storage that throws never breaks the game', () => {
  const storage = { getItem() { throw new Error('denied') }, setItem() { throw new Error('full') } }
  const { app } = make({ storage, initialGame: { ...crafted(), status: 'running' } })
  for (const t of [150, 300, 450, 600]) app.frame(t)
  const s = app.getState()
  assert.equal(s.status, 'over')
  assert.equal(s.highScore, s.score)
})

test('view.update gets the real time of each frame', () => {
  const { app, view } = make()
  app.frame(33)
  assert.equal(view.last('update')[3], 33)
})
```

**Acceptance:** `node --test test/app.test.js` passes. `src/app.js` imports no `three` and uses no global `document` or `window`.

### Task 12: Renderer, bloom, resize and boot

**Aether:**
- Review: high — the whole game is wired here; a wrong import path or a thrown error leaves a blank page
- Area: app
- Owns: `src/main.js`, `test/main.test.js`
- Depends on: Task 8 — it uses buildWorld, frameCamera and fogRange
- Depends on: Task 9 — it uses createSnakeView
- Depends on: Task 10 — it relies on the elements #game and #hud of the page and on the HUD styles
- Depends on: Task 11 — it uses createApp and parseSeed
- Depends on: Task 2 — it uses attachInput
- Depends on: Task 6 — it uses createHud
- Depends on: Task 5 — it uses THEME
- Depends on: Task 3 — it passes `window.localStorage` to the app as the storage
- Serves: R1, R9, R12, R13

**Interfaces:**

```ts
// the main module (src/main.js)
import * as THREE from 'three'
// from 'three/addons/postprocessing/': EffectComposer, RenderPass, UnrealBloomPass, OutputPass (each in its own file named like the class)
// from the sibling modules: createApp and parseSeed (app), attachInput (input), createHud (hud), THEME (theme),
// buildWorld, frameCamera and fogRange (world), createSnakeView (snake-view)
export function toRenderInfo(info) // renderer.info -> { calls, triangles, geometries, textures }; a missing number is 0
export function boot()             // builds and starts everything in the browser
// last lines of the module:
// if (typeof window !== 'undefined' && typeof document !== 'undefined') boot()
```

Importing `src/main.js` in Node must have no side effect and must not throw (this is the test); the browser path only runs through `boot()`.

`toRenderInfo(info)`: `{ calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures }`, with `0` for anything missing (the argument or its parts may be absent).

`boot()`, in this order:
1. `canvas = document.getElementById('game')`, `hudRoot = document.getElementById('hud')`. The whole creation of the renderer is in a `try`; if it throws, set `hudRoot.textContent = 'This game needs WebGL.'` and return.
2. `renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })`; `renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))`; `renderer.shadowMap.enabled = true`; `renderer.shadowMap.type = THREE.PCFShadowMap`; `renderer.toneMapping = THREE.ACESFilmicToneMapping`; `renderer.toneMappingExposure = 1.1`; `renderer.outputColorSpace = THREE.SRGBColorSpace`; `renderer.info.autoReset = false`.
3. `scene = new THREE.Scene()`; `scene.background = new THREE.Color(THEME.colors.background)`; `scene.fog = new THREE.Fog(THEME.colors.fog, 10, 100)` (its range is set by `fogRange` on every framing); `camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500)`.
4. `WIDTH = 20`, `HEIGHT = 20`. `world = buildWorld({ width: WIDTH, height: HEIGHT, theme: THEME })`; `scene.add(world)`; `view = createSnakeView({ scene, theme: THEME, width: WIDTH, height: HEIGHT })`; `hud = createHud(hudRoot)`.
5. Storage: `let storage = null; try { storage = window.localStorage } catch {}`. Seed: `parseSeed(window.location.search) ?? (Math.floor(Math.random() * 4294967296) >>> 0)`. `app = createApp({ seed, width: WIDTH, height: HEIGHT, storage, view, hud, startMs: performance.now() })`.
6. Input: `attachInput(window, (command) => app.command(command, performance.now()))`. A tap or click on the HUD panel: `hud.element.addEventListener('click', () => app.tap(performance.now()))`. `document.addEventListener('visibilitychange', () => { if (document.hidden) app.autoPause(performance.now()) })`.
7. Post-processing: `composer = null`; inside a `try`, build an `EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }))`, add `new RenderPass(scene, camera)`, `new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), THEME.bloom.strength, THEME.bloom.radius, THEME.bloom.threshold)`, and `new OutputPass()`. If the `try` throws, `console.warn` once and keep `composer = null`.
8. `yaw = 0`. `resize()`: `w = window.innerWidth`, `h = window.innerHeight`; `renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))`; `renderer.setSize(w, h, false)`; if `composer`, `composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))` and `composer.setSize(w, h)`; then `frame()` of the camera: `distance = frameCamera(camera, { width: WIDTH, height: HEIGHT, aspect: w / h, yaw })`; `const { near, far } = fogRange(distance)`; set `scene.fog.near = near`, `scene.fog.far = far`. Listen to `resize` and `orientationchange` on `window`, and call `resize()` once.
9. `window.snake = { getState: () => app.getState(), getRenderInfo: () => toRenderInfo(renderer.info) }`. Nothing else is put on `window`.
10. The loop with `renderer.setAnimationLoop((t) => { ... })`. `t` is the time in ms. Each frame: `renderer.info.reset()`; `app.frame(t)`; `const status = app.getState().status`; `const target = status === 'ready' ? Math.sin(t / 2600) * 0.28 : 0`; `yaw += (target - yaw) * 0.06`; frame the camera again as in `resize()` (same `frameCamera` + `fogRange` code, aspect from `window.innerWidth / window.innerHeight`); `const k = view.cameraKick()`; `camera.position.x += k.x`, `camera.position.y += k.y`, `camera.position.z += k.z`; `camera.lookAt(0, 0, 0)`; render: `if (composer) { try { composer.render() } catch (e) { console.warn(e); composer = null; renderer.render(scene, camera) } } else renderer.render(scene, camera)`.

**Tests (write first):** `test/main.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = await import('../src/main.js')
const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')

test('importing main.js in Node has no side effect and exports boot and toRenderInfo', () => {
  assert.equal(typeof main.boot, 'function')
  assert.equal(typeof main.toRenderInfo, 'function')
  assert.equal(typeof window, 'undefined')
})

test('toRenderInfo maps renderer.info', () => {
  assert.deepEqual(main.toRenderInfo({ render: { calls: 12, triangles: 3456 }, memory: { geometries: 9, textures: 2 } }), {
    calls: 12, triangles: 3456, geometries: 9, textures: 2,
  })
  assert.deepEqual(main.toRenderInfo({}), { calls: 0, triangles: 0, geometries: 0, textures: 0 })
  assert.deepEqual(main.toRenderInfo(undefined), { calls: 0, triangles: 0, geometries: 0, textures: 0 })
})

test('the renderer is set up as the spec asks', () => {
  assert.match(src, /new THREE\.WebGLRenderer\(\{[^}]*antialias:\s*true/)
  assert.match(src, /Math\.min\([^)]*devicePixelRatio[^)]*,\s*2\)/)
  assert.match(src, /shadowMap\.enabled\s*=\s*true/)
  assert.match(src, /THREE\.PCFShadowMap/)
  assert.doesNotMatch(src, /PCFSoftShadowMap/)
  assert.match(src, /THREE\.ACESFilmicToneMapping/)
  assert.match(src, /THREE\.SRGBColorSpace/)
  assert.match(src, /new THREE\.Fog\(/)
  assert.match(src, /info\.autoReset\s*=\s*false/)
})

test('bloom comes from three/addons with a fallback', () => {
  for (const name of ['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'OutputPass']) {
    assert.match(src, new RegExp(`from 'three/addons/postprocessing/${name}\\.js'`), name)
  }
  assert.match(src, /samples:\s*4/)
  assert.match(src, /composer\s*=\s*null/)
  assert.match(src, /catch/)
})

test('the wiring: resize, visibility, input, debug API, seed', () => {
  assert.match(src, /'resize'/)
  assert.match(src, /visibilitychange/)
  assert.match(src, /attachInput\(/)
  assert.match(src, /window\.snake\s*=/)
  assert.match(src, /getState/)
  assert.match(src, /getRenderInfo/)
  assert.match(src, /parseSeed\(/)
  assert.match(src, /frameCamera\(/)
  assert.match(src, /cameraKick\(\)/)
  assert.match(src, /typeof window !== 'undefined' && typeof document !== 'undefined'/)
  assert.doesNotMatch(src, /https?:\/\//)
})
```

**Acceptance:** `node --test test/main.test.js` passes, then `npm test` is green for the whole project. Manual check (the plan's D9): `npm start`, open `http://localhost:8080/?seed=7`; `snake.getState()` shows `status: 'ready'`, `length: 3`, `head: { x: 10, y: 10 }`; after an arrow key the status is `'running'` and `ticks` rises; `snake.getRenderInfo()` read twice, 10 s apart, shows the same `geometries` and `textures`; Space pauses and resumes without a jump; Enter after game over starts a new game and `localStorage['snake3d.highScore']` holds the best score; resizing to 390 x 844 and to a wide window keeps the whole board in view.
