---
name: swarm
description: Use in Aether mode to run an approved plan that has Aether fields as a parallel swarm with /aether:run, to act on a run's result, or to relaunch a run's blocked, skipped or pending tasks.
---

# Running the swarm

The swarm runs a plan's tasks as units. Each unit:
- gets its own worktree, and works on its model and effort;
- is supervised after every attempt;
- is merged into the integration branch, one merge at a time.

The whole run is then reviewed as one change. You prepare the run, launch it, and act on its result. You stay the Lead: the run's agents decide inside their unit, the Judge rules on the design, and you decide everything else, as the owner's delegate.

In an autonomous run (see the `using-aether` skill), what this skill says to tell or report to the owner goes to the run's diary, and from there to the brief.

## 1. Prepare

- **The plan.** It is approved, by you as the owner's delegate or by the owner; every task has Aether fields; and `aether-plan check <plan.md>` passes.
- **The integration worktree.**
  - Create it with `git worktree add <path> -b <feature branch>`, on a feature branch. Never run the swarm on `main`.
  - Keep it separate from the main checkout. The unit worktrees live under the main checkout's `.aether/worktrees/`, and a test command that searches the whole tree would run their unfinished tests at merge time. `aether-plan compile` warns when the two are the same.
  - Commit the plan there, and leave the worktree clean. A merge refuses to start while the integration worktree has uncommitted changes.
- **Permissions.** The run's agents use Bash (`git`, `aether-wt`, `aether-lane` and the test command) and edit files under `.aether/worktrees/`. A session that asks permission for each call stalls the swarm, and an autonomous run waits at the first prompt.
  - Check that the permission mode or allow rules cover these calls, and write down what you rely on: tell the owner, or in a run, note it in the diary.
  - The unit worktrees are under the main checkout. If this session started inside the integration worktree, add the main checkout with `/add-dir <repoRoot>`, so the agents may read and edit there.
- **Workflows.** The run is a dynamic workflow. When this session has no `Workflow` tool, workflows are off: tell the owner to turn on Dynamic workflows in `/config` and to start a new session, and offer to build the plan with subagents meanwhile.
- **Lanes.** When the owner turned on the plugin's `lanes` option, on Linux, the run sends calls to the external harnesses that the `harnesses` option enables (agy by default; also codex, grok and cursor), in the owner's order, when the harness's CLI is installed and while its quota lasts. `plugins/aether/config/lanes.json` names each harness's models. These CLIs run without permission prompts (agy with `--dangerously-skip-permissions`) in the unit's transactional worktree, with the owner's git, GitHub, registry and cloud credentials kept out of their environment. Otherwise every call is native, and `aether-plan compile` says why on stderr; it also names each enabled harness that takes no call, and why. `aether-plan compile <plan.md> --no-lanes` runs everything native.

## 2. Compile

From the integration worktree:

    aether-plan compile <plan.md>

It prints one line of JSON: the run's arguments. Warnings go to stderr. Keep the `runId`; every later command needs it.

Compile also runs the plan's test command once, in the integration worktree, and keeps the failing tests it names as the run's baseline (`baseline.json` in the run's folder). From then on a merge is blocked only by a failure that is not in the baseline, and a merge that passes with known failures lists them as `knownFailures`. Give the Bash call a timeout that fits the test command. A relaunch keeps the baseline it has. `--no-baseline` skips it, and then any failing test blocks a merge.

## 3. Launch

In an autonomous run, run `aether-autonomy status` first. When its `stop` is not null, launch nothing, and end the run as the `using-aether` skill says.

Run the `aether:run` workflow with that JSON as its args, unchanged. The run works in the background, and the progress view shows its phases.

In a headless session (`claude -p`), Claude Code stops background work 10 minutes after the last turn, and that includes the run. Start such a session with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, which waits for the run however long it takes.

While it runs:
- do not edit the integration worktree;
- do not run `aether-wt` commands for this run.

## 4. Read the result

The workflow returns:
- **`units`:** one entry per task, with:
  - `status`: `merged`, `blocked`, `skipped` or `not-run`;
  - `tiers`: the rungs it ran on, each a model and an effort, such as `["haiku medium", "haiku xhigh", "sonnet xhigh"]`. A higher effort on the same model is a climb; another model is an escalation;
  - `rounds`: each attempt, with its rung (`tier`), the implementer's report, the supervisor's verdict, findings, ruling and effort (`reviewEffort`), and the merge outcome;
  - `salvaged` in each round: true when the implementer ended without its report and the workflow rebuilt it from the unit branch (`aether-wt salvage` commits what the task owns). The supervisor reviewed that work as an unverified claim; its tests were not reported, so they run at the merge;
  - `provider` and `reviewProvider` in each round: `native`, or `<harness> <model>`, such as `agy gemini-3.8-flash`, for the lane that ran the attempt and its review. `laneFailure`: set when a lane began the attempt and the native agent finished it, with the harness, the model and the reason;
  - `failures`: the failed attempts in order, `no report` or the blocking findings of a retry or an escalation. A unit stops when it ends twice in a row without a report, or gets the same findings three times: the reason asks for a split or a redesign;
  - `commit`, `reason`, `question` and `patch`;
  - `closeError`, when the unit could not be closed. The final sweep then removes it, after saving its work as a patch.
- **`finalReview`:** a `status` of `done`, `skipped` or `failed`. When it is done, it also has the `verdict`, `findings`, `declined` and `summary`. A `failed` review has a `reason`: the reviewer ended without its answer, which may be a diff too large for its turns, or it failed with an error's text. That is never a verdict. `reviewModel` and `reviewEffort` say what it ran on, which follows the run's risk: Opus at `xhigh` when a merged task is tier opus or reviews at `xhigh` or `max`, Sonnet at `high` for at most three haiku tasks that review at `high`, and Opus at `high` otherwise.
- **`cleanup`:** what the sweep removed. Its `remaining` lists must be empty.
- **`agents`:** the agent count, by role and by model.
- **`lanes`:** the lane calls by outcome (`ok`, `failed`, `quota`, `violation`, `blocked`, `unavailable`), the `overflow`, and each wave's `dry` groups. It is null when the run had no lanes.
- **`error`:** set only when the script itself failed.

Save the result as `<runDir>/result.json`, then run `aether-report --run <runId>` from the integration worktree. It prints JSON:
- **`speed`:** the run's window, from compile to the saved result, and the swarm's own span;
- **`cost`:** USD at OpenRouter prices, from the usage meter:
  - by model, and by role;
  - `byEffort`: by role, model and effort, with the output tokens and the model time of each;
  - `agents`, in `cost.run`: each agent of the run, with its label, model, effort, cost and time;
- **`quality`:** the units merged, adopted (see §5), climbed, escalated and blocked, `integrated` (merged and adopted), every finding by severity, the final review, and the test command's result on the integration branch. Each adopted unit is also a line in `notes`.
- **`lanes`:** each group's calls, tokens, dollars and quota consumed per window, by model, by role and by harness (`byHarness`), and `totals`: native dollars, lane dollars and the share the plans covered.
- **`radar`:** the figures of the owner's five goals: `rapid` (the run's time, attempts, climbs and escalations), `autonomous` (questions that reached the owner), `delegation` (lane calls, by harness, and the share the plans covered), `affordable` (dollars) and `robust` (merged, blocked, tests, findings and the final verdict). A figure that was not measured is null.

In an autonomous run, record the run's cost after every launch:

    aether-autonomy spend <lanes.totals.run.totalUsd> --source <runId>

A relaunch's report adds every launch up, and the new figure for the same run id replaces the last one.

Report from it, to the owner or, in a run, to the diary:
- the units merged, climbed, escalated and blocked;
- the final verdict and the tests;
- the time and the cost by model, and the implementers' and supervisors' cost and time by effort;
- the RADAR figures, one line per goal;
- the lanes, in these lines, one block per harness that ran:

      Lanes (agy)
        Gemini Models:          5 h 34 % · weekly 8 %  · 1.2M tokens · $2.10 at list price
        Claude and GPT models:  5 h 61 % · weekly 12 % · 3.4M tokens · $9.80
      Native Claude:            $3.40
      Total at list price: $15.30; the plans covered $11.90 (78 %)

## 5. Act on it

- **Blocked with a question:** answer it from the owner's intent, the spec and the plan when they cover it. Otherwise it goes to the owner: outside a run, ask them; in an autonomous run, it waits in the diary's "Espera tu sí" or "Decisiones", and the other units go on. Then ask the Writer to fix the plan task, have the Judge review the fix, and relaunch the unit.
- **Blocked by a merge failure or a spent ladder:** read the rounds. Fix the work yourself when the fix is short; otherwise send it to a subagent, or ask the Writer to fix the plan task and relaunch it. These have a fallback, so they never go to the owner.
- **Blocked by a repeated failure:** the unit ended twice without a report, or got the same findings three times (see its `failures`). The task is too large or cut wrong: ask the Writer to split it, have the Judge review the split, and relaunch. This never goes to the owner either.
- **Blocked by a lane:** a reason that starts with `lane:` means a lane changed the integration worktree or branch, or a read-only copy changed the unit. Check the integration worktree with `git status` and the branch with `git log` before you relaunch.
- **Skipped or not-run:** relaunch these once their dependencies are merged.
- **Integrated by hand:** when you apply a unit's patch or write its work yourself, commit it on the integration branch and record it, so that the report and `finalize` agree with the branch:

      aether-wt adopt <runId> <task> --commit <sha> --reason "<why the swarm could not>"

  The commit must be in the integration branch. The report then counts the unit as `adopted`, not `blocked`. The final review of the run ran before your change, so give an `aether:reviewer` the package of the whole run (`aether-wt diff <runId> --final`) when you adopted work.
- **Patches:** `<runDir>/patches/<task>.patch` holds a unit's unmerged work. Read it before you apply it with `git apply`.
- **Final review findings:** handle them as a final review is handled.
  - Re-grade each finding by its effect.
  - Fix the critical and important ones: a short fix yourself, with TDD on the integration branch; a longer one through a subagent or a relaunch; a design-level one through the Writer and the Judge.
  - Defer the minor ones: list them in the report, or in a run in the brief. They are not worked.
  - Rule on each `declined` line.
- **Leftovers:** when `cleanup.remaining` is not empty, run `aether-wt sweep --run <runId>` from the integration worktree. A sweep first saves each unit's unmerged or uncommitted work as a patch. A unit whose work it cannot save stays in place for you to handle.

To relaunch, keep the run id and name the tasks:

    aether-plan compile <plan.md> --run <runId> --only task-3,task-5

Then launch `aether:run` again with the new JSON, after the `aether-autonomy status` check of §3 in a run. Tasks outside the selection are assumed to be merged already.

A relaunch keeps the run's first compile time, and keeps the previous launch's result as `result-<k>.json`. Save each launch's result as `result.json` again: the report adds every launch up.

## 6. Finish

Finish when every unit is merged or adopted, the final review has no open critical or important finding, and the test command passes on the integration branch, or fails only on the run's baseline (`quality.tests.knownFailuresOnly` in the report).

1. Run `aether-report finalize --run <runId>` from the integration worktree. It records the run as it stands, so act on every critical and important finding first, and in a run record the last cost with `aether-autonomy spend` before it. It appends the report to `runs.jsonl` in the plugin's data directory, with the Aether and Claude Code versions, and agy's when an agy lane ran. Then it deletes the run's worktrees, branches and directory, so first save what you still need from the patches.
2. Finish the branch yourself, as the owner's delegate:
   - **merge to `main`** only when `aether-autonomy check merge-main` passes, or the owner authorized this merge once in their own words;
   - **push or open a pull request** only when `aether-autonomy check push` passes, or the owner authorized it once;
   - **discard** never on your own: it deletes work (class `delete`);
   - otherwise **keep the branch**, and put the exact command of the step it waits for in "Espera tu sí" of the diary, or, outside a run, in the list of irreversible actions of your brief.
