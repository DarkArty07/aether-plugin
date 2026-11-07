'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')
const exam = require('../plugins/aether/lib/exam.js')

test('the exam folder is .aether/exam, in the library and in the prompt of the Examiner (R15)', () => {
  assert.equal(exam.EXAM_DIR, '.aether/exam')
  assert.equal(exam.EXAM_FILE, 'exam.json')
  const examiner = fs.readFileSync(path.join(PLUGIN, 'agents', 'examiner.md'), 'utf8')
  assert.ok(examiner.includes('.aether/exam/') && !examiner.includes('.aether-exam'))
  const design = fs.readFileSync(path.join(PLUGIN, 'workflows', 'design.workflow.js'), 'utf8')
  assert.ok(design.includes('.aether/exam/'))
  assert.ok(!/Write the exam under \$\{repoRoot\}\/\.aether-exam/.test(design))
})
