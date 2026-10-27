'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const BIN = path.join(__dirname, '..', 'plugins', 'aether', 'bin')
const MAX_LINES = 160

for (const name of fs.readdirSync(BIN)) {
  const text = fs.readFileSync(path.join(BIN, name), 'utf8')
  const code = text.replace(/^\s*\/\/.*$/gm, '')
  test(`${name} only reads arguments and calls lib/`, () => {
    const requires = [...code.matchAll(/require\(([^)]*)\)/g)].map((m) => m[1].trim())
    for (const spec of requires) {
      assert.ok(/^'node:path'$/.test(spec) || /^'node:fs'$/.test(spec) || /lib/.test(spec), `${name} requires ${spec}`)
    }
    for (const forbidden of ['node:child_process', 'node:os', 'node:crypto']) assert.ok(!code.includes(`'${forbidden}'`), `${name} requires ${forbidden}`)
    if (code.includes(`'node:fs'`)) {
      assert.ok(/readFileSync\((0|'\/dev\/stdin')/.test(code), `${name} requires node:fs but does not read stdin`)
    }
    assert.ok(!/\bfs\./.test(code.replace(/readFileSync\((0|'\/dev\/stdin')/g, '')), `${name} uses fs for more than stdin`)
    assert.ok(text.split('\n').length <= MAX_LINES, `${name} has ${text.split('\n').length} lines`)
  })
}
