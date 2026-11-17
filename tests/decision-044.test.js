'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const decisions = read('docs/decisions.md')
const row = decisions.split('\n').find((line) => line.startsWith('| A132 |')) || ''

test('R27: A132 exists after A131, quotes the owner, replaces the A85 sentence for read-only delegates and leaves A85 for edits', () => {
  assert.ok(row, 'a row A132')
  assert.ok(decisions.indexOf('| A131 |') < decisions.indexOf('| A132 |'))
  assert.ok(row.includes('Si a todo trabja autonomamente en resolverlo'))
  assert.match(row, /read-only delegate/)
  assert.match(row, /closes? (it|the delegate) as approved|closed by the system/)
  assert.match(row, /A85/)
  assert.match(row, /delegates that edit/)
  assert.match(row, /#193/)
  assert.match(row, /#196/)
})

test('R27: the sentences that repeat the old rule say the new case', () => {
  assert.match(read('docs/guide/delegates.md'), /read-only delegate[^.]*closed by the system|the system closes a read-only delegate/)
  assert.ok(!read('AGENTS.md').includes('Only a verdict that goes through `aether-delegate verdict` counts, and an `approve` with a failed check is refused.'))
})

test('R28: no reviewer is added to Haiku edits, and an existing test shows approve runs the task tests before merging', () => {
  assert.match(row, /no reviewer/i)
  const approve = read('tests/delegate-approve.test.js')
  assert.match(approve, /runs? the (task's )?tests|test command|npm test|testCommand/i)
})
