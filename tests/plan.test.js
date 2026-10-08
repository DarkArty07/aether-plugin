'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parsePlan, buildGraph, renderBrief } = require('../plugins/aether/lib/plan.js')
const { task, plan } = require('./plan-fixtures.js')

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
  assert.equal(t2.tierReason, 'interactive UI')
  assert.equal(t2.area, 'web')
  assert.deepEqual(t2.owns, ['web/login/**', 'web/tests/login.test.js'])
  assert.deepEqual(t2.dependsOn, [{ number: 1, reason: 'calls the API client' }])
  assert.match(t2.text, /^### Task 2: Task 2 title/)
  assert.equal(parsed.execution.testCommand, 'true')
  assert.deepEqual(parsed.execution.ladder, { haiku: 2, sonnet: 2, opus: 1 })
  assert.equal(parsed.execution.maxAgents, 200)
  assert.equal(parsed.globalConstraints, '- Node 22.')
  assert.equal(parsed.spec, 'docs/spec.md')
})

test('parsePlan ignores headings inside fenced code', () => {
  const parsed = parsePlan(plan([task(1)]))
  assert.equal(parsed.tasks.length, 1)
  assert.match(parsed.tasks[0].text, /### Task 99: not a task either/)
})

test('parsePlan accepts dash and case variants', () => {
  const parsed = parsePlan(plan([
    task(1),
    task(2, { tier: 'Sonnet - UI work', depends: 'task 1 -- needs the client' }),
    task(3, { tier: 'OPUS – migration' }),
  ]))
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.tasks[1].tier, 'sonnet')
  assert.deepEqual(parsed.tasks[1].dependsOn, [{ number: 1, reason: 'needs the client' }])
  assert.equal(parsed.tasks[2].tier, 'opus')
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
  assert.ok(errors.includes('Task 2: Tier must be haiku, sonnet or opus followed by " — reason".'))
  assert.ok(errors.includes('Task 3: Tier must be haiku, sonnet or opus followed by " — reason".'))
  assert.ok(errors.includes('Task 3: Area must be lowercase letters, digits and dashes.'))
  assert.ok(errors.includes('Task 3: "Depends on: Task 1" needs the form "Task N — reason".'))
  assert.ok(errors.includes('Task 4: missing Area.'))
  assert.ok(errors.includes('Task 4: missing Owns.'))
  assert.ok(errors.includes('Task 4: missing "Depends on" (use "Depends on: none" for an independent task).'))
  assert.ok(errors.includes('Aether Execution: the ladder has no "opus" entry.'))
  assert.ok(errors.includes('Aether Execution: "Test command" is missing.'))
})

test('parsePlan requires the Aether Execution section, tasks, and unique task numbers', () => {
  const empty = parsePlan('# Empty plan\n')
  assert.ok(empty.errors.includes('The plan has no "## Aether Execution" section.'))
  assert.ok(empty.errors.includes('The plan has no "### Task N: ..." headings.'))
  assert.ok(parsePlan(plan([task(1), task(1)])).errors.includes('Task 1 appears more than once.'))
})

test('buildGraph layers tasks into waves', () => {
  const graph = buildGraph(parsePlan(plan([task(1), task(2, { depends: 'Task 1 — needs it' }), task(3)])))
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(graph.waves, [['task-1', 'task-3'], ['task-2']])
  assert.deepEqual(graph.tasks['task-2'].dependsOn, ['task-1'])
  assert.equal(graph.tasks['task-2'].tier, 'haiku')
})

test('buildGraph refuses overlapping owners in one wave', () => {
  const parsed = parsePlan(plan([task(1, { owns: '`src/**`' }), task(2, { owns: '`src/api/x.ts`' }), task(3, { owns: '`docs/t3.md`' })]))
  assert.deepEqual(buildGraph(parsed).errors, ['Task 1 and Task 2 run in the same wave but both own "src/**" and "src/api/x.ts".'])
})

test('buildGraph allows the same files in different waves', () => {
  const parsed = parsePlan(plan([
    task(1, { owns: '`src/**`' }),
    task(2, { owns: '`src/api/x.ts`', depends: 'Task 1 — builds on it' }),
    task(3, { owns: '`docs/t3.md`' }),
  ]))
  assert.deepEqual(buildGraph(parsed).errors, [])
})

test('buildGraph refuses a chain', () => {
  const parsed = parsePlan(plan([task(1), task(2, { depends: 'Task 1 — next' }), task(3, { depends: 'Task 2 — next' })]))
  const { errors } = buildGraph(parsed)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^The plan is a chain/)
})

test('buildGraph warns about low parallelism', () => {
  const parsed = parsePlan(plan([task(1), task(2, { depends: 'Task 1 — a' }), task(3, { depends: 'Task 2 — b' }), task(4)]))
  const graph = buildGraph(parsed)
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(graph.warnings, ['Low parallelism: 4 tasks in 3 waves (average 1.33 per wave).'])
})

test('buildGraph reports cycles and unknown dependencies', () => {
  const parsed = parsePlan(plan([task(1, { depends: 'Task 2 — a' }), task(2, { depends: 'Task 1 — b' }), task(3, { depends: 'Task 9 — c' })]))
  const { errors } = buildGraph(parsed)
  assert.ok(errors.includes('Task 3 depends on Task 9, which is not in the plan.'))
  assert.ok(errors.includes('Dependency cycle among: Task 1, Task 2.'))
})

test('buildGraph with only keeps the named tasks and drops dependencies outside them', () => {
  const parsed = parsePlan(plan([task(1), task(2, { depends: 'Task 1 — a' }), task(3, { depends: 'Task 1 — b' })]))
  const graph = buildGraph(parsed, { only: ['task-2', 'task-3'] })
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(graph.waves, [['task-2', 'task-3']])
  assert.deepEqual(buildGraph(parsed, { only: ['task-7'] }).errors, ['--only names task-7, which is not in the plan.'])
})

test('renderBrief carries the task text, its fields and the global constraints', () => {
  const parsed = parsePlan(plan([task(1)]))
  const brief = renderBrief(parsed.tasks[0], { planPath: '/p/plan.md', spec: parsed.spec, globalConstraints: parsed.globalConstraints })
  assert.match(brief, /^# Brief: Task 1: Task 1 title/)
  assert.match(brief, /- Owns: src\/t1\/\*\*/)
  assert.match(brief, /## Global Constraints\n\n- Node 22\./)
  assert.match(brief, /### Task 1: Task 1 title/)
})
