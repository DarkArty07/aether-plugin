'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { EXTERNAL } = require('../plugins/aether/lib/router-quota.js')
const { RENEWABLE } = require('../plugins/aether/lib/router-renewal.js')
const { DELEGATE_HARNESSES } = require('../plugins/aether/lib/router-pick.js')
const { HARNESSES } = require('../plugins/aether/lib/delegate-calls.js')
const { ALLOWED_HARNESSES } = require('../plugins/aether/lib/lane-delegate.js')

const WORKERS = ['agy', 'codex', 'grok', 'muse']

test('the five lists of the delegates and the router name Codex in the order of the registry, and cursor in none (R3, R20)', () => {
  for (const list of [EXTERNAL, RENEWABLE, DELEGATE_HARNESSES, HARNESSES, ALLOWED_HARNESSES]) assert.deepEqual(list, WORKERS)
})

test('aether-delegate renew names codex among the harnesses it renews (R20)', () => {
  const bin = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate'), 'utf8')
  assert.ok(bin.includes('renew --harness <agy|codex|grok|muse>'))
  assert.ok(bin.includes('--harness needs agy, codex, grok or muse'))
  assert.equal(/codex and cursor (cannot|are not)/.test(bin), false)
})
