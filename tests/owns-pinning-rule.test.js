'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')

test('tasks skill and speckit tasks command describe the search rule for tests pinning what a task changes in Owns', () => {
  const files = [
    ['skills', 'tasks', 'SKILL.md'],
    ['speckit', 'commands', 'speckit.tasks.md'],
  ]
  const ownsLines = []
  for (const file of files) {
    const text = read(...file)
    const ownsMatch = text.match(/- \*\*Owns:\*\*([^\n]+(?:\n {5,}[^\n]+)*)/)
    assert.ok(ownsMatch, `${file.join('/')} must have an Owns field`)
    const owns = ownsMatch[0]
    ownsLines.push(owns)
    assert.match(owns, /pins what the task changes|tests that pin/i, file.join('/'))
    assert.match(owns, /tests\//, file.join('/'))
    assert.match(owns, /readdirSync/, file.join('/'))
    assert.match(owns, /global rules/i, file.join('/'))
    assert.match(owns, /same wave.*(?:move the change|dependency)/i, file.join('/'))
  }
  assert.strictEqual(ownsLines[0], ownsLines[1], 'Owns definition of skills/tasks/SKILL.md must equal the one of speckit/commands/speckit.tasks.md byte for byte')
})

test('writer agent describes the test pinning search rule and same-wave dependency in its Owns line', () => {
  const text = read('agents', 'writer.md')
  const ownsMatch = text.match(/- \*\*Owns\*\*([^\n]+)/)
  assert.ok(ownsMatch, 'writer.md must have an Owns line')
  const owns = ownsMatch[0]
  assert.match(owns, /pins what the task changes|tests that pin/i)
  assert.match(owns, /tests\//)
  assert.match(owns, /readdirSync/)
  assert.match(owns, /global rules/i)
  assert.match(owns, /same wave.*(?:move the change|dependency)/i)
})

test('swarm skill treats warning for changes without tests as blocking before compiling', () => {
  const text = read('skills', 'swarm', 'SKILL.md')
  const sentences = text.split(/(?<=[.!?])\s+/)
  const blocking = sentences.find((s) => /blocking/i.test(s) && /changes .* but not the tests that exercise/i.test(s))
  assert.ok(blocking, 'swarm SKILL.md must have one blocking sentence about a task changing a file but not the tests that exercise it')
  assert.match(blocking, /changes (?:a file|X) but not the tests that exercise (?:it|them)/i)
  assert.match(blocking, /blocking/i)
  assert.match(blocking, /Owns/)
  assert.match(blocking, /diary/i)
  assert.match(blocking, /before compiling/i)
  assert.match(blocking, /tasks\.md|Writer/)
  assert.match(blocking, /then compile/i)
})

test('tasks skill, speckit command, writer and judge mention .specify/plan-rules.json and registration in Owns (#263)', () => {
  for (const [file, clause] of [
    [['skills', 'tasks', 'SKILL.md'], /goes in that task's Owns/],
    [['speckit', 'commands', 'speckit.tasks.md'], /goes in that task's Owns/],
    [['agents', 'writer.md'], /goes in that task's Owns/],
    [['agents', 'judge.md'], /or depends on a task that does/],
  ]) {
    const text = read(...file)
    assert.match(text, /\.specify\/plan-rules\.json/, `${file.join('/')} names .specify/plan-rules.json`)
    assert.match(text, /registration/i, `${file.join('/')} mentions registration`)
    assert.match(text, clause, `${file.join('/')} states the rule clause`)
  }
})
