---
title: Troubleshooting
description: What you see when Aether does not behave as expected, why it happens and what to do about it
order: 16
---

# Troubleshooting

Each section below says what you see, why it happens and what to do, with the exact command when there is one; if you have not started Aether mode yet, begin with [Getting started](../getting-started.md).

## Aether's agents and skills do not show up

**What you see.** A `claude` session offers none of the agents `aether:lead`, `aether:writer`, `aether:judge` and the rest, and nothing in it behaves like the Lead.

**Why.** Plain `claude` is normal mode, and the plugin sleeps there. Its hooks do nothing, its usage meter records nothing, and the mod withholds every `aether:` agent from a session that the Lead did not start. Aether mode is chosen when a session starts, with `--agent aether:lead`. The Lead's rules are the `using-aether` skill, which the session-start hook injects only when the session's agent is `aether:lead`.

**What to do.** Start the session as the Lead:

    claude --agent aether:lead --effort xhigh

[Getting started](../getting-started.md#start) has the whole start, and `scripts/aether-lead` runs the same command with permissions bypassed.

## The swarm does not start

**What you see.** The Lead cannot launch `/aether:run`, or says that workflows are off.

**Why.** The swarm is a dynamic workflow. A session with dynamic workflows off has no `Workflow` tool, so there is nothing for the Lead to launch.

**What to do.** Turn on Dynamic workflows in `/config` and start a new session. Meanwhile the Lead offers to build the plan task by task, each as a delegate task: on Sonnet, or on Opus when the task's Tier is opus.

Two other causes look the same from the outside:
- **An autonomous run at its ceiling.** The Lead runs `aether-autonomy status` before every launch, and launches nothing while its `stop` is not null: the run's hours (`time`) or dollars (`cost`) are spent (see [Autonomy](autonomy.md#autonomy)).
- **A headless session.** In `claude -p`, Claude Code stops background work 10 minutes after the last turn, and that includes the run. Start such a session with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, which waits for the run however long it takes.

## A plan does not pass the check

**What you see.** `aether-plan check <plan.md>` exits with 1 and prints a JSON line with `"ok":false` and a list of `errors`. The Lead runs the same check before it compiles, and `aether-plan compile` refuses a plan that fails it.

**Why and what to do.** These are the messages seen most, each with its fix:
- **`The plan is a chain: every wave holds one task.`** A plan of three or more tasks in which each task depends on the one before runs one task at a time. Decompose it again so that independent tasks do not depend on each other, or drop a `Depends on` that is not needed. A plan that merely averages under 1.5 tasks per wave gets the warning `Low parallelism`, which does not fail the check.
- **`Task A and Task B run in the same wave but both own ...`** Two tasks with no dependency between them own overlapping paths. Narrow the `Owns` of one of them, or make one depend on the other so they run in different waves.
- **`Task N: missing the **Aether:** block.`** The task has no line that is exactly `**Aether:**` followed by its list of fields. Add the block with `Tier`, `Area`, `Owns` and `Depends on`.
- **`Task N: missing Tier.`** or **`Tier must be haiku, sonnet or opus ...`** The line reads `- Tier: sonnet high — reason`: a model, an optional effort, a dash and the reason. Sonnet and Opus are not given `low` or `medium`.
- **`"Depends on: ..." needs the form "Task N — reason".`** Write one line per dependency, such as `- Depends on: Task 2 — needs its interface`, with the reason after the dash. A task that depends on nothing says `- Depends on: none`; leaving the line out gives `missing "Depends on"`.
- **`Task N owns 7 paths; a task that large often ends without its report ...`** A task that owns more than six paths, or the whole tree, gets this as a warning: the check still passes, but split the task, because a unit that large often ends without its report.
- **`The plan has no "## Aether Execution" section.`** or **`"Test command" is missing.`** The plan needs the section `## Aether Execution` with a line `- Test command: ...`; its `Ladder` and `Max agents` lines are optional.
- **`Task numbers must run from 1 without gaps`.** Number the tasks `### Task 1: ...`, `### Task 2: ...` with no number missing.

## The session stops at a permission prompt

**What you see.** The Lead, or a run's agents, wait at a Claude Code prompt that asks you to approve a tool call, and nothing moves until you answer.

**Why.** A permission that asks stops a run like a question: the session waits at it, and an autonomous run waits at the first prompt. Aether never turns permissions off. The swarm's agents use Bash for `git`, `aether-wt`, `aether-lane` and the test command, and edit files under `.aether/worktrees/`.

**What to do.** Start the session with a permission mode or allow rules of your choice that cover those calls. Or start it with `scripts/aether-lead`, which sets `--permission-mode bypassPermissions`. With no prompts left, aether-guard is the only check on an irreversible command, so the launcher also sets `AETHER_IRREVERSIBLE=enforce` (see the next section). If the session started inside the integration worktree, add the main checkout with `/add-dir <repoRoot>`, so the agents may read and edit there.

## A command was refused or recorded

**What you see.** A Bash command was refused with a message that starts `Aether added this ... command to the owner's list (.aether/pending.jsonl)`, or it ran and a line appeared in `.aether/pending.jsonl` in the main checkout. The Lead puts the entries of that list in the "Espera tu sí" of its brief.

**Why.** In an Aether session, aether-guard watches every Bash call for six irreversible classes:
- `push`: sending commits to a remote;
- `merge-main`: merging a pull request into `main`, with `gh pr merge`;
- `publish`: publishing a package or a release;
- `deploy`: deploying, restarting or stopping services;
- `delete`: a forced removal, such as `git reset --hard`, `git clean -f`, `git branch -D` or `rm -rf` on a wide target;
- `credentials`: creating or changing credentials and tokens.

A command of one of these classes that no grant covers is appended to the list with its class, its working directory and its `mode`, and with its secret values redacted. What happens next depends on `AETHER_IRREVERSIBLE`:
- `enforce`: the command is refused. `scripts/aether-lead` sets it unless your shell already did.
- anything else, `log` by default: the command is only recorded, and it runs.

A dry run, such as `git push --dry-run`, is not irreversible and is not recorded. Outside a git repository the command is allowed unrecorded. A `paid-call` is a class of `aether-autonomy` that the Lead honours but the guard does not detect.

**What to do.**
- To let such an action run, say so to the Lead in your own words. A general authorization, such as «todos los merges a main», is recorded by the Lead with `aether-autonomy grant --class <class> --quote "<your words>"`, and holds in the repository until revoked; add `--scope session` for your words «en esta sesión». The quote must be at least 12 characters, found in your own messages of the session: a quote that is not there is rejected. `aether-autonomy list` shows the registry, and `aether-autonomy revoke` withdraws a grant.
- An authorization of one action, such as a bare «sí», covers that action once. Under `enforce` the guard still refuses it until a grant covers its class, so the Lead records a session grant, runs the action, and revokes the grant. When your reply is shorter than 12 characters, the Lead puts the exact command in the brief for you to run yourself.
- The registry and each run's `run.json` under `.aether/autonomy/` are written only by `aether-autonomy`; aether-guard refuses a direct edit of them. It also refuses an edit of a spec, a plan or a task file, or of the constitution, by any agent other than the Lead and the Writer.

## Nothing runs on a lane

**What you see.** A swarm run is native from end to end: no lane calls in its report, or `aether-plan compile` prints a line on stderr that starts `aether-plan: lanes`.

**Why.** Lanes are off, or no harness is ready to take a call. The causes, in the order to check them:
- **The `lanes` option is off, or the machine is not Linux.** `lanes`, off by default, and lanes run only on Linux. Compile says `aether-plan: lanes are off: the aether plugin's lanes option is not on` or `lanes need Linux`.
- **The harness is not in `harnesses`.** `harnesses`, `agy` by default, lists the harnesses lanes may use. A name that is not `agy`, `codex`, `grok` or `cursor` is ignored, and a list with no valid name means `agy`. `aether-lane status <run>` shows `enabled: false` for a harness that is not listed.
- **Its CLI is not installed, or is not on the `PATH` Aether sees.** Compile says `lanes: <harness> is enabled but is not installed: <command> was not found`, and `aether-lane quota` says `not installed (<command> was not found on PATH)`. Aether looks on the `PATH` of the environment that runs its commands; with `ops` on, that is Claude Code's own and not your shell's, so a directory that only your shell profile adds can be missing.
- **The group is marked dry or is under its reserve.** A call that ended for quota leaves a dry mark: until the group's reset when a reading with a balance shows it under the reserve, and otherwise for 60 minutes. `aether-lane status <run>` lists, for each role, the order of the candidates with the reason each was passed over (`marked`, `dry`, `reserve` or `not-installed`), and `aether-lane quota` shows each group's windows.
- **The run was compiled with `--no-lanes`.**

**What to do.** Fix the cause that `aether-plan compile`, `aether-lane quota` or `aether-lane status <run>` names. The options are read when a session starts, so after you change one, start a new session. [Options](options.md#options) lists them, and [Lanes](lanes.md#lanes) explains how a call picks its lane and when it falls back to the native agent.

## A merge fails or times out

**What you see.** A unit is blocked with a reason that starts `merge`: `the test command failed after the merge`, `conflict in ...`, `refused: the integration worktree has uncommitted changes`, or an error that says the command was still running after 600 s and was stopped.

**Why and what to do.**
- **A new test fails.** The merge is undone, and the unit gets one more attempt with the failure in its brief; a second failure blocks it. Tests that were already failing when the run was compiled are the run's baseline: they do not block a merge, and a merge that passes with them lists them as `knownFailures`. With `--no-baseline` any failing test blocks. A failing run whose output names no test cannot be told from the known ones, so it blocks too.
- **The integration worktree has uncommitted changes.** A merge refuses to start then. Commit or stash the changes, and edit nothing in the integration worktree while a run is going.
- **The tests take more than 10 minutes.** The merge is stopped at 10 minutes, after its merge commit and before the revert, so the commit may be on the integration branch without its tests. Check its `git log` before you relaunch, and shorten the plan's `Test command` so it ends inside 10 minutes.
- **The test command needs your shell's environment.** With `ops`, on by default, the workflow's `aether-wt` and `aether-lane` commands run in the mod, in Claude Code's own environment, so the tests they start do not see what only your shell sets. Make the test command work without it, or turn `ops` off: the Haiku ops agent then runs them with the Bash tool, as before 0.8. [Ops without a model](ops.md) explains the two paths, and [Options](options.md#options) the option. Start a new session after you change it.

## An update does not take

**What you see.** After `claude plugin update aether@aether-plugin` and a new session, the plugin is still at its old version, or a `ref` that you changed in your settings did not move it.

**Why.** In Aether's acceptance runs, a session started with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` did not fetch a changed `ref`, and the same session without that variable did at once. The variable is the probable cause; the runs did not isolate it.

**What to do.** Start one session with the variable unset, and run `claude plugin update aether@aether-plugin` again. [Maintenance](maintenance.md#update-pin-roll-back-and-uninstall) has the update, the pin and the roll back.

## Worktrees or branches are left behind

**What you see.** `git worktree list` shows paths under `.aether/worktrees/<run>/`, or `git branch` shows branches named `aether/<run>/<task>`, after a run was interrupted or when `cleanup.remaining` in a run's result is not empty.

**Why.** A run that finishes is removed by `aether-report finalize`. One that was killed, or whose unit could not be closed, leaves its worktrees and branches in place.

**What to do.**
- **One unit.** `aether-wt remove <run> <task>` removes its worktree and its branch. A unit's unmerged or uncommitted work is saved first as a patch, `.aether/runs/<run>/patches/<task>.patch`; `--keep-patch` saves one even when everything was merged. Read a patch before you apply it with `git apply`.
- **A whole run.** `aether-wt sweep --run <run>` saves each unit's unsaved work as a patch, stops the run's lane processes, and removes its worktrees, branches and lane copies. A unit whose work it cannot save stays in place. `--finish` also deletes the run's directory.
- **Old runs.** `aether-wt sweep --stale` removes the runs that were never finalized and have had no activity for 24 hours, and `--hours N` changes the 24. The session-start hook does the same on its own, in the session's repository, on startup, clear and compact, so a run left alone for a day goes the next time you start an Aether session. A run touched in the last 24 hours is not swept: use `aether-wt sweep --run` for it. Each run removed this way is recorded as abandoned in `runs.jsonl`.

## A unit comes back blocked

**What you see.** In a run's result a unit has the status `blocked`, `skipped` or `not-run`, with a `reason`, instead of `merged`.

**Why.**
- **`blocked`:**
  - the ladder is spent: every attempt of each rung was used (`haiku 2, sonnet 2, opus 1` unless the plan's `Ladder` says otherwise) and the unit still did not pass;
  - the same findings came back three times, or the unit ended twice in a row without its report: the task is too large or cut wrong and needs a split or a redesign;
  - a merge failure came back after its one retry, or the merge was refused: see [A merge fails or times out](#a-merge-fails-or-times-out);
  - the supervisor blocked it with a question, or a lane changed the integration worktree or branch (a reason that starts `lane:`).
- **`skipped`:** a task it depends on did not merge, so it did not start.
- **`not-run`:** the run's agent budget was spent (`Max agents`, 200 unless the plan says otherwise).

**What to do.** Nothing, in most cases: the Lead acts, not you. It answers a question from your intent, the spec and the plan when they cover it; fixes a merge failure or a spent ladder itself, or sends it to a delegate task; has the Writer split a task that failed repeatedly; and relaunches the unit, with `aether-plan compile <plan.md> --run <run> --only task-3,task-5` and the workflow again. None of these reaches you. A question that your intent does not cover waits in the "Espera tu sí" of the brief. A unit's unmerged work is kept as a patch under `.aether/runs/<run>/patches/` until the run is finalized.
