'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')

test('the swarm reports to the Lead', () => {
  assert.match(read('skills', 'swarm', 'SKILL.md'), /You stay the Lead/)
  assert.match(read('agents', 'supervisor.md'), /the question the Lead must answer/)
  assert.match(read('agents', 'reviewer.md'), /before the Lead finishes the branch/)
  assert.match(read('agents', 'reviewer.md'), /The Lead rules on each line/)
  assert.match(read('workflows', 'run.workflow.js'), /the question the Lead must answer/)
  for (const file of [['agents', 'supervisor.md'], ['agents', 'reviewer.md'], ['workflows', 'run.workflow.js']]) {
    assert.doesNotMatch(read(...file), /\bthe Designer\b/, file.join('/'))
  }
})

test('the swarm skill sends plan fixes to the Designer', () => {
  assert.match(read('skills', 'swarm', 'SKILL.md'), /ask the Designer to fix the plan task/i)
})

test('in an autonomous run the swarm checks the ceilings, records its cost, and leaves unauthorized steps to the brief', () => {
  const swarm = read('skills', 'swarm', 'SKILL.md')
  for (const needle of [
    'aether-autonomy status',
    'aether-autonomy spend <lanes.totals.run.totalUsd> --source <runId>',
    'aether-autonomy check merge-main',
    'aether-autonomy check push',
    '"Espera tu sí"',
    'Defer the minor ones',
    'as the owner\'s delegate',
  ]) {
    assert.ok(swarm.includes(needle), needle)
  }
  assert.ok(!swarm.includes('Use superpowers `finishing-a-development-branch` with the owner.'))
  assert.ok(!swarm.includes('Report the minor ones to the owner as deferred.'))
})
