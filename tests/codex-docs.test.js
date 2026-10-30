'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const has = (file, phrases) => { const text = read(file); for (const phrase of phrases) assert.ok(text.includes(phrase), `${file} lacks: ${phrase}`) }

test('the guide of lanes tells what Codex is, what it uses, what it leaves out and how its quota is read (R19)', () => {
  has('docs/guide/lanes.md', [
    'GPT-6.1 Sol', 'GPT-6.1 Terra', 'GPT-6 Luna', 'Terra low', 'Terra medium', 'Terra high', 'Terra max', 'Sol max', 'GPT-6 Astra', 'GPT-6.1 Astra', '`ultra`',
    'account/rateLimits/read', 'codex app-server', 'without calling a model', 'codex exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--output-schema',
    'AGENTS.md', 'hooks', 'ChatGPT Plus',
  ])
})

test('every place that lists the harnesses lists Codex, and none calls it unadopted or untested (R3)', () => {
  for (const file of ['README.md', 'docs/getting-started.md', 'docs/guide/ops.md', 'docs/guide/troubleshooting.md', 'docs/guide/lanes.md', 'docs/reference/components.md', 'site/index.html', 'plugins/aether/skills/using-aether/SKILL.md', 'plugins/aether/skills/swarm/SKILL.md']) {
    assert.ok(/codex/i.test(read(file)), file)
  }
  // options.md still says Codex is untested. Task 9 owns that page, and tests/retired-options.test.js
  // still requires the sentence, so this task does not edit it.
  for (const file of ['README.md', 'docs/getting-started.md', 'docs/guide/ops.md', 'docs/guide/troubleshooting.md', 'docs/guide/lanes.md', 'site/index.html']) {
    assert.equal(/codex[^.\n]{0,40}(is|are) not (tested|adopted)|codex and cursor (are )?not (tested|adopted)/i.test(read(file)), false, file)
  }
})

test('the guide of delegates counts Codex among the harnesses a delegate may run on, and records the owner\'s change of 2026-10-29 (R20)', () => {
  const text = read('docs/guide/delegates.md')
  assert.ok(/agy, codex, grok or muse|agy, codex, grok and muse/i.test(text))
  assert.equal(/codex and cursor (cannot|are not)/i.test(text), false)
  assert.ok(text.includes('2026-10-29'))
})

test('the swarm skill says that Codex\'s quota is read without a model and that a failed call runs native (R3)', () => {
  const text = read('plugins/aether/skills/swarm/SKILL.md')
  assert.ok(/codex/i.test(text) && text.includes('without a model call'))
})
