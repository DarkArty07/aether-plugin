# Tasks 036: issues abiertos, tanda 8

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node.js 22, CommonJS, no dependencies. Tests use `node:test` and the helpers of `tests/helpers.js` (`tempDir`, `makeRepo`) and `tests/workflow-harness.js`. No test makes a network or paid call.
- Write each test first and see it fail for the reason the task names; then write the code. A test that passes before the fix does not count.
- The behaviour of everything a task does not name stays as it is. Do not change `docs/changelog.md`, the version, `plugin.json` or any file under `specs/`.
- Before finishing, search `tests/` (`grep -rn`) for a fragment of every text the task changed or removed. A test that pins the old text and is not in `Owns` is reported in the task's final message, not edited.
- A new file of `lib/` is a CommonJS module; a bin stays thin and calls it by path.
- The parts of `skills/using-aether/SKILL.md` must not grow (Task 21 owns that file; no other task edits it).
- Test command for the whole build: `npm test`. Each task also runs its own files with `node --test <files>`.
- Spanish text in a doc or skill stays Spanish; the code, the tests and the messages are English unless the existing file says otherwise.
- The C4 findings below are numbered as in `specs/036-open-issues-8/evidence/triage-256.md` (`#256 N`) and `evidence/triage-232-236.md` (`#232 N`, `#236 N`); read only the lines the task names.

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] [US1] Read the last JSON line of an ops reply in `plugins/aether/workflows/run.workflow.js` and `design.workflow.js` → Task 1
- [ ] T002 [P] [US3] Follow a detached HEAD in `plugins/aether/lib/lane-work.js` and the two result paths → Task 2
- [ ] T003 [P] [US5] Keep `checkout --detach` out of the external brief and note it to the Lead in `plugins/aether/lib/delegate-task.js` → Task 3
- [ ] T004 [P] [US6] Refresh every page row and keep the estimate distance in `scripts/refresh-lanes.js` and `plugins/aether/config/pairs.json` → Task 4
- [ ] T005 Watch and cleanup minors of #256 in `plugins/aether/lib/wt-watch.js` and `worktrees.js` → Task 5
- [ ] T006 Stuck-record minors of #256 in `plugins/aether/lib/wt-stuck.js` → Task 6
- [ ] T007 [P] Run durations and report minors in `plugins/aether/lib/run-timings.js` and `report.js` → Task 7
- [ ] T008 [P] Swarm skill and components page minors of #256 → Task 8
- [ ] T009 Compile minors of #256 and #232 and the baseline duration in `plugins/aether/lib/plan-compile.js` → Task 9
- [ ] T010 Rescue minors of #256 in `plugins/aether/workflows/run.workflow.js` and the harness → Task 10
- [ ] T011 Design-workflow failure shapes of #232 in `plugins/aether/workflows/design.workflow.js` → Task 11
- [ ] T012 [P] Move the Bash parser to `plugins/aether/lib/bash-parse.js` → Task 12
- [ ] T013 [P] Autonomy launch-refusal minors of #232 in `plugins/aether/lib/autonomy.js` → Task 13
- [ ] T014 [P] Ladder guards of #236 in `plugins/aether/lib/ladder.js` and `wt-ladder.js` → Task 14
- [ ] T015 [P] [US2] Agent texts ask only for what is read, in `plugins/aether/agents/*.md` → Task 15
- [ ] T016 [P] [US7] `aether-observe proposals` and the start-up note → Task 16
- [ ] T017 One list of harness names in `plugins/aether/lib/harness-names.js` → Task 17
- [ ] T018 One pick-data function in `plugins/aether/lib/pick-data.js` → Task 18
- [ ] T019 [US8] `aether-autonomy quota-brake` in `plugins/aether/lib/autonomy-command.js` → Task 19
- [ ] T020 [US9] `aether-delegate approve` in `plugins/aether/lib/delegate-approve.js` → Task 20
- [ ] T021 The skills name the commands and the start-up parts do not grow → Task 21
- [ ] T022 One mark store in `plugins/aether/lib/lane-marks.js` and `router-marks.js` → Task 22

### Task 1: The ops reply is read from its last JSON line (#257)

**Aether:**
- Area: workflows
- Owns: `plugins/aether/workflows/run.workflow.js`, `plugins/aether/workflows/design.workflow.js`, `tests/ops-note.test.js`, `tests/ops-exit-code.test.js`
- Depends on: none
- Serves: R1, R2, R3

**Interfaces:**

In each workflow file add a local function (the two files do not share modules):

```text
// Scans the lines of `text` from the last up; returns the first line that starts with `{` and parses to a plain
// object, or null when there is none.
function lastJsonObject(text)
```

Use it in `opsOnce` (`run.workflow.js` around line 378), in `ops` (`design.workflow.js` around line 295), in the `paused` read of `capClock` (run, around line 338), in the stuck `tick` read (run, around line 1737) and in any other place of the two files that parses a bin's reply with `JSON.parse(lines[lines.length - 1])`. A reply with no such line keeps today's result: `{ error: 'unreadable output from <command> (the ops agent may have refused or not run it): <first 300 chars>' }`, and in `run.workflow.js` the `notRun` flag when `NOT_RUN` matches. The `trackedFiles` read near line 1001 of `run.workflow.js` is not a bin reply (git prints paths, one per line) and stays as it is.

**Tests (write first):** `tests/ops-note.test.js` runs both workflows in `tests/workflow-harness.js` with an ops handler that returns `{ raw: { exitCode: 0, stdout } }` (see `tests/ops-exit-code.test.js` for the shape):

1. Run workflow, a one-unit plan built as in `ops-exit-code.test.js`: the first `ops:ladder` read returns `stdout = JSON.stringify(out) + '\n(Note: the command output did not print an exit code)\n'`; the unit finishes `merged` and its result has no `unreadable` error. A second case puts the note before the JSON line (`'Ran it.\n' + json`) with the same expectation.
2. Run workflow: the same read returns `stdout = 'I could not run that command.'`; the result carries the error `unreadable output from` and the old retry/`notRun` behaviour, i.e. the same outcome as before the change.
3. Design workflow: a design run in the harness of `tests/workflow-design.test.js` whose ops read (e.g. the `aether-lane seat-start` or the first `ops` call) returns the JSON line plus a trailing note continues and ends `approved` as without the note; a stdout with no JSON line returns the `unreadable output from` error.
4. The function is local to each workflow and the workflows export only `meta`, so its edge cases run through the harness, as the `ops:ladder` read of case 1 (`n === 1`) with these stdouts: `'text\n' + json + '\nmore'` and `'{bad\n' + json` finish `merged` as without the change; `'[1,2]'` and `''` end with the `unreadable output from` error and no `merged`.

**Acceptance:** all four tests pass; they fail on the old code for cases 1, 3 and the first two stdouts of case 4; `node --test tests/ops-note.test.js tests/ops-exit-code.test.js tests/workflow.test.js tests/workflow-design.test.js` passes.

### Task 2: A commit on a detached HEAD is not lost (#255)

**Aether:**
- Review: xhigh — moving a branch to the HEAD may drop or hide the user's committed work
- Area: lanes
- Owns: `plugins/aether/lib/lane-work.js`, `plugins/aether/lib/lane-calls.js`, `plugins/aether/lib/lane-delegate.js`, `plugins/aether/lib/delegate-run.js`, `tests/lane-work.test.js`, `tests/lane-delegate.test.js`, `tests/delegate-run.test.js`, `tests/muse-lane.test.js`, `tests/codex-lane.test.js`, `tests/detached-head.test.js`
- Depends on: none
- Serves: R4, R5, R6, R8

**Interfaces:**

In `lib/lane-work.js` export:

```text
// Called after an attempt of an implementer on another harness, before checkOwns and before the package is made.
// worktree: path; branch: the unit's branch. HEAD attached to `branch`: { moved: false }.
// HEAD detached, ahead of the branch and the branch is its ancestor: runs `git branch -f <branch> HEAD`, then
//   `git checkout <branch>` in the worktree (uncommitted files stay in the working tree), returns { moved: true, head: <sha> }.
// HEAD detached and not a descendant of the branch (and not equal to it): returns
//   { rejected: true, reason: 'HEAD <sha7> is detached and does not descend from <branch> (<sha7>); its commit is not on the unit branch' }.
function reattachDetached(worktree, branch)
```

Call it in `lib/lane-calls.js` before `work.checkOwns` and in `lib/lane-delegate.js` before its Owns check, and make `finishImplementer` and the delegate result use the branch's commit as `head` (not the worktree's HEAD): the `Branch: … at …` line of `editsText` in `lib/delegate-run.js` and the `head` that `finishImplementer` returns name the commit the branch is at. A `rejected` result ends the attempt with `reason` as the motive; nothing reaches the reviewer or `aether-wt merge`. After `finishImplementer` commits uncommitted files it must commit on the branch (the worktree is re-attached by `reattachDetached`, so the commit lands on the branch).

**Tests (write first):** `tests/detached-head.test.js` on a throwaway repo (`makeRepo`) with a unit branch and a worktree, and a simulated implementer (a function that runs `git checkout --detach`, writes a file and commits):

1. Ahead and descendant: after the attempt the branch points at the new commit, the worktree is on the branch, and the package for the reviewer lists the file; `aether-wt merge` (the function in `lib/worktrees.js`) merges it; the result names the branch and that commit. Cover the delegate path (`lane-delegate`/`delegate-run`) and the swarm path (`lane-calls`).
2. Not a descendant: the implementer checks out a commit of the base's other line (`git checkout --detach <sibling>`, commits). The attempt is rejected with a reason that contains the word `detached`, both short commits and the branch name; the reviewer package is not built and the merge is not run, on both paths.
3. Detached with a committed file and an uncommitted file: the branch ends with the committed work; the uncommitted file is committed on the branch by the finish step (so it is in the package and the merge); `git rev-parse --abbrev-ref HEAD` of the worktree is the branch name.
4. A detached commit that changes a file outside Owns ends as `violation` on both paths, and the branch had moved before the check (`git rev-parse <branch>` equals the detached commit).
5. HEAD attached to the branch: nothing moves; `reattachDetached` returns `{ moved: false }`; the result line is `Branch: <branch> at <sha>` with the branch's sha.

**Acceptance:** the five tests pass and fail on the old code; `node --test tests/detached-head.test.js tests/lane-work.test.js tests/lane-delegate.test.js tests/delegate-run.test.js tests/muse-lane.test.js tests/codex-lane.test.js tests/aether-lane.test.js tests/worktrees-merge.test.js` passes (tests not owned are only read: if one of them pins the old behaviour, report it).

### Task 3: The external brief has no `checkout --detach` and the Lead is told (#255, R7)

**Aether:**
- Area: delegate
- Owns: `plugins/aether/lib/delegate-task.js`, `tests/delegate-task.test.js`, `tests/delegate-brief.test.js`
- Depends on: none
- Serves: R7, R8

**Interfaces:**

`externalPrompt` of `lib/delegate-task.js` keeps getting only `laneSections`, not `startSection` (a regression guard; the Claude delegate's prompt and its rescue keep `startSection`). When `aether-delegate begin` is given a prompt for an external pair that edits and that prompt contains the text `checkout --detach`, the printed result carries a note for the Lead:

`note: the prompt you wrote asks the delegate to run "checkout --detach"; the system does not ask for it and the brief is left as you wrote it. A commit on a detached HEAD is followed by the branch (spec 036 R4), but ask for the branch instead.`

The prompt and brief are not changed. Where `begin` returns its fields (find the object that carries `brief`/`task`), add `note` (string) only in that case. A prompt without the text, or for a Claude delegate, has no such note.

**Tests (write first):** `tests/delegate-brief.test.js`, using the helpers of `tests/delegate-task.test.js`:

1. `begin` for an external editing pair with a clean prompt: the brief file the delegate reads (the `--brief` file or the one `externalPrompt` builds) does not contain `checkout --detach` and does not contain `Where your worktree starts`.
2. `begin` for a Claude delegate with a clean prompt: the prompt keeps `Where your worktree starts` and the base commit.
3. `begin` for an external editing pair with a prompt that contains `git checkout --detach <sha>`: the result has `note` equal to the text above; the brief file still contains the Lead's line unchanged (this fails today: there is no note).
4. A Claude delegate with that prompt: no `note`.
5. Search `plugins/aether/skills` and `plugins/aether/agents` (`.md` files): none of them contains `checkout --detach`.

**Acceptance:** tests 1, 2, 4 and 5 pass today as guards; test 3 fails today and passes after; `node --test tests/delegate-brief.test.js tests/delegate-task.test.js tests/delegate-run.test.js` passes.

### Task 4: Refreshing the figures does not move the ladder (#235, #236 3, 4, 6)

**Aether:**
- Area: pairs
- Owns: `scripts/refresh-lanes.js`, `plugins/aether/config/pairs.json`, `.claude/skills/artificial-analysis/aa-api.js`, `AGENTS.md`, `docs/reference/artificial-analysis.md`, `docs/guide/lanes.md`, `docs/contributing.md`, `tests/refresh-lanes.test.js`, `tests/aa-api.test.js`, `tests/pairs.test.js`, `tests/pairs-claude.test.js`, `tests/muse-spark.test.js`, `tests/copies-muse.test.js`, `tests/docs-032.test.js`, `tests/lanes-docs.test.js`, `tests/lane-table-index.test.js`, `tests/agents-md.test.js`
- Depends on: none
- Serves: R9, R10, R11, R12

**Interfaces:**

- `scripts/refresh-lanes.js`: one run reads the AA page (the existing page fetch, simulated in tests) of every row of `config/pairs.json` that has a page, not only the Claude rows, and writes `intelligence`, `costPerTaskUsd`, `code`, `codeCostPerTaskUsd` and `codeMinutesPerTask`, and sets `checked` and `codeChecked` to the same date on all of them. It still does not write the ladder (`config/ladder.json`): it prints the recalculated one. It no longer prints the warning that the other rows keep an older date. Fix #236 3: the value regex `[^,}]+` must not eat the space before `}` when the last field is numeric, and the `written to` line prints only when at least one patch was written.
- Rows without a page (Muse Spark `low`, `medium`, `high`, `xhigh`) carry `estimateOf` (the id of `claude/haiku@<same effort>`) and `estimateDistance` (their intelligence minus the reference's: today 28.7 − 29.6 = −0.9 at `high`). The refresh sets their `intelligence` to the reference's new value plus `estimateDistance`, rounded to one decimal. Their `ownerDecision` is rewritten: «Estimate = the figure of the Haiku row of the same effort plus a stored distance (spec 036 R10)», keeping the owner's 2026-10-27 decision and the 2026-10-30 estimate as dated history, no longer as the current method (no share of the 36.4 maximum).
- `aa-api.js`: remove `cli` from `module.exports` (it is only used by the file's own main guard). #236 6: `docs/reference/artificial-analysis.md:52` and the guide say the figures are refreshed together by the refresh script (no «part 2»); `AGENTS.md` line on `scripts/refresh-lanes.js` and `docs/contributing.md`/`docs/guide/lanes.md` say it reads every row with a page and writes their figures, and still does not save the ladder.

**Tests (write first):** extend `tests/refresh-lanes.test.js` (simulated pages, no network):

1. A pass over simulated pages leaves one date in `checked` and `codeChecked` for every row that has a page (a `Set` of the dates has size 1) and writes the intelligence of non-Claude rows from their page.
2. Pages with the Claude scale 0.3 points higher: Muse Spark `high` still serves the same rung (compute the ladder with `lib/pareto.js` from the written rows before and after; same rung, same pair); its `intelligence` equals the new `claude/haiku@high` value plus −0.9.
3. `config/pairs.json`: the four Spark rows have `estimateOf` and numeric `estimateDistance` and their intelligence equals the reference plus the distance (`tests/pairs.test.js`).
4. The refresh does not write `config/ladder.json`; there is no network call (the fetch is injected).
5. A patch whose last field is numeric keeps the space before `}`; `--write` with no changes prints no `written to` line (#236 3).
6. `tests/aa-api.test.js`: `require(aa-api.js).cli` is `undefined` (#236 4).
7. Docs: `docs/reference/artificial-analysis.md` does not contain `part 2`, and `AGENTS.md` names that the refresh reads every row with a page (#236 6); update the pinned phrases of `tests/lanes-docs.test.js` and `tests/docs-032.test.js` accordingly.

**Acceptance:** `node --test tests/refresh-lanes.test.js tests/aa-api.test.js tests/pairs.test.js tests/pairs-claude.test.js tests/muse-spark.test.js tests/copies-muse.test.js tests/docs-032.test.js tests/lanes-docs.test.js tests/lane-table-index.test.js tests/agents-md.test.js tests/superdelegation.test.js tests/router-pick.test.js` passes; no figure changes the pair that serves a rung.

### Task 5: Watch and cleanup minors of #256, with the merge-test duration

**Aether:**
- Area: swarm-stuck
- Owns: `plugins/aether/lib/wt-watch.js`, `plugins/aether/lib/worktrees.js`, `tests/wt-watch.test.js`, `tests/worktrees-cleanup.test.js`, `tests/worktrees-merge.test.js`, `tests/aether-wt.test.js`
- Depends on: Task 7 — `lib/run-timings.js` and its `recordTiming` are what this task calls
- Serves: R12, R18

**Interfaces:**

Fix, each with the triage test (`#256 N`): 15 `watchCommand` calls `run.assertRunId(runId)` (an invalid id such as `../..` or `undefined` throws `invalid run id`); 16 the run directory is checked on each poll, so a deleted run ends as `run <id> not found`/`ended`, not `silent` with a null silence; 17 the lstat/no-follow walk of `newestWriteMs` (`wt-watch.js`) and `modifiedSince` (`worktrees.js`) is one function, exported from one module and used by both; 18 `worktrees.js` writes the end mark in a `finally` so a failing cleanup still leaves it; 19(d) the watch writes nothing: the newest mtime of the run directory is unchanged across a wait; 20 the liveness scope includes `.aether/worktrees/<id>`, so a run that is quiet but whose unit worktree is being written is not `silent`; 21 `taskNumber`/`readStuckRecords` filter names with the task-id pattern so a stray `.json` does not corrupt the order. Export from `worktrees.js` the task-merging loader that `lib/wt-stuck.js` `loadTasks` duplicates (#256 14 is done by Task 6, which needs that export; the existing `loadGraph` stays).

Duration: call `require('./run-timings.js').recordTiming(runDir, 'merge-tests', ms)` after the test command of each merge in `worktrees.js`. The module's signature: `recordTiming(runDir, klass, ms)`. `aether-wt watch` records nothing: it writes nothing (`wt-watch.js` opens with that rule and counts any write under the run directory as a sign of life), which fix 19(d) tests. The stuck wait is timed by Task 6.

**Tests (write first):** one test per fix in `tests/wt-watch.test.js` and `tests/worktrees-cleanup.test.js` (use the cases named in the triage lines: `watch undefined-id` and `../..` throw `invalid run id`; deleted run directory; two different record names order by task number; a failing cleanup still leaves the end mark; mtime unchanged across a wait; live worktree activity is not silent), and in `tests/worktrees-merge.test.js` a merge writes one `merge-tests` line to `<runDir>/timings.jsonl`; a `watch` wait leaves no `timings.jsonl` (the same newest-mtime assertion as 19(d)).

**Acceptance:** all tests above pass and fail on the old code; `node --test tests/wt-watch.test.js tests/worktrees-cleanup.test.js tests/worktrees-merge.test.js tests/aether-wt.test.js tests/aether-wt-stuck.test.js tests/wt-sweep.test.js tests/worktrees-salvage.test.js` passes.

### Task 6: Stuck-record minors of #256 (`wt-stuck.js`)

**Aether:**
- Review: xhigh — `stuckEnd` decides whether a delivered fix is merged or expired
- Area: swarm-stuck
- Owns: `plugins/aether/lib/wt-stuck.js`, `tests/wt-stuck.test.js`, `tests/aether-wt-stuck.test.js`, `tests/ops-command-stuck.test.js`
- Depends on: Task 5 — it exports the task-merging loader that `loadTasks` duplicates
- Depends on: Task 7 — `lib/run-timings.js` and its `recordTiming` are what this task calls
- Serves: R12, R18

**Interfaces:**

- #256 10: `stuckEnd(…)` on a record whose state is `delivered` leaves it unchanged and returns it with `state: 'delivered'` (no overwrite to `expired`/`ceiling`); the flow (Task 10) acts on that state.
- #256 11: `deliver --commit <value>` checks the value with the shape check `adoptUnit` uses (a hex id or a branch-like name, not starting with `-`) and calls `git rev-parse --verify --quiet --end-of-options <value>^{commit}`.
- #256 14: `loadTasks` is removed and `wt-stuck.js` uses the exported loader of `worktrees.js`.
- Duration (R18): the stuck wait is timed here, from the stuck record, not by the watch: when the wait of a record ends, `wt-stuck.js` calls `require('./run-timings.js').recordTiming(run.runDir(mainRoot, runId), 'wait-stuck', ms)` with `ms` = the end time minus the record's `at` (set by `stuckBegin`). The wait ends in exactly one of three places, each once per record: `deliverFix` (end = `delivered.at`), `declineUnit` (end = `declined.at`) and `stuckEnd` on a record still `waiting` (end = `ended.at`). `stuckEnd` on a `delivered` record (fix 10) records nothing more.

**Tests (write first):** in `tests/wt-stuck.test.js`: (10) deliverFix then `stuckEnd(expired)` keeps state `delivered`; (11) `deliver --commit -q` is rejected by the shape check and a valid commit still works; (14) both `salvageUnit` and `stuckBegin` read tasks through the one exported loader (assert `typeof worktrees.<loader>` is used: spy by requiring the module and checking `wt-stuck.js` has no function `loadTasks`). In `tests/aether-wt-stuck.test.js`: (12) the test `decline attends the unit` re-reads the tick and asserts the state is `declined` on a fresh run directory, so the silence does not mask a wait; (13) a new test opens an autonomous run whose hours have passed (`time` ceiling) and asserts `stuck-tick` returns `stop: true` through the default path, not through an injected `stopped`; (R18) `stuckBegin` then `deliverFix` writes one `wait-stuck` line to `<runDir>/timings.jsonl` whose `ms` is the time between the record's `at` and `delivered.at` (use a record with a fixed `at`); `stuckBegin` then `declineUnit` one line; `stuckBegin` then `stuckEnd(expired)` one line; `deliverFix` then `stuckEnd(expired)` still one line.

**Acceptance:** the tests pass and the new/changed ones fail on the old code; `node --test tests/wt-stuck.test.js tests/aether-wt-stuck.test.js tests/ops-command-stuck.test.js tests/wt-watch.test.js tests/report-timings.test.js` passes.

### Task 7: Run durations in the report, and the report minors (#209, #256 2 and 3, #236 5)

**Aether:**
- Area: report
- Owns: `plugins/aether/lib/run-timings.js`, `plugins/aether/lib/report.js`, `plugins/aether/lib/wt-gate.js`, `plugins/aether/lib/delegate-log.js`, `tests/report-timings.test.js`, `tests/report-fixed.test.js`, `tests/report.test.js`, `tests/aether-report.test.js`, `tests/wt-gate.test.js`, `tests/delegate-log.test.js`
- Depends on: none
- Serves: R12, R18, R19

**Interfaces:**

New `lib/run-timings.js`:

```text
// The classes that a bin records. `wait-quota` is not one of them: the report calculates it (below).
const CLASSES = ['gate', 'merge-tests', 'baseline', 'wait-stuck']
// Appends one line {"class":<klass>,"ms":<integer>,"at":<ISO>} to <runDir>/timings.jsonl (one write per line).
// Throws on a class not in CLASSES; never throws on a failed write (a timing must not stop a run).
function recordTiming(runDir, klass, ms)
// Reads the file: { byClass: { gate: { count, ms }, ... }, totalMs } ; missing file or bad lines => { byClass: {}, totalMs: 0, none: true }
function timingsOf(runDir)
// The quota wait of one swarm run: the quota pauses of the autonomous runs in <mainRoot>/.aether/autonomy/*/run.json
// (`quotaPauses`) whose `savedUnits` name the run (`swarmRun === runId`). Each pause counts from `started` to
// `resumeAt`, or to `now` when `resumeAt` is later. Returns { count, ms }; { count: 0, ms: 0 } when none names the run;
// a run.json that cannot be read or whose dates are not valid is skipped.
function quotaWaitOf(mainRoot, runId, now)
module.exports = { CLASSES, recordTiming, timingsOf, quotaWaitOf }
```

- `wt-gate.js` records `gate` with the duration of each gate pass. The other recorders are Task 5 (`merge-tests`), Task 6 (`wait-stuck`) and Task 9 (`baseline`). `aether-lane pause` is the clock of the agents' time cap in `run.workflow.js` (it only waits, with no run), and `aether-wt watch` writes nothing: neither is timed.
- `report.js`: the report of a run shows `timings` (per class: count and ms, with `wait-quota` from `quotaWaitOf(mainRoot, runId, now)` among them, and `totalMs`) and a line `not a model: <total> of <wall clock>`; a run with no `timings.jsonl` and no quota pause that names it is reported exactly as today, with no error and no `timings` key.
- #256 2: the comment above `qualityOf` (around `report.js:274-282`) explains `fixedUnits` as well as `adopted`. #256 3: `fixedUnits` drops a unit whose later launch is not a fix (a unit fixed on launch 1 and blocked without a fix on launch 2 has no `fixedUnits` entry). #236 5: the comments in `delegate-log.js:107` and `report.js:207` no longer say «correction(s)» for the retired policy (say «rung»).

**Tests (write first):** `tests/report-timings.test.js`: `recordTiming` writes the line and rejects a bad class; `timingsOf` totals by class; the report of a fixture run with a `timings.jsonl` shows each class and the total; a fixture run without the file reports as before (deep-equal to the same fixture report with the file absent); a gate pass writes one `gate` line; `quotaWaitOf` on a fixture `.aether/autonomy/<id>/run.json` whose `quotaPauses[0]` has `started`, `resumeAt` and `savedUnits: [{ swarmRun: <runId>, … }]` returns `count: 1` and `ms` = `resumeAt` − `started`; a pause that names another swarm run, an unreadable `run.json` and a `resumeAt` later than `now` (the wait counts up to `now`) each give the result the test names; the report of that run shows a `wait-quota` entry. In `tests/report-fixed.test.js`: launch1 fix + launch2 blocked has no `fixedUnits` entry. A test that reads `report.js` source asserts the comment names `fixedUnits` and that neither `report.js` nor `delegate-log.js` contains `correction` in those comments.

**Acceptance:** the tests pass and fail before; `node --test tests/report-timings.test.js tests/report-fixed.test.js tests/report.test.js tests/aether-report.test.js tests/wt-gate.test.js tests/delegate-log.test.js tests/spend.test.js tests/report-ladder.test.js tests/report-relaunch.test.js` passes.

### Task 8: Swarm skill and components page (#256 4, 5, 6, 7, 9)

**Aether:**
- Area: docs
- Owns: `plugins/aether/skills/swarm/SKILL.md`, `docs/reference/components.md`, `tests/swarm-stuck-docs.test.js`, `tests/components-docs.test.js`, `tests/swarm-ladder-docs.test.js`
- Depends on: none
- Serves: R12

**Interfaces:**

Text only. In `skills/swarm/SKILL.md`: (4) the `aether-wt watch <runId>` command is a code span (backticks); (5) the sentence ending `is treated as today.` (around line 120) names what happens: `act on it as a blocked unit`; (6) the sentence `the launch arguments may set another` is replaced by one that says the value is `stuckWaitSeconds` in `config/swarm.json` and there is no launch argument; (7) the stuck-unit entry says `if that merge refuses the fix, the unit ends blocked with no second wait`. In `docs/reference/components.md` the `aether-wt` row lists `stuck`, `stuck-tick`, `stuck-end`, `deliver`, `decline` and `watch`.

**Tests (write first):** in `tests/swarm-stuck-docs.test.js`: the skill contains the code span `` `aether-wt watch <runId>` `` preceded by the plugin-root path form already used; does not contain `treated as today` or `launch arguments may set`; contains `act on it as a blocked unit` and `no second wait`; `tests/components-docs.test.js`: the `aether-wt` row names the six verbs.

**Acceptance:** `node --test tests/swarm-stuck-docs.test.js tests/components-docs.test.js tests/swarm-ladder-docs.test.js tests/docs-facts.test.js tests/using-aether-030.test.js` passes.

### Task 9: Compile minors of #256 and #232, with the baseline duration

**Aether:**
- Area: plan
- Owns: `plugins/aether/lib/plan-compile.js`, `tests/baseline.test.js`, `tests/plan-compile-env.test.js`, `tests/aether-plan.test.js`, `tests/compile-run-launches.test.js`
- Depends on: Task 7 — it records the `baseline` class with `lib/run-timings.js`
- Serves: R12, R18

**Interfaces:**

- #256 1: `loadSwarmConfig()` (the `stuckWaitSeconds` read near line 460) runs before the first side effect (`resetSpent`, `recordUse`); a broken `config/swarm.json` makes compile fail with nothing written.
- #232 6: `compile` takes its session and config values only from the `env` argument (`env.CLAUDE_CODE_SESSION_ID` etc.; the reads of `process.env` at lines 263, 318, 358 and 428 become `env.…`), and the bin passes `process.env`.
- #232 7: the compile-refusal tests (time, cost and quota stops) move from `tests/baseline.test.js` to `tests/aether-plan.test.js`; `baseline.test.js` keeps only failure-signature tests.
- #209: the run of the baseline (`aether-plan compile` line base) is timed and `recordTiming(runDir, 'baseline', ms)` is called once per compile that runs it.

**Tests (write first):** `tests/plan-compile-env.test.js`: (1) compile with a broken `config/swarm.json` throws and leaves no briefs and no `recordUse` file; (2) compile with `env = { CLAUDE_CODE_SESSION_ID: 'A' }` while `process.env.CLAUDE_CODE_SESSION_ID` is `B` uses `A`, and a stop configured only in `env` is honoured; (3) a compile writes one `baseline` line to the run's `timings.jsonl`; (4) `tests/baseline.test.js` source contains no `compile(`/refusal tests (read the file and assert it has no `describe`/`test` title containing `compile refus`; the moved test exists in `aether-plan.test.js`).

**Acceptance:** tests pass and fail before; `node --test tests/plan-compile-env.test.js tests/baseline.test.js tests/aether-plan.test.js tests/compile-run-launches.test.js tests/plan.test.js tests/autonomy-swarm-spend.test.js tests/baseline-paths.test.js` passes.

### Task 10: Rescue minors of #256 in the run workflow

**Aether:**
- Review: high — a delivered fix must be merged, never expired
- Area: workflows
- Owns: `plugins/aether/workflows/run.workflow.js`, `tests/workflow-harness.js`, `tests/workflow-stuck.test.js`, `tests/run-workflow-paths.test.js`, `tests/workflow-first-try.test.js`
- Depends on: Task 1 — same file, which that task changes first
- Depends on: Task 6 — `stuck-end` on a delivered record now answers `state: 'delivered'`
- Serves: R12

**Interfaces:**

Rescue code of `run.workflow.js` (around lines 1698-1790 and 1303-1310): (22) when `stuck-end` answers `state: 'delivered'` the flow takes the delivered path (merge) and not the expiry; (23) `unit.ladder.firstTry` is false for a unit rescued through a fix (`forRescue`); (24) the rescue's `try/finally` gains a `catch` so a throw of `mergeHeld` or its reason still sends `stuck-end` and logs, and the `never throws` comment is true; (25) each outcome (expiry, ceiling, declined, refused) adds one owner-visible `log` line. In `tests/workflow-harness.js` (#256 26) a stuck tick is recorded in `ticks` before the early return when there is no clock, so `assert ticks == []` is not vacuous. #256 27: a repository path with a space is quoted in the `aether-wt stuck` payload path.

**Tests (write first):** in `tests/workflow-stuck.test.js`: (22) a stuck-end handler that answers `state: 'delivered'` ends the unit merged; (23) a unit rescued through a fix has `firstTry === false`; (24) an injected throw in `mergeHeld` still sends `stuck-end` and logs; (25) each of the four outcomes emits exactly one log line; (26) the harness records the stuck tick and a test with no waiting asserts `ticks` has that entry; in `tests/run-workflow-paths.test.js` (27) a spaced repo path quotes the stuck-open payload path.

**Acceptance:** tests pass and fail before; `node --test tests/workflow-stuck.test.js tests/run-workflow-paths.test.js tests/workflow-first-try.test.js tests/workflow.test.js tests/workflow-salvage.test.js tests/workflow-ladder.test.js tests/workflow-time-cap.test.js tests/ops-note.test.js` passes.

### Task 11: One failed shape in the design workflow (#232 8, 10, 12)

**Aether:**
- Area: workflows
- Owns: `plugins/aether/workflows/design.workflow.js`, `tests/workflow-design.test.js`
- Depends on: Task 1 — same file, which that task changes first
- Serves: R12

**Interfaces:**

(#232 8) every failed return of the design workflow has one shape `{ status: 'failed', step, reason }`, plus `stop` and `run` when the cause is a refusal (the helper at line ~863, the flat returns at ~235, ~956 and ~959 use it). (#232 10) a seat whose seat-start is refused leaves in `rounds` an entry with `provider: null` and `refused: true`, never `provider: 'native'` (`seatRound` pushes the entry before its try, ~619). (#232 12) the header comment of `seatRound` (~605-616) names the refused `{ stop, run }` path.

**Tests (write first):** in `tests/workflow-design.test.js`: a table test runs the design in each failure situation the file already builds (seat failure, exam failure, judge failure, refusal) and asserts each result has `status === 'failed'`, a string `step` and `reason`; a refused seat-start gives a `rounds` entry without a `native` provider and marked refused; a source test reads the comment of `seatRound` and asserts it contains `stop` and `run`.

**Acceptance:** tests pass and fail before; `node --test tests/workflow-design.test.js tests/seats-design.test.js tests/ops-note.test.js tests/ops-command-design.test.js` passes.

### Task 12: The Bash parser has a home of its own (#232 2)

**Aether:**
- Area: guard
- Owns: `plugins/aether/lib/bash-parse.js`, `plugins/aether/lib/guard.js`, `plugins/aether/lib/continuity-posttool.js`, `tests/bash-parse.test.js`, `tests/continuity-posttool.test.js`
- Depends on: none
- Serves: R12

**Interfaces:**

New `lib/bash-parse.js` exports `commandSegments`, `dropWrappers`, `nameOf` and `redirectTargets` with the code and behaviour they have in `lib/guard.js` today (moved, not rewritten); `guard.js` requires and re-exports them (so `require('./guard.js').commandSegments` still works), and `continuity-posttool.js` requires `./bash-parse.js` and no longer `./guard.js`.

**Tests (write first):** `tests/bash-parse.test.js`: requiring `bash-parse.js` does not load `guard.js` (check `require.cache` has no path ending `lib/guard.js` after requiring it in a fresh child process: `node -e`); the four functions give the results the guard tests expect for a few command lines (`a && b | c`, `sudo env X=1 git push`, `echo x > f`); `guard.js` still exports the same four names; `continuity-posttool.js` does not mention `guard.js`.

**Acceptance:** `node --test tests/bash-parse.test.js tests/continuity-posttool.test.js tests/guard.test.js tests/guards-core-1.test.js tests/guards-core-2.test.js tests/guard-heredoc.test.js tests/continuity-hook.test.js` passes unchanged (the guard tests are not edited).

### Task 13: Launch refusal and autonomy minors (#232 13, 14, 16, 17)

**Aether:**
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `plugins/aether/lib/autonomy-command.js`, `plugins/aether/lib/git.js`, `tests/autonomy.test.js`, `tests/aether-autonomy.test.js`, `tests/autonomy-refusal.test.js`, `tests/delegate-report.test.js`
- Depends on: none
- Serves: R12

**Interfaces:**

(#232 13) `launchRefusal` (`autonomy.js` ~807) catches an error reading `status()` or `run.json` and returns a clean refusal (a message that says the open run's state could not be read), never throws into `plan-compile`. (#232 14) the not-a-repository probe (`autonomy.js` ~811-818) lives in `lib/git.js` as `isRepository(cwd)`; `autonomy.js` uses it. (#232 16) `aether-autonomy start` passes the config-dir env (`env.CLAUDE_CONFIG_DIR`) as `trustAuthor` does (`autonomy-command.js` ~156). (#232 17) a test only.

**Tests (write first):** `tests/autonomy-refusal.test.js`: (13) an open run whose `run.json` is unreadable (replace with a directory) makes `launchRefusal` return a refusal and not throw; (14) `require('../plugins/aether/lib/git.js').isRepository` exists, is true for `isRepository(makeRepo(t).dir)` and false for a `tempDir`, and `autonomy.js` source no longer contains the inline probe; (16) `start` with `CLAUDE_CONFIG_DIR` set to a temp dir reads trusted authors from that dir. In `tests/delegate-report.test.js` (17) a launch recorded in one install and its result recorded in another report as one task.

**Acceptance:** tests pass and (13), (14), (16) fail before; `node --test tests/autonomy-refusal.test.js tests/autonomy.test.js tests/aether-autonomy.test.js tests/delegate-report.test.js tests/autonomy-trust.test.js tests/baseline.test.js` passes.

### Task 14: Ladder guards (#236 1, 2)

**Aether:**
- Area: ladder
- Owns: `plugins/aether/lib/ladder.js`, `plugins/aether/lib/wt-ladder.js`, `tests/ladder.test.js`, `tests/ladder-supervisor.test.js`, `tests/ladder-blocked-key.test.js`, `tests/ladder-one-source.test.js`, `tests/wt-ladder.test.js`, `tests/copies-ladder.test.js`
- Depends on: none
- Serves: R12

**Interfaces:**

(#236 1) `loadLadder` (`ladder.js` ~36-44) requires `repeatBlocked`, `supervisorFloor` and `law`: a config missing any throws `ladder: missing <name>` (the shipped `config/ladder.json` has all three). (#236 2) `buildView` in `wt-ladder.js` (~44-47) throws `ladder: unknown step <step>` when `state.step` is not in `rungs`, not a `TypeError`.

**Tests (write first):** `tests/ladder.test.js`: a ladder config without `supervisorFloor` (then without `repeatBlocked`, then without `law`) makes `loadLadder` throw a message containing `ladder:`; `tests/wt-ladder.test.js`: a state whose step is absent from the rungs throws `ladder: unknown step`. Update any ladder fixture in the owned tests that omitted these fields so it still builds.

**Acceptance:** `node --test tests/ladder.test.js tests/ladder-supervisor.test.js tests/ladder-blocked-key.test.js tests/ladder-one-source.test.js tests/wt-ladder.test.js tests/copies-ladder.test.js tests/refresh-lanes.test.js tests/workflow-ladder.test.js` passes.

### Task 15: Agent texts ask only for what is read (#215)

**Aether:**
- Area: agents
- Owns: `plugins/aether/agents/*.md`, `plugins/aether/skills/tasks/SKILL.md`, `plugins/aether/speckit/**`, `tests/agent-outputs.test.js`, `tests/agents.test.js`, `tests/agents-design.test.js`, `tests/swarm-ladder-agents.test.js`, `tests/speckit.test.js`, `tests/aether-plan-skills.test.js`, `tests/lane-schemas.test.js`
- Depends on: none
- Serves: R14, R15, R16, R17

**Interfaces:**

Text only; read `specs/036-open-issues-8/evidence/issue-215.md` for points 1 to 5. For each of the five points (grade each criterion in the supervisor, compare the `Head`, the implementer's red and green evidence, the fix of each reviewer finding, the Writer's paths and `check` output): remove the request from the agent text, since no field of the response schema receives it (the schemas are in `lib/lane-schemas.js` and the workflows; no schema changes). R15: remove or give a source for the unsourced figures (`10-100x`, `about 2.5 times`) in the agent texts and in `skills/tasks/SKILL.md`. R16: the turn budgets in `agents/judge.md`, `reviewer.md` and `implementer.md` read as guidance («about N turns, not a limit») or are removed, and none contradicts what `lib/seats.js` says of the time limit on another harness.

**Tests (write first):** `tests/agent-outputs.test.js`: reads `agents/*.md` and the response schemas of the workflows and `lib/lane-schemas.js`, and fails when an agent text still asks for one of the five outputs (a list of the old request phrases, found in the issue, each asserted absent from its agent file); asserts none of the agent files or `skills/tasks/SKILL.md` contains `10-100x` or `about 2.5 times` without a link or `source`; asserts each of the three budget phrases is introduced by `about` or `guide`, and that none says `limit` or `hard`.

**Acceptance:** the test passes and fails before; `node --test tests/agent-outputs.test.js tests/agents.test.js tests/agents-design.test.js tests/swarm-ladder-agents.test.js tests/speckit.test.js tests/aether-plan-skills.test.js tests/lane-schemas.test.js tests/docs-facts.test.js tests/seats.test.js` passes.

### Task 16: Calibration proposals are visible (#224)

**Aether:**
- Area: observe
- Owns: `plugins/aether/bin/aether-observe`, `plugins/aether/lib/observe-read.js`, `plugins/aether/lib/observe-notice.js`, `plugins/aether/lib/session-start.js`, `docs/guide/observe.md`, `tests/observe-bin.test.js`, `tests/observe-read.test.js`, `tests/observe-notice.test.js`, `tests/observe-docs.test.js`, `tests/session-start.test.js`
- Depends on: none
- Serves: R20, R21, R22

**Interfaces:**

New verb `aether-observe proposals`: the usage line becomes `usage: aether-observe hook | file-issues | proposals`. It reads `<dataDir>/observe/read.json` and prints the calibration proposals and the frictions as lines (identifiers, classes and counts only, never conversation content), or `no reading yet` when the file is missing, with exit 0 and nothing written. `observe-notice.js` gives the start-up notes one line, `N calibration proposals: run aether-observe proposals`, when the reading holds N > 0 proposals, and nothing without a reading or with none; `lib/session-start.js` includes that note in its notes command (not in any `--part`). Calibration still changes no configuration (R22).

**Tests (write first):** `tests/observe-bin.test.js`: with a `read.json` holding 22 proposals the verb prints 22 proposal lines and the frictions, and the data directory is byte-identical before and after (no write); with no `read.json` it prints `no reading yet`. `tests/observe-notice.test.js`/`session-start.test.js`: the notes of a Lead session with that reading contain `22 calibration proposals` and `aether-observe proposals`; with none, no such line; no part output (`--part 1..3`) contains the word `proposals`. `tests/observe-docs.test.js`: the guide names the verb.

**Acceptance:** tests pass and fail before; `node --test tests/observe-bin.test.js tests/observe-read.test.js tests/observe-notice.test.js tests/observe-docs.test.js tests/session-start.test.js tests/session-start-parts.test.js tests/observe-calibrate.test.js tests/help.test.js` passes.

### Task 17: One list of harness names (#136)

**Aether:**
- Review: high — a refactor that must not change behaviour
- Area: harness
- Owns: `plugins/aether/lib/harness-names.js`, `plugins/aether/lib/delegate-calls.js`, `plugins/aether/lib/router-pick.js`, `plugins/aether/lib/router-renewal.js`, `plugins/aether/lib/router-quota.js`, `plugins/aether/lib/lane-delegate.js`, `plugins/aether/bin/aether-delegate`, `tests/harness-lists.test.js`, `tests/harness-literals.js`, `tests/router-renewal.test.js`, `tests/router-quota.test.js`, `tests/router-pick.test.js`, `tests/delegate-calls.test.js`, `tests/codex-lists.test.js`
- Depends on: Task 2 — it changes `lane-delegate.js` first
- Serves: R23, R24

**Interfaces:**

New `lib/harness-names.js`: `const HARNESS_NAMES = Object.freeze(['agy', 'codex', 'grok', 'muse'])` exported, with `module.exports = { HARNESS_NAMES }`. `EXTERNAL` (`router-quota.js`), `RENEWABLE` (`router-renewal.js`), `DELEGATE_HARNESSES` (`router-pick.js`), `HARNESSES` (`delegate-calls.js`) and `ALLOWED_HARNESSES` (`lane-delegate.js`) are defined from it (`new Set`/array copies as each file used them), and the usage lines and error messages of `aether-delegate renew` and `renewReading` are built from it. Names, order and messages do not change.

**Tests (write first):** `tests/harness-lists.test.js` keeps guarding that no fixed list is written by hand and also asserts that `harness-names.js` is the only file under `plugins/aether/lib` and `bin` that contains the literal `['agy', 'codex', 'grok', 'muse']` (use `listsIn` of `harness-literals.js`); the owned router/delegate tests take the list from `HARNESS_NAMES` instead of repeating it; one test asserts the usage line of `aether-delegate renew` lists the names in order, as before.

**Acceptance:** `node --test tests/harness-lists.test.js tests/router-renewal.test.js tests/router-quota.test.js tests/router-pick.test.js tests/delegate-calls.test.js tests/codex-lists.test.js tests/lane-delegate.test.js tests/delegate-mod.test.js` passes; the full `npm test` shows no changed message.

### Task 18: One pick-data function (#203, R25)

**Aether:**
- Area: router
- Owns: `plugins/aether/lib/pick-data.js`, `plugins/aether/lib/lane-quota.js`, `plugins/aether/lib/lane-pick.js`, `plugins/aether/lib/seats.js`, `plugins/aether/lib/router-pick.js`, `plugins/aether/lib/lane-calls.js`, `tests/pick-data.test.js`, `tests/lane-quota.test.js`, `tests/lane-pick.test.js`, `tests/seats.test.js`, `tests/seat-calls.test.js`
- Depends on: Task 17 — it changes `router-pick.js` first
- Depends on: Task 2 — it changes `lane-calls.js` first
- Serves: R25

**Interfaces:**

New `lib/pick-data.js` exports `pickData(config, name, reading, { marks, now, lift, … })`, the one function that prepares what `choose` of `lib/superdelegation.js` takes for the delegates (`viewOf` of `router-pick.js`), the swarm (`harnessView` of `lane-quota.js`) and the design seats (the wrapper in `lib/seats.js`); the three call it. The pair `choose` returns for the same inputs does not change. Where the marks live is Task 22's: this task reads them through the functions that exist (`liveMarks`, `readAllMarks`) and changes no mark path.

**Tests (write first):** `tests/pick-data.test.js`: for fixed inputs, the choices of the delegate, swarm and seat entry points equal the choices they gave before (assert with the values from the existing scenario tests of `router-pick.test.js`, `lane-pick.test.js`, `seats.test.js`); the three entry points call `pickData` (the three sources contain `pickData` and none keeps its own copy of the view preparation).

**Acceptance:** `node --test tests/pick-data.test.js tests/lane-quota.test.js tests/lane-pick.test.js tests/seats.test.js tests/seat-calls.test.js tests/router-pick.test.js tests/superdelegation.test.js tests/superdelegation-scenarios.test.js tests/lane-pick-slow.test.js tests/router-slow.test.js tests/harness-lists.test.js` passes with no existing expectation edited.

### Task 19: `aether-autonomy quota-brake` (#201, R28)

**Aether:**
- Review: high — saves and pushes the user's work
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy-command.js`, `tests/quota-brake-command.test.js`, `tests/quota-brake.test.js`, `tests/quota-brake-scenarios.test.js`, `tests/aether-autonomy.test.js`
- Depends on: Task 13 — it changes `autonomy-command.js` first
- Serves: R28

**Interfaces:**

New verb `aether-autonomy quota-brake [--session <id>] [--run <swarmRunId>]…`, added to the verb list and the usage line of `lib/autonomy-command.js`. The swarm runs in flight come from one source, nothing recorded in the diary: with one or more `--run <id>` (repeatable, each a valid run id) exactly those runs; with none, a scan of `<mainRoot>/.aether/runs/` for the directories that hold `graph.json` and no `launch-end.json` (`run.launchEndFile`, the end mark of a run) and whose `graph.json` was written at or after the open autonomous run's `started`. For each of them it runs `aether-wt save <runId>` (the bin by path next to this bin), reads the `<runDir>/saved.json` that `save` writes, records `quota-saved` as `quota-saved --from <saved.json>` does, and, when `brake-settings` reports `push` true and `check push` covers it, runs `git push origin <branch>` for each saved unit branch (never otherwise). It prints one JSON line `{ saved: [<runId>…], recorded: true|false, pushed: [<branch>…] }`. It does not stop workflows, delegates or lane calls (those stay with the Lead: `TaskStop`, `aether-lane stop`), and says so in its first line of help. With no open run it prints `{ saved: [], recorded: false, pushed: [] }`.

**Tests (write first):** `tests/quota-brake-command.test.js`, on a throwaway repo with an open autonomous run and one run in flight (a real `aether-wt ensure` of one unit with an uncommitted file) and a bare repository as `origin`: (1) the command, with no `--run`, finds the run in flight by the scan, saves the unit's work on its branch, records `quota-saved` (the run state shows it), and pushes nothing when `push` is false; a second run directory that has a `launch-end.json`, and a third whose `graph.json` is older than the autonomous run's `started`, are not saved; with `--run <id>` naming only the first, the scan is not used (the other in-flight run is left alone); (2) with push on and a grant for `push` it pushes the saved branch to `origin`; with push on and no grant it pushes nothing and reports it; (3) with no open run it prints the empty JSON; (4) the usage line contains `quota-brake`; (5) the command's source does not call `TaskStop`/`lane stop` (it does not stop running work).

**Acceptance:** tests pass and fail before; `node --test tests/quota-brake-command.test.js tests/quota-brake.test.js tests/quota-brake-scenarios.test.js tests/aether-autonomy.test.js tests/autonomy.test.js tests/wt-save.test.js` passes.

### Task 20: `aether-delegate approve` (#201, R29)

**Aether:**
- Review: xhigh — it merges an edit into the user's branch and must never merge into `main` without permission
- Area: delegate
- Owns: `plugins/aether/lib/delegate-approve.js`, `plugins/aether/bin/aether-delegate`, `tests/delegate-approve.test.js`, `tests/delegate-task.test.js`, `tests/guard-merge-main.test.js`
- Depends on: Task 17 — it changes `bin/aether-delegate` first
- Depends on: Task 3 — it changes `delegate-task.js`, whose verdict function it calls
- Serves: R29

**Interfaces:**

New `lib/delegate-approve.js` exports `approve(cwd, { task, worktree, ignore = [], env })` and the bin verb `aether-delegate approve --task <id> [--worktree <path>] [--ignore <glob>]` (added to the bin's usage line). Steps, in order: (1) look up the task's branch and worktree; (2) if the checkout's current branch (`git branch --show-current` in `cwd`: both merge paths land there) is `main` or `master`, run `aether-autonomy check merge-main` and, when it does not allow, stop with `{ approved: false, merged: false, reason: 'merge-main needs a grant' }` and give no verdict; (3) give the verdict `approve` through the same code path as `aether-delegate verdict --verdict approve` (a failed check still refuses, as today); (4) merge, by the path the task's result entry in the log decides: an external pair's entry has `branch` `aether/<runId>/<taskId>` (`run.unitBranch`), so run `aether-wt merge <runId> <taskId>` (the bin by path next to this one), which lands on the checkout's current branch; a delegate on Claude has no such branch in its entry, so `--worktree <path>` is required (as `verdict` requires it, with the same refusal text when it is missing) and the command merges that worktree's HEAD commit into the checkout's current branch with `git merge --no-ff <commit>`, and a merge that conflicts is aborted (`git merge --abort`) and reported as `merged: false` with its reason; (5) run the project's test command on the branch (the one in `.aether` settings or `npm test`) and report its result. Prints `{ approved, merged, tests: 'passed'|'failed', branch }`. A task that did not edit is refused with a reason.

**Tests (write first):** `tests/delegate-approve.test.js` on a throwaway repo with a started editing task (as `delegate-task.test.js` builds one): (1) on a feature branch the command gives the verdict, merges and runs the test script (a `package.json` whose `test` script writes a marker file) and prints `merged: true, tests: 'passed'`; (2) a failing test script gives `tests: 'failed'` and the merge is not undone silently (the output says so); (3) the branch is `main` and no grant: nothing merged, no verdict recorded, `reason` names `merge-main`; with the grant recorded the same call merges; (4) a read-only task is refused; (5) a failed delegate check refuses the approve, as `verdict` does today; (6) the usage line of the bin contains `approve`; (8) an external pair: the entry's `branch` is `aether/<runId>/task-1` of a real `aether-wt ensure` unit with one commit, and the command's merge is `aether-wt merge <runId> task-1` (the unit's file is on the checkout's branch afterwards); (7) a Claude delegate (the entry has no unit branch; its worktree is a real `git worktree` with one commit on a side branch): `approve --task <id> --worktree <path>` gives the verdict, merges that commit into the checkout's branch with git and runs the test script; without `--worktree` it is refused with the `verdict` text; a conflicting merge is aborted and reported as `merged: false` with the checkout clean.

**Acceptance:** tests pass and fail before; `node --test tests/delegate-approve.test.js tests/delegate-task.test.js tests/guard-merge-main.test.js tests/delegate-checks.test.js tests/delegate-approve-rerun.test.js tests/delegate-mod.test.js` passes.

### Task 22: One mark store (#203, R26)

**Aether:**
- Review: xhigh — a lost quota mark would let a spent pair be chosen again and spend the owner's quota
- Area: router
- Owns: `plugins/aether/lib/lane-marks.js`, `plugins/aether/lib/router-marks.js`, `tests/lane-marks.test.js`, `tests/router-marks.test.js`, `tests/lane-start-marks.test.js`, `tests/no-router.test.js`, `tests/lane-refusal.test.js`, `tests/delegate-chain.test.js`
- Depends on: none
- Serves: R26

**Interfaces:**

- One mark store: `<dataDir>/lanes/marks/` (the swarm's). `router-marks.js` reads and writes it, and its `routerMarksRoot` no longer names another folder. `lane-marks.js` exports `migrateRouterMarks(dataDir)`: for each `<harness>__<group>.json` in `<dataDir>/router/lanes/marks/` it moves the file to the store (same name; `rename`, or copy and delete) and removes the old file; it runs on the first read of `liveMark`, `liveMarks` and of `readAllMarks`, and again at no cost when the old folder is empty or missing. `router-marks.js` cannot be required from `lane-marks.js` (the dependency goes the other way): the old path is a literal in `lane-marks.js`.
- Collision rule (both stores have the same `<harness>__<group>.json`, as both write through `markFile`): the store keeps the mark whose `until` is later (a tie keeps the one already in the store), so a mark never shortens; the other mark's `reason` and `source` are kept in the kept mark's `alsoReasons` array (`[{ source, reason, until }]`), and the old file is removed. The comparison reads the raw `until` numbers: an expired mark in either store is moved or merged the same way and stays expired; a file that cannot be read as a mark is left where it is and reported by `migrateRouterMarks` in its result (`skipped`), never deleted.
- No mark is lost and none changes its effect: harness, group, reset time and reason of the kept mark keep their meaning.

**Tests (write first):** `tests/router-marks.test.js` and `tests/lane-marks.test.js`: (1) a mark placed in the old router directory is found by the router read and by the swarm read, is moved to `lanes/marks/` once, has the same content, and the old file is gone; an expired mark stays expired; (2) a mark written by the router appears in the swarm's view; (3) collision: the same harness and group in both stores, the router's mark ending later: the store holds the router's `until` and its `alsoReasons` names the swarm mark's reason; the swarm's ending later: the store keeps it and `alsoReasons` names the router's; equal `until`: the store's mark is kept; in each case the old file is gone and one file remains; (4) a damaged file in the old folder stays in place and is named in `skipped`.

**Acceptance:** `node --test tests/lane-marks.test.js tests/router-marks.test.js tests/lane-start-marks.test.js tests/no-router.test.js tests/lane-refusal.test.js tests/router-quota.test.js tests/delegate-chain.test.js tests/lane-status.test.js tests/lane-quota.test.js` passes with no existing expectation edited except for the mark path.

### Task 21: The skills name the commands and the start-up does not grow (#201, #203)

**Aether:**
- Area: skills
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/autonomous-runs/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `tests/session-start-parts.test.js`, `tests/using-aether-030.test.js`, `tests/autonomous-runs-skill.test.js`, `tests/swarm-stuck-docs.test.js`, `tests/docs-030.test.js`, `tests/delegate-skill.test.js`, `tests/quota-brake-docs.test.js`, `tests/bootstrap-names.test.js`
- Depends on: Task 8 — it edits `swarm/SKILL.md` first
- Depends on: Task 18 — R27 describes the Muse reading after the pick-data work
- Depends on: Task 19 — the quota-brake paragraph names its command
- Depends on: Task 20 — the verdict paragraph names its command
- Serves: R27, R28, R29, R30, R31, R32

**Interfaces:**

Text only. (R28) in `autonomous-runs/SKILL.md` («The quota brake») and `swarm/SKILL.md` (line on the brake) replace the steps of `aether-wt save`, `quota-saved` and the push with `aether-autonomy quota-brake`, keeping the line that stopping workflows (`TaskStop`), native agents and lane calls (`aether-lane stop <run> [<call>]`) is the Lead's. (R29) «The verdict» of `using-aether/SKILL.md` names `aether-delegate approve --task <id>` for an edit and keeps the plain `verdict` line for the other cases. (R27) the rules say once, in one short sentence, that reading Muse's quota costs a real call. (R30) the other procedures of #201 (the «sí» with the guard in `enforce`, the closing spend sentence, `aether-autonomy status`, the launch of the design) stay as they are.

Before editing, measure the base from the 0.41.0 source, not from a checkout that depends on where the plugin sits: each part's output starts with a heading that holds the absolute path of the rules file, so `out.length` changes with the checkout (the test's own comment on issue #230 says the same). Take the text with `git show 6b31c62:plugins/aether/skills/using-aether/SKILL.md`, prepare it as the test's `source()` does (front matter removed, trimmed, `${CLAUDE_PLUGIN_ROOT}` replaced) with the fixed folder `installed = '/' + 'i'.repeat(63)` that the last test of the file already uses, split it with `splitParts(text, installed)` and write into the test the length of each `part.slice` (the slice, without the heading) as `BASE = [n1, n2, n3]`. The edit must leave every `part.slice` no longer than its base; the net of R27 (added) against R28 and R29 (replaced) is a decrease. Parts are packed greedily at the headings, so a shorter part 1 may pull the next section into it and make it longer than its base: when that happens, shorten that part's own prose further (never move the cut by hand); the 9,800-character limit of each part's whole output stays as it is.

**Tests (write first):** `tests/session-start-parts.test.js`: with `splitParts(source(installed), installed)`, for each part `slice.length <= BASE[i]`, and the sum of the three is less than the sum of `BASE`; each part's whole output from the real command (`bootstrapParts(PLUGIN)`) is `<= 9800` as the file already asserts; the three base constants are those measured from the 0.41.0 source; `tests/autonomous-runs-skill.test.js`/`quota-brake-docs.test.js`: the quota-brake paragraph contains `aether-autonomy quota-brake` and `aether-lane stop`, and no longer contains `aether-wt save <runId>` followed by `quota-saved --from`; `tests/using-aether-030.test.js`: «The verdict» contains `aether-delegate approve`; the rules contain the sentence about Muse's quota being a real call exactly once.

**Acceptance:** the tests pass; the three parts together are shorter than the base; `npm test` passes and `npm run check` passes (R31).
