'use strict'

// A unit's wait for a fix: open it, measure it with ticks, close it, and take the Lead's delivery or declination.
// Family: wt.

const fs = require('node:fs')
const path = require('node:path')
const { git, repoPaths } = require('./git.js')
const run = require('./run.js')
const worktrees = require('./worktrees.js')
const { digest: computeDigest } = require('./lanes.js')
const autonomy = require('./autonomy.js')
const { matchesAny } = require('./globs.js')

const OUTCOMES = ['expired', 'ceiling', 'declined', 'merged', 'rejected']

function loadTasks(mainRoot, runId) {
  const graph = worktrees.loadGraph(mainRoot, runId)
  const units = run.readUnits(run.runDir(mainRoot, runId))
  return { ...graph, tasks: { ...units, ...(graph.tasks || {}) } }
}

function readRecord(mainRoot, runId, taskId) {
  const file = run.stuckFile(mainRoot, runId, taskId)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function stuckBegin(cwd, runId, taskId, { payload, digest } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const tasks = loadTasks(mainRoot, runId).tasks
  if (!tasks[taskId]) throw new Error(`${taskId} is not in run ${runId}`)
  const expected = run.stuckPayloadFile(mainRoot, runId, taskId)
  if (typeof payload !== 'string' || path.resolve(payload) !== path.resolve(expected)) {
    throw new Error(`payload path must be ${expected}`)
  }
  if (!fs.existsSync(payload)) throw new Error(`payload file not found: ${payload}`)
  const text = fs.readFileSync(payload, 'utf8')
  if (computeDigest(text) !== digest) throw new Error('digest does not match the payload file')
  let reason = null
  try {
    reason = JSON.parse(text).reason
  } catch {
    reason = null
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new Error('payload reason must be a non-empty string')
  }
  const current = readRecord(mainRoot, runId, taskId)
  if (current && current.state === 'waiting') throw new Error(`${taskId} is already waiting for a fix`)
  const task = tasks[taskId]
  const salvaged = worktrees.salvageUnit(cwd, runId, taskId)
  const outside = (salvaged.files || []).filter((file) => !matchesAny(file, task.owns))
  const left = (salvaged.left || []).filter((file) => !matchesAny(file, task.owns))
  const branch = run.unitBranch(runId, taskId)
  let head = salvaged.head || null
  if (!head) {
    const tip = git(['rev-parse', '--verify', '--quiet', branch], mainRoot, { allowFail: true })
    head = tip.status === 0 && tip.stdout !== '' ? tip.stdout : null
  }
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  const record = { run: runId, task: taskId, reason, branch, worktree, head, outside, left, at: new Date().toISOString(), state: 'waiting' }
  run.writeJson(run.stuckFile(mainRoot, runId, taskId), record)
  return { stuck: true, task: taskId, state: 'waiting', branch, worktree, head, outside, left }
}

function toSeconds(value) {
  let n = null
  if (typeof value === 'number') n = value
  else if (typeof value === 'string') {
    if (value.trim() === '') return null
    n = Number(value.trim())
  } else return null
  if (!Number.isInteger(n) || n < 1 || n > 120) return null
  return n
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function defaultStopped(mainRoot) {
  try {
    const st = autonomy.status(mainRoot)
    return Boolean(st && st.open && st.stop === 'time')
  } catch {
    return false
  }
}

async function stuckTick(cwd, runId, taskId, seconds, { sleep, stopped } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const paused = toSeconds(seconds)
  if (paused === null) throw new Error('--seconds must be a whole number from 1 to 120')
  const { mainRoot } = repoPaths(cwd)
  await (sleep || defaultSleep)(paused * 1000)
  run.writeJson(run.heartbeatFile(mainRoot, runId), { at: new Date().toISOString(), task: taskId })
  const record = readRecord(mainRoot, runId, taskId)
  if (!record) throw new Error(`${taskId} has no stuck record`)
  const stop = Boolean(await (stopped || (() => defaultStopped(mainRoot)))())
  if (record.state === 'delivered') {
    return { paused, state: record.state, stop, commit: record.delivered.commit, reason: record.delivered.reason }
  }
  if (record.state === 'declined') {
    return { paused, state: record.state, stop, reason: record.declined.reason }
  }
  return { paused, state: record.state, stop }
}

function stuckEnd(cwd, runId, taskId, outcome) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  if (!OUTCOMES.includes(outcome)) throw new Error(`unknown outcome: ${outcome}`)
  const { mainRoot } = repoPaths(cwd)
  const record = readRecord(mainRoot, runId, taskId)
  if (!record) throw new Error(`${taskId} has no stuck record`)
  if (record.state === 'ended') {
    return { ended: true, task: taskId, outcome: record.ended.outcome, already: true }
  }
  record.state = 'ended'
  record.ended = { outcome, at: new Date().toISOString() }
  run.writeJson(run.stuckFile(mainRoot, runId, taskId), record)
  return { ended: true, task: taskId, outcome }
}

function readWaiting(mainRoot, runId, taskId) {
  const record = readRecord(mainRoot, runId, taskId)
  if (!record || record.state !== 'waiting') throw new Error(`${taskId} is not waiting for a fix`)
  return record
}

function deliverFix(cwd, runId, taskId, { commit, reason } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  if (typeof commit !== 'string' || commit.trim() === '') throw new Error('deliver needs --commit <sha>')
  if (typeof reason !== 'string' || reason.trim() === '') throw new Error('deliver needs --reason <what you fixed>')
  const { mainRoot } = repoPaths(cwd)
  if (fs.existsSync(run.launchEndFile(mainRoot, runId))) throw new Error(`run ${runId} has ended`)
  const record = readWaiting(mainRoot, runId, taskId)
  const want = commit.trim()
  const resolved = git(['rev-parse', '--verify', '--quiet', `${want}^{commit}`], mainRoot, { allowFail: true })
  if (resolved.status !== 0 || resolved.stdout === '') throw new Error(`${want} is not a commit of this repository`)
  const sha = resolved.stdout
  const branch = run.unitBranch(runId, taskId)
  const tip = git(['rev-parse', '--verify', '--quiet', branch], mainRoot, { allowFail: true })
  if (tip.status !== 0 || tip.stdout !== sha) throw new Error(`the commit must be the tip of ${branch}`)
  record.state = 'delivered'
  record.delivered = { commit: sha, reason, at: new Date().toISOString() }
  run.writeJson(run.stuckFile(mainRoot, runId, taskId), record)
  return { delivered: true, task: taskId, commit: sha, reason }
}

function declineUnit(cwd, runId, taskId, { reason } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  if (typeof reason !== 'string' || reason.trim() === '') throw new Error('decline needs --reason <why>')
  const { mainRoot } = repoPaths(cwd)
  if (fs.existsSync(run.launchEndFile(mainRoot, runId))) throw new Error(`run ${runId} has ended`)
  const record = readWaiting(mainRoot, runId, taskId)
  record.state = 'declined'
  record.declined = { reason, at: new Date().toISOString() }
  run.writeJson(run.stuckFile(mainRoot, runId, taskId), record)
  return { declined: true, task: taskId, reason }
}

module.exports = { OUTCOMES, stuckBegin, stuckTick, stuckEnd, deliverFix, declineUnit }
