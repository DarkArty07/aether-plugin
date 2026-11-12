'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { EXTERNAL } = require('../plugins/aether/lib/router-quota.js')
const { RENEWABLE } = require('../plugins/aether/lib/router-renewal.js')
const { DELEGATE_HARNESSES } = require('../plugins/aether/lib/router-pick.js')
const { HARNESSES } = require('../plugins/aether/lib/delegate-calls.js')
const { ALLOWED_HARNESSES } = require('../plugins/aether/lib/lane-delegate.js')
const { HARNESS_NAMES } = require('../plugins/aether/lib/harness-names.js')

const WORKERS = [...HARNESS_NAMES]
const RENEW_USAGE = `renew --harness <${HARNESS_NAMES.join('|')}>`
const RENEW_NEEDS = `--harness needs ${HARNESS_NAMES.slice(0, -1).join(', ')} or ${HARNESS_NAMES.at(-1)}`

test('the five lists of the delegates and the router name Codex in the order of the registry, and cursor in none (R3, R20)', () => {
  for (const list of [EXTERNAL, RENEWABLE, DELEGATE_HARNESSES, HARNESSES, ALLOWED_HARNESSES]) assert.deepEqual(list, WORKERS)
})

test('aether-delegate renew lists the harness names in order (R20, R24)', () => {
  const binPath = path.join(__dirname, '..', 'plugins', 'aether', 'bin', 'aether-delegate')
  const bin = fs.readFileSync(binPath, 'utf8')
  const usage = spawnSync(process.execPath, [binPath], { encoding: 'utf8' })
  assert.match(`${usage.stdout}${usage.stderr}`, new RegExp(RENEW_USAGE.replace(/[<>|]/g, '\\$&')))
  const refused = spawnSync(process.execPath, [binPath, 'renew', '--harness', 'cursor'], { encoding: 'utf8' })
  assert.match(refused.stdout, new RegExp(RENEW_NEEDS.replace(/[.]/g, '\\$&')))
  assert.equal(/codex and cursor (cannot|are not)/.test(bin), false)
})
