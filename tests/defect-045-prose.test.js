'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const ROOT = path.join(__dirname, '..')
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8')

test('R1: maintenance.md says what the cleaning does with registered worktrees', () => {
  const bullet = read('docs', 'guide', 'maintenance.md').split('\n').find((line) => line.startsWith('- **Per-project cleaning:**'))
  assert.ok(bullet, 'the bullet exists')
  assert.ok(!bullet.includes('never touching uncommitted work or registered worktrees'), 'the old sentence is gone')
  assert.ok(bullet.includes('never touching uncommitted work; a registered worktree inside an expired folder of `.aether/work/` is removed only when it is clean (no uncommitted changes and no untracked files)'))
})

test('R9: swarm says the approval goes by the Lead re-grade and how a delegate reviewer is fixed', () => {
  const swarm = fs.readFileSync(path.join(PLUGIN, 'skills', 'swarm', 'SKILL.md'), 'utf8')
  const start = swarm.indexOf('Final review findings')
  const section = swarm.slice(start, swarm.indexOf('- **Leftovers:**', start))
  assert.ok(section.includes("The approval goes by your re-grade of each finding below, not by the reviewer's grades."))
  assert.ok(section.includes("`aether-delegate verdict --verdict fix --finding '<file:line: what is missing>'`"))
})

test('R9: the pointer sits under Verify before you relay and approve keeps its plugin path', () => {
  const using = fs.readFileSync(path.join(PLUGIN, 'skills', 'using-aether', 'SKILL.md'), 'utf8')
  const pointer = "Act on a reviewer's verdict, final or of a delegate, with the rule of aether:swarm, «Final review findings»."
  const verify = using.split('\n').find((line) => line.startsWith('- **Verify before you relay:**'))
  assert.ok(verify.includes(pointer), 'the pointer is in the Verify paragraph')
  assert.equal(using.split(pointer).length - 1, 1, 'and nowhere else')
  const verdict = using.split('\n').find((line) => line.startsWith('**The verdict.**'))
  assert.ok(verdict.includes('${CLAUDE_PLUGIN_ROOT}/bin/aether-delegate approve --task <id>'))
})
