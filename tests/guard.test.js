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
const KIT_SPEC = '/repo/specs/001-login/spec.md'
const KIT_PLAN = '/repo/specs/001-login/plan.md'
const KIT_TASKS = '/repo/specs/001-login/tasks.md'
const CONSTITUTION = '/repo/.specify/memory/constitution.md'
const PROTECTED_FILES = [SPEC, PLAN, KIT_SPEC, KIT_PLAN, KIT_TASKS, CONSTITUTION]

const call = (tool, input, who = {}) => ({ hook_event_name: 'PreToolUse', cwd: '/repo', tool_name: tool, tool_input: input, ...who })
const lead = { agent_type: 'aether:lead' }
const writer = { agent_id: 'a2', agent_type: 'aether:writer' }
const designer = { agent_id: 'a1', agent_type: 'aether:designer' }
const implementer = { agent_id: 'a3', agent_type: 'aether:implementer' }
// Every agent that is neither the main session nor the Lead or the Writer.
const others = [
  implementer,
  { agent_id: 'a4', agent_type: 'aether:supervisor' },
  { agent_id: 'a5', agent_type: 'aether:reviewer' },
  { agent_id: 'a6', agent_type: 'aether:judge' },
  designer,
  { agent_id: 'a7', agent_type: 'general-purpose' },
  { agent_id: 'a8', agent_type: 'workflow-subagent' },
  { agent_id: 'a9' },
  { agent_type: 'aether:implementer' },
]

// The reason the guard gives an agent that may not write a protected file.
const refusal = (file) => `In Aether mode only the Lead and the Writer write specs, plans and tasks. Hand this change to the Lead, or to the aether:writer agent, instead of editing ${file} yourself.`
// The three tools the guard checks on one file.
const writes = (file) => [
  ['Write', { file_path: file, content: 'x' }],
  ['Edit', { file_path: file, old_string: 'a', new_string: 'b' }],
  ['MultiEdit', { file_path: file, edits: [] }],
]

test('the main session may write, edit and multi-edit the old and the new paths', () => {
  for (const file of PROTECTED_FILES) {
    for (const [tool, input] of writes(file)) {
      assert.equal(decide(call(tool, input)), null, `${tool} on ${file}`)
    }
  }
})

test('the Lead and the Writer may write, edit and multi-edit them too', () => {
  for (const who of [lead, writer]) {
    for (const file of PROTECTED_FILES) {
      for (const [tool, input] of writes(file)) {
        assert.equal(decide(call(tool, input, who)), null, `${tool} on ${file} by ${who.agent_type}`)
      }
    }
  }
})

test('every other agent is refused, and the reason names the file', () => {
  for (const who of others) {
    for (const file of PROTECTED_FILES) {
      for (const [tool, input] of writes(file)) {
        const d = decide(call(tool, input, who))
        assert.ok(d, `${tool} on ${file} by ${JSON.stringify(who)}`)
        assert.equal(d.reason, refusal(file))
      }
    }
  }
})

test('NotebookEdit is checked by its notebook_path', () => {
  const notebook = '/repo/docs/superpowers/plans/n.ipynb'
  assert.equal(decide(call('NotebookEdit', { notebook_path: notebook, new_source: 'x' }, writer)), null)
  assert.equal(decide(call('NotebookEdit', { notebook_path: notebook, new_source: 'x' }, implementer)).reason, refusal(notebook))
})

test('other tools and malformed input get no decision', () => {
  assert.equal(decide(call('Bash', { command: 'echo x > docs/superpowers/specs/a.md' }, implementer)), null)
  assert.equal(decide(call('Write', {}, implementer)), null)
  assert.equal(decide(call('Write', { file_path: 42 }, implementer)), null)
  assert.equal(decide(null), null)
  assert.equal(decide({}), null)
})

test('relative paths are resolved against the hook cwd', () => {
  assert.equal(decide(call('Write', { file_path: 'docs/superpowers/specs/new.md', content: 'x' }, implementer)).reason, refusal('/repo/docs/superpowers/specs/new.md'))
  assert.equal(decide({ ...call('Write', { file_path: 'superpowers/plans/new.md', content: 'x' }, implementer), cwd: '/repo/docs' }).reason, refusal('/repo/docs/superpowers/plans/new.md'))
  assert.equal(decide({ ...call('Write', { file_path: '001-login/spec.md', content: 'x' }, implementer), cwd: '/repo/specs' }).reason, refusal('/repo/specs/001-login/spec.md'))
  assert.equal(decide({ ...call('Write', { file_path: 'specs/new.md', content: 'x' }, implementer), cwd: '/repo' }), null)
})

test('only the old and the new protected places are protected', () => {
  for (const file of [
    '/repo/README.md',
    '/repo/docs/superpowers/specs-old/x.md',
    '/repo/docs/superpowers/plansx/y.md',
    '/repo/mydocs/superpowers/specs/x.md',
    '/repo/docs/superpowers/x.md',
    '/repo/.specify/constitution.md',
    '/repo/specify/memory/constitution.md',
    '/repo/.specify/memory/constitution.md.bak',
  ]) {
    assert.equal(decide(call('Write', { file_path: file, content: 'x' }, implementer)), null, file)
  }
  assert.ok(decide(call('Write', { file_path: '/repo/packages/app/docs/superpowers/specs/x.md', content: 'x' }, implementer)))
  assert.ok(decide(call('Write', { file_path: '/repo/packages/app/specs/002-api/tasks.md', content: 'x' }, implementer)))
})

test('a specs folder with no Spec Kit spec, plan or tasks file is allowed for every agent', () => {
  for (const file of [
    '/repo/specs/unit/foo.test.js',
    '/repo/specs/unit/spec.md',
    '/repo/src/specs/notes.md',
    '/repo/specs/1-login/spec.md',
    '/repo/specs/0001-login/spec.md',
    '/repo/specs/001/spec.md',
    '/repo/specs/001-login/notes.md',
    '/repo/specs/001-login/sub/spec.md',
    '/repo/specs/001-login/spec.md.bak',
    '/repo/myspecs/001-login/spec.md',
  ]) {
    for (const who of [{}, lead, writer, ...others]) {
      assert.equal(decide(call('Write', { file_path: file, content: 'x' }, who)), null, `${file} by ${JSON.stringify(who)}`)
    }
  }
})

test('the Spec Kit constitution is protected', () => {
  assert.equal(decide(call('Write', { file_path: CONSTITUTION, content: 'x' }, implementer)).reason, refusal(CONSTITUTION))
  assert.equal(decide(call('Edit', { file_path: CONSTITUTION, old_string: 'a', new_string: 'b' }, lead)), null)
})

test('a missing cwd falls back to the process cwd, and ".." is resolved before the check', () => {
  const missing = decide({ tool_name: 'Write', tool_input: { file_path: 'docs/superpowers/specs/x.md', content: 'x' }, ...implementer })
  assert.equal(missing.reason, refusal(path.resolve('docs/superpowers/specs/x.md')))
  assert.ok(decide(call('Write', { file_path: '/repo/x/../docs/superpowers/specs/a.md', content: 'x' }, implementer)))
  assert.equal(decide(call('Write', { file_path: '/repo/docs/superpowers/specs/../notes.md', content: 'x' }, implementer)), null)
  assert.ok(decide(call('Write', { file_path: '/repo/specs/001-login/../001-login/spec.md', content: 'x' }, implementer)))
  assert.equal(decide(call('Write', { file_path: '/repo/specs/001-login/../spec.md', content: 'x' }, implementer)), null)
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

// Runs the bin in a data directory where session s1 is an Aether session, unless marked is false.
function guard(t, stdin, { marked = true } = {}) {
  const data = tempDir(t, 'aether-data-')
  if (marked) markSession(data, 's1')
  const env = { ...process.env, AETHER_DATA_DIR: data }
  return spawnSync(process.execPath, [GUARD_BIN], { input: stdin, encoding: 'utf8', env })
}
const inSession = (input) => ({ session_id: 's1', ...input })

test('outside an Aether session the guard allows what it would refuse, autonomy files included', (t) => {
  for (const input of [
    call('Write', { file_path: SPEC, content: 'x' }, implementer),
    call('Edit', { file_path: PLAN, old_string: 'a', new_string: 'b' }, { agent_id: 'a2', agent_type: 'general-purpose' }),
    call('Write', { file_path: '/repo/.aether/autonomy/grants.json', content: '{}' }),
  ]) {
    const r = guard(t, JSON.stringify(inSession(input)), { marked: false })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('aether-guard prints a deny decision for an agent that may not write specs', (t) => {
  const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, implementer))))
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, refusal(SPEC))
})

test('aether-guard stays silent when it allows, and on input it cannot read', (t) => {
  for (const stdin of [
    JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }))),
    JSON.stringify(inSession(call('Write', { file_path: SPEC, content: 'x' }, writer))),
    '',
    'not json',
    '[]',
  ]) {
    const r = guard(t, stdin)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('in an Aether session the main session, the Lead and the Writer may write specs, and every other agent is refused', (t) => {
  for (const who of [{}, lead, writer]) {
    const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: KIT_SPEC, content: 'x' }, who))))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', JSON.stringify(who))
  }
  for (const who of others) {
    const r = guard(t, JSON.stringify(inSession(call('Write', { file_path: KIT_SPEC, content: 'x' }, who))))
    assert.equal(r.status, 0, r.stderr)
    const out = JSON.parse(r.stdout)
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny', JSON.stringify(who))
    assert.equal(out.hookSpecificOutput.permissionDecisionReason, refusal(KIT_SPEC))
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

test('a session id that is missing or could leave the data directory counts as no Aether session', (t) => {
  for (const id of [undefined, '', '../s1', 'a/b', 42]) {
    const r = guard(t, JSON.stringify({ ...call('Write', { file_path: SPEC, content: 'x' }, implementer), session_id: id }))
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', String(id))
  }
})
