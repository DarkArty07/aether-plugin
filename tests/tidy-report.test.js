'use strict'
process.env.GIT_OPTIONAL_LOCKS = '0'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { report, projectsIn, tidyCommand } = require('../plugins/aether/lib/tidy-report.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-doctor')
const put = (file, text = 'x\n') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n'
const skill = (root, name) => put(path.join(root, '.agents', 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\nrules\n`)

// A folder with three projects: A is untidy, B shares a skill with A, C is clean.
function projects(t) {
  const folder = tempDir(t, 'aether-projects-')
  const a = path.join(folder, 'a')
  put(path.join(a, 'AGENTS.md'), lines(201))
  put(path.join(a, 'CLAUDE.md'), lines(201))
  put(path.join(a, '.aether', 'aether.db'))
  put(path.join(a, '.aether', 'seats', 'judge-1', 'pair.json'))
  put(path.join(a, '.aether', 'experiment-125.tar.gz'))
  put(path.join(a, '.aether', 'runs-local', 'x.txt'))
  put(path.join(a, '.aether-tmp', 'old.md'))
  skill(a, 'erebus-ui')
  put(path.join(folder, 'b', 'AGENTS.md'), lines(10))
  skill(path.join(folder, 'b'), 'erebus-ui')
  put(path.join(folder, 'c', 'AGENTS.md'), lines(10))
  put(path.join(folder, 'c', 'CLAUDE.md'), '@AGENTS.md\n')
  return { folder, a, b: path.join(folder, 'b'), c: path.join(folder, 'c') }
}
// A listing of every file with its size, its time and a digest of its content, to compare before and after.
function snapshot(root) {
  return fs.readdirSync(root, { recursive: true }).sort().map((entry) => {
    const full = path.join(root, entry)
    const stat = fs.lstatSync(full)
    return [entry, stat.isFile() ? stat.size : 'dir', stat.mtimeMs, stat.isFile() ? crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex') : '']
  })
}

test('the report lists, for each project, what would move, be deleted or edited, the loose files and the skills repeated between projects (C13, R37, R39)', (t) => {
  const p = projects(t)
  const home = tempDir(t)
  const out = report([p.a, p.b, p.c], { home })
  const a = out.projects.find((x) => x.path === p.a)
  const has = (action, file, to) => a.actions.some((x) => x.action === action && x.path === file && (to === undefined || x.to === to))
  assert.ok(has('edit', 'CLAUDE.md'))
  assert.ok(has('edit', 'AGENTS.md'))
  for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    assert.ok(a.actions.some((x) => x.action === 'edit' && x.path === file && x.why === 'split it: keep AGENTS.md a map'))
  }
  assert.equal(a.findings.find((f) => f.kind === 'too-long').count, 2)
  assert.ok(has('delete', path.join('.aether', 'aether.db')))
  assert.ok(has('move', path.join('.aether', 'seats'), path.join('.aether', 'work', 'seats')))
  assert.ok(has('move', '.aether-tmp', path.join('.aether', 'tmp')))
  assert.deepEqual(out.projects.find((x) => x.path === p.c).actions, [])
  assert.deepEqual(out.stray.map((s) => [s.project, s.path]).sort(), [[p.a, path.join('.aether', 'experiment-125.tar.gz')], [p.a, path.join('.aether', 'runs-local')]].sort())
  assert.deepEqual(out.crossDuplicates.map((d) => [d.name, d.projects.sort()]), [['erebus-ui', [p.a, p.b].sort()]])
})

test('projectsIn lists the folders of a directory, without hidden ones and in order (R39)', (t) => {
  const p = projects(t)
  fs.mkdirSync(path.join(p.folder, '.hidden'))
  put(path.join(p.folder, 'file.txt'))
  assert.deepEqual(projectsIn(p.folder), [p.a, p.b, p.c])
})

test('aether-doctor tidy prints one JSON line, changes nothing and leaves the tree and git status identical (R37, R39)', (t) => {
  const p = projects(t)
  const home = tempDir(t)
  spawnSync('git', ['init', '-q'], { cwd: p.a })
  const before = snapshot(p.folder)
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: p.a, encoding: 'utf8' }).stdout
  const run = (args) => spawnSync(process.execPath, [BIN, 'tidy', ...args], { cwd: p.folder, encoding: 'utf8', env: { ...process.env, HOME: home } })
  const all = run(['--projects', p.folder])
  assert.equal(all.status, 0, all.stderr)
  assert.deepEqual(JSON.parse(all.stdout).tidy.projects.map((x) => x.path), [p.a, p.b, p.c])
  const one = run([p.a])
  assert.equal(one.status, 0)
  assert.deepEqual(JSON.parse(one.stdout).tidy.projects.map((x) => x.path), [p.a])
  assert.equal(run([path.join(p.folder, 'file-that-is-missing')]).status, 2)
  assert.deepEqual(snapshot(p.folder), before)
  assert.equal(spawnSync('git', ['status', '--porcelain'], { cwd: p.a, encoding: 'utf8' }).stdout, status)
})

test('aether-doctor without tidy still checks the machine as before (R37)', () => {
  const r = spawnSync(process.execPath, [BIN, '--name', 'claude'], { encoding: 'utf8' })
  assert.ok(JSON.parse(r.stdout.trim().split('\n').pop()))
})

test('a same-content Claude skill copy needs no action', (t) => {
  const root = tempDir(t), home = tempDir(t)
  skill(root, 'foo')
  const source = path.join(root, '.agents/skills/foo/SKILL.md')
  put(path.join(root, '.claude/skills/foo/SKILL.md'), fs.readFileSync(source))
  assert.deepEqual(report([root], { home }).projects[0].actions, [])
})

test('a differing Claude skill is reported as a conflict, never a deletion', (t) => {
  const root = tempDir(t), home = tempDir(t)
  skill(root, 'foo')
  put(path.join(root, '.claude/skills/foo/SKILL.md'), 'newer content')
  const actions = report([root], { home }).projects[0].actions
  assert.ok(actions.some((a) => a.action === 'edit' && a.path === '.claude/skills/foo' && /conflict/.test(a.why)))
  assert.ok(!actions.some((a) => a.action === 'delete' && a.path === '.claude/skills/foo'))
})

test('a project skill conflicting with a home skill is reported for resolution', (t) => {
  const root = tempDir(t), home = tempDir(t)
  skill(root, 'foo')
  put(path.join(home, '.agents/skills/foo/SKILL.md'), 'different rules')
  const actions = report([root], { home }).projects[0].actions
  assert.ok(actions.some((a) => a.action === 'edit' && a.path === '.agents/skills/foo' && /conflict/.test(a.why)))
  assert.ok(!actions.some((a) => a.action === 'delete'))
})

test('legacy mappings propose only safe renames and explain protected folders', (t) => {
  const root = tempDir(t), home = tempDir(t)
  const mappings = [
    ['.aether/lanes', '.aether/worktrees/lanes'],
    ['.aether/exams', '.aether/worktrees/exams'],
    ['.aether/seats', '.aether/work/seats'],
    ['.aether/delegates', '.aether/work/delegates'],
    ['.aether-tmp', '.aether/tmp'],
    ['.aether-exam', '.aether/exam'],
  ]
  for (const [from] of mappings) put(path.join(root, from, 'file'))
  let actions = report([root], { home }).projects[0].actions
  for (const [from, to] of mappings) assert.ok(actions.some((a) => a.action === 'move' && a.path === from && a.to === to))
  put(path.join(root, '.aether/worktrees/lanes/existing'))
  put(path.join(root, '.aether/exams/copy/.git'))
  put(path.join(root, '.aether/seats/.git'))
  fs.symlinkSync('elsewhere', path.join(root, '.aether/delegates/link'))
  fs.symlinkSync('missing', path.join(root, '.aether/tmp'))
  actions = report([root], { home }).projects[0].actions
  for (const [from, reason] of [
    ['.aether/lanes', /destination/],
    ['.aether/exams', /copy|\.git/],
    ['.aether/seats', /copy|\.git/],
    ['.aether/delegates', /copy/],
    ['.aether-tmp', /destination/],
  ]) {
    assert.ok(!actions.some((a) => a.action === 'move' && a.path === from))
    assert.ok(actions.some((a) => a.path === from && reason.test(a.why)))
  }
})

test('projects option handles empty folders and invalid paths', (t) => {
  const folder = tempDir(t), cwd = tempDir(t), home = tempDir(t)
  assert.deepEqual(tidyCommand(['--projects', folder], { cwd, home }).projects, [])
  put(path.join(folder, 'file'))
  fs.mkdirSync(path.join(folder, '.hidden'))
  assert.deepEqual(tidyCommand(['--projects', folder], { cwd, home }).projects, [])
  assert.equal(tidyCommand([], { cwd, home }).projects[0].path, cwd)
  for (const args of [['--projects'], ['--projects', path.join(folder, 'missing')], ['--projects', path.join(folder, 'file')]]) assert.throws(() => tidyCommand(args, { cwd, home }), { exitCode: 2 })
})

test('the tidy CLI reports no projects for an empty --projects folder and errors for invalid paths', (t) => {
  const folder = tempDir(t), cwd = tempDir(t), home = tempDir(t)
  const run = (...args) => spawnSync(process.execPath, [BIN, 'tidy', ...args], { cwd, encoding: 'utf8', env: { ...process.env, HOME: home } })
  const empty = run('--projects', folder)
  assert.equal(empty.status, 0, empty.stderr)
  assert.deepEqual(JSON.parse(empty.stdout).tidy.projects, [])
  assert.equal(run('--projects').status, 2)
  assert.equal(run('--projects', path.join(folder, 'missing')).status, 2)
})

test('a legacy folder containing a registered worktree requires startup migration', (t) => {
  const repo = makeRepo(t)
  const unit = path.join(repo.dir, '.aether', 'lanes', 'run', 'unit')
  repo.git('worktree', 'add', '-q', '--detach', unit)
  put(path.join(unit, 'unsaved.md'), 'unsaved work')
  const before = repo.git('worktree', 'list', '--porcelain')
  const actions = report([repo.dir], { home: tempDir(t) }).projects[0].actions
  const legacy = actions.filter((a) => a.path === path.join('.aether', 'lanes'))
  assert.equal(legacy.length, 1)
  assert.equal(legacy[0].action, 'edit')
  assert.match(legacy[0].why, /registered worktree.*startup migration/)
  assert.equal(repo.git('worktree', 'list', '--porcelain'), before)
  assert.equal(fs.readFileSync(path.join(unit, 'unsaved.md'), 'utf8'), 'unsaved work')
})

test('cross-project skills with different names are matched by content', (t) => {
  const a = tempDir(t), b = tempDir(t)
  skill(a, 'alpha')
  skill(b, 'beta')
  assert.deepEqual(report([a, b], { home: tempDir(t) }).crossDuplicates, [{ name: 'alpha=beta', projects: [a, b].sort() }])
})

test('a namesake conflict is never deleted through an overlapping hash match', (t) => {
  const root = tempDir(t)
  const home = tempDir(t)
  skill(root, 'foo')
  skill(root, 'alias')
  put(path.join(root, '.claude/skills/foo/SKILL.md'), 'edited rules')
  const actions = report([root], { home }).projects[0].actions
  assert.ok(actions.some((a) => a.action === 'edit' && /conflict/.test(a.why)))
  assert.ok(!actions.some((a) => a.action === 'delete' && /skills[/\\]foo$/.test(a.path)))
})

test('a canonical skill with a Claude fallback is not deleted as a hash duplicate', (t) => {
  const root = tempDir(t), home = tempDir(t)
  skill(root, 'alias')
  skill(root, 'foo')
  put(path.join(root, '.claude/skills/foo/SKILL.md'), fs.readFileSync(path.join(root, '.agents/skills/foo/SKILL.md')))
  const actions = report([root], { home }).projects[0].actions
  assert.ok(!actions.some((a) => a.action === 'delete' && a.path === '.agents/skills/foo'))
})
