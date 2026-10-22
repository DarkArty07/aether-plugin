'use strict'

// Unit worktrees: create, package for review, merge, remove and sweep. The sweep also stops the
// processes of lane calls and removes the copies they leave.
// Only paths under <repo>/.aether/ and branches under aether/ are touched.
// Git's worktree registry is never pruned as a whole: Aether removes only its own entries, by path.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { git, repoPaths, currentBranch, head } = require('./git.js')
const { matchesAny } = require('./globs.js')
const run = require('./run.js')
const { killGroup, killMarked } = require('./lanes.js')
const { judge } = require('./baseline.js')

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

// A read-only lane role's disposable copies live in <repo>/.aether/lanes/<run>/<call>.
function laneCopiesRoot(mainRoot) {
  return path.join(run.aetherDir(mainRoot), 'lanes')
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
    if (registeredWorktrees(mainRoot).includes(worktree)) {
      // Work an earlier attempt left uncommitted is committed on the branch before the worktree is handed back.
      const { committed } = isWorktreeRoot(worktree) ? commitOwnedWork(worktree, graph.tasks[taskId], taskId) : { committed: [] }
      return { path: worktree, branch, created: false, salvaged: committed.length > 0 }
    }
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
  return { path: worktree, branch, created: true, salvaged: false }
}

// Commits on the unit's branch what the task owns among the worktree's uncommitted files, and names the
// rest in `left`, uncommitted: the merge's ownership check is the judge of those. `worktree` must be a
// worktree root (isWorktreeRoot), or git would act on the enclosing checkout.
function commitOwnedWork(worktree, task, taskId) {
  const pending = uncommittedFiles(worktree)
  const committed = pending.filter((file) => matchesAny(file, task.owns))
  const left = pending.filter((file) => !committed.includes(file))
  if (committed.length > 0) {
    // -A with paths also stages a deletion. Without an identity of its own, the repository's commit would fail.
    git(['add', '-A', '--', ...committed], worktree)
    const identity = git(['config', 'user.email'], worktree, { allowFail: true }).stdout === '' ? ['-c', 'user.name=Aether', '-c', 'user.email=aether@localhost'] : []
    git([...identity, 'commit', '--no-verify', '-q', '-m', `aether: ${taskId} work saved without its report`], worktree)
  }
  return { committed, left }
}

// Added lines that suggest unfinished work: a focused or skipped test, a TODO, a FIXME, a stub. TODO and
// FIXME count only in capitals, so prose such as the Spanish "todo" is not flagged.
const FLAG = /\.only\(|\.skip\(|\bTODO\b|\bFIXME\b|[Nn]ot [Ii]mplemented|NotImplemented/
const MAX_FLAGS = 50
const MAX_FLAG_LENGTH = 160

// The flagged added lines of base..tip, as `- <file>:<line in the new file>: <text>`.
function flaggedLines(mainRoot, base, tip) {
  // --no-prefix keeps file names as they are, and --no-color keeps the parsed text free of escapes.
  const out = git(['-c', 'core.quotePath=false', 'diff', '-U0', '--no-prefix', '--no-color', `${base}..${tip}`], mainRoot).stdout
  const flags = []
  let file = ''
  let line = 0
  let inHunk = false
  for (const text of out.split('\n')) {
    if (text.startsWith('diff --git ')) {
      inHunk = false
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text)
    if (hunk) {
      inHunk = true
      line = Number(hunk[1])
      continue
    }
    // Before the first hunk, +++ names the file. Inside a hunk, a line that starts with + is content,
    // even one that starts with +++.
    if (!inHunk) {
      if (text.startsWith('+++ ')) file = text.slice(4) === '/dev/null' ? '' : text.slice(4).replace(/\t$/, '')
      continue
    }
    if (text.startsWith('+')) {
      const added = text.slice(1)
      if (FLAG.test(added)) flags.push(`- ${file}:${line}: ${added.trim().slice(0, MAX_FLAG_LENGTH)}`)
      line++
    } else if (text.startsWith(' ')) {
      line++
    }
  }
  return flags
}

// The Flags section of a package, or no lines when there is nothing to flag.
function flagsSection(flags) {
  if (flags.length === 0) return []
  const shown = flags.slice(0, MAX_FLAGS)
  if (flags.length > MAX_FLAGS) shown.push(`- ... and ${flags.length - MAX_FLAGS} more`)
  return ['## Flags', ...shown, '']
}

// Writes runDir/packages/<name>.diff for a reviewer: commits, stat, flags and diff of base..tip.
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
    ...flagsSection(flaggedLines(mainRoot, base, tip)),
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

// A unit whose implementer ended without its report may still hold the work (issue 003). This commits what
// the task owns that the attempt left uncommitted, and writes the package its supervisor reviews. A file outside
// Owns is left where it is and named: the merge's ownership check is the judge of those, not this command.
function salvageUnit(cwd, runId, taskId) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const task = graph.tasks[taskId]
  if (!task) throw new Error(`${taskId} is not in run ${runId}`)
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  const branch = run.unitBranch(runId, taskId)
  const nothing = { salvaged: false, files: [], committed: [], left: [], head: null, package: null }
  if (!branchExists(mainRoot, branch) || !isWorktreeRoot(worktree)) return { ...nothing, reason: 'no-worktree' }
  const { committed, left } = commitOwnedWork(worktree, task, taskId)
  const files = changedFiles(mainRoot, unitBase(mainRoot, graph, branch), branch)
  if (files.length === 0) return { ...nothing, committed, left }
  const { path: packagePath } = diffPackage(cwd, runId, taskId)
  return { salvaged: true, files, committed, left, head: git(['rev-parse', branch], mainRoot).stdout, package: packagePath }
}

// Records a unit the Lead integrated by hand (issue 005), so that the report and finalize agree with the branch.
// The commit must be in the integration branch: this command believes no one's word about the work itself.
function adoptUnit(cwd, runId, taskId, { commit, reason } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (!graph.tasks[taskId]) throw new Error(`${taskId} is not in run ${runId}`)
  if (typeof commit !== 'string' || commit === '') throw new Error('adopt needs --commit <sha>, the commit of the integration branch that holds the unit')
  if (typeof reason !== 'string' || reason.trim() === '') throw new Error('adopt needs --reason <why the unit was integrated by hand>')
  const resolved = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/.test(commit) ? git(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], mainRoot, { allowFail: true }) : null
  if (!resolved || resolved.status !== 0) throw new Error(`${commit} is not a commit of this repository`)
  const sha = resolved.stdout
  if (git(['merge-base', '--is-ancestor', sha, graph.integration.branch], mainRoot, { allowFail: true }).status !== 0) {
    throw new Error(`${sha.slice(0, 10)} is not in the integration branch ${graph.integration.branch}`)
  }
  const file = path.join(run.runDir(mainRoot, runId), 'adopted.json')
  const adopted = exists(file) ? run.readJson(file) : {}
  adopted[taskId] = { commit: sha, reason: reason.trim(), at: new Date().toISOString() }
  run.writeJson(file, adopted)
  return { adopted: true, task: taskId, commit: sha, reason: adopted[taskId].reason, units: Object.keys(adopted).sort() }
}

// The marker a merge leaves in the run directory while its tests have not finished (issue #2).
// It is written before `git merge`, with no commit yet, and the commit is filled in after the
// merge: a kill in that gap still leaves the marker, so status cannot call the commit merged.
// The mod also kills the process at 600 s, during the tests, and the marker stays. The file names
// that merge commit, so a rerun settles this unit and not an earlier one. `before` is the
// integration tip the merge was attempted on, so a marker whose merge never happened is not one.
function unverifiedMarker(mainRoot, runId, taskId) {
  return path.join(run.runDir(mainRoot, runId), 'unverified', `${taskId}.json`)
}

function hasUnverifiedMarker(mainRoot, runId, taskId) {
  return exists(unverifiedMarker(mainRoot, runId, taskId))
}

// `{ commit, before }`. A missing or half-written file has neither: it still counts as a marker.
function readUnverifiedMarker(mainRoot, runId, taskId) {
  try {
    const marker = JSON.parse(fs.readFileSync(unverifiedMarker(mainRoot, runId, taskId), 'utf8'))
    const text = (value) => (typeof value === 'string' && value !== '' ? value : null)
    return { commit: text(marker?.commit), before: text(marker?.before) }
  } catch {
    return { commit: null, before: null }
  }
}

function readUnverifiedCommit(mainRoot, runId, taskId) {
  return readUnverifiedMarker(mainRoot, runId, taskId).commit
}

// Never replaces a marker whose commit is still on the integration branch (finding 1). Filling in
// a commit the marker does not name yet is allowed: that is the write from before `git merge`.
function writeUnverifiedMarker(mainRoot, graph, runId, taskId, commit, { before } = {}) {
  const file = unverifiedMarker(mainRoot, runId, taskId)
  const existing = exists(file) ? readUnverifiedMarker(mainRoot, runId, taskId) : null
  const next = commit || null
  if (existing?.commit && existing.commit !== next && commitOnBranch(mainRoot, graph, existing.commit)) return false
  const body = { commit: next }
  const keptBefore = before || existing?.before
  if (keptBefore) body.before = keptBefore
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(body)}\n`)
  return true
}

function clearUnverifiedMarker(mainRoot, runId, taskId) {
  const file = unverifiedMarker(mainRoot, runId, taskId)
  fs.rmSync(file, { force: true })
  // The directory stays while another unit's marker is in it.
  try {
    fs.rmdirSync(path.dirname(file))
  } catch {
    // Not empty, or already gone.
  }
}

// Drops the marker once its commit is verified or undone. A commit that is still on the branch,
// and was neither verified nor undone, keeps its marker (finding 1).
function clearSettledMarker(mainRoot, graph, runId, taskId, { verified = false, undone = false } = {}) {
  const commit = readUnverifiedCommit(mainRoot, runId, taskId)
  if (commit && commitOnBranch(mainRoot, graph, commit) && !verified && !undone) return false
  clearUnverifiedMarker(mainRoot, runId, taskId)
  return true
}

function isAncestor(mainRoot, ancestor, descendant) {
  if (!ancestor || !descendant) return false
  return git(['merge-base', '--is-ancestor', ancestor, descendant], mainRoot, { allowFail: true }).status === 0
}

function commitOnBranch(mainRoot, graph, commit) {
  return isAncestor(mainRoot, commit, graph.integration.branch)
}

// True when `git revert` of `commit` is on the integration branch. A revert keeps the merge commit
// in the history, so ancestry alone cannot tell that its changes were undone.
function wasReverted(mainRoot, graph, commit) {
  if (!commit) return false
  const log = git(['log', '-F', '--grep', `This reverts commit ${commit}`, '--format=%H', graph.integration.branch], mainRoot, { allowFail: true })
  return log.status === 0 && log.stdout !== ''
}

// The merge commit of `branch` still on the integration branch, found by its subject, or null.
// Used when the marker has no commit yet, or the unit branch itself is gone and the history is the only record.
function mergeSubjectCommit(mainRoot, graph, branch) {
  const log = git(['log', '--format=%H %s', graph.integration.branch], mainRoot, { allowFail: true })
  if (log.status !== 0 || log.stdout === '') return null
  const subject = `Merge ${branch}`
  for (const line of log.stdout.split('\n')) {
    const space = line.indexOf(' ')
    if (space !== -1 && line.slice(space + 1) === subject) return line.slice(0, space)
  }
  return null
}

// The commit a marker still guards on the integration branch, or null when the marker does not
// name one. Checked before the shape of the unit branch: a relaunch recreates that branch from
// the integration tip, so the tip is on the first-parent line and merged nothing of its own, while
// the untested commit is already there (finding 1). A marker with no commit and no merge commit
// is a merge that did not happen (finding 4).
function unverifiedOnIntegration(mainRoot, graph, runId, taskId) {
  if (!hasUnverifiedMarker(mainRoot, runId, taskId)) return null
  const marker = readUnverifiedMarker(mainRoot, runId, taskId)
  const branch = run.unitBranch(runId, taskId)
  if (marker.commit) return commitOnBranch(mainRoot, graph, marker.commit) ? marker.commit : null
  const subject = mergeSubjectCommit(mainRoot, graph, branch)
  if (!subject || !commitOnBranch(mainRoot, graph, subject)) return null
  // `before` is the integration tip when the marker was written, before the merge. The same tip
  // means the merge never happened. A marker with no `before` has only the history to go on.
  if (marker.before) {
    const tip = git(['rev-parse', graph.integration.branch], mainRoot, { allowFail: true }).stdout
    if (!tip || tip === marker.before || subject === marker.before || !isAncestor(mainRoot, marker.before, subject)) return null
  }
  return subject
}

function unverifiedTasks(mainRoot, graph, runId) {
  const dir = path.join(run.runDir(mainRoot, runId), 'unverified')
  if (!isDirectory(dir)) return []
  const found = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const taskId = name.slice(0, -'.json'.length)
    if (!graph.tasks[taskId]) continue
    const commit = unverifiedOnIntegration(mainRoot, graph, runId, taskId)
    if (commit) found.push({ taskId, commit })
  }
  return found.sort((a, b) => graph.tasks[a.taskId].number - graph.tasks[b.taskId].number)
}

// Whether a unit's branch is already in the integration branch, from the git history alone
// (issue 002): the workflow asks this when a merge's own output was unreadable, instead of
// trusting captured output as the only evidence of the merge. `commit` is the first merge
// commit on the integration branch that took the unit in, or the unit's tip when there is none.
// A marker left by a merge whose tests never finished (issue #2) means that commit is not verified:
// `merged` is false and `unverified` is true until a rerun keeps the commit or reverts it.
function unitStatus(cwd, runId, taskId) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (!graph.tasks[taskId]) throw new Error(`${taskId} is not in run ${runId}`)
  const branch = run.unitBranch(runId, taskId)
  const present = branchExists(mainRoot, branch)
  const tip = present ? git(['rev-parse', branch], mainRoot).stdout : null
  // The marker is the whole story, whatever the branch tip is and whether the branch is still there.
  const marked = unverifiedOnIntegration(mainRoot, graph, runId, taskId)
  if (marked) return { merged: false, unverified: true, branch: present ? branch : null, commit: marked, head: tip }
  if (!present) return { merged: false, branch: null, commit: null }
  // A branch with no change of its own since the run's base is an ancestor of everything
  // and merged nothing. (unitBase cannot say this: after a merge it is the branch's tip.)
  const own = changedFiles(mainRoot, graph.integration.base, branch)
  // A branch made after another unit's merge starts on the integration branch's own line with no commit of its own: it
  // merged nothing, whatever the base-to-tip diff holds. A merged unit's tip is the second parent of its merge commit.
  // A relaunch is the exception: ensure points the new branch at the integration tip, which may be this unit's own
  // verified merge, so the tip sits on that line and the merge subject is the record that the unit is in.
  const line = git(['rev-list', '--first-parent', graph.integration.branch], mainRoot, { allowFail: true }).stdout.split('\n')
  if (own.length === 0 || line.includes(tip) || !isMerged(mainRoot, graph, branch)) {
    if (line.includes(tip)) {
      const subject = mergeSubjectCommit(mainRoot, graph, branch)
      if (subject && isAncestor(mainRoot, subject, tip) && !wasReverted(mainRoot, graph, subject)) {
        return { merged: true, branch, commit: subject, head: tip }
      }
    }
    return { merged: false, branch, commit: null, head: tip }
  }
  const merges = git(['rev-list', '--merges', '--reverse', `${branch}..${graph.integration.branch}`], mainRoot, { allowFail: true }).stdout
  const commit = merges === '' ? tip : merges.split('\n')[0]
  // A revert leaves the merge commit in the history. The changes are gone, so the unit is not merged.
  if (wasReverted(mainRoot, graph, commit)) return { merged: false, branch, commit: null, head: tip }
  return { merged: true, branch, commit, head: tip }
}

// The ids of a run's graph, in task number order.
function taskIdsInOrder(graph) {
  return Object.keys(graph.tasks).sort((a, b) => graph.tasks[a].number - graph.tasks[b].number)
}

// The value read() returns, or `fallback` when it throws: a source that fails adds nothing.
function orEmpty(read, fallback) {
  try {
    return read()
  } catch {
    return fallback
  }
}

// The units of a run already in the integration branch, in task order. A merged unit's branch may
// have been removed since, so three sources count: what unitStatus sees on a branch that is still
// there, the integration branch's merge commits named `Merge aether/<run>/<task>`, and the units
// the Lead adopted by hand. A unit whose tests were cut (issue #2) is in that history and is not
// counted: its marker is still there. A unit the Lead adopted still counts. Only tasks of the run's graph are counted.
function mergedUnits(cwd, runId) {
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const ids = taskIdsInOrder(graph)
  const merged = new Set()
  const unverified = (taskId) => unverifiedOnIntegration(mainRoot, graph, runId, taskId) !== null
  for (const taskId of ids) {
    if (unverified(taskId)) continue
    if (orEmpty(() => unitStatus(mainRoot, runId, taskId).merged, false)) merged.add(taskId)
  }
  const subjects = orEmpty(() => {
    const log = git(['log', '--format=%s', graph.integration.branch], mainRoot, { allowFail: true })
    return log.status === 0 ? new Set(log.stdout.split('\n')) : new Set()
  }, new Set())
  for (const taskId of ids) {
    if (unverified(taskId)) continue
    const branch = run.unitBranch(runId, taskId)
    if (!subjects.has(`Merge ${branch}`)) continue
    // A revert keeps the subject in the log. The unit counts only while that merge was not reverted.
    const commit = orEmpty(() => mergeSubjectCommit(mainRoot, graph, branch), null)
    if (commit && wasReverted(mainRoot, graph, commit)) continue
    merged.add(taskId)
  }
  const adoptedFile = path.join(run.runDir(mainRoot, runId), 'adopted.json')
  const adopted = orEmpty(() => (exists(adoptedFile) ? Object.keys(run.readJson(adoptedFile)) : []), [])
  for (const taskId of adopted) if (ids.includes(taskId)) merged.add(taskId)
  return ids.filter((taskId) => merged.has(taskId))
}

// Saves a run's work where it outlives its worktrees: for each unit not merged yet, salvageUnit
// commits on the unit's branch what its Owns covers and names the rest in `left`, uncommitted. A
// merged unit is recorded as it is. Writes <runDir>/saved.json. It removes no worktree and pushes
// nothing.
function saveRun(cwd, runId, { now = new Date() } = {}) {
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const merged = new Set(mergedUnits(mainRoot, runId))
  const units = taskIdsInOrder(graph).map((taskId) => {
    const branch = run.unitBranch(runId, taskId)
    const tip = () => (branchExists(mainRoot, branch) ? git(['rev-parse', branch], mainRoot).stdout : null)
    if (merged.has(taskId)) {
      const head = tip() || unitStatus(mainRoot, runId, taskId).commit || null
      return { task: taskId, branch, head, merged: true, salvaged: false, committed: [], left: [] }
    }
    const saved = salvageUnit(mainRoot, runId, taskId)
    const head = saved.salvaged ? saved.head : tip()
    return {
      task: taskId,
      branch: head === null ? null : branch,
      head,
      merged: false,
      salvaged: saved.salvaged,
      committed: saved.committed,
      left: saved.left,
    }
  })
  const saved = { run: runId, at: now.toISOString(), units }
  const file = path.join(run.runDir(mainRoot, runId), 'saved.json')
  run.writeJson(file, saved)
  return { ...saved, path: file }
}

// The whole run's change on the integration branch, from the first launch's base, so that a relaunch
// does not drop the changes of the launches before it.
function finalPackage(cwd, runId) {
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const { branch } = graph.integration
  const base = graph.integration.firstBase || graph.integration.base
  const tip = git(['rev-parse', branch], mainRoot).stdout
  return { path: writePackage(mainRoot, runId, 'final', `run ${runId} (${branch})`, base, tip), base, head: tip }
}

// Both sides of a rename are listed, and names are not quoted, whatever characters they hold.
function changedFiles(mainRoot, base, branch) {
  const args = ['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', '-z', `${base}..${branch}`]
  return nulEntries(git(args, mainRoot, { raw: true }).stdout)
}

// ---- The merge lock ----
// A merge commits on the integration branch before it runs the tests, and resets the branch when they
// fail. For its whole duration it holds <runDir>/merging, {pid, time}, so that the checks of a lane
// call read the branch and the integration worktree only between merges. A lock whose process is
// gone, or that is older than 30 minutes, is stale.

const MERGE_LOCK_STALE_MS = 30 * 60 * 1000
const MERGE_WAIT_MS = 30 * 60 * 1000
const MERGE_POLL_MS = 200

function mergeLockFile(mainRoot, runId) {
  return path.join(run.runDir(mainRoot, runId), 'merging')
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

// The lock's {pid, time}, or null when there is none. A lock that cannot be read yet, because its
// holder is still writing it, has no pid and dates from its file.
function readMergeLock(file) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return null
  }
  let lock = null
  try {
    lock = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    // Read as a lock without a pid.
  }
  return {
    pid: Number.isInteger(lock?.pid) && lock.pid > 0 ? lock.pid : null,
    time: typeof lock?.time === 'number' ? lock.time : stat.mtimeMs,
  }
}

function isFreshLock(lock) {
  return lock !== null && Date.now() - lock.time < MERGE_LOCK_STALE_MS && (lock.pid === null || processAlive(lock.pid))
}

// Takes the lock for this process, once no fresh lock is held. A stale lock is replaced.
function takeMergeLock(file) {
  for (;;) {
    const mine = { pid: process.pid, time: Date.now() }
    try {
      fs.writeFileSync(file, JSON.stringify(mine), { flag: 'wx' })
      return mine
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
    if (isFreshLock(readMergeLock(file))) sleepSync(MERGE_POLL_MS)
    else fs.rmSync(file, { force: true })
  }
}

// Drops the lock while it is still this one: a lock replaced as stale belongs to its new holder.
function dropMergeLock(file, mine) {
  const lock = readMergeLock(file)
  if (lock && lock.pid === mine.pid && lock.time === mine.time) fs.rmSync(file, { force: true })
}

// Returns what read() reads while no merge of the run holds the lock. A read that a merge began
// during is read again after it. After 30 minutes of waiting it reads anyway.
function betweenMerges(mainRoot, runId, read) {
  const file = mergeLockFile(mainRoot, runId)
  const deadline = Date.now() + MERGE_WAIT_MS
  for (;;) {
    while (isFreshLock(readMergeLock(file)) && Date.now() < deadline) sleepSync(MERGE_POLL_MS)
    const value = read()
    if (!isFreshLock(readMergeLock(file)) || Date.now() >= deadline) return value
  }
}

// Merges one unit into the integration branch, holding the run's merge lock throughout. Callers
// serialize merges; the lock is for the lane checks that read the branch meanwhile.
function merge(cwd, runId, taskId, options = {}) {
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  const file = mergeLockFile(mainRoot, runId)
  const lock = takeMergeLock(file)
  try {
    return mergeUnit(mainRoot, graph, runId, taskId, options)
  } finally {
    dropMergeLock(file, lock)
  }
}

// The run's test baseline, or null when it is missing or unreadable.
function readBaseline(mainRoot, runId) {
  try {
    const baseline = run.readJson(path.join(run.runDir(mainRoot, runId), 'baseline.json'))
    return baseline && Array.isArray(baseline.signatures) ? baseline : null
  } catch {
    return null
  }
}

// Undoes `commit` on the integration branch. The tip is reset, which drops it from the history.
// A commit that later commits sit on is reverted with `-m 1`, so that history stays (finding 1).
// Returns whether the commit's changes were undone. A revert leaves the commit an ancestor.
function undoUnverifiedCommit(mainRoot, graph, integration, commit) {
  if (!commit) return false
  if (!commitOnBranch(mainRoot, graph, commit)) return true
  if (head(integration) === commit) {
    git(['reset', '--hard', `${commit}^1`], integration)
    return !commitOnBranch(mainRoot, graph, commit)
  }
  const attempt = git(['-c', 'core.editor=true', 'revert', '-m', '1', '--no-edit', commit], integration, { allowFail: true })
  if (attempt.status !== 0) {
    git(['revert', '--abort'], integration, { allowFail: true })
    return false
  }
  return true
}

// Runs the plan's tests against the merge commit that is already on the integration branch, then
// keeps that commit or undoes it. The marker is written before this runs. It is removed when the
// tests have finished and the merge was kept or undone; a process killed during the tests leaves
// it (issue #2). A rerun records the commit the marker names, not whatever the tip is by then.
function settleMerge(mainRoot, graph, runId, taskId, integration, { timeoutMs, rerun = false, marked = null } = {}) {
  const markedCommit = marked || readUnverifiedCommit(mainRoot, runId, taskId)
  const tests = spawnSync(graph.testCommand, {
    cwd: integration,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })
  const kept = (extra) => {
    // The tests passed, so the commit is verified even though it stays on the branch.
    clearSettledMarker(mainRoot, graph, runId, taskId, { verified: true })
    const result = { merged: true, commit: rerun && markedCommit ? markedCommit : head(integration) }
    if (rerun) result.rerun = true
    if (extra) Object.assign(result, extra)
    return result
  }
  if (tests.status === 0) return kept()
  // A run that was killed (timed out, or its output overflowed the buffer) did not finish, so its
  // output cannot show that only known tests fail. Such a run is undone without the baseline.
  const output = `${tests.stdout || ''}\n${tests.stderr || ''}`
  const verdict = tests.status === null ? { pass: false } : judge(readBaseline(mainRoot, runId), { exitCode: tests.status, output })
  if (verdict.pass) return kept({ knownFailures: verdict.known })
  const commit = markedCommit || head(integration)
  const reverted = undoUnverifiedCommit(mainRoot, graph, integration, commit)
  // The marker stays while its commit is still on the branch, tests unfinished or the undo refused.
  if (reverted) clearSettledMarker(mainRoot, graph, runId, taskId, { undone: true })
  const result = {
    merged: false,
    reason: 'tests',
    exitCode: tests.status,
    timedOut: Boolean(tests.error && tests.error.code === 'ETIMEDOUT'),
    reverted,
    output: `${tests.stdout || ''}${tests.stderr || ''}`.slice(-4000),
  }
  if (verdict.reason === 'new failures') result.newFailures = verdict.new
  return result
}

// A unit branch cut from an unverified commit still contains it after that commit is reset off the
// integration branch. Replay the branch's own commits onto the new tip, so the reverted changes do
// not come back inside this merge (finding 2). A revert that kept the commit needs no replay.
function replayOffDropped(mainRoot, graph, runId, taskId, branch, dropped) {
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  const cwd = isWorktreeRoot(worktree) ? worktree : mainRoot
  for (const commit of dropped) {
    if (commitOnBranch(mainRoot, graph, commit)) continue
    if (!isAncestor(mainRoot, commit, branch)) continue
    const onto = head(graph.integration.worktree)
    const args = cwd === worktree ? ['rebase', '--onto', onto, commit] : ['rebase', '--onto', onto, commit, branch]
    const attempt = git(args, cwd, { allowFail: true })
    if (attempt.status !== 0) {
      git(['rebase', '--abort'], cwd, { allowFail: true })
      return { ok: false, detail: attempt.stderr || attempt.stdout || 'rebase failed' }
    }
  }
  return { ok: true }
}

// Reruns the tests for a commit the marker already guards. Records the commit in the marker when
// a kill filled in the merge but not the file.
function settleOne(mainRoot, graph, runId, taskId, integration, commit, timeoutMs) {
  if (readUnverifiedCommit(mainRoot, runId, taskId) !== commit) writeUnverifiedMarker(mainRoot, graph, runId, taskId, commit)
  return settleMerge(mainRoot, graph, runId, taskId, integration, { timeoutMs, rerun: true, marked: commit })
}

function mergeUnit(mainRoot, graph, runId, taskId, { timeoutMs = 15 * 60 * 1000, interruptAfterMerge = false } = {}) {
  const task = graph.tasks[taskId]
  if (!task) throw new Error(`${taskId} is not in run ${runId}`)
  const integration = graph.integration.worktree
  const branch = run.unitBranch(runId, taskId)
  if (!isDirectory(integration)) {
    return { merged: false, reason: 'missing-integration', detail: `the integration worktree ${integration} is missing` }
  }
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
  // This unit's untested commit is settled before anything new merges, even when a relaunch has
  // pointed the branch at that commit or added commits of its own (finding 1). Tests that pass
  // verify it; only then does a branch that still has commits of its own merge those.
  const ownCommit = unverifiedOnIntegration(mainRoot, graph, runId, taskId)
  if (ownCommit) {
    const settled = settleOne(mainRoot, graph, runId, taskId, integration, ownCommit, timeoutMs)
    if (!settled.merged) return settled
    if (!branchExists(mainRoot, branch) || isMerged(mainRoot, graph, branch)) return settled
  }
  // Another unit's untested commit is settled before this merge can land on it (finding 2).
  // A reset drops that commit. A branch cut from it is replayed without it, or the next merge
  // would bring the reverted changes back and refuse them as ownership.
  const dropped = []
  for (const other of unverifiedTasks(mainRoot, graph, runId)) {
    if (other.taskId === taskId) continue
    const settled = settleOne(mainRoot, graph, runId, other.taskId, integration, other.commit, timeoutMs)
    if (!settled.merged && settled.reverted !== true) {
      return {
        merged: false,
        reason: 'unverified-other',
        detail: `${other.taskId} has an unverified merge commit on ${graph.integration.branch} and settling it did not finish`,
      }
    }
    if (settled.reverted === true && !commitOnBranch(mainRoot, graph, other.commit)) dropped.push(other.commit)
  }
  if (dropped.length > 0 && branchExists(mainRoot, branch)) {
    const replayed = replayOffDropped(mainRoot, graph, runId, taskId, branch, dropped)
    if (!replayed.ok) return { merged: false, reason: 'merge-failed', files: [], detail: replayed.detail }
  }
  // A merge of a unit that is already in is the merge it already has (issue 002): a relaunch of a
  // unit whose merge output was lost must not try to merge its work a second time. unitStatus
  // tells an empty branch (nothing of its own since the run's base) from a merged one.
  if (branchExists(mainRoot, branch)) {
    const status = unitStatus(mainRoot, runId, taskId)
    if (status.merged) return { merged: true, commit: status.commit, already: true }
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
  // Before `git merge`, with no commit yet. A kill between the merge and the fill-in leaves this
  // marker, so status says unverified instead of merged (finding 4).
  if (!writeUnverifiedMarker(mainRoot, graph, runId, taskId, null, { before })) {
    return {
      merged: false,
      reason: 'unverified-other',
      detail: `${taskId} has an unverified merge commit still on ${graph.integration.branch}`,
    }
  }
  const attempt = git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${branch}`, branch], integration, { allowFail: true })
  if (attempt.status !== 0) {
    const unmerged = nulEntries(
      git(['-c', 'core.quotePath=false', 'diff', '--name-only', '--diff-filter=U', '-z'], integration, {
        allowFail: true,
        raw: true,
      }).stdout,
    )
    git(['merge', '--abort'], integration, { allowFail: true })
    // The merge itself failed, so the marker names nothing that landed.
    clearUnverifiedMarker(mainRoot, runId, taskId)
    // Without unmerged files, git refused before merging, as for an untracked file in the way.
    const reason = unmerged.length > 0 ? 'conflict' : 'merge-failed'
    return { merged: false, reason, files: unmerged, detail: attempt.stderr || attempt.stdout }
  }
  // A kill here is the gap the marker was written early to cover. The commit is not recorded yet.
  if (interruptAfterMerge) {
    return { merged: false, reason: 'interrupted', detail: 'killed after the merge commit and before its marker recorded the commit' }
  }

  const mergedCommit = head(integration)
  writeUnverifiedMarker(mainRoot, graph, runId, taskId, mergedCommit, { before })
  return settleMerge(mainRoot, graph, runId, taskId, integration, { timeoutMs, marked: mergedCommit })
}

// Drops one registry entry, and the directory with it when it is there. Works for a missing directory.
function unregisterWorktree(mainRoot, worktree) {
  return git(['worktree', 'remove', '--force', worktree], mainRoot, { allowFail: true }).status === 0
}

// Removes one worktree under `root`: git drops its registry entry and its directory, then whatever
// is left on disk is deleted by hand. Returns true when neither the entry nor the directory remains.
function removeWorktreePath(mainRoot, worktree, registered, root = unitsDir(mainRoot)) {
  assertInside(worktree, root)
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

// Removes a unit's worktree and branch. What the task owns among the worktree's uncommitted files is
// committed on the branch first, as salvageUnit does. The unit's work is then saved as a patch when
// the caller asks for it, when the branch is not merged into the integration branch, or when the
// worktree holds uncommitted or untracked files.
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
    if (inWorktree && graph.tasks[taskId]) commitOwnedWork(worktree, graph.tasks[taskId], taskId)
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

// True when a quota pause recorded in <mainRoot>/.aether/autonomy/<id>/run.json names this swarm run
// among its saved units. A record that cannot be read, or is not JSON, names nothing.
function pausedByQuota(mainRoot, runId) {
  const dir = path.join(run.aetherDir(mainRoot), 'autonomy')
  const names = orEmpty(() => fs.readdirSync(dir), [])
  return names.some((name) =>
    orEmpty(() => {
      const { quotaPauses } = run.readJson(path.join(dir, name, 'run.json'))
      if (!Array.isArray(quotaPauses)) return false
      return quotaPauses.some((pause) => Array.isArray(pause?.savedUnits) && pause.savedUnits.some((unit) => unit?.swarmRun === runId))
    }, false),
  )
}

// A run was interrupted when `save` wrote its saved.json, or when a quota pause names it. The sweep
// of an interrupted run keeps its unmerged branches, so that a relaunch starts from them.
function wasInterrupted(mainRoot, runId) {
  return exists(path.join(run.runDir(mainRoot, runId), 'saved.json')) || pausedByQuota(mainRoot, runId)
}

// Saves, as removeUnit does, the work of each unit of a run that is not merged or not committed.
// In an interrupted run, a unit that unitStatus (or mergedUnits) does not count as merged first
// commits on its branch what its Owns covers, and its branch is kept: it is in `saved`, with its tip.
// Returns the patch files, the saved branches, and the units whose work could not be saved (their
// base is unknown, or their commit failed), whose worktree and branch stay.
function savePatches(mainRoot, runId, interrupted) {
  const patches = []
  const kept = new Set()
  const saved = []
  const graphFile = path.join(run.runDir(mainRoot, runId), 'graph.json')
  const graph = exists(graphFile) ? run.readJson(graphFile) : null
  if (!graph && !interrupted) return { patches, kept, saved }
  const branches = aetherBranches(mainRoot, runId)
  const unitWorktree = (taskId) => {
    const worktree = run.unitWorktree(mainRoot, runId, taskId)
    return isWorktreeRoot(worktree) ? worktree : null
  }
  if (interrupted) {
    // The work is committed before mergedness is judged: a branch cut after another unit's merge, with
    // only uncommitted work of its own, would otherwise count as merged and be deleted.
    for (const { branch } of branches) {
      const taskId = branch.split('/')[2]
      const worktree = unitWorktree(taskId)
      if (!worktree) continue
      try {
        if (graph && graph.tasks[taskId]) commitOwnedWork(worktree, graph.tasks[taskId], taskId)
        // Without the graph there is no Owns to commit and no base for a patch: uncommitted work stays.
        else if (uncommittedFiles(worktree).length > 0) kept.add(taskId)
      } catch {
        kept.add(taskId)
      }
    }
  }
  const merged = graph && interrupted ? new Set(orEmpty(() => mergedUnits(mainRoot, runId), [])) : new Set()
  for (const { branch } of branches) {
    const taskId = branch.split('/')[2]
    const worktree = unitWorktree(taskId)
    const inWorktree = worktree !== null
    if (interrupted && !merged.has(taskId)) {
      try {
        if (graph && !kept.has(taskId)) patches.push(writePatch(mainRoot, graph, runId, taskId, worktree))
      } catch {
        kept.add(taskId)
      }
      saved.push({ task: taskId, branch, head: git(['rev-parse', branch], mainRoot).stdout })
      continue
    }
    if (!graph) continue
    try {
      if (!isMerged(mainRoot, graph, branch) || (inWorktree && uncommittedFiles(worktree).length > 0)) {
        patches.push(writePatch(mainRoot, graph, runId, taskId, inWorktree ? worktree : null))
      }
    } catch {
      kept.add(taskId)
    }
  }
  return { patches, kept, saved }
}

// Stops the processes of a run's lane calls: the lane's own and the agy it started, by their pid
// files, when they carry the call's marker; then every process marked as any call of the run, since
// agy starts its commands in sessions of their own. Returns the calls where something was stopped.
function stopLaneProcesses(mainRoot, runId) {
  const lanesDir = path.join(run.runDir(mainRoot, runId), 'lanes')
  const stopped = new Set()
  if (isDirectory(lanesDir)) {
    for (const call of fs.readdirSync(lanesDir).sort()) {
      const dir = path.join(lanesDir, call)
      if (!isDirectory(dir)) continue
      const marker = `${runId}/${call}`
      const results = ['pid', 'agy.pid'].map((name) => killGroup(path.join(dir, name), marker))
      if (results.some((result) => result.killed)) stopped.add(call)
    }
  }
  for (const marker of killMarked(`${runId}/`, { prefix: true })) stopped.add(marker.slice(runId.length + 1))
  return [...stopped].sort()
}

// The lane copies of a run: those in git's registry, plus any directory left in the run's folder.
function laneCopyNames(mainRoot, runId) {
  const dir = path.join(laneCopiesRoot(mainRoot), runId)
  const names = new Set()
  for (const worktree of registeredWorktrees(mainRoot)) {
    if (isInside(worktree, dir)) names.add(path.relative(dir, worktree).split(path.sep)[0])
  }
  if (isDirectory(dir)) for (const name of fs.readdirSync(dir)) names.add(name)
  return [...names].sort()
}

// Removes a run's lane copies and their folder. Only the copies' own registry entries are dropped,
// by path: git's registry is not pruned as a whole, so another worktree that happens to be
// unreachable keeps its entry.
function removeLaneCopies(mainRoot, runId) {
  const root = laneCopiesRoot(mainRoot)
  const dir = path.join(root, runId)
  const registered = new Set(registeredWorktrees(mainRoot))
  const removed = []
  for (const name of laneCopyNames(mainRoot, runId)) {
    const copy = path.join(dir, name)
    if (removeWorktreePath(mainRoot, copy, registered.has(copy), root)) removed.push(name)
  }
  if (exists(dir)) {
    assertInside(dir, root)
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return { removed, remaining: laneCopyNames(mainRoot, runId) }
}

// Removes a run's unit worktrees and branches, after saving their unsaved work as patches. A unit
// whose work cannot be saved is kept, and so is the run directory then. In an interrupted run
// (wasInterrupted), each unmerged unit's work is committed on its branch and the branch is kept, in
// `savedBranches`; the run directory stays then too. With `finish`, the run directory goes when
// nothing is kept, and `finished` says it went. The run's lane processes are stopped and its lane
// copies removed first, so nothing is still writing when the units are saved.
function sweepRun(cwd, runId, { finish = false } = {}) {
  run.assertRunId(runId)
  const { mainRoot } = repoPaths(cwd)
  const stopped = stopLaneProcesses(mainRoot, runId)
  const copies = removeLaneCopies(mainRoot, runId)
  const dir = run.worktreesDir(mainRoot, runId)
  const { patches, kept, saved } = savePatches(mainRoot, runId, wasInterrupted(mainRoot, runId))
  const savedTasks = new Set(saved.map(({ task }) => task))
  const removedWorktrees = []
  const { paths, registered } = runWorktrees(mainRoot, runId)
  for (const worktree of paths) {
    if (kept.has(path.basename(worktree))) continue
    if (removeWorktreePath(mainRoot, worktree, registered.has(worktree))) removedWorktrees.push(worktree)
  }
  if (exists(dir) && kept.size === 0) {
    assertInside(dir, unitsDir(mainRoot))
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const removedBranches = []
  for (const { branch } of aetherBranches(mainRoot, runId)) {
    const taskId = branch.split('/')[2]
    if (kept.has(taskId) || savedTasks.has(taskId)) continue
    git(['branch', '-D', branch], mainRoot)
    removedBranches.push(branch)
  }
  const runDir = run.runDir(mainRoot, runId)
  let finished = false
  if (finish && kept.size === 0 && saved.length === 0 && exists(runDir)) {
    assertInside(runDir, path.join(run.aetherDir(mainRoot), 'runs'))
    fs.rmSync(runDir, { recursive: true, force: true })
    finished = true
  }
  return {
    removedWorktrees,
    removedBranches,
    patches,
    remaining: {
      worktrees: runWorktrees(mainRoot, runId).paths.map((worktree) => path.basename(worktree)),
      branches: aetherBranches(mainRoot, runId).map(({ branch }) => branch),
    },
    lanes: { stopped, removed: copies.removed, remaining: copies.remaining },
    savedBranches: saved,
    finished,
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

// The status of the last record of `runId` in runs.jsonl, or null. Lines that are not JSON are skipped.
function lastRecordStatus(runId, dir = run.dataDir()) {
  const text = orEmpty(() => fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8'), '')
  let status = null
  for (const line of text.split('\n')) {
    const record = orEmpty(() => JSON.parse(line), null)
    if (record && record.runId === runId) status = record.status
  }
  return status
}

// Removes runs that were never finalized and have had no activity for `hours`, plus leftovers
// whose run directory is already gone. Activity is any change in the run directory or in the
// run's unit worktrees. Each removal is recorded, with the tip of every branch it deletes taken
// before the deletion. A run whose sweep keeps saved branches (an interrupted run) is not removed:
// it is recorded once as interrupted-saved, and its run directory stays for the relaunch.
function sweepStale(cwd, { hours = 24, now = Date.now() } = {}) {
  const { mainRoot } = repoPaths(cwd)
  const ids = new Set()
  for (const sub of ['runs', 'worktrees', 'lanes']) {
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
    const sweptAt = new Date(now).toISOString()
    const branches = aetherBranches(mainRoot, id)
    const abandoned = {
      runId: id,
      status: 'abandoned',
      sweptAt,
      repo: mainRoot,
      removedWorktrees: runWorktrees(mainRoot, id).paths.length,
      removedBranches: branches.length,
      branches,
    }
    // A run that was not interrupted is recorded before anything is removed, as it always was.
    const interrupted = wasInterrupted(mainRoot, id)
    if (!interrupted) run.appendRecord(abandoned)
    const { savedBranches } = sweepRun(cwd, id)
    if (savedBranches.length > 0) {
      // Its branches wait for the relaunch: the run is recorded once, and its directory stays.
      if (lastRecordStatus(id) !== 'interrupted-saved') run.appendRecord({ runId: id, status: 'interrupted-saved', sweptAt, repo: mainRoot })
      continue
    }
    if (interrupted) run.appendRecord(abandoned)
    assertInside(dir, path.join(run.aetherDir(mainRoot), 'runs'))
    fs.rmSync(dir, { recursive: true, force: true })
    swept.push(id)
  }
  return { swept }
}

module.exports = {
  ensure,
  diffPackage,
  salvageUnit,
  adoptUnit,
  finalPackage,
  unitStatus,
  mergedUnits,
  saveRun,
  merge,
  betweenMerges,
  removeUnit,
  sweepRun,
  sweepStale,
  loadGraph,
  uncommittedFiles,
  changedFiles,
  unitBase,
  isWorktreeRoot,
}
