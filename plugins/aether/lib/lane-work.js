'use strict'

// The workspaces of lane calls and the checks that run from outside them. An external agent is
// trusted with nothing: the implementer works in its unit worktree, a read-only role works in a
// disposable copy, and these functions look at git afterwards to see what really changed.
// Only paths under <repo>/.aether/lanes/ are removed here.

const fs = require('node:fs')
const path = require('node:path')
const { git, repoPaths } = require('./git.js')
const { matchesAny } = require('./globs.js')
const run = require('./run.js')
const { ensure, loadGraph, uncommittedFiles, changedFiles, unitBase, isWorktreeRoot, diffPackage, betweenMerges } = require('./worktrees.js')

const COMMIT_MESSAGE = 'lanes: commit the work the external agent left uncommitted'
const CALL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

// A read-only role's disposable copy lives in <repo>/.aether/lanes/<run>/<call>.
function readerDir(mainRoot, runId, call) {
  run.assertRunId(runId)
  if (!CALL_ID.test(String(call))) throw new Error(`invalid call id: ${call}`)
  return path.join(run.aetherDir(mainRoot), 'lanes', runId, call)
}

function exists(target) {
  try {
    fs.lstatSync(target)
    return true
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false
    throw err
  }
}

function tmpDir(workdir) {
  const dir = path.join(workdir, '.aether-tmp')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function prepareImplementer(cwd, runId, taskId) {
  const { mainRoot } = repoPaths(cwd)
  const workdir = ensure(cwd, runId, taskId).path
  const brief = path.join(tmpDir(workdir), 'brief.md')
  fs.copyFileSync(path.join(run.runDir(mainRoot, runId), 'briefs', `${taskId}.md`), brief)
  return { workdir, brief }
}

// Drops the copy's registry entry and its directory. True when there was either.
function removeReader(cwd, runId, call) {
  const { mainRoot } = repoPaths(cwd)
  const dir = readerDir(mainRoot, runId, call)
  const present = exists(dir)
  // Git drops the registry entry of a missing directory too, and refuses a path it does not list.
  const unregistered = git(['worktree', 'remove', '--force', dir], mainRoot, { allowFail: true }).status === 0
  if (exists(dir)) fs.rmSync(dir, { recursive: true, force: true })
  return present || unregistered
}

// A detached copy of the unit branch's tip (a supervisor) or of the integration branch's tip (the
// final reviewer, when taskId is null), with the review package and, for a supervisor, the brief.
function prepareReader(cwd, runId, call, { taskId = null } = {}) {
  const { mainRoot, gitCommonDir } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (taskId !== null) {
    run.assertTaskId(taskId)
    if (!graph.tasks[taskId]) throw new Error(`${taskId} is not in run ${runId}`)
  }
  const workdir = readerDir(mainRoot, runId, call)
  const ref = taskId === null ? graph.integration.branch : run.unitBranch(runId, taskId)
  const packageFile = path.join(run.runDir(mainRoot, runId), 'packages', `${taskId === null ? 'final' : taskId}.diff`)
  removeReader(cwd, runId, call)
  run.ensureExcluded(gitCommonDir)
  fs.mkdirSync(path.dirname(workdir), { recursive: true })
  git(['worktree', 'add', '--detach', workdir, ref], mainRoot)
  try {
    const tmp = tmpDir(workdir)
    const copy = path.join(tmp, 'package.diff')
    fs.copyFileSync(packageFile, copy)
    let brief = null
    if (taskId !== null) {
      brief = path.join(tmp, 'brief.md')
      fs.copyFileSync(path.join(run.runDir(mainRoot, runId), 'briefs', `${taskId}.md`), brief)
    }
    return { workdir, brief, package: copy }
  } catch (err) {
    removeReader(cwd, runId, call)
    throw err
  }
}

function statusOf(worktree) {
  return git(['status', '--porcelain', '--untracked-files=all'], worktree, { raw: true }).stdout
}

function unitState(mainRoot, runId, taskId) {
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  if (!isWorktreeRoot(worktree)) return null
  return { head: git(['rev-parse', 'HEAD'], worktree).stdout, status: statusOf(worktree) }
}

function integrationState(mainRoot, graph) {
  return {
    status: statusOf(graph.integration.worktree),
    tip: git(['rev-parse', graph.integration.branch], mainRoot).stdout,
  }
}

// What a check compares against: the unit worktree (null without a task or a worktree) and the
// integration worktree and branch, as they are before a lane call starts. A merge whose tests fail
// commits and then resets the branch, so this reads between merges, as checkIntegration does.
function snapshot(cwd, runId, { taskId = null } = {}) {
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (taskId !== null) run.assertTaskId(taskId)
  return betweenMerges(mainRoot, runId, () => ({
    unit: taskId === null ? null : unitState(mainRoot, runId, taskId),
    integration: integrationState(mainRoot, graph),
  }))
}

// The integration worktree must look as it did, and the branch may only have moved forward, as a
// merge moves it.
function checkIntegration(cwd, runId, before) {
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const now = betweenMerges(mainRoot, runId, () => integrationState(mainRoot, graph))
  if (now.status !== before.integration.status) {
    return { ok: false, detail: 'the integration worktree changed during the lane call' }
  }
  const forward = git(['merge-base', '--is-ancestor', before.integration.tip, now.tip], mainRoot, { allowFail: true })
  if (forward.status !== 0) {
    return { ok: false, detail: 'the integration branch was rewound or rewritten during the lane call' }
  }
  return { ok: true }
}

// Files the unit changed, committed or not, that its task does not own.
function checkOwns(cwd, runId, taskId) {
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const task = graph.tasks[taskId]
  if (!task) throw new Error(`${taskId} is not in run ${runId}`)
  const branch = run.unitBranch(runId, taskId)
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  const touched = new Set(changedFiles(mainRoot, unitBase(mainRoot, graph, branch), branch))
  if (isWorktreeRoot(worktree)) for (const file of uncommittedFiles(worktree)) touched.add(file)
  const files = [...touched].filter((file) => !matchesAny(file, task.owns)).sort()
  return files.length === 0 ? { ok: true } : { ok: false, files }
}

function checkUnitUnchanged(cwd, runId, taskId, before) {
  const { mainRoot } = repoPaths(cwd)
  run.assertTaskId(taskId)
  const now = unitState(mainRoot, runId, taskId)
  const was = before.unit ?? null
  const same = was === null || now === null ? was === now : was.head === now.head && was.status === now.status
  return same ? { ok: true } : { ok: false, detail: 'the unit worktree changed during a read-only lane call' }
}

// Commits what the external agent left in the unit worktree, then packages the unit for review.
function finishImplementer(cwd, runId, taskId) {
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  // In any other directory, git would act on the checkout around it.
  if (!isWorktreeRoot(worktree)) throw new Error(`${worktree} is not a worktree; run aether-wt ensure first`)
  let committed = false
  if (uncommittedFiles(worktree).length > 0) {
    git(['add', '-A'], worktree)
    git(['commit', '-m', COMMIT_MESSAGE], worktree)
    committed = true
  }
  const packageFile = diffPackage(cwd, runId, taskId).path
  return { head: git(['rev-parse', 'HEAD'], worktree).stdout, package: packageFile, committed }
}

module.exports = {
  COMMIT_MESSAGE,
  readerDir,
  prepareImplementer,
  prepareReader,
  removeReader,
  snapshot,
  checkIntegration,
  checkOwns,
  checkUnitUnchanged,
  finishImplementer,
}
