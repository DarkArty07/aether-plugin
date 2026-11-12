'use strict'
// The Bash parser has a home of its own (spec 036 R12, #232 2): lib/bash-parse.js
// holds commandSegments, dropWrappers, nameOf and redirectTargets, guard.js
// requires and re-exports them, and continuity-posttool.js requires bash-parse.js.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const LIB = path.join(__dirname, '..', 'plugins', 'aether', 'lib')
const parse = require(path.join(LIB, 'bash-parse.js'))
const guard = require(path.join(LIB, 'guard.js'))

const plain = (segments) => segments.map((words) => [...words])

test('requiring bash-parse.js does not load guard.js', () => {
  const script = [
    `require(${JSON.stringify(path.join(LIB, 'bash-parse.js'))})`,
    'const hit = Object.keys(require.cache).some((p) => p.replace(/\\\\/g, "/").endsWith("lib/guard.js"))',
    'if (hit) { console.error("guard.js was loaded"); process.exit(1) }',
  ].join('; ')
  execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), stdio: 'pipe' })
})

test('the four functions read a few command lines as the guard tests expect', () => {
  assert.deepEqual(plain(parse.commandSegments('a && b | c')), [['a'], ['b'], ['c']])
  assert.deepEqual(plain(parse.commandSegments('sudo env X=1 git push')), [['sudo', 'env', 'X=1', 'git', 'push']])
  assert.deepEqual(parse.dropWrappers(['sudo', 'env', 'X=1', 'git', 'push']), ['git', 'push'])
  assert.equal(parse.nameOf(parse.dropWrappers(['sudo', 'env', 'X=1', 'git', 'push'])[0]), 'git')
  assert.equal(parse.nameOf('/usr/bin/git'), 'git')
  assert.equal(parse.nameOf('git'), 'git')
  const [segment] = parse.commandSegments('echo x > f')
  assert.deepEqual([...segment], ['echo', 'x', '>', 'f'])
  assert.deepEqual(parse.redirectTargets(segment), ['f'])
})

test('guard.js still exports the same four names', () => {
  for (const name of ['commandSegments', 'dropWrappers', 'nameOf', 'redirectTargets']) {
    assert.equal(typeof guard[name], 'function', `guard.js exports ${name}`)
    assert.equal(guard[name], parse[name], `guard.js re-exports ${name} from bash-parse.js`)
  }
})

test('continuity-posttool.js no longer mentions guard.js', () => {
  const text = fs.readFileSync(path.join(LIB, 'continuity-posttool.js'), 'utf8')
  assert.equal(text.includes('guard.js'), false)
  assert.ok(text.includes("require('./bash-parse.js')"))
})
