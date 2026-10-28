'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, writePlan, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

const ROOT = path.join(__dirname, '..')
const tasksOf = (n) => Array.from({ length: n }, (_, i) => task(i + 1))
const execution = (maxAgents) => ['- Test command: `true`', `- Max agents: ${maxAgents}`]

test('a Max agents budget below two agents per task warns, and a large one does not (issue 80)', (t) => {
  const repo = makeRepo(t)
  const small = runBin(PLAN_BIN, ['check', writePlan(repo.dir, plan(tasksOf(21), { execution: execution(4) }))], repo.dir)
  assert.equal(small.status, 0, small.stdout)
  assert.deepEqual(small.json.warnings, [
    "Max agents: 4 is the run's total budget of model agents, not its parallelism; 21 tasks need at least 42 (an implementer and a supervisor each), so the rest end not-run once it is spent.",
  ])
  const large = runBin(PLAN_BIN, ['check', writePlan(repo.dir, plan(tasksOf(21), { execution: execution(200) }))], repo.dir)
  assert.deepEqual(large.json.warnings, [])
})

test('the three texts that tell the Writer what Max agents is say so (issue 80)', () => {
  const sentence =
    'Max agents is the total of model agents of the whole run, retries and supervisors included; it does not limit how many run at once'
  for (const file of [
    ['plugins', 'aether', 'skills', 'tasks', 'SKILL.md'],
    ['plugins', 'aether', 'speckit', 'commands', 'speckit.tasks.md'],
    ['docs', 'guide', 'troubleshooting.md'],
  ]) {
    assert.ok(fs.readFileSync(path.join(ROOT, ...file), 'utf8').includes(sentence), `${file.join('/')} says what Max agents is`)
  }
})

// The test warnings of a check, from a repository with the given files and a plan of the given tasks.
function testWarningsOf(t, files, tasks) {
  const repo = makeRepo(t)
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo.dir, file)), { recursive: true })
    fs.writeFileSync(path.join(repo.dir, file), text)
  }
  const r = runBin(PLAN_BIN, ['check', writePlan(repo.dir, plan(tasks))], repo.dir)
  assert.equal(r.status, 0, r.stdout)
  return r.json.warnings.filter((w) => w.includes(' but not its test '))
}

const SOURCE = { 'src/foo.js': 'module.exports = 1\n', 'tests/foo.test.js': "require('../src/foo.js')\n" }

test('a task that changes a source warns about its test, which no task owns (issue 92)', (t) => {
  assert.deepEqual(testWarningsOf(t, SOURCE, [task(1, { owns: '`src/foo.js`' })]), [
    'Task 1 changes src/foo.js but not its test tests/foo.test.js, which no task owns',
  ])
})

test('a test in Owns, or owned by a task it depends on, directly or through another, does not warn (issue 92)', (t) => {
  assert.deepEqual(testWarningsOf(t, SOURCE, [task(1, { owns: '`src/foo.js`, `tests/foo.test.js`' })]), [])
  assert.deepEqual(
    testWarningsOf(t, SOURCE, [
      task(1, { owns: '`tests/*.js`' }),
      task(2, { owns: '`src/foo.js`', depends: 'Task 1 — its test' }),
    ]),
    [],
  )
  assert.deepEqual(
    testWarningsOf(t, SOURCE, [
      task(1, { owns: '`tests/foo.test.js`' }),
      task(2, { owns: '`src/other.js`', depends: 'Task 1 — tests first' }),
      task(3, { owns: '`src/foo.js`', depends: 'Task 2 — builds on it' }),
      task(4, { owns: '`src/bar.js`' }),
    ]),
    [],
  )
})

test('a test owned by a task that is not a dependency warns with the dependency wording (issue 92)', (t) => {
  assert.deepEqual(testWarningsOf(t, SOURCE, [task(1, { owns: '`tests/foo.test.js`' }), task(2, { owns: '`src/foo.js`' })]), [
    'Task 2 changes src/foo.js but not its test tests/foo.test.js, which is not owned by it or by a task it depends on (directly or through other dependencies)',
  ])
})

test('a doc or a test in Owns is never a changed source (issue 92)', (t) => {
  const files = { ...SOURCE, 'docs/foo.md': '# Foo\n' }
  assert.deepEqual(testWarningsOf(t, files, [task(1, { owns: '`docs/foo.md`, `tests/foo.test.js`' })]), [])
  assert.deepEqual(testWarningsOf(t, files, [task(1, { owns: '`tests/foo.test.js`' })]), [])
})

test('a test that names the source path in its text warns too (issue 92)', (t) => {
  const named = { 'src/foo.js': '', 'tests/bar.test.js': "const file = 'src/foo.js'\n" }
  assert.deepEqual(testWarningsOf(t, named, [task(1, { owns: '`src/foo.js`' })]), [
    'Task 1 changes src/foo.js but not its test tests/bar.test.js, which no task owns',
  ])
  const other = { 'src/foo.js': '', 'tests/baz.test.js': "const file = 'src/foo.json'\n" }
  assert.deepEqual(testWarningsOf(t, other, [task(1, { owns: '`src/foo.js`' })]), [])
})

test('no test file, a test in node_modules, or a test that names nothing warns about nothing (issue 92)', (t) => {
  assert.deepEqual(testWarningsOf(t, { 'src/foo.js': '', 'node_modules/pkg/tests/foo.test.js': '' }, [task(1, { owns: '`src/foo.js`' })]), [])
  assert.deepEqual(testWarningsOf(t, { 'src/foo.js': '', 'tests/other.test.js': 'x\n' }, [task(1, { owns: '`src/foo.js`' })]), [])
})
