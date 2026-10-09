# The ops agent runs `aether-wt merge` with the default Bash timeout, so successful merges are reported as blocked

**Type:** bug
**Date:** 2026-10-09
**Found in:** the first real swarm run of a 12-task plan (7 waves) on an application repository

## Summary

`aether-wt merge` runs the plan's whole test command before it merges. In this run that took about four minutes. The workflow runs each merge through the `aether:ops` agent, whose Bash call used the default 120-second timeout. The tool moved the command to the background, the agent returned "unreadable output", and the workflow marked the unit `blocked` with "merge failed". The merges had landed anyway.

## What happened

- Wave 1 had three independent tasks. All three passed their supervisor with `approve`.
- Each merge call hit the 120 s limit. The three units were reported `blocked`. Their nine dependents were `skipped`, and the final review was `skipped` with "no unit merged".
- The integration branch had, at that moment, all three merge commits. The unit worktrees and branches were already removed.
- Nothing in the result said so. The only way to learn it was to read `git log` on the integration branch, and the run's `state.json` still said `compiled`.

## Impact

- The swarm reported 0 of 12 units merged when 3 were. A relaunch of the "blocked" units would try to merge work that is already in, and could duplicate it.
- A unit that is approved and merged looks failed, so the owner (or the Lead) cannot trust the status without checking by hand.
- Any plan whose test command takes more than two minutes will hit this on every merge.

## Cause

`opsPrompt` in the `aether:run` workflow tells the agent to run the command "once, exactly as written" and gives no timeout. The agent cannot know that the command runs the test suite. The workflow then trusts the agent's captured stdout as the only evidence of the merge.

## Workaround used

Edited the run-local copy of the workflow script so the ops prompt asks for a Bash `timeout` of 600000 ms and to wait for a backgrounded command. The plugin was not changed.

## Proposals

1. Pass a timeout that fits the plan: derive it from the test command's measured duration, or use the maximum the tool allows for `aether-wt merge`.
2. Make `aether-wt merge` idempotent and add a status command (for example `aether-wt status <run> <task>`) that reports `merged` from the git history, so the workflow can check the state instead of trusting captured output.
3. When the output is unreadable, check the integration branch for the unit's merge commit before it marks the unit `blocked`.
4. Run merges as a code step in the workflow, not through a model. A merge is deterministic and needs no judgment, and a Haiku agent at low effort adds a failure mode.
5. Have `aether-plan compile` warn when the test command is likely to exceed the ops timeout, for example by timing it once.

## Acceptance

- A merge that takes ten minutes completes and is reported as `merged`.
- Unreadable merge output never produces `blocked` when the merge commit exists, and a regression test covers it.
- `state.json` shows each unit's real status.

## Environment

Claude Code 2.1.295, Aether plugin 0.3, Linux (WSL2). The test command ran about 220 to 240 s.
