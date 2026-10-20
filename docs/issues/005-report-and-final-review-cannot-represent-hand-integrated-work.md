# The run report and the final review cannot represent work the Lead integrated by hand, and a relaunch's final review sees only that launch

**Type:** bug and reporting gap
**Date:** 2026-10-09
**Found in:** the first real swarm run of a 12-task plan, over four launches
**Status:** partly addressed in 0.8.0 (2026-10-13). Done: the final review's package covers the whole run, from the first launch's base (`firstBase`) to the integration head, and a relaunch's final review is never on Sonnet. Open: the Lead cannot record a unit it integrated by hand, so the report still counts that unit as it ended in the swarm (deferred in the RADAR roadmap); a reviewer that stops without its answer is reported as `failed`, not as a verdict, but the reason does not say it ran out of turns.
**Update 2026-10-13, 0.9.1:** proposals 1 and 4 are built (A45). `aether-wt adopt` records a unit integrated by hand, and `aether-report` shows it as `adopted` and in `integrated`, with its commit and reason in `notes`. A reviewer that gives no answer is reported as `failed` with its reason. Still open: the final review does not run again by itself after an adoption (the swarm skill tells the Lead to run a reviewer on the whole package), and the reviewer keeps its 30 turns, with no chunking of a large diff.
**Update 2026-10-16:** the final review of a 15-task run stopped at its 30-turn cap again, and a final review in five slices fixed it for that run: see [issue 022](022-judge-and-final-reviewer-stop-at-30-turns-on-a-large-document-or-diff.md). Proposal 3 is still open for the plugin.
**Update 2026-10-19, branch `fix/bug-issues`:** proposal 3 is built with issue 022: the final review of more than three merged units runs in slices of at most three units of an area, each reviewer told the files of its units and given the reading plan, and a slice with no answer fails the review keeping the others' findings. Still open: proposal 2, the final review once per run at `finalize` instead of once per launch, which needs its own design; and a final review does not rerun by itself after an adoption.
**GitHub:** [#5](https://github.com/DarkArty07/aether-plugin/issues/5) (private repository)

## Summary

After the swarm's own failures (issues 002 to 004), the Lead integrated three units from their saved patches and did the last task by hand, then ran the whole test command on the integration branch. `aether-report` still said `merged 6, blocked 5, skipped 1`, with an empty `notes` list. In fact all twelve units were in the branch and the test command passed. The reviewer that the workflow runs at the end of each launch looked at only the units that launch merged, so no review ever covered the whole change.

## What happened

- Each relaunch compiles a new `base` and the final review runs on `base..HEAD` of that launch. Across four launches the three reviews saw tasks 2, then 3, 4 and 6, then 9 and 10. The tasks the Lead integrated by hand (1, 5, 7, 8, 11, 12) were reviewed by no reviewer of the run, and the supervisor never saw units 5 and 11 at all.
- The Lead then ran an independent `aether:reviewer` by hand on the full diff. It stopped at its 30-turn limit with "Instrument pass done. Now the test hunks." and no verdict. It finished only after being asked to deliver its findings first and then continue. A 7,800-line diff does not fit in 30 turns.
- `aether-report` has no way to mark a unit as integrated outside the swarm, so the quality section reports the swarm's accounting, not the state of the branch.

## Impact

- The report understates the result and cannot be used as it is in an evaluation of the plugin.
- The riskiest units (the ones that failed twice) are exactly the ones the review gate skips.
- A reviewer with too few turns returns a partial result that looks like an answer.

## Proposals

1. Let the Lead record a unit as integrated by hand (`aether-wt adopt <run> <task> --commit <sha>` or similar), with a reason, so `state.json`, the report and `finalize` agree with the branch.
2. Run the final review once per run, at `finalize`, on the whole diff from the first compile `base` to the integration `HEAD`, not once per launch.
3. Give the reviewer enough turns for the size of the diff, or split a big diff into chunks that each get a reviewer, and fail loudly when a reviewer stops at its limit.
4. Make the report say how each unit was integrated (`merged`, `adopted`, `patch-applied`) and how many launches it took.

## Acceptance

- After a run in which the Lead adopts units, `aether-report` shows every unit as integrated, with how, and the final review covers the full change.
- A reviewer that hits its turn limit is reported as incomplete, never as a verdict.

## Environment

Claude Code 2.1.295, Aether plugin 0.4.0, Linux (WSL2). The run: 12 tasks, 4 launches, 59 agents.
