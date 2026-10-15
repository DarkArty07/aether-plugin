# Aether Agents retrospective

Why this project exists. Written from the design session of 2026-10-05, using the
owner's own diagnosis and evidence from the Aether Agents repository at release 1.0.0
(commit `75b8ea58`).

## What Aether Agents was

A spec-driven software-engineering team of three AI roles, built on
[Hermes Agent](https://hermes-agent.nousresearch.com/docs/). The owner described an
objective once, and the system was meant to deliver tested, working software without
further supervision.

- **Morfeo** talked with the owner, wrote a versioned Objective Contract and chose the
  route: it did small, reversible work itself and sent substantial work to the
  pipeline.
- **Supervisor** decomposed the contract into units, reviewed work it did not write,
  integrated it and closed out through a pull request.
- **Implementers**, up to three in parallel, each took one unit in its own branch and
  worktree.
- The Hermes Kanban board was the only channel between roles. Each role had its own
  Hermes profile and model, from the most capable (Morfeo) to the cheapest one that
  passed the quality gates (Implementer).
- The method was "prompt-native": there was no workflow engine or state machine, and
  the stages lived in role prompts (SOULs), skills and contracts (DESIGN.md §1, PD-08).

It was built between 2026-04-20 and 2026-10-03, and released as 1.0.0 with its
features frozen.

## By the numbers

| Measure | Value at 1.0.0 |
|---|---|
| Python source / tests | ~50K / ~60K lines |
| Contract Observation subsystem | ~22.8K lines (46% of the source) |
| Release lifecycle (`lifecycle.py`) | ~8.7K lines |
| Project knowledge (Graphify integration and work memory) | ~8.2K lines |
| Objective Contracts, the core of the method | ~1.8K lines (under 4%) |
| Commits / merged pull requests / closed issues | ~1,900 / ~430 / 272 |
| Release candidates | RC1 to RC19; four were compatibility bridges |
| Accepted product decisions | PD-01 to PD-77 |
| Specifications | 48 directories, ~640K words |
| Role instructions | ~23K words across 3 SOULs and 10 skills |
| Hermes fork | ~47 recorded patches |
| Reliability gate (PD-74: 19 of 20 live end-to-end passes) | Never met |

About 80% of the code was infrastructure around Hermes: observation, releases and the
knowledge integration. The contract core was under 4%.

## Why each piece existed

| Piece | Purpose, in the owner's words |
|---|---|
| Spec Kit | Keep the AI from building a low-quality or scattered project |
| Graphify | Let the AI orient itself quickly without spending tokens |
| Three roles | Keep Morfeo from saturating, so it could focus on orchestrating, driving the project and understanding the owner |
| Supervisor and Implementers | Save tokens by running most of the work on cheaper models |
| Parallel Implementers | A swarm, for speed and quality |

## What worked

The method. Projects gained visible order: specs, exploration notes
("observations") and the learnings Morfeo saved.

## What failed

The owner's diagnosis:

1. **Unstable paths.** Hermes is a general personal-assistant harness with many tools,
   so the model took a different route to the same result each time. Asked to send
   status updates on Telegram, it sometimes created cron jobs and sometimes polled the
   system so the main session could send them.
2. **The wrong kind of harness.** Hermes works well because it has many tools for
   personal assistants. Forcing it into a software agent caused much of point 1.
3. **Autonomy became over-engineering.** The goal was to define what was needed up
   front, decide when difficulties came up, and keep the owner informed so they were
   not tied to the computer. It turned into more than 20 hours of autonomous
   over-engineering.
4. **A fixed model per role.** Cheap Implementer models handle routine backend work,
   but critical units, frontend above all, need capable models.
5. **Silent failures.** The owner would assume Morfeo had been working for two or three
   hours, then learn that a card had blocked silently and the session was never woken.
6. **Scattered knowledge.** Morfeo had to maintain user memory, Hermes memory,
   Graphify, observations, plans, contracts and more, because nothing brought them
   together in one tool.
7. **No real swarm.** The Supervisor's cards always came out chained.

## Root causes

**The model chose the mechanism.** For a recurring need, Hermes offered several
equally valid mechanisms. The prompt-native design (PD-08) put the whole flow in
prompts, so behavior changed from run to run. Waking Morfeo depended on a chain of
processes (gateway, board dispatcher, session affinity); it needed many fork patches
and still failed (issue #553 was still open at 1.0.0).
→ Principle 1.

**Autonomy without brakes.** There was no hard limit on time, cost or scope, and only
the agent doing the work judged whether it was done. The instructions also pushed
toward ceremony: evidence for every step, an 11-step closeout and a written reason for
every "not applicable".
→ Principle 2.

**The model was tied to the role.** The descending cost ladder is a good default, but
difficulty belongs to the unit, not to the role.
→ Principle 3.

**The instructions prevented the swarm.** The `supervisor-decomposition` skill said:

- *"Mark units independent only when prerequisites, interfaces and file ownership
  permit separate implementation and tests."* Independence had to be proven, so
  dependency was the default.
- *"Split behavior at an already agreed boundary or serialize the conflict."* A new
  project has no agreed boundaries yet, so nearly everything was serialized.
- *"Never introduce a second queue, automatic decomposer or in-process product
  swarm."* The swarm was explicitly ruled out.

On top of that, PD-47 capped the pipeline at three Implementers. Decomposition, the
step that decides how much parallelism exists, also ran on the Supervisor's economy
model.
→ Principle 4 and [decision D6](decisions.md#d6-swarm-for-speed-and-quality).

**Too many stores.** DESIGN.md needed a 28-row table just to say where each kind of
information belongs. Every store added instructions and ways to get them wrong, which
fed the first cause.
→ Principle 5.

The principles are listed in the [purpose page](purpose.md#principles).
