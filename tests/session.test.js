'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { LEAD_AGENT, markerFile, markSession, isAetherSession, opsOffFile, pruneSessions, delegateFile, parseDeadlines, touchSession, readMark, repoSessions, oldStyleMarks, OLD_MARK_MS } = require('../plugins/aether/lib/session.js')

test('the Lead agent is aether:lead', () => {
  assert.equal(LEAD_AGENT, 'aether:lead')
})

test('markerFile is <data>/sessions/<id>.json, and refuses an id that could leave that directory', (t) => {
  const data = tempDir(t)
  const id = '6dd2c6ca-aa04-4bf0-8c52-d2ccb5494905'
  assert.equal(markerFile(data, id), path.join(data, 'sessions', `${id}.json`))
  for (const bad of ['', '../x', 'a/b', 'a\\b', '.', 'x.json', ' s1', null, undefined, 42]) {
    assert.throws(() => markerFile(data, bad), /invalid session id/, String(bad))
  }
})

test('markSession writes the marker, creating its directory, and isAetherSession finds it', (t) => {
  const data = path.join(tempDir(t), 'not yet')
  assert.equal(isAetherSession(data, 's1'), false)
  markSession(data, 's1', 1234)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, 'sessions', 's1.json'), 'utf8')), { session: 's1', startedAt: 1234 })
  assert.equal(isAetherSession(data, 's1'), true)
  assert.equal(isAetherSession(data, 's2'), false)
})

test('isAetherSession is false for an invalid or missing id, and never throws', (t) => {
  const data = tempDir(t)
  markSession(data, 's1')
  for (const bad of ['', '../sessions/s1', 'a/b', null, undefined, {}]) assert.equal(isAetherSession(data, bad), false, String(bad))
})

test('markSession refuses an invalid id and writes nothing', (t) => {
  const data = tempDir(t)
  assert.throws(() => markSession(data, '../x'), /invalid session id/)
  assert.deepEqual(fs.readdirSync(data), [])
})

test('pruneSessions deletes markers not written to for the given days, and only markers', (t) => {
  const data = tempDir(t)
  markSession(data, 'old')
  markSession(data, 'new')
  fs.writeFileSync(path.join(data, 'sessions', 'notes.txt'), 'keep')
  const now = Date.now()
  const old = new Date(now - 31 * 24 * 3600 * 1000)
  fs.utimesSync(path.join(data, 'sessions', 'old.json'), old, old)
  fs.utimesSync(path.join(data, 'sessions', 'notes.txt'), old, old)
  assert.deepEqual(pruneSessions(data, { days: 30, now }), ['old'])
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')).sort(), ['new.json', 'notes.txt'])
})

test('pruneSessions with no sessions directory deletes nothing', (t) => {
  assert.deepEqual(pruneSessions(path.join(tempDir(t), 'none')), [])
})

test('markSession with the ops option off also writes <id>.ops-off, and with it on takes a stale one away', (t) => {
  const data = tempDir(t)
  assert.equal(opsOffFile(data, 's1'), path.join(data, 'sessions', 's1.ops-off'))
  markSession(data, 's1', 1, { opsInMod: false })
  assert.equal(fs.existsSync(opsOffFile(data, 's1')), true)
  assert.equal(isAetherSession(data, 's1'), true)
  // The same session resumed with the option back on.
  markSession(data, 's1', 2, { opsInMod: true })
  assert.equal(fs.existsSync(opsOffFile(data, 's1')), false)
  markSession(data, 's2', 3)
  assert.equal(fs.existsSync(opsOffFile(data, 's2')), false)
})

test('pruneSessions deletes the ops-off file of a session it prunes', (t) => {
  const data = tempDir(t)
  markSession(data, 'old', 1, { opsInMod: false })
  const when = new Date(Date.now() - 40 * 24 * 3600 * 1000)
  for (const name of ['old.json', 'old.ops-off']) fs.utimesSync(path.join(data, 'sessions', name), when, when)
  assert.deepEqual(pruneSessions(data, { days: 30 }), ['old'])
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')), [])
})

test('markSession writes the delegate file beside the marker, and a session without settings has none', (t) => {
  const data = tempDir(t)
  const settings = { lanes: true, harnesses: ['agy', 'grok'], deadlines: { quotaMs: 2000 } }
  markSession(data, 's1', 1, { delegate: settings })
  assert.deepEqual(JSON.parse(fs.readFileSync(delegateFile(data, 's1'), 'utf8')), settings)
  markSession(data, 's2', 1)
  assert.equal(fs.existsSync(delegateFile(data, 's2')), false)
})

test('markSession refuses an invalid id and writes no delegate file either', (t) => {
  const data = tempDir(t)
  assert.throws(() => markSession(data, '../x', 1, { delegate: { lanes: false, harnesses: ['agy'], deadlines: { quotaMs: 3000 } } }), /invalid session id/)
  assert.deepEqual(fs.readdirSync(data), [])
})

const OLD_FILE = (id) => id + '.' + 'router' + '.json'

test('markSession leaves a router file an older version wrote where it is', (t) => {
  const data = tempDir(t)
  markSession(data, 's1', 1)
  const stale = path.join(data, 'sessions', OLD_FILE('s1'))
  fs.writeFileSync(stale, '{}')
  markSession(data, 's1', 2)
  assert.equal(fs.existsSync(stale), true)
})

test('pruneSessions leaves a router file of an older version, and removes the files it still knows', (t) => {
  const data = tempDir(t)
  markSession(data, 'old', 1, { delegate: { lanes: false, harnesses: ['agy'], deadlines: { quotaMs: 3000 } } })
  fs.writeFileSync(path.join(data, 'sessions', OLD_FILE('old')), '{}')
  const past = new Date(Date.now() - 40 * 24 * 3600 * 1000)
  fs.utimesSync(markerFile(data, 'old'), past, past)
  assert.deepEqual(pruneSessions(data, { days: 30 }), ['old'])
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')), [OLD_FILE('old')])
})

test('parseDeadlines reads quota and ignores every other key', () => {
  assert.equal(parseDeadlines('other=5,quota=2').quotaMs, 2000)
  assert.equal(parseDeadlines('other=5,another=2').quotaMs, 3000)
})

function fakeProc(root, procs) {
  for (const [pid, { comm, ppid, start }] of Object.entries(procs)) {
    const dir = path.join(root, pid)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'comm'), `${comm}\n`)
    fs.writeFileSync(path.join(dir, 'stat'), [pid, `(${comm})`, 'S', ppid, ...Array(17).fill('0'), start, '0'].join(' ') + '\n')
  }
}

test('markSession keeps the old marker without the new options, and with them adds the repository, the process and the last activity (R19)', (t) => {
  const data = tempDir(t)
  markSession(data, 's1', 1000)
  assert.deepEqual(readMark(data, 's1'), { session: 's1', startedAt: 1000 })
  markSession(data, 's2', 2000, { repo: '/work/app', claude: { pid: 100, start: 555 } })
  assert.deepEqual(readMark(data, 's2'), { session: 's2', startedAt: 2000, repo: '/work/app', claude: { pid: 100, start: 555 }, lastActivity: 2000 })
  markSession(data, 's3', 3000, { repo: '/work/app', claude: null })
  assert.deepEqual(readMark(data, 's3'), { session: 's3', startedAt: 3000, repo: '/work/app', claude: null, lastActivity: 3000 })
  assert.equal(readMark(data, 'missing'), null)
  assert.equal(readMark(data, '../x'), null)
})

test('touchSession refreshes lastActivity and never throws (R19)', (t) => {
  const data = tempDir(t)
  markSession(data, 's1', 1000, { repo: '/work/app', claude: null })
  assert.equal(touchSession(data, 's1', 5000), true)
  assert.equal(readMark(data, 's1').lastActivity, 5000)
  assert.equal(readMark(data, 's1').startedAt, 1000)
  assert.equal(touchSession(data, 'nobody', 5000), false)
  assert.equal(touchSession(data, '../x', 5000), false)
  fs.writeFileSync(path.join(data, 'sessions', 'bad.json'), '{')
  assert.equal(touchSession(data, 'bad', 5000), false)
})

test('repoSessions lists the marks of one repository with the state of their process, without the excluded session (R6, R19)', (t) => {
  const data = tempDir(t)
  const proc = tempDir(t, 'aether-proc-')
  fakeProc(proc, { 100: { comm: 'claude', ppid: 1, start: 555 }, 200: { comm: 'claude', ppid: 1, start: 777 } })
  markSession(data, 'alive', 1000, { repo: '/work/app', claude: { pid: 100, start: 555 } })
  markSession(data, 'reused', 2000, { repo: '/work/app', claude: { pid: 200, start: 1 } })
  markSession(data, 'gone', 3000, { repo: '/work/app', claude: { pid: 300, start: 1 } })
  markSession(data, 'unknown', 4000, { repo: '/work/app', claude: null })
  markSession(data, 'elsewhere', 5000, { repo: '/work/other', claude: { pid: 100, start: 555 } })
  markSession(data, 'plain', 6000)
  const listed = repoSessions(data, '/work/app', { except: 'unknown', procRoot: proc })
  assert.deepEqual(listed.map((s) => [s.session, s.state]), [['gone', 'gone'], ['reused', 'gone'], ['alive', 'alive']])
  assert.deepEqual(repoSessions(data, '/work/app', { procRoot: path.join(proc, 'nope') }).map((s) => s.state), ['unknown', 'unknown', 'unknown', 'unknown'])
  assert.deepEqual(repoSessions(tempDir(t), '/work/app'), [])
  const cleared = repoSessions(data, '/work/app', { except: 'unknown', exceptProcess: { pid: 100, start: 555 }, procRoot: proc })
  assert.deepEqual(cleared.map((s) => s.session), ['gone', 'reused'], 'a mark of the same claude process (a /clear) is not another session')
})

test('oldStyleMarks lists the marks without a repository that are younger than 12 hours (R19 b, A18)', (t) => {
  const data = tempDir(t)
  const now = Date.now()
  markSession(data, 'fresh', now)
  markSession(data, 'stale', now)
  markSession(data, 'modern', now, { repo: '/work/app', claude: null })
  const hours = (n) => new Date(now - n * 3600 * 1000)
  fs.utimesSync(markerFile(data, 'fresh'), hours(1), hours(1))
  fs.utimesSync(markerFile(data, 'stale'), hours(13), hours(13))
  assert.equal(OLD_MARK_MS, 12 * 3600 * 1000)
  assert.deepEqual(oldStyleMarks(data, { now }), ['fresh'])
  assert.deepEqual(oldStyleMarks(tempDir(t), { now }), [])
})

