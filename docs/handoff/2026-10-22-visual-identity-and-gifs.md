# Handoff: the visual identity, the 15 pixel GIFs and the animations page of the landing

- **Date:** 2026-10-22 (UTC). It follows [the landing and README images handoff](2026-10-16-landing-and-readme-images.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, with sub-agents (Sonnet 5.5 for most, Haiku 5.5 for three animations, all reviewed by the Lead).
- **To:** the next session.
- **Repository state:** branch `brand/clawd-aether-px` of the worktree `.worktrees/landing-clawd`, **local commits, not pushed**. It was cut from `3bc5b8b`; `main` is now 167 commits ahead (it only differs from this branch on 3 lines of `README.md` among the files touched here). Nothing was merged or released.

## 1. What was done

| What | Where |
|---|---|
| **The owner's visual identity**, decided in his own words: classical statues, violet cosmos and nebulae, 90s computers, pixel art (not necessarily arcade), Catppuccin Mocha, Clawd. The factory, city, wood and arcade themes are out. | `assets/brand/identity.md` (local, see section 4) |
| **15 pixel GIFs re-themed** to it, keeping each idea, timeline and loop: temple, marble, floppy disks, beige CRT computers, Greek key, nebula. The kit palette (`kit.px.js`) was remapped to Mocha with the same letters. | `assets/brand/gifs/*.px.js`, built GIFs in `site/assets/img/px/` |
| **The plates** (generated with `aether-router img gen`) softened to the pixel scale of the GIFs: Bayer 4x4, cell 5 px (hero, atmosphere) and 8 px (role cards), so a cell shows about 4 px at 1440. | `site/assets/img/{hero,atmosphere,role-*}.png` |
| **The landing**: lazy GIFs (`data-src`, a noscript copy, an inline `aspect-ratio`), frozen as a canvas copy when paused or under reduced motion, a global `[hidden]{display:none!important}`, links versioned `?v=8`, the five goals as text rows beside the RADAR GIF, SVG crabs redrawn as Clawd's blocky shape, the hero window bar fixed. | `site/index.html`, `app.js`, `style.css` |
| **`site/animaciones.html`**: the GIFs that do not fit on the landing (the five goals, RADAR, Equipo, Flujo, Instalar), in Spanish and English, with a pause button; the landing links to it. | `site/animaciones.html`, `animaciones.js` |
| **Tests**: `tests/site.test.js` went from 15 to 18 tests (the animations page, the hidden rule, the placeholder size, the noscript style, the frozen copy's name). | `tests/site.test.js` |

## 2. What waits for the owner

- **Push.** He did not say whether to push. The branch is private-repository work; a push of the branch does not deploy anything (Pages deploys only a push to `main` that touches `site/`).
- **The hero mascot GIF** (`aether.px.js`, v11) still opens on a wooden desk and a grey laptop. It is the item that most breaks the identity. The proposal: a marble plinth and the beige CRT of `equipo.px.js`.
- **The Control section says "wait for YES" three ways** (the GIF, `GUARD.EXE`, the `ESPERA TU SÍ` window). Keep only the GIF?
- **The role net lines** and the vertical ghost text (now hidden under 1500 px), and **`404.html` saying "404" four times**.
- **The README banner, the RADAR strip and the social card** are still the old 2 px halftone (`assets/readme/`, `site/assets/img/social.png`, which a test requires to be identical).
- **The version label**: the landing says `v0.11.0` (hero chips and footer); `plugin.json` on this branch says 0.14.0 and `main` is at 0.18.0.
- **The merge into `main`** (167 commits ahead): expect to resolve `README.md`.
- Known flaws of single animations (the lanes scene is sparse and its OUT tablet reads as a block; the Judge's body blends with the marble in `equipo`; `control` shows PUSH and DEPLOY but no MERGE; the 404 saved language is ignored) are in the agents' reports, copied to the backup.

## 3. Found in this session

- **`img { display: block }` beats the browser's `[hidden]`**, so a hidden image stayed on screen next to its canvas copy. Fixed by a global rule. Check what is drawn (computed `display` and boxes), not the attribute.
- **A fix in the files is not a fix on the owner's screen**: the dev server sent only `Last-Modified`, so his browser kept the old `style.css`. The pages now link every shipped file with `?v=8` (bump the number when one changes) and the dev server should send `Cache-Control: no-store`.
- **A 1x1 placeholder is a square** until the real GIF loads (its intrinsic ratio beats the `width` and `height` attributes): menu clicks landed 2200 px away. Every lazy GIF needs an explicit `aspect-ratio`.
- **Two read-only QA agents** (functional and visual) found what the Lead's checks missed. Their reports are in the backup.
- **The router assigned Haiku to three animations** (`goal_deleg`, `path_direct`, the `lanes` pilot); they passed review, but `lanes` was the sparsest.
- **`aether-router img gen` now returns 1536x1024**, not the 1254x1254 its `IMAGE_SURFACE_DESIGN.md` says; the PNG is opaque.

## 4. Local only, not in git

`assets/brand/` is excluded on the owner's word (`.git/info/exclude`); the animation sources, `kit.px.js`, `identity.md` and `retheme-brief.md` were added with `git add -f`, as the earlier commit did for `aether.px.js`. What stays out of git: the originals in `assets/brand/gifs-v1/` and `assets/brand/plates-v1/` (the pre-change copies). A full backup, with the built GIFs and sheets, the plates, the QA reports and the scripts, is in `~/Desktop/03_PROYECTOS/01_ACTIVOS/aether-plugin-respaldo-2026-10-22/` (see its `LEEME.txt`). The working copies in `/tmp` are lost at a reboot.

To rebuild one animation: `node ~/.local/share/claude-pxl/bin/pxl.js build assets/brand/gifs/<name>.px.js --out <dir> --only <name>_sheet --no-preview`, then `node .claude/skills/pxl/scripts/build.js <dir>/<name>_sheet.png <name>.gif <factor> --fps 30` and `verify.js` with the same arguments.

## 5. Left behind

- The dev server on port 8000 was stopped; serve with `python3 -m http.server 8000 --bind 127.0.0.1 -d site` (or open `site/index.html` from `file://`).
- The worktree is `.worktrees/landing-clawd`; it is not committed, as `CLAUDE.md` says.
