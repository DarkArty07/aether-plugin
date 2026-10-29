Visual projects need an art direction before the plan: in a nine-build experiment it was the only change that raised the result, and the swarm's implementers then matched Sonnet on Haiku.

## Evidence (experiment of 2026-10-28, the three.js snake of trial 2)

Nine builds of the same spec, each graded blind by a fresh Opus (rubric of 40, two to four rounds) and played by the owner. The seven builds of this experiment pass the 13 browser checks and the 25-case hidden exam; the two October builds pass 12/13 (Aether) and 24/25 (normal mode).

| Build | Blind grade | Cost |
|---|---|---|
| Sonnet xhigh alone (plain Claude Code) | 28.75 | $4.34, but its canvas is black on the owner's GPU |
| October normal mode (Opus controller, Sonnet xhigh implementers) | 28.5 | $21.95 |
| Aether, rich plan, implementers on Haiku | 27.0 | $22.17 (design 11.45, build 10.72) |
| Aether, rich plan, implementers on Sonnet | 27.0 | $20.23 (light final review, #122) |
| Aether 0.25.1 as installed | 26.0 | $15.95 |
| Aether with screenshots, three.js recipes and a visual check | 25.75 | $12.27 (light final review, #122) |
| Aether with 298 ECC and Ponytail skills | 24.75 | $17.05 |
| Haiku xhigh alone | 23.0 | $2.51 |
| October Aether | 21.75 | $4.17 |

- The rich plan differs from the guided build only in its plan: an art direction (`art.md`) with numbers (a world beyond the board, the hero's presence, the camera, exposure and a luminance band, effects per event, the HUD, a budget, what the shots must show) that the Writer turned into four revised tasks and a new one. Its grade rose from 25.75 to 27, and the owner ranked it first.
- With that same plan, Haiku and Sonnet implementers scored 27 and 27, with the same score on every criterion; the owner sees no difference. Implementers cost $1.48 on Haiku and $5.55 on Sonnet, and Sonnet got stuck on a task Haiku passed at once.
- Screenshots, recipes and a visual check (the guided build) fixed visible errors, such as a white blob of a head, but did not raise the grade with the plain plan.
- Installed skills reach no agent: in 298 skills no implementer, supervisor or reviewer invoked one, since the listing showed names only. A read of all of them found none about games, three.js or WebGL, and no art direction with numbers; `frontend-design-direction` asks for purpose, tone and palette but gives no camera, hero size or luminance target.

## Not yet shown

The art direction was written by the Lead after seeing six builds and the judge's critiques, so it is a second pass with feedback. A clean test is needed: a fresh session where the Writer, with an art-direction skill preloaded, writes the plan from the spec alone, and the guided swarm builds it on Haiku.

## Proposal

1. A skill for visual work (3D and frontend) that makes the plan's author write a numbered art direction before the tasks: the scene beyond the play area, the hero's share of the frame, camera and framing, light with a luminance band, an effect for each event, a readable HUD (contrast), a budget, and the list of what the screenshots must show. Preloaded into the Writer (the `skills:` field works for plugin agents in a Lead session) for features whose spec has a visual bar.
2. Keep the screenshot check, and also look on a real GPU: the blind judge and the screenshots run on software rendering, where a build that is black on real hardware passed.
3. Cost: in the rich build, the final review on Opus at `xhigh` ($6.32) and an Examiner the method ran though the hidden exam already existed ($4.07) were nearly half the bill; Haiku was 7 %.
