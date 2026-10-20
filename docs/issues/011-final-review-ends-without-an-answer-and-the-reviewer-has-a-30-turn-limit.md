# The final review ends without its answer on a 1,569-line change, and the reviewer agent stops at 30 turns

**Type:** bug (swarm, final review)
**Date:** 2026-10-15
**Found in:** the run of spec 004 (run `20261015-011925-90a1`)
**Status:** fixed in 0.14.0 (2026-10-20): a final review of more than three merged units runs in slices of at most three units of an area with a reading plan. It returned a verdict on a run of 14 tasks in six slices, the first time it ran for real. The reviewer's `maxTurns` as a plan setting is not built. See the Update below.
**Update 2026-10-19, branch `fix/bug-issues`:** proposals 1 and 2 are built with issue 022: a final review of more than three merged units is sliced by area into groups of at most three, and every reviewer is told its 30-turn budget, to read at most 20 turns in batches, to verify at most six claims and to begin its answer by turn 28. Proposal 3 (the reviewer's `maxTurns` as a plan setting) is not built.
**GitHub:** [#15](https://github.com/DarkArty07/aether-plugin/issues/15) (private repository)

## Summary

The final review, on Opus at `xhigh`, failed with `subagent completed without calling StructuredOutput (after in-conversation nudge)`, on a run that changed 23 files and 1,569 lines (a 65 KB package for its largest unit). The skill's own fallback, handing an `aether:reviewer` the package, hit the agent's limit: four slice reviewers, each reading three or four pages and a few code files, stopped at 30 turns with no answer, and answered only when they were resumed and asked to write what they had.

## What happened

- The failed final review cost US$ 2.74 and gave no verdict.
- Slice reviewers of `aether:reviewer` stopped at 30 turns after 46 to 51 tool calls, with only a progress note as output. A slice split in two, with an explicit turn budget in the brief, worked.
- Resuming each stopped reviewer with "answer now with what you have" got a complete report at almost no cost, because its context was already loaded.

## Impact

- The run's last quality gate returned `failed`, and the Lead had to review by hand, in slices.
- Nothing in the reviewer's brief or the workflow tells it that its budget is 30 turns.

## Proposals

1. The workflow slices a final review by area when the package is larger than a bound, instead of one reviewer on the whole change.
2. Tell the reviewer its turn budget and when to stop reading and answer; resume it once with "answer now" before treating it as failed.
3. Make the reviewer's `maxTurns` a plan setting.

## Acceptance

- A final review of 1,500 lines and 20 files returns a verdict, in slices if needed.

## Environment

Aether 0.10.0, Claude Code 2.1.300, Linux (WSL2).
