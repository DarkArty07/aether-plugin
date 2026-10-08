'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN } = require('./helpers.js')
const { decide } = require('../plugins/aether/lib/guard.js')

const GUARD_BIN = path.join(PLUGIN, 'bin', 'aether-guard')
const SPEC = '/repo/docs/superpowers/specs/2026-10-08-x-design.md'
const PLAN = '/repo/docs/superpowers/plans/2026-10-08-x.md'

const call = (tool, input, who = {}) => ({ hook_event_name: 'PreToolUse', cwd: '/repo', tool_name: tool, tool_input: input, ...who })
const designer = { agent_id: 'a1', agent_type: 'aether:designer' }

test('the main session may not write or edit a spec or a plan', () => {
  const cases = [
    ['Write', { file_path: SPEC, content: 'x' }],
    ['Edit', { file_path: PLAN, old_string: 'a', new_string: 'b' }],
    ['MultiEdit', { file_path: PLAN, edits: [] }],
  ]
  for (const [tool, input] of cases) {
    const d = decide(call(tool, input))
    assert.ok(d, `${tool} should be refused`)
    assert.match(d.reason, /only the Designer writes specs and plans/i)
    assert.match(d.reason, /aether:designer/)
    assert.ok(d.reason.includes(input.file_path), 'the reason names the file')
  }
})

test('the Designer may write specs and plans', () => {
  assert.equal(decide(call('Write', { file_path: SPEC, content: 'x' }, designer)), null)
  assert.equal(decide(call('Edit', { file_path: PLAN, old_string: 'a', new_string: 'b' }, designer)), null)
})

test('other agents may not write specs or plans either', () => {
  assert.ok(decide(call('Write', { file_path: SPEC, content: 'x' }, { agent_id: 'a2', agent_type: 'aether:implementer' })))
})

test('relative paths are resolved against the hook cwd', () => {
  assert.ok(decide(call('Write', { file_path: 'docs/superpowers/specs/new.md', content: 'x' })))
  assert.ok(decide({ ...call('Write', { file_path: 'superpowers/plans/new.md', content: 'x' }), cwd: '/repo/docs' }))
  assert.equal(decide({ ...call('Write', { file_path: 'specs/new.md', content: 'x' }), cwd: '/repo' }), null)
})

test('only the specs and plans directories are protected', () => {
  for (const file of [
    '/repo/README.md',
    '/repo/docs/superpowers/specs-old/x.md',
    '/repo/docs/superpowers/plansx/y.md',
    '/repo/mydocs/superpowers/specs/x.md',
    '/repo/docs/superpowers/x.md',
  ]) {
    assert.equal(decide(call('Write', { file_path: file, content: 'x' })), null, file)
  }
  assert.ok(decide(call('Write', { file_path: '/repo/packages/app/docs/superpowers/specs/x.md', content: 'x' })))
})

test('NotebookEdit is checked by its notebook_path', () => {
  assert.ok(decide(call('NotebookEdit', { notebook_path: '/repo/docs/superpowers/plans/n.ipynb', new_source: 'x' })))
})

test('other tools and malformed input get no decision', () => {
  assert.equal(decide(call('Bash', { command: 'echo x > docs/superpowers/specs/a.md' })), null)
  assert.equal(decide(call('Write', {})), null)
  assert.equal(decide(call('Write', { file_path: 42 })), null)
  assert.equal(decide(null), null)
  assert.equal(decide({}), null)
})

function guard(stdin) {
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8' })
}

test('aether-guard prints a deny decision for the main session', () => {
  const r = guard(JSON.stringify(call('Write', { file_path: SPEC, content: 'x' })))
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /aether:designer/)
})

test('aether-guard stays silent when it allows, and on input it cannot read', () => {
  for (const stdin of [JSON.stringify(call('Write', { file_path: SPEC, content: 'x' }, designer)), '', 'not json', '[]']) {
    const r = guard(stdin)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('hooks.json runs aether-guard before Write, Edit, MultiEdit and NotebookEdit', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
  const entries = hooks.hooks.PreToolUse
  assert.equal(entries.length, 1)
  assert.equal(entries[0].matcher, 'Write|Edit|MultiEdit|NotebookEdit')
  assert.deepEqual(entries[0].hooks, [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/aether-guard"' }])
  // The SessionStart hook and the usage meter stay as they were.
  assert.equal(hooks.hooks.SessionStart[0].matcher, 'startup|clear|compact')
  assert.deepEqual(hooks.modules, ['./register.js'])
})
