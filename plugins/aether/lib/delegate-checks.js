'use strict'

// Objective checks run on a delegate task's worktree: files changed against owns, test commands,
// and read-only invariants before an approve verdict.
// Family: delegate.

const { spawnSync } = require('node:child_process')
const { nulEntries } = require('./common.js')
const { git, repoPaths } = require('./git.js')
const { matchesAny } = require('./globs.js')

function changedFiles(worktree, base) {
  const root = repoPaths(worktree).worktree
  const revision = base || 'HEAD'
  const args = ['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', '-z', revision, '--']
  const diffOut = git(args, root, { raw: true }).stdout
  const untrackedOut = git(['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard', '-z'], root, { raw: true }).stdout
  return Array.from(new Set([...nulEntries(diffOut), ...nulEntries(untrackedOut)])).sort()
}

function runTests(worktree, command, { timeoutMs = 900000, tailChars = 4000 } = {}) {
  const r = spawnSync(command, {
    cwd: worktree,
    shell: true,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const timedOut = Boolean(r.error && r.error.code === 'ETIMEDOUT')
  const fullOutput = (r.stdout || '') + (r.stderr || '')
  const outputTail = fullOutput.slice(-tailChars)
  const exitCode = timedOut ? null : (r.status !== null ? r.status : null)
  const passed = !timedOut && exitCode === 0
  return { command, exitCode, passed, timedOut, outputTail }
}

function checkEdits({ files = [], owns = [], tests = null } = {}) {
  const fileList = files || []
  const empty = fileList.length === 0
  const outside = fileList.filter((f) => !matchesAny(f, owns || []))
  let testStatus = 'none'
  if (tests && typeof tests.passed === 'boolean') {
    testStatus = tests.passed ? 'pass' : 'fail'
  }
  const ok = !empty && outside.length === 0 && testStatus !== 'fail'
  const reasons = []
  if (empty) {
    reasons.push('task changed no files')
  }
  if (outside.length > 0) {
    reasons.push(`files outside owns: ${outside.join(', ')}`)
  }
  if (testStatus === 'fail') {
    reasons.push('tests failed')
  }
  return {
    kind: 'edits',
    ok,
    empty,
    outside,
    tests: testStatus,
    reasons,
  }
}

function checkReadOnly({ answer, files = [] } = {}) {
  const fileList = files || []
  const outside = fileList
  const empty = answer !== undefined && (typeof answer !== 'string' || answer.trim() === '')
  const ok = !empty && outside.length === 0
  const reasons = []
  if (empty) {
    reasons.push('answer is empty')
  }
  if (outside.length > 0) {
    reasons.push(`files modified in read-only task: ${outside.join(', ')}`)
  }
  return {
    kind: 'read-only',
    ok,
    empty,
    outside,
    reasons,
  }
}

module.exports = {
  changedFiles,
  runTests,
  checkEdits,
  checkReadOnly,
}
