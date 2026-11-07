'use strict'

// Reads, validates and pastes task skills into briefs under spec 030 (R27, R29, R45).
// Family: skill.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { git } = require('./git.js')

const MAX_SKILLS = 3
const MAX_SKILL_LINES = 500
const MAX_TOTAL_LINES = 1500
const MAX_NAME = 64
const MAX_DESCRIPTION = 1024

function countLines(text) {
  if (!text) return 0
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n$/, '')
  return normalized === '' ? 0 : normalized.split('\n').length
}

function parseSkillNames(text) {
  if (!text || typeof text !== 'string') return []
  const stripped = text.replace(/^(?:AETHER-SKILLS:|Skills:)\s*/i, '').trim()
  if (!stripped) return []
  const tokens = stripped.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
  const seen = new Set()
  const result = []
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token)
      result.push(token)
    }
  }
  return result
}

function getProjectRoots(cwd) {
  try {
    const res = git(['rev-parse', '--show-toplevel'], cwd, { allowFail: true })
    if (res.status === 0 && res.stdout) {
      const worktree = res.stdout
      const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd, { allowFail: true })
      const roots = [worktree]
      if (common.status === 0 && common.stdout) {
        const mainRoot = path.dirname(common.stdout)
        if (mainRoot && mainRoot !== worktree) {
          roots.push(mainRoot)
        }
      }
      return roots
    }
  } catch {}
  return [cwd ? path.resolve(cwd) : process.cwd()]
}

function resolveSkill(name, { cwd, home = os.homedir(), pluginRoot = path.resolve(__dirname, '..') } = {}) {
  if (!name || typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed) return null
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return null

  const isAether = trimmed.startsWith('aether:')
  const n = isAether ? trimmed.slice('aether:'.length).trim() : trimmed
  if (!n || n.includes('/') || n.includes('\\') || n.includes('..')) return null

  const candidates = []
  if (isAether) {
    candidates.push(path.join(pluginRoot, 'skills', n, 'SKILL.md'))
  } else {
    const roots = getProjectRoots(cwd)
    for (const root of roots) {
      candidates.push(path.join(root, '.agents', 'skills', n, 'SKILL.md'))
      candidates.push(path.join(root, '.claude', 'skills', n, 'SKILL.md'))
    }
    candidates.push(path.join(home, '.agents', 'skills', n, 'SKILL.md'))
    candidates.push(path.join(home, '.claude', 'skills', n, 'SKILL.md'))
    candidates.push(path.join(pluginRoot, 'skills', n, 'SKILL.md'))
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { name, file: candidate, dir: path.dirname(candidate) }
      }
    } catch {}
  }

  return null
}

function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return {}
  const entries = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon !== -1) {
      const key = line.slice(0, colon).trim()
      const val = line.slice(colon + 1).trim()
      entries[key] = val
    }
  }
  return entries
}

function checkSkillFile(dir) {
  const problems = []
  const file = path.join(dir, 'SKILL.md')
  if (!fs.existsSync(file)) {
    problems.push('SKILL.md does not exist')
    return problems
  }

  const text = fs.readFileSync(file, 'utf8')
  const lines = countLines(text)
  if (lines > MAX_SKILL_LINES) {
    problems.push(`SKILL.md has ${lines} lines (at most ${MAX_SKILL_LINES})`)
  }

  const front = parseFrontMatter(text)
  const name = front.name !== undefined ? front.name : ''
  const validNameRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/
  if (!name || name.length > MAX_NAME || !validNameRegex.test(name)) {
    problems.push(`the name "${name}" is not lowercase letters, digits and dashes of at most ${MAX_NAME} characters`)
  }

  const folder = path.basename(dir)
  if (name !== folder) {
    problems.push(`the name "${name}" is not the name of its folder "${folder}"`)
  }

  if (front.description === undefined || front.description.trim() === '') {
    problems.push('no description')
  } else if (front.description.length > MAX_DESCRIPTION) {
    problems.push(`the description has ${front.description.length} characters (at most ${MAX_DESCRIPTION})`)
  }

  return problems
}

function skillsSection(skills) {
  if (!skills || skills.length === 0) return ''
  let out = '## Skills for this task\n\n'
  for (const s of skills) {
    out += `### ${s.name}\n\n${s.text.trimEnd()}\n\n`
  }
  return out
}

function loadSkills(names, options) {
  if (!Array.isArray(names)) return { ok: true, skills: [] }
  if (names.length > MAX_SKILLS) {
    return { ok: false, error: `too many skills: ${names.length} (at most ${MAX_SKILLS})` }
  }

  const skills = []
  for (const name of names) {
    const resolved = resolveSkill(name, options)
    if (!resolved) {
      return { ok: false, error: `skill "${name}" does not exist` }
    }
    const problems = checkSkillFile(resolved.dir)
    if (problems.length > 0) {
      return { ok: false, error: `skill "${name}" is invalid: ${problems[0]}` }
    }
    const text = fs.readFileSync(resolved.file, 'utf8')
    const lines = countLines(text)
    skills.push({ name, file: resolved.file, text, lines })
  }

  const section = skillsSection(skills)
  const totalLines = countLines(section)
  if (totalLines > MAX_TOTAL_LINES) {
    return { ok: false, error: `the skills total ${totalLines} lines (at most ${MAX_TOTAL_LINES})` }
  }

  return { ok: true, skills }
}

function usesFile(dataDir) {
  return path.join(dataDir, 'skills', 'uses.jsonl')
}

function recordUse(dataDir, { session, kind, run = null, task, skills, time = Date.now() } = {}) {
  try {
    const file = usesFile(dataDir)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const entry = { time, session, kind, run, task, skills }
    fs.appendFileSync(file, JSON.stringify(entry) + '\n')
    return true
  } catch {
    return true
  }
}

module.exports = {
  MAX_SKILLS,
  MAX_SKILL_LINES,
  MAX_TOTAL_LINES,
  MAX_NAME,
  MAX_DESCRIPTION,
  parseSkillNames,
  resolveSkill,
  checkSkillFile,
  loadSkills,
  skillsSection,
  usesFile,
  recordUse,
}
