# The router asks three questions that do not move the level, and the Lead's climb-on-failure rule meets `command` mode

**Type:** observations (router), one by design to confirm and one not tested
**Date:** 2026-10-19
**Found in:** the Lead's session e591573c, reading `criterion.json` and `router-criterion.js` to explain the decision
**Status:** open
**GitHub:** not filed

## What happened

- **Questions that move nothing.** The decider answers seven questions. In `config/router/criterion.json`, `adjust` raises the level only for `stakes` (2.5 or more) and `many_steps` (0.7 or more), and `shape` sets the base. `edits_files` decides only whether the task is read-only. `pinned_by_checks`, `needs_judgment` and `reads_a_lot` are validated and kept in the journal, but `decide()` in `router-criterion.js` never reads them. It may be on purpose, to collect data before tuning. No decision in `docs/decisions.md` says so; it was not searched beyond A55 and A56.
- **Climb on failure.** The bootstrap tells the Lead to run a failed delegate task again one model up (Haiku, Sonnet, Opus). In `command` mode a call without `ROUTER-OVERRIDE` is decided again from its brief, and a relaunch with the same brief may get the same rung. The bootstrap does not say how to combine the two rules. It was not tested.

## Impact

- The first costs a decider answer that changes nothing, and shows a reader of the journal more reasoning than the decision has. The second can leave a failed task on the same model.

## Proposals

1. Either use the three answers in the criterion (measure first with the journal and the replay) or stop asking them. If they are data for tuning, say so in `criterion.json`'s `about`.
2. Test a relaunch after a failure in `command`, and write in the bootstrap what the Lead does: the override with the reason «the previous attempt failed on <model>», or the router's own rung if its note shows it climbed.

## Acceptance

- Each question of the criterion either moves the level or is marked as data only.
- A Lead that must climb a model in `command` knows the step, and a test shows the rung rises.

## Environment

Claude Code 2.1.303, Aether plugin 0.12.2 installed, Sonnet 5.5 as the Lead, Linux (WSL2).
