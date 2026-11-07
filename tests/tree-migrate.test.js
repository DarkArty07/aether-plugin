'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, tempDir } = require('./helpers.js')
const { markSession } = require('../plugins/aether/lib/session.js')
const migrate = require('../plugins/aether/lib/tree-migrate.js')

const NOW = Date.now()
const hours = (n) => new Date(NOW - n * 3600 * 1000)

function fakeProc(root, procs) {
  for (const [pid, { comm, ppid, start }] of Object.entries(procs)) {
    const dir = path.join(root, pid)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comm'), `${comm}\n`)
    fs.writeFileSync(path.join(dir, 'stat'), [pid, `(${comm})`, 'S', ppid, ...Array(17).fill('0'), start, '0'].join(' ') + '\n')
  }
}
function quiet(root) {
  for (const entry of fs.readdirSync(root, { recursive: true })) {
    const full = path.join(root, entry)
    try { fs.utimesSync(full, hours(5), hours(5)) } catch { /* gone */ }
  }
  fs.utimesSync(root, hours(5), hours(5))
}

// A project with the old state: seats with an unsaved copy, a lane copy, the old exam and tmp folders.
function oldState(t) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 1: { comm: 'init', ppid: 0, start: 1 } })
  const aether = path.join(repo.dir, '.aether')
  fs.mkdirSync(path.join(aether, 'seats', 'judge-1'), { recursive: true })
  fs.writeFileSync(path.join(aether, 'seats', 'judge-1', 'pair.json'), '{}')
  repo.git('worktree', 'add', '-q', '--detach', path.join(aether, 'seats', 'judge-1', 'wt'))
  fs.writeFileSync(path.join(aether, 'seats', 'judge-1', 'wt', 'unsaved.md'), 'unsaved work')
  fs.mkdirSync(path.join(aether, 'lanes', '20261101-000000-abcd'), { recursive: true })
  repo.git('worktree', 'add', '-q', '--detach', path.join(aether, 'lanes', '20261101-000000-abcd', 'task-1-1-supervise'))
  fs.mkdirSync(path.join(aether, 'delegates', 'd1'), { recursive: true })
  fs.writeFileSync(path.join(aether, 'delegates', 'd1', 'brief.md'), 'brief')
  fs.mkdirSync(path.join(repo.dir, '.aether-exam'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether-exam', 'c1.test.js'), 'exam')
  fs.mkdirSync(path.join(repo.dir, '.aether-tmp', 'seats', 's1'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether-tmp', 'seats', 's1', 'message.md'), 'message')
  fs.mkdirSync(path.join(aether, 'autonomy'), { recursive: true })
  fs.writeFileSync(path.join(aether, 'autonomy', 'grants.json'), '{}')
  fs.writeFileSync(path.join(aether, 'aether.db'), 'old cli')
  quiet(aether)
  quiet(path.join(repo.dir, '.aether-exam'))
  quiet(path.join(repo.dir, '.aether-tmp'))
  const gate = (extra = {}) => migrate.migrationGate(repo.dir, { dataDir, now: NOW, procRoot: proc, ...extra })
  const tree = () => fs.readdirSync(repo.dir, { recursive: true }).filter((e) => !e.startsWith('.git' + path.sep) && e !== '.git').sort()
  return { repo, dataDir, proc, aether, gate, tree }
}

test('a mark of this repository with a live process defers the move, and the starting session does not count itself (R19 a)', (t) => {
  const w = oldState(t)
  fakeProc(w.proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  markSession(w.dataDir, 'other', NOW, { repo: w.repo.dir, claude: { pid: 100, start: 555 } })
  assert.deepEqual(w.gate(), { move: false, reasons: ['live-session'] })
  assert.deepEqual(w.gate({ selfSession: 'other' }), { move: true, reasons: [] })
  assert.deepEqual(w.gate({ selfSession: 'cleared-new-id', selfProcess: { pid: 100, start: 555 } }), { move: true, reasons: [] }, 'a /clear: the mark of the same claude process is not another session')
  markSession(w.dataDir, 'dead', NOW, { repo: w.repo.dir, claude: { pid: 999, start: 1 } })
  markSession(w.dataDir, 'elsewhere', NOW, { repo: '/another/repo', claude: { pid: 100, start: 555 } })
  assert.deepEqual(w.gate({ selfSession: 'other' }), { move: true, reasons: [] })
})

test('a mark of the old version without a repository, younger than 12 hours, defers the move; an older one does not (R19 b, A18)', (t) => {
  const w = oldState(t)
  markSession(w.dataDir, 'old-style', NOW)
  fs.utimesSync(path.join(w.dataDir, 'sessions', 'old-style.json'), hours(1), hours(1))
  assert.deepEqual(w.gate(), { move: false, reasons: ['old-mark'] })
  fs.utimesSync(path.join(w.dataDir, 'sessions', 'old-style.json'), hours(13), hours(13))
  assert.deepEqual(w.gate(), { move: true, reasons: [] })
})

test('a write under .aether/, .aether-tmp/ or .aether-exam/ in the last 2 hours defers the move; the README does not count (R19 c)', (t) => {
  const w = oldState(t)
  for (const target of [path.join(w.aether, 'runs', 'x', 'graph.json'), path.join(w.repo.dir, '.aether-tmp', 'seats', 's1', 'new.md'), path.join(w.repo.dir, '.aether-exam', 'new.test.js')]) {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'now')
    assert.deepEqual(w.gate(), { move: false, reasons: ['recent-writes'] }, target)
    for (const dir of [w.aether, path.join(w.repo.dir, '.aether-tmp'), path.join(w.repo.dir, '.aether-exam')]) quiet(dir)
  }
  fs.writeFileSync(path.join(w.aether, 'README.md'), 'map')
  assert.deepEqual(w.gate(), { move: true, reasons: [] })
})

test('while the gate says no, nothing on disk changes at all (R19)', (t) => {
  const w = oldState(t)
  markSession(w.dataDir, 'old-style', NOW)
  const before = w.tree()
  const gate = w.gate()
  assert.equal(gate.move, false)
  assert.deepEqual(migrate.migrate(w.repo.dir, { gate }), { moved: [], kept: [], deferred: ['old-mark'] })
  assert.deepEqual(w.tree(), before)
})

test('a later start, with no session active, moves the old folders, deletes nothing and keeps the copy with unsaved work registered (R19, H2 scenario 14)', (t) => {
  const w = oldState(t)
  const result = migrate.migrate(w.repo.dir, { gate: w.gate() })
  assert.deepEqual(result.kept, [])
  assert.ok(result.moved.length >= 1)
  const aether = w.aether
  assert.equal(fs.readFileSync(path.join(aether, 'work', 'seats', 'judge-1', 'wt', 'unsaved.md'), 'utf8'), 'unsaved work')
  assert.equal(fs.readFileSync(path.join(aether, 'work', 'seats', 'judge-1', 'pair.json'), 'utf8'), '{}')
  assert.equal(fs.readFileSync(path.join(aether, 'work', 'delegates', 'd1', 'brief.md'), 'utf8'), 'brief')
  assert.equal(fs.readFileSync(path.join(aether, 'exam', 'c1.test.js'), 'utf8'), 'exam')
  assert.equal(fs.readFileSync(path.join(aether, 'tmp', 'seats', 's1', 'message.md'), 'utf8'), 'message')
  const listed = w.repo.git('worktree', 'list', '--porcelain')
  assert.ok(listed.includes(path.join(aether, 'work', 'seats', 'judge-1', 'wt')))
  assert.ok(listed.includes(path.join(aether, 'worktrees', 'lanes', '20261101-000000-abcd', 'task-1-1-supervise')))
  assert.ok(!listed.includes(path.join(aether, 'seats')))
  for (const gone of ['seats', 'lanes', 'delegates']) assert.equal(fs.existsSync(path.join(aether, gone)), false, gone)
  assert.equal(fs.existsSync(path.join(w.repo.dir, '.aether-exam')), false)
  assert.equal(fs.readFileSync(path.join(aether, 'aether.db'), 'utf8'), 'old cli', 'the leftovers of the old CLI are not touched')
  assert.equal(fs.readFileSync(path.join(aether, 'autonomy', 'grants.json'), 'utf8'), '{}')
  assert.equal(w.repo.git('-C', path.join(aether, 'work', 'seats', 'judge-1', 'wt'), 'status', '--porcelain'), '?? unsaved.md')
})

test('what cannot be moved stays where it is and is reported: a locked copy and a file whose name the destination already has (R19)', (t) => {
  const w = oldState(t)
  w.repo.git('worktree', 'lock', path.join(w.aether, 'seats', 'judge-1', 'wt'))
  fs.mkdirSync(path.join(w.aether, 'work', 'delegates', 'd1'), { recursive: true })
  fs.writeFileSync(path.join(w.aether, 'work', 'delegates', 'd1', 'brief.md'), 'new place')
  quiet(path.join(w.aether, 'work')) // the gate counts every recent write under .aether/ (R19 c): age the new-place file first
  const result = migrate.migrate(w.repo.dir, { gate: w.gate() })
  assert.ok(result.kept.some((k) => k.from.endsWith(path.join('seats', 'judge-1', 'wt'))))
  assert.equal(fs.readFileSync(path.join(w.aether, 'seats', 'judge-1', 'wt', 'unsaved.md'), 'utf8'), 'unsaved work')
  assert.ok(result.kept.some((k) => k.from.endsWith(path.join('delegates', 'd1', 'brief.md'))))
  assert.equal(fs.readFileSync(path.join(w.aether, 'delegates', 'd1', 'brief.md'), 'utf8'), 'brief')
  assert.equal(fs.readFileSync(path.join(w.aether, 'work', 'delegates', 'd1', 'brief.md'), 'utf8'), 'new place')
})

test('a fresh write under .aether/worktrees/<run>/<task> defers the move too (R19 c)', (t) => {
  const w = oldState(t)
  const target = path.join(w.aether, 'worktrees', 'run1', 'task-1', 'x.txt')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, 'now')
  assert.deepEqual(w.gate(), { move: false, reasons: ['recent-writes'] })
})

test('with a live session, an old mark and a fresh write, the reasons come in that order (R19)', (t) => {
  const w = oldState(t)
  fakeProc(w.proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  markSession(w.dataDir, 'other', NOW, { repo: w.repo.dir, claude: { pid: 100, start: 555 } })
  markSession(w.dataDir, 'old-style', NOW)
  const target = path.join(w.aether, 'runs', 'x', 'graph.json')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, 'now')
  assert.deepEqual(w.gate(), { move: false, reasons: ['live-session', 'old-mark', 'recent-writes'] })
})

test('without dataDir the gate fails closed: it reports a live session and moves nothing (R19)', (t) => {
  const w = oldState(t)
  assert.deepEqual(migrate.migrationGate(w.repo.dir, { now: NOW, procRoot: w.proc }), { move: false, reasons: ['live-session'] })
})

test('a system error on a registered copy is kept and reported; the rest still moves and migrate does not throw (R19)', (t) => {
  const w = oldState(t)
  fs.mkdirSync(path.join(w.aether, 'work'), { recursive: true })
  fs.writeFileSync(path.join(w.aether, 'work', 'seats'), 'a file where the seats folder should go')
  quiet(w.aether)
  const result = migrate.migrate(w.repo.dir, { gate: w.gate() })
  const wt = path.join(w.aether, 'seats', 'judge-1', 'wt')
  assert.ok(result.kept.some((k) => k.from === wt && k.why), JSON.stringify(result.kept))
  assert.equal(fs.readFileSync(path.join(wt, 'unsaved.md'), 'utf8'), 'unsaved work')
  assert.ok(w.repo.git('worktree', 'list', '--porcelain').includes(wt))
  assert.ok(result.moved.some((m) => m.to === path.join(w.aether, 'work', 'delegates')))
  assert.equal(fs.readFileSync(path.join(w.aether, 'work', 'delegates', 'd1', 'brief.md'), 'utf8'), 'brief')
  assert.equal(fs.readFileSync(path.join(w.aether, 'exam', 'c1.test.js'), 'utf8'), 'exam')
})

test('when git cannot list the worktrees, a folder that holds a .git entry stays put and is reported (R19)', (t) => {
  const dataDir = tempDir(t, 'aether-data-')
  const root = tempDir(t, 'aether-plain-')
  const x = path.join(root, '.aether', 'seats', 'x')
  fs.mkdirSync(path.join(x, 'wt'), { recursive: true })
  fs.writeFileSync(path.join(x, 'wt', '.git'), 'gitdir: /nowhere\n')
  fs.writeFileSync(path.join(x, 'wt', 'unsaved.md'), 'unsaved work')
  fs.writeFileSync(path.join(x, 'pair.json'), '{}')
  quiet(path.join(root, '.aether'))
  const gate = migrate.migrationGate(root, { dataDir, now: NOW })
  assert.deepEqual(gate, { move: true, reasons: [] })
  const result = migrate.migrate(root, { gate })
  assert.deepEqual(result.kept, [{ from: path.join(x, 'wt'), why: 'worktree list unavailable' }])
  assert.equal(fs.readFileSync(path.join(x, 'wt', 'unsaved.md'), 'utf8'), 'unsaved work')
  assert.equal(fs.existsSync(path.join(root, '.aether', 'work', 'seats', 'x', 'wt')), false)
  assert.equal(fs.readFileSync(path.join(root, '.aether', 'work', 'seats', 'x', 'pair.json'), 'utf8'), '{}')
})

test('a folder with a .git entry that git does not list as a worktree stays put and is reported (R19)', (t) => {
  const w = oldState(t)
  const stray = path.join(w.aether, 'seats', 'stray')
  fs.mkdirSync(stray, { recursive: true })
  fs.writeFileSync(path.join(stray, '.git'), 'gitdir: /nowhere\n')
  fs.writeFileSync(path.join(stray, 'unsaved.md'), 'unsaved work')
  quiet(w.aether)
  const result = migrate.migrate(w.repo.dir, { gate: w.gate() })
  assert.deepEqual(result.kept, [{ from: stray, why: 'holds a .git entry but is not a registered worktree' }])
  assert.equal(fs.readFileSync(path.join(stray, 'unsaved.md'), 'utf8'), 'unsaved work')
  assert.equal(fs.existsSync(path.join(w.aether, 'work', 'seats', 'stray')), false)
})

test('a symbolic link in an old folder is kept and never followed (R19)', (t) => {
  const w = oldState(t)
  const outside = tempDir(t, 'aether-outside-')
  fs.writeFileSync(path.join(outside, 'precious.md'), 'keep me')
  const link = path.join(w.aether, 'delegates', 'link')
  fs.symlinkSync(outside, link)
  quiet(w.aether)
  fs.lutimesSync(link, hours(5), hours(5))
  const result = migrate.migrate(w.repo.dir, { gate: w.gate() })
  assert.deepEqual(result.kept, [{ from: link, why: 'symbolic link, not moved' }])
  assert.equal(fs.readlinkSync(link), outside)
  assert.equal(fs.readFileSync(path.join(outside, 'precious.md'), 'utf8'), 'keep me')
  assert.equal(fs.readFileSync(path.join(w.aether, 'work', 'delegates', 'd1', 'brief.md'), 'utf8'), 'brief')
})

test('a repository reached through a symbolic link still matches its registered copies (R19)', (t) => {
  const w = oldState(t)
  const alias = path.join(tempDir(t, 'aether-alias-'), 'repo')
  fs.symlinkSync(w.repo.dir, alias)
  const result = migrate.migrate(alias, { gate: migrate.migrationGate(alias, { dataDir: w.dataDir, now: NOW, procRoot: w.proc }) })
  assert.deepEqual(result.kept, [])
  const seat = path.join(w.repo.dir, '.aether', 'work', 'seats', 'judge-1', 'wt')
  assert.equal(fs.readFileSync(path.join(seat, 'unsaved.md'), 'utf8'), 'unsaved work')
  assert.ok(w.repo.git('worktree', 'list', '--porcelain').includes(seat))
})

test('the copies that already sit in .aether/worktrees/<run>/<task> are not moved (R19)', (t) => {
  const w = oldState(t)
  const unit = path.join(w.aether, 'worktrees', 'run1', 'task-1')
  w.repo.git('worktree', 'add', '-q', '--detach', unit)
  fs.writeFileSync(path.join(unit, 'work.md'), 'unit work')
  quiet(w.aether)
  const result = migrate.migrate(w.repo.dir, { gate: w.gate() })
  assert.deepEqual(result.kept, [])
  assert.equal(fs.readFileSync(path.join(unit, 'work.md'), 'utf8'), 'unit work')
  assert.ok(w.repo.git('worktree', 'list', '--porcelain').includes(unit))
  assert.ok(result.moved.every((m) => !m.from.includes(path.join('worktrees', 'run1'))))
})

test('plain rename safety protects registered descendants, copies, links and destinations', (t) => {
  const root = tempDir(t)
  const src = path.join(root, 'legacy')
  const dst = path.join(root, 'new')
  fs.mkdirSync(src)
  assert.equal(migrate.renameSafety(src, dst, new Set()), null)
  assert.match(migrate.renameSafety(src, dst, new Set([path.join(src, 'nested')])), /registered worktree/)
  assert.match(migrate.renameSafety(src, dst, new Set([src])), /registered worktree/)
  fs.writeFileSync(path.join(src, '.git'), 'gitdir: missing')
  assert.match(migrate.renameSafety(src, dst, null), /possible copy|\.git/)
  fs.unlinkSync(path.join(src, '.git'))
  fs.symlinkSync(root, path.join(src, 'link'))
  assert.match(migrate.renameSafety(src, dst, new Set()), /possible copy/)
  fs.mkdirSync(dst)
  assert.match(migrate.renameSafety(src, dst, new Set()), /destination already exists/)
})

test('a dangling destination link blocks a plain rename', (t) => {
  const root = tempDir(t)
  const src = path.join(root, 'legacy')
  const dst = path.join(root, 'new')
  fs.mkdirSync(src)
  fs.symlinkSync('missing', dst)
  assert.match(migrate.renameSafety(src, dst, new Set()), /destination already exists/)
})

test('a safety check that cannot inspect the source fails closed', (t) => {
  const root = tempDir(t)
  assert.throws(() => migrate.renameSafety(path.join(root, 'missing'), path.join(root, 'new'), new Set()), { code: 'ENOENT' })
})
