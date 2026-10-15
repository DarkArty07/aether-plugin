'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { decide } = require('../plugins/aether/lib/guard.js')

const CARD = '/repo/specs/005-aether-design/intent.md'
const call = (tool, input, who = {}) => ({ hook_event_name: 'PreToolUse', cwd: '/repo', tool_name: tool, tool_input: input, ...who })
const writes = (file) => [
  ['Write', { file_path: file, content: 'x' }],
  ['Edit', { file_path: file, old_string: 'a', new_string: 'b' }],
  ['MultiEdit', { file_path: file, edits: [] }],
]
const refusal = (file) => `In Aether mode only the Lead writes the intent card (intent.md): it holds the owner's own words. Hand a change to the Lead instead of editing ${file} yourself.`
const lead = { agent_type: 'aether:lead' }
const others = [
  { agent_id: 'a2', agent_type: 'aether:writer' },
  { agent_id: 'a3', agent_type: 'aether:implementer' },
  { agent_id: 'a4', agent_type: 'aether:supervisor' },
  { agent_id: 'a5', agent_type: 'aether:reviewer' },
  { agent_id: 'a6', agent_type: 'aether:judge' },
  { agent_id: 'a7', agent_type: 'general-purpose' },
  { agent_id: 'a8', agent_type: 'workflow-subagent' },
  { agent_id: 'a9' },
  { agent_type: 'aether:ops' },
]

test('the Lead, and the main session that names no agent, write the intent card', () => {
  for (const [tool, input] of writes(CARD)) {
    assert.equal(decide(call(tool, input, lead)), null, `${tool} by the Lead`)
    assert.equal(decide(call(tool, input)), null, `${tool} by the main session`)
  }
})

test('the Writer and every other agent are refused the card, with the card message', () => {
  for (const who of others) {
    for (const [tool, input] of writes(CARD)) assert.deepEqual(decide(call(tool, input, who)), { reason: refusal(CARD) }, `${tool} by ${JSON.stringify(who)}`)
  }
  assert.deepEqual(decide(call('Write', { file_path: 'specs/005-aether-design/intent.md', content: 'x' }, others[0])), { reason: refusal('/repo/specs/005-aether-design/intent.md') })
})

test('only specs/NNN-<topic>/intent.md is the card: other files are not covered by this rule', () => {
  for (const file of ['/repo/specs/005-x/notes.md', '/repo/specs/005-x/sub/intent.md', '/repo/specs/intent.md', '/repo/docs/intent.md', '/repo/specs/005-x/intent.md.bak']) {
    assert.equal(decide(call('Write', { file_path: file, content: 'x' }, others[0])), null, file)
  }
})

test('the spec, the plan and the tasks keep their rule, and the Examiner keeps its own message', () => {
  assert.equal(decide(call('Write', { file_path: '/repo/specs/005-x/spec.md', content: 'x' }, others[0])), null)
  assert.match(decide(call('Write', { file_path: '/repo/specs/005-x/plan.md', content: 'x' }, others[1])).reason, /^In Aether mode only the Lead and the Writer write specs, plans and tasks\./)
  const examiner = { agent_id: 'a4', agent_type: 'aether:examiner' }
  assert.match(decide(call('Write', { file_path: CARD, content: 'x' }, examiner)).reason, /^In Aether mode the Examiner writes only its exam/)
})
