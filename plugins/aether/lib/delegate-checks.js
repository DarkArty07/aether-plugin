'use strict'

// Objective checks run on a delegate task's worktree: files changed against owns, test commands,
// and read-only invariants before an approve verdict.
// Family: delegate.

const { nulEntries, runShell } = require('./common.js')
const { git, repoPaths } = require('./git.js')
const { matchesAny } = require('./globs.js')
const { failureSignatures } = require('./baseline.js')

const MAX_FAILURES = 5

function formatFailures(names) {
  const list = Array.isArray(names) ? names : []
  if (list.length === 0) return ''
  const shown = list.slice(0, MAX_FAILURES)
  const more = list.length > MAX_FAILURES ? `, and ${list.length - MAX_FAILURES} more` : ''
  return `${shown.join(', ')}${more}`
}

function changedFiles(worktree, base) {
  const root = repoPaths(worktree).worktree
  const revision = base || 'HEAD'
  const args = ['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', '-z', revision, '--']
  const diffOut = git(args, root, { raw: true }).stdout
  const untrackedOut = git(['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard', '-z'], root, { raw: true }).stdout
  return Array.from(new Set([...nulEntries(diffOut), ...nulEntries(untrackedOut)])).sort()
}

// The commit the work in `worktree` starts from: where the worktree stood before the delegate's
// own commits. When `worktree` is on a named branch whose HEAD is strictly ahead of `base`, it
// tries `forkBase(root, base)` first and returns it whenever the branch has commits of its own
// (`fb !== headSha`), so committed work on a branch still counts even when a non-commit reflog
// entry (such as a reset or checkout) sits above it (issue 278). Otherwise — on a detached HEAD,
// when HEAD is at or not ahead of `base`, or when `forkBase` finds no own commits — it walks the
// worktree's HEAD reflog from the newest entry, skipping `commit...` entries: the first entry
// that is not one of the delegate's own commits is the start, so work the delegate itself
// committed counts while the files of the branch the worktree was made from stay out (issues 143
// and 178). Falls back to `base` when neither path finds a start.
function worktreeBase(worktree, base) {
  try {
    const root = repoPaths(worktree).worktree
    const head = git(['rev-parse', 'HEAD'], root, { allowFail: true })
    const headSha = head.status === 0 && head.stdout ? head.stdout : null
    const branch = git(['branch', '--show-current'], root, { allowFail: true })
    if (branch.status === 0 && branch.stdout && headSha && typeof base === 'string' && base !== '' && headSha !== base) {
      const ancestor = git(['merge-base', '--is-ancestor', base, headSha], root, { allowFail: true })
      if (ancestor.status === 0) {
        const fb = forkBase(root, base)
        if (fb !== headSha) return fb
      }
    }
    const trail = git(['log', '-g', '--format=%H %gs', 'HEAD'], root, { allowFail: true })
    if (trail.status === 0 && trail.stdout) {
      const entries = []
      for (const line of trail.stdout.split('\n')) {
        const entry = /^([0-9a-f]{40})(?: (.*))?$/.exec(line.trim())
        if (entry) entries.push({ sha: entry[1], action: entry[2] || '' })
      }
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        if (!entry.action.startsWith('commit')) {
          const older = entries.slice(i + 1)
          const committedInWorktree = older.some((e) => e.action.startsWith('commit') && e.sha === entry.sha)
          const hasEarlierStart = older.some((e) => !e.action.startsWith('commit'))
          if (committedInWorktree && hasEarlierStart) continue
          if (headSha && entry.sha === headSha && typeof base === 'string' && base !== '' && headSha !== base && entries.some((e) => e.sha === base)) {
            const ancestor = git(['merge-base', '--is-ancestor', base, headSha], root, { allowFail: true })
            if (ancestor.status === 0) return base
          }
          return entry.sha
        }
      }
    }
  } catch {
    // Not a worktree, or the reflog cannot be read: the caller diffs against the launch base as before.
  }
  return base
}

// The commit an external delegate's branch was built on, with no reflog: the branch's own
// commits are the commits of launch-base..head that no other local branch holds, and the branch
// was built on the parent of the oldest one — the commit its first commit was built on. When the
// Lead committed between the launch and the harvest, that commit is on another branch, so it is
// not the branch's own and does not count (issue 178); a branch created at the launch base and
// later reset or fast-forwarded to the harvest commit reads the same way. With no commits of its
// own the branch starts where it stands, and the base stands whenever the fork cannot be read or
// is not at or ahead of it.
function forkBase(worktree, base) {
  if (typeof base !== 'string' || base === '') return base
  try {
    const root = repoPaths(worktree).worktree
    const branch = git(['branch', '--show-current'], root, { allowFail: true })
    if (branch.status !== 0 || !branch.stdout) return base
    const head = git(['rev-parse', 'HEAD'], root, { allowFail: true })
    if (head.status !== 0 || !head.stdout) return base
    if (head.stdout === base) return base
    const refs = git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads'], root, { allowFail: true })
    if (refs.status !== 0) return base
    const others = refs.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '')
      .map((line) => line.split(/\s+/))
      .filter(([, name]) => name !== `refs/heads/${branch.stdout}`)
      .map(([sha]) => sha)
    const range = git(['rev-list', '--reverse', `${base}..${head.stdout}`, ...(others.length > 0 ? ['--not', ...others] : [])], root, { allowFail: true })
    if (range.status !== 0) return base
    const own = range.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '')
    if (own.length === 0) return head.stdout
    const parent = git(['rev-parse', `${own[0]}^`], root, { allowFail: true })
    if (parent.status !== 0 || !parent.stdout) return base
    if (parent.stdout === base) return base
    const ahead = git(['merge-base', '--is-ancestor', base, parent.stdout], root, { allowFail: true })
    if (ahead.status !== 0) return base
    return parent.stdout
  } catch {
    return base
  }
}

function runTests(worktree, command, { timeoutMs = 900000, tailChars = 4000, env = process.env, ...rest } = {}) {
  const r = runShell(command, { cwd: worktree, timeoutMs, env: { ...env, PYTHONDONTWRITEBYTECODE: '1' }, ...rest })
  const timedOut = Boolean(r.error && r.error.code === 'ETIMEDOUT')
  const fullOutput = (r.stdout || '') + (r.stderr || '')
  const outputTail = fullOutput.slice(-tailChars)
  const exitCode = timedOut ? null : (r.status !== null ? r.status : null)
  const passed = !timedOut && exitCode === 0
  const failures = !passed ? failureSignatures(fullOutput) : []
  return { command, exitCode, passed, timedOut, outputTail, failures }
}

function isPythonBytecode(filePath) {
  if (typeof filePath !== 'string' || filePath === '') return false
  return /(?:^|[\\/])__pycache__(?:[\\/]|$)/.test(filePath) || filePath.endsWith('.pyc') || filePath.endsWith('.pyo')
}

function checkEdits({ files = [], owns = [], tests = null } = {}) {
  const fileList = (files || []).filter((f) => !isPythonBytecode(f))
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
  let failures = []
  if (testStatus === 'fail') {
    failures = Array.isArray(tests?.failures)
      ? tests.failures
      : (typeof tests?.outputTail === 'string' ? failureSignatures(tests.outputTail) : [])
    const detail = failures.length > 0 ? ` (not ok: ${formatFailures(failures)})` : ''
    reasons.push(`tests failed${detail}`)
  }
  return {
    kind: 'edits',
    ok,
    empty,
    outside,
    tests: testStatus,
    failures,
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
  worktreeBase,
  forkBase,
  runTests,
  checkEdits,
  checkReadOnly,
  isPythonBytecode,
  formatFailures,
}
