You are implementing Task 4: The art direction — `src/render/theme.js` of Snake 3D, a three.js browser snake game judged on graphics quality, creativity, playability and 3D quality. It should feel like a small finished indie game, not a tech demo. Your theme is the single palette and mood that later tasks build on: the 3D world and lighting (Task 6), the snake/food/particle effects (Task 7), and the HTML HUD (Task 5). Those tasks cannot edit your file, so what you put here is what they get.

## Task Description

Read this first — it is your requirements, with the exact values and test file to use verbatim:
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-4-brief.md

Then read the "Look and 3D" section of the spec (`docs/spec.md`, lines 76-95) — it is the binding authority for this module.

## Context

- Repo: ES modules (`"type": "module"`), Node 22, `npm test` runs `node --test`. `node_modules` (three 0.186.1) is installed; do not run `npm ci`/`npm install`.
- Code style: no semicolons, single quotes, 2-space indent (match `src/game.js`, `src/input.js`).
- `src/render/theme.js` is pure: it must not import three.js or touch the DOM (colors are 24-bit integers, e.g. `0x1a2b3c`).
- The rendering will use: `WebGLRenderer` with ACES Filmic tone mapping and sRGB output, shadows, fog, and an optional `UnrealBloomPass` configured from `THEME.bloom` (`strength`, `radius`, `threshold`). Choose bloom values so emissive accents (snake, food, particles) glow while the board and walls do not wash out (typical ranges: strength 0.4–1.2, radius 0.2–0.6, threshold 0.6–0.9).

## Controller decisions

- **The art direction is yours.** Pick a theme with a real mood (the spec suggests neon arcade, toy diorama, deep sea, alien garden — or your own), give it an evocative `name`, and choose the palette for contrast and readability: the snake head, the snake body and the food must stand out clearly against the board and boardAlt (checker) colors, and the head must read as distinct from the body. `background` and `fog` should be close so distant geometry fades into the atmosphere.
- Open `theme.js` with a short art-direction comment (5–12 lines) that later implementers will follow: the mood, how the scene/atmosphere should feel, what the snake and food are (e.g. materials, glow), what the eat and game-over effects should look like, and the HUD's feel (suggested CSS font stack and tone). Keep it concrete.
- THEME's top-level keys are exactly `{ name, colors, bloom }`. Inside `colors`, the 11 spec keys are required; you MAY add a few extra color keys that downstream tasks will plausibly need (for example `keyLight`, `fillLight`/`sky`/`ground` for a hemisphere light, `hudText`, `hudPanel`), each with a short trailing comment. Do not add anything else (no fonts object, no extra top-level keys).
- Freeze THEME (and its nested objects) so downstream code cannot mutate the shared palette.
- `gridToWorld`: the test uses `assert.deepEqual` from `node:assert/strict`, which compares with `Object.is`, so `-0` ≠ `0`. Make sure center cells give `+0` (e.g. `(x - (width - 1) / 2) * CELL` gives +0 when equal; avoid forms that can produce `-0`).
- `bodyColor(index, length)`: interpolate per RGB channel between `snakeBody` (index 1) and `snakeTail` (index `length − 1`), returning a rounded 24-bit integer; clamp the index into range; for `length <= 2` return `snakeBody` (avoid 0/0).
- `lerp(a, b, t)`, `easeOutCubic(t)` (= `1 - (1 - t)^3`), `clamp01(t)`.

## Your Job

1. Write `test/theme.test.js` exactly as given in the brief; run it and watch it fail (RED).
2. Implement `src/render/theme.js` to make it pass (GREEN). You may add a few extra tests after the mandated ones (e.g. bodyColor for length 2, no -0) if they pin behavior you rely on.
3. Run the full suite once (`npm test`) before committing.
4. Commit on the current branch (`feature/trial`) with a clear message ending with the line:
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   (This trailer is correct for this session even if your environment suggests another model name.)
5. Self-review your diff. Fix what you find.
6. Report back.

Work from: /home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial
Do not create branches or worktrees, do not push, do not use `git stash`. If anything is unclear, report NEEDS_CONTEXT rather than guessing.

## You Do Not Dispatch Subagents

Do all of this task's work yourself. Never spawn a subagent, and never spawn a reviewer.

## Report Format

Write your full report to:
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-4-report.md
containing: the theme you chose and why (palette + contrast reasoning); what you implemented; tests and results; TDD Evidence (RED: command + relevant failing output; GREEN: command + passing output); files changed; self-review findings; concerns.

Then reply with ONLY (under 15 lines):
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Commits created (short SHA + subject)
- One-line test summary
- The theme's name in one line
- Concerns, if any
- The report file path
