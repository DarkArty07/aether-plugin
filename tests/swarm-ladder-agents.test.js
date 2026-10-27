'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')
const WRITER = [['agents', 'writer.md'], ['skills', 'tasks', 'SKILL.md'], ['speckit', 'commands', 'speckit.tasks.md']]

test('the Writer is no longer asked for Tier or Ladder', () => {
  for (const file of WRITER) {
    const text = read(...file)
    assert.doesNotMatch(text, /^\s*-\s*Tier:/m, `${file.join('/')} still shows a Tier line`)
    assert.doesNotMatch(text, /\*\*Tier\*\*/, `${file.join('/')} still explains Tier`)
    assert.doesNotMatch(text, /-\s*Ladder:/, `${file.join('/')} still shows a Ladder line`)
    assert.ok(text.includes('- Max agents: 200'), `${file.join('/')} keeps Max agents`)
    assert.ok(text.includes('- Test command:'), `${file.join('/')} keeps the test command`)
  }
})

test('the Writer is told the swarm starts every task cheap, to size a task by module and concern, and when to name Review', () => {
  for (const file of WRITER) {
    const text = read(...file)
    assert.ok(text.includes('The swarm starts every task on the cheapest model and raises it by itself: do not name a model or an effort for the implementer.'), file.join('/'))
    assert.ok(text.includes('Every task is one module and one concern; when tests cannot pin it down, split it.'), file.join('/'))
    assert.ok(text.includes('only where a mistake would reach user data, security or concurrency, and say which.'), file.join('/'))
    assert.ok(text.includes('**Review**'), file.join('/'))
  }
})

test('the supervisor demands a file and what is missing in each finding of a retry, and knows the gate and the ladder', () => {
  const text = read('agents', 'supervisor.md')
  assert.ok(text.includes('Every finding of a retry names a file and what is missing.'))
  assert.ok(text.includes('the Gate evidence section of your message shows their result'))
  assert.ok(text.includes('The ladder raises the model by itself: when the corrections of the rung are spent, when the same findings come back, or when you rule escalate with a reason.'))
  assert.doesNotMatch(text, /You cannot run commands\./)
  assert.doesNotMatch(text, /The workflow enforces the ladder/)
  assert.doesNotMatch(text, /on a Haiku task|on a Sonnet or Opus task/)
})
