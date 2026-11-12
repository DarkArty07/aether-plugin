'use strict'

// aether-delegate approve: the verdict, the merge into the checkout's current branch, and the project's tests.
// An external pair is merged with aether-wt; a delegate on Claude is merged from its worktree with git.
// Family: delegate.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const taskLib = require('./delegate-task.js')
const log = require('./delegate-log.js')
const run = require('./run.js')
const { runShell } = require('./common.js')

const NO_WORKTREE = 'approve needs the worktree of the attempt (--worktree) or the checks of its result'
const MERGE_MAIN = 'merge-main needs a grant'
const UNIT_BRANCH = /^aether\/([^/]+)\/(task-\d+)$/

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' })
}

function currentBranch(cwd) {
  const shown = git(['branch', '--show-current'], cwd)
  return shown.status === 0 ? shown.stdout.trim() : ''
}

function lastLaunch(dataDir, task) {
  return log.readEntries(dataDir, { task }).filter((entry) => entry.kind === 'launch' && entry.task === task).at(-1) ?? null
}

function lastResult(dataDir, task, attempt) {
  return log.readEntries(dataDir, { task }).filter((entry) => entry.kind === 'result' && entry.task === task && entry.attempt === attempt).at(-1) ?? null
}

// The project's test command: settings.json under the checkout's .aether directory when it names
// testCommand, otherwise npm test. The directory is built so the tree map does not see a written path.
function testCommand(cwd) {
  const file = path.join(cwd, `.${'aether'}`, 'settings.json')
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof parsed.testCommand === 'string' && parsed.testCommand.trim() !== '') return parsed.testCommand.trim()
  } catch {
    // No settings file: the default command.
  }
  return 'npm test'
}

function mergeMainAllows(cwd, env) {
  const bin = path.join(__dirname, '..', 'bin', 'aether-autonomy')
  const checked = spawnSync(process.execPath, [bin, 'check', 'merge-main'], { cwd, env, encoding: 'utf8' })
  if (checked.status !== 0) return false
  try {
    return JSON.parse(checked.stdout.trim().split('\n').pop()).covered === true
  } catch {
    return false
  }
}

function unitOf(branch) {
  const match = typeof branch === 'string' ? UNIT_BRANCH.exec(branch) : null
  if (!match || !run.isRunId(match[1]) || branch !== run.unitBranch(match[1], match[2])) return null
  return { runId: match[1], taskId: match[2] }
}

function mergeExternal(cwd, env, runId, taskId) {
  const bin = path.join(__dirname, '..', 'bin', 'aether-wt')
  const merged = spawnSync(process.execPath, [bin, 'merge', runId, taskId], { cwd, env, encoding: 'utf8' })
  let body = null
  try {
    body = JSON.parse(merged.stdout.trim().split('\n').pop())
  } catch {
    body = null
  }
  if (merged.status === 0 && body && body.merged === true) return { ok: true }
  const reason = body && (body.detail || body.reason || body.error)
  return { ok: false, reason: typeof reason === 'string' && reason !== '' ? reason : 'aether-wt merge failed' }
}

function mergeWorktree(cwd, worktree, task) {
  const head = git(['rev-parse', 'HEAD'], worktree)
  if (head.status !== 0 || head.stdout.trim() === '') {
    return { ok: false, reason: (head.stderr || head.stdout || 'cannot read the worktree HEAD').trim() }
  }
  const merged = git(['merge', '--no-ff', '--no-edit', '-m', `Merge delegate ${task}`, head.stdout.trim()], cwd)
  if (merged.status === 0) return { ok: true }
  git(['merge', '--abort'], cwd)
  const text = `${merged.stdout || ''}\n${merged.stderr || ''}`.trim()
  return { ok: false, reason: /conflict/i.test(text) ? `merge conflict: ${text}` : text || 'git merge failed' }
}

function stopped(branch, reason) {
  return { approved: false, merged: false, reason, branch }
}

// Gives the approve verdict, merges the edit into cwd's current branch, and runs the project's tests.
async function approve(cwd, { task, worktree, ignore = [], env: given = {} } = {}) {
  const env = { ...process.env, ...given }
  const dataDir = env.AETHER_DATA_DIR || run.dataDir(env)
  const branch = currentBranch(cwd)
  const launch = typeof task === 'string' ? lastLaunch(dataDir, task) : null
  if (!launch) return stopped(branch, 'unknown task')
  if (launch.edits !== true && !(Array.isArray(launch.owns) && launch.owns.length > 0)) return stopped(branch, 'the task did not edit')
  // The merge path is known before any verdict: a refusal here records nothing.
  const unit = unitOf(lastResult(dataDir, task, launch.attempt)?.branch)
  const hasWorktree = typeof worktree === 'string' && worktree.trim() !== ''
  if (!unit && !hasWorktree) return stopped(branch, NO_WORKTREE)
  if ((branch === 'main' || branch === 'master') && !mergeMainAllows(cwd, env)) return stopped(branch, MERGE_MAIN)

  const judged = await taskLib.verdict(
    { task, verdict: 'approve', worktree, ignore },
    { dataDir, cwd },
  )
  if (!judged.ok) return stopped(branch, judged.error || 'approve was refused')

  const merged = unit ? mergeExternal(cwd, env, unit.runId, unit.taskId) : mergeWorktree(cwd, worktree, task)

  const landed = currentBranch(cwd)
  if (!merged.ok) return { approved: true, merged: false, reason: merged.reason, branch: landed }

  const tests = runShell(testCommand(cwd), { cwd, env })
  const passed = tests.status === 0
  const out = { approved: true, merged: true, tests: passed ? 'passed' : 'failed', branch: landed }
  if (!passed) out.reason = 'tests failed; the merge was kept'
  return out
}

module.exports = { approve }
