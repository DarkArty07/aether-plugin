'use strict'

// Warnings of an Aether plan that the parse cannot see: the budget of model agents, the tests a task
// leaves out of its Owns, and more to come. Every finding is a warning: it never fails a check and
// never blocks a compile.
// Family: plan.

const fs = require('node:fs')
const path = require('node:path')

const { isGlob, matchesAny } = require('./globs.js')

// Each task needs an implementer and a supervisor at least (issue 80). Max agents counts every model
// agent of the run, so a budget under that is spent before the last tasks start.
const AGENTS_PER_TASK = 2

function budgetWarnings(parsed) {
  const count = parsed.tasks.length
  const need = count * AGENTS_PER_TASK
  if (count === 0 || parsed.execution.maxAgents >= need) return []
  return [
    `Max agents: ${parsed.execution.maxAgents} is the run's total budget of model agents, not its parallelism; ${count} tasks need at least ${need} (an implementer and a supervisor each), so the rest end not-run once it is spent.`,
  ]
}

// A test changed by its source's task is found by name or by text (issue 92). The scan is bounded:
// at most this many files, and no test file of this size or more.
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.worktrees', '.claude'])
const MAX_SCANNED_FILES = 2000
const MAX_TEST_BYTES = 512 * 1024
const TEST_PATH = /(^|\/)tests\/|\.(test|spec)\.[^/]+$/
const DOC_PATH = /\.(md|mdx|txt|rst|adoc)$/i

function isTest(file) {
  return TEST_PATH.test(file)
}

// The literal source files a task owns: not a glob, a folder, a test or a doc.
function sourcesOf(task) {
  return task.owns.filter((pattern) => !pattern.endsWith('/') && !isGlob(pattern) && !isTest(pattern) && !DOC_PATH.test(pattern))
}

// The repo-relative paths of the files under root, in sorted order, up to the scan's limit.
function filesOf(root) {
  const files = []
  const visit = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= MAX_SCANNED_FILES) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) visit(full)
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
  }
  visit(root)
  return files.map((file) => path.relative(root, file).split(path.sep).join('/'))
}

// The test files of the checkout under root, each with its path relative to root.
function testFilesOf(root) {
  return filesOf(root)
    .filter(isTest)
    .filter((rel) => {
      try {
        return fs.statSync(path.join(root, rel)).size < MAX_TEST_BYTES
      } catch {
        return false
      }
    })
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A test exercises a source when its file name is the source's base name, as lib/foo.js is tests/foo.test.js,
// foo.test.ts beside it, or tests/foo-*.test.js; or when its text names the source's path.
function exercises(test, source, root, texts) {
  const base = path.posix.basename(source, path.posix.extname(source))
  const name = new RegExp('^' + escapeRegExp(base) + '(-[^/]*)?\\.(test|spec)\\.[^.]+$')
  if (name.test(path.posix.basename(test))) return true
  if (!texts.has(test)) texts.set(test, fs.readFileSync(path.join(root, test), 'utf8'))
  return new RegExp('(?<![\\w-])' + escapeRegExp(source) + '(?![\\w-])').test(texts.get(test))
}

// The task numbers a task depends on, directly or through other dependencies.
function dependenciesOf(task, byNumber) {
  const seen = new Set()
  const pending = task.dependsOn.map((d) => d.number)
  while (pending.length) {
    const number = pending.pop()
    if (seen.has(number)) continue
    seen.add(number)
    const dependency = byNumber.get(number)
    if (dependency) pending.push(...dependency.dependsOn.map((d) => d.number))
  }
  return seen
}

// Each changed source must come with the tests that exercise it: a test that is no task's, or that the
// task and the tasks it depends on do not own, is warned about. A heuristic: it reads names and text.
function testWarnings(parsed, root) {
  const changing = parsed.tasks.filter((task) => sourcesOf(task).length > 0)
  if (changing.length === 0) return []
  const tests = testFilesOf(root)
  const texts = new Map()
  const byNumber = new Map(parsed.tasks.map((task) => [task.number, task]))
  const warnings = []
  for (const task of changing) {
    const covering = [task, ...[...dependenciesOf(task, byNumber)].map((n) => byNumber.get(n)).filter(Boolean)]
    for (const source of sourcesOf(task)) {
      for (const test of tests) {
        if (!exercises(test, source, root, texts)) continue
        if (covering.some((owner) => matchesAny(test, owner.owns))) continue
        const owned = parsed.tasks.some((owner) => matchesAny(test, owner.owns))
        const reason = owned
          ? 'which is not owned by it or by a task it depends on (directly or through other dependencies)'
          : 'which no task owns'
        warnings.push(`Task ${task.number} changes ${source} but not its test ${test}, ${reason}`)
      }
    }
  }
  return [...new Set(warnings)]
}

// parsed is the result of parsePlan; root is the top of the checkout the plan lives in.
function planWarnings(parsed, root) {
  return [...budgetWarnings(parsed), ...testWarnings(parsed, root)]
}

module.exports = { planWarnings }
