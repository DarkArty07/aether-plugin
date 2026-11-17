'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const schemas = require('../plugins/aether/lib/lane-schemas.js')

const reviewer = fs.readFileSync(path.join(PLUGIN, 'agents', 'reviewer.md'), 'utf8')

test('R11: ready is no critical and no important finding, even if minors remain', () => {
  assert.ok(reviewer.includes('Say ready when you have no critical and no important finding, even if minor findings remain.'))
})

test('R12: minor findings are capped at 10', () => {
  assert.ok(reviewer.includes('Report at most 10 minor findings.'))
})

test('R13: the reviewer text asks for the fix in every finding, with no "when not obvious"', () => {
  assert.ok(reviewer.includes('Every finding carries its fix: the change that resolves it, in one line.'))
  assert.ok(!/when not obvious/i.test(reviewer))
})

test('R13: REVIEW_SCHEMA requires a fix string in each finding, and SUPERVISOR_SCHEMA does not', () => {
  const findingOf = (schema) => schema.properties.findings.items
  assert.ok(findingOf(schemas.REVIEW_SCHEMA).required.includes('fix'))
  assert.equal(findingOf(schemas.REVIEW_SCHEMA).properties.fix.type, 'string')
  assert.ok(!findingOf(schemas.SUPERVISOR_SCHEMA).required.includes('fix'))
})
