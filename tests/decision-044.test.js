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
  assert.ok(row.includes('hazlo neotnces'), 'A132 quotes the owner\'s words of 2026-11-18')
  assert.match(row, /reopen/, 'A132 records that fix or infeasible reopen the automatic approval')
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

test('R28: no reviewer is added to Haiku edits, and the refusal on a failed check of the verdict is pinned', () => {
  assert.match(row, /no reviewer/i)
  const approve = read('tests/delegate-approve.test.js')
  assert.match(approve, /runs? the (task's )?tests|test command|npm test|testCommand/i)
  assert.ok(approve.includes('a failed delegate check refuses the approve, as verdict does'), 'the case that refuses an approve with a failed check')
})
