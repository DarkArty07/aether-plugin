'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')
const SKILL = read('skills', 'autonomous-runs', 'SKILL.md')

test('the skill is named autonomous-runs, with a one-line description, and the model may load it', () => {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(SKILL)[1]
  assert.match(front, /^name: autonomous-runs$/m)
  assert.match(front, /^description: Use in Aether mode when the owner gives permission to work for hours, or when session start says an autonomous run is open.*$/m)
  assert.doesNotMatch(front, /disable-model-invocation/)
})

test('it holds the procedure of a run, with the whole brief template', () => {
  for (const text of ['aether-autonomy start --quote', '**Permission prompts.**', '**The diary,**', '**Keep going.**', '**Scope.**', '**Ceilings.**', '**Cost.**', '**Done** when', '**Honest stop.**', '**Resuming.**', '**An unreadable run state.**', '**The brief**', '# Brief: <run id>', '## Espera tu sí', '## Supuestos', '- Delegación: <llamadas y tokens en otros harness;', '/aether:design reports in "rounds"']) {
    assert.ok(SKILL.includes(text), text)
  }
})

test('the swarm skill and the session-start note name the skill', () => {
  const swarm = read('skills', 'swarm', 'SKILL.md')
  assert.ok(swarm.includes('(see the `aether:autonomous-runs` skill)'))
  assert.ok(swarm.includes('as the `aether:autonomous-runs` skill says'))
  assert.ok(!swarm.includes('the `using-aether` skill says'))
  assert.ok(read('bin', 'aether-session-start').includes('load the aether:autonomous-runs skill, then read'))
})

test('the swarm skill reads the lanes counts without dry groups', () => {
  const swarm = fs.readFileSync(path.join(PLUGIN, 'skills', 'swarm', 'SKILL.md'), 'utf8')
  assert.ok(swarm.includes('`overflow`'))
  assert.ok(!/each wave's `dry` groups/.test(swarm))
})
