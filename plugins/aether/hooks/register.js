// Aether usage meter (spec §10). Records every model request of an Aether session (the main session's,
// subagents' and workflow agents') with its tokens and timing, so aether-report can price a run.
// It only observes: a failure here never changes, delays past a write, or blocks a request.
// It also saves each aether-lane payload an ops agent carries to the file its marker names (lanes spec §6.1).
//
// Only an Aether session is metered (installable spec R9): one whose Lead started it (classic.SessionStart
// with agent_type aether:lead), or one that has a marker <data dir>/sessions/<session>.json, which only
// aether-session-start writes. In any other session the meter records and writes nothing, and the agents
// of the aether plugin are not offered.
//
// Files: <data dir>/usage/<session>/<n>.json, each { session, part, claudeCode, agents, entries }
// with up to PART_SIZE entries. A reloaded module starts after the parts already on disk.

const PART_SIZE = 1000
const FLUSH_EVERY = 20
const LEAD = 'aether:lead'
const SESSION_ID = /^[A-Za-z0-9-]+$/

// session id → { id, aether, dataDir, ready, entries, agents, written, writing, pending }
const sessions = new Map()

const PAYLOAD_MARKER = /^=== aether-lane payload: (.+) ===$/m
const PAYLOAD_PATH = /\/\.aether\/runs\/\d{8}-\d{6}-[0-9a-f]{4}\/lanes\/(task-\d+-\d+-(implement|supervise)|final-review)\/prompt\.md$/

const tokens = (value) => (Number.isFinite(value) ? value : 0)
const effortOf = (value) => (typeof value === 'string' && value !== '' ? value : null)

const asText = (value) => (typeof value === 'string' && value !== '' ? value : null)
const withoutTrailingSlashes = (path) => path.replace(/\/+$/, '')
const dataId = (text) => text.replace(/[^A-Za-z0-9_-]/g, '-')

// The data directory (installable spec R11, R12), from the values the mod can read. Paths are compared
// as given: a mod cannot resolve links.
export function dataDirFrom({ env, root, name }) {
  const given = asText(env && env.AETHER_DATA_DIR)
  if (given) return given
  const cacheDir = asText(env && env.CLAUDE_CODE_PLUGIN_CACHE_DIR)
  const configDir = asText(env && env.CLAUDE_CONFIG_DIR)
  const home = asText(env && env.HOME) || ''
  const pluginsRoot = withoutTrailingSlashes(cacheDir || `${configDir ? withoutTrailingSlashes(configDir) : `${withoutTrailingSlashes(home)}/.claude`}/plugins`)
  const cachePrefix = `${pluginsRoot}/cache/`
  const pluginRoot = typeof root === 'string' ? withoutTrailingSlashes(root) : ''
  if (pluginRoot.startsWith(cachePrefix)) {
    const [marketplace, plugin, version, ...rest] = pluginRoot.slice(cachePrefix.length).split('/')
    const segments = [marketplace, plugin, version]
    if (rest.length === 0 && segments.every((segment) => segment && segment !== '.' && segment !== '..')) {
      return `${pluginsRoot}/data/${dataId(`${plugin}@${marketplace}`)}`
    }
  }
  return `${pluginsRoot}/data/${dataId(`${asText(name) || 'aether'}@inline`)}`
}

// The data directory of this process, read through the mod's own interfaces.
async function readDataDir($) {
  // A failed or refused read counts as unset. Each name is a literal, so the kit can list them.
  const read = async (get) => {
    try {
      return await get
    } catch {
      return undefined
    }
  }
  const env = {
    AETHER_DATA_DIR: await read($.env.get('AETHER_DATA_DIR')),
    CLAUDE_CODE_PLUGIN_CACHE_DIR: await read($.env.get('CLAUDE_CODE_PLUGIN_CACHE_DIR')),
    CLAUDE_CONFIG_DIR: await read($.env.get('CLAUDE_CONFIG_DIR')),
    HOME: await read($.env.get('HOME')),
  }
  let root
  let name
  try {
    root = $.plugin.root
    name = $.plugin.name
  } catch {
    // A missing value counts as undefined.
  }
  return dataDirFrom({ env, root, name })
}

function sessionOf(id) {
  let state = sessions.get(id)
  if (!state) {
    state = { id, aether: undefined, dataDir: null, ready: null, entries: [], agents: {}, written: 0, writing: false, pending: false }
    sessions.set(id, state)
  }
  return state
}

// The session this event belongs to, or null when its id cannot be read or cannot be a marker's name.
async function currentSession($) {
  try {
    const id = await $.session.id()
    return typeof id === 'string' && SESSION_ID.test(id) ? sessionOf(id) : null
  } catch {
    return null
  }
}

// Whether the session is Aether. The first answer is kept for the session; a failed or refused check
// counts as not Aether. A SessionStart from the Lead that arrives meanwhile wins.
async function isAether($, state) {
  if (state.aether !== undefined) return state.aether
  let answer = false
  try {
    state.dataDir ??= readDataDir($)
    answer = (await $.fs.exists(`${await state.dataDir}/sessions/${state.id}.json`)) === true
  } catch {
    answer = false
  }
  if (state.aether === undefined) state.aether = answer
  return state.aether
}

// The session of this event when it is an Aether session, else null.
async function aetherSession($) {
  const state = await currentSession($)
  return state && (await isAether($, state)) ? state : null
}

async function init($, state) {
  state.dataDir ??= readDataDir($)
  const dir = `${await state.dataDir}/usage/${state.id}`
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
  return { dir, firstPart, claudeCode }
}

function setup($, state) {
  if (!state.ready) state.ready = init($, state)
  return state.ready
}

// Writes the parts that gained entries since the last write.
async function writeParts($, state) {
  const where = await setup($, state)
  const total = state.entries.length
  if (total === state.written) return
  for (let i = Math.floor(state.written / PART_SIZE); i <= Math.floor((total - 1) / PART_SIZE); i++) {
    const part = where.firstPart + i
    const body = { session: state.id, part, claudeCode: where.claudeCode, agents: state.agents, entries: state.entries.slice(i * PART_SIZE, (i + 1) * PART_SIZE) }
    await $.fs.write(`${where.dir}/${part}.json`, JSON.stringify(body))
  }
  state.written = total
}

// One write at a time: a hook that finds a write in progress leaves its entries to that write.
async function flush($, state) {
  if (state.writing) {
    state.pending = true
    return
  }
  state.writing = true
  try {
    do {
      state.pending = false
      await writeParts($, state)
    } while (state.pending)
  } catch {
    // The entries stay in memory, and the next flush writes them.
  } finally {
    state.writing = false
  }
}

// Writes what every Aether session still holds.
async function flushAll($) {
  for (const state of sessions.values()) {
    if (state.aether === true) await flush($, state)
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
async function saveLanePayload($, e, session) {
  try {
    const lane = lanePayload(e)
    if (!lane) return
    await $.fs.write(lane.path, lane.payload)
    const workflow = e.workflow || {}
    const spawn = {
      session,
      workflowRunId: workflow.runId ?? null,
      agentIndex: workflow.agentIndex ?? null,
    }
    await $.fs.write(`${lane.path.slice(0, lane.path.lastIndexOf('/'))}/spawn.json`, JSON.stringify(spawn))
  } catch {
    // The lane finds no payload and reports it; the spawn goes on.
  }
}

export function register(on) {
  on('classic.SessionStart', async ($, e, next) => {
    if (e && e.agent_type === LEAD && typeof e.session_id === 'string' && SESSION_ID.test(e.session_id)) {
      sessionOf(e.session_id).aether = true
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.offer', async ($, e, next) => {
    if (e.agent === LEAD) return { isOffered: false }
    if (typeof e.agent === 'string' && e.agent.startsWith('aether:') && !(await aetherSession($))) return { isOffered: false }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const state = await aetherSession($)
    if (!state) return next(e)
    await saveLanePayload($, e, state.id)
    const result = await next(e)
    if (result && result.agentId) state.agents[result.agentId] = { type: e.subagentType || null, description: e.description || null }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const state = await aetherSession($)
    if (!state) return yield* next(e)
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
        state.entries.push({
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
        if (state.entries.length - state.written >= FLUSH_EVERY) await flush($, state)
      }
    } catch {
      // Observing only.
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    await flushAll($)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await flushAll($)
    return next(e)
  })
}
