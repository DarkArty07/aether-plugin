# Snake 3D: plan

**Spec:** [spec.md](spec.md)

**Art direction:** [art.md](art.md), approved by the owner after a blind review of the first build. It changes D1 to D7 and D9, adds D10 and D11 and the requirement R14, and adds Task 13.

## Technical context

- Static site, no build step. Browser: ES modules plus an import map (spec, Platform). Tests: Node.js 22, `node --test` on `test/`, no browser, no DOM, no WebGL.
- The only dependency is `three` 0.186.1 (already in `node_modules`). Post-processing comes from `three/addons/postprocessing/` (`EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`). No CDN, no texture files, no model files, no web fonts, no sound.
- The skeleton exists: `package.json` (`npm test` = `node --test`, `npm start` = `scripts/serve.js`), `scripts/serve.js`, `README.md`, `.gitignore`. The plan changes none of them.
- Shadow type: three r186 removed `PCFSoftShadowMap` (it logs a warning). Use `THREE.PCFShadowMap`.
- Code style: ES modules, no semicolons, 2 spaces, single quotes, no TypeScript. A test file never lives in `test/` unless `node --test` should run it (the runner executes every `.js` file under `test/`), so there are no helper files in `test/`.
- The spec's four criteria are numbered here: C1 graphics, C2 creativity, C3 plays well, C4 3D.
- The spec has no `## Requirements` section. This plan names the requirement ids itself, one per spec section. Tasks cite them in `Serves:`.
- The art direction speaks of mint, cyan, violet and amber. They are the existing keys of `THEME`: mint is `snakeHead`, cyan is `snakeBody`, violet is `snakeTail`, amber is `food`; accent, background and fog are themselves. `THEME` gets no new key, and no hex literal is written outside `theme.js`. "x1.6" (or any "xK") is `new THREE.Color(hex).multiplyScalar(K)`: a colour above 1, which the bloom takes.

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
| R14 | The world beyond the board (`src/render/horizon.js`): the spec's "carry the theme through the scene and its atmosphere", made concrete by art.md section 3 | Task 13, Task 12 |

### Project structure

```
index.html            styles.css
src/rng.js            src/game.js          src/input.js      src/storage.js
src/loop.js           src/hud.js           src/app.js        src/main.js
src/render/theme.js   src/render/world.js  src/render/snake-view.js   src/render/horizon.js
test/<module>.test.js  (one per module above, plus page.test.js)
```

### Module graph

```
rng <- game <- app <- main
loop, storage, hud(hudModel) <- app
theme <- world, snake-view, horizon (all three also use rng) <- main
input, hud(createHud), world, snake-view, horizon, app <- main  (main wraps snake-view and horizon in createFeedback, and gives the wrapper to app)
hud <- index.html/styles.css (class names)
```

## Gate

No `.specify/memory/constitution.md` exists, so there are no constitution checks.

- Nothing speculative, and nothing for a hypothetical need: **pass**. Sound (optional in the spec) is left out. There is no options object, no config file, no settings screen.
- No abstraction, option, file or dependency that no requirement asks for: **pass**. Every file serves a requirement (table above); `src/render/horizon.js` serves R14, which comes from the owner's approved `art.md`, and each addition of the art direction has its row in Complexity. `src/app.js` is a file the spec does not name: it holds the wiring that the spec puts in `main.js` (R12, R13: controls, high score saved, effects, `getState`), and it exists so Node can test that logic without WebGL. `main.js` keeps only the browser objects.

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

`name: 'Neon Dusk'`. `bloom: { strength: 0.85, radius: 0.55, threshold: 0.62 }`. The palette does not change with the art direction; art.md's names map to it as written in the Technical context.

Fog: linear `THREE.Fog(theme.colors.fog, near, far)`, with `near = 1.6 * distance` and `far = 3.2 * distance`, where `distance` is what `frameCamera` returns. `world.js` exports `fogRange(distance)` for this. At the camera of D3 the farthest board corner is at about `1.0 * near` in landscape (up to `1.17 * near` at the extreme of the title screen's sway: a fog of about 10 percent on that corner), so the board stays crisp. The horizon (D10) does not use the scene fog at all: its mountains, sun and shapes are 55 to 100 units behind the board, and in landscape the fog is complete 59 units from the camera, so they would melt into the fog colour. Every horizon material has `fog: false` and the grid fades its own lines with the distance.

Fonts: system stacks only. Text: `system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. Numbers: `ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace` with `font-variant-numeric: tabular-nums`.

### D2. The board and the world (Serves: C1, C4)

- `board`: one `InstancedMesh` of `width * height` unit boxes (1 x 0.3 x 1, top face at y = 0), no gaps, instance colour `(x + y) % 2 === 0 ? board : boardAlt`, `receiveShadow`. Its bounding box is exactly `width x height`, centred on the origin. A thin `LineSegments` named `grid` (one shared `BufferGeometry`, accent colour, opacity 0.12) lies on top at y = 0.003. Cell index is `y * width + x`.
- `plinth`: a box slightly larger than the board under it, in the wall colour, so the board reads as a slab with thickness.
- `walls` (a `Group`): four rails around the board (height 0.5, thickness 0.35, `wall` colour, shadow casting and receiving), each with a thin `MeshBasicMaterial` strip on top in the accent colour multiplied by 1.4 (so it blooms), and four corner pylons with a glowing cap. The pylons (`pylon`, a box 0.5 x 0.9 x 0.5, each with a `pylon-cap`) are pinned by **one formula**, because the horizon's beams (D10) stand on them and Task 13 does not depend on Task 8: the centre of the pylon at corner `(sx, sz)`, `sx, sz` in `{-1, 1}`, is `x = sx * (width / 2 + 0.175)`, `z = sz * (height / 2 + 0.175)` (the outer corner of the rails), its base is at y = 0 and its top at y = 0.9. Both tasks test these numbers.
- No `floor`. The dark disc under the board showed as a gray dome in the blind review. The ground beyond the board is the horizon's grid floor (D10), a plane at y = -0.9 just under the plinth (whose bottom is at y = -0.8). `stars`: about 400 `Points` on a full sphere shell of radius 60 to 90 around the board, so the tilted camera, which looks down at the board, sees them in the void around it (vertex colours white, cyan, pink; `sizeAttenuation: false`, `fog: false`), placed with the seeded `nextRandom` of `rng.js`, so the world is the same on every run.
- Lights: `HemisphereLight(0x6a5cff, 0x120d2e, 0.9)` (was 0.7); a key `DirectionalLight(0xcfd8ff, 2.6)` (was 2.4) that casts shadows (`mapSize` 2048, orthographic shadow camera covering the board plus a margin, `bias` -0.0004, `normalBias` 0.03); a pink rim `DirectionalLight(accent, 1.1)` from the opposite side, no shadows. The two raised intensities and the exposure of D6 answer the dark frames of the review (mean luminance 10 to 17 of 255; the target is 35 to 70 with the checker readable).

### D3. The camera (Serves: C1, C4)

`frameCamera(camera, { width, height, aspect, yaw = 0 })` looks at `(0, 0, 0)` from a fixed tilt. Elevation (angle above the board plane) is `lerp(40, 54, clamp01((1 - aspect) / 0.5))` degrees (art.md section 2; it was 50 to 62): 40 in landscape, 47 at an aspect of 0.75, 54 in a phone portrait. A lower camera shows the depth of the scene, the answer to "a distant fixed camera". It never gets near 90. Distance comes from a binary search over `[1, 1000]` (24 steps): the smallest distance for which the 8 corners of the box `±(width/2 + 0.5)` x `y in {0, 0.6}` x `±(height/2 + 0.5)` all project inside `|ndc| <= 0.92`. `yaw` (radians) turns the camera around the vertical axis, and the fit uses the turned camera. The function sets `camera.aspect`, `near = 0.1`, `far = 6 * distance`, calls `updateProjectionMatrix` and `updateMatrixWorld(true)`, and returns `distance`. No allocation per call beyond a few module-level vectors.

`main.js` calls it on resize and then every frame: on the title screen the yaw eases toward `sin(t / 2600) * 0.28` (a slow cinematic sway), and while playing it eases to 0. After framing, it adds `view.cameraKick()` to the camera position and calls `lookAt(0, 0, 0)` (the game-over shake).

**The field of view is 70 degrees: a decision this plan adds to art.md, found by measuring.** art.md wants the sun, the mountains and the grid running to the horizon in the shots, but a camera that looks at the centre of the board from 40 degrees above it with a vertical field of view of 45 degrees sees nothing higher than 17.5 degrees below the horizon line. Measured with three r186: in landscape the foot of the sun (where the floor cuts the disc, y = -0.9, z = -70) projects to NDC y = 1.34 and the feet of the mountains (z = -60) to 1.26, both above the top (1.0) of the frame, and in a phone portrait to 1.25 and 1.13. At 70 degrees the foot of the sun is at NDC y = 0.87 in landscape (0.80 in a square window, 0.96 in a phone portrait) and the feet of the mountains at 0.83 (0.76, 0.88): the lower, striped part of the sun and the feet of the ridges show at the top of the frame (in 16:9 about a quarter of the sun's disc is in view, in a square window about 40 percent). The board is still fitted by the same NDC rule, its centre stays in the middle of the screen, so the snake is still above the title card (D7). `main.js` exports `CAMERA_FOV = 70` and builds the camera with it; `frameCamera` still leaves `fov` alone; a test in `main.test.js` pins that the sun's foot and the mountain feet are in the frame, and inside `camera.far`, at five aspects, so a later tuning cannot lose the horizon. The shots may tune the field of view up to about 75. `camera.far = 6 * distance` (111 units in 16:9, 252 in a phone portrait) contains the sun (84 units from the camera in 16:9) and every ridge (the farthest base is about 93); the 400 x 400 floor is cut by the far plane at 120 units or more from the board's centre (measured at five aspects and two yaws), where its lines have faded to nothing (they fade out at 100 units, D10) and its base colour equals the background's at every moment, also during the game-over tint (`horizon.tint`, D6), so the cut is not seen. No sky is ever in the frame: the elevation is at least 40 degrees and half the field of view is 35, so the top of the frame is at least 5 degrees below the horizontal. What shows behind the board is the floor, then the mountains and the sun.

### D4. Smooth motion between ticks (Serves: C3, C4)

The view keeps two world-space snapshots of the snake, `from` and `to` (preallocated `Float32Array`s of capacity `width * height`).

- `update` reads `game.ticks`. When it equals the last seen value plus 1, `from` becomes the previous `to`, and `to` is built from `game.snake`. Otherwise (first call, restart, a jump of more than one tick) `from = to`, which snaps with no animation.
- Growth: when the new snake is longer, the missing `from` entries copy the old tail, so the new tail segment grows out of the old tail and never teleports.
- Every segment moves from its own `from` to its own `to`. Each segment moves to the cell the segment ahead of it occupied, so a step is always exactly one cell or less, and a turn never cuts a corner. The head moves linearly the same way.
- The head turn: the previous heading and `HEADING[game.direction]` are joined by the shortest signed angle, eased with `easeOutCubic(clamp01(alpha / 0.6))`. At eased `t >= 1` the value is set exactly to `HEADING[game.direction]`, so the spec's equality at `alpha = 1` holds.
- Pause and resume: `main`/`app` pass the view the frozen `alpha` while paused (not 1), and on resume the app calls `loop.reset(now - frozenAlpha * tickMs)`, so the loop restarts at the same `alpha`. The snake neither jumps forward on pause nor back on resume. In `ready`, `over` and `won` the app passes `alpha = 1`.
- A body segment is a sphere of radius 0.46 x scale, and a joint sphere (0.88 of the mean scale of its two neighbours) sits at the midpoint of each pair of neighbouring segments, the head and the neck included. Spheres and joints overlap into one tube, with no gap at a turn or at the tail (scale 0.6): a test pins a gap of at most 0.02 between a sphere and its joints. A travelling wave (`sin(timeMs * 0.008 - i * 0.6)`, +/-4 percent scale) makes the body breathe, and a swallow bump (a Gaussian bump of +35 percent scale that runs from the head to the tail in about a second) shows food passing through the body.

### D5. The snake, the food, the effects (Serves: C1, C2, C4)

- Body (the review said "a tiny snake made of plain spheres"): `InstancedMesh` named `snake-body` (shared `SphereGeometry(0.46, 12, 8)`, was 0.42, `MeshStandardMaterial` white, roughness 0.35, per-instance colour from `bodyColor(i, length)`, casts shadows). Radius multiplier tapers from 1 at the neck to 0.6 at the tail. `snake-joints`: a second `InstancedMesh` of the same sphere geometry, at 0.88 of the mean scale of its neighbours and at the midpoint of each pair of neighbouring segments, with the same colour rule, so the body is one continuous tube, not a row of beads. `snake-glow`: a third `InstancedMesh` of small spheres (`SphereGeometry(0.2, 8, 6)`, was radius 0.17, on top of each segment) with `MeshBasicMaterial`, instance colour = the same `bodyColor` times 1.6 (above 1, so the bloom picks it up): the dorsal studs. Colours are rewritten only when `ticks`, the length or the dim factor changes. The segment counts (12 x 8, and 8 x 6 for the studs) are low on purpose: they keep the triangle budget (D11).
- Head: a `Group` named `snake-head`, modeled facing +Z: an ellipsoid (`head-shell`, scale 0.95 / 0.8 / 1.05 times 1.15, `snakeHead`, emissive 0.35), two white eyes with dark pupils on the front-top, a pink tongue (`accent`) that flicks (scale and visibility on a 1.2 s cycle), a **visor** (`head-visor`: a thin torus arc across the front of the face, `MeshBasicMaterial` in mint x1.6, so the face glows) and a **head light** (`head-light`: a mint `PointLight`, intensity 3, distance 4, no shadow, riding with the head and lighting the board around it; it is also what lifts the dark frames). Bobs by +/-0.03 in y.
- Trail: `snake-trail`, a ring of 48 pooled additive spheres (`SphereGeometry(0.11, 6, 4)`, `MeshBasicMaterial`, `depthWrite: false`) dropped at the head every 40 ms of `timeMs` while the game is `running`, cyan x1.6, each shrinking from 0.22 wide to 0 and fading over 0.6 s. art.md says "48 `Points`"; a `PointsMaterial` has one size for all its points and a custom point shader cannot be tested in Node, so each point is an instanced sphere with its own scale and colour. One draw call, no allocation, deterministic from `timeMs`.
- Food: a `Group` named `food` with a faceted amber crystal (`food-crystal`, `OctahedronGeometry`, scaled 1.3 / 1.755 / 1.3, was 1 / 1.35 / 1, `flatShading`, emissive 0.8): it spins (`rotation.y = t * 0.0025`), bobs (`y = 0.55 + 0.12 * sin(t * 0.004)`), pulses (+/-8 percent scale), and pops in with `easeOutCubic` over 300 ms whenever its cell changes. A separate `food-ring` (flat `RingGeometry` on the board, additive, pulsing) and a `food-light` (`PointLight`, food colour, intensity 6, distance 6, no shadow) tint the board around it. A **beacon** (`food-beacon`: an open-ended additive amber cylinder, radius 0.18, height 5, opacity 0.22, rising from the cell) and **6 motes** (`food-motes`: one instanced mesh orbiting the beacon at radius 0.55 while rising) say where the food is from across the board (the review: "a big empty board"). `food`, the beacon and the motes are hidden when `game.food` is `null`.
- Effects, all pooled and preallocated (a particle `InstancedMesh` named `particles`, 160 slots, small octahedra; 6 `RingGeometry` shockwave meshes), driven by a seeded `nextRandom` stream so they are deterministic:
  - `onEat(cell)`: 28 sparks (mix of `food` and `particle` colours, gravity, shrinking, 0.7 to 0.9 s), a shockwave ring on the cell (0.6 s), the swallow bump, and a flash of the beacon (its opacity 0.6 falling to 0.22 in 300 ms). 0.9 s.
  - `onLevelUp()`: a pink ring from the middle of the board out to `0.75 * max(width, height)` (1.2 s) and a stud glow boost (x2.5 fading out). 1.4 s.
  - `onGameOver()`: 60 sparks from the head and along the body, a pink ring at the head (1 s), a camera kick (damped shake over 0.6 s), and a persistent dim (body, joints, studs, visor and head light fade to 35 percent over 0.8 s, kept until `reset()`). 1.8 s.
  - Every effect ends within 2 s of the start time (the time of the last `update`, or 0). `activeEffects()` counts the effects not yet expired as of the last `update`.
- `reset()` also clears the trail and the beacon flash. `cameraKick()` returns a reused `{ x, y, z }` (no allocation).
- `dispose()` removes everything the view added and calls `dispose()` on every geometry and material (and on each instanced mesh).

### D6. Rendering in `main.js` (Serves: C1, C3, C4)

- `WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })`, `setPixelRatio(Math.min(devicePixelRatio, 2))`, shadows on (`PCFShadowMap`), `ACESFilmicToneMapping` (exposure `EXPOSURE` = 1.25, was 1.1: art.md section 1), `SRGBColorSpace`, `scene.background` and `scene.fog` from the theme, and a camera with a field of view of `CAMERA_FOV` = 70 degrees (D3).
- Bloom: `EffectComposer` over a `WebGLRenderTarget` with `type: HalfFloatType` and `samples: 4` (so the antialiasing survives the composer), then `RenderPass`, `UnrealBloomPass(new Vector2(w, h), strength, radius, threshold)` from `THEME.bloom`, `OutputPass`. Fallback: if building the composer or one `composer.render()` throws, set the composer to `null`, log once, and render straight with `renderer.render`. The game stays fully playable without bloom.
- The horizon and the effects of art.md section 4. `main.js` adds `horizon.group` to the scene and calls `horizon.update(t)` every frame. `createApp` is given not the snake view but a thin wrapper, `createFeedback({ view, horizon })` (pure, exported, tested in Node), with the same five methods, so Task 11 does not change. Each call is forwarded to the view and also: `onEat` calls `horizon.pulse('eat')` (the sun's glow +20 percent for 300 ms) and starts a **bloom pulse** (`bloomPass.strength = THEME.bloom.strength + 0.4`, decaying linearly to 0 in 250 ms); `onLevelUp` calls `horizon.pulse('level')` (a ripple of brighter lines across the grid floor out to radius 60 in 1.2 s, and the sun's glow +40 percent for 600 ms); `onGameOver` calls `horizon.dim(0.4)` once and starts the **tint**; `reset` (a new game) calls `horizon.dim(1)` and clears the tint. `dim(k)` is a target: the horizon's own `update(timeMs)` eases to it over 0.8 s, so `main.js` calls it once.
- The game-over tint: `scene.fog.color` eases 25 percent of the way to the accent over 0.8 s, as art.md says. Checked against what the camera sees: every horizon material has `fog: false` and the board lies before the fog's `near`, so the fog colour alone changes nothing visible. And no sky is in the frame (D3: the top of the frame is at least 5 degrees below the horizontal), so the background alone would show only in a thin band at most. The same easing is therefore applied to `scene.background` and, through `horizon.tint(hex)` (D10), to the base colour of the grid floor, which is what the player sees behind the board: the floor and the background are the same colour at every moment, so the far cut of the floor never shows as a seam, and the mood of game over is the dimmed pink horizon (0.4), the wine floor and the dark snake. A new game restores both colours.
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
- The title card sits in the lower third of the screen (art.md section 5): centred horizontally, its top at about 58 percent of the height on a desktop (`padding-top: max(16px, min(58vh, calc(100vh - 280px)))`, so a short window keeps the card on screen), and the veil behind it is centred on the card, not on the screen. The snake on its start cell stays visible above the card on the title screen. On screens of 700 px or more (`@media (min-width: 700px)`) the card is wider (`--card-w: min(86vw, 640px)`) and the title fits on one line: `white-space: nowrap`, `font-size: clamp(30px, 6vw, 52px)`, `letter-spacing: 0.08em`; `BOARD CLEARED` at 52 px is estimated at about 540 px, inside the card (640 px less its padding).
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
3. `snake.getRenderInfo()` is read twice, 10 s apart, while the snake eats: `geometries` and `textures` do not change (nothing is created per tick or per frame) and `calls` stays at most 90 and `triangles` at most 150,000 (the art budget, D11), also with a long snake (let it eat to a length of 150, or start from a crafted state).
4. Space pauses (`status: 'paused'`, `ticks` frozen) and resumes with no jump; Enter after game over starts a new game; `localStorage['snake3d.highScore']` holds the best score.
5. Resize the window to 390 x 844 and to a wide window: the whole board stays in view; the HUD fits in the phone width.
6. The console shows no `THREE.WebGLProgram` shader error (the sun and the grid are shaders; Node can only check their text).
7. The shots of art.md section 7, one at 1440 x 900 and one at 390 x 844, each looked at by a person: **title** (the striped sun cut by the top of the frame, mountains with glowing edges, the grid floor, floating shapes and sparkles, the board with glowing rails and beams over the pylons, the snake above the card, the card in the lower third with its title on one line); **playing** (a continuous glossy snake with a glowing visor, its head lighting the board and leaving a cyan trail, the food with its amber beacon, the whole board in view, a mean luminance of 35 to 70 of 255, measured on the screenshot as the mean of `0.2126 R + 0.7152 G + 0.0722 B`); **eating** (sparks, the ring, a bloom pulse, the sun flaring); **game over** (the scene dimmed and tinted toward pink, the snake dark, the card readable). Never: a gray floor dome, a black or blown-out frame, unreadable HUD text, a white or black sun disc, segments that look like separate beads. The numbers of art.md are starting values: a shot that fails tunes them (and their test) before the task is accepted.

### D10. The world beyond the board: `src/render/horizon.js` (Serves: C1, C2, C4; R14)

The review said "a flat 3D scene" and "a generic theme": the board floated in an empty indigo void. A synthwave horizon gives the scene its depth and makes "Neon Dusk" readable at a glance. It is a module of its own, apart from `world.js`, so that Task 8 and Task 13 are independent and can be built in parallel; they share only the pylon formula (D2).

`createHorizon({ theme, width, height })` returns `{ group, update(timeMs), pulse(kind), dim(k), tint(hex) }`. `group` is a `THREE.Group` named `horizon` with nine children, built once, without a WebGL context, with no texture and no light, from the seeded `nextRandom` (state 21), so two builds are identical:

| Child | What | Draw calls |
|---|---|---|
| `horizon-sun` | `CircleGeometry(18, 64)` at (0, 7, -70) with a `ShaderMaterial` (no fog, no depth write): amber at the bottom to the accent at the top, x1.6 so the bloom takes it; horizontal gaps in its lower half that widen toward the bottom and scroll down one gap per 2.5 s; its lower part sinks under the floor | 1 |
| `horizon-grid` | a flat 400 x 400 plane at y = -0.9 with a `ShaderMaterial`: accent lines every 2 units on a background-coloured floor, scrolling toward the camera at 1 unit per second, the lines fading to nothing at 100 units from the centre (`1 - smoothstep(20, 100, r)`), before the far plane cuts the floor | 1 |
| `horizon-mountains-0`, `-1` | two instanced rings of 26 and 34 low-poly ridges (`ConeGeometry`, 4 and 6 sides, heights 6 to 16) at radius 55 to 66 and 66 to 80, behind and to the sides, in background x1.8 | 2 |
| `horizon-edges` | one `LineSegments` with the `EdgesGeometry` of every ridge, merged, in violet x1.4 | 1 |
| `horizon-octahedra`, `horizon-rings` | 12 octahedra and 12 torus rings at radius 16 to 30 and y 2 to 10, turning at 0.4 rad per second and bobbing by 0.3, in cyan, violet and accent x1.4 | 2 |
| `horizon-sparkles` | 300 additive `Points` (2 px, no size attenuation), mint and cyan, drifting up and wrapping | 1 |
| `horizon-beams` | 4 additive open cones (height 12, radius 0.6 to 0.05, accent) standing on the pylons, pulsing between 0.1 and 0.22 opacity over 2 s | 1 |

That is 9 draw calls and about 2,900 triangles (the whole horizon costs less than the board).

- **The fog flag of every material is `false`, on purpose.** The scene fog is complete 59 units from the camera in landscape; the sun is 84 units away, the ridges 55 to 93, the shapes up to about 50, so with `fog: true` they would all become the fog colour, which is nearly the background. The art needs them in the shots. The grid, the one element that reaches far, fades its own lines.
- **`pulse(kind)`** starts a time-bounded effect at the `timeMs` of the last `update` (0 before any): `'eat'`, the sun's glow +20 percent decaying to rest in 300 ms; `'level'`, a ripple of brighter lines from the centre to radius 60 over 1.2 s (`uRipple`) and the sun's glow +40 percent for 600 ms. Both are pure functions of `timeMs`, so they are tested in Node.
- **`dim(k)`** (one reading of art.md's "fades it all to `k` over 0.8 s"): `dim(k)` sets a target and `update(timeMs)` eases the current value to it over 0.8 s with `easeOutCubic`. `main.js` calls `dim(0.4)` once on game over and `dim(1)` on a new game. It scales the sun, the grid lines, the mountains, the edges, the shapes, the sparkles and the beams (not the floor's base colour).
- **`tint(hex)`** sets the grid floor's base colour (`uFloor`) at once, in place. `main.js` calls it every frame with the colour it gives `scene.background`, so that the floor and the background stay equal while the game-over tint eases both (D6). Nothing else writes `uFloor`.
- **The beams (and the food beacon of D5) are transparent and double-sided, so they set `forceSinglePass: true`:** three r186 (`WebGLRenderer.js`, `renderObject`) draws such a material in two passes otherwise, which would count two draw calls each and set `needsUpdate` every frame. The budget test also counts two passes for any transparent double-sided material without the flag.
- **No allocation.** `update`, `pulse`, `dim` and `tint` write numbers into existing objects and colours; a test compares the sets of objects, geometries, materials and `uuid`s before and after hundreds of calls.
- **Shaders cannot be compiled in Node.** The test reads their text for the typos that end in a white or black disc: a `void main` in each stage, balanced braces, every declared `uniform` is a key of `uniforms` and the reverse, every fragment `varying` is in the vertex stage, no texture function, every `#include` is a real chunk, and the sun's colours are above 1. The picture itself is judged in the browser run (D9, items 6 and 7).
- The stars stay in `world.js`; the floor hides the ones below the horizon. At the camera of D3 only a thin band at the top of the frame lies above the floor: about 7 to 11 stars in landscape and a square window, and 1 or 2 in a phone portrait. The stars are a minor part of the scene now; the horizon is the backdrop.

### D11. The art budget (Serves: C1, C3; art.md section 6)

While playing: at most 90 draw calls and 150,000 triangles per frame (`renderer.info`, all passes), a pixel ratio of at most 2 (D6), and no allocation per frame (D5, D10). The worst case of one frame is counted in `main.test.js` with real three.js objects, no WebGL: every visible drawable once (twice for a transparent double-sided material without `forceSinglePass`, which the beams and the beacon set, D10), every shadow caster once more (one shadow-casting light), and the bloom and output passes.

| Draw calls | Count |
|---|---|
| world: board, grid, plinth, 4 rails, 4 rail strips, 4 pylons, 4 caps, stars | 20 |
| horizon (D10) | 9 |
| snake view: head 7 (shell, 2 eyes, 2 pupils, tongue, visor), body, joints, studs, trail, crystal, food ring, beacon, motes, particles, 6 shockwave rings | 22 |
| shadow pass: 4 rails, 4 pylons, body, joints, head shell, crystal | 12 |
| `UnrealBloomPass` (1 high-pass, 5 mips x 2 blurs, 1 composite, 1 blend) and `OutputPass` | 14 |
| **Total** | **77** (budget 90) |

Triangles: a sphere of 12 x 8 segments has 168, of 8 x 6 has 80. Per body segment: body 168 x 2 (the shadow pass draws it again) + joint 168 x 2 + stud 80 = **752**. The test checks a snake of **150 cells** (37 percent of the 20 x 20 board, a very strong game): 149 x 752 = 112,000, plus the rest (the board 4,800, the horizon 2,900, the head and its shadow 2,000, the walls 300, the trail 48 x 36, the particles 160 x 8, the shockwave rings 6 x 128 and the food: about 14,000) gives about 126,000 (budget 150,000); a trial build of the structure measured about 123,000 with the effect pools at rest. **The budget holds up to a snake of about 180 cells.** Beyond that, in this order: the joints stop casting shadows (the limit moves to about 230), then the spheres lose segments. A snake that fills the board (400 cells) is the win screen and is not a budget case.

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
| `src/render/horizon.js`, `test/horizon.test.js` | R14 |
| `src/hud.js`, `test/hud.test.js` | R10 |
| `index.html`, `styles.css`, `test/page.test.js` | R1, R10 (the title card of art.md section 5) |
| `src/app.js`, `test/app.test.js` | R12, R13 (testable wiring) |
| `src/main.js`, `test/main.test.js` | R1, R9, R12, R13, R14 (exposure, field of view, `createFeedback`, the tint, the frustum test and the budget test) |

Not changed: `package.json`, `package-lock.json`, `scripts/serve.js`, `README.md`.

## Verification

- Test command: `npm test` (the same as `node --test`). Each task names its own command, for example `node --test test/game.test.js`.
- Every task is test-first: the failing tests are in `tasks.md`.
- What proves each criterion:
  - Graphics and 3D (C1, C4): the world, camera and snake-view tests pin the names, the shadows, the framing for landscape and portrait, the checker colours, the interpolation, the heading, the effect lifetimes, the pooling and the disposal. The look itself is checked by a human in the browser run (D9).
  - Art direction (C1, C2, C4), in Node: `horizon.test.js` (the nine named children, counts and ranges, material flags and fog, no texture, theme colours, determinism, no allocation, the pulses and the dim in time, the text of the shaders, the grid fade and `tint`); `snake-view.test.js` (the tube, the joints' midpoints, scale and colour, the visor, the head light, the trail's drops and fade, the beacon and its flash, the motes, the dim of the new parts, disposal); `world.test.js` (elevation 40 to 54, the light intensities, no floor disc, the pylon formula); `page.test.js` (the card in the lower third, the one-line title); `main.test.js` (exposure, field of view, `createFeedback`, the bloom pulse, the tint, the frustum test, the grid fade against the far cut, the budget test of D11).
  - What Node cannot prove: that the shaders compile, the mean luminance (35 to 70 of 255) and the look of the shots. They are checked by a person in the browser run (D9, items 6 and 7).
  - Creativity (C2): the single named theme (D1) carried from `theme.js` to the CSS, the food and the effects; judged in the browser run.
  - Plays well (C3): the game, loop, input, storage and app tests, including the invariants test (40 seeded walks of up to 400 steps each on a 5 x 5 board), the 5-tick cap, pause and resume without a jump, the high score written once, and a storage that throws.
- At the end: `npm test` green, then the manual browser run of D9 on `npm start`, shots included.

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
- Art direction. art.md's colour names map to `THEME` keys (Technical context); art.md's numbers are starting values and are used as written, except the two choices below.
- The camera's field of view is 70 degrees (D3), a choice this plan makes because art.md's elevation and the usual 45 degrees hide the sun and the mountains; reversible by changing `CAMERA_FOV` and the frustum test.
- The trail is a pool of instanced spheres, not `Points` (D5), because per-point size needs a shader that Node cannot test; reversible.
- Every horizon material has `fog: false` (D10); the game-over tint also eases `scene.background` and, through `horizon.tint`, the grid floor's base colour (D6), because the fog colour alone shows nothing and no sky is in the frame.
- `dim(k)` is a target eased by `update` over 0.8 s (D10); `pulse` and `dim` start at the time of the last `update`; the eat pulse and the level pulse decay linearly; the bloom pulse is linear.
- The beams stand at the top of the pylon (y = 0.9), and the pylon's base is at y = 0 (D2).
- The budget is checked at a snake of 150 cells (D11).
- Shader output ends with the tone mapping and colour space chunks, so the colours are right with the composer (linear target) and without it (the canvas).

## Risks

- Interpolation at turns and at growth is the likeliest visual bug. Mitigation: the snake-view test walks a 60-tick zigzag with growth and checks, at five alpha values per tick, that no segment moves more than one cell and that the end of one tick meets the start of the next.
- The spec requires the head's `rotation.y` to equal `HEADING[direction]` at `alpha = 1`, even when the shortest turn would pass 180 degrees. The view sets the exact value at the end of the ease. Mitigation: a test for each of the four directions.
- Bloom or the multisampled target may fail on weak GPUs. Mitigation: the fallback in D6.
- `main.js` cannot be run in Node. Mitigation: it only wires tested modules, its import is safe in Node (it boots only when `window` and `document` exist), a test imports it, and the browser run (D9) covers the rest.
- The spec has no `## Requirements` section, so `aether-plan check` cannot trace `Serves:` ids. The ids in this plan are an agreed numbering of the spec's sections.
- Tick catch-up after a stall is capped at 5 and dropped, and the tab pauses when hidden, so a long stall cannot kill the snake.
- The horizon cannot be seen from the camera art.md describes: the sun and the mountains are above the frame at 45 degrees of field of view (D3, measured). Mitigation: 70 degrees, a frustum test at five aspects and the shots. If the shots still do not show the sun, tune the field of view up to about 75, or bring the sun and ridges nearer, and change the test with them; this is art.md's own invitation ("starting values"), but it needs the owner's eye.
- A shader typo shows as a white or black disc or a blank floor, and Node cannot compile GLSL. Mitigation: the text checks of the horizon test, the D9 console check for `THREE.WebGLProgram` errors, and the shots.
- The triangle count grows with the snake: 752 per cell, so the 150,000 budget holds up to about 180 cells (D11). Mitigation: the order of cuts in D11, and the structural test at 150 cells.
- The draw-call estimate (77 of 90, D11) assumes the head has 7 parts and the walls 16 meshes; a richer head or wall eats the margin. Mitigation: the structural test counts the real objects and fails over 90; the browser run reads `renderer.info`.
- At 70 degrees the farthest board corner reaches the fog's `near` (D1) and, at the extreme of the title sway, takes about 10 percent of the fog colour. The board stays readable; if a shot says otherwise, raise `fogRange`'s `near` (its test changes too).
- Exposure 1.25, the head light, the bloom pulse (+0.4 on 0.85) and the x1.6 colours can blow out a frame. Mitigation: the shots check for a black or blown-out frame, and the numbers are tunable.
- The game-over tint is 25 percent of the way to the accent (art.md), on a very dark floor: it may read as faint. The shots say; the amount is art.md's, so a stronger tint needs the owner's word.

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
| `src/render/horizon.js` (sun, grid floor, mountains, shapes, sparkles, beams) | R14 | art.md section 3; the review's "a flat 3D scene" and "a generic theme". Leaving the indigo void is what the review called flat; putting it in `world.js` would make Task 8 depend on a second concern and one huge test file, and it could not be built in parallel. Nine draw calls and about 2,900 triangles. |
| `pulse(kind)`, `dim(k)` and `tint(hex)` of `createHorizon` | R14 | art.md section 4: the sun flares and the floor ripples on eating and levelling, and the horizon dims on game over. Without them `main.js` would reach into the horizon's materials, which Node cannot test; as pure functions of `timeMs` they are tested. `tint(hex)` keeps the floor the colour of the background while the game-over tint eases both; without it the far cut of the floor shows as a seam. |
| `snake-joints` (a second instanced mesh of the body's sphere) | R8 | art.md section 2; "a tiny snake made of plain spheres", "segments that look like separate beads" (the shots' Never list). Spacing is fixed at one cell by the grid; larger spheres lose the taper and clip at turns. One extra instanced mesh (2 draw calls with its shadow) makes one tube. |
| Head visor and head light | R8 | art.md section 2; "a tiny snake" and the dark frames (mean luminance 10 to 17). Raising only the exposure washes out the void as well; a light at the head brightens the board where the player looks, and the visor gives the head a face that blooms. |
| `snake-trail`, 48 pooled instanced spheres | R8 | art.md section 2; the snake as a presence in motion. A `PointsMaterial` cannot shrink each point, and a point shader cannot be tested in Node; instanced spheres give each point its own scale and colour in one draw call, with no allocation. |
| `food-beacon` and `food-motes` | R8 | art.md section 2; "a big empty board": a small crystal on a 20 x 20 board is lost from across the screen. A larger crystal alone (x1.3 is already done) is not enough; a light column and six motes are 2 draw calls and mark the food at any distance. |
| `createFeedback`, `mixHex` and `tintColors` in `main.js` | R9, R12 | art.md section 4 (bloom pulse, tint, horizon calls). A wrapper of the view lets Task 11 stay as approved; inline in `boot()` the time-based logic could not be tested in Node. |
| `CAMERA_FOV` = 70 | R9, R14 | art.md section 2 ("a distant fixed camera") and section 7 (the horizon in the shots). At 45 degrees the sun and the mountains are outside the frame (D3, measured); the alternative, a lower elevation than art.md's, contradicts it. |
