'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const { LEAD_AGENT, markerFile, markSession, isAetherSession, opsOffFile, pruneSessions } = require('../plugins/aether/lib/session.js')

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
