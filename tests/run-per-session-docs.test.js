'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('R11: the Lead rules say the run belongs to the session, how to reach another and how to continue', () => {
  const rules = read('plugins', 'aether', 'skills', 'using-aether', 'SKILL.md')
  assert.ok(rules.includes('A run belongs to the session that opened it.'))
  for (const piece of ['aether-autonomy status <id>', 'aether-autonomy end <id>', 'aether-autonomy continue <id>']) assert.ok(rules.includes(piece), piece)
})

test('R11: the autonomous-runs skill names the id forms under Ceilings and continue under Resuming', () => {
  const skill = read('plugins', 'aether', 'skills', 'autonomous-runs', 'SKILL.md')
  const ceilings = skill.slice(skill.indexOf('**Ceilings.**'), skill.indexOf('**The quota brake.**'))
  assert.ok(ceilings.includes('A run belongs to the session that opened it.'))
  assert.ok(skill.includes('aether-autonomy end <id> --outcome incomplete'))
  const resuming = skill.slice(skill.indexOf('**Resuming.**'), skill.indexOf('**An unreadable run state.**'))
  assert.ok(resuming.includes('aether-autonomy continue <id>'))
})

test('R11: the guides in both languages say the run is per session, and the components table lists continue', () => {
  const guide = read('docs', 'guide', 'autonomy.md')
  assert.ok(guide.includes('A run belongs to the session that opened it.'))
  for (const piece of ['aether-autonomy status <id>', 'aether-autonomy end <id>', 'aether-autonomy continue <id>']) assert.ok(guide.includes(piece), piece)
  const es = read('docs', 'es', 'guias', 'trabajar-horas.md')
  assert.ok(es.includes('Cada sesión abre su propia corrida'))
  assert.ok(es.includes('aether-autonomy continue <id>'))
  const row = read('docs', 'reference', 'components.md').split('\n').find((line) => line.startsWith('| `aether-autonomy` |'))
  assert.ok(row && row.includes('continue'), row)
})
