'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const OTHERS = ['agy', 'codex', 'grok', 'cursor']
const FILES = ['README.md', 'CLAUDE.md', 'docs/methodology.md', 'docs/purpose.md']
const names = (line) => OTHERS.filter((name) => new RegExp(`\\b${name}`, 'i').test(line))
const listsMuse = (text) => text.split('\n').some((line) => /\bmuse\b/i.test(line) && names(line).length >= 2)

test('the overview pages that list the harnesses list Muse with them', () => {
  for (const file of FILES) assert.ok(listsMuse(read(file)), file)
  assert.match(read('docs/models/README.md'), /muse/i)
})

test('no overview page counts the harnesses as four any more', () => {
  for (const file of [...FILES, 'docs/models/README.md']) {
    assert.doesNotMatch(read(file), /\b(four|4) (external )?harnesses\b/i, file)
  }
})

test('the README stays within its limits', () => {
  assert.ok(read('README.md').split('\n').length <= 160)
})
