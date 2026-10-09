#!/usr/bin/env node
'use strict'

// Usage: node scripts/check-effort.js <session-dir> [--report <report.json>]
//
// Checks, from a Claude Code session's transcripts, that each aether workflow agent ran at the
// effort its call asked for. With --report, also checks that the report shows the same effort.
// Prints one line of JSON. Exits 0 when all match, 1 on a problem, 2 on a usage error.

const fs = require('node:fs')
const path = require('node:path')

const USAGE = 'usage: node scripts/check-effort.js <session-dir> [--report <report.json>]'
const LABEL_EFFORT = / on (?:haiku|sonnet|opus) (low|medium|high|xhigh|max)\b/
const DEFAULT_EFFORT = { 'aether:ops': 'low', 'aether:reviewer': 'high' }

function checkSession(sessionDir, { report = null } = {}) {
  const agents = readAgents(sessionDir)
  const problems = []
  for (const agent of agents) {
    problems.push(...transcriptProblems(agent))
    if (report) problems.push(...reportProblems(agent, report))
  }
  if (agents.length === 0) problems.push(`no aether workflow agents under ${sessionDir}`)
  return { ok: problems.length === 0, agents, problems }
}

// The aether workflow agents of a session, sorted by label.
function readAgents(sessionDir) {
  const agents = []
  for (const { id, file } of metaFiles(sessionDir)) {
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof meta.agentType !== 'string' || !meta.agentType.startsWith('aether:')) continue
    const transcript = path.join(path.dirname(file), `agent-${id}.jsonl`)
    agents.push({
      agent: id,
      type: meta.agentType,
      label: meta.description,
      expected: expectedEffort(meta.description, meta.agentType),
      seen: seenEfforts(transcript),
    })
  }
  return agents.sort((a, b) => compare(a.label, b.label))
}

// Each agent meta file under <sessionDir>/subagents/workflows/<run>/, with the agent's id.
function metaFiles(sessionDir) {
  const root = path.join(sessionDir, 'subagents', 'workflows')
  const files = []
  for (const run of listDir(root)) {
    if (!run.isDirectory()) continue
    const runDir = path.join(root, run.name)
    for (const entry of listDir(runDir)) {
      const match = /^agent-(.+)\.meta\.json$/.exec(entry.name)
      if (match && entry.isFile()) files.push({ id: match[1], file: path.join(runDir, entry.name) })
    }
  }
  return files
}

// The effort the label names, or the default for the agent's type, or null when neither gives one.
function expectedEffort(label, type) {
  const named = LABEL_EFFORT.exec(label)
  if (named) return named[1]
  return DEFAULT_EFFORT[type] ?? null
}

// The distinct efforts the assistant lines of a transcript carry, sorted. Other lines are ignored.
function seenEfforts(transcript) {
  const seen = new Set()
  for (const line of readLines(transcript)) {
    const entry = JSON.parse(line)
    if (entry.type !== 'assistant') continue
    for (const effort of [entry.effort, entry.perTurnEffort]) {
      if (typeof effort === 'string') seen.add(effort)
    }
  }
  return [...seen].sort(compare)
}

function transcriptProblems({ label, expected, seen }) {
  if (expected === null) return [`${label}: the label names no effort`]
  if (seen.length === 0) return [`${label}: expected ${expected}, saw no effort`]
  if (seen.length === 1 && seen[0] === expected) return []
  return [`${label}: expected ${expected}, saw ${seen.join(', ')}`]
}

function reportProblems({ agent, label, expected }, report) {
  if (expected === null) return []
  const items = report.cost?.run?.agents
  const item = Array.isArray(items) ? items.find((entry) => entry.agent === agent) : undefined
  if (!item) return [`${label}: not in the report`]
  if (item.effort !== expected) return [`${label}: the report shows ${item.effort}`]
  return []
}

// The entries of a directory in name order. A directory that does not exist has none.
function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

// The lines of a file that have text. A file that does not exist has none.
function readLines(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  return text.split('\n').filter((line) => line.trim() !== '')
}

// Orders strings by code units, the default string order (localeCompare would differ).
function compare(a, b) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory()
  } catch {
    return false
  }
}

function main(args) {
  const [sessionDir, flag, reportFile] = args
  if (!sessionDir || !isDirectory(sessionDir) || (flag === '--report' && !reportFile)) {
    console.log(JSON.stringify({ ok: false, agents: [], problems: [USAGE] }))
    return 2
  }
  const report = flag === '--report' ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null
  const result = checkSession(sessionDir, { report })
  console.log(JSON.stringify(result))
  return result.ok ? 0 : 1
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}

module.exports = { checkSession }
