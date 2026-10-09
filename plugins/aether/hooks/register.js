// Aether usage meter (spec §10). Records every model request of the session (the main session's,
// subagents' and workflow agents') with its tokens and timing, so aether-report can price a run.
// It only observes: a failure here never changes, delays past a write, or blocks a request.
// It also saves each aether-lane payload an ops agent carries to the file its marker names (lanes spec §6.1).
//
// Files: <data dir>/usage/<session>/<n>.json, each { session, part, claudeCode, agents, entries }
// with up to PART_SIZE entries. A reloaded module starts after the parts already on disk.

const PART_SIZE = 1000
const FLUSH_EVERY = 20

const entries = []
// agent id → { type, description }, learned from agent.spawn
const agents = {}
let ready = null
let written = 0
let writing = false
let pending = false

const PAYLOAD_MARKER = /^=== aether-lane payload: (.+) ===$/m
const PAYLOAD_PATH = /\/\.aether\/runs\/\d{8}-\d{6}-[0-9a-f]{4}\/lanes\/(task-\d+-\d+-(implement|supervise)|final-review)\/prompt\.md$/

const tokens = (value) => (Number.isFinite(value) ? value : 0)
const effortOf = (value) => (typeof value === 'string' && value !== '' ? value : null)

async function init($) {
  const session = await $.session.id()
  const home = await $.env.get('HOME')
  const base = (await $.env.get('AETHER_DATA_DIR')) || `${home}/.local/share/aether-plugin`
  const dir = `${base}/usage/${session}`
  let firstPart = 0
  try {
    for (const entry of await $.fs.list(dir)) {
      const m = /^(\d+)\.json$/.exec(entry.name)
      if (m) firstPart = Math.max(firstPart, Number(m[1]) + 1)
    }
  } catch {
    firstPart = 0 // no parts yet
  }
  let claudeCode = null
  try {
    claudeCode = (await $.session.version()).version
  } catch {
    claudeCode = null
  }
  return { session, dir, firstPart, claudeCode }
}

function setup($) {
  if (!ready) ready = init($)
  return ready
}

// Writes the parts that gained entries since the last write.
async function writeParts($) {
  const where = await setup($)
  const total = entries.length
  if (total === written) return
  for (let i = Math.floor(written / PART_SIZE); i <= Math.floor((total - 1) / PART_SIZE); i++) {
    const part = where.firstPart + i
    const body = { session: where.session, part, claudeCode: where.claudeCode, agents, entries: entries.slice(i * PART_SIZE, (i + 1) * PART_SIZE) }
    await $.fs.write(`${where.dir}/${part}.json`, JSON.stringify(body))
  }
  written = total
}

// One write at a time: a hook that finds a write in progress leaves its entries to that write.
async function flush($) {
  if (writing) {
    pending = true
    return
  }
  writing = true
  try {
    do {
      pending = false
      await writeParts($)
    } while (pending)
  } catch {
    // The entries stay in memory, and the next flush writes them.
  } finally {
    writing = false
  }
}

// The payload of an ops prompt and the file its first marker names, or null when the prompt
// carries no marker or the marker names a place a lane does not write.
function lanePayload(e) {
  if (e.subagentType !== 'aether:ops' || typeof e.prompt !== 'string') return null
  const marker = PAYLOAD_MARKER.exec(e.prompt)
  if (!marker) return null
  const path = marker[1]
  if (!path.startsWith('/') || path.split('/').some((segment) => segment === '.' || segment === '..')) return null
  if (!PAYLOAD_PATH.test(path)) return null
  const end = marker.index + marker[0].length
  return { path, payload: e.prompt.slice(e.prompt.charAt(end) === '\n' ? end + 1 : end) }
}

// Writes the payload, then the spawn record beside it. A failure leaves the spawn unchanged.
async function saveLanePayload($, e) {
  try {
    const lane = lanePayload(e)
    if (!lane) return
    await $.fs.write(lane.path, lane.payload)
    const workflow = e.workflow || {}
    const spawn = {
      session: await $.session.id(),
      workflowRunId: workflow.runId ?? null,
      agentIndex: workflow.agentIndex ?? null,
    }
    await $.fs.write(`${lane.path.slice(0, lane.path.lastIndexOf('/'))}/spawn.json`, JSON.stringify(spawn))
  } catch {
    // The lane finds no payload and reports it; the spawn goes on.
  }
}

export function register(on) {
  on('agent.spawn', async ($, e, next) => {
    await saveLanePayload($, e)
    const result = await next(e)
    if (result && result.agentId) agents[result.agentId] = { type: e.subagentType || null, description: e.description || null }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    let started = null
    try {
      started = await $.clock.now()
    } catch {
      started = null
    }
    const result = yield* next(e)
    try {
      const usage = result && result.usage
      if (usage) {
        const ended = await $.clock.now()
        entries.push({
          t: ended,
          ms: started === null ? null : ended - started,
          agent: e.agentId || null,
          model: usage.model || e.model || null,
          effort: effortOf(e.effort),
          input: tokens(usage.input_tokens),
          output: tokens(usage.output_tokens),
          cacheRead: tokens(usage.cache_read_input_tokens),
          cacheWrite: tokens(usage.cache_creation_input_tokens),
        })
        if (entries.length - written >= FLUSH_EVERY) await flush($)
      }
    } catch {
      // Observing only.
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    await flush($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await flush($)
    return next(e)
  })
}
