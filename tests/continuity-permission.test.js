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

test('dangling links resolve their missing targets and cannot grant protected or outside writes', (t) => {
  const w = world(t)
  for (const folder of ['skills', 'rules']) {
    for (const [name, target, expected] of [
      ['local', '../settings.local.json', 'config'],
      ['hook', '../hooks/missing.sh', 'config'],
      ['outside', path.join(w.outside, 'missing.md'), 'escape'],
    ]) {
      const file = path.join(w.claude, folder, name)
      fs.symlinkSync(target, file)
      const real = path.resolve(path.dirname(file), target)
      assert.equal(fs.existsSync(real), false)
      assert.equal(realResolve(file), real)
      assert.deepEqual(classifyClaudePath(file, { cwd: w.repo.dir, home: w.home }), { kind: expected, real })
      assert.equal(permission(input(w, file), {}), false)
    }
  }
})

test('cyclic links fail closed while repeated noncyclic links resolve', (t) => {
  const w = world(t)
  const folder = path.join(w.claude, 'skills')
  fs.symlinkSync('b', path.join(folder, 'a'))
  fs.symlinkSync('a', path.join(folder, 'b'))
  fs.symlinkSync('self', path.join(folder, 'self'))
  for (const name of ['a', 'b', 'self']) {
    const file = path.join(folder, name, 'new.md')
    assert.throws(() => realResolve(file), { code: 'ELOOP' })
    assert.equal(permission(input(w, file), {}), false)
  }
  assert.equal(realResolve(`${folder}/up/skills/up/rules/new.md`), path.join(w.claude, 'rules', 'new.md'))
})

// Record entries, link destinations, metadata and bytes without following links.
function snapshot(dir) {
  const stat = fs.lstatSync(dir)
  const entry = { mode: stat.mode, size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs }
  if (stat.isSymbolicLink()) entry.link = fs.readlinkSync(dir)
  else if (stat.isDirectory()) entry.children = Object.fromEntries(fs.readdirSync(dir).sort().map((name) => [name, snapshot(path.join(dir, name))]))
  else entry.bytes = fs.readFileSync(dir).toString('base64')
  return entry
}

test('classification leaves all fixture filesystem state unchanged', (t) => {
  const w = world(t)
  const before = [w.repo.dir, w.home, w.outside].map(snapshot)
  for (const file of [
    '.claude/skills/new/SKILL.md', '.claude/rules/new.md', '.claude/settings.local.json',
    '.claude/hooks/new.sh', '.claude/skills/up/settings.json', '.claude/skills/out/new.md',
    path.join(w.home, '.claude/skills/new.md'),
  ]) classifyClaudePath(file, { cwd: w.repo.dir, home: w.home })
  assert.deepEqual([w.repo.dir, w.home, w.outside].map(snapshot), before)
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
  const ask = (session, file) => spawnSync(process.execPath, [bin, 'permission'], { input: JSON.stringify({ hook_event_name: 'PermissionRequest', ...input(w, file), session_id: session }), encoding: 'utf8', env: { ...process.env, AETHER_DATA_DIR: data, HOME: w.home } })
  const allowed = ask('s1', path.join(w.claude, 'skills', 'x', 'SKILL.md'))
  assert.equal(allowed.status, 0)
  assert.deepEqual(JSON.parse(allowed.stdout), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } })
  assert.deepEqual([ask('s1', path.join(w.claude, 'settings.json')).stdout, ask('s1', path.join(w.claude, 'settings.json')).status], ['', 0])
  const before = [w.repo.dir, w.home, w.outside, data].map(snapshot)
  const plain = ask('plain-session', path.join(w.claude, 'skills', 'x', 'SKILL.md'))
  assert.deepEqual([plain.status, plain.stdout, plain.stderr], [0, '', ''])
  assert.deepEqual([w.repo.dir, w.home, w.outside, data].map(snapshot), before)
})

test('a project alias of home does not allow personal Claude files outside git', (t) => {
  const home = tempDir(t, 'aether-home-')
  const holder = tempDir(t, 'aether-alias-')
  const alias = path.join(holder, 'home')
  fs.symlinkSync(home, alias)
  fs.mkdirSync(path.join(home, '.claude', 'rules'), { recursive: true })
  for (const cwd of [home, alias]) {
    const file = path.join(cwd, '.claude', 'rules', 'new.md')
    assert.equal(classifyClaudePath(file, { cwd, home }).kind, 'other')
    assert.equal(permission({ tool_name: 'Write', cwd, tool_input: { file_path: file } }, { home }), false)
  }
})


test('folder links, folder itself and written traversal never grant access', (t) => {
  const w = world(t)
  for (const folder of ['skills', 'rules']) {
    const dir = path.join(w.claude, folder)
    assert.equal(kind(w, dir), 'other')
    assert.equal(kind(w, `./.claude/${folder}`), 'other')
    assert.equal(permission(input(w, dir), {}), false)
    fs.rmSync(dir, { recursive: true })
    assert.equal(permission(input(w, dir), {}), false, 'missing folder')
    fs.symlinkSync(w.home, dir)
    assert.equal(kind(w, `${dir}/settings.json`), 'escape')
    assert.equal(permission(input(w, `${dir}/settings.json`), { home: w.home }), false)
    fs.unlinkSync(dir)
    fs.writeFileSync(dir, 'file')
    assert.equal(permission(input(w, dir), {}), false)
  }
  for (const file of ['./.claude/skills/../agents/a.md', '.claude/rules/../skills/x.md']) {
    assert.equal(kind(w, file), 'escape', file)
    assert.equal(permission(input(w, file), {}), false)
  }
})

test('outside git uses cwd, while a git execution error fails closed', (t) => {
  const w = world(t)
  const outside = tempDir(t, 'aether-nongit-')
  assert.equal(classifyClaudePath('.claude/rules/a.md', { cwd: outside, home: w.home }).kind, 'rules')
  const sub = path.join(w.repo.dir, 'src')
  fs.mkdirSync(sub)
  const fake = tempDir(t, 'aether-fake-git-')
  fs.writeFileSync(path.join(fake, 'git'), '#!/bin/sh\nexit 126\n', { mode: 0o755 })
  const script = `const { permission } = require(${JSON.stringify(path.join(PLUGIN, 'lib', 'continuity-permission.js'))}); console.log(permission({tool_name:'Write', cwd:process.argv[1], tool_input:{file_path:'.claude/rules/a.md'}}, {}))`
  const result = spawnSync(process.execPath, ['-e', script, sub], { encoding: 'utf8', env: { ...process.env, PATH: fake, HOME: w.home } })
  assert.equal(result.status, 0)
  assert.equal(result.stdout.trim(), 'false')
  const denied = `require('node:child_process').spawnSync = () => ({error: Object.assign(new Error('denied'), {code:'EPERM'})}); ${script}`
  const eperm = spawnSync(process.execPath, ['-e', denied, sub], { encoding: 'utf8', env: { ...process.env, HOME: w.home } })
  assert.equal(eperm.status, 0)
  assert.equal(eperm.stdout.trim(), 'false')
})
