'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizePattern, staticPrefix, patternsOverlap, matchesAny } = require('../plugins/aether/lib/globs.js')

test('normalizePattern strips backticks, ./ and trailing slashes', () => {
  assert.equal(normalizePattern('`src/api/**`'), 'src/api/**')
  assert.equal(normalizePattern('./docs/'), 'docs')
  assert.equal(normalizePattern(' web\\login\\form.tsx '), 'web/login/form.tsx')
})

test('staticPrefix stops at the first wildcard segment', () => {
  assert.equal(staticPrefix('src/api/**'), 'src/api')
  assert.equal(staticPrefix('web/*.css'), 'web')
  assert.equal(staticPrefix('**'), '')
  assert.equal(staticPrefix('docs/api.md'), 'docs/api.md')
})

test('patternsOverlap is true when two patterns can match one path', () => {
  assert.equal(patternsOverlap('src/**', 'src/a.ts'), true)
  assert.equal(patternsOverlap('src/**', 'src/api/**'), true)
  assert.equal(patternsOverlap('src', 'src/a.ts'), true)
  assert.equal(patternsOverlap('**', 'web/login/form.tsx'), true)
  assert.equal(patternsOverlap('web/*.css', 'web/a.ts'), true)
  assert.equal(patternsOverlap('src/a.ts', 'src/a.ts'), true)
})

test('patternsOverlap is false for disjoint files and directories', () => {
  assert.equal(patternsOverlap('src/a.ts', 'src/b.ts'), false)
  assert.equal(patternsOverlap('src/a/**', 'src/b/**'), false)
  assert.equal(patternsOverlap('src/api/**', 'src/apix/**'), false)
})

test('matchesAny matches files against wildcard and plain patterns', () => {
  assert.equal(matchesAny('src/api/x.ts', ['src/api/**']), true)
  assert.equal(matchesAny('src/apix/y.ts', ['src/api/**']), false)
  assert.equal(matchesAny('a/c.ts', ['a/**/c.ts']), true)
  assert.equal(matchesAny('a/b/d/c.ts', ['a/**/c.ts']), true)
  assert.equal(matchesAny('a/b/c.js', ['a/**/*.ts']), false)
  assert.equal(matchesAny('docs/guide/x.md', ['docs']), true)
  assert.equal(matchesAny('README.md', ['README.md']), true)
  assert.equal(matchesAny('README.md.bak', ['README.md']), false)
  assert.equal(matchesAny('f1.txt', ['f?.txt']), true)
  assert.equal(matchesAny('dir/f1.txt', ['f?.txt']), false)
})
