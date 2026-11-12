'use strict'

// State, views and verdicts for unit worktree delegate ladders.
// Family: wt.

const fs = require('node:fs')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const run = require('./run.js')
const { digest: computeDigest } = require('./lanes.js')
const { loadLadder, newState, supervisorOf, judge } = require('./ladder.js')
const { loadGraph } = require('./worktrees.js')

function ladderFile(runDir, taskId) {
  return path.join(runDir, 'ladder', `${taskId}.json`)
}

function expectedVerdictFile(runDir, taskId) {
  return path.join(runDir, 'ladder', `${taskId}-verdict.json`)
}

function initialRecord(ladder) {
  const firstRung = ladder.rungs[0]
  const state = newState(ladder)
  const next = {
    step: firstRung.step,
    kind: 'first',
    cause: null,
    effort: firstRung.effort,
    carry: false,
  }
  return { state, next }
}

function buildView(state, next, ladder, taskId) {
  const isOpen = state.status === 'open'
  let step = null
  let model = null
  let effort = null
  let supervisor = null
  let position = null
  const of = ladder.rungs.length

  if (isOpen) {
    const idx = ladder.rungs.findIndex((r) => r.step === state.step)
    if (idx < 0) throw new Error(`ladder: unknown step ${state.step}`)
    const rung = ladder.rungs[idx]
    step = rung.step
    model = rung.model
    effort = rung.effort
    const sup = supervisorOf(ladder, rung.step)
    supervisor = { model: sup.model, effort: sup.effort }
    position = idx + 1
  }

  return {
    task: taskId,
    status: state.status,
    step,
    model,
    effort,
    supervisor,
    position,
    of,
    kind: next.kind,
    cause: next.cause,
    ...(next.reason ? { reason: next.reason } : {}),
    attempts: state.attempts,
    ...(state.blockedCount ? { blockedCount: state.blockedCount } : {}),
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
    if (!['approve', 'fix', 'infeasible', 'attempt'].includes(opts.verdict)) {
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

  let body
  try {
    body = JSON.parse(text)
  } catch (err) {
    throw new Error(`payload is not valid JSON: ${err.message}`)
  }
  const verdict = {
    kind: opts.verdict,
    findings: body.findings,
    reason: body.reason,
    status: body.status,
  }

  const result = judge(record.state, verdict, ladder)
  if (!result.accepted) {
    return { accepted: false, rejection: result.error }
  }

  const updatedRecord = { state: result.state, next: result.next || record.next }
  run.writeJson(stateFile, updatedRecord)

  return {
    accepted: true,
    ...buildView(result.state, updatedRecord.next, ladder, taskId),
  }
}

// A relaunch that names a unit whose ladder is spent starts it a new one: the spent state is kept next to it as
// <task>.spent-<n>.json, so nothing is lost and the report still counts it. A ladder is spent when it is exhausted
// or when the unit was blocked twice for the same cause (the Lead fixes the plan, then relaunches). An open ladder
// is never touched (R3).
function resetSpent(runDir, taskIds) {
  const reset = []
  for (const taskId of taskIds) {
    const file = ladderFile(runDir, taskId)
    if (!fs.existsSync(file)) continue
    const record = run.readJson(file)
    if (!record || !record.state || !['exhausted', 'blocked'].includes(record.state.status)) continue
    let n = 1
    while (fs.existsSync(path.join(runDir, 'ladder', `${taskId}.spent-${n}.json`))) n++
    fs.renameSync(file, path.join(runDir, 'ladder', `${taskId}.spent-${n}.json`))
    reset.push(taskId)
  }
  return reset
}

module.exports = { buildView, ladderCommand, resetSpent }
