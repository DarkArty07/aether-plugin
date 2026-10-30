'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const json = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
const KEYS = {
  'plugins/aether/config/prices.json': ['basis', 'snapshot', 'per', 'sources', 'cacheWriteTtl', 'models'],
  'plugins/aether/config/pairs.json': ['fetchedAt', 'pairs'],
  'plugins/aether/config/lanes.json': ['reserve', 'dryMarkMinutes', 'harnesses'],
  'plugins/aether/config/models/models.json': ['generatedAt', 'source', 'harnesses', 'since', 'listedOn', 'rules', 'models', 'excluded', 'notOffered', 'withoutFigures', 'superseded', 'outOfScope'],
}
const READER = {
  'plugins/aether/config/prices.json': 'plugins/aether/lib/prices.js',
  'plugins/aether/config/pairs.json': 'plugins/aether/lib/pairs.js',
  'plugins/aether/config/lanes.json': 'plugins/aether/lib/lanes.js',
  'plugins/aether/config/models/models.json': 'scripts/build-models-index.js',
}

test('Muse: the declared figures of muse-wonder-full-1.0 stay as the owner left them', () => {
  const lanes = json('plugins/aether/config/lanes.json').harnesses.muse.models['muse-wonder-full-1.0']
  const pair = json('plugins/aether/config/pairs.json').pairs.find((p) => p.id === 'muse/muse-wonder-full-1.0@high')
  const model = json('plugins/aether/config/models/models.json').withoutFigures.find((m) => m.harness === 'muse' && m.model === 'muse-wonder-full-1.0')
  // The pair copies Opus high on the scale of 2026-10-29. The lane block keeps Wonder Full's own max figure, read on 2026-10-30.
  assert.equal(pair.intelligence, 51.7)
  assert.equal(pair.costPerTaskUsd, null)
  assert.ok(pair.ownerDecision.length > 0)
  assert.equal(lanes.aa.intelligence, 49.7)
  assert.equal(lanes.aa.terminalBench, 0.57)
  assert.equal(lanes.aa.checked, '2026-10-30')
  assert.ok(lanes.ownerDecision.length > 0)
  assert.equal(model.profile.price, null)
  assert.equal(model.note, 'offered, with no Artificial Analysis entry, so no figures')
  assert.equal(json('plugins/aether/config/prices.json').models['muse-wonder-full-1.0'], undefined)
})

test('each top-level key of the four tables is the closed list, and its reader names it', () => {
  for (const [file, keys] of Object.entries(KEYS)) {
    assert.deepEqual(Object.keys(json(file)).sort(), [...keys].sort(), file)
    const reader = fs.readFileSync(path.join(ROOT, READER[file]), 'utf8')
    for (const key of keys) {
      if (file.endsWith('prices.json') && key === 'sources') {
        assert.match(fs.readFileSync(path.join(ROOT, 'tests/prices.test.js'), 'utf8'), /prices\.sources/)
      } else {
        assert.ok(reader.includes(key), `${file} ${key}`)
      }
    }
  }
})
