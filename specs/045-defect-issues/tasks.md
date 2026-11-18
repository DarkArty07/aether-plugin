# Tasks 045: the five defect issues (#318, #317, #316, #314 and #302)

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node.js 22, CommonJS, no dependencies. Tests run with `node --test tests/<file>.test.js`; the whole suite is `npm test`; `npm run check` adds `npm run test:mod` and `npm run validate`. Run a branch's bin by path (`node plugins/aether/bin/aether-plan …`), never the `aether-*` name on `PATH`.
- Test first: write the failing tests of the task, see them fail for the right reason, then change the code. Every requirement that changes code or text has a test that fails without the change.
- The branch is `fix/issues-fallos`. Nothing is merged to `main`, nothing is pushed, no version is bumped, the plugin is not installed and no real skill is installed. No task closes an issue: the Lead does that.
- Tests run on throwaway repos (`tests/helpers.js`: `tempDir`, `makeRepo`, `useDataDir`), spend no tokens and need no network. Never call the real `muse`, the real `npx skills` or any real registry; never write under the real `~/.agents/skills/` or `~/.claude/skills/` (point `HOME` at a temporary folder).
- A task changes only what its Owns lists. A test that pins old text is changed in the same task as the text, and it is in that task's Owns. New tests go in a new file `tests/defect-045-<topic>.test.js` unless the task names an existing file.
- Each part of the bootstrap of `skills/using-aether/SKILL.md` is at most 9,800 characters (`tests/session-start-parts.test.js`, issue 139). Measure with `bootstrapParts` after every change to that file.
- Workflows (`workflows/*.workflow.js`) import nothing and read neither the clock nor the disk; shell steps go to the `aether:ops` agent through the commands `hooks/ops-command.mjs` allows.
- `docs/decisions.md`, `docs/index.md`, `tests/docs-032.test.js`, `tests/docs-facts.test.js` and `docs/reference/components.md` are shared: only the tasks that list them in Owns change them.
- Exact text is written in full where it is the requirement; the implementer writes the code. A test case written here as `test(title, () => {})` or with a body in a comment is fully specified by its title and comment: write the assertions they state, never leave the body empty. Do not write under `specs/` or `.specify/`: the guard refuses it.

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] [US1] Say what the cleaning does with registered worktrees, and fix the wording of the swarm and Lead rules in docs/guide/maintenance.md → Task 1
- [ ] T002 [P] [US2] Replace the CPU race of the issue 68 test with an explicit synchronisation, and add the two controls of quota-brake in tests/seat-partial.test.js → Task 2
- [ ] T003 [P] [US3] Leave a cut-off or refused read-only answer pending for a verdict in hooks/delegate.mjs → Task 3
- [ ] T004 [P] [US4] Let the guard allow reads that only name Claude's settings or the trusted list in plugins/aether/lib/guard.js → Task 4
- [ ] T005 [P] [US5] Keep one `USAGE` for aether-plan, harden `loadThreshold` and widen the mod's spec pattern in plugins/aether/bin/aether-plan → Task 5
- [ ] T006 [P] [US5] Cap the minors of a sliced final review once and build `REVIEW_FINDINGS` from `FINDINGS` in plugins/aether/workflows/run.workflow.js → Task 6
- [ ] T007 [P] [US5] Clean the design workflow, the mapper and the Writer forms in plugins/aether/workflows/design.workflow.js → Task 7
- [ ] T008 [P] [US6] Read the models of Muse over `muse serve` last in the round in plugins/aether/lib/muse-models.js → Task 8
- [ ] T009 [P] [US8] Rewrite the automatic skill matcher with the closed rule of R20 in plugins/aether/lib/skill-brief.js → Task 9
- [ ] T010 [US8] Hand the matching project skills to delegates and plan units in plugins/aether/lib/delegate-task.js → Task 10
- [ ] T011 [US10] Add the search, code review and byte-for-byte install of skills in plugins/aether/lib/skill-design.js → Task 11
- [ ] T012 [US10] Run the skills step of `/aether:design` before the plan in plugins/aether/workflows/design.workflow.js → Task 12
- [ ] T013 [US3] Write decisions A134 to A136, update A132 and the docs that repeat the rules in docs/decisions.md → Task 13
- [ ] T014 [US10] Update the skills and design docs in plugins/aether/skills/skills/SKILL.md → Task 14

### Task 1: The cleaning guide and the wording of the swarm and Lead rules

**Aether:**
- Area: docs-rules
- Owns: `docs/guide/maintenance.md`, `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/skills/using-aether/SKILL.md`, `tests/review-verdict-rule.test.js`, `tests/defect-045-prose.test.js`, `tests/using-aether-030.test.js`, `tests/session-start-parts.test.js`
- Depends on: none
- Serves: R1, R9

**Interfaces:**
- `docs/guide/maintenance.md`, the bullet `- **Per-project cleaning:**`: the clause `never touching uncommitted work or registered worktrees` is replaced by this text, in full: `never touching uncommitted work; a registered worktree inside an expired folder of `.aether/work/` is removed only when it is clean (no uncommitted changes and no untracked files)`. Nothing else of the bullet changes. The code that this describes is `plugins/aether/lib/tree-clean.js` (`cleanProject`); do not change it.
- `skills/swarm/SKILL.md`, «Final review findings»: keep every existing sentence verbatim (the tests pin them) and append to the `ready-with-fixes` bullet: ` The approval goes by your re-grade of each finding below, not by the reviewer's grades.` and to the bullet `Fix the critical and important ones:` the sentence ` For the reviewer of a delegate, fix them through `aether-delegate verdict --verdict fix --finding '<file:line: what is missing>'`.`
- `skills/using-aether/SKILL.md`: the pointer line `Act on a reviewer's verdict, final or of a delegate, with the rule of aether:swarm, «Final review findings».` moves out of the list «Fallbacks never reach the owner» to the end of the paragraph `- **Verify before you relay:** …`, unchanged; in the paragraph `**The verdict.**` the first mention of `aether-delegate approve` is written `${CLAUDE_PLUGIN_ROOT}/bin/aether-delegate approve --task <id>` (the other calls keep the bare name). No other word of that paragraph changes.
- `tests/review-verdict-rule.test.js`: `section` ends at the next first-level bullet: `swarm.slice(start, swarm.indexOf('- **Leftovers:**', start))`, with a guard `assert.ok(end > start)`.

**Tests (write first):**

New file `tests/defect-045-prose.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

test('R1: maintenance.md says what the cleaning does with registered worktrees', () => {
  const bullet = read('docs', 'guide', 'maintenance.md').split('\n').find((line) => line.startsWith('- **Per-project cleaning:**'))
  assert.ok(bullet, 'the bullet exists')
  assert.ok(!bullet.includes('never touching uncommitted work or registered worktrees'), 'the old sentence is gone')
  assert.ok(bullet.includes('never touching uncommitted work; a registered worktree inside an expired folder of `.aether/work/` is removed only when it is clean (no uncommitted changes and no untracked files)'))
})

test('R9: swarm says the approval goes by the Lead re-grade and how a delegate reviewer is fixed', () => {
  const swarm = fs.readFileSync(path.join(PLUGIN, 'skills', 'swarm', 'SKILL.md'), 'utf8')
  const start = swarm.indexOf('Final review findings')
  const section = swarm.slice(start, swarm.indexOf('- **Leftovers:**', start))
  assert.ok(section.includes("The approval goes by your re-grade of each finding below, not by the reviewer's grades."))
  assert.ok(section.includes("`aether-delegate verdict --verdict fix --finding '<file:line: what is missing>'`"))
})

test('R9: the pointer sits under Verify before you relay and approve keeps its plugin path', () => {
  const using = fs.readFileSync(path.join(PLUGIN, 'skills', 'using-aether', 'SKILL.md'), 'utf8')
  const pointer = "Act on a reviewer's verdict, final or of a delegate, with the rule of aether:swarm, «Final review findings»."
  const verify = using.split('\n').find((line) => line.startsWith('- **Verify before you relay:**'))
  assert.ok(verify.includes(pointer), 'the pointer is in the Verify paragraph')
  assert.equal(using.split(pointer).length - 1, 1, 'and nowhere else')
  const verdict = using.split('\n').find((line) => line.startsWith('**The verdict.**'))
  assert.ok(verdict.includes('${CLAUDE_PLUGIN_ROOT}/bin/aether-delegate approve --task <id>'))
})
```

In `tests/review-verdict-rule.test.js`, add a case: moving a sentence of R14 to the text after `- **Leftovers:**` makes the assertion fail (build the swarm text in memory, move `A ready verdict is approved.` after `- **Leftovers:**`, and assert the sliced `section` no longer includes it). Keep `tests/session-start-parts.test.js` green; change `tests/using-aether-030.test.js` only if it pins the Fallbacks line or the first `aether-delegate approve`.

**Acceptance:**
- `node --test tests/defect-045-prose.test.js tests/review-verdict-rule.test.js tests/session-start-parts.test.js tests/using-aether-030.test.js tests/docs-facts.test.js` passes; the three new cases fail before the change.
- Every part of the bootstrap is at most 9,800 characters.

### Task 2: The issue 68 test without a race, and the two controls of quota-brake

**Aether:**
- Area: tests
- Owns: `tests/seat-partial.test.js`, `tests/quota-brake-continued.test.js`
- Depends on: none
- Serves: R2, R10

**Interfaces:**
- `tests/seat-partial.test.js`, the test named `a stale partial from an earlier round is not loaded when the next round is killed before its signal handler, and the committed document stays (issue 68)`: its name and every assertion stay (no `continued.json`, no `partial.json`, `seat-stop` returns the pair with no `partial`, the retry does not load the old partial and keeps the document committed in git). It no longer uses `killWhenAppears(pair.json, pid)` for that kill.
- The seam is test-only, no change under `plugins/aether/`: a temporary folder put first on `PATH` holds an executable `git` that forwards every call to the real `git` (found before the folder is put on `PATH`), except `git rev-parse HEAD` when an `armed` file exists and a `pair.json` newer than it exists under the seat folders (`.aether/work/seats/*/pair.json`): then it creates a `marker` file and blocks (`exec sleep 3600`). The test arms the shim just before `seat-start`, waits for the marker with `fs.watch` or a poll with `await new Promise((r) => setTimeout(r, 25))` (never a busy loop), then kills the process group of the seat with `SIGKILL` (the pid file of the seat folder) and removes the armed file. `PATH` reaches the seat runner through the environment of `runBin`; `laneEnv` in `lib/lane-process.js` only filters the CLI child.
- `lib/seats.js` makes that call at line 984 (`git rev-parse HEAD`, right after `pair.json` is written) and installs the signal handler at line 1045. If the shim never sees that call (for example because `seat-start` runs it first in another process), choose another equivalent seam in the test only; if none exists, change no production code and say so in the answer.
- `tests/quota-brake-continued.test.js`: after the crossing, assert the run was paused (`crossing.json.paused === true`, or the `runs` entry of the run has `paused: true`; use the field the output really has), fixing the comment about the listing of runs in the `quota-brake` output; add a third live process under key `fileKey('sess-C', 't2')` (a session that is not part of the run) and assert it is still alive after `quota-brake`, while the processes of sessions A and B are stopped.

**Tests (write first):** the two files above are the tests. Run the rewritten test 20 times under CPU load and keep the result:

```bash
n=$(node -p "require('node:os').availableParallelism()"); pids=(); for i in $(seq "$n"); do (while :; do :; done) & pids+=($!); done
pass=0; for i in $(seq 20); do node --test --test-name-pattern="killed before its signal handler" tests/seat-partial.test.js >/dev/null 2>&1 && pass=$((pass+1)); done
kill "${pids[@]}"; echo "cores=$n command=node --test --test-name-pattern=killed-before-its-signal-handler tests/seat-partial.test.js result=$pass/20"
```

**Acceptance:**
- `node --test tests/seat-partial.test.js tests/quota-brake-continued.test.js tests/quota-brake-command.test.js` passes.
- The loop prints `result=20/20`; the answer of the task carries that exact line (the Lead copies it into the closing comment of #317 and the diary).
- No load process is left running; `git diff --stat` shows only the two test files.

### Task 3: A cut-off or refused read-only answer stays pending

**Aether:**
- Area: delegates
- Owns: `plugins/aether/hooks/delegate.mjs`, `plugins/aether/hooks/delegate.test.ts`, `plugins/aether/bin/aether-delegate`, `plugins/aether/lib/delegate-run.js`, `plugins/aether/lib/delegate-chain.js`, `plugins/aether/lib/delegate-calls.js`, `plugins/aether/lib/harness/grok.js`, `tests/defect-045-stop-reason.test.js`, `tests/delegate-mod.test.js`, `tests/delegate-run.test.js`, `tests/delegate-auto-close.test.js`, `tests/delegate-calls.test.js`, `tests/delegate-chain.test.js`, `tests/harness-grok.test.js`, `tests/harness-agy.test.js`, `tests/harness-codex.test.js`
- Depends on: none
- Serves: R3

**Interfaces:**
- Rule (A132 stays, with one exception): a read-only delegate whose checks pass is closed by the system when it answers, unless the turn reports a stop reason that is a non-empty string other than `end_turn` and `tool_use` (`max_tokens`, `length`, `incomplete`, `refusal`, `content_filter`, or any other). Then the system does not close it: the task stays pending for `aether-delegate verdict`, `unverdictedDelegates` lists it and the Stop notice names it. With `stopReason === 'end_turn'` or no stop reason (absent or `null`: today `agy`, `codex` and `muse`), the automatic close is unchanged. `clean: false` outputs keep failing without closing.
- `hooks/delegate.mjs` (around line 214): the `answer` call becomes `['answer', '--session', ctx.session, '--stop-reason', <value>, '--task', …]`, the pair `--stop-reason <value>` present only when `result.stopReason !== 'end_turn'`; for `end_turn` the argv is exactly the one `tests/delegate-mod.test.js:310` and `hooks/delegate.test.ts:207` pin today.
- `bin/aether-delegate` `answer`: accepts the optional flag `--stop-reason <value>` (a non-empty token without spaces) and passes it as `stopReason` to `recordAnswer`. `usageOf('answer')` documents it.
- `lib/delegate-run.js`: `recordAnswer({ task, attempt, text, session, cwd, dataDir, now, stopReason })`: it records the `answer` entry as today and calls `closeReadOnly` only when `held(stopReason)` is false, where `const held = (reason) => typeof reason === 'string' && reason !== '' && reason !== 'end_turn' && reason !== 'tool_use'`. In `runReadOnly` the chain's `stopReason` selects `judgeLine(external.id)` instead of `readOnlyClosedLine(external.id)` when `held(chain.stopReason)`, and `runTask` does not call `closeReadOnly` for that result. `lib/delegate-task.js` is not changed.
- `lib/harness/grok.js`: `readGrok` also reads the field `stopReason` of grok's JSON output; `parse(raw, opts)` returns the same object as today plus the key `stopReason` only when its value is a non-empty string other than `end_turn`. `agy`, `codex` and `muse` do not change; the `deepEqual` assertions on `parse()` of `tests/harness-grok.test.js`, `tests/harness-agy.test.js` and `tests/harness-codex.test.js` do not change.
- `lib/delegate-calls.js` (`runDelegate` result) and `lib/delegate-chain.js` (`runChain` result) carry `stopReason` from the parse of the last call to the chain result, omitted when there is none.

**Tests (write first):**

New file `tests/defect-045-stop-reason.test.js`. `launchReadOnly` is async, because `begin` is: it copies the fixture of `tests/delegate-auto-close.test.js` (`world`, `call`, `BRIEF`; a test file exports nothing) and awaits the launch of a read-only task on a real throwaway repo, so that `closeReadOnly` sees a clean checkout:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const { recordAnswer } = require('../plugins/aether/lib/delegate-run.js')
const { unverdictedDelegates } = require('../plugins/aether/lib/delegate-report.js')
const { unverdictedStopMessage } = require('../plugins/aether/lib/continuity-hook.js')
const log = require('../plugins/aether/lib/delegate-log.js')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate')
const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }

async function launchReadOnly(t, id = 'ro-stop') {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  let n = 0
  const deps = { dataDir, cwd: repo.dir, now: () => 1000 + (n += 1), settings: NATIVE, newId: () => `gen-${n}`, pickPair: async () => ({ pick: null, quota: [] }) }
  await task.begin({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt: `AETHER-TASK: ${id}\nDo the work.` } }, deps)
  return { dataDir, cwd: repo.dir, session: 's1', task: id, env: { ...process.env, AETHER_DATA_DIR: dataDir } }
}
const answer = (w, stopReason, text) => recordAnswer({ task: w.task, attempt: 1, text, session: w.session, cwd: w.cwd, dataDir: w.dataDir, now: () => 5000, stopReason })
const pending = (w) => unverdictedDelegates({ dataDir: w.dataDir, session: w.session })
const verdicts = (w) => log.readEntries(w.dataDir, { task: w.task }).filter((e) => e.kind === 'verdict')

for (const stopReason of ['max_tokens', 'length', 'incomplete', 'refusal', 'content_filter', 'something-else']) {
  test(`Claude: a read-only answer that stopped on ${stopReason} stays pending`, async (t) => {
    const w = await launchReadOnly(t)
    assert.equal(answer(w, stopReason, 'half an answer').recorded, true)
    assert.deepEqual(pending(w).map((x) => x.task), [w.task])
    assert.deepEqual(verdicts(w), [])
  })
}

for (const stopReason of ['end_turn', undefined, null]) {
  test(`Claude: a read-only answer with stop reason ${String(stopReason)} is closed as A132 decided`, async (t) => {
    const w = await launchReadOnly(t)
    answer(w, stopReason, 'a full answer')
    assert.equal(verdicts(w)[0].auto, true)
    assert.deepEqual(pending(w), [])
  })
}

test('the Stop notice names a task left pending by a cut-off answer', async (t) => {
  const w = await launchReadOnly(t)
  answer(w, 'max_tokens', 'cut')
  assert.ok(unverdictedStopMessage(pending(w), false).includes(w.task))
})

test('aether-delegate answer --stop-reason leaves the task pending (CLI)', async (t) => {
  const w = await launchReadOnly(t)
  const out = spawnSync(process.execPath, [BIN, 'answer', '--session', w.session, '--stop-reason', 'refusal', '--task', w.task, '--attempt', '1', '--text', 'no'], { cwd: w.cwd, encoding: 'utf8', env: w.env })
  assert.equal(JSON.parse(out.stdout.trim()).recorded, true)
  assert.equal(pending(w).length, 1)
  assert.deepEqual(verdicts(w), [])
})
```

Add, in the same file, the other-harness cases: `parse()` of grok with output `{"result":"{\"answer\":\"x\"}","stopReason":"max_tokens"}` and exit 0 returns `clean: true` and `stopReason: 'max_tokens'`; with `"stopReason":"end_turn"` or with no field the returned object has no `stopReason` key (`Object.hasOwn(parsed, 'stopReason') === false`); `agy`, `codex` and `muse` `parse()` never return it. A `runTask` (launched as test 1 of `tests/delegate-auto-close.test.js` does: copy its `EXTERNAL` settings, its `GROK` pick and its `world`, with a `makeRepo` repo as `cwd`, then `runTask({ id, session, cwd, dataDir }, { runChain })`) with a fake `runChain` that returns `{ ok: true, status: 'ok', text: 'cut', attribution: 'a', stopReason: 'length', attempts: [], changed: [] }` writes a result whose `text` has the judge line (`judgeLine`) and not the automatic-close line, and leaves the task pending; the same fake chain with no `stopReason` closes it as `tests/delegate-run.test.js` expects today. In `tests/delegate-mod.test.js` and `hooks/delegate.test.ts`, add a case where the model's result carries `stopReason: 'max_tokens'`: the argv of the `answer` call is `['answer', '--session', <s>, '--stop-reason', 'max_tokens', '--task', <t>, '--attempt', '1', '--text', <answer>]`; the `end_turn` case keeps its argv.

**Acceptance:**
- `node --test tests/defect-045-stop-reason.test.js tests/delegate-mod.test.js tests/delegate-run.test.js tests/delegate-auto-close.test.js tests/delegate-calls.test.js tests/delegate-chain.test.js tests/harness-grok.test.js tests/harness-agy.test.js tests/harness-codex.test.js` passes, and `npm run test:mod` passes for `hooks/delegate.test.ts`.
- The tests of `tests/delegate-auto-close.test.js` and `tests/delegate-run.test.js` that close without a `stopReason` are unchanged.
- The tests state, in a comment, that `agy`, `codex` and `muse` report no stop reason, so a cut or refusal there is not detected (the hole stays on the owner's list).

### Task 4: The guard lets reads through and still refuses writes

**Aether:**
- Review: xhigh — a mistake lets a write to Claude's settings, its hooks or the trusted-authors list through, or turns a safe read into a refusal (security)
- Area: guard
- Owns: `plugins/aether/lib/guard.js`, `tests/guard.test.js`, `tests/guard-skills.test.js`, `tests/guard-claude.test.js`, `tests/defect-045-guard.test.js`
- Depends on: none
- Serves: R4

**Interfaces:**
- `lib/guard.js`, `claudeConfigWrite(command)` and `trustedWrite(command, cwd, env)`: they no longer read the words of a read-only segment as write targets. A segment is read-only when it is a `find` with none of `FIND_WRITE_ACTIONS` (`-delete`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-fprint`, `-fprint0`, `-fprintf`, `-fls`) or a `gh issue` / `gh pr`, read through its words after the wrappers (`sudo`, `/usr/bin/find`), and nothing else in the line writes (`segmentsWrite` of the whole line is false, as `isSkillInstallSegment` already does). A read-only segment contributes only its redirection targets (`redirectTargets`). Every other segment is read as today.
- No change to `writeTargets` for other callers, to `isSkillInstallSegment`'s behaviour or to the classes of `irreversibleClasses`.

**Tests (write first):**

New file `tests/defect-045-guard.test.js`, with a copy of the `world(t)` fixture of `tests/guard-skills.test.js` (a test file exports nothing, so copy it); `claudeConfigWrite` and `trustedWrite` are exercised through `decideBash`:

```js
const READS = [
  'find ~/.claude -name settings.json',
  'find . -name settings.json -path "*/.claude/*"',
  'find ~/.claude/plugins/data -name trusted.json',
  'sudo find ~/.claude/plugins/data -name trusted.json',
  '/usr/bin/find ~/.claude/plugins/data -name trusted.json',
  'gh issue create --title t --body "mentions .claude/settings.json and skills/trusted.json"',
  'gh pr comment 3 --body "the .claude/hooks folder and skills/trusted.json"',
]
const WRITES = [
  'echo {} > .claude/settings.json',
  'cp x .claude/settings.json',
  'rm -rf .claude/hooks',
  'sed -i s/a/b/ .claude/settings.json',
  'find .claude -name settings.json -delete',
  'echo {} > ~/.claude/plugins/data/skills/trusted.json',
  'gh issue create --body x > .claude/settings.json',
  'gh issue create --body "$(cp x .claude/settings.json)"',
]
test('R4: reads that only name Claude settings or the trusted list are not refused', (t) => {
  const w = world(t)
  for (const command of READS) assert.equal(w.bash(command), null, command)
})
test('R4: a write, redirection or deletion on those targets is still refused', (t) => {
  const w = world(t)
  for (const command of WRITES) assert.notEqual(w.bash(command), null, command)
})
```

The guard does not refuse today, and this task does not make it refuse, a `find` that hands its result to another command (`find ~/.claude/plugins/data -name trusted.json -exec rm {} ;` and `find ~/.claude -name settings.json | xargs rm` return `null` before and after): R4 asks only that reads pass and the refusals that exist stay, so those two commands are in neither list.

In `tests/guard-skills.test.js`, extend the existing R29 and R30 loops (hallazgo #15): for each of `-execdir`, `-ok`, `-okdir`, `-fprint0`, `-fprintf` and `-fls` a `find <personal skills folder> -name SKILL.md <action> …` command is classed `skill-install`; `sudo find <folder> -name SKILL.md` and `/usr/bin/find <folder> -name SKILL.md` are reads (no class), and `sudo find <folder> -name SKILL.md -delete` is `skill-install`; a `gh issue comment 315 --body "$(cp x <folder>/y)"` and the same with `gh pr create` are flagged `skill-install` because the substitution is its own segment.

**Acceptance:**
- `node --test tests/defect-045-guard.test.js tests/guard.test.js tests/guard-skills.test.js tests/guard-claude.test.js tests/guard-tidy.test.js tests/guard-merge-main.test.js tests/guards-core-1.test.js tests/guards-core-2.test.js` passes; the new READS case fails before the change and the WRITES case passes before and after.
- Every existing refusal of `.claude/settings.json`, `.claude/hooks` and the trusted list in the guard tests is unchanged.

### Task 5: One `USAGE`, a stricter `loadThreshold` and the mod's spec pattern

**Aether:**
- Area: plan
- Owns: `plugins/aether/bin/aether-plan`, `plugins/aether/lib/plan-compile.js`, `plugins/aether/lib/plan-requirements.js`, `plugins/aether/hooks/ops-command.mjs`, `plugins/aether/hooks/ops.test.ts`, `tests/aether-plan.test.js`, `tests/plan-number.test.js`, `tests/plan-requirements.test.js`, `tests/ops-command-design.test.js`, `tests/ops-command.test.js`
- Depends on: none
- Serves: R6, R7

**Interfaces:**
- `lib/plan-compile.js` exports `USAGE`, the one definition, which already names every verb: `usage: aether-plan check <plan.md> | aether-plan compile <plan.md> [--run <id>] [--only task-1,task-2] [--allow-main] [--no-lanes] [--no-baseline] | aether-plan next-spec | aether-plan design-args <feature> [--short <document> --intent <text> --author <model>] | aether-plan requirements <spec.md>`. The copy in `bin/aether-plan` and its branch `(verb === 'check' || verb === 'compile') && !argv[1]` are deleted; `bin/aether-plan` requires `USAGE` from `plan-compile.js` lazily (only where it prints it, so `next-spec` and `design-args` do not load the compiler). `check` and `compile` with no argument keep printing `{ ok: false, errors: [USAGE], warnings: [] }` with exit 1 (as `tests/plan-number.test.js:102-107` pins), and so does `requirements` with no argument and an unknown verb. `lib/plan-requirements.js` keeps its own `usage` only for a spec argument given twice; it prints the shared `USAGE` for a missing argument.
- `lib/plan-requirements.js` `loadThreshold(configPath)`: throws `threshold config ${configPath} is not an object` when the parsed JSON is `null`, an array or any non-object; the other three errors keep their text (not found, not JSON, `needs mapMinRequirements as a positive integer`).
- `hooks/ops-command.mjs`: `SPEC = /^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*\/spec\.md$/`, the same pattern as `TASKS` (line 45).
- `hooks/ops.test.ts`: the case for `aether-plan requirements` runs and passes under `npm run test:mod`.

**Tests (write first):**

In `tests/aether-plan.test.js` (new cases):

```js
test('R7: requirements with no argument prints the full shared USAGE like check, compile and an unknown verb', () => {
  const { USAGE } = require('../plugins/aether/lib/plan-compile.js')
  for (const argv of [['requirements'], ['check'], ['compile'], ['nope']]) {
    const out = runBin(PLAN_BIN, argv, process.cwd())
    assert.equal(out.status, 1)
    assert.deepEqual(JSON.parse(out.stdout).errors, [USAGE], argv.join(' '))
  }
  assert.ok(USAGE.includes('aether-plan requirements <spec.md>'))
})
test('R7: bin/aether-plan holds no copy of USAGE', () => {
  const text = fs.readFileSync(path.join(PLUGIN, 'bin', 'aether-plan'), 'utf8')
  assert.equal(/const USAGE\s*=/.test(text), false)
  assert.equal(text.includes("verb === 'check' || verb === 'compile') && !argv[1]"), false)
})
```

In `tests/plan-requirements.test.js`, one case per branch of `loadThreshold` with a temporary `configPath`: file missing (message includes `not found`), invalid JSON (`not JSON`), `null`, `[]` and `7` (message includes `is not an object`, and not `Cannot read properties of null`), and `{"mapMinRequirements":0}`, `{"mapMinRequirements":1.5}`, `{"mapMinRequirements":"15"}` (`positive integer`); `{"mapMinRequirements":15}` returns 15. In `tests/ops-command-design.test.js`: `parseOpsPrompt` accepts `aether-plan requirements specs/045-API_v2/spec.md` and `specs/045-v1.2/spec.md`, and still refuses `../x/spec.md`, `specs/045-x/plan.md` and an extra flag.

**Acceptance:**
- `node --test tests/aether-plan.test.js tests/plan-number.test.js tests/plan-requirements.test.js tests/ops-command-design.test.js tests/ops-command.test.js` passes, and `npm run test:mod` passes with the `aether-plan requirements` case of `ops.test.ts` run.
- `grep -c "const USAGE" plugins/aether/bin/aether-plan` prints 0.

### Task 6: The cap of 10 minors rules the whole sliced review, and `REVIEW_FINDINGS` extends `FINDINGS`

**Aether:**
- Area: swarm
- Owns: `plugins/aether/workflows/run.workflow.js`, `plugins/aether/lib/lane-schemas.js`, `tests/workflow-final-slices.test.js`, `tests/aether-lane.test.js`, `tests/lane-schemas.test.js`, `tests/review-findings-fix.test.js`, `tests/workflow-review-once.test.js`, `tests/workflow-ladder.test.js`, `tests/defect-045-review.test.js`
- Depends on: none
- Serves: R8

**Interfaces:**
- `workflows/run.workflow.js`, `reviewRunSliced` (and the function that combines the slices' findings): after the slices are combined, keep every `critical` and `important` finding and the first 10 `minor` findings in slice order (`slice 1` to `slice N`, keeping each slice's own order); the minors beyond 10 are dropped. Let `K` be the number dropped. When `K > 0`, `finalReview` carries the numeric field `minorsOmitted: K` and its `summary` ends with the note `<K> minor findings were omitted (the cap is 10 for the whole review).`; when `K === 0` the field is absent and `summary` is unchanged. Nothing else of the result changes.
- `REVIEW_FINDINGS` is built by extending `FINDINGS` with `fix`, in `workflows/run.workflow.js` and in `lib/lane-schemas.js`: `{ ...FINDINGS, items: { ...FINDINGS.items, required: [...FINDINGS.items.required, 'fix'], properties: { ...FINDINGS.items.properties, fix: { type: 'string', description: <the text the file has today> } } } }`; the two files keep equal copies (`tests/aether-lane.test.js` compares them).

**Tests (write first):**

New file `tests/defect-045-review.test.js` plus cases in the owned files:

```js
test('R8: four slices of six minors and one important give four importants, ten minors and minorsOmitted 14', async () => {
  const slice = (n) => ({ verdict: 'ready-with-fixes', summary: `slice ${n}`, findings: [
    ...Array.from({ length: 6 }, (_, i) => ({ severity: 'minor', title: `s${n}-minor-${i + 1}`, file: 'a.js', evidence: 'e', fix: 'f' })),
    { severity: 'important', title: `s${n}-important`, file: 'a.js', evidence: 'e', fix: 'f' },
  ] })
  const result = await runSlicedReview([1, 2, 3, 4].map(slice))   // the harness of tests/workflow-final-slices.test.js
  const f = result.finalReview
  assert.deepEqual(f.findings.filter((x) => x.severity === 'important').map((x) => x.title), ['s1-important', 's2-important', 's3-important', 's4-important'])
  const minors = f.findings.filter((x) => x.severity === 'minor').map((x) => x.title)
  assert.equal(minors.length, 10)
  assert.deepEqual(minors.slice(0, 6), ['s1-minor-1', 's1-minor-2', 's1-minor-3', 's1-minor-4', 's1-minor-5', 's1-minor-6'])
  assert.deepEqual(minors.slice(6), ['s2-minor-1', 's2-minor-2', 's2-minor-3', 's2-minor-4'])
  assert.equal(f.minorsOmitted, 14)
  assert.ok(f.summary.includes('14 minor findings were omitted'))
})
test('R8: with ten minors or fewer minorsOmitted is absent', async () => { /* 2 slices of 3 minors: no minorsOmitted key, summary unchanged */ })
test('R8: REVIEW_FINDINGS is FINDINGS plus fix, in both files', () => { /* read both files; for each, evaluate the schema constants (as tests/aether-lane.test.js does) and assert deepEqual(REVIEW_FINDINGS.items.properties, { ...FINDINGS.items.properties, fix }) and required === [...FINDINGS.items.required, 'fix']; then assert the two files' REVIEW_FINDINGS are deepEqual */ })
```

In `tests/aether-lane.test.js` add two `validate` cases of `REVIEW_SCHEMA` next to the one at line 179: a finding with `fix` passes (`null`), a finding without `fix` fails with `missing findings[0].fix`.

**Acceptance:**
- `node --test tests/defect-045-review.test.js tests/workflow-final-slices.test.js tests/aether-lane.test.js tests/lane-schemas.test.js tests/review-findings-fix.test.js tests/workflow-review-once.test.js tests/workflow-ladder.test.js` passes; the new cases fail before the change.

### Task 7: The design workflow cleanup, the mapper and the Writer forms

**Aether:**
- Area: design-workflow
- Owns: `plugins/aether/workflows/design.workflow.js`, `plugins/aether/agents/mapper.md`, `plugins/aether/agents/writer.md`, `tests/workflow-design.test.js`, `tests/agent-turns.test.js`, `tests/agent-mapper.test.js`, `tests/agent-outputs.test.js`, `tests/agents-design.test.js`, `tests/defect-045-design.test.js`
- Depends on: none
- Serves: R5, R12

**Interfaces:**
- `agents/mapper.md`: the sentence `The message gives you the approved spec and the plan's context.` loses `and the plan's context` (it says `The message gives you the approved spec.`), and the answer instruction gains the exact sentence `Put the lines, one per requirement, in the `map` field of your answer.`
- `agents/writer.md`: the two single-document forms «After plan.md only» and «After tasks.md only» no longer list `disagreements` (they match `PLAN_WRITER_SCHEMA` and `TASKS_WRITER_SCHEMA`, which have no such field); the forms «After the spec» and «After a revision» keep it.
- `workflows/design.workflow.js`: (a) the native branch of the plan reuses `checkedAfter('tasks write', tasksMessage(), writeTasks)` and takes `checkedTasks.retried || tasks` as the final answer, with no second copy of the check-and-retry loop; (b) `examine()` has one `async function storeExam()` (opsTwice store, the error, the `dir` or `stored` field, the `named no directory` failure) called from both places; (c) the `try/catch` around the `call('mapper', …)` in `planMap()` is removed (`call()` already catches and returns `null`), the `null` branch stays; (d) the local `message` in `seatRound` is renamed `nativeMessage`; (e) `writePlan` takes `planOnlyText` as a required parameter and has no default that joins the text of two documents with `Write only plan.md…`. Behaviour for every call that works today is unchanged.
- Finding 24 no longer applies: `PLAN_WRITER_SCHEMA.commit.description` is `'your commit of plan.md'` and `TASKS_WRITER_SCHEMA.commit.description` is `'your commit of tasks.md'` since `14f30c5`; do not change them, only pin them in a test.

**Tests (write first):**

New file `tests/defect-045-design.test.js` for the text and structure checks:

```js
test('R5: mapper.md no longer promises the plan context and names the map field', () => {
  const text = read('agents', 'mapper.md')
  assert.equal(text.includes("the plan's context"), false)
  assert.ok(text.includes('Put the lines, one per requirement, in the `map` field of your answer.'))
})
test('R12 (comment 1): the two separate Writer forms do not list disagreements', () => {
  const writer = read('agents', 'writer.md')
  const between = (from, to) => writer.slice(writer.indexOf(from), to ? writer.indexOf(to, writer.indexOf(from) + 1) : undefined)
  // the sections «After plan.md only» and «After tasks.md only» are bounded by the next «**After» heading
  for (const heading of ['**After plan.md only:**', '**After tasks.md only:**']) {
    const next = writer.indexOf('**After', writer.indexOf(heading) + heading.length)
    const form = writer.slice(writer.indexOf(heading), next === -1 ? undefined : next)
    assert.equal(form.includes('disagreements'), false, heading)
  }
})
test('R12 (finding 24): the commit descriptions of the two schemas name only their own document', () => {
  const flow = read('workflows', 'design.workflow.js')
  assert.ok(flow.includes("'your commit of plan.md'") && flow.includes("'your commit of tasks.md'"))
  assert.equal(flow.includes("'your commit of plan.md and tasks.md'"), false)
})
test('R12: the workflow has no second copy of the check loop, one storeExam and no nativeMessage shadow', () => {
  const flow = read('workflows', 'design.workflow.js')
  assert.equal((flow.match(/async function storeExam\(/g) || []).length, 1)
  assert.equal(/const message = nativeText/.test(flow), false)
  assert.ok(flow.includes('const nativeMessage ='))
  assert.equal(flow.includes('the mapper call threw'), false)
})
```

In `tests/agent-turns.test.js`, each assertion reads only the text between its heading and the next heading (`sectionOf(text, heading)`), not from `## Your answer` to the end. In `tests/workflow-design.test.js` add the three failure exits of the native two-call path (the harness of that file): (1) a tasks call that answers `null` twice ends `failed` at step `plan-writer` with the `tasks.failed` reason; (2) an `aether-plan check` that answers `{ error }` ends `failed` at step `plan-check` with `aether-plan check did not run`; (3) a check that fails once and a retry call that answers `null` ends `failed` with the `again.failed` reason. Keep the existing cases green (the mapper `throws` case now passes through `call()`'s catch and the `ended without an answer` log).

**Acceptance:**
- `node --test tests/defect-045-design.test.js tests/workflow-design.test.js tests/agent-turns.test.js tests/agent-mapper.test.js tests/agent-outputs.test.js tests/agents-design.test.js tests/agents.test.js` passes; the new cases fail before the change (except the finding-24 pin, which passes before and after).
- `git diff plugins/aether/workflows/design.workflow.js` adds no skills step (Task 12 does).

### Task 8: Muse is read over `muse serve`, last in the round

**Aether:**
- Area: models
- Owns: `plugins/aether/lib/muse-models.js`, `plugins/aether/lib/model-listing.js`, `plugins/aether/lib/model-watch.js`, `plugins/aether/lib/doctor.js`, `plugins/aether/config/model-watch.json`, `docs/reference/components.md`, `tests/muse-models.test.js`, `tests/defect-045-muse.test.js`, `tests/model-watch.test.js`, `tests/model-listing.test.js`, `tests/doctor.test.js`, `tests/session-start-model-watch.test.js`, `tests/components-docs.test.js`, `tests/aether-observe.test.js`
- Depends on: none
- Serves: R13, R14, R15, R16, R27

**Interfaces:**
- R13 is done: one `model/list` query to Muse 1.4.23 on 2026-11-17 is case (1), recorded in `specs/045-defect-issues/evidence/muse-model-list-2026-11-17.md`. Do not run it again, do not run `muse exec` or `refreshMuseQuota`, and never call the real `muse`: every test uses a fake `muse` executable put first on `PATH`.
- `plugins/aether/lib/muse-models.js` (new, family `model`), `listMuseModels({ command = 'muse', env = process.env, timeoutMs = 10000, spawn = childProcess.spawn, version = <plugin version> } = {})`, resolves (never rejects) to `{ status: 'ok', ids }` with the ids of `result.models[]` in the order given (each row's `modelId`, else `id`), or `{ status: 'failed' | 'timeout' | 'not-installed', reason }`. It spawns `<command> serve --no-session-log --disable-shell --disable-write` with stdio pipes and speaks JSON-RPC 2.0 lines: `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"aether","version":"<version>"}}}`, the notification `{"jsonrpc":"2.0","method":"initialized"}` after the reply to id 1, then `{"jsonrpc":"2.0","id":2,"method":"model/list","params":{}}`. It ends the process (`SIGTERM`, then `SIGKILL` after 500 ms) when the reply to id 2 arrives, when the process fails or exits, or when `timeoutMs` passes; no process outlives the call. A reply with `error`, no `result.models` array, an empty array or a non-JSON line is `failed`. It never sends any other method.
- `config/model-watch.json`: `captureVia.muse` changes from `null` to `{ "msp": true }`.
- `lib/model-listing.js` `listModels('muse', options)`: with `captureVia.muse.msp === true` and the command installed (`commandInstalled`), it calls `listMuseModels({ command, env, timeoutMs })`; a missing command is `{ status: 'not-installed', reason: '<command> not found on PATH' }`; the `no capture means without a model call` reason is gone. Other harnesses are unchanged.
- `lib/model-watch.js` `runWatch`: the targets are read in the given order with `muse` moved to the end (stable for the others), so a slow or hung `muse` never consumes `totalSeconds` before another harness; the per-harness limit stays `perHarnessSeconds` and the total `totalSeconds`; a Muse `failed`, `timeout` or `not-installed` is recorded with its status and reason and never affects another harness. `muse` not in `harnesses` is not read. In a session that is not the Lead's nothing runs (`launch` unchanged). Nothing writes `harness-models.json`, `pairs.json` or `prices.json`.
- `lib/doctor.js`: a `muse` entry with status `ok` shows the full comparison (`new models: …; retired: …`) like the others; the text `no capture means without a model call` and the `no-capture` line for Muse are gone (the `no-capture` branch stays for a harness with no capture configured).
- `docs/reference/components.md`: `muse-models.js` is declared in the `model` family.

**Tests (write first):**

New file `tests/muse-models.test.js`, with a fake `muse` written to a temporary `bin/` folder (a Node script with a `#!/usr/bin/env node` line, mode 755) that logs its argv and every method it receives to `log.jsonl`, writes its pid to `pid`, and answers by `MODE`:

```js
// ok: reply to initialize with { jsonrpc:'2.0', id:1, result:{ serverInfo:{ name:'muse' } } }, and to model/list with
// { jsonrpc:'2.0', id:2, result:{ models:[{ modelId:'muse-wonder-1.0' }, { modelId:'muse-ember-1.0' }], profileId:null, providerId:'meta', source:'providerCatalog' } }
test('R14: the reader asks initialize, initialized and model/list and nothing else, with the read-only flags', async (t) => {
  const w = fakeMuse(t, 'ok')
  const res = await listMuseModels({ env: w.env, timeoutMs: 5000 })
  assert.deepEqual(res, { status: 'ok', ids: ['muse-wonder-1.0', 'muse-ember-1.0'] })
  assert.deepEqual(w.methods(), ['initialize', 'initialized', 'model/list'])
  assert.deepEqual(w.argv(), ['serve', '--no-session-log', '--disable-shell', '--disable-write'])
  await assertGone(w.pid())          // the process is closed after the reply
})
test('R14: it keeps the id key as a fallback and the order given', () => {})
test('R14: a server that never answers is cut at the limit and its process is gone', async (t) => {
  const w = fakeMuse(t, 'hang')
  const started = Date.now()
  const res = await listMuseModels({ env: w.env, timeoutMs: 300 })
  assert.equal(res.status, 'timeout')
  assert.ok(Date.now() - started < 3000)
  await assertGone(w.pid())
})
test('R14: exit 1, an error reply, an empty list and a garbage line are failed with a reason', () => {})
test('R14: a PATH with no muse is not-installed', () => {})
```

New file `tests/defect-045-muse.test.js`: the evidence file `specs/045-defect-issues/evidence/muse-model-list-2026-11-17.md` exists and its JSON block says `why: "listed"`, `usageSeen: false`, `turnSeen: false`, `quotaError: false`; the fake server of `tests/muse-models.test.js` answers with the five ids of that block (each as `modelId`) and the reader returns them in the same order (`muse-wonder-1.0`, `muse-wonder-full-1.0`, `muse-ember-1.0`, `muse-spark-1.3`, `muse-spark-1.2`); no test file of the task mentions `refreshMuseQuota` or `muse exec` as a call.

In `tests/model-watch.test.js`: (1) with `harnesses: ['muse', 'grok', 'agy']` and an injected `listModels` spy, the calls are `grok`, `agy`, `muse` (muse last); (2) a `muse` that answers `{ status: 'timeout' }` or `{ status: 'failed', reason: 'x' }` or `{ status: 'not-installed' }` leaves `grok` and `agy` `ok` and the notice of `grok` intact, with `muse` recorded under its status; (3) with `harnesses: ['muse', 'grok']`, `totalSeconds: 0.3` and a `grok` spy that waits 400 ms (longer than `totalSeconds`, because `runWatch` skips only when the elapsed time is at least `totalMs`), `grok` is read and `muse` is skipped with `total-timeout` and the `muse` spy is never called; (4) a muse with new `muse-ember-1.0` and retired `muse-spark-1.2` (table `muse: { models: ['muse-wonder-1.0','muse-spark-1.2'] }`) gives `noticeLine` text that names both; (5) `harness-models.json`, `pairs.json` and `prices.json` have the same sha1 before and after a `runWatch` over the real tree. In `tests/model-listing.test.js`: `listModels('muse')` with `captureVia.muse = { msp: true }`, the fake `muse` on `PATH` and a lanes table that names no other command returns the ids; without the fake it is `not-installed`. In `tests/doctor.test.js`: a `muse` entry `{ status: 'ok', new: ['muse-ember-1.0'], retired: [] }` renders `muse: new models: muse-ember-1.0; retired: none; readAt …`, and the output never contains `no capture means`. `tests/components-docs.test.js` stays green with the new module declared.

Two existing tests pin the old `no-capture` state and would launch the real `muse serve` through the real `PATH` once `muse` is read: `tests/aether-observe.test.js` (the test that runs `models-read` with `AETHER_LANE_HARNESSES: 'muse'` and asserts `out.harnesses.muse.status === 'no-capture'`, line 32) and the test of `tests/model-watch.test.js` that runs `models-read` with `AETHER_LANE_HARNESSES: 'agy,muse'` (lines 249 and 257). Both are Task 8's and change in this task: each puts a fake `muse` executable first on `PATH` (a temporary folder with a `#!/bin/sh` script `muse` that exits 1 without printing, mode 755, in front of `process.env.PATH`; the fake agy of the second test already lives in such a folder) and asserts the new state, `harnesses.muse.status === 'failed'` (the fake exits before it answers `initialize`), instead of `no-capture`; the `agy` assertions of the second test stay. Neither test may reach the real `muse`.

**Acceptance:**
- `node --test tests/muse-models.test.js tests/defect-045-muse.test.js tests/model-watch.test.js tests/model-listing.test.js tests/doctor.test.js tests/session-start-model-watch.test.js tests/components-docs.test.js tests/aether-observe.test.js` passes; nothing calls the real `muse` or the network (run once with `PATH` stripped of the real `muse` to prove it).
- `git diff --stat` shows no change under `config/models/`.

### Task 9: The automatic skill matcher with the closed rule of R20

**Aether:**
- Area: skills
- Owns: `plugins/aether/lib/skill-brief.js`, `plugins/aether/config/skills.json`, `tests/skill-brief.test.js`, `tests/defect-045-skill-match.test.js`, `tests/skill-topics.test.js`
- Depends on: none
- Serves: R20

**Interfaces:**
- `lib/skill-brief.js` `matchDelegateSkills(cwd, { prompt, description, owns })` returns the names of **all** matching project skills, already ordered (the cap of 3 belongs to whoever attaches; `tests/skill-brief.test.js:283-285` stays). The text evaluated is `description`, `prompt` and `owns` joined, lowercased and without accents. The rule, in full:
  1. **Domain signals of a skill**, from its `name` and `description`: (a) the exact name (any length, `pxl` included); (b) file extensions and patterns with a dot, taken from `description` before it is tokenized: a token that starts with `.`, continues with 1 to 5 alphanumerics and admits more segments of `.` plus 1 to 5 alphanumerics (`.px.js`, `.ipynb`, `.gd`, `.wgsl`), preceded by start of text, a space, a quote, a backtick or an opening parenthesis and followed by a space, a quote, a backtick, a comma, a semicolon, a closing parenthesis or the end of text (so the final dot of `landing page.`, `e.g.` and `i.e.` give no pattern), compared as a suffix of a path of `owns` or as a literal mention; (c) the parts of at least 2 characters of a hyphenated name that are not stop words; (d) the distinct words of **length ≥ 4** of `description` (and of `name`, once) that are not stop words.
  2. **`stopWords` of `config/skills.json`**: keep the current list and add only this closed list: `readme`, `landing`, `docs`, `documentation`, `documentacion`, `guide`, `guia`, `spec`, `plan`, `config`, `json`, `new`. Do not add `test` or `tests`.
  3. **Threshold**: a skill matches only when (i) its exact name appears as an independent token, or (ii) one of its dot patterns matches an `owns` path or the text, or (iii) its hyphenated name has at least 2 parts that are not stop words (length ≥ 2) and all of them appear in the task (one remaining part, such as `harness` in `new-harness`, is not enough), or (iv) at least `max(2, min(3, ceil(N × 0.25)))` distinct domain words (length ≥ 4) of the skill appear in the task, N being the skill's number of domain words; with N < 2 this condition never fires. This replaces the expectation of `tests/skill-brief.test.js:164-167` for `audio-fx`: it now needs `audio-fx` or both `audio` and `fx`; `ui-kit`, `save-game` and `diseno-web` keep passing because their cases name the skill or give all its parts.
  4. **Order**: by strength of signal ((i) exact name, (ii) dot pattern, (iii) full compound name, (iv) more matched domain words), and, on a tie, alphabetical by `name`. The order of (iv) counts the matched domain words only and does **not** break a tie by proportion: `tests/skill-brief.test.js:283-285` stays and expects the alphabetical order `backslash-flow, double-flow, escaped-flow, single-flow, space-flow` for five skills that match with 2 of 5, 2 of 5, 2 of 6, 2 of 6 and 2 of 7 domain words, and a proportion would put `backslash-flow`, `space-flow`, `double-flow`, `escaped-flow`, `single-flow` in another order. (This drops the words «y proporción» that R20 of the spec has in its order; the plan says so under `## Risks` and asks the Lead.)
- The tests use the real skills of this repository: copy `.agents/skills/{pxl,new-harness,artificial-analysis}/SKILL.md` into a temporary project (`.agents/skills/<name>/`) so the real descriptions are exercised.

**Tests (write first):**

New file `tests/defect-045-skill-match.test.js`:

```js
const REAL = ['pxl', 'new-harness', 'artificial-analysis']
function project(t) { /* tempDir + makeRepo; copy the three real SKILL.md files into .agents/skills/<name>/ */ }
const match = (dir, task) => sb.matchDelegateSkills(dir, { prompt: '', description: '', owns: [], ...task })

test('R20: pxl matches a task that edits a .px.js file without naming pxl', (t) => {
  assert.deepEqual(match(project(t), { description: 'Adjust the walk cycle', owns: ['assets/brand/gifs/walk.px.js'] }), ['pxl'])
})
test('R20: pxl matches by name and by pixel-art animation and GIF export', (t) => {
  const dir = project(t)
  assert.deepEqual(match(dir, { prompt: 'Rebuild the pxl sheet' }), ['pxl'])
  assert.deepEqual(match(dir, { prompt: 'Export the pixel-art animation as a GIF' }), ['pxl'])
})
for (const task of [
  { description: 'Update README.md and the landing page', owns: ['README.md', 'site/index.html'] },
  { description: 'Tune the CSS animation of the hero on the landing page', owns: ['site/styles.css'] },
  { description: 'Refactor the parser and add tests', owns: ['plugins/aether/lib/plan.js', 'tests/plan.test.js'] },
  { description: 'Fix the harness adapter parse bug', owns: ['plugins/aether/lib/harness/agy.js'] },
  { prompt: 'These are one of the tasks, and they are out of the picture, not here' },
  { description: 'Show cost and tokens in aether-report', owns: ['plugins/aether/lib/report.js'] },
  { description: 'Pick the model and effort of the delegate in delegate-task', owns: ['plugins/aether/lib/delegate-task.js'] },
]) {
  test(`R20: ${JSON.stringify(task).slice(0, 60)} gets none of the three real skills`, (t) => {
    assert.deepEqual(match(project(t), task), [])
  })
}
test('R20: a short word of 3 letters (are, one, out, for, how, per) is never a domain word', () => {})
test('R20: new-harness needs more than harness or new + harness (one remaining part is not enough)', () => {})
test('R20: audio-fx needs audio-fx or both audio and fx (replaces the old audio-only case)', () => {})
test('R20: ui-kit, save-game and diseno-web still match their cases', () => {})
test('R20: the dot-pattern extraction accepts .ipynb and (.ipynb) and ignores landing page. and e.g.', (t) => {
  // a skill whose description is 'Notebooks (.ipynb) and files such as .gd are covered.' matches owns 'a/b.ipynb' and 'x.gd'
  // a skill whose description ends 'for the landing page.' with a task that mentions 'e.g.' matches nothing
})
test('R20: the order is exact name, dot pattern, compound name, domain words, then alphabetical', () => {})
test('R20: stopWords adds exactly the closed list and not test or tests', () => {
  const stop = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'skills.json'), 'utf8')).stopWords
  for (const w of ['readme','landing','docs','documentation','documentacion','guide','guia','spec','plan','config','json','new']) assert.ok(stop.includes(w), w)
  assert.equal(stop.includes('test') || stop.includes('tests'), false)
})
```

Update `tests/skill-brief.test.js:164-167` as above and keep its other cases green; `tests/skill-topics.test.js` only if it reads `stopWords`.

**Acceptance:**
- `node --test tests/skill-brief.test.js tests/defect-045-skill-match.test.js tests/skill-topics.test.js tests/skill-registry.test.js` passes.
- Every case of scenario 8 of the spec is in the new file: the three positives and the negatives for `pxl`, `new-harness` and `artificial-analysis`. If a spec case does not hold under the rule as written, say which and do not change the rule: it is the Lead's decision.

### Task 10: The matching project skills reach delegates and plan units

**Aether:**
- Area: skills
- Owns: `plugins/aether/lib/skill-brief.js`, `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/plan-compile.js`, `tests/delegate-skills.test.js`, `tests/aether-plan-skills.test.js`, `tests/plan-compile-env.test.js`, `tests/defect-045-skill-delivery.test.js`, `tests/skill-brief.test.js`, `tests/new-skills.test.js`
- Depends on: Task 9 — it extends `lib/skill-brief.js` after the matcher is rewritten
- Depends on: Task 5 — it also edits `lib/plan-compile.js`, which Task 5 changes for `USAGE`
- Serves: R18, R19, R21

**Interfaces:**
- `lib/skill-brief.js`, two new exports:
  - `projectSkillRoots(cwd, { dataDir, home })` → the folders that hold project skills, in order: the integration tree (`git rev-parse --show-toplevel`), the main checkout (both as `getProjectRoots` returns them, which is `[cwd]` when `cwd` is not in a git repository), and the project root of every path of `<data dir>/skills/installs.jsonl` (`readInstalls`) whose record belongs to this repository (`canonicalRepo`) and whose folder still exists: for a recorded path `<root>/.agents/skills/<name>` or `<root>/.claude/skills/<name>` the root is `<root>`. `listProjectSkills` and `resolveSkill` read these roots, so a skill installed without a commit in a linked worktree reaches a compile in another worktree.
  - `selectSkills({ cwd, manual = [], text: { prompt, description, owns }, home, pluginRoot, dataDir })` → `{ ok: true, skills }` or `{ ok: false, error }`. The manual names (`AETHER-SKILLS:` of a delegate, `Skills:` of a task) come first and keep their strict validation (a missing or invalid manual skill is `{ ok: false, error }` as `loadSkills` returns today, and more than 3 manual names is the same error). Then the automatic matches of `matchDelegateSkills`, not already chosen, fill the free places up to 3 skills in all and 1,500 lines in all (`MAX_TOTAL_LINES`); an automatic skill that cannot be read, has an invalid `SKILL.md` (`checkSkillFile`), exceeds 500 lines or would exceed the total is skipped without aborting.
- `lib/delegate-task.js` `begin`: the skills are `selectSkills({ manual: brief.skills, … })` of the task's description, prompt and `AETHER-OWNS`; their text is injected into the prompt the delegate receives, on Claude and on another harness, as today for manual skills (`skillsSection`); `launch.skills` and the `uses.jsonl` record (`kind: 'delegate'`) carry the names. The `delegate-skill` notice (`add AETHER-SKILLS: …`) and its `recordNotice` are no longer emitted for skills that were delivered. A task that matches nothing is unchanged (no `skills`, `plan.args.prompt` undefined). This replaces the expectations of `tests/delegate-skills.test.js:98-101` and `:134-136`.
- `lib/plan-compile.js` `compile`: each unit's skills are `selectSkills({ manual: t.skills, … })` over the task's text and its `Owns`, using `projectSkillRoots`; the content goes in the compiled brief (`renderBrief`'s `skills`) and a `uses.jsonl` record (`kind: 'run'`) is written; a plan with no `Skills:` still compiles. `aether-plan check` keeps its errors for a `Skills:` line that names a missing skill or more than 3.

**Tests (write first):**

New file `tests/defect-045-skill-delivery.test.js`. It copies the fixtures of `tests/delegate-skills.test.js` that it needs (`world`, `call`, `entries`, `uses`, and the requires of `task`, `log`, `reg` = `skill-registry.js`, `makeRepo` and `tempDir`; a test file exports nothing) and does **not** reuse that file's `skill(root, name, body)`: its signature is positional and its description is fixed to `Use for the work.`, which matches nothing. The new file defines its own `writeSkill(root, name, description, body = 3)` that writes `.agents/skills/<name>/SKILL.md` with that `description` in the front matter. `world(t)` is synchronous and its `cwd` is a plain temporary folder (not a repository), which `getProjectRoots` accepts; the cases that need a repository set `w.deps.cwd = makeRepo(t).dir` as the existing cases do. `begin` is async: every case is an `async` function that awaits it.

```js
test('R18: begin hands a matching project skill to the delegate by itself and records it', async (t) => {
  const w = world(t)
  writeSkill(w.cwd, 'pxl', 'Use when working with pxl: writing or editing a .px.js animation or a GIF.')
  const plan = await task.begin(call('AETHER-TASK: p1\nAETHER-OWNS: assets/brand/gifs/walk.px.js\nAdjust the walk cycle.'), w.deps)
  assert.ok(plan.args.prompt.includes('## Skills for this task') && plan.args.prompt.includes('### pxl'))
  assert.deepEqual(entries(w.dataDir, 'p1').find((e) => e.kind === 'launch').skills, ['pxl'])
  assert.deepEqual(uses(w.dataDir).map((u) => [u.kind, u.task, u.skills]), [['delegate', 'p1', ['pxl']]])
  assert.deepEqual(reg.readNotices(w.dataDir), [], 'no delegate-skill notice for a skill that was delivered')
})
test('R18: an unrelated task gets no skill and its call is unchanged', () => {})           // 'Update the parser of JSON in src/json.js' + a pxl skill
test('R18: more than 3 matches attach 3, in the deterministic order of the matcher', () => {})
test('R18: the content reaches an external harness prompt too', () => {})                   // the externalPrompt written to the brief file contains '### pxl'
test('R21: an automatic skill with a corrupt SKILL.md or more than 500 lines is skipped and the launch goes on', () => {})
test('R21: the 1,500-line total drops the skill that would exceed it, never aborts', () => {})
test('R21: a manual AETHER-SKILLS name keeps priority and automatic matches fill the free places', () => {})
test('R21: a manual skill that does not exist or is invalid is still rejected as today', () => {})
test('R19: compile hands the skills to a unit with no Skills: line and records the use', () => {})   // aether-plan compile on a temp repo; brief of task-1 contains '### <skill>'; uses.jsonl has kind 'run'
test('R19: a skill installed without a commit in linked worktree A reaches a compile in integration worktree B, by match and by a Skills: line', async (t) => {
  // makeRepo; git worktree add A and B; put .agents/skills/gdscript-helper in A (not committed), described as
  // 'Use for .gd files of the game: GDScript helpers'; reg.recordInstall(dataDir, { time: 1, session: 's1',
  // source: 'vercel-labs/agent-skills', scope: 'project', repo: <repo.dir>, name: 'gdscript-helper',
  // path: <A>/.agents/skills/gdscript-helper, hash: reg.computedHash(<that folder>) }); compile in B a plan whose
  // task-1 owns 'game/player.gd' (auto) and whose task-2 says 'Skills: gdscript-helper' (manual); both briefs carry the skill
})
test('R19: an install record whose folder is gone is ignored', () => {})
```

Update `tests/delegate-skills.test.js` lines 98-101 and 134-136 to the new behaviour (the notice and the unchanged prompt are replaced by the delivered skill); keep its other cases, `tests/aether-plan-skills.test.js`, `tests/plan-compile-env.test.js` and `tests/new-skills.test.js` green.

**Acceptance:**
- `node --test tests/defect-045-skill-delivery.test.js tests/delegate-skills.test.js tests/aether-plan-skills.test.js tests/plan-compile-env.test.js tests/skill-brief.test.js tests/new-skills.test.js tests/compile-run-launches.test.js` passes.
- A launch never fails because of an automatic skill; a manual skill that is missing still fails it as today.

### Task 11: Search, review and byte-for-byte install of skills for `/aether:design`

**Aether:**
- Review: xhigh — it downloads code from the internet and installs it in the project: a mistake would install an unreviewed or hostile skill, or write outside the project (security)
- Area: skills-design
- Owns: `plugins/aether/lib/skill-design.js`, `plugins/aether/lib/skill-install.js`, `plugins/aether/agents/skill-reviewer.md`, `plugins/aether/bin/aether-plan`, `docs/reference/components.md`, `tests/skill-design.test.js`, `tests/skill-install.test.js`, `tests/defect-045-skill-agent.test.js`, `tests/components-docs.test.js`, `tests/agents.test.js`, `tests/docs-facts.test.js`, `tests/helpers.js`
- Depends on: Task 5 — `bin/aether-plan` is edited by Task 5 first
- Depends on: Task 8 — `docs/reference/components.md` is edited by Task 8 first
- Serves: R22, R23, R24, R25, R27

**Interfaces:**
- The verb, in `bin/aether-plan` (dispatch only, after Task 5; the shared `USAGE` of `plan-compile.js` is not changed, because Task 10 owns that file: a bad `skills` call prints its own line `usage: aether-plan skills find <feature> | aether-plan skills install <feature> <id> | aether-plan skills discard <id>` as `{ ok: false, errors: [<that line>], warnings: [] }` with exit 1): `aether-plan skills find <feature>`, `aether-plan skills install <feature> <id>` and `aether-plan skills discard <id>`, each printing one JSON line and exiting 0 (a search that fails is `ok: false` with `errors`, never a crash). `<feature>` is `specs/NNN-<topic>`; `<id>` is `[a-z0-9]+(-[a-z0-9]+)*`, never a path.
- `lib/skill-design.js` (new, family `skill`): `findForDesign({ cwd, feature, home, dataDir, env, runner, config, now })` →
  `{ ok, topics: [id], candidates: [{ id, topic, name, source, author, hash, dir, code: { ok: true } }], rejected: [{ name, source, topic, reasons: [] }], pending: [{ source, author, topic }], errors: [] }`, and `installForDesign`, `discardForDesign`, `main(argv, { cwd, stdout, env })`. Rules:
  1. **Topics** (R22): a topic of `config/skills.json` `topics` is active only when one of its `words` appears, as a whole word or its plural (lowercased, accents folded), in `<feature>/intent.md`. Repository files and dependencies never activate one; a `topic-search` notice already emitted does not suppress it.
  2. **Covered** (R22): a topic is covered when an installed skill with valid metadata — in `.agents/skills/` or `.claude/skills/` of the project, in `~/.agents/skills/` or `~/.claude/skills/` of the owner (`home`), or registered in `installs.jsonl` — has the topic's `id` or one of its `skillKeywords` as a whole word (or plural) in its `name` or `description` (reuse `installedBlobs` and `topicCovered` of `lib/skill-topics.js`). A covered topic is not searched, installed or duplicated, and not searched twice in a run.
  3. **Search** (R22): `<bin> find <query>` where `<bin>` is `npx skills@1.9.0`, or the executable named by `AETHER_SKILLS_BIN` in tests, and `<query>` is `topic.query` of the config or else `topic.label`, else `topic.id` with spaces. Read, without ANSI colours, each `owner/repo@skill` token of the output as source `owner/repo` and name `skill`; an output with none is an invalid response. A candidate is relevant only if it has a name and source, its name or its returned description has the topic's `id` or a `skillKeyword` as a whole word (or plural), and it does not duplicate an installed skill or a topic covered in the run. A search timeout, process error, no network or invalid response is recorded in `errors` and the topic is skipped.
  4. **Trust** (R23, R24): the author is the part of the source before `/`. Only an author listed in `<data dir>/skills/trusted.json` (`readTrusted`; do not add authors) is fetched. Any other candidate, or one with no identifiable author (a URL or a local path), is not downloaded: it is appended to `.aether/pending.jsonl` (`appendPending`) with class `skill-install`, the source and author, the suggested command `npx skills@1.9.0 add <source> --skill <name>` and the reason `author not in trusted.json`, with no duplicate entry for the same source, and listed in `pending`.
  5. **Download once** (R23): for a trusted candidate, `skill-install.js` `fetchForReview({ source, name, env, runner, dataDir })` runs `<bin> add <source> --skill <name>` once with a new temporary folder under `<data dir>/skills/review/<id>/` as its working directory (never the project, never `-g`), finds the downloaded `<id>/.agents/skills/<name>/`, computes its SHA-256 (`computedHash`), and writes `<review>/review.json` `{ feature, topic, name, source, author, hash }`. Nothing runs a second download after the review. The call gets no input (`stdin` ignored, so a prompt of the CLI cannot wait for an answer: it ends by the time limit as a recorded failure) and a time limit of its own, runs without `-y` or any option the plan does not name, and is a failure (`errors`, the candidate skipped) when `<review>/.agents/skills/<name>/` does not exist afterwards.
  6. **Code stage** (R23 a, b, c), `codeReview(dir, { topic, installedNames })` → `{ ok, problems }`, before any model: (a) no `SKILL.md`; `checkSkillFile` problems (`name` invalid or different from the folder, `description` missing or over 1,024 characters, over 500 lines); a file that is unreadable or binary or not UTF-8; a symlink that leaves the skill folder; a path with `..`; (b) a file that reads or writes credentials or secrets (`.env`, `~/.ssh`, `~/.aws`, key or token files), touches `.claude/settings.json`, `.claude/hooks`, `trusted.json`, `grants.json` or `run.json`, asks for a global install (`-g`, `--global`, `~/.agents/skills`, `~/.claude/skills`), downloads and executes remote code (`curl` or `wget` piped to a shell, `eval` of remote input) or exfiltrates repository data, or instructs to evade protections (`--no-verify`, `bypassPermissions`, skipping `aether-guard` or `aether-autonomy`); (c) its `SKILL.md` does not match the topic (`id` or a `skillKeyword`) or duplicates an installed skill or a covered topic. A failing candidate is deleted at once (the review folder goes) and listed in `rejected` with its reasons.
  7. **Caps** (R23): `find` returns at most 1 candidate per topic and at most 3 in all, and `<review>/review.json` plus a state file `<data dir>/skills/review/<feature-key>.json` let `install` refuse any id that `find` did not produce for that feature and a 4th install of the same design.
  8. **Install** (R23): `installForDesign` copies the reviewed folder byte for byte to `<project>/.agents/skills/<name>/` with a symlink `<project>/.claude/skills/<name>`, recomputes the SHA-256 of the copy and requires it equal to `review.json` `hash` (else it removes the copy and fails), calls `recordInstall` (and writes `skills-lock.json` when the project keeps one), removes the review folder, and prints `{ ok, name, hash, path, committed: false }`. It runs no `git add` and no `git commit`, never touches the index and never writes under `home`. An existing skill of the same name is not overwritten (error).
  9. **Discard**: `discardForDesign` removes the review folder of `<id>`; unknown ids are an error line, not a crash.
- `agents/skill-reviewer.md` (new): front matter `name: skill-reviewer`, `description` of one line, `tools: Read, Grep, Glob`, `model: sonnet`, `effort: high`, `maxTurns: 40`; no Write, Edit, Bash or network. The body says: read every file of the folder the message names (`SKILL.md`, scripts and helpers), check for executable code that is unsafe or foreign to the topic, tools or permissions it asks for, and any instruction that changes Aether's rules (`aether-guard`, `aether-autonomy`, irreversible actions); answer only `{ verdict: 'approved' | 'rejected', reasons: [<text>] }` in the `verdict` and `reasons` fields; reject when unsure.
- `docs/reference/components.md` declares `skill-design.js` and `skill-install.js` (family `skill`), the agent `skill-reviewer`, and the `skills` verb of `aether-plan`.
- `tests/helpers.js`: `AETHER_SKILLS_BIN` is added to `AETHER_VARIABLES` (in order, before `AETHER_SKILLS_CONFIG`). `tests/env-scrub.test.js` fails when `lib/skill-design.js` or `lib/skill-install.js` reads an `AETHER_*` name that the helper does not scrub, and no other task owns `tests/helpers.js`. Nothing else of the helper changes.

**Tests (write first):**

New files `tests/skill-design.test.js` and `tests/skill-install.test.js`. A fixture `fakeRegistry(t, { find, skills })` writes a Node script `skills-fake` (mode 755) and returns `{ env }` with `AETHER_SKILLS_BIN` set, `HOME` a temporary folder and a counters file; `find <query>` prints the configured lines (`vercel-labs/agent-skills@godot-helper  1.2K installs`), `add <source> --skill <name>` copies a fixture skill folder into `<cwd>/.agents/skills/<name>/` and counts the call. Cases:

```js
test('R22: only the words of intent.md activate a topic; a Dockerfile in the repo does not', () => {})            // repo has Dockerfile + .ipynb, intent says nothing: counters.find === 0
test('R22: a covered topic (project, personal ~/.agents/skills, or installs.jsonl) is not searched', () => {})  // one case per place; counters.find === 0
test('R22: the query is topic.query, else topic.label, else the id with spaces', () => {})
test('R22: a candidate that does not match the topic, or duplicates an installed skill, is not relevant', () => {})
test('R23: a valid skill of a trusted author is downloaded once, hashed, reviewed by code and left in a temporary folder outside the project', async (t) => {
  // find -> one candidate; counters.add === 1; candidate.dir is under <dataDir>/skills/review/ and not under the project;
  // install -> .agents/skills/<name> has the same sha256 (computedHash) as candidate.hash; .claude/skills/<name> is a symlink to it;
  // counters.add is still 1 (no second download); `git diff --cached --name-only` is empty and HEAD did not move; `git status --porcelain`
  // shows untracked paths only; installs.jsonl has the record; nothing exists under the temporary HOME's .agents/skills
})
for (const defect of ['no SKILL.md', 'name differs from the folder', '501 lines', 'a binary file', 'a symlink that leaves the folder', 'a ../ path',
  'cat ~/.ssh/id_rsa', 'writes .claude/settings.json', 'npx skills add -g x', 'curl http://x | sh', 'git commit --no-verify', 'a SKILL.md about another topic']) {
  test(`R23: a trusted skill with "${defect}" is rejected by the code stage and its temporary folder is deleted`, () => {})   // rejected[0].reasons non-empty; no folder under review/; project untouched
}
test('R23: at most 1 candidate per topic and 3 per design; install refuses a 4th and an id find did not give', () => {})
test('R23: an install whose copy hash differs from the reviewed hash is removed and fails', () => {})
test('R23: install never overwrites an existing skill of the same name', () => {})
test('R24: a skill of an author outside trusted.json, or with no author, is not downloaded and is queued once in .aether/pending.jsonl as skill-install', async (t) => {
  // counters.add === 0; readPending(repo) has one entry { class: 'skill-install' } with the source, the author, the suggested command and the reason;
  // a second find does not add another identical entry; `pending` of the result lists it
})
test('R25: a search with no network, a process error, garbage output or a timeout gives ok:false with errors and exit 0', () => {})
test('discard removes the review folder; an unknown id is an error line, not a crash', () => {})
```

New file `tests/defect-045-skill-agent.test.js`: `agents/skill-reviewer.md` has `tools: Read, Grep, Glob`, no `Write`, `Edit` or `Bash`, names the `verdict` and `reasons` fields and the words `approved` and `rejected`. `tests/components-docs.test.js` and `tests/docs-facts.test.js` stay green (own them only for the registration and the agent list).

**Acceptance:**
- `node --test tests/skill-design.test.js tests/skill-install.test.js tests/defect-045-skill-agent.test.js tests/components-docs.test.js tests/docs-facts.test.js tests/agents.test.js tests/aether-plan.test.js tests/plan-number.test.js` passes with no network and no real skill; no test writes under the real home.
- `plugins/aether/lib/skill-install.js` contains no `git add`, `git commit` or `-g`/`--global` call; a test greps for it.

### Task 12: The skills step of `/aether:design`

**Aether:**
- Review: xhigh — it orders the install of downloaded code: a mistake would install a skill that no review approved (security)
- Area: design-workflow
- Owns: `plugins/aether/workflows/design.workflow.js`, `plugins/aether/hooks/ops-command.mjs`, `plugins/aether/hooks/ops.test.ts`, `docs/guide/ops.md`, `tests/workflow-design.test.js`, `tests/ops-command-design.test.js`, `tests/ops-command.test.js`, `tests/defect-045-skills-step.test.js`
- Depends on: Task 7 — same workflow file and `tests/workflow-design.test.js`
- Depends on: Task 11 — the verb it orders and the `skill-reviewer` agent
- Depends on: Task 5 — same `hooks/ops-command.mjs`
- Serves: R22, R23, R24, R25

**Interfaces:**
- `hooks/ops-command.mjs`: three new forms for `aether-plan`, each one check per token: `[word('skills'), word('find'), is(FEATURE)]`, `[word('skills'), word('install'), is(FEATURE), is(SKILL_ID)]` and `[word('skills'), word('discard'), is(SKILL_ID)]`, with `FEATURE = /^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*$/` and `SKILL_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/`. No flag, no path.
- `workflows/design.workflow.js`: `async function skillsStep()` called once in `full()`, after the spec is approved and before `planMap()`. In the workflow the feature folder is the constant `feature` (the name `FEATURE` there is the regular expression that validates it, line 35: never use it in a command):
  1. `ops('aether-plan skills find ' + feature, { phase: 'Plan', label: 'skills: find' })`. When it does not run (`{ error }`), or answers `ok: false`, or answers a list of `errors`, `log('skills: <reason>; the design goes on')` and the step ends with what it has (never `failure(...)`).
  2. For each candidate with `code.ok` (at most 1 per topic and 3 per design): `call('skill-reviewer', SKILL_REVIEW_PAIR.model, SKILL_REVIEW_PAIR.effort, skillReviewMessage(candidate), { phase: 'Plan', label: 'skills: review <name>', schema: SKILL_REVIEW_SCHEMA })`, with `SKILL_REVIEW_PAIR = { model: 'sonnet', effort: 'high' }` and `SKILL_REVIEW_SCHEMA` requiring `verdict` (`approved` | `rejected`) and `reasons` (array of strings). The message names the review folder (`candidate.dir`) and the topic.
  3. `approved` only when the answer fits the schema (`fits(SKILL_REVIEW_SCHEMA, answer)`) and its `verdict` is `approved`: `ops('aether-plan skills install ' + feature + ' ' + candidate.id, …)`. `rejected`, `null`, an invalid answer or a failed call: `ops('aether-plan skills discard ' + candidate.id, …)` and `log('skills: <name> rejected: <reasons>')`. A failed install or discard is logged and the candidate is listed in `rejected` with the reason.
  4. The step sets one module-level `let skills = null` (declared next to the other state of the run) to `{ installed: [{ name, topic, hash, path, committed: false }], rejected: [{ name, reasons }], pending: [{ source, author }] }`, always with the three lists (empty when the search found nothing or failed), and the log says that an installed skill is not committed. The workflow's final `return` adds `...(skills === null ? {} : { skills })`, so **every result that follows the step carries `skills`**: `approved`, a plan or exam `dispute`, any `failed` after the step (`plan-writer`, `plan-check`, a plan review) and the exam's stop, because the skills are already in the project when the design ends without approval. A result that ends before the step (`clarify`, a failed or disputed spec) and a short design have no `skills` key.
  A short design (`mode === 'short'`) never runs the step. Everything else of the flow, its order and its result shape stay as they are, with `skills` the only new key.
- `docs/guide/ops.md` lists the three new forms.

**Tests (write first):**

New file `tests/defect-045-skills-step.test.js` and cases in `tests/workflow-design.test.js`, with that file's harness (`runWorkflow` from `tests/workflow-harness.js`, with the `go(args, overrides)`, `handlers()`, `commandOf`, `ARGS` and `FEATURE = 'specs/007-demo'` of `tests/workflow-design.test.js`; copy what the new file needs, a test file exports nothing). Three changes to that harness in `tests/workflow-design.test.js`, which this task owns: (1) `ROLES` gains `'skill-reviewer'` (the harness refuses an `aether:` agent type that is not listed); (2) the default `ops` of `handlers()` answers `aether-plan skills find` (verb `skills`, `rest[0] === 'find'`) with `{ ok: true, topics: [], candidates: [], rejected: [], pending: [], errors: [] }`, so that every existing case stays green and `skills` is three empty lists in their result, and still throws for `install` and `discard`; (3) a test that scripts the step overrides `ops` with `(call, fallback) => …` and `'skill-reviewer'` with `(call) => …`, as the existing cases do (a handler returns the answer; a handler that throws makes the call end without an answer). The fields of `installed` come from two places: `name`, `hash` and `path` from the answer of `aether-plan skills install` (T11 prints `{ ok, name, hash, path, committed: false }`), and `topic` from the candidate that was installed (`candidate.topic`). An ops call is read through `call.command` (`verb`, `rest`, `line`: for `aether-plan skills find specs/007-demo` the verb is `skills`, `rest` is `['find', 'specs/007-demo']` and `line` is the whole command), and the calls of a run are `run.calls`, each with `role`, `label`, `command` (null for a native agent) and `prompt`.

```js
const FIND = (candidates, extra = {}) => ({ ok: true, topics: ['godot', 'containers'], candidates, rejected: [], pending: [], errors: [], ...extra })
const godot = { id: 'godot-helper-1a2b', topic: 'godot', name: 'godot-helper', source: 'vercel-labs/agent-skills', author: 'vercel-labs', hash: 'h1', dir: '/data/skills/review/godot-helper-1a2b', code: { ok: true } }
const docker = { id: 'dockerfile-3c4d', topic: 'containers', name: 'dockerfile', source: 'anthropics/skills', author: 'anthropics', hash: 'h2', dir: '/data/skills/review/dockerfile-3c4d', code: { ok: true } }
const skillsOps = (find) => (call, fallback) => {
  if (call.command.verb !== 'skills') return fallback(call)
  const what = call.command.rest[0]
  const id = call.command.rest.at(-1) // `install <feature> <id>` and `discard <id>` both end with the id; `find <feature>` ends with the folder, unused
  if (what === 'find') return find
  if (what === 'install') return { ok: true, name: id.replace(/-[0-9a-f]{4}$/, ''), hash: 'h1', path: `/repo/.agents/skills/${id}`, committed: false }
  return { ok: true }
}
const reviewByName = (verdicts) => (call) => verdicts[call.label.replace('skills: review ', '')]

test('R22/R23: find runs after the spec is approved and before requirements; an approved candidate is installed, a rejected one is discarded', async () => {
  const run = await go(ARGS, {
    ops: skillsOps(FIND([godot, docker], { pending: [{ source: 'someone/else', author: 'someone' }] })),
    'skill-reviewer': reviewByName({ 'godot-helper': { verdict: 'approved', reasons: [] }, dockerfile: { verdict: 'rejected', reasons: ['a script calls curl | sh'] } }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const lines = run.calls.filter((c) => c.command).map((c) => c.command.line)
  assert.ok(lines.indexOf(`aether-plan skills find ${FEATURE}`) !== -1)
  assert.ok(lines.indexOf(`aether-plan skills find ${FEATURE}`) < lines.indexOf(`aether-plan requirements ${FEATURE}/spec.md`))
  assert.ok(lines.includes(`aether-plan skills install ${FEATURE} godot-helper-1a2b`))
  assert.ok(lines.includes('aether-plan skills discard dockerfile-3c4d'))
  assert.equal(lines.includes(`aether-plan skills install ${FEATURE} dockerfile-3c4d`), false)
  assert.deepEqual(run.result.skills.installed.map((s) => s.name), ['godot-helper'])
  assert.deepEqual(run.result.skills.rejected.map((s) => s.name), ['dockerfile'])
  assert.deepEqual(run.result.skills.pending, [{ source: 'someone/else', author: 'someone' }])
  assert.equal(run.result.status, 'approved')
})
test('R23: the installed skill is reported on a design that ends failed or in dispute after the step', async () => {
  // the same candidates and verdicts as above; the plan check answers { ok: false, errors: ['x'] } twice (override ops
  // for verb 'check', falling back to skillsOps for 'skills'): the result is status 'failed' at step 'plan-check' and
  // run.result.skills.installed.map(s => s.name) is ['godot-helper']; a second run whose plan Judge answers a
  // 'dispute'-shaped result of the harness (see the existing dispute cases) has status 'dispute' and the same skills.
  // A spec that ends 'clarify' has no `skills` key (assert Object.hasOwn(run.result, 'skills') === false).
})
test('R23: a reviewer that ends without an answer, answers something invalid or throws rejects the skill (fail closed)', async () => {
  // 'skill-reviewer' handlers: () => null, () => ({ verdict: 'maybe', reasons: [] }), () => { throw new Error('boom') }:
  // in each run no `skills install` command is issued, a `skills discard` for the candidate is, and skills.rejected has it
})
test('R25: find that does not run, answers ok:false or has errors is logged and the design still completes spec, plan, tasks and exam', async () => {
  // ops override: find -> { error: 'no network' }, then { ok: false, errors: ['boom'] }, then FIND([], { errors: ['timeout'] }):
  // run.result.status === 'approved' each time, and run.result.skills is three empty lists
})
test('R22: a short design never runs the skills step', async () => {
  // go(SHORT): no ops call with verb 'skills' and no `skills` key in the result (SHORT is the constant of the test file)
})
test('R23: the step asks for at most 3 reviews and installs', async () => {
  // FIND with 5 candidates all code.ok: at most 3 'skill-reviewer' calls and at most 3 install commands
})
```

In `tests/ops-command-design.test.js`: `parseOpsPrompt` accepts `aether-plan skills find specs/045-x`, `aether-plan skills install specs/045-x godot-helper-1a2b` and `aether-plan skills discard godot-helper-1a2b`, and refuses a path as an id (`../x`), an id with uppercase or a slash, a missing id, an extra flag and `aether-plan skills find ../x`. `hooks/ops.test.ts` gets one mod case that answers `aether-plan skills find` without a model call.

**Acceptance:**
- `node --test tests/defect-045-skills-step.test.js tests/workflow-design.test.js tests/ops-command-design.test.js tests/ops-command.test.js tests/docs-facts.test.js` passes, and `npm run test:mod` passes with the new mod case.
- The only new key of a result is `skills`, present on every result that follows the step (`approved`, dispute, `failed` after the step, the exam's stop) and absent before it and in a short design; a design with no search result has `skills` with three empty lists.

### Task 13: Decisions A134 to A136, A132 updated, and the documents that repeat the rules

**Aether:**
- Area: docs-decisions
- Owns: `docs/decisions.md`, `docs/index.md`, `docs/guide/delegates.md`, `docs/guide/troubleshooting.md`, `docs/guide/observe.md`, `AGENTS.md`, `plugins/aether/skills/using-aether/SKILL.md`, `tests/docs-032.test.js`, `tests/docs-facts.test.js`, `tests/decision-044.test.js`, `tests/delegates-docs.test.js`, `tests/review-verdict-rule.test.js`, `tests/using-aether-030.test.js`, `tests/session-start-parts.test.js`, `tests/defect-045-docs.test.js`
- Depends on: Task 1 — same `skills/using-aether/SKILL.md` and `tests/review-verdict-rule.test.js`
- Depends on: Task 3 — it documents the behaviour Task 3 builds
- Depends on: Task 8 — it documents how Muse is read
- Depends on: Task 10 — it documents the delivery of skills
- Depends on: Task 12 — it documents the skills step of the design
- Serves: R11, R12, R17, R26, R27, R28, R29

**Interfaces:**
- **The sentence S** (R29), identical in `docs/guide/delegates.md`, `AGENTS.md`, the paragraph `**The verdict.**` of `skills/using-aether/SKILL.md` and the entry A132 of `docs/decisions.md`: `An answer the harness reports as cut off or refused (a stop reason other than `end_turn`) stays pending for `aether-delegate verdict`.` Each file keeps **its own** sentence about the read-only close word for word, because the four do not share one: only `using-aether/SKILL.md` has the exact `A read-only delegate whose checks pass is closed by the system when it answers`, and `tests/review-verdict-rule.test.js:35` and `tests/using-aether-030.test.js:117` pin that file's whole sentence, up to its final period. S goes right after the sentence that holds it:
  - `skills/using-aether/SKILL.md`, `**The verdict.**`: after `A read-only delegate whose checks pass is closed by the system when it answers; if its answer is wrong, `verdict --verdict fix|infeasible` reopens it; when a check fails on files another writer changed, `verdict --verdict approve --ignore '<glob>'`.`, before ``fix` and `infeasible` stay on that line for an edit too.`
  - `docs/guide/delegates.md`, the paragraph that has `A read-only delegate whose checks pass is closed by the system as approved when it answers, without a verdict;`: S after that paragraph's last sentence (`…still approves.`). The bullet that starts `A verdict through `aether-delegate verdict` is what counts` (line 157) is not changed.
  - `AGENTS.md`, the Delegates bullet: after the sentence that ends `an `approve` with a failed check is refused.`, before `Every delegate starts on Haiku`.
  - `docs/decisions.md`, A132: in the dated update below.
- **A132** gets a dated update (`2026-11-17`, citing «Trabaja autonomamente en hacer los de fallos.») with S, the note that `agy`, `codex` and `muse` report no stop reason, so a cut or refusal there is still closed by the system (a hole the owner decides, by changing A132 or waiting for those harnesses to report the field), and the exact statement of what `approve` does: the verdict's checks run before the merge only for a task that named `AETHER-TESTS`; `approve` merges and then runs the tests, keeping the merge when they fail (finding 21). The decision is not reverted.
- **New rows, from A134:** A134, amendment of A124 clause (5) (the Examiner's `maxTurns` is no longer 40 but 80, the Writer's no longer 60 but 100, by spec 044), citing «yo digo que subas los turnos» (finding 22), and the record that the code-map step runs on native Haiku with no external seat (finding 29); A135, amendment of A129: Muse is read over `muse serve` (`model/list`) with no model call and no quota, last in the round, citing «Sí, una sola consulta `model/list` a la versión instalada (1.4.23), sin prompt, para confirmar que no gasta cuota. Si gastara, esa parte se detiene y queda en la lista del dueño.» and the query's result of 2026-11-17; A136, amendment of A125 clause (2) for the automatic delivery of skills to delegates and units and for the search, review and install in `/aether:design`, citing «Repartir e instalar» and «nuevamente no veo que el lead instale skills por su propia cuenta», with: trusted authors only, project only and not committed, 1 per topic and 3 per design, topics only from `intent.md` against the six of `config/skills.json`.
- `docs/index.md`, `tests/docs-032.test.js` (line 23) and `tests/docs-facts.test.js` (line 852): `A1–A133` becomes `A1–A136`.
- `docs/guide/troubleshooting.md`: the sentence about `Quota unavailable` says `below`, links `#the-harnesses-panel-says-quota-unavailable-or-enabled-not-installed`, and tells `enabled, not installed` (CLI missing) from `Quota unavailable` (CLI present, no reading); the sentence `Muse has no capture means without a model call and is never read` is replaced by one that says Muse is read over `muse serve` (`model/list`) with no model call and no quota, last in the round (R17).
- `tests/decision-044.test.js`: the evidence of the merge refusal looks for the refusal on a failed check of the verdict (`tests/delegate-approve.test.js`, the case that refuses an `approve` with a failed check) and not only for the words of the command after the merge.
- `docs/guide/observe.md` (line 60): `Muse has no capture means without a model call and is never read, which `/aether:doctor` reports as its reason.` is replaced by `Muse is read over `muse serve` (`model/list`) with no model call and no quota, last in the round, like the other harnesses.` The rest of the sentence (Codex's cache file) does not change.
- `skills/using-aether/SKILL.md`: only S in the verdict paragraph; the parts of the bootstrap stay at most 9,800 characters (shorten a nearby phrase of the same paragraph if needed).

**Tests (write first):**

New file `tests/defect-045-docs.test.js`:

```js
const S = 'An answer the harness reports as cut off or refused (a stop reason other than `end_turn`) stays pending for `aether-delegate verdict`.'
// The sentence each file keeps word for word, and that S follows.
const KEPT = {
  'plugins/aether/skills/using-aether/SKILL.md': "A read-only delegate whose checks pass is closed by the system when it answers; if its answer is wrong, `verdict --verdict fix|infeasible` reopens it; when a check fails on files another writer changed, `verdict --verdict approve --ignore '<glob>'`.",
  'docs/guide/delegates.md': 'A read-only delegate whose checks pass is closed by the system as approved when it answers, without a verdict;',
  'AGENTS.md': 'a read-only delegate whose checks pass is closed by the system as approved when it answers,',
}
const A132_KEPT = 'A read-only delegate whose checks pass is closed by the system as approved, without a verdict.'
test('R29: the exception of R3 is in the four files, each after the sentence it keeps', () => {
  for (const [file, kept] of Object.entries(KEPT)) {
    const text = read(file)
    assert.ok(text.includes(kept), `${file} keeps its own sentence`)
    assert.ok(text.includes(S), `${file} has S`)
    assert.ok(text.indexOf(S) > text.indexOf(kept), `${file}: S comes after the kept sentence`)
  }
  const a132 = row('A132')
  assert.ok(a132.includes(A132_KEPT), 'A132 keeps its title sentence')
  assert.ok(a132.includes(S) && a132.indexOf(S) > a132.indexOf(A132_KEPT))
  assert.ok(a132.includes('2026-11-17') && a132.includes('Trabaja autonomamente en hacer los de fallos.'))
  assert.ok(/agy.*codex.*muse/s.test(a132) && a132.includes('owner'))
})
test('R29: the sentence that tests pin in using-aether is whole, with S after it and not inside it', () => {
  const using = read('plugins/aether/skills/using-aether/SKILL.md')
  assert.ok(using.includes(KEPT['plugins/aether/skills/using-aether/SKILL.md'] + ' ' + S))
})
test('R11: A132 says what approve does before and after the merge', () => { /* a132 includes AETHER-TESTS and 'keeping the merge' */ })
test('R12/R11: A134 amends A124 clause 5 with the owner words and records the Haiku map', () => {
  const a = row('A134')
  for (const t of ['A124', 'yo digo que subas los turnos', '100', '80', 'Haiku']) assert.ok(a.includes(t), t)
})
test('R17: A135 amends A129 and troubleshooting says Muse is read over muse serve', () => {
  const a = row('A135')
  for (const t of ['A129', 'muse serve', 'model/list', 'Sí, una sola consulta']) assert.ok(a.includes(t), t)
  const page = read('docs/guide/troubleshooting.md')
  assert.equal(page.includes('Muse has no capture means without a model call and is never read'), false)
  assert.ok(page.includes('muse serve'))
  const observe = read('docs/guide/observe.md')
  assert.equal(observe.includes('Muse has no capture means without a model call and is never read'), false)
  assert.ok(observe.includes('Muse is read over `muse serve` (`model/list`) with no model call and no quota'))
})
test('R11: troubleshooting links to the section below and tells the two marks apart', () => {
  const page = read('docs/guide/troubleshooting.md')
  assert.ok(page.includes('#the-harnesses-panel-says-quota-unavailable-or-enabled-not-installed'))
  assert.equal(/Quota unavailable` line above/.test(page), false)
  assert.ok(page.includes('enabled, not installed') && page.includes('below'))
})
test('R26: A136 amends A125 clause 2 with both owner quotes', () => {
  const a = row('A136')
  for (const t of ['A125', 'Repartir e instalar', 'nuevamente no veo que el lead instale skills por su propia cuenta', 'trusted', 'intent.md']) assert.ok(a.includes(t), t)
})
test('R27: the decision range is A1–A136 in the index and in both pins', () => {
  for (const f of ['docs/index.md', 'tests/docs-032.test.js', 'tests/docs-facts.test.js']) assert.ok(read(f).includes('A1–A136'), f)
})
test('R28: the hole of agy, codex and muse is written down for the owner', () => { /* a132 and A134..A136 mention it as the owner's decision, not as fixed */ })
```

(`row(id)` returns the line of `docs/decisions.md` that starts with `| <id> |`.)

**Acceptance:**
- `node --test tests/defect-045-docs.test.js tests/docs-032.test.js tests/docs-facts.test.js tests/decision-044.test.js tests/delegates-docs.test.js tests/review-verdict-rule.test.js tests/using-aether-030.test.js tests/session-start-parts.test.js tests/components-docs.test.js` passes; the new cases fail before the change.
- Every part of the bootstrap is at most 9,800 characters.
- A132 is not reverted: the sentence each of the four files holds today (see `KEPT` and `A132_KEPT` above) is intact, and S follows it.

### Task 14: The skills and design documents

**Aether:**
- Area: docs-skills
- Owns: `plugins/aether/skills/skills/SKILL.md`, `plugins/aether/skills/designing/SKILL.md`, `docs/guide/project-files-and-skills.md`, `docs/guide/design-seats.md`, `tests/defect-045-skills-docs.test.js`, `tests/designing-skill-043.test.js`, `tests/design-docs-044.test.js`, `tests/project-files-docs.test.js`, `tests/new-skills.test.js`, `tests/docs-030.test.js`, `tests/docs-facts.test.js`, `tests/examiner-order.test.js`
- Depends on: Task 13 — it shares `tests/docs-facts.test.js` with Task 13
- Depends on: Task 10 — it documents the automatic delivery
- Depends on: Task 12 — it documents the skills step of the design
- Serves: R11, R26

**Interfaces:**
- `skills/designing/SKILL.md`, the `approved` bullet with `exam.status: failed` (finding 20): it adds the clause `the workflow already relaunched the Examiner once with the partial tests, so complete the exam yourself from the tests that exist or report it; do not start another Examiner on the same partial` and no longer orders `start the Examiner once more with the criteria that have no test`. The sentence of the bullet after `when every criterion has a test, write `exam.json` from them and run `aether-exam store specs/NNN-<topic>`;` becomes: `when `.aether/exam/` holds tests that do not cover every criterion of the spec, the workflow already relaunched the Examiner once with the partial tests, so complete the exam yourself from the tests that exist or report it; do not start another Examiner on the same partial; if it holds none, start the Examiner once more.` The phrases `exam.status` `failed`, `when every criterion has a test`, `holds tests that do not cover every criterion of the spec`, `aether-exam store specs/NNN-<topic>` and `holds none` stay in the bullet. `tests/examiner-order.test.js` (Task 14's) pins the old order at line 49 (`start the Examiner once more with the criteria that have no test`) and at line 50 (`telling it the folder already holds the others`): the test `the designing skill handles a partial exam when exam.status is failed (#229)` replaces those two assertions with `assert.match(content, /the workflow already relaunched the Examiner once/i)` and `assert.doesNotMatch(content, /start the Examiner once more with the criteria that have no test/i)` and keeps its other assertions unchanged. It also says that `/aether:design` now searches skills of the card's topics, reviews the trusted ones and installs them only in the project without committing, and lists the others for the owner (`skills` field of the `approved` result, `.aether/pending.jsonl` class `skill-install`).
- `skills/skills/SKILL.md`: says the system hands the matching project skills to delegates and to the units of a plan by itself (up to 3, the ones named by hand first), that the notice `add AETHER-SKILLS:` is no longer needed for them, and that `/aether:design` installs reviewed skills of trusted authors in the project (never global, never committed) and leaves the rest on the owner's list. It keeps `npx skills@1.9.0 find` and `add` as the manual path.
- `docs/guide/project-files-and-skills.md` and `docs/guide/design-seats.md`: the same facts, once each, in the page's own style, with no link or anchor that does not resolve.

**Tests (write first):**

New file `tests/defect-045-skills-docs.test.js`:

```js
test('R11: designing/SKILL.md says the workflow already relaunched the Examiner once', () => {
  const text = read('plugins/aether/skills/designing/SKILL.md')
  assert.ok(text.includes('the workflow already relaunched the Examiner once'))
  assert.equal(text.includes('start the Examiner once more with the criteria that have no test'), false)
})
test('R26: the skills pages describe the automatic delivery and the install in /aether:design', () => {
  for (const file of ['plugins/aether/skills/skills/SKILL.md', 'docs/guide/project-files-and-skills.md']) {
    const text = read(file)
    for (const t of ['up to 3', 'trusted', 'not committed']) assert.ok(text.includes(t), `${file}: ${t}`)
  }
  assert.ok(read('plugins/aether/skills/designing/SKILL.md').includes('skill-install'))
  assert.ok(read('docs/guide/design-seats.md').includes('aether-plan skills'))
})
```

**Acceptance:**
- `node --test tests/defect-045-skills-docs.test.js tests/examiner-order.test.js tests/designing-skill-043.test.js tests/design-docs-044.test.js tests/project-files-docs.test.js tests/new-skills.test.js tests/docs-030.test.js tests/docs-facts.test.js tests/session-start-parts.test.js` passes; relative links and anchors of the edited pages resolve.
- Then `npm run check` passes in the branch (`npm test`, `npm run test:mod`, `npm run validate`).
