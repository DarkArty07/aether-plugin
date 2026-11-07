'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const store = require('../plugins/aether/lib/continuity-store.js')
const { markSession } = require('../plugins/aether/lib/session.js')
const { notice } = require('../plugins/aether/lib/continuity-notice.js')

const EN = { LANG: 'en_US.UTF-8' }
const NOW = Date.parse('2026-11-07T12:00:00Z')

function fakeProc(root, procs) {
  for (const [pid, { comm, ppid, start }] of Object.entries(procs)) {
    const dir = path.join(root, pid)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comm'), `${comm}\n`)
    fs.writeFileSync(path.join(dir, 'stat'), [pid, `(${comm})`, 'S', ppid, ...Array(17).fill('0'), start, '0'].join(' ') + '\n')
  }
}

function world(t) {
  const repo = makeRepo(t)
  const dataDir = tempDir(t, 'aether-data-')
  const dir = path.join(tempDir(t, 'aether-mem-'), 'continuity')
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 1: { comm: 'init', ppid: 0, start: 1 } })
  const base = repo.git('rev-parse', 'HEAD')
  const run = (extra = {}) => notice({ cwd: repo.dir, session: 'now-session', source: 'startup', dataDir, dir, env: EN, now: NOW, procRoot: proc, ...extra })
  const put = (note) => store.writeNote(dir, { session: 'prev-session', branch: 'feature/x', commit: base, updatedAt: NOW - 3600000, lastMessage: 'I am about to run the migration', process: { pid: 100, start: 555 }, closed: null, cut: null, ...note })
  return { repo, dataDir, dir, proc, base, run, put }
}

test('with no earlier note the notice is one line that says so, in English and in Spanish; an unreadable note is skipped (R7)', (t) => {
  const w = world(t)
  assert.deepEqual(w.run().lines, ['No earlier session in this project.'])
  assert.deepEqual(w.run({ env: { LANG: 'es_MX.UTF-8' } }).lines, ['No hay una sesión anterior en este proyecto.'])
  fs.mkdirSync(w.dir, { recursive: true })
  fs.writeFileSync(path.join(w.dir, 'bad.json'), '{')
  assert.deepEqual(w.run().lines, ['No earlier session in this project.'])
})

test('a session that was cut off says where it stopped, what changed in git and how to resume it, in 3 to 5 lines (C2, H1 scenario 1)', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, 'a.txt'), 'a')
  w.repo.git('add', 'a.txt')
  w.repo.git('commit', '-q', '-m', 'a')
  w.put({ cut: { at: NOW - 3000000, reason: 'rate_limit' } })
  const { lines } = w.run()
  assert.ok(lines.length >= 3 && lines.length <= 5, lines.join('\n'))
  assert.ok(lines[0].includes('prev-ses') && lines[0].includes('feature/x') && lines[0].includes('I am about to run the migration'), lines[0])
  assert.ok(lines[1].startsWith('Since then: 1 commit and 1 file changed on feature/x'), lines[1])
  assert.ok(lines[2].includes('cut off (rate_limit)') && lines[2].includes('claude --resume prev-session'), lines[2])
})

test('a session that closed says so and gives no resume command; one still alive is named active; without /proc nothing is claimed (R6, H1 scenario 2)', (t) => {
  const w = world(t)
  w.put({ closed: { at: NOW - 1000, reason: 'prompt_input_exit' } })
  let text = w.run().lines.join('\n')
  assert.ok(text.includes('ended normally') && !text.includes('--resume') && !text.includes('cut off'))
  w.put({ closed: null })
  fakeProc(w.proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  text = w.run().lines.join('\n')
  assert.ok(text.includes('still active') && !text.includes('--resume'))
  text = w.run({ procRoot: path.join(w.proc, 'missing') }).lines.join('\n')
  assert.ok(text.includes('cannot tell') && !text.includes('--resume'))
})

test('a moved branch, an unmerged branch and a delegate without a result are named (C2, H1 scenario 1)', (t) => {
  const w = world(t)
  w.repo.git('switch', '-q', '-c', 'unmerged-work')
  fs.writeFileSync(path.join(w.repo.dir, 'u.txt'), 'u')
  w.repo.git('add', 'u.txt')
  w.repo.git('commit', '-q', '-m', 'u')
  w.repo.git('switch', '-q', 'main')
  w.put({ branch: 'feature/x' })
  fs.mkdirSync(path.join(w.dataDir, 'delegates'), { recursive: true })
  const log = [
    { kind: 'launch', session: 'prev-session', task: 't1', attempt: 1 },
    { kind: 'launch', session: 'prev-session', task: 't2', attempt: 1 },
    { kind: 'result', session: 'prev-session', task: 't2', attempt: 1 },
  ].map((e) => JSON.stringify(e)).join('\n')
  fs.writeFileSync(path.join(w.dataDir, 'delegates', 'log.jsonl'), `${log}\nnot json\n`)
  const { lines } = w.run()
  assert.ok(lines.length <= 5)
  assert.ok(lines[1].includes('The branch moved from feature/x to main'), lines[1])
  const work = lines.find((l) => l.startsWith('Unmerged work:'))
  assert.ok(work.includes('unmerged-work') && work.includes('Delegates without a result: t1') && !work.includes('t2'), work)
})

test('the other active sessions of the repository are named, from their marks, and the notice never passes 5 lines of 300 characters (C2, H1 scenario 5, R7)', (t) => {
  const w = world(t)
  fakeProc(w.proc, { 200: { comm: 'claude', ppid: 1, start: 20 }, 201: { comm: 'claude', ppid: 1, start: 21 } })
  markSession(w.dataDir, 'other-one', NOW, { repo: w.repo.dir, claude: { pid: 200, start: 20 } })
  markSession(w.dataDir, 'other-two', NOW, { repo: w.repo.dir, claude: { pid: 201, start: 21 } })
  markSession(w.dataDir, 'now-session', NOW, { repo: w.repo.dir, claude: null })
  w.put({ lastMessage: 'x'.repeat(900), cut: { at: NOW, reason: 'overloaded' } })
  const { lines } = w.run()
  const others = lines.find((l) => l.startsWith('Other sessions active:'))
  assert.ok(others.includes('other-on') && others.includes('other-tw') && !others.includes('now-ses'), others)
  assert.ok(lines.length <= 5 && lines.every((l) => l.length <= 300), lines.map((l) => l.length).join(','))
  assert.ok(lines[0].includes('…'))
})

test('after a /clear the previous session of the same claude process is not called active or cut, and is not listed as another active session (R6)', (t) => {
  const w = world(t)
  fakeProc(w.proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  markSession(w.dataDir, 'prev-session', NOW, { repo: w.repo.dir, claude: { pid: 100, start: 555 } })
  w.put({})
  const { lines } = w.run({ selfProcess: { pid: 100, start: 555 } })
  const text = lines.join('\n')
  assert.ok(text.includes('ended in this same window') && !text.includes('--resume') && !text.includes('still active') && !text.includes('Other sessions active'), text)
})

test('a compact adds no notice (A11)', (t) => {
  const w = world(t)
  w.put({})
  assert.deepEqual(w.run({ source: 'compact' }).lines, [])
})
