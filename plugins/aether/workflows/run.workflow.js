export const meta = {
  name: 'run',
  description:
    'Aether swarm: runs a plan compiled by aether-plan in parallel waves, with tier escalation, supervision, one-at-a-time merges, a final review and cleanup. Pass the JSON that `aether-plan compile` prints as args.',
  phases: [
    { title: 'Implement', detail: "an implementer per attempt, on the unit's current tier" },
    { title: 'Supervise', detail: 'a supervisor reviews each attempt and rules on it' },
    { title: 'Merge', detail: 'one merge at a time; finished units are closed' },
    { title: 'Final review', detail: 'Opus reviews everything the run merged' },
    { title: 'Cleanup', detail: "the run's worktrees and branches are swept" },
  ],
}

// The swarm executor (spec §7). The units of a wave run in parallel, each through this loop:
// implement on the current tier → supervise → merge (one at a time) → close.
// The script keeps the ladder, the agent budget and every unit's history; agents only judge and act.
// Every agent call names its agentType, so no agent gets the session's full tool set.
// The script never reads the clock or random numbers: the runtime replays a resumed run call by call.

const TIERS = ['haiku', 'sonnet', 'opus']
const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/
const TASK_ID = /^task-\d+$/
const BLOCKING = ['critical', 'important']
const AREA_MEMORY = 10

const FINDINGS = {
  type: 'array',
  items: {
    type: 'object',
    required: ['severity', 'title', 'file', 'evidence'],
    properties: {
      severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
      title: { type: 'string' },
      file: { type: 'string', description: 'path:line' },
      evidence: { type: 'string' },
    },
  },
}

const IMPLEMENTER_SCHEMA = {
  type: 'object',
  required: ['status', 'summary', 'head', 'tests', 'concerns', 'question'],
  properties: {
    status: { type: 'string', enum: ['DONE', 'DONE_WITH_CONCERNS', 'NEEDS_CONTEXT', 'BLOCKED'] },
    summary: { type: 'string', description: 'what you implemented, or what you attempted' },
    head: { type: 'string', description: 'the commit your unit branch ends on; empty if you made none' },
    tests: { type: 'string', description: 'the test commands you ran and their results, RED then GREEN' },
    concerns: { type: 'string', description: 'doubts about the work; empty if none' },
    question: { type: 'string', description: 'for NEEDS_CONTEXT or BLOCKED: exactly what you need; empty otherwise' },
  },
}

const SUPERVISOR_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings', 'ruling', 'guidance', 'question'],
  properties: {
    verdict: { type: 'string', enum: ['approve', 'retry', 'escalate', 'block'] },
    findings: FINDINGS,
    ruling: { type: 'string', description: 'one line: the decision and why' },
    guidance: { type: 'string', description: 'for retry or escalate: what the next attempt must do; empty otherwise' },
    question: { type: 'string', description: 'for block: the question the Designer must answer; empty otherwise' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'findings', 'declined', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['ready', 'ready-with-fixes', 'not-ready'] },
    findings: FINDINGS,
    declined: {
      type: 'array',
      items: { type: 'string' },
      description: 'behaviors you set aside as outside the plan or spec, each with the reason',
    },
    summary: { type: 'string', description: 'strengths and a one-paragraph assessment' },
  },
}

const OPS_SCHEMA = {
  type: 'object',
  required: ['exitCode', 'stdout'],
  properties: {
    exitCode: { type: 'integer' },
    stdout: { type: 'string', description: 'the standard output, exactly as printed' },
  },
}

// --- input -----------------------------------------------------------------------------------

function readArgs(raw) {
  // The args may arrive as an object or as JSON, and a Designer may quote the JSON once more.
  let input = raw
  for (let i = 0; i < 2 && typeof input === 'string'; i++) {
    try {
      input = JSON.parse(input)
    } catch {
      input = null
    }
  }
  if (!input || typeof input !== 'object') throw new Error('aether:run needs the JSON that aether-plan compile prints')
  const text = (value) => typeof value === 'string' && value !== ''
  const bad = []
  if (!RUN_ID.test(String(input.runId))) bad.push('runId')
  for (const key of ['repoRoot', 'runDir', 'testCommand']) if (!text(input[key])) bad.push(key)
  for (const key of ['branch', 'worktree', 'base']) if (!text(input.integration && input.integration[key])) bad.push(`integration.${key}`)
  if (!input.ladder || !TIERS.every((t) => Number.isInteger(input.ladder[t]) && input.ladder[t] >= 0)) bad.push('ladder')
  if (!Number.isInteger(input.maxAgents) || input.maxAgents < 1) bad.push('maxAgents')
  if (!Array.isArray(input.waves) || !input.waves.every(Array.isArray)) bad.push('waves')
  if (!input.tasks || typeof input.tasks !== 'object') bad.push('tasks')
  if (bad.length) throw new Error(`aether:run args are missing or invalid: ${bad.join(', ')}`)
  const seen = new Set()
  for (const id of input.waves.flat()) {
    const t = input.tasks[id]
    const complete =
      TASK_ID.test(id) && t && text(t.title) && text(t.brief) && TIERS.includes(t.tier) && text(t.area) && Array.isArray(t.owns) && Array.isArray(t.dependsOn)
    if (!complete) throw new Error(`aether:run args: ${id} is not a complete task`)
    // A task listed twice would run as two units in the same worktree.
    if (seen.has(id)) throw new Error(`aether:run args: ${id} appears more than once in the waves`)
    seen.add(id)
  }
  return input
}

const input = readArgs(args)
const { runId, repoRoot, runDir, integration, testCommand, ladder, maxAgents, waves, tasks } = input

const units = {}
for (const id of waves.flat()) {
  const t = tasks[id]
  units[id] = { id, title: t.title, area: t.area, status: 'pending', tiers: [], attempts: 0, rounds: [], commit: null, reason: null, question: null, patch: null }
}
const agents = { total: 0, byRole: {}, byModel: {} }
// The supervisors' shared memory: the latest rulings of each area.
const rulings = {}
// Merges and closes run one at a time, in the order they are asked for.
let queue = Promise.resolve()

// --- agents ----------------------------------------------------------------------------------

const quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`
const list = (files) => (files && files.length ? files.join(', ') : 'unknown files')
const message = (err) => (err && err.message ? err.message : String(err))

// One agent call. A rejection counts as a failed agent, like a null result.
async function call(role, model, prompt, { phase, label, schema }) {
  agents.total++
  agents.byRole[role] = (agents.byRole[role] || 0) + 1
  agents.byModel[model] = (agents.byModel[model] || 0) + 1
  try {
    return await agent(prompt, { agentType: `aether:${role}`, model, phase, label, schema })
  } catch (err) {
    log(`${label}: the agent failed: ${message(err)}`)
    return null
  }
}

function opsPrompt(command) {
  return [
    'Run this command with the Bash tool, once, exactly as written:',
    '',
    `cd ${quote(repoRoot)} && ${command}`,
    '',
    'Then return its exit code and its complete standard output, exactly as printed. Do not run anything else, and do not fix or retry anything.',
  ].join('\n')
}

// Runs one aether-wt command through the ops agent. Returns the JSON the command printed, or
// { error } when the agent, the command or its output failed.
async function ops(command, { phase, label }) {
  const reply = await call('ops', 'haiku', opsPrompt(command), { phase, label, schema: OPS_SCHEMA })
  if (!reply) return { error: 'the ops agent failed' }
  const lines = String(reply.stdout || '').trim().split('\n')
  let out = null
  try {
    out = JSON.parse(lines[lines.length - 1])
  } catch {
    out = null
  }
  if (!out || typeof out !== 'object') return { error: `unreadable output from ${command}: ${String(reply.stdout).slice(0, 300)}` }
  if (out.error) return { error: out.error }
  if (reply.exitCode !== 0) return { error: `${command} exited with ${reply.exitCode}` }
  return out
}

function serialized(task) {
  const next = queue.then(task)
  queue = next.catch(() => {})
  return next
}

// --- prompts ---------------------------------------------------------------------------------

function roundLines(round) {
  const lines = [`- Attempt ${round.attempt} on ${round.tier}: ${round.status}. ${round.summary}`]
  if (round.verdict || round.ruling) lines.push(`  Supervisor: ${round.verdict ? `${round.verdict}. ` : ''}${round.ruling}`)
  if (round.guidance) lines.push(`  The next attempt must: ${round.guidance}`)
  for (const f of round.findings) lines.push(`  [${f.severity}] ${f.title} (${f.file}): ${f.evidence}`)
  if (round.merge) lines.push(`  Merge: ${round.merge}`)
  return lines
}

function implementerPrompt(unit, task, tier, context) {
  const lines = [
    `You are implementing ${unit.id}: ${task.title}.`,
    `Run ${runId}, attempt ${unit.attempts}, on ${tier}.`,
    '',
    `Brief: ${task.brief}`,
    'Read the brief first. It holds the task text from the plan: the files you own, the interfaces, the tests to write first, and the acceptance.',
    '',
    '## Workspace',
    `1. From ${repoRoot}, run \`aether-wt ensure ${runId} ${unit.id}\`. It prints JSON whose "path" is your unit worktree, on branch aether/${runId}/${unit.id}.`,
    '2. Work only inside that worktree. Temporary files go in its .aether-tmp/ folder.',
    `3. The project's test command is \`${testCommand}\`. Run it in the worktree before you commit.`,
    `4. When you are done, commit in the worktree, then run \`aether-wt diff ${runId} ${unit.id}\` from ${repoRoot} so the supervisor can review your diff. Report the commit your branch ends on as "head".`,
  ]
  if (unit.rounds.length) {
    lines.push('', '## Earlier attempts', 'The worktree keeps the work of earlier attempts. Continue from it unless the findings say otherwise.')
    for (const round of unit.rounds) lines.push(...roundLines(round))
  }
  if (context) lines.push('', ...context)
  return lines.join('\n')
}

function supervisorPrompt(unit, task, tier, report, used) {
  const lines = [
    `You supervise ${unit.id}: ${task.title} (area ${task.area}), run ${runId}. Attempt ${unit.attempts} ran on ${tier}.`,
    '',
    `Brief: ${task.brief}`,
    `Review package: ${runDir}/packages/${unit.id}.diff`,
    `Unit worktree: ${repoRoot}/.aether/worktrees/${runId}/${unit.id}`,
    `Owns: ${task.owns.join(', ')}`,
    '',
    '## The implementer reported (unverified claims)',
    `- status: ${report.status}`,
    `- head: ${report.head || '(none)'}`,
    `- summary: ${report.summary}`,
    `- tests: ${report.tests}`,
  ]
  if (report.concerns) lines.push(`- concerns: ${report.concerns}`)
  if (report.question) lines.push(`- question: ${report.question}`)
  const earlier = unit.rounds.slice(0, -1)
  if (earlier.length) {
    lines.push('', '## Earlier attempts')
    for (const round of earlier) lines.push(...roundLines(round))
  }
  const memory = rulings[task.area] || []
  if (memory.length) lines.push('', `## Earlier rulings in area ${task.area}`, ...memory.map((r) => `- ${r}`))
  lines.push(
    '',
    '## Ladder',
    `Attempts used: ${TIERS.map((t) => `${t} ${used[t]}/${ladder[t]}`).join(', ')}.`,
    `A retry stays on ${tier} while it has attempts left, then moves up. Escalate moves up now.`,
  )
  return lines.join('\n')
}

function reviewerPrompt(pkg) {
  const lines = [
    `Final review of run ${runId} on ${integration.branch}.`,
    '',
    `Review package: ${pkg.path} (base ${pkg.base}, head ${pkg.head}). It holds the commits, stat and diff of everything the run merged.`,
    `Integration worktree: ${integration.worktree}`,
  ]
  if (input.plan) lines.push(`Plan: ${input.plan}`)
  if (input.spec) lines.push(`Spec: ${input.spec} (in the integration worktree)`)
  lines.push('', '## Units')
  for (const u of Object.values(units)) {
    lines.push(`- ${u.id} (${u.title}): ${u.status}${u.tiers.length ? ` on ${u.tiers.join(' → ')}` : ''}${u.reason ? `: ${u.reason}` : ''}`)
  }
  const minors = []
  for (const u of Object.values(units)) {
    if (u.status !== 'merged') continue
    for (const f of u.rounds[u.rounds.length - 1].findings) if (f.severity === 'minor') minors.push(`- ${u.id}: ${f.title} (${f.file})`)
  }
  if (minors.length) lines.push('', '## Minor findings the supervisors deferred', ...minors)
  lines.push(
    '',
    'Only merged units are in the diff. Review them as one change: how the units fit together, the plan and the spec, and what a reasonable person using this software would expect.',
  )
  return lines.join('\n')
}

function describeMerge(out) {
  if (out.error) return `failed: ${out.error}`
  switch (out.reason) {
    case 'conflict':
      return `conflict in ${list(out.files)}`
    case 'tests':
      return `the test command failed after the merge (exit ${out.exitCode}${out.timedOut ? ', timed out' : ''}); the merge was undone`
    case 'ownership':
      return `refused: these files are outside the files the task owns: ${list(out.files)}. Revert those changes`
    case 'empty':
      return `refused: the unit branch has no commits to merge${out.uncommitted ? `; uncommitted files: ${list(out.uncommitted)}. Commit your work` : ''}`
    default:
      return `refused: ${out.detail || out.reason}`
  }
}

// What the one retry after a merge conflict or a failing merge needs to know.
function mergeContext(out) {
  const lines = [`## The merge into ${integration.branch} failed: ${describeMerge(out)}`]
  if (out.reason === 'conflict') {
    lines.push(String(out.detail || '').slice(0, 2000))
    lines.push(`Merge ${integration.branch} into your branch inside the worktree, resolve the conflicts so both sides keep their intent, run the test command, and commit.`)
  } else {
    lines.push('Test output, last part:', String(out.output || '').slice(-2000))
    lines.push(`Merge ${integration.branch} into your branch inside the worktree, reproduce the failure with the test command, fix it, and commit.`)
  }
  return lines
}

// --- units -----------------------------------------------------------------------------------

function nextTier(tier) {
  return TIERS.slice(TIERS.indexOf(tier) + 1).find((t) => ladder[t] > 0) || null
}

function finish(unit, status, reason = null, question = null) {
  unit.status = status
  unit.reason = reason
  unit.question = question || null
  log(`${unit.id}: ${status}${reason ? ` (${reason})` : ''}`)
}

function remember(area, line) {
  rulings[area] = [...(rulings[area] || []), line].slice(-AREA_MEMORY)
}

// The unit loop. Returns when the unit is merged, blocked, skipped or not run.
async function work(unit, task) {
  const dep = task.dependsOn.find((d) => units[d] && units[d].status !== 'merged')
  if (dep) return finish(unit, 'skipped', `${dep} is ${units[dep].status}`)
  const used = { haiku: 0, sonnet: 0, opus: 0 }
  let tier = task.tier
  let context = null
  // A conflict or a failing merge gets one retry on the same tier, outside the ladder.
  let mergeRetry = false
  let mergeRetried = false
  for (;;) {
    if (!mergeRetry && used[tier] >= ladder[tier]) {
      const next = nextTier(tier)
      if (!next) return finish(unit, 'blocked', 'the ladder is spent')
      log(`${unit.id}: escalating from ${tier} to ${next}`)
      tier = next
    }
    if (agents.total >= maxAgents) return finish(unit, 'not-run', 'the agent budget is spent')
    if (!mergeRetry) used[tier]++
    mergeRetry = false
    unit.attempts++
    if (unit.tiers[unit.tiers.length - 1] !== tier) unit.tiers.push(tier)
    const n = unit.attempts

    const report = await call('implementer', tier, implementerPrompt(unit, task, tier, context), {
      phase: 'Implement',
      label: `${unit.id}: implement on ${tier} (attempt ${n})`,
      schema: IMPLEMENTER_SCHEMA,
    })
    context = null
    const round = {
      attempt: n,
      tier,
      status: report ? report.status : 'FAILED',
      summary: report ? report.summary : 'The implementer agent failed.',
      head: report ? report.head : '',
      tests: report ? report.tests : '',
      concerns: report ? report.concerns : '',
      question: report ? report.question : '',
      verdict: null,
      findings: [],
      ruling: '',
      guidance: '',
      merge: null,
    }
    unit.rounds.push(round)
    if (!report) continue

    const review = await call('supervisor', 'sonnet', supervisorPrompt(unit, task, tier, report, used), {
      phase: 'Supervise',
      label: `${unit.id}: supervise attempt ${n}`,
      schema: SUPERVISOR_SCHEMA,
    })
    if (!review) {
      round.ruling = 'The supervisor agent failed.'
      continue
    }
    round.findings = review.findings || []
    round.ruling = review.ruling || ''
    round.guidance = review.guidance || ''
    round.verdict = review.verdict
    // An approval is only as good as its findings.
    if (round.verdict === 'approve' && round.findings.some((f) => BLOCKING.includes(f.severity))) round.verdict = 'retry'
    remember(task.area, `${unit.id} attempt ${n}: ${round.verdict}. ${round.ruling}`)

    if (round.verdict === 'block') return finish(unit, 'blocked', round.ruling, review.question || report.question)
    if (round.verdict === 'escalate') {
      const next = nextTier(tier)
      if (!next) return finish(unit, 'blocked', 'the ladder is spent')
      log(`${unit.id}: escalating from ${tier} to ${next}`)
      tier = next
      continue
    }
    if (round.verdict !== 'approve') continue

    const out = await serialized(() => ops(`aether-wt merge ${runId} ${unit.id}`, { phase: 'Merge', label: `${unit.id}: merge` }))
    if (out.merged) {
      unit.commit = out.commit
      return finish(unit, 'merged')
    }
    round.merge = describeMerge(out)
    if (out.error) return finish(unit, 'blocked', `merge ${round.merge}`)
    if (out.reason === 'conflict' || out.reason === 'tests') {
      if (mergeRetried) return finish(unit, 'blocked', `merge failed again: ${round.merge}`)
      mergeRetried = true
      mergeRetry = true
      context = mergeContext(out)
      continue
    }
    // Changes outside Owns, or nothing committed: the attempt failed, and the ladder decides.
    if (out.reason === 'ownership' || out.reason === 'empty') continue
    return finish(unit, 'blocked', `merge ${round.merge}`)
  }
}

// Removes the unit's worktree and branch. aether-wt keeps unmerged work as a patch first.
async function close(unit) {
  const command = `aether-wt remove ${runId} ${unit.id}`
  let out = await serialized(() => ops(command, { phase: 'Merge', label: `${unit.id}: close` }))
  if (out.error) out = await serialized(() => ops(command, { phase: 'Merge', label: `${unit.id}: close again` }))
  if (out.error) unit.closeError = out.error
  else unit.patch = out.patch || null
}

async function runUnit(id) {
  const unit = units[id]
  try {
    await work(unit, tasks[id])
  } catch (err) {
    finish(unit, 'blocked', `internal error: ${message(err)}`)
  }
  if (unit.attempts > 0) await close(unit)
}

async function reviewRun() {
  if (!Object.values(units).some((u) => u.status === 'merged')) return { status: 'skipped', reason: 'no unit merged' }
  if (agents.total >= maxAgents) return { status: 'skipped', reason: 'the agent budget is spent' }
  const pkg = await ops(`aether-wt diff ${runId} --final`, { phase: 'Final review', label: 'final review: package' })
  if (pkg.error) return { status: 'failed', reason: `package: ${pkg.error}` }
  const review = await call('reviewer', 'opus', reviewerPrompt(pkg), { phase: 'Final review', label: 'final review', schema: REVIEW_SCHEMA })
  if (!review) return { status: 'failed', reason: 'the reviewer agent failed' }
  return { status: 'done', ...review }
}

// --- run -------------------------------------------------------------------------------------

let finalReview = null
let cleanup = null
let error = null
try {
  for (const wave of waves) await parallel(wave.map((id) => () => runUnit(id)))
  finalReview = await reviewRun()
} catch (err) {
  error = message(err)
} finally {
  const command = `aether-wt sweep --run ${runId}`
  cleanup = await ops(command, { phase: 'Cleanup', label: 'cleanup' })
  if (cleanup.error) cleanup = await ops(command, { phase: 'Cleanup', label: 'cleanup again' })
}

return { runId, units: Object.values(units), finalReview, cleanup, agents, error }
