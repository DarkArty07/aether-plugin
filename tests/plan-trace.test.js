'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, runBin } = require('./helpers.js')
const { task, specKitTasks } = require('./plan-fixtures.js')
const { parsePlan, requirementsOf, traceability } = require('../plugins/aether/lib/plan.js')

const SPEC = [
  '# Demo', '', '## Criteria', '', '- C1: it works.', '', '## Requirements', '',
  '- R1. First thing. Sirve a: C1.',
  '- **R2. Second thing.** More text. Sirve a: C1.',
  '  - R9. a sub-item, not a requirement',
  '- R3) Third thing.',
  '', '## Proposals', '', '- R7. wrong section, not a requirement', '',
].join('\n')

// A task of the fixtures with a Serves line in its Aether block (none when `serves` is null).
const serving = (n, serves, options) => {
  const text = task(n, options)
  return serves === null ? text : text.replace(/^(- Depends on: .*)$/m, `$1\n- Serves: ${serves}`)
}

// A repository with specs/001-demo/spec.md and the tasks.md of these tasks.
function feature(t, tasks, spec = SPEC) {
  const repo = makeRepo(t)
  const dir = path.join(repo.dir, 'specs', '001-demo')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'spec.md'), spec)
  const file = path.join(dir, 'tasks.md')
  fs.writeFileSync(file, specKitTasks(tasks))
  return { repo, file }
}

const NONE = 'Task 2 serves no requirement: add a "- Serves: R1" line to its Aether block.'

test('requirementsOf reads the top-level items of the Requirements section, in order', () => {
  assert.deepEqual(requirementsOf(SPEC), ['R1', 'R2', 'R3'])
  assert.deepEqual(requirementsOf('# No section\n\n- R1. text\n'), [])
  assert.deepEqual(requirementsOf('## Requirements\n\n- R1. a\n- R1. again\n'), ['R1'])
})

test('the parser keeps the tokens of a Serves line, uppercased, and never adds an error for them', () => {
  const parsed = parsePlan(specKitTasks([serving(1, 'R1, r2'), serving(2, null), serving(3, 'foo')]))
  assert.deepEqual(parsed.tasks.map((t) => t.serves), [['R1', 'R2'], [], ['FOO']])
  assert.deepEqual(parsed.errors, [])
})

test('traceability names the task that serves nothing, an id the spec lacks, and a requirement nobody serves', () => {
  const parsed = parsePlan(specKitTasks([serving(1, 'R1'), serving(2, null), serving(3, 'R9, foo')]))
  assert.deepEqual(traceability(parsed, ['R1', 'R2']), {
    errors: [NONE, 'Task 3 serves R9, which the spec does not have.', 'Task 3: "FOO" in Serves is not a requirement id such as R1.'],
    warnings: ['R2 has no task that serves it.'],
  })
  assert.deepEqual(traceability(parsed, []), { errors: [], warnings: [] })
})

test('check fails on a task that serves no requirement and names it (E5), and compile of the same plan works', (t) => {
  const { repo, file } = feature(t, [serving(1, 'R1'), serving(2, null), serving(3, 'R2, R3')])
  const checked = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(checked.status, 1, checked.stdout)
  assert.deepEqual(checked.json, { ok: false, errors: [NONE], warnings: [] })
  const compiled = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr)
  assert.equal(Object.keys(compiled.json.tasks).length, 3)
})

test('check fails on a requirement id the spec does not have', (t) => {
  const { repo, file } = feature(t, [serving(1, 'R1, R2'), serving(2, 'R3, R9')])
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 1)
  assert.deepEqual(r.json.errors, ['Task 2 serves R9, which the spec does not have.'])
})

test('check warns, and passes, when a requirement has no task', (t) => {
  const { repo, file } = feature(t, [serving(1, 'R1, R2'), serving(2, 'R2')])
  const r = runBin(PLAN_BIN, ['check', file], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual(r.json, { ok: true, tasks: 2, waves: [['task-1', 'task-2']], warnings: ['R3 has no task that serves it.'] })
})

test('check traces nothing when the spec has no requirements or cannot be read', (t) => {
  const bare = feature(t, [task(1), task(2)], '# Demo\n')
  assert.deepEqual(runBin(PLAN_BIN, ['check', bare.file], bare.repo.dir).json, { ok: true, tasks: 2, waves: [['task-1', 'task-2']], warnings: [] })
  fs.rmSync(path.join(path.dirname(bare.file), 'spec.md'))
  assert.equal(runBin(PLAN_BIN, ['check', bare.file], bare.repo.dir).status, 0)
})
