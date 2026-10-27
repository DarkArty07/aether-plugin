# Brief for re-theming one pxl animation of the Aether landing page

You re-theme ONE pixel-art animation made with pxl (an open-source pixel-art DSL, installed). Your prompt names the animation. Work alone, do not ask questions, finish the job. The result must keep the animation's idea and look like it belongs to the visual identity in `identity.md` (same folder). Read that file first and in full.

## What the owner said
He loved the first 15 animations ("quedó súper bonito") and wants them kept as ideas. But the visual identity had come apart, so he decided its themes: classical statues, violet cosmos and nebulae, 90s computers, pixel art (not necessarily arcade), Catppuccin Mocha, Clawd. For the animations he said: «el pixel art lo vuelves a hacer dejando la idea, cambiando las temáticas a lo que estamos manejando». So: **same idea, same story, new scenery**.

## What you change and what you keep
- **Keep:** the story beats and their order, timings, frame count, fps, canvas size, loop, HUD bar and caption texts (UPPERCASE English, 3x5 font), the one hit-stop beat, the narrating counters, Clawd and the crabs, the file name and the `anim` name.
- **Change:** the scenery, props and sprites, following the table in `identity.md` and the line for your animation. Drop city, factory, wood and arcade trappings. Add marble, columns, busts, pedestals, nebula, stars, floppy disks, CRT monitors, 90s windows and dialogs, the mouse arrow.
- Marble = the light end of violet (lavender, text white) with violet shadows, drawn with dither. Make your own marble ramp with `pal({...})` from the Mocha hexes in `identity.md`; do not reuse the old wood letters for it. A palette key that does not exist fails the whole build.
- The background stays mostly still: spend the motion on the action (the GIF must not get heavy). Keep the GIF within +20% of the previous weight.

## Quality bar
The siblings in `assets/brand/gifs/` and the originals in `assets/brand/gifs-v1/` are your examples; `aether.px.js` is the reference. Characters are drawn "on twos" (`two(f)`), paths, sparks, meters and stamps move every frame. Anticipation, overshoot, squash, secondary motion. Rich but readable at the shown size; every mark has a cause; no random speckle.

## Lessons from the first batch (do not repeat)
- Never erase with `"_"` on the full scene: it leaves a transparent pixel. Paint the real colour. `build.js` warns about transparent pixels; the build must print no warning.
- `c.clip(region, fn)` takes a function. `include("kit.px.js")` works; `const W, H` may come after it. `process` is not defined in `.px.js`.
- `zoom.js` applies a row range like `28:0-54` only to that one frame argument. Scaled-down contact sheets hide 2x2 eyes: zoom to check small details.
- Decide the loop first: ambient motion periods divide the frame count and the end state equals the start state.
- `kit.px.js` was just remapped to Catppuccin Mocha (same letters). Do not edit it; add your own keys in your file.

## How to work
Paths: WORK=$REPO/.worktrees/landing-clawd ; ART=$WORK/assets/brand/gifs ; V1=$WORK/assets/brand/gifs-v1 ; PXL="node $HOME/.local/share/claude-pxl/bin/pxl.js" ; S=$WORK/.claude/skills/pxl/scripts ; SCRATCH=/tmp/claude-1000/-home-darkarty-Desktop-03-PROYECTOS-01-ACTIVOS-aether-plugin/010621c2-ae75-400a-ba27-6ad1f8bf0f79/scratchpad/retheme/<name> (create it).
1. Read pxl's docs: $HOME/.local/share/claude-pxl/SKILL.md and reference.md, then $WORK/.claude/skills/pxl/SKILL.md, `identity.md`, `$ART/kit.px.js`, and your own current source `$ART/<name>.px.js` (identical to `$V1/<name>.px.js`). The current look of your animation, with the Mocha palette but the old scenery, is `/tmp/claude-1000/-home-darkarty-Desktop-03-PROYECTOS-01-ACTIVOS-aether-plugin/010621c2-ae75-400a-ba27-6ad1f8bf0f79/scratchpad/gifs-mocha/<name>/<name>.gif` (look at it with the sheet: `.../<name>_sheet.png` and `zoom.js`).
2. Edit `$ART/<name>.px.js` in place: keep its structure and timeline constants, redraw scenery, props and sprites.
3. Build into the scratch folder, never into the repo: `$PXL build $ART/<name>.px.js --out $SCRATCH --only <name>_sheet --no-preview`. Look at many frames: `node $S/zoom.js $SCRATCH/<name>_sheet.png $SCRATCH/look.png 2 --cols 4 <frames...>` and open look.png with the Read tool. Expect 8 to 15 rounds.
4. Finish: `node $S/build.js $SCRATCH/<name>_sheet.png $SCRATCH/<name>.gif <factor> --fps 30` and `node $S/verify.js $SCRATCH/<name>_sheet.png $SCRATCH/<name>.gif <factor> --fps 30`: `errors: 0`, no WARNING, size as in your prompt.
Do NOT: edit any file other than your own `$ART/<name>.px.js`; run `pxl serve`, a browser or Chromium; commit or push; use the network.

## Report (max 15 lines, plain text)
Source, sheet and GIF paths; frames, fps, art size, GIF size in KB at your factor and the previous size; what each theme change was (old object to new object); flaws you know and did not fix; anything in pxl that behaved unexpectedly.
