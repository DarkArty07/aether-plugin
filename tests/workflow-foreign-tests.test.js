'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')
const { loadLadder } = require('../plugins/aether/lib/ladder.js')

const ROOT = path.join(__dirname, '..')
const L = loadLadder()
const [RUNG1, RUNG2, RUNG3, RUNG4] = L.rungs

const one = (t) => compile(makeRepo(t), plan([task(1)]))
const gateFail = (findings) => ({ pass: false, checks: 'fail', findings, detail: '', tests: '', knownFailures: [], timedOut: false, files: [] })
const attempts = (run) => run.calls.filter((c) => c.role === 'implementer' && c.unit === 'task-1')
const supervisions = (run) => run.calls.filter((c) => c.role === 'supervisor' && c.unit === 'task-1')
const unitOf = (run) => run.result.units.find((u) => u.id === 'task-1')

test('P3: the same foreign tests red twice stop the unit at rung 2 and open a stuck wait', async (t) => {
  const foreign = [{ file: 'tests/other.test.js', what: 'falló: foreign test', own: false }]
  const run = await runWorkflow(one(t), {
    stuckWait: 60,
    ops: (call, wt) => (call.kind === 'ops:gate' ? gateFail(foreign) : wt(call)),
    deadline: async ({ seconds }) => ({ exitCode: 0, stdout: `${JSON.stringify({ paused: seconds, state: 'waiting', stop: false })}\n` }),
  })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.deepEqual(attempts(run).map((c) => c.model), [RUNG1.model, RUNG2.model])
  assert.equal(supervisions(run).length, 0)
  const u = unitOf(run)
  assert.equal(u.status, 'blocked')
  assert.match(u.reason, /^blocked-foreign-tests: foreign test/)
  assert.match(u.reason, /regression/i)
  const stuckCalls = run.calls.filter((c) => c.kind === 'ops:stuck' && c.unit === 'task-1')
  assert.equal(stuckCalls.length, 1)
})

test('P3: an own test red twice, or a changing foreign set, climbs as today', async (t) => {
  const ownFail = [{ file: 'src/t1/a.test.js', what: 'falló: own test', own: true }]
  const runOwn = await runWorkflow(one(t), {
    ops: (call, wt) => (call.kind === 'ops:gate' && call.n <= 2 ? gateFail(ownFail) : wt(call)),
  })
  assert.equal(runOwn.error, null, runOwn.error && runOwn.error.stack)
  assert.deepEqual(attempts(runOwn).map((c) => c.model), [RUNG1.model, RUNG2.model, RUNG3.model])
  assert.equal(supervisions(runOwn).length, 1)
  assert.equal(unitOf(runOwn).status, 'merged')

  const foreign1 = [{ file: 'tests/other.test.js', what: 'falló: foreign A', own: false }]
  const foreign2 = [{ file: 'tests/other.test.js', what: 'falló: foreign B', own: false }]
  const runChanged = await runWorkflow(one(t), {
    ops: (call, wt) => {
      if (call.kind === 'ops:gate' && call.n === 1) return gateFail(foreign1)
      if (call.kind === 'ops:gate' && call.n === 2) return gateFail(foreign2)
      return wt(call)
    },
  })
  assert.equal(runChanged.error, null, runChanged.error && runChanged.error.stack)
  assert.deepEqual(attempts(runChanged).map((c) => c.model), [RUNG1.model, RUNG2.model, RUNG3.model])
  assert.equal(supervisions(runChanged).length, 1)
  assert.equal(unitOf(runChanged).status, 'merged')

  const runCleared = await runWorkflow(one(t), {
    ops: (call, wt) => {
      if (call.kind === 'ops:gate' && call.n === 1) return gateFail(foreign1)
      if (call.kind === 'ops:gate' && call.n === 2) return gateFail(ownFail)
      if (call.kind === 'ops:gate' && call.n === 3) return gateFail(foreign1)
      return wt(call)
    },
  })
  assert.equal(runCleared.error, null, runCleared.error && runCleared.error.stack)
  assert.deepEqual(attempts(runCleared).map((c) => c.model), [RUNG1.model, RUNG2.model, RUNG3.model, RUNG4.model])
  assert.equal(supervisions(runCleared).length, 1)
  assert.equal(unitOf(runCleared).status, 'merged')
})

test('P5: blocked-foreign-tests and blocked-outside-owns name the worktree during the wait and patches/<task>.patch after it', async (t) => {
  const foreign = [{ file: 'tests/other.test.js', what: 'falló: foreign test', own: false }]
  const runForeign = await runWorkflow(one(t), {
    ops: (call, wt) => (call.kind === 'ops:gate' ? gateFail(foreign) : wt(call)),
  })
  const u1 = unitOf(runForeign)
  assert.match(u1.reason, /^blocked-foreign-tests:/)
  assert.match(u1.reason, /worktree.*patches\/task-1\.patch/)

  const outside = [{ file: 'src/other/x.js', what: 'fuera de Owns' }]
  const runOutside = await runWorkflow(one(t), {
    ops: (call, wt) => (call.kind === 'ops:gate' ? gateFail(outside) : wt(call)),
  })
  const u2 = unitOf(runOutside)
  assert.match(u2.reason, /^blocked-outside-owns:/)
  assert.match(u2.reason, /worktree.*patches\/task-1\.patch/)
})

test('P5: the swarm skill explains deliver --widen for blocked-foreign-tests and git apply after the wait', () => {
  const text = fs.readFileSync(path.join(ROOT, 'plugins/aether/skills/swarm/SKILL.md'), 'utf8')
  assert.match(text, /blocked-foreign-tests:/)
  assert.match(text, /deliver.*--widen/)
  assert.match(text, /git apply/)
  assert.match(text, /aether-wt adopt/)
})
