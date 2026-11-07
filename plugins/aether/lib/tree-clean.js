'use strict'

// Cleans expired temporary files and finished seats and delegates for spec 030 R17 and R18.
// Family: tree.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { git, repoPaths } = require('./git.js')
const run = require('./run.js')

const STAMP_INTERVAL_MS = 10 * 60 * 1000
const TMP_HOURS = 24
const WORK_DAYS = 7

function containsPath(parent, child) {
  const resolvedParent = path.resolve(parent)
  const resolvedChild = path.resolve(child)
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep)
}

function isSafeToDelete(target, mainRoot) {
  const resolvedTarget = path.resolve(target)
  const resolvedMain = path.resolve(mainRoot)
  const aether = path.join(resolvedMain, '.aether')
  const aetherTmp = path.join(resolvedMain, '.aether-tmp')

  const insideAether = containsPath(aether, resolvedTarget)
  const insideAetherTmp = containsPath(aetherTmp, resolvedTarget)
  if (!insideAether && !insideAetherTmp) return false

  const forbidden = [
    path.join(aether, 'runs'),
    path.join(aether, 'autonomy'),
    path.join(aether, 'worktrees'),
    path.join(aether, 'pending.jsonl'),
  ]
  for (const f of forbidden) {
    if (resolvedTarget === f || containsPath(f, resolvedTarget)) {
      return false
    }
  }
  return true
}

function assertSafeToDelete(target, mainRoot) {
  if (!isSafeToDelete(target, mainRoot)) {
    throw new Error(`Refusing to delete unsafe path: ${target}`)
  }
}

function stampFile(dataDir, mainRoot, kind) {
  const real = run.safeRealpath(mainRoot)
  const hash = crypto.createHash('sha1').update(real).digest('hex').slice(0, 16)
  return path.join(dataDir, 'sweep', `${hash}-${kind}.json`)
}

function stampDue(dataDir, mainRoot, kind, now) {
  const file = stampFile(dataDir, mainRoot, kind)
  let at = null
  try {
    const content = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (Number.isFinite(content?.at)) at = content.at
  } catch {
    // missing or unreadable
  }
  return at === null || now < at || (now - at) >= STAMP_INTERVAL_MS
}

function writeStamp(dataDir, mainRoot, kind, now) {
  try {
    run.writeJson(stampFile(dataDir, mainRoot, kind), { at: now })
  } catch {
    // Atomic write never throws.
  }
}

function getMaxMtime(dirPath) {
  let max = 0
  try {
    max = fs.statSync(dirPath).mtimeMs
  } catch {
    return 0
  }
  let entries = []
  try {
    entries = fs.readdirSync(dirPath)
  } catch {
    return max
  }
  for (const entry of entries) {
    const full = path.join(dirPath, entry)
    try {
      const st = fs.lstatSync(full)
      if (st.isDirectory()) {
        const sub = getMaxMtime(full)
        if (sub > max) max = sub
      } else {
        if (st.mtimeMs > max) max = st.mtimeMs
      }
    } catch {}
  }
  return max
}

function cleanTmpEntry(entryPath, limitMs, now, removed, mainRoot) {
  let stat
  try {
    stat = fs.lstatSync(entryPath)
  } catch {
    return
  }
  if (!stat.isDirectory()) {
    if ((now - stat.mtimeMs) > limitMs) {
      assertSafeToDelete(entryPath, mainRoot)
      try {
        fs.unlinkSync(entryPath)
        removed.push({ path: entryPath, why: 'expired' })
      } catch {}
    }
    return
  }

  const maxMtime = getMaxMtime(entryPath)
  if ((now - maxMtime) > limitMs) {
    assertSafeToDelete(entryPath, mainRoot)
    try {
      fs.rmSync(entryPath, { recursive: true, force: true })
      removed.push({ path: entryPath, why: 'expired' })
    } catch {}
    return
  }

  let children = []
  try {
    children = fs.readdirSync(entryPath)
  } catch {
    return
  }
  for (const child of children) {
    cleanTmpEntry(path.join(entryPath, child), limitMs, now, removed, mainRoot)
  }
  try {
    const remaining = fs.readdirSync(entryPath)
    if (remaining.length === 0 && (now - fs.statSync(entryPath).mtimeMs) > limitMs) {
      assertSafeToDelete(entryPath, mainRoot)
      fs.rmSync(entryPath, { recursive: true, force: true })
      removed.push({ path: entryPath, why: 'expired' })
    }
  } catch {}
}

function getFirstLevelMaxMtime(folder) {
  let max = 0
  try {
    max = fs.statSync(folder).mtimeMs
  } catch {
    return 0
  }
  let children = []
  try {
    children = fs.readdirSync(folder)
  } catch {
    return max
  }
  for (const child of children) {
    try {
      const st = fs.lstatSync(path.join(folder, child))
      if (st.mtimeMs > max) max = st.mtimeMs
    } catch {}
  }
  return max
}

function readRegisteredWorktrees(mainRoot) {
  try {
    const lines = git(['worktree', 'list', '--porcelain'], mainRoot).stdout.split('\n')
    const result = []
    for (const line of lines) {
      if (line.startsWith('worktree ')) result.push(line.slice('worktree '.length).trim())
    }
    return result
  } catch {
    return []
  }
}

function cleanProject(cwd, { now = Date.now(), dataDir = run.dataDir(), force = false } = {}) {
  const { mainRoot } = repoPaths(cwd)
  if (!force && !stampDue(dataDir, mainRoot, 'clean', now)) {
    return { ran: false, removed: [], kept: [] }
  }

  const removed = []
  const kept = []

  // 1. Clean tmp folders
  const tmpLimitMs = TMP_HOURS * 3600 * 1000
  const tmpFolders = [
    path.join(mainRoot, '.aether', 'tmp'),
    path.join(mainRoot, '.aether-tmp'),
  ]
  for (const root of tmpFolders) {
    if (!fs.existsSync(root)) continue
    let entries = []
    try {
      entries = fs.readdirSync(root)
    } catch {
      continue
    }
    for (const name of entries) {
      cleanTmpEntry(path.join(root, name), tmpLimitMs, now, removed, mainRoot)
    }
  }

  // 2. Clean seats and delegates folders
  const workLimitMs = WORK_DAYS * 24 * 3600 * 1000
  const workParents = [
    path.join(mainRoot, '.aether', 'work', 'seats'),
    path.join(mainRoot, '.aether', 'work', 'delegates'),
    path.join(mainRoot, '.aether', 'seats'),
    path.join(mainRoot, '.aether', 'delegates'),
  ]

  const registeredList = readRegisteredWorktrees(mainRoot)

  for (const parent of workParents) {
    if (!fs.existsSync(parent)) continue
    let folders = []
    try {
      folders = fs.readdirSync(parent)
    } catch {
      continue
    }
    for (const name of folders) {
      const folder = path.join(parent, name)
      try {
        if (!fs.lstatSync(folder).isDirectory()) continue
      } catch {
        continue
      }

      const newest = getFirstLevelMaxMtime(folder)
      if ((now - newest) <= workLimitMs) continue

      const matchedWorktrees = registeredList.filter((wt) => containsPath(folder, wt))
      let hasUnsaved = false
      for (const wt of matchedWorktrees) {
        if (!fs.existsSync(wt)) continue
        try {
          const status = git(['status', '--porcelain', '--untracked-files=all'], wt, { allowFail: true })
          if (status.status !== 0 || status.stdout.length > 0) {
            hasUnsaved = true
            break
          }
        } catch {
          hasUnsaved = true
          break
        }
      }

      if (hasUnsaved) {
        kept.push({ path: folder, why: 'unsaved changes' })
        continue
      }

      for (const wt of matchedWorktrees) {
        assertSafeToDelete(wt, mainRoot)
        git(['worktree', 'remove', '--force', wt], mainRoot, { allowFail: true })
        if (fs.existsSync(wt)) {
          fs.rmSync(wt, { recursive: true, force: true })
        }
      }

      assertSafeToDelete(folder, mainRoot)
      if (fs.existsSync(folder)) {
        fs.rmSync(folder, { recursive: true, force: true })
      }
      git(['worktree', 'prune'], mainRoot, { allowFail: true })
      removed.push({ path: folder, why: 'expired' })
    }
  }

  writeStamp(dataDir, mainRoot, 'clean', now)
  return { ran: true, removed, kept }
}

module.exports = {
  STAMP_INTERVAL_MS,
  TMP_HOURS,
  WORK_DAYS,
  stampFile,
  stampDue,
  writeStamp,
  cleanProject,
}
