'use strict'

// Gate verification for unit worktrees: edits and objective tests.
// Family: wt.

const { repoPaths } = require('./git.js')
const run = require('./run.js')
const { loadGraph, unitBase, isWorktreeRoot, readBaseline } = require('./worktrees.js')
const { changedFiles, checkEdits, runTests } = require('./delegate-checks.js')
const { failureSignatures, judge } = require('./baseline.js')

const DEFAULT_TIMEOUT_MS = 570000

function looksLikePath(name) {
  return typeof name === 'string' && (name.includes('/') || /\.(?:js|ts|py|go)$/.test(name))
}

// The supervisor reads this: the last lines of the run, never the whole tail that the baseline match needs.
const SUMMARY_LINES = 25
const SUMMARY_CHARS = 2000
const summaryOf = (tail) => String(tail || '').split('\n').slice(-SUMMARY_LINES).join('\n').slice(-SUMMARY_CHARS)

function gateCommand(cwd, runId, taskId, opts = {}) {
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
  const testsResult = runTests(worktree, graph.testCommand, { timeoutMs, tailChars: 200000 })

  if (testsResult.timedOut) {
    return {
      pass: false,
      checks: 'fail',
      findings: [{ file: 'npm test', what: 'superó el tiempo límite' }],
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
  const verdict = judge(baseline, { exitCode: testsResult.exitCode, output: testsResult.outputTail })
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

  const allSigs = failureSignatures(testsResult.outputTail)
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

  const fallbackFile = allSigs.find(looksLikePath) || 'npm test'
  const testFindings = rawNames.map((name) => {
    if (looksLikePath(name)) {
      return { file: name, what: 'la prueba falló' }
    }
    return { file: fallbackFile, what: `falló: ${name}` }
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
