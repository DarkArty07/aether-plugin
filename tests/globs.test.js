'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { normalizePattern, isGlob, staticPrefix, patternsOverlap, matchesAny, globToRegExp } = require('../plugins/aether/lib/globs.js')

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
  assert.equal(patternsOverlap('web/*.css', 'web/a.css'), true)
  assert.equal(patternsOverlap('web/*.css', 'web/a.ts'), false)
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

test('the glob functions that run.workflow.js copies behave as lib/globs.js on edge patterns and paths (R15)', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'aether', 'workflows', 'run.workflow.js'), 'utf8')
  const start = text.indexOf('const WILDCARD')
  const end = text.indexOf('// Past eight items')
  assert.ok(start > 0 && end > start, 'the copied block is found in the workflow')
  const copy = new Function(`${text.slice(start, end)}\nreturn { normalizePattern, isGlob, globToRegExp }`)()
  const lib = require('../plugins/aether/lib/globs.js')

  const patterns = ['`src/api/**`', './docs/', ' web\\login\\form.tsx ', '**', '*', 'src/*.js', 'src/**/index', 'a/**/b/*', 'f?.txt', '././x/', 'plain/file.md', '`', '']
  const paths = ['src/api/v1/users', 'src/api/index', 'src/apix/index', 'docs/guide/lanes', 'docs', 'web/login/form.tsx', 'a/x/b/c', 'a/b/c', 'f1.txt', 'f10.txt', 'x/y', 'plain/file.md', 'src/a.js', 'src/deep/a.js', 'src/index']
  for (const pattern of patterns) {
    assert.equal(copy.normalizePattern(pattern), lib.normalizePattern(pattern), `normalizePattern(${JSON.stringify(pattern)})`)
    assert.equal(copy.isGlob(pattern), lib.isGlob(pattern), `isGlob(${JSON.stringify(pattern)})`)
    assert.equal(copy.globToRegExp(pattern).source, lib.globToRegExp(pattern).source, `globToRegExp(${JSON.stringify(pattern)})`)
    for (const file of paths) {
      assert.equal(copy.globToRegExp(pattern).test(file), lib.globToRegExp(pattern).test(file), `${pattern} against ${file}`)
    }
  }
})
