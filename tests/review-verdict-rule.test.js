'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...p) => fs.readFileSync(path.join(PLUGIN, ...p), 'utf8')
const swarm = read('skills', 'swarm', 'SKILL.md')
const using = read('skills', 'using-aether', 'SKILL.md')
const section = swarm.slice(swarm.indexOf('Final review findings'))

test('R14: the swarm skill says what to do with each verdict', () => {
  assert.ok(section.includes('A ready verdict is approved.'))
  assert.ok(section.includes('ready-with-fixes is approved when no finding is important or critical; when one is, fix the critical and important findings, and the minor ones are deferred.'))
  assert.ok(section.includes('This rule serves the final reviewer and the reviewer of a delegate alike.'))
})

test('R15: minors are not worked with ready or with ready-with-fixes, and "They are not worked" stays', () => {
  assert.ok(section.includes('Minor findings are not worked, with ready or with ready-with-fixes: there is no exception.'))
  assert.ok(swarm.includes('They are not worked'))
})

test('R16: a not-ready is not approved before its reason is written, in the diary or in the answer, with no command or flag', () => {
  assert.ok(section.includes("A not-ready is not approved before you write the reason: in the run's diary (.aether/autonomy/<run id>/diary.md) or, outside a run, in your next answer to the owner. There is no command and no flag for it."))
})

test('R17: the bootstrap carries only a pointer to the rule', () => {
  assert.ok(using.includes("Act on a reviewer's verdict, final or of a delegate, with the rule of aether:swarm, «Final review findings»."))
  assert.ok(!using.includes('Minor findings are not worked, with ready'))
})

test('R26: the verdict paragraph says the system closes a read-only delegate whose checks pass', () => {
  assert.ok(!using.includes('A read-only delegate did not edit, so `aether-delegate approve` refuses it'))
  assert.ok(using.includes('A read-only delegate whose checks pass is closed by the system when it answers; to redo it, launch a new `AETHER-TASK`. One whose check fails takes `verdict --verdict fix|infeasible`, or `verdict --verdict approve --ignore \'<glob>\'` when the failing files are another writer\'s.'))
})
