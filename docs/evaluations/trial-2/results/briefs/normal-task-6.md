You are implementing Task 6: The 3D world and the camera — `src/render/world.js` of Snake 3D, a three.js (0.186.1) browser snake game judged on graphics quality, creativity, playability and the quality of its 3D. It should look like a small finished indie game, not a tech demo. Your module builds the static stage (board, walls, lights, decoration) and frames the camera; the snake/food view (Task 7) and `src/main.js` wiring with renderer, fog and bloom (Task 8) come later.

## Task Description

Read this first — it is your requirements, with the exact values and test file to use verbatim:
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-6-brief.md

Then read the spec's "Look and 3D" section (`docs/spec.md` lines 76-128) — it is the binding authority.

## Context from earlier tasks

- `src/render/theme.js` (Task 4) exports `CELL` (1), `THEME`, `gridToWorld(x, y, width, height) → { x, z }` (cell centers, board centered on origin), `lerp`, `easeOutCubic`, `clamp01`, `bodyColor`. Read its opening art-direction comment: the theme is **"Abyssal Bloom"**, a bioluminescent night aquarium — "The board is a dark teal seafloor under cold moonlight; background and fog are nearly the same abyssal navy, so the far edges of the board dissolve into the deep. Only living things glow." Palette keys you will want: `board`, `boardAlt` (checker twin), `wall` ("reef rock, lighter than the floor but never emissive"), `keyLight` (cold moonlight, casts the shadows), `sky`/`ground` (hemisphere light), `accent` (cyan, "HUD highlights and trim lights"), `background`, `fog`. THEME is frozen.
- Rendering (Task 8): `WebGLRenderer` with antialias, shadows on (PCFSoft), ACES Filmic tone mapping, sRGB output, `scene.fog` + `scene.background` from the theme, and an `UnrealBloomPass` with `THEME.bloom` = `{ strength: 0.8, radius: 0.5, threshold: 0.7 }`. So: the lit board and walls must stay below the bloom threshold (no emissive on them); only small, deliberate accents (e.g. thin cyan trim lights) may glow.
- Repo: ES modules, Node 22, `npm test` runs `node --test`; three is in node_modules (don't run npm ci/install). Tests run in Node without WebGL, so `buildWorld` must not need a renderer or the DOM (no `document`, no canvas textures; `THREE.DataTexture` is fine if you need a texture). Code style: no semicolons, single quotes, 2-space indent.

## Controller decisions (binding conventions shared with Tasks 7 and 8)

- **Board top surface at y = 0.** The snake and food (Task 7) sit above it. The object named `'board'` spans exactly the cells (width × height world units, ±0.5 tolerance in the test) — so do NOT include a frame/border/seafloor in it or in its children (`Box3.setFromObject` includes children). Give it real depth (e.g. a slab whose top is at y = 0) and a checker of `board`/`boardAlt` — e.g. an `InstancedMesh` of tiles with `setColorAt`, or one mesh with vertex colors. It must `receiveShadow`.
- **`'walls'`**: an object (group or mesh) around the board, e.g. a low reef-rock rim one cell outside the playfield, tall enough to read as a boundary and cast/receive shadows, not so tall that it hides the snake near the near edge from the camera.
- **Lights**: at least one `DirectionalLight` with `castShadow = true` (moonlight from above, slightly offset so shadows have direction), shadow camera bounds fitted to the board + walls, `shadow.mapSize` 2048, sensible `bias`/`normalBias` to avoid acne; a `HemisphereLight` (`sky`/`ground`); optionally a couple of soft accent point lights. Add the light's `target` to the group.
- **Decoration (encouraged, it carries the theme):** e.g. a dark seafloor plane extending well beyond the board into the fog, scattered instanced rocks/coral/kelp around the outside of the walls, drifting "marine snow" points. All built once in `buildWorld`. You MAY expose `world.userData.update = (timeMs) => { ... }` for ambient animation (kelp sway, snow drift); it must allocate nothing per call (mutate existing objects/attributes only). Task 8 will call it every frame if present. Use deterministic pseudo-randomness for decoration placement (a tiny local LCG/mulberry32 with a fixed seed is fine; you may import `nextRandom` from `src/rng.js`) so the scene is identical on every load.
- **Camera (`frameCamera(camera, { width, height, aspect })`)**: no yaw — keep the camera in the x = 0 plane on the +z side, looking at the board center, so screen-up equals grid-up (good controls). Elevation roughly 50–65° above the board (never straight down). Compute the distance so the whole board AND walls fit with a small margin at any aspect (landscape 16:9, portrait 9:16, square), using the camera's own `fov` and the given `aspect` (horizontal FOV = 2·atan(tan(vfov/2)·aspect)). Set `camera.aspect = aspect`, adjust `near`/`far` to bracket the scene (the far plane must include the board), call `camera.lookAt(...)` and `camera.updateProjectionMatrix()`. It is called on every resize, so it must be cheap and must not allocate geometries/materials (temporary Vector3s are fine, ideally module-level scratch).
- Materials: `MeshStandardMaterial`/`MeshPhysicalMaterial` with tasteful roughness/metalness; shared materials and geometries where possible; nothing created per frame.
- Keep the file focused; if it grows beyond ~350 lines, report it as a concern rather than splitting files.

## Your Job

1. Write `test/world.test.js` exactly as given in the brief; run it and watch it fail (RED).
2. Implement `src/render/world.js` to make it pass (GREEN). You may add tests after the mandated ones (e.g. the camera is in the x = 0 plane; the 'board' top is at y = 0; `userData.update` if you add it runs without throwing).
3. Strongly recommended: look at it. A Playwright Chromium binary exists at `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome` (the `google-chrome-stable` link is broken). Write a throwaway HTML page OUTSIDE the repo or in a git-ignored scratch path (e.g. under `.superpowers/sdd/plan/scratch/`), served by `node scripts/serve.js <repo-root> <free port>` in the background, that builds a renderer (ACES, sRGB, shadows, fog, background), adds `buildWorld(...)`, frames the camera, and renders; screenshot it headless (e.g. `chrome --headless=new --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1280,720 --screenshot=out.png http://localhost:PORT/...`, maybe with `--virtual-time-budget=3000`) at 1280×720 and 390×844, and view the PNGs with the Read tool. Tune until the scene has real depth, readable shadows, a checker that reads but stays subtle, and an atmosphere that fits the theme. Stop the server afterwards. Do not commit scratch files.
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
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-6-report.md
containing: what you built (board, walls, lights, decoration, camera math), the conventions downstream tasks must know (board top y, any userData.update, object names), tests and results, TDD Evidence (RED/GREEN with commands and output), visual check results (screenshot paths and what you tuned), files changed, self-review findings, concerns.

Then reply with ONLY (under 15 lines):
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Commits created (short SHA + subject)
- One-line test summary
- Concerns, if any
- The report file path
