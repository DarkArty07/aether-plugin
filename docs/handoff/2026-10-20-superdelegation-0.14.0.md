# Handoff: superdelegation, one switch for everything that is not the Lead (0.14.0)

- **Date:** 2026-10-20. It follows [the 0.13.0 handoff](2026-10-19-muse-harness-0.13.0.md).
- **From:** the Lead, Claude Code on Sonnet 5.5 and, for part of the design, Opus 5.5, with a swarm built from [the spec](../../specs/009-superdelegation/spec.md), [the plan](../../specs/009-superdelegation/plan.md) and [its tasks](../../specs/009-superdelegation/tasks.md), and with the branch `fix/bug-issues` that another agent built for the open bug issues.
- **To:** the next session.
- **Repository state:** the branch `feat/superdelegation` holds the whole of 0.14.0 and the bug fixes. The merge to `main`, the tag `aether--v0.14.0` and the push are the owner's, which he asked the Lead to do on 2026-10-20: «continues lo que hacias y lances el release». Section 5 says what was done.

## 1. What was done

| Where | What |
|---|---|
| `config/pairs.json`, `lib/pairs.js`, `lib/superdelegation.js` | The one table of 29 pairs of model and effort, with the Artificial Analysis figures of 2026-10-19, and the one choice function: the points of the reference pair, one point of tolerance, the quota that renews first, then the cheapest per task, dominated pairs dropped, nobody reviews its own work. Muse's pair enters by the owner's decision. |
| `lib/lane-pick.js`, `bin/aether-lane`, `hooks/ops-command.mjs` | `aether-lane pick`, `took` and `pause`, and their forms in the mod's closed list. The `choice` command is gone. |
| `workflows/run.workflow.js` | The swarm asks `pick` for every implementer, supervisor and final review call, waits for a full harness (up to 10 minutes), re-picks without a pair that did not start, runs native from the decision's pair, and logs `took`. The sliced final review goes through the same rule first. |
| `lib/seats.js`, `lib/seat-calls.js`, `workflows/design.workflow.js` | The design seats ask the same function. The Writer's corrections are seat rounds. A native Judge or Examiner after a broken round is not the author's model. |
| `config/lanes.json`, `lib/lanes.js`, `lib/lane-calls.js`, `lib/lane-order.js` | `replaces`, `levels`, `designSeats` and the swarm's own order of candidates leave; `start` gives the harness the effort as it is. The measured caps of agy (8), grok and muse (2). |
| `plugin.json`, `bin/aether-session-start`, `lib/session.js`, `hooks/panel-*.mjs` | The option `superdelegation`, off by default, and the legacy reading of `lanes` and `seats` with a notice. |
| `bin/aether-plan`, `lib/report.js`, `bin/aether-report` | `compile` gives the run its `runArgs`; the report gives, per call, the pair asked, the pair that took it and why. |
| `scripts/lane-cupo.js`, `lib/lane-cupo.js`, `scripts/build-models-index.js`, `scripts/refresh-lanes.js` | The cap ramp, and the models index and refresh reading the pairs table. |
| `README.md`, `docs/`, `site/`, the skills, `CLAUDE.md` | One switch wherever lanes and the profiles were named. A65 in [the decisions](../decisions.md). |
| `fix/bug-issues` | The other agent's fixes, listed in the changelog and in each issue. |
| `specs/009-superdelegation/` | The owner's card, the spec, the plan, the tasks and [the Artificial Analysis evidence](../../specs/009-superdelegation/evidence/README.md). |

## 2. What the owner decided, in his words

- «Una config de superdelegacion. superdelegacion = true false. Si esta activo todo lo que no sea agente lead ira a otros harness. si esta desacticada todo cae a claude code nativo.»
- «usar los modelos de los ahrness adecuados y mas cercanos o proximos a haiku sonnet y opus. Pero no todos los los efforts valen igual.» A call asks for the points of a pair, never for a name.
- «agotar primero las ventanas que se van a renovar a mas proximidad» and «La cuota y el costo»: the quota that renews first, then the cheapest per task. «esta bien dejar fuera lo de la velocidad».
- «apagado por defecto lo de las lanes esta bien».
- «no estare dispnble trabaja autonomamente impelmetnandolo apruebo purbas reales» and «continues lo que hacias y lances el release, si los bugs de los issues fueron resueltos los cierras».

## 3. What was verified

- **The suite:** 1451 tests, all passing with the session's `AETHER_*` variables unset (see section 4 on those).
- **The measured caps, with real calls:** agy took 8 at once and grok and muse 2 (the third came back four to five times slower).
- **A real swarm of three tasks** (Haiku `high`, Sonnet `high`, Sonnet `xhigh`) with superdelegation on and agy, grok and muse enabled: the Haiku implementer ran on agy Gemini 3.8 Flash and all three supervisors on Grok 4.7; both Sonnet implementers were picked on Gemini 4 Argon, which refused for its individual quota, and ran native; the final review ran native. Four of seven calls went to other harnesses. The report named the pair asked, the pair that took each call and the reason.
- **The hidden exam:** 15 tests, 9 pass and 6 fail. All six are defects of the exam, none of the code. Two use the `seat` command with a `--superdelegation` flag it does not take (with the variable set they pass). One forbids the word `balanced` in the legacy notice the plan keeps. One, `c14-gone`, forbids `--seats` where the report's own seats mode stays and `effort === 'max'` where the ladder keeps a declared `max`. One expects retries at the first effort where the ladder runs them at `xhigh`. The last expects every call external, including a final review at Opus `xhigh`, which no external pair reaches.
- **The final review:** the first run of 14 tasks was reviewed in 6 slices (the first use of the slicing of issues 011 and 022): `ready-with-fixes`, 31 findings, the important ones fixed in the tasks that followed and in a fix pass. The last changes were reviewed by the reviewer agents in slices.

## 4. Open

- **The session's own variables.** `AETHER_LANE_HARNESSES=agy,grok` and the others, exported by the session start, make two `aether-plan` tests fail when `npm test` runs inside an Aether session. Run it with them unset: `env -u AETHER_LANE_HARNESSES -u AETHER_LANES -u AETHER_SEATS -u AETHER_IRREVERSIBLE npm test`. One test, `status reads each group's windows`, reads grok's real log and fails on a machine with grok.
- **The first real session** must confirm that Claude Code leaves `CLAUDE_PLUGIN_OPTION_SUPERDELEGATION` empty when the owner never set it; the plan counts it as the first risk.
- **Argon's individual quota** was exhausted during the work (it refuses for about 140 hours), so the Judge and the Examiner ran native. Gemini 3.8 Flash `low` has no cost per task published and does not enter.
- **Proposals, not built:** the final review sliced runs native and one external reviewer per slice would need an id per slice in the call grammar; a short design's `design.md` has no Writer seat; the plan's effort guide by cost per task (Opus `high` beats Sonnet `xhigh` there); the cost per task measured by `aether-report` instead of the Artificial Analysis one.
- **The cost per task** is refreshed by hand from the model pages; `scripts/refresh-lanes.js` refreshes the intelligence only.

## 5. The release

Version 0.14.0 is in the four places the contributing guide names, and `npm run check` was run on the branch. The steps after it, in the order of [Release](../contributing.md#release), are the ones the owner asked for; the Lead records what ran in the diary of the autonomous run `auto-20261020-134953-059c`.
