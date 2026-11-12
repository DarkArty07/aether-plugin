'use strict'

// The PostToolUse handlers of the continuity system (spec 030 R9, R40): dispatches posttool handlers and reminds that state goes to continuity.
// Family: continuity.

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { commandSegments, dropWrappers, nameOf, redirectTargets } = require('./bash-parse.js')
const { isAetherSession } = require('./session.js')
const treeCheck = require('./tree-check.js')
const skillRegistry = require('./skill-registry.js')
const skillReview = require('./skill-review.js')
const skillRepeat = require('./skill-repeat.js')
const { isSpanish, memoryDir, continuityDir, readNote } = require('./continuity-store.js')

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

const DIRECT_EDIT_LIMIT = 3
const DIRECT_READ_LIMIT = 10
const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'jq', 'sed', 'awk', 'grep', 'egrep', 'fgrep'])
const SEARCHERS = new Set(['rg', 'find', 'fd'])

function under(dir, file) {
  const rel = path.relative(path.resolve(dir), file)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isExemptPath(filePath, cwd, input, ctx) {
  const abs = path.resolve(cwd, filePath)
  const segments = (under(cwd, abs) ? path.relative(cwd, abs) : abs).split(path.sep)
  if (segments.some((part) => ['.aether', '.specify', 'specs', 'docs'].includes(part))) return true
  if (['README.md', 'CLAUDE.md', 'AGENTS.md'].includes(path.basename(abs)) || abs === '/dev/null') return true
  const config = ctx.env?.CLAUDE_CONFIG_DIR || path.join(ctx.home || os.homedir(), '.claude')
  return under(config, abs) || under(memoryDir({ cwd, env: ctx.env, home: ctx.home }), abs) ||
    (typeof input.scratchpad_dir === 'string' && input.scratchpad_dir !== '' && under(path.dirname(input.scratchpad_dir), abs))
}

function eachSegment(command, cwd, visit) {
  let base = cwd
  for (const segment of commandSegments(typeof command === 'string' ? command : '')) {
    const words = dropWrappers(segment)
    if (!words.length) continue
    const name = nameOf(words[0])
    visit(segment, words, name, base)
    if (name === 'cd') {
      const dir = words.slice(1).find((word) => !word.startsWith('-'))
      if (dir) base = path.resolve(base, dir)
    }
  }
}

function bashWriteTargets(command, cwd) {
  const targets = []
  eachSegment(command, cwd, (segment, words, name, base) => {
    const found = redirectTargets(segment).filter((word) => word && !word.startsWith('&'))
    const args = words.slice(1).filter((word) => !word.startsWith('-'))
    if (name === 'tee') found.push(...args)
    if (name === 'sed' && words.slice(1).some((word) => word === '-i' || word.startsWith('-i') || word === '--in-place' || word.startsWith('--in-place='))) found.push(...args.slice(1))
    if ((name === 'cp' || name === 'mv') && args.length) found.push(args[args.length - 1])
    targets.push(...found.map((file) => path.resolve(base, file)))
  })
  return targets
}

function isDirectEdit(input, ctx) {
  const cwd = input.cwd || '.'
  const tool = input.tool_name
  const file = tool === 'NotebookEdit' ? input.tool_input?.notebook_path : input.tool_input?.file_path
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) return typeof file === 'string' && file !== '' && !isExemptPath(file, cwd, input, ctx)
  return tool === 'Bash' && bashWriteTargets(input.tool_input?.command, cwd).some((target) => !isExemptPath(target, cwd, input, ctx))
}

function isDirectRead(input, ctx) {
  const cwd = input.cwd || '.'
  const tool = input.tool_name
  if (tool === 'Read') return typeof input.tool_input?.file_path === 'string' && input.tool_input.file_path !== '' && !isExemptPath(input.tool_input.file_path, cwd, input, ctx)
  if (tool === 'Grep' || tool === 'Glob') {
    const file = input.tool_input?.path
    return !(typeof file === 'string' && file !== '' && isExemptPath(file, cwd, input, ctx))
  }
  if (tool !== 'Bash' || isDirectEdit(input, ctx)) return false
  let counted = false
  eachSegment(input.tool_input?.command, cwd, (segment, words, name, base) => {
    let args = words.slice(1)
    let search = SEARCHERS.has(name)
    if (name === 'git') {
      let i = 0
      while (i < args.length && args[i].startsWith('-')) i += ['-C', '-c'].includes(args[i]) ? 2 : 1
      search = ['grep', 'show', 'diff'].includes(args[i])
      args = args.slice(i + 1)
    }
    if (!search && !READERS.has(name)) return
    const paths = args.filter((word) => !word.startsWith('-')).map((word) => path.resolve(base, word)).filter((file) => fs.existsSync(file))
    if ((search && paths.length === 0) || paths.some((file) => !isExemptPath(file, cwd, input, ctx))) counted = true
  })
  return counted
}

function directTurnBudget(input, ctx) {
  if (!input || input.agent_id || typeof input.session_id !== 'string' || !ctx.dataDir || !isAetherSession(ctx.dataDir, input.session_id)) return null
  try {
    const edit = isDirectEdit(input, ctx)
    const read = isDirectRead(input, ctx)
    if (!edit && !read) return null
    const note = readNote(continuityDir({ cwd: input.cwd, env: ctx.env, home: ctx.home }), input.session_id)
    const noteAt = typeof note?.updatedAt === 'number' ? note.updatedAt : 0
    const hash = (value) => createHash('sha256').update(value).digest('hex')
    const session = hash(input.session_id)
    const key = hash(JSON.stringify([typeof input.prompt_id === 'string' ? input.prompt_id : null, noteAt]))
    const dir = path.join(ctx.dataDir, 'continuity')
    const prefix = `${session}.`
    const file = path.join(dir, `${prefix}${key}.log`)
    const marker = path.join(dir, `${prefix}${key}.notice`)
    fs.mkdirSync(dir, { recursive: true })
    let created = false
    try {
      // Elect one caller to prune; existing logs are never truncated or replaced.
      fs.closeSync(fs.openSync(file, 'wx'))
      created = true
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    if (created) {
      const staleBefore = Date.now() - 30 * 24 * 60 * 60 * 1000
      for (const name of fs.readdirSync(dir)) {
        if (!/^[a-f0-9]{64}\.[a-f0-9]{64}\.(log|notice)$/.test(name)) continue
        const target = path.join(dir, name)
        if (target === file || target === marker) continue
        try {
          if (name.startsWith(prefix) || fs.statSync(target).mtimeMs < staleBefore) fs.unlinkSync(target)
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
      }
    }
    // One small O_APPEND write per counted call preserves concurrent increments.
    fs.appendFileSync(file, edit ? 'edit\n' : 'read\n', { flag: 'a' })
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const edits = lines.filter((line) => line === 'edit').length
    const reads = lines.filter((line) => line === 'read').length
    if (edits >= DIRECT_EDIT_LIMIT || reads >= DIRECT_READ_LIMIT) {
      // Only the exclusive creator returns the notice; EEXIST is caught below.
      fs.closeSync(fs.openSync(marker, 'wx'))
      return isSpanish(ctx.env)
        ? 'Aether: se alcanzó el límite del camino directo en este turno (3 ediciones propias de código o pruebas, o 10 lecturas o búsquedas en el código). Según los tres caminos, el resto de este trabajo pasa a una tarea delegada (Agent, con un encargo AETHER-TASK), salvo que el dueño te haya pedido hacerlo a ti.'
        : 'Aether: the direct-path limit for this turn was reached (3 own edits to code or tests, or 10 reads or searches in the code). By the three paths, the rest of this work goes to a delegate task (Agent, with an AETHER-TASK brief), unless the owner asked you to do it yourself.'
    }
    return null
  } catch { return null }
}

const HANDLERS = [
  directTurnBudget,
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
  DIRECT_EDIT_LIMIT,
  DIRECT_READ_LIMIT,
  memoryReminder,
  posttool,
  REMINDER_EN,
  REMINDER_ES,
}
