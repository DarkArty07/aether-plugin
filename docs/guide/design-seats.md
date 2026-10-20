---
title: Design seats
description: How a stronger model of another harness can take the Judge, the Writer or the Examiner, and what keeps each round safe
order: 12
---

# Design seats

Design seats let the models of other harnesses take the Judge, the Writer or the Examiner of `/aether:design`, under the same rule as the swarm; the one switch is `superdelegation`, off by default (see [Options](options.md#options)). The seats run inside `/aether:design`, the workflow that takes the owner's intent card to an approved plan: the Lead starts no round itself.

## How a seat is taken

### Design seats

The Judge, the Writer and the Examiner are seats. Each round of a seat, the Writer's drafts and corrections included, can be taken by a model of another harness the owner pays for, in place of Aether's own agent. See [spec 001](../../specs/001-design-seats/spec.md), [spec 009](../../specs/009-superdelegation/spec.md) and [decisions A39–A43](../decisions.md).

| Seat | Reference pair | Native agent |
|---|---|---|
| Judge | Opus `high` | Opus `high` |
| Writer | Sonnet `high` | Sonnet `high` |
| Examiner | Opus `high` | Opus `high` |

- **The rule is in Lanes.** A seat asks for the intelligence points of its reference pair, and the pairs, the 1 point tolerance, the order by quota and cost per task, the native fallback and the cross review are in [Lanes](lanes.md#lanes); this page does not repeat them. With `superdelegation` off, every seat is its native agent.
- **What changes.** Only the design. The swarm's models and efforts still follow each task's Tier and Review, the ladder and the run's risk; the Writer, whoever takes its seat, writes those lines with the same rules.
- **Who takes a seat.** The pair the rule picks for the seat's call: a pair of an enabled harness (`superdelegation` on, and the harness in `harnesses`), installed and with quota left, that reaches the points of the seat's reference pair, and whose model did not write what the round reviews. Otherwise the native agent, which is the reference pair, or the Claude model closest in points that is not the author when the round reviews. The pairs are in `plugins/aether/config/pairs.json`; change them in your copy, with `AETHER_PAIRS_CONFIG`.
- **A round.** `/aether:design` starts it with `aether-lane seat-start` and waits for it by steps with `aether-lane seat-wait`, each step short enough for one ops call, and `seat-stop` ends it; it is not one long synchronous call. The round runs in a disposable worktree of the commit, with the lanes' environment (`aether-lane seat` is the same round in one call). Git decides what it may change: the Judge nothing, the Writer `spec.md` in the round of the spec and `plan.md` and `tasks.md` in the round of the plan, the Examiner `.aether-exam/`. Its answer must match the seat's schema, and an external Writer's tasks must pass `aether-plan check`. Anything else undoes the round, keeps a breaking one at `refs/aether/seat/<id>/round-1`, and the native agent does the same round from the files. The workflow does that by itself, with the same message, and it never reaches the owner. The native Writer runs at `high`; an external Writer runs at the effort of its pair.
- **The exam.** The Examiner writes it after the plan is approved, from the spec and the plan's public interfaces, never from `tasks.md`. `aether-exam` keeps it in the plugin's data directory, out of the repository and the swarm's worktrees, and runs it on the integration branch at the end. A test that fails runs once more; a failing test is a blocking finding, a flaky one a minor finding. No hook guards reads of the exam, so its protection is against accidents, not against an agent that goes looking for it.
- **Argon.** Gemini 4 Argon became generally available on 2026-10-13. agy 1.3.6 lists it as `gemini-4-argon-low`, `-medium` and `-high` (the lane model plus the effort), and the table of pairs has it at `high`, and a round of each seat ran on it on 2026-10-15. A name agy does not list fails the round in seconds, and the native agent takes it. The swarm's calls reach Argon by the same rule, as any other pair.
- **Measured before it is trusted.** [`docs/evaluations/seats/README.md`](../evaluations/seats/README.md) compares each external seat with its native agent. Its Judge part gives both the same documents with seeded defects and scores them without a model. Until it runs, the rule trusts Argon as Judge by its points: if quality drops, the seat goes back to Opus.
- **Fable** stays out until Fable 5.5 (A43).
