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

const SKILLS_PACKAGE = /^skills(?:@.+)?$/
const VALUE_OPTIONS = new Set(['-s', '--skill', '-a', '--agent', '--ref'])

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

// Splits a command into its segments at `&&`, `||`, `;`, `|` and newlines, but not inside quotes.
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

// The words of one segment, with quotes removed and the quoted text kept as one word.
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

// The install that one segment's words make, or null when the segment does not start with a skills launcher and `add`.
function installOf(tokens) {
  let launcher = null
  let afterLauncher = 0
  if (tokens[0] === 'pnpm' && tokens[1] === 'dlx' && SKILLS_PACKAGE.test(tokens[2] || '')) {
    launcher = 'pnpm dlx'
    afterLauncher = 3
  } else if (tokens[0] === 'bunx' && SKILLS_PACKAGE.test(tokens[1] || '')) {
    launcher = 'bunx'
    afterLauncher = 2
  } else if (tokens[0] === 'npx') {
    if (['-y', '--yes'].includes(tokens[1]) && SKILLS_PACKAGE.test(tokens[2] || '')) {
      launcher = 'npx'
      afterLauncher = 3
    } else if (SKILLS_PACKAGE.test(tokens[1] || '')) {
      launcher = 'npx'
      afterLauncher = 2
    }
  } else if (tokens[0] === 'skills') {
    launcher = 'skills'
    afterLauncher = 1
  }
  if (!launcher || tokens[afterLauncher] !== 'add') return null

  const args = tokens.slice(afterLauncher + 1)
  let global = false
  const sources = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-g' || arg === '--global') {
      global = true
    } else if (VALUE_OPTIONS.has(arg)) {
      i++
    } else if (!arg.startsWith('-')) {
      sources.push(arg)
    }
  }
  return { launcher, sources, authors: sources.map(authorOf), global }
}

// Every install of a command, one for each segment that installs. A command can install twice (`&&`, `;`, `|`),
// so each install is kept apart for installClass to check.
function installsOf(command) {
  if (typeof command !== 'string' || !command.trim()) return []
  return splitSegments(command)
    .map((seg) => installOf(tokenizeSegment(seg)))
    .filter(Boolean)
}

// The installs of a command merged into one: the first launcher, every source and author, and `global` when any install
// is global. A command that installs nothing gives null. A bare `add` adds no source here; installClass still holds it.
function parseInstall(command) {
  const installs = installsOf(command)
  if (installs.length === 0) return null
  return {
    launcher: installs[0].launcher,
    sources: installs.flatMap((install) => install.sources),
    authors: installs.flatMap((install) => install.authors),
    global: installs.some((install) => install.global),
  }
}

// `skill-install` when some install of the command is held (R25, R47): global, with no source, or with a source whose
// author is not trusted. Every install is checked on its own, so a trusted one cannot carry an untrusted one.
function installClass(command, { dataDir } = {}) {
  const installs = installsOf(command)
  if (installs.length === 0) return null
  const trusted = new Set(readTrusted(dataDir))
  const held = installs.some((install) =>
    install.global || install.sources.length === 0 || install.authors.some((author) => !author || !trusted.has(author)),
  )
  return held ? 'skill-install' : null
}

function isDescendant(target, parent) {
  const rel = path.relative(parent, target)
  return rel.length > 0 && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)
}

// The real path of the repository the session works in, or null when there is none or git cannot run there.
function getSessionRepo(cwd) {
  try {
    const probe = git(['rev-parse', '--show-toplevel'], cwd, { allowFail: true })
    return probe.status === 0 && probe.stdout ? realResolve(probe.stdout) : null
  } catch {
    return null
  }
}

// The real worktree and the real main checkout of the working folder; the folder itself when it is not a repository.
function getProjectRoots(cwd) {
  try {
    const paths = repoPaths(cwd)
    return [...new Set([realResolve(paths.worktree), realResolve(paths.mainRoot)])]
  } catch {
    return [realResolve(cwd)]
  }
}

// Whether a skills lock file lists the skill: its `skills` object holds the name as a key. A missing or unreadable lock lists nothing.
function isLocked(lockFile, name) {
  try {
    const data = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
    return Boolean(data && data.skills && Object.prototype.hasOwnProperty.call(data.skills, name))
  } catch {
    return false
  }
}

// The skill that `real` belongs to under `skillsFolder`: its name is the folder right after the skills folder.
function skillIn(skillsFolder, real) {
  if (!isDescendant(real, skillsFolder)) return null
  const name = path.relative(skillsFolder, real).split(path.sep)[0]
  return { name, dir: path.join(skillsFolder, name) }
}

// The plugin cache holds skills as `<cache>/<marketplace>/<plugin>/<version>/skills/<name>`: the skills folder is the first `skills` below the cache.
function cachedSkill(cacheDir, real) {
  if (!isDescendant(real, cacheDir)) return null
  const parts = path.relative(cacheDir, real).split(path.sep)
  const at = parts.indexOf('skills')
  if (at === -1) return null
  return skillIn(path.join(cacheDir, ...parts.slice(0, at + 1)), real)
}

// The first skill hit of the real path among the skills folders given, or null.
function firstHit(folders, real) {
  for (const folder of folders) {
    const hit = skillIn(realResolve(folder), real)
    if (hit) return hit
  }
  return null
}

function skillInfo(type, hit, real, editable, grant) {
  return { type, name: hit.name, dir: hit.dir, real, editable, grant }
}

// Classify the file of a skill by its real path (R22, R23, R24): aether, downloaded, project or owner, or null when the
// path is in no skills folder. A file under a link is classified by the folder the link reaches.
function classifySkillPath(file, { cwd, home = os.homedir(), pluginRoots = defaultRoots } = {}) {
  if (typeof file !== 'string' || !file.trim()) return null
  const workingDir = cwd || process.cwd()
  const written = path.isAbsolute(file) ? file : path.resolve(workingDir, file)
  const real = realResolve(written)

  const aetherFolders = (Array.isArray(pluginRoots) ? pluginRoots : defaultRoots).map((root) => path.join(root, 'skills'))
  const aetherHit = firstHit(aetherFolders, real) || cachedSkill(realResolve(path.join(home, '.claude', 'plugins', 'cache')), real)
  if (aetherHit) {
    const sessionRepo = getSessionRepo(workingDir)
    const editable = Boolean(sessionRepo && isDescendant(real, sessionRepo))
    return skillInfo('aether', aetherHit, real, editable, null)
  }

  // The home folder is the owner's, never a project, even when it is the working folder.
  const homeReal = realResolve(home)
  for (const root of getProjectRoots(workingDir)) {
    if (root === homeReal) continue
    const hit = firstHit([path.join(root, '.agents', 'skills'), path.join(root, '.claude', 'skills')], real)
    if (hit) {
      if (isLocked(path.join(root, 'skills-lock.json'), hit.name)) return skillInfo('downloaded', hit, real, false, null)
      return skillInfo('project', hit, real, true, null)
    }
  }

  const homeHit = firstHit([path.join(home, '.agents', 'skills'), path.join(home, '.claude', 'skills')], real)
  if (homeHit) {
    if (isLocked(path.join(home, '.agents', '.skill-lock.json'), homeHit.name)) return skillInfo('downloaded', homeHit, real, false, null)
    return skillInfo('owner', homeHit, real, true, 'skill-install')
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
