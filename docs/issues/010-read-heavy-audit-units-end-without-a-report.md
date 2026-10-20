# Read-heavy audit units end twice without a report after about 140 tool calls, so the swarm blocks them as too large

**Type:** bug (swarm, implementer budget)
**Date:** 2026-10-15
**Found in:** the run that reconciled the documentation (spec 004, run `20261015-011925-90a1`), units 17, 18 and 19
**Status:** partly fixed in 0.14.0 (2026-10-20), see the Update below for what is built and what is open.
**Update 2026-10-19, branch `fix/bug-issues`:** proposals 1, 3 and 4 are built, and 2 in brief form. The implementer is told its budget and to commit and report by about turn 45 of 60 (lanes: well before the budget is out), to commit as it goes, and — on an attempt after one ended without its report — to work the owned files one at a time, committed and noted before the next is opened. `aether-plan check` (in `buildGraph`) warns when a brief names more than 8 files to read beyond the ones the task owns. Still open in full: splitting the brief itself by owned file into separate attempts.
**GitHub:** [#14](https://github.com/DarkArty07/aether-plugin/issues/14) (private repository)

## Summary

Three units whose job was to read every claim of four pages against the plugin's code, and correct what is false, each ended without its report on both attempts. Each owned four files. They made 127 to 145 tool calls, all reads, and the transcripts end on a tool result: the agent was cut off mid-reading, then the workflow's nudge got no `StructuredOutput` either.

## What happened

- Attempt 1 and attempt 2 of each unit ran on the same rung, Sonnet at `xhigh`; the ladder did not change the shape of the work.
- `aether-wt salvage` found "no report, nothing to salvage": the agents had edited nothing yet, so there was no work to commit.
- The unit was then blocked with "probably too large for one attempt", and the unit that depended on them was skipped.
- The six attempts cost US$ 11.2 at list prices and produced nothing.

## Impact

- A third of a 20-task plan, the reconciliation that the plan was for, produced no output and 40% of the run's cost was spent on it.
- The task's size is not in its number of owned files, which `aether-plan check` warns about (more than 6), but in the volume it must read.

## Proposals

1. Tell the implementer its budget: warn it at about 70% of its tool calls or turns, and ask for its report then, with what it has.
2. Make the second attempt different: split the brief by owned file when the first ended without a report, instead of repeating it on the same rung.
3. Ask a read-heavy task to commit as it goes, so that salvage has something to keep.
4. Have `aether-plan check` warn about a task whose brief names more than a few files of code to read.

## Acceptance

- A unit that reads a lot ends with a report that lists what it checked and what it did not, or with a commit of what it fixed.
- The reconciliation of the run above completes in the swarm, not by hand.

## Environment

Aether 0.10.0, Claude Code 2.1.300, Linux (WSL2).
