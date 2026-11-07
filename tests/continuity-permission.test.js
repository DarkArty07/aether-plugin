'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { classifyClaudePath, realResolve } = require('../plugins/aether/lib/tree-paths.js')
const { permission } = require('../plugins/aether/lib/continuity-permission.js')
const { markSession } = require('../plugins/aether/lib/session.js')

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const outside = tempDir(t, 'aether-outside-')
  const claude = path.join(repo.dir, '.claude')
  for (const dir of ['skills', 'rules', 'hooks']) fs.mkdirSync(path.join(claude, dir), { recursive: true })
  fs.writeFileSync(path.join(claude, 'settings.json'), '{}')
  fs.symlinkSync('..', path.join(claude, 'skills', 'up'))
  fs.symlinkSync(outside, path.join(claude, 'skills', 'out'))
  fs.mkdirSync(path.join(repo.dir, '.agents', 'skills', 'linked'), { recursive: true })
  fs.symlinkSync(path.join(repo.dir, '.agents', 'skills', 'linked'), path.join(claude, 'skills', 'linked'))
  return { repo, home, outside, claude }
}
const kind = (w, file) => classifyClaudePath(file, { cwd: w.repo.dir, home: w.home }).kind
const input = (w, file, tool = 'Write') => ({ session_id: 's1', cwd: w.repo.dir, tool_name: tool, tool_input: tool === 'NotebookEdit' ? { notebook_path: file } : { file_path: file } })

test('skills/ and rules/ of the project are allowed, new files included, with absolute and relative paths (C7, H2 scenario 16)', (t) => {
  const w = world(t)
  for (const file of [path.join(w.claude, 'skills', 'x', 'SKILL.md'), path.join(w.claude, 'rules', 'y.md'), '.claude/rules/z.md', '.claude/skills/new/SKILL.md']) {
    assert.equal(permission(input(w, file), {}), true, file)
  }
  assert.equal(permission(input(w, path.join(w.claude, 'rules', 'n.ipynb'), 'NotebookEdit'), {}), true)
  for (const tool of ['Edit', 'MultiEdit']) assert.equal(permission(input(w, path.join(w.claude, 'rules', 'y.md'), tool), {}), true, tool)
  assert.equal(kind(w, path.join(w.claude, 'skills', 'x', 'SKILL.md')), 'skills')
  assert.equal(kind(w, path.join(w.claude, 'rules', 'y.md')), 'rules')
})

test('the settings, the hooks, the neighbours and every way out are not allowed (C7, R20, R21)', (t) => {
  const w = world(t)
  const refused = {
    [path.join(w.claude, 'settings.json')]: 'config',
    [path.join(w.claude, 'settings.local.json')]: 'config',
    [path.join(w.claude, 'hooks', 'pre.sh')]: 'config',
    [`${w.claude}/skills/../settings.json`]: 'config',
    [`${w.claude}/skills/x/../../hooks/h.sh`]: 'config',
    [path.join(w.claude, 'skills', 'up', 'settings.json')]: 'config',
    [path.join(w.claude, 'skills', 'out', 'x.md')]: 'escape',
    [path.join(w.claude, 'skills', 'linked', 'SKILL.md')]: 'escape',
    [path.join(w.claude, 'agents', 'a.md')]: 'other',
    [path.join(w.claude, 'agent-memory', 'm.md')]: 'other',
    [path.join(w.home, '.claude', 'skills', 'x', 'SKILL.md')]: 'other',
    [path.join(w.repo.dir, 'src', 'a.js')]: 'other',
  }
  for (const [file, expected] of Object.entries(refused)) {
    assert.equal(kind(w, file), expected, file)
    assert.equal(permission(input(w, file), {}), false, file)
  }
})

test('a copy of the working tree and a subdirectory use the .claude of their project; another repository does not (A13)', (t) => {
  const w = world(t)
  const copy = path.join(tempDir(t, 'aether-copy-'), 'wt')
  w.repo.git('worktree', 'add', '-q', copy, '-b', 'other')
  fs.mkdirSync(path.join(copy, '.claude', 'rules'), { recursive: true })
  assert.equal(permission({ tool_name: 'Write', cwd: copy, tool_input: { file_path: '.claude/rules/a.md' } }, {}), true)
  assert.equal(permission({ tool_name: 'Write', cwd: copy, tool_input: { file_path: path.join(w.claude, 'rules', 'a.md') } }, {}), true, 'the main checkout is the same project')
  fs.mkdirSync(path.join(w.repo.dir, 'src'), { recursive: true })
  assert.equal(permission({ tool_name: 'Write', cwd: path.join(w.repo.dir, 'src'), tool_input: { file_path: '../.claude/rules/a.md' } }, {}), true)
  const stranger = makeRepo(t)
  fs.mkdirSync(path.join(stranger.dir, '.claude', 'rules'), { recursive: true })
  assert.equal(permission(input(w, path.join(stranger.dir, '.claude', 'rules', 'a.md')), {}), false)
})

test('realResolve follows the links of the part that exists and keeps the rest (D10)', (t) => {
  const w = world(t)
  assert.equal(realResolve(path.join(w.claude, 'skills', 'up', 'settings.json')), path.join(w.claude, 'settings.json'))
  assert.equal(realResolve(path.join(w.claude, 'skills', 'out', 'not', 'yet.md')), path.join(w.outside, 'not', 'yet.md'))
  assert.equal(realResolve(path.join(w.repo.dir, 'missing', 'a.md')), path.join(w.repo.dir, 'missing', 'a.md'))
})

test('other tools and bad inputs are not allowed and never throw', (t) => {
  const w = world(t)
  assert.equal(permission({ tool_name: 'Bash', cwd: w.repo.dir, tool_input: { command: 'touch .claude/rules/a.md' } }, {}), false)
  assert.equal(permission({ tool_name: 'Write', cwd: w.repo.dir, tool_input: {} }, {}), false)
  assert.equal(permission(null, {}), false)
  assert.equal(permission({}, {}), false)
})

test('through the bin: the decision is allow for the Lead, and nothing for the settings or for a session that is not the Lead (C7, R40)', (t) => {
  const w = world(t)
  const data = tempDir(t, 'aether-data-')
  markSession(data, 's1', 1000, { repo: w.repo.dir, claude: null })
  const bin = path.join(PLUGIN, 'bin', 'aether-continuity')
  const ask = (session, file) => spawnSync(process.execPath, [bin, 'permission'], { input: JSON.stringify({ hook_event_name: 'PermissionRequest', ...input(w, file), session_id: session }), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: data } })
  const allowed = ask('s1', path.join(w.claude, 'skills', 'x', 'SKILL.md'))
  assert.equal(allowed.status, 0)
  assert.deepEqual(JSON.parse(allowed.stdout), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } })
  assert.deepEqual([ask('s1', path.join(w.claude, 'settings.json')).stdout, ask('s1', path.join(w.claude, 'settings.json')).status], ['', 0])
  const plain = ask('plain-session', path.join(w.claude, 'skills', 'x', 'SKILL.md'))
  assert.deepEqual([plain.status, plain.stdout], [0, ''])
})
