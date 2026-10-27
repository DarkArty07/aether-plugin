'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { DEFAULT_DEADLINES, MAX_DEADLINE_MS } = require('../plugins/aether/lib/session.js')

const ROOT = path.join(__dirname, '..')
const manifest = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/aether/.claude-plugin/plugin.json'), 'utf8')).userConfig.deadlines
const row = () => fs.readFileSync(path.join(ROOT, 'docs/guide/options.md'), 'utf8').split('\n').find((line) => line.startsWith('| `deadlines` |'))
const check = (source, copy) => assert.equal(copy, source)

const DEFAULT = () => `quota=${DEFAULT_DEADLINES.quotaMs / 1000}`
const TOP = () => String(MAX_DEADLINE_MS / 1000)
const COPIES = [
  { datum: 'the default deadline in the manifest', source: DEFAULT, copy: () => manifest().default },
  { datum: 'the default deadline in the manifest description', source: DEFAULT, copy: () => manifest().description.match(/Default: (quota=\d+)\./)[1] },
  { datum: 'the top deadline in the manifest description', source: TOP, copy: () => manifest().description.match(/above (\d+) counts as (\d+)/).slice(1).every((n) => n === manifest().description.match(/above (\d+)/)[1]) ? manifest().description.match(/above (\d+)/)[1] : 'two different numbers' },
  { datum: 'the default deadline in the option table', source: DEFAULT, copy: () => row().match(/^\| `deadlines` \| `(quota=\d+)` \|/)[1] },
  { datum: 'the top deadline in the option table', source: TOP, copy: () => row().match(/above (\d+) counts as \1/)[1] },
]

for (const entry of COPIES) {
  test(`${entry.datum} equals the source`, () => check(entry.source(), entry.copy()))
  test(`${entry.datum}: a copy that drifts is caught`, () => assert.throws(() => check(entry.source(), entry.copy() + '0')))
}
