'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')

test('R11: designing/SKILL.md says the workflow already relaunched the Examiner once', () => {
  const text = read('plugins/aether/skills/designing/SKILL.md')
  assert.ok(text.includes('the workflow already relaunched the Examiner once'))
  assert.equal(text.includes('start the Examiner once more with the criteria that have no test'), false)
})
test('R26: the skills pages describe the automatic delivery and the install in /aether:design', () => {
  for (const file of ['plugins/aether/skills/skills/SKILL.md', 'docs/guide/project-files-and-skills.md']) {
    const text = read(file)
    for (const t of ['up to 3', 'trusted', 'not committed']) assert.ok(text.includes(t), `${file}: ${t}`)
  }
  assert.ok(read('plugins/aether/skills/designing/SKILL.md').includes('skill-install'))
  assert.ok(read('docs/guide/design-seats.md').includes('aether-plan skills'))
})
