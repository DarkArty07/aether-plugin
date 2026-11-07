'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')

const encode = (p) => p.replace(/[^A-Za-z0-9]/g, '-')

// A fake /proc: one directory per process with comm and stat (the start time is field 22).
function fakeProc(root, procs) {
  for (const [pid, { comm, ppid, start }] of Object.entries(procs)) {
    const dir = path.join(root, pid)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comm'), `${comm}\n`)
    fs.writeFileSync(path.join(dir, 'stat'), [pid, `(${comm})`, 'S', ppid, ...Array(17).fill('0'), start, '0'].join(' ') + '\n')
  }
}

test('isSpanish reads LC_ALL, then LC_MESSAGES, then LANG', () => {
  assert.equal(store.isSpanish({ LANG: 'es_MX.UTF-8' }), true)
  assert.equal(store.isSpanish({ LC_ALL: 'en_US.UTF-8', LANG: 'es_MX.UTF-8' }), false)
  assert.equal(store.isSpanish({ LC_ALL: '', LANG: 'ES_ES' }), true)
  assert.equal(store.isSpanish({}), false)
})

test('memoryDir follows autoMemoryDirectory, then the project name variable, then the derived name; a worktree shares the main checkout memory (A15, R1)', (t) => {
  const repo = makeRepo(t)
  const configDir = tempDir(t, 'aether-config-')
  const home = tempDir(t, 'aether-home-')
  const env = { CLAUDE_CONFIG_DIR: configDir }
  const derived = path.join(configDir, 'projects', encode(repo.dir), 'memory')
  assert.equal(store.memoryDir({ cwd: repo.dir, env, home }), derived)
  const copy = path.join(tempDir(t, 'aether-copy-'), 'wt')
  repo.git('worktree', 'add', '-q', copy, '-b', 'other')
  assert.equal(store.memoryDir({ cwd: copy, env, home }), derived)
  assert.equal(store.memoryDir({ cwd: repo.dir, env: { ...env, CLAUDE_CODE_PROJECT_DIR_NAME: 'named' }, home }), path.join(configDir, 'projects', 'named', 'memory'))
  fs.writeFileSync(path.join(configDir, 'settings.json'), JSON.stringify({ autoMemoryDirectory: '~/mem' }))
  assert.equal(store.memoryDir({ cwd: repo.dir, env: { ...env, CLAUDE_CODE_PROJECT_DIR_NAME: 'named' }, home }), path.join(home, 'mem'))
  fs.writeFileSync(path.join(configDir, 'settings.json'), JSON.stringify({ autoMemoryDirectory: '/abs/mem' }))
  assert.equal(store.memoryDir({ cwd: repo.dir, env, home }), '/abs/mem')
  assert.equal(store.continuityDir({ cwd: repo.dir, env, home }), path.join('/abs/mem', 'continuity'))
})

test('memoryDir outside git names the folder after the working directory', (t) => {
  const dir = tempDir(t)
  const configDir = tempDir(t, 'aether-config-')
  assert.equal(store.memoryDir({ cwd: dir, env: { CLAUDE_CONFIG_DIR: configDir }, home: configDir }), path.join(configDir, 'projects', encode(dir), 'memory'))
})

test('claudeProcess climbs the parents of the hook to the claude process; it is null without claude or without /proc (D2)', (t) => {
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, {
    300: { comm: 'node', ppid: 200, start: 9100 },
    200: { comm: 'bash', ppid: 100, start: 9000 },
    100: { comm: 'claude', ppid: 1, start: 555 },
    1: { comm: 'init', ppid: 0, start: 1 },
  })
  assert.deepEqual(store.claudeProcess({ procRoot: proc, from: 300 }), { pid: 100, start: 555 })
  assert.equal(store.claudeProcess({ procRoot: proc, from: 1 }), null)
  assert.equal(store.claudeProcess({ procRoot: path.join(proc, 'missing'), from: 300 }), null)
  fakeProc(proc, { 400: { comm: 'node', ppid: 401, start: 1 }, 401: { comm: 'node', ppid: 400, start: 2 } })
  assert.equal(store.claudeProcess({ procRoot: proc, from: 400 }), null, 'a cycle ends the climb')
})

test('processState: alive, gone, or unknown; a reused pid with another start time is gone (R6)', (t) => {
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  assert.equal(store.processState({ pid: 100, start: 555 }, { procRoot: proc }), 'alive')
  assert.equal(store.processState({ pid: 100, start: 556 }, { procRoot: proc }), 'gone')
  assert.equal(store.processState({ pid: 101, start: 1 }, { procRoot: proc }), 'gone')
  assert.equal(store.processState(null, { procRoot: proc }), 'unknown')
  assert.equal(store.processState({ pid: 100, start: 555 }, { procRoot: path.join(proc, 'nope') }), 'unknown')
})

test('writeNote, readNote, updateNote and readNotes keep one JSON file per session, clip long text and skip what cannot be read (R1)', (t) => {
  const dir = path.join(tempDir(t), 'continuity')
  const file = store.writeNote(dir, { session: 's1', updatedAt: 10, lastMessage: 'x'.repeat(5000), compactSummary: 'y'.repeat(9000), branch: 'main' })
  assert.equal(file, path.join(dir, 's1.json'))
  const note = store.readNote(dir, 's1')
  assert.equal(note.version, store.NOTE_VERSION)
  assert.equal(note.lastMessage.length, store.MAX_MESSAGE)
  assert.ok(note.lastMessage.endsWith('…'))
  assert.equal(note.compactSummary.length, store.MAX_SUMMARY)
  const merged = store.updateNote(dir, 's1', { branch: 'feat', updatedAt: 20 })
  assert.deepEqual([merged.branch, merged.updatedAt, merged.session], ['feat', 20, 's1'])
  assert.equal(store.updateNote(dir, 'nobody', { branch: 'x' }), null)
  store.writeNote(dir, { session: 's2', updatedAt: 30 })
  fs.writeFileSync(path.join(dir, 'bad.json'), '{')
  fs.writeFileSync(path.join(dir, 's3.json'), JSON.stringify({ version: 2, session: 's3', updatedAt: 99 }))
  assert.deepEqual(store.readNotes(dir).map((n) => n.session), ['s2', 's1'])
  assert.equal(store.readNote(dir, 's3'), null)
  assert.equal(store.readNote(dir, 'bad'), null)
  assert.deepEqual(store.readNotes(path.join(dir, 'missing')), [])
  for (const bad of ['', '../x', 'a/b', 'a\\b', null, 42]) assert.throws(() => store.noteFile(dir, bad), /invalid session id/, String(bad))
})

test('pruneNotes deletes notes of more than 30 days and of merged work with a newer note, and never the newest note (R8, A12)', (t) => {
  const repo = makeRepo(t)
  const base = repo.git('rev-parse', 'HEAD')
  repo.git('switch', '-q', '-c', 'work')
  fs.writeFileSync(path.join(repo.dir, 'w.txt'), 'w')
  repo.git('add', 'w.txt')
  repo.git('commit', '-q', '-m', 'work')
  const unmerged = repo.git('rev-parse', 'HEAD')
  const dir = path.join(tempDir(t), 'continuity')
  const now = Date.parse('2026-11-07T12:00:00Z')
  const day = 86400000
  const put = (session, commit, age) => store.writeNote(dir, { session, commit, branch: 'x', updatedAt: now - age * day })
  put('old', unmerged, 31)
  put('merged', base, 2)
  put('open', unmerged, 1)
  put('newest', base, 0)
  assert.deepEqual(store.pruneNotes(dir, { cwd: repo.dir, now }).sort(), ['merged', 'old'])
  assert.deepEqual(store.readNotes(dir).map((n) => n.session), ['newest', 'open'])
  const alone = path.join(tempDir(t), 'continuity')
  store.writeNote(alone, { session: 'only', commit: base, updatedAt: now - 40 * day })
  assert.deepEqual(store.pruneNotes(alone, { cwd: repo.dir, now }), [], 'the only note of the project stays')
  assert.deepEqual(store.pruneNotes(path.join(alone, 'missing'), { cwd: repo.dir, now }), [])
})
