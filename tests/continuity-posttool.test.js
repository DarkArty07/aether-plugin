'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')
const posttool = require('../plugins/aether/lib/continuity-posttool.js')
const { markSession } = require('../plugins/aether/lib/session.js')

const EN = "Claude's memory keeps only what lasts: preferences and lessons. The state of a version, a branch or a task goes to the continuity note, which Aether writes by itself; do not record it in the memory."
const ES = 'La memoria de Claude guarda solo lo que dura: preferencias y lecciones. El estado de una versión, una rama o una tarea va a la nota de continuidad, que Aether escribe sola; no lo registres en la memoria.'

function world(t) {
  const repo = makeRepo(t)
  const configDir = tempDir(t, 'aether-config-')
  const data = tempDir(t, 'aether-data-')
  const env = { CLAUDE_CONFIG_DIR: configDir, LANG: 'en_US.UTF-8' }
  const memory = store.memoryDir({ cwd: repo.dir, env, home: configDir })
  return { repo, configDir, data, env, memory }
}
const call = (w, file, tool = 'Write') => ({ session_id: 's1', cwd: w.repo.dir, tool_name: tool, tool_input: { file_path: file } })

test('a write in the memory, outside continuity/, reminds the Lead that the state goes to the continuity note (R9, H1 scenario 8)', (t) => {
  const w = world(t)
  const ctx = { env: w.env, home: w.configDir }
  for (const tool of ['Write', 'Edit', 'MultiEdit']) {
    assert.deepEqual(posttool.posttool(call(w, path.join(w.memory, 'version-state.md'), tool), ctx), { additionalContext: EN }, tool)
  }
  assert.deepEqual(posttool.posttool(call(w, path.join(w.memory, 'MEMORY.md')), ctx), { additionalContext: EN })
  assert.deepEqual(posttool.posttool(call(w, path.join(w.memory, 'x.md')), { ...ctx, env: { ...w.env, LANG: 'es_ES.UTF-8' } }), { additionalContext: ES })
})

test('no reminder for the continuity folder, for the repository, for other tools or for an unreadable input (R9)', (t) => {
  const w = world(t)
  const ctx = { env: w.env, home: w.configDir }
  assert.equal(posttool.posttool(call(w, path.join(w.memory, 'continuity', 's1.json')), ctx), null)
  assert.equal(posttool.posttool(call(w, path.join(w.repo.dir, 'a.md')), ctx), null)
  assert.equal(posttool.posttool({ ...call(w, path.join(w.memory, 'x.md')), tool_name: 'Bash', tool_input: { command: 'ls' } }, ctx), null)
  assert.equal(posttool.posttool(null, ctx), null)
  assert.equal(posttool.posttool({}, ctx), null)
})

test('a handler that throws does not stop the others, and the texts join with a blank line', () => {
  const saved = [...posttool.HANDLERS]
  posttool.HANDLERS.splice(0, posttool.HANDLERS.length, () => { throw new Error('boom') }, () => 'one', () => null, () => 'two')
  try {
    assert.deepEqual(posttool.posttool({}, {}), { additionalContext: 'one\n\ntwo' })
  } finally {
    posttool.HANDLERS.splice(0, posttool.HANDLERS.length, ...saved)
  }
})

test('through the bin: the reminder is the additionalContext of PostToolUse, and no hook of the feature touches MEMORY.md (C3)', (t) => {
  const w = world(t)
  markSession(w.data, 's1', 1000, { repo: w.repo.dir, claude: null })
  fs.mkdirSync(w.memory, { recursive: true })
  const index = path.join(w.memory, 'MEMORY.md')
  fs.writeFileSync(index, '- [One](one.md) — a lesson\n')
  const before = fs.statSync(index)
  const bin = path.join(PLUGIN, 'bin', 'aether-continuity')
  const run = (verb, input) => spawnSync(process.execPath, [bin, verb], { input: JSON.stringify({ session_id: 's1', cwd: w.repo.dir, ...input }), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: w.data, CLAUDE_CONFIG_DIR: w.configDir, LANG: 'en_US.UTF-8' } })
  const out = run('posttool', { hook_event_name: 'PostToolUse', ...call(w, path.join(w.memory, 'state.md')) })
  assert.equal(out.status, 0)
  assert.deepEqual(JSON.parse(out.stdout), { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: EN } })
  for (const [verb, input] of [['stop', { last_assistant_message: 'hi' }], ['precompact', {}], ['postcompact', { compact_summary: 's' }], ['stopfailure', { error: 'x' }], ['sessionend', { reason: 'other' }]]) {
    assert.equal(run(verb, input).status, 0, verb)
  }
  assert.equal(fs.readFileSync(index, 'utf8'), '- [One](one.md) — a lesson\n')
  assert.equal(fs.statSync(index).mtimeMs, before.mtimeMs)
  assert.deepEqual(fs.readdirSync(w.memory).sort(), ['MEMORY.md', 'continuity'])
})
