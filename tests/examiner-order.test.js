'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const examiner = () => fs.readFileSync(path.join(PLUGIN, 'agents', 'examiner.md'), 'utf8')
const designing = () => fs.readFileSync(path.join(PLUGIN, 'skills', 'designing', 'SKILL.md'), 'utf8')

test('the Examiner maxTurns is unchanged at 40 (#229)', () => {
  const content = examiner()
  assert.match(content, /^maxTurns:\s*40$/m)
})

test('the Examiner writes one test per criterion first, keeps exam.json up to date, and widens only after (#229)', () => {
  const content = examiner()
  assert.match(content, /one test per criterion/i)
  assert.match(content, /shortest that checks it/i)
  assert.match(content, /keep `?\.?aether\/exam\/exam\.json`? up to date after each test/i)
  assert.match(content, /only then widen the exam/i)
  assert.match(content, /stop widening early enough to give the answer/i)
  const firstIndex = content.indexOf('First write one test per criterion')
  const widenIndex = content.indexOf('Only then widen the exam')
  assert.ok(firstIndex > 0 && widenIndex > firstIndex, 'covers one test per criterion before widening')
})

test('the designing skill handles a partial exam when exam.status is failed (#229)', () => {
  const content = designing()
  assert.ok(content.includes('exam.status` `failed`'))
  assert.match(content, /when every criterion has a test/i)
  assert.match(content, /holds tests that do not cover every criterion of the spec/i)
  assert.match(content, /start the Examiner once more with the criteria that have no test/i)
  assert.match(content, /telling it the folder already holds the others/i)
  assert.match(content, /aether-exam store specs\/NNN-<topic>/)
  assert.match(content, /holds none/i)
})
