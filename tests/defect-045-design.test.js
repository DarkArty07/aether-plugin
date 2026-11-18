'use strict'
// Task 7 (defect 045, R5 and R12): text and structure pins for the design
// workflow cleanup, the mapper sentence and the Writer's single-document forms.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

const read = (...parts) => fs.readFileSync(path.join(PLUGIN, ...parts), 'utf8')

test('R5: mapper.md no longer promises the plan context and names the map field', () => {
  const text = read('agents', 'mapper.md')
  assert.equal(text.includes("the plan's context"), false)
  assert.ok(text.includes('Put the lines, one per requirement, in the `map` field of your answer.'))
})
test('R12 (comment 1): the two separate Writer forms do not list disagreements', () => {
  const writer = read('agents', 'writer.md')
  const between = (from, to) => writer.slice(writer.indexOf(from), to ? writer.indexOf(to, writer.indexOf(from) + 1) : undefined)
  // the sections «After plan.md only» and «After tasks.md only» are bounded by the next «**After» heading
  for (const heading of ['**After plan.md only:**', '**After tasks.md only:**']) {
    const next = writer.indexOf('**After', writer.indexOf(heading) + heading.length)
    const form = writer.slice(writer.indexOf(heading), next === -1 ? undefined : next)
    assert.equal(form.includes('disagreements'), false, heading)
  }
})
test('R12 (finding 24): the commit descriptions of the two schemas name only their own document', () => {
  const flow = read('workflows', 'design.workflow.js')
  assert.ok(flow.includes("'your commit of plan.md'") && flow.includes("'your commit of tasks.md'"))
  assert.equal(flow.includes("'your commit of plan.md and tasks.md'"), false)
})
test('R12: the workflow has no second copy of the check loop, one storeExam and no nativeMessage shadow', () => {
  const flow = read('workflows', 'design.workflow.js')
  assert.equal((flow.match(/async function storeExam\(/g) || []).length, 1)
  assert.equal(/const message = nativeText/.test(flow), false)
  assert.ok(flow.includes('const nativeMessage ='))
  assert.equal(flow.includes('the mapper call threw'), false)
})
