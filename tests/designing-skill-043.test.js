'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const designing = () => fs.readFileSync(path.join(PLUGIN, 'skills', 'designing', 'SKILL.md'), 'utf8')

test('with exam.status failed, a test outside the index runs before joining the index (R24)', () => {
  const content = designing()
  assert.match(content, /exam\.status/)
  assert.match(content, /failed/)
  assert.match(content, /outside the index[\s\S]{0,120}before[\s\S]{0,80}index/i)
})
