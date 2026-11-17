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
    'A false approval costs far more than a false rejection',
    'at most 10 findings and 400 words',
  ]) {
    assert.ok(body.includes(needle), `the prompt mentions ${needle}`)
  }
})

test('the Writer runs on Sonnet at high effort, and writes plans with Aether fields', () => {
  const { front, body } = agentFile('writer')
  assert.equal(field(front, 'name'), 'writer')
  assert.equal(field(front, 'model'), 'sonnet')
  assert.equal(field(front, 'effort'), 'high')
  assert.equal(field(front, 'maxTurns'), '100')
  assert.deepEqual(
    field(front, 'tools').split(',').map((s) => s.trim()),
    ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Skill'],
  )
  for (const needle of [
    '`aether:plan`',
    '`aether:tasks`',
    '`aether:art-direction`',
    'art-direction.md',
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

test('the swarm agents run at their set effort, and the supervisor frontmatter sets neither model nor effort', () => {
  // Trial 2 found that implementers at medium were one of two causes of its quality gap (2026-10-08).
  assert.equal(field(agentFile('implementer').front, 'effort'), 'high')
  assert.equal(field(agentFile('ops').front, 'effort'), 'low')
  assert.equal(field(agentFile('supervisor').front, 'model'), null)
  assert.equal(field(agentFile('supervisor').front, 'effort'), null)
  assert.equal(field(agentFile('reviewer').front, 'effort'), 'high')
})

test('the Examiner runs on Opus at high effort, writes only its exam, and never reads tasks.md', () => {
  const { front, body } = agentFile('examiner')
  assert.equal(field(front, 'name'), 'examiner')
  assert.match(field(front, 'description'), /^"?Aether Examiner:/)
  assert.equal(field(front, 'model'), 'opus')
  assert.equal(field(front, 'effort'), 'high')
  assert.equal(field(front, 'maxTurns'), '80')
  assert.deepEqual(
    field(front, 'tools').split(',').map((s) => s.trim()),
    ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  )
  assert.ok(body.includes('**Never read `tasks.md`**'))
  assert.ok(body.includes('- Write only under `.aether/exam/`.'))
  assert.ok(body.includes('**One command per test,** run from the repository root'))
  assert.ok(body.includes('`.aether/exam/exam.json`'))
})

test('the Examiner indexes a test only after running it, and fixes its own defects before indexing (R22, #297)', () => {
  const { body } = agentFile('examiner')
  assert.ok(body.includes('only then add its entry to `.aether/exam/exam.json`'), 'entry goes in only after the run')
  assert.ok(body.includes('fixed before it is indexed'), 'own defects are fixed before indexing')
})

test('the Examiner runs every test on the base tree, uses plan interfaces and sentinels, follows the plan at edges, and starts where a change can show (#283)', () => {
  const { body } = agentFile('examiner')
  for (const needle of [
    'run every test',
    'against the base tree',
    'syntax error',
    'helper that never finds its case',
    'sentinel values',
    'Do not guess them from data files',
    'follow `plan.md` and record the difference in `notes` as an ambiguity',
    'never from a minimum or a maximum',
  ]) {
    assert.ok(body.includes(needle), `examiner.md mentions ${needle}`)
  }
})
