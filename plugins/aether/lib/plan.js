'use strict'

// Parses an Aether plan (a Spec Kit tasks.md, or an older superpowers plan) that carries Aether fields,
// and turns it into a dependency graph of waves.

const { normalizePattern, patternsOverlap } = require('./globs.js')

const TIERS = ['haiku', 'sonnet', 'opus']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const DEFAULT_EFFORT = 'high'
const DEFAULT_REVIEW = 'high'
// Sonnet and Opus never implement at low or medium.
const EFFORTS_BELOW_HIGH = ['low', 'medium']
// A Review line names the reviewer's effort, which is never below high.
const REVIEW_EFFORTS = ['high', 'xhigh', 'max']
const DASH = String.raw`\s+(?:—|–|--|-)\s+`
const TASK_HEADING = /^###\s+Task\s+(\d+)\s*:\s*(.+?)\s*$/i
// any heading that tries to name a task, well formed or not
const TASK_LOOKALIKE = /^#{1,6}\s+\W*task\s*\d/i
const LEVEL2 = /^##\s+\S/
const DEFAULT_LADDER = { haiku: 2, sonnet: 2, opus: 1 }
const DEFAULT_MAX_AGENTS = 200
const MAX_LISTED_GAPS = 20
// A requirement id is R<n>; a top-level item of the spec's Requirements section starts with one.
const REQUIREMENT_ID = /^R\d+$/
const REQUIREMENT_ITEM = /^-\s+\*{0,2}(R\d+)\b/

function stripTicks(text) {
  return String(text).trim().replace(/^`(.*)`$/, '$1').trim()
}

// true for every line inside a fenced code block, fences included; unclosedAt
// is the 1-based line of a fence still open at the end of the file, or null
function codeMask(lines) {
  const mask = []
  let fence = null
  let openedAt = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      mask.push(true)
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
    } else if (m) {
      fence = m[1]
      openedAt = i + 1
      mask.push(true)
    } else {
      mask.push(false)
    }
  }
  return { mask, unclosedAt: fence ? openedAt : null }
}

function parseSpec(lines) {
  const line = lines.find((l) => /^\*\*Spec:\*\*/.test(l))
  if (!line) return null
  let value = line.replace(/^\*\*Spec:\*\*\s*/, '').trim()
  const link = value.match(/^\[([^\]]*)\]\(([^)]*)\)/)
  if (link) value = link[2] || link[1]
  return stripTicks(value) || null
}

// Issue 003: one task that owns this many paths, or the whole tree, is the kind that ends without its report.
const MAX_OWNED_PATHS = 6
// A brief that names more files to read than this is read-heavy (issue 010): its size is in
// what it must read, not in what it owns, and such units end without a report.
const MAX_NAMED_READS = 8
const NAMED_FILE = /(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z0-9]+/g
const WHOLE_TREE = new Set(['**', '*', '**/*'])

// What a brief carries of its spec (trial 2: a brief with only the contract leaves out the quality bar): the
// intent, with the owner's quotes under it, and the criteria. Null when the spec has neither. Bounded.
const MAX_OBJECTIVE_CHARS = 2000

function specObjective(markdown) {
  if (typeof markdown !== 'string') return null
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const parts = []
  const intent = lines.findIndex((line) => /^-\s*Intent:/i.test(line))
  if (intent !== -1) {
    const block = [lines[intent]]
    // The quotes and notes under the intent are indented, or its text wraps.
    for (let i = intent + 1; i < lines.length && /^\s+\S/.test(lines[i]); i++) block.push(lines[i])
    parts.push(block.join('\n'))
  }
  const heading = lines.findIndex((line) => /^##\s+Criteria\s*$/i.test(line))
  if (heading !== -1) {
    let end = lines.findIndex((line, i) => i > heading && /^##\s/.test(line))
    if (end === -1) end = lines.length
    const body = lines.slice(heading + 1, end).join('\n').trim()
    if (body) parts.push(body)
  }
  if (parts.length === 0) return null
  const text = parts.join('\n\n')
  return text.length > MAX_OBJECTIVE_CHARS ? `${text.slice(0, MAX_OBJECTIVE_CHARS - 1)}…` : text
}

function parseExecution(body, errors) {
  const execution = { testCommand: null, ladder: { ...DEFAULT_LADDER }, maxAgents: DEFAULT_MAX_AGENTS }
  if (body === null) {
    errors.push('The plan has no "## Aether Execution" section.')
    return execution
  }
  for (const line of body) {
    let m
    if ((m = line.match(/^\s*-\s*Test command:\s*(.+?)\s*$/i))) {
      execution.testCommand = stripTicks(m[1])
    } else if ((m = line.match(/^\s*-\s*Ladder:\s*(.+?)\s*$/i))) {
      const ladder = {}
      for (const part of m[1].split(',')) {
        const pm = part.trim().match(/^(haiku|sonnet|opus)\s+(\d+)$/i)
        if (pm) ladder[pm[1].toLowerCase()] = Number(pm[2])
        else errors.push(`Aether Execution: cannot read ladder entry "${part.trim()}"; use "haiku 2, sonnet 2, opus 1".`)
      }
      for (const tier of TIERS) {
        if (!(tier in ladder)) errors.push(`Aether Execution: the ladder has no "${tier}" entry.`)
      }
      execution.ladder = { ...DEFAULT_LADDER, ...ladder }
    } else if ((m = line.match(/^\s*-\s*Max agents:\s*(\d+)\s*$/i))) {
      execution.maxAgents = Number(m[1])
    }
  }
  if (!execution.testCommand) errors.push('Aether Execution: "Test command" is missing.')
  return execution
}

// An Owns entry is a relative path or glob: no absolute path, no ".." segment,
// no whitespace, no backtick and no brackets.
function isOwnsEntry(entry) {
  if (entry.startsWith('/') || entry.split('/').includes('..')) return false
  return !/[\s`{}()[\]]/.test(entry)
}

// The Tier line is a model, an optional effort, the dash and the reason. The
// result is null when the line does not read that way.
function parseTierLine(line) {
  const m = line.match(new RegExp(String.raw`^\s*-\s*Tier:\s*(\w+)(?:\s+(\w+))?` + DASH + String.raw`(.+?)\s*$`, 'i'))
  if (!m) return null
  const tier = m[1].toLowerCase()
  if (!TIERS.includes(tier)) return null
  if (m[2] === undefined) return { tier, effort: null, reason: m[3] }
  const effort = m[2].toLowerCase()
  if (!EFFORTS.includes(effort)) return null
  return { tier, effort, reason: m[3] }
}

// bodyCode marks the body lines that sit inside fenced code. Those lines are
// never part of the Aether block, the same as headings inside fences.
function parseAetherFields(task, body, bodyCode, errors) {
  const label = `Task ${task.number}`
  const start = body.findIndex((line, j) => !bodyCode[j] && line.trim() === '**Aether:**')
  if (start === -1) {
    errors.push(`${label}: missing the **Aether:** block.`)
    return
  }
  let sawField = false
  let sawDepends = false
  let tierError = false
  let areaError = false
  let ownsError = false
  for (let j = start + 1; j < body.length; j++) {
    if (bodyCode[j]) continue
    const line = body[j]
    if (line.trim() === '') {
      if (sawField) break
      continue
    }
    if (!/^\s*-\s/.test(line)) break
    sawField = true
    let m
    if (/^\s*-\s*Tier:/i.test(line)) {
      const tierLine = parseTierLine(line)
      if (tierLine === null) {
        tierError = true
        errors.push(`${label}: Tier must be haiku, sonnet or opus, optionally followed by an effort (low, medium, high, xhigh or max), then " — reason".`)
      } else if (tierLine.tier !== 'haiku' && EFFORTS_BELOW_HIGH.includes(tierLine.effort)) {
        tierError = true
        errors.push(`${label}: ${tierLine.tier} ${tierLine.effort} is not used for implementers; Sonnet and Opus run at high, xhigh or max.`)
      } else {
        task.tier = tierLine.tier
        task.effort = tierLine.effort
        task.tierReason = tierLine.reason
      }
    } else if (/^\s*-\s*Review:/i.test(line)) {
      const reviewLine = line.match(new RegExp(String.raw`^\s*-\s*Review:\s*(\w+)` + DASH + String.raw`(.+?)\s*$`, 'i'))
      if (reviewLine && REVIEW_EFFORTS.includes(reviewLine[1].toLowerCase())) {
        task.review = reviewLine[1].toLowerCase()
        task.reviewReason = reviewLine[2]
      } else {
        errors.push(`${label}: Review must be high, xhigh or max, then " — reason".`)
      }
    } else if ((m = line.match(/^\s*-\s*Area:\s*(.*?)\s*$/i))) {
      if (/^[a-z0-9][a-z0-9-]*$/.test(m[1])) {
        task.area = m[1]
      } else {
        areaError = true
        errors.push(`${label}: Area must be lowercase letters, digits and dashes.`)
      }
    } else if ((m = line.match(/^\s*-\s*Owns:\s*(.*?)\s*$/i))) {
      task.owns = []
      for (const entry of m[1].split(',').map(normalizePattern).filter(Boolean)) {
        if (isOwnsEntry(entry)) task.owns.push(entry)
        else {
          ownsError = true
          errors.push(`${label}: Owns entry "${entry}" is not a relative path or glob.`)
        }
      }
    } else if ((m = line.match(/^\s*-\s*Serves:\s*(.*?)\s*$/i))) {
      // Tokens are requirement ids, separated by commas or spaces. traceability judges them, not the parser.
      task.serves.push(...m[1].split(/[\s,]+/).filter(Boolean).map((token) => token.toUpperCase()))
    } else if ((m = line.match(/^\s*-\s*Depends on:\s*(.*?)\s*$/i))) {
      sawDepends = true
      if (/^none$/i.test(m[1])) continue
      const dm = m[1].match(new RegExp(String.raw`^Task\s+(\d+)` + DASH + '(.+)$', 'i'))
      if (dm) {
        task.dependsOn.push({ number: Number(dm[1]), reason: dm[2] })
        if (/[;,]\s*Task\s+\d+/i.test(dm[2])) errors.push(`${label}: write one "Depends on:" line per dependency.`)
      } else errors.push(`${label}: "Depends on: ${m[1]}" needs the form "Task N — reason".`)
    }
  }
  if (!task.tier && !tierError) errors.push(`${label}: missing Tier.`)
  if (!task.area && !areaError) errors.push(`${label}: missing Area.`)
  if (task.owns.length === 0 && !ownsError) errors.push(`${label}: missing Owns.`)
  if (!sawDepends) errors.push(`${label}: missing "Depends on" (use "Depends on: none" for an independent task).`)
}

// Task numbers run from 1 up to the highest number in use, with no gaps. The
// listing is capped so that one absurd number cannot flood the message.
function checkNumbers(numbers, errors) {
  for (const n of numbers) if (n < 1) errors.push(`Task numbers must run from 1 without gaps; Task ${n} is not allowed.`)
  const max = Math.max(...numbers)
  const gaps = max - numbers.filter((n) => n >= 1).length
  if (gaps === 0) return
  const present = new Set(numbers)
  const listed = []
  for (let n = 1; n <= max && listed.length < MAX_LISTED_GAPS; n++) if (!present.has(n)) listed.push(`Task ${n}`)
  const more = gaps > listed.length ? `, and ${gaps - listed.length} more` : ''
  errors.push(`Task numbers must run from 1 without gaps; missing: ${listed.join(', ')}${more}.`)
}

function parsePlan(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n')
  const { mask: code, unclosedAt } = codeMask(lines)
  const isTaskHeading = (i) => !code[i] && TASK_HEADING.test(lines[i])
  const isLevel2 = (i) => !code[i] && LEVEL2.test(lines[i])
  const endOfBlock = (from) => {
    for (let i = from; i < lines.length; i++) if (isTaskHeading(i) || isLevel2(i)) return i
    return lines.length
  }
  const section = (regex) => {
    const start = lines.findIndex((line, i) => !code[i] && regex.test(line))
    return start === -1 ? null : lines.slice(start + 1, endOfBlock(start + 1))
  }
  const errors = []
  if (unclosedAt !== null) errors.push(`A code fence opened at line ${unclosedAt} is never closed.`)
  const constraints = section(/^##\s+Global Constraints\s*$/i)
  const globalConstraints = constraints ? constraints.join('\n').trim() || null : null
  const execution = parseExecution(section(/^##\s+Aether Execution\s*$/i), errors)
  const tasks = []
  const seen = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (code[i]) continue
    if (!TASK_HEADING.test(lines[i])) {
      if (TASK_LOOKALIKE.test(lines[i])) errors.push(`Unrecognized task heading: "${lines[i].trim()}". Use "### Task N: Title".`)
      continue
    }
    const m = lines[i].match(TASK_HEADING)
    const number = Number(m[1])
    if (seen.has(number)) errors.push(`Task ${number} appears more than once.`)
    seen.add(number)
    const bodyEnd = endOfBlock(i + 1)
    const body = lines.slice(i + 1, bodyEnd)
    const task = {
      number,
      title: m[2],
      text: [lines[i], ...body].join('\n').trim(),
      tier: null,
      tierReason: null,
      effort: null,
      review: null,
      reviewReason: null,
      area: null,
      owns: [],
      dependsOn: [],
      serves: [],
    }
    parseAetherFields(task, body, code.slice(i + 1, bodyEnd), errors)
    tasks.push(task)
  }
  if (tasks.length === 0) errors.push('The plan has no "### Task N: ..." headings.')
  else checkNumbers([...seen], errors)
  return { tasks, execution, globalConstraints, spec: parseSpec(lines), errors }
}

// The requirement ids of a spec: the top-level items of its Requirements section, in order, each once.
// Indented items and items in other sections are not requirements.
function requirementsOf(specMarkdown) {
  const lines = String(specMarkdown).replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => /^##\s+Requirements\s*$/i.test(line))
  if (start === -1) return []
  let end = lines.findIndex((line, i) => i > start && /^##\s/.test(line))
  if (end === -1) end = lines.length
  const ids = []
  for (const line of lines.slice(start + 1, end)) {
    const m = line.match(REQUIREMENT_ITEM)
    if (m && !ids.includes(m[1])) ids.push(m[1])
  }
  return ids
}

// Each task must serve a requirement the spec has, and each requirement needs a task. A missing or
// unknown id is an error; a requirement with no task is only a warning. No requirements, nothing to trace.
function traceability(parsed, requirements) {
  const errors = []
  const warnings = []
  if (requirements.length === 0) return { errors, warnings }
  const known = new Set(requirements)
  const served = new Set()
  for (const t of parsed.tasks) {
    if (t.serves.length === 0) {
      errors.push(`Task ${t.number} serves no requirement: add a "- Serves: R1" line to its Aether block.`)
    }
    for (const token of t.serves) {
      if (!REQUIREMENT_ID.test(token)) errors.push(`Task ${t.number}: "${token}" in Serves is not a requirement id such as R1.`)
      else if (!known.has(token)) errors.push(`Task ${t.number} serves ${token}, which the spec does not have.`)
      else served.add(token)
    }
  }
  for (const id of requirements) if (!served.has(id)) warnings.push(`${id} has no task that serves it.`)
  return { errors, warnings }
}

function buildGraph(parsed, { only = null } = {}) {
  if (only && only.length === 0) return { waves: [], tasks: {}, errors: ['The selection names no tasks.'], warnings: [] }
  const errors = []
  const warnings = []
  const known = new Set(parsed.tasks.map((t) => t.number))
  let selected = parsed.tasks
  if (only) {
    const wanted = new Set()
    for (const id of only) {
      // "3" and "task-3" name the same task
      const m = String(id).match(/^(?:task-)?(\d+)$/i)
      if (m && known.has(Number(m[1]))) wanted.add(Number(m[1]))
      else errors.push(`--only names ${id}, which is not in the plan.`)
    }
    selected = parsed.tasks.filter((t) => wanted.has(t.number))
  }
  const ids = new Set(selected.map((t) => `task-${t.number}`))
  const nodes = {}
  for (const t of selected) {
    const deps = []
    for (const d of t.dependsOn) {
      if (!known.has(d.number)) errors.push(`Task ${t.number} depends on Task ${d.number}, which is not in the plan.`)
      else if (ids.has(`task-${d.number}`)) deps.push(`task-${d.number}`)
      else warnings.push(`Task ${t.number} depends on Task ${d.number}, which is outside the selection; it is assumed to be merged already.`)
    }
    nodes[`task-${t.number}`] = {
      number: t.number,
      title: t.title,
      tier: t.tier,
      tierReason: t.tierReason,
      effort: t.effort ?? DEFAULT_EFFORT,
      review: t.review ?? DEFAULT_REVIEW,
      area: t.area,
      owns: t.owns,
      dependsOn: deps,
    }
  }

  const textOf = new Map(parsed.tasks.map((t) => [t.number, t.text || '']))
  for (const node of Object.values(nodes)) {
    const whole = node.owns.find((pattern) => WHOLE_TREE.has(pattern))
    if (whole) warnings.push(`Task ${node.number} owns the whole tree (\`${whole}\`); name the paths it needs (issue 003). Consider splitting it.`)
    else if (node.owns.length > MAX_OWNED_PATHS) {
      warnings.push(
        `Task ${node.number} owns ${node.owns.length} paths; a task that large often ends without its report and the ladder repeats the failure (issue 003). Consider splitting it.`,
      )
    }
    // The files the brief names beyond what the task owns are what it must read (issue 010).
    const owned = (file) => node.owns.some((pattern) => file === pattern || file.startsWith(pattern.replace(/\/\*.*$/, '/')))
    const named = new Set([...(textOf.get(node.number) || '').matchAll(NAMED_FILE)].map((m) => m[0]).filter((file) => !owned(file)))
    if (named.size > MAX_NAMED_READS) {
      warnings.push(
        `Task ${node.number} names ${named.size} files to read beyond the ones it owns; a read-heavy task often ends without its report (issue 010). Consider splitting it by file.`,
      )
    }
  }

  // Layer the dependency graph into waves (Kahn's algorithm).
  const waves = []
  const placed = new Set()
  let remaining = Object.keys(nodes).sort((a, b) => nodes[a].number - nodes[b].number)
  while (remaining.length) {
    const wave = remaining.filter((id) => nodes[id].dependsOn.every((d) => placed.has(d)))
    if (wave.length === 0) {
      errors.push(`Dependency cycle among: ${remaining.map((id) => `Task ${nodes[id].number}`).join(', ')}.`)
      break
    }
    wave.forEach((id) => placed.add(id))
    waves.push(wave)
    remaining = remaining.filter((id) => !placed.has(id))
  }

  for (const wave of waves) {
    for (let i = 0; i < wave.length; i++) {
      for (let j = i + 1; j < wave.length; j++) {
        const a = nodes[wave[i]]
        const b = nodes[wave[j]]
        for (const pa of a.owns) {
          for (const pb of b.owns) {
            if (patternsOverlap(pa, pb)) {
              errors.push(`Task ${a.number} and Task ${b.number} run in the same wave but both own "${pa}" and "${pb}".`)
            }
          }
        }
      }
    }
  }

  // A relaunch judges its selection, not the shape of the whole plan.
  const count = Object.keys(nodes).length
  if (!only && count >= 3 && waves.length === count) {
    errors.push('The plan is a chain: every wave holds one task. Decompose it again so independent tasks can run in parallel (decision D6).')
  } else if (!only && count >= 2 && count / waves.length < 1.5) {
    warnings.push(`Low parallelism: ${count} tasks in ${waves.length} waves (average ${(count / waves.length).toFixed(2)} per wave).`)
  }
  return { waves, tasks: nodes, errors, warnings }
}

function renderBrief(task, { planPath, spec, globalConstraints, objective = null }) {
  const parts = [
    `# Brief: Task ${task.number}: ${task.title}`,
    '',
    `- Plan: ${planPath}`,
    `- Spec: ${spec || 'not named in the plan'}`,
    `- Tier: ${task.tier} ${task.effort ?? DEFAULT_EFFORT} — ${task.tierReason}`,
    `- Area: ${task.area}`,
    `- Owns: ${task.owns.join(', ')}`,
    '',
    'Change only the files your task owns. Exact values in the task text are requirements: use them verbatim.',
    '',
  ]
  if (globalConstraints) parts.push('## Global Constraints', '', globalConstraints, '')
  if (objective) {
    parts.push(
      '## What the spec asks for',
      '',
      "This is the spec's intent and criteria. Your task serves them: the quality bar is the spec's, not only the tests'.",
      '',
      objective,
      '',
    )
  }
  parts.push('## Task', '', task.text, '')
  return parts.join('\n')
}

module.exports = {
  TIERS,
  EFFORTS,
  DEFAULT_EFFORT,
  DEFAULT_REVIEW,
  MAX_OWNED_PATHS,
  MAX_NAMED_READS,
  parsePlan,
  buildGraph,
  renderBrief,
  specObjective,
  requirementsOf,
  traceability,
}
