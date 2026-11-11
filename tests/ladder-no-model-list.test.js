'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', 'plugins', 'aether')
const FILES = [
  'lib/pareto.js', 'lib/ladder.js', 'lib/wt-ladder.js', 'lib/pairs.js', 'lib/superdelegation.js', 'lib/lane-pick.js',
  'lib/delegate-task.js', 'lib/delegate-authorize.js', 'lib/delegate-report.js', 'workflows/run.workflow.js', 'hooks/ops-command.mjs',
]
const LIST = /\[\s*['"`](haiku|sonnet|opus)['"`]\s*,/
const NAMES_AS_CONSTANT = /\b(NATIVE_MODELS|TIERS)\b/

test('no code, workflow or hook of the ladder keeps a list of model names that decides a step', () => {
  for (const file of FILES) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    assert.doesNotMatch(text, LIST, file)
    assert.doesNotMatch(text, NAMES_AS_CONSTANT, file)
  }
})
