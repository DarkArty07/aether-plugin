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
  createdFile,
  recordCreated,
  recordNotice,
  shouldRecordCreated,
} = require('./skill-registry.js')
const { classifySkillPath } = require('./skill-rules.js')
const {
  recordLeadSkillLoad,
  leadLoadedSkills,
  alreadyNoticed,
  mainRootOf,
} = require('./skill-loads.js')
const {
  detectUncoveredTopics,
  topicLine,
  intentPathOf,
} = require('./skill-topics.js')

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

  function gitWorktreeDirFor(p) {
    let cur = path.resolve(p)
    while (cur) {
      if (fs.existsSync(path.join(cur, '.git'))) return cur
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }
    return null
  }

  const workingDir = cwd || process.cwd()
  let projectRoots = []
  let inRepo = false
  const targetRepoDir = gitWorktreeDirFor(targetDir)
  let targetPaths = null
  if (targetRepoDir) {
    try { targetPaths = repoPaths(targetRepoDir) } catch {}
  }
  let cwdPaths = null
  if (!targetPaths) {
    try { cwdPaths = repoPaths(workingDir) } catch {}
  }

  if (targetPaths) {
    projectRoots = [targetPaths.worktree, targetPaths.mainRoot]
    inRepo = true
  } else if (cwdPaths) {
    projectRoots = [cwdPaths.worktree, cwdPaths.mainRoot]
  } else {
    projectRoots = [workingDir]
  }

  let homeReal
  try {
    homeReal = fs.realpathSync(home)
  } catch {
    homeReal = path.resolve(home)
  }

  const projectRootsReal = []
  const seenProjectRootsReal = new Set()
  for (const root of projectRoots) {
    let rReal
    try {
      rReal = fs.realpathSync(root)
    } catch {
      rReal = path.resolve(root)
    }
    if (!seenProjectRootsReal.has(rReal)) {
      seenProjectRootsReal.add(rReal)
      projectRootsReal.push(rReal)
    }
  }
  projectRootsReal.sort((a, b) => b.length - a.length)

  function repoRelOf(pReal) {
    if (!inRepo) return null
    for (const rReal of projectRootsReal) {
      const rel = path.relative(rReal, pReal)
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        return rel.split(path.sep).join('/')
      }
    }
    return null
  }
  const targetRepoRel = repoRelOf(targetReal)

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
      if (targetRepoRel && repoRelOf(candReal) === targetRepoRel) continue
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

function posttool(input, ctx = {}) {
  try {
    if (!input || typeof input !== 'object' || input.agent_id) return null
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

    const repo = info.type === 'project' ? mainRootOf(input.cwd || info.dir) : null
    if (info.type === 'project' && outsideAgents(file, info, input.cwd) && !alreadyNoticed(ctx?.dataDir, { session: input.session_id, repo, kind: 'skill-location', name: info.name })) {
      lines.push(`Aether: the real copy of the project skill "${info.name}" belongs in .agents/skills/${info.name}/ with a symlink at .claude/skills/${info.name}.`)
      if (ctx?.dataDir) recordNotice(ctx.dataDir, { time: ctx.now, session: input.session_id || null, repo, kind: 'skill-location', name: info.name })
    }
    if (info.type === 'project' && ctx?.dataDir && !leadLoadedSkills(ctx.dataDir, input.session_id) && !alreadyNoticed(ctx.dataDir, { session: input.session_id, repo, kind: 'skill-unloaded', name: info.name })) {
      lines.push('Aether: load aether:skills before creating or changing a project skill, so the structure, the place in .agents/skills/ and the link in .claude/skills/ are checked.')
      recordNotice(ctx.dataDir, { time: ctx.now, session: input.session_id || null, repo, kind: 'skill-unloaded', name: info.name })
    }

    return lines.length ? lines.join('\n') : null
  } catch {
    return null
  }
}

module.exports = {
  reviewSkill,
  createdFile,
  posttool,
  outsideAgents,
}
