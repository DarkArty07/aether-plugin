'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const lanes = require('../plugins/aether/lib/lanes.js')

const table = lanes.loadConfig(lanes.CONFIG_FILE)
const codex = table.harnesses.codex

test('the lane table gives Codex its three models in its one quota group (R15)', () => {
  assert.equal(codex.command, 'codex')
  assert.deepEqual(codex.groups, { codex: 'Codex plan' })
  assert.deepEqual(Object.keys(codex.models).sort(), ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6.1-terra'])
  for (const model of Object.values(codex.models)) {
    assert.equal(model.group, 'codex')
    assert.ok(typeof model.note === 'string' && model.note.length > 40)
    assert.equal(model.aa.checked, '2026-10-29')
  }
})

test('the roles follow the plan: Sol implements, supervises and reviews, Terra implements and supervises, Luna implements, and nobody takes a design seat (R15)', () => {
  assert.deepEqual(codex.models['gpt-6.1-sol'].roles, ['implementer', 'supervisor', 'reviewer'])
  assert.deepEqual(codex.models['gpt-6.1-terra'].roles, ['implementer', 'supervisor'])
  assert.deepEqual(codex.models['gpt-6-luna'].roles, ['implementer'])
  for (const model of Object.values(codex.models)) for (const seat of ['judge', 'writer', 'examiner']) assert.equal(model.roles.includes(seat), false, seat)
})

test('the figures of AA of the table are those of the max row of 2026-10-29', () => {
  assert.deepEqual(codex.models['gpt-6.1-sol'].aa, { slug: 'gpt-6-1-sol', intelligence: 54.5, terminalBench: 0.561, checked: '2026-10-29' })
  assert.deepEqual(codex.models['gpt-6.1-terra'].aa, { slug: 'gpt-6-1-terra', intelligence: 51, terminalBench: 0.556, checked: '2026-10-29' })
  assert.deepEqual(codex.models['gpt-6-luna'].aa, { slug: 'gpt-6-luna', intelligence: 27.8, terminalBench: 0.126, checked: '2026-10-29' })
})
