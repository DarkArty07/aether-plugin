'use strict'

// Spec 026 (R30): the guide of the audit exists in English and Spanish with the sections the spec asks for, the index links both,
// the components page names the skill, the bin and the family, and the help links the guides.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const GUIDES = [
  ['docs/guide/audit.md', ['## What it audits', '## How it runs', '## What it does not do', '## Without a network, tests or GitHub', '## Where the report is saved', '## What you take', '## The test rounds']],
  ['docs/es/guias/auditar-un-proyecto.md', ['## Qué audita', '## Cómo corre', '## Qué no hace', '## Sin red, sin tests o sin GitHub', '## Dónde se guarda el reporte', '## Qué tomas', '## Las rondas de prueba']],
]

test('both guides exist with their front matter and their sections, in order', () => {
  for (const [rel, headings] of GUIDES) {
    const text = read(rel)
    const front = text.match(/^---\n([\s\S]*?)\n---\n/)
    assert.ok(front, `${rel} has front matter`)
    assert.match(front[1], /^title: .+$/m)
    assert.match(front[1], /^description: .+$/m)
    assert.match(front[1], /^order: \d+$/m)
    let at = -1
    for (const heading of headings) {
      const i = text.indexOf(`\n${heading}\n`)
      assert.ok(i > at, `${rel}: ${heading} is missing or out of order`)
      at = i
    }
  }
})

test('the guides name the rounds folder, the command, the topics argument and the report folder', () => {
  for (const [rel] of GUIDES) {
    const text = read(rel)
    assert.ok(text.includes('specs/026-project-audit/rounds/'), `${rel} names the rounds folder`)
    assert.ok(text.includes('/aether:audit'), `${rel} names the command`)
    assert.ok(text.includes('--no-tests'), `${rel} names --no-tests`)
    assert.ok(text.includes('report.json'), `${rel} names the saved report`)
    assert.ok(text.includes('aether-audit'), `${rel} names the bin`)
  }
})

test('docs/index.md links both guides and the Spanish index links the Spanish one', () => {
  const index = read('docs/index.md')
  assert.ok(index.includes('](guide/audit.md)'))
  assert.ok(index.includes('](es/guias/auditar-un-proyecto.md)'))
  assert.ok(read('docs/es/index.md').includes('](guias/auditar-un-proyecto.md)'))
})

test('the components page names the skill, the bin and the family, and says the skill adds nothing to a plain session', () => {
  const components = read('docs/reference/components.md')
  assert.ok(components.includes('`audit` skill'))
  assert.ok(components.split('\n').some((line) => line.startsWith('| `aether-audit` |')))
  const family = components.split('\n').find((line) => line.startsWith('| audit |'))
  assert.ok(family)
  for (const name of ['audit-analyze.js', 'audit-clean.js', 'audit-common.js', 'audit-exec.js', 'audit-github.js', 'audit-report.js', 'audit-risk.js', 'audit-scan.js', 'audit-snapshot.js', 'audit-store.js', 'audit-tools.js', 'audit-triage.js', 'audit-verify.js']) {
    assert.ok(family.includes(`\`${name}\``), name)
    assert.ok(fs.existsSync(path.join(ROOT, 'plugins', 'aether', 'lib', name)), `${name} exists`)
  }
  assert.match(components, /The `audit` skill sets the same field/)
})

test('the help links the two guides and both what-aether-adds pages name the command', () => {
  const help = read('plugins/aether/skills/help/SKILL.md')
  assert.ok(help.includes('https://github.com/DarkArty07/aether-plugin/blob/main/docs/guide/audit.md'))
  assert.ok(help.includes('https://github.com/DarkArty07/aether-plugin/blob/main/docs/es/guias/auditar-un-proyecto.md'))
  assert.ok(read('docs/what-aether-adds.md').includes('/aether:audit'))
  assert.ok(read('docs/es/que-agrega-aether.md').includes('/aether:audit'))
})
