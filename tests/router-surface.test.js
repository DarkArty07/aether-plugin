'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('R8: the Lead learns the override form in the bootstrap skill, and that it leaves model and effort out in command mode', () => {
  const skill = read('plugins/aether/skills/using-aether/SKILL.md')
  assert.ok(skill.includes('ROUTER-OVERRIDE: <reason>'))
  assert.ok(/router/i.test(skill))
  assert.ok(skill.includes('`command`'))
  assert.ok(skill.includes('`record`'))
})

test('R11: the front page and the getting-started page count the seven options and name them', () => {
  const readme = read('README.md')
  const start = read('docs/getting-started.md')
  assert.ok(readme.includes("the plugin's seven options"))
  assert.ok(!readme.includes("the plugin's four options"))
  assert.ok(start.includes("the plugin's seven options, `superdelegation`, `harnesses`, `ops`, `router`, `decider`, `fallback` and `deadlines`"))
  assert.ok(!start.includes("the plugin's four options"))
  assert.ok(readme.split('\n').length <= 160)
})
