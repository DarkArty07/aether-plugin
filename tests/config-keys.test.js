'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const LIB = 'plugins/aether/lib/'
const TABLES = {
  'plugins/aether/config/autonomy.json': { keys: ['hours', 'usd'], readers: [`${LIB}autonomy.js`] },
  'plugins/aether/config/observe.json': { keys: ['approval', 'autoIssue', 'blockedByMistake', 'correctionPatterns', 'corrections', 'cost', 'designRounds', 'pairFailureRate', 'pairFailures', 'pairSpeed'], readers: fs.readdirSync(path.join(ROOT, LIB)).filter((f) => /^observe.*\.js$/.test(f)).map((f) => LIB + f) },
  // `about` and `checked` document the file and no code reads them: they are declared as documentation, not as read keys.
  'plugins/aether/config/models/profiles.json': { keys: ['profiles'], docs: ['about', 'checked'], readers: ['scripts/build-models-index.js'] },
  'plugins/aether/config/models/harness-models.json': { keys: ['harnesses'], readers: ['scripts/build-models-index.js'] },
}

for (const [file, { keys, docs = [], readers }] of Object.entries(TABLES)) {
  test(`${file}: its top-level keys are the closed list`, () => {
    assert.deepEqual(Object.keys(JSON.parse(read(file))).sort(), [...keys, ...docs].sort())
  })
  test(`${file}: a reader names each key`, () => {
    const text = readers.map(read).join('\n')
    for (const key of keys) assert.match(text, new RegExp(`\\b${key}\\b`), `${file}: ${key}`)
  })
  test(`${file}: a key nothing reads would be caught`, () => {
    const text = readers.map(read).join('\n')
    assert.doesNotMatch(text, /\bzzNoReaderZz\b/)
  })
}
