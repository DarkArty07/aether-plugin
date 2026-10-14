'use strict'

// Spec 002: the decisions record A49, the decision of quota-aware lanes, and the three it updates.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('the decisions record A49, and A20, A21 and A37 say it updated them', () => {
  const decisions = read('docs', 'decisions.md')
  const row = (id) => decisions.split('\n').find((line) => line.startsWith(`| ${id} |`))
  assert.ok(row('A49').startsWith('| A49 | **Quota-aware lanes.**'))
  assert.match(row('A49'), /Decided 2026-10-14; see \[spec 002\]\(\.\.\/specs\/002-quota-aware-lanes\/spec\.md\)/)
  for (const id of ['A20', 'A21', 'A37']) assert.ok(row(id).includes('A49 (2026-10-14)'), id)
  assert.ok(decisions.includes('updated A20, A21 and A37, and added A49'))
})
