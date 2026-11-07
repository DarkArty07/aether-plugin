'use strict'

// Notice when a delegate task repeats a finding across tasks (spec 030, R31).
// Family: skill.

const { readEntries } = require('./delegate-log.js')
const { findingKey } = require('./ladder.js')

function repeatedFindings(dataDir, { session = null, task = null } = {}) {
  if (!dataDir || !session || !task) return []
  const entries = readEntries(dataDir, { session })
  if (!Array.isArray(entries) || entries.length === 0) return []

  const taskVerdicts = entries.filter((e) => e.kind === 'verdict' && e.task === task)
  const lastVerdict = taskVerdicts[taskVerdicts.length - 1]
  if (!lastVerdict || lastVerdict.input?.kind !== 'fix' || !Array.isArray(lastVerdict.input?.findings)) {
    return []
  }

  const results = []
  const seenKeys = new Set()

  for (const finding of lastVerdict.input.findings) {
    if (!finding || typeof finding.file !== 'string' || typeof finding.what !== 'string') continue
    const key = findingKey(finding)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    const matchingTasks = []
    for (const entry of entries) {
      if (entry.kind !== 'verdict' || entry.input?.kind !== 'fix') continue
      if (!entry.task || entry.task === task) continue
      if (!Array.isArray(entry.input?.findings)) continue

      const hasSameKey = entry.input.findings.some((f) => f && findingKey(f) === key)
      if (hasSameKey && !matchingTasks.includes(entry.task)) {
        matchingTasks.push(entry.task)
      }
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

  const repeated = repeatedFindings(dataDir, { session, task: taskId })
  if (!repeated || repeated.length === 0) return null

  const lines = repeated.map((r) => {
    const taskNoun = r.tasks.length === 1 ? 'task' : 'tasks'
    return `The finding "${r.finding}" already came up in ${taskNoun} ${r.tasks.join(', ')}. Consider a skill for it: load aether:skills.`
  })

  return lines.join('\n')
}

module.exports = {
  repeatedFindings,
  posttool,
}
