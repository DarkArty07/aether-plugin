# Handoff: the landing page, the README images and the Pages workflow

- **Date:** 2026-10-16 (UTC). It follows [the Aether theme handoff](2026-10-16-aether-theme.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, in an Aether session on 0.11.0. All the build work went through delegate tasks, not the swarm; the owner chose Opus 5.5 at `medium` for the animation review.
- **To:** the next session.
- **Repository state:** this handoff ships in pull request #29, `feat/landing-and-readme-images`, with the README images, `site/`, the Pages workflow, `tests/site.test.js`, `CLAUDE.md` and a "The website" section in `docs/contributing.md`. `npm test` 987 of 987 before this file. Nothing under `plugins/aether/` changed, so the plugin is still 0.11.0 and no release is implied.

## 1. What was done

| What | Where |
|---|---|
| **The README restructured**, with its banner, mascot GIF and RADAR strip. The order and the 160-line limit are the ones `tests/docs-facts.test.js` holds. | `README.md`, `assets/readme/` |
| **The landing page**, eight sections (origin, goals, team, paths, flow, control, lanes, install and author), Spanish and English, with animations that honour reduced motion, a no-JavaScript fallback and a `404.html`. Static, vanilla, no build. | `site/` |
| **The deploy workflow**, `pages.yml`, on a push to `main` that touches `site/` or by hand. | `.github/workflows/pages.yml` |
| **`CLAUDE.md`**, from `/init`. | repository root |

The images are 17 generated plates (`aer i gen`), turned into a 6-tone halftone ("mocha ramp") inside retro UI windows. The owner rejected two other looks on the way: chunky pixel-art banners with pixel sprites, and soft cinematic ones. Pixel art stays only in the mascot GIF.

## 2. What waits for the owner

- **Pages is not on, and the repository is private.** A private repository needs a plan that allows Pages, or the repository has to be made public (the owner's call). Then Settings > Pages > Source: GitHub Actions, set the repository variable `PAGES_ENABLED` to `true`, and run the workflow by hand or push a change to `site/`. Until the variable is set both jobs are skipped, so `main` stays green. Enabling Pages through the API was tried on 2026-10-16 and answered 422, "Your current plan does not support GitHub Pages for this repository".
- **The social card:** Settings > General > Social preview, upload `assets/readme/social.png` (1280x640).
- **Link the site from the README** once it is live. It was left out on purpose.
- **A release.** `main` carries, unreleased, PR #27 (the Argon price and index in `config/`) and PR #28 (the theme, listed under `## Unreleased` in the changelog). The installed 0.11.0 has no `themes/`. The steps are in `docs/contributing.md`, "Release"; `~/.local/bin/aether-lead` is a copy and needs copying again.
- **The first real `/aether:design` run** with live agents (the 0.11.0 test) is still open. The landing's production version is a good candidate: the prototype has no build or tests beyond `tests/site.test.js`. Open choices: where it lives (`site/` with Pages, as now, or inside the Aether Agents site), the languages (the prototype has both) and the mascot in the hero (the prototype has it).
- **The Spanish copy** of the page is a translation of the README that the owner has not read.

## 3. Found in this session

- **A page can look "stuck" for a reason that is not its code.** With the OS asking for reduced motion, the first version started fully paused. It now starts in a calm mode, plays the meaningful sequences once and offers a play-anyway button.
- **Stepped timing reads as a low frame rate** on ordinary movement. Steps stay only for typing, the hero letters, the CRT flicker and the crab legs.
- **A guard grant needs the owner's words as typed**, typos included (`aether-autonomy grant --quote`); a "corrected" quote is rejected as not found in their messages.
- **Halftone reads when the subject fills the window.** A wide crop goes to mush; a bright subject on a dark plate dithers well; a plate with a reflective floor does not.

## 4. Local only, not in git

`assets/brand/` is excluded on the owner's word (`.git/info/exclude`). It holds the workshop the final images came from: `source/readme_images.js` (banner, RADAR strip, social card), `source/landing_images.js` (the landing's images), `source/banner_halftone.js` and `source/banner_soft.js` (proposals), the plates in `concepts/`, and the mascot GIFs in `gifs/`. The scripts need `playwright-core`, its cached Chromium and the two woff2 fonts from the Aether Agents site checkout (`~/Desktop/agentes/aether/website`). Only the final files are tracked.

## 5. Left behind

- Worktrees of this session: `.claude/worktrees/agent-abbf09062a3922304` (branch `docs/readme-structure`, superseded: its commits are squashed into PR #29) and `.claude/worktrees/agent-a11580ee0ccb07138` (branch `feat/landing-and-readme-images`), with the local branches `worktree-agent-abbf09062a3922304` and `worktree-agent-a11580ee0ccb07138`. Deleting them is the owner's call (class `delete`).
- The project memory was erased on the owner's order, to start from zero. Nothing in the repository depended on it.
