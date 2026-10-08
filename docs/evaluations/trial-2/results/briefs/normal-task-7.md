You are implementing Task 7: The snake, the food and the effects — `src/render/snake-view.js` of Snake 3D, a three.js (0.186.1) browser snake game judged on graphics quality, creativity, playability and the quality of its 3D. It should look and feel like a small finished indie game. The rules (Task 1), theme (Task 4), HUD (Task 5) and world/camera (Task 6) are done; `src/main.js` (Task 8) will create your view once and call `view.update(game, alpha, nowMs)` every animation frame, `view.onEat(cell)` when the snake eats, `view.onGameOver()` when the game ends, and `view.reset()` on restart.

## Task Description

Read this first — it is your requirements, with the exact values and test file to use verbatim:
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-7-brief.md

Then read the spec's "Look and 3D" section (`docs/spec.md` lines 76-128), especially `src/render/snake-view.js` (lines 105-120) — it is the binding authority.

## Context from earlier tasks

- `src/game.js` (Task 1): the game state is `{ width, height, snake: [{x,y}, ...head first], direction, queue, food: {x,y}|null, score, foodsEaten, level, tickMs, status, rng, seed, ticks }`. `ticks` rises by 1 on every tick that moves the snake; it does not change on the tick that ends the game (status 'over', snake stays put); `restart` returns a new game with `ticks: 0`. Each tick moves one cell; on eating, the snake grows by one (the tail stays).
- `src/render/theme.js` (Task 4): `CELL` (1), `THEME`, `gridToWorld(x, y, width, height) → { x, z }`, `lerp`, `easeOutCubic`, `clamp01`, `bodyColor(index, length)` (24-bit int from `snakeBody` at index 1 to `snakeTail` at index length−1). Read its opening art-direction comment — theme **"Abyssal Bloom"**: "Snake: glossy jelly skin with an emissive core; a pale white-aqua lamp for a head, then teal fading through azure to violet, the tail dimming into the dark. Food: a warm amber lure (anglerfish orb) that bobs and pulses over a soft halo, the only warm hue in the scene. Eat: a burst of pale gold plankton sparks that drift up like bubbles, plus a quick ring pulse. Game over: the glow drains, the snake flashes `danger` and bursts into bubbles". Colors: `snakeHead`, `snakeBody`, `snakeTail`, `food`, `particle`, `accent`, `danger`.
- `src/render/world.js` (Task 6): **the board's top surface is at y = 0** — the snake and food sit above it. Camera looks down at ~54–64° from the +z side with no yaw. The world names objects 'board', 'walls', 'trim', 'caustics', 'seafloor', 'decor' — don't reuse those names.
- Rendering (Task 8): ACES Filmic, sRGB, shadows (PCFShadowMap), fog, and `UnrealBloomPass` with `THEME.bloom` `{ strength: 0.8, radius: 0.5, threshold: 0.7 }`. Task 4's review computed that on raw color only the head and particles exceed the threshold: to make them glow, body/food need `emissiveIntensity` ≈ 1.5 and the tail ≈ 3 (the tail may stay dimmer — "dimming into the dark"). Tune by eye.
- Food and snake body differ mostly by hue (amber vs teal, similar luminance), so the food must also read by shape and motion (bob, pulse, halo) — not color alone.
- Repo: ES modules, Node 22, `npm test` runs `node --test`; three in node_modules (don't run npm ci/install). Tests run in Node without WebGL or DOM: construction must not touch `document`/canvas (use `THREE.DataTexture` if you need a sprite texture). Code style: no semicolons, single quotes, 2-space indent.

## Controller decisions

- **Interpolation:** keep a snapshot of the cells the view last drew as "current". When `update` receives a game whose `ticks` differs from the snapshot's: if it advanced by exactly 1, previous = the old snapshot; if it advanced by more than 1 (a frame that ran several ticks), previous = the new snake shifted by one cell (prev[i] = snake[i+1], tail stays) so motion is still one cell; if `ticks` went down (restart without reset), snap with no interpolation. Positions are `lerp(prev, current, alpha)` — **linear**, as the spec says. When the snake grew, the new tail segment interpolates from the previous tail cell. The very first update has no previous (prev = current).
- **Head:** an `Object3D`/`Group` named `'snake-head'`, distinct from the body (its own shape: e.g. a rounded lamp-like head with eyes, maybe a small glowing lure/antenna), modeled facing +Z. `rotation.y` turns from the previous tick's heading to `HEADING[game.direction]` along the shortest arc during the tick, and at `alpha = 1` it must equal `HEADING[game.direction]` exactly (so `Math.PI` for up, never `-Math.PI`).
- **Body:** an `InstancedMesh` (capacity sized for the longest possible snake, `width * height`), `count` set each update, per-instance colors via `setColorAt` + `bodyColor` (only recompute colors when the length changes or effects need it). Make it look like one continuous creature, not loose beads: e.g. segments a bit larger than half a cell plus optional "joint" instances between consecutive segments (then double the capacity), and a gentle taper toward the tail. Snake casts shadows; nothing on it is created per frame.
- **Food:** an object named `'food'`, on its cell in x and z, animated (bob in y, pulse, spin, halo/ring on the board under it). When `game.food` is null, hide it (`visible = false`) but keep it in the scene.
- **Effects:** `onEat(cell)` starts a burst of plankton sparks + a ring pulse at that cell; `onGameOver()` starts the game-over effect (flash `danger`, drain the glow, burst of bubbles from the snake). Effects get their start time from the next `update`'s `timeMs` (onEat/onGameOver receive no time). Every effect ends within 2 seconds (aim ≤ 1.5 s); `activeEffects()` returns how many are live. Use fixed pools (e.g. a `THREE.Points` with a preallocated `BufferGeometry` of N particles, additive blending, mutated in place; and a small pool of ring meshes). If the pool is full, recycle the oldest. After the game-over effect ends, leave the snake visibly "dead" (dimmed) until `reset()`.
- **`segmentPositions()`**: the current (interpolated) world `{ x, z }` of each body segment, neck to tail, without the head and without joint instances. Returning a fresh array is fine (it's for tests/debug, not per frame).
- **`reset()`** clears the interpolation snapshot (next update snaps), ends all effects, and restores the snake's normal look. **`dispose()`** removes everything the view added to `scene` and disposes every geometry, material and texture it created.
- **No geometry, material or texture is created per tick or per frame** — only in `createSnakeView`. Use module- or closure-level scratch objects (`Object3D`, `Matrix4`, `Color`, `Vector3`) for per-frame math. Mutate uniforms/colors/attributes in place.
- **File size:** if `snake-view.js` would grow past ~400 lines, you may move the particle/ring pools into a helper `src/render/effects.js` (allowed by a controller ruling); otherwise keep one file.

## Your Job

1. Write `test/snake-view.test.js` exactly as given in the brief; run it and watch it fail (RED).
2. Implement to make it pass (GREEN). Add tests after the mandated ones for behavior you rely on, e.g.: food hidden when null; segmentPositions at alpha 0 equals the previous cells; a game-over effect runs out within 2 s; reset clears effects; no new geometries/materials are created across many updates (compare geometry/material uuids reachable from the scene before/after).
3. Strongly recommended: look at it. A Playwright Chromium binary is at `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` (the google-chrome-stable link is broken). Write a throwaway page in the git-ignored scratch dir `.superpowers/sdd/plan/scratch/` (e.g. `scratch/t7.html` + module) served by `node scripts/serve.js <repo-root> <free port>` in the background; build a renderer (antialias, ACES Filmic, sRGB, shadows with `THREE.PCFShadowMap`, `scene.background`/`scene.fog` from THEME), add `buildWorld(...)` from `src/render/world.js`, frame the camera with `frameCamera`, and use `EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass` from `three/addons/postprocessing/...` with THEME.bloom (the import map from index.html must be in your page). Put a snake of ~8 cells with a turn plus food on the board, maybe trigger an eat burst, render, and screenshot headless (e.g. `chrome --headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1280,720 --virtual-time-budget=3000 --screenshot=out.png URL`), then view the PNG with the Read tool. Tune until the snake reads as one glowing creature, the head is distinct, the food pops, and the burst is visible. Stop the server afterwards. Do not commit scratch files.
4. Run the full suite once (`npm test`) before committing.
5. Commit on the current branch (`feature/trial`) with a clear message ending with the line:
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   (This trailer is correct for this session even if your environment suggests another model name.)
6. Self-review your diff. Fix what you find.
7. Report back.

Work from: /home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial
Do not create branches or worktrees, do not push, do not use `git stash`. If anything is unclear, report NEEDS_CONTEXT rather than guessing.

## You Do Not Dispatch Subagents

Do all of this task's work yourself. Never spawn a subagent, and never spawn a reviewer.

## Report Format

Write your full report to:
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-7-report.md
containing: what you built (head, body, food, effects, interpolation rules), what Task 8 must know (call order, timing, any extra API), tests and results, TDD Evidence (RED/GREEN with commands and output), visual check results (screenshot paths, what you tuned), files changed, self-review findings, concerns.

Then reply with ONLY (under 15 lines):
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Commits created (short SHA + subject)
- One-line test summary
- Concerns, if any
- The report file path
