'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const OTHERS = ['agy', 'codex', 'grok', 'cursor']
const FILES = ['docs/guide/lanes.md', 'docs/guide/ops.md', 'docs/guide/troubleshooting.md', 'docs/getting-started.md']
const names = (line) => OTHERS.filter((name) => new RegExp(`\\b${name}`, 'i').test(line))
const listsMuse = (text) => text.split('\n').some((line) => /\bmuse\b/i.test(line) && names(line).length >= 2)

test('every guide that lists the harnesses lists Muse with them', () => {
  for (const file of FILES) assert.ok(listsMuse(read(file)), file)
})

test('no guide counts the harnesses as four any more', () => {
  for (const file of FILES) assert.doesNotMatch(read(file), /\b(four|4) (external )?harnesses\b/i, file)
})

test('the lanes guide has a Muse section that says how a call runs, what it protects and where it falls back', () => {
  const lanes = read('docs/guide/lanes.md')
  const at = lanes.indexOf('\n## Muse')
  assert.notEqual(at, -1, 'a "## Muse" heading')
  const section = lanes.slice(at)
  for (const text of ['muse exec --json', 'contributor', 'sandbox', 'META_API_KEY', 'authRequired', 'environmentError', 'native', 'lane-smoke']) {
    assert.ok(section.includes(text), text)
  }
  assert.doesNotMatch(section, /--yolo[^.\n]*(pass|use)/i, 'the guide never says Aether passes --yolo')
})
