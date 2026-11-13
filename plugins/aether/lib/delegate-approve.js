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
const { git, repoPaths, currentBranch } = require('./git.js')
const { runShell } = require('./common.js')

// The refusal text of `verdict --verdict approve` for an editing task with no worktree (lib/delegate-task.js).
const NO_WORKTREE = 'approve needs the worktree of the attempt (--worktree) or the checks of its result'
const MERGE_MAIN = 'merge-main needs a grant'
const UNIT_BRANCH = /^aether\/([^/]+)\/(task-\d+)$/
// The file in the main checkout's .aether directory whose testCommand replaces npm test. Aether only reads it and never
// writes it, so it is not in the map of what Aether writes there (lib/tree-map.js).
const SETTINGS_FILE = 'settings.json'

const gitOrNull = (args, cwd) => {
  try {
    return git(args, cwd, { allowFail: true })
  } catch {
    return null
  }
}

// The last launch of the task and the result of that attempt, from the delegate log, in the launch's session.
function attemptOf(dataDir, task) {
  const entries = log.readEntries(dataDir, { task }).filter((entry) => entry.task === task)
  const launch = entries.filter((entry) => entry.kind === 'launch').at(-1) ?? null
  if (!launch) return { launch: null, result: null }
  const result = entries.filter((entry) => entry.kind === 'result' && entry.attempt === launch.attempt && (entry.session ?? null) === (launch.session ?? null)).at(-1) ?? null
  return { launch, result }
}

// The run and task of an external pair's unit branch, aether/<runId>/<taskId>, or null.
function unitOf(branch) {
  const match = typeof branch === 'string' ? UNIT_BRANCH.exec(branch) : null
  if (!match || !run.isRunId(match[1]) || branch !== run.unitBranch(match[1], match[2])) return null
  return { runId: match[1], taskId: match[2] }
}

// The project's test command: testCommand of SETTINGS_FILE in the main checkout's .aether directory, otherwise npm test.
function testCommand(cwd) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(run.aetherDir(repoPaths(cwd).mainRoot), SETTINGS_FILE), 'utf8'))
    if (typeof parsed.testCommand === 'string' && parsed.testCommand.trim() !== '') return parsed.testCommand.trim()
  } catch {
    // No settings file, or one without testCommand: the default command.
  }
  return 'npm test'
}

// The last JSON line a bin of this plugin printed, or null.
function lastJson(stdout) {
  try {
    return JSON.parse(String(stdout).trim().split('\n').pop())
  } catch {
    return null
  }
}

function binOf(name) {
  return path.join(__dirname, '..', 'bin', name)
}

function mergeMainAllows(cwd, env) {
  const checked = spawnSync(process.execPath, [binOf('aether-autonomy'), 'check', 'merge-main'], { cwd, env, encoding: 'utf8' })
  return checked.status === 0 && lastJson(checked.stdout)?.covered === true
}

// Why the worktree of a delegate on Claude cannot be merged as its HEAD commit, or null: it is not a worktree, or it
// holds work that is not committed, which a merge of its HEAD would leave behind.
function worktreeProblem(worktree) {
  const head = gitOrNull(['rev-parse', 'HEAD'], worktree)
  if (!head || head.status !== 0 || head.stdout === '') return `cannot read the HEAD commit of the worktree ${worktree}`
  const status = gitOrNull(['status', '--porcelain'], worktree)
  if (!status || status.status !== 0) return `cannot read the status of the worktree ${worktree}`
  const files = status.stdout.split('\n').filter(Boolean).map((line) => line.slice(3))
  if (files.length > 0) return `the worktree ${worktree} holds work not committed (${files.join(', ')}): commit it there, then approve again`
  return null
}

function mergeExternal(cwd, env, { runId, taskId }) {
  const merged = spawnSync(process.execPath, [binOf('aether-wt'), 'merge', runId, taskId], { cwd, env, encoding: 'utf8' })
  const body = lastJson(merged.stdout)
  if (merged.status === 0 && body?.merged === true) return { ok: true }
  const reason = body && (body.detail || body.reason || body.error)
  return { ok: false, reason: typeof reason === 'string' && reason !== '' ? reason : `aether-wt merge ${runId} ${taskId} failed` }
}

// A merge that stops on a conflict leaves MERGE_HEAD: it is aborted, and the reason names the files.
function mergeWorktree(cwd, worktree, task) {
  const commit = git(['rev-parse', 'HEAD'], worktree).stdout
  const merged = git(['merge', '--no-ff', '--no-edit', '-m', `Merge delegate ${task}`, commit], cwd, { allowFail: true })
  if (merged.status === 0) return { ok: true }
  const output = [merged.stdout, merged.stderr].filter(Boolean).join('\n')
  if (git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], cwd, { allowFail: true }).status !== 0) return { ok: false, reason: output || 'git merge failed' }
  const files = git(['diff', '--name-only', '--diff-filter=U'], cwd, { allowFail: true }).stdout.split('\n').filter(Boolean)
  git(['merge', '--abort'], cwd, { allowFail: true })
  return { ok: false, reason: `merge conflict in ${files.join(', ') || 'the checkout'}: the merge was aborted` }
}

function stopped(branch, reason) {
  return { approved: false, merged: false, reason, branch }
}

// Gives the approve verdict, merges the edit into cwd's current branch, and runs the project's tests.
// Every refusal before the verdict records nothing.
async function approve(cwd, { task, worktree, ignore = [], env: given = {} } = {}) {
  const env = { ...process.env, ...given }
  const dataDir = run.dataDir(env)
  const branch = gitOrNull(['branch', '--show-current'], cwd)?.stdout ?? ''
  const { launch, result } = typeof task === 'string' ? attemptOf(dataDir, task) : { launch: null }
  if (!launch) return stopped(branch, 'unknown task')
  // An editing task is one with AETHER-OWNS, as delegate-task.js reads it.
  if (launch.edits !== true && !(Array.isArray(launch.owns) && launch.owns.length > 0)) return stopped(branch, 'the task did not edit: judge it with aether-delegate verdict')
  const unit = unitOf(result?.branch)
  const hasWorktree = typeof worktree === 'string' && worktree.trim() !== ''
  if (!unit && !hasWorktree) return stopped(branch, NO_WORKTREE)
  if (!unit) {
    const problem = worktreeProblem(worktree)
    if (problem) return stopped(branch, problem)
  }
  if ((branch === 'main' || branch === 'master') && !mergeMainAllows(cwd, env)) return stopped(branch, MERGE_MAIN)

  const judged = await taskLib.verdict({ task, verdict: 'approve', worktree, ignore }, { dataDir })
  if (!judged.ok) return stopped(branch, judged.error || 'approve was refused')

  const merged = unit ? mergeExternal(cwd, env, unit) : mergeWorktree(cwd, worktree, task)
  const landed = currentBranch(cwd)
  if (!merged.ok) return { approved: true, merged: false, reason: merged.reason, branch: landed }

  const passed = runShell(testCommand(cwd), { cwd, env }).status === 0
  const out = { approved: true, merged: true, tests: passed ? 'passed' : 'failed', branch: landed }
  if (!passed) out.reason = 'the tests failed; the merge was kept'
  return out
}

module.exports = { approve }
