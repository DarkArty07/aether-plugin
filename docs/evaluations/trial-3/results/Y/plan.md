# Aether Plan 4: Effort per Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. In Aether mode, the swarm (`/aether:run`) is a third option. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This is a contract plan (decision A10): each task gives its files, its interfaces, its failing tests in full and its acceptance, and the implementer writes the code. Task 7 is the Designer's own: a real headless session, run after Tasks 1–6 merge. To run Tasks 1–6 as a swarm, compile with `--only task-1,task-2,task-3,task-4,task-5,task-6`.
>
> The Aether blocks below use the v0.1 syntax (a tier with no effort, no Review line), because the `aether-plan` that checks and compiles this plan is v0.1.

**Goal:** Each plan task declares its implementer's starting effort and may raise its supervisor's; the swarm passes the effort on every implementer and supervisor call, and its ladder raises the effort before the model; the meter and `aether-report` show cost and time by effort; a real run checks from the transcripts that each call's effort reaches its agent.

**Architecture:** The effort policy lives in `lib/plan.js`. `aether-plan` validates each task's Tier and Review lines against it and passes the policy, and each task's resolved `effort` and `review`, to the workflow in the run arguments. The workflow derives each attempt's effort from the model and the attempts already used on it, and passes it to `agent()`. The usage meter records the `effort` that `turn.step` carries, `aether-report` groups cost and time by role, model and effort, and `scripts/check-effort.js` compares a real session's transcripts with what each call asked for.

**Tech Stack:** Node.js 22 with no dependencies (`node:test`), the Claude Code dynamic-workflow runtime, Claude Code mods (`claude-code/testing`).

**Spec:** `docs/superpowers/specs/2026-10-08-aether-effort-design.md`

## Global Constraints

- Node.js 22, no dependencies. Bins, libraries, scripts and tests are CommonJS; the usage meter (`hooks/register.js`) is an ES module.
- Effort levels are Claude Code's: `low`, `medium`, `high`, `xhigh`, `max`.
- Implementer policy, in climbing order, with defaults: haiku `medium`, `high`, `xhigh` (default `xhigh`); sonnet `high`, `xhigh` (default `high`); opus `high`, `xhigh` (default `xhigh`).
- Supervisor (Review): `high` or `xhigh`, default `high`.
- `max` is accepted only where a plan declares it. It is never a default and never a climbing step.
- Agent files hold only defaults: implementer `xhigh`, supervisor `high`, reviewer `high`, ops `low`. Ops and final-reviewer calls pass no effort.
- Labels: `task-N: implement on <model>/<effort> (attempt K)` and `task-N: supervise attempt K on sonnet/<effort>`.
- Plans written for v0.1 keep working: every existing test keeps passing, except the assertions a task names as changed.
- Documentation is in English (decision D13).

## Aether Execution

- Test command: `npm run check`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 120

## Review Focus

The inputs and conditions below follow from the spec, and no other test pins them. Each one has its test in the task that owns the code.
1. A task declared below its model's default, on a model whose ladder budget is 0, starts on the next model at that model's default. It never runs at an effort the next model refuses: `haiku medium` with `Ladder: haiku 0` starts on `sonnet/high` (Task 2).
2. A usage entry without a duration (`ms: null`, when the meter's clock failed) adds nothing to `byEffort.ms`, and never makes it `NaN` (Task 4).
3. Effort and Review words are accepted in any case and lowercased, like the tier: `Sonnet XHIGH`, `Review: XHIGH` (Task 1).
4. A session whose workflows also ran agents outside Aether: the check ignores them and checks only `aether:` agents (Task 5).
5. An approval that still lists a critical or important finding counts as a retry, and climbs the effort like any retry (Task 2).

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `plugins/aether/lib/plan.js` | 1 | The effort policy; parsing and validating the Tier and Review lines; effort in graph nodes and briefs |
| `plugins/aether/bin/aether-plan` | 1 | Puts the policy in the run arguments |
| `tests/plan-fixtures.js` | 1 | `task()` takes a `review` option |
| `tests/plan.test.js`, `tests/aether-plan.test.js` | 1 | Plan tests |
| `plugins/aether/workflows/run.workflow.js` | 2 | Effort per call, the climb, labels, rounds, prompts, argument checks |
| `plugins/aether/agents/implementer.md`, `supervisor.md` | 2 | Default effort `xhigh`; the supervisor's account of the ladder |
| `tests/workflow-harness.js`, `tests/workflow.test.js` | 2 | The harness records each call's effort; workflow scenarios |
| `plugins/aether/hooks/register.js`, `usage.test.ts` | 3 | The meter records `effort` |
| `plugins/aether/lib/report.js`, `tests/report.test.js`, `tests/report-fixtures.js` | 4 | `byEffort` and `climbed` |
| `scripts/check-effort.js`, `tests/check-effort.test.js` | 5 | Checks a real session's transcripts |
| Skills, README, decisions, v0.1 spec, `plugin.json` | 6 | Documents and version 0.2.0 |
| `docs/claude-code-research.md` | 7 | The data and the verification run's finding |

Waves: Tasks 1, 3, 4 and 5; then Task 2; then Tasks 6 and 7.

---

### Task 1: Effort in plans and compiled runs

**Aether:**
- Tier: haiku — exact error messages and outputs pin the parser and the compile step down
- Area: plan
- Owns: `plugins/aether/lib/plan.js`, `plugins/aether/bin/aether-plan`, `tests/plan.test.js`, `tests/aether-plan.test.js`, `tests/plan-fixtures.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/lib/plan.js`
- Modify: `plugins/aether/bin/aether-plan`
- Modify: `tests/plan-fixtures.js`, `tests/plan.test.js`, `tests/aether-plan.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces, from `plugins/aether/lib/plan.js`:
  - `module.exports = { TIERS, EFFORT_LEVELS, EFFORTS, REVIEW, parsePlan, buildGraph, renderBrief }`.
  - `EFFORT_LEVELS: string[]`, equal to `['low', 'medium', 'high', 'xhigh', 'max']`.
  - `EFFORTS: { [tier: 'haiku' | 'sonnet' | 'opus']: { steps: string[], default: string } }`, equal to `{ haiku: { steps: ['medium', 'high', 'xhigh'], default: 'xhigh' }, sonnet: { steps: ['high', 'xhigh'], default: 'high' }, opus: { steps: ['high', 'xhigh'], default: 'xhigh' } }`.
  - `REVIEW: { steps: string[], default: string }`, equal to `{ steps: ['high', 'xhigh'], default: 'high' }`.
  - Each task from `parsePlan` gains `effort: string | null` (declared, else the tier's default; `null` when the Tier line is invalid), `review: string` (declared, else `'high'`) and `reviewReason: string | null`.
  - Each `buildGraph` node gains `effort` and `review`.
  - `renderBrief` writes the header line `- Tier: <tier> <effort> — <tierReason>`.
- Produces, from `aether-plan compile`: the run arguments gain `efforts`, equal to `EFFORTS` and placed after `ladder`. Each task in `tasks` carries `effort` and `review`, from its graph node.
- `tests/plan-fixtures.js`: `task(n, { review })` adds the line `- Review: <review>` right after the Tier line when `review` is given. Task 2 uses it.

**Rules the tests pin:**
- **Tier line:** `- Tier: <tier> [<effort>] — <reason>`, with the dashes the parser already accepts. The tier and the effort are matched in any case and stored lowercased.
- **Allowed implementer efforts:** the tier's `steps`, plus `max`.
- **Review line:** `- Review: <effort> — <reason>`, with the effort in `REVIEW.steps` or `max`, in any case and stored lowercased.
- **One error per problem,** with exactly the texts in the tests:
  - an effort a tier refuses;
  - a word that is not an effort level;
  - a malformed Tier line, which replaces today's message;
  - an invalid Review line.
- **A Tier line with an error** leaves the task without a tier, as today, and adds no "missing Tier" error.

- [ ] **Step 1: Write the failing tests**

In `tests/plan-fixtures.js`, give `task()` the `review` option:

```js
function task(n, options = {}) {
  const {
    title = `Task ${n} title`,
    tier = 'haiku — complete code',
    review = null,
    area = 'core',
    owns = `\`src/t${n}/**\``,
    depends = 'none',
  } = options
  const dependsLines = (Array.isArray(depends) ? depends : [depends]).map((d) => `- Depends on: ${d}`)
  return [
    `### Task ${n}: ${title}`,
    '',
    '**Aether:**',
    `- Tier: ${tier}`,
    ...(review ? [`- Review: ${review}`] : []),
    `- Area: ${area}`,
    `- Owns: ${owns}`,
    ...dependsLines,
    '',
    '- [ ] **Step 1: Do the work**',
    '',
    '```bash',
    '## not a heading',
    '### Task 99: not a task either',
    '```',
    '',
  ].join('\n')
}
```

In `tests/plan.test.js`, import the new exports:

```js
const { parsePlan, buildGraph, renderBrief, EFFORT_LEVELS, EFFORTS, REVIEW } = require('../plugins/aether/lib/plan.js')
```

In the test `parsePlan reports missing and malformed Aether fields`, replace the two Tier assertions with:

```js
  assert.ok(errors.includes('Task 2: Tier must be haiku, sonnet or opus, optionally followed by an effort, then " — reason".'))
  assert.ok(errors.includes('Task 3: Tier must be haiku, sonnet or opus, optionally followed by an effort, then " — reason".'))
```

Append to `tests/plan.test.js`:

```js
test('the effort policy follows the data: allowed steps in climbing order, and the defaults', () => {
  assert.deepEqual(EFFORT_LEVELS, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(EFFORTS, {
    haiku: { steps: ['medium', 'high', 'xhigh'], default: 'xhigh' },
    sonnet: { steps: ['high', 'xhigh'], default: 'high' },
    opus: { steps: ['high', 'xhigh'], default: 'xhigh' },
  })
  assert.deepEqual(REVIEW, { steps: ['high', 'xhigh'], default: 'high' })
})

test('parsePlan reads an effort on the Tier line and a Review line, and fills in the defaults', () => {
  const parsed = parsePlan(plan([
    task(1),
    task(2, { tier: 'sonnet — UI work' }),
    task(3, { tier: 'opus — migration' }),
    task(4, { tier: 'haiku high — mechanical wiring', review: 'xhigh — file-system edge cases' }),
    task(5, { tier: 'Sonnet XHIGH — several modules meet', review: 'XHIGH — input parsing' }),
    task(6, { tier: 'opus max — the hardest proof', review: 'max — every branch matters' }),
  ]))
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(
    parsed.tasks.map((t) => [t.tier, t.effort, t.tierReason, t.review, t.reviewReason]),
    [
      ['haiku', 'xhigh', 'complete code', 'high', null],
      ['sonnet', 'high', 'UI work', 'high', null],
      ['opus', 'xhigh', 'migration', 'high', null],
      ['haiku', 'high', 'mechanical wiring', 'xhigh', 'file-system edge cases'],
      ['sonnet', 'xhigh', 'several modules meet', 'xhigh', 'input parsing'],
      ['opus', 'max', 'the hardest proof', 'max', 'every branch matters'],
    ],
  )
})

test('parsePlan refuses efforts a tier does not allow, and malformed Tier and Review lines', () => {
  const { errors } = parsePlan(plan([
    task(1, { tier: 'haiku low — x' }),
    task(2, { tier: 'sonnet medium — x' }),
    task(3, { tier: 'sonnet low — x' }),
    task(4, { tier: 'opus medium — x' }),
    task(5, { tier: 'haiku fast — x' }),
    task(6, { tier: 'haiku/xhigh — x' }),
    task(7, { review: 'medium — x' }),
    task(8, { review: 'xhigh' }),
    task(9, { review: 'deep — x' }),
  ]))
  assert.deepEqual(errors, [
    'Task 1: haiku does not implement at low: at 13 on Terminal-Bench 4 it is too weak. Use haiku medium, high or xhigh.',
    'Task 2: sonnet does not implement at medium: Haiku at xhigh does as well for a twentieth of the price. Use haiku xhigh, or sonnet high or xhigh.',
    'Task 3: sonnet does not implement at low: Haiku at xhigh does as well for a twentieth of the price. Use haiku xhigh, or sonnet high or xhigh.',
    'Task 4: opus does not implement at medium: Sonnet at high or xhigh does better for half the price. Use sonnet high or xhigh, or opus high or xhigh.',
    'Task 5: "fast" is not an effort level (low, medium, high, xhigh or max).',
    'Task 6: Tier must be haiku, sonnet or opus, optionally followed by an effort, then " — reason".',
    'Task 7: Review must be high, xhigh or max, followed by " — reason": the supervisor never reviews below high.',
    'Task 8: Review must be high, xhigh or max, followed by " — reason": the supervisor never reviews below high.',
    'Task 9: Review must be high, xhigh or max, followed by " — reason": the supervisor never reviews below high.',
  ])
})

test('buildGraph carries the starting effort and the review effort of each task', () => {
  const graph = buildGraph(parsePlan(plan([task(1), task(2, { tier: 'sonnet xhigh — x', review: 'xhigh — y' })])))
  assert.deepEqual(graph.errors, [])
  assert.deepEqual([graph.tasks['task-1'].effort, graph.tasks['task-1'].review], ['xhigh', 'high'])
  assert.deepEqual([graph.tasks['task-2'].effort, graph.tasks['task-2'].review], ['xhigh', 'xhigh'])
})

test('renderBrief shows the resolved starting effort on its Tier line', () => {
  const parsed = parsePlan(plan([task(1), task(2, { tier: 'sonnet — UI work' })]))
  const options = { planPath: '/p/plan.md', spec: parsed.spec, globalConstraints: parsed.globalConstraints }
  assert.match(renderBrief(parsed.tasks[0], options), /^- Tier: haiku xhigh — complete code$/m)
  assert.match(renderBrief(parsed.tasks[1], options), /^- Tier: sonnet high — UI work$/m)
})
```

Append to `tests/aether-plan.test.js`:

```js
test('compile passes the effort policy and the effort and review of each task to the workflow', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { tier: 'sonnet xhigh — integration', review: 'xhigh — edge cases' })]))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.efforts, {
    haiku: { steps: ['medium', 'high', 'xhigh'], default: 'xhigh' },
    sonnet: { steps: ['high', 'xhigh'], default: 'high' },
    opus: { steps: ['high', 'xhigh'], default: 'xhigh' },
  })
  assert.deepEqual([r.json.tasks['task-1'].effort, r.json.tasks['task-1'].review], ['xhigh', 'high'])
  assert.deepEqual([r.json.tasks['task-2'].effort, r.json.tasks['task-2'].review], ['xhigh', 'xhigh'])
  assert.match(fs.readFileSync(r.json.tasks['task-2'].brief, 'utf8'), /^- Tier: sonnet xhigh — integration$/m)
})

test('check refuses an effort the tier does not allow, with the reason', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { tier: 'sonnet medium — x' })]))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, [
    'Task 2: sonnet does not implement at medium: Haiku at xhigh does as well for a twentieth of the price. Use haiku xhigh, or sonnet high or xhigh.',
  ])
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/plan.test.js tests/aether-plan.test.js`
Expected: FAIL. `EFFORTS` and `EFFORT_LEVELS` are undefined, the Tier error has its old text, `effort` and `review` are missing, and the effort lines are refused as malformed.

- [ ] **Step 3: Implement within the Interfaces**

Make the tests pass within the Interfaces and the rules above. Keep the parser's existing structure: one branch per field in `parseAetherFields`, a fenced-code mask, and errors collected rather than thrown. Add the policy constants next to `TIERS`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/plan.test.js tests/aether-plan.test.js`
Expected: PASS.
Run: `npm run check`
Expected: PASS. The other suites compile plans through `tests/plan-fixtures.js` and still pass: plans written for v0.1 keep working.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/plan.js plugins/aether/bin/aether-plan tests/plan-fixtures.js tests/plan.test.js tests/aether-plan.test.js
git commit -m "feat(aether): declare each task's effort in the plan, and pass the policy to the run"
```

### Task 2: Effort on every swarm call, and the effort-first ladder

**Aether:**
- Tier: sonnet — the swarm's core loop, its prompts and two agent texts, across five files
- Area: swarm
- Owns: `plugins/aether/workflows/run.workflow.js`, `plugins/aether/agents/implementer.md`, `plugins/aether/agents/supervisor.md`, `tests/workflow-harness.js`, `tests/workflow.test.js`
- Depends on: Task 1 — the workflow tests compile plans, and the args must carry efforts, effort and review

**Files:**
- Modify: `plugins/aether/workflows/run.workflow.js`
- Modify: `plugins/aether/agents/implementer.md`, `plugins/aether/agents/supervisor.md`
- Modify: `tests/workflow-harness.js`, `tests/workflow.test.js`

**Interfaces:**
- Consumes (Task 1):
  - `args.efforts`: `{ haiku | sonnet | opus: { steps: string[], default: string } }`;
  - `args.tasks[id].effort` and `args.tasks[id].review`;
  - `task(n, { tier, review })` from `tests/plan-fixtures.js`.
- Produces:
  - Implementer calls: `agent(prompt, { agentType: 'aether:implementer', model, effort, phase: 'Implement', label: '<id>: implement on <model>/<effort> (attempt <n>)', schema })`.
  - Supervisor calls: `agent(prompt, { agentType: 'aether:supervisor', model: 'sonnet', effort: <task.review>, phase: 'Supervise', label: '<id>: supervise attempt <n> on sonnet/<task.review>', schema })`.
  - Ops and reviewer calls carry no `effort`.
  - Each round in the result gains `effort` (the implementer's) and `reviewEffort` (the task's `review` once a supervisor is called, else `null`).
  - `tests/workflow-harness.js` records `effort: opts.effort` on each call.

**Rules:**
- **The effort of an attempt on model `m`:** let `k` be the ladder attempts used on `m`, this one included. The merge retry does not count, so it keeps the previous attempt's effort.
  - Let `start` be the task's `effort` when `m` is the task's `tier`, and `efforts[m].default` otherwise.
  - If `start` is not in `efforts[m].steps` (a declared `max`), the effort is `start`.
  - Otherwise, it is the step `k − 1` places above `start`, capped at the last step.
  - It is computed from state the script already keeps: no new state.
- **The model moves as in v0.1:** when its attempts run out, or on an escalation, to the next model with attempts.
- **Prompts:**
  - The implementer prompt's second line becomes `Run <runId>, attempt <n>, on <model> at <effort> effort.`
  - The lines on earlier attempts become `- Attempt <n> on <model>/<effort>: <status>. <summary>`.
  - The supervisor prompt's first line ends with `Attempt <n> ran on <model> at <effort> effort.`
  - Its Ladder section keeps `Attempts used: …`, followed by one line made of two sentences:
    - `A retry runs on <model> at <effort>.`, or `A retry blocks the unit: the ladder is spent.`;
    - then `Escalate runs on <model> at <effort>.`, or `Escalate blocks the unit: the ladder is spent.`
    - A retry targets the same model at its next attempt's effort while that model has attempts left, and otherwise the next model with attempts, at its default. An escalation targets the next model with attempts, at its default.
- **Final reviewer:** its unit lines name the rungs of the unit's rounds, with consecutive repeats collapsed: `- <id> (<title>): <status> on <model>/<effort> → <model>/<effort>`.
- **Argument checks:** `readArgs` refuses the following, before any agent starts, with the usual `aether:run args` messages:
  - `efforts` without, for each tier, a non-empty `steps` list of effort levels and a `default` among them;
  - a task whose `effort` is neither in its tier's `steps` nor `max`;
  - a task whose `review` is not an effort level.
- **`meta.phases`:** the Implement detail becomes `an implementer per attempt, on the unit's current tier and effort`.

- [ ] **Step 1: Write the failing tests**

In `tests/workflow-harness.js`, record each call's effort: in `agent()`, add `effort: opts.effort,` to the `call` object, right after `model: opts.model,`.

Append to `tests/workflow.test.js`:

```js
// Task 1 on haiku with the defaults; Task 2 on sonnet at high, with its review raised to xhigh.
function twoTiers(t) {
  const repo = makeRepo(t)
  return compile(repo, plan([task(1), task(2, { tier: 'sonnet high — integration', review: 'xhigh — edge cases' })]))
}
const effortsOf = (run, role, unit) => run.calls.filter((c) => c.role === role && c.unit === unit).map((c) => `${c.model}/${c.effort}`)

test('each call carries its effort: the rung for the implementer, the review for the supervisor, none for ops and the reviewer', async (t) => {
  const run = await runWorkflow(twoTiers(t))
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(effortsOf(run, 'implementer', 'task-1'), ['haiku/xhigh'])
  assert.deepEqual(effortsOf(run, 'supervisor', 'task-1'), ['sonnet/high'])
  assert.deepEqual(effortsOf(run, 'implementer', 'task-2'), ['sonnet/high'])
  assert.deepEqual(effortsOf(run, 'supervisor', 'task-2'), ['sonnet/xhigh'])
  assert.equal(run.calls.filter((c) => c.role === 'ops' || c.role === 'reviewer').every((c) => c.effort === undefined), true)
  assert.deepEqual(
    run.calls.filter((c) => c.unit === 'task-2' && c.role !== 'ops').map((c) => c.label),
    ['task-2: implement on sonnet/high (attempt 1)', 'task-2: supervise attempt 1 on sonnet/xhigh'],
  )
  assert.deepEqual(run.result.units.map((u) => u.rounds.map((r) => [r.effort, r.reviewEffort])), [[['xhigh', 'high']], [['high', 'xhigh']]])
})

test('a retry raises the effort on the same model, and a spent model moves up at the next model default', async (t) => {
  const run = await runWorkflow(twoTiers(t), {
    supervisor: (call, approve) => (call.n <= 2 ? retry(`gap ${call.n}`) : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  // Haiku has no step above xhigh, so its second attempt stays there.
  assert.deepEqual(effortsOf(run, 'implementer', 'task-1'), ['haiku/xhigh', 'haiku/xhigh', 'sonnet/high'])
  assert.deepEqual(effortsOf(run, 'implementer', 'task-2'), ['sonnet/high', 'sonnet/xhigh', 'opus/xhigh'])
  assert.deepEqual(effortsOf(run, 'supervisor', 'task-2'), ['sonnet/xhigh', 'sonnet/xhigh', 'sonnet/xhigh'])
  assert.deepEqual(run.result.units.map((u) => u.tiers), [['haiku', 'sonnet'], ['sonnet', 'opus']])
  const third = run.calls.filter((c) => c.role === 'implementer' && c.unit === 'task-2')[2].prompt
  assert.match(third, /attempt 3, on opus at xhigh effort\./)
  assert.match(third, /- Attempt 1 on sonnet\/high: DONE\./)
  assert.match(third, /- Attempt 2 on sonnet\/xhigh: DONE\./)
  const review = run.calls.find((c) => c.role === 'reviewer').prompt
  assert.match(review, /- task-1 \(Task 1 title\): merged on haiku\/xhigh → sonnet\/high/)
  assert.match(review, /- task-2 \(Task 2 title\): merged on sonnet\/high → sonnet\/xhigh → opus\/xhigh/)
})

test('an escalation moves to the next model at its default effort, without climbing first', async (t) => {
  const escalate = { verdict: 'escalate', findings: [], ruling: 'Escalate: beyond this model.', guidance: 'rethink the design', question: '' }
  const run = await runWorkflow(twoTiers(t), {
    supervisor: (call, approve) => (call.unit === 'task-2' && call.n === 1 ? escalate : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(effortsOf(run, 'implementer', 'task-2'), ['sonnet/high', 'opus/xhigh'])
})

test('an approval that still lists an important finding climbs like any retry', async (t) => {
  const run = await runWorkflow(twoTiers(t), {
    supervisor: (call, approve) => (call.unit === 'task-2' && call.n === 1 ? { ...retry('missing edge case'), verdict: 'approve' } : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(effortsOf(run, 'implementer', 'task-2'), ['sonnet/high', 'sonnet/xhigh'])
})

test('the retry after a merge conflict keeps the model and the effort, and a declared max stays max', async (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1, { tier: 'sonnet max — the hardest part' }), task(2, { tier: 'haiku high — mechanical wiring' })]))
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => (call.unit === 'task-1' && call.n === 1 ? retry('gap') : approve(call)),
    ops: (call, wt) =>
      call.kind === 'ops:merge' && call.unit === 'task-2' && call.n === 1
        ? { merged: false, reason: 'conflict', files: ['src/t2/a.js'], detail: 'CONFLICT' }
        : wt(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(effortsOf(run, 'implementer', 'task-1'), ['sonnet/max', 'sonnet/max'])
  assert.deepEqual(effortsOf(run, 'implementer', 'task-2'), ['haiku/high', 'haiku/high'])
  assert.equal(run.result.units[1].status, 'merged')
})

test('a task whose own model has no attempts starts on the next model at that model default', async (t) => {
  const repo = makeRepo(t)
  const args = { ...compile(repo, plan([task(1, { tier: 'haiku medium — wiring' }), task(2)])), ladder: { haiku: 0, sonnet: 2, opus: 1 } }
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(effortsOf(run, 'implementer', 'task-1'), ['sonnet/high'])
})

test('the supervisor prompt names the rung it reviews and what a retry and an escalation would run next', async (t) => {
  const run = await runWorkflow(twoTiers(t), {
    supervisor: (call, approve) => (call.unit === 'task-2' && call.n === 1 ? retry('gap') : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const [first, second] = run.calls.filter((c) => c.role === 'supervisor' && c.unit === 'task-2').map((c) => c.prompt)
  assert.match(first, /Attempt 1 ran on sonnet at high effort\./)
  assert.match(first, /A retry runs on sonnet at xhigh\. Escalate runs on opus at xhigh\./)
  assert.match(second, /Attempt 2 ran on sonnet at xhigh effort\./)
  assert.match(second, /A retry runs on opus at xhigh\. Escalate runs on opus at xhigh\./)
  const haiku = run.calls.find((c) => c.role === 'supervisor' && c.unit === 'task-1').prompt
  assert.match(haiku, /A retry runs on haiku at xhigh\. Escalate runs on sonnet at high\./)
})

test('the supervisor prompt says when a verdict would block the unit', async (t) => {
  const run = await runWorkflow({ ...threeTasks(t), ladder: { haiku: 1, sonnet: 0, opus: 0 } })
  assert.equal(run.error, null, run.error && run.error.stack)
  const prompt = run.calls.find((c) => c.role === 'supervisor' && c.unit === 'task-1').prompt
  assert.match(prompt, /A retry blocks the unit: the ladder is spent\. Escalate blocks the unit: the ladder is spent\./)
})

test('invalid efforts in the args throw before any agent starts', async (t) => {
  const args = threeTasks(t)
  const one = args.tasks['task-1']
  const bad = [
    { ...args, efforts: undefined },
    { ...args, efforts: { ...args.efforts, sonnet: { steps: [], default: 'high' } } },
    { ...args, efforts: { ...args.efforts, opus: { steps: ['high', 'xhigh'], default: 'max' } } },
    { ...args, efforts: { ...args.efforts, haiku: { steps: ['medium', 'fast'], default: 'medium' } } },
    { ...args, tasks: { ...args.tasks, 'task-1': { ...one, effort: 'low' } } },
    { ...args, tasks: { ...args.tasks, 'task-1': { ...one, effort: undefined } } },
    { ...args, tasks: { ...args.tasks, 'task-1': { ...one, review: 'deep' } } },
  ]
  for (const input of bad) {
    const run = await runWorkflow(input)
    assert.match(String(run.error && run.error.message), /^aether:run/, JSON.stringify([input.efforts, input.tasks['task-1']]))
    assert.equal(run.calls.length, 0)
  }
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/workflow.test.js`
Expected: FAIL. Every call's `effort` is `undefined`, the labels and prompts have their v0.1 text, and the invalid efforts are accepted. The tests that existed before still pass.

- [ ] **Step 3: Implement within the Interfaces**

Make the tests pass within the Interfaces and the rules above. Two constraints:
- Keep the script deterministic: no clock, no random numbers.
- Pass `effort` to `agent()` only for the implementer and the supervisor.

Then edit the two agent files:
- `plugins/aether/agents/implementer.md`: the frontmatter `effort: medium` becomes `effort: xhigh`.
- `plugins/aether/agents/supervisor.md`, under "Rule on it":
  - the **retry** bullet becomes: `- **retry:** the attempt has findings the same model can fix. The next attempt runs on the same model, one effort step higher when there is one. Put what it must do in \`guidance\`.`
  - the **escalate** bullet's first line becomes `- **escalate:** a stronger model is needed, and the next attempt runs on the next model at its default effort:`. Its three sub-bullets stay.
  - the closing paragraph becomes:

    ```markdown
    The workflow enforces the ladder, and the message's Ladder section says what a retry and an escalation would run next:
    - a retry past the model's attempts moves up a model, at its default effort;
    - an escalation past the last model blocks;
    - an approval that still lists a critical or important finding counts as a retry.
    ```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/workflow.test.js`
Expected: PASS, the existing scenarios included.
Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/workflows/run.workflow.js plugins/aether/agents/implementer.md plugins/aether/agents/supervisor.md tests/workflow-harness.js tests/workflow.test.js
git commit -m "feat(aether): pass each call's effort, and climb the effort before the model"
```

### Task 3: The usage meter records each request's effort

**Aether:**
- Tier: haiku — one field and its tests
- Area: measure
- Owns: `plugins/aether/hooks/register.js`, `plugins/aether/hooks/usage.test.ts`
- Depends on: none

**Files:**
- Modify: `plugins/aether/hooks/register.js`
- Modify: `plugins/aether/hooks/usage.test.ts`

**Interfaces:**
- Consumes: the `turn.step` event's `effort`.
- Produces: each usage entry is `{ t, ms, agent, model, effort, input, output, cacheRead, cacheWrite }`. `effort` is the event's `effort`, or `null` when the event has none. Task 4 reads it.

- [ ] **Step 1: Write the failing tests**

In `plugins/aether/hooks/usage.test.ts`, the first test's expected entries gain `effort: null`:

```ts
  expect(part.entries).toEqual([
    { t: 1000, ms: 0, agent: null, model: 'claude-opus-5-5', effort: null, input: 10, output: 5, cacheRead: 100, cacheWrite: 50 },
    { t: 1000, ms: 0, agent: 'agent-1', model: 'claude-haiku-5-5', effort: null, input: 10, output: 5, cacheRead: 100, cacheWrite: 50 },
  ])
```

Append:

```ts
test('records the effort each request went out with', async ($, on) => {
  const writes = stubs(on)
  await step($, { effort: 'xhigh' })
  await step($, { model: 'claude-haiku-5-5', agentId: 'agent-1', effort: 'low' })
  await endTurn($)
  const part = files(writes)['/home/u/.local/share/aether-plugin/usage/s1/0.json']
  expect(part.entries.map((entry) => entry.effort)).toEqual(['xhigh', 'low'])
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm run --silent test:mod`
Expected: FAIL. The entries have no `effort`.

- [ ] **Step 3: Implement within the Interfaces**

Add `effort` to the entry that `turn.step` pushes. The meter only observes: a missing `effort` must never throw or change the request.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm run --silent test:mod`
Expected: PASS (6 tests).
Run: `npm run check`
Expected: PASS, strict validation included.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/hooks/register.js plugins/aether/hooks/usage.test.ts
git commit -m "feat(aether): record each request's effort in the usage meter"
```

### Task 4: The report shows cost and time by effort, and the climbs

**Aether:**
- Tier: haiku — exact tests pin two additions to the report
- Area: measure
- Owns: `plugins/aether/lib/report.js`, `tests/report.test.js`, `tests/report-fixtures.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/lib/report.js`
- Modify: `tests/report.test.js`, `tests/report-fixtures.js`

**Interfaces:**
- Consumes:
  - usage entries with `effort` (Task 3), absent in older files;
  - result rounds with `tier` and `effort` (Task 2), absent in older results.
- Produces:
  - **`byEffort`:** `cost.run` and `cost.session` gain `byEffort: { [key: string]: { usd: number, requests: number, outputTokens: number, ms: number } }`.
    - The key is `<role> <model> <effort>`, where `<role>` is the role `byRole` already uses (`main`, `aether:implementer`, …).
    - A missing model or effort reads `unknown`.
    - `ms` sums the entries' `ms` and skips those that are not numbers.
    - `usd` skips unpriced entries, as `byModel` does.
  - **`climbed`:** `quality` gains `climbed: number | null`. It counts the units that, in any launch, made an attempt at a higher effort than the attempt before it, on the same model.
    - Effort order: `low < medium < high < xhigh < max`.
    - It is `null` when there is no result, like the other counts.
  - `tests/report-fixtures.js` also exports `entry`.
- Do not import `lib/plan.js`: Task 1 changes it in the same wave. Keep the effort order in `report.js`.

- [ ] **Step 1: Write the failing tests**

In `tests/report-fixtures.js`, export `entry`:

```js
module.exports = { T0, MIN, OPUS, SONNET, HAIKU, entry, sampleResult, sampleUsage, writeUsage, finishedRun }
```

In `tests/report.test.js`:
- import `entry` too:

  ```js
  const { T0, MIN, OPUS, SONNET, HAIKU, entry, sampleUsage, writeUsage, finishedRun } = require('./report-fixtures.js')
  const { version } = require('../plugins/aether/.claude-plugin/plugin.json')
  ```

- in `report counts quality from the saved result, and runs the tests at integration`, add `climbed: 0,` right after `escalated: 1,`;
- in `report says so when the tests fail at integration, or when nothing was measured`, add `assert.equal(r.quality.climbed, null)`;
- in `finalize appends the record with versions, then removes the run and its leftovers`, read the version from the manifest, so that Task 6's version bump keeps it green:

  ```js
  assert.deepEqual(record.versions, { aether: version, superpowers: '6.4.1', claudeCode: '2.1.294' })
  ```

Append:

```js
test('report breaks the cost down by role, model and effort, with output tokens and request time', (t) => {
  const dataDir = useDataDir(t)
  writeUsage(dataDir, 'run-session', [
    {
      agents: {
        i1: { type: 'aether:implementer', description: 'task-1: implement on haiku/xhigh (attempt 1)' },
        i2: { type: 'aether:implementer', description: 'task-2: implement on sonnet/high (attempt 1)' },
        s1: { type: 'aether:supervisor', description: 'task-1: supervise attempt 1 on sonnet/high' },
      },
      entries: [
        { ...entry(1, OPUS, null, 'input'), effort: 'xhigh' },
        { ...entry(2, HAIKU, 'i1', 'output', 2000), effort: 'xhigh' },
        { ...entry(3, HAIKU, 'i1', 'output', null), effort: 'xhigh' },
        { ...entry(4, SONNET, 'i2', 'output', 4000), effort: 'high' },
        { ...entry(5, SONNET, 's1', 'input', 5000), effort: 'high' },
        entry(6, SONNET, 's1', 'input', 6000),
      ],
    },
  ])
  const { repo, args } = finishedRun(t)
  const { cost } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual(Object.keys(cost.run.byEffort).sort(), [
    'aether:implementer claude-haiku-5-5 xhigh',
    'aether:implementer claude-sonnet-5-5 high',
    'aether:supervisor claude-sonnet-5-5 high',
    'aether:supervisor claude-sonnet-5-5 unknown',
    'main claude-opus-5-5 xhigh',
  ])
  const haiku = cost.run.byEffort['aether:implementer claude-haiku-5-5 xhigh']
  close(haiku.usd, 1)
  // The request without a duration adds nothing to ms.
  assert.deepEqual([haiku.requests, haiku.outputTokens, haiku.ms], [2, 2e6, 2000])
  close(cost.run.byEffort['aether:implementer claude-sonnet-5-5 high'].usd, 10)
  close(cost.run.byEffort['aether:supervisor claude-sonnet-5-5 high'].usd, 2)
  close(cost.run.byEffort['main claude-opus-5-5 xhigh'].usd, 4)
  assert.equal(cost.run.byEffort['aether:supervisor claude-sonnet-5-5 unknown'].ms, 6000)
  assert.deepEqual(cost.session.byEffort, cost.run.byEffort)
})

test('report counts the units that climbed an effort step on the same model', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const round = (tier, effort) => ({ tier, effort, verdict: 'retry', findings: [] })
  writeJson(path.join(args.runDir, 'result.json'), {
    units: [
      { id: 'task-1', status: 'merged', tiers: ['sonnet'], attempts: 2, rounds: [round('sonnet', 'high'), round('sonnet', 'xhigh')] },
      { id: 'task-2', status: 'merged', tiers: ['haiku', 'sonnet'], attempts: 2, rounds: [round('haiku', 'xhigh'), round('sonnet', 'high')] },
      { id: 'task-3', status: 'merged', tiers: ['haiku'], attempts: 2, rounds: [round('haiku', 'xhigh'), round('haiku', 'xhigh')] },
    ],
    finalReview: { status: 'skipped', reason: 'test' },
    agents: { total: 9 },
  })
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.equal(quality.climbed, 1)
  assert.equal(quality.escalated, 1)
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/report.test.js`
Expected: FAIL. `byEffort` is undefined, and `quality` has no `climbed`.

- [ ] **Step 3: Implement within the Interfaces**

Add the `byEffort` grouping to `summarize()` and the `climbed` count to `qualityOf()`. Include `climbed` in the list of counts that read `null` when no result exists.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/report.test.js`
Expected: PASS.
Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/report.js tests/report.test.js tests/report-fixtures.js
git commit -m "feat(aether): report cost and time by effort, and the units that climbed"
```

### Task 5: `check-effort`, the transcript check for a real run

**Aether:**
- Tier: haiku — a new script whose behavior exact tests pin down
- Area: verify
- Owns: `scripts/check-effort.js`, `tests/check-effort.test.js`
- Depends on: none

**Files:**
- Create: `scripts/check-effort.js`
- Create: `tests/check-effort.test.js`

**Interfaces:**
- Consumes the files Claude Code keeps for a session, `<session dir>` being `~/.claude/projects/<project>/<session id>/`:
  - `<session dir>/subagents/workflows/<workflow>/agent-<id>.meta.json` holds `{ agentType, description, model }`, where `description` is the workflow label;
  - beside it, `agent-<id>.jsonl` has one JSON row per line. Rows with `type: "assistant"` carry `effort` and `message.model`.
- Consumes the agent files: `<agents dir>/<name>.md`, whose frontmatter has an `effort:` line.
- Produces the CLI `node scripts/check-effort.js <session dir> [--report <file>] [--agents <dir>]`:
  - `--agents` defaults to `plugins/aether/agents`, resolved from the script's own directory.
  - `--report` names a JSON file holding `aether-report` output; the script reads its `cost.run.byEffort`.
  - It prints one line of JSON: `{ ok: boolean, agents: Agent[], report: null | { ok: boolean, missing: string[], extra: string[] }, errors: string[] }`.
  - It exits 0 when `ok`, and 1 otherwise.
  - `Agent` is `{ id, type, label, expected, seen, models, ok }`:
    - `id` comes from the file name;
    - `expected` is the effort after `on <model>/` in the label, else the agent file's `effort:` for `aether:<name>`, else `null`;
    - `seen` holds the distinct `effort` values of the assistant rows, in order;
    - `models` holds the distinct `message.model` values;
    - `ok` means `expected` is set and `seen` equals `[expected]`.
  - Only agents whose `agentType` starts with `aether:` are checked. They are sorted by workflow directory, then by file name.
  - **The report check:**
    - `missing` lists the `<agentType> <model> <effort>` triples of the assistant rows that `byEffort` lacks;
    - `extra` lists the `aether:` keys of `byEffort` that no row has;
    - both lists are sorted.
  - `ok` is false when there is any error, when no `aether:` agent was found, when any agent is not ok, or when the report check fails.
  - **Errors:**
    - no `aether:` agent found: `no aether workflow agents under <session dir>/subagents/workflows`;
    - no session directory given: `usage: check-effort <session dir> [--report <file>] [--agents <dir>]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/check-effort.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, runBin } = require('./helpers.js')

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-effort.js')

// A session directory with one workflow, whose agents recorded the given efforts.
function session(t, agents) {
  const dir = tempDir(t, 'aether-session-')
  const wf = path.join(dir, 'subagents', 'workflows', 'wf_test')
  fs.mkdirSync(wf, { recursive: true })
  for (const a of agents) {
    fs.writeFileSync(path.join(wf, `agent-${a.id}.meta.json`), JSON.stringify({ agentType: a.type, description: a.label, model: a.alias }))
    const rows = [{ type: 'user', message: { role: 'user', content: 'go' } }]
    for (const effort of a.efforts) rows.push({ type: 'assistant', effort, message: { model: a.model, content: [] } })
    fs.writeFileSync(path.join(wf, `agent-${a.id}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  }
  return dir
}

function agentsDir(t) {
  const dir = tempDir(t, 'aether-agents-')
  fs.writeFileSync(path.join(dir, 'implementer.md'), '---\nname: implementer\nmodel: haiku\neffort: xhigh\n---\n\nBody.\n')
  fs.writeFileSync(path.join(dir, 'ops.md'), '---\nname: ops\nmodel: haiku\neffort: low\n---\n\nBody.\n')
  return dir
}

const implementer = (efforts) => ({
  id: 'a1',
  type: 'aether:implementer',
  label: 'task-1: implement on sonnet/high (attempt 1)',
  alias: 'sonnet',
  model: 'claude-sonnet-5-5',
  efforts,
})
const ops = { id: 'a2', type: 'aether:ops', label: 'task-1: merge', alias: 'haiku', model: 'claude-haiku-5-5', efforts: ['low'] }
const outsider = { id: 'a3', type: 'general-purpose', label: 'explore the repo', alias: 'opus', model: 'claude-opus-5-5', efforts: ['xhigh'] }

test('passes when every agent ran at the effort its label asked for, or at its file default', (t) => {
  const r = runBin(SCRIPT, [session(t, [implementer(['high', 'high']), ops]), '--agents', agentsDir(t)], process.cwd())
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.ok, true)
  assert.deepEqual(
    r.json.agents.map((a) => [a.label, a.expected, a.seen, a.ok]),
    [
      ['task-1: implement on sonnet/high (attempt 1)', 'high', ['high'], true],
      ['task-1: merge', 'low', ['low'], true],
    ],
  )
  assert.deepEqual(r.json.agents[0].models, ['claude-sonnet-5-5'])
  assert.equal(r.json.report, null)
})

test('fails when an agent ran at another effort than the one it asked for', (t) => {
  const r = runBin(SCRIPT, [session(t, [implementer(['xhigh']), ops]), '--agents', agentsDir(t)], process.cwd())
  assert.equal(r.status, 1)
  assert.equal(r.json.ok, false)
  const agent = r.json.agents.find((a) => a.type === 'aether:implementer')
  assert.deepEqual([agent.expected, agent.seen, agent.ok], ['high', ['xhigh'], false])
})

test('with --report, the aether keys of the meter must match the transcripts', (t) => {
  const dir = session(t, [implementer(['high']), ops])
  const reportFile = path.join(tempDir(t), 'report.json')
  const byEffort = {
    'main claude-opus-5-5 xhigh': {},
    'aether:implementer claude-sonnet-5-5 high': {},
    'aether:ops claude-haiku-5-5 low': {},
  }
  fs.writeFileSync(reportFile, JSON.stringify({ cost: { run: { byEffort } } }))
  let r = runBin(SCRIPT, [dir, '--agents', agentsDir(t), '--report', reportFile], process.cwd())
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.report, { ok: true, missing: [], extra: [] })
  delete byEffort['aether:ops claude-haiku-5-5 low']
  byEffort['aether:supervisor claude-sonnet-5-5 xhigh'] = {}
  fs.writeFileSync(reportFile, JSON.stringify({ cost: { run: { byEffort } } }))
  r = runBin(SCRIPT, [dir, '--agents', agentsDir(t), '--report', reportFile], process.cwd())
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.report, { ok: false, missing: ['aether:ops claude-haiku-5-5 low'], extra: ['aether:supervisor claude-sonnet-5-5 xhigh'] })
})

test('checks only aether agents, and fails when none ran', (t) => {
  let r = runBin(SCRIPT, [session(t, [implementer(['high']), outsider]), '--agents', agentsDir(t)], process.cwd())
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json.agents.map((a) => a.type), ['aether:implementer'])
  const dir = session(t, [outsider])
  r = runBin(SCRIPT, [dir, '--agents', agentsDir(t)], process.cwd())
  assert.equal(r.status, 1)
  assert.equal(r.json.ok, false)
  assert.deepEqual(r.json.errors, [`no aether workflow agents under ${path.join(dir, 'subagents', 'workflows')}`])
})

test('fails with its usage when no session directory is given', (t) => {
  const r = runBin(SCRIPT, [], process.cwd())
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['usage: check-effort <session dir> [--report <file>] [--agents <dir>]'])
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/check-effort.test.js`
Expected: FAIL. `scripts/check-effort.js` does not exist, so the runs exit with an error and print no JSON.

- [ ] **Step 3: Implement within the Interfaces**

Write `scripts/check-effort.js`:
- a Node script with the shebang `#!/usr/bin/env node`, `'use strict'` and no dependencies;
- a one-line comment that says what it checks;
- unreadable rows or files are skipped, never fatal.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/check-effort.test.js`
Expected: PASS.
Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-effort.js tests/check-effort.test.js
git commit -m "feat(aether): add check-effort, which checks a real run's efforts from its transcripts"
```

### Task 6: Documents and version 0.2.0

**Aether:**
- Tier: sonnet — prose across six documents that no test pins down exactly
- Area: docs
- Owns: `plugins/aether/skills/**`, `README.md`, `docs/decisions.md`, `docs/superpowers/specs/2026-10-07-aether-plugin-design.md`, `plugins/aether/.claude-plugin/plugin.json`
- Depends on: Task 1 — documents the Tier and Review lines and their refusals
- Depends on: Task 2 — documents the per-call effort and the effort-first ladder
- Depends on: Task 3 — documents the meter's effort field
- Depends on: Task 4 — documents byEffort and climbed, and its test reads the version this task bumps
- Depends on: Task 5 — documents check-effort

**Files:**
- Modify: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`
- Modify: `README.md`, `docs/decisions.md`, `docs/superpowers/specs/2026-10-07-aether-plugin-design.md`
- Modify: `plugins/aether/.claude-plugin/plugin.json`

**Interfaces:**
- Consumes the names the other tasks produce:
  - the Tier and Review lines, and the refusals (Task 1);
  - labels, `effort` and `reviewEffort` (Task 2);
  - the meter's `effort` (Task 3);
  - `byEffort` and `climbed` (Task 4);
  - `scripts/check-effort.js` (Task 5).
- The effort design spec (`docs/superpowers/specs/2026-10-08-aether-effort-design.md`) is the source for every statement. Write in the existing documents' style: short sentences, lists, no marketing.

**What each document must say** (exact strings are in backticks):
1. **`plugins/aether/skills/using-aether/SKILL.md`**, the bootstrap injected at every session start. Keep `# Aether mode`, `aether-plan check` and "`aether:swarm` skill": `tests/session-start.test.js` checks them.
   - The example block's Tier line becomes `- Tier: haiku xhigh — exact tests and interfaces pin the task down`.
   - **Tier** is the model, then the effort its implementer starts at, then " — " and the reason. Ask the Designer to weigh each task's complexity and declare both.
   - Each tier keeps its current "when to use" rule, and gains its effort guidance:
     - **haiku:** `xhigh` by default; `high` or `medium` for mechanical work, such as constants, wiring or renames, where speed matters more.
     - **sonnet:** `high` by default; `xhigh` when several modules meet, or when the logic is subtle and the tests leave it open. Never `low` or `medium`: Haiku at `xhigh` does as well for a twentieth of the price.
     - **opus:** `xhigh` by default; `high` when the risk is clear-cut and speed matters.
   - `max` only with a reason: it thinks for 4 to 9 minutes before each answer.
   - **Review** is optional: `- Review: xhigh — reason` raises the task's supervisor from `high` to `xhigh`. Add it when behavior beyond the tests matters: the file system, input parsing, security, data loss, concurrency or UI states.
   - **The ladder:** the swarm raises the effort before the model. A retry runs one effort step higher on the same model. An escalation, or a model's spent attempts, moves the unit to the next model at its default effort.
   - In section 4, the swarm implements the tasks "on their tiers and efforts".
2. **`plugins/aether/skills/swarm/SKILL.md`:**
   - Each unit works on its tier and effort.
   - The units' `rounds` carry each attempt's `effort` and the supervisor's `reviewEffort`.
   - The report's `cost` adds `byEffort` (by role, model and effort, with output tokens and request time), and its `quality` adds `climbed`.
   - "Report to the owner" names the units merged, climbed, escalated and blocked, and the time and cost by model and by effort.
3. **`README.md`:**
   - **Swarm bullet:** implementers work on Haiku at `xhigh` effort by default. Each task declares its model and effort, and a unit that keeps failing climbs to a higher effort, then to Sonnet or Opus.
   - **Status:** "Version 0.2.", plus a v0.2 bullet (effort per task, the effort-first ladder, cost and time by effort) that links the effort design spec. The design line also links that spec.
   - **Diagram:**
     - the plan's fields become "tier and effort, review, area, owned files, dependencies";
     - the implementer line becomes `implementer (haiku/xhigh → sonnet/high → sonnet/xhigh → opus/xhigh) ⇄ supervisor (sonnet, high or xhigh): approve, retry, escalate or block`.
   - **Usage meter row:** "agent, model, effort, tokens and time".
   - **Plan example:** its Tier line becomes `- Tier: haiku xhigh — exact tests and interfaces pin the task down`.
   - **Development:** add `node scripts/check-effort.js <session dir> [--report <file>]`, which checks from a real session's transcripts that each swarm call's effort reached its agent.
   - **Documentation:** link the effort design, add Plan 4 to the plans, and name A1–A11.
   - **Lessons:** "Each task's tier picks its model and its effort."
   - **Principle 3:** "The task chooses the model and the effort. The plan sets each task's start, and failures move a unit up the ladder: the effort first, then the model."
4. **`docs/decisions.md`:**
   - The intro mentions A11, from the effort design of 2026-10-08.
   - D5 gains `**Update (2026-10-08, v0.2).**`: each task also declares the effort its implementer starts at, and may raise its supervisor's with `Review:`; the ladder raises the effort before the model; see A11.
   - The table's heading becomes "Decisions of the design specs". Its sentence says the owner took A1–A10 with the design spec of 2026-10-07, and A11 with the effort design of 2026-10-08.
   - The A11 row: each plan task declares its implementer's effort next to its tier, and may raise its supervisor's; the ladder raises the effort before the model; the defaults come from Artificial Analysis data (Haiku `xhigh`, Sonnet `high`, Opus `xhigh`, reviews `high`); `max` only when a plan declares it. Status: "Decided 2026-10-08; v0.2".
5. **`docs/superpowers/specs/2026-10-07-aether-plugin-design.md`**, the v0.1 spec. Amend it as Plans 2 and 3 did, with links to the effort design:
   - **Status line:** amended on 2026-10-08 by the effort design (§6, §7, §8, §10 and §12).
   - **§6:** an italic amendment paragraph:
     - the Tier line may name the starting effort, and `Review:` raises the supervisor's;
     - the defaults;
     - what `aether-plan` refuses;
     - `max` only where declared.
   - **§7:**
     - the implementer runs on the unit's current tier and effort;
     - the supervisor runs at the task's review effort;
     - rounds carry `effort` and `reviewEffort`;
     - the runtime call form gains `effort`, which the implementer and supervisor calls pass and ops and the final reviewer omit.
   - **§8:**
     - a ladder sub-bullet: a retry runs one effort step higher on the same model, and a spent model or an escalation moves to the next model at its default effort;
     - the "**Effort** is set in each agent definition…" bullet is replaced by the v0.2 rule: per-call effort from the plan and the policy, and agent files that hold only defaults (implementer `xhigh`, supervisor and reviewer `high`, ops `low`).
   - **§10:**
     - meter entries hold the effort;
     - the report's cost adds `byEffort`, and its quality adds `climbed`.
   - **§12:** `tests/check-effort.test.js`, and the effort verification run (effort design §9).
6. **`plugins/aether/.claude-plugin/plugin.json`:** `"version": "0.2.0"`.

- [ ] **Step 1: Write the documents**

Apply each change above.

- [ ] **Step 2: Check them**

Run: `npm run check`
Expected: PASS. The session-start test still finds the bootstrap's key lines, and the finalize test reads the new version.
Run: `grep -c "Tier: haiku xhigh" README.md plugins/aether/skills/using-aether/SKILL.md`
Expected: at least 1 for each file.
Run: `grep -c '"version": "0.2.0"' plugins/aether/.claude-plugin/plugin.json`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add plugins/aether/skills README.md docs/decisions.md docs/superpowers/specs/2026-10-07-aether-plugin-design.md plugins/aether/.claude-plugin/plugin.json
git commit -m "docs(aether): document effort per task, and release 0.2.0"
```

### Task 7: The verification run (the Designer's)

**Aether:**
- Tier: opus — the Designer runs it: a real headless session with a spending cap
- Area: verify
- Owns: `docs/claude-code-research.md`
- Depends on: Task 1 — compiles the fixture plan with efforts and a Review line
- Depends on: Task 2 — the workflow must pass each call's effort
- Depends on: Task 3 — the meter must record the effort
- Depends on: Task 4 — the report's byEffort is cross-checked
- Depends on: Task 5 — check-effort reads the transcripts

**Files:**
- Modify: `docs/claude-code-research.md`

**Interfaces:**
- Consumes everything that Tasks 1–5 produce.
- Produces: a recorded finding on whether each call's effort reaches its agent.

**Rules:**
- Run every command from the integration worktree that holds Tasks 1–6.
- Never `cd` into the fixture in the Designer's own shell. The session runs in a subshell.
- Delete the fixture and its Claude Code project folder when done.

- [ ] **Step 1: Build the fixture**

```bash
REPO=$(git rev-parse --show-toplevel)
F=$HOME/.cache/aether-effort-check
test ! -e "$F" || { echo "fixture exists: $F"; exit 1; }
mkdir -p "$F/repo" "$F/data"
git -C "$F/repo" init -q -b main
git -C "$F/repo" config user.name 'Aether Verify'
git -C "$F/repo" config user.email 'aether-verify@example.invalid'
git -C "$F/repo" config commit.gpgsign false
printf '%s\n' '.worktrees/' 'node_modules/' > "$F/repo/.gitignore"
printf '%s\n' '{' '  "name": "effort-fixture",' '  "private": true,' '  "scripts": { "test": "node --test" }' '}' > "$F/repo/package.json"
git -C "$F/repo" add -A
git -C "$F/repo" commit -q -m 'Add the fixture project'
git -C "$F/repo" worktree add -q "$F/repo/.worktrees/trial" -b feature/trial
mkdir -p "$F/repo/.worktrees/trial/docs"
```

Write `$F/repo/.worktrees/trial/docs/plan.md` with exactly this content:

````markdown
# Effort fixture Implementation Plan

**Goal:** Two tiny functions, to check that each swarm call's effort reaches its agent.

## Global Constraints

- Node.js 22, CommonJS, no dependencies. Tests use `node:test` and `node:assert/strict`, live in `test/`, and run with `npm test`.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 30

---

### Task 1: Add two numbers

**Aether:**
- Tier: haiku — one exact test pins it down
- Area: math
- Owns: `src/add.js`, `test/add.test.js`
- Depends on: none

**Interfaces:** `src/add.js` exports `{ add }`, where `add(a: number, b: number): number`.

**Failing tests:** write `test/add.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { add } = require('../src/add.js')

test('add sums two numbers', () => {
  assert.equal(add(2, 3), 5)
})
```

**Implementation:** make the test pass within the Interfaces.

**Acceptance:** `npm test` passes.

### Task 2: Join words

**Aether:**
- Tier: sonnet high — the check needs an effort that differs from both agent files
- Review: xhigh — the check needs a raised review
- Area: text
- Owns: `src/join.js`, `test/join.test.js`
- Depends on: none

**Interfaces:** `src/join.js` exports `{ join }`, where `join(words: string[]): string` joins the words with single spaces.

**Failing tests:** write `test/join.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { join } = require('../src/join.js')

test('join puts one space between words', () => {
  assert.equal(join(['a', 'b', 'c']), 'a b c')
})
```

**Implementation:** make the test pass within the Interfaces.

**Acceptance:** `npm test` passes.
````

Then commit it, and check it:

```bash
git -C "$F/repo/.worktrees/trial" add docs/plan.md
git -C "$F/repo/.worktrees/trial" commit -q -m 'Add the approved plan'
node "$REPO/plugins/aether/bin/aether-plan" check "$F/repo/.worktrees/trial/docs/plan.md"
```

Expected: `{"ok":true,"tasks":2,"waves":[["task-1","task-2"]],"warnings":[]}`

- [ ] **Step 2: Run the session**

```bash
PROMPT=$(sed "s#REPORT_PATH#$F/report.json#" <<'EOF'
You are in Aether mode, and you are the Designer. This is an unattended verification run: do not ask questions.

The owner has approved the plan `docs/plan.md` and chose the swarm to execute it. You are already in the integration worktree, on branch `feature/trial`. Do not create another worktree.

Load the `aether:swarm` skill and follow it: compile the plan, launch the `aether:run` workflow with the compiled JSON, and save its result as the skill says. Then run `aether-report --run <runId> --no-tests` and save its output to REPORT_PATH. Then run `aether-report finalize --run <runId>`. Do not act on findings, do not fix anything, do not merge into main, and do not push.

End with the run id and each unit's status.
EOF
)
( cd "$F/repo/.worktrees/trial" && AETHER_DATA_DIR="$F/data" ENABLE_CLAUDEAI_MCP_SERVERS=false timeout 3600 claude -p "$PROMPT" --model opus --permission-mode bypassPermissions --strict-mcp-config --max-budget-usd 5 --output-format json --plugin-dir "$REPO/plugins/aether" --settings '{"enableWorkflows": true}' > "$F/out.json" 2> "$F/err.txt" )
echo "exit $?"
```

Expected: `exit 0`. `$F/out.json` holds `session_id` and `total_cost_usd`, and `$F/report.json` exists.

- [ ] **Step 3: Check the efforts from the transcripts**

```bash
SESSION=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).session_id)' "$F/out.json")
SESSION_DIR=$(ls -d "$HOME"/.claude/projects/*/"$SESSION")
node "$REPO/scripts/check-effort.js" "$SESSION_DIR" --report "$F/report.json"
```

Expected: exit 0, with `"ok":true` and `"report":{"ok":true,"missing":[],"extra":[]}`. The agents include:
- `task-1: implement on haiku/xhigh (attempt 1)`, which expects and saw `xhigh`;
- `task-1: supervise attempt 1 on sonnet/high`, `high`;
- `task-2: implement on sonnet/high (attempt 1)`, `high`, although the implementer file says `xhigh`;
- `task-2: supervise attempt 1 on sonnet/xhigh`, `xhigh`, although the supervisor file says `high`;
- the ops agents, `low`, and `final review`, `high`, from their files.

Retries add attempts with their own rungs, and every one must match. If the check fails on a call's effort, stop here, record what it printed in Step 4, and bring the fallback of the effort design §9 to the owner as a follow-up.

- [ ] **Step 4: Record the finding**

Add this section to `docs/claude-code-research.md`, after "Plans 2 and 3 findings (2026-10-08)":

```markdown
## Effort (2026-10-08)

**Artificial Analysis data**, as given by the owner on 2026-10-08. Each cell gives the Intelligence Index, the Terminal-Bench 4 score and the seconds of thinking before the answer.

| | low | medium | high | xhigh | max |
|---|---|---|---|---|---|
| Haiku 5.5 | 29.4 / 13 / 4 | 34.5 / 15 / 9 | 37.8 / 22 / 15 | 41.2 / 29 / 47 | 43.4 / 33 / 278 |
| Sonnet 5.5 | 35.9 / 21 / 1 | 40.8 / 30 / 1 | 46.8 / 44 / 7 | 51.9 / 57 / 15 | 56.0 / 64 / 271 |
| Opus 5.5 | 42.3 / 31 / 5 | 51.2 / 53 / 13 | 53.6 / 57 / 20 | 56.0 / 60 / 78 | 57.6 / 60 / 561 |

| Topic | Result |
|---|---|
| Effort in transcripts | Each assistant row of an agent's transcript records `effort` and `perTurnEffort`. The `agent-<id>.meta.json` beside it records `agentType`, `description` (the workflow label) and `model`. Workflow agents live under `<session>/subagents/workflows/<workflow>/`. |
| Agent files (trial 2, v0.1) | A workflow agent with an `agentType` runs at its agent file's `effort` when the call names none: implementers at `medium` on Haiku and on Sonnet, supervisors and the reviewer at `high`, ops at `low`. |
```

Then add two rows to its table, with what Steps 2 and 3 printed:
- **`agent()` with `effort`:** the Claude Code version from the agents' transcript rows; the number of agents checked; whether every call's effort reached its agent, and which did not; that ops and the final reviewer ran at their files' effort; and the session's `total_cost_usd`.
- **`turn.step` effort:** whether the meter's `byEffort` keys matched the transcripts, as `check-effort --report` printed.

- [ ] **Step 5: Clean up**

```bash
case "$SESSION_DIR" in *aether-effort-check*) rm -rf "$(dirname "$SESSION_DIR")" ;; *) echo "not the fixture's project folder: $SESSION_DIR" ;; esac
rm -rf "$F"
git worktree prune
```

Expected: `$F` and the fixture's project folder are gone. `git worktree list` in this repository shows no fixture worktree.

- [ ] **Step 6: Commit**

```bash
git add docs/claude-code-research.md
git commit -m "docs(aether): record the effort data and the verification run"
```

## Done when

- `npm run check` passes on the integration branch.
- The verification run's finding is recorded, with each call's effort confirmed or the fallback raised with the owner.
- The documents describe v0.2, and `plugin.json` says 0.2.0.
