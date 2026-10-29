# Research: can Haiku build a big model's frontend if it is guided well? (2026-10-28)

Nine builds of the same three.js snake, made with Claude Code's own models only, graded blind and played by the owner. This folder is the complete record: what was asked, how each build was made, every number, the owner's verdicts, what was found, what is not yet shown, and how to run it again. The owner's short brief and the run's diary, in Spanish, are in [notes/](notes/); a visual report with the screenshots is [report.html](report.html) (also published privately at https://claude.ai/artifact/1WXxhLetWczyu4w6vp45Ek).

- **Autonomous run:** `auto-20261028-155518-67ab`, Lead session `4b87a2cf-f4b9-40b3-aa12-ba16e200e938` (Opus 5.5), 2026-10-28 21:55 to 2026-10-29 04:24 UTC. Outcome `done`.
- **Branch holding this record:** `exp/frontend-guided` (local, not pushed). Its two earlier commits (dab9962, 5a6b834) are the guided agents; `exp/frontend-skills` (01647c5) gives the swarm's agents the `Skill` tool.
- **Issues filed:** [#122](https://github.com/DarkArty07/aether-plugin/issues/122), [#123](https://github.com/DarkArty07/aether-plugin/issues/123), [#124](https://github.com/DarkArty07/aether-plugin/issues/124), [#125](https://github.com/DarkArty07/aether-plugin/issues/125).

## 1. Answers

1. **Can Haiku build what a bigger model builds, if guided well?** Yes, on a rich plan. With the same plan and the same method, Haiku implementers and Sonnet implementers scored 27 and 27 in blind grading, with the same score on every criterion, and the owner sees no difference («No veo diferencia alguna entre sonnet rico y haiku rico»). Implementers cost $1.48 on Haiku and $5.55 on Sonnet, and Sonnet got stuck on a task Haiku passed at once.
2. **Under what conditions?** A numbered art direction written before the plan. It was the only change that raised the grade (25.75 to 27; the owner's favourite of the nine). Screenshots for the agents, verified three.js recipes and a visual check did not raise it on the plain plan; they fix visible errors.
3. **What do skills add?** Installed as they were, nothing: no agent of the swarm opened one of the 298 skills, since the listing showed names only; that build cost more and scored lower (24.75). Read one by one, none is about games, three.js or WebGL, and none is an art direction with numbers. The owner's hypothesis, an "art direction" skill for frontend work, is the next test ([#125](https://github.com/DarkArty07/aether-plugin/issues/125)).
4. **Is it cheaper?** Not yet. The build the owner liked most cost $22.17 counted (design $11.45, build $10.72), about the same as October's normal mode ($21.95), and $31 to 40 from zero (see section 8). Haiku is 7 % of that bill; Opus (the final review and an unneeded Examiner) is 55 %.

## 2. What the owner asked

In his words, in order:

- «Considero que este proyecto necesita mas conocimiento practico aplicado. Skills pues, pero no se a quein le podria dar skills si a los implementers o a los agentes»
- He shared https://github.com/affaan-m/ecc and https://github.com/dietrichgebert/ponytail: «la idea es mejorar la calidad de los resultados. hacer mas multipfacetico el sistema… no tiene skills de frontend por ejempolo, solo tiene lo que el modelo sabe. Y para eso son las skills para mejorar lo que el modelo sabe»
- «Instala todas. Estan por algo. Mira trabaja en un worktree. … Los modelos de poca monta es bien sabido que son muy malos en frontend, necesito ver si bien guiados pueden alcanzar a sonnet y a opus pero por menor costo. Tambien necesito ver que resultado obtenemos con y sin skills. … El objetivo es hacer un juego snake en three.js muy visual y dinamico. Pero antes, como podriamos obtener que los modelos como haiku programen lo pesado y lo de granel pero el resutlado sea como el de un opus o un sonnet.?»
- «Necesito saber primero como un sonnet xhigh programa el snake. Depsues necesito saber si un sistema que programo con haiku puede alcanzar el resultado de un sonnet xhigh y que condiciones necesitamos. Despues necestio saber si un sistema mejora el resultado con skills o es lo mismo. Principalmente me interesa saber dos cosas. Un modelo como haiku puede programar el resultado de uno mayor si lo guaimos bien. 2: que aportan las skills.»
- «El snake se tiene que ver bien visualmente, y estbale para jugar eso es lo que se tiene que lograr … no uses modo sueprdelegacion, primero tengo que dejar desmotrado esto unciamente con los modelos que claude code tiene. Fable 5.1 queda fuera»
- «si obtenemos algo asi como el de opus pero usando haiku ahorramiamos costos muy brutos. Tienes la cuenta abierta ilimitada para pruebas y trabjaa autonomamente que no estare disponible quiero ver como queda esto y ve docuemtnando que es impórtante.»
- At the end: «deja todo absolumetamernte documentado no tomare una desicion ahora, pero si necesito que no s epierda ningun detalle de lo realizado apra usar esta investigacion a futuro»

Success criteria of the run (C1 to C7, all met): Sonnet xhigh alone measured; Aether as it is measured; Aether plus the ECC and Ponytail skills measured; a guided Aether measured; blind grading with the October builds as anchors and screenshots for the owner; a written answer with evidence; Claude Code's models only, with superdelegation off and no Fable.

## 3. The fixture

The October "trial 2" snake, recovered from the plugin's git history (removed from the tree in 26bcac2):

- **Spec:** `designs/d-design/spec.md`. Classic snake on a grid as a real three.js scene that «should look and feel like a small, finished indie game, not a tech demo», judged on graphics quality, creativity, playability and 3D quality. Two fields were added for today's method (D2): `Intent` and `## Criteria`, with the same content as its first paragraph and the owner's quote.
- **Skeleton:** vanilla JS, three.js r186 from `node_modules` through an import map, no build step, tests in Node (`npm test`). Base commit 3f408dd (the `base` repo; it is inside every bundle).
- **Hidden exam:** 25 cases (`kit/harness/acceptance-suite.js`), never shown to any build. Run with `TASKS_ROOT=<build> node --test acceptance-suite.js`.
- **Browser bench:** `kit/harness/evaluate-build.mjs`, 13 checks in headless Chromium 1243 with SwiftShader (software rendering): loads, title screen, Enter starts, eats and grows, levels up, Space pauses, Space resumes, a wall ends the game, high score, Enter starts a new game at once, high score survives, loads on a phone, no scrollbars on a phone. An autopilot (BFS) plays for 40 s under a controlled clock. It saves screenshots: title, play, 120 ms after eating, paused, game over, phone title and play, five frames after eating (`10-fx-0..4`, added today) and four frames 160 ms apart while moving (`11-move-0..3`, added today). It reproduced October's numbers exactly. Frame rates under software rendering are noise (the same build gave 11.8 and 41.3 fps) and were dropped from the judge's facts.
- **Anchors:** the two October builds, `anchors/oct-aether` and `anchors/oct-normal` (in the archive, section 12). Today's bench: Aether 12/13 (fails "Enter starts a new game at once") and 25/25; normal mode 13/13 and 24/25.

## 4. The nine builds

| Id | What it is | How it ran | Result commit |
|---|---|---|---|
| s1-sonnet | Sonnet xhigh alone | plain `claude -p --model sonnet --effort xhigh`, superpowers and ECC off (`.claude/settings.local.json`), prompt `kit/prompts/s1-sonnet.txt` | 7192bb3 on `main` |
| s2-normal | Aether as installed | installed plugin 0.25.1, design d-design, swarm prompt `kit/prompts/swarm.txt`, compiled with 0.25.1's bin by path | 632e03c on `feature/snake` |
| s3-skills | Aether + 298 skills | as s2, plus the skills in `.claude/skills/` (excluded from git) and plugin branch `exp/frontend-skills` (the `Skill` tool for implementer, supervisor and reviewer), no instruction to use them | 970fb37 |
| s4-guided | Aether guided | as s2, plus the guided kit (section 5.3) and plugin branch `exp/frontend-guided` | 1692904 |
| s5-rich | Haiku on a rich plan | design d5-rich (the art direction), the guided kit with the rich preview and `look.md`, `exp/frontend-guided`, prompt `kit/prompts/swarm-s5.txt` | fb68c3a |
| s6-haiku | Haiku xhigh alone | plain `claude -p --model haiku --effort xhigh`, same skeleton and prompt as s1 (`kit/prompts/s6-haiku.txt`) | 3145cad on `main` |
| s7-rich-sonnet | Sonnet on the rich plan | as s5, with a copy of the plugin whose ladder starts on Sonnet (`kit/plugin-sonnet-impl/ladder.json`), prompt `kit/prompts/swarm-s7.txt`; same starting tree as s5 (6fc2e81, checked by hash) | 3b41d3f |
| oct-normal | October normal mode | Opus 5.5 main session at xhigh with superpowers' subagent-driven development: Haiku for 3 logic tasks, Sonnet xhigh for 5 render tasks, Sonnet task reviews, an Opus final review, a Sonnet fix wave | October |
| oct-aether | October Aether | Aether 0.1: Opus Designer, implementers at a fixed `medium` | October |

Every Aether session ran headless through `kit/run-lead.sh`: `claude -p … --agent aether:lead --effort xhigh --permission-mode bypassPermissions`, with `--settings` turning off superpowers and ECC and, for both plugin keys (`aether@aether-plugin` and `aether@inline`), `superdelegation`, `observedev` and `autoissue`; `--strict-mcp-config`, `ENABLE_CLAUDEAI_MCP_SERVERS=false`, its own `AETHER_DATA_DIR`, `AETHER_IRREVERSIBLE=enforce` and `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` (so `claude -p` does not stop the swarm 10 minutes after the last turn). The Lead of those sessions ran on Sonnet xhigh. Claude Code 2.1.312.

Models and efforts by role in the Aether swarms: implementers Haiku `high`, a retry on Haiku `xhigh`, then Sonnet and Opus (the ladder of 0.25.1); supervisors Sonnet `high`, some retries at `xhigh`; final reviewer Opus `xhigh` in slices (s2, s3, s5), or one Opus `high` pass when #122 struck (s4, s7); ops answered by the mod without a model when the bin path matches (s2, s5, s7), otherwise by Haiku `low` (s3, s4, #123).

## 5. How each piece was made

### 5.1 The shared design (d-design, for s2, s3 and s4)

One Aether design for all three, so s2 and s3 differ only in skills and s4 only in the guidance (D6). Writer (Sonnet `high`) wrote the plan and the tasks; the Judge (Opus `high`) ruled `revise` in round 1 (blocking: a framing test impossible on a 4×4 board; major: stars out of frame; 5 minor) and `approve` in round 2 (3 minor). 12 tasks in 4 waves (6, 4, 1, 1), commit 80a1e3f. The Writer wrote its own art direction with numbers, "Neon Dusk" (palette, light intensities, the modelled head, glowing studs, sparks, the eat ring, camera shake, HUD gradients) and even named the r186 traps; but the scene was a clean neon board with nothing around it. The method ran an Examiner although none was asked for (it rewrites the exam when the plan changes); its exam is in `data-d-design/exams` and was not used. Cost $9.27, 65 min. Files: `designs/d-design/`.

### 5.2 The rich design (d5-rich, for s5 and s7)

After the first blind round, the Lead (Opus, this session) wrote an art direction that answered the judge's critiques point by point: `kit/rich/art.md` (committed in d5-rich as `specs/001-snake-3d/art.md`). It keeps "Neon Dusk" and the spec, and adds, with numbers:

- light and exposure: `toneMappingExposure` 1.25, hemisphere 0.9, key light 2.6, a play frame of mean luminance 35 to 70 of 255;
- camera and presence: elevation `lerp(40, 54, …)`; body spheres 0.46 with a second instanced mesh of joints so the body reads as one tube; the head ×1.15 with a glowing visor, a mint point light riding with it, a cyan trail of 48 points; the food ×1.3 with an amber beacon and six orbiting motes;
- a new module `src/render/horizon.js`: a striped synthwave sun (shader), a grid floor running to the horizon (shader, replacing a gray floor disc), two rings of low-poly mountains with glowing edges, 24 floating shapes, 300 sparkles, beams over the four pylons;
- effects per event (eat: bloom pulse, sun flare, beacon flash; level up: a grid ripple; game over: the horizon dimmed and the fog tinted);
- the HUD card in the lower third with the title on one line; a budget of 90 draw calls and 150,000 triangles;
- the list of what the screenshots must show.

A headless Lead session (prompt `kit/prompts/d5-rich.txt`) had the Writer revise tasks 8, 9, 10 and 12 and add task 13 for the horizon, then ran `/aether:design` in short mode: Judge round 1 `revise` (major: the game-over tint was invisible; 3 minor), round 2 `approve` (2 minor). 13 tasks in 4 waves. The Writer made one decision of its own beyond `art.md`: a 70° field of view so the sun and mountains enter the frame; it makes the board large and the snake small on screen, which became the judge's main critique of both rich builds. Cost $11.45 (Writer $4.69, Examiner $4.07 though not needed, Judge $1.81, Lead $0.88), 56 min. Files: `designs/d5-rich/`.

### 5.3 The guided kit (s4, s5, s7)

Four levers, prototyped on `exp/frontend-guided` and in each arm's repo:

1. **Recipes:** the skill `kit/guided/skill/threejs-game/SKILL.md` (about 20 KB), preloaded into the implementer through the `skills:` frontmatter (this works for plugin agents in a Lead session; verified: the implementer quoted the title and recipe R16 without a tool call). Rules (the plan is the target; r186 traps: `PCFShadowMap` not `PCFSoftShadowMap`, `Timer` not `Clock`, `renderer.info.autoReset=false` with an EffectComposer; what glows; light enough to read; far points need pixels; no allocation per frame; one draw call per kind; tests in Node; look at your work) and recipes R1 to R18 from `kit/guided/demo/recipes.js`, each rendered and checked in Chromium first (the first version came out nearly black; lights, exposure and star size were fixed).
2. **Eyes:** `scripts/shots.cjs` (`kit/guided/scripts/`, `kit/rich/scripts/`). It serves the repo, plays it in Chromium with the autopilot under a controlled clock (`fastForward`: 54 s instead of 4 min 13 s with `runFor`), saves `desktop-1-title`, `2-play`, `3-eat`, `4-over`, `phone-1-title`, `phone-2-play`, and reports page errors and black or blown-out frames from luminance computed in the page. Before `src/main.js` exists it shows a preview (`scripts/preview.html` and `preview.mjs`) that mounts the theme, world, snake view and HUD (and the horizon in the rich kit) in a fake 8-cell game, so the visual tasks can see their part. The implementer's new step 7 runs `npm run shots` and compares the pictures with the brief and `look.md`; the supervisor and the final reviewer got `Bash` for one `npm run shots` and a "Look at the game" section (diff of the three agent files: 21 lines, commits dab9962 and 5a6b834).
3. **Checks:** the plan's test command became `npm test && npm run check:visual`; `--check` fails on page errors or a black or blown-out frame (it skips before `main.js` exists). Applied by `kit/guided/guide-tasks.mjs`, which also adds a "Look:" paragraph to each visual task and a Global Constraints line.
4. **The checklist:** `look.md` (`kit/guided/look.md`, `kit/rich/look.md`), what the shots must show, derived from the plan with no new requirement.

The eyes were used: in s4, implementers of tasks 9, 10, 12 and 8 read about 14, 8, 8 and 3 pictures; task 9 enlarged the pupils, task 10 rebuilt the HUD card; in s5, task 9 saw that the head came out as a white blob and climbed to Haiku `xhigh` to fix it. With the plain plan the grade did not move (s4 25.75 against s2 26.0).

### 5.4 The skills (s3)

The owner's installed ECC 2.2.2 (292 skills) plus Ponytail's 6, 298 in all (`notes/skills-installed-s3.txt`), copied into s3's `.claude/skills/` and excluded from git. Branch `exp/frontend-skills` gave the implementer, supervisor and reviewer the `Skill` tool. No instruction to use them (the realistic case).

## 6. Results

### 6.1 Blind grades

A fresh Opus (`--effort high`, every plugin off) per build and round, in a folder holding only that build's nine screenshots renamed with a random letter, plus the bench's facts (checks passed and failed, page errors, foods eaten). Rubric of 40, four criteria of 1 to 10 ("5-6 is a competent, plain build; 7-8 is polished; 9-10 is rare"). Script `kit/harness/judge.mjs`; every grade and key in `results/grades/`. Thirty grades, $6.87.

| Build | Rounds (round:letter=total) | Mean | Graphics | Creativity | Playability | 3D | Finished, not demo |
|---|---|---|---|---|---|---|---|
| s1-sonnet | 1a:C=28, 2:B=29, 3a:G=28, 3b:D=30 | 28.75 | 7.25 | 7.50 | 7.00 | 7.00 | 4/4 |
| oct-normal | 1a:A=28, 2:E=29, 3a:F=28, 3b:G=29 | 28.50 | 7.00 | 7.50 | 7.00 | 7.00 | 4/4 |
| s5-rich | 3a:B=27, 3b:B=27 | 27.00 | 7.00 | 7.00 | 6.00 | 7.00 | 2/2 |
| s7-rich-sonnet | 5a:A=27, 5b:A=27 | 27.00 | 7.00 | 7.00 | 6.00 | 7.00 | 2/2 |
| s2-normal | 1b:C=26, 2:A=26, 3a:A=26, 3b:A=26 | 26.00 | 7.00 | 6.00 | 7.00 | 6.00 | 4/4 |
| s4-guided | 1b:A=26, 2:D=26, 3a:D=25, 3b:F=26 | 25.75 | 6.75 | 6.00 | 7.00 | 6.00 | 4/4 |
| s3-skills | 1b:B=24, 2:F=23, 3a:C=26, 3b:E=26 | 24.75 | 6.50 | 5.75 | 6.75 | 5.75 | 4/4 |
| s6-haiku | 4a:A=22, 4b:A=24 | 23.00 | 6.00 | 5.50 | 6.00 | 5.50 | 2/2 |
| oct-aether | 1a:B=22, 2:C=22, 3a:E=21, 3b:C=22 | 21.75 | 6.00 | 5.00 | 5.75 | 5.00 | 0/4 |

The judge is calibrated against October: the October grader gave 32 and 23 to the two anchors; today's gives 28.5 and 21.75, in the same order. Between rounds a build moves by 1 or 2 points. The rich builds gain in creativity and 3D and lose one point in playability: the judge reads the tiny far snake and the busy background as worse readability.

What the judges said, in short:
- **s5 and s7 (the rich plan):** a strong, cohesive synthwave scene with real depth, good bloom, a food beacon that is easy to spot, eat effects in space, a close-up of the head on game over; held back by a low, wide camera that leaves the snake and food tiny at the far end of a large board, floating shapes and glare competing with the play field, and dim HUD labels.
- **s2, s3, s4 (the plain plan):** a clean neon board that looks finished, but a small snake of plain spheres on a big empty board, a distant camera, a flat scene, a generic theme, dark frames (mean luminance 10 to 17 of 255).
- **s1 (Sonnet alone):** a rich underwater scene ("Abyssal Glow": rocks, seaweed, orbs, a jellyfish as food, a HUD with key hints); the snake is still small.
- **s6 (Haiku alone):** a coherent pastel "cozy low-poly" theme and a tidy HUD; a tiny snake on a huge board, no visible eat effect, a fixed, nearly top-down camera, no post-processing.
- **oct-aether:** too bright to play well.

### 6.2 Bench and exam

| Build | Browser checks | Hidden exam | Page errors | Foods in 40 s | Draw calls | Triangles |
|---|---|---|---|---|---|---|
| s1-sonnet | 13/13 | 25/25 | 0 | 22 | 93 | 60,462 |
| s2-normal | 13/13 | 25/25 | 0 | 22 | 56 | 12,538 |
| s3-skills | 13/13 | 25/25 | 0 | 22 | 55 | 13,506 |
| s4-guided | 13/13 | 25/25 | 0 | 22 | 56 | 13,470 |
| s5-rich | 13/13 | 25/25 | 0 | 22 | 71 | 15,100 |
| s6-haiku | 13/13 | 25/25 | 0 | 24 | 105 | 16,976 |
| s7-rich-sonnet | 13/13 | 25/25 | 0 | 22 | 69 | 14,232 |
| oct-normal | 13/13 | 24/25 | 0 | 22 | 53 | 70,454 |
| oct-aether | 12/13 | 25/25 | 0 | 22 | 38 | 5,818 |

All bench files: `results/bench/`.

### 6.3 The owner's verdicts (he played all of them on his machine, with a high-end GPU)

- **s1-sonnet:** «Sonnet xhigh ni lo puedo ver me apracede todo oscuro y en pantalla negra», then «tenog una tarjeta grafica de alto renidmeinto osea mas bien esta mal programado». His DevTools screenshot shows the HUD and the "Game Over" card over a black canvas: the game logic runs, the 3D scene is not drawn.
- **oct-normal:** «Normal de ocutreb es el mejor pero fue una tarea opus que costo bastante dinero y tiempo … entonces si costo no esta tan jsutificado.»
- **s5-rich:** «Haiku con plan rico es a mi parecer el mejor. Este rsultado me impresiona.»
- **s2-normal:** «aceptable a mi parecer es un resultado mediocre ni sobresaleinte ni malo solo resutlado.»
- **s4-guided:** «Lo mismo solo brillan las orillas pero nada sobresaliente.»
- **s3-skills:** «lo veo exactamente igual pero un poquitito de imput lag … todos los aether son iguales.»
- **oct-aether:** «bastante amibsioso con las iluminaciones pero no son jugables … le tira mas a malo que a mediocre porque las iluminaciones no dejan jugar muy bien esta muy brillante.»
- **s6-haiku:** «esta un poco por encima de las de aether conservador pero bueno y estable resutlaod mediocre no impresionante.»
- **s7 against s5:** «No veo firecnai alguna entre sonnet rico y haiku rico.»

## 7. Cost and time

List prices at OpenRouter's rates for the Anthropic endpoint, the basis of `aether-report` (for s1 and s6, Claude Code's `total_cost_usd`). Per-session breakdowns by model, effort and role: `results/spend/`. Wall clock from `results/sessions/*.timing.json`.

| Build | Design | Build | Total | Wall clock (design + build) |
|---|---|---|---|---|
| s1-sonnet | – | $4.34 | $4.34 | 28.6 min |
| s6-haiku | – | $2.51 (Haiku $1.49; a Sonnet review subagent it started itself, $1.02) | $2.51 | 29.6 min |
| s2-normal | $9.27 | $6.68 | $15.95 | 65.3 + 22.2 min |
| s3-skills | $9.27 | $7.78 | $17.05 | 65.3 + 25.8 min |
| s4-guided | $9.27 | $3.00 (one-pass review, #122) | $12.27 | 65.3 + 30.7 min |
| s5-rich | $11.45 | $10.72 | $22.17 | 56.4 + 68.9 min |
| s7-rich-sonnet | $11.45 | $8.78 (one-pass review, #122) | $20.23 | 56.4 + 45.4 min |
| oct-normal | – | – | $21.95 | 2 h 18 min |
| oct-aether | – | – | $4.17 | 18 min |

Build sessions by role:

| Role | s2 | s3 | s4 | s5 | s7 |
|---|---|---|---|---|---|
| Implementers | $0.20 (Haiku) | $0.48 (Haiku) | $0.69 (Haiku) | $1.48 (Haiku) | $5.55 (Sonnet; includes one Opus attempt) |
| Supervisors (Sonnet) | $0.83 | – | $0.95 | $1.85 | $1.10 |
| Final reviewer (Opus) | $4.91 | – | $0.65 | $6.32 (60 requests, `xhigh`, 6 slices) | $0.99 (9 requests, `high`, one pass) |
| Lead and ops | $0.74 | – | $0.39 | $1.06 | $1.14 |
| Session | $6.68 | $7.78 (Opus 5.30, Sonnet 2.01, Haiku 0.48) | $3.00 | $10.72 | $8.78 |

The design sessions by role: d-design Writer $2.48, Judge $1.33, Examiner $5.01, Lead $0.45; d5-rich Writer $4.69, Judge $1.81, Examiner $4.07, Lead $0.88.

Equal-review comparison of s5 and s7: with s5's full review, s7 would cost about $14.11 against s5's $10.72; with s7's one-pass review, s5 would cost about $5.39 against s7's $8.78. Either way Haiku saves about $3.40, the difference in implementers.

Totals: the experiment's sessions $64.56 and the judge $6.87, $71.43 in all; the Lead's own session $30.31 (Opus $29.58). The run's ceiling of $50 was charged with the five swarm sessions only ($36.96), under the owner's «cuenta abierta ilimitada para pruebas».

## 8. Findings

1. **The art direction is the lever.** s4 and s5 differ only in the plan (and s5 was told to use the branch's bin, an infrastructure fix that does not touch the look): 25.75 to 27, and the owner's favourite. The art direction reached the build through the chain of roles: the Writer turned it into tasks with numbers and tests; Haiku received the design inside each brief and built it; the supervisors and the final reviewer judged against the richer plan (the final review of s5 found the sun hidden behind the floor by draw order).
2. **No system prompt was changed for that gain.** The rich plan came from a document (`art.md`) in the spec's folder and the design session's first prompt ("the owner has approved a richer art direction… have the Writer revise the plan and the tasks to implement it"). The Writer and the Judge ran with their usual prompts. The agent changes (the eyes, the recipes) are what did not move the grade.
3. **The Writer is a translator.** Given only the spec, it invents a modest look; given an art direction, it carries it. Its cost rose with the content ($2.48 to $4.69), not with its thinking. Its one free choice in the rich plan (the 70° view) caused the main remaining critique, so an art direction must also carry readability rules (the hero's share of the frame).
4. **With a good plan the implementer's model does not matter.** s5 and s7: 27 and 27, the same per criterion, the owner sees no difference. Both implementers ran at `high`. Haiku: 12/13 at the first attempt, one effort climb. Sonnet: 12/13 at the first attempt; task 12 (`main.js`) spent its whole ladder (Sonnet `high`, `xhigh`, Opus `high`, 5 attempts) on a contradiction of the plan (its "horizon in frame" test passes only by changing `SUN_WINDOW` in `horizon.js`, owned by task 13) and the Lead adopted the patch by hand (5b96429, `SUN_WINDOW` 0.45 to 0.15). Haiku passed the same task at its first attempt.
5. **Haiku alone and Aether on a plain plan land at the same level** (23 against 24.75 to 26 in blind grading; the owner put Haiku alone slightly above). Haiku alone is the cheapest stable build ($2.51) but plain.
6. **Sonnet alone is rich but not stable on real hardware.** It scored highest blind, and its canvas is black on the owner's GPU. The other builds, with the same `HalfFloatType` render target and 4 MSAA samples, show on his machine; s1 alone asks for `powerPreference: 'high-performance'` and writes many shaders by hand (`onBeforeCompile` and five `ShaderMaterial`s in `src/render/materials.js`). The cause is not confirmed: his console output was not seen. Both the judge and the eyes render without a GPU (SwiftShader), so neither can catch this.
7. **Installed skills reach no agent.** In s3, no implementer, supervisor or final reviewer invoked one of the 298 skills; the only `Skill` call was the Lead loading `aether:swarm`. The agents had the tool and the listing, but the listing showed bare names (`- frontend-patterns`, `- frontend-slides`): the 1 % budget for descriptions cut them. Subagents do not inherit skills; a skill reaches a plugin agent through its `skills:` frontmatter.
8. **No installed skill would have changed the look much.** A read of all of them (a delegate on Haiku `high`, approved after its quotes were checked in the files): none is about games, three.js or WebGL (`motion-advanced` excludes WebGL; `frontend-patterns` mentions three.js only as a lazy-load example). Closest: `frontend-design-direction` (93 lines: purpose, tone, palette before coding; no camera, hero size or luminance target), `gan-style-harness` (a generator-evaluator loop on screenshots; its own text estimates 4 to 6 hours and $125 to 200), `accessibility` (contrast 4.5:1, for the HUD), `make-interfaces-feel-better`, `taste-distillation` (measuring frame brightness), and `taste` (art.md's shape, for music video, prescribing deep blacks, the opposite of what the judge asked). The art direction skill must be written.
9. **The design and Opus dominate the bill.** In s5's $22.17, Opus was $12.20 (the final review $6.32, an Examiner that was not needed $4.07, the Judge $1.81), Sonnet $8.48, Haiku $1.48. In October's normal mode the money went to Sonnet `xhigh` implementers with long contexts (62 %); in s5 to Opus. Same total, different split.
10. **The honest cost of the rich build is higher than counted.** The art direction was written by the Lead with the whole experiment in context: after seeing six builds and the judge's critiques. It is a second pass with feedback, and the rich plan was built on the first design. From zero: the first design $9.27, one plain build and the judge to learn what fails (about $7 to 8), the art direction about $1.50 (about 15 Lead requests at roughly $0.09 each just to re-read a 450,000-token context; `art.md` itself $0.23 for 5,000 output tokens), the rich design $11.45, the rich build $10.72: about $31 to 40.

## 9. What is not clean

- The art direction was not written blind (finding 10). This is the main open point.
- One run per arm; the judge moves 1 to 2 points between rounds; s5, s6 and s7 had two rounds each, the others four.
- The judge and the eyes render without a GPU (finding 6).
- The final review of s4 and s7 was a single light pass because of #122, so their build costs are low and their reviews found less: s7's review found 2 important findings and s5's 4, which says how hard each was looked at, not how many errors each had.
- s3 and s4 compiled with the `aether-plan` on PATH (0.25.0), so their ops ran on Haiku, which reported `exitCode -1` for commands that succeeded and blocked units (3 relaunches in s4; #123).
- s6 was not pure Haiku: it started a read-only review subagent on Sonnet by itself ($1.02) and fixed what it found (pause, best score, framing, antialiasing).
- Parallel Leads shared `/tmp/compile.json` once; each recompiled with `--run` and every repo ran its own swarm (checked). Later prompts keep files under `.aether/`.
- The owner felt input lag in s3; it was not measured.

## 10. Plugin bugs found

- [#122](https://github.com/DarkArty07/aether-plugin/issues/122): after a relaunch, `reviewPlan()`, `reviewSlices()` and `reviewerPrompt()` in `workflows/run.workflow.js` plan the final review from the last launch's `units` only, so it becomes one `high` pass. Seen in s4 (after 3 relaunches) and s7 (after the adoption of task 12 and a relaunch at 03:55).
- [#123](https://github.com/DarkArty07/aether-plugin/issues/123): when the compiled `binDir` is not the mod's own bin, `opsCommand()` in `hooks/register.js` hands each ops command to a model; Haiku ran `aether-wt ladder` correctly and put `"exitCode": -1` in its structured answer, which `opsOnce()` takes as a failure. The PATH held 0.25.0.
- [#124](https://github.com/DarkArty07/aether-plugin/issues/124): the quota brake froze the Lead session for 72 minutes (01:58 to 03:10 UTC) and never armed its resume: `turn.step` (`hooks/register.js:617`) awaits `brakeStep`, which awaits `$.prompt.submit` (line 379), which delivers "once the session is idle"; the session cannot become idle while its own step waits. `armResume` comes after it (line 381). Present on `main` (0.25.1). Fix: `void` the submit with a `.catch`, and arm the resume first.
- [#125](https://github.com/DarkArty07/aether-plugin/issues/125): the art direction finding and proposal.

## 11. What comes next (not decided; the owner will choose)

1. **Write the art direction skill** for visual work (3D and frontend), as the owner proposed. It teaches the author of the plan to write, with numbers: the world beyond the play area; the hero's share of the frame and a readability rule for the background; camera and framing; light, exposure and a luminance band; an effect for each event; a HUD with contrast 4.5:1; a budget; the list of what the screenshots must show. `art.md` and `look.md` in `kit/rich/` are the worked example; the judge's critiques in `results/grades/` are the failure list it must prevent.
2. **Test it clean,** the test that settles the condition: a fresh repo from `base` (3f408dd), the Writer with the skill preloaded (`skills:` in `agents/writer.md` on a branch), the plan written from the spec alone with no art direction from the Lead, the Judge, then the guided swarm on Haiku with the branch's bin (avoiding #123). Grade it blind in two or more rounds with s5 and s7 as anchors, and have the owner play it. It is shown if it reaches about 27 and he places it with s5 and s7. Estimated $20 to 25 and about 2 hours.
3. **Lower the fixed cost** in the same or a second arm: no Examiner when the exam already exists, and the final review on Sonnet, measuring what it stops finding.
4. **Look on a real GPU** before calling a build good, and find why s1 is black on the owner's machine (his DevTools Console output is the missing fact).
5. **Fix #124** (two lines), then #122 and #123.
6. Optional: repeat each arm two or three times to separate signal from the judge's noise.

## 12. How to run it again

Prerequisites: Node 22; Chromium 1243 at `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`; `playwright-core` installed in the harness folder (`cd kit/harness && npm install`, its `package.json` is here); Claude Code with the owner's plugins.

1. **Restore a build:** `git clone bundles/<arm>.bundle <dir>` (each bundle holds the arm's whole history, `main` and, for swarm arms, `feature/snake`; s3's skills were never in git), then `npm ci`. The builds are the tip of `feature/snake` for s2, s3, s4, s5 and s7, and of `main` for s1 and s6. The two designs are `main` of `d-design` and `d5-rich`.
2. **Play:** `node kit/harness/serve.mjs <build dir> 8080`, or `node kit/harness/play-all.mjs` with the experiment folder at `~/.cache/aether-exp-frontend/` (an index on port 8300, builds from 8301).
3. **Bench:** `node kit/harness/evaluate-build.mjs <build dir> <out dir> <label> <port>`. **Exam:** `TASKS_ROOT=<build dir> node --test kit/harness/acceptance-suite.js`. **Judge:** `node kit/harness/judge.mjs <eval dir> <out dir> <round> <label>...` (about $0.23 per grade).
4. **Build an arm:** `kit/prepare-arms.sh`, `prepare-s5.sh` and `prepare-s7.sh` show how each repo was made from the designs; `kit/run-lead.sh <arm dir> <prompt> [<plugin dir>]` runs a headless Aether Lead, `kit/run-plain.sh <arm dir> <prompt> <model> <effort>` a plain session. The guided arms need the plugin of branch `exp/frontend-guided` (`--plugin-dir .worktrees/exp-frontend/plugins/aether`); s7 needs that plugin with `kit/plugin-sonnet-impl/ladder.json` as `config/ladder.json`.

## 13. Where everything is

In this folder (committed on `exp/frontend-guided`):

- `README.md`: this record. `report.html` and `img/`: the visual report and the title and play screenshots of the nine builds.
- `notes/`: the run's diary and brief in Spanish (`diary.es.md`, `brief.es.md`), the bodies of issues #122 to #125, and the list of the 298 skills.
- `designs/`: the spec, plan and tasks of both designs, and the rich `art.md`.
- `kit/`: the scripts, prompts, harness, guided kit, rich kit and the Sonnet ladder.
- `results/`: every blind grade and key (`grades/`), each session's final JSON and timing (`sessions/`), the bench results (`bench/`), the spend by role (`spend/`) and the swarm run reports (`runs/`).
- `bundles/`: the git history of every arm.

Outside git, on this machine only:

- `~/.cache/aether-exp-frontend/`: the working folder with `node_modules`, all screenshots (16 per build), the data directories of every Aether session and the judges' folders. Its deletion awaits the owner's yes.
- `.aether/experiments-2026-10-28-frontend.tar.gz` (152 MB, git-ignored): that folder without `node_modules`.
- `.aether/experiments-2026-10-28-transcripts.tar.gz` (git-ignored): the transcripts of every session of the experiment and of this Lead session. Claude Code deletes transcripts after 30 days by default (`cleanupPeriodDays`), so this archive is their only lasting copy.
- `.aether/autonomy/auto-20261028-155518-67ab/`: the run's diary and brief (copied into `notes/`).
