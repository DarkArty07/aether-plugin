'use strict'

// Classify project Claude paths with resolved symbolic links for spec 030 R20.
// Family: tree.

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { repoPaths } = require('./git.js')

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
    if (!/^git rev-parse --show-toplevel failed: fatal: not a git repository(?: |$)/.test(err.message)) throw err
    roots = [path.resolve(cwd)]
  }
  const homeClaude = path.join(path.resolve(home), '.claude')
  const realHomeClaude = realResolve(homeClaude)
  const projects = [...new Set(roots.map((root) => path.resolve(root)))].map((root) => path.join(root, '.claude')).filter((dir) => dir !== homeClaude && realResolve(dir) !== realHomeClaude)
  for (const dir of projects) {
    const realDir = realResolve(dir)
    for (const candidate of [normalized, real]) {
      const base = candidate === real ? realDir : dir
      if (candidate === path.join(base, 'settings.json') || candidate === path.join(base, 'settings.local.json') || inside(candidate, path.join(base, 'hooks'))) return { kind: 'config', real }
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
          const folder = path.join(dir, kind)
          if (prefix === folder) entered = { folder, kind, dir }
        }
      }
    }
  }
  if (entered && descendant) {
    const realFolder = realResolve(entered.folder)
    const expectedFolder = path.join(realResolve(entered.dir), entered.kind)
    if (escaped || realFolder !== expectedFolder || real === realFolder || !inside(real, realFolder)) return { kind: 'escape', real }
    return { kind: entered.kind, real }
  }
  return { kind: 'other', real }
}

module.exports = { realResolve, classifyClaudePath }
