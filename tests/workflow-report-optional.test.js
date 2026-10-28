'use strict'

// Issue #110: concerns and question are optional in the implementer's report. A Haiku implementer often leaves
// them out when it has nothing to say; that report is still a report, so the attempt is not retried or salvaged.

const test = require('node:test')
const assert = require('node:assert/strict')
const { makeRepo, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { runWorkflow } = require('./workflow-harness.js')

const one = (t) => compile(makeRepo(t), plan([task(1)]))
const implementerCalls = (run) => run.calls.filter((c) => c.role === 'implementer')
// The four fields a report must have, and no concerns or question.
const bare = { status: 'DONE', summary: 'Implemented the brief.', head: 'abc1234', tests: '3/3 pass' }

test('an implementer report without concerns and question is accepted: no retry and no salvage', async (t) => {
  const run = await runWorkflow(one(t), { implementer: () => bare })
  assert.equal(run.error, null, run.error && run.error.stack)
  assert.equal(implementerCalls(run).length, 1)
  assert.equal(run.calls.filter((c) => c.kind === 'ops:salvage').length, 0)
  const unit = run.result.units[0]
  assert.equal(unit.status, 'merged')
  assert.deepEqual(unit.failures, [])
  assert.deepEqual([unit.rounds[0].salvaged, unit.rounds[0].noReport], [false, false])
  assert.deepEqual([unit.rounds[0].concerns, unit.rounds[0].question], ['', ''])
})

test('the implementer schema asks for the four fields a report must have, not for concerns or question', async (t) => {
  const run = await runWorkflow(one(t))
  assert.deepEqual(implementerCalls(run)[0].schema.required, ['status', 'summary', 'head', 'tests'])
})

test('the supervisor is shown the concerns and question only when the report has them', async (t) => {
  const bareRun = await runWorkflow(one(t), { implementer: () => bare })
  const barePrompt = bareRun.calls.find((c) => c.role === 'supervisor').prompt
  assert.doesNotMatch(barePrompt, /^- concerns:/m)
  assert.doesNotMatch(barePrompt, /^- question:/m)
  assert.match(barePrompt, /^- tests: 3\/3 pass$/m)

  const full = { ...bare, concerns: 'The retry path is untested.', question: '' }
  const fullRun = await runWorkflow(one(t), { implementer: () => full })
  const fullPrompt = fullRun.calls.find((c) => c.role === 'supervisor').prompt
  assert.match(fullPrompt, /^- concerns: The retry path is untested\.$/m)
  assert.doesNotMatch(fullPrompt, /^- question:/m)
})
