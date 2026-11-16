'use strict'

// Project-declared plan rules from .specify/plan-rules.json (issue 263): when a task adds or
// changes a matching file, it (or a task it depends on) must own the required registration files.
// Family: plan.

const fs = require('node:fs')
const path = require('node:path')

const { isText } = require('./common.js')
const { isGlob, matchesAny, normalizePattern } = require('./globs.js')
const { filesOf, dependenciesOf } = require('./plan-warnings.js')

const RULES_REL = '.specify/plan-rules.json'

function validateRule(rule, index) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return `${RULES_REL}: rule ${index + 1} must be an object`
  }
  const hasAdds = isText(rule.adds)
  const hasChanges = isText(rule.changes)
  if (hasAdds === hasChanges) {
    return `${RULES_REL}: rule ${index + 1} must have either "adds" or "changes" (not both)`
  }
  if (!Array.isArray(rule.owns) || rule.owns.length === 0 || !rule.owns.every(isText)) {
    return `${RULES_REL}: rule ${index + 1} must have a non-empty "owns" array of strings`
  }
  if (!isText(rule.why)) {
    return `${RULES_REL}: rule ${index + 1} must have a non-empty "why" string`
  }
  return null
}

// Loads and validates .specify/plan-rules.json under root. Missing file returns no rules and no errors;
// any parse or shape problem returns an error naming the file.
function loadPlanRules(root) {
  const file = path.join(root, '.specify', 'plan-rules.json')
  if (!fs.existsSync(file)) return { rules: [], errors: [] }
  let data
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    return { rules: [], errors: [`${RULES_REL}: ${err.message}`] }
  }
  if (!Array.isArray(data)) {
    return { rules: [], errors: [`${RULES_REL}: expected a JSON array of rules`] }
  }
  const errors = []
  data.forEach((rule, index) => {
    const error = validateRule(rule, index)
    if (error) errors.push(error)
  })
  if (errors.length > 0) return { rules: [], errors }
  return { rules: data, errors: [] }
}

// Literal paths in task.owns that do not exist in the tree at check/compile time.
// Globs and folders never trigger "adds".
function addedFilesOf(task, root, existing) {
  const added = []
  for (const pattern of task.owns) {
    const norm = normalizePattern(pattern)
    if (norm === '' || pattern.trim().endsWith('/') || isGlob(pattern)) continue
    if (!existing.has(norm) && !fs.existsSync(path.join(root, norm))) added.push(norm)
  }
  return added
}

// Existing files in task.owns, whether named literally or matched by a glob or folder.
function changedFilesOf(task, root, files, existing) {
  const changed = new Set()
  for (const pattern of task.owns) {
    const norm = normalizePattern(pattern)
    if (norm === '') continue
    const isFolder = pattern.trim().endsWith('/') || files.some((f) => f.startsWith(`${norm}/`))
    if (isGlob(pattern) || isFolder) {
      for (const file of files) {
        if (matchesAny(file, [pattern])) changed.add(file)
      }
    } else if (existing.has(norm) || fs.existsSync(path.join(root, norm))) {
      changed.add(norm)
    }
  }
  return [...changed]
}

// Evaluates project rules for each task in parsed against root.
// Returns { errors, warnings }.
function ruleWarnings(parsed, root) {
  const { rules, errors } = loadPlanRules(root)
  if (errors.length > 0) return { errors, warnings: [] }
  if (rules.length === 0 || parsed.tasks.length === 0) return { errors: [], warnings: [] }

  const files = filesOf(root)
  const existing = new Set(files)
  const byNumber = new Map(parsed.tasks.map((task) => [task.number, task]))
  const warnings = []

  for (const task of parsed.tasks) {
    const added = addedFilesOf(task, root, existing)
    const changed = changedFilesOf(task, root, files, existing)
    const covering = [task, ...[...dependenciesOf(task, byNumber)].map((n) => byNumber.get(n)).filter(Boolean)]

    for (const rule of rules) {
      const kind = rule.adds ? 'adds' : 'changes'
      const pattern = rule.adds || rule.changes
      const matched = (kind === 'adds' ? added : changed).filter((file) => matchesAny(file, [pattern]))
      if (matched.length === 0) continue

      const missing = rule.owns.filter((req) => !covering.some((owner) => matchesAny(req, owner.owns)))
      if (missing.length === 0) continue

      warnings.push(
        `Task ${task.number} ${kind} ${matched.join(', ')} without owning ${missing.join(', ')} (nor a task it depends on): ${rule.why}`,
      )
    }
  }

  return { errors: [], warnings }
}

module.exports = { loadPlanRules, ruleWarnings }
