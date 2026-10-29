# Snake 3D: plan

**Spec:** [spec.md](spec.md)

## Technical context

- Static site, no build step. Browser: ES modules plus an import map (spec, Platform). Tests: Node.js 22, `node --test` on `test/`, no browser, no DOM, no WebGL.
- The only dependency is `three` 0.186.1 (already in `node_modules`). Post-processing comes from `three/addons/postprocessing/` (`EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`). No CDN, no texture files, no model files, no web fonts, no sound.
- The skeleton exists: `package.json` (`npm test` = `node --test`, `npm start` = `scripts/serve.js`), `scripts/serve.js`, `README.md`, `.gitignore`. The plan changes none of them.
- Shadow type: three r186 removed `PCFSoftShadowMap` (it logs a warning). Use `THREE.PCFShadowMap`.
- Code style: ES modules, no semicolons, 2 spaces, single quotes, no TypeScript. A test file never lives in `test/` unless `node --test` should run it (the runner executes every `.js` file under `test/`), so there are no helper files in `test/`.
- The spec's four criteria are numbered here: C1 graphics, C2 creativity, C3 plays well, C4 3D.
- The spec has no `## Requirements` section. This plan names the requirement ids itself, one per spec section. Tasks cite them in `Serves:`.

| Id | Spec section | Built by |
|---|---|---|
| R1 | Platform (static site, import map, `npm start`, `npm test`) | Task 10, Task 12 |
| R2 | Random numbers (`src/rng.js`) | Task 1 |
| R3 | Game state and functions (`src/game.js`) | Task 7 |
| R4 | Input (`src/input.js`) | Task 2 |
| R5 | High score (`src/storage.js`) | Task 3 |
| R6 | Theme and helpers (`src/render/theme.js`) | Task 5 |
| R7 | World (`src/render/world.js`) | Task 8 |
| R8 | Snake view (`src/render/snake-view.js`) | Task 9 |
| R9 | Rendering in `main.js` (renderer, tone mapping, fog, bloom, resize, DPR cap) | Task 12 |
| R10 | HUD and screens (`hudModel`, `createHud`, `index.html`, `styles.css`) | Task 6, Task 10 |
| R11 | Game loop (`src/loop.js`) | Task 4 |
| R12 | Wiring: controls, high score saved, effects | Task 11, Task 12 |
| R13 | Debug API (`window.snake`) | Task 11, Task 12 |

### Project structure

```
index.html            styles.css
src/rng.js            src/game.js          src/input.js      src/storage.js
src/loop.js           src/hud.js           src/app.js        src/main.js
src/render/theme.js   src/render/world.js  src/render/snake-view.js
test/<module>.test.js  (one per module above, plus page.test.js)
```

### Module graph

```
rng <- game <- app <- main
loop, storage, hud(hudModel) <- app
theme <- world, snake-view (snake-view also uses rng) <- main
input, hud(createHud), world, snake-view, app <- main
hud <- index.html/styles.css (class names)
```

## Gate

No `.specify/memory/constitution.md` exists, so there are no constitution checks.

- Nothing speculative, and nothing for a hypothetical need: **pass**. Sound (optional in the spec) is left out. There is no options object, no config file, no settings screen.
- No abstraction, option, file or dependency that no requirement asks for: **pass**. Every file serves a requirement (table above). `src/app.js` is the one file the spec does not name: it holds the wiring that the spec puts in `main.js` (R12, R13: controls, high score saved, effects, `getState`), and it exists so Node can test that logic without WebGL. `main.js` keeps only the browser objects.

## Design

### D1. One theme: "Neon Dusk" (Serves: C1, C2, C4 of the spec)

Mood: a synthwave night arcade. A toy diorama board floats in an indigo void under a star dome. Neon rails fence it, a mint-to-violet snake with glowing dorsal studs crosses it, and an amber crystal is the food. Hot pink is the danger and celebration colour. Everything bright is emissive and blooms. Everything else is dark and low contrast, so the bloom has something to stand out against.

`THEME` (pinned exactly by the theme test, so every task shares one look):

| Key | 24-bit integer | Use |
|---|---|---|
| `background` | 0x07061a | scene background, page background |
| `fog` | 0x0b0826 | scene fog |
| `board` | 0x15133d | checker tile A |
| `boardAlt` | 0x1b1850 | checker tile B |
| `wall` | 0x2c2780 | rails and pylons |
| `snakeHead` | 0x3dffd6 | head (mint) |
| `snakeBody` | 0x20c8ff | body just behind the head (cyan) |
| `snakeTail` | 0x9b5cff | tail tip (violet) |
| `food` | 0xffb52e | crystal and its light (amber) |
| `particle` | 0xffe08a | sparks (warm) |
| `accent` | 0xff3d9a | shockwaves, rail glow, grid lines, HUD accent, game-over (hot pink) |

`name: 'Neon Dusk'`. `bloom: { strength: 0.85, radius: 0.55, threshold: 0.62 }`.

Fog: linear `THREE.Fog(theme.colors.fog, near, far)`, with `near = 1.6 * distance` and `far = 3.2 * distance`, where `distance` is what `frameCamera` returns. `world.js` exports `fogRange(distance)` for this. The farthest board corner is at most about `1.5 * distance` from the camera at any aspect, so the board stays crisp; only far decoration fades into the void.

Fonts: system stacks only. Text: `system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. Numbers: `ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace` with `font-variant-numeric: tabular-nums`.

### D2. The board and the world (Serves: C1, C4)

- `board`: one `InstancedMesh` of `width * height` unit boxes (1 x 0.3 x 1, top face at y = 0), no gaps, instance colour `(x + y) % 2 === 0 ? board : boardAlt`, `receiveShadow`. Its bounding box is exactly `width x height`, centred on the origin. A thin `LineSegments` named `grid` (one shared `BufferGeometry`, accent colour, opacity 0.12) lies on top at y = 0.003. Cell index is `y * width + x`.
- `plinth`: a box slightly larger than the board under it, in the wall colour, so the board reads as a slab with thickness.
- `walls` (a `Group`): four rails around the board (height 0.5, thickness 0.35, `wall` colour, shadow casting and receiving), each with a thin `MeshBasicMaterial` strip on top in the accent colour multiplied by 1.4 (so it blooms), and four corner pylons with a glowing cap.
- `floor`: a dark circle below the plinth, small enough (radius `0.75 * max(width, height) + 4`) that the tilted camera sees the stars behind and below the board. `stars`: about 400 `Points` on a full sphere shell of radius 60 to 90 around the board, so the tilted camera, which looks down at the board, sees them in the void around it (vertex colours white, cyan, pink; `sizeAttenuation: false`, `fog: false`), placed with the seeded `nextRandom` of `rng.js`, so the world is the same on every run.
- Lights: `HemisphereLight(0x6a5cff, 0x120d2e, 0.7)`; a key `DirectionalLight(0xcfd8ff, 2.4)` that casts shadows (`mapSize` 2048, orthographic shadow camera covering the board plus a margin, `bias` -0.0004, `normalBias` 0.03); a pink rim `DirectionalLight(accent, 1.1)` from the opposite side, no shadows.

### D3. The camera (Serves: C1, C4)

`frameCamera(camera, { width, height, aspect, yaw = 0 })` looks at `(0, 0, 0)` from a fixed tilt. Elevation (angle above the board plane) is `lerp(50, 62, clamp01((1 - aspect) / 0.5))` degrees: 50 in landscape, 62 in a phone portrait. It never gets near 90. Distance comes from a binary search over `[1, 1000]` (24 steps): the smallest distance for which the 8 corners of the box `±(width/2 + 0.5)` x `y in {0, 0.6}` x `±(height/2 + 0.5)` all project inside `|ndc| <= 0.92`. `yaw` (radians) turns the camera around the vertical axis, and the fit uses the turned camera. The function sets `camera.aspect`, `near = 0.1`, `far = 6 * distance`, calls `updateProjectionMatrix` and `updateMatrixWorld(true)`, and returns `distance`. No allocation per call beyond a few module-level vectors.

`main.js` calls it on resize and then every frame: on the title screen the yaw eases toward `sin(t / 2600) * 0.28` (a slow cinematic sway), and while playing it eases to 0. After framing, it adds `view.cameraKick()` to the camera position and calls `lookAt(0, 0, 0)` (the game-over shake).

### D4. Smooth motion between ticks (Serves: C3, C4)

The view keeps two world-space snapshots of the snake, `from` and `to` (preallocated `Float32Array`s of capacity `width * height`).

- `update` reads `game.ticks`. When it equals the last seen value plus 1, `from` becomes the previous `to`, and `to` is built from `game.snake`. Otherwise (first call, restart, a jump of more than one tick) `from = to`, which snaps with no animation.
- Growth: when the new snake is longer, the missing `from` entries copy the old tail, so the new tail segment grows out of the old tail and never teleports.
- Every segment moves from its own `from` to its own `to`. Each segment moves to the cell the segment ahead of it occupied, so a step is always exactly one cell or less, and a turn never cuts a corner. The head moves linearly the same way.
- The head turn: the previous heading and `HEADING[game.direction]` are joined by the shortest signed angle, eased with `easeOutCubic(clamp01(alpha / 0.6))`. At eased `t >= 1` the value is set exactly to `HEADING[game.direction]`, so the spec's equality at `alpha = 1` holds.
- Pause and resume: `main`/`app` pass the view the frozen `alpha` while paused (not 1), and on resume the app calls `loop.reset(now - frozenAlpha * tickMs)`, so the loop restarts at the same `alpha`. The snake neither jumps forward on pause nor back on resume. In `ready`, `over` and `won` the app passes `alpha = 1`.
- A body segment is a bead: spheres overlap (spacing at least 0.7 for radius 0.42 x scale, so no gap shows at a diagonal corner step). A travelling wave (`sin(timeMs * 0.008 - i * 0.6)`, +/-4 percent scale) makes the body breathe, and a swallow bump (a Gaussian bump of +35 percent scale that runs from the head to the tail in about a second) shows food passing through the body.

### D5. The snake, the food, the effects (Serves: C1, C2, C4)

- Body: `InstancedMesh` named `snake-body` (shared `SphereGeometry(0.42, 20, 14)`, `MeshStandardMaterial` white, roughness 0.35, per-instance colour from `bodyColor(i, length)`, casts shadows). Radius multiplier tapers from 1 at the neck to 0.6 at the tail. `snake-glow`: a second `InstancedMesh` of small spheres (radius 0.17, on top of each segment) with `MeshBasicMaterial`, instance colour = the same `bodyColor` times 1.6 (above 1, so the bloom picks it up): the dorsal studs. Colours are rewritten only when `ticks` or the length changes.
- Head: a `Group` named `snake-head`, modeled facing +Z: an ellipsoid (scale 0.95 / 0.8 / 1.05, `snakeHead`, emissive 0.35), two white eyes with dark pupils on the front-top, and a pink tongue (`accent`) that flicks (scale and visibility on a 1.2 s cycle). Bobs by +/-0.03 in y.
- Food: a `Group` named `food` with a faceted amber crystal (`OctahedronGeometry`, scaled 1 / 1.35 / 1, `flatShading`, emissive 0.8): it spins (`rotation.y = t * 0.0025`), bobs (`y = 0.55 + 0.12 * sin(t * 0.004)`), pulses (+/-8 percent scale), and pops in with `easeOutCubic` over 300 ms whenever its cell changes. A separate `food-ring` (flat `RingGeometry` on the board, additive, pulsing) and a `food-light` (`PointLight`, food colour, intensity 6, distance 6, no shadow) tint the board around it. `food` is hidden when `game.food` is `null`.
- Effects, all pooled and preallocated (a particle `InstancedMesh` named `particles`, 160 slots, small octahedra; 6 `RingGeometry` shockwave meshes), driven by a seeded `nextRandom` stream so they are deterministic:
  - `onEat(cell)`: 28 sparks (mix of `food` and `particle` colours, gravity, shrinking, 0.7 to 0.9 s), a shockwave ring on the cell (0.6 s), and the swallow bump. 0.9 s.
  - `onLevelUp()`: a pink ring from the middle of the board out to `0.75 * max(width, height)` (1.2 s) and a stud glow boost (x2.5 fading out). 1.4 s.
  - `onGameOver()`: 60 sparks from the head and along the body, a pink ring at the head (1 s), a camera kick (damped shake over 0.6 s), and a persistent dim (body and studs fade to about 35 percent over 0.8 s, kept until `reset()`). 1.8 s.
  - Every effect ends within 2 s of the start time (the time of the last `update`, or 0). `activeEffects()` counts the effects not yet expired as of the last `update`.
- `cameraKick()` returns a reused `{ x, y, z }` (no allocation).
- `dispose()` removes everything the view added and calls `dispose()` on every geometry and material (and on each instanced mesh).

### D6. Rendering in `main.js` (Serves: C1, C3, C4)

- `WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })`, `setPixelRatio(Math.min(devicePixelRatio, 2))`, shadows on (`PCFShadowMap`), `ACESFilmicToneMapping` (exposure 1.1), `SRGBColorSpace`, `scene.background` and `scene.fog` from the theme.
- Bloom: `EffectComposer` over a `WebGLRenderTarget` with `type: HalfFloatType` and `samples: 4` (so the antialiasing survives the composer), then `RenderPass`, `UnrealBloomPass(new Vector2(w, h), strength, radius, threshold)` from `THEME.bloom`, `OutputPass`. Fallback: if building the composer or one `composer.render()` throws, set the composer to `null`, log once, and render straight with `renderer.render`. The game stays fully playable without bloom.
- `renderer.info.autoReset = false`, and `renderer.info.reset()` at the start of each frame, so `getRenderInfo()` covers all passes of a whole frame.
- Resize (`resize` and `orientationchange` events): `setPixelRatio`, `setSize(w, h, false)`, composer size, `frameCamera` with `aspect = w / h`. The canvas CSS is 100% of the window, no scrollbars.
- `requestAnimationFrame` through `renderer.setAnimationLoop`. If creating the renderer throws (no WebGL), `main.js` writes `This game needs WebGL.` into `#hud` and stops.
- `visibilitychange` to hidden calls `app.autoPause(now)`.

### D7. The HUD (Serves: C1, C3)

- `hudModel` and `createHud` in `src/hud.js`; `createHud(root)` only reaches the DOM through `root.ownerDocument.createElement` and `appendChild`, `setAttribute`, `textContent`, `className` of the elements it makes. No global `document` or `window` is read at import time or at call time. `src/input.js` owns `attachInput(target, onCommand)`; it works against any `EventTarget`-like object that has `addEventListener` and `removeEventListener`.
- DOM structure and class names are the contract between `hud.js` and `styles.css`:

  ```
  div.hud-root
    div.hud-bar
      div.hud-stat.hud-score   span.hud-label "SCORE"  span.hud-value
      div.hud-stat.hud-best    span.hud-label "BEST"   span.hud-value
      div.hud-stat.hud-level   span.hud-label "LEVEL"  span.hud-value
    div.hud-panel [data-kind="ready|paused|over|won"] [data-visible="true|false"]
      div.hud-badge [data-visible="true|false"]  "NEW BEST"
      h1.hud-title
      p.hud-hint
  ```
- Look: translucent dark glass (`rgba(10, 8, 34, 0.72)`, `backdrop-filter: blur(8px)`, 1 px accent border at 40 percent), big uppercase titles with letter-spacing 0.12em and a mint-to-pink gradient plus a glow, a pulsing `NEW BEST` badge, the score in large tabular digits at the top left, best and level smaller at the top right. At 390 x 844 the bar is one row (score font `clamp(28px, 9vw, 44px)`), respects `env(safe-area-inset-*)`, and the panel card is `min(86vw, 420px)`. `#hud` has `pointer-events: none`; only the panel takes pointer events (a tap on the panel is the touch version of the key: start, resume, or play again). `prefers-reduced-motion` turns off the pulse and the sway of the title.
- Texts (exact, pinned by the tests): titles `SNAKE 3D`, `PAUSED`, `GAME OVER`, `BOARD CLEARED`. Hints: ready `Arrow keys, WASD or swipe to start`; paused `Space or tap to resume`; over and won `Enter or tap to play again`.

### D8. Game flow in `src/app.js` (Serves: C3)

`createApp` owns the current game, the loop and the high score, and talks to the view, the HUD and the storage only through the injected objects. Rules:

- `command(cmd, nowMs)`: a direction in `ready` turns and then starts (`loop.reset(nowMs)`); in `running` it turns; in `paused`, `over` and `won` it is ignored. `'restart'` (Enter, r): in `ready` it starts; in `over` and `won` it makes `restart(game)`, starts it at once, calls `view.reset()` and `loop.reset(nowMs)`; in `running` and `paused` it is ignored (an accidental Enter must not cost the player their game). `'pause'`: toggles between `running` and `paused` and is ignored elsewhere.
- `frame(nowMs)`: while `running`, `loop.advance(nowMs, game.tickMs)` gives `ticks` and `alpha`; it applies `tick` that many times and stops at once when the status leaves `running`. Per tick it compares the before and after: `foodsEaten` rose calls `view.onEat(head cell)`; `level` rose calls `view.onLevelUp()`; `over` calls `view.onGameOver()`; `won` calls `view.onLevelUp()` as the celebration. When a game ends it saves the high score exactly once and computes `isNewBest = finalScore > previousBest`. Then `view.update(game, alphaToShow, nowMs)` (frozen alpha while paused, 1 in the other non-running states) and `hud.update(model)` only when the model changed.
- The HUD's best is `max(highScore, score)` while playing.
- `tap(nowMs)`: ready starts; paused resumes; over and won play again; running is ignored.
- `autoPause(nowMs)`: running pauses; anything else is ignored.
- `getState()` returns a fresh plain object with the debug fields, and cannot change the game.
- `initialGame` (optional) lets a test start from a crafted state.
- `parseSeed(search)` reads `?seed=<integer>`.

### D9. How the game is checked in a real browser at the end (Serves: C3)

No dependency beyond `three`. After `npm test` is green: `npm start`, open `http://localhost:8080/?seed=7` and use the devtools console:

1. `snake.getState()` returns `status: 'ready'`, `length: 3`, `head: { x: 10, y: 10 }`, `ticks: 0`.
2. Press an arrow key: `snake.getState().status` is `'running'` and `ticks` rises about every 150 ms.
3. `snake.getRenderInfo()` is read twice, 10 s apart, while the snake eats: `geometries` and `textures` do not change (nothing is created per tick or per frame) and `calls` stays under about 60.
4. Space pauses (`status: 'paused'`, `ticks` frozen) and resumes with no jump; Enter after game over starts a new game; `localStorage['snake3d.highScore']` holds the best score.
5. Resize the window to 390 x 844 and to a wide window: the whole board stays in view; the HUD fits in the phone width.

## Files

| File | Why |
|---|---|
| `src/rng.js`, `test/rng.test.js` | R2 |
| `src/game.js`, `test/game.test.js` | R3 |
| `src/input.js`, `test/input.test.js` | R4 |
| `src/storage.js`, `test/storage.test.js` | R5 |
| `src/loop.js`, `test/loop.test.js` | R11 |
| `src/render/theme.js`, `test/theme.test.js` | R6 |
| `src/render/world.js`, `test/world.test.js` | R7 |
| `src/render/snake-view.js`, `test/snake-view.test.js` | R8 |
| `src/hud.js`, `test/hud.test.js` | R10 |
| `index.html`, `styles.css`, `test/page.test.js` | R1, R10 |
| `src/app.js`, `test/app.test.js` | R12, R13 (testable wiring) |
| `src/main.js`, `test/main.test.js` | R1, R9, R12, R13 |

Not changed: `package.json`, `package-lock.json`, `scripts/serve.js`, `README.md`.

## Verification

- Test command: `npm test` (the same as `node --test`). Each task names its own command, for example `node --test test/game.test.js`.
- Every task is test-first: the failing tests are in `tasks.md`.
- What proves each criterion:
  - Graphics and 3D (C1, C4): the world, camera and snake-view tests pin the names, the shadows, the framing for landscape and portrait, the checker colours, the interpolation, the heading, the effect lifetimes, the pooling and the disposal. The look itself is checked by a human in the browser run (D9).
  - Creativity (C2): the single named theme (D1) carried from `theme.js` to the CSS, the food and the effects; judged in the browser run.
  - Plays well (C3): the game, loop, input, storage and app tests, including the invariants test (40 seeded walks of up to 400 steps each on a 5 x 5 board), the 5-tick cap, pause and resume without a jump, the high score written once, and a storage that throws.
- At the end: `npm test` green, then the manual browser run of D9 on `npm start`.

## Assumptions

- Sound is left out (optional in the spec), and `m` is not bound.
- `randomInt(state, n)` throws `Error('invalid range: ...')` when `n` is not an integer of at least 1. The seed becomes the random state with `seed >>> 0`; `game.seed` keeps the value given.
- On a fatal tick (wall or body), `tick` still takes the first queued direction and removes it from the queue, then sets `status: 'over'` without moving the snake and without counting a tick. The head therefore faces the wall it hit.
- A turn, start or pause that the rules ignore returns the same game object.
- `'restart'` while `running` is ignored, and Enter after game over or a win starts a new, running game at once.
- In `won`, the view gets `onLevelUp()` as the celebration effect.
- `?seed=` accepts a non-negative or negative integer string that fits in a safe integer and applies `>>> 0`; anything else gives a random seed.
- The board is 20 x 20 in `main.js`.
- When there is no WebGL the page shows `This game needs WebGL.`
- The window `touchstart`/`touchend` swipe needs a minimum distance of 30 px (the spec default); the page sets `touch-action: none`.

## Risks

- Interpolation at turns and at growth is the likeliest visual bug. Mitigation: the snake-view test walks a 60-tick zigzag with growth and checks, at five alpha values per tick, that no segment moves more than one cell and that the end of one tick meets the start of the next.
- The spec requires the head's `rotation.y` to equal `HEADING[direction]` at `alpha = 1`, even when the shortest turn would pass 180 degrees. The view sets the exact value at the end of the ease. Mitigation: a test for each of the four directions.
- Bloom or the multisampled target may fail on weak GPUs. Mitigation: the fallback in D6.
- `main.js` cannot be run in Node. Mitigation: it only wires tested modules, its import is safe in Node (it boots only when `window` and `document` exist), a test imports it, and the browser run (D9) covers the rest.
- The spec has no `## Requirements` section, so `aether-plan check` cannot trace `Serves:` ids. The ids in this plan are an agreed numbering of the spec's sections.
- Tick catch-up after a stall is capped at 5 and dropped, and the tab pauses when hidden, so a long stall cannot kill the snake.

## Complexity

| Addition | Serves | Why the simpler alternative is worse |
|---|---|---|
| `src/app.js` (the game flow outside `main.js`) | R12, R13 | Putting the wiring in `main.js` makes it untestable in Node, where there is no WebGL; the C3 criterion (plays well) needs those tests. |
| `initialGame` option of `createApp` | R12 | Without it a test cannot reach `over`, `won` or a level-up without playing hundreds of ticks; the tests would be slow and fragile. |
| `onLevelUp` on the view | R8, R12 | The spec asks for effects at level changes and at a win; one callback keeps the app free of render details. |
| `cameraKick()` on the view | R8, R9 | The game-over shake moves the camera, which `main.js` owns; returning a reused offset avoids a second camera owner and any per-frame allocation. |
| `yaw` option of `frameCamera` | R7, R9 | A fixed camera makes the title screen static; the sway (C2, C4) needs the fit to follow the turned camera or the board leaves the frame. |
| `fogRange(distance)` | R7, R9 | A fixed fog range clips the board or hides nothing as the framing distance changes with aspect; a pure function is testable without WebGL. |
| `toRenderInfo(info)` | R13 | The debug API reports draw calls and triangles from `renderer.info`; reading it raw in `main.js` is untestable and would leak three's object to `window`. |
