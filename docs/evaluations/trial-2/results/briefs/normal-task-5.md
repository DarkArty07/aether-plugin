You are implementing Task 5: The HUD and the page — `index.html`, `styles.css`, `src/hud.js` of Snake 3D, a three.js browser snake game judged on graphics quality, creativity, playability and 3D quality; it should feel like a small finished indie game. The 3D scene renders full-window into the canvas; your HUD is HTML layered over it. `src/main.js` (Task 8, not written yet) will call `createHud(document.getElementById('hud'))` and, every time the game state changes, `hud.update(hudModel({ status, score, highScore, level, isNewBest }))`.

## Task Description

Read this first — it is your requirements, with the exact values and test file to use verbatim:
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-5-brief.md

Then read the spec sections "HUD and screens" (`docs/spec.md` lines 130-142) and "Platform" (lines 9-20, for the exact import map). The spec is the binding authority.

## Context from earlier tasks

- `src/render/theme.js` (Task 4, done) exports `THEME` — read its opening art-direction comment and palette: the theme is **"Abyssal Bloom"**, a bioluminescent night aquarium. HUD direction from that comment: "quiet glass panels, no hard borders; pale-ice text with aqua accents and tabular numerals, in a rounded sans stack such as "Trebuchet MS", "Segoe UI", system-ui, sans-serif." Useful colors: `hudText`, `hudPanel` (use with partial opacity), `accent`, `food` (the warm amber), `danger`, `background`. Colors are 24-bit integers (e.g. `0x46e4ff`); convert to CSS with `'#' + n.toString(16).padStart(6, '0')`. `theme.js` is pure (no three.js import), so `src/hud.js` may import it.
- Repo: ES modules, Node 22, `npm test` runs `node --test`; node_modules installed (don't run npm ci/install). Code style: no semicolons, single quotes, 2-space indent. No CDN, no web fonts from the network, no dependencies other than three.
- `src/input.js` (Task 2) listens on `window` for keydown and touch swipes with passive touch listeners, so the page itself must not scroll, zoom or pull-to-refresh: set `touch-action: none` and `overscroll-behavior: none` on html/body/canvas as appropriate.

## Controller decisions

- **Single source of truth for colors:** `createHud(root)` sets CSS custom properties (e.g. `--hud-text`, `--hud-panel`, `--accent`, `--food`, `--danger`) on `root` from `THEME.colors`; `styles.css` uses `var(--name, <fallback>)` with fallbacks equal to the theme values.
- **`hudModel`** stays pure: `score`, `best`, `level` as strings via `String(...)`; `panel` is `null` while 'running', otherwise `{ kind: status, title, hint, newBest }` where `newBest` is `true` only for 'over'/'won' with `isNewBest` truthy, else `false`. Titles/hints carry the theme's voice but stay short and clear. Hints must name the keys: 'ready' names the arrow keys (it may also mention swipe, Space to pause and M for sound); 'paused' names Space; 'over' and 'won' name Enter. The model must not invent fields beyond `{ score, best, level, panel }`.
- **`createHud(root)`** builds the DOM inside `root` once (score, best, level readouts plus one panel element whose content is swapped per kind) and returns `{ update(model), element }` where `element` is the HUD's top-level element. `update` only touches the DOM when a value changed. Give visible feedback for level-ups: when `model.level` increases between updates (and the game is running), briefly animate the level readout and show a short "Level N" toast (CSS animation, removed/reset by class toggling — no timers that leak). A small pop on score change is welcome. The new-best mark on the game-over/won panel must be clearly visible.
- The HUD must not block the game: `pointer-events: none` on the HUD; no buttons or focusable elements (keyboard Enter/Space are game keys, and input.js calls preventDefault on them).
- **Layout:** the canvas is full-window (`position: fixed; inset: 0; width: 100%; height: 100%; display: block`), no scrollbars (`overflow: hidden` on html/body, margin 0). Readouts sit along the top edge with safe-area insets (`env(safe-area-inset-*)`), panels centered. Use `clamp()` font sizes so it fits a 390 × 844 phone and a 1920 × 1080 desktop. Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, a `<title>` (e.g. "Snake 3D — Abyssal Bloom"), and `<html lang="en">`. Text must be readable over a dark, glowing 3D scene: use the glass panel tint plus a subtle text-shadow.
- **`index.html`** holds exactly: `<canvas id="game">`, `<div id="hud">`, the spec's import map verbatim, the stylesheet link `styles.css`, and `<script type="module" src="src/main.js">`. `src/main.js` does not exist yet — do not create it (Task 8 owns it).
- Optional: honor `prefers-reduced-motion` by toning down the HUD animations.

## Your Job

1. Write `test/hud.test.js` exactly as given in the brief; run it and watch it fail (RED).
2. Implement `src/hud.js` (pure `hudModel` + DOM `createHud`), `index.html` and `styles.css` (GREEN). You may add extra tests after the mandated ones for `hudModel` behavior you rely on (e.g. newBest false for ready/paused, won hint names Enter).
3. Check that `src/hud.js` still imports cleanly in Node (no DOM access at module top level).
4. Optionally sanity-check the page in headless Chrome (`~/.local/bin/google-chrome-stable --headless=new --screenshot=...`) — note main.js does not exist yet, so the HUD won't populate; a static check of the layout is enough. Start the server with `node scripts/serve.js . 8090` in the background if you do, and stop it afterwards.
5. Run the full suite once (`npm test`) before committing.
6. Commit on the current branch (`feature/trial`) with a clear message ending with the line:
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   (This trailer is correct for this session even if your environment suggests another model name.)
7. Self-review your diff. Fix what you find.
8. Report back.

Work from: /home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial
Do not create branches or worktrees, do not push, do not use `git stash`. If anything is unclear, report NEEDS_CONTEXT rather than guessing.

## You Do Not Dispatch Subagents

Do all of this task's work yourself. Never spawn a subagent, and never spawn a reviewer.

## Report Format

Write your full report to:
/home/darkarty/.cache/aether-trial2/normal/repo/.worktrees/trial/.superpowers/sdd/plan/task-5-report.md
containing: what you implemented (HUD structure, panels, level-up feedback, CSS approach); tests and results; TDD Evidence (RED/GREEN with commands and output); files changed; self-review findings; concerns.

Then reply with ONLY (under 15 lines):
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Commits created (short SHA + subject)
- One-line test summary
- Concerns, if any
- The report file path
