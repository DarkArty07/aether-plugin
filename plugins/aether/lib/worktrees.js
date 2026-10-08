'use strict'

// Unit worktrees: create, package for review, merge, remove and sweep.
// Only paths under <repo>/.aether/ and branches under aether/ are touched.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { git, repoPaths, head } = require('./git.js')
const { matchesAny } = require('./globs.js')
const run = require('./run.js')

function loadGraph(mainRoot, runId) {
  run.assertRunId(runId)
  const file = path.join(run.runDir(mainRoot, runId), 'graph.json')
  if (!fs.existsSync(file)) throw new Error(`run ${runId} has no graph.json; compile the plan first`)
  return run.readJson(file)
}

function assertInside(target, root) {
  const rel = path.relative(root, target)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`refusing to touch ${target}: it is outside ${root}`)
  }
}

function branchExists(mainRoot, branch) {
  return git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], mainRoot, { allowFail: true }).status === 0
}

function unitBase(mainRoot, graph, branch) {
  return git(['merge-base', graph.integration.branch, branch], mainRoot).stdout
}

function ensure(cwd, runId, taskId) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot, gitCommonDir } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (!graph.tasks[taskId]) throw new Error(`${taskId} is not in run ${runId}`)
  run.ensureExcluded(gitCommonDir)
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  const branch = run.unitBranch(runId, taskId)
  if (fs.existsSync(worktree)) {
    const top = git(['rev-parse', '--show-toplevel'], worktree, { allowFail: true })
    if (top.status === 0 && top.stdout === worktree) return { path: worktree, branch, created: false }
    // A leftover directory that is not this unit's worktree.
    assertInside(worktree, run.aetherDir(mainRoot))
    fs.rmSync(worktree, { recursive: true, force: true })
  }
  git(['worktree', 'prune'], mainRoot)
  fs.mkdirSync(path.dirname(worktree), { recursive: true })
  if (branchExists(mainRoot, branch)) git(['worktree', 'add', worktree, branch], mainRoot)
  else git(['worktree', 'add', '-b', branch, worktree, graph.integration.branch], mainRoot)
  fs.mkdirSync(path.join(worktree, '.aether-tmp'), { recursive: true })
  return { path: worktree, branch, created: true }
}

function diffPackage(cwd, runId, taskId) {
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const branch = run.unitBranch(runId, taskId)
  const base = unitBase(mainRoot, graph, branch)
  const range = `${base}..${branch}`
  const text = [
    `# Review package: ${taskId} (${branch})`,
    `Base: ${base}`,
    `Head: ${git(['rev-parse', branch], mainRoot).stdout}`,
    '',
    '## Commits',
    git(['log', '--oneline', range], mainRoot).stdout,
    '',
    '## Stat',
    git(['diff', '--stat', range], mainRoot).stdout,
    '',
    '## Diff',
    git(['diff', '-U10', range], mainRoot).stdout,
    '',
  ].join('\n')
  const file = path.join(run.runDir(mainRoot, runId), 'packages', `${taskId}.diff`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return { path: file, base }
}

function changedFiles(mainRoot, base, branch) {
  const out = git(['diff', '--name-only', `${base}..${branch}`], mainRoot).stdout
  return out === '' ? [] : out.split('\n')
}

// Merges one unit into the integration branch. Callers serialize merges.
function merge(cwd, runId, taskId, { timeoutMs = 15 * 60 * 1000 } = {}) {
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const task = graph.tasks[taskId]
  if (!task) throw new Error(`${taskId} is not in run ${runId}`)
  const integration = graph.integration.worktree
  const branch = run.unitBranch(runId, taskId)
  if (git(['status', '--porcelain', '--untracked-files=no'], integration).stdout !== '') {
    return { merged: false, reason: 'dirty-integration', detail: 'the integration worktree has uncommitted changes' }
  }
  const base = unitBase(mainRoot, graph, branch)
  const files = changedFiles(mainRoot, base, branch)
  if (files.length === 0) return { merged: false, reason: 'empty', detail: `${branch} has no changes to merge` }
  const outside = files.filter((f) => !matchesAny(f, task.owns))
  if (outside.length) return { merged: false, reason: 'ownership', files: outside }

  const before = head(integration)
  const attempt = git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${branch}`, branch], integration, { allowFail: true })
  if (attempt.status !== 0) {
    const unmerged = git(['diff', '--name-only', '--diff-filter=U'], integration, { allowFail: true }).stdout
    git(['merge', '--abort'], integration, { allowFail: true })
    return { merged: false, reason: 'conflict', files: unmerged ? unmerged.split('\n') : [], detail: attempt.stderr || attempt.stdout }
  }

  const tests = spawnSync(graph.testCommand, {
    cwd: integration,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (tests.status !== 0) {
    // Undo only the merge commit this call created.
    const reverted = git(['rev-parse', 'HEAD^1'], integration).stdout === before
    if (reverted) git(['reset', '--hard', before], integration)
    return {
      merged: false,
      reason: 'tests',
      exitCode: tests.status,
      timedOut: Boolean(tests.error && tests.error.code === 'ETIMEDOUT'),
      reverted,
      output: `${tests.stdout || ''}${tests.stderr || ''}`.slice(-4000),
    }
  }
  return { merged: true, commit: head(integration) }
}

module.exports = { ensure, diffPackage, merge }
