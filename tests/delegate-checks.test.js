'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo } = require('./helpers.js')
const checks = require('../plugins/aether/lib/delegate-checks.js')

function repoWithChanges(t) {
  const repo = makeRepo(t)
  const base = repo.git('rev-parse', 'HEAD')
  fs.mkdirSync(path.join(repo.dir, 'src'))
  fs.mkdirSync(path.join(repo.dir, 'docs'))
  fs.writeFileSync(path.join(repo.dir, 'src', 'a.js'), 'a\n')
  repo.git('add', 'src/a.js')
  repo.git('commit', '-q', '-m', 'add a')
  fs.writeFileSync(path.join(repo.dir, 'docs', 'x.md'), 'untracked\n')
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'more\n')
  return { repo, base }
}

test('changedFiles sees committed, modified and untracked files, sorted', (t) => {
  const { repo, base } = repoWithChanges(t)
  assert.deepEqual(checks.changedFiles(repo.dir, base), ['README.md', 'docs/x.md', 'src/a.js'])
  assert.deepEqual(checks.changedFiles(repo.dir, repo.git('rev-parse', 'HEAD')), ['README.md', 'docs/x.md'])
})

test('a file outside Owns fails the check, with the files named (E9)', () => {
  const result = checks.checkEdits({ files: ['src/a.js', 'docs/x.md'], owns: ['src/**'], tests: { passed: true } })
  assert.deepEqual([result.ok, result.empty, result.outside, result.tests], [false, false, ['docs/x.md'], 'pass'])
  assert.match(result.reasons.join(' '), /docs\/x\.md/)
})

test('an empty task fails the check (E9)', () => {
  const result = checks.checkEdits({ files: [], owns: ['src/**'], tests: null })
  assert.deepEqual([result.ok, result.empty], [false, true])
})

test('failing tests fail the check; no tests do not', () => {
  assert.equal(checks.checkEdits({ files: ['src/a.js'], owns: ['src/**'], tests: { passed: false } }).ok, false)
  assert.equal(checks.checkEdits({ files: ['src/a.js'], owns: ['src/**'], tests: { passed: false } }).tests, 'fail')
  const none = checks.checkEdits({ files: ['src/a.js'], owns: ['src/**'], tests: null })
  assert.deepEqual([none.ok, none.tests], [true, 'none'])
})

test('a read-only delegate must leave the checkout alone and answer something (R6)', () => {
  assert.equal(checks.checkReadOnly({ answer: 'found it', files: [] }).ok, true)
  assert.deepEqual(checks.checkReadOnly({ answer: '  ', files: [] }).empty, true)
  const touched = checks.checkReadOnly({ answer: 'x', files: ['src/a.js'] })
  assert.deepEqual([touched.ok, touched.outside], [false, ['src/a.js']])
  // With no answer given, only the files are checked.
  assert.deepEqual([checks.checkReadOnly({ files: [] }).ok, checks.checkReadOnly({ files: [] }).empty], [true, false])
  assert.equal(checks.checkReadOnly({ files: ['src/a.js'] }).ok, false)
})

test('runTests runs the command in the worktree and reports the exit code', (t) => {
  const { repo } = repoWithChanges(t)
  const pass = checks.runTests(repo.dir, 'node -e "process.exit(0)"')
  assert.deepEqual([pass.passed, pass.exitCode, pass.timedOut], [true, 0, false])
  const fail = checks.runTests(repo.dir, 'node -e "console.log(\'boom\'); process.exit(3)"')
  assert.deepEqual([fail.passed, fail.exitCode], [false, 3])
  assert.match(fail.outputTail, /boom/)
  assert.equal(checks.runTests(repo.dir, 'node -e "setTimeout(() => {}, 5000)"', { timeoutMs: 200 }).timedOut, true)
})

test('changedFiles respects .gitignore and ignores ignored files', (t) => {
  const repo = makeRepo(t)
  const base = repo.git('rev-parse', 'HEAD')
  fs.writeFileSync(path.join(repo.dir, '.gitignore'), 'ignored.txt\n*.log\n')
  repo.git('add', '.gitignore')
  repo.git('commit', '-q', '-m', 'add gitignore')
  fs.writeFileSync(path.join(repo.dir, 'ignored.txt'), 'ignored\n')
  fs.writeFileSync(path.join(repo.dir, 'test.log'), 'log\n')
  fs.writeFileSync(path.join(repo.dir, 'kept.txt'), 'kept\n')
  assert.deepEqual(checks.changedFiles(repo.dir, base), ['.gitignore', 'kept.txt'])
})

test('runTests slices outputTail to the last 4000 characters', (t) => {
  const repo = makeRepo(t)
  const cmd = 'node -e "process.stdout.write(\'A\'.repeat(5000) + \'TAIL_END\')"'
  const result = checks.runTests(repo.dir, cmd)
  assert.equal(result.passed, true)
  assert.equal(result.outputTail.length, 4000)
  assert.match(result.outputTail, /TAIL_END$/)
})

