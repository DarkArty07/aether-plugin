# A unit too large for one implementer ends without its report, and the ladder repeats the same failure

**Type:** bug and plan-sizing gap
**Date:** 2026-10-09
**Found in:** the third launch of a 12-task plan on an application repository
**Status:** open (2026-10-09). Sub-project 2. Not seen in the first run of 0.5.0, whose largest unit was one library and its tests.

## Summary

One task changed nine files, one of them a very large server module. Three implementer attempts (Sonnet at `xhigh`, Sonnet at `xhigh`, then Opus at `xhigh`) each finished without calling the structured-output tool that returns their report. The workflow logged "subagent completed without calling StructuredOutput (after in-conversation nudge)" three times, marked the unit `blocked` with "the ladder is spent", and skipped its four dependents. The work itself was done: the final sweep saved a 1,014-line patch with all nine owned files, and it applied cleanly and passed the whole test suite.

## What happened

- The Opus transcript ends in the middle of a final grep for leftover references, with no closing message. It ran 378 events. The attempt looks cut off by a limit (turns or context), not finished and silent.
- Each retry, and the escalation to a stronger model, hit the same wall because the cause was the size of the unit, not the model. The ladder spent three attempts and roughly an hour of wall clock.
- No supervisor ever saw the work, because there was no report to review. The unit was then removed by the sweep. Only the patch kept the work.
- The Lead recovered it by reading the patch, applying it on a scratch branch and running the full test command, which is a manual path outside the swarm's review.

## Impact

- A task that is correct but large looks like a failed task, and the ladder pays for it three times.
- The supervisor review, which is the swarm's quality gate, is skipped for exactly the biggest and riskiest units.
- The dependents are skipped, so one oversized task stalls the rest of the plan.

## Proposals

1. **Salvage before escalating.** When an attempt ends without a report, the workflow should check the unit worktree for commits or a diff, and hand that diff to the supervisor as the attempt's result, with a note that no report exists. Escalate only if the supervisor rejects it.
2. **Make the failure distinguishable.** Log "no report, worktree has N changed files" instead of a generic agent failure, so the Lead can tell it from a real failure.
3. **Ask for the report earlier.** The implementer brief could require committing and filing a partial report at a checkpoint (for example after the tests pass), so a cut-off attempt still leaves a report.
4. **Size check in `aether-plan check`.** Warn when a task owns more than a threshold of files, or a file larger than a threshold, and suggest a split. The task here owned nine files with one very large module.
5. **Do not repeat an identical failure.** If two attempts fail the same way, stop the ladder and ask for a plan fix instead of spending a third.

## Acceptance

- An attempt that ends without a report but leaves commits or a diff is reviewed by the supervisor and can be merged.
- `aether-plan check` warns about a task that is likely too large.
- A repeated identical failure ends the ladder early with a clear reason.

## Environment

Claude Code 2.1.295, Aether plugin 0.3, Linux (WSL2). The unit ran for about 40 minutes across three attempts.
