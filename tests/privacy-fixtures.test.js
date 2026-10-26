'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
// The owner's home folder, built from parts so that this file does not contain it.
const PERSONAL = new RegExp('/home/' + 'dark' + 'arty')
const FILES = [...fs.readdirSync(path.join(ROOT, 'tests/fixtures/panel')).map((name) => `tests/fixtures/panel/${name}`), 'plugins/aether/hooks/panel.test.tsx']

test('the panel fixtures hold no path of the owner\'s home folder', () => {
  for (const file of FILES) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), 'utf8'), PERSONAL, file)
})
