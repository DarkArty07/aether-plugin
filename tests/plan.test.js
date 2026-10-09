'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EFFORTS, DEFAULT_EFFORT, DEFAULT_REVIEW, parsePlan, buildGraph, renderBrief } = require('../plugins/aether/lib/plan.js')
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

test('parsePlan ignores Aether blocks inside fenced code', () => {
  const md = plan([
    ['### Task 1: Example only', '', '```markdown', '**Aether:**', '- Tier: haiku — x', '- Area: core', '- Owns: `a/**`', '- Depends on: none', '```'].join('\n'),
  ])
  assert.ok(parsePlan(md).errors.includes('Task 1: missing the **Aether:** block.'))
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
  assert.ok(errors.includes('Task 2: Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".'))
  assert.ok(errors.includes('Task 3: Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".'))
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

test('parsePlan refuses headings that look like tasks but do not match the format', () => {
  const md = plan([task(1), '### Task 2 — Second title\n', '### **Task 3:** Third title\n'])
  const { errors } = parsePlan(md)
  assert.ok(errors.includes('Unrecognized task heading: "### Task 2 — Second title". Use "### Task N: Title".'))
  assert.ok(errors.includes('Unrecognized task heading: "### **Task 3:** Third title". Use "### Task N: Title".'))
})

test('parsePlan requires task numbers 1..N without gaps', () => {
  const { errors } = parsePlan(plan([task(1), task(3)]))
  assert.ok(errors.includes('Task numbers must run from 1 without gaps; missing: Task 2.'))
})

test('parsePlan reports a code fence that is never closed', () => {
  const md = plan([task(1), ['### Task 2: Open fence', '', '```js', 'const x = 1'].join('\n')])
  const line = md.split('\n').indexOf('```js') + 1
  assert.ok(parsePlan(md).errors.includes(`A code fence opened at line ${line} is never closed.`))
})

test('parsePlan refuses several dependencies on one line', () => {
  const { errors } = parsePlan(plan([task(1), task(2), task(3, { depends: 'Task 1 — a; Task 2 — b' })]))
  assert.ok(errors.includes('Task 3: write one "Depends on:" line per dependency.'))
})

test('parsePlan refuses Owns entries that are not relative paths or globs', () => {
  const { errors } = parsePlan(plan([task(1, { owns: '`src/a/**`, `/abs/x.js`, `../up/y.js`, src/b/x.js (new file)' })]))
  assert.ok(errors.includes('Task 1: Owns entry "/abs/x.js" is not a relative path or glob.'))
  assert.ok(errors.includes('Task 1: Owns entry "../up/y.js" is not a relative path or glob.'))
  assert.ok(errors.includes('Task 1: Owns entry "src/b/x.js (new file)" is not a relative path or glob.'))
  assert.ok(!errors.some((e) => e.includes('"src/a/**"')))
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

test('buildGraph with only skips the chain rule and warns about dependencies outside the selection', () => {
  const parsed = parsePlan(plan([
    task(1),
    task(2),
    task(3, { depends: 'Task 1 — a' }),
    task(4, { depends: 'Task 3 — b' }),
    task(5, { depends: 'Task 4 — c' }),
  ]))
  const graph = buildGraph(parsed, { only: ['3', 'task-4', 'task-5'] })
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(graph.waves, [['task-3'], ['task-4'], ['task-5']])
  assert.deepEqual(graph.warnings, ['Task 3 depends on Task 1, which is outside the selection; it is assumed to be merged already.'])
})

test('buildGraph refuses an empty selection', () => {
  assert.deepEqual(buildGraph(parsePlan(plan([task(1), task(2)])), { only: [] }).errors, ['The selection names no tasks.'])
})

test('renderBrief carries the task text, its fields and the global constraints', () => {
  const parsed = parsePlan(plan([task(1)]))
  const brief = renderBrief(parsed.tasks[0], { planPath: '/p/plan.md', spec: parsed.spec, globalConstraints: parsed.globalConstraints })
  assert.match(brief, /^# Brief: Task 1: Task 1 title/)
  assert.match(brief, /- Owns: src\/t1\/\*\*/)
  assert.match(brief, /## Global Constraints\n\n- Node 22\./)
  assert.match(brief, /### Task 1: Task 1 title/)
})

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
