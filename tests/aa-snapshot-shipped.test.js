'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'aa-pages.json'), 'utf8'))
const HYDROGEN = ['gemini-4-hydrogen-low', 'gemini-4-hydrogen-medium', 'gemini-4-hydrogen-high', 'gemini-4-hydrogen']
const FLASH = ['gemini-3-8-flash-low', 'gemini-3-8-flash-medium', 'gemini-3-8-flash']
const DAY = /^\d{4}-\d{2}-\d{2}$/

test('the photo has a page for every row that has one, for the four Hydrogen addresses and for the three of Flash, each with its read date and figures with theirs', () => {
  assert.deepEqual(Object.keys(SNAPSHOT), ['pages'])
  // Today's table, whichever rows it has when this test runs: the photo holds at least the pages of its rows.
  const slugs = new Set([...loadPairs().pairs.filter((pair) => !Object.hasOwn(pair, 'estimateOf')).map((pair) => pair.slug), ...HYDROGEN, ...FLASH])
  for (const slug of slugs) {
    const entry = SNAPSHOT.pages[slug]
    assert.ok(entry, `${slug} is in the photo`)
    assert.match(entry.readOn, DAY, slug)
    assert.equal(typeof entry.name, 'string', slug)
    assert.equal(typeof entry.figures.intelligence?.value, 'number', `${slug} has its intelligence`)
    for (const figure of Object.values(entry.figures)) assert.deepEqual([typeof figure.value, DAY.test(figure.on)], ['number', true], slug)
  }
})

test('the photo is the text the reader writes: one line per address, the addresses sorted, and nothing under another key', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'aa-pages.json'), 'utf8')
  assert.equal(require('../scripts/aa-pages.js').serializeSnapshot(SNAPSHOT), text)
  assert.deepEqual(Object.keys(SNAPSHOT.pages), Object.keys(SNAPSHOT.pages).sort())
})
