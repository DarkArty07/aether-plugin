'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const text = (name) => fs.readFileSync(path.join(PLUGIN, 'agents', `${name}.md`), 'utf8')

test('R1: the Writer declares maxTurns: 100', () => {
  assert.match(text('writer'), /^maxTurns: 100$/m)
})

test('R2: the Examiner declares maxTurns: 80', () => {
  assert.match(text('examiner'), /^maxTurns: 80$/m)
})

test('R7: the Writer body says what to answer when the message asks for plan.md only, and for tasks.md only', () => {
  const body = text('writer')
  assert.ok(body.includes('When the message asks only for plan.md, write plan.md, commit it, do not touch tasks.md, and answer plan, commit, assumptions, questions and complexity.'))
  assert.ok(body.includes('When the message asks only for tasks.md, write tasks.md reading the plan.md already written (its path is in the message), run aether-plan check until it passes, commit it, and answer tasks, commit, check, assumptions and questions.'))
})
