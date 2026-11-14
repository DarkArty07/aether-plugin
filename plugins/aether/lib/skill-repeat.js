'use strict'

// Notice when a delegate task repeats a finding across tasks of one project (spec 030 R31, spec 037 R1).
// Family: skill.

const { readEntries } = require('./delegate-log.js')
const { repoPaths } = require('./git.js')
const { loadSkillsConfig, recordNotice } = require('./skill-registry.js')

function repeatOf(config) {
  if (config && typeof config.minWordLength === 'number' && typeof config.similarityThreshold === 'number' && Array.isArray(config.stopwords)) {
    return config
  }
  return loadSkillsConfig().repeat
}

function fold(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

function wordsOf(what, config) {
  const stop = new Set(config.stopwords.map((word) => fold(word)))
  return fold(what).split(/[^a-z0-9]+/).filter((word) => word.length >= config.minWordLength && !stop.has(word))
}

// A five-character prefix is the identity of every word at least that long.
// Canonicalize before constructing sets so repetitions and inflections count once.
function wordSimilarity(whatA, whatB, config = null) {
  const repeat = repeatOf(config)
  const wordSet = (what) => new Set(wordsOf(what, repeat).map((word) => word.length >= 5 ? word.slice(0, 5) : word))
  const left = wordSet(whatA)
  const right = wordSet(whatB)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / (left.size + right.size - shared)
}

function findingsMatch(whatA, whatB, config = null) {
  const repeat = repeatOf(config)
  return wordSimilarity(whatA, whatB, repeat) >= repeat.similarityThreshold
}

function sameFile(left, right) {
  return fold(left) === fold(right)
}

function otherTask(entry, session, task, targetRepo) {
  if (entry.kind !== 'verdict' || entry.verdict !== 'fix') return false
  if (entry.input?.kind !== 'fix' || !Array.isArray(entry.input.findings)) return false
  if (!entry.task || (entry.session === session && entry.task === task)) return false
  const entryRepo = typeof entry.repo === 'string' && entry.repo ? entry.repo : null
  const knownRepo = typeof targetRepo === 'string' && targetRepo ? targetRepo : null
  if (entryRepo && knownRepo) return entryRepo === knownRepo
  // A legacy line has no repo, so it only counts inside the same session.
  if (!entryRepo) return entry.session === session && entry.task !== task
  return false
}

function repeatedFindings(dataDir, { session = null, task = null, repo = null, config = null } = {}) {
  if (!dataDir || !session || !task) return []
  const entries = readEntries(dataDir)
  if (!Array.isArray(entries) || entries.length === 0) return []

  const taskVerdicts = entries.filter((entry) => entry.kind === 'verdict' && entry.session === session && entry.task === task)
  const lastVerdict = taskVerdicts[taskVerdicts.length - 1]
  if (!lastVerdict || lastVerdict.input?.kind !== 'fix' || !Array.isArray(lastVerdict.input?.findings)) {
    return []
  }
  const targetRepo = (typeof repo === 'string' && repo) ? repo : (typeof lastVerdict.repo === 'string' ? lastVerdict.repo : null)

  const results = []

  for (const finding of lastVerdict.input.findings) {
    if (!finding || typeof finding.file !== 'string' || typeof finding.what !== 'string') continue

    const matchingTasks = []
    for (const entry of entries) {
      if (!otherTask(entry, session, task, targetRepo)) continue
      const hit = entry.input.findings.some((other) => other && typeof other.file === 'string' && typeof other.what === 'string' && sameFile(other.file, finding.file) && findingsMatch(finding.what, other.what, config))
      if (hit && !matchingTasks.includes(entry.task)) matchingTasks.push(entry.task)
    }

    if (matchingTasks.length > 0) {
      results.push({
        finding: `${finding.file}: ${finding.what}`,
        tasks: matchingTasks,
      })
    }
  }

  return results
}

function posttool(input, ctx = {}) {
  if (!input || typeof input !== 'object') return null
  if (input.tool_name !== 'Bash') return null
  const command = input.tool_input?.command
  if (typeof command !== 'string') return null

  if (!/\baether-delegate\s+verdict\b/.test(command)) return null
  const taskMatch = command.match(/(?:^|\s)--task(?:=|\s+)(["']?)([^"'\s]+)\1/)
  if (!taskMatch) return null
  const taskId = taskMatch[2]

  const dataDir = ctx?.dataDir
  const session = input.session_id
  if (!dataDir || !session) return null

  let repo = null
  try { repo = repoPaths(input.cwd).mainRoot } catch { /* the notice keeps repo null */ }

  const repeated = repeatedFindings(dataDir, { session, task: taskId, repo })
  if (!repeated || repeated.length === 0) return null

  const lines = repeated.map((item) => {
    recordNotice(dataDir, { session, repo, kind: 'repeated-finding', name: item.finding.split(':')[0] })
    const taskNoun = item.tasks.length === 1 ? 'task' : 'tasks'
    return `The finding "${item.finding}" already came up in ${taskNoun} ${item.tasks.join(', ')}. Consider a skill for it: load aether:skills.`
  })

  return lines.join('\n')
}

module.exports = {
  wordSimilarity,
  findingsMatch,
  repeatedFindings,
  posttool,
}
