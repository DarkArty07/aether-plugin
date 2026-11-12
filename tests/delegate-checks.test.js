'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const { commitIn } = require('./helpers.js')
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

test('Python bytecode in the changed-file list does not count outside Owns (issue 237)', () => {
  const good = checks.checkEdits({
    files: ['src/a.js', '__pycache__/x.cpython-314.pyc', 'foo.pyc', 'tests/__pycache__/t.pyc', 'bar.pyo'],
    owns: ['src/**'],
    tests: { passed: true },
  })
  assert.deepEqual([good.ok, good.empty, good.outside], [true, false, []])

  const bad = checks.checkEdits({
    files: ['src/a.js', 'docs/x.md', '__pycache__/x.cpython-314.pyc', 'foo.pyc'],
    owns: ['src/**'],
    tests: { passed: true },
  })
  assert.deepEqual([bad.ok, bad.empty, bad.outside], [false, false, ['docs/x.md']])
  assert.match(bad.reasons.join(' '), /docs\/x\.md/)
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

test('runTests passes PYTHONDONTWRITEBYTECODE=1 to the command (issue 237)', (t) => {
  const repo = makeRepo(t)
  const result = checks.runTests(repo.dir, 'node -e "process.stdout.write(process.env.PYTHONDONTWRITEBYTECODE || \'\')\"')
  assert.equal(result.passed, true)
  assert.equal(result.outputTail, '1')
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

test('runTests treats a command killed by a signal as failed and not timed out', (t) => {
  const repo = makeRepo(t)
  const result = checks.runTests(repo.dir, 'node -e "process.kill(process.pid, \'SIGKILL\')"')
  assert.equal(result.passed, false)
  assert.equal(result.timedOut, false)
  const execResult = checks.runTests(repo.dir, 'exec node -e "process.kill(process.pid, \'SIGKILL\')"')
  assert.equal(execResult.passed, false)
  assert.equal(execResult.timedOut, false)
})

test('changedFiles with no base diffs against HEAD and sees staged files', (t) => {
  const repo = makeRepo(t)
  fs.writeFileSync(path.join(repo.dir, 'staged.txt'), 'staged\n')
  repo.git('add', 'staged.txt')
  assert.deepEqual(checks.changedFiles(repo.dir), ['staged.txt'])
})

test('runTests leaves no process alive after a timeout, whatever the shell started (R9)', (t) => {
  const repo = makeRepo(t)
  const pidFile = path.join(repo.dir, 'child.pid')
  const r = checks.runTests(repo.dir, `sleep 60 & echo $! > '${pidFile}'; wait`, { timeoutMs: 400 })
  assert.equal(r.timedOut, true)
  assert.equal(r.passed, false)
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      require('../plugins/aether/lib/common.js').sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false)
})

// ---- the commit the work was built on (issues 143 and 178) ----

test('worktreeBase is the worktree HEAD, or the fallback when HEAD cannot be read', (t) => {
  const repo = makeRepo(t)
  const head = repo.git('rev-parse', 'HEAD')
  assert.equal(checks.worktreeBase(repo.dir, 'fallback'), head)
  fs.writeFileSync(path.join(repo.dir, 'new.txt'), 'uncommitted\n')
  assert.equal(checks.worktreeBase(repo.dir, 'fallback'), head, 'uncommitted changes do not move it')
  assert.equal(checks.worktreeBase(path.join(repo.dir, 'no-such-dir'), 'fallback'), 'fallback')
})

test('worktreeBase starts before the commits the delegate made itself', (t) => {
  const repo = makeRepo(t)
  const base = repo.git('rev-parse', 'HEAD')
  commitIn(repo, repo.dir, 'src/a.js', 'a\n', 'delegate work')
  assert.equal(checks.worktreeBase(repo.dir, base), base)
})

test('worktreeBase in the delegate worktree starts where the worktree was made', (t) => {
  const repo = makeRepo(t)
  const base = repo.git('rev-parse', 'HEAD')
  const wt = path.join(tempDir(t, 'aether-wt-'), 'wt')
  repo.git('worktree', 'add', '--detach', wt, base)
  assert.equal(checks.worktreeBase(wt, base), base)
  commitIn(repo, wt, 'src/a.js', 'a\n', 'delegate work')
  assert.equal(checks.worktreeBase(wt, base), base, 'the delegate commit does not move the start')
})

test('forkBase moves the check base forward to where the branch was built (issue 178)', (t) => {
  const repo = makeRepo(t)
  const launch = repo.git('rev-parse', 'HEAD')
  fs.writeFileSync(path.join(repo.dir, 'lead.txt'), 'lead\n')
  repo.git('add', 'lead.txt')
  repo.git('commit', '-q', '-m', 'lead commits after the launch')
  const harvest = repo.git('rev-parse', 'HEAD')
  repo.git('switch', '-q', '-c', 'unit')
  fs.writeFileSync(path.join(repo.dir, 'work.txt'), 'work\n')
  repo.git('add', 'work.txt')
  repo.git('commit', '-q', '-m', 'delegate work')
  const head = repo.git('rev-parse', 'HEAD')
  assert.equal(checks.forkBase(repo.dir, launch), harvest, 'the Lead commit between launch and harvest does not count')
  assert.equal(checks.forkBase(repo.dir, harvest), harvest, 'a base already at the fork stays')
  assert.equal(checks.forkBase(repo.dir, head), head, 'the base never moves backwards')
  assert.equal(checks.forkBase(repo.dir, 'not-a-commit'), 'not-a-commit', 'an unreadable base is kept as is')
  repo.git('checkout', '-q', '--detach', head)
  assert.equal(checks.forkBase(repo.dir, launch), launch, 'a detached worktree keeps the base')
})


