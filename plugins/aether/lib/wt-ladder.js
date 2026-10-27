'use strict'

// State, views and verdicts for unit worktree delegate ladders.
// Family: wt.

const fs = require('node:fs')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const run = require('./run.js')
const { digest: computeDigest } = require('./lanes.js')
const { loadLadder, newState, effortFor, judge } = require('./ladder.js')
const { loadGraph } = require('./worktrees.js')

function ladderFile(runDir, taskId) {
  return path.join(runDir, 'ladder', `${taskId}.json`)
}

function expectedVerdictFile(runDir, taskId) {
  return path.join(runDir, 'ladder', `${taskId}-verdict.json`)
}

function initialRecord(ladder) {
  const firstStep = ladder.rungs[0].step
  const state = newState(ladder)
  const next = {
    step: firstStep,
    kind: 'first',
    cause: null,
    effort: effortFor(ladder, firstStep, 'first'),
    carry: false,
  }
  return { state, next }
}

function buildView(state, next, ladder, taskId) {
  const isOpen = state.status === 'open'
  let step = null
  let model = null
  let effort = null
  let corrections = null

  if (isOpen) {
    const rung = ladder.rungs.find((r) => r.step === state.step)
    step = rung.step
    model = rung.model
    effort = next.effort
    corrections = rung.corrections
  }

  return {
    task: taskId,
    status: state.status,
    step,
    model,
    effort,
    kind: next.kind,
    cause: next.cause,
    attempts: state.attempts,
    correctionsUsed: state.correctionsUsed,
    corrections,
  }
}

function ladderCommand(cwd, runId, taskId, opts = {}) {
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (!graph.tasks || !graph.tasks[taskId]) {
    throw new Error(`task ${taskId} is not in run ${runId}`)
  }

  const ladder = opts.ladder || loadLadder()
  const runDir = run.runDir(mainRoot, runId)
  const stateFile = ladderFile(runDir, taskId)

  if (opts.verdict !== undefined) {
    if (!['approve', 'fix', 'infeasible'].includes(opts.verdict)) {
      throw new Error(`unknown verdict: ${opts.verdict}`)
    }
    if (opts.payload === undefined) {
      throw new Error('--verdict requires --payload')
    }
  }

  if (opts.payload !== undefined) {
    if (opts.digest === undefined) {
      throw new Error('--payload requires --digest')
    }
    const expected = expectedVerdictFile(runDir, taskId)
    if (path.resolve(opts.payload) !== path.resolve(expected)) {
      throw new Error(`payload path must be ${expected}`)
    }
  }

  if (opts.digest !== undefined && opts.payload === undefined) {
    throw new Error('--digest requires --payload')
  }

  if (opts.verdict === undefined && opts.payload !== undefined) {
    throw new Error('--payload requires --verdict')
  }

  let record
  if (fs.existsSync(stateFile)) {
    record = run.readJson(stateFile)
  } else {
    record = initialRecord(ladder)
  }

  if (opts.verdict === undefined) {
    if (!fs.existsSync(stateFile)) {
      run.writeJson(stateFile, record)
    }
    return buildView(record.state, record.next, ladder, taskId)
  }

  if (!fs.existsSync(opts.payload)) {
    throw new Error(`payload file not found: ${opts.payload}`)
  }

  const text = fs.readFileSync(opts.payload, 'utf8')
  if (computeDigest(text) !== opts.digest) {
    throw new Error('digest does not match the payload file')
  }

  const body = JSON.parse(text)
  const verdict = {
    kind: opts.verdict,
    findings: body.findings,
    reason: body.reason,
  }

  const result = judge(record.state, verdict, ladder)
  if (!result.accepted) {
    return { accepted: false, rejection: result.error }
  }

  const updatedRecord = { state: result.state, next: result.next }
  run.writeJson(stateFile, updatedRecord)

  return {
    accepted: true,
    ...buildView(result.state, result.next, ladder, taskId),
  }
}

module.exports = { ladderCommand }
