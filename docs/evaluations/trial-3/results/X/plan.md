# Effort Routing Implementation Plan

> **For agentic workers:** this plan is written for the Aether swarm (`/aether:run`). It can also run with superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. Each task gives its contract (A10): the Interfaces, the failing tests in full, and the acceptance. The implementer writes the code.

**Goal:** Route the Aether swarm by model and effort together:
- a per-task effort on the plan's Tier line;
- a ladder of model+effort rungs;
- the effort on every agent call;
- the effort in the usage meter and in `aether-report`.

**Architecture:**
- `lib/plan.js` and `aether-plan compile` read the effort and the rungs, and resolve each task's effort into the run's args.
- `/aether:run` builds each unit's path over the rungs, and passes the model and the effort on every `agent()` call.
- The usage meter records the effort of each request, and `aether-report` breaks cost down by effort and lists each agent.
- The agent files, the skills and the docs follow.

**Tech Stack:** Node.js 22, CommonJS bins and libs, `node:test`, Claude Code dynamic workflows and mods.

**Spec:** `docs/superpowers/specs/2026-10-08-effort-routing-design.md`

## Global Constraints

- **Code:**
  - Node.js 22, with no dependencies. The bins, libs and `tests/` are CommonJS.
  - The hooks module `plugins/aether/hooks/register.js` is an ES module, and its tests (`plugins/aether/hooks/usage.test.ts`) run with `claude plugin test plugins/aether`.
- **The workflow script** `plugins/aether/workflows/run.workflow.js`:
  - `export const meta` stays its first statement;
  - it uses no `Date.now()`, `Math.random()`, `import()` or file system;
  - every `agent()` call passes an `agentType`.
- **Vocabulary:**
  - Models, in order: `haiku`, `sonnet`, `opus`.
  - Efforts, in order: `low`, `medium`, `high`, `xhigh`, `max`.
  - A rung's name is `<model> <effort>`, such as `sonnet xhigh`.
  - One rung is stronger than another when its model comes later, or when its model is the same and its effort is higher.
- **Defaults:**
  - A ladder entry without an effort takes its model's default effort: `haiku xhigh`, `sonnet high`, `opus xhigh`.
  - The default ladder: `haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1`.
  - Refused implementer pairs: `sonnet low`, `sonnet medium`, `opus low`, `opus medium`. `max` is allowed when a plan names it.
- **Per role:**
  - the supervisor runs on `sonnet` at `xhigh`;
  - the reviewer on `opus` at `high`;
  - ops on `haiku` at `low`;
  - an implementer at its current step's model and effort.
- **The usage meter only observes.** A failure in it never changes, delays past a write, or blocks a request.
- **Specs and plans are off limits.** No task changes files under `docs/superpowers/specs/` or `docs/superpowers/plans/`.
- **Exact text is a requirement.** Exact text in a task (messages, prompts, labels, documentation) is a requirement: use it verbatim.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 2
- Max agents: 100

The swarm that runs this plan uses today's parser, so the Tier lines below carry no effort, and the Ladder line uses the old form. Opus gets two attempts because Task 1 starts on it.

## Review Focus

These are the inputs a person meets that the spec implies, and the tests that pin each one:
1. **Whitespace and case** in Tier and Ladder lines read as their lowercase values, such as `Tier: Opus HIGH – narrow auth fix` and `Ladder:  Haiku 1 ,sonnet HIGH 1, ...`. Task 1 pins this in the plan tests on the Tier line and on the Ladder line forms.
2. **A rung with no attempts** at the start of a unit's path is skipped without an attempt, and a model whose rungs all have none blocks the unit before any agent call. Task 1 pins this in the workflow test on rungs with no attempts.
3. **`max` named in a Tier line** is accepted and reaches the agent as `max`, with no silent downgrade. Task 1 pins this in the plan test on the Tier line and in the workflow test on a start off the ladder.
4. **A relaunch with `--only`** keeps each task's effort, resolved against the plan's own ladder rather than the default one. Task 1 pins this in the compile test on the plan's own ladder.
5. **An agent whose requests mix efforts or models,** or one the meter never learned, still gets one line in the report, with joined values and the type `agent`. Task 3 pins this in the report test on the agents list.

---

### Task 1: Model and effort from the plan to the swarm

**Aether:**
- Tier: opus — core architecture: it changes the contract between the plan compiler and the swarm executor, and the escalation ladder, across both and their tests
- Area: swarm
- Owns: `plugins/aether/lib/plan.js`, `plugins/aether/bin/aether-plan`, `plugins/aether/workflows/run.workflow.js`, `tests/plan.test.js`, `tests/aether-plan.test.js`, `tests/workflow.test.js`, `tests/workflow-harness.js`
- Depends on: none

The compile args and the workflow change together. The workflow tests compile real plans, so neither half can merge alone with green tests.

**Files:**
- Modify: `plugins/aether/lib/plan.js`, `plugins/aether/bin/aether-plan`, `plugins/aether/workflows/run.workflow.js`
- Test: `tests/plan.test.js`, `tests/aether-plan.test.js`, `tests/workflow.test.js`, `tests/workflow-harness.js`

**Interfaces:**
- **Types:**
  - `Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'`;
  - `Rung = { model: 'haiku' | 'sonnet' | 'opus', effort: Effort, attempts: number }`, where `attempts` is a whole number, 0 or more.
- **`plugins/aether/lib/plan.js`:**
  - **Exports:** `{ TIERS, EFFORTS, DEFAULT_LADDER, parsePlan, buildGraph, renderBrief }`, with:
    - `TIERS = ['haiku', 'sonnet', 'opus']` (unchanged);
    - `EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']`;
    - `DEFAULT_LADDER: Rung[]`, the default ladder.
  - **`parsePlan(markdown)`:**
    - each task gains `effort: Effort | null`: the Tier line's effort, or `null`;
    - `execution.ladder` is a `Rung[]` in the plan's order. Without a Ladder line, it is a fresh copy of `DEFAULT_LADDER`, rung by rung.
  - **`buildGraph(parsed, { only })`:** each node gains `effort: Effort | null`.
    - It is the task's effort, or else the effort of the first rung of the task's model in `parsed.execution.ladder`.
    - It is `null` when the ladder has no rung of that model.
  - **`renderBrief(task, options)`:** the brief's Tier line is `- Tier: <tier> <effort> — <tierReason>`, or `- Tier: <tier> — <tierReason>` when `task.effort` is `null`.
- **The Tier line:** `- Tier: <model> [<effort>] — <reason>`.
  - It is case-insensitive and stored lowercase.
  - It accepts the dash forms `—`, `–`, `--` and `-`, and any spacing.
- **The Ladder line:**
  - **Entries:** comma-separated `<model> <effort> <attempts>` or `<model> <attempts>`, case-insensitive, with any spacing.
  - **Defaults:** an entry without an effort takes its model's default effort.
  - **Problems:**
    - an unreadable entry is reported and dropped;
    - a refused pair is reported and kept;
    - a model with no rung is reported;
    - every rung that is not stronger than the rung before it is reported.
  - **Order:** the problems of one kind are reported in the order of the entries.
- **Messages,** exactly:
  - `Task <n>: Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".`
  - `Task <n>: <model> <effort> is not used for implementers; Sonnet and Opus run at high, xhigh or max.`
  - `Aether Execution: cannot read ladder entry "<entry>"; use "haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1".`
  - `Aether Execution: the ladder has no "<model>" entry.` (unchanged)
  - `Aether Execution: <model> <effort> is not used for implementers; Sonnet and Opus run at high, xhigh or max.`
  - `Aether Execution: the ladder must go up, but "<rung>" comes after "<previous rung>". List the models from haiku to opus, and each model's efforts from low to max.`
- **`plugins/aether/bin/aether-plan compile`** prints the args with:
  - `ladder: Rung[]`;
  - `tasks[id]: { number, title, tier, effort, tierReason, area, owns, dependsOn, brief }`, with the node's resolved effort.

  Each brief is rendered from the task with that resolved effort.
- **`plugins/aether/workflows/run.workflow.js`:**
  - **Input:** `readArgs` refuses the args unless `ladder` is a non-empty `Rung[]` with known models and efforts, and whole `attempts` of 0 or more. The failure message is `aether:run args are missing or invalid: ladder`.
    - It also refuses a task without a known `effort`, with `aether:run args: <id> is not a complete task`.
    - It does not check refused pairs or the ladder's order.
  - **A unit's path:**
    - When the task's tier and effort match a rung, the path is that rung and every rung after it.
    - Otherwise, the path is a step on the task's tier and effort with 1 attempt, followed by every rung stronger than it, in the ladder's order.
  - **The ladder at run time:**
    - Each step counts its own attempts, and a step with 0 attempts is skipped, the first step included.
    - A retry, an approval that still lists a critical or important finding, a failed implementer or supervisor, or an `ownership` or `empty` merge refusal stays on the step while it has attempts left. Then it moves to the next step that has attempts.
    - `escalate` moves to the next step that has attempts, at once.
    - With no such step left, the unit is blocked with the reason `the ladder is spent`.
    - The one merge retry stays on its step and counts no attempt.
  - **Every agent call** is `agent(prompt, { agentType, model, effort, phase, label, schema })`. The model and effort per role are in the Global Constraints.
  - **Texts,** with `<step>` a step's name:
    - the implementer label: `<id>: implement on <step> (attempt <n>)`;
    - the implementer prompt's second line: `Run <runId>, attempt <n>, on <step>.`;
    - the supervisor prompt's first line ends `Attempt <n> ran on <step>.`;
    - the earlier attempts' lines: `- Attempt <n> on <step>: ...`;
    - the escalation log: `<id>: escalating from <step> to <step>`;
    - the final reviewer's unit lines: `on <step> → <step>`.
  - **The supervisor prompt's `## Ladder` section,** with every step of the unit's path, in order:

    ```text
    ## Ladder
    Attempts used: haiku xhigh 1/2, sonnet high 0/1, sonnet xhigh 0/1, opus xhigh 0/1.
    A retry stays on haiku xhigh while it has attempts left, then moves up. Escalate moves up now, to a higher effort or a stronger model.
    ```

  - **Result:**
    - `units[].tiers: string[]` holds the names of the steps the unit ran on, in order;
    - `units[].rounds[].tier: string` is the name of the round's step;
    - `agents` is unchanged.

**Failing tests:**

- [ ] **Step 1: Write the failing tests**

In `tests/workflow-harness.js`, inside `agent()`, add `effort: opts.effort,` to the `call` object, right after `model: opts.model,`. Nothing else in the harness changes.

In `tests/plan.test.js`, make three changes. Every other test stays as it is.

**First,** replace the two lines that require `../plugins/aether/lib/plan.js` and `./plan-fixtures.js` with:

```js
const { parsePlan, buildGraph, renderBrief, DEFAULT_LADDER } = require('../plugins/aether/lib/plan.js')
const { task, plan } = require('./plan-fixtures.js')

const TIER_FORMAT = 'Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".'
const BELOW_HIGH = 'is not used for implementers; Sonnet and Opus run at high, xhigh or max.'
const GO_UP = "List the models from haiku to opus, and each model's efforts from low to max."
const ladderOf = (line) => parsePlan(plan([task(1)], { execution: ['- Test command: `true`', line] }))
```

**Second,** replace the two tests named `parsePlan reads tasks, Aether fields, execution, constraints and spec` and `parsePlan reports missing and malformed Aether fields` with:

```js
test('parsePlan reads tasks, Aether fields, execution, constraints and spec', () => {
  const parsed = parsePlan(plan([
    task(1),
    task(2, {
      tier: 'sonnet — interactive UI',
      area: 'web',
      owns: '`web/login/**`, `web/tests/login.test.js`',
      depends: 'Task 1 — calls the API client',
    }),
  ]))
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.tasks.length, 2)
  const t2 = parsed.tasks[1]
  assert.equal(t2.number, 2)
  assert.equal(t2.tier, 'sonnet')
  assert.equal(t2.effort, null)
  assert.equal(t2.tierReason, 'interactive UI')
  assert.equal(t2.area, 'web')
  assert.deepEqual(t2.owns, ['web/login/**', 'web/tests/login.test.js'])
  assert.deepEqual(t2.dependsOn, [{ number: 1, reason: 'calls the API client' }])
  assert.match(t2.text, /^### Task 2: Task 2 title/)
  assert.equal(parsed.execution.testCommand, 'true')
  assert.deepEqual(parsed.execution.ladder, [
    { model: 'haiku', effort: 'xhigh', attempts: 2 },
    { model: 'sonnet', effort: 'high', attempts: 1 },
    { model: 'sonnet', effort: 'xhigh', attempts: 1 },
    { model: 'opus', effort: 'xhigh', attempts: 1 },
  ])
  assert.deepEqual(parsed.execution.ladder, DEFAULT_LADDER)
  assert.notEqual(parsed.execution.ladder, DEFAULT_LADDER)
  assert.notEqual(parsed.execution.ladder[0], DEFAULT_LADDER[0])
  assert.equal(parsed.execution.maxAgents, 200)
  assert.equal(parsed.globalConstraints, '- Node 22.')
  assert.equal(parsed.spec, 'docs/spec.md')
})

test('parsePlan reports missing and malformed Aether fields', () => {
  const md = plan([
    ['### Task 1: No block', '', 'Just text.'].join('\n'),
    ['### Task 2: Bad tier', '', '**Aether:**', '- Tier: gpt — no', '- Area: core', '- Owns: `a/**`', '- Depends on: none'].join('\n'),
    ['### Task 3: Bare fields', '', '**Aether:**', '- Tier: haiku', '- Area: Core Area', '- Owns: `b/**`', '- Depends on: Task 1'].join('\n'),
    ['### Task 4: Missing fields', '', '**Aether:**', '- Tier: haiku — fine'].join('\n'),
  ], { execution: ['- Ladder: haiku 2, sonnet 2'] })
  const { errors } = parsePlan(md)
  assert.ok(errors.includes('Task 1: missing the **Aether:** block.'))
  assert.ok(errors.includes(`Task 2: ${TIER_FORMAT}`))
  assert.ok(errors.includes(`Task 3: ${TIER_FORMAT}`))
  assert.ok(errors.includes('Task 3: Area must be lowercase letters, digits and dashes.'))
  assert.ok(errors.includes('Task 3: "Depends on: Task 1" needs the form "Task N — reason".'))
  assert.ok(errors.includes('Task 4: missing Area.'))
  assert.ok(errors.includes('Task 4: missing Owns.'))
  assert.ok(errors.includes('Task 4: missing "Depends on" (use "Depends on: none" for an independent task).'))
  assert.ok(errors.includes('Aether Execution: the ladder has no "opus" entry.'))
  assert.ok(errors.includes('Aether Execution: "Test command" is missing.'))
})
```

**Third,** add these tests at the end of the file:

```js
test('parsePlan reads an effort on the Tier line, in any case and spacing', () => {
  const parsed = parsePlan(plan([
    task(1),
    task(2, { tier: 'sonnet xhigh — integration across modules' }),
    task(3, { tier: 'Opus HIGH – narrow auth fix' }),
    task(4, { tier: 'haiku  max  -  the hardest parser' }),
    task(5, { tier: 'haiku low — a rename' }),
  ]))
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(
    parsed.tasks.map((t) => [t.tier, t.effort, t.tierReason]),
    [
      ['haiku', null, 'complete code'],
      ['sonnet', 'xhigh', 'integration across modules'],
      ['opus', 'high', 'narrow auth fix'],
      ['haiku', 'max', 'the hardest parser'],
      ['haiku', 'low', 'a rename'],
    ],
  )
})

test('parsePlan refuses an unknown effort, and Sonnet or Opus below high', () => {
  const { errors } = parsePlan(plan([
    task(1, { tier: 'haiku turbo — fast' }),
    task(2, { tier: 'sonnet medium — UI' }),
    task(3, { tier: 'opus low — auth' }),
    task(4, { tier: 'Sonnet LOW — UI' }),
    task(5, { tier: 'opus medium — migration' }),
    task(6, { tier: 'sonnet high — UI' }),
  ]))
  assert.deepEqual(errors, [
    `Task 1: ${TIER_FORMAT}`,
    `Task 2: sonnet medium ${BELOW_HIGH}`,
    `Task 3: opus low ${BELOW_HIGH}`,
    `Task 4: sonnet low ${BELOW_HIGH}`,
    `Task 5: opus medium ${BELOW_HIGH}`,
  ])
})

test('parsePlan reads the Ladder line in the new, old and mixed forms, in any case and spacing', () => {
  const lines = {
    '- Ladder: haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1': ['haiku xhigh 2', 'sonnet high 1', 'sonnet xhigh 1', 'opus xhigh 1'],
    '- Ladder: haiku 2, sonnet 2, opus 1': ['haiku xhigh 2', 'sonnet high 2', 'opus xhigh 1'],
    '- Ladder:  Haiku 1 ,sonnet HIGH 1,  sonnet xhigh 2 , opus max 1': ['haiku xhigh 1', 'sonnet high 1', 'sonnet xhigh 2', 'opus max 1'],
    '- Ladder: haiku xhigh 2, sonnet high 0, sonnet xhigh 1, opus xhigh 0': ['haiku xhigh 2', 'sonnet high 0', 'sonnet xhigh 1', 'opus xhigh 0'],
  }
  for (const [line, rungs] of Object.entries(lines)) {
    const parsed = ladderOf(line)
    assert.deepEqual(parsed.errors, [], line)
    assert.deepEqual(parsed.execution.ladder.map((r) => `${r.model} ${r.effort} ${r.attempts}`), rungs, line)
  }
})

test('parsePlan reports each ladder problem', () => {
  assert.deepEqual(ladderOf('- Ladder: haiku xhigh 2, sonnet 2 high, sonnet xhigh 1, opus xhigh 1').errors, [
    'Aether Execution: cannot read ladder entry "sonnet 2 high"; use "haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1".',
  ])
  assert.deepEqual(ladderOf('- Ladder: haiku xhigh 2, sonnet high 1').errors, ['Aether Execution: the ladder has no "opus" entry.'])
  assert.deepEqual(ladderOf('- Ladder: haiku xhigh 2, sonnet medium 1, sonnet xhigh 1, opus low 1').errors, [
    `Aether Execution: sonnet medium ${BELOW_HIGH}`,
    `Aether Execution: opus low ${BELOW_HIGH}`,
  ])
  assert.deepEqual(ladderOf('- Ladder: sonnet high 1, haiku xhigh 2, opus xhigh 1, opus xhigh 1').errors, [
    `Aether Execution: the ladder must go up, but "haiku xhigh" comes after "sonnet high". ${GO_UP}`,
    `Aether Execution: the ladder must go up, but "opus xhigh" comes after "opus xhigh". ${GO_UP}`,
  ])
  assert.deepEqual(ladderOf('- Ladder: opus 1, haiku 2, sonnet 2').errors, [
    `Aether Execution: the ladder must go up, but "haiku xhigh" comes after "opus xhigh". ${GO_UP}`,
  ])
})

test("buildGraph resolves a missing effort from the first rung of the task's model", () => {
  const tasks = [task(1), task(2, { tier: 'sonnet — UI' }), task(3, { tier: 'opus — auth' }), task(4, { tier: 'haiku medium — a rename' })]
  const effortsOf = (graph) => Object.values(graph.tasks).map((t) => `${t.tier} ${t.effort}`)
  assert.deepEqual(effortsOf(buildGraph(parsePlan(plan(tasks)))), ['haiku xhigh', 'sonnet high', 'opus xhigh', 'haiku medium'])
  const custom = parsePlan(plan(tasks, { execution: ['- Test command: `true`', '- Ladder: haiku high 2, sonnet xhigh 2, opus xhigh 1'] }))
  assert.deepEqual(effortsOf(buildGraph(custom)), ['haiku high', 'sonnet xhigh', 'opus xhigh', 'haiku medium'])
  const noOpus = parsePlan(plan(tasks, { execution: ['- Test command: `true`', '- Ladder: haiku xhigh 2, sonnet high 2'] }))
  assert.equal(buildGraph(noOpus).tasks['task-3'].effort, null)
})

test('renderBrief names the resolved tier, or the model alone when no effort is known', () => {
  const parsed = parsePlan(plan([task(1)]))
  const graph = buildGraph(parsed)
  const options = { planPath: '/p/plan.md', spec: parsed.spec, globalConstraints: parsed.globalConstraints }
  assert.match(renderBrief({ ...parsed.tasks[0], effort: graph.tasks['task-1'].effort }, options), /\n- Tier: haiku xhigh — complete code\n/)
  assert.match(renderBrief(parsed.tasks[0], options), /\n- Tier: haiku — complete code\n/)
})
```

In `tests/aether-plan.test.js`, inside the test `compile writes the graph, briefs and state for the integration branch`:
1. Replace the line `assert.deepEqual(args.ladder, { haiku: 2, sonnet: 2, opus: 1 })` with the first block below.
2. Add the line from the second block at the end of that test.
3. Add the new test at the end of the file.

```js
  assert.deepEqual(args.ladder, [
    { model: 'haiku', effort: 'xhigh', attempts: 2 },
    { model: 'sonnet', effort: 'high', attempts: 1 },
    { model: 'sonnet', effort: 'xhigh', attempts: 1 },
    { model: 'opus', effort: 'xhigh', attempts: 1 },
  ])
  assert.equal(args.tasks['task-2'].tier, 'haiku')
  assert.equal(args.tasks['task-2'].effort, 'xhigh')
```

```js
  assert.match(fs.readFileSync(args.tasks['task-2'].brief, 'utf8'), /\n- Tier: haiku xhigh — complete code\n/)
```

```js
test("compile resolves each task's effort against the plan's own ladder, on a relaunch too", (t) => {
  const repo = makeRepo(t)
  const file = writePlan(
    repo.dir,
    plan([task(1), task(2, { tier: 'sonnet — UI states' }), task(3, { tier: 'haiku medium — a rename' })], {
      execution: ['- Test command: `true`', '- Ladder: haiku high 2, sonnet xhigh 2, opus xhigh 1'],
    }),
  )
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.deepEqual(Object.values(first.json.tasks).map((x) => x.effort), ['high', 'xhigh', 'medium'])
  const again = runBin(PLAN_BIN, ['compile', file, '--run', first.json.runId, '--only', 'task-2,task-3'], repo.dir)
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.deepEqual(again.json.ladder, [
    { model: 'haiku', effort: 'high', attempts: 2 },
    { model: 'sonnet', effort: 'xhigh', attempts: 2 },
    { model: 'opus', effort: 'xhigh', attempts: 1 },
  ])
  assert.deepEqual(Object.keys(again.json.tasks), ['task-2', 'task-3'])
  assert.deepEqual(Object.values(again.json.tasks).map((x) => x.effort), ['xhigh', 'medium'])
  assert.match(fs.readFileSync(again.json.tasks['task-2'].brief, 'utf8'), /\n- Tier: sonnet xhigh — UI states\n/)
})
```

In `tests/workflow.test.js`:
1. Add the helpers below right after the `attemptsOf` line.
2. Make the replacements in the list that follows.
3. Add the new tests at the end of the file.

Every other test stays as it is.

```js
// A compiled run of independent tasks, with an optional Ladder line.
function compiled(t, tasks, ladderLine) {
  const execution = ['- Test command: `true`', ...(ladderLine ? [ladderLine] : [])]
  return compile(makeRepo(t), plan(tasks, { execution }))
}
const rung = (model, effort, attempts) => ({ model, effort, attempts })
const steps = (calls) => calls.map((c) => `${c.model} ${c.effort}`)
const ROLES = {
  implementer: { model: 'haiku', effort: 'xhigh' },
  supervisor: { model: 'sonnet', effort: 'xhigh' },
  reviewer: { model: 'opus', effort: 'high' },
  ops: { model: 'haiku', effort: 'low' },
}
```

The replacements:
- **`two waves, all approved: merges run one at a time, the dependent unit waits, then review and cleanup`:** the three expected `tiers` values `['haiku']` become `['haiku xhigh']`.
- **`a unit the supervisor sends back twice on haiku escalates to sonnet and merges`:** replace its two lines on `unit.tiers` and the attempts' models with:

  ```js
  assert.deepEqual(unit.tiers, ['haiku xhigh', 'sonnet high'])
  assert.deepEqual(steps(attemptsOf(run, 'task-2')), ['haiku xhigh', 'haiku xhigh', 'sonnet high'])
  ```

- **`a merge conflict gets one retry with its context, and a second conflict blocks the unit`:** its first line becomes:

  ```js
  const args = { ...threeTasks(t), ladder: [rung('haiku', 'xhigh', 1), rung('sonnet', 'high', 1), rung('opus', 'xhigh', 1)] }
  ```

- **`a failed implementer counts as an attempt, and a spent ladder blocks the unit`:**
  - its first line becomes:

    ```js
    const args = { ...threeTasks(t), ladder: [rung('haiku', 'xhigh', 1), rung('sonnet', 'high', 1), rung('opus', 'xhigh', 0)] }
    ```

  - its `tiers` line becomes `assert.deepEqual(unit.tiers, ['haiku xhigh', 'sonnet high'])`.
- **`missing or invalid args throw before any agent starts`:** add these entries at the end of its `bad` list:

  ```js
    { ...args, ladder: { haiku: 2, sonnet: 2, opus: 1 } },
    { ...args, ladder: [] },
    { ...args, ladder: [rung('haiku', 'turbo', 2)] },
    { ...args, ladder: [rung('haiku', 'xhigh', -1)] },
    { ...args, tasks: { ...args.tasks, 'task-1': { ...args.tasks['task-1'], effort: null } } },
  ```

The new tests:

```js
test("every agent call passes its role's model and effort, and names the step it runs on", async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  for (const call of run.calls) assert.deepEqual({ model: call.model, effort: call.effort }, ROLES[call.role], call.label)
  const implement = run.calls.find((c) => c.role === 'implementer' && c.unit === 'task-1')
  assert.equal(implement.label, 'task-1: implement on haiku xhigh (attempt 1)')
  assert.ok(implement.prompt.includes(`Run ${args.runId}, attempt 1, on haiku xhigh.`))
  const supervise = run.calls.find((c) => c.role === 'supervisor' && c.unit === 'task-1')
  assert.ok(supervise.prompt.includes('Attempt 1 ran on haiku xhigh.'))
  assert.ok(supervise.prompt.includes('Attempts used: haiku xhigh 1/2, sonnet high 0/1, sonnet xhigh 0/1, opus xhigh 0/1.'))
  assert.ok(supervise.prompt.includes('A retry stays on haiku xhigh while it has attempts left, then moves up. Escalate moves up now, to a higher effort or a stronger model.'))
  assert.match(run.calls.find((c) => c.role === 'reviewer').prompt, /task-1 \(Task 1 title\): merged on haiku xhigh/)
})

test('a Haiku unit the supervisor keeps sending back raises the effort before the model, then is blocked', async (t) => {
  const args = threeTasks(t)
  const run = await runWorkflow(args, { supervisor: (call, approve) => (call.unit === 'task-2' ? retry(`gap ${call.n}`) : approve(call)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  const unit = run.result.units.find((u) => u.id === 'task-2')
  assert.equal(unit.status, 'blocked')
  assert.equal(unit.reason, 'the ladder is spent')
  assert.deepEqual(unit.tiers, ['haiku xhigh', 'sonnet high', 'sonnet xhigh', 'opus xhigh'])
  assert.deepEqual(unit.rounds.map((r) => r.tier), ['haiku xhigh', 'haiku xhigh', 'sonnet high', 'sonnet xhigh', 'opus xhigh'])
  assert.deepEqual(steps(attemptsOf(run, 'task-2')), ['haiku xhigh', 'haiku xhigh', 'sonnet high', 'sonnet xhigh', 'opus xhigh'])
  assert.ok(run.logs.includes('task-2: escalating from haiku xhigh to sonnet high'))
  assert.ok(run.logs.includes('task-2: escalating from sonnet high to sonnet xhigh'))
  assert.ok(attemptsOf(run, 'task-2')[4].prompt.includes('- Attempt 3 on sonnet high: DONE. Implemented the brief.'))
  const third = run.calls.filter((c) => c.role === 'supervisor' && c.unit === 'task-2')[2].prompt
  assert.ok(third.includes('Attempts used: haiku xhigh 2/2, sonnet high 1/1, sonnet xhigh 0/1, opus xhigh 0/1.'))
  assert.ok(third.includes('A retry stays on sonnet high while it has attempts left, then moves up.'))
})

test('a task off the ladder gets one attempt on its tier, then climbs from the first stronger rung', async (t) => {
  const args = compiled(t, [task(1), task(2, { tier: 'haiku medium — renames one field' }), task(3, { tier: 'haiku max — the hardest parser' })])
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => (call.unit === 'task-2' && call.n === 1 ? retry('missed a caller') : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const [, two, three] = run.result.units
  assert.equal(two.status, 'merged')
  assert.deepEqual(two.tiers, ['haiku medium', 'haiku xhigh'])
  assert.deepEqual(steps(attemptsOf(run, 'task-2')), ['haiku medium', 'haiku xhigh'])
  const first = run.calls.find((c) => c.role === 'supervisor' && c.unit === 'task-2').prompt
  assert.ok(first.includes('Attempts used: haiku medium 1/1, haiku xhigh 0/2, sonnet high 0/1, sonnet xhigh 0/1, opus xhigh 0/1.'))
  assert.equal(three.status, 'merged')
  assert.deepEqual(three.tiers, ['haiku max'])
  assert.deepEqual(steps(attemptsOf(run, 'task-3')), ['haiku max'])
})

test('a task on a later rung skips the rungs below it, and escalate raises the effort before the model', async (t) => {
  const args = compiled(t, [task(1, { tier: 'sonnet xhigh — integration across modules' }), task(2, { tier: 'sonnet — UI states' })])
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => {
      if (call.unit === 'task-1' && call.n === 1) return retry('lost an event')
      if (call.unit === 'task-2' && call.n === 1) {
        return { verdict: 'escalate', findings: [], ruling: 'Escalate: the states need more care.', guidance: 'cover every state', question: '' }
      }
      return approve(call)
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const [one, two] = run.result.units
  assert.equal(one.status, 'merged')
  assert.deepEqual(one.tiers, ['sonnet xhigh', 'opus xhigh'])
  assert.deepEqual(steps(attemptsOf(run, 'task-1')), ['sonnet xhigh', 'opus xhigh'])
  assert.equal(two.status, 'merged')
  assert.deepEqual(two.tiers, ['sonnet high', 'sonnet xhigh'])
  assert.deepEqual(steps(attemptsOf(run, 'task-2')), ['sonnet high', 'sonnet xhigh'])
})

test('a rung with no attempts is skipped, and a model whose rungs have none blocks the unit before any attempt', async (t) => {
  const args = compiled(
    t,
    [task(1), task(2, { tier: 'sonnet — UI states' }), task(3, { tier: 'opus — migration' })],
    '- Ladder: haiku xhigh 1, sonnet high 0, sonnet xhigh 1, opus xhigh 0',
  )
  assert.equal(args.tasks['task-2'].effort, 'high')
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  const [, two, three] = run.result.units
  assert.equal(two.status, 'merged')
  assert.deepEqual(two.tiers, ['sonnet xhigh'])
  assert.deepEqual(steps(attemptsOf(run, 'task-2')), ['sonnet xhigh'])
  assert.equal(three.status, 'blocked')
  assert.equal(three.reason, 'the ladder is spent')
  assert.equal(three.attempts, 0)
  assert.equal(run.calls.some((c) => c.unit === 'task-3'), false)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/plan.test.js tests/aether-plan.test.js tests/workflow.test.js`
Expected: FAIL. `effort` is undefined, the ladder is still an object, the Tier message is the old one, and calls carry no effort.

- [ ] **Step 3: Implement**

Make these tests pass within the Interfaces, following spec §6 (the plan) and §7 (the workflow). Keep every other behavior of `aether-plan` and `/aether:run` as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, every test file included.

Run: `node plugins/aether/bin/aether-plan check docs/evaluations/trial-1/fixture/plan.md`
Expected: JSON with `"ok":true`. A plan with only tiers and the old ladder form still compiles.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/plan.js plugins/aether/bin/aether-plan plugins/aether/workflows/run.workflow.js tests/plan.test.js tests/aether-plan.test.js tests/workflow.test.js tests/workflow-harness.js
git commit -m "feat(aether): route the swarm by model and effort, from the plan's Tier and Ladder lines"
```

**Acceptance:**
- `npm test` passes.
- `aether-plan check` passes on `docs/evaluations/trial-1/fixture/plan.md`.

### Task 2: The usage meter records each request's effort

**Aether:**
- Tier: haiku — one new field and an exact mod test pin it down, in two files
- Area: meter
- Owns: `plugins/aether/hooks/register.js`, `plugins/aether/hooks/usage.test.ts`
- Depends on: none

**Files:**
- Modify: `plugins/aether/hooks/register.js`
- Test: `plugins/aether/hooks/usage.test.ts`

**Interfaces:**
- **Entry shape:** each usage entry becomes `{ t, ms, agent, model, effort, input, output, cacheRead, cacheWrite }`.
- **`effort`** is the `turn.step` event's `effort` as given (`e.effort`), or `null` when the event has none.
- **Everything else** about the meter is unchanged.

**Failing tests:**

- [ ] **Step 1: Write the failing tests**

In `plugins/aether/hooks/usage.test.ts`, in the test `records main and agent requests with the agent type, and writes part 0 when a turn ends`, replace the `expect(part.entries).toEqual([...])` call with:

```ts
  expect(part.entries).toEqual([
    { t: 1000, ms: 0, agent: null, model: 'claude-opus-5-5', effort: null, input: 10, output: 5, cacheRead: 100, cacheWrite: 50 },
    { t: 1000, ms: 0, agent: 'agent-1', model: 'claude-haiku-5-5', effort: null, input: 10, output: 5, cacheRead: 100, cacheWrite: 50 },
  ])
```

Then add this test after it:

```ts
test('records the effort of each request, as the event gives it', async ($, on) => {
  const writes = stubs(on)
  await step($, { effort: 'xhigh' })
  await step($, { model: 'claude-haiku-5-5', agentId: 'agent-1', effort: 'medium' })
  await endTurn($)
  const part = files(writes)['/home/u/.local/share/aether-plugin/usage/s1/0.json']
  expect(part.entries.map((entry) => entry.effort)).toEqual(['xhigh', 'medium'])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:mod`
Expected: FAIL, because the entries have no `effort`.

- [ ] **Step 3: Implement**

Make these tests pass within the Interfaces. The meter keeps only observing.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:mod && npm run validate && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/hooks/register.js plugins/aether/hooks/usage.test.ts
git commit -m "feat(aether): record each request's effort in the usage meter"
```

**Acceptance:** `npm run test:mod`, `npm run validate` and `npm test` pass.

### Task 3: aether-report shows the effort

**Aether:**
- Tier: haiku — exact tests pin both additions down in one module and its fixtures
- Area: report
- Owns: `plugins/aether/lib/report.js`, `tests/report.test.js`, `tests/report-fixtures.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/lib/report.js`
- Test: `tests/report.test.js`, `tests/report-fixtures.js`

**Interfaces:**
- **`report(cwd, runId, options)`** returns the report as today, plus two additions.
  - **`byEffort`.** In `cost.run` and in `cost.session`, each `byModel[model]` gains `byEffort: { [effort]: { usd: number, requests: number } }`. An entry without an effort counts under the key `unknown`.
  - **`cost.run.agents`.** It is an `AgentCost[]`, one item per agent that made requests in the run's window. The main session is one item. The items follow the order of each agent's first request. `cost.session` has no `agents`.
- **`AgentCost`** is `{ agent: string | null, type: string, label: string | null, model: string, effort: string | null, requests: number, usd: number }`:
  - `agent`: the agent id, or `null` for the main session;
  - `type`: `main`, the agent's type from the usage file's `agents`, or `agent` when it is unknown;
  - `label`: the agent's `description` from the usage file's `agents`, or `null`;
  - `model`: the distinct models of its requests, joined with `", "` in the order first used. A missing model counts as `unknown`;
  - `effort`: the distinct efforts of its requests, joined the same way, leaving out requests with none. It is `null` when none is known;
  - `requests` and `usd`: its request count, and its cost priced like the rest of the report.
- **`tests/report-fixtures.js`:**
  - `entry(minutes, model, agent, kind, ms = 1000, effort)`: the entry has an `effort` field only when `effort` is given;
  - it also exports `effortUsage(dataDir)`.

**Failing tests:**

- [ ] **Step 1: Write the failing tests**

In `tests/report-fixtures.js`:
1. Replace the `entry` function and its comment with the first block below.
2. Add `effortUsage` after `sampleUsage`.
3. Add `effortUsage` to `module.exports`.

```js
// One request, priced simply: a million tokens of one kind. Entries written before the meter
// recorded efforts have no effort field.
function entry(minutes, model, agent, kind, ms = 1000, effort) {
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, [kind]: 1e6 }
  return { t: T0 + minutes * MIN, ms, agent, model, ...(effort === undefined ? {} : { effort }), ...tokens }
}
```

```js
// A run whose agents ran at known efforts: the main session, two implementers, a supervisor, the
// reviewer, and an agent the meter never learned, which ran on two models. Entries without an
// effort predate the field.
function effortUsage(dataDir) {
  writeUsage(dataDir, 'effort-session', [
    {
      agents: {
        i1: { type: 'aether:implementer', description: 'task-1: implement on haiku xhigh (attempt 1)' },
        i2: { type: 'aether:implementer', description: 'task-2: implement on haiku medium (attempt 1)' },
        s1: { type: 'aether:supervisor', description: 'task-1: supervise attempt 1' },
        r1: { type: 'aether:reviewer', description: 'final review' },
      },
      entries: [
        entry(1, OPUS, null, 'input'),
        entry(2, HAIKU, 'i1', 'output', 1000, 'xhigh'),
        entry(3, HAIKU, 'i2', 'output', 1000, 'medium'),
        entry(4, HAIKU, 'i1', 'output', 1000, 'xhigh'),
        entry(5, SONNET, 's1', 'input', 1000, 'xhigh'),
        entry(6, HAIKU, 'i2', 'output', 1000, 'high'),
        entry(7, OPUS, 'r1', 'output', 1000, 'high'),
        entry(8, OPUS, null, 'input', 1000, 'xhigh'),
        entry(9, HAIKU, 'u1', 'output'),
        entry(10, SONNET, 'u1', 'input'),
      ],
    },
  ])
}
```

In `tests/report.test.js`:
1. Import `effortUsage` from `./report-fixtures.js`, next to `sampleUsage`.
2. Add these tests at the end of the file.

```js
test("report breaks each model's cost down by effort, with unknown for entries that have none", (t) => {
  const dataDir = useDataDir(t)
  effortUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const { cost } = report(repo.dir, args.runId, { tests: false })
  const requestsByEffort = (byModel) => Object.fromEntries(Object.entries(byModel.byEffort).map(([effort, v]) => [effort, v.requests]))
  assert.deepEqual(requestsByEffort(cost.run.byModel[HAIKU]), { xhigh: 2, medium: 1, high: 1, unknown: 1 })
  assert.deepEqual(requestsByEffort(cost.run.byModel[SONNET]), { xhigh: 1, unknown: 1 })
  assert.deepEqual(requestsByEffort(cost.run.byModel[OPUS]), { unknown: 1, high: 1, xhigh: 1 })
  close(cost.run.byModel[HAIKU].byEffort.xhigh.usd, 1)
  close(cost.run.byModel[OPUS].byEffort.high.usd, 20)
  close(cost.run.byModel[OPUS].byEffort.unknown.usd, 4)
  assert.deepEqual(requestsByEffort(cost.session.byModel[HAIKU]), { xhigh: 2, medium: 1, high: 1, unknown: 1 })
})

test('report lists each agent of the run with its model and effort, in the order of its first request', (t) => {
  const dataDir = useDataDir(t)
  effortUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const { cost } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual(
    cost.run.agents.map(({ usd, ...rest }) => rest),
    [
      { agent: null, type: 'main', label: null, model: OPUS, effort: 'xhigh', requests: 2 },
      { agent: 'i1', type: 'aether:implementer', label: 'task-1: implement on haiku xhigh (attempt 1)', model: HAIKU, effort: 'xhigh', requests: 2 },
      { agent: 'i2', type: 'aether:implementer', label: 'task-2: implement on haiku medium (attempt 1)', model: HAIKU, effort: 'medium, high', requests: 2 },
      { agent: 's1', type: 'aether:supervisor', label: 'task-1: supervise attempt 1', model: SONNET, effort: 'xhigh', requests: 1 },
      { agent: 'r1', type: 'aether:reviewer', label: 'final review', model: OPUS, effort: 'high', requests: 1 },
      { agent: 'u1', type: 'agent', label: null, model: `${HAIKU}, ${SONNET}`, effort: null, requests: 2 },
    ],
  )
  const usd = Object.fromEntries(cost.run.agents.map((a) => [String(a.agent), a.usd]))
  close(usd.null, 8)
  close(usd.i1, 1)
  close(usd.i2, 1)
  close(usd.s1, 2)
  close(usd.r1, 20)
  close(usd.u1, 2.5)
  assert.equal(cost.session.agents, undefined)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/report.test.js`
Expected: FAIL, because `byEffort` and `agents` are undefined. The existing report tests still pass.

- [ ] **Step 3: Implement**

Make these tests pass within the Interfaces. Everything else in the report, `finalize` included, stays as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/report.js tests/report.test.js tests/report-fixtures.js
git commit -m "feat(aether): show each agent's effort and the cost by effort in aether-report"
```

**Acceptance:** `npm test` passes.

### Task 4: Agents, skills and documents

**Aether:**
- Tier: haiku — the exact text of every change is given; the task applies it
- Area: docs
- Owns: `plugins/aether/agents/implementer.md`, `plugins/aether/agents/supervisor.md`, `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `README.md`, `docs/decisions.md`, `docs/claude-code-research.md`
- Depends on: none

**Files:** the seven files in Owns.

**Interfaces:** none. The exact text below is the contract. Each change replaces the quoted text, or adds text at the place named. Nothing else in these files changes.

- [ ] **Step 1: Agent files**

In `plugins/aether/agents/implementer.md`, in the frontmatter, replace `effort: medium` with `effort: xhigh`.

In `plugins/aether/agents/supervisor.md`, in the frontmatter, replace `effort: high` with `effort: xhigh`. In the body, replace these lines:

```text
- **retry:** the attempt has findings the same model can fix. Put what the next attempt must do in `guidance`.
- **escalate:** a stronger model is needed:
  - the same mistakes repeat;
  - the task is beyond this tier;
```

with:

```text
- **retry:** the attempt has findings that another attempt on the same rung can fix. Put what the next attempt must do in `guidance`.
- **escalate:** the next rung is needed, a higher effort or a stronger model:
  - the same mistakes repeat;
  - the task is beyond this rung;
```

Then replace these lines:

```text
- a retry past the tier's attempts moves up a tier;
- an escalation past the last tier blocks;
```

with:

```text
- a retry past the rung's attempts moves up a rung;
- an escalation past the last rung blocks;
```

- [ ] **Step 2: `plugins/aether/skills/using-aether/SKILL.md`**

Replace this paragraph and its three bullets:

```markdown
**Tier** is `haiku`, `sonnet` or `opus`, followed by " — " and the reason:
- `haiku` (default): exact tests and interfaces pin the task down, and it touches few files.
- `sonnet`: frontend and UI work, integration across several files, or behavior that the tests cannot pin down exactly.
- `opus`: security and auth, data migrations or destructive operations, concurrency, or core architecture.
```

with:

```markdown
**Tier** is the model, optionally followed by the effort the task starts at, then " — " and the reason. The model:
- `haiku` (default): exact tests and interfaces pin the task down, and it touches few files.
- `sonnet`: frontend and UI work, integration across several files, or behavior that the tests cannot pin down exactly.
- `opus`: security and auth, data migrations or destructive operations, concurrency, or core architecture.

Choose the effort by the task's complexity, as in `- Tier: sonnet xhigh — integration across four modules with shared state`. Without an effort, the task starts on its model's first rung of the ladder: `haiku xhigh`, `sonnet high` or `opus xhigh` with the default ladder.
- `haiku`: `xhigh` by default. `high` or `medium` for mechanical work that the tests pin down completely: it answers in seconds instead of most of a minute.
- `sonnet`: `high` by default. `xhigh` for the hardest work of its kind, such as integration across several modules, or behavior the tests cannot pin down.
- `opus`: `xhigh` by default. `high` for a narrow task that the tests pin down well.
- `max`: never by default. Only when the task needs it, and the reason says why: it thinks for minutes per answer.

Sonnet and Opus never run below `high`, because Haiku at `xhigh` does that work for a fraction of the price. `aether-plan check` refuses `sonnet low`, `sonnet medium`, `opus low` and `opus medium`.
```

In the `## Aether Execution` example, replace this line:

```text
    - Ladder: haiku 2, sonnet 2, opus 1
```

with:

```text
    - Ladder: haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1
```

Then add this paragraph right after the example block, before `### 3. Check the plan before the owner reviews it`:

```markdown
The ladder lists the rungs a unit climbs, each a model, an effort and its attempts: the models from haiku to opus, and each model's efforts from low to max. A retry stays on its rung while it has attempts left, and an escalation moves to the next rung, so a failing unit gets a higher effort before a stronger model. A task whose tier is not a rung gets one attempt on it, then continues from the first stronger rung.
```

- [ ] **Step 3: `plugins/aether/skills/swarm/SKILL.md`**

Make three replacements. Replace:

```text
  - `tiers`: the tier path, such as `["haiku", "sonnet"]`;
```

with:

```text
  - `tiers`: the ladder steps it ran on, each a model at an effort, such as `["haiku xhigh", "sonnet high"]`;
```

Replace:

```text
- **`cost`:** USD at OpenRouter prices, by model and by role, from the usage meter;
```

with:

```text
- **`cost`:** USD at OpenRouter prices, from the usage meter: by model, by effort within each model (`byEffort`), and by role. `cost.run.agents` lists each agent of the run with its model and effort;
```

Replace:

```text
- the time and the cost by model.
```

with:

```text
- the time, and the cost by model and effort.
```

- [ ] **Step 4: `README.md`**

Make two replacements. Replace:

```text
- Each task's tier picks its model.
```

with:

```text
- Each task's tier picks its model and its effort.
```

Replace:

```text
3. **The task chooses the model.** Tiers in the plan set the start, and failures move a unit up the ladder.
```

with:

```text
3. **The task chooses the model and the effort.** Tiers in the plan set the start, and failures move a unit up the ladder: a higher effort first, then a stronger model.
```

- [ ] **Step 5: `docs/decisions.md`**

In `## D5. The task chooses the model`, add this after the paragraph that starts `**Update (2026-10-07, built 2026-10-08).**`:

```markdown
**Update (2026-10-08): effort routing.** The swarm routes by model and effort together; see the [effort routing spec](superpowers/specs/2026-10-08-effort-routing-design.md).
- A task's Tier line may name the effort the task starts at, which the Designer chooses by the task's complexity. Haiku implementers run at `xhigh` by default.
- The ladder is a list of model+effort rungs, by default `haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1`, so a failing unit gets a higher effort before a stronger model.
- Sonnet and Opus never implement below `high`, and no default uses `max`.
- The supervisor runs on Sonnet `xhigh`, and the workflow passes the model and the effort on every agent call.
```

- [ ] **Step 6: `docs/claude-code-research.md`**

Add this section right before `## OpenRouter prices`:

```markdown
## Effort routing findings (2026-10-08)

Checked while designing effort routing ([spec](superpowers/specs/2026-10-08-effort-routing-design.md)).

| Topic | Result |
|---|---|
| Workflow `agent()` effort | The bundled `workflow-authoring` reference lists `opts.effort` (`low`, `medium`, `high`, `xhigh` or `max`), which overrides the reasoning effort for that agent call. Without it, an agent inherits the session effort. |
| Agent files' effort | A swarm run whose script passed no effort ran each agent at its agent file's effort: implementers `medium`, the supervisor and the reviewer `high`, ops `low`. |
| Effort in transcripts | Each workflow agent's transcript is `subagents/workflows/<workflow>/agent-<id>.jsonl`, under its session's directory in `~/.claude/projects/`. Its message lines carry `effort` and `perTurnEffort`. Beside it, `agent-<id>.meta.json` holds the `agentType`, the `description` (the call's label) and the `model`. |
| Prompt cache | Agents share a prompt-cache prefix only when they run with the same model, effort level, agent type, tools, output schema and working directory. |
```

In `## Still to verify`, add this item at the end of the list:

```markdown
- Whether a per-call `effort` in workflow `agent()` overrides the agent file's `effort`. The effort routing smoke run checks it.
```

- [ ] **Step 7: Verify**

Run: `npm test && npm run validate`
Expected: PASS. The session-start tests still find `# Aether mode`, `aether-plan check` and the `aether:swarm` skill in the bootstrap.

Run: `grep -c 'effort: xhigh' plugins/aether/agents/implementer.md plugins/aether/agents/supervisor.md`
Expected: `1` for each file.

- [ ] **Step 8: Commit**

```bash
git add plugins/aether/agents/implementer.md plugins/aether/agents/supervisor.md plugins/aether/skills/using-aether/SKILL.md plugins/aether/skills/swarm/SKILL.md README.md docs/decisions.md docs/claude-code-research.md
git commit -m "docs(aether): document effort routing in the agents, skills and docs"
```

**Acceptance:**
- `npm test` and `npm run validate` pass.
- Every quoted change is in place, and nothing else in these files changed.

## After the swarm: the effort smoke run

The Lead runs this once:
- every task is merged;
- `npm run check` passes on the integration branch.

It is one real headless swarm run on a throwaway fixture. It checks, in the agents' transcripts and in `aether-report`, that each agent ran at its effort. One implementer runs at `medium`, unlike the implementer file's `xhigh`, so the run also shows that the call's effort wins (spec §12). It costs at most $5.

**1. Set up the fixture.** `REPO` is this repository's integration worktree.

```bash
REPO=/home/darkarty/.cache/aether-trial3/new/repo/.worktrees/trial
PLUGIN="$REPO/plugins/aether"
S=$(mktemp -d)   # the check script and the outputs, outside the fixture
F=$(mktemp -d)   # the fixture
git -C "$F" init -q -b main
git -C "$F" config user.name "Aether Smoke"
git -C "$F" config user.email "aether-smoke@example.invalid"
printf '{\n  "name": "effort-smoke",\n  "private": true,\n  "scripts": { "test": "node --test" }\n}\n' > "$F/package.json"
printf '.worktrees/\n' > "$F/.gitignore"
git -C "$F" add . && git -C "$F" commit -q -m base
git -C "$F" worktree add -q -b feature/smoke "$F/.worktrees/smoke"
mkdir -p "$F/.worktrees/smoke/docs"
```

Write `$F/.worktrees/smoke/docs/plan.md` exactly as follows. Then commit it with `git -C "$F/.worktrees/smoke" add docs/plan.md && git -C "$F/.worktrees/smoke" commit -q -m plan`.

````markdown
# Effort smoke Implementation Plan

**Goal:** Two tiny modules, to check that each agent runs at its effort.

## Global Constraints

- Node.js 22, CommonJS, no dependencies. Tests use `node:test` and `node:assert/strict`.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku xhigh 2, sonnet high 1, sonnet xhigh 1, opus xhigh 1
- Max agents: 30

---

### Task 1: Add

**Aether:**
- Tier: haiku — one function and an exact test pin it down
- Area: core
- Owns: `src/add.js`, `test/add.test.js`
- Depends on: none

**Interfaces:** `src/add.js` exports `{ add }`; `add(a: number, b: number): number`.

**Failing tests:** write `test/add.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { add } = require('../src/add.js')

test('add sums two numbers', () => {
  assert.equal(add(2, 3), 5)
})
```

**Acceptance:** `npm test` passes.

### Task 2: Shout

**Aether:**
- Tier: haiku medium — one mechanical function that the test pins down completely
- Area: core
- Owns: `src/shout.js`, `test/shout.test.js`
- Depends on: none

**Interfaces:** `src/shout.js` exports `{ shout }`; `shout(text: string): string` returns the text in upper case, followed by `!`.

**Failing tests:** write `test/shout.test.js` exactly as follows, and watch it fail first.

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { shout } = require('../src/shout.js')

test('shout upper-cases the text and adds an exclamation mark', () => {
  assert.equal(shout('hi'), 'HI!')
})
```

**Acceptance:** `npm test` passes.
````

**2. Write the check script** to `$S/check-effort.js`, exactly as follows:

```js
'use strict'

// Effort smoke check: every Aether workflow agent of a session ran at its expected effort, in its
// transcript and in aether-report. usage: node check-effort.js <session-id> <report.json>

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const [session, reportFile] = process.argv.slice(2)
const fixed = { 'aether:supervisor': 'xhigh', 'aether:reviewer': 'high', 'aether:ops': 'low' }
const expected = (type, label) =>
  type === 'aether:implementer' ? (/ on \w+ (\w+) \(attempt \d+\)$/.exec(label || '') || [])[1] : fixed[type]
const problems = []
let agents = 0
let overridden = false

const projects = path.join(os.homedir(), '.claude', 'projects')
for (const project of fs.readdirSync(projects)) {
  const root = path.join(projects, project, session, 'subagents', 'workflows')
  if (!fs.existsSync(root)) continue
  for (const workflow of fs.readdirSync(root)) {
    const dir = path.join(root, workflow)
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.meta.json'))) {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
      if (!/^aether:/.test(meta.agentType || '')) continue
      agents++
      const want = expected(meta.agentType, meta.description)
      const seen = new Set()
      for (const line of fs.readFileSync(path.join(dir, name.replace(/\.meta\.json$/, '.jsonl')), 'utf8').split('\n')) {
        if (!line.trim()) continue
        const record = JSON.parse(line)
        for (const key of ['effort', 'perTurnEffort']) if (typeof record[key] === 'string') seen.add(record[key])
      }
      if (!want || seen.size === 0 || [...seen].some((e) => e !== want)) {
        problems.push(`transcript of ${meta.description}: expected ${want}, saw ${[...seen].join(', ') || 'no effort'}`)
      }
      if (meta.agentType === 'aether:implementer' && want === 'medium' && seen.size === 1 && seen.has('medium')) overridden = true
    }
  }
}
if (agents === 0) problems.push(`no Aether agent transcripts for session ${session}`)
if (!overridden) problems.push('no implementer ran at medium, so the per-call effort is not shown to win over the agent file')

const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
const run = (report.cost && report.cost.run) || {}
for (const a of run.agents || []) {
  if (!/^aether:/.test(a.type)) continue
  const want = expected(a.type, a.label)
  if (a.effort !== want) problems.push(`report for ${a.label}: expected ${want}, saw ${a.effort}`)
}
const haiku = Object.entries(run.byModel || {}).find(([model]) => model.startsWith('claude-haiku'))
const byEffort = (haiku && haiku[1].byEffort) || {}
for (const effort of ['medium', 'xhigh']) if (!byEffort[effort]) problems.push(`report: no Haiku requests at ${effort} in byEffort`)

console.log(JSON.stringify({ session, agents, problems }, null, 2))
process.exit(problems.length ? 1 : 0)
```

**3. Write the session's prompt** to `$S/prompt.txt`, exactly as follows:

```text
You are in Aether mode, and you are the Designer. This is an unattended smoke run: do not ask questions.

The owner has approved the plan `docs/plan.md` and chose the swarm to execute it. You are already in the integration worktree, on branch `feature/smoke`. Do not create another worktree.

Load the `aether:swarm` skill and follow it from "Compile" to "Read the result": compile the plan, launch the `aether:run` workflow with the compiled JSON, and save its result as `<runDir>/result.json`. Do not fix, relaunch or finalize anything. Stop there.

End with the run id and each unit's status.
```

**4. Run the session.**
- Only this plugin's `bin` may be on the session's `PATH`, so the command strips any other Aether `bin` first.
- Session persistence stays on, so the agents' transcripts are kept.

```bash
cd "$F/.worktrees/smoke"
CLEAN_PATH=$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '/plugins/aether/bin' | paste -sd: -)
PATH="$CLEAN_PATH" AETHER_DATA_DIR="$F/data" ENABLE_CLAUDEAI_MCP_SERVERS=false \
  claude -p "$(cat "$S/prompt.txt")" --model sonnet --permission-mode bypassPermissions --strict-mcp-config \
  --max-budget-usd 5 --output-format json --plugin-dir "$PLUGIN" --settings '{"enableWorkflows": true}' > "$S/out.json"
```

**5. Check.**

```bash
SESSION=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).session_id)' "$S/out.json")
RUN=$(ls "$F/.aether/runs")
(cd "$F/.worktrees/smoke" && AETHER_DATA_DIR="$F/data" node "$PLUGIN/bin/aether-report" --run "$RUN" --no-tests) > "$S/report.json"
node "$S/check-effort.js" "$SESSION" "$S/report.json"
```

**It passes when** the check exits 0 with `"problems": []`, and both units are merged in the session's final message.

**When it fails:**
- **A per-call effort did not win**, for example Task 2's implementer ran at `xhigh`: stop, and bring the evidence back. The spec's two ways out go to the owner (spec §10).
- **Anything else:** diagnose it with superpowers systematic-debugging before any change.

**6. Clean up and record.**

```bash
(cd "$F/.worktrees/smoke" && AETHER_DATA_DIR="$F/data" node "$PLUGIN/bin/aether-report" finalize --run "$RUN" --no-tests)
rm -rf "$F"
```

Then:
- record the result in `docs/claude-code-research.md`, replacing the "Still to verify" item that Task 4 added;
- ask the Designer to record it in this plan, and to amend the plugin design spec (§6, §7, §8, §10 and §12).

Delete `$S` once both are recorded.

## Done when

- Every task is merged, and `npm run check` passes on the integration branch: the node tests, the mod tests and strict validation.
- The effort smoke run passes.
- The Designer has recorded the smoke run in this plan and amended the plugin design spec.
