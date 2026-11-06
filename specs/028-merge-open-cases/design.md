# Design: `aether-wt settle`, the supported exit of an unverified commit that is no longer the tip (issue #78)

- **Feature:** `specs/028-merge-open-cases`
- **Author:** the Lead (Sonnet 5.5), 2026-11-05. Revision 2, after the Judge's first review (`revise`).
- **Route:** short design. It touches merge safety: the run's merge queue and its tests-before-counted rule.

## The owner's words

Session of 2026-11-05. The owner asked which issues were open, then which were bugs, and said: «los que son bugs resueslvelos automaticamente cuando temrines regresas y me avisas para cotninuar con los de nueva funcion». Issue #78 is one of the three bugs (#152, #91, #78). The owner's standing rule for merges: a merge whose tests did not finish counts as not merged, and the safe stop is to block, never to count an untested commit as merged.

## What the issue says, read against `main` (0.32.0)

Issue #78 lists five cases left open on purpose after decision A77 (a merge cut at 600 s counts as not merged until its tests pass), each with a way out by hand:

1. **A kill inside `git merge`** leaves `MERGE_HEAD` and the unit's marker with no commit. `abortUnfinishedMerge` (`lib/worktrees.js`) already undoes a half merge when the same unit merges again, but the workflow does not rerun the merge: after a cut it asks `aether-wt status`, which answers `{ merged: false, branch, commit: null, head }` in that state (neither merged nor unverified), and the unit is blocked.
2. **A kill during a `pre-merge-commit` hook, or a leftover `index.lock`**: permanent `dirty-integration`, pre-existing.
3. **An unverified commit that is no longer the tip** (the Lead committed on top): `mergeUnit` answers `unverified-buried` (or `unverified-moved` when the unit branch has moved), and the only exit is by hand: run the tests, delete the marker file (`docs/guide/troubleshooting.md`, `docs/guide/ops.md`). There is no command.
4. **Units refused `unverified-other`** still go through a full implement-and-review cycle and then lose their branch (a patch is kept).
5. **The engine's timeout** may kill only the node process and not its process group (`$.process.run`, `hooks/register.js`).

## What changes: one command

### `aether-wt settle <run> <task>`

Run by the Lead by hand, for a marker whose commit is on the integration branch but that `merge` will not rerun (`unverified-buried`, `unverified-moved`). It verifies the integration branch **as it is**, and never changes it.

1. Takes the run's merge lock, as `merge` does, and drops it at the end.
2. Reads the test command and the integration worktree from the run's graph. The task does not have to be in the graph: the marker file is the list (as `markerTaskIds` does), so a task that `--only` dropped can be settled.
3. **Refuses, with a reason and no change:** the task has no marker (`no-marker`); the integration worktree is missing, on another branch, or dirty (`status --porcelain --untracked-files=no` is not empty), or `MERGE_HEAD` exists there (`merge-in-progress`). The dirty and merge-in-progress checks come **before** any judgment of the marker.
4. **Classifies the marker**, with the helpers `merge` uses (`markerRecord`, `unverifiedCommit`):
   - a marker with a `commit` that is on the integration branch: live, with that commit;
   - a marker with a `commit` that is no longer on the integration branch (the merge was reset away): **stale**;
   - a marker with `before` and no `commit`: live when `mergeSubjectCommit` finds the unit's merge commit on the branch, **stale** when it finds none (the merge never committed);
   - a marker with **neither `commit` nor `before`** (a half-written file; `markerRecord` returns both null): **always live with an unknown commit, never stale.** A merge commit may exist that the marker never named, and clearing the marker would make `unitStatus` count it merged. Tests run as for a live marker.
5. **Stale:** clears the marker, changes nothing else, and says so: `{ settled: true, stale: true, task }`.
6. **Live:** runs the plan's `testCommand` in the integration worktree **at the current tip**, with the same timeout, buffer and baseline judgment as `settleMerge` (`common.runShell`, `readBaseline`, `judge`). The tip contains the marked commit, so a pass verifies it together with what was built on it.
   - Pass, or only the baseline's known failures: clears the marker. `{ settled: true, task, commit, tip }`, plus `knownFailures` when there are any. `commit` is the marked commit, or `null` when the marker named none.
   - Fail, or killed by the timeout: **keeps the marker and resets nothing.** `{ settled: false, reason: 'tests', exitCode, timedOut, output }`, `output` being the last 4000 characters, as `merge` gives it. Commits above the marked one are not this command's to undo.
7. `bin/aether-wt` gets the verb in its usage line and dispatch (`settle <run> <task>`, positional like `merge`). `settle` is not a workflow step: `hooks/ops-command.mjs` is not touched.

### Docs

- `docs/guide/troubleshooting.md` (the paragraph «The tests take more than 10 minutes») and `docs/guide/ops.md` (the «10-minute limit» item) replace the by-hand recipe for a commit that is no longer the tip («run the plan's tests by hand ... delete the unit's marker file») with `aether-wt settle <run> <task>`, and say that a failing settle keeps the marker and changes nothing. The by-hand exit stays only where `settle` cannot be used. The Spanish pages that repeat them (grep `docs/es/` for «unverified» and «marker») follow.
- `plugins/aether/skills/swarm/SKILL.md` only if it names the by-hand exit; it should name `settle`.
- `docs/decisions.md` gets one numbered decision (the next A number) with the cases left unchanged and why.

## What does not change, and why

- **Case 1, the rerun in the workflow. Not built, on purpose.** The first version of this design built it; the Judge showed that it is not safe on what is known. The lock records the node process, so it goes stale when the engine kills that process; if the engine does not kill the process group (case 5), an orphan `git merge` may still be inside its hook while the rerun aborts the half merge and merges again, and the orphan's commit can then land with no marker, which `status` counts as merged. A rerun limited to a state with no `MERGE_HEAD` and no `index.lock` would be so narrow that it is not worth the code (issue #78 itself records that two earlier versions of the A77 machinery were thrown away because they opened more cases than they closed). The block stays the safe stop, the exit by hand stays documented, and the existing test `tests/workflow.test.js:261-276` (a cut whose status is `{ merged: false, commit: null }` ends `merge failed:` after one `aether-wt merge`) stays as it is. What would reopen it: a measurement that the engine kills the whole process group at its timeout.
- **Case 2 (index.lock, pre-merge-commit hook).** Removing `index.lock` without proof that no git process is alive can corrupt the index; the failure is loud (`dirty-integration` with its detail), not silent. The way out by hand stays documented.
- **Case 4 (`unverified-other` after a full cycle).** The refusal is the safe stop the owner's rule asks for, and the work is kept as a patch. Stopping new work after a blocked unit changes the swarm's scheduling. It goes to the owner as a proposal, not worked.
- **Case 5 (process group).** The engine's behavior, not Aether's, and it cannot be measured from this repository without a real 600 s kill. The new command does not depend on it: it only runs tests on a tree that no merge is changing (the lock, the clean worktree and the absence of `MERGE_HEAD` are checked first).

Issue #78 stays open for cases 1, 2, 4 and 5 unless the owner decides otherwise; its text is not edited, and a comment says what was built.

## Tests

In `tests/worktrees-merge.test.js`, with its own helpers and what they return: `setup(t)` gives `{ repo, args, unit }` (`makeRepo` → `{ dir, git }`, `compile` → `args.runId`, `ensure` → `{ path, branch }`); `commitIn(repo, dir, file, text, message)` commits in a given worktree; `writeUnverifiedMarker(mainRoot, runId, taskId, commit, before)` is exported by `lib/worktrees.js`; the integration worktree's path is `run.readJson(path.join(run.runDir(repo.dir, args.runId), 'graph.json')).integration.worktree`, and a commit on top of a merge is made with `commitIn(repo, <that path>, …)`. The test command is the plan fixture's.

- a marked commit buried under a second commit, tests pass: `settled: true`, the marker file is gone, and `unitStatus` then reports `merged: true`;
- the same with tests failing: `settled: false`, the marker file still there, the tip and the files unchanged (`git rev-parse HEAD` equal before and after);
- a marker with `before` and no commit, and no merge commit on the branch: stale, cleared, `stale: true`;
- a marker with `before` and no commit, with the unit's merge commit on the branch: live, tests run;
- **a marker file with neither commit nor `before`** (written as `{}` or as broken JSON): tests run at the tip and the marker is cleared only on a pass; a failing run keeps it;
- a marker whose commit was reset away: stale, cleared;
- refusals with no change: no marker; a dirty integration worktree; `MERGE_HEAD` present; the integration worktree on another branch; and a dirty worktree with a marker with no commit is refused, not cleared (the order of step 3 before step 4);
- the lock is taken and dropped, also on a refusal;
- `bin/aether-wt settle` through `runBin`: the JSON line and the exit code on success and on a refusal;
- a baseline of known failures passes with `knownFailures`.

`tests/docs-facts.test.js` keeps passing: any new `` `aether-…` `` code span is a file of `bin/`.

## Risks

- `settle` verifies a commit with a tree the Lead built on top of it. That is the point: the tip is what ships, and a failure changes nothing.
- A stale marker cleared by mistake would let `status` count an untested commit merged. The classification above clears only a marker that names a commit that is gone, or a `before` with no merge commit and no `MERGE_HEAD`; a marker with nothing in it is never cleared without a passing run.
