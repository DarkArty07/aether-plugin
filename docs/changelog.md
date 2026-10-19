---
title: Changelog
description: Version history and trial status of Aether
order: 31
---

# Changelog

## Status

Version 0.12.3: the `/harnesses` panel ([handoff](handoff/2026-10-17-harness-panel-0.12.3.md), [guide](guide/lanes.md#the-harnesses-panel), [decisions](decisions.md) A57 and A58). What changed since 0.12.2:
- **A panel for the delegation settings and the quota of each harness.** In an Aether session, `/harnesses` opens a pane that shows the options line (`lanes`, `router`, `decider`, `seats` and `harnesses`, as the session really uses them), for each harness its version, whether it is enabled and installed, and each quota group's status and windows (the bar, the share left and the time to the reset), and the five most recent delegations of the router log. It prints nothing to the transcript, calls no model and works while the Lead is in the middle of a turn. `Esc` or `x` closes it and `r` renews the readings. It is read-only: it changes no setting, and the switch for lanes stays the `lanes` option.
- **Where it shows and where it does not.** The command exists only in an Aether session, started with `aether-lead`; in any other session it is not declared and nothing of it runs, so the dormant footprint is the same. The pane docks to the right of the transcript from 110 columns in Claude Code's fullscreen layout and sits above the prompt below that, and it drops detail in steps to fit the room it has. It uses Claude Code's plugin UI API for mods, which is early access: if it changes, the panel does not draw and nothing else of Aether depends on it. It was checked on Claude Code 2.1.302.
- **The numbers come from the bins that were already there.** One `aether-lane quota --json` per harness, run in parallel so that a slow agy does not hold back Grok, and `aether-report --delegates` over the last 7 days. `r` asks again with `--refresh`, and a stale Grok reading is renewed once by itself. Opening the pane costs no model tokens. Text that comes from a CLI or from a delegate's description is stripped of control characters before it is drawn.
- **`router`, `decider` and `seats` are selectors.** `/plugin configure aether@aether-plugin` and `/config` now show their values to pick from (`Delegate router ◀ record ▶`) instead of free text. `harnesses`, `fallback` and `deadlines` stay free text, and no default changes.
- **Tried in real sessions.** Real Claude Code sessions (tmux, 2.1.302) at 60, 80 and 150 columns and in a 22-row terminal, with no harness installed, with a broken lanes config, with repeated keys, after `/clear` and in a session without Aether.
- **Shipped as a patch on purpose.** It adds a command and changes no workflow, and the owner chose a fix over a minor.

Version 0.12.2: the router's notes, from a second round of real sessions ([measures](../specs/006-delegate-router/evidence/real/README.md), [issue 026](issues/026-lead-misreads-the-router-note-and-doubts-an-external-answer-that-shows-zero-tool-uses.md)). What changed since 0.12.1:
- **The note says when the router replaced the Lead's choice.** In `command`, a Lead that passes `model` and `effort` without the `ROUTER-OVERRIDE: <reason>` line has them replaced. The note only said «You asked haiku medium», and a Lead at low effort told the owner that this is what ran. It now says that the router replaced the choice and that only the line keeps one.
- **An external delegate's answer says where it came from.** Claude Code lists no tool uses or tokens for an agent that the mod answers, so the Lead doubted Grok answers that had read the files. The answer now starts with a line that names the model, the effort and the harness, and says why the counts are zero.
- **The system was checked end to end in real sessions.** An autonomous run with the router in `command` mode went through the intent card, `/aether:design`, the swarm, the exam and the report with the installed release, and the router left the design seats and the swarm's agents alone. Real sessions also checked a decider without a key, with a rejected key and past its time; a Grok whose command fails; an agy refusal, which leaves the router's mark so that the next decision skips agy; eight decisions at once with one renewal; the override; the quota rule with agy and Grok together; and the guard on `aether-route replay --paid`. Every failure ended on Claude.

Version 0.12.1: the router checked with real models ([measures](../specs/006-delegate-router/evidence/real/README.md), [guide](guide/router.md)), issues [024](issues/024-jev-answers-to-yes-no-questions-have-no-confidence-and-every-jev-reply-was-unreadable.md) and [025](issues/025-command-waits-3-seconds-for-an-agy-reading-that-takes-5-and-agy-cannot-serve-the-task.md). What changed since 0.12.0:
- **Jev decides now.** Jev answers a yes/no question with the probability alone, and the router asked it for a confidence too, so every Jev reply was read as unreadable and `decider=jev` always fell to the fallback. The router now takes how far the probability is from a coin flip, `|2p - 1|`, as its confidence. Haiku, the default decider, was not affected.
- **The router ran in real sessions.** With the owner's approval of the test spending, a real Lead launched delegate tasks in `record`, `advise` and `command` mode, with the installed release and with a development tree. Three launches in parallel, a background delegate and one in its own worktree ran on the model and the effort the router decided, with Haiku and with Jev as the decider (the usage meter shows each one); a read-only delegate ran on Grok 4.7 and its answer reached the Lead. The paid replay decided all of the owner's real delegations with both deciders. The guide's viability table carries what was measured.
- **Two limits found, not changed.** In `command` mode a read-only delegate waits 3 seconds for an agy quota reading that takes 5 and cannot change the choice, while agy is among the `harnesses`; and the router's own Haiku calls are not metered by `aether-report`.
Version 0.12.0: the delegate router ([spec](../specs/006-delegate-router/spec.md), [guide](guide/router.md)), [decisions](../docs/decisions.md) A55. What changed since 0.11.0:
- **The Lead describes the task; a router decides how it runs.** Right before the Lead launches a delegate task, a decider answers seven questions about the brief, a criterion (`plugins/aether/config/router/criterion.json`, a file the owner can read, test and change) turns the answers into a level from A to D, and a table of rungs derived from Artificial Analysis' measures per model and effort turns the level into a model and an effort. Only the Lead's delegate tasks are routed: the swarm, the design seats and the `aether:*` agents keep their own.
- **Three modes, `record` by default, and four options.** `record` decides in the background and changes nothing; `advise` also tells the Lead what it would have chosen; `command` rewrites the model and the effort unless the Lead writes `ROUTER-OVERRIDE: <reason>` in the brief. The new options are `router`, `decider`, `fallback` and `deadlines`. The decider is Haiku at low effort by default, with no outside service, or `typesafe/jev-1.14` on OpenRouter, which needs `OPENROUTER_API_KEY` and sends each brief to a third party. In `record` the mod asks Haiku once per delegate task, in the background (an estimated US$ 0.0003 each).
- **Read-only delegate tasks can run on agy or Grok** (`command` mode, `lanes` on): the router picks the group whose weekly window renews first, among the groups over the 5 % reserve with a valid reading and no mark. A reading with a balance never lifts a mark; agy's explicit «Individual quota reached» leaves a mark of the router's own until the reset it names. Any failure of the decider, the harness or the quota ends on Claude at the level asked, without asking the owner. The engine caps a command at ten minutes, so an external delegate has 570 seconds in all.
- **What was decided can be seen.** The new bin `aether-route` (`begin`, `finish`, `decide`, `delegate`, `renew`, `spawn` and `replay`) and `aether-report --delegates` give, per delegation, the rung, the reason, the confidence, the quota spent and the cost. `aether-route replay` decides again, over the log or over Claude Code's history, to check a criterion before `command` is trusted; the paid Haiku replay is the owner's call (`--paid`).
- **A guide and a viability table.** [Delegate router](guide/router.md) explains the modes, the criterion, the levels, the quota rule and the fallback, marks each part of what was asked as viable as is or with an adjustment, and lists six other uses of this kind of decision that were found and not built.
- **A color theme, Aether.** The plugin ships `plugins/aether/themes/aether.json`: the violet of Claude Aether (`#8b5cf6`) in place of Claude's orange, also on the mascot of the welcome screen, a deep indigo for the messages, a color for each permission mode and for each of the eight subagent colors. `scripts/aether-lead` and the start command of Install select it in the session's `--settings`, so it applies only while an Aether session runs and is never written to the user's settings files; a plain `claude` session keeps the user's own theme. The facts test learns that `custom:aether:<theme>` is the value that selects a plugin theme, not an agent.

Version 0.11.0: aether:design ([spec](../specs/005-aether-design/spec.md)), [decisions](../docs/decisions.md) A50–A54. What changed since 0.10.0:
- **The Lead no longer conducts the design.** `/aether:design` is a workflow that takes the owner's intent card to an approved spec, plan and tasks with no Lead turn in between: the Writer writes, the Judge reviews, the Writer corrects (at most twice per document), `aether-plan check` passes, and the Examiner writes the exam. It ends with one result, `approved`, `clarify`, `dispute` or `failed`. It needs the Workflow tool: with workflows off, the Lead says so and does not design by hand (see [Methodology](methodology.md#the-method-end-to-end)).
- **The intent card.** After at most five questions, one at a time, the Lead writes `specs/NNN-<topic>/intent.md`: the owner's words, the understanding they confirmed, the criteria each tied to a quote, what is out, and the answers. Only the Lead writes it.
- **The brakes against over-engineering.** The plan template has a gate and a `Complexity` table (violation, why it is needed, the simpler alternative rejected). Each task says which requirements it serves with `- Serves: R1`, and `aether-plan check` fails a task that serves none. The Judge types every finding `missing`, `extra` or `wrong`, and a choice the card leaves open is marked `[NEEDS CLARIFICATION]` and not guessed. The Writer, the Judge, the Examiner and the bootstrap carry one sentence of scope.
- **The Writer runs at `high`.** The native `aether:writer` starts at `high`, not `xhigh`, also when an external seat falls back to it; an external Writer keeps its level.
- **The final review marks what is extra.** `aether:reviewer` flags features nobody asked for and over-engineering, as the supervisor does. The rest of `/aether:run` is as it was.
- **The bootstrap is split.** The procedure of autonomous runs moved from `using-aether` to the new `autonomous-runs` skill, which the Lead loads when the owner permits work for hours or session start reports an open run. The bootstrap is lighter, and the irreversible classes, the grant registry, the repetition rule and the short brief stay in it. A seat round runs in steps (`aether-lane seat-start`, `seat-wait` and `seat-stop`) that each fit in one ops call.
- **A fix to a sentence.** The `swarm` skill's sentence about the rule that orders the lanes' candidates no longer sends the reader to the README's Lanes section: it names `docs/guide/lanes.md`.

Version 0.10.0: quota-aware lanes ([spec](../specs/002-quota-aware-lanes/spec.md)) and the super Lead ([spec](../specs/003-super-lead/spec.md)), [decisions](../docs/decisions.md) A48–A49. What changed since 0.9.1:
- **The quota most at risk goes first.** Every call a lane can take has a list of candidates, ordered by the share left of each group's longest window divided by the hours to its reset. A start that finds its group dry passes the call to the next candidate, and the call runs native only when none is left (see [Lanes](guide/lanes.md#lanes)).
- **Dry marks outlive the run.** A call that ends for quota leaves a mark in the plugin's data directory: until the reset when a reading confirms it, and otherwise for 60 minutes.
- **Grok's quota is read over ACP,** in about a second, with no UI and no model call; opening its UI stays as the fallback. Grok 4.7 takes Haiku implementer calls when `grok` is in `harnesses`.
- **The balance is visible.** `aether-lane quota` and `aether-lane status <run>` give each group's windows, priority and dry mark, and `aether-report` gives each group's balance at the start and the end of a run, and its next reset.
- **The Lead's three paths.** For each piece of work the Lead works directly, starts a delegate task, or runs the swarm, and it chooses and states the model and the effort of every delegate task, from the models index that ships with the plugin (`plugins/aether/config/models/`).
- **`scripts/aether-lead`** starts Aether mode under a short name, with permissions bypassed and with aether-guard refusing an irreversible command that no grant covers (`AETHER_IRREVERSIBLE=enforce`).

Version 0.9.1: the gaps that 0.8.0 left open in issues 002 to 005 ([decisions](../docs/decisions.md) A44–A47). What changed since 0.9:
- **Salvage before a retry.** An implementer that ends without its report no longer costs a blind retry: `aether-wt salvage` commits what the task owns that it left uncommitted, and the supervisor reviews that work.
- **Hand-integrated units are recorded.** `aether-wt adopt <run> <task> --commit <sha> --reason <text>` makes the report count a unit the Lead integrated by hand as `adopted`, not blocked.
- **A brief carries the spec's intent and criteria,** and `aether-plan check` warns about a task that owns more than 6 paths, or the whole tree.
- **The `ops` option** turns the mod's answers to the workflow's ops commands off, for a project whose tests need the shell's environment.
- **Clearer failures.** A merge asked of the model path carries the long Bash timeout, an ops reply that is not the command's output names a refusal as the likely cause, and a reviewer that gives no answer is reported as incomplete with its reason.

Version 0.9: the design seats ([spec](../specs/001-design-seats/spec.md)). What changed since 0.8:
- **Design seats.** The Judge, the Writer and a new Examiner can each be taken by a stronger model of another harness, such as Gemini 4 Argon on agy, round by round, with Aether's own agent as the fallback. The `seats` option chooses who: `native`, `balanced` (the default) or `robust`. This is superdelegation upward: RADAR's Delegación now counts the seats as well as the volume.
- **The Examiner.** It writes acceptance tests from the spec and the plan's public interfaces, which the swarm never sees, and `aether-exam` runs them at the end of a run. A failing test is a blocking finding.
- **Whoever writes a document does not judge it.** A seat never takes the model that wrote what it reviews.
- **Measured before it is trusted.** A harness compares each external seat with its native agent; the Judge's part runs on seeded defects and scores them without a model. It has not run with real models yet.
- **Fable stays out** until Fable 5.5: Opus 5.5 does this work for less than half the price.

Version 0.8 brought RADAR ([roadmap](../docs/roadmap/2026-10-10-radar.md)). What changed from 0.7:
- **The Lead is the accountable orchestrator.** It writes the spec; the Writer, on Sonnet, writes the plan and the tasks; the Judge, on Opus, reviews them. The Writer and the Judge replace the Designer, the most expensive link of 0.7.
- **Spec Kit replaces superpowers.** Specs, plans and tasks live in `specs/NNN-<topic>/`, with the Aether preset, and superpowers is no longer a dependency.
- **One list for the owner.** Irreversible actions, and the choices only the owner can make, reach the owner as one list at the top of every brief («Espera tu sí»). aether-guard records every irreversible Bash command that no grant covers in that list.
- **Fewer wasted rounds.** A merge is blocked only by a test that fails and did not fail before the run. A unit stops when the same failure repeats. The final review follows the run's risk. Reviews grade each criterion from evidence, and flag added lines that look unfinished.
- **Delegation.** Lanes can run on Codex, Grok and Cursor besides agy, each turned on by the owner, with the owner's credentials kept out of their environment.
- **RADAR in the report.** `aether-report` gives a figure for each goal, and the lanes by harness.

Version 0.7 made the Lead decide as the owner's delegate and work for hours within ceilings of time and cost ([autonomy spec](../docs/superpowers/specs/2026-10-09-lead-autonomy-design.md)), and made Aether install with Claude Code's own plugin commands and start with `claude --agent aether:lead --effort xhigh`; plain `claude` stays normal mode ([installable plugin spec](../docs/superpowers/specs/2026-10-09-installable-plugin-design.md)).

**Trial 3** ([evaluation](../docs/evaluations/2026-10-08-trial-3.md)) ran the same design request with the Lead and Designer split and with an Opus main session:
- the split's design captured all ten items of the owner's hidden intent, against nine;
- the blind pairwise judgment was a tie;
- in that short design session it cost the same at OpenRouter prices: $10.67 against $10.23.

No quality drop was found, and the owner kept the split. Its saving is meant for long sessions, which the trial does not measure.

- **Plan 1, foundation:** plan checking, unit worktrees and their cleanup.
- **Plan 2, the swarm:** the workflow and its agents.
- **Plan 3, measurement and the trial:** the usage meter, `aether-report`, and a trial against normal mode.

**Trial 1** ([evaluation](../docs/evaluations/2026-10-08-trial-1.md)) ran the same 7-task plan in Aether mode and in normal mode (superpowers' subagent-driven development, with the same models per task):

| | Aether mode | Normal mode |
|---|---|---|
| Wall clock | 6 min 11 s | 24 min 25 s |
| Cost, Claude Code's list prices | $1.98 | $5.60 |
| Hidden acceptance suite | 33/33 | 33/33 |
| Open critical or important findings | 0 | 0 |

The gate to the published project (A9) passes: Aether mode was 3.9 times faster and 2.8 times cheaper, at equal quality on the spec. Normal mode's heavier review left its build somewhat more hardened beyond the spec. One trial on a small fixture is a first data point, not a proof.

**Trial 2** ([evaluation](../docs/evaluations/2026-10-08-trial-2.md)) ran an 8-task plan for a three.js snake game, judged on graphics quality, creativity, playability and 3D quality:

| | Aether mode | Normal mode |
|---|---|---|
| Wall clock | 18 min 06 s | 2 h 18 min |
| Cost at OpenRouter prices | $4.17 | $21.95 |
| Hidden suite | 25/25 | 24/25 |
| Browser checks | 12/13 | 13/13 |
| Grade on the four criteria | 23/40 | 32/40 |

Aether mode was faster and cheaper again, but its quality was not equal. The transcripts point to two plugin settings:
- Aether's implementers run at a fixed `medium` effort, where normal mode's ran at `xhigh`;
- its briefs carry the plan's contract without the spec's quality bar.

The owner judged that the normal build's extra quality does not justify its time and cost. The next work raises Aether's quality with techniques that keep its time and cost. The evaluation [lists them](../docs/evaluations/2026-10-08-trial-2.md#next-better-results-at-the-same-time-and-cost).

The first design is [docs/superpowers/specs/2026-10-07-aether-plugin-design.md](../docs/superpowers/specs/2026-10-07-aether-plugin-design.md); the [RADAR roadmap](../docs/roadmap/2026-10-10-radar.md) is the current direction.
