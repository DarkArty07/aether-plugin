'use strict'

// Checks project instruction files after edits for spec 030 R12.
// Family: tree.

const fs = require('node:fs')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const { isSpanish } = require('./continuity-store.js')

const MAX_LINES = 200

function importsAgents(text) {
  let fence = null
  for (const line of text.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
      continue
    }
    if (!fence && /^\s*@(?:\.\/)?AGENTS\.md(?:\s|$)/.test(line)) return true
  }
  return false
}

function checkProjectFiles(root, { maxLines = MAX_LINES } = {}) {
  const read = (name) => {
    try { return fs.readFileSync(path.join(root, name), 'utf8') } catch { return null }
  }
  const claude = read('CLAUDE.md')
  const agents = read('AGENTS.md')
  const findings = []
  if (claude !== null && agents !== null && !importsAgents(claude)) findings.push({ code: 'claude-no-import', file: 'CLAUDE.md' })
  for (const [file, text, code] of [['CLAUDE.md', claude, 'claude-too-long'], ['AGENTS.md', agents, 'agents-too-long']]) {
    if (text === null) continue
    const parts = text.split('\n')
    if (parts[parts.length - 1] === '') parts.pop()
    if (parts.length > maxLines) {
      const finding = { code, file, lines: parts.length }
      Object.defineProperty(finding, 'maxLines', { value: maxLines })
      findings.push(finding)
    }
  }
  return findings
}

function findingText(finding, { spanish } = {}) {
  const limit = finding.maxLines ?? MAX_LINES
  if (finding.code === 'claude-no-import') return spanish
    ? 'CLAUDE.md no importa a AGENTS.md: agrega la línea @AGENTS.md a CLAUDE.md.'
    : 'CLAUDE.md does not import AGENTS.md: add the line @AGENTS.md to CLAUDE.md.'
  if (finding.code === 'claude-too-long') return spanish
    ? `CLAUDE.md tiene ${finding.lines} líneas (el tope es ${limit}): pasa lo que no es solo de Claude a AGENTS.md o a .claude/rules/.`
    : `CLAUDE.md has ${finding.lines} lines (the limit is ${limit}): move what is not Claude-only to AGENTS.md or to .claude/rules/.`
  if (finding.code === 'agents-too-long') return spanish
    ? `AGENTS.md tiene ${finding.lines} líneas (el tope es ${limit}): divídelo y déjalo como un mapa.`
    : `AGENTS.md has ${finding.lines} lines (the limit is ${limit}): split it and keep it a map.`
  return null
}

function posttool(input, ctx = {}) {
  if (!input || !['Write', 'Edit', 'MultiEdit'].includes(input.tool_name)) return null
  const file = input.tool_input?.file_path
  if (typeof file !== 'string' || !file) return null
  try {
    const roots = repoPaths(input.cwd || '.')
    const target = path.resolve(input.cwd || '.', file)
    for (const root of new Set([roots.worktree, roots.mainRoot])) {
      if (target === path.join(root, 'CLAUDE.md') || target === path.join(root, 'AGENTS.md')) {
        const findings = checkProjectFiles(root)
        return findings.length ? findings.map((finding) => findingText(finding, { spanish: isSpanish(ctx.env) })).join('\n') : null
      }
    }
  } catch { return null }
  return null
}

module.exports = { MAX_LINES, importsAgents, checkProjectFiles, findingText, posttool }
