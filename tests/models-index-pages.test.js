'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { snapshotOf } = require('./aa-page-fixtures.js')
const { buildIndex, buildModels, serialize } = require('../scripts/build-models-index.js')

test('Terminal-Bench is copied only from the snapshot and is omitted when the page has no figure', () => {
  const harnessModels = { harnesses: { agy: { effortVia: 'id', models: ['acme-high', 'other-high', 'missing-high'] } } }
  const pairs = ['acme', 'other', 'missing'].map((model) => ({ harness: 'agy', model, effort: 'high', slug: model, terminalBench: 0.99 }))
  const snapshot = snapshotOf({ acme: { figures: { intelligence: 0, terminalBench: 0 } }, other: { figures: { intelligence: 40 } } })
  const file = buildModels(buildIndex({ harnessModels, pairs, snapshot, harnesses: ['agy'] }))
  assert.equal(file.models[0].scores[0].terminalBench, 0)
  assert.equal(file.models[0].scores[0].intelligence, 0)
  assert.equal(Object.hasOwn(file.models[1].scores[0], 'terminalBench'), false)
  assert.equal(file.models[1].scores[0].priceInput, null)
  assert.deepEqual(file.withoutFigures.map((entry) => entry.model), ['missing'])
  const saved = JSON.parse(serialize(file))
  assert.equal(Object.hasOwn(saved.models[1].scores[0], 'terminalBench'), false)
})
