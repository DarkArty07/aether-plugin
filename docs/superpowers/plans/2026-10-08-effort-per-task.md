# Effort per task: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Aether mode.** All six tasks suit the swarm: `aether-plan compile <plan>`. The Lead runs two checks in its own session: the effort probe before the swarm, and the end-to-end check after it. This is a contract plan (A10): each task gives the interfaces, the failing tests in full and the acceptance, and the implementer writes the code. The swarm that builds this plan runs the plugin from `main` (0.2.0), so the plan's own Tier lines name no effort and its tasks have no Review line.

**Goal:** Let each plan task set its implementer's effort by its complexity, `xhigh` by default, and measure what each effort costs, without changing how plans written for 0.2.0 run.

**Architecture:**
- **`lib/plan.js`** reads an optional effort on the Tier line and an optional Review line, and compiles both into the run's args.
- **The workflow** passes the effort on every `agent()` call. An implementer's first attempt on the task's model runs at the task's effort, and every later attempt at `xhigh`. Attempts are named by rung, such as `haiku medium`.
- **The usage meter** records each request's effort. **`aether-report`** shows cost, output tokens and time by role, model and effort, lists each agent, and counts climbs.
- **`scripts/check-effort.js`** checks, from a session's transcripts, that each agent ran at the effort its call asked for.

**Tech Stack:** Node.js 22, CommonJS, `node:test`, no dependencies. Claude Code 2.1.295 plugin agents, skills, the usage meter mod (`claude-code/testing`) and dynamic workflows.

**Spec:** `docs/superpowers/specs/2026-10-08-effort-per-task-design.md`

## Global Constraints

- **Code:**
  - Node.js 22 with no dependencies;
  - files under `plugins/aether/lib/`, `plugins/aether/bin/`, `scripts/` and `tests/` are CommonJS and start with `'use strict'`;
  - `plugins/aether/workflows/run.workflow.js` stays plain JavaScript: it starts with `export const meta = {`, imports nothing, and never calls `Date.now()` or `Math.random()`.
- **Names:**
  - the models are `haiku`, `sonnet` and `opus`;
  - the efforts are `low`, `medium`, `high`, `xhigh` and `max`, in that order;
  - a rung is written `<model> <effort>`, with one space, such as `sonnet high`.
- **Defaults:** an implementer's effort is `xhigh`, and a supervisor's is `high`. Ops runs at `low`, and the final reviewer at `high`.
- **Exact text.** Every message, label, prompt line, log line, field name and document text this plan quotes is a requirement. Use it verbatim.
- **Test first** (superpowers test-driven development): write the task's tests, watch them fail for the reason given, then make them pass.
- **Existing tests** keep passing unchanged, except the assertions a task names.
- **`supervisor.md`, `reviewer.md` and `run.workflow.js` never say "the Designer"** (`tests/roles.test.js`).
- **No task changes** anything under `docs/superpowers/`, nor `docs/claude-code-research.md` or `scripts/aether-mode.fish`.

## Review Focus

1. **A Tier line with more than a model and an effort,** such as `Tier: sonnet high effort — x`. It must be refused with the Tier message, not half read. Task 1 tests it.
2. **A reason that starts with an effort word,** such as `Tier: haiku — high stakes`. It stays the reason, and the effort stays the default. Task 1 tests it.
3. **A task whose own model has no attempts,** such as `haiku medium` with `Ladder: haiku 0, ...`. The unit starts on the next model at `xhigh`; the declared effort never reaches another model. Task 5 tests it.
4. **Args compiled before this change,** such as a relaunch that reuses old JSON. The workflow refuses them before any agent starts, rather than running at an undefined effort. Task 5 tests it.
5. **Records written before this change:** usage entries without an effort, and results whose `tiers` hold bare models. They read as `unknown`, escalations count as before, and nothing climbed. Task 3 tests it.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 100

## File Structure

| File | Task | Responsibility |
|---|---|---|
| `plugins/aether/lib/plan.js` | 1 | Reads the effort on the Tier line and the Review line, and resolves both for compile |
| `tests/plan-fixtures.js` | 1 | Its `task()` builder gains a `review` option |
| `tests/plan.test.js`, `tests/aether-plan.test.js` | 1 | Parse, graph, brief and compile tests |
| `plugins/aether/hooks/register.js`, `plugins/aether/hooks/usage.test.ts` | 2 | The usage meter's `effort` field |
| `plugins/aether/lib/report.js`, `tests/report.test.js`, `tests/report-fixtures.js` | 3 | `byEffort`, `cost.run.agents`, `climbed`, and escalations by model |
| `scripts/check-effort.js`, `tests/check-effort.test.js` | 4 | The transcript check (new) |
| `plugins/aether/workflows/run.workflow.js`, `plugins/aether/agents/supervisor.md`, `tests/workflow.test.js`, `tests/workflow-harness.js` | 5 | Effort per call, the rule, rungs in labels, prompts, logs and results |
| `plugins/aether/agents/designer.md`, both skills, `README.md`, `docs/decisions.md`, `plugin.json` | 6 | The Designer's rubric, the documents and version 0.3.0 |

## Before the swarm: the effort probe

The Lead runs this in its own session, once the owner approves the plan and before `aether-plan compile`. It checks the one fact this plan cannot test in Node: that a call's effort overrides the effort in the agent file (spec §9). The three agents use no tool, so the probe costs cents and about a minute.

**1. Run the probe.** Call the Workflow tool with this script, inline, and no args:

```js
export const meta = {
  name: 'effort-probe',
  description: 'Checks that the effort passed to agent() overrides the effort in the agent file',
  phases: [{ title: 'Probe', detail: 'three tool-free agents at known efforts' }],
}

const REPLY = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } }
const PROMPT = 'This is a probe of the reasoning effort. Do not run any command, and use no tool except the structured output. Return ok: true.'

phase('Probe')
return await parallel([
  () => agent(PROMPT, { agentType: 'aether:ops', model: 'haiku', effort: 'high', phase: 'Probe', label: 'effort probe: ops at high', schema: REPLY }),
  () => agent(PROMPT, { agentType: 'aether:implementer', model: 'haiku', effort: 'medium', phase: 'Probe', label: 'effort probe: implementer at medium', schema: REPLY }),
  () => agent(PROMPT, { agentType: 'aether:ops', model: 'haiku', phase: 'Probe', label: 'effort probe: ops with no effort', schema: REPLY }),
])
```

**2. Read the efforts** the three agents' transcripts recorded:

```bash
node -e '
const fs = require("fs"), path = require("path"), os = require("os")
const root = path.join(os.homedir(), ".claude", "projects")
const out = {}
for (const project of fs.readdirSync(root)) {
  const workflows = path.join(root, project, process.argv[1], "subagents", "workflows")
  if (!fs.existsSync(workflows)) continue
  for (const run of fs.readdirSync(workflows)) {
    for (const name of fs.readdirSync(path.join(workflows, run))) {
      if (!name.endsWith(".meta.json")) continue
      const meta = JSON.parse(fs.readFileSync(path.join(workflows, run, name), "utf8"))
      if (!String(meta.description).startsWith("effort probe: ")) continue
      const lines = fs.readFileSync(path.join(workflows, run, name.replace(".meta.json", ".jsonl")), "utf8").trim().split("\n").map((l) => JSON.parse(l))
      const seen = new Set(lines.filter((l) => l.type === "assistant").flatMap((l) => [l.effort, l.perTurnEffort]).filter((e) => typeof e === "string"))
      out[meta.description] = [...seen].sort()
    }
  }
}
console.log(JSON.stringify(out, null, 2))
' "$CLAUDE_CODE_SESSION_ID"
```

Expected:

```json
{
  "effort probe: ops at high": ["high"],
  "effort probe: implementer at medium": ["medium"],
  "effort probe: ops with no effort": ["low"]
}
```

The keys may come in another order.

**3. Decide.**
- **Pass:** `effort probe: ops at high` shows only `high`, and `effort probe: implementer at medium` only `medium`. Go on to step 4. The third line is recorded either way; `low` means that the agent file is the default when a call names no effort.
- **Fail:** stop, and do not compile. Bring the output to the owner and the Designer. Nothing is built yet.
  - When all three show the same effort, `CLAUDE_CODE_EFFORT_LEVEL` is set in the session. Unset it, and run the probe again.
  - Otherwise, the Designer puts the two ways out to the owner (spec §9): one agent file per effort, or a `turn.step` hook that sets each agent's effort from its label. Then the Designer revises this plan.

**4. Record.** On the integration branch, add this section to `docs/claude-code-research.md`, right before `## OpenRouter prices`. Fill in the date, the Claude Code version (`claude --version`) and the three efforts the probe printed. Then commit it with the message `docs(aether): record the effort probe`.

```markdown
## Effort per task findings (<date>)

From the effort probe of the [effort per task plan](superpowers/plans/2026-10-08-effort-per-task.md), on Claude Code <version>.

| Topic | Result |
|---|---|
| A call's effort against the agent file's | A workflow `agent()` call with `effort: 'high'` on `aether:ops`, whose file sets `low`, ran at `<effort>`. One with `effort: 'medium'` on `aether:implementer`, whose file sets `xhigh`, ran at `<effort>`. |
| A call with no effort | An `aether:ops` call that named no effort ran at `<effort>`. |
| Where the effort is recorded | Each assistant line of a workflow agent's transcript carries `effort` and `perTurnEffort`. The usage meter's agent ids are the transcripts' ids. |
```

Then compile the plan and launch the swarm, as the `aether:swarm` skill says.

## Tasks

### Task 1: Effort and Review in plans

**Aether:**
- Tier: haiku — exact messages, fields and tests pin the parser and the compile output down
- Area: plan
- Owns: `plugins/aether/lib/plan.js`, `tests/plan.test.js`, `tests/aether-plan.test.js`, `tests/plan-fixtures.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/lib/plan.js`
- Modify: `tests/plan-fixtures.js`
- Test: `tests/plan.test.js`, `tests/aether-plan.test.js`

**Interfaces:**
- Produces, in `plugins/aether/lib/plan.js`:
  - `EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']`, in this order;
  - `DEFAULT_EFFORT = 'xhigh'` and `DEFAULT_REVIEW = 'high'`;
  - module exports: `{ TIERS, EFFORTS, DEFAULT_EFFORT, DEFAULT_REVIEW, parsePlan, buildGraph, renderBrief }`.
- `parsePlan(markdown)`: each task gains three fields. `tier` and `tierReason` keep their meaning.
  - `effort`: the Tier line's effort, or `null`;
  - `review`: the Review line's effort, or `null`;
  - `reviewReason`: the Review line's reason, or `null`.
- `buildGraph(parsed, { only })`: each node in `tasks` gains two fields. So `aether-plan compile` prints both on every task, and `bin/aether-plan` does not change.
  - `effort`: the task's effort, or `DEFAULT_EFFORT`;
  - `review`: the task's review, or `DEFAULT_REVIEW`.
- `renderBrief(task, options)`: the header's Tier line is `- Tier: <tier> <effort> — <tierReason>`, where `<effort>` is the task's effort or `DEFAULT_EFFORT`.
- **Grammar:**
  - Tier: `- Tier: <model> [<effort>] <dash> <reason>`;
  - Review: `- Review: <effort> <dash> <reason>`, where the effort is `high`, `xhigh` or `max`;
  - `<dash>` is `—`, `–`, `--` or `-`, with spaces around it, as today. Models and efforts are case-insensitive, and are stored in lowercase.
- **Messages** (spec §5), where `N` is the task number:
  - `Task N: Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".` It replaces today's Tier message.
  - `Task N: <model> <effort> is not used for implementers; Sonnet and Opus run at high, xhigh or max.` It applies to `sonnet` or `opus` with `low` or `medium`.
  - `Task N: Review must be high, xhigh or max, then " — reason".`
  - A refused or unreadable Tier line does not also give `Task N: missing Tier.`
- Produces, in `tests/plan-fixtures.js`: `task(n, { title, tier, review, area, owns, depends })`. When `review` is given, the block holds `- Review: <review>` on the line right after `- Tier:`. Task 5 uses it.

- [ ] **Step 1: Add the `review` option to the fixture builder**

In `tests/plan-fixtures.js`, replace the `task` function with:

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
    ...(review === null ? [] : [`- Review: ${review}`]),
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

- [ ] **Step 2: Write the failing tests**

In `tests/plan.test.js`, change the first line of requires to:

```js
const { EFFORTS, DEFAULT_EFFORT, DEFAULT_REVIEW, parsePlan, buildGraph, renderBrief } = require('../plugins/aether/lib/plan.js')
```

In the test `parsePlan reports missing and malformed Aether fields`, replace the two Tier assertions with:

```js
  assert.ok(errors.includes('Task 2: Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".'))
  assert.ok(errors.includes('Task 3: Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".'))
```

Append these tests to `tests/plan.test.js`:

```js
const TIER_MESSAGE = 'Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".'
const REVIEW_MESSAGE = 'Review must be high, xhigh or max, then " — reason".'

test('plan.js exports the effort levels in order and the two defaults', () => {
  assert.deepEqual(EFFORTS, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(DEFAULT_EFFORT, 'xhigh')
  assert.equal(DEFAULT_REVIEW, 'high')
})

test('parsePlan reads an optional effort on the Tier line, in any case and dash form', () => {
  const parsed = parsePlan(plan([
    task(1),
    task(2, { tier: 'Haiku MEDIUM — renames one field' }),
    task(3, { tier: 'sonnet high - wiring the tests pin down' }),
    task(4, { tier: 'opus max -- a migration that needs the deepest look' }),
    task(5, { tier: 'haiku low — a constant the tests pin down' }),
  ]))
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(
    parsed.tasks.map((t) => [t.tier, t.effort, t.tierReason]),
    [
      ['haiku', null, 'complete code'],
      ['haiku', 'medium', 'renames one field'],
      ['sonnet', 'high', 'wiring the tests pin down'],
      ['opus', 'max', 'a migration that needs the deepest look'],
      ['haiku', 'low', 'a constant the tests pin down'],
    ],
  )
})

test('parsePlan keeps a reason that starts with an effort word as the reason', () => {
  const parsed = parsePlan(plan([task(1, { tier: 'haiku — high stakes, but the tests pin it down' })]))
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.tasks[0].effort, null)
  assert.equal(parsed.tasks[0].tierReason, 'high stakes, but the tests pin it down')
})

test('parsePlan refuses an unknown effort, extra words, and Sonnet or Opus below high', () => {
  const { errors } = parsePlan(plan([
    task(1, { tier: 'haiku turbo — x' }),
    task(2, { tier: 'sonnet medium — x' }),
    task(3, { tier: 'opus low — x' }),
    task(4, { tier: 'sonnet high effort — x' }),
  ]))
  assert.deepEqual(errors, [
    `Task 1: ${TIER_MESSAGE}`,
    'Task 2: sonnet medium is not used for implementers; Sonnet and Opus run at high, xhigh or max.',
    'Task 3: opus low is not used for implementers; Sonnet and Opus run at high, xhigh or max.',
    `Task 4: ${TIER_MESSAGE}`,
  ])
})

test('parsePlan reads an optional Review line, and refuses one below high, unknown, or without a reason', () => {
  const parsed = parsePlan(plan([
    task(1),
    task(2, { review: 'XHIGH — file-system edge cases the tests do not cover' }),
    task(3, { review: 'max - a parser whose inputs the tests cannot list' }),
  ]))
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(
    parsed.tasks.map((t) => [t.review, t.reviewReason]),
    [
      [null, null],
      ['xhigh', 'file-system edge cases the tests do not cover'],
      ['max', 'a parser whose inputs the tests cannot list'],
    ],
  )
  const { errors } = parsePlan(plan([task(1, { review: 'medium — x' }), task(2, { review: 'xhigh' }), task(3, { review: 'deep — x' })]))
  assert.deepEqual(errors, [`Task 1: ${REVIEW_MESSAGE}`, `Task 2: ${REVIEW_MESSAGE}`, `Task 3: ${REVIEW_MESSAGE}`])
})

test('buildGraph resolves each task to its effort and review, with xhigh and high as the defaults', () => {
  const graph = buildGraph(parsePlan(plan([
    task(1),
    task(2, { tier: 'haiku medium — renames one field', review: 'xhigh — input parsing' }),
    task(3, { tier: 'sonnet — UI states' }),
  ])))
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(
    ['task-1', 'task-2', 'task-3'].map((id) => [graph.tasks[id].tier, graph.tasks[id].effort, graph.tasks[id].review]),
    [
      ['haiku', 'xhigh', 'high'],
      ['haiku', 'medium', 'xhigh'],
      ['sonnet', 'xhigh', 'high'],
    ],
  )
})

test('renderBrief names the starting rung on its Tier line', () => {
  const parsed = parsePlan(plan([task(1), task(2, { tier: 'sonnet high — wiring the tests pin down' })]))
  const options = { planPath: '/p/plan.md', spec: parsed.spec, globalConstraints: parsed.globalConstraints }
  assert.match(renderBrief(parsed.tasks[0], options), /^- Tier: haiku xhigh — complete code$/m)
  assert.match(renderBrief(parsed.tasks[1], options), /^- Tier: sonnet high — wiring the tests pin down$/m)
})
```

Append these tests to `tests/aether-plan.test.js`:

```js
test('compile gives every task its effort and review, and the brief its starting rung', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { tier: 'sonnet high — wiring the tests pin down', review: 'xhigh — UI states' })]))
  const r = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(
    ['task-1', 'task-2'].map((id) => [r.json.tasks[id].tier, r.json.tasks[id].effort, r.json.tasks[id].review]),
    [
      ['haiku', 'xhigh', 'high'],
      ['sonnet', 'high', 'xhigh'],
    ],
  )
  assert.match(fs.readFileSync(r.json.tasks['task-1'].brief, 'utf8'), /^- Tier: haiku xhigh — complete code$/m)
})

test('check refuses Sonnet below high with its message, and no other', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2, { tier: 'sonnet medium — x' })]))
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['Task 2: sonnet medium is not used for implementers; Sonnet and Opus run at high, xhigh or max.'])
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --test tests/plan.test.js tests/aether-plan.test.js`
Expected: FAIL. `EFFORTS` is undefined, each task's `effort` and `review` are undefined, and the Tier messages differ.

- [ ] **Step 4: Make the tests pass within the Interfaces**

Change `plugins/aether/lib/plan.js` only.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, with every existing test unchanged except the two Tier assertions of Step 2.

- [ ] **Step 6: Commit**

```bash
git add plugins/aether/lib/plan.js tests/plan.test.js tests/aether-plan.test.js tests/plan-fixtures.js
git commit -m "feat(aether): read each task's effort and review from the plan"
```

**Acceptance:**
- `npm test` passes.
- A plan whose Tier lines name no effort compiles to the same args as before, plus `effort: 'xhigh'` and `review: 'high'` on every task.

### Task 2: The meter records each request's effort

**Aether:**
- Tier: haiku — one new field, pinned by an exact mod test, in two files
- Area: measure
- Owns: `plugins/aether/hooks/register.js`, `plugins/aether/hooks/usage.test.ts`
- Depends on: none

**Files:**
- Modify: `plugins/aether/hooks/register.js`
- Test: `plugins/aether/hooks/usage.test.ts`

**Interfaces:**
- Produces: each usage entry is `{ t, ms, agent, model, effort, input, output, cacheRead, cacheWrite }`.
  - `effort` is the `turn.step` event's `effort` (`e.effort`) when it is a non-empty string, and `null` otherwise.
  - Nothing else in the file format changes.
- Consumed by Task 3, through the usage files that `aether-report` reads.

- [ ] **Step 1: Write the failing tests**

In `plugins/aether/hooks/usage.test.ts`, in the test `records main and agent requests with the agent type, and writes part 0 when a turn ends`, replace the `expect(part.entries).toEqual([...])` assertion with:

```ts
  expect(part.entries).toEqual([
    { t: 1000, ms: 0, agent: null, model: 'claude-opus-5-5', effort: null, input: 10, output: 5, cacheRead: 100, cacheWrite: 50 },
    { t: 1000, ms: 0, agent: 'agent-1', model: 'claude-haiku-5-5', effort: null, input: 10, output: 5, cacheRead: 100, cacheWrite: 50 },
  ])
```

Append this test:

```ts
test('an entry records the effort its request went out with, or null when the event has none', async ($, on) => {
  const writes = stubs(on)
  await step($, { effort: 'xhigh' })
  await step($, { model: 'claude-haiku-5-5', agentId: 'agent-1', effort: 'medium' })
  await step($)
  await endTurn($)
  const part = files(writes)['/home/u/.local/share/aether-plugin/usage/s1/0.json']
  expect(part.entries.map((entry) => entry.effort)).toEqual(['xhigh', 'medium', null])
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `claude plugin test plugins/aether`
Expected: FAIL. The entries have no `effort` field.

- [ ] **Step 3: Make the tests pass within the Interfaces**

Change `plugins/aether/hooks/register.js` only. The meter keeps observing only: a failure never touches a request.

- [ ] **Step 4: Run the checks**

Run: `claude plugin test plugins/aether && npm run validate && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/hooks/register.js plugins/aether/hooks/usage.test.ts
git commit -m "feat(aether): record each request's effort in the usage meter"
```

**Acceptance:**
- `claude plugin test plugins/aether`, `npm run validate` and `npm test` pass.

### Task 3: The report shows cost and time by effort, each agent, and the climbs

**Aether:**
- Tier: haiku — exact tests pin three additions to one module and its fixtures
- Area: measure
- Owns: `plugins/aether/lib/report.js`, `tests/report.test.js`, `tests/report-fixtures.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/lib/report.js`
- Modify: `tests/report-fixtures.js`
- Test: `tests/report.test.js`

**Interfaces:**
- Consumes: usage entries that may carry `effort` (Task 2's field). An entry without it counts as having no known effort.
- Produces, in the object `report(cwd, runId, options)` returns (spec §10):
  - **`cost.run.byEffort` and `cost.session.byEffort`:** `{ [key]: { usd, requests, outputTokens, ms } }`.
    - The key is `<role> <model> <effort>`.
    - `<role>` is the role `byRole` uses: `main`, the agent's type, or `agent`.
    - `<model>` is the entry's model, or `unknown`; `<effort>` is the entry's effort, or `unknown`.
    - `usd` is priced as `byModel` prices it; an unpriced entry adds no `usd` but counts a request.
    - `outputTokens` sums `output`. `ms` sums `ms`, where an entry without one adds 0.
  - **`cost.run.agents`:** `Array<{ agent, type, label, model, effort, requests, usd, outputTokens, ms }>`, only in `cost.run`.
    - There is one item per agent with entries in the run's window, the main session included as `agent: null`.
    - The items follow the order of each one's first entry in the window.
    - `type` is `main`, the agent's type, or `agent`. `label` is the agent's `description` from the usage file, or `null`.
    - `model` and `effort` join the entries' distinct non-null values, in the order first seen, with `", "`. Each is `null` when the agent has none.
    - `requests`, `usd`, `outputTokens` and `ms` are counted as in `byEffort`.
  - **`quality.climbed`:** the number of units that climbed in some launch.
    - A unit climbed when two consecutive entries of a launch's `tiers` name the same model, and the later one a higher effort, in the order `low`, `medium`, `high`, `xhigh`, `max`.
    - It is `null` when no result was saved, like the other counts.
  - **`quality.escalated`:** a unit escalated when two entries of a launch's `tiers` name different models, or when a later launch starts on another model than its first launch did.
    - The model of an entry is its first word, so the bare models of results saved before this change count as before.
  - Every other field is unchanged.
- Task 4 consumes `cost.run.agents[].agent` and `cost.run.agents[].effort`.

- [ ] **Step 1: Give the fixtures efforts and the new labels**

In `tests/report-fixtures.js`, replace the `entry` and `sampleUsage` functions with:

```js
// One request, priced simply: a million tokens of one kind.
function entry(minutes, model, agent, kind, ms = 1000, effort = null) {
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, [kind]: 1e6 }
  return { t: T0 + minutes * MIN, ms, agent, model, effort, ...tokens }
}
```

```js
// The run's session, in two parts: main requests before, during and after the run, and one
// request from each aether agent, at its effort. Another session has main requests during the run.
function sampleUsage(dataDir) {
  const implementer = { type: 'aether:implementer', description: 'task-1: implement on haiku medium (attempt 1)' }
  writeUsage(dataDir, 'run-session', [
    {
      agents: { i1: implementer },
      entries: [entry(-5, OPUS, null, 'input'), entry(1, OPUS, null, 'input'), entry(5, HAIKU, 'i1', 'output', MIN, 'medium')],
    },
    {
      agents: {
        i1: implementer,
        s1: { type: 'aether:supervisor', description: 'task-1: supervise attempt 1 on sonnet xhigh' },
        r1: { type: 'aether:reviewer', description: 'final review' },
      },
      entries: [entry(10, SONNET, 's1', 'input', 1000, 'xhigh'), entry(20, OPUS, 'r1', 'output', 2 * MIN, 'high'), entry(31, OPUS, null, 'input')],
    },
  ])
  writeUsage(dataDir, 'other-session', [{ agents: {}, entries: [entry(2, SONNET, null, 'input'), entry(3, SONNET, null, 'input'), entry(4, SONNET, null, 'input')] }])
}
```

- [ ] **Step 2: Write the failing tests**

In `tests/report.test.js`:
- in the test `report counts quality from the saved result, and runs the tests at integration`, add `climbed: 0,` to the expected object, right after `escalated: 1,`;
- in the test `report says so when the tests fail at integration, or when nothing was measured`, add `assert.equal(r.quality.climbed, null)` after `assert.equal(r.quality.units, null)`.

Then append these tests. They use only what `tests/report.test.js` already requires:

```js
test('report gives cost, output tokens and time by role, model and effort', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const { cost } = report(repo.dir, args.runId, { tests: false })
  const byEffort = cost.run.byEffort
  assert.deepEqual(Object.keys(byEffort).sort(), [
    'aether:implementer claude-haiku-5-5 medium',
    'aether:reviewer claude-opus-5-5 high',
    'aether:supervisor claude-sonnet-5-5 xhigh',
    'main claude-opus-5-5 unknown',
  ])
  const implementer = byEffort['aether:implementer claude-haiku-5-5 medium']
  close(implementer.usd, 0.5)
  assert.deepEqual([implementer.requests, implementer.outputTokens, implementer.ms], [1, 1e6, MIN])
  const reviewer = byEffort['aether:reviewer claude-opus-5-5 high']
  close(reviewer.usd, 20)
  assert.deepEqual([reviewer.requests, reviewer.outputTokens, reviewer.ms], [1, 1e6, 2 * MIN])
  const main = byEffort['main claude-opus-5-5 unknown']
  close(main.usd, 4)
  assert.deepEqual([main.requests, main.outputTokens], [1, 0])
  // The whole session also counts the main requests before and after the run, which carry no effort.
  assert.equal(cost.session.byEffort['main claude-opus-5-5 unknown'].requests, 3)
})

test('report lists each agent of the run in the order of its first request, with its label, model and effort', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  const { cost } = report(repo.dir, args.runId, { tests: false })
  const { agents } = cost.run
  assert.deepEqual(
    agents.map(({ usd, ...rest }) => rest),
    [
      { agent: null, type: 'main', label: null, model: OPUS, effort: null, requests: 1, outputTokens: 0, ms: 1000 },
      { agent: 'i1', type: 'aether:implementer', label: 'task-1: implement on haiku medium (attempt 1)', model: HAIKU, effort: 'medium', requests: 1, outputTokens: 1e6, ms: MIN },
      { agent: 's1', type: 'aether:supervisor', label: 'task-1: supervise attempt 1 on sonnet xhigh', model: SONNET, effort: 'xhigh', requests: 1, outputTokens: 0, ms: 1000 },
      { agent: 'r1', type: 'aether:reviewer', label: 'final review', model: OPUS, effort: 'high', requests: 1, outputTokens: 1e6, ms: 2 * MIN },
    ],
  )
  close(agents[0].usd, 4)
  close(agents[3].usd, 20)
  assert.equal(cost.session.agents, undefined)
})

test('an agent that ran at several efforts lists them in the order it used them', (t) => {
  const dataDir = useDataDir(t)
  const at = (minutes, effort) => ({ t: T0 + minutes * MIN, ms: 1000, agent: 'a1', model: HAIKU, effort, input: 0, output: 1, cacheRead: 0, cacheWrite: 0 })
  writeUsage(dataDir, 'one-agent', [
    {
      agents: { a1: { type: 'aether:implementer', description: 'task-1: implement on haiku medium (attempt 1)' } },
      entries: [at(1, 'medium'), at(2, 'xhigh'), at(3, 'medium'), at(4, null)],
    },
  ])
  const { repo, args } = finishedRun(t)
  const [item] = report(repo.dir, args.runId, { session: 'one-agent', tests: false }).cost.run.agents
  assert.deepEqual([item.agent, item.model, item.effort, item.requests, item.outputTokens], ['a1', HAIKU, 'medium, xhigh', 4, 4])
})

test('report counts climbs apart from escalations, from the rungs in each unit\'s tiers', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  const file = path.join(args.runDir, 'result.json')
  writeJson(file, {
    units: [
      { id: 'task-1', status: 'merged', tiers: ['haiku medium', 'haiku xhigh'], attempts: 2, rounds: [] },
      { id: 'task-2', status: 'merged', tiers: ['haiku xhigh', 'sonnet xhigh'], attempts: 3, rounds: [] },
      { id: 'task-3', status: 'merged', tiers: ['sonnet high', 'sonnet xhigh', 'opus xhigh'], attempts: 3, rounds: [] },
    ],
    finalReview: { status: 'done', verdict: 'ready', findings: [] },
    agents: { total: 9 },
  })
  fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual([quality.climbed, quality.escalated], [2, 2])
})

test('a relaunch on the same model is no escalation, and a relaunch on another model is one', (t) => {
  useDataDir(t)
  const { repo, args } = finishedRun(t)
  writeJson(path.join(args.runDir, 'result-1.json'), {
    units: [
      { id: 'task-1', status: 'merged', tiers: ['haiku xhigh'], attempts: 1, rounds: [] },
      { id: 'task-2', status: 'blocked', tiers: ['haiku medium'], attempts: 1, rounds: [] },
      { id: 'task-3', status: 'blocked', tiers: ['haiku xhigh'], attempts: 1, rounds: [] },
    ],
    agents: { total: 6 },
  })
  const file = path.join(args.runDir, 'result.json')
  writeJson(file, {
    units: [
      { id: 'task-2', status: 'merged', tiers: ['haiku medium'], attempts: 1, rounds: [] },
      { id: 'task-3', status: 'merged', tiers: ['sonnet xhigh'], attempts: 1, rounds: [] },
    ],
    agents: { total: 4 },
  })
  fs.utimesSync(file, new Date(T0 + 30 * MIN), new Date(T0 + 30 * MIN))
  const { quality } = report(repo.dir, args.runId, { tests: false })
  assert.deepEqual([quality.launches, quality.escalated, quality.climbed], [2, 1, 0])
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --test tests/report.test.js`
Expected: FAIL. `byEffort`, `agents` and `climbed` are undefined, and a relaunch that stays on Haiku counts as an escalation.

- [ ] **Step 4: Make the tests pass within the Interfaces**

Change `plugins/aether/lib/report.js` only.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. The existing report tests keep their figures; only the two assertions named in Step 2 change.

- [ ] **Step 6: Commit**

```bash
git add plugins/aether/lib/report.js tests/report.test.js tests/report-fixtures.js
git commit -m "feat(aether): report cost and time by effort, each agent, and the climbs"
```

**Acceptance:**
- `npm test` passes.
- A report on usage and results written before this change shows the same figures as before, plus `byEffort` with `unknown` efforts, the agents list, and `climbed: 0`.

### Task 4: `check-effort.js`, the transcript check

**Aether:**
- Tier: haiku — a new script whose behavior exact tests pin down
- Area: measure
- Owns: `scripts/check-effort.js`, `tests/check-effort.test.js`
- Depends on: none

**Files:**
- Create: `scripts/check-effort.js`
- Test: `tests/check-effort.test.js` (new)

**Interfaces:**
- **The command:** `node scripts/check-effort.js <session-dir> [--report <report.json>]`.
  - It prints one line of JSON, the result of `checkSession`. It exits 0 when `ok` is true, and 1 otherwise.
  - On a usage error, it prints `{"ok":false,"agents":[],"problems":["usage: node scripts/check-effort.js <session-dir> [--report <report.json>]"]}` and exits 2. Usage errors are a missing session directory argument, a session directory that does not exist, and `--report` without a file.
- **The module:** it exports `{ checkSession }`, and runs as a command only when `require.main === module`.
- **`checkSession(sessionDir, { report = null } = {})`** returns `{ ok, agents, problems }`.
  - **The agents.** It reads every `<sessionDir>/subagents/workflows/*/agent-<id>.meta.json` whose `agentType` starts with `aether:`. The `label` is the meta file's `description`, and `<id>` comes from the file name.
  - **`agents`:** `Array<{ agent, type, label, expected, seen }>`, sorted by label with the default string order.
  - **`expected`:** the effort the label names, matched with `/ on (?:haiku|sonnet|opus) (low|medium|high|xhigh|max)\b/`.
    - Without one, `low` for `aether:ops` and `high` for `aether:reviewer`.
    - Otherwise `null`.
  - **`seen`:** the distinct string values of `effort` and `perTurnEffort` on the lines of `agent-<id>.jsonl` whose `type` is `assistant`, sorted. Other lines are ignored.
  - **`problems`:** strings, in the order of `agents`. Each agent gives its transcript problem first, then its report problem:
    - `<label>: the label names no effort`, when `expected` is `null`;
    - `<label>: expected <expected>, saw no effort`, when `seen` is empty;
    - `<label>: expected <expected>, saw <seen joined with ", ">`, when `seen` is not exactly `[expected]`;
    - with a `report`, for each agent whose `expected` is known:
      - `<label>: not in the report`, when `report.cost.run.agents` has no item whose `agent` is the agent's id, or when the report has no `cost.run.agents`;
      - `<label>: the report shows <effort>`, when that item's `effort` differs from `expected`;
    - `no aether workflow agents under <sessionDir>`, when it finds none.
  - **`ok`:** true when `problems` is empty.
- Consumes Task 3's `cost.run.agents` items, `{ agent, effort, ... }`. The `--report` file is the JSON that `aether-report --run <id>` prints.

- [ ] **Step 1: Write the failing tests**

Create `tests/check-effort.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const { checkSession } = require('../scripts/check-effort.js')

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-effort.js')
const USAGE = 'usage: node scripts/check-effort.js <session-dir> [--report <report.json>]'

// Writes one workflow agent the way Claude Code keeps it: a meta file, and a transcript whose
// assistant lines carry the effort each request went out with. Other lines are not requests.
function writeAgent(sessionDir, id, { type, label, efforts }) {
  const dir = path.join(sessionDir, 'subagents', 'workflows', 'wf_1')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `agent-${id}.meta.json`), JSON.stringify({ agentType: type, description: label, model: 'haiku' }))
  const lines = [{ type: 'user', agentId: id, effort: 'max', message: { role: 'user', content: 'go' } }]
  for (const effort of efforts) lines.push({ type: 'assistant', agentId: id, effort, perTurnEffort: effort, message: { model: 'claude-haiku-5-5' } })
  fs.writeFileSync(path.join(dir, `agent-${id}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n') + '\n')
}

// A session in which every aether agent ran at the effort its call asked for.
function session(t) {
  const dir = tempDir(t, 'aether-session-')
  writeAgent(dir, 'a1', { type: 'aether:implementer', label: 'task-1: implement on haiku medium (attempt 1)', efforts: ['medium', 'medium'] })
  writeAgent(dir, 'a2', { type: 'aether:supervisor', label: 'task-1: supervise attempt 1 on sonnet xhigh', efforts: ['xhigh'] })
  writeAgent(dir, 'a3', { type: 'aether:ops', label: 'task-1: merge', efforts: ['low'] })
  writeAgent(dir, 'a4', { type: 'aether:reviewer', label: 'final review', efforts: ['high'] })
  writeAgent(dir, 'a5', { type: 'general-purpose', label: 'not an aether agent', efforts: ['max'] })
  return dir
}

test('checkSession passes when every aether agent ran at the effort its call asked for', (t) => {
  assert.deepEqual(checkSession(session(t)), {
    ok: true,
    agents: [
      { agent: 'a4', type: 'aether:reviewer', label: 'final review', expected: 'high', seen: ['high'] },
      { agent: 'a1', type: 'aether:implementer', label: 'task-1: implement on haiku medium (attempt 1)', expected: 'medium', seen: ['medium'] },
      { agent: 'a3', type: 'aether:ops', label: 'task-1: merge', expected: 'low', seen: ['low'] },
      { agent: 'a2', type: 'aether:supervisor', label: 'task-1: supervise attempt 1 on sonnet xhigh', expected: 'xhigh', seen: ['xhigh'] },
    ],
    problems: [],
  })
})

test('checkSession reports another effort, a label that names none, a transcript with none, and an empty session', (t) => {
  const dir = session(t)
  writeAgent(dir, 'a6', { type: 'aether:implementer', label: 'task-2: implement on sonnet high (attempt 1)', efforts: ['high', 'xhigh'] })
  writeAgent(dir, 'a7', { type: 'aether:supervisor', label: 'task-2: supervise attempt 1', efforts: ['high'] })
  writeAgent(dir, 'a8', { type: 'aether:implementer', label: 'task-3: implement on haiku xhigh (attempt 1)', efforts: [] })
  const result = checkSession(dir)
  assert.equal(result.ok, false)
  assert.deepEqual(result.problems, [
    'task-2: implement on sonnet high (attempt 1): expected high, saw high, xhigh',
    'task-2: supervise attempt 1: the label names no effort',
    'task-3: implement on haiku xhigh (attempt 1): expected xhigh, saw no effort',
  ])
  assert.deepEqual(
    result.agents.find((a) => a.agent === 'a7'),
    { agent: 'a7', type: 'aether:supervisor', label: 'task-2: supervise attempt 1', expected: null, seen: ['high'] },
  )
  const empty = tempDir(t, 'aether-session-')
  assert.deepEqual(checkSession(empty), { ok: false, agents: [], problems: [`no aether workflow agents under ${empty}`] })
})

test('checkSession with a report checks that the report shows the same effort for each agent', (t) => {
  const report = {
    cost: {
      run: {
        agents: [
          { agent: null, effort: 'xhigh' },
          { agent: 'a1', effort: 'medium' },
          { agent: 'a2', effort: 'high' },
          { agent: 'a3', effort: 'low' },
        ],
      },
    },
  }
  const result = checkSession(session(t), { report })
  assert.equal(result.ok, false)
  assert.deepEqual(result.problems, ['final review: not in the report', 'task-1: supervise attempt 1 on sonnet xhigh: the report shows high'])
  assert.equal(checkSession(session(t), { report: { cost: null } }).problems.length, 4)
})

test('the command prints one line of JSON, and exits 0 when all match, 1 on a problem and 2 on a usage error', (t) => {
  const dir = session(t)
  let r = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.equal(JSON.parse(r.stdout).ok, true)
  const reportFile = path.join(tempDir(t, 'aether-report-'), 'report.json')
  fs.writeFileSync(reportFile, JSON.stringify({ cost: { run: { agents: [] } } }))
  r = spawnSync(process.execPath, [SCRIPT, dir, '--report', reportFile], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout).problems.length, 4)
  for (const args of [[], [path.join(dir, 'missing')], [dir, '--report']]) {
    r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 2, args.join(' '))
    assert.deepEqual(JSON.parse(r.stdout), { ok: false, agents: [], problems: [USAGE] })
  }
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tests/check-effort.test.js`
Expected: FAIL with "Cannot find module '../scripts/check-effort.js'".

- [ ] **Step 3: Make the tests pass within the Interfaces**

Create `scripts/check-effort.js`. It starts with `#!/usr/bin/env node`, then `'use strict'`, and a comment that gives the usage line. Make it executable: `chmod +x scripts/check-effort.js`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-effort.js tests/check-effort.test.js
git commit -m "feat(aether): check from the transcripts that each agent ran at its effort"
```

**Acceptance:**
- `npm test` passes.
- `git ls-files -s scripts/check-effort.js` shows mode `100755`.

### Task 5: Every call passes its effort, and the run raises it after a failed attempt

**Aether:**
- Tier: sonnet — the swarm's core loop, its prompts and the supervisor's rules, across four files; the tests pin the calls, and the rule's edge cases need care
- Area: swarm
- Owns: `plugins/aether/workflows/run.workflow.js`, `plugins/aether/agents/supervisor.md`, `tests/workflow.test.js`, `tests/workflow-harness.js`
- Depends on: Task 1 — the workflow tests compile plans whose tasks declare efforts and Review lines, and read each task's `effort` and `review` from the compiled args

**Files:**
- Modify: `plugins/aether/workflows/run.workflow.js`
- Modify: `plugins/aether/agents/supervisor.md`
- Modify: `tests/workflow-harness.js`
- Test: `tests/workflow.test.js`

**Interfaces:**
- Consumes from Task 1:
  - each task in the args has `tier` (its model), `effort` and `review`, each one of `low`, `medium`, `high`, `xhigh`, `max`;
  - the plan fixture `task(n, { tier, review, ... })`.
- **Input.** `readArgs` treats a task as complete only when its `effort` and `review` are among those five levels. Otherwise it throws today's `aether:run args: <id> is not a complete task`, before any agent starts. The workflow keeps its own `EFFORTS` constant, since a workflow cannot import `plan.js`.
- **Every `agent()` call** passes `effort` next to `model`:

  | Role | Model | Effort |
  |---|---|---|
  | implementer | the attempt's model | the rule below |
  | supervisor | `sonnet` | the task's `review` |
  | reviewer | `opus` | `high` |
  | ops | `haiku` | `low` |

- **The rule** (spec §7). Attempts on a model are counted as today, and a merge retry counts none. An implementer attempt runs at:
  - `max` when the attempt's model is the task's `tier` and the task's `effort` is `max`;
  - the task's `effort` when the attempt's model is the task's `tier` and this is the first attempt on it;
  - `xhigh` in every other case.

  The retry after a merge conflict or failing merge tests keeps the model and the effort of the attempt it retries.
- **Rungs.** A rung is `` `${model} ${effort}` ``. Every place that wrote a tier now writes the rung:

  | Where | Text |
  |---|---|
  | implementer label | `task-3: implement on haiku medium (attempt 1)` |
  | implementer prompt, second line | `Run <runId>, attempt 1, on haiku medium.` |
  | supervisor label | `task-3: supervise attempt 1 on sonnet xhigh` (the supervisor's own rung) |
  | supervisor prompt, first line, end | `Attempt 1 ran on haiku medium.` |
  | earlier attempts, in both prompts | `- Attempt 1 on haiku medium: DONE. <summary>` |
  | escalation log | `task-3: escalating from haiku xhigh to sonnet xhigh` |
  | final reviewer's unit lines | `- task-3 (<title>): merged on haiku medium → haiku xhigh` |

- **The supervisor's Ladder section** is the end of its prompt:

  ```text
  ## Ladder
  Attempts used: haiku 1/2, sonnet 0/2, opus 0/1.
  A retry runs on <rung>. Escalate runs on <model> xhigh.
  ```

  - The retry sentence names the rung the next attempt would run on by the rule: the same model while it has attempts left, else the next model with attempts. With none left, it is `A retry blocks the unit: the ladder is spent.`
  - The escalate sentence names the next model with attempts, at `xhigh`. With none left, it is `Escalate blocks the unit: the ladder is spent.`
- **The result:**
  - `unit.tiers` lists rungs, adding one whenever the rung changes;
  - each round's `tier` is its attempt's rung, and its `reviewEffort` is the supervisor's effort, or `null` when no supervisor ran;
  - `agents` is unchanged.
- **`tests/workflow-harness.js`:** each recorded call gains `effort: opts.effort`, right after `model: opts.model`.

- [ ] **Step 1: Record each call's effort in the harness**

In `tests/workflow-harness.js`, inside `agent()`, add `effort: opts.effort,` to the `call` object, right after `model: opts.model,`. Nothing else in the harness changes.

- [ ] **Step 2: Write the failing tests**

In `tests/workflow.test.js`, change these existing assertions:
- in `two waves, all approved: merges run one at a time, the dependent unit waits, then review and cleanup`, each `['haiku']` in the expected units becomes `['haiku xhigh']`;
- in `a unit the supervisor sends back twice on haiku escalates to sonnet and merges`, the expected `unit.tiers` becomes `['haiku xhigh', 'sonnet xhigh']`;
- in `a failed implementer counts as an attempt, and a spent ladder blocks the unit`, the expected `unit.tiers` becomes `['haiku xhigh', 'sonnet xhigh']`.

In `missing or invalid args throw before any agent starts`, add these three entries to the `bad` list:

```js
    { ...args, tasks: { ...args.tasks, 'task-1': { ...args.tasks['task-1'], effort: 'turbo' } } },
    { ...args, tasks: { ...args.tasks, 'task-2': { ...args.tasks['task-2'], review: 'deep' } } },
    // args compiled before this change: no effort and no review
    { ...args, tasks: Object.fromEntries(Object.entries(args.tasks).map(([id, { effort, review, ...old }]) => [id, old])) },
```

Append these tests:

```js
// A compiled run of two independent tasks, with the given options for each.
function twoTasks(t, one = {}, two = {}) {
  const repo = makeRepo(t)
  return compile(repo, plan([task(1, one), task(2, two)]))
}

const rungs = (run, unit) => attemptsOf(run, unit).map((c) => `${c.model} ${c.effort}`)

test("every call passes its effort: the task's for implementers, its review for supervisors, high for the reviewer, low for ops", async (t) => {
  const args = twoTasks(t, {}, { tier: 'haiku medium — renames one field', review: 'xhigh — input parsing the tests leave open' })
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  const of = (role, unit) => run.calls.filter((c) => c.role === role && c.unit === unit).map((c) => `${c.model} ${c.effort}`)
  assert.deepEqual(of('implementer', 'task-1'), ['haiku xhigh'])
  assert.deepEqual(of('implementer', 'task-2'), ['haiku medium'])
  assert.deepEqual(of('supervisor', 'task-1'), ['sonnet high'])
  assert.deepEqual(of('supervisor', 'task-2'), ['sonnet xhigh'])
  assert.deepEqual(run.calls.filter((c) => c.role === 'reviewer').map((c) => `${c.model} ${c.effort}`), ['opus high'])
  const ops = run.calls.filter((c) => c.role === 'ops')
  assert.ok(ops.length > 0)
  assert.ok(ops.every((c) => c.model === 'haiku' && c.effort === 'low'))
  assert.deepEqual(run.result.units.map((u) => u.tiers), [['haiku xhigh'], ['haiku medium']])
  assert.deepEqual(run.result.units[1].rounds.map((r) => [r.tier, r.reviewEffort]), [['haiku medium', 'xhigh']])
  const implement = run.calls.find((c) => c.role === 'implementer' && c.unit === 'task-2')
  assert.equal(implement.label, 'task-2: implement on haiku medium (attempt 1)')
  assert.match(implement.prompt, /, attempt 1, on haiku medium\.\n/)
  const supervise = run.calls.find((c) => c.role === 'supervisor' && c.unit === 'task-2')
  assert.equal(supervise.label, 'task-2: supervise attempt 1 on sonnet xhigh')
  assert.match(supervise.prompt, /Attempt 1 ran on haiku medium\./)
})

test('a retry runs at xhigh on the same model, and an escalation runs the next model at xhigh', async (t) => {
  const args = twoTasks(t, { tier: 'haiku medium — renames one field' }, { tier: 'sonnet high — wiring the tests pin down' })
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => {
      if (call.unit === 'task-1' && call.n <= 2) return retry(`gap ${call.n}`)
      if (call.unit === 'task-2' && call.n === 1) return { ...retry('the order of the calls'), verdict: 'escalate' }
      return approve(call)
    },
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(rungs(run, 'task-1'), ['haiku medium', 'haiku xhigh', 'sonnet xhigh'])
  assert.deepEqual(rungs(run, 'task-2'), ['sonnet high', 'opus xhigh'])
  assert.deepEqual(run.result.units.map((u) => u.tiers), [
    ['haiku medium', 'haiku xhigh', 'sonnet xhigh'],
    ['sonnet high', 'opus xhigh'],
  ])
  assert.ok(run.logs.includes('task-1: escalating from haiku xhigh to sonnet xhigh'), run.logs.join('\n'))
  assert.ok(run.logs.includes('task-2: escalating from sonnet high to opus xhigh'), run.logs.join('\n'))
  assert.match(attemptsOf(run, 'task-1')[2].prompt, /- Attempt 2 on haiku xhigh: DONE\./)
})

test('a declared max stays max on its model, and the retry after a merge conflict keeps the model and the effort', async (t) => {
  const args = twoTasks(t, { tier: 'sonnet max — a parser whose cases the tests cannot list' }, { tier: 'haiku high — a constant table' })
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => (call.unit === 'task-1' && call.n === 1 ? retry('edge') : approve(call)),
    ops: (call, wt) =>
      call.kind === 'ops:merge' && call.unit === 'task-2' && call.n === 1
        ? { merged: false, reason: 'conflict', files: ['src/shared.js'], detail: 'CONFLICT' }
        : wt(call),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(rungs(run, 'task-1'), ['sonnet max', 'sonnet max'])
  assert.deepEqual(rungs(run, 'task-2'), ['haiku high', 'haiku high'])
  assert.deepEqual(run.result.units.map((u) => [u.status, u.tiers]), [
    ['merged', ['sonnet max']],
    ['merged', ['haiku high']],
  ])
})

test("the supervisor's Ladder section names the rung a retry and an escalation would run", async (t) => {
  const args = { ...twoTasks(t, { tier: 'haiku medium — renames one field' }), ladder: { haiku: 2, sonnet: 1, opus: 0 } }
  const run = await runWorkflow(args, {
    supervisor: (call, approve) => (call.unit === 'task-1' && call.n <= 2 ? retry(`gap ${call.n}`) : approve(call)),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  const ladders = run.calls.filter((c) => c.role === 'supervisor' && c.unit === 'task-1').map((c) => c.prompt.split('\n## Ladder\n')[1])
  assert.deepEqual(ladders, [
    'Attempts used: haiku 1/2, sonnet 0/1, opus 0/0.\nA retry runs on haiku xhigh. Escalate runs on sonnet xhigh.',
    'Attempts used: haiku 2/2, sonnet 0/1, opus 0/0.\nA retry runs on sonnet xhigh. Escalate runs on sonnet xhigh.',
    'Attempts used: haiku 2/2, sonnet 1/1, opus 0/0.\nA retry blocks the unit: the ladder is spent. Escalate blocks the unit: the ladder is spent.',
  ])
})

test("a task's effort applies only on its own model: with no Haiku attempts, a haiku medium task starts on sonnet xhigh", async (t) => {
  const args = { ...twoTasks(t, { tier: 'haiku medium — renames one field' }), ladder: { haiku: 0, sonnet: 2, opus: 1 } }
  const run = await runWorkflow(args)
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(rungs(run, 'task-1'), ['sonnet xhigh'])
  assert.deepEqual(run.result.units[0].tiers, ['sonnet xhigh'])
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `node --test tests/workflow.test.js`
Expected: FAIL. No call carries an effort, the labels name bare models, and the args checks pass old args.

- [ ] **Step 4: Update the supervisor's rules**

In `plugins/aether/agents/supervisor.md`, make three replacements. The frontmatter, including `effort: high`, does not change.

Replace:

```markdown
- **retry:** the attempt has findings the same model can fix. Put what the next attempt must do in `guidance`.
```

with:

```markdown
- **retry:** the attempt has findings that another attempt on the same model can fix. Put what the next attempt must do in `guidance`.
```

Replace:

```markdown
  - the task is beyond this tier;
```

with:

```markdown
  - the task is beyond this model, even at a higher effort;
```

Replace:

```markdown
The workflow enforces the ladder:
- a retry past the tier's attempts moves up a tier;
- an escalation past the last tier blocks;
- an approval that still lists a critical or important finding counts as a retry.
```

with:

```markdown
The workflow enforces the ladder. The Ladder section of your message names the model and the effort each verdict would run next:
- a retry stays on the same model while the model has attempts left, at `xhigh`, or at `max` when the task asked for it;
- a retry past the model's attempts, and an escalation, move to the next model with attempts, at `xhigh`;
- a retry or an escalation past the last model blocks the unit;
- an approval that still lists a critical or important finding counts as a retry.
```

- [ ] **Step 5: Make the tests pass within the Interfaces**

Change `plugins/aether/workflows/run.workflow.js`. Keep its rules: no imports, no `Date.now()` or `Math.random()`, every call names its `agentType`, and no mention of the Designer.

- [ ] **Step 6: Run the whole suite**

Run: `npm test && npm run validate`
Expected: PASS, including `tests/roles.test.js` and `tests/agents.test.js`.

- [ ] **Step 7: Commit**

```bash
git add plugins/aether/workflows/run.workflow.js plugins/aether/agents/supervisor.md tests/workflow.test.js tests/workflow-harness.js
git commit -m "feat(aether): pass each call's effort, and raise it to xhigh after a failed attempt"
```

**Acceptance:**
- `npm test` and `npm run validate` pass.
- A plan whose Tier lines name no effort runs exactly as before: implementers at `xhigh`, supervisors at `high`, the same models and attempts. Only the labels, the prompts and `tiers` now name rungs.

### Task 6: The Designer's rubric, the documents and version 0.3.0

**Aether:**
- Tier: haiku — the exact text of every change is given, and the task applies it
- Area: docs
- Owns: `plugins/aether/agents/designer.md`, `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `README.md`, `docs/decisions.md`, `plugins/aether/.claude-plugin/plugin.json`
- Depends on: Task 1 — documents the effort on the Tier line, the Review line and their refusals
- Depends on: Task 2 — documents that the usage meter records each request's effort
- Depends on: Task 3 — documents `byEffort`, the agents list and `climbed`
- Depends on: Task 4 — documents `scripts/check-effort.js`
- Depends on: Task 5 — documents the rule, the rungs in results and the supervisor's Ladder section

**Files:**
- Modify: `plugins/aether/agents/designer.md`
- Modify: `plugins/aether/skills/using-aether/SKILL.md`
- Modify: `plugins/aether/skills/swarm/SKILL.md`
- Modify: `README.md`
- Modify: `docs/decisions.md`
- Modify: `plugins/aether/.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: the plan syntax of Task 1, the report fields of Task 3, the result fields of Task 5, and the script of Task 4, as their documents describe them below.
- Produces: no code. Each replacement below is exact, and nothing else in these files changes.

- [ ] **Step 1: The Designer's rubric**

In `plugins/aether/agents/designer.md`, replace:

```markdown
Put this block right after each task heading:

    **Aether:**
    - Tier: haiku — exact tests and interfaces pin the task down
    - Area: backend
    - Owns: `src/api/**`, `tests/api.test.js`
    - Depends on: none

- **Tier** is `haiku`, `sonnet` or `opus`, then " — " and the reason:
  - `haiku` (default): exact tests and interfaces pin the task down, and it touches few files;
  - `sonnet`: frontend and UI work, integration across several files, or behavior the tests cannot pin down exactly;
  - `opus`: security and auth, data migrations or destructive operations, concurrency, or core architecture.
```

with:

```markdown
Put this block right after each task heading:

    **Aether:**
    - Tier: haiku high — a mechanical parser that exact tests pin down
    - Review: xhigh — malformed input that the tests do not list
    - Area: backend
    - Owns: `src/api/**`, `tests/api.test.js`
    - Depends on: none

- **Tier** is `haiku`, `sonnet` or `opus`, optionally followed by the implementer's effort, then " — " and the reason for both:
  - `haiku` (default): exact tests and interfaces pin the task down, and it touches few files;
  - `sonnet`: frontend and UI work, integration across several files, or behavior the tests cannot pin down exactly;
  - `opus`: security and auth, data migrations or destructive operations, concurrency, or core architecture.
- **The effort** is `xhigh` when the Tier line names none. Weigh each task's complexity, and name an effort only when it should differ:
  - lower it where the tests pin the work completely, for speed: `haiku high` or `haiku medium` for mechanical work, `sonnet high` or `opus high` for well-tested wiring. Haiku thinks about 47 s per answer at `xhigh`, and 15 s at `high`;
  - name `max` only with a reason the task needs it: it thinks for 4 to 9 minutes per answer;
  - Sonnet and Opus never run below `high`: Haiku at `xhigh` does that work for far less.

  A failed attempt runs again at `xhigh`, so a lowered effort costs one attempt at most.
- **Review** is optional: `high`, `xhigh` or `max`, then " — " and the reason. It sets the supervisor's effort for every attempt at the task, which is `high` without it. Use `xhigh` where behavior beyond the tests matters: UI states, input parsing, the file system, security, data loss or concurrency.
```

- [ ] **Step 2: The Lead's bootstrap**

In `plugins/aether/skills/using-aether/SKILL.md`, replace:

```markdown
The Designer writes plans with the Aether fields (Tier, Area, Owns, Depends on, and the `## Aether Execution` section), and checks them with `aether-plan check`.
```

with:

```markdown
The Designer writes plans with the Aether fields (Tier with its effort, an optional Review, Area, Owns, Depends on, and the `## Aether Execution` section), and checks them with `aether-plan check`.
```

Replace:

```markdown
- in parallel, on their tiers;
```

with:

```markdown
- in parallel, each on its model and effort;
```

- [ ] **Step 3: The swarm skill**

In `plugins/aether/skills/swarm/SKILL.md`, replace:

```markdown
- gets its own worktree, and works on its tier;
```

with:

```markdown
- gets its own worktree, and works on its model and effort;
```

Replace:

```markdown
  - `tiers`: the tier path, such as `["haiku", "sonnet"]`;
  - `rounds`: each attempt, with the implementer's report, the supervisor's verdict, findings and ruling, and the merge outcome;
```

with:

```markdown
  - `tiers`: the rungs it ran on, each a model and an effort, such as `["haiku medium", "haiku xhigh", "sonnet xhigh"]`. A higher effort on the same model is a climb; another model is an escalation;
  - `rounds`: each attempt, with its rung (`tier`), the implementer's report, the supervisor's verdict, findings, ruling and effort (`reviewEffort`), and the merge outcome;
```

Replace:

```markdown
- **`cost`:** USD at OpenRouter prices, by model and by role, from the usage meter;
- **`quality`:** the units merged, escalated and blocked, every finding by severity, the final review, and the test command's result on the integration branch.

Report to the owner from it:
- the units merged, escalated and blocked;
- the final verdict and the tests;
- the time and the cost by model.
```

with:

```markdown
- **`cost`:** USD at OpenRouter prices, from the usage meter:
  - by model, and by role;
  - `byEffort`: by role, model and effort, with the output tokens and the model time of each;
  - `agents`, in `cost.run`: each agent of the run, with its label, model, effort, cost and time;
- **`quality`:** the units merged, climbed, escalated and blocked, every finding by severity, the final review, and the test command's result on the integration branch.

Report to the owner from it:
- the units merged, climbed, escalated and blocked;
- the final verdict and the tests;
- the time and the cost by model, and the implementers' and supervisors' cost and time by effort.
```

- [ ] **Step 4: The README**

In `README.md`, replace:

```text
  │  writes the plan with Aether fields: tier, area, owned files, dependencies
```

with:

```text
  │  writes the plan with Aether fields: tier and effort, area, owned files, dependencies
```

Replace:

```markdown
      - Tier: haiku — exact tests and interfaces pin the task down
```

with:

```markdown
      - Tier: haiku high — exact tests and interfaces pin the task down
```

Replace:

```markdown
- Each task's tier picks its model.
```

with:

```markdown
- Each task's tier picks its model and its effort.
```

Replace:

```markdown
3. **The task chooses the model.** Tiers in the plan set the start, and failures move a unit up the ladder.
```

with:

```markdown
3. **The task chooses the model and its effort.** Each task's Tier line sets the start. A failed attempt runs again at `xhigh`, and then on a stronger model.
```

Replace:

```markdown
**Effort.**
- Since 2026-10-08, implementers run at `xhigh` on every tier; before, they ran at `medium`.
- Effort per task is the next sub-project. [Trial 3](docs/evaluations/2026-10-08-trial-3.md) left two complete candidate designs for it.
```

with:

```markdown
**Effort.** Since version 0.3.0, each plan task sets its implementer's effort on its Tier line, by the task's complexity ([spec](docs/superpowers/specs/2026-10-08-effort-per-task-design.md)).
- The default is `xhigh` on every model. The Designer lowers it where the tests pin the work, and names `max` only with a reason.
- A failed attempt runs again at `xhigh`, then moves up the ladder.
- The supervisor reviews at `high`, and a task's Review line can raise it.
- `aether-report` shows the cost and the time of each role, model and effort. `scripts/check-effort.js` checks, from a session's transcripts, that each agent ran at the effort its call asked for.
```

- [ ] **Step 5: The decisions**

In `docs/decisions.md`, replace:

```markdown
and added A11–A17. Each decision has a status:
```

with:

```markdown
and added A11–A17. The [effort per task spec](superpowers/specs/2026-10-08-effort-per-task-design.md) of 2026-10-08 updated D5 and added A18. Each decision has a status:
```

Right after the paragraph of D5 that starts with `**Update (2026-10-07, built 2026-10-08).**`, add this paragraph, with a blank line before it:

```markdown
**Update (2026-10-08, effort per task).** The task also chooses its implementer's effort, on its Tier line: `xhigh` by default on every model, lowered where the tests pin the work, and `max` only with a reason. A failed attempt runs again at `xhigh`, and an escalation runs the next model at `xhigh`. A task's Review line can raise its supervisor's effort from `high`. See A18.
```

Add this row at the end of the decisions table, after the A17 row:

```markdown
| A18 | **Effort per task.** Each plan task sets its implementer's effort by its complexity, `xhigh` by default on every model. Sonnet and Opus never run below `high`, and `max` needs a reason. Every later attempt runs at `xhigh`, or stays at a declared `max`. The supervisor reviews at `high`, raised per task by a Review line; ops stays at `low`, and the final reviewer at `high`. The workflow passes the effort on every call, and `aether-report` measures cost and time by effort. | Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-effort-per-task-design.md) |
```

- [ ] **Step 6: The version**

In `plugins/aether/.claude-plugin/plugin.json`, change `"version": "0.2.0"` to `"version": "0.3.0"`.

- [ ] **Step 7: Run the checks**

Run: `npm test && npm run validate`
Expected: PASS, including `tests/session-start.test.js`, `tests/agents.test.js` and `tests/roles.test.js`.

Run: `grep -c '"version": "0.3.0"' plugins/aether/.claude-plugin/plugin.json`
Expected: `1`.

- [ ] **Step 8: Commit**

```bash
git add plugins/aether/agents/designer.md plugins/aether/skills/using-aether/SKILL.md plugins/aether/skills/swarm/SKILL.md README.md docs/decisions.md plugins/aether/.claude-plugin/plugin.json
git commit -m "docs(aether): document effort per task, and bump the plugin to 0.3.0"
```

**Acceptance:**
- `npm test` and `npm run validate` pass.
- Every replacement above is in place, and nothing else in these files changed.

## After the swarm: the end-to-end check

The Lead runs this once:
- every task is merged;
- the final review's critical and important findings are fixed;
- `npm run check` passes on the integration branch.

It is one real swarm run on a throwaway fixture, with the integration worktree's plugin, so `main` changes only after the whole chain has worked (spec §9). It costs about a dollar and a few minutes; the session's cap is $3. Every path is absolute, and the commands that need the fixture as their directory run in a subshell, so the Lead's own working directory never moves into it.

**1. The fixture.** Set `REPO` to the integration worktree's absolute path, then run:

```bash
REPO=/absolute/path/to/the/integration/worktree
F=$(mktemp -d "$HOME/.cache/aether-effort-check-XXXX")
S=$(mktemp -d "$HOME/.cache/aether-effort-out-XXXX")
git -C "$F" init -q -b main
git -C "$F" config user.name "Aether Check"
git -C "$F" config user.email "aether-check@example.invalid"
printf '{\n  "name": "effort-check",\n  "private": true,\n  "scripts": { "test": "node --test" }\n}\n' > "$F/package.json"
printf '.worktrees/\n' > "$F/.gitignore"
git -C "$F" add . && git -C "$F" commit -q -m base
git -C "$F" worktree add -q -b feature/check "$F/.worktrees/check"
mkdir -p "$F/.worktrees/check/docs"
```

Write `$F/.worktrees/check/docs/plan.md` exactly as follows. Then commit it with `git -C "$F/.worktrees/check" add docs/plan.md && git -C "$F/.worktrees/check" commit -q -m plan`.

````markdown
# Effort check Implementation Plan

**Goal:** One tiny module, to check that each agent runs at its effort.

## Global Constraints

- Node 22, CommonJS, `node --test`.

## Aether Execution

- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 20

---

### Task 1: Greeting

**Aether:**
- Tier: haiku medium — one function that its test pins down completely
- Review: xhigh — the check needs a review effort that differs from the supervisor file's
- Area: core
- Owns: `src/greet.js`, `test/greet.test.js`
- Depends on: none

**Interfaces:** `greet(name: string): string` in `src/greet.js`, exported as `module.exports = { greet }`.

**Failing test,** in `test/greet.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const { greet } = require('../src/greet.js')

test('greet names the person', () => {
  assert.equal(greet('Ada'), 'Hello, Ada!')
})
```

**Acceptance:** `npm test` passes.
````

**2. The run.** Run this in the background, or with a 10-minute timeout:

```bash
PROMPT="You are checking a new build of the aether plugin, in Aether mode. Work from this directory, the integration worktree, and change no file except the two below.
1. Run \`aether-plan compile docs/plan.md\` and keep the JSON it prints.
2. Run the \`aether:run\` workflow with that JSON as its args, unchanged, and wait for it to finish.
3. Save the workflow's result, as JSON, to result.json in the run directory, the \`runDir\` of the compiled JSON.
4. Run \`aether-report --run <runId> --no-tests\` with the compiled \`runId\`, and save its output to $S/report.json.
5. Reply with the runId and nothing else."
(
  cd "$F/.worktrees/check" &&
  env -u CLAUDE_CODE_EFFORT_LEVEL AETHER_DATA_DIR="$S/data" ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 \
    claude -p "$PROMPT" --model sonnet --plugin-dir "$REPO/plugins/aether" --settings '{"enableWorkflows": true}' \
      --permission-mode bypassPermissions --strict-mcp-config --max-budget-usd 3 --output-format json > "$S/session.json"
)
```

**3. The check.**

```bash
SID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).session_id)' "$S/session.json")
SESSION_DIR=$(find "$HOME/.claude/projects" -mindepth 2 -maxdepth 2 -type d -name "$SID" | head -n 1)
node "$REPO/scripts/check-effort.js" "$SESSION_DIR" --report "$S/report.json"
node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(Object.keys(r.cost.run.byEffort).filter((k) => k.startsWith("aether:")).sort().join("\n"))' "$S/report.json"
```

**It passes when:**
- `check-effort.js` exits 0, and its agents include:
  - `task-1: implement on haiku medium (attempt 1)` at `medium`;
  - `task-1: supervise attempt 1 on sonnet xhigh` at `xhigh`;
  - `final review` at `high`;
  - the ops agents at `low`.

  If the supervisor sent the unit back, an implementer at `haiku xhigh` also appears. That is expected.
- The `byEffort` keys include `aether:implementer claude-haiku-5-5 medium` and `aether:supervisor claude-sonnet-5-5 xhigh`.

**4. Afterwards.**
- **When it passes:**
  - add this row to the `Effort per task findings` table in `docs/claude-code-research.md`, with the date filled in, and commit it on the integration branch:

    ```markdown
    | The end-to-end check | <date>: `check-effort.js` passed on a one-task swarm run of version 0.3.0. The implementer ran at `medium`, the supervisor at `xhigh`, the final reviewer at `high` and ops at `low`. |
    ```

  - delete the fixture, its outputs and its sessions' folder:

    ```bash
    rm -rf "$F" "$S"
    case "$SESSION_DIR" in *aether-effort-check*) rm -rf "$(dirname "$SESSION_DIR")" ;; esac
    ```

  - ask the Designer to record both checks in this plan's execution record, and to amend the plugin design spec (spec §13).
- **When it fails:** keep the fixture, and bring the output to the owner and the Designer before finishing the branch.

## Done when

- The probe passed, and its finding is recorded.
- All six tasks are merged on the integration branch, and `npm run check` passes there.
- The final review has no open critical or important finding.
- The end-to-end check passed, and its finding is recorded.
- The owner then finishes the branch with superpowers `finishing-a-development-branch`, and decides on the local tag `aether--v0.3.0`.
