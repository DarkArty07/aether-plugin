'use strict'

// Unit worktrees: create, package for review, merge, remove and sweep. The sweep also stops the
// processes of lane calls and removes the copies they leave.
// Family: none.
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
const { exists, nulEntries, pidAlive: processAlive, sleepSync } = require('./common.js')

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
  // Adopting would count the unit merged while its tests did not pass (issue #2). The marker stays,
  // and the Lead settles the merge before recording the unit by hand.
  const marked = unverifiedCommit(mainRoot, graph, runId, taskId)
  const marker = markerRecord(mainRoot, runId, taskId)
  if (marked || (marker && !marker.commit && !marker.before)) {
    const commitMsg = marked ? `its merge commit ${marked}` : 'an unknown merge commit'
    throw new Error(`${taskId} is unverified: ${commitMsg} is on the integration branch and its tests did not pass. Settle that merge before adopting the unit`)
  }
  const file = path.join(run.runDir(mainRoot, runId), 'adopted.json')
  const adopted = exists(file) ? run.readJson(file) : {}
  adopted[taskId] = { commit: sha, reason: reason.trim(), at: new Date().toISOString() }
  run.writeJson(file, adopted)
  return { adopted: true, task: taskId, commit: sha, reason: adopted[taskId].reason, units: Object.keys(adopted).sort() }
}

// The marker a merge leaves in the run directory while its tests have not finished (issue #2).
// It is written with no commit before `git merge`, and filled in with the merge commit after.
// The mod kills the process at 600 s. A kill during the merge, or between the merge and the fill,
// still leaves the marker; status then says the unit is not merged. The file names that merge
// commit once it exists, so a rerun settles this unit and not an earlier one.
function unverifiedMarker(mainRoot, runId, taskId) {
  return path.join(run.runDir(mainRoot, runId), 'unverified', `${taskId}.json`)
}

// `before` is the integration tip the merge is about to be made on. It is recorded only on the
// first write, which has no commit yet: a later fallback may take a merge only when that tip is
// its first parent, so an older verified merge of the same unit is not that commit (issue #2).
function writeUnverifiedMarker(mainRoot, runId, taskId, commit, before = null) {
  const file = unverifiedMarker(mainRoot, runId, taskId)
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const body = { commit: commit || null }
  if (!commit && before) body.before = before
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`)
  fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`)
  fs.renameSync(tmp, file)
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

// The marker's record, or null when there is no file. A kill can leave a half-written file;
// that still counts as a marker, with no commit of its own.
function markerRecord(mainRoot, runId, taskId) {
  const file = unverifiedMarker(mainRoot, runId, taskId)
  if (!exists(file)) return null
  try {
    const marker = JSON.parse(fs.readFileSync(file, 'utf8'))
    const commit = typeof marker?.commit === 'string' && marker.commit !== '' ? marker.commit : null
    const before = typeof marker?.before === 'string' && marker.before !== '' ? marker.before : null
    return { commit, before }
  } catch {
    return { commit: null, before: null }
  }
}

function commitOnBranch(mainRoot, graph, commit) {
  if (!commit) return false
  return git(['merge-base', '--is-ancestor', commit, graph.integration.branch], mainRoot, { allowFail: true }).status === 0
}

// The merge commit of `branch` still on the integration branch, found by its subject, or null.
// Topological order, not commit dates: a marker written before the fill has no commit of its own,
// and the history is the only record, including when the unit branch itself is gone.
// Only a merge whose first parent is `before` counts. The first `Merge <branch>` in the history
// is the wrong commit when that unit was already merged and verified and a later merge was killed
// before it committed (issue #2). Without `before` there is nothing to match.
function mergeSubjectCommit(mainRoot, graph, branch, before) {
  const wanted = fullCommit(mainRoot, before)
  if (!wanted) return null
  const log = git(['log', '--topo-order', '--format=%H %s', graph.integration.branch], mainRoot, { allowFail: true })
  if (log.status !== 0 || log.stdout === '') return null
  const subject = `Merge ${branch}`
  for (const line of log.stdout.split('\n')) {
    const space = line.indexOf(' ')
    if (space === -1 || line.slice(space + 1) !== subject) continue
    const sha = line.slice(0, space)
    const parent = git(['rev-parse', '--verify', '--quiet', `${sha}^1`], mainRoot, { allowFail: true })
    if (parent.status === 0 && parent.stdout === wanted) return sha
  }
  return null
}

// The full sha of `commit`, or null when it is not a commit of this repository.
function fullCommit(mainRoot, commit) {
  if (!commit) return null
  const resolved = git(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`], mainRoot, { allowFail: true })
  return resolved.status === 0 ? resolved.stdout : null
}

// The merge commit a marker still has on the integration branch, or null when the marker is
// absent or its commit is not on that branch. A marker with no commit yet is that commit when
// `Merge <branch>` is on the branch, and no merge at all when it is not (issue #2, decision A77).
function unverifiedCommit(mainRoot, graph, runId, taskId) {
  const marker = markerRecord(mainRoot, runId, taskId)
  if (!marker) return null
  if (marker.commit) {
    const sha = fullCommit(mainRoot, marker.commit)
    return sha && commitOnBranch(mainRoot, graph, sha) ? sha : null
  }
  const found = mergeSubjectCommit(mainRoot, graph, run.unitBranch(runId, taskId), marker.before)
  return found && commitOnBranch(mainRoot, graph, found) ? found : null
}

// Whether a unit's branch is already in the integration branch, from the git history alone
// (issue 002): the workflow asks this when a merge's own output was unreadable, instead of
// trusting captured output as the only evidence of the merge. `commit` is the first merge
// commit on the integration branch that took the unit in, or the unit's tip when there is none.
// A marker whose merge commit is still on the integration branch (issue #2) is asked first:
// `merged` is false and `unverified` is true whatever the unit branch's tip is, and even when
// that branch is gone, until a rerun keeps the commit or resets it.
function unitStatus(cwd, runId, taskId) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (!graph.tasks[taskId]) throw new Error(`${taskId} is not in run ${runId}`)
  const branch = run.unitBranch(runId, taskId)
  const exists = branchExists(mainRoot, branch)
  const tip = exists ? git(['rev-parse', branch], mainRoot).stdout : null
  const marker = markerRecord(mainRoot, runId, taskId)
  if (marker) {
    const marked = unverifiedCommit(mainRoot, graph, runId, taskId)
    if (marked) return { merged: false, unverified: true, commit: marked, branch: exists ? branch : null, head: tip }
    // A marker that is unreadable or has neither commit nor before is unverified with unknown commit:
    if (!marker.commit && !marker.before) {
      return { merged: false, unverified: true, commit: null, branch: exists ? branch : null, head: tip }
    }
  }
  if (!exists) return { merged: false, branch: null, commit: null }
  // A branch with no change of its own since the run's base is an ancestor of everything
  // and merged nothing. (unitBase cannot say this: after a merge it is the branch's tip.)
  const own = changedFiles(mainRoot, graph.integration.base, branch)
  // A branch made after another unit's merge starts on the integration branch's own line with no commit of its own: it
  // merged nothing, whatever the base-to-tip diff holds. A merged unit's tip is the second parent of its merge commit.
  const line = git(['rev-list', '--first-parent', graph.integration.branch], mainRoot, { allowFail: true }).stdout.split('\n')
  if (own.length === 0 || line.includes(tip) || !isMerged(mainRoot, graph, branch)) return { merged: false, branch, commit: null, head: tip }
  const merges = git(['rev-list', '--merges', '--reverse', `${branch}..${graph.integration.branch}`], mainRoot, { allowFail: true }).stdout
  const commit = merges === '' ? tip : merges.split('\n')[0]
  return { merged: true, branch, commit, head: tip }
}

// The ids of a run's graph, in task number order.
function taskIdsInOrder(graph) {
  return Object.keys(graph.tasks).sort((a, b) => graph.tasks[a].number - graph.tasks[b].number)
}

// The task ids that have a marker file. The graph is the wrong list: a relaunch with --only, or a
// unit the Lead adopted, drops tasks from it, and a live marker of one of those would be invisible
// (issue #2). The file name is the task id. A name that is not a task id is ignored.
function markerTaskIds(mainRoot, runId) {
  const dir = path.join(run.runDir(mainRoot, runId), 'unverified')
  if (!isDirectory(dir)) return []
  const ids = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const taskId = name.slice(0, -'.json'.length)
    try {
      run.assertTaskId(taskId)
    } catch {
      continue
    }
    const file = path.join(dir, name)
    if (!fs.statSync(file).isFile()) continue
    ids.push(taskId)
  }
  return ids.sort((a, b) => Number(a.slice('task-'.length)) - Number(b.slice('task-'.length)))
}

// Markers whose commit is still on the integration branch. Deleting the run directory would drop
// the only record that those commits are untested, and they would then count as merged (issue #2).
function liveUnverified(mainRoot, runId) {
  const graphFile = path.join(run.runDir(mainRoot, runId), 'graph.json')
  if (!exists(graphFile)) return []
  const graph = orEmpty(() => run.readJson(graphFile), null)
  if (!graph || !graph.integration) return []
  const live = []
  for (const taskId of markerTaskIds(mainRoot, runId)) {
    const marker = markerRecord(mainRoot, runId, taskId)
    if (!marker) continue
    if (!marker.commit && !marker.before) {
      live.push({ task: taskId, commit: null })
      continue
    }
    const commit = orEmpty(() => unverifiedCommit(mainRoot, graph, runId, taskId), null)
    if (commit) live.push({ task: taskId, commit })
  }
  return live
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
  // A marker whose commit is on the integration branch is not merged, whether or not the unit
  // branch's tip is an ancestor and whether or not the branch is still there (issue #2).
  const unverified = (taskId) => {
    const marker = markerRecord(mainRoot, runId, taskId)
    if (!marker) return false
    if (!marker.commit && !marker.before) return true
    return unverifiedCommit(mainRoot, graph, runId, taskId) !== null
  }
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
    if (subjects.has(`Merge ${run.unitBranch(runId, taskId)}`)) merged.add(taskId)
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

// Runs the plan's tests against the merge commit that is already on the integration branch, then
// keeps that commit or resets it. The marker is written before this runs. It is removed when the
// tests have finished and the merge was kept or reset; a process killed during the tests leaves
// it (issue #2). `before` is the integration tip this merge commit was made on, and the commit is
// undone only while it is still the tip. `rerun` marks a call that did not merge again, and the
// commit it returns is the marked one, not whatever the worktree's head is afterwards.
function settleMerge(mainRoot, graph, runId, taskId, integration, before, { timeoutMs, rerun = false, commit = null }) {
  const tests = spawnSync(graph.testCommand, {
    cwd: integration,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })
  const kept = (extra) => {
    clearUnverifiedMarker(mainRoot, runId, taskId)
    const result = { merged: true, commit: rerun && commit ? commit : head(integration) }
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
  // Undo only the merge commit this call is settling, and only while it is still the tip.
  const reverted = git(['rev-parse', 'HEAD^1'], integration).stdout === before
  if (reverted) git(['reset', '--hard', before], integration)
  // Tests finished. The marker stays only when the commit could not be reverted, so the unit remains unverified.
  if (reverted) clearUnverifiedMarker(mainRoot, runId, taskId)
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

function mergeUnit(mainRoot, graph, runId, taskId, { timeoutMs = 15 * 60 * 1000 } = {}) {
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
  // A kill inside git merge leaves MERGE_HEAD and this unit's marker with no commit. The worktree
  // then looks dirty, and every later merge is refused with nothing that recovers it (issue #2).
  abortUnfinishedMerge(mainRoot, runId, taskId, integration)
  if (git(['status', '--porcelain', '--untracked-files=no'], integration).stdout !== '') {
    return { merged: false, reason: 'dirty-integration', detail: 'the integration worktree has uncommitted changes' }
  }
  // A merge never starts on top of a commit whose tests did not finish (issue #2). The marker
  // files are the list, not the graph: a relaunch with --only, or a unit the Lead adopted, drops
  // tasks from the graph and would hide a live marker. Another unit's marker is refused at once,
  // with no test run and no attempt to settle that unit. This unit's marker is rerun only while
  // its commit is still the tip and its branch is already merged; anything newer is left as it is.
  const pending = []
  for (const id of markerTaskIds(mainRoot, runId)) {
    const marker = markerRecord(mainRoot, runId, id)
    if (!marker) continue
    if (!marker.commit && !marker.before) {
      pending.push({ task: id, commit: null })
      continue
    }
    const commit = unverifiedCommit(mainRoot, graph, runId, id)
    if (commit) pending.push({ task: id, commit })
  }
  const other = pending.find((item) => item.task !== taskId)
  if (other) return { merged: false, reason: 'unverified-other', task: other.task, commit: other.commit }
  const mine = pending.find((item) => item.task === taskId)
  if (mine) {
    const tip = git(['rev-parse', graph.integration.branch], mainRoot).stdout
    if (!mine.commit || mine.commit !== tip) return { merged: false, reason: 'unverified-buried', commit: mine.commit }
    // A relaunch can commit more on the branch that was kept. The marked commit is still the tip,
    // but those commits are not in it: rerunning the tests would pass the old tree and report the
    // unit merged, and close would then keep the new commits only as a patch (issue #2). A branch
    // that is already merged, or already gone, has nothing newer, so the rerun is the one it was.
    if (branchExists(mainRoot, branch) && !isMerged(mainRoot, graph, branch)) {
      return { merged: false, reason: 'unverified-moved', commit: mine.commit }
    }
    const before = git(['rev-parse', `${mine.commit}^1`], integration).stdout
    return settleMerge(mainRoot, graph, runId, taskId, integration, before, { timeoutMs, rerun: true, commit: mine.commit })
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
  // Before the merge, with no commit yet: a kill between the merge and the fill still leaves it.
  // `before` is this tip, so the fallback cannot take an older merge of the same unit. A merge
  // that fails before the tests start clears it, so a conflict leaves no marker.
  writeUnverifiedMarker(mainRoot, runId, taskId, null, before)
  let attempt
  try {
    attempt = git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${branch}`, branch], integration, { allowFail: true })
  } catch (err) {
    clearUnverifiedMarker(mainRoot, runId, taskId)
    throw err
  }
  if (attempt.status !== 0) {
    const unmerged = nulEntries(
      git(['-c', 'core.quotePath=false', 'diff', '--name-only', '--diff-filter=U', '-z'], integration, {
        allowFail: true,
        raw: true,
      }).stdout,
    )
    git(['merge', '--abort'], integration, { allowFail: true })
    clearUnverifiedMarker(mainRoot, runId, taskId)
    // Without unmerged files, git refused before merging, as for an untracked file in the way.
    const reason = unmerged.length > 0 ? 'conflict' : 'merge-failed'
    return { merged: false, reason, files: unmerged, detail: attempt.stderr || attempt.stdout }
  }

  const mergedCommit = head(integration)
  writeUnverifiedMarker(mainRoot, runId, taskId, mergedCommit)
  return settleMerge(mainRoot, graph, runId, taskId, integration, before, { timeoutMs, commit: mergedCommit })
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

// MERGE_HEAD of the integration worktree, or null when this worktree is not mid-merge.
function mergeHeadFile(integration) {
  const found = git(['rev-parse', '--git-path', 'MERGE_HEAD'], integration, { allowFail: true })
  if (found.status !== 0 || found.stdout === '') return null
  const file = path.resolve(integration, found.stdout)
  return exists(file) ? file : null
}

// A kill inside git merge leaves MERGE_HEAD and this unit's marker with no commit. Abort that
// merge and clear the marker, so the worktree is usable again. A kill in the post-merge hook is
// later: the merge commit is already HEAD, and MERGE_HEAD stays until the hook returns. Abort
// then only drops that leftover state. The marker stays, so the commit is still unverified and a
// rerun can settle it; clearing it would report the unit as having nothing to merge. If the abort
// does move that commit, it is put back: a reset may not undo it (issue #2). A marker that already
// names its commit, or another unit's merge, is left alone.
function abortUnfinishedMerge(mainRoot, runId, taskId, integration) {
  const marker = markerRecord(mainRoot, runId, taskId)
  if (!marker || marker.commit) return
  if (!mergeHeadFile(integration)) return
  const branch = run.unitBranch(runId, taskId)
  if (!branchExists(mainRoot, branch)) return
  const unitTip = git(['rev-parse', branch], mainRoot).stdout
  const mergeHead = git(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], integration, { allowFail: true })
  if (mergeHead.status !== 0 || !mergeHead.stdout) return
  const mHead = mergeHead.stdout
  const isOwn = mHead === unitTip || git(['merge-base', '--is-ancestor', mHead, unitTip], mainRoot, { allowFail: true }).status === 0
  if (!isOwn) return

  const tip = head(integration)
  const committed = git(['merge-base', '--is-ancestor', mHead, 'HEAD'], integration, { allowFail: true }).status === 0
  const aborted = git(['merge', '--abort'], integration, { allowFail: true })
  if (aborted.status !== 0) return
  if (committed) {
    if (head(integration) !== tip) git(['reset', '--hard', tip], integration)
    return
  }
  clearUnverifiedMarker(mainRoot, runId, taskId)
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

// Where a patch of this unit starts. After a merge, unitBase is the branch tip, so the diff of an
// unverified unit would be empty and its work would be gone once that commit is reset. The parent
// of the marked merge commit is the integration line the branch was merged onto.
function patchBase(mainRoot, graph, runId, taskId, branch) {
  const marked = unverifiedCommit(mainRoot, graph, runId, taskId)
  if (!marked) return unitBase(mainRoot, graph, branch)
  const parent = git(['rev-parse', '--verify', '--quiet', `${marked}^1`], mainRoot, { allowFail: true })
  if (parent.status !== 0) return unitBase(mainRoot, graph, branch)
  const base = git(['merge-base', parent.stdout, branch], mainRoot, { allowFail: true })
  if (base.status !== 0 || base.stdout === '') return unitBase(mainRoot, graph, branch)
  return base.stdout
}

// Saves the unit's work that is not in the integration branch as a patch for `git apply`.
// When the worktree is there, the patch also covers its uncommitted and untracked files.
function writePatch(mainRoot, graph, runId, taskId, worktree) {
  const branch = run.unitBranch(runId, taskId)
  const base = patchBase(mainRoot, graph, runId, taskId, branch)
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

// Removes a unit's worktree and, unless its merge is still unverified, its branch. What the task owns
// among the worktree's uncommitted files is committed on the branch first, as salvageUnit does. The
// unit's work is then saved as a patch when the caller asks for it, when the branch is not merged
// into the integration branch, when that merge is still unverified, or when the worktree holds
// uncommitted or untracked files.
function removeUnit(cwd, runId, taskId, { keepPatch = false } = {}) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const worktree = run.unitWorktree(mainRoot, runId, taskId)
  const branch = run.unitBranch(runId, taskId)
  const hasBranch = branchExists(mainRoot, branch)
  const inWorktree = isWorktreeRoot(worktree)
  let patch = null
  // An unverified merge is on the integration branch, so the unit tip looks merged. Removing it
  // would drop the only copy of the work once that commit is reset by hand (issue #2).
  let keepBranch = false
  if (hasBranch) {
    const graph = loadGraph(mainRoot, runId)
    if (inWorktree && graph.tasks[taskId]) commitOwnedWork(worktree, graph.tasks[taskId], taskId)
    keepBranch = unverifiedCommit(mainRoot, graph, runId, taskId) !== null
    if (keepPatch || keepBranch || !isMerged(mainRoot, graph, branch) || (inWorktree && uncommittedFiles(worktree).length > 0)) {
      patch = writePatch(mainRoot, graph, runId, taskId, inWorktree ? worktree : null)
    }
  }
  removeWorktreePath(mainRoot, worktree, registeredWorktrees(mainRoot).includes(worktree))
  if (hasBranch && !keepBranch) git(['branch', '-D', branch], mainRoot)
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
    // The same as removeUnit: a marker whose commit is on the integration branch is not merged,
    // so the sweep writes the patch and keeps the branch (issue #2).
    const marked = unverifiedCommit(mainRoot, graph, runId, taskId) !== null
    try {
      if (marked || !isMerged(mainRoot, graph, branch) || (inWorktree && uncommittedFiles(worktree).length > 0)) {
        patches.push(writePatch(mainRoot, graph, runId, taskId, inWorktree ? worktree : null))
      }
    } catch {
      kept.add(taskId)
    }
    if (marked && !kept.has(taskId)) saved.push({ task: taskId, branch, head: git(['rev-parse', branch], mainRoot).stdout })
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
  // A live marker is the only record that its commit is untested. finalize reaches this with
  // finish set; deleting the directory would make that commit count as merged (issue #2).
  const live = liveUnverified(mainRoot, runId)
  if (finish && kept.size === 0 && saved.length === 0 && live.length === 0 && exists(runDir)) {
    assertInside(runDir, path.join(run.aetherDir(mainRoot), 'runs'))
    fs.rmSync(runDir, { recursive: true, force: true })
    finished = true
  }
  const result = {
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
  if (!finished && live.length > 0) result.unverified = true
  return result
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
    // A marker whose commit is on the integration branch keeps the run directory: deleting it
    // would drop the only record that the commit is untested (issue #2). Checked before the
    // sweep, which does not remove marker files. Check live marker before appending abandoned,
    // so a finalized run does not become abandoned and records once.
    const live = liveUnverified(mainRoot, id)
    const interrupted = wasInterrupted(mainRoot, id)
    const lastStatus = lastRecordStatus(id)
    if (!interrupted && live.length === 0) run.appendRecord(abandoned)
    else if (!interrupted && live.length > 0 && lastStatus !== 'finalized' && lastStatus !== 'abandoned') {
      run.appendRecord(abandoned)
    }
    const { savedBranches } = sweepRun(cwd, id)
    if (savedBranches.length > 0) {
      // Its branches wait for the relaunch: the run is recorded once, and its directory stays.
      if (lastStatus !== 'interrupted-saved') run.appendRecord({ runId: id, status: 'interrupted-saved', sweptAt, repo: mainRoot })
      continue
    }
    if (live.length > 0) continue
    if (interrupted && lastStatus !== 'finalized' && lastStatus !== 'abandoned') run.appendRecord(abandoned)
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
  writeUnverifiedMarker,
  abortUnfinishedMerge,
  readBaseline,
}
