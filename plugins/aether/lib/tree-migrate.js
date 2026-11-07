'use strict'

// Migrates legacy .aether state and worktrees without losing uncommitted work for spec 030 R19.
// Family: tree.

const fs = require('node:fs')
const path = require('node:path')
const { git } = require('./git.js')
const { exists } = require('./common.js')
const { repoSessions, oldStyleMarks } = require('./session.js')

const ACTIVITY_MS = 2 * 3600 * 1000

const MIGRATION_MAP = [
  { from: path.join('.aether', 'lanes'), to: path.join('.aether', 'worktrees', 'lanes') },
  { from: path.join('.aether', 'exams'), to: path.join('.aether', 'worktrees', 'exams') },
  { from: path.join('.aether', 'seats'), to: path.join('.aether', 'work', 'seats') },
  { from: path.join('.aether', 'delegates'), to: path.join('.aether', 'work', 'delegates') },
  { from: '.aether-tmp', to: path.join('.aether', 'tmp') },
  { from: '.aether-exam', to: path.join('.aether', 'exam') },
]

function hasRecentWrites(mainRoot, now) {
  const dirs = [
    path.join(mainRoot, '.aether'),
    path.join(mainRoot, '.aether-tmp'),
    path.join(mainRoot, '.aether-exam'),
  ]
  const aetherDir = path.resolve(mainRoot, '.aether')
  const readmePath = path.resolve(aetherDir, 'README.md')
  const newPlaces = [
    path.resolve(aetherDir, 'work'),
    path.resolve(aetherDir, 'worktrees'),
  ]

  for (const base of dirs) {
    if (!fs.existsSync(base)) continue
    let entries
    try {
      entries = fs.readdirSync(base, { recursive: true })
    } catch {
      continue
    }
    for (const rel of entries) {
      const full = path.resolve(base, rel)
      if (full === readmePath) continue
      if (newPlaces.some((np) => full === np || full.startsWith(np + path.sep))) continue
      try {
        const stat = fs.statSync(full)
        if (now - stat.mtimeMs < ACTIVITY_MS) {
          return true
        }
      } catch {
        // file unreadable or disappeared
      }
    }
  }
  return false
}

function migrationGate(mainRoot, { dataDir, now = Date.now(), selfSession = null, selfProcess = null, procRoot = '/proc' } = {}) {
  const reasons = []

  if (dataDir) {
    const live = repoSessions(dataDir, mainRoot, { except: selfSession, exceptProcess: selfProcess, procRoot })
    if (live.some((s) => s.state === 'alive')) {
      reasons.push('live-session')
    }

    const old = oldStyleMarks(dataDir, { now }).filter((id) => id !== selfSession)
    if (old.length > 0) {
      reasons.push('old-mark')
    }
  }

  if (hasRecentWrites(mainRoot, now)) {
    reasons.push('recent-writes')
  }

  return { move: reasons.length === 0, reasons }
}

function gitWorktrees(mainRoot) {
  try {
    const res = git(['worktree', 'list', '--porcelain'], mainRoot, { allowFail: true })
    if (res.status !== 0) return []
    return res.stdout
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => path.resolve(mainRoot, line.slice('worktree '.length).trim()))
  } catch {
    return []
  }
}

function migratePath(src, dst, ctx) {
  const { mainRoot, worktrees, moved, kept } = ctx
  const normSrc = path.resolve(src)
  const isWt = worktrees.has(normSrc)

  if (isWt) {
    if (exists(dst)) {
      kept.push({ from: src, why: 'destination already exists' })
      return false
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    const r = git(['worktree', 'move', src, dst], mainRoot, { allowFail: true })
    if (r.status === 0) {
      moved.push({ from: src, to: dst })
      return true
    }
    kept.push({ from: src, why: r.stderr || r.stdout || 'git worktree move failed' })
    return false
  }

  let stat
  try {
    stat = fs.lstatSync(src)
  } catch (err) {
    kept.push({ from: src, why: err.message })
    return false
  }

  if (!stat.isDirectory()) {
    if (exists(dst)) {
      kept.push({ from: src, why: 'destination already exists' })
      return false
    }
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.renameSync(src, dst)
      moved.push({ from: src, to: dst })
      return true
    } catch (err) {
      kept.push({ from: src, why: err.message })
      return false
    }
  }

  let hasWtChild = false
  for (const wt of worktrees) {
    if (wt.startsWith(normSrc + path.sep)) {
      hasWtChild = true
      break
    }
  }

  if (!exists(dst) && !hasWtChild) {
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.renameSync(src, dst)
      moved.push({ from: src, to: dst })
      return true
    } catch (err) {
      kept.push({ from: src, why: err.message })
      return false
    }
  }

  let entries
  try {
    entries = fs.readdirSync(src)
  } catch (err) {
    kept.push({ from: src, why: err.message })
    return false
  }

  let allMoved = true
  for (const entry of entries) {
    const childSrc = path.join(src, entry)
    const childDst = path.join(dst, entry)
    const ok = migratePath(childSrc, childDst, ctx)
    if (!ok) {
      allMoved = false
    }
  }

  if (allMoved) {
    try {
      if (fs.existsSync(src) && fs.readdirSync(src).length === 0) {
        fs.rmdirSync(src)
      }
    } catch {
      // not empty or gone
    }
    return true
  }

  return false
}

function migrate(mainRoot, { gate } = {}) {
  if (!gate || !gate.move) {
    return { moved: [], kept: [], deferred: gate ? gate.reasons : [] }
  }

  const worktrees = new Set(gitWorktrees(mainRoot))
  const moved = []
  const kept = []
  const ctx = { mainRoot, worktrees, moved, kept }

  for (const target of MIGRATION_MAP) {
    const src = path.join(mainRoot, target.from)
    const dst = path.join(mainRoot, target.to)
    if (!exists(src)) continue
    migratePath(src, dst, ctx)
  }

  return { moved, kept, deferred: [] }
}

module.exports = {
  ACTIVITY_MS,
  migrationGate,
  migrate,
}
