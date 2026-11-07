'use strict'

// The PermissionRequest decision for project skills and rules in spec 030 R20.
// Family: continuity.

const { classifyClaudePath } = require('./tree-paths.js')

function permission(input, ctx) {
  try {
    if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(input.tool_name)) return false
    const file = input.tool_name === 'NotebookEdit' ? input.tool_input.notebook_path : input.tool_input.file_path
    if (typeof file !== 'string' || !file || typeof input.cwd !== 'string' || !input.cwd) return false
    return ['skills', 'rules'].includes(classifyClaudePath(file, { cwd: input.cwd, home: ctx?.home }).kind)
  } catch { return false }
}

module.exports = { permission }
