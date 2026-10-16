# Handoff: the delegate router designed, built, reviewed and released as 0.12.0

- **Date:** 2026-10-16. It follows [the theme handoff](2026-10-16-aether-theme.md) and [the 0.11.0 handoff](2026-10-15-aether-design-0.11.0.md).
- **From:** the Lead, Claude Code on Sonnet 5.5 at `xhigh`, in an Aether session on 0.11.0. The owner asked for «que decida que modelos usa el sistema en cada rol, posición o tarea», confirmed the intent card, and then went to sleep granting the run: «autorizo todas las accioens irreverisbles de github en esta sesion, push, merge, deploy, lo que tenga que ser». Autonomous run `auto-20261016-001558-1884` (8 hours and US$ 50 by default). Aether's own agents ran on their definitions; delegate tasks ran on Sonnet and one on Opus.
- **To:** the next session.
- **Repository state:**
  - `feat/006-delegate-router` holds spec 006's design, the build, the fixes of the reviews and the 0.12.0 bump. It reached `main` through its pull request, and the tag is `aether--v0.12.0`.
  - Its checks at the last commit: `npm test` 1172 of 1172, `npm run test:mod` 35 of 35, `npm run validate` passed for the plugin and the marketplace, and spec 006's hidden exam 15 of 15 (see §2 for the three exam tests that had to be corrected).
- **Installed plugin:** 0.11.0 until `claude plugin update aether@aether-plugin` runs (§5).

## 1. What was done

| What | Detail |
|---|---|
| **Spec 006's design** | Intent card, spec (approved by the Judge after three rounds), plan and tasks (approved at the second review): `specs/006-delegate-router/`. The evidence (engine probes, a replay of 232 real delegations, Jev measurements) is in `specs/006-delegate-router/evidence/`. |
| **The build by the swarm** | Run `20261016-004736-6046`, two launches: 13 of 15 tasks merged by it (launch one: 1, 2, 3, 4, 6, 7, 9, 13, 14; launch two: 5, 8, 10, 15). Task 5 blocked on a plan defect (its own test and `tests/session-start.test.js:258` contradicted each other); task 11 blocked on another (a 22-minute limit above the engine's 10-minute cap on `$.process.run`); task 12 was skipped behind them. The Lead fixed the plan for task 5 (the Judge approved the change in one round), adopted task 11 from its saved patch, and gave task 12 to a delegate. |
| **Reviews and fixes** | The first final review ended at the reviewer's 30 turns; the second, run in five slices, said not-ready (2 critical, 10 important, 24 minor). Six delegate tasks fixed it (the external delegate's limit, the report of a failed external delegate, a grok delegate test, grok's quota reading after a background renewal, the replay's counts and its bare Haiku call, the `spawn` entry the plan never assigned, the guide). A second review in four slices found 8 more important findings, all in `command` mode or in the replay, fixed by four more delegate tasks. The last review said ready, with three minor findings. |
| **The release** | 0.12.0 in `plugin.json`, the launcher test, the README and the changelog; decision A55; the roadmap; issues 022 and 023. |

The feature: before the Lead launches a delegate task, a router decides its model, effort and, for read-only work, its harness (agy or Grok), with Haiku at low effort or `typesafe/jev-1.14` as the decider. `record` is the default mode: it decides in the background and changes nothing. Read [the guide](../guide/router.md) first.

Cost at list prices: US$ 28.19 for the swarm run's window (which includes the Lead's own turns, the Examiner and the Judge in that window), and US$ 92.60 for the whole session, design included: the Lead US$ 34, the Writer 10, the Judge 9, the Examiner 4, the swarm's implementers and supervisors 12, the reviewers 16 and the delegate tasks 8. The plan's session limit stopped the session from 02:20 to 04:50.

## 2. Found in this session

- [Issue 021](../issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md): agy refuses with «Individual quota reached» while `/usage` shows balance; the router recognizes it, the swarm and the seats do not.
- [Issue 022](../issues/022-judge-and-final-reviewer-stop-at-30-turns-on-a-large-document-or-diff.md): the Judge and the final reviewer stop at 30 turns on a large plan or diff. Reviewers in slices with a turn budget (US$ 1.2 to 1.6 each) fixed it for this run, by patching the session's copy of the workflow script; the plugin's scripts are unchanged.
- [Issue 023](../issues/023-examiner-tests-wrong-in-three-places-and-one-could-never-fail.md): three of the Examiner's tests were wrong, and one could never fail (a nested `node --test` inherits `NODE_TEST_CONTEXT` and exits 0).
- **The replay and the evidence counted each request about 2.2 times** (once per transcript line), so the dollar figures of the evidence are about 1.8 times too high; measured on 269 real transcripts, US$ 974.82 counted so against US$ 550.24 counted once. The ratios probably hold. The evidence README and the guide carry the correction.
- **The plan left gaps the swarm could not close alone:** the 22-minute limit, a `spawn` journal entry that nothing wrote (so the report could not price a delegation), a grok quota reading that the background renewal never saved, and a test of `session-start` that the router file broke.
- **Slices beat one reviewer:** the five-slice final review gave 36 findings where the single reviewer ended without a verdict. The Opus reviewers were the largest cost after the Lead.

## 3. What is left

- **Not verified:** the router in a real session, `command` above all. The engine was probed with the fake model only: parallel launches, `isolation: "worktree"`, the directory in which `$.process.run` starts the delegate's command, and a real Haiku or Jev answer are unmeasured. The order `tool.call`, `agent.spawn` was checked with the probe in the foreground and with `run_in_background`, not with a real model. The paid Haiku replay was never run (it is the owner's call; its flags were checked only against `claude --help` and a stub).
- **Minor findings, deferred:** 24 of the first sliced review, 44 of the supervisors, and the minors of the later reviews and of the last check (the replay counts an incoherent answer as a fallback where the router counts a decision; a few `node` forms with valued options pass the `paid-call` pattern; the renewal lock can race on an old lock and has no backoff after a failed renewal; the mod's input files and the external files are not always removed). Their titles are in `.aether/autonomy/auto-20261016-001558-1884/menores-diferidos.md` (local, not in git).
- **The Proposals of spec 006:** a second layer for the guard, a lint for plans, graders, a record of the decider's hits, an agy reading with the individual limit, and the swarm and the seats recognizing agy's refusal. None is built.

## 4. What waits for the owner

- **Use `record` for a while,** read `aether-report --delegates` and `aether-route replay --journal`, then move to `advise` and `command` when the decisions are right. The paid replay is `aether-route replay --projects <dir> --decider haiku --paid --answers …` as the [guide](../guide/router.md) says; the guard now treats it as a `paid-call`.
- **Decisions:** whether the router should order quota by A49 (balance per hour) instead of the weekly window that renews first, as built; whether the 14 regression briefs should be real ones; whether the swarm and the seats should recognize agy's refusal; whether to add an `off` mode.
- **The OpenRouter key** pasted in the chat of this session should be rotated. It was never written to a file of the repository.
- **Leftovers:** the local worktrees `.worktrees/006-fix-*` and the branches `fix/006-*` and `feat/006-delegate-router`, and the local branch `design/006-delegate-router`. They are merged; delete them when you want. Issues 021 to 023 are not filed on GitHub.

## 5. How to run things

As in [the previous handoff](2026-10-15-aether-design-0.11.0.md) §5. To move the installed plugin to 0.12.0, run `claude plugin marketplace update aether-plugin`, then `claude plugin update aether@aether-plugin`, then start a new session with `aether-lead`. To go back, install the tag `aether--v0.11.0`. The options of the router are `router`, `decider`, `fallback` and `deadlines`, in [Options](../guide/options.md#options).
