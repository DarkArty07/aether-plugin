'use strict'

// Issue 187, part 2: the mod notices a Lead session whose first main request has no Workflow tool. The decision and the
// texts are in hooks/workflow-check.mjs, loaded here; the handler that asks the engine and sends them is in register.js,
// and its behaviour is held by hooks/workflow.test.ts (npm run test:mod).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { PLUGIN } = require('./helpers.js')

const NOTICE = 'Aether: this session has no Workflow tool, so /aether:design and /aether:run cannot start. Turn on Dynamic workflows in /config (or set enableWorkflows: true in settings.json) and start a new session; an open run resumes from its diary. Run aether-doctor for the cause.'

test('the tool list decides: Workflow among the names is present, its absence missing, and anything else is unknown', async () => {
  const { workflowToolState } = await import(pathToFileURL(path.join(PLUGIN, 'hooks', 'workflow-check.mjs')).href)
  assert.equal(workflowToolState(['Bash', 'Workflow', 'Read']), 'present')
  assert.equal(workflowToolState(['Bash', 'Read']), 'missing')
  assert.equal(workflowToolState(['Bash', 'workflow']), 'missing', 'the name is exact')
  for (const names of [undefined, null, 'Workflow', [], ['Bash', 3], [null]]) {
    assert.equal(workflowToolState(names), null, JSON.stringify(names))
  }
})

test('the notice text is the one the owner and the Lead are given, in English', async () => {
  const { NO_WORKFLOW_TEXT, NO_WORKFLOW_TITLE } = await import(pathToFileURL(path.join(PLUGIN, 'hooks', 'workflow-check.mjs')).href)
  assert.equal(NO_WORKFLOW_TEXT, NOTICE)
  assert.ok(NO_WORKFLOW_TITLE.length > 0 && NO_WORKFLOW_TITLE.length <= 60)
})

test('register.js asks the engine for the tool list, sends the notice only through the check, and skips subagent requests', () => {
  const text = fs.readFileSync(path.join(PLUGIN, 'hooks', 'register.js'), 'utf8')
  assert.ok(text.includes("from './workflow-check.mjs'"), 'the check is the module above')
  assert.ok(text.includes('await $.tool.list()'), 'the tool list comes from the engine')
  assert.ok(text.includes('if (!e.agentId) await workflowStep($, state)'), 'only the main agent is checked')
  assert.ok(text.includes("'register.workflow-check'"), 'a failure leaves its record')
})
