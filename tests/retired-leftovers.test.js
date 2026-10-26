'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hits } = require('./retired-patterns.js')

const ROOT = path.join(__dirname, '..')

test(['wait', 'ForDelegate, ', 'line', 'Text and ', 'LANE_', 'NOTES are not in the searched tree'].join(''), () => {
  assert.deepEqual(hits(['leftovers']), [])
})

test('the fixtures of the old router are gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'tests', 'fixtures', 'router')), false)
})

test('the two tests that imported what they never used no longer do', () => {
  for (const [file, names] of [['tests/lane-quota.test.js', ['createAgy', 'readGrokQuota', 'tempDir']], ['tests/lane-refusal.test.js', ['tempDir']]]) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\/.*$/gm, '')
    for (const name of names) assert.ok((text.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length !== 1, `${file} still imports ${name} without using it`)
  }
})
