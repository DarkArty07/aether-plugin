'use strict'

// Parses a superpowers implementation plan that carries Aether fields, and
// turns it into a dependency graph of waves.

const { normalizePattern, patternsOverlap } = require('./globs.js')

const TIERS = ['haiku', 'sonnet', 'opus']
const DASH = String.raw`\s+(?:—|–|--|-)\s+`
const TASK_HEADING = /^###\s+Task\s+(\d+)\s*:\s*(.+?)\s*$/i
const LEVEL2 = /^##\s+\S/
const DEFAULT_LADDER = { haiku: 2, sonnet: 2, opus: 1 }
const DEFAULT_MAX_AGENTS = 200

function stripTicks(text) {
  return String(text).trim().replace(/^`(.*)`$/, '$1').trim()
}

// true for every line inside a fenced code block, fences included
function codeMask(lines) {
  const mask = []
  let fence = null
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      mask.push(true)
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
    } else if (m) {
      fence = m[1]
      mask.push(true)
    } else {
      mask.push(false)
    }
  }
  return mask
}

function parseSpec(lines) {
  const line = lines.find((l) => /^\*\*Spec:\*\*/.test(l))
  if (!line) return null
  let value = line.replace(/^\*\*Spec:\*\*\s*/, '').trim()
  const link = value.match(/^\[([^\]]*)\]\(([^)]*)\)/)
  if (link) value = link[2] || link[1]
  return stripTicks(value) || null
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

function parseAetherFields(task, body, errors) {
  const label = `Task ${task.number}`
  const start = body.findIndex((line) => line.trim() === '**Aether:**')
  if (start === -1) {
    errors.push(`${label}: missing the **Aether:** block.`)
    return
  }
  let sawField = false
  let sawDepends = false
  let tierError = false
  let areaError = false
  for (const line of body.slice(start + 1)) {
    if (line.trim() === '') {
      if (sawField) break
      continue
    }
    if (!/^\s*-\s/.test(line)) break
    sawField = true
    let m
    if (/^\s*-\s*Tier:/i.test(line)) {
      m = line.match(new RegExp(String.raw`^\s*-\s*Tier:\s*(\w+)` + DASH + String.raw`(.+?)\s*$`, 'i'))
      if (m && TIERS.includes(m[1].toLowerCase())) {
        task.tier = m[1].toLowerCase()
        task.tierReason = m[2]
      } else {
        tierError = true
        errors.push(`${label}: Tier must be haiku, sonnet or opus followed by " — reason".`)
      }
    } else if ((m = line.match(/^\s*-\s*Area:\s*(.*?)\s*$/i))) {
      if (/^[a-z0-9][a-z0-9-]*$/.test(m[1])) {
        task.area = m[1]
      } else {
        areaError = true
        errors.push(`${label}: Area must be lowercase letters, digits and dashes.`)
      }
    } else if ((m = line.match(/^\s*-\s*Owns:\s*(.*?)\s*$/i))) {
      task.owns = m[1].split(',').map(normalizePattern).filter(Boolean)
    } else if ((m = line.match(/^\s*-\s*Depends on:\s*(.*?)\s*$/i))) {
      sawDepends = true
      if (/^none$/i.test(m[1])) continue
      const dm = m[1].match(new RegExp(String.raw`^Task\s+(\d+)` + DASH + '(.+)$', 'i'))
      if (dm) task.dependsOn.push({ number: Number(dm[1]), reason: dm[2] })
      else errors.push(`${label}: "Depends on: ${m[1]}" needs the form "Task N — reason".`)
    }
  }
  if (!task.tier && !tierError) errors.push(`${label}: missing Tier.`)
  if (!task.area && !areaError) errors.push(`${label}: missing Area.`)
  if (task.owns.length === 0) errors.push(`${label}: missing Owns.`)
  if (!sawDepends) errors.push(`${label}: missing "Depends on" (use "Depends on: none" for an independent task).`)
}

function parsePlan(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n')
  const code = codeMask(lines)
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
  const constraints = section(/^##\s+Global Constraints\s*$/i)
  const globalConstraints = constraints ? constraints.join('\n').trim() || null : null
  const execution = parseExecution(section(/^##\s+Aether Execution\s*$/i), errors)
  const tasks = []
  const seen = new Set()
  for (let i = 0; i < lines.length; i++) {
    if (!isTaskHeading(i)) continue
    const m = lines[i].match(TASK_HEADING)
    const number = Number(m[1])
    if (seen.has(number)) errors.push(`Task ${number} appears more than once.`)
    seen.add(number)
    const body = lines.slice(i + 1, endOfBlock(i + 1))
    const task = {
      number,
      title: m[2],
      text: [lines[i], ...body].join('\n').trim(),
      tier: null,
      tierReason: null,
      area: null,
      owns: [],
      dependsOn: [],
    }
    parseAetherFields(task, body, errors)
    tasks.push(task)
  }
  if (tasks.length === 0) errors.push('The plan has no "### Task N: ..." headings.')
  return { tasks, execution, globalConstraints, spec: parseSpec(lines), errors }
}

function buildGraph(parsed, { only = null } = {}) {
  const errors = []
  const warnings = []
  const known = new Set(parsed.tasks.map((t) => t.number))
  let selected = parsed.tasks
  if (only) {
    const wanted = new Set(only)
    for (const id of wanted) {
      if (!known.has(Number(String(id).replace(/^task-/, '')))) errors.push(`--only names ${id}, which is not in the plan.`)
    }
    selected = parsed.tasks.filter((t) => wanted.has(`task-${t.number}`))
  }
  const ids = new Set(selected.map((t) => `task-${t.number}`))
  const nodes = {}
  for (const t of selected) {
    const deps = []
    for (const d of t.dependsOn) {
      if (!known.has(d.number)) errors.push(`Task ${t.number} depends on Task ${d.number}, which is not in the plan.`)
      else if (ids.has(`task-${d.number}`)) deps.push(`task-${d.number}`)
    }
    nodes[`task-${t.number}`] = {
      number: t.number,
      title: t.title,
      tier: t.tier,
      tierReason: t.tierReason,
      area: t.area,
      owns: t.owns,
      dependsOn: deps,
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

  const count = Object.keys(nodes).length
  if (count >= 3 && waves.length === count) {
    errors.push('The plan is a chain: every wave holds one task. Decompose it again so independent tasks can run in parallel (decision D6).')
  } else if (count >= 2 && count / waves.length < 1.5) {
    warnings.push(`Low parallelism: ${count} tasks in ${waves.length} waves (average ${(count / waves.length).toFixed(2)} per wave).`)
  }
  return { waves, tasks: nodes, errors, warnings }
}

function renderBrief(task, { planPath, spec, globalConstraints }) {
  const parts = [
    `# Brief: Task ${task.number}: ${task.title}`,
    '',
    `- Plan: ${planPath}`,
    `- Spec: ${spec || 'not named in the plan'}`,
    `- Tier: ${task.tier} — ${task.tierReason}`,
    `- Area: ${task.area}`,
    `- Owns: ${task.owns.join(', ')}`,
    '',
    'Change only the files your task owns. Exact values in the task text are requirements: use them verbatim.',
    '',
  ]
  if (globalConstraints) parts.push('## Global Constraints', '', globalConstraints, '')
  parts.push('## Task', '', task.text, '')
  return parts.join('\n')
}

module.exports = { TIERS, parsePlan, buildGraph, renderBrief }
