'use strict'

// Reviews newly created or changed skills and records their creation under spec 030 (R32).
// Family: skill.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const { checkSkillFile } = require('./skill-brief.js')
const { computedHash } = require('./skill-registry.js')
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

function posttool(input, ctx = {}) {
  try {
    if (!input || typeof input !== 'object') return null
    if (!['Write', 'Edit', 'MultiEdit'].includes(input.tool_name)) return null

    const file = input.tool_input?.file_path
    if (typeof file !== 'string' || !file.trim()) return null

    const info = classifySkillPath(file, { cwd: input.cwd, home: ctx?.home })
    if (!info || (info.type !== 'project' && info.type !== 'owner')) return null

    if (ctx?.dataDir) {
      const filePath = createdFile(ctx.dataDir)
      let alreadyRecorded = false
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8')
          const lines = content.split('\n')
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const entry = JSON.parse(line)
              if (entry.name === info.name && entry.path === info.dir) {
                alreadyRecorded = true
                break
              }
            } catch {}
          }
        } catch {}
      }

      if (!alreadyRecorded) {
        let repo = null
        if (info.type === 'project') {
          try {
            repo = repoPaths(input.cwd || info.dir).mainRoot
          } catch {
            repo = input.cwd || null
          }
        }

        const record = {
          time: ctx.now ?? Date.now(),
          session: input.session_id || null,
          repo,
          name: info.name,
          path: info.dir,
          type: info.type,
        }

        try {
          fs.mkdirSync(path.dirname(filePath), { recursive: true })
          fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8')
        } catch {}
      }
    }

    const problems = reviewSkill(info.dir, { cwd: input.cwd, home: ctx?.home })
    if (!problems || problems.length === 0) return null

    return problems.map((p) => `Skill "${info.name}": ${p}`).join('\n')
  } catch {
    return null
  }
}

module.exports = {
  reviewSkill,
  createdFile,
  posttool,
}
