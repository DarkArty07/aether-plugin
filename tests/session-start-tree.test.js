'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, tempDir, makeRepo } = require('./helpers.js')
const { main } = require('../plugins/aether/lib/session-start.js')
const { markSession, readMark } = require('../plugins/aether/lib/session.js')

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
function quiet(dir) {
  for (const entry of fs.readdirSync(dir, { recursive: true })) try { fs.utimesSync(path.join(dir, entry), hours(5), hours(5)) } catch { /* gone */ }
  fs.utimesSync(dir, hours(5), hours(5))
}
function world(t) {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const configDir = tempDir(t, 'aether-config-')
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 1: { comm: 'init', ppid: 0, start: 1 }, 300: { comm: 'claude', ppid: 1, start: 4242 }, 301: { comm: 'node', ppid: 300, start: 4243 } })
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data, CLAUDE_CONFIG_DIR: configDir, LANG: 'en_US.UTF-8' }
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'CLAUDE_ENV_FILE']) delete env[key]
  fs.mkdirSync(path.join(repo.dir, '.aether', 'seats', 'judge-1'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'seats', 'judge-1', 'pair.json'), '{}')
  fs.mkdirSync(path.join(repo.dir, '.aether-tmp'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether-tmp', 'old.md'), 'x')
  quiet(path.join(repo.dir, '.aether'))
  quiet(path.join(repo.dir, '.aether-tmp'))
  const start = (session, source = 'startup', extra = {}) => {
    let out = ''
    main({ input: { hook_event_name: 'SessionStart', session_id: session, source, agent_type: 'aether:lead' }, env, cwd: repo.dir, procRoot: proc, from: 301, stdout: { write: (s) => { out += s } }, ...extra })
    return out === '' ? null : JSON.parse(out)
  }
  return { repo, data, proc, env, start }
}

test('a quiet project: the decision comes before the starting session writes anything, so the old state moves, and the README and the mark follow (R19, C6)', (t) => {
  const w = world(t)
  const out = w.start('s1')
  const aether = path.join(w.repo.dir, '.aether')
  assert.ok(out.hookSpecificOutput.additionalContext.includes('moved the old state of .aether/'))
  assert.equal(fs.existsSync(path.join(aether, 'seats')), false)
  assert.equal(fs.readFileSync(path.join(aether, 'work', 'seats', 'judge-1', 'pair.json'), 'utf8'), '{}')
  assert.equal(fs.existsSync(path.join(w.repo.dir, '.aether-tmp')), false)
  assert.ok(fs.readFileSync(path.join(aether, 'README.md'), 'utf8').includes('`work/seats/`'))
  assert.deepEqual(readMark(w.data, 's1').claude, { pid: 300, start: 4242 })
  assert.equal(readMark(w.data, 's1').repo, w.repo.dir)
})

test('the starting session does not count its own mark as a live session, and a /clear (a new session id in the same claude process) does not count the mark of the one it cleared (R19)', (t) => {
  const w = world(t)
  w.start('s1')
  fs.mkdirSync(path.join(w.repo.dir, '.aether', 'delegates', 'd9'), { recursive: true })
  fs.writeFileSync(path.join(w.repo.dir, '.aether', 'delegates', 'd9', 'brief.md'), 'b')
  quiet(path.join(w.repo.dir, '.aether'))
  const again = w.start('s2', 'clear')
  assert.ok(again.hookSpecificOutput.additionalContext.includes('moved the old state'))
  assert.equal(fs.readFileSync(path.join(w.repo.dir, '.aether', 'work', 'delegates', 'd9', 'brief.md'), 'utf8'), 'b')
  assert.deepEqual(readMark(w.data, 's1').claude, readMark(w.data, 's2').claude, 'both marks name the same claude process')
})

test('another session of the repository with a live process defers the move and says so; the README is still written (R19 a)', (t) => {
  const w = world(t)
  fakeProc(w.proc, { 100: { comm: 'claude', ppid: 1, start: 555 } })
  markSession(w.data, 'other', NOW, { repo: w.repo.dir, claude: { pid: 100, start: 555 } })
  const out = w.start('s2')
  assert.ok(out.hookSpecificOutput.additionalContext.includes('left the old state of .aether/ where it is for now: live-session'))
  assert.equal(fs.existsSync(path.join(w.repo.dir, '.aether', 'seats', 'judge-1', 'pair.json')), true)
  assert.equal(fs.existsSync(path.join(w.repo.dir, '.aether', 'README.md')), true)
})

test('recent activity defers the move and says so; with nothing old to move there is no note (R19 c)', (t) => {
  const w = world(t)
  fs.writeFileSync(path.join(w.repo.dir, '.aether', 'seats', 'judge-1', 'pair.json'), 'written just now')
  assert.ok(w.start('s3').hookSpecificOutput.additionalContext.includes('recent-writes'))
  const clean = world(t)
  fs.rmSync(path.join(clean.repo.dir, '.aether'), { recursive: true })
  fs.rmSync(path.join(clean.repo.dir, '.aether-tmp'), { recursive: true })
  const ctx = clean.start('s4').hookSpecificOutput.additionalContext
  assert.ok(!ctx.includes('old state of .aether/'))
})

test('the cleanup runs once per project and removes old temporary files after the move (R17, R18)', (t) => {
  const w = world(t)
  fs.mkdirSync(path.join(w.repo.dir, '.aether', 'tmp'), { recursive: true })
  const stale = path.join(w.repo.dir, '.aether', 'tmp', 'stale.md')
  fs.writeFileSync(stale, 'x')
  fs.utimesSync(stale, hours(48), hours(48))
  fs.utimesSync(path.join(w.repo.dir, '.aether', 'tmp'), hours(5), hours(5))
  const out = w.start('s5')
  assert.equal(fs.existsSync(stale), false)
  assert.ok(out.hookSpecificOutput.additionalContext.includes('cleaned'))
  assert.ok(fs.readdirSync(path.join(w.data, 'sweep')).length >= 1)
})

test('outside git nothing of this runs and the start does not fail', (t) => {
  const dir = tempDir(t)
  const data = tempDir(t, 'aether-data-')
  let out = ''
  main({ input: { hook_event_name: 'SessionStart', session_id: 's9', source: 'startup', agent_type: 'aether:lead' }, env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }, cwd: dir, stdout: { write: (s) => { out += s } } })
  assert.ok(JSON.parse(out).hookSpecificOutput.additionalContext.startsWith('Aether mode is active.'))
  assert.equal(fs.existsSync(path.join(dir, '.aether')), false)
})
