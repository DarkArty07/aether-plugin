'use strict'

// Gate verification for unit worktrees: edits and objective tests.
// Family: wt.

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { repoPaths } = require('./git.js')
const run = require('./run.js')
const { loadGraph, unitBase, isWorktreeRoot, readBaseline } = require('./worktrees.js')
const { changedFiles, checkEdits, runTests } = require('./delegate-checks.js')
const { failureSignatures, judge } = require('./baseline.js')
const { matchesAny } = require('./globs.js')
const { GATE_CUT } = require('./ladder.js')
const { recordTiming } = require('./run-timings.js')

const DEFAULT_TIMEOUT_MS = 570000
const ANSI_COLOR = /\x1b\[[0-9;]*m/g
const MAX_TEST_BYTES = 512 * 1024
const TEST_PATH = /(^|\/)tests?\/|\.(test|spec)\.[^/]+$/

function looksLikePath(name) {
  return typeof name === 'string' && (name.includes('/') || /\.(?:js|ts|py|go)$/.test(name))
}

function normalizeFailureName(raw, worktree) {
  let name = String(raw || '')
  if (typeof worktree === 'string' && worktree !== '') {
    const target = worktree.length > 1 ? worktree.replace(/[/\\]+$/, '') : worktree
    if (target !== '' && target !== '/' && target !== '\\') {
      name = name.replaceAll(target, '<worktree>')
      if (target.includes('\\')) name = name.replaceAll(target.replaceAll('\\', '/'), '<worktree>')
    }
  }
  return name
    .trim()
    .replace(/\s+# time=.*$/, '')
    .replace(/\s*[(\[]\d+(?:\.\d+)?\s*m?s[)\]]$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseTapLocations(output, worktree) {
  const locations = new Map()
  let currentName = null
  let inYaml = false
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.replace(ANSI_COLOR, '')
    const failMatch = /^\s*not ok \d+ - (.+)$/.exec(line)
    if (failMatch) {
      currentName = normalizeFailureName(failMatch[1], worktree)
      inYaml = false
      continue
    }
    if (!currentName) continue
    if (/^\s*---\s*$/.test(line)) {
      inYaml = true
      continue
    }
    if (/^\s*\.\.\.\s*$/.test(line) || /^\s*(?:not )?ok \d+/.test(line)) {
      currentName = null
      inYaml = false
      continue
    }
    if (inYaml) {
      const locMatch = /^\s*location:\s*(.+?)\s*$/.exec(line)
      if (locMatch) {
        let loc = locMatch[1].trim()
        if ((loc.startsWith("'") && loc.endsWith("'")) || (loc.startsWith('"') && loc.endsWith('"'))) {
          loc = loc.slice(1, -1)
        }
        loc = loc.replace(/:\d+(?::\d+)?$/, '')
        if (!locations.has(currentName)) locations.set(currentName, loc)
      }
    }
  }
  return locations
}

function resolveInWorktree(loc, worktree) {
  if (!loc || !worktree) return null
  const wt = path.resolve(worktree)
  const resolved = path.resolve(wt, loc)
  let rel = path.relative(wt, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    try {
      const realWt = fs.realpathSync(wt)
      const realLoc = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved
      rel = path.relative(realWt, realLoc)
    } catch {
      return null
    }
  }
  if (!rel || rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}

function readOwnedTestContents(worktree, owns) {
  let cached = null
  return () => {
    if (cached !== null) return cached
    cached = []
    if (!Array.isArray(owns) || owns.length === 0) return cached
    let tracked = ''
    try {
      tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: worktree, encoding: 'utf8' })
    } catch {
      return cached
    }
    for (const file of tracked.split(/\r?\n/)) {
      if (!file || !TEST_PATH.test(file) || !matchesAny(file, owns)) continue
      const fullPath = path.join(worktree, file)
      try {
        if (fs.statSync(fullPath).size > MAX_TEST_BYTES) continue
        cached.push(fs.readFileSync(fullPath, 'utf8'))
      } catch {
        // ignore unreadable files
      }
    }
    return cached
  }
}

function classifyTestOwn(name, rawLoc, worktree, owns, getOwnedContents) {
  const list = Array.isArray(owns) ? owns : []
  if (rawLoc !== undefined) {
    const rel = resolveInWorktree(rawLoc, worktree)
    if (!rel) return null
    return matchesAny(rel, list)
  }
  if (looksLikePath(name)) {
    const cleaned = name.startsWith('<worktree>/') ? name.slice('<worktree>/'.length) : name
    const rel = resolveInWorktree(cleaned, worktree)
    if (rel && matchesAny(rel, list)) return true
  }
  for (const content of getOwnedContents()) {
    if (content.includes(name)) return true
  }
  return null
}

// The supervisor reads this: the last lines of the run, never the whole tail that the baseline match needs.
const SUMMARY_LINES = 25
const SUMMARY_CHARS = 2000
const summaryOf = (tail) => String(tail || '').split('\n').slice(-SUMMARY_LINES).join('\n').slice(-SUMMARY_CHARS)

// The gate, timed (spec 036 R18): each evaluation (pass or fail) appends one `gate` line
// with its duration to the run's timings. A hard error (no task, no worktree) throws before
// recording and writes nothing; a timing never fails the gate.
function gateCommand(cwd, runId, taskId, opts = {}) {
  const { mainRoot } = repoPaths(cwd)
  const started = Date.now()
  const result = evaluateGate(cwd, runId, taskId, opts)
  recordTiming(run.runDir(mainRoot, runId), 'gate', Date.now() - started)
  return result
}

function evaluateGate(cwd, runId, taskId, opts = {}) {
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (!graph.tasks || !graph.tasks[taskId]) {
    throw new Error(`task ${taskId} is not in run ${runId}`)
  }
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  if (!isWorktreeRoot(worktree)) {
    throw new Error(`unit ${taskId} has no worktree; run aether-wt ensure first`)
  }

  const task = graph.tasks[taskId]
  const branch = run.unitBranch(runId, taskId)
  const base = unitBase(mainRoot, graph, branch)
  const files = changedFiles(worktree, base)
  const edits = checkEdits({ files, owns: task.owns })

  const findings = []
  if (edits.empty) {
    findings.push({ file: (task.owns && task.owns[0]) || '', what: 'el intento no cambió ningún archivo' })
  }
  for (const f of edits.outside) {
    findings.push({ file: f, what: 'fuera de Owns' })
  }
  if (findings.length > 0) {
    return {
      pass: false,
      checks: 'fail',
      findings,
      detail: '',
      tests: '',
      knownFailures: [],
      timedOut: false,
      files,
    }
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  // The baseline match reads the failures the whole output names: a known failure early in a long suite lay outside a
  // tail of 200,000 characters and the unit was sent back for it (issue 134). What goes to the supervisor is cut below.
  const testsResult = runTests(worktree, graph.testCommand, { timeoutMs, tailChars: 64 * 1024 * 1024 })

  if (testsResult.timedOut) {
    return {
      pass: false,
      checks: 'fail',
      findings: [{ ...GATE_CUT }],
      detail: '',
      tests: summaryOf(testsResult.outputTail),
      knownFailures: [],
      timedOut: true,
      files,
    }
  }

  if (testsResult.exitCode === 0) {
    return {
      pass: true,
      checks: 'pass',
      findings: [],
      detail: '',
      tests: summaryOf(testsResult.outputTail),
      knownFailures: [],
      timedOut: false,
      files,
    }
  }

  const baseline = readBaseline(mainRoot, runId)
  const verdict = judge(baseline, { exitCode: testsResult.exitCode, output: testsResult.outputTail }, worktree)
  if (verdict.pass) {
    const knownFailures = verdict.known || []
    return {
      pass: true,
      checks: 'pass',
      findings: [],
      detail: '',
      tests: `known failures only: ${knownFailures.join(', ')}`,
      knownFailures,
      timedOut: false,
      files,
    }
  }

  const allSigs = failureSignatures(testsResult.outputTail, worktree)
  const rawNames = verdict.new ?? allSigs
  if (rawNames.length === 0) {
    return {
      pass: false,
      checks: 'fail',
      findings: [{ file: 'npm test', what: `salió con ${testsResult.exitCode}` }],
      detail: testsResult.outputTail.slice(-1500),
      tests: summaryOf(testsResult.outputTail),
      knownFailures: [],
      timedOut: false,
      files,
    }
  }

  const locations = parseTapLocations(testsResult.outputTail, worktree)
  const getOwnedContents = readOwnedTestContents(worktree, task.owns)
  const fallbackFile = allSigs.find(looksLikePath) || 'npm test'
  const testFindings = rawNames.map((name) => {
    const own = classifyTestOwn(name, locations.get(name), worktree, task.owns, getOwnedContents)
    return looksLikePath(name)
      ? { file: name, what: 'la prueba falló', own }
      : { file: fallbackFile, what: `falló: ${name}`, own }
  })

  return {
    pass: false,
    checks: 'fail',
    findings: testFindings,
    detail: '',
    tests: summaryOf(testsResult.outputTail),
    knownFailures: [],
    timedOut: false,
    files,
  }
}

module.exports = { gateCommand }
