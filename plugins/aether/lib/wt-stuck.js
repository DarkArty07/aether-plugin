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
const { sleep: commonSleep } = require('./common.js')

const OUTCOMES = ['expired', 'ceiling', 'declined', 'merged', 'rejected']

// The same shape adoptUnit accepts: a hex id or a branch-like name, never a leading dash.
const COMMIT_SHAPE = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/

function timeWait(mainRoot, runId, record, endAt) {
  const ms = Date.parse(endAt) - Date.parse(record.at)
  require('./run-timings.js').recordTiming(run.runDir(mainRoot, runId), 'wait-stuck', ms)
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
  const tasks = worktrees.loadRunGraph(mainRoot, runId).tasks
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
  await (sleep || commonSleep)(paused * 1000)
  run.writeJson(run.heartbeatFile(mainRoot, runId), { at: new Date().toISOString(), task: taskId })
  const record = readRecord(mainRoot, runId, taskId)
  if (!record) throw new Error(`${taskId} has no stuck record`)
  const stop = Boolean(await (stopped || (() => defaultStopped(mainRoot)))())
  if (record.state === 'delivered') {
    const out = { paused, state: record.state, stop, commit: record.delivered.commit, reason: record.delivered.reason }
    if (Array.isArray(record.delivered.widen) && record.delivered.widen.length > 0) out.widen = [...record.delivered.widen]
    return out
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
  // A delivered fix is the Lead's answer. expired and ceiling must not rewrite
  // it; the flow reads state delivered and merges. merged, rejected and
  // declined still close the record, and they add no second wait timing.
  if (record.state === 'delivered' && (outcome === 'expired' || outcome === 'ceiling')) {
    return { ended: false, task: taskId, state: 'delivered' }
  }
  const at = new Date().toISOString()
  const waiting = record.state === 'waiting'
  record.state = 'ended'
  record.ended = { outcome, at }
  run.writeJson(run.stuckFile(mainRoot, runId, taskId), record)
  if (waiting) timeWait(mainRoot, runId, record, at)
  return { ended: true, task: taskId, outcome }
}

function readWaiting(mainRoot, runId, taskId) {
  const record = readRecord(mainRoot, runId, taskId)
  if (!record || record.state !== 'waiting') throw new Error(`${taskId} is not waiting for a fix`)
  return record
}

// One widen path, compared exactly as changedFiles returns it, without normalizing.
// Null when the path may be widened; the reason it may not, naming the path, otherwise.
function widenPathError(p) {
  if (typeof p !== 'string' || p === '') return 'invalid widen path "": it must be a non-empty relative file path'
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return `invalid widen path ${p}: it must be relative to the repository`
  if (p.startsWith('./')) return `invalid widen path ${p}: it must not start with ./`
  if (p.includes('\\')) return `invalid widen path ${p}: it must not hold a backslash`
  if (p.endsWith('/')) return `invalid widen path ${p}: it names a file, not a directory`
  if (p.split('/').includes('..')) return `invalid widen path ${p}: it must not hold a .. segment`
  if (/[*?\[]/.test(p)) return `invalid widen path ${p}: globs are not widened`
  return null
}

// The sorted widen list of one --widen flag, or null when no flag was given. Every failing
// path rejects the whole delivery, and the record stays waiting: the throw happens before
// the record is written. Owns comes from loadRunGraph (the graph plus readUnits, so a unit the
// last launch dropped still owns its files), and the merged state from mergedUnits, not
// unitStatus: a merged unit whose branch was removed reads as not merged from its status.
function widenList(mainRoot, cwd, runId, taskId, widen) {
  if (widen === undefined) return null
  if (typeof widen !== 'string') throw new Error('invalid widen flag: it takes a comma-separated list of paths')
  const graph = worktrees.loadRunGraph(mainRoot, runId)
  const tasks = graph.tasks
  const task = tasks[taskId]
  if (!task) throw new Error(`${taskId} is not in run ${runId}`)
  const parts = widen.split(',')
  for (const p of parts) {
    const shape = widenPathError(p)
    if (shape) throw new Error(shape)
  }
  const owns = Array.isArray(task.owns) ? task.owns : []
  for (const p of parts) {
    if (matchesAny(p, owns)) throw new Error(`${p} is already in the Owns of ${taskId}: there is nothing to widen`)
  }
  const branch = run.unitBranch(runId, taskId)
  const changed = worktrees.changedFiles(mainRoot, worktrees.unitBase(mainRoot, graph, branch), branch)
  for (const p of parts) {
    if (!changed.includes(p)) throw new Error(`${p} is not changed by ${branch}: widen names a file the delivery touches`)
  }
  const merged = new Set(worktrees.mergedUnits(cwd, runId))
  for (const p of parts) {
    for (const otherId of Object.keys(tasks).sort()) {
      if (otherId === taskId) continue
      const owns = Array.isArray(tasks[otherId].owns) ? tasks[otherId].owns : []
      if (matchesAny(p, owns) && !merged.has(otherId)) throw new Error(`${p} is in the Owns of ${otherId}, which is not merged: that unit owns it`)
    }
  }
  return [...new Set(parts)].sort()
}

function deliverFix(cwd, runId, taskId, { commit, reason, widen } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  if (typeof commit !== 'string' || commit.trim() === '') throw new Error('deliver needs --commit <sha>')
  if (typeof reason !== 'string' || reason.trim() === '') throw new Error('deliver needs --reason <what you fixed>')
  const { mainRoot } = repoPaths(cwd)
  if (fs.existsSync(run.launchEndFile(mainRoot, runId))) throw new Error(`run ${runId} has ended`)
  const record = readWaiting(mainRoot, runId, taskId)
  const want = commit.trim()
  if (!COMMIT_SHAPE.test(want)) throw new Error(`${want} is not a commit: a commit is a hex id or a branch-like name and must not start with -`)
  const resolved = git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${want}^{commit}`], mainRoot, { allowFail: true })
  if (resolved.status !== 0 || resolved.stdout === '') throw new Error(`${want} is not a commit of this repository`)
  const sha = resolved.stdout
  const branch = run.unitBranch(runId, taskId)
  const tip = git(['rev-parse', '--verify', '--quiet', branch], mainRoot, { allowFail: true })
  if (tip.status !== 0 || tip.stdout !== sha) throw new Error(`the commit must be the tip of ${branch}`)
  const widened = widenList(mainRoot, cwd, runId, taskId, widen)
  const at = new Date().toISOString()
  record.state = 'delivered'
  record.delivered = { commit: sha, reason, at, ...(widened ? { widen: widened } : {}) }
  run.writeJson(run.stuckFile(mainRoot, runId, taskId), record)
  timeWait(mainRoot, runId, record, at)
  return { delivered: true, task: taskId, commit: sha, reason, ...(widened ? { widen: widened } : {}) }
}

function declineUnit(cwd, runId, taskId, { reason } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  if (typeof reason !== 'string' || reason.trim() === '') throw new Error('decline needs --reason <why>')
  const { mainRoot } = repoPaths(cwd)
  if (fs.existsSync(run.launchEndFile(mainRoot, runId))) throw new Error(`run ${runId} has ended`)
  const record = readWaiting(mainRoot, runId, taskId)
  const at = new Date().toISOString()
  record.state = 'declined'
  record.declined = { reason, at }
  run.writeJson(run.stuckFile(mainRoot, runId, taskId), record)
  timeWait(mainRoot, runId, record, at)
  return { declined: true, task: taskId, reason }
}

module.exports = { OUTCOMES, stuckBegin, stuckTick, stuckEnd, deliverFix, declineUnit }
