'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')
const { main } = require('../scripts/refresh-lanes.js')

const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'aa-pages.json'), 'utf8'))

test('the shipped table agrees with the photo: the refresh finds no figure to change, and the stored ladder is as the law gives it today', () => {
  const out = main([])
  assert.equal(out.exitCode, 0, out.stdout)
  assert.match(out.stdout, /No figure changed\./)
  assert.match(out.stdout, /Stored ladder: unchanged/)
})

test('every row with a page carries its code figures, the external rows too, dated by the photo', () => {
  for (const pair of loadPairs().pairs.filter((row) => !Object.hasOwn(row, 'estimateOf'))) {
    const figures = SNAPSHOT.pages[pair.slug].figures
    if (!figures.code) continue
    assert.deepEqual([pair.code, pair.codeChecked], [figures.code.value, figures.code.on], pair.id)
    // Since 2026-11-14 the pages may not give the code cost and minutes: when the photo has them they are the row's; when not, the row keeps its earlier ones.
    if (figures.codeCostPerTaskUsd) assert.equal(pair.codeCostPerTaskUsd, figures.codeCostPerTaskUsd.value, pair.id)
    if (figures.codeMinutesPerTask) assert.equal(pair.codeMinutesPerTask, figures.codeMinutesPerTask.value, pair.id)
  }
})

test('the four Hydrogen rows take their intelligence, their cost per task and their dates from the pages of the photo', () => {
  const rows = loadPairs().pairs.filter((pair) => pair.model === 'gemini-4-hydrogen')
  assert.deepEqual(rows.map((pair) => pair.slug), ['gemini-4-hydrogen-low', 'gemini-4-hydrogen-medium', 'gemini-4-hydrogen-high', 'gemini-4-hydrogen'])
  for (const pair of rows) {
    const figures = SNAPSHOT.pages[pair.slug].figures
    assert.deepEqual([pair.intelligence, pair.costPerTaskUsd, pair.checked], [figures.intelligence.value, figures.costPerTaskUsd.value, figures.intelligence.on], pair.id)
  }
})
