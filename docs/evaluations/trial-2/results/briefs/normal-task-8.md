You are implementing Task 8: The game loop and the wiring — `src/loop.js` and `src/main.js` of Snake 3D, a three.js (0.186.1) browser snake game judged on graphics quality, creativity, how well it plays, and the quality of its 3D. It should look and feel like a small finished indie game. Every other module is done; you wire them into the playable game served by `npm start` (`index.html` already loads `src/main.js` as a module through the import map).

## Task Description

Read this first — it is your requirements, with the exact values and test file to use verbatim:
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-8-brief.md

Then read the spec (`docs/spec.md`), especially "Rendering in `src/main.js`" (lines 122-128) and "Game loop and wiring" (lines 144-169) — the spec is the binding authority. The debug API shape is exact.

## The modules you wire (read their headers/exports as needed)

- `src/game.js`: `createGame({ width, height, seed })`, `start`, `turn(game, dir)`, `tick`, `togglePause`, `restart` — pure, each returns a new game. State: `{ width, height, snake (head first), direction, queue, food|null, score, foodsEaten, level, tickMs, status ('ready'|'running'|'paused'|'over'|'won'), rng, seed, ticks }`. `ticks` rises only on moving ticks.
- `src/input.js`: `attachInput(target, onCommand) → detach`; commands `'up'|'down'|'left'|'right'|'pause'|'restart'` from arrows/WASD, Space/P/Escape, Enter/R, and touch swipes. It ignores Ctrl/Meta/Alt combos. `keyToCommand('m')` is `null` by design.
- `src/storage.js`: `HIGH_SCORE_KEY`, `loadHighScore(storage)`, `saveHighScore(storage, score)` — never throw. NOTE: merely reading `window.localStorage` can throw (SecurityError in some privacy modes), so obtain it inside try/catch and pass `null` on failure.
- `src/hud.js`: `hudModel({ status, score, highScore, level, isNewBest }) → { score, best, level, panel }` (pure) and `createHud(root) → { update(model), element }`. `update` only touches the DOM on change and already animates a score pop and a "Level N" toast when `level` increases while running — so calling `hud.update(hudModel(...))` every frame is fine.
- `src/render/theme.js`: `THEME` ("Abyssal Bloom": `colors.background`, `colors.fog`, `colors.danger`, `colors.accent`, ...; `bloom: { strength: 0.8, radius: 0.5, threshold: 0.7 }`), `CELL`, `gridToWorld`, `lerp`, `easeOutCubic`, `clamp01`. Its header comment says on game over "the scene dims".
- `src/render/world.js`: `buildWorld({ width, height, theme }) → Group` (board top at y = 0; has `world.userData.update(timeMs)` for allocation-free ambient animation — call it every frame if present), `frameCamera(camera, { width, height, aspect })` (sets position/near/far/aspect/lookAt/projection; no yaw; call on every resize, then remember the framed base position if you add camera shake).
- `src/render/snake-view.js`: `createSnakeView({ scene, theme, width, height }) → { update(game, alpha, timeMs), segmentPositions(), onEat(cell), onGameOver(), activeEffects(), reset(), dispose() }`. Contract from its implementer: call `update` every frame with the current game, the loop's alpha and `performance.now()`; call `onEat(cell)` with the eaten cell (= the new head after the eating tick); call `onGameOver()` exactly ONCE when the game becomes 'over' (it restarts the effect if called again); call `reset()` on every restart. While 'over' it draws at alpha 1 itself. Its emissive levels were tuned against a renderer with ACES Filmic, sRGB, `THREE.PCFShadowMap` and UnrealBloomPass(0.8, 0.5, 0.7) at exposure ~1 — keep those so the look holds.

## Controller rulings (binding)

1. **Loop (`src/loop.js`)**: keep the time of the last tick boundary. `advance(now, tickMs)`: `elapsed = max(0, now - last)`; `due = floor(elapsed / tickMs)`; if `due > 5`, run 5 and drop the rest by setting `last = now - (elapsed % tickMs)`; otherwise `last += due * tickMs`; `alpha = (now - last) / tickMs`. The tests use `deepStrictEqual`, so alpha must come out exactly `0.5`, `0.3`, `0.6` — compute it from the remainder like this, not by subtracting fractional parts. Time going backwards gives `{ ticks: 0, alpha: 0 }`. `reset(now)` sets `last = now`. Pure: no globals, no `performance` inside.
2. **Command routing in main.js**: 'ready': a direction → `turn` then `start` (an arrow both starts and turns); 'restart' (Enter/R) → `start`. 'running': direction → `turn`; 'pause' → pause; 'restart' ignored. 'paused': 'pause' → resume; others ignored. 'over'/'won': 'restart' → a new game started at once (`start(restart(game))`); a direction (key or swipe) also does that, but only once ≥ 600 ms have passed since the game ended (phones have no Enter; the grace period stops a key held at death from restarting instantly). Whenever the game (re)starts or resumes, call `loop.reset(now)` so the first tick is a full `tickMs` away and no catch-up burst happens. Auto-pause when `document.visibilityState` becomes 'hidden' or the window blurs while running.
3. **Each frame** (`requestAnimationFrame`): `now = performance.now()`; if running, `{ ticks, alpha } = loop.advance(now, game.tickMs)` and apply up to `ticks` ticks one by one, comparing each new game with the previous one to fire events: `foodsEaten` rose → `view.onEat(newGame.snake[0])` (+ sound); `level` rose → level-up feedback; status became 'over' → `view.onGameOver()` once, save the high score, game-over feedback; became 'won' → save the high score, a celebratory feedback. Stop applying ticks once the status is no longer 'running'. When paused, keep the last alpha frozen (no jump); when 'ready', alpha 1. Then `view.update(game, alpha, now)`, `world.userData.update?.(now)`, `hud.update(hudModel(...))`, render.
4. **High score**: load once at boot. While playing, the HUD's `highScore` is `max(storedBest, game.score)`. When a game ends, `saveHighScore` and set `isNewBest` = the final score beat the previous stored best and is > 0. `window.snake.getState().highScore` is that same displayed best.
5. **Rendering**: `new THREE.WebGLRenderer({ canvas: #game, antialias: true, powerPreference: 'high-performance' })`; `setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))`; `shadowMap.enabled = true`, `shadowMap.type = THREE.PCFShadowMap` (PCFSoftShadowMap was removed in r186 and only logs a warning); `toneMapping = THREE.ACESFilmicToneMapping`; `outputColorSpace = THREE.SRGBColorSpace`. `scene.background = new THREE.Color(THEME.colors.background)`; fog in `THEME.colors.fog` whose near/far scale with the camera distance after each `frameCamera` (so the board stays clear and the far decor dissolves). Post-processing: `EffectComposer` + `RenderPass` + `UnrealBloomPass(new THREE.Vector2(w, h), strength, radius, threshold)` from THEME.bloom + `OutputPass` (imports from `three/addons/postprocessing/...`). Resize (window `resize`, and orientation changes): `renderer.setSize(innerWidth, innerHeight)`, `composer.setPixelRatio`/`setSize`, `frameCamera(camera, { width, height, aspect })`, update fog.
6. **Debug API**: `window.snake = { getState, getRenderInfo }` exactly as the spec. `getState()` returns a fresh plain object `{ status, score, highScore, level, length, head: { x, y }, food: { x, y } | null, direction, width, height, tickMs, foodsEaten, ticks }` (copies, never the live game). `getRenderInfo()` returns `{ calls, triangles, geometries, textures }` from `renderer.info`; set `renderer.info.autoReset = false` and call `renderer.info.reset()` once at the start of each frame so the numbers cover all composer passes for the frame. The API must not change play in any way.
7. **`?seed=<integer>`**: accept `/^-?\d+$/`, pass `Number(value) >>> 0` as the seed; otherwise a random seed (`crypto.getRandomValues(new Uint32Array(1))[0]`). Board is 20 × 20.
8. **Feedback** (no geometry/material creation per frame — mutate existing objects/uniforms):
   - eat: `view.onEat` (burst already built) + a soft sound;
   - level-up: HUD toast already exists; add a 3D cue, e.g. a short bloom-strength and exposure swell (ease back over ~0.8 s) + an arpeggio;
   - game over: `view.onGameOver()` + a short decaying camera shake from the framed base position + the scene dims (ease `toneMappingExposure` and/or bloom down, restore on restart) + a descending tone;
   - won: a bright bloom swell and a chord.
9. **Sound (optional but wanted)**: tiny WebAudio synth in main.js (oscillators + gain envelopes, nothing loaded from the network); create/resume the `AudioContext` lazily on the first user gesture (keydown/touchstart). `m`/`M` toggles mute through a separate `keydown` listener on window (ignore events with Ctrl/Meta/Alt and `event.repeat`); persist the mute flag in localStorage (`'snake3d.muted'`, wrapped in try/catch). If you ship sound, you MAY edit only the hint strings in `src/hud.js` (`ready`: mention "M" for sound; `over`/`won`: may mention swiping) — keep `npm test` green.
10. If WebGL is unavailable (renderer construction throws), show a short readable message in `#hud` instead of crashing.
11. `src/main.js` should stay readable: small named functions (setupRenderer, handleCommand, frame, …), a header comment. If it passes ~450 lines, consider moving the synth into `src/audio.js` (allowed).

## Verification you must do (beyond npm test)

The suite cannot load main.js, so you must play it in a real browser. A Playwright Chromium binary is at `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` (the google-chrome-stable link is broken). Node 22 has a global `WebSocket`, so you can drive Chrome over the DevTools Protocol from a small Node script: launch `chrome --headless=new --remote-debugging-port=<free port> --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1280,720 --user-data-dir=<tmp dir> about:blank`, fetch `http://127.0.0.1:<port>/json/version` / `/json/list` for the WebSocket URL, then use `Page.navigate`, `Runtime.evaluate` (to call `window.snake.getState()`), `Input.dispatchKeyEvent` (keyDown/keyUp with `key`, `code`, `windowsVirtualKeyCode`), `Emulation.setDeviceMetricsOverride` (390×844 mobile and 1280×720), `Page.captureScreenshot`, and `Runtime.consoleAPICalled`/`Runtime.exceptionThrown`/`Log.entryAdded` events to collect console errors and warnings. Serve the repo with `node scripts/serve.js <repo-root> <free port>` in the background. Keep the driver script and screenshots in the git-ignored scratch dir `.superpowers/sdd/plan/scratch/` (do not commit them); stop the server and Chrome afterwards.

Check and record in your report: no console errors or warnings on load and during play; title screen panel shows; ArrowUp starts and turns (status 'running', direction 'up'); the snake moves (`ticks` rises); `?seed=42` reproduces the same initial food on two loads, and two loads without a seed usually differ; eating works (steer to the food via `getState()` and keys; score 10, length 4); Space pauses (status 'paused', ticks frozen) and resumes; game over (drive into a wall; status 'over', highScore saved and shown); Enter starts a new game at once ('running', score 0); resize to 390×844 keeps the whole board framed and the HUD readable; `getRenderInfo()` returns non-zero calls/triangles. View the screenshots (title, play, eat burst, pause, game over, phone) with the Read tool and fix anything that looks wrong.

## Your Job

1. Write `test/loop.test.js` exactly as given in the brief; run it and watch it fail (RED). Implement `src/loop.js` (GREEN). You may add loop tests after the mandated ones (time backwards, tickMs change).
2. Implement `src/main.js` (and optionally `src/audio.js`).
3. Do the browser verification above; fix what it finds.
4. Run the full suite once (`npm test`) before committing.
5. Commit on the current branch (`feature/trial`) — one or more commits — with messages ending with the line:
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   (This trailer is correct for this session even if your environment suggests another model name.)
6. Self-review your diff. Fix what you find.
7. Report back.

Work from: /home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial
Do not create branches or worktrees, do not push, do not use `git stash`. Do not modify files other than `src/loop.js`, `src/main.js`, `test/loop.test.js`, optionally `src/audio.js`, and (only per ruling 9) hint strings in `src/hud.js`. If something in another module blocks you, report it (DONE_WITH_CONCERNS or BLOCKED) rather than editing it. If anything is unclear, report NEEDS_CONTEXT rather than guessing.

## You Do Not Dispatch Subagents

Do all of this task's work yourself. Never spawn a subagent, and never spawn a reviewer.

## Report Format

Write your full report to:
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-8-report.md
containing: what you built (loop, wiring, rendering setup, feedback, sound, debug API); tests and results; TDD Evidence for loop.js (RED/GREEN with commands and output); the browser verification checklist with the observed values and screenshot paths; files changed; self-review findings; concerns.

Then reply with ONLY (under 15 lines):
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Commits created (short SHA + subject)
- One-line test summary + one-line browser-check summary
- Concerns, if any
- The report file path
