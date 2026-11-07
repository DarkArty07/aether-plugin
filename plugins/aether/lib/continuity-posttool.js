'use strict'

// The PostToolUse side of the session note of spec 030: a list of handlers, each one a function (input, ctx) that returns
// { additionalContext } or null. The first handler that returns a context wins. The list is empty until task 5 adds its
// handlers, so posttool returns null for every hook input.
// Family: continuity.

const HANDLERS = []

function posttool(input, ctx) {
  for (const handler of HANDLERS) {
    const out = handler(input, ctx)
    if (out) return out
  }
  return null
}

module.exports = { HANDLERS, posttool }
