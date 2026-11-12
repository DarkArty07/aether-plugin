'use strict'

// The one view of a quota group that `aether-lane quota` and `aether-lane status` share, and the quota step of a wave.
// Per group: each window's share left, its reset in UTC and local time, the hours to it, the priority (the share left
// per hour to the reset, with at least one hour; lane-order.js's rule), whether it is usable above the table's reserve
// and the live dry mark, and where the reading came from and how old it is. A reading that fails is no reading: each
// group of its harness is unknown, with the error, and nothing else breaks. --refresh first asks grok for a new
// reading, over ACP and then through its UI, and muse for one over a minimal exec call; refreshStale is the same
// step for a wave, which only refreshes what is stale.
// Family: lane.

const { isObject } = require('./common.js')
const lanes = require('./lanes.js')
const order = require('./lane-order.js')
const { pickData, groupView, localTime } = require('./pick-data.js')
const readings = require('./lane-readings.js')
const run = require('./run.js')
const { createAdapter } = require('./harness/index.js')
const { STALE_MS, TIMEOUT_MS, refreshGrokQuota } = require('./harness/grok-quota.js')
const { TIMEOUT_MS: MUSE_TIMEOUT_MS, refreshMuseQuota } = require('./harness/muse-quota.js')

const USAGE = 'quota [<harness>...] [--refresh] [--json]'
const MINUTE_MS = 60 * 1000

// The harnesses whose reading --refresh and a wave's quota step renew, each with what renews it: a function of the
// harness's table entry that gives the new reading, or null when there is none.
const REFRESHERS = {
  grok: (settings) => refreshGrokQuota({ command: settings.command }),
  muse: (settings) => refreshMuseQuota({ command: settings.command }),
}

function parseArgs(args) {
  const out = { names: [], refresh: false, json: false }
  for (const arg of args) {
    if (arg === '--refresh') out.refresh = true
    else if (arg === '--json') out.json = true
    else if (arg.startsWith('-')) throw new Error(`usage: aether-lane ${USAGE}`)
    else if (!out.names.includes(arg)) out.names.push(arg)
  }
  return out
}

function utcTime(ms) {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

const round = (value, digits) => Number(value.toFixed(digits))

// How long a harness's reading stays fresh: its table entry's quotaLifeMinutes, or 30 minutes.
function lifeMsOf(settings) {
  const minutes = Number.isFinite(settings?.quotaLifeMinutes) ? settings.quotaLifeMinutes : STALE_MS / MINUTE_MS
  return minutes * MINUTE_MS
}

// One harness of the table: whether it is installed, its version, and the view of each group. The reading is the
// kept one when fresh is false and the harness keeps its readings (lane-readings.js), a new one otherwise; latest, a
// reading a refresh just took, is used instead of asking the adapter. A reading that fails leaves every group of the
// table's entry unknown, with the error, and the harness with it: it is the harness's error, not the caller's.
// onRead({ groups, readAt }, version) is told of each reading that was taken, as the adapter gave it.
function harnessView(name, settings, { reserve, now, dataDir = run.dataDir(), fresh = true, latest = null, onRead = null, refreshed, refreshMethod, assemble = true }) {
  const found = lanes.commandPath(settings.command)
  const base = { command: settings.command, path: found, installed: found !== null }
  if (refreshed !== undefined) Object.assign(base, { refreshed, refreshMethod: refreshMethod ?? null })
  if (!base.installed) return { ...base, version: null, groups: {} }
  let adapter
  try {
    adapter = createAdapter(name, settings)
  } catch (err) {
    return { ...base, version: null, error: err.message, groups: {} }
  }
  let version = null
  try {
    version = adapter.version()
  } catch {
    // A version that cannot be read is no reason to lose the quota.
  }
  const keys = Object.keys(settings.groups ?? {})
  const life = lifeMsOf(settings)
  let read = null
  let readError = null
  try {
    // A refresh's reading is the plan's one reading, and a plan's groups share it, as a refresher gives it.
    read = latest !== null ? { groups: Object.fromEntries(keys.map((key) => [key, { ...latest }])), readAt: now } : readings.readGroups(adapter, { harness: name, settings, dataDir, now, fresh })
  } catch (err) {
    readError = err.message
  }
  if (onRead !== null && read !== null) {
    try {
      onRead({ groups: read.groups, readAt: read.readAt }, version)
    } catch {
      // Whoever listens may fail without taking the view with it.
    }
  }
  // A seat builds the view itself, from this same reading, so a mark is lifted once.
  if (!assemble) return { ...base, version, reading: read, ...(readError ? { error: readError } : {}) }
  const prepared = pickData({ harnesses: { [name]: settings }, reserve }, name, read, {
    now, dataDir, lifeMs: life, extraGroups: readError === null, groupError: readError ?? undefined, honorLiftResult: true,
  })
  return { ...base, version, ...(readError ? { error: readError } : {}), groups: prepared.groups }
}

// Asks a harness's refresher for a new reading. Never throws: a refresher that throws gave none.
async function refresh(refreshers, name, settings) {
  let reading = null
  try {
    reading = await refreshers[name](settings)
  } catch {
    reading = null
  }
  if (!isObject(reading)) return { reading: null, refreshed: false, method: null }
  return { reading, refreshed: true, method: reading.source?.method ?? 'ui' }
}

// Whether a harness's reading is missing, unknown for some group of its table entry, or older than its life.
function needsRefresh(name, settings, { now, dataDir }) {
  const keys = Object.keys(settings.groups ?? {})
  if (keys.length === 0) return false
  let read
  try {
    read = readings.readGroups(createAdapter(name, settings), { harness: name, settings, dataDir, now, fresh: false })
  } catch {
    return true
  }
  const lifeMs = lifeMsOf(settings)
  return keys.some((key) => {
    const reading = read.groups?.[key]
    if (!isObject(reading) || order.groupView(reading, { reserve: 0, now }).unknown) return true
    const age = reading.source?.ageMinutes
    return typeof age === 'number' && age * MINUTE_MS > lifeMs
  })
}

// The quota step of a wave: refreshes each enabled, installed harness of the table that has a refresher (grok and
// muse today) and whose reading is missing, unknown or older than its life (quotaLifeMinutes, 30 minutes by
// default); a fresh reading is left alone. Only the harnesses it tried are in the answer, each as { refreshed,
// method, reading }, method being 'acp', 'ui', 'exec' or null, and reading the new reading or null: whoever shows
// the view uses it, as quotaReport does, so that an answer grok gave over ACP does not depend on a line in grok's
// log. Never throws. now and dataDir are for tests.
async function refreshStale({ config, enabled, refreshers = REFRESHERS, now = Date.now, dataDir = null }) {
  const done = {}
  for (const name of enabled) {
    try {
      if (!Object.hasOwn(refreshers, name) || !Object.hasOwn(config.harnesses, name)) continue
      const settings = config.harnesses[name]
      if (!lanes.commandInstalled(settings.command)) continue
      if (!needsRefresh(name, settings, { now: now(), dataDir: dataDir ?? run.dataDir() })) continue
      const { reading, refreshed, method } = await refresh(refreshers, name, settings)
      done[name] = { refreshed, method, reading }
    } catch {
      // A harness that cannot be checked is left as it is.
    }
  }
  return done
}

// The report of the harnesses named, or of every installed harness of the table when none is. It reads each harness
// anew (a `quota` is a deliberate reading); with refresh it first asks the harnesses that have a refresher for a
// new reading, and shows that one.
async function quotaReport({ names = [], refresh: refreshFirst = false, now = Date.now, refreshers = REFRESHERS, dataDir = run.dataDir() } = {}) {
  const file = lanes.configPath()
  const config = lanes.loadConfig(file)
  if (!config) throw new Error(`no lane table: ${file}`)
  const listed = names.length > 0 ? names : Object.keys(config.harnesses).filter((name) => lanes.commandInstalled(config.harnesses[name].command))
  const harnesses = {}
  for (const name of listed) {
    if (!Object.hasOwn(config.harnesses, name)) {
      harnesses[name] = { error: `the lane table has no ${name} harness`, groups: {} }
      continue
    }
    const settings = config.harnesses[name]
    let asked = { reading: null, refreshed: undefined, method: undefined }
    if (refreshFirst && Object.hasOwn(refreshers, name) && lanes.commandInstalled(settings.command)) {
      asked = await refresh(refreshers, name, settings)
    }
    harnesses[name] = harnessView(name, settings, {
      reserve: config.reserve,
      now: now(),
      dataDir,
      fresh: true,
      latest: asked.reading,
      refreshed: asked.refreshed,
      refreshMethod: asked.method,
    })
  }
  return { time: new Date(now()).toISOString(), reserve: config.reserve, harnesses }
}

const percent = (fraction) => `${round(fraction * 100, 1)}%`

function sourceLine(source) {
  const age = `${source.ageMinutes} min old`
  const stale = source.stale ? ' (stale: --refresh takes a new one)' : ''
  if ((source.method === undefined || source.method === 'exec') && source.log === undefined) {
    return `source: ${source.command}, read ${source.ageMinutes === 0 ? 'now' : `${source.ageMinutes} min ago`}`
  }
  const where = [source.pid === null ? null : `pid ${source.pid}`, source.version === null ? null : `grok ${source.version}`].filter(Boolean).join(', ')
  if (source.method === 'acp') {
    const absent = source.usedPercentAbsent ? '; the answer has no creditUsagePercent, read as 0% used' : ''
    return `source: grok's answer to _x.ai/billing at ${utcTime(Date.parse(source.ts))}${where ? `, ${where}` : ''}, ${age}${stale}${absent}`
  }
  const absent = source.usedPercentAbsent ? '; the line has no creditUsagePercent, read as 0% used' : ''
  return `source: grok's log ${source.log}, line of ${utcTime(Date.parse(source.ts))}${where ? ` (${where})` : ''}, ${age}${stale}${absent}`
}

function windowLine(name, w) {
  if (w.priority === null) return `${name}: unreadable window`
  const when = w.hoursLeft >= 0 ? `in ${w.hoursLeft} h` : `${-w.hoursLeft} h ago`
  return `${name}: ${percent(w.remaining)} left, resets ${utcTime(Date.parse(w.resetsAt))} (${w.resetsLocal}), ${when}, priority ${w.priority}`
}

// Why a dry mark holds: the minutes a refusal was given, with the reset the refusal stated shown as stated; its reset
// when a reading showed the group under the reserve; or the minutes it was given.
function markReason(mark) {
  const refused = mark.harness === 'muse' ? 'muse refused a call for its subscription quota' : 'agy refused a call for its individual quota'
  if (mark.confirmed && mark.reason === 'quota refusal') return `its reset, after ${refused}`
  if (mark.reason === 'quota refusal') {
    const minutes = Math.round((mark.until - mark.at) / MINUTE_MS)
    const hours = Number.isFinite(mark.statedResetMs) ? Math.round(mark.statedResetMs / 3600000) : null
    const stated = typeof mark.statedResetAt === 'string'
      ? `${mark.harness} stated a reset at ${utcTime(Date.parse(mark.statedResetAt))}, not trusted`
      : hours === null ? 'it stated no reset' : `agy stated a reset in ${hours} h, not trusted`
    return `${minutes} minute${minutes === 1 ? '' : 's'} after ${refused} (${stated})`
  }
  if (mark.confirmed) return 'its reset'
  if (!Number.isFinite(mark.at)) return 'after a call ended for quota'
  const minutes = Math.round((mark.until - mark.at) / MINUTE_MS)
  return `${minutes} minute${minutes === 1 ? '' : 's'} after a call ended for quota`
}

// How the refresh of a harness went: grok's two methods are ACP first, then its UI when ACP gave nothing; muse's
// one method is a minimal exec call.
function refreshLine(h, name) {
  if (name === 'muse') {
    if (!h.refreshed) return `  refresh: no new reading (muse gave none within ${MUSE_TIMEOUT_MS / 1000} s)`
    return '  refresh: muse answered a minimal exec call'
  }
  if (!h.refreshed) return `  refresh: no new reading (grok gave none over ACP, and its UI none within ${TIMEOUT_MS / 1000} s)`
  return h.refreshMethod === 'acp' ? '  refresh: grok answered _x.ai/billing' : "  refresh: grok's UI wrote a new reading"
}

// The report as text for people.
function formatReport(report, { refreshable = Object.keys(REFRESHERS) } = {}) {
  const now = Date.parse(report.time)
  const lines = [`Lane quota at ${utcTime(now)} (${localTime(now)}); reserve ${percent(report.reserve)}`]
  const names = Object.keys(report.harnesses)
  if (names.length === 0) lines.push('', 'No harness of the lane table is installed.')
  for (const name of names) {
    const h = report.harnesses[name]
    lines.push('')
    if (h.command === undefined) {
      lines.push(`${name}: ${h.error}`)
      continue
    }
    if (!h.installed) {
      lines.push(`${name}: not installed (${h.command} was not found on PATH)`)
      continue
    }
    lines.push(`${name} (${[h.version, h.path].filter(Boolean).join(', ')})`)
    if (h.refreshed !== undefined) lines.push(refreshLine(h, name))
    if (h.error) lines.push(`  error: ${h.error}`)
    for (const [key, g] of Object.entries(h.groups)) {
      const label = g.label === null ? key : `${key}, "${g.label}"`
      if (g.mark) {
        lines.push(`  ${label}: not usable, dry mark until ${utcTime(g.mark.until)}, ${markReason(g.mark)}`)
      } else if (g.unknown) {
        const hint = refreshable.includes(name) ? `; --refresh asks ${name} for one` : ''
        lines.push(`  ${label}: unknown, used until a call fails for quota (no reading${hint})`)
        continue
      } else {
        lines.push(`  ${label}: ${g.usable ? 'usable' : 'not usable'}, priority ${g.priority ?? 'none'}`)
      }
      for (const [windowName, w] of Object.entries(g.windows)) lines.push(`    ${windowLine(windowName, w)}`)
      if (g.source) lines.push(`    ${sourceLine(g.source)}`)
    }
  }
  return `${lines.join('\n')}\n`
}

// The command: the report as text, or as JSON with --json.
async function quotaCommand(args, options = {}) {
  const { names, refresh: refreshFirst, json } = parseArgs(args)
  const report = await quotaReport({ ...options, names, refresh: refreshFirst })
  return json ? `${JSON.stringify(report)}\n` : formatReport(report)
}

module.exports = { USAGE, lifeMsOf, quotaCommand, quotaReport, formatReport, localTime, groupView, harnessView, refreshStale }
