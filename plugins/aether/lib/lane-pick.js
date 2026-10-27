'use strict'

// The commands that choose and account for a call under superdelegation: `pick` decides which pair takes a call
// (lib/superdelegation.js choose, over the pairs table and the quota views of the enabled harnesses) and logs the
// decision; `took` logs who ran the call and why; `pause` waits, so that the workflow can time its agents without a clock of
// its own. `pick` starts no call: it reads the quotas, and renews and
// saves the one reading that nobody else keeps (grok's), because each `aether-lane pick` is a process of its own.

const fs = require('node:fs')
const path = require('node:path')
const lanes = require('./lanes.js')
const run = require('./run.js')
const quota = require('./lane-quota.js')
const calls = require('./lane-calls.js')
const pairs = require('./pairs.js')
const { choose } = require('./superdelegation.js')
const { peekReadings, staleHarnesses, readingFile } = require('./router-quota.js')
const { createAdapter: defaultCreateAdapter } = require('./harness/index.js')

const CALL = /^(task-\d+-\d+-(implement|supervise|supervisor|reviewer)|final-review(-slice-\d+)?)$/
const ROLES = ['implementer', 'supervisor', 'reviewer']
const MODELS = pairs.NATIVE_MODELS
const PAIR_ID = /^[a-z][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*@(low|medium|high|xhigh|max)$/
const FAMILY = /^[a-z][a-z0-9.-]*$/
const BY = /^(native|[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._-]*)$/
const CAUSES = ['chosen', 'no-candidate', 'failed']
const SECONDS = /^\d{1,3}$/
const MAX_PAUSE_SECONDS = 120
// The harnesses whose reading is renewed by a refresher (lane-quota.js REFRESHERS): their readings are the ones a
// process cannot find again in the harness's own record.
const REFRESHABLE = ['grok']

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// The Vista de cuotas of the enabled harnesses of the table: what choose reads as `harnesses`.
function harnessViews(config, enabled, { dataDir = run.dataDir(), now = Date.now(), latest = {}, onRead = null } = {}) {
  const views = {}
  for (const name of enabled) {
    if (!Object.hasOwn(config.harnesses, name)) continue
    views[name] = quota.harnessView(name, config.harnesses[name], { reserve: config.reserve, now, dataDir, fresh: false, latest: latest[name] ?? null, onRead })
  }
  return views
}

let writeCounter = 0

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.${++writeCounter}.tmp`
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(value)}\n`)
    fs.renameSync(tmp, file)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

// The reading harnessView takes as `latest` for each enabled harness that has a refresher: the one a process left in
// the readings file of the quota module or the harness's own record while it is within its life, else a new one, saved where the quota module
// reads it so that no other pick (nor design round) renews it again within quotaLifeMinutes. Never throws: a
// reading that does not arrive leaves its harness without `latest`.
async function latestReadings(config, enabled, { dataDir = run.dataDir(), now = Date.now(), createAdapter = defaultCreateAdapter, refreshStale = quota.refreshStale } = {}) {
  const latest = {}
  try {
    const refreshable = enabled.filter((name) => REFRESHABLE.includes(name) && Object.hasOwn(config.harnesses, name))
    const readings = peekReadings({ dataDir, config, harnesses: refreshable, now, createAdapter })
    const stale = staleHarnesses({ readings, config, harnesses: refreshable, now })
    for (const name of refreshable) {
      const first = Object.values(readings[name]?.groups ?? {})[0]
      if (!stale.includes(name) && isObject(first)) latest[name] = first
    }
    if (stale.length === 0) return latest
    const done = await refreshStale({ config, enabled: stale, dataDir, now: () => now })
    for (const name of stale) {
      const reading = done?.[name]?.reading
      if (!isObject(reading)) continue
      latest[name] = reading
      try {
        const groups = Object.fromEntries(Object.keys(config.harnesses[name].groups ?? {}).map((key) => [key, { ...reading }]))
        writeAtomic(readingFile(dataDir, name), { readAt: now, groups })
      } catch {
        // A reading that is not saved is used by this pick only; the next one renews it.
      }
    }
  } catch {
    // A harness whose reading cannot be had stays without `latest`.
  }
  return latest
}

function oneOf(value, allowed, flag) {
  if (!allowed.includes(value)) throw new Error(`--${flag} must be one of ${allowed.join(', ')}, not ${value}`)
  return value
}

function checkCall(call) {
  if (!CALL.test(String(call))) throw new Error(`invalid call: ${call}`)
}

function checkFlags(flags, allowed) {
  for (const name of Object.keys(flags)) {
    if (!allowed.includes(name)) throw new Error(`unknown flag --${name}`)
  }
}

function excludeList(value) {
  if (value === undefined) return []
  const ids = String(value).split(',')
  const bad = ids.find((id) => !PAIR_ID.test(id))
  if (bad !== undefined) throw new Error(`--exclude must be pair ids like agy/model@effort, not ${JSON.stringify(bad)}`)
  return ids
}

function authorList(value) {
  if (value === undefined) return []
  if (!FAMILY.test(String(value))) throw new Error(`--author must be a model family, not ${JSON.stringify(value)}`)
  return [value]
}

function loadTable() {
  const file = lanes.configPath()
  const config = lanes.loadConfig(file)
  if (!config) throw new Error(`no lane table: ${file}`)
  return config
}

const pickedOf = (pair) => pair && {
  id: pair.id, harness: pair.harness, model: pair.model, effort: pair.effort, group: pair.group, family: pair.family, intelligence: pair.intelligence, costPerTaskUsd: pair.costPerTaskUsd,
}

// Decides the pair for one call and logs the decision. Starts nothing.
async function pickCommand(cwd, runId, call, flags, { now = Date.now() } = {}) {
  run.assertRunId(runId)
  checkCall(call)
  checkFlags(flags, ['role', 'model', 'effort', 'exclude', 'author'])
  const role = oneOf(flags.role, ROLES, 'role')
  const model = oneOf(flags.model, MODELS, 'model')
  const effort = oneOf(flags.effort, pairs.EFFORTS, 'effort')
  const exclude = excludeList(flags.exclude)
  const authors = authorList(flags.author)

  const config = loadTable()
  const table = pairs.loadPairs().pairs
  const enabled = calls.enabledFor(cwd, runId)
  const dataDir = run.dataDir()
  const latest = await latestReadings(config, enabled, { dataDir, now })
  const harnesses = harnessViews(config, enabled, { dataDir, now, latest })
  const decision = choose({ pairs: table, reference: { model, effort }, harnesses, exclude, authors, nativeDiffers: role !== 'implementer', role, lanes: config })

  lanes.appendLog(dataDir, null, {
    kind: 'choice',
    time: now,
    session: null,
    run: runId,
    design: null,
    call,
    role,
    requested: decision.requested,
    reference: decision.reference,
    picked: pickedOf(decision.picked),
    native: decision.native,
    reason: decision.reason,
    candidates: decision.candidates.map(({ id, outcome, why }) => ({ id, outcome, why })),
  })
  return { ...decision, call, role }
}

// Logs who ran a call and why.
function tookCommand(cwd, runId, call, flags, { now = Date.now() } = {}) {
  run.assertRunId(runId)
  checkCall(call)
  checkFlags(flags, ['by', 'cause'])
  if (typeof flags.by !== 'string' || !BY.test(flags.by)) throw new Error(`--by must be native or <harness>:<model>, not ${JSON.stringify(flags.by)}`)
  const cause = oneOf(flags.cause, CAUSES, 'cause')
  lanes.appendLog(run.dataDir(), null, { kind: 'took', time: now, session: null, run: runId, call, by: flags.by, cause })
  return { logged: true }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Waits `seconds`, a whole number from 1 to 120.
async function pauseCommand(seconds, { sleep = wait } = {}) {
  const text = String(seconds)
  const count = SECONDS.test(text) ? Number(text) : NaN
  if (!(count >= 1 && count <= MAX_PAUSE_SECONDS)) throw new Error(`--seconds must be a whole number from 1 to ${MAX_PAUSE_SECONDS}, not ${JSON.stringify(seconds)}`)
  await sleep(count * 1000)
  return { paused: count }
}

module.exports = { harnessViews, latestReadings, pickCommand, tookCommand, pauseCommand, CALL }
