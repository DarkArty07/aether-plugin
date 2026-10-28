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
