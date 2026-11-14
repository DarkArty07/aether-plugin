'use strict'

// Reviews newly created or changed skills and records their creation under spec 030 (R32).
// Family: skill.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const { checkSkillFile } = require('./skill-brief.js')
const {
  computedHash,
  loadSkillsConfig,
  readInstalls,
  readNotices,
  readUses,
  recordCreated,
  recordNotice,
  recordUse,
  shouldRecordCreated,
  canonicalRepo,
} = require('./skill-registry.js')
const { classifySkillPath } = require('./skill-rules.js')

function createdFile(dataDir) {
  return path.join(dataDir, 'skills', 'created.jsonl')
}

function reviewSkill(dir, { cwd, home = os.homedir() } = {}) {
  const problems = [...checkSkillFile(dir)]

  let targetReal
  try {
    targetReal = fs.realpathSync(dir)
  } catch {
    targetReal = path.resolve(dir)
  }

  const targetDir = path.resolve(dir)
  const targetName = path.basename(targetDir)

  let targetHash = null
  let hashComputed = false
  function getTargetHash() {
    if (!hashComputed) {
      try {
        targetHash = computedHash(targetDir)
      } catch {
        targetHash = null
      }
      hashComputed = true
    }
    return targetHash
  }

  const workingDir = cwd || process.cwd()
  let projectRoots = []
  try {
    const paths = repoPaths(workingDir)
    projectRoots = [paths.worktree, paths.mainRoot]
  } catch {
    projectRoots = [workingDir]
  }

  let homeReal
  try {
    homeReal = fs.realpathSync(home)
  } catch {
    homeReal = path.resolve(home)
  }

  const searchFolders = []
  const seenFolders = new Set()
  function addFolder(f) {
    const resolved = path.resolve(f)
    if (!seenFolders.has(resolved)) {
      seenFolders.add(resolved)
      searchFolders.push(resolved)
    }
  }

  for (const root of projectRoots) {
    let rReal
    try {
      rReal = fs.realpathSync(root)
    } catch {
      rReal = path.resolve(root)
    }
    if (rReal === homeReal) continue
    addFolder(path.join(root, '.agents', 'skills'))
    addFolder(path.join(root, '.claude', 'skills'))
  }

  addFolder(path.join(home, '.agents', 'skills'))
  addFolder(path.join(home, '.claude', 'skills'))

  const seenCandidateReal = new Set()
  seenCandidateReal.add(targetReal)

  for (const folder of searchFolders) {
    if (!fs.existsSync(folder)) continue
    let entries
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true })
    } catch {
      continue
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const candPath = path.join(folder, entry.name)
      let candStat
      try {
        candStat = fs.statSync(candPath)
      } catch {
        continue
      }
      if (!candStat.isDirectory()) continue

      let candReal
      try {
        candReal = fs.realpathSync(candPath)
      } catch {
        candReal = path.resolve(candPath)
      }

      if (candReal === targetReal || seenCandidateReal.has(candReal)) continue
      seenCandidateReal.add(candReal)

      const candName = entry.name
      if (candName === targetName) {
        problems.push(`a skill with the same name exists at ${candPath}`)
      } else {
        const tHash = getTargetHash()
        if (tHash) {
          let cHash = null
          try {
            cHash = computedHash(candPath)
          } catch {
            cHash = null
          }
          if (cHash && cHash === tHash) {
            problems.push(`the same content as the skill "${candName}" at ${candPath}`)
          }
        }
      }
    }
  }

  return problems
}

function mainRootOf(cwd) {
  try {
    const root = repoPaths(cwd || '.').mainRoot
    if (root) return root
  } catch {}
  return cwd ? path.resolve(cwd) : null
}

function skillToken(input) {
  const raw = input?.tool_input?.skill || input?.tool_input?.name || input?.tool_input?.skill_name
  if (typeof raw !== 'string') return null
  const token = raw.trim().split(/\s+/)[0]
  return token || null
}

function recordLeadSkillLoad(input, ctx = {}) {
  if (!input || input.tool_name !== 'Skill' || input.agent_id) return null
  const skillName = skillToken(input)
  const dataDir = ctx.dataDir
  if (!skillName || !dataDir) return null
  recordUse(dataDir, {
    time: typeof ctx.now === 'number' ? ctx.now : Date.now(),
    session: input.session_id,
    repo: mainRootOf(input.cwd),
    kind: 'lead',
    run: null,
    task: null,
    skills: [skillName],
  })
  return null
}

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

function dependencyBlob(root) {
  let blob = ''
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    blob += ` ${Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) }).join(' ')}`
  } catch {}
  for (const file of ['requirements.txt', 'pyproject.toml']) {
    try {
      blob += `\n${fs.readFileSync(path.join(root, file), 'utf8')}`
    } catch {}
  }
  return blob.toLowerCase()
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
    .map((key) => key.toLowerCase())
  return keys.some((key) => blobs.some((blob) => blob.includes(key)))
}

function topicSignaled(topic, { names, deps, words }) {
  const files = Array.isArray(topic.files) ? topic.files : []
  const dependencies = Array.isArray(topic.dependencies) ? topic.dependencies : []
  const topicWords = Array.isArray(topic.words) ? topic.words : []
  if (files.some((signal) => fileSignal(names, signal))) return true
  if (dependencies.some((dep) => typeof dep === 'string' && dep && deps.includes(dep.toLowerCase()))) return true
  if (words && topicWords.some((word) => typeof word === 'string' && word && words.includes(word.toLowerCase()))) return true
  return false
}

function detectUncoveredTopics({ cwd, home, dataDir, session = null, intentPath = null, config = null } = {}) {
  const loaded = config || loadSkillsConfig()
  const topics = Array.isArray(loaded.topics) ? loaded.topics : []
  const root = cwd || process.cwd()
  const names = shallowNames(root)
  const deps = dependencyBlob(root)
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
  const rel = path.relative(cwd || '.', abs).split(path.sep).join('/')
  return /^specs\/\d+-[^/]+\/intent\.md$/.test(rel) ? abs : null
}

function outsideAgents(file, info, cwd) {
  const absolute = path.resolve(cwd || '.', file)
  const roots = new Set([path.resolve(cwd || '.'), mainRootOf(cwd)])
  try { roots.add(repoPaths(cwd || '.').worktree) } catch {}
  for (const root of roots) {
    if (!root) continue
    const relative = path.relative(root, absolute).split(path.sep).join('/')
    const match = relative.match(/^\.(agents|claude)\/skills\/([^/]+)(?:\/|$)/)
    if (!match) continue
    if (match[1] === 'agents') return false
    const accessed = path.join(root, '.claude', 'skills', match[2])
    const expected = path.join(root, '.agents', 'skills', match[2])
    try {
      return !fs.lstatSync(accessed).isSymbolicLink() || fs.realpathSync(accessed) !== fs.realpathSync(expected)
    } catch {
      return true
    }
  }
  return true
}

function leadLoadedSkills(dataDir, session) {
  return readUses(dataDir).some((entry) => entry.kind === 'lead' && entry.session === session && Array.isArray(entry.skills) && entry.skills.some((name) => name === 'aether:skills' || name === 'skills'))
}

function posttool(input, ctx = {}) {
  try {
    if (!input || typeof input !== 'object') return null
    if (input.tool_name === 'Skill') return recordLeadSkillLoad(input, ctx)
    if (!['Write', 'Edit', 'MultiEdit'].includes(input.tool_name)) return null

    const file = input.tool_input?.file_path
    if (typeof file !== 'string' || !file.trim()) return null

    const intent = intentPathOf(file, input.cwd)
    if (intent) {
      const topics = detectUncoveredTopics({
        cwd: input.cwd,
        home: ctx?.home,
        dataDir: ctx?.dataDir,
        session: input.session_id ?? null,
        intentPath: intent,
      })
      if (!topics.length) return null
      if (ctx?.dataDir) {
        const repo = mainRootOf(input.cwd)
        for (const topic of topics) {
          recordNotice(ctx.dataDir, { time: ctx.now, session: input.session_id || null, repo, kind: 'topic-search', name: topic.id })
        }
      }
      return topicLine(topics)
    }

    const info = classifySkillPath(file, { cwd: input.cwd, home: ctx?.home })
    if (!info || (info.type !== 'project' && info.type !== 'owner')) return null

    if (ctx?.dataDir) {
      const repo = info.type === 'project' ? mainRootOf(input.cwd || info.dir) : null
      if (shouldRecordCreated(ctx.dataDir, { repo, name: info.name, dir: info.dir, type: info.type })) {
        recordCreated(ctx.dataDir, {
          time: ctx.now ?? Date.now(),
          session: input.session_id || null,
          repo,
          name: info.name,
          path: info.dir,
          type: info.type,
        })
      }
    }

    const lines = []
    const problems = reviewSkill(info.dir, { cwd: input.cwd, home: ctx?.home })
    if (problems && problems.length) lines.push(...problems.map((problem) => `Skill "${info.name}": ${problem}`))

    if (info.type === 'project' && outsideAgents(file, info, input.cwd)) {
      lines.push(`Aether: the real copy of the project skill "${info.name}" belongs in .agents/skills/${info.name}/ with a symlink at .claude/skills/${info.name}.`)
      if (ctx?.dataDir) recordNotice(ctx.dataDir, { time: ctx.now, session: input.session_id || null, repo: mainRootOf(input.cwd || info.dir), kind: 'skill-location', name: info.name })
    }
    if (info.type === 'project' && ctx?.dataDir && !leadLoadedSkills(ctx.dataDir, input.session_id)) {
      lines.push('Aether: load aether:skills before creating or changing a project skill, so the structure, the place in .agents/skills/ and the link in .claude/skills/ are checked.')
      recordNotice(ctx.dataDir, { time: ctx.now, session: input.session_id || null, repo: mainRootOf(input.cwd || info.dir), kind: 'skill-unloaded', name: info.name })
    }

    return lines.length ? lines.join('\n') : null
  } catch {
    return null
  }
}

module.exports = {
  reviewSkill,
  createdFile,
  recordLeadSkillLoad,
  detectUncoveredTopics,
  startupTopicNotice,
  posttool,
}
