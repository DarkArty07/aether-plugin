'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(PLUGIN, '..', '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('the methodology says the effort of a task defaults to high and how a retry and a rise run', () => {
  const text = read('docs/methodology.md')
  assert.doesNotMatch(text, /The effort defaults to `xhigh`/)
  assert.match(text, /The effort defaults to `high`/)
  assert.match(text, /a retry on the task's own Tier runs at `xhigh` on Haiku and at the task's effort on Sonnet and Opus/)
  assert.match(text, /every attempt on a model the unit moved up to runs at `high`/)
  assert.match(text, /models-by-role\.md/)
})

test('the roadmap and the purpose page no longer say every retry runs at xhigh', () => {
  const roadmap = read('docs/roadmap.md')
  const purpose = read('docs/purpose.md')
  assert.doesNotMatch(roadmap, /The default is `xhigh` on every model/)
  assert.match(roadmap, /The default is `high` on every model/)
  assert.doesNotMatch(roadmap, /A failed attempt runs again at `xhigh`, then moves up the ladder/)
  assert.doesNotMatch(purpose, /A failed attempt runs again at `xhigh`, and then on a stronger model/)
})

test('the changelog records this change in version 0.21.0', () => {
  const text = read('docs/changelog.md')
  assert.doesNotMatch(text, /^## Unreleased/m)
  const first = text.split('\n').find((line) => line.startsWith('Version 0.21.0: '))
  for (const word of ['xhigh', 'A93', 'models-by-role.md']) assert.ok(first.includes(word), word)
})
