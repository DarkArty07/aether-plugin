'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { hits } = require('./retired-patterns.js')

test('no file of tests/ holds a retired name, journal, leftover or compatibility pattern whole', () => {
  const found = hits(['options', 'journal', 'leftovers', 'formats']).filter((hit) => hit.file.startsWith('tests/'))
  assert.deepEqual(found, [])
})

test('the variables the tests scrub no longer include a retired option', () => {
  const text = require('node:fs').readFileSync(require('node:path').join(__dirname, 'helpers.js'), 'utf8')
  assert.ok(!text.includes('AETHER_SUPERDELEGATION_' + 'LEGACY'))
})
