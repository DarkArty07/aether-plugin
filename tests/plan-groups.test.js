'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, runBin, writePlan } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { parsePlan, buildGraph, requirementsOf, traceability } = require('../plugins/aether/lib/plan.js')
const { applyGroups } = require('../plugins/aether/lib/plan-groups.js')
const { planWarnings } = require('../plugins/aether/lib/plan-warnings.js')

// Tasks 1 to n of the fixtures; `changes` gives the options of some of them, by number.
function planWith(n, changes = {}) {
  const tasks = []
  for (let i = 1; i <= n; i++) tasks.push(task(i, changes[i] || {}))
  return plan(tasks)
}

// The parse of a plan's markdown, grouped the way load() groups it for every command.
const grouped = (markdown) => applyGroups(parsePlan(markdown))

test('parse reads "Merges with" as the task numbers it names, and none or no line as no group', () => {
  const parsed = parsePlan(plan([task(1, { merges: 'Task 2, Task 3' }), task(2, { merges: 'none' }), task(3)]))
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(parsed.tasks.map((t) => t.mergesWith), [[2, 3], [], []])
})

test('parse refuses a "Merges with" that is not "Task N, Task M" or "none", and a task that names itself', () => {
  const parsed = parsePlan(plan([
    task(1, { merges: '2' }),
    task(2, { merges: 'Task 2' }),
    task(3, { merges: 'Task 4 and Task 5' }),
  ]))
  assert.deepEqual(parsed.errors, [
    'Task 1: "Merges with: 2" needs the form "Task N, Task M" or "none".',
    'Task 2: "Merges with" names Task 2 itself.',
    'Task 3: "Merges with: Task 4 and Task 5" needs the form "Task N, Task M" or "none".',
  ])
})

test('applyGroups refuses a "Merges with" that names a task not in the plan', () => {
  const { errors } = grouped(plan([task(1, { merges: 'Task 9' }), task(2)]))
  assert.deepEqual(errors, ['Task 1 merges with Task 9, which is not in the plan.'])
})

test('a group joins tasks transitively and is one task numbered with its lowest member', () => {
  const parsed = grouped(planWith(19, { 12: { merges: 'Task 13' }, 13: { merges: 'Task 19' } }))
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(parsed.groups, [{ unit: 12, members: [12, 13, 19] }])
  assert.deepEqual(parsed.tasks.map((t) => t.number), [...Array.from({ length: 11 }, (_, i) => i + 1), 12, 14, 15, 16, 17, 18])
  const unit = parsed.tasks.find((t) => t.number === 12)
  assert.equal(unit.title, 'Tasks 12, 13 and 19: Task 12 title')
  assert.deepEqual(unit.members, [12, 13, 19])
  assert.deepEqual(unit.mergesWith, [13, 19])
  assert.match(unit.text, /^This unit builds Tasks 12, 13 and 19 together: each of them changes something that a test of another still holds, so they are green only together\. Build all of them, then run the plan's test command once\.\n\n### Task 12: Task 12 title\n/)
  assert.match(unit.text, /\n\n### Task 13: Task 13 title\n/)
  assert.match(unit.text, /\n\n### Task 19: Task 19 title\n/)
})

test('a group takes the union of owns and serves, and the strongest review with the reason of its first member', () => {
  const parsed = grouped(plan([
    task(1, { area: 'core', owns: '`src/a.js`', review: 'high — first', serves: 'R1', merges: 'Task 2, Task 3' }),
    task(2, { area: 'web', owns: '`src/b.js`, `src/shared.js`', review: 'xhigh — second', serves: 'R2' }),
    task(3, { owns: '`src/shared.js`, `src/c.js`', review: 'xhigh — third', serves: 'R1, R3' }),
  ]))
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.tasks.length, 1)
  const unit = parsed.tasks[0]
  assert.equal(unit.area, 'core')
  assert.deepEqual(unit.owns, ['src/a.js', 'src/b.js', 'src/shared.js', 'src/c.js'])
  assert.deepEqual(unit.serves, ['R1', 'R2', 'R3'])
  assert.equal(unit.review, 'xhigh')
  assert.equal(unit.reviewReason, 'second')
})

test('a group with no review on any member has no review, and the default applies', () => {
  const parsed = grouped(plan([task(1, { merges: 'Task 2' }), task(2)]))
  assert.equal(parsed.tasks[0].review, null)
  assert.equal(parsed.tasks[0].reviewReason, null)
  assert.equal(buildGraph(parsed).tasks['task-1'].review, 'high')
})

test('dependencies are remapped to the units: a dependency on a member moves to its unit, and one inside the group is dropped', () => {
  const parsed = grouped(plan([
    task(1, { merges: 'Task 2' }),
    task(2, { depends: ['Task 4 — needs it', 'Task 1 — same unit'] }),
    task(3, { depends: 'Task 2 — uses it' }),
    task(4),
    task(5),
  ]))
  assert.deepEqual(parsed.errors, [])
  const byNumber = Object.fromEntries(parsed.tasks.map((t) => [t.number, t]))
  assert.deepEqual(byNumber[1].dependsOn, [{ number: 4, reason: 'needs it' }])
  assert.deepEqual(byNumber[3].dependsOn, [{ number: 1, reason: 'uses it' }])
  assert.deepEqual(byNumber[4].dependsOn, [])
  const graph = buildGraph(parsed)
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(graph.waves, [['task-4', 'task-5'], ['task-1'], ['task-3']])
})

test('a plan without any "Merges with" comes out as it went in', () => {
  const parsed = parsePlan(planWith(3, { 2: { depends: 'Task 1 — a' } }))
  const out = applyGroups(parsed)
  assert.deepEqual(out.tasks, parsed.tasks)
  assert.deepEqual(out.groups, [])
  assert.deepEqual(out.errors, parsed.errors)
  assert.deepEqual(out.warnings, parsed.warnings)
  assert.deepEqual(buildGraph(out), buildGraph(parsed))
})

test('applyGroups does not change the parsed plan it is given', () => {
  const parsed = parsePlan(planWith(3, { 1: { merges: 'Task 2' }, 3: { depends: 'Task 2 — a' } }))
  const before = JSON.stringify(parsed)
  applyGroups(parsed)
  assert.equal(JSON.stringify(parsed), before)
})

test('check gives the groups of a plan, and no groups key for a plan without any', (t) => {
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1, { merges: 'Task 2' }), task(2), task(3)]))
  let r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json.groups, [{ unit: 'task-1', tasks: [1, 2] }])
  assert.deepEqual(r.json.waves, [['task-1', 'task-3']])
  assert.equal(r.json.tasks, 2)
  const flat = path.join(repo.dir, 'flat.md')
  fs.writeFileSync(flat, plan([task(1), task(2), task(3)]))
  r = runBin(PLAN_BIN, ['check', flat], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.equal('groups' in r.json, false)
})

test('two units in one wave whose owns overlap only through a group are one node, with no overlap error', () => {
  const flat = plan([
    task(1, { owns: '`src/one/**`' }),
    task(2, { owns: '`src/shared.js`' }),
    task(3, { owns: '`src/shared.js`' }),
  ])
  assert.equal(buildGraph(parsePlan(flat)).errors.length, 1)
  const merged = plan([
    task(1, { owns: '`src/one/**`' }),
    task(2, { owns: '`src/shared.js`', merges: 'Task 3' }),
    task(3, { owns: '`src/shared.js`' }),
  ])
  assert.deepEqual(buildGraph(grouped(merged)).errors, [])
})

test('a dependency cycle that grouping creates names the group', () => {
  const parsed = grouped(planWith(14, {
    12: { merges: 'Task 13' },
    13: { depends: 'Task 14 — needs it' },
    14: { depends: 'Task 12 — needs the unit' },
  }))
  assert.deepEqual(buildGraph(parsed).errors, ['Dependency cycle among: Task 12 (with Task 13), Task 14.'])
})

test('--only names a member of a group by its unit', () => {
  const parsed = grouped(planWith(19, { 12: { merges: 'Task 13, Task 19' } }))
  const graph = buildGraph(parsed, { only: ['task-13'] })
  assert.deepEqual(graph.errors, [])
  assert.deepEqual(Object.keys(graph.tasks), ['task-12'])
  assert.deepEqual(graph.waves, [['task-12']])
  assert.deepEqual(buildGraph(parsed, { only: ['19', 'task-12'] }).waves, [['task-12']])
  assert.deepEqual(buildGraph(parsed, { only: ['task-30'] }).errors, ['--only names task-30, which is not in the plan.'])
})

test('traceability sees a requirement served only by a member of a group as served', () => {
  const spec = '## Requirements\n\n- R1. First.\n- R2. Second.\n'
  const requirements = requirementsOf(spec)
  const parsed = grouped(plan([task(1, { serves: 'R1', merges: 'Task 2' }), task(2, { serves: 'R2' })]))
  assert.deepEqual(traceability(parsed, requirements), { errors: [], warnings: [] })
  const lost = grouped(plan([task(1, { serves: 'R1', merges: 'Task 2' }), task(2, { serves: 'R1' })]))
  assert.deepEqual(traceability(lost, requirements).warnings, ['R2 has no task that serves it.'])
})

test('the budget of model agents counts a group as one task', (t) => {
  const repo = makeRepo(t)
  const budget = (parsed) => planWarnings(parsed, repo.dir).filter((w) => w.startsWith('Max agents'))
  const markdown = (merges) => plan([task(1, { merges }), task(2), task(3)], { execution: ['- Test command: `true`', '- Max agents: 4'] })
  // Three tasks need six agents; grouped, two units need four.
  assert.equal(budget(parsePlan(markdown(null))).length, 1)
  assert.equal(budget(grouped(markdown('Task 2'))).length, 0)
})

test('the size warnings and the overlap error name a group by all the tasks it holds', () => {
  const big = plan([
    task(1, { owns: '`src/a/**`, `src/b/**`, `src/c/**`, `src/d.js`', merges: 'Task 2' }),
    task(2, { owns: '`src/e/**`, `src/f/**`, `src/g.js`' }),
    task(3, { owns: '`src/d.js`' }),
  ])
  const { warnings, errors } = buildGraph(grouped(big))
  assert.deepEqual(warnings, ['Tasks 1 and 2 (one unit) owns 7 paths; a task that large often ends without its report and the ladder repeats the failure (issue 003). Consider splitting it.'])
  assert.deepEqual(errors, ['Tasks 1 and 2 (one unit) and Task 3 run in the same wave but both own "src/d.js" and "src/d.js".'])
})
