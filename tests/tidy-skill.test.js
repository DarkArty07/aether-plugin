'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const text = fs.readFileSync(path.join(PLUGIN, 'skills', 'tidy', 'SKILL.md'), 'utf8')
const help = fs.readFileSync(path.join(PLUGIN, 'skills', 'help', 'SKILL.md'), 'utf8')

test('the cover of aether:tidy is that of a skill the person invokes (R37)', () => {
  const front = Object.fromEntries(/^---\n([\s\S]*?)\n---\n/.exec(text)[1].split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim().replace(/^"|"$/g, '')]))
  assert.equal(front.name, 'tidy')
  assert.ok(front.description.length > 0 && front.description.length <= 200)
  assert.equal(front['argument-hint'], '[project or folder]')
  assert.equal(front['disable-model-invocation'], 'true')
})

test('it reports first with aether-doctor tidy, asks the yes to a list and applies only that list (C13, R37, H4 scenarios 28 and 29)', () => {
  for (const token of ['aether-doctor tidy', '--projects', 'aether-autonomy grant --class delete', 'git mv', 'git rm', '@AGENTS.md', '.aether/README.md', 'skills-lock.json']) assert.ok(text.includes(token), token)
  const lower = text.toLowerCase()
  for (const phrase of ['only the list', 'without the owner', 'old aether cli', 'duplicate']) assert.ok(lower.includes(phrase), phrase)
  assert.ok(!/onboard/i.test(text))
})

test('the help lists /aether:tidy and nothing about onboard (R37, R10)', () => {
  assert.ok(help.includes('/aether:tidy'))
  assert.ok(!/onboard/i.test(help))
})
