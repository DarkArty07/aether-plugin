'use strict'

// Migrates legacy .aether state and worktrees without losing uncommitted work for spec 030 R19.
// Family: tree.

const fs = require('node:fs')
const path = require('node:path')
const { git } = require('./git.js')
const { exists } = require('./common.js')
const { repoSessions, oldStyleMarks } = require('./session.js')

const ACTIVITY_MS = 2 * 3600 * 1000

// The old folders and where they go, in the order they are moved.
const MIGRATION_MAP = [
  { from: path.join('.aether', 'lanes'), to: path.join('.aether', 'worktrees', 'lanes') },
  { from: path.join('.aether', 'exams'), to: path.join('.aether', 'worktrees', 'exams') },
  { from: path.join('.aether', 'seats'), to: path.join('.aether', 'work', 'seats') },
  { from: path.join('.aether', 'delegates'), to: path.join('.aether', 'work', 'delegates') },
  { from: '.aether-tmp', to: path.join('.aether', 'tmp') },
  { from: '.aether-exam', to: path.join('.aether', 'exam') },
]

// The folders whose recent writes defer the move (spec 030 R19 c). The README of .aether never counts.
const WRITE_ROOTS = ['.aether', '.aether-tmp', '.aether-exam']
const README = path.join('.aether', 'README.md')

// The real path of an existing target, or its absolute path when it does not exist, so both sides of a comparison agree.
function realPath(target) {
  try {
    return fs.realpathSync(target)
  } catch {
    return path.resolve(target)
  }
}

// True when a file or folder under the write roots, at any depth, changed in the last ACTIVITY_MS. A folder that cannot be
// read counts as a write, so the move waits (fail closed).
function hasRecentWrites(mainRoot, now) {
  const readme = path.resolve(mainRoot, README)
  for (const root of WRITE_ROOTS) {
    const base = path.join(mainRoot, root)
    let entries
    try {
      entries = fs.readdirSync(base, { recursive: true })
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') continue
      return true
    }
    for (const rel of entries) {
      const full = path.resolve(base, rel)
      if (full === readme) continue
      let stat
      try {
        stat = fs.lstatSync(full)
      } catch (err) {
        if (err.code === 'ENOENT') continue
        return true
      }
      if (now - stat.mtimeMs < ACTIVITY_MS) return true
    }
  }
  return false
}

// The gate for the move, { move, reasons }: reasons lists each condition that holds, once and in this order (spec 030 R19).
// It writes nothing. Without dataDir the marks cannot be read, so a live session cannot be ruled out: the gate reports
// live-session and does not move.
function migrationGate(mainRoot, { dataDir, now = Date.now(), selfSession = null, selfProcess = null, procRoot = '/proc' } = {}) {
  const reasons = []
  if (dataDir) {
    const live = repoSessions(dataDir, mainRoot, { except: selfSession, exceptProcess: selfProcess, procRoot })
    if (live.some((s) => s.state === 'alive')) reasons.push('live-session')
    if (oldStyleMarks(dataDir, { now }).some((id) => id !== selfSession)) reasons.push('old-mark')
  } else {
    reasons.push('live-session')
  }
  if (hasRecentWrites(mainRoot, now)) reasons.push('recent-writes')
  return { move: reasons.length === 0, reasons }
}

// The registered worktrees of mainRoot as real paths, or null when git cannot list them. With null nothing can tell a
// registered copy from a plain folder, so migrate keeps every folder that may hold a copy (spec 030 R19).
function listWorktrees(mainRoot) {
  let res
  try {
    res = git(['worktree', 'list', '--porcelain'], mainRoot, { allowFail: true })
  } catch {
    return null
  }
  if (res.status !== 0) return null
  return new Set(
    res.stdout
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => realPath(path.resolve(mainRoot, line.slice('worktree '.length).trim())))
  )
}

// True when a .git entry or a symbolic link lies at any depth under dir. Such a folder may hold a copy of work, or point at
// one, so it is never renamed whole. A folder that cannot be read counts as one that may hold a copy.
function mayHoldCopy(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return true
  }
  return entries.some(
    (entry) => entry.name === '.git' || entry.isSymbolicLink() || (entry.isDirectory() && mayHoldCopy(path.join(dir, entry.name)))
  )
}

function keep(ctx, from, why) {
  ctx.kept.push({ from, why })
  return false
}

// Moves one old path to its new place, or keeps it and says why. Never throws: a system or git error keeps the path that
// could not move (spec 030 R19).
function migratePath(src, dst, ctx) {
  try {
    const stat = fs.lstatSync(src)
    if (stat.isSymbolicLink()) return keep(ctx, src, 'symbolic link, not moved')
    if (!stat.isDirectory()) return moveFile(src, dst, ctx)
    return moveDirectory(src, dst, ctx)
  } catch (err) {
    return keep(ctx, src, err.message)
  }
}

function moveFile(src, dst, ctx) {
  if (exists(dst)) return keep(ctx, src, 'destination already exists')
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.renameSync(src, dst)
  ctx.moved.push({ from: src, to: dst })
  return true
}

// A registered copy moves with git, so git keeps it registered with its unsaved changes (spec 030 R19).
function moveWorktree(src, dst, ctx) {
  if (exists(dst)) return keep(ctx, src, 'destination already exists')
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  let res
  try {
    res = git(['worktree', 'move', realPath(src), dst], ctx.mainRoot, { allowFail: true })
  } catch (err) {
    return keep(ctx, src, err.message)
  }
  if (res.status !== 0) return keep(ctx, src, res.stderr || res.stdout || 'git worktree move failed')
  ctx.moved.push({ from: src, to: dst })
  return true
}

function moveDirectory(src, dst, ctx) {
  const real = realPath(src)
  if (ctx.worktrees && ctx.worktrees.has(real)) return moveWorktree(src, dst, ctx)
  if (exists(path.join(src, '.git'))) {
    return keep(ctx, src, ctx.worktrees ? 'holds a .git entry but is not a registered worktree' : 'worktree list unavailable')
  }
  const registeredInside = ctx.worktrees ? [...ctx.worktrees].some((wt) => wt.startsWith(real + path.sep)) : false
  if (!exists(dst) && !registeredInside && !mayHoldCopy(src)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.renameSync(src, dst)
    ctx.moved.push({ from: src, to: dst })
    return true
  }
  return moveChildren(src, dst, ctx)
}

// Moves the entries of a folder one by one. The folder goes (by rmdir, when empty) only when every entry moved (spec 030 R19).
function moveChildren(src, dst, ctx) {
  let allMoved = true
  for (const entry of fs.readdirSync(src)) {
    if (!migratePath(path.join(src, entry), path.join(dst, entry), ctx)) allMoved = false
  }
  if (allMoved) removeIfEmpty(src)
  return allMoved
}

// Removes a folder only when it is empty, so nothing with content is ever deleted.
function removeIfEmpty(dir) {
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  } catch {
    // a folder that cannot be read or removed stays where it is
  }
}

// Moves the old folders of mainRoot when the gate allows it. Returns { moved, kept, deferred }; never throws, and never
// deletes a file or a folder with content (spec 030 R19).
function migrate(mainRoot, { gate } = {}) {
  if (!gate || !gate.move) {
    return { moved: [], kept: [], deferred: gate ? gate.reasons : [] }
  }
  const moved = []
  const kept = []
  const ctx = { mainRoot, worktrees: listWorktrees(mainRoot), moved, kept }
  for (const target of MIGRATION_MAP) {
    const src = path.join(mainRoot, target.from)
    const dst = path.join(mainRoot, target.to)
    try {
      if (exists(src)) migratePath(src, dst, ctx)
    } catch (err) {
      keep(ctx, src, err.message)
    }
  }
  return { moved, kept, deferred: [] }
}

module.exports = {
  ACTIVITY_MS,
  migrationGate,
  migrate,
}
