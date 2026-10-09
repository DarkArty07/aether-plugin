'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN } = require('./helpers.js')

function agentFile(name) {
  const raw = fs.readFileSync(path.join(PLUGIN, 'agents', `${name}.md`), 'utf8')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  assert.ok(m, `${name}.md starts with frontmatter`)
  return { front: m[1], body: m[2] }
}

function field(front, key) {
  const m = front.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : null
}

test('the Designer runs on Opus at xhigh effort, with a one-hour cache', () => {
  const { front } = agentFile('designer')
  assert.equal(field(front, 'name'), 'designer')
  assert.match(field(front, 'description'), /^"?Aether Designer:/)
  assert.equal(field(front, 'model'), 'opus')
  assert.equal(field(front, 'effort'), 'xhigh')
  assert.equal(field(front, 'maxTurns'), '80')
  assert.match(front, /^experimental:\n {2}cacheTtl: 1h$/m)
  assert.deepEqual(
    field(front, 'tools').split(',').map((s) => s.trim()),
    ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Skill', 'WebFetch', 'WebSearch'],
  )
})

test('the Designer prompt holds the hand-off protocol and the plan rules', () => {
  const { body } = agentFile('designer')
  for (const needle of [
    '## For the owner',
    '## For the Lead',
    '- Stage: approaches | design | spec | plan | question | blocked',
    'aether-voice --session',
    'superpowers:brainstorming',
    'superpowers:writing-plans',
    '**Aether:**',
    '## Aether Execution',
    'aether-plan check',
    'Task N — reason',
  ]) {
    assert.ok(body.includes(needle), `the prompt mentions ${needle}`)
  }
  assert.match(body, /cannot talk to the owner/i)
  assert.match(body, /never implement product code/i)
})

test('the swarm agents run at their set effort: implementers at xhigh, ops at low, reviews at high', () => {
  // Trial 2 found that implementers at medium were one of two causes of its quality gap (2026-10-08).
  assert.equal(field(agentFile('implementer').front, 'effort'), 'xhigh')
  assert.equal(field(agentFile('ops').front, 'effort'), 'low')
  assert.equal(field(agentFile('supervisor').front, 'effort'), 'high')
  assert.equal(field(agentFile('reviewer').front, 'effort'), 'high')
})
