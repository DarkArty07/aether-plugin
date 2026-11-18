# Tasks 044: design turns, review verdicts and recent failures

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node.js 22, CommonJS, no dependencies. Tests run with `node --test tests/<file>.test.js`; the whole suite is `npm test`. Run a branch's bin by path (`node plugins/aether/bin/aether-plan …`), never the `aether-*` name on `PATH`.
- Test first: write the failing tests of the task, see them fail for the right reason, then change the code. Every requirement that changes code or text has a test that fails without the change (R32).
- The plan (`plan.md`) holds the design; the code map (`.aether/autonomy/auto-20261117-141739-785c/code-map.md`) holds file and line positions, which are reading positions: confirm them before editing. The map missed some pinning tests; each task's Owns lists the ones found.
- A task changes only what its Owns lists. A test that pins old text is changed in the same task as the text, and it is in that task's Owns.
- The threshold for the map step is data in `plugins/aether/config/design.json` (`mapMinRequirements`, 15) and appears nowhere else in code; the Examiner is relaunched once, in total; the Writer's turns are 100 and the Examiner's 80.
- Workflows (`workflows/*.workflow.js`) import nothing and read neither the clock nor the disk; shell steps go to the `aether:ops` agent through the commands `hooks/ops-command.mjs` allows.
- The Lead's rules stay inside the parts of the bootstrap: each part of `skills/using-aether/SKILL.md` is at most 9,800 characters (`tests/session-start-parts.test.js`, issue 139). Measure with `bootstrapParts` after every change to that file.
- No task performs an irreversible action: no push, no merge to `main`, no publish, no version bump, no closing of an issue. The Lead does those.
- Exact text is written in full where it is the requirement; the implementer writes the code.
- Do not write under `specs/` or `.specify/`: the guard refuses it.

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] [US4] Raise the Writer to 100 turns and the Examiner to 80, and give the Writer the two message forms in plugins/aether/agents/writer.md and examiner.md → Task 1
- [ ] T002 [P] [US1] Add the verb `aether-plan requirements`, its threshold datum and its form in the mod in plugins/aether/lib/plan-requirements.js → Task 2
- [ ] T003 [P] [US1] Add the read-only `mapper` agent in plugins/aether/agents/mapper.md → Task 3
- [ ] T004 [P] [US6] Let the reviewer say ready, cap minors at 10 and require a fix in each finding in plugins/aether/agents/reviewer.md → Task 4
- [ ] T005 [P] [US7] Write the Lead's rule for each review verdict and its pointer in plugins/aether/skills/swarm/SKILL.md → Task 5
- [ ] T006 [P] [US10] Do not count a read as a skill install in plugins/aether/lib/guard.js → Task 6
- [ ] T007 [P] [US7] Fix the direct-path text of the site in site/app.js and site/index.html → Task 7
- [ ] T008 [P] [US11] Rewrite the merge-main refusal in plugins/aether/lib/delegate-approve.js → Task 8
- [ ] T009 [P] [US7] Make quota-brake stop the chains of a continued run in plugins/aether/lib/autonomy-command.js → Task 9
- [ ] T010 [P] [US8] Close a read-only delegate by itself when its checks pass in plugins/aether/lib/delegate-task.js → Task 10
- [ ] T011 [P] [US8] Write the new decision A132 and the sentences that repeat the old rule in docs/decisions.md → Task 11
- [ ] T012 [US7] Correct maintenance.md and troubleshooting.md to what the code does in docs/guide/maintenance.md → Task 12
- [ ] T013 [US1] Add the map step before the plan Writer in plugins/aether/workflows/design.workflow.js → Task 13
- [ ] T014 [US1] Split the native Writer of the plan into two calls in plugins/aether/workflows/design.workflow.js → Task 14
- [ ] T015 [US4] Relaunch the Examiner once when it ends without an answer in plugins/aether/workflows/design.workflow.js → Task 15
- [ ] T016 [US1] Align the design docs with the map, the two calls and the relaunch, and run the final check in skills/designing/SKILL.md → Task 16

### Task 1: Turn caps and the Writer's two message forms

**Aether:**
- Area: design-agents
- Owns: `plugins/aether/agents/writer.md`, `plugins/aether/agents/examiner.md`, `tests/agent-turns.test.js`, `tests/agents.test.js`, `tests/examiner-order.test.js`, `tests/agents-design.test.js`
- Depends on: none
- Serves: R1, R2, R7

**Interfaces:**
- `agents/writer.md` front matter: `maxTurns: 100` (was 60). `agents/examiner.md` front matter: `maxTurns: 80` (was 40). No other front-matter field changes.
- `agents/writer.md` body gains the two single-document forms of the message (the one-call form stays as it is). The text states, in these words:
  - `When the message asks only for plan.md, write plan.md, commit it, do not touch tasks.md, and answer plan, commit, assumptions, questions and complexity.`
  - `When the message asks only for tasks.md, write tasks.md reading the plan.md already written (its path is in the message), run aether-plan check until it passes, commit it, and answer tasks, commit, check, assumptions and questions.`

**Tests (write first):**

New file `tests/agent-turns.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const text = (name) => fs.readFileSync(path.join(PLUGIN, 'agents', `${name}.md`), 'utf8')

test('R1: the Writer declares maxTurns: 100', () => {
  assert.match(text('writer'), /^maxTurns: 100$/m)
})

test('R2: the Examiner declares maxTurns: 80', () => {
  assert.match(text('examiner'), /^maxTurns: 80$/m)
})

test('R7: the Writer body says what to answer when the message asks for plan.md only, and for tasks.md only', () => {
  const body = text('writer')
  assert.ok(body.includes('When the message asks only for plan.md, write plan.md, commit it, do not touch tasks.md, and answer plan, commit, assumptions, questions and complexity.'))
  assert.ok(body.includes('When the message asks only for tasks.md, write tasks.md reading the plan.md already written (its path is in the message), run aether-plan check until it passes, commit it, and answer tasks, commit, check, assumptions and questions.'))
})
```

Existing tests changed in the same task: `tests/agents.test.js` line 54 (`'60'` becomes `'100'`) and line 93 (`'40'` becomes `'80'`); `tests/examiner-order.test.js` line 12 (rename the test to `the Examiner maxTurns is 80 (#303)` and match `/^maxTurns:\s*80$/m`). Run `tests/agents-design.test.js` and keep it green (the Writer body keeps the scope sentence and every sentence it pins).

**Acceptance:**
- `node --test tests/agent-turns.test.js tests/agents.test.js tests/examiner-order.test.js tests/agents-design.test.js` passes; the three new tests fail before the change.
- `grep -n "maxTurns" plugins/aether/agents/writer.md plugins/aether/agents/examiner.md` prints 100 and 80.

### Task 2: The verb `aether-plan requirements` and its threshold

**Aether:**
- Area: plan-verb
- Owns: `plugins/aether/lib/plan-requirements.js`, `plugins/aether/config/design.json`, `plugins/aether/bin/aether-plan`, `plugins/aether/hooks/ops-command.mjs`, `plugins/aether/hooks/ops.test.ts`, `docs/guide/ops.md`, `docs/reference/components.md`, `tests/plan-requirements.test.js`, `tests/ops-command-design.test.js`, `tests/aether-plan.test.js`, `tests/ops-command.test.js`
- Depends on: none
- Serves: R3

**Interfaces:**
- `plugins/aether/config/design.json`: `{ "mapMinRequirements": 15 }`. The only place of the number 15 in code.
- `plugins/aether/lib/plan-requirements.js` exports `{ countRequirements, loadThreshold, requirementsResult }`:
  - `countRequirements(specText: string): number`, the count of lines that match `/^- R\d+:/gm`.
  - `loadThreshold(configPath?: string): number`, reads `mapMinRequirements` from `config/design.json` (default path: `../config/design.json` relative to the lib); throws a clear error when the file or the key is missing or not a positive integer.
  - `requirementsResult(specText: string, threshold: number): { requirements: number, threshold: number, map: boolean }` with `map = requirements >= threshold`.
- `bin/aether-plan requirements <spec.md>`: read-only; prints one JSON line `{"requirements":N,"threshold":15,"map":true|false}` and exits 0; on a missing file prints `{"ok":false,"errors":[…]}` as the other verbs do and exits 1. The bin only dispatches; the `USAGE` string gains `| aether-plan requirements <spec.md>`.
- `hooks/ops-command.mjs`: the forms of `aether-plan` gain `[word('requirements'), is(SPEC)]`, with `SPEC` matching `^specs/\d{3}-[a-z0-9-]+/spec\.md$` (the same rule as the existing `TASKS`).
- `docs/guide/ops.md` lists the new form; `docs/reference/components.md` lists `plan-requirements.js` among the `plan` family members and `config/design.json` among the configuration data (the registration rule of `.specify/plan-rules.json`). Name the new agent `mapper` in plain text only (not as a code span `aether:mapper`): Task 3 creates it.

**Tests (write first):**

New file `tests/plan-requirements.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, PLUGIN } = require('./helpers.js')
const { countRequirements, loadThreshold, requirementsResult } = require('../plugins/aether/lib/plan-requirements.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-plan')
const spec = (n) => ['# Spec', '', '## Requirements', '', ...Array.from({ length: n }, (_, i) => `- R${i + 1}: requirement ${i + 1}. Serves: C1`), '', '## Assumptions', '  - R99: not a requirement line, it is indented'].join('\n')

test('R3: the threshold is data in config/design.json', () => {
  assert.equal(loadThreshold(), 15)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'design.json'), 'utf8')), { mapMinRequirements: 15 })
})

test('R3: countRequirements counts the lines "- Rn:" and nothing else', () => {
  assert.equal(countRequirements(spec(14)), 14)
  assert.equal(countRequirements('- R1: a\n  - R2: nested\n- C1. a criterion\nR3: no dash\n'), 1)
})

test('R3: requirementsResult is map at the threshold and not below it', () => {
  assert.deepEqual(requirementsResult(spec(14), 15), { requirements: 14, threshold: 15, map: false })
  assert.deepEqual(requirementsResult(spec(15), 15), { requirements: 15, threshold: 15, map: true })
})

test('R3: the verb prints the result of the spec it is given, and writes nothing', (t) => {
  const dir = tempDir(t, 'aether-req-')
  const file = path.join(dir, 'spec.md')
  for (const [n, map] of [[14, false], [15, true]]) {
    fs.writeFileSync(file, spec(n))
    const r = spawnSync(process.execPath, [BIN, 'requirements', file], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(JSON.parse(r.stdout.trim()), { requirements: n, threshold: 15, map })
  }
  assert.deepEqual(fs.readdirSync(dir), ['spec.md'])
})

test('R3: the verb fails with a JSON error on a missing file', (t) => {
  const r = spawnSync(process.execPath, [BIN, 'requirements', path.join(tempDir(t, 'aether-req-'), 'nope.md')], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout.trim()).ok, false)
})

test('R3: the number of the threshold is written nowhere else in the code', () => {
  const files = []
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(e.name) || path.basename(p) === 'aether-plan') files.push(p) } }
  for (const sub of ['lib', 'bin', 'workflows', 'hooks']) walk(path.join(PLUGIN, sub))
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    assert.ok(!/mapMinRequirements/.test(text) || file.endsWith('plan-requirements.js'), `${file} names mapMinRequirements`)
    assert.ok(!/(>=|>|===|<)\s*15\b.*requirement|requirement.*(>=|>|===|<)\s*15\b/i.test(text), `${file} compares requirements with 15`)
  }
})
```

Changed in the same task: `tests/ops-command-design.test.js` gains, next to the `aether-plan check` cases (lines 45 and 83 to 86): `parseOpsPrompt(prompt(`aether-plan requirements ${FEATURE}/spec.md`))` deep-equals `parsed('aether-plan', ['requirements', `${FEATURE}/spec.md`])`, and the bad forms `aether-plan requirements ../x/spec.md`, `aether-plan requirements ${FEATURE}/plan.md` and `aether-plan requirements ${FEATURE}/spec.md --x` are refused exactly as the existing bad forms are. `plugins/aether/hooks/ops.test.ts` gains a case mirroring the `aether-exam recover` one (line 367): the verb runs in the mod, and the bad forms go to the model. `tests/aether-plan.test.js` gains one case: the usage error of the bin names `aether-plan requirements <spec.md>`.

**Acceptance:**
- `node --test tests/plan-requirements.test.js tests/ops-command-design.test.js tests/aether-plan.test.js tests/components-docs.test.js tests/docs-facts.test.js` passes; the new tests fail before the change.
- `node plugins/aether/bin/aether-plan requirements specs/044-design-turns-and-reviews/spec.md` prints `{"requirements":32,"threshold":15,"map":true}`.
- `grep -rn "mapMinRequirements" plugins/aether` finds only `config/design.json` and `lib/plan-requirements.js`.

### Task 3: The read-only `mapper` agent

**Aether:**
- Area: design-agents
- Owns: `plugins/aether/agents/mapper.md`, `tests/agent-mapper.test.js`
- Depends on: none
- Serves: R4

**Interfaces:**
- New agent `plugins/aether/agents/mapper.md`, called as `aether:mapper`. Front matter: `name: mapper`, a `description` starting `"Aether mapper:`, `tools: Read, Grep, Glob`, `model: haiku`, `effort: high`, `maxTurns: 40`. No Write, Edit, MultiEdit, NotebookEdit or Bash. Follow `agents/reviewer.md` (read-only precedent).
- Body: the agent is told it only reads (`Never change a file. You have no shell.`); that its message gives the spec and the plan's context; that it answers one line per requirement of the spec in the form `Rn: <path>:<line>, <what is reused>, <tests that pin the text>`; that line numbers are reading positions the Writer will confirm; and that it must read only what the requirements need. It carries the scope sentence of the other design agents (`Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for. If you think one would help, say so at the end instead of doing it.`).

**Tests (write first):**

New file `tests/agent-mapper.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const SCOPE = 'Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, tests, files, docs or refactors that were not asked for. If you think one would help, say so at the end instead of doing it.'
const source = fs.readFileSync(path.join(PLUGIN, 'agents', 'mapper.md'), 'utf8')
const [, frontText, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
const field = (key) => new RegExp(`^${key}: (.+)$`, 'm').exec(frontText)[1].trim()

test('R4: the mapper reads only: Read, Grep and Glob, no write tool and no shell', () => {
  assert.deepEqual(field('tools').split(',').map((s) => s.trim()), ['Read', 'Grep', 'Glob'])
  for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash']) assert.ok(!field('tools').includes(tool), tool)
})

test('R4: the mapper is the cheapest rung: haiku at high, the first rung of config/ladder.json', () => {
  const rung = require('../plugins/aether/lib/ladder.js').loadLadder().rungs[0]
  assert.deepEqual([field('model'), field('effort')], [rung.model, rung.effort])
  assert.deepEqual([field('model'), field('effort'), field('maxTurns')], ['haiku', 'high', '40'])
  assert.match(field('description'), /^"?Aether mapper:/)
})

test('R4: the body says it never changes a file, the answer form per requirement, and carries the scope sentence', () => {
  assert.ok(body.includes('Never change a file. You have no shell.'))
  assert.ok(body.includes('Rn: <path>:<line>, <what is reused>, <tests that pin the text>'))
  assert.ok(body.includes('reading positions'))
  assert.ok(body.includes(SCOPE))
})
```

(If `loadLadder().rungs[0]` has other field names than `model` and `effort`, read `lib/ladder.js` and `config/ladder.json` and use theirs.)

**Acceptance:**
- `node --test tests/agent-mapper.test.js tests/agents.test.js tests/docs-facts.test.js` passes; the new tests fail before the change.
- `npm run validate` accepts the agent (when the `claude` CLI is available).

### Task 4: The reviewer says ready, caps minors at 10 and brings the fix of each finding

**Aether:**
- Area: review
- Owns: `plugins/aether/agents/reviewer.md`, `plugins/aether/workflows/run.workflow.js`, `plugins/aether/lib/lane-schemas.js`, `tests/review-findings-fix.test.js`, `tests/lane-schemas.test.js`, `tests/roles.test.js`, `tests/agent-outputs.test.js`, `tests/workflow-harness.js`, `tests/workflow-final-slices.test.js`, `tests/workflow-review-once.test.js`, `tests/workflow-review-scope.test.js`, `tests/workflow-salvage.test.js`, `tests/workflow.test.js`
- Depends on: none
- Serves: R11, R12, R13

**Interfaces:**
- `agents/reviewer.md`, section Report (verdict enum and findings lines, about lines 66 to 110): states in these words:
  - `ready` means no critical and no important finding, even when minor findings remain: `Say ready when you have no critical and no important finding, even if minor findings remain.`
  - `Report at most 10 minor findings.`
  - `Every finding carries its fix: the change that resolves it, in one line.` (for all findings, with no «when not obvious» qualifier).
- `workflows/run.workflow.js`: new `REVIEW_FINDINGS` (the `FINDINGS` array schema with a required string property `fix` in each finding); `REVIEW_SCHEMA` uses `REVIEW_FINDINGS`; `SUPERVISOR_SCHEMA` keeps `FINDINGS`.
- `lib/lane-schemas.js`: the same `REVIEW_FINDINGS` copy and `REVIEW_SCHEMA` updated, so the copies stay equal (the equality test of `tests/lane-schemas.test.js`).

**Tests (write first):**

New file `tests/review-findings-fix.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const schemas = require('../plugins/aether/lib/lane-schemas.js')

const reviewer = fs.readFileSync(path.join(PLUGIN, 'agents', 'reviewer.md'), 'utf8')

test('R11: ready is no critical and no important finding, even if minors remain', () => {
  assert.ok(reviewer.includes('Say ready when you have no critical and no important finding, even if minor findings remain.'))
})

test('R12: minor findings are capped at 10', () => {
  assert.ok(reviewer.includes('Report at most 10 minor findings.'))
})

test('R13: the reviewer text asks for the fix in every finding, with no "when not obvious"', () => {
  assert.ok(reviewer.includes('Every finding carries its fix: the change that resolves it, in one line.'))
  assert.ok(!/when not obvious/i.test(reviewer))
})

test('R13: REVIEW_SCHEMA requires a fix string in each finding, and SUPERVISOR_SCHEMA does not', () => {
  const findingOf = (schema) => schema.properties.findings.items
  assert.ok(findingOf(schemas.REVIEW_SCHEMA).required.includes('fix'))
  assert.equal(findingOf(schemas.REVIEW_SCHEMA).properties.fix.type, 'string')
  assert.ok(!findingOf(schemas.SUPERVISOR_SCHEMA).required.includes('fix'))
})
```

(Use the real shape of the schemas in `lib/lane-schemas.js`; if `findings` is nested differently, adjust `findingOf`.)

Also, in `tests/workflow-final-slices.test.js` (or `tests/workflow.test.js`, wherever the final review runs with a fake reviewer today) add a test: a fake reviewer answers `verdict: 'ready-with-fixes'` with two findings that carry `fix: 'change a.js to X'` and `fix: 'rename b'`; the run's result `finalReview.findings` contains both findings with those exact `fix` strings, in order. Update every fake reviewer answer in the owned workflow tests (and `tests/workflow-harness.js` when it holds a default reviewer answer) so each finding carries a `fix`. `tests/lane-schemas.test.js` keeps its list that includes `REVIEW_SCHEMA` and stays green: the copies are equal. `tests/roles.test.js` and `tests/agent-outputs.test.js` pin reviewer text: keep them green (change them only where the new text contradicts them).

**Acceptance:**
- `node --test tests/review-findings-fix.test.js tests/lane-schemas.test.js tests/roles.test.js tests/agent-outputs.test.js tests/workflow-final-slices.test.js tests/workflow-review-once.test.js tests/workflow-review-scope.test.js tests/workflow-salvage.test.js tests/workflow.test.js` passes; the new tests fail before the change.
- The `fix` of each finding of the final review reaches `finalReview.findings` of the run result.

### Task 5: The Lead's rule for each review verdict

**Aether:**
- Area: lead-rules
- Owns: `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/skills/using-aether/SKILL.md`, `tests/review-verdict-rule.test.js`, `tests/session-start-parts.test.js`, `tests/using-aether-030.test.js`, `tests/swarm-skill-043.test.js`
- Depends on: none
- Serves: R14, R15, R16, R17, R18, R26

**Interfaces:**
- `skills/swarm/SKILL.md`, heading «Final review findings» (where «They are not worked» already is). The rule, in these sentences (keep `They are not worked` where it stands):
  - `ready is approved.`
  - `ready-with-fixes is approved when no finding is important or critical; when one is, fix the critical and important findings, and the minor ones are deferred.`
  - `Minor findings are not worked, with ready or with ready-with-fixes: there is no exception.`
  - `A not-ready is not approved before you write the reason: in the run's diary (.aether/autonomy/<run id>/diary.md) or, outside a run, in your next answer to the owner. There is no command and no flag for it.`
  - `This rule serves the final reviewer and the reviewer of a delegate alike.`
- `skills/using-aether/SKILL.md`, paragraph «Verify before you relay» (part 2): one line pointer: `Act on a reviewer's verdict, final or of a delegate, with the rule of aether:swarm, «Final review findings».`
- `skills/using-aether/SKILL.md`, paragraph «The verdict»: replace the sentence `A read-only delegate did not edit, so `aether-delegate approve` refuses it and `approve` on that line closes it.` by: `A read-only delegate whose checks pass is closed by the system when it answers; if its answer is wrong, `verdict --verdict fix|infeasible` reopens it; when a check fails on files another writer changed, `verdict --verdict approve --ignore '<glob>'`.` (changed 2026-11-18, «hazlo neotnces») (the paragraph at the same size or smaller).
- If the two changes do not fit the margin of part 2 (328 characters) shorten another sentence of the same paragraph without dropping a rule; or put the pointer in part 3.

**Tests (write first):**

New file `tests/review-verdict-rule.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...p) => fs.readFileSync(path.join(PLUGIN, ...p), 'utf8')
const swarm = read('skills', 'swarm', 'SKILL.md')
const using = read('skills', 'using-aether', 'SKILL.md')
const section = swarm.slice(swarm.indexOf('Final review findings'))

test('R14: the swarm skill says what to do with each verdict', () => {
  assert.ok(section.includes('ready is approved.'))
  assert.ok(section.includes('ready-with-fixes is approved when no finding is important or critical; when one is, fix the critical and important findings, and the minor ones are deferred.'))
  assert.ok(section.includes('This rule serves the final reviewer and the reviewer of a delegate alike.'))
})

test('R15: minors are not worked with ready or with ready-with-fixes, and "They are not worked" stays', () => {
  assert.ok(section.includes('Minor findings are not worked, with ready or with ready-with-fixes: there is no exception.'))
  assert.ok(swarm.includes('They are not worked'))
})

test('R16: a not-ready is not approved before its reason is written, in the diary or in the answer, with no command or flag', () => {
  assert.ok(section.includes("A not-ready is not approved before you write the reason: in the run's diary (.aether/autonomy/<run id>/diary.md) or, outside a run, in your next answer to the owner. There is no command and no flag for it."))
})

test('R17: the bootstrap carries only a pointer to the rule', () => {
  assert.ok(using.includes("Act on a reviewer's verdict, final or of a delegate, with the rule of aether:swarm, «Final review findings»."))
  assert.ok(!using.includes('Minor findings are not worked, with ready'))
})

test('R26: the verdict paragraph says the system closes a read-only delegate whose checks pass', () => {
  assert.ok(!using.includes('A read-only delegate did not edit, so `aether-delegate approve` refuses it'))
  assert.ok(using.includes('A read-only delegate whose checks pass is closed by the system when it answers; if its answer is wrong, `verdict --verdict fix|infeasible` reopens it; when a check fails on files another writer changed, `verdict --verdict approve --ignore \'<glob>\'`.'))
})
```

R18: no new size test. `tests/session-start-parts.test.js` (lines 34 to 38) must stay green with the rule; run it after each edit of `using-aether`. Update `tests/using-aether-030.test.js` and `tests/swarm-skill-043.test.js` only where they pin text this task replaces.

**Acceptance:**
- `node --test tests/review-verdict-rule.test.js tests/session-start-parts.test.js tests/using-aether-030.test.js tests/swarm-skill-043.test.js tests/docs-facts.test.js` passes; the new tests fail before the change.
- Each part of the bootstrap measures at most 9,800 characters (`bootstrapParts('plugins/aether')`).

### Task 6: A read is not a skill install

**Aether:**
- Review: xhigh — the change touches the guard's classification of writes to the owner's skill folders; a mistake would let a write through or weaken the protection of Claude's settings (security)
- Area: guard
- Owns: `plugins/aether/lib/guard.js`, `tests/guard.test.js`, `tests/guard-skills.test.js`
- Depends on: none
- Serves: R29, R30, R31

**Interfaces:**
- `lib/guard.js`, function `isSkillInstallSegment` (about line 707) only. Today it computes `naming = isAutonomyCall(...) ? redirectTargets(words) : writeTargets(words)`. Add a third branch: a read-only segment names only its redirections (`redirectTargets(words)`). Read-only segments are (a) `find` with none of the actions `-delete`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-fprint`, `-fprint0`, `-fprintf`, `-fls`; (b) `gh issue …` and `gh pr …`. A redirection (`>`, `>>`) in such a segment still counts. `cp`, `ln`, `mv`, `find -delete` and `find -exec` stay as today. `writeTargets` and `claudeConfigWrite` do not change (R31). The final `installClass(...)` call does not change.
- A tilde path in a segment is expanded by the guard as today; tests use the absolute home of the test world.

**Tests (write first):**

In `tests/guard-skills.test.js`, reusing its `world(t)` (the `bash` helper, `readPending`, `w.home`), add:

```js
test('R29: a read that names the personal skill folder is not a skill-install', (t) => {
  const w = world(t)
  const dir = path.join(w.home, '.claude', 'skills')
  for (const command of [
    `find ${dir} -name SKILL.md`,
    `gh issue comment 315 --body "the folder ${dir} was named by a read"`,
    `gh pr create --title t --body "see ${dir}"`,
  ]) {
    assert.equal(w.bash(command), null, command)
  }
  assert.equal(readPending(w.repo.dir).length, 0)
})

test('R30: a write to the personal skill folder is still a skill-install', (t) => {
  const w = world(t)
  const dir = path.join(w.home, '.claude', 'skills')
  for (const command of [
    `cp -r x ${dir}/`,
    `ln -s x ${dir}/y`,
    `mv x ${dir}/y`,
    `find ${dir} -name SKILL.md -delete`,
    `find ${dir} -name SKILL.md -exec cp x {} ;`,
    `find ${dir} -name SKILL.md -fprint ${dir}/out`,
    `echo hi > ${dir}/new/SKILL.md`,
    `gh issue comment 315 --body x > ${dir}/new/SKILL.md`,
  ]) {
    const d = w.bash(command)
    assert.ok(d && d.reason.includes('skill-install'), command)
  }
})
```

In `tests/guard.test.js`: add the same `find` read case through the existing helpers if a skill-folder section exists there, and keep every existing refusal of the settings of Claude (`claudeConfigWrite`) and the redirection cases (about lines 928 to 944) unchanged and green (R31). `tests/guard-claude.test.js` is run, not changed.

**Acceptance:**
- `node --test tests/guard.test.js tests/guard-skills.test.js tests/guard-claude.test.js tests/guard-tidy.test.js tests/guard-merge-main.test.js` passes; the R29 test fails before the change and the R30 test passes before and after.
- `git diff plugins/aether/lib/guard.js` shows no change to `writeTargets` or `claudeConfigWrite`.

### Task 7: The direct path of the site says the rule of three edits or ten reads

**Aether:**
- Area: site
- Owns: `site/app.js`, `site/index.html`, `tests/site.test.js`
- Depends on: none
- Serves: R19

**Interfaces:**
- `site/app.js`, key `p.direct.a`, Spanish: `Clawd trabaja en su propia sesión, de READ a RUN, hasta la tercera edición o la décima lectura de un turno, y la bandera del resultado sube`; English: `Clawd works in its own session, from READ to RUN, up to the third edit or the tenth read of a turn, and the result flag goes up`.
- `site/index.html`: the `alt` of the image with `data-i18n-alt="p.direct.a"` and the `alt` of the same image inside `<noscript>` become the Spanish text above. `p.direct.c` (`EN LÍNEA · ~5 LLAMADAS`) does not change.

**Tests (write first):**

In `tests/site.test.js`, replace the test of line 379 (`p.direct.w states the canonical countable rule … while p.direct.a alt stays unchanged`) by one named `p.direct.w and p.direct.a state the rule of three edits or ten reads in Spanish and English (R19)`. Keep its `esRule` and `enRule` assertions and replace the last assertion by:

```js
  const esAlt = 'Clawd trabaja en su propia sesión, de READ a RUN, hasta la tercera edición o la décima lectura de un turno, y la bandera del resultado sube'
  const enAlt = 'Clawd works in its own session, from READ to RUN, up to the third edit or the tenth read of a turn, and the result flag goes up'
  assert.equal(html.split(`alt="${esAlt}"`).length - 1, 2, 'the image and its noscript copy')
  assert.ok(appSrc.includes(`'p.direct.a': '${esAlt}'`))
  assert.ok(appSrc.includes(`'p.direct.a': '${enAlt}'`))
  assert.ok(!html.includes('cinco llamadas a herramientas'))
  assert.ok(!appSrc.includes('cinco llamadas a herramientas'))
  assert.ok(!appSrc.includes('five tool calls'))
```

**Acceptance:**
- `node --test tests/site.test.js` passes; the changed test fails before the change.
- `grep -n "cinco llamadas" site/app.js site/index.html` prints only the `p.direct.c` line if it holds that wording, and no `alt`.

### Task 8: The merge-main refusal does not send the owner a question in an autonomous run

**Aether:**
- Area: delegates
- Owns: `plugins/aether/lib/delegate-approve.js`, `tests/delegate-approve.test.js`
- Depends on: none
- Serves: R20

**Interfaces:**
- `MERGE_MAIN` in `lib/delegate-approve.js` (line 20) becomes exactly: `merge-main needs a grant: record it with aether-autonomy grant --class merge-main --quote "<their words>" once the owner gives it, then run approve again; in an autonomous run the merge goes to "Espera tu sí" of the brief and the owner is not asked at that moment`

**Tests (write first):**

In `tests/delegate-approve.test.js`, the assertion of lines 158 to 161 (`blocked.json.reason` equals the old text) becomes:

```js
  assert.equal(
    blocked.json.reason,
    'merge-main needs a grant: record it with aether-autonomy grant --class merge-main --quote "<their words>" once the owner gives it, then run approve again; in an autonomous run the merge goes to "Espera tu sí" of the brief and the owner is not asked at that moment'
  )
  assert.ok(!blocked.json.reason.includes('ask the owner for the merge'))
```

Keep the rest of the test (the grant, the second `approve`) unchanged.

**Acceptance:**
- `node --test tests/delegate-approve.test.js tests/delegate-approve-rerun.test.js tests/guard-merge-main.test.js` passes; the changed assertion fails before the change.
- The existing test that shows `approve` runs the task's tests before the merge stays green (R28 evidence).

### Task 9: quota-brake stops the chains of a continued run

**Aether:**
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy-command.js`, `tests/quota-brake-continued.test.js`, `tests/quota-brake-command.test.js`
- Depends on: none
- Serves: R21

**Interfaces:**
- `lib/autonomy-command.js`, `quota-brake` (about line 335): `sessions` becomes the union (no duplicates) of `autonomy.runSessions(run)` (exported at about line 1561 of `lib/autonomy.js`) of each paused run, instead of `run.session` only. `lib/delegate-run.js` `stopAll` does not change (Task 10 owns that file).

**Tests (write first):**

New file `tests/quota-brake-continued.test.js`. Follow the patterns of `tests/quota-brake-command.test.js` (how a run is opened, paused and how `quota-brake` is run) and `tests/delegate-run.test.js` line 600 (`spawnSleeper`: a live process plus its run file keyed with `log.fileKey(session, task)`):
1. Open an autonomous run in session `A`; leave a delegate run file keyed `log.fileKey('A', 't1')` whose `pid` is a live sleeper process.
2. `aether-autonomy continue` the run into session `B`.
3. Record the quota pause, and run `aether-autonomy quota-brake` from session `B`.
4. Assert that the sleeper process of the chain of session `A` is no longer alive (poll up to 2 s with `process.kill(pid, 0)`), and that the output of `quota-brake` lists the run as paused.

The test must fail before the change (the process stays alive) and pass after it. Kill any leftover sleeper in `t.after`.

**Acceptance:**
- `node --test tests/quota-brake-continued.test.js tests/quota-brake-command.test.js tests/quota-brake-scenarios.test.js tests/autonomy-continue.test.js tests/aether-autonomy-sessions.test.js` passes.
- `git diff` of `lib/autonomy-command.js` is the `sessions` computation only.

### Task 10: A read-only delegate whose checks pass is closed by the system

**Aether:**
- Area: delegates
- Owns: `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/delegate-run.js`, `plugins/aether/bin/aether-delegate`, `tests/delegate-auto-close.test.js`, `tests/delegate-mod.test.js`, `tests/delegate-report.test.js`, `tests/continuity-hook.test.js`, `tests/delegate-task.test.js`, `tests/delegate-run.test.js`, `tests/delegate-wait.test.js`
- Depends on: none
- Serves: R23, R24, R25, R26

**Interfaces:**
- `lib/delegate-task.js`, next to `verdict()`: `closeReadOnly({ task, session, cwd, dataDir, now })`. It takes the last launch of the task and does nothing (returns `{ closed: false, reason }`) when: the launch edits (`editsOf(launch)`); the ladder already closed the task (`ladderLib.judge` rejects with «the task is approved/blocked»); or `approveError(r, entries, launch, undefined, [])` returns an error (same checks as `approve`: an external result with `checks.ok`, or a non-empty Claude answer with no files touched since the launch; nothing is ignored). Otherwise it appends the same `verdict` line `verdict()` writes for an approval (`{ kind: 'verdict', time, session, task, attempt, step, verdict: 'approved', input: { kind: 'approve', findings: [], reason, fromScratch: false }, reason, cause, next, ignore: [], repo }`, from `ladderLib.judge`) with the added fields `auto: true` and `reason: 'closed by the system: the read-only checks passed'`, and returns `{ closed: true }`. It never throws: a failure leaves the task pending as today. Export it.
- `lib/delegate-run.js`: `runTask` calls `closeReadOnly` after the `result` log line when the result is ok (external pairs path); `recordAnswer` calls it after appending the `answer` line of a read-only launch (Claude path). `delegate-run.js` requires `delegate-task.js` (`delegate-task.js` does not require `delegate-run.js`; keep it so, no cycle). `recordAnswer` accepts `cwd`.
- `bin/aether-delegate` (about line 127): passes `cwd: process.cwd()` to `recordAnswer`.
- `lib/delegate-report.js` and `lib/continuity-hook.js` do NOT change: a normal `verdict` line after the last launch already removes the task from `unverdictedDelegates` and from the Stop warning, so the same line gives R25.

**Tests (write first):**

New file `tests/delegate-auto-close.test.js` (follow the setup of `tests/delegate-task.test.js` lines 426 and 446 and of `tests/delegate-run.test.js` for the external path, and of `tests/delegate-mod.test.js` line 294 for the Claude path, with a fake read-only delegate each). Cases, each with its assertions:
1. External read-only delegate, result ok with `checks.ok`: the log has a `verdict` line for the task with `verdict: 'approved'` and `auto: true`, with no call to `aether-delegate verdict`; `unverdictedDelegates({ dataDir })` does not list the task; `unverdictedStopMessage` (lib/continuity-hook.js) has nothing to say about it.
2. Claude read-only delegate, `aether-delegate answer` records a non-empty answer and no file was touched since the launch: same three assertions.
3. Empty answer (Claude) or a result with a failed check (external): no `verdict` line; the task is listed by `unverdictedDelegates`.
4. Red check by files another writer changed: no automatic closing, and `aether-delegate verdict --task <id> --verdict approve --ignore '<glob>'` still approves it (the flow of `tests/delegate-task.test.js` 426 and 446 stays green).
5. An editing delegate (a launch with edits): `closeReadOnly` returns `{ closed: false }` and the task still needs `aether-delegate verdict`.
6. R26 (changed 2026-11-18, «hazlo neotnces»): `verdict --verdict fix` and `--verdict infeasible` on an open read-only delegate are accepted; after the automatic closing and with no later launch, the same calls reopen the approval (`fix` rises one rung with its findings, `infeasible` needs its reason), and `approve` on the closed task is refused and writes nothing.
7. A second call of `closeReadOnly` on a closed task writes nothing (one `verdict` line only).

Changed in the same task: the cases of `tests/delegate-mod.test.js` (409 to 422), `tests/delegate-report.test.js` (192 to 194, 306 to 319) and `tests/continuity-hook.test.js` (59) that today expect the Lead's verdict for a read-only delegate that came out right now expect it already closed; the same cases with a failed check or an editing delegate keep expecting the verdict.

**Acceptance:**
- `node --test tests/delegate-auto-close.test.js tests/delegate-mod.test.js tests/delegate-report.test.js tests/continuity-hook.test.js tests/delegate-task.test.js tests/delegate-run.test.js tests/delegate-wait.test.js tests/delegate-approve.test.js` passes; the new cases fail before the change.
- `lib/delegate-report.js` and `lib/continuity-hook.js` are unchanged.

### Task 11: The new decision A132 and the sentences that repeat the old rule

**Aether:**
- Area: docs
- Owns: `docs/decisions.md`, `docs/index.md`, `docs/guide/delegates.md`, `AGENTS.md`, `tests/decision-044.test.js`, `tests/docs-032.test.js`, `tests/docs-facts.test.js`, `tests/docs-decisions.test.js`, `tests/delegates-docs.test.js`
- Depends on: none
- Serves: R27, R28

**Interfaces:**
- `docs/decisions.md`: a new row `A132` after `A131` (same row format: `| A132 | **…** … | Decided 2026-11-17; spec 044 |`). It says: for a read-only delegate whose checks pass, the system closes it as approved and the sentence of A85 «only a verdict that goes through `aether-delegate verdict` counts» does not apply to it; it quotes the owner's word 3, `«Si a todo trabja autonomamente en resolverlo»`; it says A85 stands for delegates that edit; it names issues #193 and #196 (#196: no reviewer is added to Haiku's edits in Claude; `approve` runs the task's tests before the merge).
- `docs/index.md`: the range `A1–A131` becomes `A1–A132` (and the pages that repeat it: `tests/docs-032.test.js` line 23 and `tests/docs-facts.test.js` line 850).
- `docs/guide/delegates.md` and the line of `AGENTS.md` that says `Only a verdict that goes through `aether-delegate verdict` counts`: adjusted to say that a read-only delegate whose checks pass is closed by the system, and that a verdict through `aether-delegate verdict` is what counts for the others (those that edit, and a read-only one only for `fix` or `infeasible`).

**Tests (write first):**

New file `tests/decision-044.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const decisions = read('docs/decisions.md')
const row = decisions.split('\n').find((line) => line.startsWith('| A132 |')) || ''

test('R27: A132 exists after A131, quotes the owner, replaces the A85 sentence for read-only delegates and leaves A85 for edits', () => {
  assert.ok(row, 'a row A132')
  assert.ok(decisions.indexOf('| A131 |') < decisions.indexOf('| A132 |'))
  assert.ok(row.includes('Si a todo trabja autonomamente en resolverlo'))
  assert.ok(row.includes('hazlo neotnces'), 'A132 quotes the owner\'s words of 2026-11-18')
  assert.match(row, /reopen/, 'A132 records that fix or infeasible reopen the automatic approval')
  assert.match(row, /read-only delegate/)
  assert.match(row, /closes? (it|the delegate) as approved|closed by the system/)
  assert.match(row, /A85/)
  assert.match(row, /delegates that edit/)
  assert.match(row, /#193/)
  assert.match(row, /#196/)
})

test('R27: the sentences that repeat the old rule say the new case', () => {
  assert.match(read('docs/guide/delegates.md'), /read-only delegate[^.]*closed by the system|the system closes a read-only delegate/)
  assert.ok(!read('AGENTS.md').includes('Only a verdict that goes through `aether-delegate verdict` counts, and an `approve` with a failed check is refused.'))
})

test('R28: no reviewer is added to Haiku edits, and an existing test shows approve runs the task tests before merging', () => {
  assert.match(row, /no reviewer/i)
  const approve = read('tests/delegate-approve.test.js')
  assert.match(approve, /runs? the (task's )?tests|test command|npm test|testCommand/i)
})
```

Also change `tests/docs-032.test.js` line 23 and `tests/docs-facts.test.js` line 850 to `/A1–A132/`. Run `tests/delegates-docs.test.js` and `tests/docs-decisions.test.js` and keep them green.

**Acceptance:**
- `node --test tests/decision-044.test.js tests/docs-032.test.js tests/docs-facts.test.js tests/docs-decisions.test.js tests/delegates-docs.test.js tests/agents-md.test.js` passes; the new tests fail before the change.
- No file is closed or published: closing issue 196 is the Lead's action, not a step of this task.

### Task 12: maintenance.md and troubleshooting.md say what the code does

**Aether:**
- Area: docs
- Owns: `docs/guide/maintenance.md`, `docs/guide/troubleshooting.md`, `tests/docs-facts.test.js`, `tests/docs-030.test.js`
- Depends on: Task 11 — both change `tests/docs-facts.test.js`, and Task 11 moves the decision range there first
- Serves: R22

**Interfaces:**
- `docs/guide/maintenance.md` (about line 62): the cleanup with an open run. Read first `lib/worktrees.js`/`aether-wt sweep` and `finalize` and what they do when a run is open, and write that.
- `docs/guide/troubleshooting.md` (about line 52): the text «unread quota above»; read the code that reads the quota and write what the message and its cause are today. About line 182: recompiling without `--only`; read `aether-plan compile --run` (`lib/plan-compile.js`, `lib/plan-relaunch` and `swarm/SKILL.md` lines 152 to 154) and write what it does today.
- Each of the three phrases is rewritten in one place; nothing else in the pages changes.

**Tests (write first):**

In `tests/docs-facts.test.js`, after the assertions near lines 826 to 864 (same pattern: `read('docs/guide/...')` plus `assert.match` / `assert.doesNotMatch`), add one test per phrase, named with `(R22)`. Each test has two assertions: (a) the old sentence is gone (`doesNotMatch` of its exact old wording, copied from the page before editing), and (b) the new sentence says the behaviour you read in the code (`match` of a stable fragment of your new wording, such as the verb or the file the code uses). The three tests are: cleanup with an open run (maintenance), «unread quota above» (troubleshooting), recompile without `--only` (troubleshooting). Each test must fail on the page before the edit.

**Acceptance:**
- `node --test tests/docs-facts.test.js tests/docs-030.test.js tests/delegates-docs.test.js tests/launcher.test.js` passes; the three new tests fail before the change.
- Each new sentence names a behaviour the implementer confirmed in the code; the task's report says which file confirmed each.

### Task 13: The map step before the plan Writer

**Aether:**
- Area: design-workflow
- Owns: `plugins/aether/workflows/design.workflow.js`, `tests/workflow-design.test.js`, `tests/ops-note.test.js`
- Depends on: Task 2 — the step runs `aether-plan requirements` and reads `config/design.json`
- Depends on: Task 3 — the step calls the `aether:mapper` agent
- Serves: R3, R4, R5, R6

**Interfaces:**
- `design.workflow.js`:
  - `const MAP_PAIR = { model: 'haiku', effort: 'high' }` (a copy of the first rung of `config/ladder.json`, like `REFERENCE` copies `lib/seats.js`).
  - `MAP_SCHEMA = { required: ['map'], properties: { map: { type: 'string' } } }` in the same schema dialect as the other schemas of the file.
  - In `full()`, between the approval of the spec and the plan Writer: an ops call `aether-plan requirements <SPEC>` (shell, no model); when its JSON has `map: true`, one call `call('mapper', MAP_PAIR.model, MAP_PAIR.effort, mapMessage(), { phase: 'Plan', label: 'plan: map', schema: MAP_SCHEMA })`. It does not pass through `aether-delegate` and writes nothing.
  - `planWriterMessage(map = null)`: with a map, it adds a block `## Mapa del código` with the text and the line `Las líneas son posiciones de lectura: confírmalas antes de editar.`; without a map the message is today's, letter by letter.
  - Failure (R6): the ops verb fails, the mapper returns null, the mapper call throws (a `try`/`catch` around the call, because the test harness rethrows a handler's error), the answer does not fit the schema or `map` is empty: `log('plan: map: <reason>; the plan is written without a map')` and the run goes on with today's message. It does not go through `failure()`; the result keeps its shape.
  - The header comment of the file (lines 12 to 23, the order of the flow) names the new step.
- `tests/workflow-design.test.js` and `tests/ops-note.test.js`: the default ops handlers answer `requirements` with `{ requirements: 8, threshold: 15, map: false }`, so every existing test keeps its sequence. Add `'mapper'` to the `ROLES` of both files.

**Tests (write first):**

In `tests/workflow-design.test.js`:

```js
const mapOps = (n) => (call, fallback) => (call.command.verb === 'requirements' ? { requirements: n, threshold: 15, map: n >= 15 } : fallback(call))
const MAP_TEXT = 'R1: plugins/aether/agents/writer.md:7, one line, tests/agents.test.js\nR2: plugins/aether/agents/examiner.md:7, one line, tests/examiner-order.test.js'
const planWriter = (run) => run.calls.find((c) => c.label === 'plan: writer write')

test('R3 R5: a spec of 15 requirements runs the map step once, before the plan Writer, and the Writer message carries the map', async () => {
  const run = await go(ARGS, { ops: mapOps(15), mapper: () => ({ map: MAP_TEXT }) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(nativeCalls(run).map((c) => c.role), ['writer', 'judge', 'mapper', 'writer', 'judge', 'examiner'])
  assert.equal(run.calls.filter((c) => c.label === 'plan: map').length, 1)
  assert.ok(planWriter(run).prompt.includes('## Mapa del código'))
  assert.ok(planWriter(run).prompt.includes(MAP_TEXT))
  assert.equal(run.result.status, 'approved')
})

test('R3 R5: a spec of 14 requirements has no map step and the Writer message is the one of today', async () => {
  const run = await go(ARGS, { ops: mapOps(14), mapper: () => { throw new Error('the mapper must not run') } })
  assert.deepEqual(nativeCalls(run).map((c) => c.role), ['writer', 'judge', 'writer', 'judge', 'examiner'])
  const baseline = await go(ARGS)
  assert.equal(planWriter(run).prompt, planWriter(baseline).prompt)
  assert.ok(!planWriter(run).prompt.includes('Mapa del código'))
})

test('R4: the map step runs on the cheapest rung, as aether:mapper, with a schema that asks for a map, and with no write tool', async () => {
  const run = await go(ARGS, { ops: mapOps(15), mapper: () => ({ map: MAP_TEXT }) })
  const call = run.calls.find((c) => c.label === 'plan: map')
  const rung = require('../plugins/aether/lib/ladder.js').loadLadder().rungs[0]
  assert.deepEqual([call.model, call.effort], [rung.model, rung.effort])
  assert.deepEqual([call.model, call.effort], front('mapper'))
  assert.equal(call.role, 'mapper')
  assert.deepEqual(call.schema.required, ['map'])
  const tools = fs.readFileSync(path.join(PLUGIN, 'agents', 'mapper.md'), 'utf8').match(/^tools: (.+)$/m)[1]
  assert.ok(!/Write|Edit|Bash/.test(tools))
})

for (const [name, mapper] of [['rejects', () => null], ['answers empty', () => ({ map: '' })], ['throws', () => { throw new Error('boom') }]]) {
  test(`R6: a map that ${name} leaves the plan written without a map, the result of the same shape, and the log says it`, async () => {
    const run = await go(ARGS, { ops: mapOps(15), mapper })
    assert.equal(run.error, null, run.error && run.error.stack)
    assert.equal(run.result.status, 'approved')
    assert.ok(!planWriter(run).prompt.includes('Mapa del código'))
    assert.ok(run.logs.some((line) => /plan: map: .*the plan is written without a map/.test(line)), run.logs.join('\n'))
    const baseline = await go(ARGS)
    assert.deepEqual(Object.keys(run.result).sort(), Object.keys(baseline.result).sort())
  })
}
```

Existing tests of this file that count calls or labels (lines 89, 106, 251 to 311, 392 to 395) stay green with the default handler of 8 requirements. `tests/ops-note.test.js` gains the `requirements` answer in its handlers so its three design tests stay green.

**Acceptance:**
- `node --test tests/workflow-design.test.js tests/ops-note.test.js tests/layout-work.test.js tests/layout-exam.test.js tests/ops-command-design.test.js` passes; the new tests fail before the change.
- The number 15 is not written in `design.workflow.js`.

### Task 14: The native Writer of the plan in two calls

**Aether:**
- Area: design-workflow
- Owns: `plugins/aether/workflows/design.workflow.js`, `tests/workflow-design.test.js`, `tests/ops-note.test.js`
- Depends on: Task 13 — same file; the map message of the first call comes from Task 13's `planWriterMessage`
- Depends on: Task 1 — `agents/writer.md` already says the two message forms
- Serves: R7, R8

**Interfaces:**
- `design.workflow.js`:
  - `PLAN_WRITER_SCHEMA`: required `plan`, `commit`, `assumptions`, `questions`; optional `complexity` (same property types as `WRITER_SCHEMA`; no `tasks`, no `check`, no `disagreements`).
  - `TASKS_WRITER_SCHEMA`: required `tasks`, `commit`, `check`, `assumptions`, `questions` (same types as `WRITER_SCHEMA`).
  - `WRITER_SCHEMA` and `lib/lane-schemas.js` do not change; the external seat keeps `WRITER_SCHEMA`.
  - `seatRound` gains the optional parameters `nativeText` (the message of the native agent when the seat hands the round back; default `text`) and returns the native pair it ran with (`effort` and `model`).
  - First call: `writePlan('write', planText)` stays a `seatRound({ seat: 'writer', doc: 'plan', … })` (an external seat is offered first, with `WRITER_SCHEMA` and today's message); `nativeSchema: PLAN_WRITER_SCHEMA`; `nativeText` is `planWriterMessage(map)` plus the line `Write only plan.md and commit it; the tasks come in another call.`
  - Second call (only when the answer came from the native agent): `nativeAnswer({ seat: 'writer', base: 'plan: writer tasks write', text: tasksMessage(), schema: TASKS_WRITER_SCHEMA, phase: 'Plan', native: <the pair of the first call> })`. `tasksMessage()` is: `Write tasks.md of <feature>, reading the plan.md already written (<feature>/plan.md). Run aether-plan check until it passes and commit it.` The label is `plan: writer tasks write`; the second call's answer joins the first one (`complexity` comes from the first).
  - R8: `checkedAfter` runs `aether-plan check` after the second call; on failure the retry is the second call again once, with `tasksMessage()` plus the errors (an external seat's answer keeps retrying the whole round as today). The Judge still gets plan.md and tasks.md in one round (`reviews({ doc: 'plan' … })`).
  - Corrections of the plan (`corrector('plan')`) stay a single call with `REVISION_SCHEMA`.

**Tests (write first):**

In `tests/workflow-design.test.js`, with a Writer that answers by label (`plan: writer write` gets `PLAN_ONLY`, `plan: writer tasks write` gets `TASKS_ONLY`, spec calls get `SPEC_ANSWER`):

```js
const PLAN_ONLY = { plan: `${FEATURE}/plan.md`, commit: 'c2', complexity: PLAN_ANSWER.complexity, assumptions: [], questions: [] }
const TASKS_ONLY = { tasks: `${FEATURE}/tasks.md`, commit: 'c3', check: '{"ok":true}', assumptions: [], questions: [] }
const twoStep = (call) => (call.label.startsWith('spec:') ? SPEC_ANSWER : call.label === 'plan: writer write' ? PLAN_ONLY : TASKS_ONLY)

test('R7: the native Writer makes two calls for the plan, each with its own schema, and the second gets the path of plan.md', async () => {
  const run = await go(ARGS, { writer: twoStep })
  assert.equal(run.error, null, run.error && run.error.stack)
  const calls = run.calls.filter((c) => c.role === 'writer' && c.label.startsWith('plan:'))
  assert.deepEqual(calls.map((c) => c.label), ['plan: writer write', 'plan: writer tasks write'])
  assert.deepEqual(calls[0].schema.required.sort(), ['assumptions', 'commit', 'plan', 'questions'])
  assert.deepEqual(calls[1].schema.required.sort(), ['assumptions', 'check', 'commit', 'questions', 'tasks'])
  assert.ok(calls[1].prompt.includes(`${FEATURE}/plan.md`))
  assert.ok(calls[0].prompt.includes('Write only plan.md'))
  assert.deepEqual([calls[1].model, calls[1].effort], [calls[0].model, calls[0].effort])
  assert.deepEqual([run.result.plan, run.result.tasks], [`${FEATURE}/plan.md`, `${FEATURE}/tasks.md`])
  assert.equal(run.result.complexity, PLAN_ONLY.complexity)
})

test('R7: an external seat that answers keeps one call, with plan and tasks together', async () => {
  const docs = {}
  const ops = (call, fallback) => {
    const out = fallback(call)
    if (call.command.verb === 'seat-start' && call.command.rest[0] === 'writer') docs[out.id] = flag(call, '--doc')
    if (call.command.verb === 'seat-wait' && docs[call.command.rest[0]] === 'plan') {
      return { done: true, exitCode: 0, value: { seat: 'writer', id: call.command.rest[0], harness: 'agy', model: 'gemini-4-argon', answer: 'x', result: PLAN_ANSWER, lane: '- Lane: agy gemini-4-argon-high' } }
    }
    return out
  }
  const run = await go({ ...ARGS, superdelegation: 'on' }, { ops, writer: twoStep })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(opsCalls(run, 'seat-start').filter((c) => c.command.rest[0] === 'writer' && flag(c, '--doc') === 'plan').length, 1)
  assert.equal(run.calls.filter((c) => c.role === 'writer' && c.label.startsWith('plan:')).length, 0, 'no native Writer call for the plan')
  assert.equal(run.calls.some((c) => c.label === 'plan: writer tasks write'), false)
  assert.deepEqual([run.result.plan, run.result.tasks], [PLAN_ANSWER.plan, PLAN_ANSWER.tasks])
})

test('R8: a check that fails the first time repeats the second call once, with the errors, and the Judge gets both documents in one round', async () => {
  let checks = 0
  const run = await go(ARGS, {
    writer: twoStep,
    ops: (call, fallback) => (call.command.verb === 'check' && ++checks === 1 ? { ok: false, errors: ['task 2 has no Owns'], warnings: [] } : fallback(call)),
  })
  const tasksCalls = run.calls.filter((c) => c.label.startsWith('plan: writer tasks'))
  assert.equal(tasksCalls.length, 2)
  assert.ok(tasksCalls[1].prompt.includes('task 2 has no Owns'))
  assert.equal(run.calls.filter((c) => c.label === 'plan: writer write').length, 1, 'the plan call is not repeated')
  const reviews = run.calls.filter((c) => c.role === 'judge' && c.label.startsWith('plan:'))
  assert.equal(reviews.length, 1)
  assert.ok(reviews[0].prompt.includes(`${FEATURE}/plan.md`) && reviews[0].prompt.includes(`${FEATURE}/tasks.md`))
})

test('R7: the plan call and the tasks call of the Writer carry two schemas whose properties are those of the lib WRITER_SCHEMA, which does not change', async () => {
  const run = await go(ARGS, { writer: twoStep })
  const [planCall, tasksCall] = run.calls.filter((c) => c.role === 'writer' && c.label.startsWith('plan:'))
  const lib = schemas.WRITER_SCHEMA
  assert.deepEqual(lib.required, ['plan', 'tasks', 'commit', 'check', 'assumptions', 'questions'])
  for (const [call, names] of [[planCall, ['plan', 'commit', 'assumptions', 'questions', 'complexity']], [tasksCall, ['tasks', 'commit', 'check', 'assumptions', 'questions']]]) {
    assert.deepEqual(Object.keys(call.schema.properties).sort(), [...names].sort(), call.label)
    for (const name of names) {
      assert.equal(call.schema.properties[name].type, lib.properties[name].type, `${call.label} ${name}`)
      assert.deepEqual(call.schema.properties[name].items, lib.properties[name].items, `${call.label} ${name} items`)
    }
  }
  const external = fs.readFileSync(path.join(PLUGIN, 'workflows', 'design.workflow.js'), 'utf8')
  assert.ok(external.includes('WRITER_SCHEMA') && external.includes('PLAN_WRITER_SCHEMA') && external.includes('TASKS_WRITER_SCHEMA'))
})
```

Update every existing test whose Writer fake answers `PLAN_ANSWER` for `plan: writer write` to expect the two-call sequence (the call order of line 89 becomes `['writer', 'judge', 'writer', 'writer', 'judge', 'examiner']` with the default handler adapted to answer by label; the labels list of line 298 gains `plan: writer tasks write`), and adapt the default handler of `tests/ops-note.test.js` the same way.

**Acceptance:**
- `node --test tests/workflow-design.test.js tests/ops-note.test.js tests/seat-calls.test.js tests/seat-partial.test.js tests/seats-design.test.js tests/lane-schemas.test.js tests/agents-design.test.js` passes; the new tests fail before the change.
- A run with an external Writer seat that answers makes one call for the plan, as before.

### Task 15: The Examiner that runs out of turns is relaunched once

**Aether:**
- Area: design-workflow
- Owns: `plugins/aether/workflows/design.workflow.js`, `tests/workflow-design.test.js`, `tests/ops-note.test.js`
- Depends on: Task 14 — same file and the same test file; the chain is sequential
- Serves: R9, R10

**Interfaces:**
- `design.workflow.js`:
  - `seatRound` returns, in its failed result, the native pair it used (`native`; by default `nativeOf('examiner', {}, author)`).
  - `examine()`: after the first launch (everything `seatRound` does today for the Examiner, including an external seat that fell to the native one, which does not count as a relaunch) ends failed with no `refused`, it runs `aether-exam recover <feature>`. When `recover` fails or returns `tests: []`, there is no relaunch and the result is today's. When `tests` has entries, it makes one call `call('examiner', native.model, native.effort, <examinerMessage() + examinerPartialForNative({ partialDir: <repo>/.aether/exam, partialPaths })>, { phase: 'Exam', label: 'exam: examiner (relaunch)', schema: EXAMINER_SCHEMA })`, with no inner retry. `partialPaths` is `recover.tests.map((t) => t.path)`: `aether-exam recover` returns `tests` as `{ path, inIndex }` entries.
  - If the relaunch answer fits the schema, the flow continues as a native Examiner that finished (`aether-exam store`). If it does not finish, `aether-exam recover` runs again and the result lists the tests that exist with their index mark, in the shape of today (`failedResult('examiner', …)` plus `tests`). There is never a third launch.

**Tests (write first):**

In `tests/workflow-design.test.js` (helpers: `go`, `opsCalls`, `nativeCalls`, `EXAM`, the `recover` handler of `handlers()`):

```js
const LEFT = [{ path: 'c1.test.js', inIndex: true }, { path: 'c2.test.js', inIndex: false }] // the shape `aether-exam recover` returns (lib/exam.js:120)
const examinerCalls = (run) => run.calls.filter((c) => c.role === 'examiner')

// nativeAnswer makes two calls for one launch (the label, then `${label} (retry)`): a launch is a call whose label does not end in `(retry)`.
const launchesOf = (run) => examinerCalls(run).filter((c) => !c.label.endsWith('(retry)'))
const relaunchAnswers = (call) => (call.label === 'exam: examiner (relaunch)' ? EXAM : null)

test('R9: an Examiner that ends with no answer after writing tests is relaunched once with those tests, and the Lead is not asked to resume', async () => {
  const run = await go(ARGS, {
    examiner: relaunchAnswers,
    ops: (call, fallback) => (call.command.verb === 'recover' ? { feature: FEATURE, tests: LEFT } : fallback(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const calls = examinerCalls(run)
  assert.deepEqual(calls.map((c) => c.label), ['exam: examiner', 'exam: examiner (retry)', 'exam: examiner (relaunch)'])
  assert.equal(launchesOf(run).length, 2)
  assert.ok(calls[2].prompt.includes('c1.test.js') && calls[2].prompt.includes('c2.test.js'))
  assert.equal(opsCalls(run, 'store').length, 1)
  assert.equal(run.result.status, 'approved')
  assert.equal(run.result.exam.status, 'stored')
})

test('R10: an Examiner that does not finish twice gives one relaunch only, and the result lists the existing tests with their index mark', async () => {
  const run = await go(ARGS, {
    examiner: () => null,
    ops: (call, fallback) => (call.command.verb === 'recover' ? { feature: FEATURE, tests: LEFT } : fallback(call)),
  })
  assert.equal(launchesOf(run).length, 2)
  assert.equal(examinerCalls(run).length, 3, 'the first launch and its retry, then the relaunch with no retry')
  assert.equal(opsCalls(run, 'recover').length, 2)
  assert.equal(opsCalls(run, 'store').length, 0)
  assert.equal(run.result.exam.status, 'failed')
  assert.deepEqual(run.result.exam.tests.map((t) => [t.path, t.inIndex]), [['c1.test.js', true], ['c2.test.js', false]])
})

test('R10: an Examiner that ends with no answer and left no tests is not relaunched', async () => {
  const run = await go(ARGS, { examiner: () => null })
  assert.equal(launchesOf(run).length, 1)
  assert.equal(examinerCalls(run).length, 2, 'the launch and its own retry, and no relaunch')
  assert.equal(run.result.exam.status, 'failed')
})

test('R9: an external Examiner seat that already fell to the native one still gets one relaunch in total', async () => {
  // superdelegation on: the Examiner seat is started, and the default handler hands the round back (exit 3, handedBack('examiner')).
  const run = await go({ ...ARGS, superdelegation: 'on' }, {
    examiner: relaunchAnswers,
    ops: (call, fallback) => (call.command.verb === 'recover' ? { feature: FEATURE, tests: LEFT } : fallback(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(opsCalls(run, 'seat-start').filter((c) => c.command.rest[0] === 'examiner').length, 1)
  assert.deepEqual(launchesOf(run).map((c) => c.label), ['exam: examiner', 'exam: examiner (relaunch)'])
  assert.equal(opsCalls(run, 'store').length, 1)
  assert.equal(run.result.exam.status, 'stored')
})
```

Match the real names and shape of the failed exam result (`run.result.exam`, the `tests` entries and the index mark) with what `failedResult('examiner', …)` returns today (see lines 1685 to 1712 of the test file). Update that existing case to the new behaviour: its `recover` with `marks` now relaunches once, so it expects 3 examiner calls (the launch, its `(retry)`, the relaunch) and 2 `recover` calls where it expects 2 and 1 today; the case where `recover` fails keeps its single launch (2 calls with the retry). Count launches by label with `launchesOf`, which leaves out `(retry)`. `tests/ops-note.test.js` keeps its handlers green.

**Acceptance:**
- `node --test tests/workflow-design.test.js tests/ops-note.test.js tests/examiner-order.test.js tests/seat-exam-leak.test.js tests/seat-partial.test.js` passes; the new tests fail before the change.
- No path of the code launches an Examiner more than twice in total.

### Task 16: Design docs aligned with the flow, and the final check

**Aether:**
- Area: docs
- Owns: `plugins/aether/skills/designing/SKILL.md`, `docs/guide/design-seats.md`, `AGENTS.md`, `docs/reference/components.md`, `tests/design-docs-044.test.js`, `tests/designing-skill-043.test.js`
- Depends on: Task 15 — the docs describe the final flow
- Depends on: Task 11 — same `AGENTS.md`
- Depends on: Task 12 — `tests/docs-facts.test.js` must be settled before the final run
- Depends on: Task 4 — final run covers the reviewer change
- Depends on: Task 5 — final run covers the bootstrap size
- Depends on: Task 6 — final run covers the guard
- Depends on: Task 7 — final run covers the site
- Depends on: Task 8 — final run covers the refusal text
- Depends on: Task 9 — final run covers the quota brake
- Depends on: Task 10 — final run covers the delegate closing
- Serves: R3, R7, R9, R32

**Interfaces:**
- `skills/designing/SKILL.md` and `docs/guide/design-seats.md`: say, only where they describe the design flow today, that a spec of 15 requirements or more gets a code map before the plan, that a map that fails does not stop the design, that the native Writer writes the plan and the tasks in two calls (an external seat keeps one), and that an Examiner that ends without an answer after writing tests is relaunched once with those tests. Change nothing else.
- `AGENTS.md`: the list of agents of the Workflows paragraph adds `mapper`.
- `docs/reference/components.md`: the Agents row adds `mapper` (read-only, the cheapest rung).
- A page that already says something that contradicts the new flow is corrected; a page that does not mention the step is left as it is.

**Tests (write first):**

New file `tests/design-docs-044.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const designing = read('plugins/aether/skills/designing/SKILL.md')

test('R3: the designing skill says a spec of 15 requirements or more gets a code map before the plan, and a failed map does not stop the design', () => {
  assert.match(designing, /15 requirements/)
  assert.match(designing, /code map/)
  assert.match(designing, /map (that )?fails|without a map/)
})

test('R7: the designing skill says the native Writer writes the plan and the tasks in two calls', () => {
  assert.match(designing, /two calls/)
})

test('R9: the designing skill says an Examiner without an answer is relaunched once with its tests', () => {
  assert.match(designing, /relaunch(ed)? (it )?once/)
})

test('R4: AGENTS.md and the components page name the mapper agent', () => {
  assert.match(read('AGENTS.md'), /reviewer, ops|mapper/)
  assert.ok(read('AGENTS.md').includes('mapper'))
  assert.ok(read('docs/reference/components.md').includes('`mapper`'))
})
```

Keep `tests/designing-skill-043.test.js` and `tests/bootstrap-design.test.js` green (change the first only where the new text contradicts a pinned sentence).

**Acceptance:**
- `node --test tests/design-docs-044.test.js tests/designing-skill-043.test.js tests/agents-md.test.js tests/docs-facts.test.js tests/components-docs.test.js` passes; the new tests fail before the change.
- `npm test` passes in full, and `npm run check` passes (`npm test`, `npm run test:mod`, `npm run validate`) when the `claude` CLI is available; the report says which of the three ran (R32).
- Each requirement R1 to R31 that changed code or text has a test that fails without its change; R28 stands on the existing `approve` test and the Lead's closing of issue 196.
