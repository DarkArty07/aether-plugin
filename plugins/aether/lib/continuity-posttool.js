'use strict'

// The PostToolUse handlers of the continuity system (spec 030 R9, R40): dispatches posttool handlers and reminds that state goes to continuity.
// Family: continuity.

const path = require('node:path')
const treeCheck = require('./tree-check.js')
const skillRegistry = require('./skill-registry.js')
const skillReview = require('./skill-review.js')
const skillRepeat = require('./skill-repeat.js')
const { isSpanish, memoryDir } = require('./continuity-store.js')

const REMINDER_EN =
  "Claude's memory keeps only what lasts: preferences and lessons. The state of a version, a branch or a task goes to the continuity note, which Aether writes by itself; do not record it in the memory."
const REMINDER_ES =
  'La memoria de Claude guarda solo lo que dura: preferencias y lecciones. El estado de una versión, una rama o una tarea va a la nota de continuidad, que Aether escribe sola; no lo registres en la memoria.'

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])

function memoryReminder(input, ctx = {}) {
  if (!input || typeof input !== 'object') return null
  if (!WRITE_TOOLS.has(input.tool_name)) return null
  const filePath = input.tool_input?.file_path
  if (typeof filePath !== 'string' || filePath === '') return null

  const fullPath = path.resolve(input.cwd || '.', filePath)
  const memDir = path.resolve(memoryDir({ cwd: input.cwd, env: ctx.env, home: ctx.home }))
  const contDir = path.join(memDir, 'continuity')

  const relMem = path.relative(memDir, fullPath)
  if (relMem === '' || relMem.startsWith('..') || path.isAbsolute(relMem)) return null

  const relCont = path.relative(contDir, fullPath)
  if (relCont === '' || (!relCont.startsWith('..') && !path.isAbsolute(relCont))) return null

  return isSpanish(ctx.env) ? REMINDER_ES : REMINDER_EN
}

const HANDLERS = [
  memoryReminder,
  treeCheck.posttool,
  skillRegistry.posttool,
  skillReview.posttool,
  skillRepeat.posttool,
]

function posttool(input, ctx = {}) {
  const texts = []
  for (const handler of HANDLERS) {
    try {
      const text = handler(input, ctx)
      if (typeof text === 'string' && text !== '') {
        texts.push(text)
      }
    } catch {
      // Ignore a handler that throws
    }
  }
  return texts.length > 0 ? { additionalContext: texts.join('\n\n') } : null
}

module.exports = {
  HANDLERS,
  memoryReminder,
  posttool,
  REMINDER_EN,
  REMINDER_ES,
}
