'use strict'

// Uncovered practical topics by visible signals (spec 037 R12, R13, R16):
// file, dependency and intent signals minus installed skill coverage.
// Family: skill.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const { checkSkillFile } = require('./skill-brief.js')
const {
  loadSkillsConfig,
  readInstalls,
  readNotices,
  recordNotice,
  canonicalRepo,
} = require('./skill-registry.js')
const { mainRootOf } = require('./skill-loads.js')

function shallowNames(root) {
  const names = []
  function walk(dir, depth) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      if (entry.isFile()) names.push(entry.name)
      else if (entry.isDirectory() && depth === 0) walk(path.join(dir, entry.name), 1)
    }
  }
  walk(root, 0)
  return names
}

function fileSignal(names, signal) {
  const wanted = String(signal)
  if (wanted.startsWith('.') && !wanted.slice(1).includes('.')) {
    const suffix = wanted.toLowerCase()
    return names.some((name) => name.toLowerCase().endsWith(suffix))
  }
  return names.some((name) => name === wanted || name.toLowerCase() === wanted.toLowerCase())
}

function addRequirementNames(text, names) {
  for (const line of text.split(/\r?\n/)) {
    const code = line.replace(/#.*$/, '').trim()
    if (!code || code.startsWith('-')) continue
    const match = code.match(/^([a-z0-9][a-z0-9._-]*)/)
    if (match) names.add(match[1])
  }
}

function addQuotedPackages(segment, names) {
  for (const quoted of segment.matchAll(/["']\s*([a-z0-9][a-z0-9._-]*)/g)) {
    names.add(quoted[1])
  }
}

function isPyprojectArraySection(section, key) {
  if (section === 'project' && key === 'dependencies') return true
  if (section === 'project.optional-dependencies' || section === 'dependency-groups') return true
  if (section === 'tool.pdm.dev-dependencies') return true
  if (section === 'tool.uv' && key === 'dev-dependencies') return true
  return section.endsWith('.dependencies') && key === 'dependencies'
}

function addPyprojectNames(text, names) {
  let section = ''
  let inDepArray = false
  for (const line of text.split(/\r?\n/)) {
    const code = line.replace(/#.*$/, '')
    if (inDepArray) {
      const end = code.indexOf(']')
      addQuotedPackages(end >= 0 ? code.slice(0, end) : code, names)
      if (end >= 0) inDepArray = false
      continue
    }
    const header = code.match(/^\s*\[([^\]]+)\]/)
    if (header) {
      section = header[1].trim()
      continue
    }
    if (/^tool\.poetry\.(?:dev-)?dependencies$/.test(section) || /^tool\.poetry\.group\.[^.]+\.dependencies$/.test(section)) {
      const pkg = code.match(/^\s*([a-z0-9][a-z0-9._-]*)\s*=/)
      if (pkg) names.add(pkg[1])
      continue
    }
    const arr = code.match(/^\s*([a-z0-9._-]+)\s*=\s*\[(.*)$/)
    if (arr && isPyprojectArraySection(section, arr[1])) {
      const rest = arr[2]
      const end = rest.indexOf(']')
      addQuotedPackages(end >= 0 ? rest.slice(0, end) : rest, names)
      if (end < 0) inDepArray = true
    }
  }
}

// The dependency names of the project, each one whole: a longer name, or a description that merely contains it, is not that dependency.
function dependencyNames(root) {
  const names = new Set()
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    for (const name of Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) })) names.add(name.toLowerCase())
  } catch {}
  try {
    addRequirementNames(fs.readFileSync(path.join(root, 'requirements.txt'), 'utf8').toLowerCase(), names)
  } catch {}
  try {
    addPyprojectNames(fs.readFileSync(path.join(root, 'pyproject.toml'), 'utf8').toLowerCase(), names)
  } catch {}
  return names
}

// Whole-word match: the word, or its plural, never a part of a longer word ("colab" is not in "colaborar").
function wordIn(text, word) {
  const wanted = String(word).trim().toLowerCase()
  if (!wanted) return false
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?:e?s)?(?![\\p{L}\\p{N}])`, 'u').test(String(text).toLowerCase())
}

function readIntentText(cwd, intentPath) {
  const files = []
  if (intentPath) files.push(path.resolve(cwd || '.', intentPath))
  else {
    try {
      const feature = JSON.parse(fs.readFileSync(path.join(cwd || '.', '.specify', 'feature.json'), 'utf8'))
      if (typeof feature.feature_directory === 'string' && feature.feature_directory) {
        files.push(path.join(cwd || '.', feature.feature_directory, 'intent.md'))
      }
    } catch {}
  }
  return files.map((file) => {
    try {
      return fs.readFileSync(file, 'utf8')
    } catch {
      return ''
    }
  }).join('\n').toLowerCase()
}

function frontBlob(dir) {
  try {
    // Reuse the skill validator so missing or invalid metadata cannot provide coverage.
    const metadataProblems = checkSkillFile(dir).filter((problem) => !problem.startsWith('SKILL.md has '))
    if (metadataProblems.length) return ''
    const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
    const block = (text.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || ''
    const fields = []
    const lines = block.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const field = lines[i].match(/^(name|description):\s*(.*)$/)
      if (!field) continue
      let value = field[2].replace(/\s+#.*$/, '')
      // Include YAML block scalars and multiline quoted descriptions, never the body.
      while (i + 1 < lines.length && (/^\s/.test(lines[i + 1]) || lines[i + 1] === '')) {
        value += `\n${lines[++i].trim()}`
      }
      fields.push(value)
    }
    return fields.join('\n').toLowerCase()
  } catch {
    return ''
  }
}

function installedBlobs({ cwd, home, dataDir }) {
  const blobs = []
  const roots = new Set()
  const working = cwd || process.cwd()
  try {
    const paths = repoPaths(working)
    roots.add(paths.worktree)
    roots.add(paths.mainRoot)
  } catch {
    roots.add(path.resolve(working))
  }
  roots.add(home || os.homedir())
  for (const root of roots) {
    if (!root) continue
    for (const folder of [path.join(root, '.agents', 'skills'), path.join(root, '.claude', 'skills')]) {
      let entries
      try {
        entries = fs.readdirSync(folder, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
        blobs.push(frontBlob(path.join(folder, entry.name)))
      }
    }
  }
  if (dataDir) {
    for (const entry of readInstalls(dataDir)) {
      const blob = typeof entry.path === 'string' && entry.path ? frontBlob(entry.path) : ''
      if (blob) blobs.push(blob)
    }
  }
  return blobs
}

function topicCovered(blobs, topic) {
  const keys = [topic.id, ...(Array.isArray(topic.skillKeywords) ? topic.skillKeywords : [])]
    .filter((key) => typeof key === 'string' && key.trim())
  return keys.some((key) => blobs.some((blob) => wordIn(blob, key)))
}

function topicSignaled(topic, { names, deps, words }) {
  const files = Array.isArray(topic.files) ? topic.files : []
  const dependencies = Array.isArray(topic.dependencies) ? topic.dependencies : []
  const topicWords = Array.isArray(topic.words) ? topic.words : []
  if (files.some((signal) => fileSignal(names, signal))) return true
  if (dependencies.some((dep) => typeof dep === 'string' && dep && deps.has(dep.toLowerCase()))) return true
  if (words && topicWords.some((word) => typeof word === 'string' && wordIn(words, word))) return true
  return false
}

function detectUncoveredTopics({ cwd, home, dataDir, session = null, intentPath = null, config = null } = {}) {
  const loaded = config || loadSkillsConfig()
  const topics = Array.isArray(loaded.topics) ? loaded.topics : []
  let root = cwd || process.cwd()
  try { root = repoPaths(root).worktree } catch {}
  const names = shallowNames(root)
  const deps = dependencyNames(root)
  const words = readIntentText(root, intentPath)
  const blobs = installedBlobs({ cwd: root, home, dataDir })
  const repo = canonicalRepo({ repo: mainRootOf(root) })
  const already = new Set()
  if (dataDir) {
    for (const notice of readNotices(dataDir)) {
      if (notice.kind !== 'topic-search' || notice.session !== session) continue
      if (canonicalRepo(notice) !== repo) continue
      already.add(notice.name)
    }
  }
  return topics.filter((topic) => topic && typeof topic.id === 'string' && !already.has(topic.id) && topicSignaled(topic, { names, deps, words }) && !topicCovered(blobs, topic))
    .map((topic) => ({ id: topic.id, label: typeof topic.label === 'string' && topic.label ? topic.label : topic.id }))
}

function topicLine(topics) {
  if (!topics.length) return null
  const labels = topics.map((topic) => topic.label).join(', ')
  return `Aether: visible signals of ${labels}. Load aether:skills and search for a skill before the plan.`
}

function startupTopicNotice({ cwd, home, dataDir, session, config = null } = {}) {
  const topics = detectUncoveredTopics({ cwd, home, dataDir, session, config })
  if (!topics.length || !dataDir) return topics.length ? topicLine(topics) : null
  const repo = mainRootOf(cwd)
  for (const topic of topics) {
    recordNotice(dataDir, { session: session ?? null, repo, kind: 'topic-search', name: topic.id })
  }
  return topicLine(topics)
}

function intentPathOf(file, cwd) {
  if (typeof file !== 'string' || !file.trim()) return null
  const abs = path.resolve(cwd || '.', file)
  const roots = [cwd || '.']
  for (const probe of [cwd || '.', path.dirname(abs)]) {
    try { roots.unshift(repoPaths(probe).worktree) } catch {}
  }
  for (const root of roots) {
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (/^specs\/\d+-[^/]+\/intent\.md$/.test(rel)) return abs
  }
  return null
}

module.exports = {
  detectUncoveredTopics,
  topicLine,
  startupTopicNotice,
  shallowNames,
  fileSignal,
  dependencyNames,
  installedBlobs,
  topicCovered,
  intentPathOf,
}
