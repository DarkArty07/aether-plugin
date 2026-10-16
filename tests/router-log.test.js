'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const log = require('../plugins/aether/lib/router-log.js')

test('entries are appended one per line and read back in order, across sessions (R27)', (t) => {
  const dir = tempDir(t)
  assert.deepEqual(log.readJournal(dir), [])
  assert.equal(log.appendEntry(dir, { kind: 'decision', id: 'a', time: 100, session: 's1' }), true)
  assert.equal(log.appendEntry(dir, { kind: 'spawn', id: 'a', time: 101, session: 's1', agentId: 'agent-1' }), true)
  assert.equal(log.appendEntry(dir, { kind: 'decision', id: 'b', time: 300, session: 's2' }), true)
  assert.equal(log.journalFile(dir), path.join(dir, 'router', 'decisions.jsonl'))
  assert.equal(fs.readFileSync(log.journalFile(dir), 'utf8').trim().split('\n').length, 3)
  assert.deepEqual(log.readJournal(dir).map((e) => e.id), ['a', 'a', 'b'])
  assert.deepEqual(log.readJournal(dir, { session: 's2' }).map((e) => e.id), ['b'])
  assert.deepEqual(log.readJournal(dir, { since: 200 }).map((e) => e.id), ['b'])
})

test('a line that does not parse is skipped, and a log that cannot be written is false, not an error', (t) => {
  const dir = tempDir(t)
  log.appendEntry(dir, { kind: 'decision', id: 'a', time: 1, session: 's' })
  fs.appendFileSync(log.journalFile(dir), 'not json\n')
  log.appendEntry(dir, { kind: 'decision', id: 'b', time: 2, session: 's' })
  assert.deepEqual(log.readJournal(dir).map((e) => e.id), ['a', 'b'])
  const blocked = path.join(dir, 'blocked')
  fs.writeFileSync(blocked, 'a file where a directory should be')
  assert.equal(log.appendEntry(blocked, { kind: 'decision', id: 'c', time: 3, session: 's' }), false)
})
