const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const test = require('node:test')
const { checkGroup } = require('./guards-helpers.js')

const FIVE = ['marks', 'pick', 'quota', 'renewal', 'slow'].map((part) => `plugins/aether/lib/router-${part}.js`)
checkGroup('router', FIVE)

test('the five router modules stay, and nothing requires a renamed replacement', () => {
  for (const file of FIVE) {
    assert.equal(fs.existsSync(path.join(__dirname, '..', file)), true, file)
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /require\('\.\/delegate-(marks|pick|quota|renewal|slow)'\)/)
  }
})
