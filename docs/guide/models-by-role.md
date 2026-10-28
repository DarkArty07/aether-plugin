---
title: Models by role
description: Which model and effort each role of Aether runs on, how a task climbs from one to the next, what each costs, why it is set this way and how to tell whether it should change.
order: 8
---

# Models by role

This page says which model and effort each role of Aether runs on, how a task climbs from one model and effort to the next, what each pair costs, why the pairs are set this way and how to tell whether they should change; a test holds this page to the tree, so its ladder table is `config/ladder.json` and the model and effort it names for each agent are the ones of that agent's file. The measure throughout is the dollar per task, because the Claude limit is one for all the models and is spent by the cost of the model, so a cheaper pair per task makes the quota last longer whatever its price per token. The figures are those of [Artificial Analysis](https://artificialanalysis.ai), read on 2026-10-26 through its API and through `config/pairs.json`, which holds the intelligence points and the cost per task of its index.

## Each role, before and after

| Role | Before | After | Why |
|---|---|---|---|
| Lead | `sonnet xhigh` | `sonnet xhigh` | The launcher fixes it, and it does not change. |
| Writer | `sonnet high` | `sonnet high` | It already does its work at `high`. |
| Judge | `opus high` | `opus high` | It is the role of most risk and spends little. |
| Examiner | `opus high` | `opus high` | There is no evidence in either sense, so it stays until there is. |
| Implementer, first attempt | the plan's Tier at `high` | the first rung of `config/ladder.json` (Haiku `high`) | A correction raises the effort before the model, starting at `high`. |
| Implementer, a retry | `xhigh` in Haiku, Sonnet and Opus | `haiku xhigh` in Haiku; `high` in Sonnet and Opus | In Sonnet and Opus a retry gains the supervisor's findings, not a dearer effort. |
| Implementer, after a rise | `xhigh` | the next model at `high` | A rise already changes the model, so it does not also raise the effort. |
| Supervisor | `xhigh` in US$38 of US$43, by the plan's Review (Sonnet US$24, Opus US$14) | `sonnet high` | The plan's Review now reserves `xhigh` for where an error would reach data, security or concurrency. |
| Supervisor of Sonnet's work | `opus xhigh` | `opus high` | It stays Opus because nobody reviews their own work, and it runs at the effort of the pair it replaces. This holds with `superdelegation` on, when no other harness takes the review; with it off, a Sonnet supervisor reviews Sonnet's work. |
| Final review | `opus xhigh` in 7 of the 8 runs | `opus high`, and `opus xhigh` only if a merged unit has `Review: xhigh` or `max` | The reviewer (`aether:reviewer`) is the last net: it runs on `opus high`, and `xhigh` stays for units with `Review: xhigh` or `max`, where an error costs most. |
| Ops | `haiku low` | `haiku low` | Ops runs as plain code with no model call, and this agent is only the fallback. |

## The ladder

| Step | Corrections | Effort at first | Effort on a correction or a rise |
|---|---|---|---|
| Haiku | 5 | `high` | `xhigh` |
| Sonnet | 2 | `high` | `high` |
| Opus | 1 | `high` | `high` |

A delegate task of the Lead (see [Delegates](delegates.md)) starts on Haiku at `high`. A correction goes back to the same model with its own earlier work and the findings against it: in Haiku the correction rises to `xhigh`, and in Sonnet and in Opus it stays at `high`, because there the next step is another model, not a dearer effort on the same one. A rise passes the task to the next model, and it arrives at `high`.

The swarm starts every unit on the first rung of `config/ladder.json` and raises it by the same policy as the delegates. A unit starts on Haiku at `high`. A retry in Haiku runs at `xhigh`, and a retry in Sonnet or in Opus runs at `high`. A rise to the next model lands at `high`.

## Where the spend went

The 8 finished runs cost US$165.00 in all at list price, of which US$141.75 was outside the Lead (source: `runs.jsonl`). Of the spend outside the Lead, the implementers took 43 %, the supervisors 30 %, the final review 19 % and the Examiner 6 %. US$96 of those US$142 ran at `xhigh` (68 %): `xhigh` was the default effort of a task, and the effort of every correction and rise. Opus took US$70.33 of the total (43 %): of that Opus spend, the final review took 38 %, the supervisors 25 %, the implementers 23 %, the Examiner 12 % and the Judge 2 %.

Repricing those same runs with the pairs of this page saves at most from US$165.00 to US$114.44, and the Opus spend from US$70.33 to US$50.62. The saving is made of Sonnet going from `xhigh` to `high` in the implementers and the supervisors (US$31), the final review at `high` (up to US$12, and less when a run holds a task with `Review: xhigh` or `max`), the supervisor in Opus going from `xhigh` to `high` (US$6.70) and the implementers in Opus at `high` (US$1.30). It is a maximum: each line is the old spend times the cost per task of the new pair over the old one. It does not count starting the swarm in Haiku (a saving that comes from a later measurement, in A97, from US$ 3.60 to US$ 2.96), the retries a lower effort might add, or what each correction costs the Lead, which reads and judges every attempt again.

## Why

**J1. The measure is the dollar per task.** The Claude limit is one for all the models and is spent by the cost of the model, so pairs are compared by what a whole task costs on them, not by a price per token: a model writes more tokens as its effort rises, and per task Opus `high` (US$1.82) costs less than Sonnet `xhigh` (US$2.01) for the same 57 points in code. Source: the cost per task of the index in `config/pairs.json`, read on 2026-10-26.

**J2. The spend is in `xhigh`.** In the 8 finished runs, 68 % of the spend outside the Lead (US$96 of US$142) ran at `xhigh`, which was the default effort of a task and the effort of every correction and rise. Source: `runs.jsonl`, priced at list price, as [Where the spend went](#where-the-spend-went) breaks down.

**J3. The efforts are not worth the same.** The intelligence points and the cost per task are those of the index in `config/pairs.json`; the code points are Terminal-Bench 4.0, the terminal coding test, from the API of Artificial Analysis, read the same day, 2026-10-26:

| Pair | Intelligence | Cost per task | Code |
|---|---|---|---|
| `haiku high` | 37.8 | US$0.08 | 22 |
| `haiku xhigh` | 41.2 | US$0.12 | 29 |
| `sonnet high` | 46.8 | US$0.88 | 44 |
| `sonnet xhigh` | 51.9 | US$2.01 | 57 |
| `sonnet max` | 56.0 | US$5.46 | 64 |
| `opus medium` | 51.2 | US$1.34 | 53 |
| `opus high` | 53.6 | US$1.82 | 57 |
| `opus xhigh` | 56.0 | US$3.46 | 60 |
| `opus max` | 57.6 | US$5.98 | 60 |

In Sonnet, rising from `high` to `xhigh` costs 2.3 times more per task for 13 more points in code (44 to 57), and from `xhigh` to `max` 2.7 times more for 7. In Opus, rising from `high` to `xhigh` costs 1.9 times more for 3 points (57 to 60), and `max` gives the same 60 as `xhigh` for US$5.98. In Haiku the same rise is cheap: US$0.08 to US$0.12 for 22 to 29. Reading a long text (LCR) barely depends on the effort: Opus scores 84 at `medium`, 83 at `high` and 85 at `xhigh`.

**J4. Where Opus pays for itself, and where it does not.** Above what Sonnet `high` gives in code (44), the cheapest pairs that exist are Opus: `medium` scores 53 for US$1.34 and `high` 57 for US$1.82, against Sonnet `xhigh` at 57 for US$2.01 (source: the table of J3). As the last step of a task that Haiku and Sonnet did not solve, Opus `high` pays for itself. Opus `xhigh` and `max` do not: they buy 3 more points for almost twice the cost, and `max` no more than `xhigh`. As the supervisor of what a Sonnet wrote, Opus is there by the rule that nobody reviews their own work, not by capacity.

**J5. The ladder kept Sonnet and Opus always at `xhigh`.** Before this change, a correction on the delegates' ladder went to the same model at `xhigh` and a rise landed on the next model at `xhigh`; as no task starts in Sonnet or in Opus, those two models only ever ran at `xhigh`, the worst-paid effort of J3. The swarm did the same: every attempt that was not the first ran at `xhigh`. Source: `config/ladder.json` and the run workflow as they stood before this change.

**J6. The final review and the supervisor rose to `xhigh` by habit.** The final review rose to Opus `xhigh` when a merged unit had `Review: xhigh` or `max`, and the Writer's guidance put that Review on any behaviour beyond the tests, which is almost everything. So 7 of the 8 runs paid the final review at `xhigh`, and the supervisor ran at `xhigh` in US$38 of its US$43 (Sonnet US$24, Opus US$14). Source: the run workflow and the Writer's guidance as they stood, and `runs.jsonl` for the spend.

The full justification, with the alternatives that were ruled out, what each change saves and what it risks, is in [the design record of this change](../../specs/016-model-effort-policy/design.md).

## Where Opus stays

Opus remains in four places, each with its reason:

- **The last step of a task that Haiku and Sonnet did not solve,** at `opus high`: it scores 57 in code against the 44 of Sonnet `high`, and by then the cheaper models have already had their attempts and their corrections.
- **The Judge and the Examiner,** at `opus high`. The Judge is the role of most risk, because a plan it approves with an error carries that error to every unit, and it spends almost nothing (2 % of the Opus spend of the 8 runs). Of the Examiner there is no evidence in either sense, so it is not moved on a guess. With `superdelegation` on (see [Options](options.md)), both seats go first to a pair of another harness and only fall back to the native agent (see [Design seats](design-seats.md)), so the Opus pair is the reference a call asks for, not always the pair that runs.
- **The final review,** at `opus high`: it is the last net over the whole run, read as one change. It rises to `opus xhigh` only when a merged unit has `Review: xhigh` or `max`.
- **The supervisor of a Sonnet author,** at `opus high`: it is Opus only by the rule that nobody reviews their own work, and it runs at `high`, the effort of the pair it replaces.

Outside the case where a merged unit has `Review: xhigh` or `max`, two pairs are not used: Opus `xhigh` and Opus `max`. The first buys 3 more points in code (60 against 57) for almost twice the cost per task (US$3.46 against US$1.82), and `max` gives what `xhigh` gives, the same 60 points, for US$5.98.

## How to tell if it worked

Measure the next two swarm runs with `aether-report`, against the baseline of the 8 finished runs above:

- the spend by role, model and effort, and how much of it still runs at `xhigh`;
- the attempts and the climbs of each unit: `quality.attempts`, `climbed` and `escalated`;
- the findings of the supervisors and the findings of the final review;
- the verdict of the final review, and the failures of the exam;
- with `superdelegation` active, which external pairs took the calls: the reference pair of a call is now lower, so a different, cheaper pair may reach it and take the call, which is what the change is for, and it changes which harness runs each call.

**When to undo it.** Undo the change if, in those two runs, the final review or the exam find, on average per run, more `critical` or `important` findings in units that their supervisor had approved than the average of the baseline, which is 1.7 per run (2, 1 and 2 in the three runs that hold the data); or if the Sonnet units that ask for a second attempt after the first rise above 33 %, which is what happened at `xhigh`, against 17 % at `high`.

**What was measured when the swarm started on Haiku (spec 019, 2026-10-28).** One run each, Claude only, with a hidden acceptance suite. Snake game, 10 tasks: US$ 2.62 in 10.4 minutes with the new swarm, against US$ 2.96 in 10.2 (all Haiku, old swarm) and US$ 3.60 in 7.6 (mixed tiers); 17 of 17 acceptance tests in all three. Query engine, 16 tasks: US$ 4.81 in 17.1 minutes against US$ 5.58 in 10.9 with the tiers of the plan; the whole exam passed in both. The implementers cost two thirds less, but the Opus final review and the Sonnet supervisors are three quarters or more of such a bill, so the total fell 14 % at most; the time did not improve. The ladder did not rise for quality and the gate rejected nothing, because the tests of those plans were given in full. The [handoff](../handoff/2026-10-28-swarm-one-ladder.md) has the table.

**What to touch to undo it:** `plugins/aether/config/ladder.json`; and `reviewerReference` in `plugins/aether/lib/lane-delegate.js`.

What cannot be measured today: the runs do not keep what each supervisor approved or rejected on each attempt, only totals, so the comparison above is made with the totals the report holds, and a lower effort that let more through attempt by attempt would not show until the final review or the exam caught it.

## What did not change

- The Lead, the Writer, the Judge and the Examiner keep their model and their effort.
- The rule that nobody reviews their own work.
- The numbers of the ladder: 5, 2 and 1 corrections, and the same findings twice before a task climbs.
- The order of the design seats: a pair of another harness first, the native agent as the fallback. An external model takes a role only when that role is in the model's `roles` list; when none lists it, the native pair takes the call (`allowsRole` in `plugins/aether/lib/superdelegation.js`).
