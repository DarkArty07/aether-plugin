# Design: close the open cases of the unverified merge (issue #78)

- **Feature:** `specs/028-merge-open-cases`
- **Author:** the Lead (Sonnet 5.5), 2026-11-05
- **Route:** short design. It touches merge safety: a concurrent merge queue and `git reset --hard`.

## The owner's words

Session of 2026-11-05. The owner asked which issues were open, then which were bugs, and said: «los que son bugs resueslvelos automaticamente cuando temrines regresas y me avisas para cotninuar con los de nueva funcion». Issue #78 is one of the three bugs (#152, #91, #78).

## What the issue says and what the code already does

Issue #78 lists five cases left open on purpose after decision A77 (a merge cut at 600 s counts as not merged until its tests pass). Read against `main` (0.32.0):

1. **A kill inside `git merge`** leaves `MERGE_HEAD` and this unit's marker with no commit. The library already recovers when the same unit merges again: `abortUnfinishedMerge` (`lib/worktrees.js`) aborts the half merge, and `mergeUnit` calls it first. The workflow does not call it: after a cut, `run.workflow.js` (the block around the `serialized` merge, line ~1515) asks `aether-wt status`, and reruns the merge only when `status.unverified` is true. A kill before the merge commit exists gives `status` = `{ merged: false, branch, commit: null }`, which is neither merged nor unverified, so the unit is blocked and every later unit gets `dirty-integration`. **This is open: the workflow lacks the rerun.**
2. **A kill during a `pre-merge-commit` hook, or a leftover `index.lock`**: permanent `dirty-integration`, pre-existing.
3. **An unverified commit that is no longer the tip** (the Lead committed on top): `mergeUnit` answers `unverified-buried`, and the only exit is by hand (run the tests, delete the marker file). There is no command. **This is open: it needs `aether-wt settle`.**
4. **Units refused `unverified-other`** still go through a full implement-and-review cycle and then lose their branch (a patch is kept).
5. **The engine's timeout** may kill only the node process and not its process group (`$.process.run`, `hooks/register.js`).

## What changes

### A. The workflow reruns a merge that was cut before it had a commit

In the merge turn of `workflows/run.workflow.js`, inside the same `serialized` step, after the first `aether-wt merge` returned `error` and not `merged`, and after `aether-wt status`:

- `status.error` set: as today, blocked, no rerun.
- `status.unverified` true: as today, the rerun that settles the commit.
- **New:** `status.error` unset, `status.merged` false and `status.unverified` falsy: run `aether-wt merge <run> <unit>` once more, long. The library makes it safe: `abortUnfinishedMerge` undoes a half merge of this unit only when `MERGE_HEAD` is this unit's own and its marker has no commit; anything else is left as it is and the merge continues normally or is refused with a reason.
- The result of that rerun is read as a **first** merge result, not as a settle rerun: `merged` counts it merged; `conflict` and `tests` go through the existing single retry (`unit.mergeRetried`); another `error` blocks the unit with a sentence that says the merge was cut twice before it had a commit (not the sentence `UNTESTED`, which says a commit is on the branch); any other `reason` is a refusal as for a first merge.
- At most one extra rerun per merge turn, so a hook that always hangs costs 600 s once more, not a loop.

### B. `aether-wt settle <run> <task>`

A new command, run by the Lead by hand, for a marker whose commit is on the integration branch but is not the tip (`unverified-buried`), or whose unit branch has moved (`unverified-moved`).

- Takes the run's merge lock, as `merge` does.
- Refuses, with a reason and no change: the task has no marker; the integration worktree is missing, on another branch or dirty.
- A marker whose commit is no longer on the integration branch is stale (nothing is unverified): it is cleared and the result says so.
- Otherwise runs the plan's `testCommand` in the integration worktree **at the current tip**, with the same timeout, buffer and baseline judgment as `settleMerge` (`readBaseline`, `judge`). The tip contains the marked commit, so a pass verifies it together with what was built on it.
- Pass (or only known failures): clears the marker. Result `{ settled: true, task, commit, tip, knownFailures? }`.
- Fail, or killed by the timeout: **keeps the marker, resets nothing** (commits above the marked one are not this command's to undo). Result `{ settled: false, reason: 'tests', exitCode, timedOut, output }` with the output tail as `merge` gives it.
- `bin/aether-wt` gets the verb in its usage line and dispatch, and the guide that lists the `aether-wt` commands names it.

### What does not change, and why

- **Case 2 (index.lock, pre-merge-commit hook).** Removing `index.lock` without proof that no git process is alive can corrupt the index; the failure is loud (`dirty-integration` with its detail), not silent. The way out by hand is documented where case 1's was.
- **Case 4 (`unverified-other` after a full cycle).** The refusal is the safe stop the owner's rule asks for, the work is kept as a patch, and stopping new work after a blocked unit changes the swarm's scheduling, which is a policy and not a defect. It stays a possible improvement.
- **Case 5 (process group).** The engine's behavior, not Aether's, and it cannot be measured from this repository without a real 600 s kill. It cannot produce a false pass: tests that fail reset the commit only while it is the tip, and a rerun's own result is what counts.

Issue #78 stays open for cases 2, 4 and 5 unless the owner decides otherwise; its text is not edited.

## Tests

- `tests/worktrees-merge.test.js` (library): `settle` passes and clears the marker with the marked commit buried under a second commit; fails and keeps the marker and the tip; no marker; dirty and wrong-branch refusals; a stale marker is cleared; a baseline of known failures passes; the lock is taken and dropped.
- `tests/workflow.test.js` (workflow with the fake model): a first merge cut, `status` neither merged nor unverified, the rerun merges: the unit is merged and the log says why; the rerun cut again: the unit is blocked with the new sentence and a third `aether-wt merge` is never run; the rerun conflicts: the existing single retry applies; the existing cut-then-unverified path is unchanged.
- `tests/docs-facts.test.js` keeps passing: any new `` `aether-…` `` code span is a file of `bin/`.

## Risks

- A rerun after a kill could undo something that is not a half merge. `abortUnfinishedMerge` guards on the marker having no commit, `MERGE_HEAD` being this unit's own, and the abort succeeding; a committed-but-unmarked merge resets only to the tip it had. This design relies on that code unchanged and adds a test that pins it in the rerun path.
- `settle` could verify a commit with a tree the Lead broke on top. That is the point of running the tests at the tip: the tip is what ships.
