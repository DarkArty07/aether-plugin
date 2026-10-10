'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')

test('the supervisor and the final reviewer grade criteria as VERIFIED, PARTIAL or MISSING, and reject words that are not evidence', () => {
  for (const file of ['supervisor.md', 'reviewer.md']) {
    const prompt = read('agents', file)
    assert.ok(prompt.includes('VERIFIED, PARTIAL or MISSING'), `${file} grades criteria`)
    assert.ok(prompt.includes('are not evidence'), `${file} rejects words that are not evidence`)
  }
})

test('the supervisor deals with each flag the package lists, and says why it accepts one', () => {
  const supervisor = read('agents', 'supervisor.md')
  assert.ok(supervisor.includes('**Flags**'), 'the supervisor names the package flags')
  assert.ok(
    supervisor.includes('A flag you accept needs one line in your ruling that says why.'),
    'the supervisor asks for a reason on each accepted flag',
  )
})

test('the final reviewer grades each criterion of the spec and of each task', () => {
  assert.ok(read('agents', 'reviewer.md').includes('- **Evidence:**'), 'the reviewer has an Evidence check')
})
