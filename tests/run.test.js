'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { newRunId, isRunId, assertRunId, assertTaskId, ensureExcluded } = require('../plugins/aether/lib/run.js')
const { tempDir } = require('./helpers.js')

test('newRunId has a date, a time and four hex characters', () => {
  const id = newRunId(new Date(2026, 9, 7, 21, 5, 9))
  assert.match(id, /^20261007-210509-[0-9a-f]{4}$/)
  assert.equal(isRunId(id), true)
})

test('ids that could escape .aether are refused', () => {
  assert.throws(() => assertRunId('../x'), /invalid run id/)
  assert.throws(() => assertTaskId('task-1/../../x'), /invalid task id/)
  assert.doesNotThrow(() => assertTaskId('task-12'))
})

test('ensureExcluded adds the patterns once', (t) => {
  const dir = tempDir(t)
  ensureExcluded(dir)
  ensureExcluded(dir)
  assert.equal(fs.readFileSync(path.join(dir, 'info', 'exclude'), 'utf8'), '.aether/\n.aether-tmp/\n')
})

test('ensureExcluded keeps the existing content', (t) => {
  const dir = tempDir(t)
  fs.mkdirSync(path.join(dir, 'info'))
  fs.writeFileSync(path.join(dir, 'info', 'exclude'), 'node_modules')
  ensureExcluded(dir)
  assert.equal(fs.readFileSync(path.join(dir, 'info', 'exclude'), 'utf8'), 'node_modules\n.aether/\n.aether-tmp/\n')
})
