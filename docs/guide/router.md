---
title: Delegate router
description: How the router picks the model, the effort and the harness of the Lead's delegate tasks, its three modes, the criterion, the quota rule, and what can and cannot be done as asked
order: 7
---

# Delegate router

The router decides how each delegate task of the Lead runs. The four options that drive it (`router`, `decider`, `fallback` and `deadlines`) are in [Options](options.md#options); this page is how they behave.

## What it does

The Lead describes the task and the router decides what it runs on: the model, the effort and, for read-only work, the harness. Right before the Lead launches a delegate task, a decider answers seven questions about the brief. The criterion turns the answers into a level, and the table of rungs turns the level into a model and an effort.

- **Only the Lead's delegate tasks.** The router looks at the Agent calls of the Lead whose agent is not an `aether:*` one. The swarm keeps the Tier and the ladder of its plan, the design seats keep the `seats` option, and the `aether:*` agents keep their own model and effort. The Lead's own model is not touched.
- **The mod does the work.** `plugins/aether/hooks/router.mjs` hooks the Agent tool and talks to `aether-route`, which holds the policy. In a session that is not an Aether session it does nothing.
- **Any failure leaves the call as the Lead made it.** An exception, a bin that fails or a decision that does not come back never blocks a delegate task.
- **What was decided can be read.** Every decision goes to a log in the plugin's data directory, and `aether-report --delegates` shows, per delegation, the rung, the reason, the confidence and the quota it spent.

## Modes

The `router` option has three modes, and `record` is the one it ships with. Set it at install with `--config router=command`, or later in `/plugin` → Installed → aether → Configure options (see [Options](options.md#options)).

| Mode | The decider | The delegate task |
|---|---|---|
| `record` | Runs in the background; the launch does not wait for it | Runs as the Lead sent it. The log gets what the decider would have chosen |
| `advise` | The launch waits for it, up to its limit | Runs as the Lead sent it. The Lead is told what the router would have chosen |
| `command` | The launch waits for it, up to its limit | Runs on the model and effort the router chose, and the Lead is told which. A read-only task may run on another harness |

Use `record` for a while, read what it would have done (see [The criterion](#the-criterion)), and move to `advise` and then to `command` when you trust it.

- **The decider.** The `decider` option picks who answers the questions: `haiku`, which runs Claude Haiku at low effort with no outside service, or `jev`, which calls typesafe/jev-1.14 on OpenRouter and sends each delegate brief to a third party.
- **The limits.** The `deadlines` option sets how long the router waits, in seconds, for each decider and for the quota decision. A value above 10 counts as 10. In `record` nothing waits.
- **When the decider fails.** The `fallback` option says what runs (see [Fallback](#fallback)).

## The criterion

The router is not a trained model. It is given a criterion: `plugins/aether/config/router/criterion.json`, a file you can read, test and change. Each block decides one thing:

- **`questions`.** The seven questions the decider answers about a brief: its shape (lookup, explore, survey, mechanical edit, implement, debug, audit, design, evaluate or other), the stakes of a wrong output, whether automated checks decide the result, whether it needs judgment, how much it reads, whether it edits files and whether it takes dozens of steps.
- **`axis`.** Which shapes are scored on the code axis. Every other shape uses the general one.
- **`base`.** The level each shape starts at, from A (smallest) to D (largest).
- **`adjust`.** The rules that raise the level one step: high stakes, and a task of dozens of steps.
- **`gates`.** The shapes that never go below the level the Lead asked for: `audit` and `evaluate`. A quality gate is not lowered without a trial.
- **`minConfidence`.** The confidence below which an answer is not trusted and the level the Lead asked for is kept.
- **`readOnly`.** When a delegate may be limited to reading, which is the only case that may leave Claude.
- **`inheritedEffort`.** The effort a delegate inherits when the router only records or advises.

To change the criterion, edit the file. Then check it in two ways:

1. `node --test tests/router-regression.test.js` decides 14 briefs again and names each one whose decision moved. The briefs are in `tests/fixtures/router/briefs.json`, each with its recorded answers and the decision expected. They are synthetic, because the design allowed that. To calibrate on real delegations, replace them with your own briefs, anonymized and with no client data.
2. `aether-route replay --journal` decides again, with the criterion in force, the answers the router recorded for your real delegations. It calls no model, and shows what changed against what was decided then.

`aether-route replay` can also read Claude Code's own history with answers you give it, or ask a decider about it with `--paid`, which makes a paid call on purpose.

## Levels

A level is measured capability, not a name. Artificial Analysis measures each model at each effort, and the table of rungs (`plugins/aether/config/router/rungs.json`, generated by `scripts/build-router-rungs.js` from the models index) places each rung on two axes:

- **The general axis**, from the intelligence index: A below 37.5, B from 37.5, C from 45 and D from 55.
- **The code axis**, from Terminal-Bench: A below 0.18, B from 0.18, C from 0.35 and D from 0.58.

The bands are cut at a score per axis, with no overlap: the cut-offs are 37.5, 45 and 55 for the general axis, and 0.18, 0.35 and 0.58 for the code axis. A score equal to a cut-off goes to the upper level. The two axes can disagree for one rung: a model can be B in general and A in code.

The router keeps its own table, apart from the `levels` of the swarm's lane table. The swarm's `replaces` measures one axis; the router's rungs measure two.

Some rungs are not measured on this harness, and an unmeasured rung serves no level:
- agy's own Sonnet 5.5 and Opus 5.5 carry Claude's names, and Artificial Analysis measured those names through the native API, not through agy.
- Some efforts have no score at all, such as Grok's `medium`.
- A model the lane table does not offer to implementers, such as Gemini 4 Argon, is not eligible.

The router picks, among the eligible measured rungs of a harness at or above the level, the lowest level first, then the lowest price, then the lowest effort. The effort is translated by the level of the rung, so the same word does not mean the same on every model.

## Quota

For a read-only task the router may send the delegate to agy or Grok. The rule is the owner's: the group whose weekly window renews first is used first, among the groups over the reserve of 5 % that have a valid reading and no mark. What is not spent before the reset is lost.

- **The reserve.** A group with a window under 5 % left is left out.
- **A valid reading.** A reading counts while it is within its life: 10 minutes for agy, whose reading launches a process, and 30 minutes for the Grok log line, and never past a window reset that came after the reading. A group without a valid reading is left out of that decision.
- **Renewing a reading.** A missing or expired reading is renewed in the background and the group stays out of that decision. The renewal is a step of the router itself, `aether-route renew`, that saves its reading in the router's own data directory, because the lane code does not save Grok's.
- **A mark.** A reading with a balance does not lift a mark. The explicit refusal of agy, "Individual quota reached", leaves a mark of the router's own, until the reset the refusal says, or 60 minutes when it says none. The router reads the swarm's marks too, and writes only its own.
- **Ties.** Among groups that renew at the same time, the one with more balance goes first, then the order of the table.
- **A49 is pending.** The swarm orders by A49, the balance of the weekly window per hour left. The router does not, because the two differ between two groups with a balance. Adopting A49 in the router is pending the owner's confirmation.

agy's reading is not reliable for its Gemini group: it showed 98 % while the calls were refused with "Individual quota reached". The truth is the refusal. See [issue 021](../issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md) for what the swarm and the seats do not recognize yet.

## Other harnesses

A delegate runs on agy or Grok only when all of this holds:
- the mode is `command`, the `lanes` option is on and the harness is in the `harnesses` option;
- the task is read-only: the decider answered that it does not edit files, with enough confidence;
- the Agent call does not ask for its own worktree with `isolation`, and names no agent of its own: it has no `subagent_type`, or it is `general-purpose` or `Explore`, because agy and Grok would not get the instructions or the tool limits of a named agent;
- the checkout has no uncommitted changes, because the delegate works on a copy of the last commit and would answer about older code; otherwise the task runs on Claude and the log says why;
- the quota rule above picks a group that has a rung at the level.

The delegate runs in a disposable worktree of the current commit. If it changed anything there, its answer is undone. That check covers the copy only: a delegate that follows an absolute path into your checkout is not caught (see Containment in [Lanes](lanes.md#lanes)). The mod hands the Lead the delegate's text as the agent's answer, with no model request. Codex and Cursor are not used by the router.

The effort is native. The router sends the harness's own effort to the CLI, and the `levels` of the swarm's lane table play no part in it.

The engine runs a delegate's command with a cap of ten minutes, so an external delegate has 570 seconds in all, and its CLI at most 360 seconds. The limits live in `plugins/aether/lib/delegate-limits.js`. A task that needs longer stays on Claude, through the fallback.

## Fallback

The router always has Claude to go back to, and never asks the owner.

- **The decider fails.** In `command` the call keeps the model and effort the Lead asked for, and the `fallback` option (`sonnet:high` unless you change it) when the Lead asked for none. In `record` and `advise` nothing is rewritten.
- **An external delegate fails,** for any reason, including a quota refusal or the time limit. The agent runs on Claude, at the Claude rung of the same level that the router put on the call.
- **No harness can serve the level.** The task runs on Claude at that level.
- **A quota refusal** also leaves a mark, so the next decision does not try that group again until its reset.
- **The router itself fails.** An internal error leaves the call as the Lead made it, and writes a decision entry whose fallback reads `internal: …`, so the report counts it and you can see that the router is broken.

## Override

To keep your own choice, write one line in the brief: `ROUTER-OVERRIDE: <reason>`, and pass `model` and `effort`. The decider is not called, the call keeps what was asked and the reason goes to the log. The skill of the Lead teaches the line; with `command` the Lead describes the task and passes neither `model` nor `effort` unless it overrides.

## What can and cannot be done as asked

Each part of what was asked, with its verdict and the adjustment that makes it work.

| Part | Verdict | Adjustment |
|---|---|---|
| C1. A decider picks what each delegate runs on | viable with an adjustment | The Agent call can be rewritten in `model` and `effort`, but the `agent.spawn` hook does not see `effort`, so the router acts on the call itself. In `record` the decider runs in the background; the engine was not tested with work after the hook returns, with parallel launches, with `isolation: "worktree"`, with a real model, or with the directory in which the engine starts a command (the external delegate takes it as its checkout). |
| C2. It knows how to route because it is given the criterion | viable as is | The criterion is a readable file, and a regression of 14 briefs guards it. |
| C3. The Lead only describes the task | viable with an adjustment | The override needs a fixed form, `ROUTER-OVERRIDE: <reason>`, that the skill of the Lead teaches. |
| C4. Only the Lead's delegates | viable with an adjustment | The router filters by `subagent_type`. That the hook does not fire for the agents of a workflow is unchecked, so C4 does not depend on it. Recognizing the explicit quota refusal is the router's alone: the swarm and the seats do not change. |
| C5. Two interchangeable deciders | viable with an adjustment | The accuracy of Haiku at low effort as decider is not measured, nor is its latency: Artificial Analysis measures 3.84 s to the first token at low effort (6.69 s at medium), so the limit is per decider (Jev 3 s, Haiku 8 s) and the real latency is measured before command becomes the default. Jev is measured (median 0.29 s). |
| C6. Levels are measured capability | viable with an adjustment | `replaces` in `lanes.json` measures one axis; the new table measures two, with cut-offs that do not overlap, and marks what is unmeasured: the agy rungs with a Claude name, which Artificial Analysis measured through the native API, serve no level. |
| C7. The effort is decided too | viable with an adjustment | The effort is translated by the measured level of the rung, in a table of the router apart from the `levels` of the swarm, and the native effort reaches agy and Grok without passing through `levels`. |
| C8. Delegates also run on other harnesses | viable with an adjustment | `aether-lane start` needs a run, so the router needs a call with no run, and only a read-only one. The engine caps a delegate's command at ten minutes: an external delegate has 570 seconds in all, its CLI at most 360 seconds, and a task that needs longer stays on Claude through the fallback. |
| C9. The weekly window that renews first rules | viable with an adjustment | (a) The router uses the owner's literal rule, the weekly window that renews first among the groups with a balance over the reserve; the alternative A49 (the balance per hour) differs between two groups with a balance and is pending the owner's confirmation. (b) The agy reading is not reliable for the Gemini group: it showed 98 % while calls were refused with "Individual quota reached", so the truth is the refusal, which leaves a mark of the router's own; the swarm and the seats do not recognize it ([issue 021](../issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md)). (c) A group with no valid reading is left out. A renewal does not fit in the 3 s limit, so it runs in the background as a step of the router (`aether-route renew`) that saves its reading in the router's own data directory. How long a renewal takes, and how often a decision finds a reading still valid, are measured before command becomes the default. |
| C10. Always a fallback to us | viable as is | The native fallback costs nothing: if the mod does not answer the delegate, it runs as usual. What runs with no decision is what was asked, or the `fallback` option. |
| C11. It is checked before it is given command | viable with an adjustment | The replay repeats the history and the log survives between sessions, but measuring the accuracy of Haiku at low effort takes a paid call, which the owner makes with `--paid`. |
| C13. What was decided can be seen | viable as is | The log and `aether-report --delegates` give, per delegation, the rung, the reason, the confidence and the quota spent. |
| C14. The other opportunities are noted | viable as is | They are listed below with their measurement, and no file of the plugin builds them. |

## Other uses found, not built

Other uses of this architecture were found, each with the measurement behind it. None of them is built: no file of the plugin builds any of them.

1. **A second layer for the guard.** Of 57 commands (31 dangerous), the rules of `aether-guard` catch 14 (45 %) with no false positives. The rules plus Jev (`irreversible` of 0.7 or more) catch 28 of 31, also with none. For commands, Haiku at low effort suits better, because it does not take them off the machine.
2. **A lint for plans.** The decider agrees with the Writer and the Judge in 55 % (22 of 40; 6 without confidence). It proposes lowering 17 tasks for lack of questions on concurrency, security and migrations. It would only be worth it to raise a level.
3. **Graders.** The 98 tasks "Grade interview" are 53 % of the spend (US$255 as the first measurement counted it; that measurement counted each request about 1.8 times, so the real figure is about US$140), nearly all on inherited Opus. An A/B (about US$10) is needed before lowering them, which is why `evaluate` is a gate.
4. **A record of the decider's hits,** once the replay exists, to feed 1 and 2.
5. **An agy quota reading that includes the individual limit,** if some agy command offers it. Today only `/usage` shows the group, and the group can show a balance with the individual limit spent.
6. **The swarm and the design seats recognizing agy's explicit refusal** and leaving the mark until the reset it says: see [issue 021](../issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md). It needs the owner's confirmation, because it changes what the confirmed scope leaves out.
