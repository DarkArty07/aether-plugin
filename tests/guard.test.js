'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir } = require('./helpers.js')
const { decide } = require('../plugins/aether/lib/guard.js')
const { markSession } = require('../plugins/aether/lib/session.js')

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

// Runs the bin in a data directory where session s1 is an Aether session, unless marked is false.
function guard(t, stdin, { marked = true } = {}) {
  const data = tempDir(t, 'aether-data-')
  if (marked) markSession(data, 's1')
  const env = { ...process.env, AETHER_DATA_DIR: data }
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8', env })
}
const inSession = (input) => ({ session_id: 's1', ...input })

test('aether-guard prints a deny decision for the main session', (t) => {
  const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }))))
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /aether:designer/)
})

test('aether-guard stays silent when it allows, and on input it cannot read', (t) => {
  for (const stdin of [JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, designer))), '', 'not json', '[]']) {
    const r = guard(t, stdin)
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
  assert.equal(hooks.hooks.SessionStart[0].matcher, 'startup|resume|clear|compact')
  assert.deepEqual(hooks.modules, ['./register.js'])
})

// From the final review of run 20261008-134400-d48f: pin Review Focus 4.
test('a missing cwd falls back to the process cwd, and ".." is resolved before the check', () => {
  assert.ok(decide({ tool_name: 'Write', tool_input: { file_path: 'docs/superpowers/specs/x.md', content: 'x' } }))
  assert.ok(decide(call('Write', { file_path: '/repo/x/../docs/superpowers/specs/a.md', content: 'x' })))
  assert.equal(decide(call('Write', { file_path: '/repo/docs/superpowers/specs/../notes.md', content: 'x' })), null)
})

const GRANTS = '/repo/.aether/autonomy/grants.json'
const RUN_STATE = '/repo/.aether/autonomy/auto-20261009-200000-ab12/run.json'

test('no agent may write the autonomy registry or a run state, the Designer included', () => {
  const agents = [{}, designer, { agent_id: 'a3', agent_type: 'aether:implementer' }]
  for (const file of [GRANTS, RUN_STATE]) {
    for (const agent of agents) {
      for (const [tool, input] of [
        ['Write', { file_path: file, content: '{}' }],
        ['Edit', { file_path: file, old_string: 'a', new_string: 'b' }],
        ['MultiEdit', { file_path: file, edits: [] }],
      ]) {
        const d = decide(call(tool, input, agent))
        assert.ok(d, `${tool} on ${file} by ${agent.agent_type || 'the Lead'}`)
        assert.match(d.reason, /written only by aether-autonomy/)
        assert.ok(d.reason.includes(file), 'the reason names the file')
      }
    }
  }
  assert.ok(decide(call('NotebookEdit', { notebook_path: GRANTS, new_source: 'x' })))
  assert.ok(decide({ ...call('Write', { file_path: 'autonomy/grants.json', content: '{}' }), cwd: '/repo/.aether' }))
})

test('the diary, the brief and lookalike paths stay writable', () => {
  for (const file of [
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/diary.md',
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/brief.md',
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/run.json.bak',
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/sub/run.json',
    '/repo/.aether/autonomy/x/grants.json',
    '/repo/.aether/autonomy-old/grants.json',
    '/repo/.aether/grants.json',
  ]) {
    assert.equal(decide(call('Write', { file_path: file, content: 'x' })), null, file)
  }
})

test('outside an Aether session the guard allows what it would refuse, autonomy files included', (t) => {
  for (const input of [
    call('Write', { file_path: SPEC, content: 'x' }),
    call('Edit', { file_path: PLAN, old_string: 'a', new_string: 'b' }, { agent_id: 'a2', agent_type: 'general-purpose' }),
    call('Write', { file_path: '/repo/.aether/autonomy/grants.json', content: '{}' }),
  ]) {
    const r = guard(t, JSON.stringify(inSession(input)), { marked: false })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('in an Aether session every agent but the Designer is refused, general-purpose and workflow agents included', (t) => {
  const whos = [
    {},
    { agent_type: 'aether:lead' },
    { agent_id: 'a2', agent_type: 'general-purpose' },
    { agent_id: 'a3', agent_type: 'workflow-subagent' },
    { agent_id: 'a4', agent_type: 'aether:implementer' },
  ]
  for (const who of whos) {
    const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, who))))
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny', JSON.stringify(who))
  }
  assert.equal(guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, designer)))).stdout, '')
})

test('a session id that is missing or could leave the data directory counts as no Aether session', (t) => {
  for (const id of [undefined, '', '../s1', 'a/b', 42]) {
    const r = guard(t, JSON.stringify({ ...call('Write', { file_path: SPEC, content: 'x' }), session_id: id }))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', String(id))
  }
})

