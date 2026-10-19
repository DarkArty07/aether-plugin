# Handoff: Muse Code is the fifth lane harness (0.13.0)

- **Date:** 2026-10-19. It follows [the 0.12.5 handoff](2026-10-19-lanes-marks-lead-max-0.12.5.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, with a swarm of 14 tasks planned in [the plan](../../specs/008-muse-harness/plan.md) and [its tasks](../../specs/008-muse-harness/tasks.md). This page is written by task 14, before the Lead's own steps; the Lead corrects section 3 when it closes them.
- **To:** the next session.
- **Repository state:** the work is on the branch `feat/muse-harness`. Nothing is merged to `main`, pushed, tagged or published, and the owner's installed plugin stays at 0.12.5 until they run `claude plugin update aether@aether-plugin`. The tag is `aether--v0.13.0`, made on `main` after the merge.

## 1. What was done

| Where | What |
|---|---|
| `lib/harness/muse.js`, `lib/harness/index.js`, `tests/fixtures/fake-muse.js` | The adapter for `muse exec --json` and the registry's fifth name. The command line keeps the sandbox on, contributor mode off and no foreign personal context; `parse` reads the JSONL records and gives a clean answer, the object a role asked for, or the reason of the failure, plus the usage. A simulated `muse` runs every test: nothing in the repository calls Muse. |
| `config/lanes.json`, `plugin.json`, `docs/guide/options.md` | The `muse` entry of the table (`maxParallel` 1, no models) and the `harnesses` option naming it. |
| `lib/lane-calls.js`, `lib/lane-marks.js` | Two small changes for the quota by observation: `runCall` parses before it reads the quota after the call, and `liftable` ignores a reading older than the mark. |
| `hooks/panel-view.mjs`, `hooks/panel-layout.mjs`, `tests/fixtures/panel/` | Muse in the panel's data and view, in the same change as the registry because the conformance test compares both lists. |
| `config/models/profiles.json`, `config/prices.json`, `scripts/build-models-index.js` | The profiles and prices of `muse-spark-1.3`, `muse-wonder-1.0` and `muse-wonder-full-1.0`, and the name `muse` in the index script (not yet in its default list). |
| `tests/harness-muse.test.js`, `tests/muse-lane.test.js`, `tests/lane-models.test.js`, `tests/muse-profiles.test.js`, `tests/muse-prices.test.js`, `tests/harness-lists.test.js` | The adapter, each failure shape end to end with the real runner, the three rules for a model, the profiles and prices, and the test that fails when a fixed list of harnesses leaves Muse out. |
| `README.md`, `CLAUDE.md`, `docs/`, the skills `using-aether` and `swarm`, `site/` | Muse wherever the other harnesses are named, in English, and in Spanish and English on the site. |
| `docs/decisions.md` (A63), `docs/index.md` | The decision, and the range `A1–A63`. |
| `plugin.json`, `README.md`, `docs/changelog.md`, `docs/roadmap.md` | The version 0.13.0 and the changelog entry that links this page (task 10). |

## 2. What the owner decided, in their words

- «la siguiente update se viene algo grande. va a ser la 0.13.0 y vamos a incluir un nuevo harness, vamos a incluir a muse code».
- «neceistamos usar muse code trbaja autonomamente»: the Lead plans and builds it without asking.
- «siempre con fallback hacia nosotros» and «que me lo tengas que preguntar es una falla de diseño»: every failure of a Muse call runs on the native agent, with no question. This is A63.

## 3. Open

The steps below are the Lead's (L1 to L4 of the plan, D13). The swarm does not have the `paid-call` grant and does not call Muse.

- **L1, the first real call.** Run `aether-autonomy check paid-call`. With `covered: true`, run `node scripts/lane-smoke.js muse muse-spark-1.3 --effort low`; the table has no Muse models, so the model goes explicit. Without the grant, the exact command goes to «Espera tu sí» and L2 stays pending.
- **L2, the record of that call.** Save it in `specs/008-muse-harness/evidence/`: command, answer, usage, and the real shape of `allowance`, of the failure object and of the tools in `--json`. If the shape differs from the assumed one, fix `muse.js` and its tests to follow the real one.
- **L3, the listing, prices and models.** Capture `model/list` of `muse serve` (no cost), check the prices against Meta's pages, and, with `ARTIFICIAL_ANALYSIS_API_KEY`, add the measured models to `config/lanes.json`, regenerate the index (`node scripts/build-models-index.js --harnesses claude,agy,grok,muse --write`) and add `muse` to `DEFAULT_HARNESSES`. Without the key the table stays without Muse models.
- **L4, the close.** Run `npm run check`, check the four places of the version, and leave the report. The merge, the push, the tag and `claude plugin update` are the owner's.

What was not measured, and is assumed from the MSP schema (spec R27):

- The real shape of `allowance` in `run.usage` and of the object in `run.terminal.failed`. Until then the quota of Muse is unknown unless a call brought a readable `allowance`.
- Whether `--output-schema` takes the schemas of the roles. If not, every structured call fails with `exit 2` and runs on the native agent, and the fix is `schemaInPrompt = true` in the adapter.
- The largest prompt a positional argument holds, whether the sandbox starts under WSL2, and whether the subscription covers `muse exec`. Each failure is a failure of the call, never a question.
- Whether two `muse exec` in different worktrees live with the shared SQLite index; `maxParallel` is 1 until it is seen.
- The prices come from a web summary, not from the pages.

The proposals the plan did not build are in its `Proposals` section; the first is to read Muse's quota before the first call with `muse serve`.

## 4. How to continue

- Read A63 in [the decisions](../decisions.md) and the spec's criteria C1 to C9.
- Do the steps of section 3 in order, and write what was measured in `evidence/` before changing the adapter.
- When a model enters the table, it passes `tests/lane-models.test.js`: it must be listed by the CLI, be the newest of its line, have a profile, and have `replaces` and `aa` in the table. A `-contributor` model never enters.
