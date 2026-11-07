'use strict'

// Skill registry and lock verification for project and global skills under spec 030 R26.
// Family: skill.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { repoPaths } = require('./git.js')

let skillRules = null
try {
  skillRules = require('./skill-rules.js')
} catch {}

function collectFiles(dir) {
  const results = []
  function walk(current) {
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const rel = path.relative(dir, fullPath).split(path.sep).join('/')
        results.push({ rel, fullPath })
      }
    }
  }
  walk(dir)
  results.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  return results
}

function computedHash(dir) {
  const hash = crypto.createHash('sha256')
  const files = collectFiles(dir)
  for (const file of files) {
    hash.update(file.rel)
    hash.update(fs.readFileSync(file.fullPath))
  }
  return hash.digest('hex')
}

function installsFile(dataDir) {
  return path.join(dataDir, 'skills', 'installs.jsonl')
}

function recordInstall(dataDir, entry) {
  try {
    const file = installsFile(dataDir)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const record = {
      time: entry.time,
      session: entry.session,
      source: entry.source,
      scope: entry.scope,
      repo: entry.scope === 'global' ? null : (entry.repo || null),
      name: entry.name,
      path: entry.path,
      hash: entry.hash
    }
    fs.appendFileSync(file, JSON.stringify(record) + '\n')
    return true
  } catch {
    return true
  }
}

function readInstalls(dataDir) {
  try {
    const file = installsFile(dataDir)
    if (!fs.existsSync(file)) return []
    const content = fs.readFileSync(file, 'utf8')
    const entries = []
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        entries.push(JSON.parse(trimmed))
      } catch {}
    }
    return entries
  } catch {
    return []
  }
}

function splitSegments(cmd) {
  const segments = []
  let current = ''
  let quote = null
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (quote) {
      if (ch === quote && cmd[i - 1] !== '\\') {
        quote = null
      }
      current += ch
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      current += ch
    } else if (ch === '\n' || ch === ';') {
      segments.push(current)
      current = ''
    } else if (ch === '&' && cmd[i + 1] === '&') {
      segments.push(current)
      current = ''
      i++
    } else if (ch === '|' && cmd[i + 1] === '|') {
      segments.push(current)
      current = ''
      i++
    } else if (ch === '|') {
      segments.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) segments.push(current)
  return segments
}

function tokenizeWords(seg) {
  const words = []
  let word = ''
  let quote = null
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i]
    if (quote) {
      if (ch === quote && seg[i - 1] !== '\\') {
        quote = null
      } else {
        word += ch
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (/\s/.test(ch)) {
      if (word.length > 0) {
        words.push(word)
        word = ''
      }
    } else {
      word += ch
    }
  }
  if (word.length > 0) words.push(word)
  return words
}

function fallbackParseInstall(command) {
  if (typeof command !== 'string' || !command.trim()) return null
  const segments = splitSegments(command)
  for (const seg of segments) {
    const tokens = tokenizeWords(seg)
    if (tokens.length === 0) continue
    let launcher = null
    let idx = 0
    if (tokens[0] === 'npx') {
      launcher = 'npx'
      idx = 1
      if (tokens[idx] === '-y' || tokens[idx] === '--yes') idx++
      if (tokens[idx] && /^skills(?:@[^/\s]+)?$/.test(tokens[idx])) {
        idx++
      } else {
        continue
      }
    } else if (tokens[0] === 'bunx') {
      launcher = 'bunx'
      idx = 1
      if (tokens[idx] && /^skills(?:@[^/\s]+)?$/.test(tokens[idx])) {
        idx++
      } else {
        continue
      }
    } else if (tokens[0] === 'pnpm' && tokens[1] === 'dlx') {
      launcher = 'pnpm dlx'
      idx = 2
      if (tokens[idx] && /^skills(?:@[^/\s]+)?$/.test(tokens[idx])) {
        idx++
      } else {
        continue
      }
    } else if (/^skills(?:@[^/\s]+)?$/.test(tokens[0])) {
      launcher = 'skills'
      idx = 1
    } else {
      continue
    }

    if (tokens[idx] !== 'add') continue
    idx++

    const sources = []
    let global = false
    while (idx < tokens.length) {
      const tok = tokens[idx]
      if (tok === '-g' || tok === '--global') {
        global = true
        idx++
      } else if (['-s', '--skill', '-a', '--agent', '--ref'].includes(tok)) {
        idx += 2
      } else if (tok.startsWith('-')) {
        idx++
      } else {
        sources.push(tok)
        idx++
      }
    }

    return {
      launcher,
      sources,
      global
    }
  }
  return null
}

function resolveInstall(command) {
  if (skillRules && typeof skillRules.parseInstall === 'function') {
    return skillRules.parseInstall(command)
  }
  return fallbackParseInstall(command)
}

function extractNamedSkill(source) {
  if (!source || typeof source !== 'string') return null
  const at = source.lastIndexOf('@')
  if (at > 0) {
    const after = source.slice(at + 1)
    if (after && !after.includes('/') && !after.includes('\\')) {
      return after
    }
  }
  return null
}

function repoRootOf(cwd) {
  try {
    const { mainRoot } = repoPaths(cwd || '.')
    if (mainRoot) return mainRoot
  } catch {}
  return path.resolve(cwd || '.')
}

function posttool(input, ctx) {
  try {
    if (!input || input.tool_name !== 'Bash' || !input.tool_input || typeof input.tool_input.command !== 'string') {
      return null
    }

    const install = resolveInstall(input.tool_input.command)
    if (!install) {
      return null
    }

    const home = (ctx && ctx.home) || os.homedir()
    const dataDir = ctx && ctx.dataDir
    const now = (ctx && typeof ctx.now === 'number') ? ctx.now : Date.now()
    const session = input.session_id || null

    const isGlobal = Boolean(install.global)
    const scope = isGlobal ? 'global' : 'project'
    const repo = isGlobal ? null : repoRootOf(input.cwd)

    const lockFile = isGlobal
      ? path.join(home, '.agents', '.skill-lock.json')
      : path.join(repo, 'skills-lock.json')
    const skillsDir = isGlobal
      ? path.join(home, '.agents', 'skills')
      : path.join(repo, '.agents', 'skills')

    let lockJson = null
    try {
      if (fs.existsSync(lockFile)) {
        lockJson = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
      }
    } catch {
      lockJson = null
    }

    const lockSkills = (lockJson && typeof lockJson.skills === 'object' && lockJson.skills !== null)
      ? lockJson.skills
      : {}

    const problems = []

    for (const src of install.sources || []) {
      const named = extractNamedSkill(src)
      if (named && !Object.prototype.hasOwnProperty.call(lockSkills, named)) {
        problems.push(`The skill "${named}" is not in skills-lock.json after the install.`)
      }
    }

    const existingInstalls = dataDir ? readInstalls(dataDir) : []
    const recordedPaths = new Set(existingInstalls.map((e) => e.path))

    for (const [skillName, lockEntry] of Object.entries(lockSkills)) {
      const skillPath = path.join(skillsDir, skillName)
      let isDir = false
      try {
        isDir = fs.existsSync(skillPath) && fs.statSync(skillPath).isDirectory()
      } catch {
        isDir = false
      }
      if (!isDir) continue

      const hash = computedHash(skillPath)

      if (!isGlobal && lockEntry && typeof lockEntry === 'object' && typeof lockEntry.computedHash === 'string') {
        if (lockEntry.computedHash !== hash) {
          problems.push(
            `The fingerprint of the skill "${skillName}" differs from skills-lock.json (${lockEntry.computedHash} in the lock, ${hash} on disk): read it again before using it.`
          )
        }
      }

      if (dataDir && !recordedPaths.has(skillPath)) {
        const source = (lockEntry && typeof lockEntry === 'object' && lockEntry.source)
          ? lockEntry.source
          : ((install.sources && install.sources[0]) || '')
        recordInstall(dataDir, {
          time: now,
          session,
          source,
          scope,
          repo,
          name: skillName,
          path: skillPath,
          hash
        })
        recordedPaths.add(skillPath)
      }
    }

    return problems.length > 0 ? problems.join('\n') : null
  } catch {
    return null
  }
}

module.exports = {
  computedHash,
  installsFile,
  recordInstall,
  readInstalls,
  posttool
}
