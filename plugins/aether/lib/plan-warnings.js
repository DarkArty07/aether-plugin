'use strict'

// Warnings of an Aether plan that the parse cannot see: the budget of model agents, the tests a task
// leaves out of its Owns, and more to come. Every finding is a warning: it never fails a check and
// never blocks a compile.
// Family: plan.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

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

// A test exercises a source when its file name is the source's base name, as lib/foo.js is tests/foo.test.js or
// foo.test.ts beside it; or when its text imports the module (require, import or from, with the source's folder and
// base name in the specifier). A test that only mentions the path in a string, or whose name only starts like the
// source's, is not taken for one: those matches were most of the warnings of a real plan.
function textOf(test, root, texts) {
  if (!texts.has(test)) texts.set(test, fs.readFileSync(path.join(root, test), 'utf8'))
  return texts.get(test)
}

function exercises(test, source, root, texts) {
  const { dir, name } = path.posix.parse(source)
  if (new RegExp('^' + escapeRegExp(name) + '\\.(test|spec)\\.[^.]+$').test(path.posix.basename(test))) return true
  const parent = path.posix.basename(dir)
  const module = parent === '' || parent === '.' ? escapeRegExp(name) : `${escapeRegExp(parent)}/${escapeRegExp(name)}`
  const specifier = new RegExp('(?:require\\(|\\bfrom\\s+|\\bimport\\()\\s*[\'"`](?:[^\'"`\\n]*/)?' + module + '(?:\\.[cm]?[jt]s)?[\'"`]')
  return specifier.test(textOf(test, root, texts))
}

// The bins of the checkout and the libs each one loads directly (issue 188): a relative require of a .js file, and a
// path.join(__dirname, ...) whose segments are literal strings. A bin is a file in a folder named bin. The libs a lib
// loads are not followed: a test that runs a bin exercises the libs that bin loads itself, not every lib under them.
const BIN_FOLDER = 'bin'
const REQUIRE_RELATIVE = /require\(\s*['"`](\.{1,2}\/[^'"`]+)['"`]\s*\)/g
const REQUIRE_JOINED = /require\(\s*path\.join\(\s*__dirname((?:\s*,\s*['"`][^'"`]*['"`])+)\s*\)\s*\)/g
const LITERAL = /['"`]([^'"`]*)['"`]/g
const isBin = (file) => path.posix.basename(path.posix.dirname(file)) === BIN_FOLDER

// A Map from each lib (a repo-relative path) to the bins that load it directly, each bin named by its file name.
function binsLoadingLibs(root, files) {
  const known = new Set(files)
  const loads = new Map()
  for (const bin of files) {
    if (!isBin(bin)) continue
    const dir = path.posix.dirname(bin)
    let text
    try {
      if (fs.statSync(path.join(root, bin)).size >= MAX_TEST_BYTES) continue
      text = fs.readFileSync(path.join(root, bin), 'utf8')
    } catch {
      continue
    }
    const targets = [...text.matchAll(REQUIRE_RELATIVE)].map((m) => path.posix.join(dir, m[1]))
    for (const m of text.matchAll(REQUIRE_JOINED)) {
      targets.push(path.posix.join(dir, ...[...m[1].matchAll(LITERAL)].map((s) => s[1])))
    }
    for (const target of targets) {
      const lib = known.has(target) ? target : `${target}.js`
      if (!lib.endsWith('.js') || !known.has(lib)) continue
      if (!loads.has(lib)) loads.set(lib, new Set())
      loads.get(lib).add(path.posix.basename(bin))
    }
  }
  return loads
}

// The helper files of the test folder (issue 188): a file under tests/ that a test requires and that is not a test
// itself. A helper names a bin in a top-level constant, `const X = path.join(..., 'aether-x')` whose last argument is
// the bin's file name, and a test whose text uses X runs that bin. A top-level function of a helper whose body uses
// such a constant stands for that bin too, when a test imports the function by name from the helper. Nothing further
// is followed: a function that reaches the constant through another function does not count.
const TEST_FILE = /\.(test|spec)\.[^/]+$/
const isHelper = (file) => isTest(file) && !TEST_FILE.test(file)
const REQUIRE_DESTRUCTURED = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"`](\.{1,2}\/[^'"`]+)['"`]\s*\)/g
const BIN_CONSTANT = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*path\.(?:join|resolve)\(([^\n;]*)\)/gm
const TOP_LEVEL = /^(?=(?:async\s+)?function\b|(?:const|let|var|class)\b|module\.exports\b)/gm
const IDENTIFIER_EDGE = '\\w$'
const FILE_NAME_EDGE = '\\w-'

// A regular expression for name as a whole word: no character of edge may sit beside it, so a test of aether-thing-extra
// does not name aether-thing, and OLD_THING_BIN does not name THING_BIN.
const wordOf = (name, edge) => new RegExp(`(?<![${edge}])${escapeRegExp(name)}(?![${edge}])`)

// The repo-relative path that a relative require names, with or without .js, or null when the checkout has no such file.
function resolveRequire(from, spec, known) {
  const base = path.posix.join(path.posix.dirname(from), spec)
  return [base, `${base}.js`].find((file) => known.has(file)) || null
}

// The file name that a path call names: its last argument when that is a string literal, after its last slash.
function binNamedBy(args) {
  const m = /['"`]([^'"`]*)['"`]\s*$/.exec(args)
  return m ? m[1].split('/').pop() : null
}

// The top-level declarations of a file, each from its first line to the next declaration.
function topLevelChunks(text) {
  const starts = [...text.matchAll(TOP_LEVEL)].map((m) => m.index)
  return starts.map((start, i) => text.slice(start, i + 1 < starts.length ? starts[i + 1] : text.length))
}

// What the helper files of the checkout stand for: the constants that name a bin (a Map from the identifier to a Set of
// bins), and the functions of each helper whose body uses one (a Map from the helper to a Map from the function to a Set).
function helperIndexOf(root, files, tests, texts) {
  const known = new Set(files)
  const binNames = new Set(files.filter(isBin).map((file) => path.posix.basename(file)))
  const helpers = new Set()
  for (const test of tests) {
    for (const m of textOf(test, root, texts).matchAll(REQUIRE_RELATIVE)) {
      const file = resolveRequire(test, m[1], known)
      if (file !== null && isHelper(file)) helpers.add(file)
    }
  }
  const constants = new Map()
  for (const helper of helpers) {
    for (const m of textOf(helper, root, texts).matchAll(BIN_CONSTANT)) {
      const bin = binNamedBy(m[2])
      if (bin === null || !binNames.has(bin)) continue
      if (!constants.has(m[1])) constants.set(m[1], new Set())
      constants.get(m[1]).add(bin)
    }
  }
  const functions = new Map()
  for (const helper of helpers) {
    const named = new Map()
    for (const chunk of topLevelChunks(textOf(helper, root, texts))) {
      const fn = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(chunk)
      if (!fn) continue
      for (const [name, bins] of constants) {
        if (!wordOf(name, IDENTIFIER_EDGE).test(chunk)) continue
        if (!named.has(fn[1])) named.set(fn[1], new Set())
        for (const bin of bins) named.get(fn[1]).add(bin)
      }
    }
    functions.set(helper, named)
  }
  return { binNames, known, constants, functions }
}

// The bins a test runs, by file name (issue 188): a bin whose file name the test's text names as a whole word; a bin
// that a helper's constant stands for, when the text uses the constant; and a bin that a helper's function stands for,
// when the test imports that function by name from the helper.
function runsOf(test, root, texts, index) {
  const text = textOf(test, root, texts)
  const runs = new Set([...index.binNames].filter((bin) => wordOf(bin, FILE_NAME_EDGE).test(text)))
  for (const [name, bins] of index.constants) {
    if (wordOf(name, IDENTIFIER_EDGE).test(text)) for (const bin of bins) runs.add(bin)
  }
  for (const m of text.matchAll(REQUIRE_DESTRUCTURED)) {
    const named = index.functions.get(resolveRequire(test, m[2], index.known))
    if (!named) continue
    for (const item of m[1].split(',')) {
      const key = item.split(':')[0].trim()
      if (named.has(key)) for (const bin of named.get(key)) runs.add(bin)
    }
  }
  return runs
}

// The bin that a test runs and that loads the source directly, or null (issue 188): the first of the source's bins that
// the test runs (see runsOf).
function binRunning(source, bins, runs) {
  for (const bin of bins.get(source) || []) {
    if (runs.has(bin)) return bin
  }
  return null
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

// One warning lists at most this many files; the rest are counted.
const LISTED = 5
const listed = (items) => (items.length > LISTED ? [...items.slice(0, LISTED), `and ${items.length - LISTED} more`] : items).join(', ')

// Each changed source must come with the tests that exercise it: a test that is no task's, or that the
// task and the tasks it depends on do not own, is warned about, one warning for each task. A heuristic: it
// reads names and imports, and the runs of a bin that loads the source (issue 188).
function testWarnings(parsed, root) {
  const changing = parsed.tasks.filter((task) => sourcesOf(task).length > 0)
  if (changing.length === 0) return []
  const tests = testFilesOf(root)
  const files = filesOf(root)
  const bins = binsLoadingLibs(root, files)
  const texts = new Map()
  const index = helperIndexOf(root, files, tests, texts)
  const runs = new Map()
  const runsOfTest = (test) => {
    if (!runs.has(test)) runs.set(test, runsOf(test, root, texts, index))
    return runs.get(test)
  }
  const byNumber = new Map(parsed.tasks.map((task) => [task.number, task]))
  const warnings = []
  for (const task of changing) {
    const covering = [task, ...[...dependenciesOf(task, byNumber)].map((n) => byNumber.get(n)).filter(Boolean)]
    const sources = new Set()
    const left = new Map()
    for (const source of sourcesOf(task)) {
      for (const test of tests) {
        const direct = exercises(test, source, root, texts)
        const bin = direct ? null : binRunning(source, bins, runsOfTest(test))
        if (!direct && bin === null) continue
        if (covering.some((owner) => matchesAny(test, owner.owns))) continue
        sources.add(source)
        // A test found by its own require or name is listed as such, even when a bin also runs it.
        if (!direct && left.has(test)) continue
        const owner = parsed.tasks.find((other) => matchesAny(test, other.owns))
        const why = owner ? `task ${owner.number} owns it` : 'no task owns it'
        left.set(test, bin === null ? why : `${why}; runs the lib through its bin ${bin}`)
      }
    }
    if (left.size === 0) continue
    const items = [...left].map(([test, why]) => `${test} (${why})`)
    warnings.push(`Task ${task.number} changes ${listed([...sources])} but not the tests that exercise them, which it and the tasks it depends on do not own: ${listed(items)}`)
  }
  return warnings
}

// The first line of node's message about a block that does not parse: the error's own line, not the file's.
function errorLine(stderr) {
  const lines = String(stderr).split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.find((line) => /^\w*Error: /.test(line)) || lines[0] || 'the block does not parse'
}

// The first line of node's error for a block that parses as neither CommonJS nor an ES module, or null
// when it parses. node --check only reads the code: nothing in the block runs.
function syntaxErrorOf(dir, index, code) {
  let error = null
  for (const extension of ['cjs', 'mjs']) {
    const file = path.join(dir, `block-${index}.${extension}`)
    fs.writeFileSync(file, code)
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    if (r.status === 0) return null
    error = errorLine(r.stderr)
  }
  return error
}

// The js and javascript blocks of the plan, each checked for syntax (issue 91). A block in a task is named
// by its task and its place among that task's js blocks; a block outside the tasks is named as such.
const CODE_LANGUAGES = new Set(['js', 'javascript'])

function syntaxWarnings(parsed) {
  const blocks = parsed.codeBlocks.filter((block) => CODE_LANGUAGES.has(block.language))
  if (blocks.length === 0) return []
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-syntax-'))
  const warnings = []
  const places = new Map()
  try {
    blocks.forEach((block, index) => {
      const place = (places.get(block.task) || 0) + 1
      places.set(block.task, place)
      const error = syntaxErrorOf(dir, index, block.code.join('\n'))
      if (error === null) return
      const where = block.task === null ? `Code block ${place} outside the tasks` : `Task ${block.task}, code block ${place}`
      warnings.push(`${where} (line ${block.line} of tasks.md): syntax error: ${error}`)
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return warnings
}

// parsed is the result of parsePlan; root is the top of the checkout the plan lives in.
function planWarnings(parsed, root) {
  return [...budgetWarnings(parsed), ...testWarnings(parsed, root), ...syntaxWarnings(parsed)]
}

module.exports = { planWarnings }
