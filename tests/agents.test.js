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

test('the Judge runs on Opus at high effort, and can only read', () => {
  const { front } = agentFile('judge')
  assert.equal(field(front, 'name'), 'judge')
  assert.match(field(front, 'description'), /^"?Aether Judge:/)
  assert.equal(field(front, 'model'), 'opus')
  assert.equal(field(front, 'effort'), 'high')
  assert.equal(field(front, 'maxTurns'), '30')
  assert.deepEqual(
    field(front, 'tools').split(',').map((s) => s.trim()),
    ['Read', 'Grep', 'Glob'],
  )
})

test('the Judge rules with evidence, in a short fixed format', () => {
  const { body } = agentFile('judge')
  for (const needle of [
    '## Verdict',
    '## Findings',
    '## Open questions',
    'approve | revise | reject',
    '[blocking | major | minor]',
    'A false approval costs 10-100x more than a false rejection.',
    'at most 10 findings and 400 words',
  ]) {
    assert.ok(body.includes(needle), `the prompt mentions ${needle}`)
  }
})

test('the Writer runs on Sonnet at xhigh effort, and writes plans with Aether fields', () => {
  const { front, body } = agentFile('writer')
  assert.equal(field(front, 'name'), 'writer')
  assert.equal(field(front, 'model'), 'sonnet')
  assert.equal(field(front, 'effort'), 'xhigh')
  assert.equal(field(front, 'maxTurns'), '60')
  assert.deepEqual(
    field(front, 'tools').split(',').map((s) => s.trim()),
    ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Skill'],
  )
  for (const needle of [
    '`aether:plan`',
    '`aether:tasks`',
    '**Aether:**',
    '## Aether Execution',
    'aether-plan check',
    'Task N — reason',
    'specs/NNN-<topic>/tasks.md',
  ]) {
    assert.ok(body.includes(needle), `the prompt mentions ${needle}`)
  }
})

test('the Designer is gone', () => {
  assert.equal(fs.existsSync(path.join(PLUGIN, 'agents', 'designer.md')), false)
})

test('the swarm agents run at their set effort: implementers at xhigh, ops at low, reviews at high', () => {
  // Trial 2 found that implementers at medium were one of two causes of its quality gap (2026-10-08).
  assert.equal(field(agentFile('implementer').front, 'effort'), 'xhigh')
  assert.equal(field(agentFile('ops').front, 'effort'), 'low')
  assert.equal(field(agentFile('supervisor').front, 'effort'), 'high')
  assert.equal(field(agentFile('reviewer').front, 'effort'), 'high')
})
