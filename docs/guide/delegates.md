---
title: Delegates
description: How a delegate task of the Lead runs on the ladder of models: it starts on Haiku and the system holds the step, a correction works on top of what was done, the three causes of a rise, who judges and the checks that run first, where it runs and which pair is chosen, the log, what happens when a pair fails, and how the owner can place a task on Sonnet or Opus
order: 7
---

# Delegates

A delegate task is bounded work that the Lead hands to one subagent. The system, not the Lead, decides what the delegate runs on and keeps its history: it starts on Haiku, is corrected on top of its own work, and climbs to Sonnet and then to Opus only when it must. This page is how that behaves. The options that touch it (`superdelegation`, `harnesses` and `deadlines`) are in [Options](options.md#options); the rules the Lead follows are in [the delegate ladder](../../plugins/aether/skills/using-aether/SKILL.md#the-delegate-ladder) of its guide; the design is [spec 013](../../specs/013-delegate-ladder/spec.md).

## What it does

- **Only the Lead's delegate tasks.** The mod looks at the `Agent` calls of the Lead whose agent is not an `aether:*` one. The swarm starts every unit on the first rung of `config/ladder.json` and raises it by the same policy as the delegates. The design seats and the swarm's calls follow the `superdelegation` rule in [Lanes](lanes.md#lanes), and the `aether:*` agents keep their own model and effort. The Lead's own model is not touched.
- **The system holds the step.** Every delegate task starts on Haiku. The rule is that the Lead passes neither a model nor an effort, and what it passes is ignored; the log keeps what it asked for and that it was ignored. The exception is a task the owner placed on Sonnet or Opus in their own words: it starts on that model ([Placing a task](#placing-a-task)). A delegate task is never a fork, because a fork always runs on the Lead's model.
- **The mod does the work.** `plugins/aether/hooks/delegate.mjs` hooks the `Agent` tool and talks to `aether-delegate`, which holds the policy. In a session that is not an Aether session it does nothing. Any failure of the mod (an exception, a bin that fails, an answer it cannot read) leaves the call as the Lead made it.
- **What was decided can be read.** Every attempt, check and verdict goes to a log in the plugin's data directory, and `aether-report --delegates` shows, per step, how many tasks passed, how many attempts and corrections they took, how many were approved and why the rest climbed (see [The log](#the-log)).

## The ladder

The ladder is three steps, and their numbers are data in `plugins/aether/config/ladder.json`, not code. A change to a number there is all a change takes.

| Step | Corrections | Effort at first | Effort on a correction or a rise |
|---|---|---|---|
| Haiku | 5 | `high` | `xhigh` |
| Sonnet | 2 | `high` | `high` |
| Opus | 1 | `high` | `high` |

In Sonnet and Opus a correction and a rise run at `high`, the same effort as at first: there a correction changes what the model knows (its own earlier work and the Lead's findings), not how hard it thinks. The next effort costs 2.3 times more in Sonnet and 1.9 times more in Opus (the cost per task of the Artificial Analysis index, in `config/pairs.json`) for 13 and 3 more points in code (Terminal-Bench 4.0). So the ladder's effort for a correction in those two steps is `high`. Decision A87 still applies: a correction raises the effort a step where the ladder allows it, which happens in Haiku, from `high` to `xhigh`. A task reaches Sonnet or Opus by a rise, which lands at the effort the ladder allows for a correction, so there was no step to take there when that effort was `xhigh` either; what changed is the effort itself, from `xhigh` to `high`. The swarm does the same: a retry in Haiku rises from `high` to `xhigh`, and in Sonnet and Opus stays at `high` (see [Models by role](models-by-role.md)). The ladder's part is two numbers of `config/ladder.json`, and they are reverted there.

The same file holds how many times the same findings may come back before the task climbs, `repeatFindings`, which is 2. The owner chose these numbers and asked to watch them, so that they can be calibrated later if they need to be: the report shows how often each step approves.

- **A correction works on top of what was done.** When a result is not good enough the Lead does not climb: it asks the same model (same harness and model, one effort up when the pair table has one and the ladder allows it) to correct it. The delegate receives its own earlier work, the patch of an editing task or the earlier answer of a read-only one, and the Lead's findings, each with a file, a line when it has one and what is missing. A finding with no file, or with no "what is missing", is refused. Each step has its corrections, and a correction is spent by a verdict, not by a launch.
- **A task climbs for three causes, and only these:**
  1. the corrections of the step are spent and the last attempt is still not good (`exhausted`);
  2. the same findings come back, twice in a row (`repeated`), even when the step has corrections left;
  3. the Lead declares the task infeasible for that model and writes the reason (`infeasible`). A declaration with no reason is refused, and the step does not move.
- **A rise hands over the earlier work.** The next step receives the patch or the answer of the work before, the Lead's findings and the reason for the rise, because a model that is given the earlier work and what is wrong with it can fix it, and throwing it away costs time and money. The Lead may instead declare, with a reason, that the work must start from scratch (`--from-scratch`): then the next launch receives no patch and no findings, only the reason, and the log notes it.
- **After Opus there is no step.** When Opus has spent its correction and the result is still not good, or the Lead declares it infeasible on Opus, the verdict is `exhausted` and the delegate task ends. The Lead defers the task, or puts it on the owner's list, by its repetition rule. A launch of that id afterwards only answers that the task is exhausted; an id that was approved is closed the same way, and new work takes a new id.
- **A relaunch under another id is noted.** A launch with a new id whose owned files and tests match those of a task of the same session that did not end approved is written in the log as a relaunch of that task, and `aether-report --delegates` lists it.

## Placing a task

The owner can put one delegate task on Sonnet or Opus. Every delegate still starts on Haiku: a task moves up only when the owner's own words name the model and the Lead records them. The design is [spec 021](../../specs/021-owner-model-authorization/design.md), and its decision is A99.

- **Asking.** The owner names the model in their own words, for example «redacta ese archivo de nuevo en español natural; despliega un agente que lo haga en Opus». Words such as «el más fuerte» name no model: the Lead asks which one, and records nothing until the owner does.
- **Recording.** The Lead runs `aether-delegate authorize --model <sonnet|opus> --quote '<their words>' (--task <id> | --scope session)`. A task scope covers only the task whose `AETHER-TASK` id matches; a session scope covers every delegate task of the session. Words about one piece of work are a task scope, and general words about the session's delegates are a session scope. An Opus record also covers asking for Sonnet; a Sonnet record does not cover Opus.
- **What is checked.** The quote must be in the messages the owner wrote in this session's transcript, be at least 12 characters, and name the model as a whole word. The check runs again every time a record is used, because the delegates' log is not guarded by `aether-guard`: a line added by hand, with a quote the owner did not write, covers nothing. A failed check writes nothing and prints the error.
- **Launching.** The Lead passes `model` on the `Agent` call of a task that a record covers. The task starts on that model at the effort of its step, and its first `launch` line carries `authorized`. A record made after the task's first launch does not move it; a new id is a new task. When no record covers the call, the task starts on Haiku as usual, the model is ignored and logged, and the Lead gets a note that says so and how to record an authorization.
- **Climbing.** The task then climbs the same ladder from its step: Opus has one correction and is then exhausted, and Sonnet has two corrections and then rises to Opus. The Lead never raises a model on its own reason alone; declaring a task infeasible with a reason still raises it one step.
- **Where it runs.** A task the owner placed runs on Claude, at its model, for every attempt, even with `superdelegation` on. No other harness takes it, and no pair is chosen for it.
- **In the log and the report.** The `authorize` line of `delegates/log.jsonl` holds the scope, the task, the model, the quote and its time. In `aether-report --delegates`, the row of such a task carries `authorized: { model, scope }`, and the brief's Asequible line counts these tasks.
- **Limits.** The effort stays the ladder's: the owner cannot ask for one. There is no standing permission for a repository, only for a task or for a session. The swarm and the design seats do not change; this covers the Lead's delegate tasks only.

## The brief of a call

Every delegate call carries these lines in its brief:

- `AETHER-TASK: <id>`: the task's name, of letters, digits, `-` and `_`. A correction or a rise is launched with the same id, and the system adds the earlier work and the findings to the brief; a new id is a new task. A call with no such line gets an id from the system, and a note to the Lead names it, because a verdict is made on an id.
- `AETHER-OWNS: <globs>` and `AETHER-TESTS: <command>`, when the task edits: the files it may touch, comma-separated, and the command that proves it works. Without `AETHER-OWNS:` the task is read-only: touching any file of the checkout fails it, and so does an empty answer.

A delegate that edits and runs on Claude works with `isolation: "worktree"`, which the system puts on the call.

## Who judges

The Lead decides whether the work is good. Before it does, the checks that need no model run, and the result brings them.

- **For a task that edits:** the tests the task named, the files touched outside what the task owns, and an empty task, one that changed nothing.
- **For a read-only task:** that nothing in the checkout changed, where any file touched counts as outside what the task owns, and that the answer is not empty.
- **From another harness** an editing delegate also brings the tests it ran and the verdict of a review by a pair that did not write it. The Lead reads the whole diff only when the checks and the review contradict each other or are missing, as they are for a delegate on Claude, which has no review.

The checks run without a model and before the verdict, so a result that fails one of them cannot be approved. The verdict is one of three, and it only counts when it goes through `aether-delegate verdict`; a verdict given any other way does not count, and neither raises the step nor closes the task.

A read-only delegate can be charged with a file that another writer of the same checkout changed while it ran, such as the Writer of a design run, which the delegate did not touch. The refusal names those files and says how to continue: the Lead judges again with `--ignore '<glob>'` for each file that is not the delegate's doing (a file's own path works as the glob). Each `--ignore` leaves out the files it matches, every other changed file still fails the check, and the globs are recorded in the verdict's line of the log. `--ignore` is only for a read-only task: an editing task is checked by what it owns, so the verdict refuses it.

- `approve` closes the task. It is refused when a check failed, and for an editing delegate on Claude it needs the worktree of the attempt, `--worktree`, or the checks of its result. Then the Lead merges the branch of an editing delegate itself, one at a time, with the `aether-wt merge` line the result gives.
- `fix` sends the work back to the same model, one effort up when its harness has one, with the findings, each `--finding 'file:line: what is missing'`.
- `infeasible --reason <text>` declares the task out of reach of this model. Add `--from-scratch`, with a reason, to a `fix` or an `infeasible` only to throw the earlier work away.

## aether-delegate

`aether-delegate` is the bin that holds the ladder. Each verb prints one JSON line and none of them merges or pushes. The Lead uses `verdict` and `authorize`; the mod uses the rest.

- `begin --session <id> --input <file>`: takes the `Agent` call the mod caught and says how the attempt runs: the step's model and effort, the brief with the findings and the earlier work a correction or a rise carries, the isolation of an editing task, and the external pair when there is one. It writes the `launch` entry.
- `verdict --task <id> --verdict <approve, fix or infeasible> [--reason <text>] [--finding <file[:line]: what is missing>]... [--from-scratch] [--worktree <path>] [--ignore <glob>]...`: judges the last attempt, runs the checks before an `approve`, and says what the next launch is. `--ignore` leaves out of a read-only check the files another writer of the checkout changed.
- `authorize --model <sonnet|opus> --quote <the owner's words> (--task <id> | --scope session) [--session <id>]`: records the owner's words that place a task, or the session's delegates, on a model, after checking the quote (see [Placing a task](#placing-a-task)). It writes an `authorize` line to the log and prints it, or prints an error and writes nothing.
- `start --id <id>`, `run --id <id>` and `wait --id <id> --seconds <n>`: launch an attempt that runs on another harness in a process of its own and return at once, do it, and poll for its result for up to `n` seconds (540 at most).
- `answer --session <id> --task <id> --attempt <n> --text <text>`: records the final answer of a read-only delegate that ran on Claude, so that the verdict can check it.
- `renew --harness <agy, codex, grok or muse>`: takes a fresh quota reading and saves it where the choice of the pair reads it.

## How a delegate runs

Every delegate task, of reading or of editing, is an `Agent` call, and it shows in Claude Code as an agent at work for as long as it lasts, wherever it runs.

- **On Claude.** A task runs on Claude, as the step's model and effort, when `superdelegation` is off, when no pair of another harness reaches the points of the step, when the call names an agent of its own (it has a `subagent_type` other than `general-purpose` or `Explore`, because another harness would not get that agent's instructions or tool limits), or when the pair fails. A task the owner placed on a model always runs on Claude, at that model ([Placing a task](#placing-a-task)). A read-only task works in the Lead's checkout, and the mod records its final answer with `aether-delegate answer`.
- **On another harness.** With `superdelegation` on and a pair that reaches the points of the step, the mod hands the call to that pair. It starts the attempt, waits for it in turns of at most 540 seconds, and gives the Lead the delegate's text as the agent's answer, without a model request for the delegate's work. The engine kills an agent whose step shows no progress for 600 seconds, so after each wait that did not end the mod yields a line, `[Aether: the delegate is still working, N min so far]`, and the agent stays alive past 10 minutes; the mod waits up to an hour. The measure is in the evidence of spec 013. It was made with a simulated delegate of 18 minutes, not with a real harness.
- **A task that edits** goes through `aether-lane delegate` (see [Delegates that edit](lanes.md#delegates-that-edit)). It runs in a unit worktree outside the Lead's checkout, with the files it owns and the tests to run, and comes back as a branch with the tests it ran and the review of another pair. It never touches the Lead's checkout, and the Lead merges it with `aether-wt merge`. A correction goes to the same model, one effort up, with its own patch and the findings; when that command finds no candidate, the attempt runs on Claude with the same corrections and the same climbing.
- **A read-only task** runs in a disposable worktree of the current commit. If it changed anything there, its answer is thrown away and the task runs on Claude. That check covers the copy only: a delegate that follows an absolute path into your checkout is not caught (see Containment in [Lanes](lanes.md#lanes)). A checkout with uncommitted changes is not delegated, because the copy is built from the last commit and the delegate would answer about older code; the task runs on Claude. Its text starts with a line that names the pair and says why Claude Code lists no tool uses or tokens for it.
- **The limits.** A read-only external delegate has 570 seconds in all and its CLI at most 360 seconds; they are in `plugins/aether/lib/delegate-limits.js`. Its brief also bounds its work: about 20 tool calls, every read and search counting, and then it answers with the best it has and says what it did not check ([issue 035](https://github.com/DarkArty07/aether-plugin/issues/54)). Cursor cannot run a delegate.

## The pair of a step

With `superdelegation` on, the pair for a step is chosen by the same function the swarm and the design seats ask (see [Lanes](lanes.md#lanes)); nothing about it changed with the ladder. The system gives it the Claude pair the step would run on, the step's model at the effort of this launch, and the function answers with the external pair that reaches the points of that pair, one point less at most. Among the pairs that do, the quota whose weekly window renews first goes first, and inside it the pair with the lowest cost per task. Speed decides nothing. What is not spent before the reset is lost. The design seats pass the author rule as an order of reserve: a pair of another family first, then the author's own family, and the native agent only last. The swarm, the final review and `aether-lane delegate` keep it as a bar. An external model takes the step only when that step's role is in the model's `roles` list in the lane table; when no external model lists the role, the native pair takes the call (`allowsRole` in `plugins/aether/lib/superdelegation.js`).

- **Agy, Codex, Grok and Muse.** A delegate may go to agy, codex, grok or muse when that harness is in the `harnesses` option. Cursor cannot. Spec 010 decided «codex y cursor por el momento no los adoptamos». The owner's words of 2026-10-29, «necesito comenzar a trabjar con codex asi como se trbaja con los demas harness», change that decision for Codex.
- **The reserve.** A group with a window under 5 % left is left out.
- **A valid reading.** A reading counts while it is within its life: 10 minutes for agy and for Codex, whose readings launch a process, and 30 minutes for the Grok log line and for Muse's observed allowance, and never past a window reset that came after the reading. A harness without a valid reading is left out of that choice. Muse's reading is the allowance its last call reported, kept in `lanes/quota/muse-observed.json`.
- **Renewing a reading.** A missing or expired reading of agy, Codex, Grok or Muse is renewed, and `begin` waits for it up to the quota limit (3 seconds by default, the `deadlines` option; 20 seconds when Muse is among the harnesses waited for, because its renewal is one minimal call of 5 to 12 seconds), but only for a harness that could serve the step: one whose every group is marked dry, or that has no pair at the points asked, is neither renewed nor waited for. The renewal is `aether-delegate renew`, that saves its reading where the choice reads it, because the lane code saves neither Grok's answer over ACP nor Muse's minimal call. Measured: Grok's takes 0.7 seconds and fits in the limit; agy's takes 5 seconds and never does, so when agy could serve the step and its reading expired, `begin` waits the whole limit and agy stays out of the choice ([issue 025](https://github.com/DarkArty07/aether-plugin/issues/35)); Muse's takes 5 to 12 seconds and lands inside its 20 seconds, or Muse stays out of that choice until the next decision.
- **A mark.** A reading with a balance does not lift the mark of a refusal, because agy's `/usage` does not show its individual limits; a mark that came from a reading is lifted when a fresh reading of its group, taken after the mark, shows every window above the reserve (decision A60). The explicit refusal of agy, "Individual quota reached", leaves a mark for 60 minutes, whatever reset the refusal says: agy's stated reset was wrong once, and a refused call costs no tokens, so the group is tried again every hour. The reset is kept in the mark as stated. The marks of delegates and of the swarm are read by both.
- **No pair reaches the points.** The delegate runs on Claude, as the step's model. A step that asks more than any external pair gives, such as Opus at `high` when no pair reaches its 53.6 points, never leaves.

agy's reading is not reliable for its Gemini group: it showed 98 % while the calls were refused with "Individual quota reached", because `/usage` does not report the individual limits. The truth is the refusal, and the delegates, the swarm and the design seats all leave a mark of it ([issue 021](https://github.com/DarkArty07/aether-plugin/issues/32), decision A60).

To see the readings the choice would use and the delegates that ran, inside Claude Code, open the [`/harnesses` panel](lanes.md#the-harnesses-panel) in an Aether session: it shows each harness's quota groups with their status, and the five newest delegations of the log.

## When a pair fails

A pair that fails to serve a call is not the same as a correction that did not work. A correction repeats the same model on purpose, one effort up, on top of its own work (decision A87). A pair that fails at its start, for quota or for time, is replaced and never repeated (decision A72), and that is not a correction: it spends none of the step's corrections, and the next pair that reaches the points takes the call.

- **An external delegate is refused at its start,** because its quota is gone and it used no tokens, or because its harness is missing or has no such model. The next candidate the choice ranked takes the call, skipping any whose quota group holds a live mark, up to three tries in all and only while the delegate's 570 seconds allow a CLI of at least 120 seconds. The answer says which pair gave it and which refused first.
- **An external delegate runs out of time.** A delegate killed at its limit is not a refusal: it had started, so no other candidate is tried and the task runs on Claude. Its pair, and only that pair, is kept out of the choice for 60 minutes, and its outcome says `timedOut`. The next delegate of that step goes to the next candidate, or to Claude at once; the same model at another effort, and the rest of its quota, stay available.
- **An external delegate fails in any other way,** including a quota that ran out during the call, a call that used tokens, a changed file or a checkout with uncommitted changes. The task runs on Claude, as the step's model. It runs on Claude too when every try was refused.
- **A quota refusal** leaves a mark, so the next choice, and the next try of the same delegate, do not use that group again for 60 minutes. The reset that the error states is shown, not held to: a provider may give a reset early, so the pair is tried again every hour (decision A75).
- **A correction keeps the pair.** The correction goes to the pair that did the earlier attempt, so that it finds its own work, unless that pair fails for quota, time or start; then the call is replaced as above, and the replacement receives the earlier patch when git accepts it.
- **The mod itself fails.** An exception, a bin that fails or a plan it cannot read leaves the call as the Lead made it, and the task runs on Claude.

## The log

Every launch, result, call, verdict and authorization is a line of `<dataDir>/delegates/log.jsonl`, where `<dataDir>` is the plugin's data directory (see [Data](maintenance.md#data)). The log is append-only and shared by every session, each entry is one write, so two sessions at once do not clash, and a text value of more than 4000 characters is trimmed before it is written. Each entry carries its `time` and its `session`, and these are the kinds:

- `launch`: each attempt of a task: its step, its number, how it was launched (`first`, `fix`, `rise`, `unjudged` for a launch with no verdict on the last attempt, which spends no correction, or `refused` for a task already closed), the effort, whether it edits, the files it owns, its tests, what the Lead asked for as model and effort and whether that was ignored, and the commit it started from. When the owner's authorization covers the model, the line also carries `authorized: { model, scope, task, quote, quoteTime }`.
- `authorize`: the owner's words that place a task, or the session, on a model: the scope, the task, the model, the quote and its time. It precedes the `launch` lines it covers.
- `result`: what an attempt on another harness brought back: whether it worked, the pair, the branch and the worktree of an editing one, the patch, the answer, the checks and the review.
- `outcome`: each call to a pair, numbered by `attempt` across the task: its status, the harness, model and effort, how long it took, the tokens it used, the quota it spent, and, when it was refused or ran out of time, until when its pair is marked. A delegate that was tried on more than one pair has one entry per try.
- `verdict`: the Lead's verdict through `aether-delegate verdict`: `approved`, `fix`, `infeasible` or `exhausted`, its reason, the findings, the cause of a rise (`exhausted`, `repeated` or `infeasible`) and what the next launch is, with whether it carries the earlier work or starts from scratch.
- `relaunch`: a launch with a new id that matches an earlier task that did not end approved, and the task it relaunches.
- `answer`: the final answer of a read-only delegate that ran on Claude, written by the mod through `aether-delegate answer`.

The files of each launch are under `<dataDir>/delegates/`: `external/<id>.json` (how an attempt on another harness runs), `briefs/`, `results/<id>.json`, `patches/` (the work of an editing attempt, which a correction starts from), `answers/`, `run/<id>.json` (the process of a started attempt and its log) and `in/` (the `Agent` call the mod hands to `begin`). None of it is pruned. `aether-report --spend` and `/spend` price a session from `usage/`, `lanes/` and the `outcome` lines of this log (`plugins/aether/lib/spend.js`). They do not read an older router journal.

## Reading the log

`aether-report --delegates [--session <id>] [--since <ms>]` prints two things as JSON:

- **`delegations`:** one row per task, with when it started, its session and description, where it ran (harness, model and effort, or Claude), the step it ended on, its attempts and, when an attempt on another harness failed, why the task ran on Claude. The `aether:*` agents are not the Lead's delegates and have no row.
- **`delegations` rows of a task the owner placed** carry `authorized: { model, scope }`; no other row has that key.
- **`ladder`:** per step of `config/ladder.json`, the tasks that passed through it, its attempts and corrections, how many were approved, how many climbed and for which cause, and the tasks declared infeasible with their reason; and the relaunches, each with the task it relaunches. This is what shows, step by step, whether Haiku approves enough to keep its five corrections.

The `/harnesses` panel draws the five newest rows, and `aether-report --spend` prices the delegates of a session from the log.

## What to know

- **The Lead cannot jump a step on its own.** A model it asks for is ignored, unless the owner named it in their own words and the Lead recorded that with `authorize` ([Placing a task](#placing-a-task)). The way up is a spent step, repeated findings or a declaration of infeasible with its reason.
- **A verdict that does not go through `aether-delegate verdict` does not count,** and an `approve` with a failed check is refused. The Lead cannot close a task on a result that failed its own checks.
- **The numbers are a starting point.** The corrections and the count of repeated findings are the owner's, and are to be watched and calibrated with the report. Change them in `config/ladder.json`; no code changes.
- **The ladder does not decide the harness.** It decides the model and the effort of the step; `superdelegation` and the quota of the pairs decide where it runs, and Claude is always where it falls back to, without asking the owner.
