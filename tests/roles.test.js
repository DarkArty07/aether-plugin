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

test('the swarm skill sends plan fixes to the Writer and the Judge', () => {
  const swarm = read('skills', 'swarm', 'SKILL.md')
  assert.match(swarm, /ask the Writer to fix the plan task/)
  assert.match(swarm, /have the Judge review the fix/)
  assert.doesNotMatch(swarm, /superpowers/)
  assert.doesNotMatch(swarm, /\bthe Designer\b/)
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

test('the swarm checks for the Workflow tool, and runs lanes only with the option on', () => {
  const swarm = read('skills', 'swarm', 'SKILL.md')
  const workflows =
    "- **Workflows.** The run is a dynamic workflow. When this session has no `Workflow` tool, workflows are off: tell the owner to turn on Dynamic workflows in `/config` and to start a new session, and offer to build the plan with subagents meanwhile.\n"
  const lanes =
    "- **Lanes.** When the owner turned on the plugin's `lanes` option, on Linux, with `agy` installed, the run sends calls to it while its quota lasts (`plugins/aether/config/lanes.json`). agy runs with `--dangerously-skip-permissions` in the unit's worktree. Otherwise every call is native, and `aether-plan compile` says why on stderr. `aether-plan compile <plan.md> --no-lanes` runs everything native.\n"
  assert.ok(swarm.includes(workflows))
  assert.ok(swarm.includes(lanes))
  assert.ok(swarm.indexOf(workflows) < swarm.indexOf(lanes))
  assert.ok(!swarm.includes('the owner accepted that risk for 0.4.0'))
})

