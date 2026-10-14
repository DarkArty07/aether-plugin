'use strict'

// `aether-lane quota`: each harness's quota, for whoever needs the figure (the owner, the Lead, a script), with no
// run. Per group: each window's share left, its reset in UTC and local time, the hours to it, the priority (the
// share left per hour to the reset, with at least one hour), whether it is usable above the table's reserve, and
// where the reading came from and how old it is. --refresh first takes a new grok reading by opening grok's UI.

const lanes = require('./lanes.js')
const { createAdapter } = require('./harness/index.js')
const { STALE_MS, TIMEOUT_MS, refreshGrokQuota } = require('./harness/grok-quota.js')

const USAGE = 'quota [<harness>...] [--refresh] [--json]'
const HOUR_MS = 3600 * 1000

// The harnesses whose reading --refresh renews before it is read, each with what renews it.
const REFRESHERS = {
  grok: (settings) => refreshGrokQuota({ command: settings.command }),
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

const pad = (n) => String(n).padStart(2, '0')

function utcTime(ms) {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

// The machine's local time, with its offset from UTC.
function localTime(ms) {
  const d = new Date(ms)
  const offset = -d.getTimezoneOffset()
  const hours = Math.trunc(Math.abs(offset) / 60)
  const minutes = Math.abs(offset) % 60
  const zone = `UTC${offset < 0 ? '-' : '+'}${hours}${minutes === 0 ? '' : `:${pad(minutes)}`}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${zone}`
}

const round = (value, digits) => Number(value.toFixed(digits))

// One window with the hours to its reset and its priority.
function windowView({ remaining, resetsAt }, now) {
  const reset = Date.parse(resetsAt)
  if (!Number.isFinite(reset) || typeof remaining !== 'number') return { remaining, resetsAt, hoursLeft: null, priority: null }
  const hoursLeft = (reset - now) / HOUR_MS
  return {
    remaining,
    resetsAt: new Date(reset).toISOString(),
    resetsLocal: localTime(reset),
    hoursLeft: round(hoursLeft, 1),
    priority: round(remaining / Math.max(1, hoursLeft), 6),
  }
}

// One group's reading as the command shows it. A group's priority is its longest window's: the one that resets last.
function groupView(label, reading, { reserve, now, command }) {
  const view = { label: label ?? null, unknown: reading?.unknown === true, usable: lanes.usable(reading, reserve) }
  if (view.unknown) return { ...view, priority: null, windows: {}, source: null }
  const windows = Object.fromEntries(Object.entries(reading?.windows ?? {}).map(([name, w]) => [name, windowView(w, now)]))
  const longest = Object.values(windows)
    .filter((w) => w.priority !== null)
    .sort((a, b) => Date.parse(b.resetsAt) - Date.parse(a.resetsAt))[0]
  // A reading with no source of its own was read just now from the CLI, as agy's /usage is.
  const source = reading.source
    ? { ...reading.source, stale: reading.source.ageMinutes * 60000 > STALE_MS }
    : { command, ts: new Date(now).toISOString(), ageMinutes: 0, stale: false }
  if (reading.usedPercentAbsent !== undefined) Object.assign(source, { usedPercent: reading.usedPercent, usedPercentAbsent: reading.usedPercentAbsent })
  return { ...view, priority: longest ? longest.priority : null, windows, source }
}

// One harness of the table: whether it is installed, its version, and each group's reading. A reading that fails
// is the harness's error, not the command's.
function harnessView(name, settings, { reserve, now, refreshed }) {
  const found = lanes.commandPath(settings.command)
  const base = { command: settings.command, path: found, installed: found !== null }
  if (refreshed !== undefined) base.refreshed = refreshed
  if (!base.installed) return { ...base, version: null, groups: {} }
  let adapter
  try {
    adapter = createAdapter(name, settings)
  } catch (err) {
    return { ...base, version: null, error: err.message, groups: {} }
  }
  const version = adapter.version()
  let quota
  try {
    quota = adapter.quota()
  } catch (err) {
    return { ...base, version, error: err.message, groups: {} }
  }
  const groups = {}
  for (const [key, reading] of Object.entries(quota.groups)) {
    groups[key] = groupView(settings.groups[key], reading, { reserve, now, command: settings.command })
  }
  return { ...base, version, groups }
}

// The report of the harnesses named, or of every installed harness of the table when none is.
async function quotaReport({ names = [], refresh = false, now = Date.now, refreshers = REFRESHERS } = {}) {
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
    let refreshed
    if (refresh && Object.hasOwn(refreshers, name) && lanes.commandInstalled(settings.command)) {
      refreshed = (await refreshers[name](settings)) !== null
    }
    harnesses[name] = harnessView(name, settings, { reserve: config.reserve, now: now(), refreshed })
  }
  return { time: new Date(now()).toISOString(), reserve: config.reserve, harnesses }
}

const percent = (fraction) => `${round(fraction * 100, 1)}%`

function sourceLine(source) {
  const age = `${source.ageMinutes} min old`
  const stale = source.stale ? ' (stale: --refresh takes a new one)' : ''
  if (source.log === undefined) return `source: ${source.command}, read now`
  const where = [source.pid === null ? null : `pid ${source.pid}`, source.version === null ? null : `grok ${source.version}`].filter(Boolean).join(', ')
  const absent = source.usedPercentAbsent ? '; the line has no creditUsagePercent, read as 0% used' : ''
  return `source: grok's log ${source.log}, line of ${utcTime(Date.parse(source.ts))}${where ? ` (${where})` : ''}, ${age}${stale}${absent}`
}

function windowLine(name, w) {
  if (w.priority === null) return `${name}: unreadable window`
  const when = w.hoursLeft >= 0 ? `in ${w.hoursLeft} h` : `${-w.hoursLeft} h ago`
  return `${name}: ${percent(w.remaining)} left, resets ${utcTime(Date.parse(w.resetsAt))} (${w.resetsLocal}), ${when}, priority ${w.priority}`
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
    if (h.refreshed !== undefined) {
      lines.push(h.refreshed ? "  refresh: grok's UI wrote a new reading" : `  refresh: no new reading within ${TIMEOUT_MS / 1000} s`)
    }
    if (h.error) lines.push(`  error: ${h.error}`)
    for (const [key, g] of Object.entries(h.groups)) {
      const label = g.label === null ? key : `${key}, "${g.label}"`
      if (g.unknown) {
        const hint = refreshable.includes(name) ? "; --refresh opens grok's UI to take a reading" : ''
        lines.push(`  ${label}: unknown, used until a call fails for quota (no reading${hint})`)
        continue
      }
      lines.push(`  ${label}: ${g.usable ? 'usable' : 'not usable'}, priority ${g.priority ?? 'none'}`)
      for (const [windowName, w] of Object.entries(g.windows)) lines.push(`    ${windowLine(windowName, w)}`)
      lines.push(`    ${sourceLine(g.source)}`)
    }
  }
  return `${lines.join('\n')}\n`
}

// The command: the report as text, or as JSON with --json.
async function quotaCommand(args, options = {}) {
  const { names, refresh, json } = parseArgs(args)
  const report = await quotaReport({ ...options, names, refresh })
  return json ? `${JSON.stringify(report)}\n` : formatReport(report)
}

module.exports = { USAGE, quotaCommand, quotaReport, formatReport, localTime }
