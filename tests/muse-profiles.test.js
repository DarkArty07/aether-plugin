'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const profiles = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'config', 'models', 'profiles.json'), 'utf8')).profiles
// The index script finds a profile by the Artificial Analysis family when it has figures for a model, and by the CLI's
// own id (with its dot) when it has none: Wonder Full, the one model the CLI lists, has none (Artificial Analysis
// names no effort for it, and the family name has no version), so its key is its id.
const KEYS = ['muse-spark-1-3', 'muse-wonder-1-0', 'muse-wonder-full-1.0']

test('each Muse model has a profile written from Meta pages, with its sources and the day they were read', () => {
  for (const key of KEYS) {
    const profile = profiles[key]
    assert.ok(profile, key)
    assert.equal(profile.maker, 'Meta', key)
    assert.ok(typeof profile.purpose === 'string' && profile.purpose !== '', key)
    assert.ok(Array.isArray(profile.sources) && profile.sources.length > 0 && profile.sources.every((url) => url.startsWith('https://dev.meta.ai/')), key)
    assert.equal(profile.checked, '2026-10-19', key)
    for (const field of ['name', 'contextTokens', 'defaultEffort', 'efforts', 'price', 'availability', 'caveats']) assert.ok(field in profile, `${key}: ${field}`)
    assert.equal(profile.contextTokens, 1048576, key)
  }
})

test('the two priced models carry their token price, and the subscription-only model has price null', () => {
  assert.deepEqual([profiles['muse-spark-1-3'].price.input, profiles['muse-spark-1-3'].price.output], [1.25, 4.25])
  assert.deepEqual([profiles['muse-wonder-1-0'].price.input, profiles['muse-wonder-1-0'].price.output], [4, 20])
  assert.equal(profiles['muse-wonder-full-1.0'].price, null)
  assert.match(profiles['muse-wonder-full-1.0'].availability, /Power|Maximum/)
})
