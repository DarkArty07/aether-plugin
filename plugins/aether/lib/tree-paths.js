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
  for (const part of absolute.slice(current.length).split(path.sep)) {
    if (!part || part === '.') continue
    current = path.join(current, part)
    try { current = fs.realpathSync(current) } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err
    }
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
  } catch { roots = [path.resolve(cwd)] }
  const homeClaude = path.join(path.resolve(home), '.claude')
  const projects = [...new Set(roots.map((root) => path.resolve(root)))].map((root) => path.join(root, '.claude')).filter((dir) => dir !== homeClaude)
  for (const dir of projects) {
    const realDir = realResolve(dir)
    for (const candidate of [normalized, real]) {
      const base = candidate === real ? realDir : dir
      if (candidate === path.join(base, 'settings.json') || candidate === path.join(base, 'settings.local.json') || inside(candidate, path.join(base, 'hooks'))) return { kind: 'config', real }
    }
  }
  for (const dir of projects) {
    for (const kind of ['skills', 'rules']) {
      const folder = path.join(dir, kind)
      // Keep the unnormalized spelling to detect attempts to leave the folder with .. .
      if (inside(normalized, folder) || written === folder || written.startsWith(`${folder}${path.sep}`)) {
        return { kind: inside(real, realResolve(folder)) ? kind : 'escape', real }
      }
    }
  }
  return { kind: 'other', real }
}

module.exports = { realResolve, classifyClaudePath }
