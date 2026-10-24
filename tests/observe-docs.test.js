'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('the observe guide has its front matter and says what each installation gathers (R16, C6)', () => {
  const page = read('docs', 'guide', 'observe.md')
  const front = /^---\n([\s\S]*?)\n---/.exec(page)
  assert.ok(front, 'front matter')
  assert.match(front[1], /^title: .+/m)
  assert.match(front[1], /^description: .+/m)
  assert.match(front[1], /^order: \d+$/m)
  for (const word of ['standard', 'dev', 'AETHER_OBSERVE']) assert.ok(page.includes(`\`${word}\``), word)
  for (const order of ['claude plugin install aether@aether-plugin', 'scripts/aether-lead --plugin-dir']) assert.ok(page.includes(order), order)
  for (const verb of ['aether-observe hook', 'aether-observe read', 'aether-observe baseline', 'aether-observe status', 'aether-observe forget --yes']) assert.ok(page.includes(verb), verb)
  for (const event of ['PostToolUse', 'PostToolUseFailure', 'StopFailure', 'PreCompact', 'SessionEnd']) assert.ok(page.includes(event), event)
})

test('the guide names the three exemptions of R10 with their reason and the rule of the owner\'s yes', () => {
  const page = read('docs', 'guide', 'observe.md')
  for (const exempt of ['aether-voice', 'start --quote', 'delegates/briefs', '.aether/pending.jsonl']) assert.ok(page.includes(exempt), exempt)
  assert.match(page, /30 days/)
  assert.match(page, /never leaves your machine|nothing leaves your machine/i)
  assert.match(page, /only with your (yes|word|go-ahead)/i)
})

test('the index, the README and CLAUDE.md point to the guide and the bin', () => {
  assert.ok(read('docs', 'index.md').includes('guide/observe.md'))
  assert.ok(read('README.md').includes('docs/guide/observe.md'))
  assert.ok(read('README.md').split('\n').length <= 160)
  assert.ok(read('CLAUDE.md').includes('aether-observe'))
})

test('the components page says the observation hooks do nothing in a plain session (R13)', () => {
  const components = read('docs', 'reference', 'components.md')
  assert.match(components, /observation hooks[^\n]*write and print nothing in a session that is not the Lead's/)
  assert.ok(components.includes('tests/observe-guarantees.test.js'))
})
