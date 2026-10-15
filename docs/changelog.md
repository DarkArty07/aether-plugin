---
title: Changelog
description: Version history and trial status of Aether
order: 31
---

# Changelog

## Status

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
