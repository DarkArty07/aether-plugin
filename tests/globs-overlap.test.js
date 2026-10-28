'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { patternsOverlap } = require('../plugins/aether/lib/globs.js')

test('a glob and an unrelated literal file of the same folder do not overlap (issue 98)', () => {
  assert.equal(patternsOverlap('tests/workflow*.test.js', 'tests/ladder.test.js'), false)
  assert.equal(patternsOverlap('tests/workflow*.test.js', 'tests/speckit.test.js'), false)
  assert.equal(patternsOverlap('tests/delegate-*.test.js', 'tests/lane-delegate.test.js'), false)
  assert.equal(patternsOverlap('tests/delegate-*.test.js', 'tests/speckit.test.js'), false)
  assert.equal(patternsOverlap('tests/delegate-*.test.js', 'tests/delegates-docs.test.js'), false)
})

test('two globs of different prefixes in one folder do not overlap (issue 98)', () => {
  assert.equal(patternsOverlap('tests/delegate-*.test.js', 'tests/workflow*.test.js'), false)
  assert.equal(patternsOverlap('src/*.ts', 'src/*.js'), false)
  assert.equal(patternsOverlap('src/*', 'lib/**'), false)
})

test('a glob overlaps a literal file it matches', () => {
  assert.equal(patternsOverlap('tests/delegate-*.test.js', 'tests/delegate-run.test.js'), true)
  assert.equal(patternsOverlap('tests/*.test.js', 'tests/ladder.test.js'), true)
  assert.equal(patternsOverlap('src/**', 'src/a/b.js'), true)
  assert.equal(patternsOverlap('src/?.ts', 'src/a.ts'), true)
  assert.equal(patternsOverlap('src/?.ts', 'src/ab.ts'), false)
})

test('two globs overlap when one path matches both', () => {
  assert.equal(patternsOverlap('tests/a*.test.js', 'tests/*b.test.js'), true)
  assert.equal(patternsOverlap('src/*/a.js', 'src/b/*.js'), true)
  assert.equal(patternsOverlap('src/**/test.js', 'src/a/b/*.js'), true)
  assert.equal(patternsOverlap('docs/**/*.md', 'src/**'), false)
})

test('a literal folder overlaps a glob that reaches inside it, and nothing else', () => {
  assert.equal(patternsOverlap('src', 'src/*/x.ts'), true)
  assert.equal(patternsOverlap('src/a', 'src/*/x.ts'), true)
  assert.equal(patternsOverlap('src/a', 'src/*.ts'), false)
  assert.equal(patternsOverlap('src/api', 'src/apix/**'), false)
})

test('a pattern the rules do not parse stays an overlap', () => {
  assert.equal(patternsOverlap('src/a**b.js', 'src/c.ts'), true)
})

// `a**` in a name matches across folders (globToRegExp turns it into `.*`), so it reaches paths of more segments.
test('a ** inside a name reaches into the folders below it', () => {
  assert.equal(patternsOverlap('src/a**', 'src/a/b/c.js'), true)
  assert.equal(patternsOverlap('src/a/b/c.js', 'src/a**'), true)
})
