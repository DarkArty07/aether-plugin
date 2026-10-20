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

test('the swarm skill sends plan fixes to the Writer and to /aether:design in short mode', () => {
  const swarm = read('skills', 'swarm', 'SKILL.md')
  assert.match(swarm, /have the Writer fix the plan task/)
  assert.match(swarm, /review the fix in short mode on `tasks\.md`/)
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
    "- **Workflows.** The run is a dynamic workflow. When this session has no `Workflow` tool, workflows are off: tell the owner to turn on Dynamic workflows in `/config` and to start a new session, and offer to build it meanwhile task by task, each as a delegate task: on Sonnet, or on Opus when its Tier is opus.\n"
  const lanes =
    "- **Lanes.** When the owner turned on the plugin's `lanes` option, on Linux, the run sends calls to the external harnesses that the `harnesses` option enables (agy, codex, grok, cursor and muse; agy is the default), when the harness's CLI is installed and while its quota lasts, each call to the candidate whose quota is most at risk of being lost first (`docs/guide/lanes.md` has the rule). Muse is a lane like the others: its quota decides its place in the order, and any failure of a Muse call runs on the native agent without asking the owner. `${CLAUDE_PLUGIN_ROOT}/config/lanes.json` names each harness's models. These CLIs run without permission prompts (agy with `--dangerously-skip-permissions`) in the unit's transactional worktree, with the owner's git, GitHub, registry and cloud credentials kept out of their environment. Otherwise every call is native, and `aether-plan compile` says why on stderr; it also names each enabled harness that takes no call, and why. `aether-plan compile <plan.md> --no-lanes` runs everything native. `aether-lane quota` shows the readings, and `aether-lane status <runId>` the order of each role's candidates and the dry marks. A candidate whose start is unavailable passes the call to the next one; the native agent takes it only when none is left.\n"
  assert.ok(swarm.includes(workflows))
  assert.ok(swarm.includes(lanes))
  assert.ok(swarm.indexOf(workflows) < swarm.indexOf(lanes))
  assert.ok(!swarm.includes('the owner accepted that risk for 0.4.0'))
})

