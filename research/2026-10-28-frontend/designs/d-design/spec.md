# Snake 3D: spec

Snake 3D is a browser game: the classic snake on a grid, rendered as a real 3D scene with three.js. It should look and feel like a small, finished indie game, not a tech demo. Four things judge it:
- the quality of its graphics;
- its creativity;
- how well it plays;
- the quality of its 3D.

- Intent: a 3D snake that looks and feels like a small, finished indie game, not a tech demo.
  - The owner: «El snake se tiene que ver bien visualmente, y estable para jugar»

## Criteria

- The quality of its graphics.
- Its creativity.
- How well it plays: correct, stable and smooth.
- The quality of its 3D.

## Platform

- **Static site, no build step:** `index.html` loads `src/main.js` as an ES module. three.js 0.186.1 comes from `node_modules`, through an import map in `index.html`:

  ```html
  <script type="importmap">
    { "imports": { "three": "./node_modules/three/build/three.module.js", "three/addons/": "./node_modules/three/examples/jsm/" } }
  </script>
  ```

- `npm start` serves the project on `http://localhost:8080/` (`scripts/serve.js`). No CDN, and no dependency other than `three`.
- **Tests:** they use Node.js 22 with ES modules (`"type": "module"`). `npm test` runs `node --test` on `test/`. Tests may import `three`, because Node resolves it from `node_modules`. A fresh checkout needs `npm ci` first.

## Rules: `src/rng.js`, `src/game.js`

These modules are pure and import neither three.js nor the DOM.

**Random numbers.** They are seeded and deterministic (mulberry32), and the state is a 32-bit unsigned integer.
- `nextRandom(state)` returns `{ value, state }`, with `value` in [0, 1).
- `randomInt(state, n)` returns `{ value, state }`, with `value` an integer in [0, n).

**The game state** is a plain object. Every function takes a game and returns a new one, never changing its input. Its fields:

| Field | Meaning |
|---|---|
| `width`, `height` | Board size in cells: integers from 4 to 64. Any other value throws `Error('invalid board: ...')` |
| `snake` | The snake's cells as `{ x, y }`, head first. `x` grows to the right and `y` grows down |
| `direction` | `'up'`, `'down'`, `'left'` or `'right'` |
| `queue` | Up to 2 pending directions, applied one per tick |
| `food` | `{ x, y }` on a free cell, or `null` when no cell is free |
| `score`, `foodsEaten` | Start at 0 |
| `level` | Starts at 1 |
| `tickMs` | Milliseconds per tick; starts at 150 |
| `status` | `'ready'`, `'running'`, `'paused'`, `'over'` or `'won'` |
| `rng` | The random state |
| `seed` | The seed the game was created with |
| `ticks` | Ticks played; starts at 0 |

**The functions:**
- **`createGame({ width = 20, height = 20, seed = 1 })`:** a `'ready'` game. The snake has 3 cells: its head at `(floor(width / 2), floor(height / 2))`, and its body extending to the left. It moves right. The food is placed on a random free cell.
- **`start(game)`:** `'ready'` becomes `'running'`; any other status is left unchanged.
- **`turn(game, direction)`:** queues a direction while the game is `'ready'` or `'running'`, and is ignored otherwise. A direction is ignored when it equals or reverses the last queued direction, or the current one when the queue is empty, and when the queue already holds 2.
- **`tick(game)`:** only acts while `'running'`; otherwise it returns the game unchanged. It:
  1. takes the first queued direction, if any, and moves the head one cell;
  2. leaving the board, or hitting the body, makes the game `'over'`, and the snake does not move. The cell the tail is about to leave counts as free;
  3. on the food, the snake grows by one cell. The score rises by `10 × level`, and `foodsEaten` by 1. Every 5th food raises the level by 1 and sets `tickMs` to `max(60, tickMs − 15)`. New food goes on a random free cell. When no cell is left, the food is `null` and the game is `'won'`;
  4. `ticks` rises by 1 on every tick that moves the snake.
- **`togglePause(game)`:** `'running'` and `'paused'` swap; any other status is left unchanged.
- **`restart(game)`:** a new `'ready'` game on the same board, seeded from the current random state, so the food differs.

## Input: `src/input.js`

- **`keyToCommand(key)`:**
  - the arrow keys and WASD, in either case, give `'up'`, `'down'`, `'left'` or `'right'`;
  - Space, `p`, `P` and `Escape` give `'pause'`;
  - `Enter`, `r` and `R` give `'restart'`;
  - anything else gives `null`.
- **`swipeToDirection(dx, dy, minDistance = 30)`:** the direction of the dominant axis, or `null` when the swipe is shorter than `minDistance`.
- **`attachInput(target, onCommand)`:** listens for `keydown` and for touch swipes (`touchstart`, then `touchend`) on `target`. It calls `onCommand` with each command, and calls `preventDefault()` on the events of game keys. It returns a `detach()` function.

## High score: `src/storage.js`

- `HIGH_SCORE_KEY` is `'snake3d.highScore'`.
- `loadHighScore(storage)` returns the stored non-negative integer, and 0 for anything else.
- `saveHighScore(storage, score)` stores the best of the stored score and `score`, and returns it.
- Neither function ever throws, even when `storage` is missing or throws.

## Look and 3D

The art direction is yours. Pick a theme with a mood (neon arcade, toy diorama, deep sea, alien garden, or your own), name it, and carry it through:
- the scene and its atmosphere;
- the snake and the food;
- the effects;
- the HUD;
- optionally, the sound.

Coherence matters as much as spectacle.

**`src/render/theme.js`** (pure):
- **`CELL`:** `1`.
- **`THEME = { name, colors, bloom }`:**
  - `colors` has `background`, `fog`, `board`, `boardAlt`, `wall`, `snakeHead`, `snakeBody`, `snakeTail`, `food`, `particle` and `accent`, each a 24-bit integer;
  - `bloom` is `{ strength, radius, threshold }`, for an optional bloom pass.
- **`gridToWorld(x, y, width, height)`:** returns `{ x, z }` with the board centered on the origin, one `CELL` per cell, and cell centers at half-cell offsets. The grid's `y` maps to the world's `z`.
- **Helpers:**
  - `lerp(a, b, t)`, `easeOutCubic(t)` and `clamp01(t)`;
  - `bodyColor(index, length)`, which runs from `snakeBody` at index 1 to `snakeTail` at index `length − 1`.

**`src/render/world.js`:**
- **`buildWorld({ width, height, theme })`:** returns a `THREE.Group` named `'world'` that holds:
  - a board named `'board'`: a mesh or instanced mesh that receives shadows and spans the board, centered on the origin;
  - walls named `'walls'` around it;
  - at least one shadow-casting directional light;
  - any decoration.
- **`frameCamera(camera, { width, height, aspect })`:** places a perspective camera above the board and at an angle, never straight down, looking at its center. The whole board stays in view at any aspect, landscape or portrait.

**`src/render/snake-view.js`:**
- **`HEADING`:** `{ up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 }`, the head's `rotation.y` for each direction. The head is modeled facing +Z.
- **`createSnakeView({ scene, theme, width, height })`:** adds the snake and the food to `scene`, and returns:
  - **`update(game, alpha, timeMs)`:** call it every frame.
    - Positions move linearly from the previous tick's cells, at `alpha = 0`, to the current ones, at `alpha = 1`.
    - The head is an object named `'snake-head'`. It is distinct from the body, and at `alpha = 1` its `rotation.y` equals `HEADING[game.direction]`.
    - The food is an object named `'food'`, on its cell in x and z, and animated (for example, it bobs, spins or pulses).
  - **`segmentPositions()`:** the `{ x, z }` world positions of the body segments, from the neck to the tail, without the head.
  - **`onEat(cell)`:** starts an effect on that cell, such as a burst of particles. `activeEffects()` counts the live effects, which end within 2 seconds.
  - **`onGameOver()`:** starts a game-over effect.
  - **`reset()`:** clears the interpolation and the effects.
  - **`dispose()`:** removes everything it added, and frees its geometries and materials.
- **Performance:**
  - body segments come from an `InstancedMesh` or a pool;
  - no geometry or material is created per tick or per frame;
  - the device pixel ratio is capped at 2.

**Rendering in `src/main.js`:**
- `WebGLRenderer` with antialiasing;
- shadows on;
- ACES Filmic tone mapping and sRGB output;
- fog or an atmosphere that fits the theme;
- post-processing from `three/addons` is welcome (bloom, for example);
- resizing keeps the board framed.

## HUD and screens: `index.html`, `styles.css`, `src/hud.js`

- **`hudModel({ status, score, highScore, level, isNewBest })`:** pure. It returns `{ score, best, level, panel }`:
  - `score`, `best` and `level` are strings;
  - `panel` is `null` while `'running'`, and otherwise `{ kind, title, hint, newBest }`, where `kind` is the status;
  - the hint names the keys: the arrow keys for `'ready'`, Space for `'paused'`, and Enter for `'over'` and `'won'`.
- **`createHud(root)`:** builds the HUD inside `root`, and returns `{ update(model), element }`. The HUD shows the score, the best score and the level, and a panel for each screen: the title screen, pause, game over (marking a new best) and won.
- **`index.html`:** holds:
  - `<canvas id="game">`;
  - `<div id="hud">`;
  - the import map;
  - `src/main.js` as a module.
- **`styles.css`:** a full-window canvas, with no scrollbars. The HUD is readable over the scene and fits phones (390 × 844) as well as desktops.

## Game loop and wiring: `src/loop.js`, `src/main.js`

**`createLoop({ startMs })`** is pure. It returns:
- **`advance(nowMs, tickMs)`:** returns `{ ticks, alpha }`: the ticks now due, and the progress toward the next one, in [0, 1). It runs at most 5 ticks per call and drops the rest. Time going backwards counts as 0.
- **`reset(nowMs)`:** the next tick is then a full `tickMs` away.

**`src/main.js`** wires everything:
- a renderer, the scene, the world, the snake view, the HUD, input, the high score and the loop;
- **the game:**
  - `?seed=<integer>` in the URL sets the game's seed; without it, the seed is random;
  - on the title screen, an arrow key or Enter starts the game. An arrow key also turns;
  - Space pauses and resumes;
  - after game over or a win, Enter starts a new game at once;
- the high score is saved when a game ends;
- **effects:** eating, levelling up and game over each have visible feedback. Sound, synthesized with WebAudio, is optional and is muted with `m`.

**Debug API for automated play-testing.** Required, and it must not affect normal play:
- `window.snake.getState()` returns:

  ```
  { status, score, highScore, level, length, head: { x, y }, food: { x, y } | null,
    direction, width, height, tickMs, foodsEaten, ticks }
  ```

- `window.snake.getRenderInfo()` returns `{ calls, triangles, geometries, textures }`, from `renderer.info`.
