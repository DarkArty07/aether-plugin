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
  const pending = uncommittedFiles(worktree)
  const committed = pending.filter((file) => matchesAny(file, task.owns))
  const left = pending.filter((file) => !committed.includes(file))
  if (committed.length > 0) {
    // -A with paths also stages a deletion. Without an identity of its own, the repository's commit would fail.
    git(['add', '-A', '--', ...committed], worktree)
    const identity = git(['config', 'user.email'], worktree, { allowFail: true }).stdout === '' ? ['-c', 'user.name=Aether', '-c', 'user.email=aether@localhost'] : []
    git([...identity, 'commit', '--no-verify', '-q', '-m', `aether: ${taskId} work saved without its report`], worktree)
  }
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

// Whether a unit's branch is already in the integration branch, from the git history alone
// (issue 002): the workflow asks this when a merge's own output was unreadable, instead of
// trusting captured output as the only evidence of the merge. `commit` is the first merge
// commit on the integration branch that took the unit in, or the unit's tip when there is none.
function unitStatus(cwd, runId, taskId) {
  run.assertRunId(runId)
  run.assertTaskId(taskId)
  const { mainRoot } = repoPaths(cwd)
  const graph = loadGraph(mainRoot, runId)
  if (!graph.tasks[taskId]) throw new Error(`${taskId} is not in run ${runId}`)
  const branch = run.unitBranch(runId, taskId)
  if (!branchExists(mainRoot, branch)) return { merged: false, branch: null, commit: null }
  const tip = git(['rev-parse', branch], mainRoot).stdout
  // A branch with no change of its own since the run's base is an ancestor of everything
  // and merged nothing. (unitBase cannot say this: after a merge it is the branch's tip.)
  const own = changedFiles(mainRoot, graph.integration.base, branch)
  if (own.length === 0 || !isMerged(mainRoot, graph, branch)) return { merged: false, branch, commit: null, head: tip }
  const merges = git(['rev-list', '--merges', '--reverse', `${branch}..${graph.integration.branch}`], mainRoot, { allowFail: true }).stdout
  const commit = merges === '' ? tip : merges.split('\n')[0]
  return { merged: true, branch, commit, head: tip }
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
  if (git(['status', '--porcelain', '--untracked-files=no'], integration).stdout !== '') {
    return { merged: false, reason: 'dirty-integration', detail: 'the integration worktree has uncommitted changes' }
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
  const attempt = git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${branch}`, branch], integration, { allowFail: true })
  if (attempt.status !== 0) {
    const unmerged = nulEntries(
      git(['-c', 'core.quotePath=false', 'diff', '--name-only', '--diff-filter=U', '-z'], integration, {
        allowFail: true,
        raw: true,
      }).stdout,
    )
    git(['merge', '--abort'], integration, { allowFail: true })
    // Without unmerged files, git refused before merging, as for an untracked file in the way.
    const reason = unmerged.length > 0 ? 'conflict' : 'merge-failed'
    return { merged: false, reason, files: unmerged, detail: attempt.stderr || attempt.stdout }
  }

  const tests = spawnSync(graph.testCommand, {
    cwd: integration,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (tests.status !== 0) {
    // A run that was killed (timed out, or its output overflowed the buffer) did not finish, so its
    // output cannot show that only known tests fail. Such a run is undone without the baseline.
    const output = `${tests.stdout || ''}\n${tests.stderr || ''}`
    const verdict = tests.status === null ? { pass: false } : judge(readBaseline(mainRoot, runId), { exitCode: tests.status, output })
    if (verdict.pass) return { merged: true, commit: head(integration), knownFailures: verdict.known }
    // Undo only the merge commit this call created.
    const reverted = git(['rev-parse', 'HEAD^1'], integration).stdout === before
    if (reverted) git(['reset', '--hard', before], integration)
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
  return { merged: true, commit: head(integration) }
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

// Saves, as removeUnit does, the work of each unit of a run that is not merged or not committed.
// Returns the patch files, and the units whose work could not be saved (their base is unknown).
function savePatches(mainRoot, runId) {
  const patches = []
  const kept = new Set()
  const graphFile = path.join(run.runDir(mainRoot, runId), 'graph.json')
  if (!exists(graphFile)) return { patches, kept }
  const graph = run.readJson(graphFile)
  for (const { branch } of aetherBranches(mainRoot, runId)) {
    const taskId = branch.split('/')[2]
    const worktree = run.unitWorktree(mainRoot, runId, taskId)
    const inWorktree = isWorktreeRoot(worktree)
    try {
      if (!isMerged(mainRoot, graph, branch) || (inWorktree && uncommittedFiles(worktree).length > 0)) {
        patches.push(writePatch(mainRoot, graph, runId, taskId, inWorktree ? worktree : null))
      }
    } catch {
      kept.add(taskId)
    }
  }
  return { patches, kept }
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
// whose work cannot be saved is kept, and so is the run directory then. With `finish`, the run
// directory goes too. The run's lane processes are stopped and its lane copies removed first, so
// nothing is still writing when the units are saved.
function sweepRun(cwd, runId, { finish = false } = {}) {
  run.assertRunId(runId)
  const { mainRoot } = repoPaths(cwd)
  const stopped = stopLaneProcesses(mainRoot, runId)
  const copies = removeLaneCopies(mainRoot, runId)
  const dir = run.worktreesDir(mainRoot, runId)
  const { patches, kept } = savePatches(mainRoot, runId)
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
    if (kept.has(branch.split('/')[2])) continue
    git(['branch', '-D', branch], mainRoot)
    removedBranches.push(branch)
  }
  const runDir = run.runDir(mainRoot, runId)
  if (finish && kept.size === 0 && exists(runDir)) {
    assertInside(runDir, path.join(run.aetherDir(mainRoot), 'runs'))
    fs.rmSync(runDir, { recursive: true, force: true })
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

module.exports = {
  ensure,
  diffPackage,
  salvageUnit,
  adoptUnit,
  finalPackage,
  unitStatus,
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
