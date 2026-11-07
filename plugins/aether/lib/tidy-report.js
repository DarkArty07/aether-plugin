'use strict'

// Produces tidy reports of project files and skills under spec 030 R37.
// Family: tidy.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  detect,
  oldCliLeftovers,
  duplicateSkills,
  OLD_CLI_NAMES,
  OLD_CLI_PATTERNS
} = require('./tidy-detect.js')
const { LAYOUT_NAMES } = require('./tree-map.js')
const { checkProjectFiles } = require('./tree-check.js')
const { computedHash } = require('./skill-registry.js')

const LEGACY_FOLDERS = [
  { from: path.join('.aether', 'lanes'), to: path.join('.aether', 'worktrees', 'lanes') },
  { from: path.join('.aether', 'exams'), to: path.join('.aether', 'worktrees', 'exams') },
  { from: path.join('.aether', 'seats'), to: path.join('.aether', 'work', 'seats') },
  { from: path.join('.aether', 'delegates'), to: path.join('.aether', 'work', 'delegates') },
  { from: '.aether-tmp', to: path.join('.aether', 'tmp') },
  { from: '.aether-exam', to: path.join('.aether', 'exam') },
]

function projectsIn(folder) {
  try {
    const entries = fs.readdirSync(folder, { withFileTypes: true })
    const list = []
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(folder, entry.name)
      let isDir = entry.isDirectory()
      if (!isDir && entry.isSymbolicLink()) {
        try {
          isDir = fs.statSync(full).isDirectory()
        } catch {
          isDir = false
        }
      }
      if (isDir) {
        list.push(full)
      }
    }
    list.sort()
    return list
  } catch {
    return []
  }
}

function skillFingerprint(skillDir) {
  try {
    const list = []
    const queue = [skillDir]
    while (queue.length > 0) {
      const current = queue.shift()
      const dirents = fs.readdirSync(current, { withFileTypes: true })
      for (const d of dirents) {
        if (d.name === '.git' || d.name === 'node_modules' || d.isSymbolicLink()) continue
        const full = path.join(current, d.name)
        if (d.isDirectory()) {
          queue.push(full)
        } else if (d.isFile()) {
          list.push(full)
        }
      }
    }
    list.sort()
    const hash = crypto.createHash('sha256')
    for (const file of list) {
      const rel = path.relative(skillDir, file).split(path.sep).join('/')
      hash.update(rel)
      if (rel === 'SKILL.md') {
        const content = fs.readFileSync(file, 'utf8')
        hash.update(content.replace(/^(\s*name:\s*)[^\r\n]+/m, '$1*'))
      } else {
        hash.update(fs.readFileSync(file))
      }
    }
    return hash.digest('hex')
  } catch {
    return null
  }
}

function collectCrossDuplicates(roots) {
  const projectSkills = []
  for (const root of roots) {
    const seenReal = new Set()
    const dirs = [
      path.join(root, '.agents', 'skills'),
      path.join(root, '.claude', 'skills')
    ]
    for (const dir of dirs) {
      let entries
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const skillPath = path.join(dir, entry.name)
        let stat
        try {
          stat = fs.statSync(skillPath)
        } catch {
          continue
        }
        if (!stat.isDirectory()) continue
        let realPath
        try {
          realPath = fs.realpathSync(skillPath)
        } catch {
          continue
        }
        if (seenReal.has(realPath)) continue
        seenReal.add(realPath)
        let directHash = ''
        try {
          directHash = computedHash(skillPath)
        } catch {
          continue
        }
        const normHash = skillFingerprint(skillPath) || directHash
        projectSkills.push({
          project: root,
          name: entry.name,
          hash: directHash,
          normHash
        })
      }
    }
  }

  const byName = new Map()
  for (const s of projectSkills) {
    if (!byName.has(s.name)) byName.set(s.name, new Set())
    byName.get(s.name).add(s.project)
  }

  const crossDuplicates = []
  const seenNames = new Set()
  for (const [name, projSet] of byName) {
    if (projSet.size > 1) {
      crossDuplicates.push({
        name,
        projects: [...projSet].sort()
      })
      seenNames.add(name)
    }
  }

  const byHash = new Map()
  for (const s of projectSkills) {
    const key = s.normHash || s.hash
    if (!key) continue
    if (!byHash.has(key)) byHash.set(key, [])
    byHash.get(key).push(s)
  }
  for (const [, list] of byHash) {
    const projSet = new Set(list.map((s) => s.project))
    if (projSet.size < 2) continue
    const names = [...new Set(list.map((s) => s.name))].sort()
    const combinedName = names.join('=')
    if (names.length === 1 && seenNames.has(names[0])) continue
    if (seenNames.has(combinedName)) continue
    seenNames.add(combinedName)
    crossDuplicates.push({
      name: combinedName,
      projects: [...projSet].sort()
    })
  }

  crossDuplicates.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return crossDuplicates
}

function report(roots, { home = os.homedir() } = {}) {
  const projects = []
  const stray = []

  for (const root of roots) {
    const { findings } = detect(root, { home })
    const actions = []
    const seenActionKeys = new Set()
    const addAction = (action) => {
      const key = `${action.action}:${action.path}:${action.why || ''}`
      if (!seenActionKeys.has(key)) {
        seenActionKeys.add(key)
        actions.push(action)
      }
    }

    const treeFindings = checkProjectFiles(root)
    if (treeFindings.some((f) => f.code === 'claude-no-import')) {
      addAction({
        action: 'edit',
        path: 'CLAUDE.md',
        why: 'add the line @AGENTS.md'
      })
    }

    for (const f of treeFindings) {
      if (f.code === 'claude-too-long' || f.code === 'agents-too-long') {
        addAction({
          action: 'edit',
          path: f.file,
          why: 'split it: keep AGENTS.md a map'
        })
      }
    }

    const leftovers = oldCliLeftovers(root)
    for (const entry of leftovers) {
      addAction({
        action: 'delete',
        path: path.join('.aether', entry),
        why: 'leftover of the old aether CLI'
      })
    }

    for (const item of LEGACY_FOLDERS) {
      const src = path.join(root, item.from)
      let exists = false
      try {
        fs.lstatSync(src)
        exists = true
      } catch {}
      if (exists) {
        addAction({
          action: 'move',
          path: item.from,
          to: item.to,
          why: 'legacy folder'
        })
      }
    }

    const dups = duplicateSkills(root, { home })
    for (const dup of dups) {
      if (dup.paths && dup.paths.length > 1) {
        const firstRel = path.relative(root, dup.paths[0])
        for (const candPath of dup.paths.slice(1)) {
          const rel = path.relative(root, candPath)
          if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
            addAction({
              action: 'delete',
              path: rel,
              why: `duplicate of ${firstRel}; keep one`
            })
          }
        }
      }
    }

    const aetherDir = path.join(root, '.aether')
    try {
      const entries = fs.readdirSync(aetherDir)
      for (const entry of entries) {
        if (LAYOUT_NAMES.has(entry)) continue
        if (OLD_CLI_NAMES.includes(entry) || OLD_CLI_PATTERNS.some((pat) => pat.test(entry))) continue
        stray.push({
          project: root,
          path: path.join('.aether', entry)
        })
      }
    } catch {}

    projects.push({
      path: root,
      findings,
      actions
    })
  }

  const crossDuplicates = collectCrossDuplicates(roots)

  return {
    projects,
    stray,
    crossDuplicates
  }
}

function tidyCommand(args, { cwd = process.cwd(), home = os.homedir() } = {}) {
  const roots = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--projects') {
      const folder = args[++i]
      if (!folder || folder.startsWith('--')) {
        const err = new Error('--projects needs a folder path.')
        err.exitCode = 2
        throw err
      }
      let stat
      try {
        stat = fs.statSync(folder)
      } catch {
        const err = new Error(`folder does not exist: ${folder}`)
        err.exitCode = 2
        throw err
      }
      if (!stat.isDirectory()) {
        const err = new Error(`not a directory: ${folder}`)
        err.exitCode = 2
        throw err
      }
      roots.push(...projectsIn(folder))
    } else if (arg.startsWith('--')) {
      const err = new Error(`unexpected argument ${JSON.stringify(arg)}.`)
      err.exitCode = 2
      throw err
    } else {
      let stat
      try {
        stat = fs.statSync(arg)
      } catch {
        const err = new Error(`path does not exist: ${arg}`)
        err.exitCode = 2
        throw err
      }
      if (!stat.isDirectory()) {
        const err = new Error(`not a directory: ${arg}`)
        err.exitCode = 2
        throw err
      }
      roots.push(arg)
    }
  }

  if (roots.length === 0) {
    roots.push(cwd)
  }

  return report(roots, { home })
}

module.exports = {
  report,
  projectsIn,
  tidyCommand
}
