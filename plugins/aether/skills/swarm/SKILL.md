---
name: swarm
description: Use in Aether mode to run an approved plan that has Aether fields as a parallel swarm with /aether:run, to act on a run's result, or to relaunch a run's blocked, skipped or pending tasks.
---

# Running the swarm

The swarm runs a plan's tasks as units. Each unit:
- gets its own worktree, and works on its tier;
- is supervised after every attempt;
- is merged into the integration branch, one merge at a time.

The whole run is then reviewed as one change. You prepare the run, launch it, and act on its result. You stay the Designer: the run's agents decide inside their unit, and you decide everything else.

## 1. Prepare

- **The plan.** The owner has approved it, every task has Aether fields, and `aether-plan check <plan.md>` passes.
- **The integration worktree.**
  - Create it with superpowers `using-git-worktrees`, on a feature branch. Never run the swarm on `main`.
  - Keep it separate from the main checkout. The unit worktrees live under the main checkout's `.aether/worktrees/`, and a test command that searches the whole tree would run their unfinished tests at merge time. `aether-plan compile` warns when the two are the same.
  - Commit the plan there, and leave the worktree clean. A merge refuses to start while the integration worktree has uncommitted changes.
- **Permissions.** The run's agents use Bash (`git`, `aether-wt` and the test command) and edit files under `.aether/worktrees/`. A session that asks permission for each call stalls the swarm.
  - Check that the permission mode or allow rules cover these calls, and tell the owner what you rely on.
  - The unit worktrees are under the main checkout. If this session started inside the integration worktree, add the main checkout with `/add-dir <repoRoot>`, so the agents may read and edit there.

## 2. Compile

From the integration worktree:

    aether-plan compile <plan.md>

It prints one line of JSON: the run's arguments. Warnings go to stderr. Keep the `runId`; every later command needs it.

## 3. Launch

Run the `aether:run` workflow with that JSON as its args, unchanged. The run works in the background, and the progress view shows its phases.

While it runs:
- do not edit the integration worktree;
- do not run `aether-wt` commands for this run.

## 4. Read the result

The workflow returns:
- **`units`:** one entry per task, with:
  - `status`: `merged`, `blocked`, `skipped` or `not-run`;
  - `tiers`: the tier path, such as `["haiku", "sonnet"]`;
  - `rounds`: each attempt, with the implementer's report, the supervisor's verdict, findings and ruling, and the merge outcome;
  - `commit`, `reason`, `question` and `patch`.
- **`finalReview`:** a `status` of `done`, `skipped` or `failed`. When it is done, it also has the `verdict`, `findings`, `declined` and `summary`.
- **`cleanup`:** what the sweep removed. Its `remaining` lists must be empty.
- **`agents`:** the agent count, by role and by model.
- **`error`:** set only when the script itself failed.

Save the result as `<runDir>/result.json`, then run `aether-report --run <runId>` from the integration worktree. It prints JSON:
- **`speed`:** the run's window, from compile to the saved result, and the swarm's own span;
- **`cost`:** USD at OpenRouter prices, by model and by role, from the usage meter;
- **`quality`:** the units merged, escalated and blocked, every finding by severity, the final review, and the test command's result on the integration branch.

Report to the owner from it:
- the units merged, escalated and blocked;
- the final verdict and the tests;
- the time and the cost by model.

## 5. Act on it

- **Blocked with a question:** answer it from the spec and the plan when you can; otherwise bring it to the owner. Then fix the plan task and relaunch the unit.
- **Blocked by a merge failure or a spent ladder:** read the rounds. Fix the work yourself when it is bounded, or fix the plan task and relaunch it.
- **Skipped or not-run:** relaunch these once their dependencies are merged.
- **Patches:** `<runDir>/patches/<task>.patch` holds a unit's unmerged work. Read it before you apply it with `git apply`.
- **Final review findings:** handle them as superpowers handles a final review.
  - Re-grade each finding by its effect.
  - Fix the critical and important ones: yourself, with TDD on the integration branch, or by relaunching.
  - Report the minor ones to the owner as deferred.
  - Rule on each `declined` line.
- **Leftovers:** when `cleanup.remaining` is not empty, run `aether-wt sweep --run <runId>` from the integration worktree. A sweep first saves each unit's unmerged or uncommitted work as a patch. A unit whose work it cannot save stays in place for you to handle.

To relaunch, keep the run id and name the tasks:

    aether-plan compile <plan.md> --run <runId> --only task-3,task-5

Then launch `aether:run` again with the new JSON. Tasks outside the selection are assumed to be merged already.

A relaunch keeps the run's first compile time, and keeps the previous launch's result as `result-<k>.json`. Save each launch's result as `result.json` again: the report adds every launch up.

## 6. Finish

Finish when every unit is merged, the final review has no open critical or important finding, and the test command passes on the integration branch.

1. Run `aether-report finalize --run <runId>` from the integration worktree. It records the run as it stands, so act on every critical and important finding first. It appends the report to `runs.jsonl` in the plugin's data directory, with the aether, superpowers and Claude Code versions. Then it deletes the run's worktrees, branches and directory, so first save what you still need from the patches.
2. Use superpowers `finishing-a-development-branch` with the owner.
