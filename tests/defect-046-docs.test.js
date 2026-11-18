'use strict'

// Task docs-046-topics (spec 046, R-decisions/docs): A137 amends A136, the
// search topics come from skill-scout, and the range moves to A1–A137.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
const decisions = () => read('docs/decisions.md')
const row = (id) => decisions().split('\n').find((line) => line.startsWith(`| ${id} |`)) || ''

test('A137 amends A136 with both owner quotes and names skill-scout', () => {
  const a = row('A137')
  assert.ok(a, 'A137 is recorded')
  for (const t of [
    'limitste solo 6 temas? te queivoaste al limitar, y la gente que esos temas no le aplican?',
    'esta bien',
    'skill-scout',
    'A136',
    'config/skills.json',
    'Haiku',
    'intent.md',
    'trusted',
  ]) assert.ok(a.includes(t), t)
  assert.ok(a.includes('Decided 2026-11-18; spec 046; issue #314'), 'the last column reads Decided 2026-11-18; spec 046; issue #314')
})

test('the decision range is A1–A137 in the index', () => {
  assert.ok(read('docs/index.md').includes('A1–A137'), 'docs/index.md names A1–A137')
})

test('the designing skill, the skills skill and both guides name skill-scout', () => {
  for (const f of [
    'plugins/aether/skills/designing/SKILL.md',
    'plugins/aether/skills/skills/SKILL.md',
    'docs/guide/project-files-and-skills.md',
    'docs/es/guias/archivos-skills-y-continuidad.md',
    'docs/guide/design-seats.md',
  ]) assert.ok(read(f).includes('skill-scout'), `${f} names skill-scout`)
})

test('ops.md names --topic for skills find', () => {
  assert.ok(read('docs/guide/ops.md').includes('--topic'), 'docs/guide/ops.md names --topic')
})
