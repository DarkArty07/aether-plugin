'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, PLUGIN } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-observe')

function bin(args, dir, { input = '', cwd = dir, env = {} } = {}) {
  const r = spawnSync('node', [BIN, ...args], { input, cwd, encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: dir, ...env } })
  let json = null
  try { json = JSON.parse(r.stdout) } catch { json = null }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json }
}
function lead(dir, id = 's-1') {
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'sessions', `${id}.json`), '{}')
}
const hookInput = (over = {}) => JSON.stringify({ session_id: 's-1', hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'ZEBRA', ...over })

test('hook prints nothing, in a Lead session and out of it, and leaves a plain session untouched (E10, R13)', (t) => {
  const plain = tempDir(t)
  const r1 = bin(['hook'], plain, { input: hookInput() })
  assert.deepEqual([r1.status, r1.stdout, r1.stderr], [0, '', ''])
  assert.deepEqual(fs.readdirSync(plain), [])
  const dir = tempDir(t)
  lead(dir)
  const r2 = bin(['hook'], dir, { input: hookInput() })
  assert.deepEqual([r2.status, r2.stdout, r2.stderr], [0, '', ''])
  assert.equal(fs.readFileSync(path.join(dir, 'observe', 'events.jsonl'), 'utf8').trim().split('\n').length, 1)
  const r3 = bin(['hook'], dir, { input: 'not json' })
  assert.deepEqual([r3.status, r3.stdout], [0, ''])
})

test('hook runs from any shell, with no plugin variable; a bad verb is a usage error', (t) => {
  const dir = tempDir(t)
  const env = { CLAUDE_PLUGIN_ROOT: '', CLAUDE_PLUGIN_DATA: '' }
  assert.equal(bin(['hook'], dir, { env, input: hookInput() }).status, 0)
  const bad = bin(['nope'], dir)
  assert.equal(bad.status, 1)
  assert.match(bad.json.error, /^usage: aether-observe/)
  assert.equal(bin(['hook', 'extra'], dir).status, 1)
})

test('the usage names the file-issues verb, which takes no argument (spec 020)', (t) => {
  const dir = tempDir(t)
  const stray = bin(['file-issues', 'extra'], dir)
  assert.equal(stray.status, 1)
  assert.equal(stray.json.error, 'usage: aether-observe hook | file-issues')
  assert.equal(bin(['nope'], dir).json.error, 'usage: aether-observe hook | file-issues')
})

test('hooks.json runs the five new hooks and the manifest gains no option (R3, R9)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
  assert.equal(manifest.userConfig.observe, undefined)
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks
  for (const event of ['PostToolUse', 'PostToolUseFailure', 'StopFailure', 'PreCompact', 'SessionEnd']) {
    const commands = (hooks[event] || []).flatMap((group) => group.hooks.map((h) => h.command))
    assert.ok(commands.includes('node "${CLAUDE_PLUGIN_ROOT}/bin/aether-observe" hook'), event)
  }
  assert.equal(hooks.PostToolUse[0].matcher, 'ScheduleWakeup')
  const sessionEnd = hooks.SessionEnd.flatMap((group) => group.hooks).find((h) => h.command.includes('aether-observe'))
  assert.ok(sessionEnd.timeout >= 10, 'the SessionEnd hook asks for more than the 1500 ms Claude Code gives by default')
  assert.ok(hooks.SessionStart && hooks.PreToolUse)
})

test('the components page counts twelve bins and describes aether-observe (R16)', () => {
  const components = fs.readFileSync(path.join(__dirname, '..', 'docs', 'reference', 'components.md'), 'utf8')
  assert.ok(components.includes('the twelve commands of `bin/`'))
  assert.ok(components.split('\n').some((line) => line.startsWith('| `aether-observe` |')))
  assert.equal(fs.readdirSync(path.join(PLUGIN, 'bin')).length, 12)
})
