'use strict'

// The workspaces of lane calls and the checks that run from outside them. An external agent is
// trusted with nothing: the implementer works in its unit worktree, a read-only role works in a
// disposable copy, and these functions look at git afterwards to see what really changed.
// Only paths under <repo>/.aether/lanes/ are removed here.
// Family: lane.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { git, repoPaths } = require('./git.js')
const { matchesAny } = require('./globs.js')
const { exists } = require('./common.js')
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
  // ensure commits owned files when it reopens a worktree, so a patch applied any earlier would land
  // as commits. Applying it here, on the clean tree start just created, leaves it uncommitted, which
  // is what the next pair's prompt says it will find. The worktree does not exist before start.
  applyArmedCarry(mainRoot, runId, taskId, workdir)
  return { workdir, brief }
}

// A failed delegate attempt leaves one patch that is already the whole diff from the integration
// base. The next attempt applies that one patch, never a stack of them: stacking would apply the
// same lines twice. The delegate arms it before start, because the prompt is written first and has
// to agree with the tree.

const CARRY_UNAPPLICABLE = 'the earlier work was not carried over: the patch does not apply cleanly'

const carryOutside = (files) => `the earlier work was not carried over: the patch touches a path outside the paths this charge owns: ${files.join(', ')}`

function carryDir(mainRoot, runId) {
  return path.join(run.runDir(mainRoot, runId), 'carry')
}

function carryRequest(mainRoot, runId, taskId) {
  return path.join(carryDir(mainRoot, runId), `${taskId}.json`)
}

function carryReceipt(mainRoot, runId, taskId) {
  return path.join(carryDir(mainRoot, runId), `${taskId}.result.json`)
}

function patchHasDiff(file) {
  try {
    return fs.readFileSync(file).includes(Buffer.from('diff --git '))
  } catch {
    return false
  }
}

// Tokens of a quoted diff path (`diff --git`, or a `rename from` / `copy from` source). Git quotes
// a path that holds a byte that is not ASCII, and writes each of those bytes as octal. The bytes
// are the path's UTF-8, which is what Owns compares.
function gitDiffTokens(rest) {
  const tokens = []
  let i = 0
  while (i < rest.length) {
    if (rest[i] === ' ') {
      i += 1
      continue
    }
    if (rest[i] !== '"') {
      let j = i
      while (j < rest.length && rest[j] !== ' ') j += 1
      tokens.push(rest.slice(i, j))
      i = j
      continue
    }
    const bytes = []
    let j = i + 1
    while (j < rest.length && rest[j] !== '"') {
      if (rest[j] === '\\') {
        const n = rest[j + 1]
        if (n >= '0' && n <= '7') {
          const oct = /^[0-7]{1,3}/.exec(rest.slice(j + 1, j + 4))
          if (oct) {
            bytes.push(parseInt(oct[0], 8))
            j += 1 + oct[0].length
            continue
          }
        }
        if (n === undefined) break
        const mapped = n === 'n' ? '\n' : n === 't' ? '\t' : n
        for (const byte of Buffer.from(mapped, 'utf8')) bytes.push(byte)
        j += 2
        continue
      }
      for (const byte of Buffer.from(rest[j], 'utf8')) bytes.push(byte)
      j += 1
    }
    if (rest[j] === '"') j += 1
    tokens.push(Buffer.from(bytes).toString('utf8'))
    i = j
  }
  return tokens
}

function addPatchPath(paths, file) {
  const normalized = String(file).replace(/\\/g, '/')
  if (normalized === '' || normalized === '/dev/null' || normalized === 'dev/null') return
  paths.add(normalized)
}

// Records of `git apply --numstat -z`: `added\tdeleted\tpath\0`. A binary file is `-` for both
// counts, and an empty or mode-only file is `0\t0`. The path is the one git would write, spaces
// and non-ASCII included, with no quotes. An empty record is the trailing NUL. Anything else,
// including a listing that does not end on a NUL, is not a list we can trust.
function parseNumstatZ(bytes) {
  if (bytes === null || bytes === undefined) return null
  if (bytes.length === 0) return []
  const records = []
  let start = 0
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) continue
    records.push(bytes.subarray(start, i))
    start = i + 1
  }
  if (start !== bytes.length) return null
  const paths = []
  for (const record of records) {
    if (record.length === 0) continue
    const text = record.toString('utf8')
    const tab = text.indexOf('\t')
    const tab2 = tab === -1 ? -1 : text.indexOf('\t', tab + 1)
    if (tab === -1 || tab2 === -1) return null
    const added = text.slice(0, tab)
    const deleted = text.slice(tab + 1, tab2)
    const name = text.slice(tab2 + 1)
    if (!/^(\d+|-)$/.test(added) || !/^(\d+|-)$/.test(deleted) || name === '') return null
    paths.push(name)
  }
  return paths
}

// Git lists the paths at the top of the worktree. From a subdirectory it skips paths outside
// that directory and still exits 0, so a path outside --owns would not be judged.
function numstatPaths(cwd, patchFile) {
  try {
    const top = repoPaths(cwd).worktree
    const listed = git(['apply', '--numstat', '-z', '--', path.resolve(patchFile)], top, { allowFail: true, raw: true })
    if (listed.status !== 0) return null
    return parseNumstatZ(listed.bytes)
  } catch {
    return null
  }
}

// `git apply --numstat` names only the path it would write. A rename or a copy also touches its
// source, and that source is not in the listing, so it comes from the extended header. A hunk
// line is prefixed (`-rename from`, `--- note`) and does not match. A quoted source is the octal
// form of `diff --git`. A source that does not decode refuses the patch: a missed source is how
// a rename into --owns would be carried. Reading the text can only add a path, so a false match
// refuses a carry rather than allowing one.
function headerSources(text) {
  const sources = []
  for (const line of String(text).split('\n')) {
    const renamed = /^(?:rename|copy) from (.*)$/.exec(line)
    if (!renamed) continue
    const raw = renamed[1]
    if (raw.startsWith('"')) {
      if (!raw.endsWith('"')) return null
      const tokens = gitDiffTokens(raw)
      if (tokens.length !== 1 || tokens[0] === '') return null
      sources.push(tokens[0])
      continue
    }
    if (raw === '') return null
    sources.push(raw)
  }
  return sources
}

// Every path the patch touches, or null when git cannot list it. There is no fallback to reading
// the diff text for the destination: that reading dropped binary files, empty files and mode-only
// changes whose names contain a space, and the patch was then applied whole.
function patchPaths(cwd, patchFile, text) {
  const listed = numstatPaths(cwd, patchFile)
  if (listed === null) return null
  const sources = headerSources(text)
  if (sources === null) return null
  const paths = new Set()
  for (const file of listed) addPatchPath(paths, file)
  for (const file of sources) addPatchPath(paths, file)
  return [...paths]
}

// A path is inside the charge's owns when the same matcher as the ownership check says so, and it
// does not climb out of the tree.
function pathOwned(file, owns) {
  if (file.startsWith('/') || file.split('/').includes('..')) return false
  return matchesAny(file, owns)
}

// The branch the next unit worktree is created from. With a run, that is its integration branch;
// HEAD may be another checkout, and a check there would approve a patch the worktree then rejects.
function carryBranch(cwd, runId) {
  if (runId === null || runId === undefined) return 'HEAD'
  try {
    const { mainRoot } = repoPaths(cwd)
    const branch = loadGraph(mainRoot, runId).integration?.branch
    return typeof branch === 'string' && branch !== '' ? branch : null
  } catch {
    return null
  }
}

// Whether `git apply` would accept the patch on a clean checkout of `branch`. The check runs at
// the top of the repository: from a subdirectory git skips paths outside it and can exit 0 while
// the same patch does not apply. The index is private, so a dirty integration worktree is not the tree under test.
function patchApplies(cwd, patchFile, branch) {
  if (typeof branch !== 'string' || branch === '') return false
  let top
  try {
    top = repoPaths(cwd).worktree
  } catch {
    return false
  }
  const index = path.join(path.dirname(patchFile), '..', `carry-check-${process.pid}.index`)
  const env = { ...process.env, GIT_INDEX_FILE: path.resolve(top, index) }
  try {
    fs.rmSync(env.GIT_INDEX_FILE, { force: true })
    const read = spawnSync('git', ['read-tree', branch], { cwd: top, env, encoding: 'utf8' })
    if (read.status !== 0) return false
    return spawnSync('git', ['apply', '--cached', '--check', '--', path.resolve(patchFile)], { cwd: top, env, encoding: 'utf8' }).status === 0
  } finally {
    // The check is the only user of this index. A lock left behind would make the next check refuse the patch.
    fs.rmSync(env.GIT_INDEX_FILE, { force: true })
    fs.rmSync(`${env.GIT_INDEX_FILE}.lock`, { force: true })
  }
}

// { apply: true } when the next pair should start from this patch. empty: the attempt left no diff.
// Otherwise reason is what the result tells the Lead. runId, when the caller has one, selects the
// run's integration branch; without it the check is against HEAD.
function assessCarry(cwd, patchFile, owns, runId = null) {
  let text
  try {
    text = fs.readFileSync(patchFile)
  } catch {
    return { apply: false, empty: true }
  }
  if (!text.includes(Buffer.from('diff --git '))) return { apply: false, empty: true }
  const paths = patchPaths(cwd, patchFile, text.toString('utf8'))
  if (paths === null || paths.length === 0) return { apply: false, reason: CARRY_UNAPPLICABLE }
  const outside = paths.filter((file) => !pathOwned(file, owns)).sort()
  if (outside.length > 0) return { apply: false, reason: carryOutside(outside) }
  const branch = carryBranch(cwd, runId)
  if (branch === null || !patchApplies(cwd, patchFile, branch)) return { apply: false, reason: CARRY_UNAPPLICABLE }
  return { apply: true }
}

// Arms the patch prepareImplementer applies, or clears an arm left by an attempt that never started.
function armCarry(cwd, runId, taskId, patch) {
  const { mainRoot } = repoPaths(cwd)
  const file = carryRequest(mainRoot, runId, taskId)
  if (!patch) {
    fs.rmSync(file, { force: true })
    return
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify({ patch: path.resolve(patch) })}\n`)
}

function takeArmedCarry(mainRoot, runId, taskId) {
  const file = carryRequest(mainRoot, runId, taskId)
  let data
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  } finally {
    fs.rmSync(file, { force: true })
  }
  if (!data || typeof data.patch !== 'string') return null
  const resolved = path.resolve(data.patch)
  const patches = path.join(run.runDir(mainRoot, runId), 'patches')
  const rel = path.relative(patches, resolved)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return fs.existsSync(resolved) ? resolved : null
}

function applyArmedCarry(mainRoot, runId, taskId, worktree) {
  const patch = takeArmedCarry(mainRoot, runId, taskId)
  if (!patch) return
  let applied = false
  const check = git(['apply', '--check', patch], worktree, { allowFail: true })
  if (check.status === 0) {
    try {
      git(['apply', patch], worktree)
      applied = true
    } catch {
      // The check said it would apply and it did not: the pair starts from the clean tree.
      applied = false
    }
  }
  const receipt = carryReceipt(mainRoot, runId, taskId)
  fs.mkdirSync(path.dirname(receipt), { recursive: true })
  fs.writeFileSync(receipt, `${JSON.stringify({ applied })}\n`)
}

// True when the armed patch was applied, false when prepare ran and refused it, null when this
// attempt never reached its worktree. The file is read once.
function consumeCarryResult(cwd, runId, taskId) {
  const { mainRoot } = repoPaths(cwd)
  const file = carryReceipt(mainRoot, runId, taskId)
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).applied === true
  } catch {
    return null
  } finally {
    fs.rmSync(file, { force: true })
  }
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
  // A delegate run's integration worktree is the Lead's own checkout, where the Lead keeps working while the call runs
  // (`watched: false`): its status is no sign of the harness, and the branch may still only move forward.
  if (graph.integration.watched !== false && now.status !== before.integration.status) {
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
  CARRY_UNAPPLICABLE,
  patchHasDiff,
  assessCarry,
  armCarry,
  consumeCarryResult,
}
