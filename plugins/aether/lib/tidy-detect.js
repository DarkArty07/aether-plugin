'use strict'

// Detects disorder in project files and skills under spec 030 R36.
// Family: tidy.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { checkProjectFiles } = require('./tree-check.js')
const { computedHash } = require('./skill-registry.js')

const OLD_CLI_NAMES = [
  'aether.db',
  'aether.db-wal',
  'aether.db-shm',
  'project.toml',
  'CONTEXT.md',
  'objective-contracts',
  'drafts',
  'locks'
]

const OLD_CLI_PATTERNS = [/\.draft\.md$/, /\.lock$/]

function oldCliLeftovers(root) {
  try {
    const aetherDir = path.join(root, '.aether')
    const entries = fs.readdirSync(aetherDir)
    const matches = []
    for (const name of entries) {
      if (OLD_CLI_NAMES.includes(name) || OLD_CLI_PATTERNS.some((pat) => pat.test(name))) {
        matches.push(name)
      }
    }
    matches.sort()
    return matches
  } catch {
    return []
  }
}

function normalizedSkillDigest(skillDir) {
  try {
    const list = []
    function walk(folder) {
      for (const dirent of fs.readdirSync(folder, { withFileTypes: true })) {
        if (dirent.isSymbolicLink() || dirent.name === '.git' || dirent.name === 'node_modules') continue
        const abs = path.join(folder, dirent.name)
        if (dirent.isDirectory()) walk(abs)
        else if (dirent.isFile()) list.push(abs)
      }
    }
    walk(skillDir)
    list.sort((a, b) => {
      const ra = path.relative(skillDir, a).split(path.sep).join('/')
      const rb = path.relative(skillDir, b).split(path.sep).join('/')
      return ra < rb ? -1 : ra > rb ? 1 : 0
    })
    const hasher = crypto.createHash('sha256')
    for (const item of list) {
      const rel = path.relative(skillDir, item).split(path.sep).join('/')
      hasher.update(rel)
      if (rel === 'SKILL.md') {
        const raw = fs.readFileSync(item, 'utf8')
        const normalized = raw.replace(/^(\s*name:\s*)[^\r\n]+/m, '$1*')
        hasher.update(normalized)
      } else {
        hasher.update(fs.readFileSync(item))
      }
    }
    return hasher.digest('hex')
  } catch {
    return null
  }
}

function collectCandidateSkills(root, home) {
  const projectDirs = [
    path.join(root, '.agents', 'skills'),
    path.join(root, '.claude', 'skills')
  ]
  const homeDirs = [
    path.join(home, '.agents', 'skills'),
    path.join(home, '.claude', 'skills')
  ]
  const seenRealPaths = new Set()
  const skills = []

  function scan(dir, isProject) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
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
      if (seenRealPaths.has(realPath)) continue
      seenRealPaths.add(realPath)
      let directHash = ''
      try {
        directHash = computedHash(skillPath)
      } catch {
        continue
      }
      const normHash = normalizedSkillDigest(skillPath) || directHash
      skills.push({
        name: entry.name,
        path: skillPath,
        realPath,
        isProject,
        hash: directHash,
        normHash
      })
    }
  }

  for (const dir of projectDirs) scan(dir, true)
  for (const dir of homeDirs) scan(dir, false)

  return skills
}

function duplicateSkills(root, { home = os.homedir() } = {}) {
  try {
    const skills = collectCandidateSkills(root, home)
    if (!skills.some((s) => s.isProject)) return []

    const duplicates = []

    const byName = new Map()
    for (const s of skills) {
      if (!byName.has(s.name)) byName.set(s.name, [])
      byName.get(s.name).push(s)
    }

    for (const [name, list] of byName) {
      if (list.length > 1 && list.some((s) => s.isProject)) {
        duplicates.push({
          name,
          paths: list.map((s) => s.path),
          by: 'name'
        })
      }
    }

    const byHash = new Map()
    for (const s of skills) {
      const key = s.normHash || s.hash
      if (!key) continue
      if (!byHash.has(key)) byHash.set(key, [])
      byHash.get(key).push(s)
    }

    for (const [, list] of byHash) {
      if (list.length < 2) continue
      if (!list.some((s) => s.isProject)) continue
      const names = [...new Set(list.map((s) => s.name))].sort()
      if (names.length < 2) continue
      duplicates.push({
        name: names.join('='),
        paths: list.map((s) => s.path),
        by: 'hash'
      })
    }

    duplicates.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    return duplicates
  } catch {
    return []
  }
}

function detect(root, { home = os.homedir() } = {}) {
  try {
    const findings = []

    const treeFindings = checkProjectFiles(root)
    const noImport = treeFindings.find((f) => f.code === 'claude-no-import')
    if (noImport) {
      findings.push({
        kind: 'claude-no-import',
        count: 1,
        items: ['CLAUDE.md']
      })
    }

    const tooLong = treeFindings.filter((f) => f.code === 'claude-too-long' || f.code === 'agents-too-long')
    if (tooLong.length > 0) {
      findings.push({
        kind: 'too-long',
        count: tooLong.length,
        items: tooLong.map((f) => `${f.file} (${f.lines} lines)`)
      })
    }

    const leftovers = oldCliLeftovers(root)
    if (leftovers.length > 0) {
      findings.push({
        kind: 'old-cli',
        count: leftovers.length,
        items: leftovers
      })
    }

    const dups = duplicateSkills(root, { home })
    if (dups.length > 0) {
      findings.push({
        kind: 'duplicate-skills',
        count: dups.length,
        items: dups.map((d) => `${d.name}: ${d.paths.join(' = ')}`)
      })
    }

    return { findings }
  } catch {
    return { findings: [] }
  }
}

function noticeLines(findings, { spanish = false } = {}) {
  try {
    if (!findings || findings.length === 0) return []
    const lines = []
    for (const f of findings) {
      if (f.kind === 'claude-no-import') {
        lines.push(spanish
          ? 'Orden: CLAUDE.md no importa a AGENTS.md.'
          : 'Tidy: CLAUDE.md does not import AGENTS.md.')
      } else if (f.kind === 'too-long') {
        lines.push(spanish
          ? `Orden: CLAUDE.md o AGENTS.md de más de 200 líneas: ${f.count}.`
          : `Tidy: CLAUDE.md or AGENTS.md over 200 lines: ${f.count}.`)
      } else if (f.kind === 'old-cli') {
        lines.push(spanish
          ? `Orden: restos del CLI viejo aether en .aether/: ${f.count}.`
          : `Tidy: leftovers of the old aether CLI in .aether/: ${f.count}.`)
      } else if (f.kind === 'duplicate-skills') {
        lines.push(spanish
          ? `Orden: skills duplicadas: ${f.count}.`
          : `Tidy: duplicate skills: ${f.count}.`)
      }
    }
    lines.push(spanish
      ? "Corre aether:tidy para ordenarlo: primero informa lo que movería o borraría, y nada cambia sin el sí del dueño."
      : "Run aether:tidy to order this: it first reports what it would move or delete, and nothing changes without the owner's yes.")
    return lines
  } catch {
    return []
  }
}

module.exports = {
  OLD_CLI_NAMES,
  OLD_CLI_PATTERNS,
  oldCliLeftovers,
  duplicateSkills,
  detect,
  noticeLines
}
