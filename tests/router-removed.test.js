'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PLUGIN = path.join(ROOT, 'plugins', 'aether')
const exists = (...parts) => fs.existsSync(path.join(...parts))

test('the decider, its command, its data and its script are gone (R9)', () => {
  for (const file of ['bin/aether-' + 'route', 'lib/route.js', 'lib/router-criterion.js', 'lib/router-deciders.js', 'lib/router-replay.js', 'lib/router-rungs.js', 'lib/router-reference.js', 'lib/router-report.js', 'hooks/router.mjs', 'config/router']) {
    assert.equal(exists(PLUGIN, file), false, file)
  }
  assert.equal(exists(ROOT, 'scripts', 'build-router-rungs.js'), false)
})

test('the marks, the quota, the renewal and the pair step stay and load (R11)', () => {
  for (const name of ['router-marks', 'router-slow', 'router-quota', 'router-pick', 'router-renewal', 'router-log']) {
    assert.doesNotThrow(() => require(path.join(PLUGIN, 'lib', `${name}.js`)), name)
  }
})

test('no file of the plugin requires a module that is gone', () => {
  const gone = /require\([^)]*(['"/])(route|router-criterion|router-deciders|router-replay|router-rungs|router-reference|router-report)(\.js)?['"]\)/
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
  for (const file of walk(path.join(PLUGIN, 'lib')).concat(walk(path.join(PLUGIN, 'bin')))) {
    assert.equal(gone.test(fs.readFileSync(file, 'utf8')), false, file)
  }
})
