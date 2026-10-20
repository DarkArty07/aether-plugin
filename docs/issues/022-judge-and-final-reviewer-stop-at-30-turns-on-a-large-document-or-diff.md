# The Judge and the final reviewer stop at their 30-turn cap on a large plan or diff, and every relaunch pays for a whole final review

**Type:** limit (design review, final review)
**Date:** 2026-10-16
**Found in:** the build of `specs/006-delegate-router`, the Lead's session 56b71739: a 15-task plan review and a final review of 9 merged tasks
**Status:** partly fixed in 0.14.0 (2026-10-20): the final review half ran for real in slices; the Judge's reading plan is in its message and has not been tried on a document of fifteen tasks. Related to [issue 005](005-report-and-final-review-cannot-represent-hand-integrated-work.md), proposal 3. See the Update below.
**Update 2026-10-19, branch `fix/bug-issues`:** proposals 1 and 2 are built. The Judge's message carries the reading plan (reads batched in one turn, at most 20 turns reading, at most six claims verified, verdict by turn 28), for native and external rounds alike. The final review of more than three merged units runs in parallel slices of at most three units of an area, each reviewer told the files its units own and the same reading plan; the verdict is the least ready slice's, and a slice with no answer fails the review keeping the others' findings — output for output, the session's workaround. Slices run native: a lane call has the one fixed id `final-review`, so a sliced review cannot walk the lanes. Still open: proposal 3, the final review once per run at `finalize`.
**GitHub:** [#33](https://github.com/DarkArty07/aether-plugin/issues/33) (private repository)

## What happened

- `/aether:design` in short mode on `tasks.md` (a 41 KB `plan.md`, a 3,000-line `tasks.md`, 15 tasks): the Judge (`agents/judge.md`, `maxTurns: 30`) ended twice with «ended twice without an answer that fits its schema». It had spent its turns reading and verifying against the code.
- The swarm's final review of the first launch (`aether:reviewer`, `maxTurns: 30`, Opus at `xhigh`) read 34 files in its 30 turns and stopped without its structured answer: `finalReview.status` was `failed` («subagent completed without calling StructuredOutput»), at US$ 2.40.
- Both are the turn cap, not a model failure. Issue 005 reported the same for a 7,800-line diff and proposed «split a big diff into chunks that each get a reviewer».

## What worked

- A **reading plan in the Judge's message**: independent reads together in one turn, at most 20 turns of reading, the verdict before turn 28, and what to verify (at most six claims). The plan review approved on the next try. It was a patch of the session's copy of the design script, `workflows/design.workflow.js` untouched.
- The final review **in five slices**, one reviewer per group of three tasks, in parallel: each is told which files to read (the files its tasks own), the same turn budget and to answer before turn 28. Each used 12 to 17 requests and US$ 1.2 to 1.6 (US$ 7.0 in all), all five gave a verdict, and together they found 36 findings (2 critical, 10 important) that the single reviewer had not reached. The run's verdict is the least ready of the five; a slice with no answer makes the review `failed` and keeps the others' findings. Also a patch of the session's copy of `workflows/run.workflow.js`, checked in the repository's workflow harness before it ran.

## Impact

- A plan of fifteen tasks or more cannot be reviewed by the Judge in one round without help, and a run of that size has no final review unless the Lead splits it by hand.
- A relaunch runs a whole final review again (the first review of this run cost US$ 2.40 and failed; the sliced one cost US$ 7.0), so a run relaunched twice pays it twice.

## Proposals

1. Put the reading plan in the Judge's message in `workflows/design.workflow.js`, or raise `maxTurns` in `agents/judge.md`.
2. Split the final review in `workflows/run.workflow.js` by groups of tasks (by Area), in parallel, with the reading plan; keep «a review that gives no answer is failed, never a verdict».
3. Run the final review once per run, at `finalize`, instead of once per launch (issue 005, proposal 2).

## Acceptance

- A plan of fifteen tasks gets a Judge verdict, and a run of fifteen tasks gets a final review verdict, with no manual patch of a workflow script.

## Environment

Claude Code 2.1.301, Aether plugin 0.11.0 (the build that produced 0.12.0), Linux (WSL2).
