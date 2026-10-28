'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { tempDir, makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')
const { loadLadder } = require('../plugins/aether/lib/ladder.js')
const delegates = require('../plugins/aether/lib/delegate-task.js')

const L = loadLadder()
const [HAIKU, SONNET] = L.rungs
// The same ladder with one number changed: the first rung allows one correction.
const TIGHT = { ...L, rungs: L.rungs.map((rung, i) => (i === 0 ? { ...rung, corrections: 1 } : rung)) }

const finding = (n) => ({ severity: 'important', title: `gap ${n}`, file: 'src/t1/a.js:3', evidence: `evidence ${n}` })
const retry = (call) => ({ verdict: 'retry', findings: [finding(call.n)], ruling: `Retry: gap ${call.n}.`, guidance: 'fix it', question: '' })
const swarmModels = async (t, ladder) => {
  const run = await runWorkflow(compile(makeRepo(t), plan([task(1)])), { ladder, supervisor: (call, approve) => (call.n <= 2 ? retry(call) : approve(call)) })
  assert.equal(run.error, null, run.error && run.error.stack)
  return run.calls.filter((c) => c.role === 'implementer' && c.unit === 'task-1').map((c) => c.model)
}

const world = (t, ladder) => {
  const dataDir = tempDir(t, 'aether-data-')
  let n = 0
  return { dataDir, cwd: dataDir, now: () => 1000 + (n += 1), settings: { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }, newId: () => `gen-${n}`, pickPair: async () => ({ pick: null, quota: [] }), ladder }
}
const brief = (id) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt: `AETHER-TASK: ${id}\nDo the work.` } })
const delegateSteps = async (t, ladder) => {
  const deps = world(t, ladder)
  await delegates.begin(brief('t1'), deps)
  const steps = []
  for (const n of [1, 2]) steps.push((await delegates.verdict({ task: 't1', verdict: 'fix', findings: [`src/f${n}.js:${n}: missing case ${n}`] }, deps)).next.step)
  return steps
}

test('one number changed in one ladder changes the swarm and the delegates together', async (t) => {
  assert.deepEqual(await swarmModels(t, undefined), [HAIKU.model, HAIKU.model, HAIKU.model])
  assert.deepEqual(await swarmModels(t, TIGHT), [HAIKU.model, HAIKU.model, SONNET.model])
  assert.deepEqual(await delegateSteps(t, undefined), [HAIKU.step, HAIKU.step])
  assert.deepEqual(await delegateSteps(t, TIGHT), [HAIKU.step, SONNET.step])
})
