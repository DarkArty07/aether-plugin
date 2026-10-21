---
title: Delegate router
description: How the router picks the model, the effort and the harness of the Lead's delegate tasks, its three modes, the criterion, the one rule that picks an external pair, and what can and cannot be done as asked
order: 7
---

# Delegate router

The router decides how each delegate task of the Lead runs. The four options that drive it (`router`, `decider`, `fallback` and `deadlines`) are in [Options](options.md#options); this page is how they behave.

## What it does

The Lead describes the task and the router decides what it runs on: the model, the effort and, for read-only work, the harness. Right before the Lead launches a delegate task, a decider answers seven questions about the brief. The criterion turns the answers into a level, and the table of rungs turns the level into a model and an effort.

- **Only the Lead's delegate tasks.** The router looks at the Agent calls of the Lead whose agent is not an `aether:*` one. The swarm keeps the Tier and the ladder of its plan, the design seats and the swarm's calls follow the `superdelegation` rule in [Lanes](lanes.md#lanes), and the `aether:*` agents keep their own model and effort. The Lead's own model is not touched.
- **The mod does the work.** `plugins/aether/hooks/router.mjs` hooks the Agent tool and talks to `aether-route`, which holds the policy. In a session that is not an Aether session it does nothing.
- **Any failure leaves the call as the Lead made it.** An exception, a bin that fails or a decision that does not come back never blocks a delegate task.
- **What was decided can be read.** Every decision goes to a log in the plugin's data directory, and `aether-report --delegates` shows, per delegation, the rung, the reason, the confidence and the quota it spent.

## Modes

The `router` option has three modes. The default is `auto`: with `superdelegation` on the mode is `command`, and with it off it is `record`, so nobody has to choose one, and a mode you set holds either way. Set it at install with `--config router=command`, or later in `/plugin` → Installed → aether → Configure options (see [Options](options.md#options)).

| Mode | The decider | The delegate task |
|---|---|---|
| `record` | Runs in the background; the launch does not wait for it | Runs as the Lead sent it. The log gets what the decider would have chosen |
| `advise` | The launch waits for it, up to its limit | Runs as the Lead sent it. The Lead is told what the router would have chosen |
| `command` | The launch waits for it, up to its limit | Runs on the model and effort the router chose, and the Lead is told which. A read-only task may run on another harness |

With `superdelegation` off, use `record` for a while, read what it would have done (see [The criterion](#the-criterion)), and move to `advise` and then to `command` when you trust it.

- **The decider.** The `decider` option picks who answers the questions: `haiku`, which runs Claude Haiku at low effort with no outside service, or `jev`, which calls typesafe/jev-1.14 on OpenRouter and sends each delegate brief to a third party. Jev answers a yes/no question with the probability alone, so the router takes how far it is from a coin flip, `|2p - 1|`, as its confidence: a task is read-only with Jev when the probability that it edits files is 0.25 or less ([issue 024](../issues/024-jev-answers-to-yes-no-questions-have-no-confidence-and-every-jev-reply-was-unreadable.md)). Its key is read from the environment or from the `.env` of the data directory.
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
- **`inheritedEffort`.** The effort a delegate inherits when the router only records or advises. It is `xhigh`, the effort the Lead starts at (A62, A63), so a delegate that passes no effort gets the same, and the floor of a call that names a model and no effort is that model at `xhigh`.

To change the criterion, edit the file. Then check it in two ways:

1. `node --test tests/router-regression.test.js` decides 14 briefs again and names each one whose decision moved. The briefs are in `tests/fixtures/router/briefs.json`, each with its recorded answers and the decision expected. They are synthetic, because the design allowed that. To calibrate on real delegations, replace them with your own briefs, anonymized and with no client data.
2. `aether-route replay --journal` decides again, with the criterion in force, the answers the router recorded for your real delegations. It calls no model, and shows what changed against what was decided then.

`aether-route replay` can also read Claude Code's own history with answers you give it, or ask a decider about it with `--paid`, which makes a paid call on purpose. Each `claude -p` process of the paid Haiku replay has 60 seconds by default (`--timeout <seconds>`, at most 300), apart from the `deadlines` option, and the replay reports the latency and the cost of those calls. The replay skips the Lead's `aether:*` calls, which the router never routes.

## Levels

A level is measured capability, not a name. Artificial Analysis measures each model at each effort, and the table of rungs (`plugins/aether/config/router/rungs.json`, generated by `scripts/build-router-rungs.js` from the models index) places each rung on two axes:

- **The general axis**, from the intelligence index: A below 37.5, B from 37.5, C from 45 and D from 55.
- **The code axis**, from Terminal-Bench: A below 0.18, B from 0.18, C from 0.35 and D from 0.58.

The bands are cut at a score per axis, with no overlap: the cut-offs are 37.5, 45 and 55 for the general axis, and 0.18, 0.35 and 0.58 for the code axis. A score equal to a cut-off goes to the upper level. The two axes can disagree for one rung: a model can be B in general and A in code.

The router keeps its own table of rungs to decide how strong a task has to be, and it gives a Claude rung: the one the call would run on. Where an external pair takes the task is not decided by that table but by the pairs of `superdelegation`, which measure one axis (see [Quota](#quota)).

An unmeasured rung serves no level. The router picks the Claude rung of the decided level: the rung the Lead asked for when the criterion decides exactly that level, and otherwise the cheapest Claude rung of the level.

## Quota

For a read-only task the router sends the delegate to another harness with the rule of `superdelegation`, the same function the swarm and the design seats ask (see [Lanes](lanes.md#lanes)). The router gives it the Claude rung the call would run on, and the function answers with the external pair that reaches the points of that rung, one point less at most. Among the pairs that do, the quota whose weekly window renews first goes first, and inside it the pair with the lowest cost per task. Speed decides nothing. What is not spent before the reset is lost.

- **Agy, Grok and Muse.** The router may send a delegate to any of them that is in the `harnesses` option. Codex and Cursor cannot run a delegate.
- **The reserve.** A group with a window under 5 % left is left out.
- **A valid reading.** A reading counts while it is within its life: 10 minutes for agy, whose reading launches a process, and 30 minutes for the Grok log line, and never past a window reset that came after the reading. A harness without a valid reading is left out of that decision. Muse keeps no reading to expire: its last allowance counts, and a Muse that has never been called is unknown, not dry.
- **Renewing a reading.** A missing or expired reading of agy or Grok is renewed, and a decision in `advise` or `command` waits for it up to the quota limit (3 seconds by default), but only for a harness that has a pair able to take the task; in `record` nothing waits. The renewal is a step of the router itself, `aether-route renew`, that saves its reading in the router's own data directory, because the lane code does not save Grok's. Measured: Grok's takes 0.7 seconds and fits in the limit; agy's takes 5 seconds and never does, so while agy is among the `harnesses` a read-only decision with an expired agy reading waits the whole limit and agy stays out of it ([issue 025](../issues/025-command-waits-3-seconds-for-an-agy-reading-that-takes-5-and-agy-cannot-serve-the-task.md)). Muse's pair enters meanwhile.
- **A mark.** A reading with a balance does not lift the mark of a refusal, because agy's `/usage` does not show its individual limits; a mark that came from a reading is lifted when a fresh reading of its group, taken after the mark, shows every window above the reserve (decision A60), and the router then removes its file. The explicit refusal of agy, "Individual quota reached", leaves a mark of the router's own for 60 minutes, whatever reset the refusal says: agy's stated reset was wrong once, and a refused call costs no tokens, so the group is tried again every hour. The reset is kept in the mark as stated. The router reads the swarm's marks too, and writes only its own.
- **No pair reaches the points.** The task runs on Claude, on the rung the router decided. A task that needs more than any external pair gives, such as Opus at `xhigh`, never leaves.

To see the readings the router would use, and the delegations it has decided, inside Claude Code, open the [`/harnesses` panel](lanes.md#the-harnesses-panel) in an Aether session: it shows each harness's quota groups with their status, and the five newest delegations of the log. Each decision keeps, in the log, the candidates of the function with the reason each one did not take the call.

agy's reading is not reliable for its Gemini group: it showed 98 % while the calls were refused with "Individual quota reached", because `/usage` does not report the individual limits. The truth is the refusal, and the router, the swarm and the design seats all leave a mark of it ([issue 021](../issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md), decision A60).

## Other harnesses

A delegate runs on agy, Grok or Muse only when all of this holds:
- the mode is `command`, the `superdelegation` option is on and the harness is in the `harnesses` option;
- the task is read-only: the decider answered that it does not edit files, with enough confidence. A delegate that edits files stays on Claude, because an external delegate works on a copy that is thrown away;
- the Agent call does not ask for its own worktree with `isolation`, and names no agent of its own: it has no `subagent_type`, or it is `general-purpose` or `Explore`, because an external harness would not get the instructions or the tool limits of a named agent;
- the checkout has no uncommitted changes, because the delegate works on a copy of the last commit and would answer about older code; otherwise the task runs on Claude and the log says why;
- the rule above picks a pair.

Grok and Muse are used only when they are among the `harnesses`; the option ships with `agy` alone. A real read-only delegate has run on Grok 4.7 this way: the router picked it because its weekly window renews first, the engine ran the delegate in a disposable worktree, and the Lead got its answer as the agent's.

The delegate runs in a disposable worktree of the current commit. If it changed anything there, its answer is undone. That check covers the copy only: a delegate that follows an absolute path into your checkout is not caught (see Containment in [Lanes](lanes.md#lanes)). The mod hands the Lead the delegate's text as the agent's answer, with no model request. The answer starts with a line that names the model, the effort and the harness, and says why Claude Code lists no tool uses or tokens for it. Codex and Cursor are not used by the router.

The effort is the pair's own: the harness gets the effort of the pair the function picked, as the swarm does.

The engine runs a delegate's command with a cap of ten minutes, so an external delegate has 570 seconds in all, and its CLI at most 360 seconds. The limits live in `plugins/aether/lib/delegate-limits.js`. A task that needs longer stays on Claude, through the fallback.

## Fallback

The router always has Claude to go back to, and never asks the owner.

- **The decider fails.** In `command` the call keeps the model and effort the Lead asked for, and the `fallback` option (`sonnet:high` unless you change it) when the Lead asked for none. In `record` and `advise` nothing is rewritten.
- **An external delegate fails,** for any reason, including a quota refusal or the time limit. The agent runs on Claude, on the rung the call would have run on, which is also the reference of the pair that failed.
- **No pair can take the task.** The task runs on Claude, on the rung the router decided.
- **A quota refusal** also leaves a mark, so the next decision does not try that group again for 60 minutes.
- **The router itself fails.** An internal error leaves the call as the Lead made it, and writes a decision entry whose fallback reads `internal: …`, so the report counts it and you can see that the router is broken.

## Override

To keep your own choice, write one line in the brief: `ROUTER-OVERRIDE: <reason>`, and pass `model` and `effort`. The decider is not called, the call keeps what was asked and the reason goes to the log. The skill of the Lead teaches the line; with `command` the Lead describes the task and passes neither `model` nor `effort` unless it overrides. A Lead that passes them in `command` without the line has them replaced, and the router's note says so and how to keep them.

## What can and cannot be done as asked

Each part of what was asked, with its verdict and the adjustment that makes it work.

| Part | Verdict | Adjustment |
|---|---|---|
| C1. A decider picks what each delegate runs on | viable with an adjustment | The Agent call can be rewritten in `model` and `effort`, but the `agent.spawn` hook does not see `effort`, so the router acts on the call itself. In `record` the decider runs in the background. Real sessions on 2026-10-16 (a real Lead, real Haiku and Jev answers) checked it: three parallel launches, a background delegate, a delegate with `isolation: "worktree"` and an external delegate whose command the engine ran in its own directory. The usage meter shows each delegate on the model and effort the router decided ([measures](../../specs/006-delegate-router/evidence/real/README.md)). |
| C2. It knows how to route because it is given the criterion | viable as is | The criterion is a readable file, and a regression of 14 briefs guards it. |
| C3. The Lead only describes the task | viable with an adjustment | The override needs a fixed form, `ROUTER-OVERRIDE: <reason>`, that the skill of the Lead teaches. |
| C4. Only the Lead's delegates | viable with an adjustment | The router filters by `subagent_type`. That the hook does not fire for the agents of a workflow is unchecked, so C4 does not depend on it. Recognizing the explicit quota refusal is shared: the swarm, the seats and the router read it with `lib/quota-refusal.js` (A60). |
| C5. Two interchangeable deciders | viable with an adjustment | Both were measured on the owner's 327 real delegations on 2026-10-16 ([measures](../../specs/006-delegate-router/evidence/real/README.md)). Haiku at low effort decided 317, and 10 fell to the fallback (4 unreadable, 6 incoherent); its call took a median of 2.1 s and a p90 of 4.8 s as `claude -p` reports it (the slowest, 13.5 s, is over its 8 s limit), and 1.4 to 1.9 s inside real sessions. Jev decided all 327; its calls took 0.5 to 0.9 s inside real sessions (median 0.29 s in the design measure). They agree on the level in 73 % of the 317 both decided and within one level in 97.5 %, and Haiku is the lower of the two in 68 of the 85 that differ. There is no reference answer, so agreement is the only accuracy measured. Artificial Analysis measures 3.84 s to the first token at low effort (6.69 s at medium), so the limit is per decider (Jev 3 s, Haiku 8 s). |
| C6. Levels are measured capability | viable with an adjustment | The points of a pair of `superdelegation` measure one axis; the router's table measures two, with cut-offs that do not overlap, and marks what is unmeasured: the agy rungs with a Claude name, which Artificial Analysis measured through the native API, serve no level. |
| C7. The effort is decided too | viable with an adjustment | The effort is translated by the measured level of the rung, in a table of the router apart from the pairs of `superdelegation`, and the native effort reaches agy and Grok unchanged. |
| C8. Delegates also run on other harnesses | viable with an adjustment | `aether-lane start` needs a run, so the router needs a call with no run, and only a read-only one. The engine caps a delegate's command at ten minutes: an external delegate has 570 seconds in all, its CLI at most 360 seconds, and a task that needs longer stays on Claude through the fallback. A read-only delegate has run on Grok 4.7 in a real session; none has run on agy, whose Gemini group carries a dry mark and whose Claude group serves no level. |
| C9. The weekly window that renews first rules | viable with an adjustment | (a) The router uses the owner's literal rule, the weekly window that renews first among the groups with a balance over the reserve, and superdelegation uses it too; the balance per hour (A49) no longer orders the swarm. (b) The agy reading is not reliable for the Gemini group: it showed 98 % while calls were refused with "Individual quota reached", so the truth is the refusal, which leaves a mark; since A60 the swarm and the seats leave and read it too ([issue 021](../issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md)). (c) A group with no valid reading is left out. The renewal is a step of the router (`aether-route renew`) that saves its reading in the router's own data directory. It takes 0.7 s for Grok, which fits in the 3 s limit, and 5 s for agy, which does not ([issue 025](../issues/025-command-waits-3-seconds-for-an-agy-reading-that-takes-5-and-agy-cannot-serve-the-task.md)). |
| C10. Always a fallback to us | viable as is | The native fallback costs nothing: if the mod does not answer the delegate, it runs as usual. What runs with no decision is what was asked, or the `fallback` option. Real sessions checked a decider without a key, with a rejected key and past its time, a Grok whose command fails, and an agy refusal (which leaves the router's mark, so the next decision skips agy): each ended on Claude, at the level of the decision. |
| C11. It is checked before it is given command | viable with an adjustment | The replay repeats the history and the log survives between sessions. The paid replay ran on the owner's real history with both deciders on 2026-10-16: each would change about 70 % of the Lead's choices, and the delegations that have a cost would be 31 % (Haiku) and 25 % (Jev) cheaper at list prices. Whether the cheaper rung does the work as well is what only `advise`, and then `command`, in use can show. |
| C13. What was decided can be seen | viable as is | The log and `aether-report --delegates` give, per delegation, the rung, the reason, the confidence and the quota spent. |
| C14. The other opportunities are noted | viable as is | They are listed below with their measurement, and no file of the plugin builds them. |

## Other uses found, not built

Other uses of this architecture were found, each with the measurement behind it. None of them is built: no file of the plugin builds any of them.

1. **A second layer for the guard.** Of 57 commands (31 dangerous), the rules of `aether-guard` catch 14 (45 %) with no false positives. The rules plus Jev (`irreversible` of 0.7 or more) catch 28 of 31, also with none. For commands, Haiku at low effort suits better, because it does not take them off the machine.
2. **A lint for plans.** The decider agrees with the Writer and the Judge in 55 % (22 of 40; 6 without confidence). It proposes lowering 17 tasks for lack of questions on concurrency, security and migrations. It would only be worth it to raise a level.
3. **Graders.** The 98 tasks "Grade interview" are 53 % of the spend (US$255 as the first measurement counted it; that measurement counted each request about 1.8 times, so the real figure is about US$140), nearly all on inherited Opus. An A/B (about US$10) is needed before lowering them, which is why `evaluate` is a gate.
4. **A record of the decider's hits,** once the replay exists, to feed 1 and 2.
5. **An agy quota reading that includes the individual limit,** if some agy command offers it. Today only `/usage` shows the group, and the group can show a balance with the individual limit spent.
6. **The swarm and the design seats recognizing agy's explicit refusal** and leaving a mark of 60 minutes (done in decision A60, which holds the mark for the default length and not for the reset agy states): see [issue 021](../issues/021-agy-refuses-with-individual-quota-reached-while-usage-shows-balance.md). It needs the owner's confirmation, because it changes what the confirmed scope leaves out.
