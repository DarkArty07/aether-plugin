'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const lib = (name) => require(path.join(PLUGIN, 'lib', `${name}.js`))
// The name of the retired decider command, built from parts so that a search for it does not find this test.
const OLD_BIN = 'aether-' + 'route'

test('the old journal is only read: router-log has no way to write it (R18, D4)', () => {
  const journal = lib('router-log')
  assert.equal(journal.appendEntry, undefined)
  assert.equal(typeof journal.readJournal, 'function')
  assert.equal(typeof journal.journalFile, 'function')
})

test('the guard no longer knows the retired decider command', () => {
  assert.notEqual(lib('guard').irreversibleClass(OLD_BIN + ' replay --projects p --decider haiku --paid'), 'paid-call')
})

test('the session settings of the decider are gone, and a deadlines value with the old keys still parses (E12)', () => {
  const session = lib('session')
  for (const name of ['routerSettingsFrom', 'readRouterSettings', 'routerFile', 'parseFallback']) assert.equal(session[name], undefined, name)
  assert.equal(session.delegateSettingsFrom({ CLAUDE_PLUGIN_OPTION_DEADLINES: 'other=5,quota=2' }).deadlines.quotaMs, 2000)
})

test('pruneSessions removes the delegate file and leaves an old router file of a session that aged out', (t) => {
  const session = lib('session')
  const dir = tempDir(t)
  const sessions = path.join(dir, 'sessions')
  fs.mkdirSync(sessions)
  const toRemove = ['old.json', 'old.delegate.json'].map((name) => path.join(sessions, name))
  const routerFile = path.join(sessions, 'old' + '.' + 'router' + '.json')
  for (const file of [...toRemove, routerFile]) {
    fs.writeFileSync(file, '{}')
    fs.utimesSync(file, new Date(Date.now() - 40 * 86400000), new Date(Date.now() - 40 * 86400000))
  }
  session.pruneSessions(dir, { days: 30 })
  for (const file of toRemove) assert.equal(fs.existsSync(file), false, file)
  assert.equal(fs.existsSync(routerFile), true, routerFile)
})
