'use strict'

// Classify skills and skill installation sources for spec 030 R22 R23 R24 R25.
// Family: skill.

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { git, repoPaths } = require('./git.js')
const { realResolve } = require('./tree-paths.js')

const ALIASES = {
  'vercel-labs/vercel-skills': 'vercel-labs/agent-skills',
  'coinbase/agentwallet': 'coinbase/agentic-wallet-skills',
}

const defaultPluginRoot = path.resolve(__dirname, '..')
const defaultRoots = [defaultPluginRoot]
if (process.env.CLAUDE_PLUGIN_ROOT && !defaultRoots.includes(process.env.CLAUDE_PLUGIN_ROOT)) {
  defaultRoots.push(process.env.CLAUDE_PLUGIN_ROOT)
}

function trustedFile(dataDir) {
  return path.join(dataDir, 'skills', 'trusted.json')
}

function readTrusted(dataDir) {
  if (!dataDir) return []
  try {
    const file = trustedFile(dataDir)
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(raw)
    if (data && Array.isArray(data.authors)) {
      return data.authors.filter((a) => typeof a === 'string').map((a) => a.toLowerCase())
    }
  } catch {
    // Malformed JSON or unreadable
  }
  return []
}

function authorOf(source) {
  if (typeof source !== 'string' || !source.trim()) return null
  let s = source.trim()
  if (s.startsWith('./') || s.startsWith('../') || s.startsWith('/') || s.startsWith('~/') || s === '.' || s === '..') {
    return null
  }
  if (s.startsWith('git@')) return null

  if (s.includes('://')) {
    const m = s.match(/^https?:\/\/(?:www\.)?(github\.com|gitlab\.com)\/(.+)$/i)
    if (!m) return null
    s = m[2]
  } else if (/^(?:github|gitlab):/i.test(s)) {
    s = s.replace(/^(?:github|gitlab):/i, '')
  } else if (s.includes(':')) {
    return null
  }

  const parts = s.split('/')
  if (parts.length < 2) return null
  const owner = parts[0].trim()
  let repo = parts[1].trim()
  if (!owner || !repo) return null

  repo = repo.split(/[@#]/)[0].replace(/\.git$/i, '')
  const key = `${owner}/${repo}`.toLowerCase()
  if (ALIASES[key]) {
    const resolved = ALIASES[key]
    return resolved.split('/')[0].toLowerCase()
  }
  return owner.toLowerCase()
}

function splitSegments(cmd) {
  const segments = []
  let current = ''
  let quote = null
  let i = 0
  while (i < cmd.length) {
    const ch = cmd[i]
    if (quote) {
      if (ch === '\\' && quote !== "'") {
        current += ch + (cmd[i + 1] || '')
        i += 2
        continue
      }
      if (ch === quote) {
        quote = null
      }
      current += ch
      i++
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      current += ch
      i++
      continue
    }
    if (ch === '\\') {
      current += ch + (cmd[i + 1] || '')
      i += 2
      continue
    }
    if (ch === '\n' || ch === ';') {
      if (current.trim()) segments.push(current.trim())
      current = ''
      i++
      continue
    }
    if (ch === '&' && cmd[i + 1] === '&') {
      if (current.trim()) segments.push(current.trim())
      current = ''
      i += 2
      continue
    }
    if (ch === '|' && cmd[i + 1] === '|') {
      if (current.trim()) segments.push(current.trim())
      current = ''
      i += 2
      continue
    }
    if (ch === '|') {
      if (current.trim()) segments.push(current.trim())
      current = ''
      i++
      continue
    }
    current += ch
    i++
  }
  if (current.trim()) segments.push(current.trim())
  return segments
}

function tokenizeSegment(seg) {
  const tokens = []
  let current = ''
  let quote = null
  let i = 0
  while (i < seg.length) {
    const ch = seg[i]
    if (quote) {
      if (ch === '\\' && quote !== "'") {
        current += seg[i + 1] || ''
        i += 2
        continue
      }
      if (ch === quote) {
        quote = null
        i++
        continue
      }
      current += ch
      i++
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      i++
      continue
    }
    if (ch === '\\') {
      current += seg[i + 1] || ''
      i += 2
      continue
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      i++
      continue
    }
    current += ch
    i++
  }
  if (current) tokens.push(current)
  return tokens
}

function parseInstall(command) {
  if (typeof command !== 'string' || !command.trim()) return null
  const segments = splitSegments(command)
  for (const seg of segments) {
    const tokens = tokenizeSegment(seg)
    if (tokens.length === 0) continue
    let launcher = null
    let afterLauncherIdx = 0

    if (tokens[0] === 'pnpm' && tokens[1] === 'dlx' && /^skills(?:@.+)?$/.test(tokens[2] || '')) {
      launcher = 'pnpm dlx'
      afterLauncherIdx = 3
    } else if (tokens[0] === 'bunx' && /^skills(?:@.+)?$/.test(tokens[1] || '')) {
      launcher = 'bunx'
      afterLauncherIdx = 2
    } else if (tokens[0] === 'npx') {
      if (['-y', '--yes'].includes(tokens[1]) && /^skills(?:@.+)?$/.test(tokens[2] || '')) {
        launcher = 'npx'
        afterLauncherIdx = 3
      } else if (/^skills(?:@.+)?$/.test(tokens[1] || '')) {
        launcher = 'npx'
        afterLauncherIdx = 2
      }
    } else if (tokens[0] === 'skills') {
      launcher = 'skills'
      afterLauncherIdx = 1
    }

    if (!launcher) continue
    if (tokens[afterLauncherIdx] !== 'add') continue

    const args = tokens.slice(afterLauncherIdx + 1)
    let global = false
    const sources = []
    const valOptions = new Set(['-s', '--skill', '-a', '--agent', '--ref'])

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '-g' || arg === '--global') {
        global = true
      } else if (valOptions.has(arg)) {
        i++
      } else if (arg.startsWith('-')) {
        continue
      } else {
        sources.push(arg)
      }
    }

    const authors = sources.map(authorOf)
    return { launcher, sources, authors, global }
  }
  return null
}

function installClass(command, { dataDir } = {}) {
  const parsed = parseInstall(command)
  if (!parsed) return null
  if (parsed.global) return 'skill-install'
  if (parsed.sources.length === 0) return 'skill-install'
  const trusted = new Set(readTrusted(dataDir))
  for (const author of parsed.authors) {
    if (!author || !trusted.has(author)) {
      return 'skill-install'
    }
  }
  return null
}

function isDescendant(target, parent) {
  const rel = path.relative(parent, target)
  return rel.length > 0 && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)
}

function getSessionRepo(cwd) {
  if (!cwd) return null
  const probe = git(['rev-parse', '--show-toplevel'], cwd, { allowFail: true })
  if (probe.status === 0 && probe.stdout) {
    return realResolve(probe.stdout)
  }
  return null
}

function getProjectRoots(cwd) {
  if (!cwd) return []
  try {
    const paths = repoPaths(cwd)
    return [...new Set([realResolve(paths.worktree), realResolve(paths.mainRoot)])]
  } catch {
    return [realResolve(cwd)]
  }
}

function isProjectLocked(projectRoots, skillName) {
  for (const root of projectRoots) {
    const lockFile = path.join(root, 'skills-lock.json')
    try {
      if (fs.existsSync(lockFile)) {
        const raw = fs.readFileSync(lockFile, 'utf8')
        const data = JSON.parse(raw)
        if (data && data.skills && Object.prototype.hasOwnProperty.call(data.skills, skillName)) {
          return true
        }
      }
    } catch {
      // unreadable
    }
  }
  return false
}

function isHomeLocked(homeDir, skillName) {
  const homeLock = path.join(homeDir, '.agents', '.skill-lock.json')
  try {
    if (fs.existsSync(homeLock)) {
      const raw = fs.readFileSync(homeLock, 'utf8')
      const data = JSON.parse(raw)
      if (data && data.skills && Object.prototype.hasOwnProperty.call(data.skills, skillName)) {
        return true
      }
    }
  } catch {
    // unreadable
  }
  return false
}

function classifySkillPath(file, { cwd, home = os.homedir(), pluginRoots = defaultRoots } = {}) {
  if (typeof file !== 'string' || !file.trim()) return null
  const workingDir = cwd || process.cwd()
  const written = path.isAbsolute(file) ? file : path.resolve(workingDir, file)

  const parts = written.split(path.sep)
  const skillsIdx = parts.lastIndexOf('skills')
  if (skillsIdx === -1 || skillsIdx === parts.length - 1) {
    return null
  }
  const name = parts[skillsIdx + 1]
  if (!name) return null
  const dir = parts.slice(0, skillsIdx + 2).join(path.sep)
  const real = realResolve(written)

  const roots = Array.isArray(pluginRoots) ? pluginRoots : defaultRoots
  for (const pRoot of roots) {
    const pSkills = realResolve(path.join(pRoot, 'skills'))
    if (isDescendant(real, pSkills)) {
      const sessionRepo = getSessionRepo(workingDir)
      const editable = Boolean(sessionRepo && (real === sessionRepo || isDescendant(real, sessionRepo)))
      return { type: 'aether', name, dir, real, editable, grant: null }
    }
  }

  const cacheDir = realResolve(path.join(home, '.claude', 'plugins', 'cache'))
  if (isDescendant(real, cacheDir)) {
    const sessionRepo = getSessionRepo(workingDir)
    const editable = Boolean(sessionRepo && (real === sessionRepo || isDescendant(real, sessionRepo)))
    return { type: 'aether', name, dir, real, editable, grant: null }
  }

  const projectRoots = getProjectRoots(workingDir)
  for (const root of projectRoots) {
    const projAgents = realResolve(path.join(root, '.agents', 'skills'))
    const projClaude = realResolve(path.join(root, '.claude', 'skills'))
    if (isDescendant(real, projAgents) || isDescendant(real, projClaude)) {
      if (isProjectLocked(projectRoots, name)) {
        return { type: 'downloaded', name, dir, real, editable: false, grant: null }
      }
      return { type: 'project', name, dir, real, editable: true, grant: null }
    }
  }

  const homeAgents = realResolve(path.join(home, '.agents', 'skills'))
  const homeClaude = realResolve(path.join(home, '.claude', 'skills'))
  if (isDescendant(real, homeAgents) || isDescendant(real, homeClaude)) {
    if (isHomeLocked(home, name)) {
      return { type: 'downloaded', name, dir, real, editable: false, grant: null }
    }
    return { type: 'owner', name, dir, real, editable: true, grant: 'skill-install' }
  }

  return null
}

function copyAdvice(info) {
  if (!info) return null
  if (info.type === 'aether') {
    return `This is a skill of Aether, and Aether's skills are not edited: copy it with another name into .agents/skills/ and change the copy (for example: cp -r ${info.dir} .agents/skills/${info.name}-mine).`
  }
  if (info.type === 'downloaded') {
    return `This skill was downloaded from the internet, and downloaded skills are not edited: copy it with another name into .agents/skills/ and change the copy (for example: cp -r ${info.dir} .agents/skills/${info.name}-mine).`
  }
  return null
}

module.exports = {
  ALIASES,
  defaultPluginRoot,
  trustedFile,
  readTrusted,
  authorOf,
  parseInstall,
  installClass,
  classifySkillPath,
  copyAdvice,
}
