'use strict'

// The replay of the delegate router (C11): what the decider would have chosen for the delegations the Lead really
// made, against what the Lead chose and what each cost. The corpus is read from Claude Code's own transcripts
// (`<projectsDir>/<project>/<session>.jsonl` and the `subagents/` folder next to it); a prompt that looks like it
// holds a secret is never kept, never sent to a decider and never written to the report.
//
// `replay` asks `answersFor` for each row (the paid path, or a stub); `replayJournal` decides again the answers the
// router already recorded, with the criterion in force, and calls nobody. Both decide as the router does: the reference
// rung, the floor and the Claude rung of the decided level come from router-reference.js, the router's own functions,
// and the floor is what the Lead asked for in the call, never the model that happened to run it.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadPrices, ratesFor, priceEntry } = require('./prices.js')
const { decide, axisOf } = require('./router-criterion.js')
const { askedOf, stanceOf, claudeRungAt, aliasOf: rungAliasOf } = require('./router-reference.js')
const { createDecider, runHttp, DeciderError } = require('./router-deciders.js')

const ALIASES = ['haiku', 'sonnet', 'opus']
// The floor of a call whose reference rung the table does not measure (the router itself would fail on it).
const FALLBACK_FLOOR = 'D'
// The limit of one `claude -p` process of the paid replay, in seconds: a process starts, logs in and answers, which is
// not the in-session call the `deadlines` option limits.
const DEFAULT_TIMEOUT_S = 60
const MAX_TIMEOUT_S = 300
// The router never routes an agent of the plugin (the mod passes `aether:*` through untouched).
const AETHER_AGENT_PREFIX = 'aether:'

// Patterns of what must never leave the machine (the evidence extractor's list).
const SECRET = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,
  /(api[_-]?key|secret|passw(or)?d|token|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-/+=]{16,}/i,
  /postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/i,
]

// ---- the corpus ----

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n')
  } catch {
    return []
  }
}

// The requests of one subagent transcript, priced as an agent's: { model, cost, turns, reqs }. Claude Code writes one
// line per content block of a message and repeats the message's usage on every one, so a request is counted once, by
// its message id and request id, with the usage of its last line (the one that holds the final output tokens). A
// line with neither id is a request of its own.
function costOf(file, prices) {
  const requests = new Map()
  let anonymous = 0
  for (const line of readLines(file)) {
    if (!line.includes('"usage"')) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const message = entry && entry.message
    if (entry.type !== 'assistant' || !message || !message.usage) continue
    const key = message.id || entry.requestId ? `${entry.requestId || ''}|${message.id || ''}` : `line|${anonymous++}`
    requests.set(key, message)
  }
  let cost = 0
  let model = null
  const reqs = []
  for (const message of requests.values()) {
    const usage = message.usage
    const creation = usage.cache_creation || {}
    const input = usage.input_tokens || 0
    const output = usage.output_tokens || 0
    const cacheRead = usage.cache_read_input_tokens || 0
    const w5 = creation.ephemeral_5m_input_tokens || 0
    const w1 = creation.ephemeral_1h_input_tokens || 0
    const usd = priceEntry({ model: message.model, input, output, cacheRead, cacheWrite: w5 + w1, agent: 'x' }, prices)
    if (usd === null) continue
    model = message.model
    cost += usd
    reqs.push([input, output, cacheRead, w5, w1])
  }
  return { model, cost, turns: reqs.length, reqs }
}

// tool_use id -> { jsonl, meta }, from the meta.json files of each session's subagents folder.
function subagentsOf(projectDir) {
  const subs = {}
  let sessions
  try {
    sessions = fs.readdirSync(projectDir)
  } catch {
    return subs
  }
  for (const session of sessions) {
    const dir = path.join(projectDir, session, 'subagents')
    let files
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.meta.json'))
    } catch {
      continue
    }
    for (const file of files) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
        if (meta && meta.toolUseId) subs[meta.toolUseId] = { jsonl: path.join(dir, file.replace(/\.meta\.json$/, '.jsonl')), meta }
      } catch {
        // an unreadable meta file is a subagent we know nothing about
      }
    }
  }
  return subs
}

function extractCorpus({ projectsDir, projects = null, prices = loadPrices() }) {
  const rows = []
  const seen = new Set()
  for (const project of fs.readdirSync(projectsDir).sort()) {
    if (project.startsWith('-tmp-')) continue
    if (projects && !projects.some((name) => project.includes(name))) continue
    const dir = path.join(projectsDir, project)
    let names
    try {
      names = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()
    } catch {
      continue
    }
    const subs = subagentsOf(dir)
    for (const name of names) {
      for (const line of readLines(path.join(dir, name))) {
        if (!line.includes('"name":"Agent"') && !line.includes('"name":"Task"')) continue
        let entry
        try {
          entry = JSON.parse(line)
        } catch {
          continue
        }
        if (entry.type !== 'assistant') continue
        for (const block of (entry.message && entry.message.content) || []) {
          if (block.type !== 'tool_use' || (block.name !== 'Agent' && block.name !== 'Task') || seen.has(block.id)) continue
          seen.add(block.id)
          const input = block.input || {}
          const prompt = String(input.prompt || '')
          const secret = SECRET.some((re) => re.test(prompt))
          const sub = subs[block.id]
          let actual = null
          if (sub && fs.existsSync(sub.jsonl)) actual = { ...costOf(sub.jsonl, prices), agentType: sub.meta.agentType }
          rows.push({
            id: block.id,
            project,
            session: name.replace(/\.jsonl$/, ''),
            ts: entry.timestamp,
            description: input.description || '',
            subagentType: input.subagent_type || 'general-purpose',
            modelParam: input.model || null,
            effortParam: input.effort || null,
            bg: Boolean(input.run_in_background),
            promptChars: prompt.length,
            secret,
            prompt: secret ? null : prompt,
            actual,
          })
        }
      }
    }
  }
  return rows
}

// ---- the paid path ----

function failureOf(error) {
  if (error instanceof DeciderError) return { failure: error.code }
  if (error && (error.killed || error.code === 'ETIMEDOUT')) return { failure: 'timeout' }
  return { failure: 'exec' }
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// The limit of one `claude -p` process in ms, from the `--timeout` flag in seconds: the default when there is none, and
// null for a value that is not a number above 0 and at most MAX_TIMEOUT_S.
function parseTimeout(value) {
  if (value === undefined) return DEFAULT_TIMEOUT_S * 1000
  const text = String(value).trim()
  const seconds = /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN
  return seconds > 0 && seconds <= MAX_TIMEOUT_S ? Math.round(seconds * 1000) : null
}

// The flags that make `claude -p` the bare request the mod's Haiku decider sends: no tools, no customizations (CLAUDE.md,
// settings, hooks, plugins, skills, MCP, memory), no session on disk and a one-line system prompt. `--bare` is left out
// on purpose: it reads only ANTHROPIC_API_KEY, never the owner's login.
const HAIKU_FLAGS = [
  '--tools', '',
  '--safe-mode',
  '--strict-mcp-config',
  '--disable-slash-commands',
  '--no-session-persistence',
  '--system-prompt', 'Reply to the message.',
]

// The brief goes on stdin (argv has a limit), from a fresh empty directory that is removed afterwards. `deps.execFile`
// is `promisify(execFile)` or a stub of its shape: the promise carries the `child` whose stdin is written.
async function askHaiku(decider, task, criterion, deps) {
  const descriptor = decider.request(task, criterion, { timeoutMs: deps.timeoutMs })
  const args = ['-p', '--model', descriptor.model, '--effort', descriptor.effort, '--output-format', 'json', ...HAIKU_FLAGS]
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-replay-'))
  let stdout
  try {
    const pending = deps.execFile('claude', args, { cwd, timeout: descriptor.timeoutMs, env: deps.env || process.env, maxBuffer: 10 * 1024 * 1024 })
    const stdin = pending && pending.child && pending.child.stdin
    if (!stdin) throw new TypeError('deps.execFile must give back the child process, to write the prompt on its stdin')
    stdin.on('error', () => {
      // a child that exits before reading its stdin fails the call itself
    })
    stdin.end(descriptor.prompt)
    ;({ stdout } = await pending)
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
  let reply
  try {
    reply = JSON.parse(stdout)
  } catch {
    throw new DeciderError('unreadable', 'claude -p did not give JSON')
  }
  if (reply === null || typeof reply !== 'object') throw new DeciderError('unreadable', 'claude -p did not give JSON')
  // What the call took and cost, as the CLI measured it, is told before the answer is read: a call whose answer cannot
  // be read was made and paid for all the same.
  const call = { durationMs: finiteOrNull(reply.duration_ms), costUsd: finiteOrNull(reply.total_cost_usd) }
  if (typeof deps.onCall === 'function' && (call.durationMs !== null || call.costUsd !== null)) deps.onCall(call)
  if (typeof reply.result !== 'string') throw new DeciderError('unreadable', 'claude -p gave no result')
  return decider.parse(reply.result, criterion).answers
}

async function askJev(decider, task, criterion, deps) {
  const descriptor = decider.request(task, criterion, { timeoutMs: deps.timeoutMs })
  const text = await runHttp(descriptor, { fetch: deps.fetch })
  return decider.parse(text, criterion).answers
}

// The answers of one decider to one task, or { failure: <code> }. It spends money: only a caller that asked for it uses it.
// `deps.onCall`, when given, is told { durationMs, costUsd } of a `claude -p` call (null for a figure it did not report).
async function askDecider({ decider, task, criterion, deps = {} }) {
  try {
    const instance = createDecider(decider, { env: deps.env || process.env, dataDir: deps.dataDir })
    return instance.transport === 'complete'
      ? await askHaiku(instance, task, criterion, deps)
      : await askJev(instance, task, criterion, deps)
  } catch (error) {
    if (error instanceof TypeError) throw error
    return failureOf(error)
  }
}

// ---- the replay ----

function aliasOf(prices, model) {
  if (typeof model !== 'string' || !model) return null
  if (ALIASES.includes(model)) return model
  const found = ratesFor(prices, model)
  return found && ALIASES.includes(found.family) ? found.family : null
}

// Decides one set of answers for a call, as the router does. `request` is what the Lead asked for in the call, its
// `model` and `effort`, and nothing else: the reference rung is the one it names, or the fallback's. Gives the decision,
// the Claude rung the call runs on, which is also the rung an external delegate falls back to, and the cheapest Claude
// rung of the decided level, both null when no rung reaches the level.
function decideFor({ criterion, rungs, fallback, request, answers }) {
  const axis = axisOf(criterion, answers)
  const asked = askedOf(request, rungs, criterion)
  const { reference, floor } = stanceOf(rungs, { asked, standard: { alias: fallback.alias, effort: fallback.effort }, axis })
  const decided = decide(criterion, answers, { floor: floor || FALLBACK_FLOOR })
  const { claudeRung, sameLevel } = claudeRungAt(rungs, { reference, floor, level: decided.level, axis: decided.axis })
  return { decided, rung: claudeRung, sameLevel }
}

function decisionOf(decided, rung) {
  return {
    level: decided.level,
    axis: decided.axis,
    alias: rung.alias,
    effort: rung.effort,
    reason: decided.reason,
    confidence: decided.confidence,
    flags: decided.flags,
  }
}

function sum(rows, pick) {
  return rows.reduce((total, row) => total + (pick(row) || 0), 0)
}

// What the same requests cost at the decided rung's rates.
function reestimate(prices, reqs, alias) {
  const model = prices.models[alias].ids[0]
  let usd = 0
  for (const [input, output, cacheRead, w5, w1] of reqs) {
    usd += priceEntry({ model, input, output, cacheRead, cacheWrite: w5 + w1, agent: 'x' }, prices) || 0
  }
  return usd
}

function medianOf(sorted) {
  if (sorted.length === 0) return null
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// The nearest-rank percentile of an ascending list.
function percentileOf(sorted, p) {
  return sorted.length === 0 ? null : sorted[Math.ceil(p * sorted.length) - 1]
}

// What the decider's own calls took and cost: how many rows have a call, the median and 90th percentile of their
// duration, and the sum of their cost (null when no call reported one).
function callTotals(rows) {
  const calls = rows.map((row) => row.call).filter(Boolean)
  const durations = calls.map((call) => call.durationMs).filter(Number.isFinite).sort((a, b) => a - b)
  const costs = calls.map((call) => call.costUsd).filter(Number.isFinite)
  return {
    n: calls.length,
    medianMs: medianOf(durations),
    p90Ms: percentileOf(durations, 0.9),
    costUsd: costs.length > 0 ? costs.reduce((total, cost) => total + cost, 0) : null,
  }
}

// `skippedBy` counts the rows that were not decided, by why: 'aether-agent' (the router never routes it), 'secret' (the
// prompt looks like one or is empty) and 'no-answers' (nobody gave answers for it).
function totalsOf(rows, skippedBy) {
  return {
    n: rows.length,
    skipped: Object.values(skippedBy).reduce((total, count) => total + count, 0),
    skippedBy,
    fallback: rows.filter((row) => row.fallback !== null).length,
    changed: rows.filter((row) => row.changed).length,
    leadUsd: sum(rows, (row) => row.lead.usd),
    deciderUsd: sum(rows, (row) => row.estimatedUsd),
    call: callTotals(rows),
  }
}

// `answersFor(row, onCall)` gives the answers for a row, `{ failure }` when the decider failed, or null for a row nobody
// answered; the paid path tells `onCall` what its call took and cost.
async function replay({ rows, criterion, rungs, prices, answersFor, fallback }) {
  const out = []
  const skipped = { 'aether-agent': 0, secret: 0, 'no-answers': 0 }
  for (const row of rows) {
    if (typeof row.subagentType === 'string' && row.subagentType.startsWith(AETHER_AGENT_PREFIX)) {
      skipped['aether-agent'] += 1
      continue
    }
    if (row.secret || !row.prompt) {
      skipped.secret += 1
      continue
    }
    let call = null
    const answers = await answersFor(row, (measure) => {
      call = measure
    })
    if (answers === null || answers === undefined) {
      skipped['no-answers'] += 1
      continue
    }
    // What ran is `lead`, to price and to compare; what the Lead asked for is `request`, the reference of the floor.
    const lead = {
      model: aliasOf(prices, row.modelParam) || aliasOf(prices, row.actual && row.actual.model),
      effort: row.effortParam || criterion.inheritedEffort,
      usd: row.actual ? row.actual.cost : null,
    }
    const base = { id: row.id, description: row.description, lead, call }
    if (answers.failure) {
      out.push({ ...base, decision: null, estimatedUsd: lead.usd, fallback: `decider: ${answers.failure}`, changed: false })
      continue
    }
    const { decided, rung } = decideFor({ criterion, rungs, fallback, request: { model: row.modelParam, effort: row.effortParam }, answers })
    if (decided.flags.incoherent) {
      out.push({ ...base, decision: null, estimatedUsd: lead.usd, fallback: 'decider: incoherent', changed: false })
      continue
    }
    if (!rung) {
      out.push({ ...base, decision: null, estimatedUsd: lead.usd, fallback: 'no rung', changed: false })
      continue
    }
    const same = rung.alias === lead.model && rung.effort === lead.effort
    let estimatedUsd = null
    if (row.actual) estimatedUsd = same ? lead.usd : reestimate(prices, row.actual.reqs, rung.alias)
    out.push({ ...base, decision: decisionOf(decided, rung), estimatedUsd, fallback: null, changed: !same })
  }
  return { rows: out, totals: totalsOf(out, skipped) }
}

// The rescue rung an entry recorded, { alias, effort }, or null.
function rescueOf(rungs, rescue) {
  const alias = rescue && rungAliasOf(rungs, rescue.model)
  return alias ? { alias, effort: rescue.effort } : null
}

// Whether the decision moved from the one the journal recorded. A decision that ran on Claude is compared by its rung.
// The replay has no quota and picks no harness, so one that went to another harness (its `alias` is null) is compared by
// its level and by the Claude rung it falls back to when the entry kept one: the rung the call would run on.
function moved(previous, { decided, rung }) {
  if (previous === null) return false
  if (previous.harness === 'claude') return rung.alias !== previous.alias || rung.effort !== previous.effort
  if (previous.level !== decided.level) return true
  return previous.rescue !== null && (!rung || previous.rescue.alias !== rung.alias || previous.rescue.effort !== rung.effort)
}

// Decides again the answers the journal holds, with the criterion in force. Nobody is called.
function replayJournal({ entries, criterion, rungs, prices, fallback }) {
  const out = []
  const skipped = { 'aether-agent': 0, secret: 0, 'no-answers': 0 }
  for (const entry of entries) {
    if (!entry || entry.kind !== 'decision') continue
    if (!entry.answers) {
      skipped['no-answers'] += 1
      continue
    }
    const requested = entry.requested || null
    const asked = entry.asked || null
    const lead = {
      model: aliasOf(prices, requested && requested.model) || (asked && asked.alias) || null,
      effort: (requested && requested.effort) || (asked && asked.effort) || criterion.inheritedEffort,
      usd: null,
    }
    const recorded = entry.decision || null
    const previous = recorded
      ? { level: recorded.level, alias: recorded.alias, effort: recorded.effort, harness: recorded.harness || 'claude', rescue: rescueOf(rungs, entry.rescue) }
      : null
    const base = { id: entry.id, description: entry.description || '', lead, previous, estimatedUsd: null }
    const request = requested || (asked ? { model: asked.alias, effort: asked.effort } : null)
    const found = decideFor({ criterion, rungs, fallback, request, answers: entry.answers })
    const { decided, rung } = found
    if (decided.flags.incoherent) {
      out.push({ ...base, decision: null, fallback: 'decider: incoherent', changed: false })
      continue
    }
    if (!rung) {
      out.push({ ...base, decision: null, fallback: 'no rung', changed: false })
      continue
    }
    out.push({ ...base, decision: decisionOf(decided, rung), fallback: null, changed: moved(previous, found) })
  }
  return { rows: out, totals: totalsOf(out, skipped) }
}

// ---- the text ----

function usd(value) {
  return typeof value === 'number' ? `$${value.toFixed(4)}` : '$-'
}

function formatReport(report) {
  const lines = report.rows.map((row) => {
    const router = row.decision ? `${row.decision.alias} ${row.decision.effort}` : `(${row.fallback})`
    return `${row.id} ${row.description} | lead ${row.lead.model || '-'} ${row.lead.effort} | router ${router} | ${usd(row.lead.usd)} -> ${usd(row.estimatedUsd)}`
  })
  const { totals } = report
  lines.push(
    `delegations: ${totals.n}`,
    `fallback: ${totals.fallback}`,
    `changed: ${totals.changed}`,
    `lead cost: ${usd(totals.leadUsd)}`,
    `router cost: ${usd(totals.deciderUsd)}`,
  )
  return lines.join('\n')
}

module.exports = { SECRET, extractCorpus, parseTimeout, askDecider, replay, replayJournal, formatReport }
