'use strict'
process.env.GIT_OPTIONAL_LOCKS = '0'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, tempDir } = require('./helpers.js')
const { report, projectsIn } = require('../plugins/aether/lib/tidy-report.js')

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
  put(path.join(a, 'AGENTS.md'), lines(161))
  put(path.join(a, 'CLAUDE.md'), lines(74))
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
