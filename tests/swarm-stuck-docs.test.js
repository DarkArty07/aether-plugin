'use strict'

// Spec 034 (R12, C8): the Lead's rules for a stuck unit are in the swarm skill and the guides; the start-up skill is not touched.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('the swarm skill tells the Lead to leave the watch in the background, what to do when it ends, and what a missing fix does', () => {
  const skill = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
  for (const text of [
    'aether-wt watch <runId>',
    'run_in_background',
    'sin señal de la corrida',
    'aether-wt deliver <runId> <task> --commit <sha> --reason "<what you fixed>"',
    'aether-wt decline <runId> <task> --reason "<why>"',
    'stuckWaitSeconds',
    'config/swarm.json',
    'fixedByLead',
  ]) {
    assert.ok(skill.includes(text), text)
  }
  assert.match(skill, /relaunch the watch|launch the watch again/i)
  assert.match(skill, /ends blocked/i)
})

test('the swarm skill no longer says that no aether-wt command may run while the swarm runs, without its exception', () => {
  const skill = read('plugins', 'aether', 'skills', 'swarm', 'SKILL.md')
  assert.ok(!skill.includes('- do not run `aether-wt` commands for this run.\n'))
  assert.ok(skill.includes('except `watch`, `deliver` and `decline`'))
})

test('the guides describe the stuck wait and the commands the mod answers', () => {
  const troubleshooting = read('docs', 'guide', 'troubleshooting.md')
  assert.ok(troubleshooting.includes('aether-wt deliver'))
  assert.ok(troubleshooting.includes('aether-wt decline'))
  assert.ok(troubleshooting.includes('stuckWaitSeconds'))
  const ops = read('docs', 'guide', 'ops.md')
  for (const verb of ['stuck-tick', 'stuck-end']) assert.ok(ops.includes(`\`${verb}`), verb)
  const components = read('docs', 'reference', 'components.md')
  for (const name of ['wt-config.js', 'wt-stuck.js', 'wt-watch.js', 'config/swarm.json']) assert.ok(components.includes(name), name)
})

test('the start-up skill does not mention the stuck wait', () => {
  assert.doesNotMatch(read('plugins', 'aether', 'skills', 'using-aether', 'SKILL.md'), /aether-wt (watch|deliver|decline)|stuckWaitSeconds/)
})
