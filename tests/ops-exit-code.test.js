'use strict'

// An ops agent on a model sometimes runs a command successfully and still reports "exitCode": -1 in its
// structured answer (issue 123). No process exits with -1, and the bin's own line has no error, so the command
// succeeded; a real nonzero exit code is still a failure.

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const build = (t) => compile(makeRepo(t), plan([task(1)]))
const unitOf = (run) => run.result.units.find((u) => u.id === 'task-1')

// The first ladder read of the unit comes back with the exit code the test names and the bin's valid line.
const ladderReadReports = (exitCode) => async (call, fallback) => {
  const out = await fallback(call)
  if (call.kind === 'ops:ladder' && call.n === 1 && out && !out.error) return { raw: { exitCode, stdout: `${JSON.stringify(out)}\n` } }
  return out
}

test('an exit code of -1 reported with the bin\'s own valid line does not block the unit (issue 123)', async (t) => {
  const run = await runWorkflow(build(t), { ops: ladderReadReports(-1) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(unitOf(run).status, 'merged', JSON.stringify(unitOf(run)))
})

test('a real nonzero exit code with the same line still blocks the unit (issue 123)', async (t) => {
  const run = await runWorkflow(build(t), { ops: ladderReadReports(1) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(unitOf(run).status, 'blocked')
  assert.match(String(unitOf(run).reason || unitOf(run).detail || JSON.stringify(unitOf(run))), /exited with 1/)
})
