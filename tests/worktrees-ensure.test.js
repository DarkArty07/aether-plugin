'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, diffPackage, finalPackage, merge } = require('../plugins/aether/lib/worktrees.js')

test('ensure creates the unit worktree and branch from the integration branch', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const r = ensure(repo.dir, args.runId, 'task-1')
  assert.equal(r.created, true)
  assert.equal(r.branch, `aether/${args.runId}/task-1`)
  assert.equal(r.path, path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-1'))
  assert.equal(repo.git('-C', r.path, 'branch', '--show-current'), r.branch)
  assert.equal(repo.git('rev-parse', r.branch), repo.git('rev-parse', 'feature/x'))
  assert.ok(fs.existsSync(path.join(r.path, '.aether-tmp')))
  assert.match(fs.readFileSync(path.join(repo.dir, '.git', 'info', 'exclude'), 'utf8'), /^\/\.aether-tmp\/$/m)
  assert.equal(repo.git('-C', r.path, 'status', '--porcelain'), '')
  assert.deepEqual(ensure(repo.dir, args.runId, 'task-1'), { ...r, created: false })
})

test('ensure recreates a worktree whose directory was deleted by hand', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const first = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, first.path, 'src/t1/kept.txt', 'x\n', 'unit work')
  fs.rmSync(first.path, { recursive: true, force: true })
  const again = ensure(repo.dir, args.runId, 'task-1')
  assert.equal(again.created, true)
  assert.equal(fs.readFileSync(path.join(again.path, 'src', 't1', 'kept.txt'), 'utf8'), 'x\n')
})

test('ensure replaces a leftover directory that is not a worktree', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const leftover = path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-2')
  fs.mkdirSync(leftover, { recursive: true })
  fs.writeFileSync(path.join(leftover, 'junk.txt'), 'x')
  const r = ensure(repo.dir, args.runId, 'task-2')
  assert.equal(r.created, true)
  assert.equal(fs.existsSync(path.join(leftover, 'junk.txt')), false)
  assert.equal(repo.git('-C', leftover, 'branch', '--show-current'), r.branch)
})

test('ensure refuses to delete a directory that has a .git entry git does not list', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const odd = path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-2')
  fs.mkdirSync(odd, { recursive: true })
  fs.writeFileSync(path.join(odd, '.git'), 'gitdir: /nonexistent\n')
  fs.writeFileSync(path.join(odd, 'work.txt'), 'keep me\n')
  assert.throws(() => ensure(repo.dir, args.runId, 'task-2'), /refusing to remove/)
  assert.equal(fs.readFileSync(path.join(odd, 'work.txt'), 'utf8'), 'keep me\n')
})

test('ensure refuses tasks outside the run and invalid ids', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  assert.throws(() => ensure(repo.dir, args.runId, 'task-9'), /task-9 is not in run/)
  assert.throws(() => ensure(repo.dir, args.runId, '../x'), /invalid task id/)
  assert.throws(() => ensure(repo.dir, '20990101-000000-ffff', 'task-1'), /has no graph.json/)
})

test('diffPackage writes the unit diff against its base', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'module.exports = 1\n', 'add a')
  const pkg = diffPackage(repo.dir, args.runId, 'task-1')
  assert.equal(pkg.path, path.join(args.runDir, 'packages', 'task-1.diff'))
  assert.equal(pkg.base, repo.git('rev-parse', 'feature/x'))
  const text = fs.readFileSync(pkg.path, 'utf8')
  assert.match(text, /## Commits\n[0-9a-f]+ add a/)
  assert.match(text, /\+module\.exports = 1/)
})

test('finalPackage writes the integration diff from the base recorded at compile time', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'module.exports = 1\n', 'add a')
  assert.equal(merge(repo.dir, args.runId, 'task-1').merged, true)
  const pkg = finalPackage(repo.dir, args.runId)
  assert.deepEqual(pkg, {
    path: path.join(args.runDir, 'packages', 'final.diff'),
    base: args.integration.base,
    head: repo.git('rev-parse', 'feature/x'),
  })
  const text = fs.readFileSync(pkg.path, 'utf8')
  assert.match(text, /^# Review package: run \S+ \(feature\/x\)\n/)
  assert.match(text, /## Commits\n[0-9a-f]+ Merge aether\/\S+\/task-1\n[0-9a-f]+ add a/)
  assert.match(text, /\+module\.exports = 1/)
})

test('the package flags the added lines that suggest unfinished work, by file and line', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.test.js', "test.only('adds', () => {})\n// TODO wire it\nconst x = 1\n", 'add tests')
  const text = fs.readFileSync(diffPackage(repo.dir, args.runId, 'task-1').path, 'utf8')
  assert.equal(
    text.slice(text.indexOf('## Flags'), text.indexOf('## Diff')),
    "## Flags\n- src/t1/a.test.js:1: test.only('adds', () => {})\n- src/t1/a.test.js:2: // TODO wire it\n\n",
  )
  assert.ok(text.indexOf('## Stat') < text.indexOf('## Flags'))
})

test('a unit with no unfinished work has no Flags section', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'module.exports = 1\n', 'add a')
  const text = fs.readFileSync(diffPackage(repo.dir, args.runId, 'task-1').path, 'utf8')
  assert.doesNotMatch(text, /^## Flags$/m)
})

test('a lowercase todo is prose, not a flag, and a stub that raises NotImplemented is flagged', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.py', '# lee todo el archivo\ndef f():\n    raise NotImplementedError\n', 'add a')
  const text = fs.readFileSync(diffPackage(repo.dir, args.runId, 'task-1').path, 'utf8')
  assert.equal(text.slice(text.indexOf('## Flags'), text.indexOf('## Diff')), '## Flags\n- src/t1/a.py:3: raise NotImplementedError\n\n')
})

test('the Flags section lists at most 50 lines and cuts each line to 160 characters', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  const lines = [`// TODO ${'x'.repeat(300)}`, ...Array.from({ length: 51 }, (_, i) => `// TODO ${i + 1}`)]
  commitIn(repo, unit.path, 'src/t1/many.js', lines.join('\n') + '\n', 'add many')
  const text = fs.readFileSync(diffPackage(repo.dir, args.runId, 'task-1').path, 'utf8')
  const section = text.slice(text.indexOf('## Flags'), text.indexOf('## Diff')).split('\n')
  const entries = section.filter((line) => line.startsWith('- src/'))
  assert.equal(entries.length, 50)
  assert.equal(entries[0], `- src/t1/many.js:1: // TODO ${'x'.repeat(152)}`)
  assert.equal(entries[1], '- src/t1/many.js:2: // TODO 1')
  assert.ok(section.includes('- ... and 2 more'))
})

test('finalPackage covers the run from its first launch, not only from the last relaunch', (t) => {
  const repo = makeRepo(t)
  const first = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, first.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'module.exports = 1\n', 'add a')
  assert.equal(merge(repo.dir, first.runId, 'task-1').merged, true)
  commitIn(repo, repo.dir, 'src/t2/by-hand.js', 'by hand\n', 'integrated by hand')
  const relaunch = compile(repo, plan([task(1), task(2)]), ['--run', first.runId])
  assert.equal(relaunch.integration.base, repo.git('rev-parse', 'HEAD'))
  const pkg = finalPackage(repo.dir, first.runId)
  assert.equal(pkg.base, first.integration.base)
  const text = fs.readFileSync(pkg.path, 'utf8')
  assert.match(text, new RegExp(`^Base: ${first.integration.base}$`, 'm'))
  assert.match(text, /## Commits\n[0-9a-f]+ integrated by hand\n[0-9a-f]+ Merge aether\/\S+\/task-1\n[0-9a-f]+ add a/)
  assert.match(text, /\+module\.exports = 1/)
})

test('Aether hides only its own folders at the root, not a project folder of the same name', (t) => {
  const repo = makeRepo(t)
  compile(repo, plan([task(1), task(2)]))
  fs.mkdirSync(path.join(repo.dir, 'docs', '.aether'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, 'docs', '.aether', 'notes.md'), 'x')
  const status = repo.git('status', '--porcelain', '--untracked-files=all')
  assert.match(status, /docs\/\.aether\/notes\.md/)
  assert.doesNotMatch(status, /^\?\? \.aether\//m)
})
