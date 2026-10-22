---
name: pxl
description: Use when working with pxl, the open-source pixel-art tool (crsolver/claude-pxl), in this repository: writing or editing a .px.js animation, building it, making a GIF from it, checking that GIF, or putting it on the README or the landing page.
---

# pxl: pixel-art animation in this repository

pxl (https://github.com/crsolver/claude-pxl, MIT) turns a small `.px.js` file into PNGs, sprite sheets with JSON, animated GIFs and a live viewer. It is built for agents, needs Node 22.18 or later and has no dependencies and no install step. The Clawd Aether animation, the mascot of the README and the landing, is made with it.

This skill is how this repository uses pxl. The language itself is documented by pxl, and that documentation is the reference: do not write `.px.js` from memory.

## 1. Set up

- pxl is cloned at `~/.local/share/claude-pxl`. If it is missing:

      git clone https://github.com/crsolver/claude-pxl.git ~/.local/share/claude-pxl
      git -C ~/.local/share/claude-pxl checkout 21fee41

  Commit `21fee41` (version 0.1.0, 14 Oct 2026) is the one tested here: it rebuilt `aether_sheet.png` from `assets/brand/gifs/aether.px.js` identical byte for byte to the sheet in the owner's player page.
- It is third-party code. At that commit it is about 4,200 lines with no child processes and no `eval`; the only network use is the live viewer, which listens on `127.0.0.1` (port 4321 by default). Read the diff before moving to a newer commit.
- `PXL` below means `node ~/.local/share/claude-pxl/bin/pxl.js`, and `S` means `.claude/skills/pxl/scripts`.
- **Before writing or editing a `.px.js`, read** `~/.local/share/claude-pxl/SKILL.md` (workflow, template, habits) and `reference.md` (the whole API). Read `lighting.md` only when a scene needs lights. If the owner wants pxl as a skill of its own, the README says to clone it into `.claude/skills/pxl-pixel-art`; that is his call, because it loads in every session.

## 2. What is here

- **Source:** `assets/brand/gifs/aether.px.js` (900 lines, comments in Spanish): the Clawd Aether animation, 120 x 120 art pixels, 816 frames at 30 fps. Its story, chapters and where each thing is drawn are in `reference/clawd-aether.md`.
- **The player page** `assets/brand/gifs/Clawd Aether.html` is the page the owner downloaded; it is no longer needed to build anything, but the scripts still read it.
- **The kit:** `assets/brand/gifs/kit.px.js` holds the palette, poses, props and helpers of the v11, taken from `aether.px.js`. A new animation starts with `include("kit.px.js")` and then defines its own `const W = ..., H = ...` (the kit's helpers read them when they run).
- **Page animations, made for the owner's review and not yet on the site:** `control.px.js` (160 x 90, 14 s), `lanes.px.js` (160 x 65, 15 s), `radar.px.js` (160 x 105, 12 s), `install.px.js` (160 x 90, 12 s), `flujo.px.js` (240 x 54, 15 s, a wide strip with the seven steps of the flow section), `equipo.px.js` (160 x 105, 12 s, the four roles) `lost.px.js` (160 x 90, 10 s, the 404 page), the five goals of RADAR `goal_fast`, `goal_auto`, `goal_deleg`, `goal_cheap` and `goal_robust` (`.px.js`, 160 x 105, 12 s) and the three paths `path_direct` (225 x 25, 10 s), `path_delegate` (225 x 40, 12 s) and `path_swarm` (225 x 80, 16 s), whose x4 size equals the 900-wide SVG diagrams they would replace; all 30 fps with a seamless loop. Their art sizes make a whole factor land on the slots of the images they would replace (960 x 540, 1280 x 520, 640 x 420). Together the fifteen GIFs weigh 9.2 MB and their sheets 1.3 MB, which is the argument for a sheet player over GIFs on the page.
- `assets/brand/` is excluded in the owner's clone (`.git/info/exclude`): a new source goes in as `assets/brand/gifs/<name>.px.js` with `git add -f`, as the first two files were.

## 3. Build

Build into a temporary folder, never into the repository.

    OUT=$(mktemp -d)
    $PXL build assets/brand/gifs/aether.px.js --out $OUT --only aether_sheet --no-preview    # about 17 s

- `--only a,b` builds just those assets, so use it while iterating; a full build also writes every sprite, preview and pxl's own GIF (about 40 s).
- `$PXL list art.px.js` lists the assets with their source lines, `$PXL ascii art.px.js <name>` prints one as palette keys with rulers (cheaper than an image), and `$PXL serve art.px.js` opens the live viewer so the owner can watch the painting at `http://127.0.0.1:4321/`. Start it in the background and give him the URL.
- The sheet comes out as `<sheet>.png` plus `<sheet>.json`.

## 4. Make the GIF

pxl writes its own GIF (`anims/<name>.gif`), but at art size and with every delay rounded to 3 hundredths, so Clawd Aether plays in 25.1 s instead of 27.2 s. `--scale` only enlarges the previews. For the site and the README use `scripts/build.js`:

    node $S/build.js $OUT/aether_sheet.png $OUT/mascot.gif 4 --fps 30

- **The factor must be a whole number.** x3 is 360 px, x4 is 480, x5 is 600. 400 is not a multiple of 120 and would smear the pixel grid.
- **Pass `--fps` with the animation's `fps`.** pxl's JSON rounds 33.3 ms to 33, so without it the loop comes out 26.92 s. With 30 the delays are 3, 3, 4 hundredths in turn and the loop is exactly 27.2 s.
- It also takes the player page instead of a sheet, with no `--fps` needed. The GIF is differential: only the box that changed is written and a frame equal to the one before is merged into it (746 frames kept of 816; 0.75 MB at x3, 1.05 MB at x4, 1.36 MB at x5, against 4.4 MB for the old v10).
- The script also writes `<file>.gif.map.json`; build in the temporary folder and copy only the `.gif`.
- The sheet must be one animation of equal frames (no `trim`). For several animations, give each its own sheet.

## 5. Check it before it ships

1. `node $S/verify.js <sheet.png> <gif> <factor> --fps 30` decodes the GIF with separate code and compares every frame, box and delay with the sheet. It must print `errors: 0` and cover the whole run of frames.
2. `node $S/check-in-chromium.js <sheet.png> <gif> <factor> <contact.png>` does the same with Chromium's decoder on 27 frames (needs `playwright-core`; set `PLAYWRIGHT_CORE`) and tiles 16 frames into a contact sheet. Open it with Read and look: the checks prove the GIF equals the sheet, not that the animation is right. Its list of frames is Clawd Aether's chapters; edit it for another animation.
3. `node $S/zoom.js <sheet.png> <out.png> <zoom> [--cols N] <frame>[:<y0>-<y1>] ...` enlarges frames or a band of rows with no browser, to read small text and check single pixels.

On a pass of Clawd Aether look at: the flat-topped A of «AETHER» (at 360 px it reads as «RETHER»), frames 214 to 219 (the hit in negative, then a hold) and 222 to 231 (the shake), which are deliberate, and the loop, where frame 815 must lead into frame 0.

## 6. Put it on the README and the landing

- **README:** `assets/readme/mascot.gif`, the only name `tests/site.test.js` accepts there. Use x4 (480 x 480) with `width="480"`. GitHub strips `style`, so the browser smooths a README image; a larger whole factor keeps the blocks sharp.
- **Landing:** `site/assets/img/mascot-360.gif` (x3), `width` and `height` 360 on `#mascot` and on `#mascot-still` in `site/index.html`. The hero window is 290 to 350 px wide (343.6 at a 1440 px viewport), never exactly 360, so `image-rendering: pixelated` in `site/style.css` (`.hero-win-body img, canvas`) is what keeps the pixels square.
- **Alt text lives in three places** and must say the same: the README `alt`, the Spanish `alt` in `site/index.html`, and `hero.mascot.alt` in both languages of `site/app.js`. The comment `<!-- hero: ... -->` above the README image must stay (a test holds it at the top).
- Replace a file instead of adding one: every image in `site/` must be referenced and be under 3 MB, and `assets/readme/` holds exactly four files.
- Run `node --test tests/site.test.js tests/docs-facts.test.js`.
- The pause button paints the current frame on `#mascot-still`. Under `file://` Chromium taints that canvas and the landing's own `try` keeps the GIF running; serve the page (`python3 -m http.server -d site`) to see it work. Any new GIF on the page has to be added to that pause logic (`freezeMascot` in `site/app.js` knows only the hero's).

## 7. A new animation

1. Write `assets/brand/gifs/<name>.px.js` following pxl's own SKILL.md and reference. Start with `include("kit.px.js")` so the page keeps one look (palette, poses, helpers), define `W` and `H`, and end with `sheet("<name>_sheet", ["<name>"], { pad: 0 })`.
2. Loop it with no cut and keep `fps: 30` so the frame delays stay exact. Give it an art size that scales to a whole factor (120 x 120, 160 x 90, ...). The v11 is the quality bar: characters on twos, easing, hit-stop and shake on the big moment, effects at every frame, 12 to 27 s.
3. Build only the sheet (`--only <name>_sheet --no-preview`, about 1 to 17 s) and look at it with `scripts/zoom.js`, many frames and consecutive ones, the first and last for the loop. Fix with small edits. `$PXL serve` lets the owner watch if he wants.
   - **Never erase with `"_"` on a full scene.** It leaves a transparent pixel, not the colour behind it. `build.js` warns when a sheet uses one (a crab's happy eye did it once).
   - `c.clip(region, fn)` takes a function, not DSL ops: passing `text(...)` fails with "fn is not a function".
   - `sheet(..., { pad: 0 })` with no `cols` makes a roughly square grid; the scripts read the JSON, so any layout works.
   - Look at the weight before choosing the factor: shake, drifting clouds and twinkling stars change many pixels every frame (a 14 s scene weighed 0.97, 1.27 and 1.59 MB at x4, x5 and x6).
4. Then sections 4, 5 and 6. Keep each GIF small: the hero's 0.75 MB is already the heaviest file of the site, and every other image is under 150 KB.

## 8. Open

- The other two pxl animations of the owner, «Clawd Pixel» (96 x 64) and «Clawd Cósmico» (120 x 120), exist only as player pages in his artifacts. Their `.px.js` are not in this repository; ask him for them if they should be edited.
