'use strict'

// Lead `Skill` load records and their notices (spec 030 R3, spec 037 R3).
// Family: skill.

const path = require('node:path')
const { repoPaths } = require('./git.js')
const {
  recordUse,
  readUses,
  readNotices,
  canonicalRepo,
} = require('./skill-registry.js')

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

function leadLoadedSkills(dataDir, session) {
  return readUses(dataDir).some((entry) => entry.kind === 'lead' && entry.session === session && Array.isArray(entry.skills) && entry.skills.some((name) => name === 'aether:skills' || name === 'skills'))
}

function alreadyNoticed(dataDir, { session, repo, kind, name }) {
  if (!dataDir) return false
  const canon = canonicalRepo({ repo })
  return readNotices(dataDir).some(
    (n) => n.kind === kind && n.session === (session ?? null) && n.name === name && canonicalRepo(n) === canon,
  )
}

module.exports = {
  recordLeadSkillLoad,
  leadLoadedSkills,
  alreadyNoticed,
  skillToken,
  mainRootOf,
}
