'use strict'

// Classify project Claude paths with resolved symbolic links for spec 030 R20.
// Family: tree.

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { git, repoPaths } = require('./git.js')

function realResolve(file) {
  const absolute = path.isAbsolute(file) ? file : `${process.cwd()}${path.sep}${file}`
  let current = path.parse(absolute).root
  const pending = absolute.slice(current.length).split(path.sep)
  let links = 0
  while (pending.length) {
    const part = pending.shift()
    if (!part || part === '.') continue
    const next = path.join(current, part)
    let stat
    try { stat = fs.lstatSync(next) } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err
    }
    if (stat?.isSymbolicLink()) {
      // Inspect links even when their targets are missing; realpath cannot resolve them.
      if (++links > 40) {
        const err = new Error('Too many symbolic links while resolving path')
        err.code = 'ELOOP'
        throw err
      }
      const target = fs.readlinkSync(next)
      if (path.isAbsolute(target)) current = path.parse(target).root
      pending.unshift(...target.split(path.sep))
    } else current = next
  }
  return current
}

function inside(file, dir) {
  const relative = path.relative(dir, file)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function classifyClaudePath(file, { cwd, home = os.homedir() }) {
  const written = path.isAbsolute(file) ? file : `${cwd}${path.sep}${file}`
  const normalized = path.resolve(written)
  const real = realResolve(written)
  let roots
  try {
    const repo = repoPaths(cwd)
    roots = [repo.worktree, repo.mainRoot]
  } catch (err) {
    // Exit 128 also covers broken repositories. Only fall back when discovery
    // failed and no ancestor has a Git marker; stderr may be localized.
    const probe = git(['rev-parse', '--show-toplevel'], cwd, { allowFail: true })
    if (probe.status !== 128) throw err
    let ancestor = realResolve(cwd)
    for (;;) {
      try {
        fs.lstatSync(path.join(ancestor, '.git'))
        throw err
      } catch (markerError) {
        if (markerError.code !== 'ENOENT') throw markerError
      }
      const parent = path.dirname(ancestor)
      if (parent === ancestor) break
      ancestor = parent
    }
    roots = [path.resolve(cwd)]
  }
  const homeClaude = path.join(path.resolve(home), '.claude')
  const realHomeClaude = realResolve(homeClaude)
  const projectRoots = [...new Set(roots.map((root) => realResolve(root)))]
  const projects = projectRoots.map((root) => path.join(root, '.claude')).filter((dir) => {
    const resolved = realResolve(dir)
    return inside(resolved, path.dirname(dir)) && !inside(resolved, realHomeClaude) && !inside(dir, homeClaude)
  })
  for (const dir of projects) {
    const realDir = realResolve(dir)
    for (const candidate of [normalized, real]) {
      if (candidate === realResolve(path.join(dir, 'settings.json')) || candidate === realResolve(path.join(dir, 'settings.local.json')) || inside(candidate, realResolve(path.join(dir, 'hooks')))) return { kind: 'config', real }
      // Resolve the parent separately so a settings symlink keeps its name.
      const parent = realResolve(path.dirname(candidate))
      if (parent === realDir && ['settings.json', 'settings.local.json'].includes(path.basename(candidate))) return { kind: 'config', real }
    }
  }
  // Preserve traversal after entering a permitted folder, including a later re-entry.
  const parts = written.split(path.sep)
  let prefix = path.parse(written).root
  let entered = null
  let escaped = false
  let descendant = false
  for (const part of parts) {
    if (!part || part === '.') continue
    if (entered) descendant = true
    prefix = path.resolve(prefix, part)
    if (entered && !inside(prefix, entered.folder)) escaped = true
    if (!entered) {
      for (const dir of projects) {
        for (const kind of ['skills', 'rules']) {
          if (realResolve(path.dirname(prefix)) === realResolve(dir) && path.basename(prefix) === kind) entered = { folder: prefix, kind, dir }
        }
      }
    }
  }
  if (entered && descendant) {
    const realFolder = realResolve(entered.folder)
    if (escaped || !inside(realFolder, path.dirname(entered.dir)) || inside(realFolder, realHomeClaude) || real === realFolder || !inside(real, realFolder)) return { kind: 'escape', real }
    return { kind: entered.kind, real }
  }
  return { kind: 'other', real }
}

module.exports = { realResolve, classifyClaudePath }
