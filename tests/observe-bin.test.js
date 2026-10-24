'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir, makeRepo, PLUGIN } = require('./helpers.js')

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
function snapshot(dir) {
  const out = {}
  for (const e of fs.readdirSync(dir, { recursive: true })) {
    const f = path.join(dir, e)
    if (fs.statSync(f).isFile()) out[e] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
  }
  return out
}

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

test('read prints one JSON line with the ordered items and drafts the issue (R7)', (t) => {
  const dir = tempDir(t)
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(dir, 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'delegates', 'log.jsonl'), [
    { kind: 'launch', time: 10, session: 's-1', task: 't2', step: 'haiku', attempt: 1, launchKind: 'first' },
    { kind: 'launch', time: 30, session: 's-1', task: 't2', step: 'sonnet', attempt: 2, launchKind: 'rise' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  const r = bin(['read'], dir, { cwd: repo.dir })
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim().split('\n').length, 1)
  assert.equal(r.json.items[0].type, 'rise-without-reason')
  assert.ok(r.json.items[0].issue.body.length > 0)
  assert.ok(fs.existsSync(path.join(dir, 'observe', 'issues', 'rise-without-reason-t2-2.md')))
})

test('baseline reads --from without changing it and writes only to the data directory (R15)', (t) => {
  const dir = tempDir(t)
  const from = tempDir(t)
  fs.mkdirSync(path.join(from, 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(from, 'delegates', 'log.jsonl'), JSON.stringify({ kind: 'launch', time: 1, session: 's-1', task: 'a', step: 'haiku', attempt: 1, launchKind: 'first' }) + '\n')
  const before = snapshot(from)
  const r = bin(['baseline', '--from', from], dir)
  assert.equal(r.status, 0)
  assert.equal(r.json.approvalsByStep.haiku.launches, 1)
  assert.deepEqual(snapshot(from), before)
  assert.ok(fs.existsSync(path.join(dir, 'observe', 'baseline.json')))
})

test('status shows what was gathered, forget without --yes deletes nothing, with --yes deletes it (E11, R14)', (t) => {
  const dir = tempDir(t)
  lead(dir)
  bin(['hook'], dir, { input: hookInput() })
  const status = bin(['status'], dir)
  assert.ok(status.json.classes.events.bytes > 0)
  assert.equal(bin(['forget'], dir).json.deleted, false)
  assert.ok(fs.existsSync(path.join(dir, 'observe')))
  assert.equal(bin(['forget', '--yes'], dir).json.deleted, true)
  assert.equal(fs.existsSync(path.join(dir, 'observe')), false)
  assert.ok(fs.existsSync(path.join(dir, 'sessions', 's-1.json')))
})

test('the verbs that read run from any shell, with no plugin variable; a bad verb is a usage error', (t) => {
  const dir = tempDir(t)
  const env = { CLAUDE_PLUGIN_ROOT: '', CLAUDE_PLUGIN_DATA: '' }
  assert.equal(bin(['status'], dir, { env }).status, 0)
  assert.equal(bin(['read'], dir, { env }).status, 0)
  const bad = bin(['nope'], dir)
  assert.equal(bad.status, 1)
  assert.match(bad.json.error, /^usage: aether-observe/)
  assert.equal(bin(['status', 'extra'], dir).status, 1)
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
