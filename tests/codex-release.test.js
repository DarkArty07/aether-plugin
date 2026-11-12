'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')

test('the manifest, the launcher pin, the README and the changelog all say 0.39.3 (R25 of spec 022, thirteen releases later)', () => {
  assert.equal(JSON.parse(read('plugins/aether/.claude-plugin/plugin.json')).version, '0.39.3')
  assert.ok(read('tests/launcher.test.js').includes("'0.39.3'"))
  const readme = read('README.md')
  assert.equal(readme.split('\n').filter((line) => /^Version \d/.test(line)).length, 1)
  assert.ok(readme.includes('Version 0.39.3 ('))
  const lines = read('docs/changelog.md').split('\n')
  const first = lines.findIndex((line) => /^Version \d+\.\d+\.\d+: /.test(line))
  const firstVersion = lines[first]
  assert.ok(firstVersion.startsWith('Version 0.39.3: ') && /issues 247, 248, 249, 250, 251 and 252/.test(firstVersion), firstVersion)
  const previous = lines.findIndex((line) => line.startsWith('Version 0.39.2: '))
  const following = lines.findIndex((line, i) => i > previous && /^Version \d+\.\d+\.\d+: /.test(line))
  assert.ok(/PYTHONDONTWRITEBYTECODE/.test(lines.slice(previous, following).join('\n')), 'the entry of 0.39.2 says what keeps the bytecode out')
})

test('the decisions record A100 with the owner\'s words and what was decided about Codex (R25)', () => {
  const row = read('docs/decisions.md').split('\n').find((line) => line.startsWith('| A100 |'))
  assert.ok(row, 'A100 is a row of the table')
  for (const phrase of ['Codex', '2026-10-29', 'spec 022', 'GPT-6.1 Sol', 'GPT-6 Astra', 'account/rateLimits/read', 'codex exec', 'fallback']) assert.ok(row.includes(phrase), phrase)
})

test('the guides say that Codex is a work harness, and the roadmap says what is now (R25)', () => {
  assert.ok(read('docs/roadmap.md').split('\n').find((line) => line.startsWith('**Now:**')).includes('version 0.39.3'))
  assert.ok(/codex/i.test(read('docs/reference/components.md')))
})
