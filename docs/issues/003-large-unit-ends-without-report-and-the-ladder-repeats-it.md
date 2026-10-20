# A unit too large for one implementer ends without its report, and the ladder repeats the same failure

**Type:** bug and plan-sizing gap
**Date:** 2026-10-09
**Found in:** the third launch of a 12-task plan on an application repository
**Status:** partly addressed in 0.8.0 (2026-10-13). Done: a unit stops when it ends twice in a row without its report, with a reason that asks for a split, or when it gets the same blocking findings three times (A36), so the ladder no longer pays for the same failure again. Open: the supervisor does not review the diff an attempt leaves without a report, and `aether-plan check` does not warn about a task that is likely too large.
**Update 2026-10-13, 0.9.1:** proposals 1, 2 and 4 are built (A44). An attempt that ends without its report is salvaged with `aether-wt salvage` and goes to the supervisor, the log says `no report, N changed files on the unit branch`, and `aether-plan check` warns about a task that owns more than 6 paths or the whole tree. Proposal 5 was built in 0.8.0. Still open: proposal 3, a checkpoint report asked of the implementer.
**Update 2026-10-19, branch `fix/bug-issues`:** proposal 3 is built, the last one open: the implementer's brief (native and lane) asks for a commit after each part that passes and for its report well before its budget is out (by about turn 45 of 60 native), naming what it checked and what it did not. With proposals 1, 2, 4 and 5 built earlier, this issue's proposals are all in.
**GitHub:** [#3](https://github.com/DarkArty07/aether-plugin/issues/3) (private repository)

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
