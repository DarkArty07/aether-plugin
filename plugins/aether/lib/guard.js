'use strict'

// The aether-guard decision: only the Designer may write specs and plans,
// and autonomy files are kept to aether-autonomy.
// Pure: it reads a PreToolUse hook's JSON and never touches the file system.

const path = require('node:path')

const CHECKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const PROTECTED = /(^|\/)docs\/superpowers\/(specs|plans)\//
const AUTONOMY_PROTECTED = /(^|\/)\.aether\/autonomy\/(grants\.json|[^/]+\/run\.json)$/
const DESIGNER = 'aether:designer'

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

  if (!PROTECTED.test(normalized)) return null
  if (input.agent_type === DESIGNER) return null

  return {
    reason: `In Aether mode only the Designer writes specs and plans. Hand this change to the aether:designer agent (resume it with SendMessage, or start one with the spec or plan path) instead of editing ${resolved} yourself.`,
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

module.exports = { decide }
