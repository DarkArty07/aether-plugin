'use strict'

// Skill registry and lock verification for project and global skills under spec 030 R26.
// Family: skill.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { git, repoPaths } = require('./git.js')

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'skills.json')

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

function skillsDir(dataDir) {
  return path.join(dataDir, 'skills')
}

function createdFile(dataDir) {
  return path.join(skillsDir(dataDir), 'created.jsonl')
}

function usesFile(dataDir) {
  return path.join(skillsDir(dataDir), 'uses.jsonl')
}

function noticesFile(dataDir) {
  return path.join(skillsDir(dataDir), 'notices.jsonl')
}

function readJsonl(file) {
  try {
    if (!fs.existsSync(file)) return []
    const entries = []
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
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

function appendJsonl(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify(record) + '\n')
}

function loadSkillsConfig(customPath = process.env.AETHER_SKILLS_CONFIG || CONFIG_FILE) {
  const parsed = JSON.parse(fs.readFileSync(customPath, 'utf8'))
  const repeat = parsed && parsed.repeat
  if (!repeat || typeof repeat.minWordLength !== 'number' || typeof repeat.similarityThreshold !== 'number' || !Array.isArray(repeat.stopwords)) {
    throw new Error(`skills config ${customPath} is missing repeat`)
  }
  if (!Array.isArray(parsed.topics)) {
    throw new Error(`skills config ${customPath} is missing topics`)
  }
  return { repeat, topics: parsed.topics }
}

function recordCreated(dataDir, entry) {
  const record = {
    time: entry && entry.time,
    session: entry && entry.session != null ? entry.session : null,
    repo: entry && entry.repo != null ? entry.repo : null,
    name: entry && entry.name,
    path: entry && entry.path != null ? entry.path : null,
    type: entry && entry.type ? entry.type : 'project',
  }
  appendJsonl(createdFile(dataDir), record)
  return record
}

function readCreated(dataDir) {
  return readJsonl(createdFile(dataDir))
}

function recordUse(dataDir, { session = null, kind = null, run = null, task = null, skills = [], time = Date.now(), repo = null } = {}) {
  const record = { time, session, kind, run, task, skills, repo }
  appendJsonl(usesFile(dataDir), record)
  return true
}

function readUses(dataDir) {
  return readJsonl(usesFile(dataDir))
}

function recordNotice(dataDir, input) {
  if (!input || typeof input.kind !== 'string' || typeof input.name !== 'string') return null
  const record = {
    time: typeof input.time === 'number' ? input.time : Date.now(),
    session: input.session != null ? input.session : null,
    repo: input.repo != null ? input.repo : null,
    kind: input.kind,
    name: input.name,
  }
  try {
    appendJsonl(noticesFile(dataDir), record)
    return record
  } catch {
    return null
  }
}

function readNotices(dataDir) {
  return readJsonl(noticesFile(dataDir)).map((entry) => ({
    time: entry.time,
    session: entry.session != null ? entry.session : null,
    repo: entry.repo != null ? entry.repo : null,
    kind: entry.kind,
    name: entry.name,
  }))
}

function slash(value) {
  return String(value).split('\\').join('/')
}

function skillRelPath(entryOrPath) {
  const raw = typeof entryOrPath === 'string'
    ? entryOrPath
    : (entryOrPath && (entryOrPath.path || entryOrPath.dir))
  if (!raw || typeof raw !== 'string') return null
  const match = slash(raw).match(/(?:^|\/)(\.(?:agents|claude)\/skills\/[^/]+)\/?$/)
  if (!match) return null
  return match[1].split('/').join(path.sep)
}

function canonicalRepo(entry) {
  const raw = typeof entry === 'string' ? entry : (entry && (entry.repo || entry.path))
  if (!raw || typeof raw !== 'string') return null
  let candidate = slash(raw)
  candidate = candidate.replace(/\/\.aether\/(?:work|worktrees|lanes|exams|seats|delegates)(?:\/.*)?$/, '')
  candidate = candidate.replace(/\/\.(?:worktrees|claude\/worktrees)(?:\/.*)?$/, '')
  candidate = candidate.replace(/\/\.(?:agents|claude)\/skills(?:\/.*)?$/, '')
  if (!candidate) return null
  if (fs.existsSync(candidate)) {
    try {
      const mainRoot = repoPaths(candidate).mainRoot
      if (mainRoot) return mainRoot
    } catch {}
  }
  return candidate
}

function gitCommitTimes(repo, relPath) {
  const rel = slash(relPath)
  const result = git(['log', '--reverse', '--format=%ct', '--', rel], repo, { allowFail: true })
  if (!result || result.status !== 0 || !result.stdout) return []
  return result.stdout.split('\n').map((line) => Number.parseInt(line, 10)).filter((n) => Number.isFinite(n))
}

function alreadyInGitBefore(repo, relPath, beforeMs = null) {
  try {
    if (!repo || !relPath || typeof repo !== 'string' || typeof relPath !== 'string') return false
    if (!fs.existsSync(repo)) return false
    if (typeof beforeMs === 'number') {
      if (!fs.existsSync(path.join(repo, relPath))) return false
      const times = gitCommitTimes(repo, relPath)
      return times.length > 0 && (times[0] + 1) * 1000 <= beforeMs
    }
    const rels = new Set()
    const primary = slash(skillRelPath(relPath) || relPath)
    rels.add(primary)
    const name = path.posix.basename(primary)
    if (name && name !== '.' && name !== '..') {
      rels.add(`.agents/skills/${name}`)
      rels.add(`.claude/skills/${name}`)
    }
    for (const rel of rels) {
      if (gitCommitTimes(repo, rel).length > 0) return true
    }
    return false
  } catch {
    return false
  }
}

function shouldRecordCreated(dataDir, { repo, name, dir, type = 'project' } = {}) {
  const existing = readCreated(dataDir)
  if (type === 'owner') {
    return !existing.some((entry) => entry.type === 'owner' && entry.name === name)
  }
  const canon = canonicalRepo({ repo, path: dir })
  if (existing.some((entry) => entry.type !== 'owner' && entry.name === name && canonicalRepo(entry) === canon)) {
    return false
  }
  const primary = skillRelPath(dir) || path.join('.agents', 'skills', name)
  if (alreadyInGitBefore(repo, primary, null)) return false
  const claude = path.join('.claude', 'skills', name)
  if (slash(primary) !== slash(claude) && alreadyInGitBefore(repo, claude, null)) return false
  return true
}

function pathSatInWorktree(entry) {
  const raw = slash(`${entry && entry.path ? entry.path : ''}\n${entry && entry.repo ? entry.repo : ''}`)
  return /\/\.aether\/(?:work|worktrees|lanes|exams|seats|delegates)(?:\/|$)/.test(raw)
    || /\/\.(?:worktrees|claude\/worktrees)(?:\/|$)/.test(raw)
}

function dedupeCreated(entries) {
  const seen = new Set()
  const kept = []
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string') continue
    const owner = entry.type === 'owner'
    const repo = owner ? null : canonicalRepo(entry)
    const key = owner ? `owner\0${entry.name}` : `${repo}\0${entry.name}`
    if (seen.has(key)) continue
    seen.add(key)
    const rel = skillRelPath(entry)
    const next = { ...entry, repo: owner ? entry.repo ?? null : repo }
    if (!owner && repo && rel && pathSatInWorktree(entry)) {
      next.path = path.join(repo, rel)
    }
    if (!owner && alreadyInGitBefore(repo, rel, entry.time)) continue
    kept.push(next)
  }
  return kept
}

function readCreatedDeduplicated(dataDir) {
  return dedupeCreated(readCreated(dataDir))
}

function inWindow(entry, { since, until, session }) {
  if (session != null && entry.session !== session) return false
  if (since != null || until != null) {
    if (typeof entry.time !== 'number') return false
    if (since != null && entry.time < since) return false
    if (until != null && entry.time > until) return false
  }
  return true
}

function sameRepo(entry, wanted) {
  if (wanted == null) return true
  return canonicalRepo(entry) === canonicalRepo({ repo: wanted, path: wanted })
}

function countSkills(lines, into) {
  for (const line of lines) {
    if (!Array.isArray(line.skills)) continue
    for (const name of line.skills) {
      if (typeof name !== 'string' || !name) continue
      into[name] = (into[name] || 0) + 1
    }
  }
}

function blankProject() {
  return {
    created: [],
    downloaded: [],
    leadLoads: 0,
    agentUses: 0,
    delegateUses: 0,
    swarmUses: 0,
    notices: 0,
    noticesByKind: {},
  }
}

function projectOf(projects, repoKey) {
  const key = repoKey || ''
  if (!projects[key]) projects[key] = blankProject()
  return projects[key]
}

function skillsReport(dataDir, { repo = null, since = null, until = null, session = null } = {}) {
  const window = { since, until, session }
  const createdRawEntries = readCreated(dataDir).filter((entry) => inWindow(entry, window) && sameRepo(entry, repo))
  const created = dedupeCreated(createdRawEntries)
  const downloadedRaw = readInstalls(dataDir).filter((entry) => inWindow(entry, window) && sameRepo(entry, repo))
  const downloadedSeen = new Set()
  const downloaded = []
  for (const entry of downloadedRaw) {
    const key = `${canonicalRepo(entry)}\0${entry.name}`
    if (downloadedSeen.has(key)) continue
    downloadedSeen.add(key)
    downloaded.push(entry)
  }
  const uses = readUses(dataDir).filter((entry) => inWindow(entry, window) && sameRepo(entry, repo))
  const notices = readNotices(dataDir).filter((entry) => inWindow(entry, window) && sameRepo(entry, repo))
  const leadLines = uses.filter((entry) => entry.kind === 'lead')
  const delegateLines = uses.filter((entry) => entry.kind === 'delegate')
  const swarmLines = uses.filter((entry) => entry.kind === 'run')
  const leadLoadsBySkill = {}
  const agentUsesBySkill = {}
  countSkills(leadLines, leadLoadsBySkill)
  countSkills(delegateLines, agentUsesBySkill)
  countSkills(swarmLines, agentUsesBySkill)
  const noticesByKind = {}
  for (const notice of notices) {
    if (typeof notice.kind !== 'string') continue
    noticesByKind[notice.kind] = (noticesByKind[notice.kind] || 0) + 1
  }
  const projects = {}
  for (const entry of created) projectOf(projects, entry.repo).created.push(entry)
  for (const entry of downloaded) projectOf(projects, canonicalRepo(entry)).downloaded.push(entry)
  for (const entry of leadLines) projectOf(projects, canonicalRepo(entry)).leadLoads += 1
  for (const entry of delegateLines) {
    const bucket = projectOf(projects, canonicalRepo(entry))
    bucket.delegateUses += 1
    bucket.agentUses += 1
  }
  for (const entry of swarmLines) {
    const bucket = projectOf(projects, canonicalRepo(entry))
    bucket.swarmUses += 1
    bucket.agentUses += 1
  }
  for (const notice of notices) {
    const bucket = projectOf(projects, canonicalRepo(notice))
    bucket.notices += 1
    if (typeof notice.kind === 'string') {
      bucket.noticesByKind[notice.kind] = (bucket.noticesByKind[notice.kind] || 0) + 1
    }
  }
  return {
    mode: 'skills',
    period: { since, until },
    totals: {
      created: created.length,
      createdRaw: createdRawEntries.length,
      downloaded: downloaded.length,
      leadLoads: leadLines.length,
      agentUses: delegateLines.length + swarmLines.length,
      delegateUses: delegateLines.length,
      swarmUses: swarmLines.length,
      notices: notices.length,
      noticesByKind,
    },
    created,
    downloaded,
    leadLoadsBySkill,
    agentUsesBySkill,
    projects,
  }
}

module.exports = {
  computedHash,
  CONFIG_FILE,
  skillsDir,
  createdFile,
  installsFile,
  usesFile,
  noticesFile,
  loadSkillsConfig,
  recordCreated,
  readCreated,
  recordInstall,
  readInstalls,
  recordUse,
  readUses,
  recordNotice,
  readNotices,
  canonicalRepo,
  skillRelPath,
  alreadyInGitBefore,
  shouldRecordCreated,
  readCreatedDeduplicated,
  skillsReport,
  posttool
}
