'use strict'

// The PermissionRequest decision of the session note of spec 030: true allows the request, false leaves it to Claude Code.
// It never allows yet; task 8 fills it with the rules for the paths of .claude.
// Family: continuity.

function permission(input, ctx) {
  return false
}

module.exports = { permission }
