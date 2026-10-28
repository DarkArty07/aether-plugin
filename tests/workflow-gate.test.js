'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')
const { loadLadder } = require('../plugins/aether/lib/ladder.js')

const L = loadLadder()
const [HAIKU, SONNET] = L.rungs
const LONG = "Run this command with the Bash tool, once, exactly as written, with the Bash tool's timeout set to 600000:"

const one = (t) => compile(makeRepo(t), plan([task(1)]))
// What the real gate gives when a subtest `adds` fails in `tests/a.test.js`: the file is the path-like name of the same output (rule 3 of Task 9).
const failing = (file, what, detail = '') => ({ pass: false, checks: 'fail', findings: [{ file, what }], detail, tests: '', knownFailures: [], timedOut: false, files: [] })
const gateOn = (n, answer) => (call, wt) => (call.kind === 'ops:gate' && call.n <= n ? (typeof answer === 'function' ? answer(call) : answer) : wt(call))
const attempts = (run) => run.calls.filter((c) => c.role === 'implementer' && c.unit === 'task-1')
const supervisions = (run) => run.calls.filter((c) => c.role === 'supervisor' && c.unit === 'task-1')
const gates = (run) => run.calls.filter((c) => c.kind === 'ops:gate' && c.unit === 'task-1')
const unitOf = (run) => run.result.units.find((u) => u.id === 'task-1')

test('a gate that fails sends the attempt back with its findings, calls no supervisor and spends a correction', async (t) => {
  const run = await runWorkflow(one(t), { ops: gateOn(1, failing('tests/a.test.js', 'falló: adds', 'AssertionError at line 9')) })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(attempts(run).length, 2)
  assert.equal(supervisions(run).length, 1, 'only the second attempt reaches a supervisor')
  assert.match(attempts(run)[1].prompt, /tests\/a\.test\.js/)
  assert.match(attempts(run)[1].prompt, /falló: adds/)
  assert.match(attempts(run)[1].prompt, /AssertionError at line 9/)
  assert.deepEqual(attempts(run).map((c) => c.effort), [HAIKU.effort.first, HAIKU.effort.retry])
  const u = unitOf(run)
  assert.deepEqual([u.status, u.ladder.gateRejections, u.ladder.corrections], ['merged', 1, 1])
})

test('the gate is sent with the long timeout, after the implementer and before the supervisor', async (t) => {
  const run = await runWorkflow(one(t))
  const gate = gates(run)[0]
  assert.ok(gate.prompt.startsWith(LONG))
  assert.match(gate.prompt, /aether-wt gate \d{8}-\d{6}-[0-9a-f]{4} task-1/)
  const at = (event) => run.events.indexOf(event)
  assert.ok(at('end implementer task-1') < at('start ops:gate task-1'))
  assert.ok(at('end ops:gate task-1') < at('start supervisor task-1'))
})

test('a gate that passes gives the supervisor its evidence', async (t) => {
  const run = await runWorkflow(one(t))
  assert.match(supervisions(run)[0].prompt, /## Gate evidence\nChecks: pass\nTests: # pass 12/)
})

test('known failures are named in the evidence', async (t) => {
  const run = await runWorkflow(one(t), { ops: gateOn(9, { pass: true, checks: 'pass', findings: [], detail: '', tests: 'known failures only: tests/old.test.js', knownFailures: ['tests/old.test.js'], timedOut: false, files: [] }) })
  assert.match(supervisions(run)[0].prompt, /Known failures: tests\/old\.test\.js/)
})

test('a test run cut at the limit is a gate failure with the finding npm test: superó el tiempo límite', async (t) => {
  const cut = { ...failing('npm test', 'superó el tiempo límite'), timedOut: true }
  const run = await runWorkflow(one(t), { ops: gateOn(1, cut) })
  assert.match(attempts(run)[1].prompt, /npm test/)
  assert.match(attempts(run)[1].prompt, /superó el tiempo límite/)
  assert.equal(unitOf(run).ladder.corrections, 1)
})

test('the same gate finding twice raises the model, like any repeated finding', async (t) => {
  const run = await runWorkflow(one(t), { ops: gateOn(L.repeatFindings, failing('tests/a.test.js', 'la prueba falló')) })
  assert.deepEqual(attempts(run).map((c) => c.model), [...Array(L.repeatFindings).fill(HAIKU.model), SONNET.model])
  assert.equal(supervisions(run).length, 1)
  assert.equal(unitOf(run).ladder.rises.repeated, 1)
})

test('a file outside Owns found by the gate goes back with its name', async (t) => {
  const run = await runWorkflow(one(t), { ops: gateOn(1, failing('src/other/x.js', 'fuera de Owns')) })
  assert.match(attempts(run)[1].prompt, /src\/other\/x\.js/)
  assert.match(attempts(run)[1].prompt, /fuera de Owns/)
})

test('the gate also runs on an attempt that was rescued without its report', async (t) => {
  const run = await runWorkflow(one(t), {
    implementer: () => null,
    ops: (call, wt) => (call.kind === 'ops:salvage' ? { salvaged: true, files: ['src/t1/a.js'], committed: ['src/t1/a.js'], left: [], head: 'abc1234', package: '/tmp/p.diff' } : wt(call)),
  })
  assert.equal(gates(run).length, 1)
  const at = (event) => run.events.indexOf(event)
  assert.ok(at('end ops:gate task-1') < at('start supervisor task-1'))
})

test('a gate command that fails does not stop the supervisor: the evidence says the checks did not run', async (t) => {
  const run = await runWorkflow(one(t), { ops: (call, wt) => (call.kind === 'ops:gate' ? { error: 'the bin crashed' } : wt(call)) })
  assert.match(supervisions(run)[0].prompt, /Checks: not run \(.*the bin crashed.*\)/)
  assert.equal(unitOf(run).status, 'merged')
})

test('a retry after a merge conflict runs the gate again', async (t) => {
  const run = await runWorkflow(one(t), {
    ops: (call, wt) => (call.kind === 'ops:merge' && call.n === 1 ? { merged: false, reason: 'conflict', files: ['src/shared.js'], detail: 'CONFLICT' } : wt(call)),
  })
  assert.equal(gates(run).length, 2)
  assert.equal(unitOf(run).ladder.corrections, 0)
})
