'use strict'

// Unit worktrees: create, package for review, merge, remove and sweep.
// Only paths under <repo>/.aether/ and branches under aether/ are touched.
// Git's worktree registry is never pruned as a whole: Aether removes only its own entries, by path.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { git, repoPaths, currentBranch, head } = require('./git.js')
const { matchesAny } = require('./globs.js')
const run = require('./run.js')

function loadGraph(mainRoot, runId) {
  run.assertRunId(runId)
  const file = path.join(run.runDir(mainRoot, runId), 'graph.json')
  if (!fs.existsSync(file)) throw new Error(`run ${runId} has no graph.json; compile the plan first`)
  return run.readJson(file)
}

function isInside(target, root) {
  const rel = path.relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function assertInside(target, root) {
  if (!isInside(target, root)) throw new Error(`refusing to touch ${target}: it is outside ${root}`)
}

// Unit worktrees live in <repo>/.aether/worktrees/<run>/<task>.
function unitsDir(mainRoot) {
  return path.join(run.aetherDir(mainRoot), 'worktrees')
}

// Unlike fs.existsSync, this counts a dangling symlink as present.
function exists(target) {
  try {
    fs.lstatSync(target)
    return true
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false
    throw err
  }
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

function branchExists(mainRoot, branch) {
  return git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], mainRoot, { allowFail: true }).status === 0
}

function unitBase(mainRoot, graph, branch) {
  return git(['merge-base', graph.integration.branch, branch], mainRoot).stdout
}

// The entries of NUL-terminated git output (-z), without the empty ones.
function nulEntries(text) {
  return text.split('\0').filter((entry) => entry !== '')
}

// Every worktree in git's registry, including entries whose directory is gone.
function registeredWorktrees(mainRoot) {
  const out = git(['worktree', 'list', '--porcelain', '-z'], mainRoot, { raw: true }).stdout
  return nulEntries(out)
    .filter((field) => field.startsWith('worktree '))
    .map((field) => field.slice('worktree '.length))
}

// The registered worktrees under .aether/worktrees/, or under .aether/worktrees/<run>/ for one run.
function aetherWorktrees(mainRoot, runId = null) {
  const root = runId ? run.worktreesDir(mainRoot, runId) : unitsDir(mainRoot)
  return registeredWorktrees(mainRoot).filter((worktree) => isInside(worktree, root))
}

// True when `dir` is itself the root of a git worktree. In any other directory of the repository,
// git commands would act on the enclosing checkout instead.
function isWorktreeRoot(dir) {
  if (!isDirectory(dir)) return false
  const top = git(['rev-parse', '--show-toplevel'], dir, { allowFail: true })
  return top.status === 0 && top.stdout === fs.realpathSync(dir)
}

// Uncommitted and untracked files of a unit worktree. A rename lists both of its paths.
function uncommittedFiles(worktree) {
  const status = git(['status', '--porcelain', '-z', '--untracked-files=all'], worktree, { raw: true })
  const entries = nulEntries(status.stdout)
  const files = []
  for (let i = 0; i < entries.length; i++) {
    const [x, y] = entries[i]
    files.push(entries[i].slice(3))
    // A rename or a copy is followed by its source path.
    if ((x === 'R' || x === 'C' || y === 'R' || y === 'C') && i + 1 < entries.length) files.push(entries[++i])
  }
  return files
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
  if (exists(worktree)) {
    if (registeredWorktrees(mainRoot).includes(worktree)) return { path: worktree, branch, created: false }
    if (exists(path.join(worktree, '.git'))) {
      throw new Error(`refusing to remove ${worktree}: it has a .git entry but git does not list it as a worktree`)
    }
    // A leftover directory that is not a worktree.
    assertInside(worktree, unitsDir(mainRoot))
    fs.rmSync(worktree, { recursive: true, force: true })
  }
  fs.mkdirSync(path.dirname(worktree), { recursive: true })
  // --force also reuses a registry entry of this path whose directory was deleted by hand.
  if (branchExists(mainRoot, branch)) git(['worktree', 'add', '--force', worktree, branch], mainRoot)
  else git(['worktree', 'add', '--force', '-b', branch, worktree, graph.integration.branch], mainRoot)
  fs.mkdirSync(path.join(worktree, '.aether-tmp'), { recursive: true })
  return { path: worktree, branch, created: true }
}

// Writes runDir/packages/<name>.diff for a reviewer: commits, stat and diff of base..tip.
function writePackage(mainRoot, runId, name, title, base, tip) {
  const range = `${base}..${tip}`
  const text = [
    `# Review package: ${title}`,
    `Base: ${base}`,
    `Head: ${git(['rev-parse', tip], mainRoot).stdout}`,
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
  const file = path.join(run.runDir(mainRoot, runId), 'packages', `${name}.diff`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

function diffPackage(cwd, runId, taskId) {
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const branch = run.unitBranch(runId, taskId)
  const base = unitBase(mainRoot, graph, branch)
  return { path: writePackage(mainRoot, runId, taskId, `${taskId} (${branch})`, base, branch), base }
}

// The whole run's change on the integration branch, from the base recorded at compile time.
function finalPackage(cwd, runId) {
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const { branch, base } = graph.integration
  const tip = git(['rev-parse', branch], mainRoot).stdout
  return { path: writePackage(mainRoot, runId, 'final', `run ${runId} (${branch})`, base, tip), base, head: tip }
}

// Both sides of a rename are listed, and names are not quoted, whatever characters they hold.
function changedFiles(mainRoot, base, branch) {
  const args = ['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', '-z', `${base}..${branch}`]
  return nulEntries(git(args, mainRoot, { raw: true }).stdout)
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
  const current = currentBranch(integration)
  if (current !== graph.integration.branch) {
    return {
      merged: false,
      reason: 'wrong-branch',
      detail: `the integration worktree is on ${current || 'a detached HEAD'}, not ${graph.integration.branch}`,
    }
  }
  if (git(['status', '--porcelain', '--untracked-files=no'], integration).stdout !== '') {
    return { merged: false, reason: 'dirty-integration', detail: 'the integration worktree has uncommitted changes' }
  }
  const base = unitBase(mainRoot, graph, branch)
  const files = changedFiles(mainRoot, base, branch)
  if (files.length === 0) {
    const result = { merged: false, reason: 'empty', detail: `${branch} has no changes to merge` }
    // Work that was never committed is not merged; say where it is.
    const worktree = run.unitWorktree(mainRoot, runId, taskId)
    const uncommitted = isWorktreeRoot(worktree) ? uncommittedFiles(worktree) : []
    if (uncommitted.length > 0) result.uncommitted = uncommitted
    return result
  }
  const outside = files.filter((f) => !matchesAny(f, task.owns))
  if (outside.length) return { merged: false, reason: 'ownership', files: outside }

  const before = head(integration)
  const attempt = git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${branch}`, branch], integration, { allowFail: true })
  if (attempt.status !== 0) {
    const unmerged = nulEntries(
      git(['-c', 'core.quotePath=false', 'diff', '--name-only', '--diff-filter=U', '-z'], integration, {
        allowFail: true,
        raw: true,
      }).stdout,
    )
    git(['merge', '--abort'], integration, { allowFail: true })
    return { merged: false, reason: 'conflict', files: unmerged, detail: attempt.stderr || attempt.stdout }
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

// Drops one registry entry, and the directory with it when it is there. Works for a missing directory.
function unregisterWorktree(mainRoot, worktree) {
  return git(['worktree', 'remove', '--force', worktree], mainRoot, { allowFail: true }).status === 0
}

// Removes one unit worktree: git drops its registry entry and its directory, then whatever is
// left on disk is deleted by hand. Returns true when neither the entry nor the directory remains.
function removeWorktreePath(mainRoot, worktree, registered) {
  assertInside(worktree, unitsDir(mainRoot))
  let unregistered = !registered || unregisterWorktree(mainRoot, worktree)
  if (exists(worktree)) fs.rmSync(worktree, { recursive: true, force: true })
  // Git refuses a worktree whose directory is broken, but not one whose directory is gone.
  if (!unregistered) unregistered = unregisterWorktree(mainRoot, worktree)
  return unregistered && !exists(worktree)
}

// True when everything on `branch` is already in the integration branch.
function isMerged(mainRoot, graph, branch) {
  const r = git(['merge-base', '--is-ancestor', branch, graph.integration.branch], mainRoot, { allowFail: true })
  return r.status === 0
}

// Branches under aether/ (or aether/<run>/) with the commit each one points to.
function aetherBranches(mainRoot, runId = null) {
  const pattern = runId ? `refs/heads/aether/${runId}` : 'refs/heads/aether'
  const out = git(['for-each-ref', '--format=%(objectname) %(refname)', pattern], mainRoot).stdout
  if (out === '') return []
  return out
    .split('\n')
    .map((line) => {
      const space = line.indexOf(' ')
      return { branch: line.slice(space + 1).replace(/^refs\/heads\//, ''), tip: line.slice(0, space) }
    })
    .filter(({ branch }) => branch.startsWith('aether/'))
}

// Saves the unit's work that is not in the integration branch as a patch for `git apply`.
// When the worktree is there, the patch also covers its uncommitted and untracked files.
function writePatch(mainRoot, graph, runId, taskId, worktree) {
  const branch = run.unitBranch(runId, taskId)
  const base = unitBase(mainRoot, graph, branch)
  let diff
  if (worktree) {
    git(['add', '-A'], worktree)
    diff = git(['diff', '--binary', '--cached', base], worktree, { raw: true })
  } else {
    diff = git(['diff', '--binary', `${base}..${branch}`], mainRoot, { raw: true })
  }
  const file = path.join(run.runDir(mainRoot, runId), 'patches', `${taskId}.patch`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, diff.bytes)
  return file
}

// Removes a unit's worktree and branch. The unit's work is saved as a patch first when the caller
// asks for it, when the branch is not merged into the integration branch, or when the worktree
// holds uncommitted or untracked files.
function removeUnit(cwd, runId, taskId, { keepPatch = false } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  const branch = run.unitBranch(runId, taskId)
  const hasBranch = branchExists(mainRoot, branch)
  const inWorktree = isWorktreeRoot(worktree)
  let patch = null
  if (hasBranch) {
    const graph = loadGraph(mainRoot, runId)
    if (keepPatch || !isMerged(mainRoot, graph, branch) || (inWorktree && uncommittedFiles(worktree).length > 0)) {
      patch = writePatch(mainRoot, graph, runId, taskId, inWorktree ? worktree : null)
    }
  }
  removeWorktreePath(mainRoot, worktree, registeredWorktrees(mainRoot).includes(worktree))
  if (hasBranch) git(['branch', '-D', branch], mainRoot)
  return { removed: true, patch }
}

// The worktrees of a run: those in git's registry, plus any directory left in the run's folder.
function runWorktrees(mainRoot, runId) {
  const dir = run.worktreesDir(mainRoot, runId)
  const registered = new Set(aetherWorktrees(mainRoot, runId))
  const paths = new Set(registered)
  if (isDirectory(dir)) for (const name of fs.readdirSync(dir)) paths.add(path.join(dir, name))
  return { paths: [...paths].sort(), registered }
}

// Removes a run's unit worktrees and branches. With `finish`, the run directory goes too.
function sweepRun(cwd, runId, { finish = false } = {}) {
  run.assertRunId(runId)
  const { mainRoot } = repoPaths(cwd)
  const dir = run.worktreesDir(mainRoot, runId)
  const removedWorktrees = []
  const { paths, registered } = runWorktrees(mainRoot, runId)
  for (const worktree of paths) {
    if (removeWorktreePath(mainRoot, worktree, registered.has(worktree))) removedWorktrees.push(worktree)
  }
  if (exists(dir)) {
    assertInside(dir, unitsDir(mainRoot))
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const removedBranches = []
  for (const { branch } of aetherBranches(mainRoot, runId)) {
    git(['branch', '-D', branch], mainRoot)
    removedBranches.push(branch)
  }
  const runDir = run.runDir(mainRoot, runId)
  if (finish && exists(runDir)) {
    assertInside(runDir, path.join(run.aetherDir(mainRoot), 'runs'))
    fs.rmSync(runDir, { recursive: true, force: true })
  }
  return {
    removedWorktrees,
    removedBranches,
    remaining: {
      worktrees: runWorktrees(mainRoot, runId).paths.map((worktree) => path.basename(worktree)),
      branches: aetherBranches(mainRoot, runId).map(({ branch }) => branch),
    },
  }
}

// True when `dir`, or anything inside it, was modified at or after `cutoff` (ms since the epoch).
// Symlinks are not followed, and the walk stops at the first recent entry.
function modifiedSince(dir, cutoff) {
  const pending = [dir]
  while (pending.length > 0) {
    const current = pending.pop()
    let stat
    try {
      stat = fs.lstatSync(current)
    } catch {
      continue // gone since it was listed
    }
    if (stat.mtimeMs >= cutoff) return true
    if (!stat.isDirectory()) continue
    try {
      for (const name of fs.readdirSync(current)) pending.push(path.join(current, name))
    } catch {
      // unreadable or gone: nothing more to learn from it
    }
  }
  return false
}

// Removes runs that were never finalized and have had no activity for `hours`, plus leftovers
// whose run directory is already gone. Activity is any change in the run directory or in the
// run's unit worktrees. Each removal is recorded first, with the tip of every branch it deletes.
function sweepStale(cwd, { hours = 24, now = Date.now() } = {}) {
  const { mainRoot } = repoPaths(cwd)
  const ids = new Set()
  for (const sub of ['runs', 'worktrees']) {
    const dir = path.join(run.aetherDir(mainRoot), sub)
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) if (run.isRunId(name)) ids.add(name)
    }
  }
  for (const worktree of aetherWorktrees(mainRoot)) {
    const id = path.relative(unitsDir(mainRoot), worktree).split(path.sep)[0]
    if (run.isRunId(id)) ids.add(id)
  }
  for (const { branch } of aetherBranches(mainRoot)) {
    const id = branch.split('/')[1]
    if (run.isRunId(id)) ids.add(id)
  }
  const cutoff = now - hours * 3600 * 1000
  const swept = []
  for (const id of [...ids].sort()) {
    const dir = run.runDir(mainRoot, id)
    const worktreesDir = run.worktreesDir(mainRoot, id)
    const active = fs.existsSync(dir) && (modifiedSince(dir, cutoff) || modifiedSince(worktreesDir, cutoff))
    if (active) continue
    const branches = aetherBranches(mainRoot, id)
    run.appendRecord({
      runId: id,
      status: 'abandoned',
      sweptAt: new Date(now).toISOString(),
      repo: mainRoot,
      removedWorktrees: runWorktrees(mainRoot, id).paths.length,
      removedBranches: branches.length,
      branches,
    })
    sweepRun(cwd, id)
    assertInside(dir, path.join(run.aetherDir(mainRoot), 'runs'))
    fs.rmSync(dir, { recursive: true, force: true })
    swept.push(id)
  }
  return { swept }
}

module.exports = { ensure, diffPackage, finalPackage, merge, removeUnit, sweepRun, sweepStale }
