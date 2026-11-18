'use strict'

// Reads, validates and pastes task skills into briefs under spec 030 (R27, R29, R45).
// Family: skill.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { git } = require('./git.js')
const { loadSkillsConfig, recordUse, usesFile } = require('./skill-registry.js')

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

function foldQuotedLines(text, quote) {
  // Protect double-quoted escapes before folding physical line breaks.
  const breaks = quote === '"'
    ? /\\(?:[^\n]|\n[ \t]*(?:\n[ \t]*)*)|[ \t]*\n[ \t]*(?:\n[ \t]*)*/g
    : /[ \t]*\n[ \t]*(?:\n[ \t]*)*/g
  return text.replace(breaks, (part) => {
    if (part[0] === '\\' && part[1] !== '\n') return part
    const count = part.split('\n').length - 1
    if (count > 1) return '\n'.repeat(count - 1)
    return part[0] === '\\' ? '' : ' '
  })
}

function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return {}
  const entries = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const field = lines[i].match(/^([^\s:#][^:]*):(?:\s+|$)(.*)$/)
    if (!field) continue
    const key = field[1].trim()
    const value = field[2].trim()
    if (/^[|>](?:[+-][1-9]?|[1-9][+-]?)?(?:\s+#.*)?$/.test(value)) {
      const block = []
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1] === '')) {
        block.push(lines[++i])
      }
      const specifiedIndent = value.match(/[1-9]/)
      const indent = specifiedIndent ? Number(specifiedIndent[0]) : Math.min(...block.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length))
      const content = block.map((line) => line.slice(Number.isFinite(indent) ? indent : 0))
      entries[key] = value[0] === '|' ? content.join('\n') : content.reduce((out, line, index) => {
        if (index === 0) return line
        const prev = content[index - 1]
        if (prev && !line && !/^\s/.test(prev)) return out
        return out + (prev && line && !/^\s/.test(prev) && !/^\s/.test(line) ? ' ' : '\n') + line
      }, '')
    } else if (value.startsWith("'") || value.startsWith('"')) {
      const quote = value[0]
      const pattern = quote === "'"
        ? /^'((?:[^']|'')*)'(?:[ \t]+#.*)?[ \t]*$/
        : /^"((?:[^"\\]|\\[\s\S])*)"(?:[ \t]+#.*)?[ \t]*$/
      let scalar = field[2].trimStart()
      let end = i
      let quoted = scalar.match(pattern)
      while (!quoted && end + 1 < lines.length) {
        scalar += '\n' + lines[++end]
        quoted = scalar.match(pattern)
      }
      if (!quoted) {
        entries[key] = value
        continue
      }
      i = end
      const folded = foldQuotedLines(quoted[1], quote)
      if (quote === "'") {
        entries[key] = folded.replace(/''/g, "'")
      } else {
        const escapes = { '0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\u0085', _: '\u00a0', L: '\u2028', P: '\u2029' }
        entries[key] = folded.replace(/\\(?:([0abtnvfre "\/\\N_LP])|x([\da-fA-F]{2})|u([\da-fA-F]{4})|U([\da-fA-F]{8}))/g, (whole, simple, x, u, upper) => {
          if (simple) return escapes[simple]
          const code = parseInt(x || u || upper, 16)
          return code <= 0x10ffff ? String.fromCodePoint(code) : whole
        })
      }
    } else {
      const parts = [value.replace(/(?:^|\s+)#.*$/, '').trimEnd()]
      let end = i
      while (end + 1 < lines.length) {
        let peek = end + 1
        let blanks = 0
        while (peek < lines.length && lines[peek].trim() === '') {
          blanks += 1
          peek += 1
        }
        if (peek >= lines.length) break
        const nextLine = lines[peek]
        if (!/^[ \t]+\S/.test(nextLine)) break
        const stripped = nextLine.trim().replace(/(?:^|\s+)#.*$/, '').trimEnd()
        if (!stripped && blanks === 0) {
          end = peek
          continue
        }
        if (parts[parts.length - 1] === '' && blanks === 0) {
          parts[parts.length - 1] = stripped
        } else if (blanks > 0) {
          parts.push('\n'.repeat(blanks) + stripped)
        } else {
          parts.push(' ' + stripped)
        }
        end = peek
      }
      i = end
      entries[key] = parts.join('').trim()
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

function readSkillEntry(file, dirName) {
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const front = parseFrontMatter(text)
  const name = (front.name && String(front.name).trim()) || dirName
  const description = front.description !== undefined ? String(front.description).trim() : ''
  return { name, description }
}

function listProjectSkills(cwd) {
  const roots = getProjectRoots(cwd)
  const byName = new Map()
  for (const root of roots) {
    for (const folder of ['.agents', '.claude']) {
      const skillsDir = path.join(root, folder, 'skills')
      let entries = []
      try {
        entries = fs.readdirSync(skillsDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        const entryDir = path.join(skillsDir, entry.name)
        let stat
        try {
          stat = fs.statSync(entryDir)
        } catch {
          continue
        }
        if (!stat.isDirectory()) continue
        const file = path.join(entryDir, 'SKILL.md')
        if (!fs.existsSync(file)) continue
        const skill = readSkillEntry(file, entry.name)
        if (!skill || !skill.name || byName.has(skill.name)) continue
        byName.set(skill.name, skill)
      }
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function formatProjectSkills(skills) {
  if (!Array.isArray(skills) || skills.length === 0) return ''
  const lines = [
    '## Project skills',
    '',
    'Available project skills in this repository (use `- Skills: <name>` in tasks where one applies, at most 3 per task):',
  ]
  for (const skill of skills) {
    const desc = String(skill.description || '').replace(/\s+/g, ' ').trim()
    lines.push(`- \`${skill.name}\`: ${desc}`)
  }
  return lines.join('\n')
}

function foldToken(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function foldedWords(text) {
  return foldToken(text).split(/[^a-z0-9]+/).filter(Boolean)
}

// The stop words of config/skills.json (stopWords), folded like the brief's words. A missing key means none.
function briefStopWords() {
  return new Set(loadSkillsConfig().stopWords.map((word) => foldToken(word)))
}

// File extensions and dotted patterns of a skill, taken from its description
// before it is tokenized: a token starting with `.`, continuing with 1 to 5
// alphanumerics and admitting more `.` + 1 to 5 alphanumerics segments
// (`.px.js`, `.ipynb`, `.gd`, `.wgsl`), preceded by start of text, a space, a
// quote, a backtick or an opening parenthesis and followed by a space, a
// quote, a backtick, a comma, a semicolon, a closing parenthesis or the end
// of the text (so the final dot of `landing page.`, `e.g.` and `i.e.` gives
// no pattern).
function extractDotPatterns(description) {
  const folded = foldToken(description || '')
  const patterns = []
  const seen = new Set()
  const re = /(^|[\s'"`(\]])(\.[a-z0-9]{1,5}(?:\.[a-z0-9]{1,5})*)(?=[\s'"`,;)\]]|$)/g
  let found
  while ((found = re.exec(folded)) !== null) {
    if (!seen.has(found[2])) {
      seen.add(found[2])
      patterns.push(found[2])
    }
  }
  return patterns
}

// The domain signals of a skill under R20: (a) its exact folded name, of any
// length; (b) its dot patterns from the description; (c) the parts of at
// least 2 characters of a hyphenated name that are not stop words; (d) the
// distinct words of length >= 4 of its description (and of its name, once)
// that are not stop words.
function skillSignals(skill, stop = new Set()) {
  const name = foldToken(skill.name || '')
  const parts = name
    ? name.split('-').filter((part) => part.length >= 2 && !stop.has(part))
    : []
  const significant = new Set()
  for (const word of [...foldedWords(skill.name), ...foldedWords(skill.description)]) {
    if (word.length >= 4 && !stop.has(word)) significant.add(word)
  }
  return { name, parts, significant, patterns: extractDotPatterns(skill.description) }
}

// The matching strength of a skill under R20, or null when it does not match:
// (i) exact name as an independent token, (ii) a dot pattern matching an
// owns path suffix or a literal mention, (iii) a compound name with at least
// 2 remaining parts all present in the task, (iv) at least
// max(2, min(3, ceil(N x 0.25))) distinct domain words (never with N < 2).
function matchStrength(signals, words, foldedRaw, ownsFolded) {
  if (signals.name) {
    const escaped = signals.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (words.has(signals.name) || new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(foldedRaw)) {
      return { rank: 0, hits: 0 }
    }
  }
  for (const pattern of signals.patterns) {
    if (ownsFolded.some((file) => file.endsWith(pattern)) || foldedRaw.includes(pattern)) {
      return { rank: 1, hits: 0 }
    }
  }
  if (signals.parts.length >= 2 && signals.parts.every((part) => words.has(part))) {
    return { rank: 2, hits: 0 }
  }
  let hits = 0
  for (const word of signals.significant) {
    if (words.has(word)) hits += 1
  }
  if (signals.significant.size >= 2) {
    const needed = Math.max(2, Math.min(3, Math.ceil(signals.significant.size * 0.25)))
    if (hits >= needed) return { rank: 3, hits }
  }
  return null
}

function matchDelegateSkills(cwd, { prompt = '', description = '', owns = [] } = {}) {
  const owned = Array.isArray(owns) ? owns.join(' ') : ''
  const foldedRaw = foldToken(`${prompt}\n${description}\n${owned}`)
  const words = new Set(foldedWords(foldedRaw))
  const ownsFolded = (Array.isArray(owns) ? owns : []).map((entry) => foldToken(String(entry)))
  const stop = briefStopWords()
  const ranked = []
  for (const skill of listProjectSkills(cwd)) {
    const strength = matchStrength(skillSignals(skill, stop), words, foldedRaw, ownsFolded)
    if (strength) ranked.push({ name: skill.name, ...strength })
  }
  // Order by strength of signal (exact name, dot pattern, full compound
  // name, more matched domain words) and, on a tie, alphabetically by name.
  // The domain-words tier counts matched words only, never the proportion.
  ranked.sort((a, b) => a.rank - b.rank || b.hits - a.hits || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return ranked.map((entry) => entry.name)
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
  listProjectSkills,
  formatProjectSkills,
  matchDelegateSkills,
}
