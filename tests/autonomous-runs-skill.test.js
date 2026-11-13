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
  assert.ok(swarm.includes('`{ calls, ok, failed, quota, violation, blocked, unavailable }`'))
  assert.ok(!swarm.includes('overflow'))
  assert.ok(!/each wave's `dry` groups/.test(swarm))
})

test('the quota-brake paragraph names aether-autonomy quota-brake and leaves the stop to the Lead (R28)', () => {
  const brake = SKILL.slice(SKILL.indexOf('**The quota brake.**'), SKILL.indexOf('**Cost.**'))
  assert.ok(brake.includes('aether-autonomy quota-brake'))
  assert.ok(brake.includes('aether-lane stop'))
  assert.doesNotMatch(brake, /aether-wt save <runId>[\s\S]*quota-saved --from/)
  const swarm = read('skills', 'swarm', 'SKILL.md')
  const line = swarm.split('\n').find((row) => row.includes('follow its quota brake'))
  assert.ok(line.includes('aether-autonomy quota-brake'))
  assert.doesNotMatch(line, /aether-wt save <runId>[\s\S]*quota-saved --from/)
})

test('the ceilings paragraph widens the ceilings with extend instead of reopening (issue 253)', () => {
  const line = SKILL.split('\n').find((l) => l.startsWith('**Ceilings.**'))
  assert.ok(line)
  assert.match(line, /aether-autonomy extend/)
  assert.match(line, /do not end and reopen/)
})

test('an unreadable run state is set aside with aether-autonomy quarantine, not with Bash (R26)', () => {
  const line = SKILL.split('\n').find((l) => l.startsWith('**An unreadable run state.**'))
  assert.ok(line)
  assert.match(line, /aether-autonomy quarantine grants/)
  assert.match(line, /aether-autonomy quarantine run <id>/)
  assert.doesNotMatch(line, /Move it aside with Bash/)
  assert.match(line, /Do not treat it as a reason to stop\./)
})

test('autonomous-runs and swarm skills describe automatic ceiling refusal and #214 rules', () => {
  const swarmText = read('skills', 'swarm', 'SKILL.md')

  assert.match(SKILL, /ExitPlanMode/)
  assert.match(SKILL, /aether-delegate begin/)
  assert.match(SKILL, /aether-plan compile/)
  assert.match(SKILL, /aether-autonomy end --outcome ceiling/)
  assert.doesNotMatch(SKILL, /Run `aether-autonomy status` before each/)

  assert.match(swarmText, /Never run the swarm on `main`/)
  assert.match(swarmText, /--allow-main/)
  assert.match(swarmText, /aether-autonomy end --outcome ceiling/)
  assert.doesNotMatch(swarmText, /run `aether-autonomy status` first|after the `aether-autonomy status` check of §3 in a run/)
  assert.match(swarmText, /aether-wt settle/)
  assert.ok(swarmText.includes('aether-wt settle <run> <task>'))
  assert.doesNotMatch(swarmText, /run-dir|wave-num|--test-cmd|merge timed out/)
  assert.ok(swarmText.includes('"Later changes" in the `aether:designing` skill'))
  assert.ok(SKILL.includes('the `failed` result of the `aether:designing` skill'))
  assert.ok(!SKILL.includes("bootstrap's `failed` result"))
  assert.doesNotMatch(swarmText, /without a valid verdict/)
  assert.match(swarmText, /without an answer/)
  assert.match(swarmText, /an invalid verdict counts as a retry|an invalid verdict counts as a `retry`/)
  assert.match(swarmText, /the 2nd and 3rd attempt of the supervisor always run on Claude/)
  assert.match(swarmText, /900/)
  assert.match(swarmText, /first file in the task's `Owns`|first path in the task's `Owns`/i)
})
