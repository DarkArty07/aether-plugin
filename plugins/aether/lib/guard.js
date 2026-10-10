'use strict'

// The aether-guard decision: only the main session, the Lead and the Writer write specs, plans
// and tasks, and autonomy files are kept to aether-autonomy.
// Protected: docs/superpowers/specs/ and plans/ (the old place), specs/NNN-<topic>/ spec.md,
// plan.md and tasks.md (Spec Kit), and .specify/memory/constitution.md.
// Pure: it reads a PreToolUse hook's JSON and never touches the file system.

const path = require('node:path')

const CHECKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const PROTECTED = [
  /(^|\/)docs\/superpowers\/(specs|plans)\//,
  /(^|\/)specs\/\d{3}-[^/]+\/(spec|plan|tasks)\.md$/,
  /(^|\/)\.specify\/memory\/constitution\.md$/,
]
const AUTONOMY_PROTECTED = /(^|\/)\.aether\/autonomy\/(grants\.json|[^/]+\/run\.json)$/
const LEAD = 'aether:lead'
const WRITER = 'aether:writer'

// decide(input) gives null to allow, or { reason } to deny.
function decide(input) {
  if (!isObject(input) || !CHECKED_TOOLS.has(input.tool_name) || !isObject(input.tool_input)) return null

  const target = input.tool_name === 'NotebookEdit' ? input.tool_input.notebook_path : input.tool_input.file_path
  if (typeof target !== 'string') return null

  const base = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd()
  const resolved = path.resolve(base, target)
  const normalized = resolved.split(path.sep).join('/')

  if (AUTONOMY_PROTECTED.test(normalized)) {
    return {
      reason: `Aether's autonomy registry and run states are written only by aether-autonomy. Use \`aether-autonomy\` (grant, revoke, start, spend, end) instead of editing ${resolved}.`,
    }
  }

  if (!PROTECTED.some((re) => re.test(normalized))) return null
  if (mayWriteDocs(input)) return null

  return {
    reason: `In Aether mode only the Lead and the Writer write specs, plans and tasks. Hand this change to the Lead, or to the aether:writer agent, instead of editing ${resolved} yourself.`,
  }
}

// The main session's hook input names no agent. An input that names one, by agent_id or agent_type,
// may write only when its agent_type is the Lead's or the Writer's.
function mayWriteDocs(input) {
  if (input.agent_type === LEAD || input.agent_type === WRITER) return true
  return isBlank(input.agent_id) && isBlank(input.agent_type)
}

function isBlank(value) {
  return value === undefined || value === null || value === ''
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

module.exports = { decide }
