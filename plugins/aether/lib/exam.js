'use strict'

// The Examiner's exams: acceptance tests kept outside the repository and run against a commit. `aether-exam` and seats.js call it.
// Family: none.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { git, repoPaths } = require('./git.js')
const run = require('./run.js')
const { EXAMINER_SCHEMA, validate } = require('./lane-schemas.js')

const EXAM_DIR = '.aether-exam'
const EXAM_FILE = 'exam.json'
const FEATURE = /^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*$/
const TEST_TIMEOUT_SECONDS = 600
const OUTPUT_CHARS = 2000

function assertFeature(feature) {
  if (typeof feature !== 'string' || !FEATURE.test(feature)) throw new Error(`the feature must be specs/NNN-<topic>, not ${feature}`)
}

// A repository's folder name in the store: its directory's name and a digest of its real path.
function repoKey(mainRoot) {
  const real = run.safeRealpath(mainRoot)
  const digest = crypto.createHash('sha256').update(real).digest('hex').slice(0, 12)
  return `${run.toId(path.basename(real))}-${digest}`
}

function examDir(dataDir, mainRoot, feature) {
  assertFeature(feature)
  return path.join(dataDir, 'exams', repoKey(mainRoot), path.basename(feature))
}

// The first problem of an exam's answer and files, or null.
function examProblem(exam, dir) {
  const problem = validate(EXAMINER_SCHEMA, exam)
  if (problem !== null) return `exam.json: ${problem}`
  if (exam.tests.length === 0) return 'exam.json has no tests'
  const ids = new Set()
  for (const t of exam.tests) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(t.id)) return `test id ${JSON.stringify(t.id)} must be a short name of letters, digits, dots, dashes or underscores`
    if (ids.has(t.id)) return `test id ${t.id} is used twice`
    ids.add(t.id)
    if (t.command.trim() === '') return `test ${t.id} has no command`
    for (const file of t.files) {
      if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) return `test ${t.id} names ${file}, which is not under ${EXAM_DIR}/`
      if (!fs.existsSync(path.join(dir, file))) return `test ${t.id} names ${file}, which is not in the exam`
    }
  }
  return null
}

function readExam(dir) {
  const file = path.join(dir, EXAM_FILE)
  if (!fs.existsSync(file)) throw new Error(`${dir} has no ${EXAM_FILE}`)
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`${file} is not JSON: ${err.message}`)
  }
}

// Keeps the exam in from (its exam.json and files) for feature, in place of any earlier one. With move,
// from is removed afterwards, so the exam leaves the checkout it was written in.
function store(mainRoot, feature, from, { dataDir = run.dataDir(), move = false } = {}) {
  const exam = readExam(from)
  const problem = examProblem(exam, from)
  if (problem !== null) throw new Error(problem)
  const dir = examDir(dataDir, mainRoot, feature)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  fs.cpSync(from, dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'stored.json'), `${JSON.stringify({ feature, storedAt: Date.now(), repo: run.safeRealpath(mainRoot) })}\n`)
  if (move) fs.rmSync(from, { recursive: true, force: true })
  return { feature, dir, tests: exam.tests.length }
}

// The stored exams of a repository, by feature.
function list(mainRoot, { dataDir = run.dataDir() } = {}) {
  const root = path.join(dataDir, 'exams', repoKey(mainRoot))
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(root, entry.name)
      let tests = null
      try {
        tests = readExam(dir).tests.length
      } catch {
        tests = null
      }
      return { feature: `specs/${entry.name}`, dir, tests }
    })
    .sort((a, b) => a.feature.localeCompare(b.feature))
}

function tail(text) {
  const s = String(text || '')
  return s.length > OUTPUT_CHARS ? s.slice(-OUTPUT_CHARS) : s
}

function runTest(command, cwd, timeoutSeconds) {
  const r = spawnSync('sh', ['-c', command], { cwd, encoding: 'utf8', timeout: timeoutSeconds * 1000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 })
  const timedOut = r.error?.code === 'ETIMEDOUT' || (r.status === null && r.signal === 'SIGKILL')
  return { exitCode: r.status, timedOut, output: tail(`${r.stdout || ''}${r.stderr || ''}`) }
}

// Runs feature's exam on ref, in a disposable worktree that gets the exam's files under .aether-exam/.
// Every test runs; one that fails runs once more. ok is true when no test failed.
function runExam(cwd, feature, { ref = 'HEAD', dataDir = run.dataDir(), timeoutSeconds = TEST_TIMEOUT_SECONDS } = {}) {
  const { mainRoot, gitCommonDir } = repoPaths(cwd)
  const dir = examDir(dataDir, mainRoot, feature)
  if (!fs.existsSync(dir)) throw new Error(`no exam is stored for ${feature}`)
  const exam = readExam(dir)
  const commit = git(['rev-parse', '--verify', `${ref}^{commit}`], cwd, { allowFail: true })
  if (commit.status !== 0) throw new Error(`${ref} is not a commit`)
  run.ensureExcluded(gitCommonDir)
  const worktree = path.join(run.aetherDir(mainRoot), 'exams', `${path.basename(feature)}-${run.newRunId()}`)
  fs.mkdirSync(path.dirname(worktree), { recursive: true })
  git(['worktree', 'add', '-q', '--detach', worktree, commit.stdout], cwd)
  try {
    const target = path.join(worktree, EXAM_DIR)
    fs.cpSync(dir, target, { recursive: true })
    const tests = []
    for (const t of exam.tests) {
      const first = runTest(t.command, worktree, timeoutSeconds)
      let status = first.exitCode === 0 ? 'pass' : 'fail'
      let last = first
      if (status === 'fail' && !first.timedOut) {
        last = runTest(t.command, worktree, timeoutSeconds)
        if (last.exitCode === 0) status = 'flaky'
      }
      const entry = { id: t.id, criterion: t.criterion, status, exitCode: last.exitCode }
      if (first.timedOut) entry.timedOut = true
      if (status !== 'pass') entry.output = (status === 'flaky' ? first : last).output
      tests.push(entry)
    }
    const count = (status) => tests.filter((t) => t.status === status).length
    return { feature, ref, commit: commit.stdout, ok: count('fail') === 0, passed: count('pass'), failed: count('fail'), flaky: count('flaky'), tests, notes: exam.notes }
  } finally {
    git(['worktree', 'remove', '--force', worktree], mainRoot, { allowFail: true })
    fs.rmSync(worktree, { recursive: true, force: true })
    git(['worktree', 'prune'], mainRoot, { allowFail: true })
  }
}

module.exports = { EXAM_DIR, EXAM_FILE, repoKey, examDir, examProblem, store, list, runExam }
