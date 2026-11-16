'use strict'
// Lead `Skill` load records (spec 037 R3): the name is recorded whichever field
// carries it, never with its arguments.

const test = require('node:test')
const assert = require('node:assert/strict')
const { tempDir, makeRepo } = require('./helpers.js')
const loads = require('../plugins/aether/lib/skill-loads.js')
const reg = require('../plugins/aether/lib/skill-registry.js')

function world(t) {
  const repo = makeRepo(t)
  const home = tempDir(t, 'aether-home-')
  const data = tempDir(t, 'aether-data-')
  return { repo, home, data, opts: { cwd: repo.dir, home }, ctx: { env: {}, home, now: 5000, dataDir: data } }
}

test('a Lead load is recorded under the name of the skill whichever field carries it, never with its arguments (R3, C2)', (t) => {
  const w = world(t)
  const load = (tool_input) => loads.recordLeadSkillLoad({ session_id: 'lead', cwd: w.repo.dir, tool_name: 'Skill', tool_input }, w.ctx)
  for (const tool_input of [{ name: 'by-name SECRET' }, { skill_name: 'by-skill-name' }, { skill: 'by-skill secret text' }, { args: 'only args' }]) assert.equal(load(tool_input), null)
  assert.deepEqual(reg.readUses(w.data).map((u) => u.skills), [['by-name'], ['by-skill-name'], ['by-skill']])
  assert.ok(!JSON.stringify(reg.readUses(w.data)).includes('SECRET'))
})

test('skill-loads.js exports the load records and nothing else is required', () => {
  const names = Object.keys(require('../plugins/aether/lib/skill-loads.js')).sort()
  for (const name of ['recordLeadSkillLoad', 'leadLoadedSkills', 'alreadyNoticed', 'skillToken', 'mainRootOf']) assert.ok(names.includes(name), `skill-loads.js exports ${name}`)
})
