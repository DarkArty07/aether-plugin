'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const skill = (name) => fs.readFileSync(path.join(PLUGIN, 'skills', name, 'SKILL.md'), 'utf8')
const has = (text, needles) => needles.forEach((needle) => assert.ok(text.includes(needle), `has: ${needle}`))

test('specify reads the card, says what and why and never how, and marks only the hard choices (R6)', () => {
  has(skill('specify'), [
    'intent.md',
    'skip steps 1 and 2',
    'what and why, never how',
    'A tool or a test suite that does not exist yet is a requirement of its own',
    "serves a criterion that comes from the owner's words",
    'a reversible default',
    '[NEEDS CLARIFICATION: <question>]',
    'hard to reverse, surprising, or a real trade-off',
    'Sirve a: C2',
  ])
})

test('plan has the gate before the design and the complexity table last, with its three columns (R7)', () => {
  const text = skill('plan')
  has(text, [
    '## Gate',
    'The gate must pass before the design.',
    'Nothing speculative, and nothing for a hypothetical need.',
    'No abstraction, option, file or dependency that no requirement asks for.',
    '| Violation | Why needed | Simpler alternative rejected because |',
    'names the requirement that asks for it',
  ])
  const at = (heading) => text.indexOf(heading)
  assert.ok(at('## Technical context') < at('## Gate') && at('## Gate') < at('## Design'))
  assert.ok(at('## Risks') < at('## Complexity'))
})

test('tasks gives each task a Serves line and asks for a task for each requirement (R8)', () => {
  has(skill('tasks'), ['- Serves: R1, R3', 'Every task serves at least one requirement of the spec, and every requirement has a task.', 'aether-plan check fails on a task that serves none'])
})

test('each command of the preset keeps the body of its skill', () => {
  for (const name of ['specify', 'plan', 'tasks']) {
    const body = (text) => text.slice(text.indexOf('\n---\n', 4) + 5)
    assert.equal(body(skill(name)), body(fs.readFileSync(path.join(PLUGIN, 'speckit', 'commands', `speckit.${name}.md`), 'utf8')), name)
  }
})
