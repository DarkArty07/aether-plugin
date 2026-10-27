---
title: Troubleshooting
description: What you see when Aether does not behave as expected, why it happens and what to do about it
order: 16
---

# Troubleshooting

Each section below says what you see, why it happens and what to do, with the exact command when there is one; if you have not started Aether mode yet, begin with [Getting started](../getting-started.md).

## Aether's agents do not show up

**What you see.** A session started with plain `claude` offers none of Aether's agents (`aether:lead`, `aether:writer`, `aether:judge` and the rest), and nothing in it behaves like the Lead.

**Why.** Plain `claude` is normal mode, and the plugin sleeps there. Aether's mod (`plugins/aether/hooks/register.js`) withholds every `aether:` agent from a session that the Lead did not start, and records and runs nothing in it; the session-start hook and aether-guard do nothing in it either. The Lead's rules are the `using-aether` skill, which sets `disable-model-invocation`, so the model never loads it on its own: the session-start hook injects it, and only when the session's agent is `aether:lead`. Aether mode is chosen when a session starts, with `--agent aether:lead`.

**What to do.** Start the session as the Lead:

    claude --agent aether:lead --effort xhigh

[Getting started](../getting-started.md#start) has the whole start. The launcher runs the same command with permissions bypassed, superpowers off for the session, and irreversible commands refused; `/aether:first-setup` installs it as a short command, and `scripts/aether-lead` is it in a clone. When even a session started this way shows nothing of Aether, `claude plugin list` shows whether `aether@aether-plugin` is installed and enabled, and [Getting started](../getting-started.md#install) installs it.

## The Aether theme does not show

**What you see.** An Aether session has Claude Code's own colors and not the violet of the Aether theme, and `/theme` does not list Aether.

**Why.** The launcher selects the theme in the `--settings` of the session, so it shows only in a session the launcher started. The usual cause is an old copy of the launcher: a file copied out of `scripts/aether-lead` before the theme existed has no `theme` entry, and a copy never follows the plugin when it updates. Two others: the session was started with plain `claude`, or with a command of Install written before the `theme` entry; and the terminal has no true color, which the theme needs.

**What to do.** Run `/aether:first-setup`. The command it installs runs the launcher of the newest installed release each time, so it does not go stale. When your old copy has the same name, the setup writes nothing and says the name is taken, because it never replaces a file that is not its own: use another name, or delete the old copy yourself. `/theme` lists the theme as Aether, from aether ([Getting started](../getting-started.md#the-theme)).

## The design or the swarm does not start

**What you see.** The Lead cannot launch `/aether:design` or `/aether:run`, or says that workflows are off.

**Why.** `/aether:design` and the swarm are dynamic workflows. A session with dynamic workflows off has no `Workflow` tool, so there is nothing for the Lead to launch.

**What to do.** Turn on Dynamic workflows in `/config` and start a new session. Meanwhile the Lead does not design by hand. If a plan is already approved, the Lead offers to build it task by task, each as a delegate task: on Sonnet, or on Opus when the task's Tier is opus.

Three other causes end in a swarm that is not running:
- **A compile on `main`.** `aether-plan compile` stops with `refusing to compile on main: run aether-plan from the integration worktree, or pass --allow-main`. The swarm never runs on `main`: create an integration worktree on a feature branch with `git worktree add <path> -b <feature branch>`, and compile from it.
- **An autonomous run at its ceiling.** The Lead runs `aether-autonomy status` before every launch, and launches nothing while its `stop` is not null: the run's hours (`time`) or dollars (`cost`) are spent (see [Autonomy](autonomy.md#autonomy)).
- **A headless session.** In `claude -p`, Claude Code stops background work 10 minutes after the last turn, and that includes the run. Start such a session with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, which waits for the run however long it takes.

## A plan does not pass the check

**What you see.** `aether-plan check <plan.md>` exits with 1 and prints a JSON line with `"ok":false` and a list of `errors`. The Lead runs the same check before it compiles, and `aether-plan compile` refuses a plan that fails it.

**Why and what to do.** These are the messages seen most, each with its fix:
- **`The plan is a chain: every wave holds one task.`** A plan of three or more tasks in which each task has to wait for the one before runs one task at a time. Decompose it again so that independent tasks do not depend on each other, or drop a `Depends on` that is not needed. A plan that merely averages under 1.5 tasks per wave gets the warning `Low parallelism`, which does not fail the check.
- **`Task N and Task M run in the same wave but both own ...`** Two tasks with no dependency between them own overlapping paths. Narrow the `Owns` of one of them, or make one depend on the other so they run in different waves.
- **`Task N: missing the **Aether:** block.`** The task has no line that is exactly `**Aether:**` followed by its list of fields. Add the block with `Tier`, `Area`, `Owns` and `Depends on`.
- **`Task N: missing Tier.`**, **`Task N: Tier must be haiku, sonnet or opus ...`** or **`Task N: sonnet low is not used for implementers; ...`** The line reads `- Tier: sonnet high — reason`: a model, an optional effort, a dash and the reason. Sonnet and Opus run at `high`, `xhigh` or `max`; only Haiku takes `low` or `medium`.
- **`Task N: "Depends on: ..." needs the form "Task N — reason".`** Write one line per dependency, such as `- Depends on: Task 2 — needs its interface`, with the reason after the dash. A task that depends on nothing says `- Depends on: none`; leaving the line out gives `missing "Depends on"`.
- **`Task N owns 7 paths; a task that large often ends without its report ...`** A task that owns more than six paths gets this as a warning, and one that owns the whole tree gets `Task N owns the whole tree ...`. The check still passes, but split the task, because a unit that large often ends without its report. When one still does, the next attempt is a split pass: one sub-attempt per owned file, each with its own report, at most eight of them.
- **`The plan has no "## Aether Execution" section.`** or **`Aether Execution: "Test command" is missing.`** The plan needs the section `## Aether Execution` with a line `- Test command: ...`. Its `Max agents` line is optional, and so is its `Ladder` line, which when present names all three models: `- Ladder: haiku 2, sonnet 2, opus 1`.
- **`Task numbers must run from 1 without gaps`.** Number the tasks `### Task 1: ...`, `### Task 2: ...` with no number missing.

## The session stops at a permission prompt

**What you see.** The Lead, or a run's agents, wait at a Claude Code prompt that asks you to approve a tool call, and nothing moves until you answer.

**Why.** A permission that asks stops a run like a question: the session waits at it, and an autonomous run waits at the first prompt. The plugin never changes the session's permissions, so the way you started the session decides. The swarm's agents use Bash for `git`, `aether-wt`, `aether-lane` and the test command, and edit files under `.aether/worktrees/`.

**What to do.** Start the session with a permission mode or allow rules of your choice that cover those calls. Or start it with the launcher (the short command `/aether:first-setup` installs, or `scripts/aether-lead` in a clone), which sets `--permission-mode bypassPermissions`. With no prompts left, aether-guard is the only check on an irreversible command, so the launcher also sets `AETHER_IRREVERSIBLE=enforce` (see the next section). If the session started inside the integration worktree, add the main checkout with `/add-dir <repoRoot>`, so the agents may read and edit there.

## A command was refused or recorded

**What you see.** A Bash command was refused with a message that starts `Aether added this ... command to the owner's list (.aether/pending.jsonl)`, or it ran and a line appeared in `.aether/pending.jsonl` in the main checkout, one JSON line for each command.

**Why.** In an Aether session, aether-guard watches every Bash call for six irreversible classes, each by the commands it recognizes:
- `push`: `git push`, except a dry run;
- `merge-main`: `gh pr merge`;
- `publish`: `npm publish`, `cargo publish`, `docker push`, `gh release create` and the like;
- `deploy`: `kubectl apply`, `terraform apply`, `helm upgrade`, `fly deploy`, `vercel --prod` and the like;
- `delete`: `git reset --hard`, `git clean -f`, `git branch -D`, and `rm -rf` of a wide target such as `/`, `~` or `.`;
- `credentials`: `gh auth login`, `gh secret set`, `npm token create`, `aws configure` and the like.

A command of one of these classes that no grant covers is appended to the list with its class, the command, its working directory and its `mode`, and its secret values are redacted. What happens next depends on `AETHER_IRREVERSIBLE`:
- `enforce`: the command is refused, and the Lead puts the entry in the "Espera tu sí" of its brief. `scripts/aether-lead` sets it unless your shell already did.
- anything else, `log` by default: the command is only recorded, and it runs. The Lead reports it under "Hice" in its brief.

A dry run (`--dry-run`, or `-n` for `git push`) is not irreversible and is not recorded. Outside a git repository the command is allowed unrecorded. `aether-autonomy` has a seventh class, `paid-call`, for real paid model calls outside the swarm: the Lead honours it, and the guard detects none of them by command.

**What to do.**
- To let such an action run, say so to the Lead in your own words. A general authorization, such as «todos los merges a main», is recorded by the Lead with `aether-autonomy grant --class <class> --quote "<your words>"`, and holds in the repository until revoked; add `--scope session` for your words «en esta sesión». The quote must be at least 12 characters, found in your own messages of the session: a quote that is not there is rejected. `aether-autonomy list` shows the registry, and `aether-autonomy revoke --class <class> --quote "<your words>" --all` withdraws every grant of a class; without `--all` it removes only the current session's session grants.
- An authorization of one action, such as a bare «sí», covers that action once. Under `enforce` the guard still refuses it until a grant covers its class, so the Lead records a session grant, runs the action, and revokes the grant. When your reply is shorter than 12 characters, the Lead puts the exact command in the brief for you to run yourself.
- The registry and each run's `run.json` under `.aether/autonomy/` are written only by `aether-autonomy`; aether-guard refuses a direct edit of them. It also refuses an edit of a spec, a plan or a task file, or of the constitution, by any agent other than the Lead and the Writer.

## Nothing runs on a lane

**What you see.** A swarm run is native from end to end: no calls on other harnesses in its report, or `aether-plan compile` prints a line on stderr that starts `aether-plan: superdelegation`.

**Why.** Superdelegation is off, or no harness is ready to take a call. The causes, in the order to check them:
- **The `superdelegation` option is off, or the machine is not Linux.** `superdelegation`, off by default, and it runs only on Linux. Compile says `aether-plan: superdelegation is off: the aether plugin's superdelegation option is not on` or `aether-plan: superdelegation is off: superdelegation needs Linux`. An old `lanes` value only counts when `superdelegation` is not set (see [Options](options.md#options)).
- **The harness is not in `harnesses`.** `harnesses`, `agy` by default, lists the harnesses superdelegation may use. A name that is not `agy`, `codex`, `grok`, `cursor` or `muse` is ignored, and a list with no valid name means `agy`. `aether-lane status <run>` shows `enabled: false` for a harness that is not listed.
- **Its CLI is not installed, or is not on the `PATH` Aether sees.** Compile says `aether-plan: superdelegation: <harness> is enabled but is not installed: <command> was not found`, and `aether-lane quota` says `not installed (<command> was not found on PATH)`. Aether looks on the `PATH` of the process that runs the command, and with `ops` on the workflow's `aether-lane` commands run in Claude Code's own environment, not in your shell's, so a directory that only your shell profile adds can be missing there.
- **The harness has no models in the lane table.** Compile names it with `has no models in the lane table yet`. Codex and Cursor ship that way: add theirs as [Lanes](lanes.md#lanes) explains. Muse ships with three models, `muse-wonder-1.0`, `muse-wonder-full-1.0` and `muse-spark-1.3`, in the table by the owner's decision: see [Muse](lanes.md#muse).
- **The group is marked dry or is under its reserve.** A call that ended for quota leaves a dry mark: until the group's reset when a reading with a balance shows it under the reserve, and otherwise for 60 minutes. `aether-lane pick` prints, for a call, the candidates with the reason each was passed over (`harness-off`, `not-installed`, `excluded`, `author`, `dry`, `no-cost`, `dominated` or `below`), `aether-lane status <run>` shows the groups the run read, and `aether-lane quota` shows each group's windows.
- **The run was compiled with `--no-lanes`.**

**What to do.** Fix the cause that `aether-plan compile`, `aether-lane quota` or `aether-lane status <run>` names. The options are read when a session starts, so after you change one, start a new session. [Options](options.md#options) lists them, and [Lanes](lanes.md#lanes) holds the rule: how a call picks its pair and when it falls back to the native agent.

## The /harnesses panel is not offered

**What you see.** Typing `/harnesses` offers nothing, or Claude Code says it does not know the command. Typing `/spend` does the same.

**Why.** `/harnesses` is a command of Aether's mod, and the mod declares it only in an Aether session, the one started with the agent `aether:lead`. `/spend` is not offered outside an Aether session either, for the same reason. A plain `claude` session has neither, on purpose: nothing of either panel runs there. The panels also use Claude Code's plugin UI API for mods, which is early access, so a Claude Code release that changes it can make a pane stop drawing; nothing else of Aether depends on it.

**What to do.** Start the session with the launcher, or with `claude --agent aether:lead --effort xhigh` ([Getting started](../getting-started.md#start)). If a session started that way still does not offer `/harnesses` or `/spend`, check that the plugin is installed and enabled with `claude plugin list`, and see [the /harnesses panel](lanes.md#the-harnesses-panel) for the Claude Code version it was checked on and [the /spend panel](lanes.md#the-spend-panel).

## The /harnesses panel shows few rows or looks cut

**What you see.** The pane shows only a line or two for each harness, or less than the guide describes, or its bottom is cut.

**Why.** The pane fits the room it has. In a narrow or short terminal it drops detail in steps, and it always keeps the title, the options line, the buttons and one line per enabled harness group. From 110 columns in the fullscreen layout it docks to the right of the transcript; below that it sits above the prompt and takes rows from the transcript.

**What to do.** Widen or heighten the terminal and the pane redraws with more detail. While the pane has the keyboard, the arrow keys scroll the rest. `r` renews the readings and `Esc` or `x` closes the pane.

## The /harnesses panel says «Quota unavailable» or «enabled, not installed»

**What you see.** A line `Quota unavailable: …` where a harness's rows should be, or a harness marked `enabled, not installed`.

**Why.** The panel reads the quota by running `aether-lane quota --json <harness>`. `Quota unavailable: …` carries the reason the read gave, and `Delegates unavailable: …` does the same for the list of recent delegates, which the panel reads with `aether-report --delegates`. `enabled, not installed` means the harness is in the `harnesses` option but its CLI was not found. Aether looks on the `PATH` of the process that runs the command, which is Claude Code's own, not your shell's, so a directory that only your shell profile adds can be missing there. A harness that is installed but not in `harnesses` shows `not enabled` instead.

**What to do.** Run `aether-lane quota <harness>` in the shell that started Claude Code to see the same reason in full. Check that the harness's CLI is on the `PATH` Claude Code was started with (`which agy`, `which grok`), install it or fix the `PATH`, and start a new session; or remove the name from `harnesses` if you do not mean to use it. `r` in the panel reads the quota again.

## A merge fails or times out

**What you see.** A unit is blocked with a reason that starts `merge failed again:` (the test command failed after the merge, or a conflict, twice), `merge refused:` (for example, `the integration worktree has uncommitted changes`), `merge failed:` (the command could not run), or `its merge commit is on the integration branch without a passing test run` (a merge stopped at 10 minutes whose rerun was stopped too).

**Why and what to do.**
- **A new test fails.** The merge is undone, and the unit gets one more attempt with the failure in its brief; a second failure blocks it. A conflict gets the same one retry. Tests that were already failing when the run was compiled are the run's baseline: they do not block a merge, and a merge that passes with them lists them as `knownFailures`. With `--no-baseline` any failing test blocks. A failing run whose output names no test cannot be told from the known ones, so it blocks too.
- **The integration worktree has uncommitted changes.** A merge refuses to start then. Commit or stash the changes, and edit nothing in the integration worktree while a run is going. When a unit is unverified, discard or stash the changes and never commit them: a commit lands on top of the unverified merge and buries it.
- **The tests take more than 10 minutes.** The command that runs the merge is stopped at 10 minutes (600 s), after its merge commit and before the tests finish. The unit is unverified. The run asks `aether-wt status` and runs the merge again, which reruns the plan's tests and does not make a second merge commit. Tests that pass count the unit merged. Tests that fail revert the commit, and the unit gets one more attempt, as any failing merge does. A merge cut twice leaves the unit blocked, with its commit on the integration branch and its marker kept; its reason is `its merge commit is on the integration branch without a passing test run`. Every later merge is refused with `unverified-other` until the Lead settles that unit. Settle that unit before relaunching it. The Lead settles it by running `aether-wt merge <run> <task>` again, which reruns the tests, or, when that commit is still the tip of the integration branch, by dropping it with `git reset --hard <commit>^1` after checking that the unit's branch was kept. When that commit is no longer the tip because something was committed on top, the Lead runs the plan's tests by hand on the integration branch; when they pass, deletes the unit's marker file in the run's `unverified/` directory (`.aether/runs/<run>/unverified/<task>.json`) and the unit counts as merged; when they fail, fixes forward; never `git reset` past work that is not the unverified commit. A marker of a task that `--only` dropped from the graph cannot be settled while it is out of the graph: recompile with that task included, then `aether-wt merge <run> <task>`. If a merge was killed inside `git merge` and later merges answer `dirty-integration`, run `aether-wt merge <run> <that task>` for the unit whose merge was killed: it aborts the leftover merge and clears its marker. A relaunch that adds commits on the unit branch first is refused with `unverified-moved`, and the rerun does not run: the old merge would be tested and the unit reported merged while the new commits stayed only on the branch. Shorten the plan's `Test command` so one run ends inside 10 minutes, and relaunch that unit only once it is settled. With an unverified unit, discard or stash uncommitted changes in the integration worktree and never commit them. With `ops` on, a cut says `aether-wt merge was still running after 600 s and was stopped`.
- **The test command needs your shell's environment.** With `ops`, on by default, the workflow's `aether-wt` and `aether-lane` commands run in the mod, in Claude Code's own environment, so the tests they start do not see what only your shell sets. Make the test command work without it, or turn `ops` off: the Haiku ops agent then runs them with the Bash tool, as before 0.8. [Ops without a model](ops.md) explains the two paths, and [Options](options.md#options) the option. Start a new session after you change it.

## An update does not take

**What you see.** After `claude plugin update aether@aether-plugin` and a new session, the plugin is still at its old version, or a `ref` that you changed in your settings did not move it.

**Why.** An update takes effect in a session that starts after it: the command ends with `Restart to apply changes.` When a new session still shows the old version, or does not pick up a `ref` that you changed, look at the session's network traffic. In Aether's acceptance runs a session started with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` did not fetch a changed `ref`, and the same session without that variable did at once. The variable is the probable cause; the runs did not isolate it.

**What to do.** Start one session with the variable unset, and run `claude plugin update aether@aether-plugin` again. [Maintenance](maintenance.md#update-pin-roll-back-and-uninstall) has the update, the pin and the roll back.

## Worktrees or branches are left behind

**What you see.** `git worktree list` shows paths under `.aether/worktrees/<run>/`, or `git branch` shows branches named `aether/<run>/<task>`, after a run was interrupted or when `cleanup.remaining` in a run's result is not empty.

**Why.** A run that finishes is removed when the Lead runs `aether-report finalize`. One that was killed, or whose unit could not be closed, leaves its worktrees and branches in place.

**What to do.**
- **One unit.** `aether-wt remove <run> <task>` removes its worktree and its branch. A unit's unmerged or uncommitted work is saved first as a patch, `.aether/runs/<run>/patches/<task>.patch`; `--keep-patch` saves one even when everything was merged. Read a patch before you apply it with `git apply`.
- **A whole run.** `aether-wt sweep --run <run>` saves each unit's unsaved work as a patch, stops the run's lane processes, and removes its worktrees, branches and lane copies. A unit whose work it cannot save stays in place. `--finish` also deletes the run's directory.
- **Old runs.** `aether-wt sweep --stale` removes the runs that were never finalized and have had no activity for 24 hours, and `--hours N` changes the 24. The session-start hook does the same on its own, in the session's repository, on startup, clear and compact, so a run left alone for a day goes the next time you start an Aether session. A run touched in the last 24 hours is not swept: use `aether-wt sweep --run` for it. Each run removed this way is recorded as abandoned in `runs.jsonl`, with the tip commit of every branch it deleted, and its directory goes too, patches included.

## A unit comes back blocked

**What you see.** In a run's result a unit has the status `blocked`, `skipped` or `not-run`, with a `reason`, instead of `merged`.

**Why.**
- **`blocked`:**
  - the ladder is spent: every attempt of each rung was used (`haiku 2, sonnet 2, opus 1` unless the plan's `Ladder` says otherwise) and the unit still did not pass;
  - the same findings came back three times, or the unit ended twice in a row without its report: after one attempt ends without its report, the next is a split pass of one sub-attempt per owned file (eight at most; further files share the last). A pass that also ends without a report blocks the unit. The task is too large or cut wrong and needs a split or a redesign;
  - a merge failure came back after its one retry, or the merge was refused: see [A merge fails or times out](#a-merge-fails-or-times-out);
  - the supervisor blocked it with a question, or a lane changed the integration worktree or branch, or a read-only copy changed the unit (a reason that starts `lane:`).
- **`skipped`:** a task it depends on did not merge, so it did not start.
- **`not-run`:** the run's agent budget was spent (`Max agents`, 200 unless the plan says otherwise). The budget counts model agents only; the ops commands the mod answers without a model are reported in the run's agent counts but do not spend it.

**What to do.** Nothing, in most cases: the Lead acts, not you. It answers a question from your intent, the spec and the plan when they cover it; fixes a merge failure or a spent ladder itself, or sends it to a delegate task; has the Writer split a task that failed repeatedly; and relaunches the unit, with `aether-plan compile <plan.md> --run <run> --only task-3,task-5` and the workflow again. A `skipped` or `not-run` unit is relaunched the same way once its dependencies are merged. A launch that ends with a unit still `blocked`, `skipped` or `not-run` does not run the final review: see [The final review has not run](#the-final-review-has-not-run). A question that your intent does not cover reaches you: the Lead asks you outside an autonomous run, and in one it waits in the "Espera tu sí" of the brief. A unit's unmerged work is kept as a patch under `.aether/runs/<run>/patches/` until the run is finalized or swept as stale.

## A delegate task is refused or does not climb

**What you see.** `aether-delegate verdict` answers `ok: false` with an error, or a delegate task stays on the same model after several verdicts, or a launch answers only that the task is `approved` or `exhausted`.

**Why.** The ladder refuses what would break its rules (see [Delegates](delegates.md#the-ladder)). The errors, and what each means:
- **`finding not accepted` or `a fix needs at least one finding`.** A finding is `file[:line]: what is missing`. One with no file, or with nothing said about what is missing, is not a finding.
- **`an infeasible declaration needs a reason, written`,** or `starting from scratch needs a reason, written`. The step does not move without the reason.
- **`checks failed: …`.** A check that needs no model failed, and a result that fails one cannot be approved: for an editing task, its tests, the files touched outside what it owns, or an empty change; for a read-only one, a file changed in the checkout or an empty answer. For an editing delegate that ran on Claude, `approve needs the worktree of the attempt (--worktree)` says the checks had nothing to run on; for a read-only one, `approve needs the answer of the attempt` says the mod has not recorded it yet, so wait for the agent to end.
- **`the verdict must be approve, fix or infeasible`.** `--verdict` takes one of those three words.
- **`unknown task`.** The id has no launch in the log: the id of the verdict must be the one of the `AETHER-TASK:` line, or the one the system gave the call in its note.
- **`the task is approved` or `the task is exhausted`.** The task is closed: no verdict is accepted after it, and new work takes a new id.
- **It does not climb.** A step climbs when its corrections are spent, when the same findings come back twice in a row, or on a declaration of infeasible with a reason. Findings that differ each time spend a correction each; `plugins/aether/config/ladder.json` holds how many.
- **A model the Lead asked for was not used.** The system holds the step: what a call passes as model or effort is ignored, and the `launch` entry of the log keeps it.

**What to do.** Fix the verdict as the error says and send it again. `aether-report --delegates` shows, per step, what happened to each task, and `<dataDir>/delegates/log.jsonl` holds every entry (see [Data](maintenance.md#data)).

## The final review has not run

**What you see.** A run's result has `finalReview.status` of `deferred`, and `aether-report` shows the same status with its reason. No reviewer ran. The reason counts how many units are blocked, skipped or not run.

**Why.** The final review runs once per run, when a launch ends with all its units merged, on the whole change from the first compile's base to the integration branch. A launch that leaves a unit `blocked`, `skipped` or `not-run` defers it, and so does a launch that runs no unit. A relaunch in between does not review again. `deferred` is not a failure, and it is not a review that was skipped because nothing merged.

**What to do.** The Lead relaunches the units that are blocked, skipped or not run. When that launch merges all of them, the review runs once. To review what is already merged and stop without the units still open, the Lead adds `"review": true` to the workflow args and launches again. A compile that finds every unit already merged prints empty `waves`; that launch reviews only when `review` is true.
