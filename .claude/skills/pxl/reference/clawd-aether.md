# Clawd Aether: the animation

120 x 120 art pixels, 816 frames at 30 fps, 27.2 s, a loop with no cut (it ends where it begins). Shown at x3 on the landing, x4 on the README and x5 in the 600 px GIF. The source is `assets/brand/gifs/aether.px.js` and its comments are in Spanish.

## The story and its chapters

Clawd works alone and gets swamped. Someone types `/aether` and a cosmic bolt hits. Clawd becomes a galaxy, hands the tasks by tier to three subagents, who work in parallel. Clawd writes a brief, waits for a yes, merges and goes back to the desk with a spark.

The player's chapters, by first frame: 0 Trabajo normal, 60 Saturado, 150 /aether, 182 Presagio, 214 Impacto, 241 Al espacio, 272 Galaxia, 340 Subagentes, 384 Ruteo por nivel, 456 En paralelo, 586 Brief, 654 Tu sí, 690 Merge, 724 Regreso.

The source names the same moments in one table, `T`: rush 60, slump 110, cmd 150, enter 176, omen 182, charge 205, hit 214, wipe 241, morph 272, power 318, spawn 340, route 384, work 456, brief 586, cursor 654, press 683, party 690, ret 724, calm 768, retype 792. Move a chapter by changing `T` and the `CHAPTERS` list of the player together.

## How it is timed

- Character poses are drawn «en dos»: each pose lasts 2 frames. Effects and paths move every frame. The helper is `two(f)`.
- Easing is a smoothstep (`ease`), paths are Bezier curves (`bez`, `along`), and randomness is seeded (`seeded`, `hash`, `vnoise`), so a frame is the same every time.
- The hit has a hit-stop: frames 216 to 219 hold frame 216. Frames 222 to 231 shake the canvas by fixed offsets (`shake`).

## Cast and colours

- **Clawd** is orange (`o`, `#da7756`) with black eyes, on the official grid at double size.
- **Three subagents**, one per tier: light green (`t`), medium blue (`b`), strong magenta (`h`). The colours are an illustration choice and not something the plugin defines (docs/handoff/2026-10-16-aether-theme.md).
- **Aether** is the same body with a galaxy skin (violet ramp `n N m M v V`), a violet outline (`A`) and an orbit (`r R`).
- The cards are tasks with a coloured stripe for their tier; the brief is a retro monitor.
- The palette comments in the source group the letters: space, room, laptop, Clawd, lightning, galaxy, stars and eyes, orbit, each subagent, screens and text, success and alert, cards and sweat and cloud.

## Where each thing is drawn

One function per thing, called in paint order from `anim("aether", ...)`: `room` and `space` (backgrounds), `clouds`, `cards`, `orbit`, `crabs` (the subagents), `shock`, `drawPose` with `drawEyes` (Clawd), `outline`, `laptop`, `burst`, `flows` (packets going up and results coming back), `bolt`, `sparks`, `confetti`, `brief`, `caption` and `hud`. Clawd's own script, which pose at which frame, is `clawd(f)`.

Text on screen, all in English while the source comments are Spanish:
- **The top bar** is `hud`: a status line that changes by phase (WORKING with TASKS n, the typed /AETHER, AETHER ON, SPAWNING AGENTS, ROUTING BY TIER, 3 AGENTS WORKING, WRITING BRIEF, WAITING FOR YOU, MERGED OK, DONE) and the CTX meter, whose level is `ctxValue`. In the cosmic phase it slides out.
- **The lower caption** takes over there: `caption`, driven by the `CAPTIONS` table, which lists the end frame, the text and the colour of each line.
- **The monitor** is the `BRIEF` table: BRIEF, DONE 3/3, ASSUMPTIONS 3, RADAR, NEEDS YOUR YES, PUSH MERGE? and the Y button.
- To reword anything, change the string in its table or in `hud`, mind the width (the font is 4 px per character in `hud`'s layout, 112 px wide bars), and look at the result with `zoom.js`.

## Earlier versions

The owner's other pxl artifacts are earlier takes on the same character: «Clawd Pixel» (96 x 64, 120 frames, Clawd typing at a laptop and jumping when the task ends) and «Clawd Cósmico» (120 x 120, 680 frames, the transformation and the three subagents). Their sources are not in this repository.
