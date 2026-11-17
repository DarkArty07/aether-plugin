'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const designing = read('plugins/aether/skills/designing/SKILL.md')

test('R3: the designing skill says a spec of 15 requirements or more gets a code map before the plan, and a failed map does not stop the design', () => {
  assert.match(designing, /15 requirements/)
  assert.match(designing, /code map/)
  assert.match(designing, /map (that )?fails|without a map/)
})

test('R7: the designing skill says the native Writer writes the plan and the tasks in two calls', () => {
  assert.match(designing, /two calls/)
})

test('R9: the designing skill says an Examiner without an answer is relaunched once with its tests', () => {
  assert.match(designing, /relaunch(ed)? (it )?once/)
})

test('R4: AGENTS.md and the components page name the mapper agent', () => {
  assert.match(read('AGENTS.md'), /reviewer, ops|mapper/)
  assert.ok(read('AGENTS.md').includes('mapper'))
  assert.ok(read('docs/reference/components.md').includes('`mapper`'))
})
