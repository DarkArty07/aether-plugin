---
name: swarm
description: Use in Aether mode to run an approved plan that has Aether fields as a parallel swarm with /aether:run, to act on a run's result, or to relaunch a run's blocked, skipped or pending tasks.
---

# Running the swarm

The swarm runs a plan's tasks as units. The swarm starts every unit on the first rung of `config/ladder.json` and raises it by the same policy as the delegates. The supervisor of each step runs on Sonnet `high` (rungs 1 and 2), Opus `high` (3) and Opus `xhigh` (4 and 5), calculated by the system so that the supervisor is never weaker than the author. Each unit:
- gets its own worktree, and works on its model and effort;
- is supervised after every attempt;
- is merged into the integration branch, one merge at a time.

The whole run is reviewed once, as one change, when a launch ends with all its units merged. A launch that leaves a unit unmerged defers that review, and a relaunch reviews only when it is the launch that finishes the run. You prepare the run, launch it, and act on its result. You stay the Lead: the run's agents decide inside their unit, the Judge rules on the design, and you decide everything else, as the owner's delegate.

In an autonomous run (see the `aether:autonomous-runs` skill), what this skill says to tell or report to the owner goes to the run's diary, and from there to the brief.

## 1. Prepare

- **The plan.** It is approved, by you as the owner's delegate or by the owner; every task has Aether fields; and `aether-plan check <plan.md>` passes, where `<plan.md>`, here and below, is the feature's `tasks.md`. Before compiling and launching, each `aether-plan check` warning that a task changes a file but not the tests that exercise it is blocking: put those tests in that task's Owns (the Lead may edit `tasks.md`, or have the Writer do it) or write in the diary why the test does not pin the change, then compile.
- **The integration worktree.**
  - Create it with `git worktree add <path> -b <feature branch>`, on a feature branch. Never run the swarm on `main`. `aether-plan compile` has an `--allow-main` flag for when the owner explicitly asks to compile on `main`.
  - Keep it separate from the main checkout. The unit worktrees live under the main checkout's `.aether/worktrees/`, and a test command that searches the whole tree would run their unfinished tests at merge time. `aether-plan compile` warns when the two are the same.
  - Commit the plan there, and leave the worktree clean. A merge refuses to start while the integration worktree has uncommitted changes.
- **Permissions.** The run's agents use Bash (`git`, `aether-wt`, `aether-lane` and the test command) and edit files under `.aether/worktrees/`. A session that asks permission for each call stalls the swarm, and an autonomous run waits at the first prompt.
  - Check that the permission mode or allow rules cover these calls, and tell the owner what you rely on.
  - The unit worktrees are under the main checkout. If this session started inside the integration worktree, add the main checkout with `/add-dir <repoRoot>`, so the agents may read and edit there.
- **Workflows.** The run is a dynamic workflow. When this session has no `Workflow` tool, workflows are off: tell the owner as "Tools" in `using-aether` says, wait for the owner's answer, and only if the owner asks for it build the plan task by task with delegates.
- **Lanes.** When the owner turned on the plugin's `superdelegation` option, on Linux, the run sends every call that is not the Lead's to the external harnesses that the `harnesses` option enables (agy, codex, grok, cursor and muse; agy is the default), when the harness's CLI is installed and while its quota lasts. A call asks for the intelligence points of the Claude pair (model and effort) it would run on natively and takes a pair that reaches them minus 1 point, in the quota order of the `using-aether` Models section. `${CLAUDE_PLUGIN_ROOT}/config/pairs.json` lists the pairs, Muse's among them by the owner's decisions, and `${CLAUDE_PLUGIN_ROOT}/config/lanes.json` each harness's models. These CLIs run without permission prompts (agy with `--dangerously-skip-permissions`) in the unit's transactional worktree, with the owner's git, GitHub, registry and cloud credentials kept out of their environment. Otherwise every call is native, and `aether-plan compile` says why on stderr; it also names each enabled harness that takes no call, and why. `aether-plan compile <plan.md> --no-lanes` runs everything native. `aether-lane quota` shows the readings, and `aether-lane status <runId>` the quota of each group and the dry marks. A call whose chosen pair is unavailable or fails asks again without that pair, on any harness, Muse and Codex included, and without asking the owner; the native agent takes it when no pair is left or three pairs have failed.

Codex's quota is read without a model call.

## 2. Compile

From the integration worktree:

    ${CLAUDE_PLUGIN_ROOT}/bin/aether-plan compile <plan.md>

Call it by this absolute path because the `aether-plan` on PATH may be an older release.

It prints one line of JSON: the run's arguments. Warnings go to stderr. Keep the `runId`; every later command needs it.

Compile also runs the plan's test command once, in the integration worktree, and keeps the failing tests it names as the run's baseline (`baseline.json` in the run's folder). From then on a merge is blocked only by a failure that is not in the baseline, and a merge that passes with known failures lists them as `knownFailures`. Give the Bash call a timeout that fits the test command. A relaunch keeps the baseline it has. `--no-baseline` skips it, and then any failing test blocks a merge.

## 3. Launch

In an autonomous run, `aether-plan compile` refuses a launch when the run is stopped or paused. Start nothing new and act as the `aether:autonomous-runs` skill says: for `time` or `cost`, let running work finish or save it as patches, finish any merge, then run `aether-autonomy end --outcome ceiling` and give the brief. For `quota`, follow its quota brake: stop running work, run `aether-autonomy quota-brake`, wait for the reset and leave the run open. Use `aether-autonomy end` only for a `time` or `cost` stop or to close an old run another session left open.

Run the `aether:run` workflow with that JSON as its args, unchanged. The run works in the background, and the progress view shows its phases.

In a headless session (`claude -p`), Claude Code stops background work 10 minutes after the last turn, and that includes the run. Start such a session with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, which waits for the run however long it takes.

When launching the swarm, leave ${CLAUDE_PLUGIN_ROOT}/bin/`aether-wt watch <runId>` in the background (`run_in_background`), from the integration worktree, with the absolute path of the plugin's bin; it ends when a unit gets stuck, when the run finishes (saying whether anything got stuck) or with `sin señal de la corrida` (relaunch the watch if the run is still alive).

While it runs:
- do not edit the integration worktree;
- do not run `aether-wt` commands for this run, except `watch`, `deliver` and `decline` (below).

## 4. Read the result

The workflow returns:
- **`units`:** one entry per task, with:
  - `status`: `merged`, `blocked`, `skipped` or `not-run`;
  - `fixedByLead`: `{ commit, reason }`, when the unit was fixed on the fly by the Lead;
  - `ladder`: the unit's ladder block (`units[].ladder`), `{ steps, firstTry, rises: { failed, infeasible }, gateRejections, filled }`. `steps` lists the ladder rungs traversed; `firstTry` is merged with no earlier attempt, no rise and no gate rejection; `rises` counts rises by cause (`failed` rejected attempts or `infeasible` ruling); `gateRejections` counts attempts the no-model gate returned to the implementer; and `filled` counts synthetic findings the workflow added;
  - `tiers`: the rungs it ran on, each a model and an effort, such as `["haiku high", "haiku xhigh", "sonnet high"]`. A higher effort on the same model is a climb; another model is an escalation;
  - `rounds`: each attempt, with its rung (`tier`), the implementer's report, the supervisor's verdict, findings, ruling and effort (`reviewEffort`), and the merge outcome;
  - `split` and `subAttempts` on a round whose attempt was a split pass: the attempt before ended without its report and the task had at least two owned files, so the pass ran one sub-attempt per file (eight at most; further files share the last). The round's report combines those sub-attempts. `aether-report` names the pass;
  - `salvaged` in each round: true when the implementer ended without its report and the workflow rebuilt it from the unit branch (`aether-wt salvage` commits what the task owns). The supervisor reviewed that work as an unverified claim; its tests were not reported, so they run at the merge. A split pass is not salvaged: one sub-attempt without a report counts the pass as a missing report;
  - `provider` and `reviewProvider` in each round: `native`, or `<harness> <model>`, such as `agy gemini-3.8-flash`, for the lane that ran the attempt and its review. `laneFailure`: set when a lane began the attempt and another agent finished it (the last failure; the next pair is tried before the native agent), with the harness, the model and the reason;
  - `failures`: the failed attempts in order, `no report` or the blocking findings of a retry or an escalation;
  - `commit`, `reason`, `question` and `patch`;
  - `closeError`, when the unit could not be closed. The final sweep saves its work as a patch and removes its worktree, and keeps its branch when that work is not integrated.
- **`finalReview`:** a `status` of `done`, `skipped`, `failed` or `deferred`. When it is done, it also has the `verdict`, `findings`, `declined` and `summary`. A `failed` review has a `reason`: the reviewer ended without its answer, which may be a diff too large for its turns, or it failed with an error's text. That is never a verdict. A `deferred` review did not run: `deferred` is not a failure and not a verdict, and its `reason` says how many units are blocked, skipped or not run (see "Final review deferred" in §5). `reviewModel` and `reviewEffort` say what a review that ran was run on, which follows the run's risk: Opus at `xhigh` when a merged unit has `Review: xhigh` or `max`; Sonnet at `high` when one to three units merged and all review at `high`, never on a relaunch; and Opus at `high` otherwise.
- **`cleanup`:** what the sweep removed. Its `remaining` lists are empty when every unit is integrated. A branch whose work is not integrated stays in `remaining.branches` and in `retainedBranches`, with its patch, and `finished: false` says the run directory stays too: integrate or adopt that work, and the next sweep clears it.
- **`agents`:** the agent count, by role and by model.
- **`lanes`:** `{ calls, ok, failed, quota, violation, blocked, unavailable }`. It is null when the run had no lanes.
- **`error`:** set only when the script itself failed.

Save the result as `<runDir>/result.json`, then run `aether-report --run <runId>` from the integration worktree. It prints JSON:
- **`speed`:** the run's window, from compile to the saved result, and the swarm's own span;
- **`cost`:** USD at OpenRouter prices, from the usage meter:
  - by model, and by role;
  - `byEffort`: by role, model and effort, with the output tokens and the model time of each;
  - `agents`, in `cost.run`: each agent of the run, with its label, model, effort, cost and time;
- **`quality`:** the units merged, adopted (see §5), climbed, escalated and blocked, `integrated` (merged and adopted), every finding by severity, the final review, and the test command's result on the integration branch. Each adopted unit is also a line in `notes`.
- **`lanes`:** each group's calls, tokens, dollars and quota consumed per window, its `balance` (the share left of each window at the start and the end of the run, and the next reset; `usedPercentAbsent` when a share was read as 0% used), what every call chose (`run.choices`), by model, by role and by harness (`byHarness`), and `totals`: native dollars, lane dollars and the share the plans covered.
- **`radar`:** the figures of the owner's five goals: `rapid` (the run's time, attempts, climbs and escalations), `autonomous` (questions that reached the owner), `delegation` (lane calls, by harness, and the share the plans covered), `affordable` (dollars) and `robust` (merged, blocked, tests, findings and the final verdict). A figure that was not measured is null.

In an autonomous run you record nothing after a launch: `aether-autonomy status` reads the cost of each swarm launch by itself, finished or stopped.

Report from it:
- the units merged, climbed, escalated and blocked;
- the final verdict, or, when the review is `deferred`, that it has not run and its reason; and the tests;
- the time and the cost by model, and the implementers' and supervisors' cost and time by effort;
- the RADAR figures, one line per goal;
- the lanes, in these lines, one block per harness that ran:

      Lanes (agy)
        Gemini Models:          5 h 34 % · weekly 8 %  · 1.2M tokens · $2.10 at list price
        Claude and GPT models:  5 h 61 % · weekly 12 % · 3.4M tokens · $9.80
      Lanes (grok)
        Grok plan:              weekly 100 % → 97 % · resets 2026-10-17 09:08 UTC · 1 call · $0.04
      Native Claude:            $3.40
      Total at list price: $15.30; the plans covered $11.90 (78 %)

## 5. Act on it

- **Stuck unit (the watch ended with one):** read the reason and the files outside `Owns` it reports; fix it in the unit's worktree (`worktree` of the output) and commit the fix on its branch; deliver it with:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/aether-wt deliver <runId> <task> --commit <sha> --reason "<what you fixed>" [--widen <paths>]
```

  (the commit must be the tip of the unit's branch; the workflow merges it with the standard rules: `Owns`, merge tests and baseline; when the fix needs files outside `Owns` that no unmerged unit owns, name them with `--widen <paths>` — one flag with a comma-separated list, no globs — and say in `--reason` why the fix needs them); decline it only when another unit that has not merged owns those files, or the plan error is larger, with:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/aether-wt decline <runId> <task> --reason "<why>"
```

  so as not to leave the workflow waiting, and treat it as a blocked unit; relaunch the watch after each deliver or decline. If that merge refuses the fix, the unit ends blocked with no second wait. Without a timely delivery (`stuckWaitSeconds` of `config/swarm.json`, 1800 by default, and there is no launch argument for it; 0 turns the wait off), the unit ends blocked; act on it as a blocked unit.
- **Blocked with a question:** answer it from the owner's intent, the spec and the plan when they cover it. Otherwise it goes to the owner: outside a run, ask them; in an autonomous run, it waits in the diary's "Espera tu sí" or "Decisiones", and the other units go on. Then have the Writer fix the plan task, have `/aether:design` review the fix in short mode on `tasks.md` (see "Later changes" in the `aether:designing` skill), and relaunch the unit.
- **Blocked by a merge failure:** the unit passed review but git merge or the merge tests failed after its retry. Read the rounds and check the conflict or failure. A merge command stopped at 600 seconds, after its merge commit and before the tests finish, leaves that commit unverified, and a later merge is refused as `unverified-buried`, `unverified-moved` or `unverified-other`. The Lead's exit is `aether-wt settle <run> <task>`, from the integration worktree: it runs the plan's tests at the current tip, never changes the branch, and clears the marker only when they pass. It refuses while the integration worktree has uncommitted changes, is on another branch or has a merge in progress (`MERGE_HEAD`): fix that state first. A unit that ends blocked after a refused merge (a file outside Owns, or tests that went red after its merge) carries `blockedFiles`, the files that refusal named, and its `reason` ends with the one step that integrates it by hand from its `patch`. Fix the work yourself when it fits the direct path; otherwise send it to a delegate task, whose model the ladder picks, or have the Writer fix the plan task, have `/aether:design` review the fix in short mode on `tasks.md`, and relaunch it. These have a fallback, so they never go to the owner.
- **Blocked by a spent ladder or repeated failure:** read the rounds and the unit's `failures`. The causes of a block include:
  - `the ladder is spent (exhausted)`: every step of the ladder was tried;
  - repeating the same change outside Owns (`blocked-outside-owns`) or the same blocked cause twice (`blocked-same-cause`: two `BLOCKED` reports with the same red tests of the gate, whatever their wording) blocks the unit on its rung;
  - `the supervisor failed 3 times in a row`: the supervisor ended three times without an answer; an invalid verdict counts as a retry;
  - a gate that fails again and again: edits outside Owns (`<archivo>: fuera de Owns`), test failures (`falló: <nombre>` or `npm test: salió con N`), or test timeouts (`npm test: superó el tiempo límite`);
  - the attempt that did not end: crashes, aborted runs or missing reports (`el intento no terminó (<causa>)`, `<archivo>: el intento no cambió ningún archivo`). When an attempt ends without a report, the next pass retries as a split pass of sub-attempts per file before synthetic findings repeat.
  Note that the 2nd and 3rd attempt of the supervisor always run on Claude. A Claude supervisor or final reviewer that stays silent for 900 seconds is abandoned. A supervisor finding that names no file receives the first file in the task's `Owns`.
  A relaunch that names the task again (`--only`, after the Writer fixed it) gives a spent ladder a new one and keeps the old state as `<task>.spent-N.json`. A ladder that is still open continues where it was. Act as for a merge failure, above.
- **Blocked by a lane:** a reason that starts with `lane:` means a lane changed the integration worktree or branch, or a read-only copy changed the unit. Check the integration worktree with `git status` and the branch with `git log` before you relaunch.
- **Skipped or not-run:** relaunch these once their dependencies are merged.
- **Final review deferred:** `finalReview.status` is `deferred`. The review did not run. Relaunch the blocked, skipped and not-run tasks. The review runs once, on the launch that ends with all its units merged, and it covers the whole run from the first compile's base. When you are giving up on the units that did not merge, force the review on what is merged: add `"review": true` to the JSON `aether-plan compile` printed and launch `aether:run` with it. A compile that finds every unit already merged prints empty `waves`; that launch reviews only when `"review": true` is set.
- **Integrated by hand:** when you apply a unit's patch or write its work yourself, commit it on the integration branch and record it, so that the report and `finalize` agree with the branch:

      aether-wt adopt <runId> <task> --commit <sha> --reason "<why the swarm could not>"

  The commit must be in the integration branch. The report then counts the unit as `adopted`, not `blocked`. When that launch's review already ran, it did not see this commit: give an `aether:reviewer` the package of the whole run (`aether-wt diff <runId> --final`). When it is `deferred`, the run's own review covers what you adopted (see "Final review deferred").
- **Patches:** `<runDir>/patches/<task>.patch` holds a unit's unmerged work. Read it before you apply it with `git apply`.
- **Final review findings:** handle them as a final review is handled.
  - Re-grade each finding by its effect.
  - Fix the critical and important ones: a short fix yourself on the integration branch, with its test, when it fits the direct path; a longer one through a delegate task or a relaunch; a design-level one through the Writer and `/aether:design` in short mode.
  - Defer the minor ones: list them in the report, or in a run in the brief. They are not worked.
  - Rule on each `declined` line.
- **Leftovers:** when `cleanup.remaining` is not empty, run `aether-wt sweep --run <runId>` from the integration worktree. A sweep of an interrupted run (one with saved.json, or a recorded quota pause that names the run) commits each unmerged unit's uncommitted work on its unit branch, keeps that branch and a patch, and removes the units that merged. Any other sweep saves a patch for each unmerged unit and keeps the branch of any work that is not integrated (`retainedBranches`), instead of deleting it; only branches whose work is in the integration branch are removed. A unit whose work it cannot save stays in place for you to handle. After you integrate or adopt a retained unit (`aether-wt adopt`), `aether-wt sweep --run <runId> --finish` removes its branch and, once no other unit is waiting, the run directory.

To relaunch, keep the run id and name the tasks:

    aether-plan compile <plan.md> --run <runId> --only task-3,task-5

After an interruption (the quota brake, the session limit, a crash, the owner), first run `aether-wt save <runId>`: every unit's uncommitted work is committed on its branch before any worktree is removed or reused. Then relaunch with the same run id and no `--only`: `aether-plan compile <plan.md> --run <runId>` leaves out the units already merged, and each saved unit continues from its branch. A relaunch continues each unit on its rung of `config/ladder.json`.

Then launch `aether:run` again with the new JSON, subject to the compile refusal described in §3. Tasks outside the selection are assumed to be merged already.

A relaunch keeps the run's first compile time, and keeps the previous launch's result as `result-<k>.json`. Save each launch's result as `result.json` again: the report adds every launch up.

## 6. Finish

Finish when every unit is merged or adopted, the final review's status is `done` and it has no open critical or important finding, and the test command passes on the integration branch, or fails only on the run's baseline (`quality.tests.knownFailuresOnly` in the report). A `deferred` review has not run: relaunch, or force it, before you finish.

1. First, include this session's spend in the closing report from `aether-report --spend --session <id de esta sesión>` in the format of `using-aether`; in an autonomous run, with the clause «y no es la cifra del tope»:
   Sesión <id>: US$ <total> a precio de lista (Lead US$ <lead>, agentes US$ <agentes>). El total incluye las llamadas a otros harness (<n> llamadas, US$ <harness>) y no es la cifra del tope.
2. Run `aether-report finalize --run <runId>` from the integration worktree. It records the run as it stands, so act on every critical and important finding first. It appends the report to `runs.jsonl` in the plugin's data directory, with the Aether and Claude Code versions and that of each lane harness that ran. Then it deletes the run's worktrees, branches and directory, so first save what you still need from the patches.
3. Finish the branch yourself, as the owner's delegate:
   - **merge to `main`** only when `aether-autonomy check merge-main` passes, or the owner authorized this merge once in their own words;
   - **push or open a pull request** only when `aether-autonomy check push` passes, or the owner authorized it once;
   - **discard** never on your own: it deletes work (class `delete`);
   - otherwise **keep the branch**, and put the exact command of the step it waits for in "Espera tu sí" of the diary, or, outside a run, in the list of irreversible actions of your brief.
