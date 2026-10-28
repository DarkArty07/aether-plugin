# Handoff: one ladder for the delegates and the swarm, every task on Haiku (spec 019)

- **Date:** 2026-10-28. It follows the handoff of the effort policy (spec 016), which this one replaces; versions 0.22.0 (clean-up before opening the repository) and 0.23.0 (the Muse lane, A96) were released in between and are in the [changelog](../changelog.md).
- **From:** the Lead, Claude Code on Sonnet 5.5, session `58f74f96`.
- **To:** the owner, and the next session.
- **Repository state:** released as 0.24.0 on 2026-10-28, on the owner's word («Si a todo, necesito cerrar ya esta sesion»): `main` was fast-forwarded to the release commit, the tag `aether--v0.24.0` was pushed and the installed plugin was updated. Issue [#102](https://github.com/DarkArty07/aether-plugin/issues/102) is closed. The main checkout holds uncommitted work of the owner (`docs/index.md` and the pages on Artificial Analysis), which was set aside for each fast-forward and put back as it was.

## 1. What was asked

The owner asked that every swarm task start on Haiku for cost («Necesito que todo arranque en haiku por costo. 37 tareas a sonnet son mucho costo»), then asked for one ladder instead of two («Podemos hacer una ladder en lugqar de dos… para no tener que maneter otra funcion y hacer mas simple el codigo sin perder funcionlidad») and for the cheap model to be made good by its supervisor («un modelo barato se hace bueno gracias a un buen supervisor»). He approved a short design («Adleantre aprobado») after a controlled test, run first because the Lead's earlier comparison was confounded (its «after» ran on Gemini, Grok and Muse, not on Claude Haiku).

## 2. What was built

[The design](../../specs/019-swarm-one-ladder/design.md) holds the decisions (D1 to D10); [the spec](../../specs/019-swarm-one-ladder/spec.md), [the plan](../../specs/019-swarm-one-ladder/plan.md) and [the tasks](../../specs/019-swarm-one-ladder/tasks.md) follow it. Decision [A97](../decisions.md).

- **One ladder.** The swarm asks `lib/ladder.js` through `aether-wt ladder` (`lib/wt-ladder.js`), and the swarm's own policy (`nextTier`, `effortFor`, the outlook and the used counters) is gone from `workflows/run.workflow.js`. The state of each unit is on disk, `<runDir>/ladder/<task>.json`, and a relaunch continues it. The verdict reaches the verb as data in a payload file whose path the mod derives, never on the command line.
- **Every unit starts on Haiku `high`.** `aether-plan` reads `Tier` and `Ladder`, ignores them and warns; a plan without them is valid. The final review rises to Opus `xhigh` when a merged unit has `Review: xhigh` or `max`.
- **An automatic gate before each supervisor** (`aether-wt gate`, `lib/wt-gate.js`): the files changed against `Owns` and the plan's test command, without a model, with the run's baseline. A failed gate goes back to the implementer as a correction and costs no supervisor. The mod admits the exact forms of both verbs (`hooks/ops-command.mjs`).
- **The report counts the ladder** (`quality.ladder`: first tries, corrections, rises by cause, gate rejections, filled retries; `null` for a result written before 0.24.0).
- **Added after the design, by the Lead, for the owner to undo:** a relaunch that names a unit whose ladder is spent gives it a new one and keeps the old state as `<task>.spent-N.json` (`resetSpent` in `lib/wt-ladder.js`, called by `aether-plan compile --run`); at most two gates run at once; the second try of a supervisor runs native, because a lane call id is one per attempt; the supervisor reads the last 25 lines of the tests, not the whole output.

## 3. How it was checked

- `npm run check`: 2297 tests, the mod's 109 tests and the `--strict` validation of the plugin and the marketplace, all passing.
- The hidden exam (13 tests, written by an Examiner): 13 of 13. It first failed 3, and each was a real defect fixed in the code (`quality.ladder` must be `null`, not hidden; the correction must carry `<file>: <what>`; the supervisor's evidence must read a pass whatever shape the gate gives its checks).
- The final review (Opus `high`, 7 slices): `ready-with-fixes`, no critical finding and four important ones, all fixed with a test: the gate put up to 200 KB of test output in every supervisor prompt, a unit with a spent ladder could never be relaunched, a supervisor retry reused the lane call of its attempt, and the gates ran in parallel without limit.
- The build ran on the 0.22.0 swarm with lanes (mostly agy, Gemini Flash) and took about five hours. 6 of 9 units merged; tasks 3, 5 and 8 were blocked for reasons of the plan, not of the models (the spec held the owner's home folder, so a test R23 failed on the base; two tests and `docs/index.md` were in no task's `Owns`). The Lead applied their patches, fixed those files and adopted the units; the plan was corrected and a short design round of the Judge approved it. This is the case of issue [#92](https://github.com/DarkArty07/aether-plugin/issues/92) again.

## 4. What was measured

Both tests use a plan written for the purpose (a Three.js snake game and a SQL-like query engine), Claude only (no lanes), a hidden acceptance suite and `aether-report --run`. One run each; the cost is at list price.

| Test | Run | Claude | Time | Hidden suite | Climbs |
|---|---|---|---|---|---|
| Snake, 10 tasks (2026-10-27/28) | mixed tiers, 0.22.0 | US$ 3.60 | 7.6 min | 17 of 17 | 0 |
| | all on Haiku, 0.22.0 | US$ 2.96 | 10.2 min | 17 of 17 | 0 |
| | new swarm, 0.24.0 | US$ 2.62 | 10.4 min | 17 of 17 | 0 |
| tinyql, 16 tasks (2026-10-28) | tiers of the plan, 0.23.0 | US$ 5.58 | 10.9 min | 40 of 40 cases | 0 |
| | all on Haiku, 0.24.0 | US$ 4.81 | 17.1 min | 40 of 40 cases | 1 (a stale SHA in a report) |

- **Money.** The implementers fall by two thirds or more (US$ 0.62 to 0.12 on the snake, 0.68 to 0.23 on tinyql), but the Opus final review and the Sonnet supervisors are a fixed cost of three quarters or more of these bills, so the total falls only 14 % on the longer plan. The 11 % against the all-Haiku run of the snake is mostly the Lead's own cost in a single run: do not claim it.
- **Time.** It does not improve: Haiku writes more per task on the integration tasks, which are on the critical path (+57 % on tinyql, +37 % against the mixed snake plan). The two tinyql runs ran at the same time on one machine.
- **Quality.** The same in what could be measured: both tinyql runs pass the whole exam and get `ready-with-fixes` with no critical finding and two important ones (24 and 28 minor); the defects are of the same kind (cases the spec leaves open), and two of them (nested JSON printed as `[object Object]`, a `LEFT JOIN` against an empty table) are in both runs. The statement parser, planned on Sonnet, was built by Haiku and passes the exam. The final reviewers have no shell and judge by reading; the code of the runs was not kept, so no line-by-line comparison was made.
- **Not shown by any live run:** the ladder rising for quality and the gate rejecting an attempt (the Writer gives the tests in full, so Haiku passed 15 of 16 tasks the first time), and the new swarm with `superdelegation` on. They are covered by tests and the exam only. A plan with vague tasks would show them.
- **The agent count.** The harness counts the `ops` agents (the commands the mod answers without a model); `maxAgents` does not (`modelAgentsSpent`). The new swarm launches about 50 more `ops` agents on a 16-task plan, with no model cost.

## 5. What is open

- **Where the money still is: the final review.** It is 60 to 70 % of the bill in both tinyql runs. Lowering it to Sonnet was left out of spec 019 on purpose; it is the next experiment if cost matters more than time.
- **Polish, issues filed:** [#109](https://github.com/DarkArty07/aether-plugin/issues/109) (`firstTry` counts a salvaged attempt and a merge-conflict retry; stale reasons in `reviewPlan`; an unused parameter; unused exports of `plan.js`), [#110](https://github.com/DarkArty07/aether-plugin/issues/110) (a Haiku implementer often ends without its report because `concerns` and `question` are required: 2 of 10 on the snake, 1 of 16 on tinyql with the old swarm), [#111](https://github.com/DarkArty07/aether-plugin/issues/111) (`aether-plan compile --run` after a relaunch offers again the units of the first launch) and [#112](https://github.com/DarkArty07/aether-plugin/issues/112) (a gate cut by time twice in a row counts as a repeated finding and raises the model). The evidence of the blocked units is on [#92](https://github.com/DarkArty07/aether-plugin/issues/92). Older and still open: [#98](https://github.com/DarkArty07/aether-plugin/issues/98), [#99](https://github.com/DarkArty07/aether-plugin/issues/99), [#80](https://github.com/DarkArty07/aether-plugin/issues/80) and [#81](https://github.com/DarkArty07/aether-plugin/issues/81).
- **Unexplained:** `aether-report --run` gave no cost for the build run (`cost` null); the session's spend (`aether-report --spend --session 58f74f96-725b-4399-932c-fc20eb13ffe0`) was US$ 114 at list price that day, of which US$ 66 were calls to other harnesses (mostly Muse, for the lane work of 0.23.0), so it is not the cost of this change.
- **Proposals not worked:** Opus `medium` for the supervisor with a cheapest-pair choice at any effort; Sonnet `max` as the last rung of the hardest tasks; keep, per attempt, what each supervisor approved or rejected; a plan check that warns when a task's `Owns` leaves out the tests and the pinned documents of the files it changes (issue 92).
- **Undo.** The change is undone if the report shows more than half of the units leaving Haiku, or the final review finding more than before ([the design](../../specs/019-swarm-one-ladder/design.md), "undo criteria"); the numbers are in `quality.ladder` and in `runs.jsonl`.

## 6. How to test a branch's swarm in a real session

Run a headless Lead with the branch's plugin on a throwaway repository, with its own data directory so two runs do not mix their usage:

    AETHER_DATA_DIR=<dir> CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 scripts/aether-lead --plugin-dir <worktree>/plugins/aether -p "$(cat prompt.md)" --output-format json

The prompt names the integration worktree, tells the Lead to compile the plan with the branch's `aether-plan` by full path and `--no-lanes`, to launch `aether:run` with the JSON unchanged, to save the result, to run the branch's `aether-report --run` and to touch nothing else. It worked at the first try (snake, 10 min, US$ 3 of Claude with the Lead). The hidden exam is stored with `aether-exam store <feature> --from .aether-exam` and run with the PATH `aether-exam run <feature> --ref <branch>` (the branch's own bin looks in another data directory).

## 7. Release (done)

Version 0.24.0: the version in its four places, the changelog entry as the first `Version` line, the roadmap's Now line and the decision's number (A97), with the tests that pin them (`docs-facts` R12 and R15, `launcher`, `swarm-ladder-docs`); `npm run check`; the fast-forward of `main`; the tag with `claude plugin tag plugins/aether`; the push of `main` and the tag; and `claude plugin update aether@aether-plugin`. The Lead recorded a session grant for each irreversible class, each in its own call, and revoked them afterwards. The experiment worktrees were removed and their evidence (plans, hidden suites, reference solution, reports) was archived outside the repository, in `.aether/experiments-2026-10-28.tar.gz`, which is local and ignored by git.
