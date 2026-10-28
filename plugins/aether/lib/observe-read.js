'use strict'

// The ordered reading of self-observation (R7): it gathers the six sources (the delegate log, the events, the
// faults, the durable summary, the owner's pending list and the grants), runs the detectors and the calibration
// signals over them and returns the findings in one fixed order. Each failure gets its issue drafted as text in
// observe/issues/; nothing is sent anywhere. From the files it reads fields and counts only: a command leaves
// this module as a fingerprint, and a quote, an answer or a reason is never copied.
// Family: observe.

const fs = require('node:fs')
const path = require('node:path')
const { isObject, isNumber, numberOrZero: count, writeFileAtomic: writeAtomic } = require('./common.js')
const { observeDir, issuesDir, devDir, readEvents, readFaults, loadObserveConfig, cleanText: identifier, FAULT_KINDS } = require('./observe.js')
const { digestAll, readSummary } = require('./observe-digest.js')
const { fingerprintOf, detectRiseWithoutReason, detectPairFailures, detectRuleBroken, detectBlockedByMistake } = require('./observe-detect.js')
const { calibrationSignals } = require('./observe-calibrate.js')
const { loadPairs } = require('./pairs.js')
const { readPending } = require('./pending.js')

const RANK = { failure: 0, calibration: 1, friction: 2 }
const SESSION_FOLDER = /^[A-Za-z0-9-]+$/
const DELEGATE_FIELDS = ['kind', 'time', 'session', 'task', 'id', 'step', 'attempt', 'launchKind', 'status', 'harness', 'model', 'verdict']
const NEXT_FIELDS = ['kind', 'cause', 'step']

const millis = (time) => {
  if (isNumber(time)) return time
  const parsed = typeof time === 'string' ? Date.parse(time) : NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

// The delegate log as the fields the detectors need, each line with its number in the file.
function readDelegateEntries(dataDir) {
  let text
  try {
    text = fs.readFileSync(path.join(dataDir, 'delegates', 'log.jsonl'), 'utf8')
  } catch {
    return []
  }
  const entries = []
  text.split('\n').forEach((raw, index) => {
    if (!raw.trim()) return
    let entry
    try {
      entry = JSON.parse(raw)
    } catch {
      return
    }
    if (!isObject(entry)) return
    const kept = { line: index + 1 }
    for (const key of DELEGATE_FIELDS) {
      const value = entry[key]
      if (typeof value === 'string' || typeof value === 'number') kept[key] = value
    }
    if (kept.time !== undefined) kept.time = millis(kept.time)
    if (isObject(entry.next)) {
      kept.next = {}
      for (const key of NEXT_FIELDS) if (typeof entry.next[key] === 'string') kept.next[key] = entry.next[key]
    }
    entries.push(kept)
  })
  return entries
}

function readPendingEntries(repoRoot) {
  if (repoRoot === null) return []
  return readPending(repoRoot).map((entry) => ({
    time: millis(entry.time),
    session: typeof entry.session === 'string' ? entry.session : '',
    class: identifier(entry.class),
    fingerprint: fingerprintOf(entry.command),
  }))
}

function readGrants(repoRoot) {
  if (repoRoot === null) return []
  let file
  try {
    file = JSON.parse(fs.readFileSync(path.join(repoRoot, '.aether', 'autonomy', 'grants.json'), 'utf8'))
  } catch {
    return []
  }
  if (!isObject(file) || !Array.isArray(file.grants)) return []
  return file.grants.filter(isObject).map((grant) => ({ class: identifier(grant.class), added: grant.added }))
}

// The counts of the summary's sessions added up, with the sessions each key came from and their span.
function totalsOf(sessions, pick) {
  const totals = new Map()
  for (const [id, entry] of Object.entries(sessions)) {
    if (!isObject(entry) || !isObject(entry[pick])) continue
    for (const [key, value] of Object.entries(entry[pick])) {
      if (!totals.has(key)) totals.set(key, { value: pick === 'lanes' ? { calls: 0, ok: 0, outputTokens: 0, durationMs: 0, usd: 0, pricedCalls: 0 } : 0, sessions: [], first: null, last: null })
      const total = totals.get(key)
      if (pick === 'lanes') {
        for (const field of Object.keys(total.value)) total.value[field] += count(value && value[field])
      } else {
        total.value += count(value)
      }
      total.sessions.push(id)
      if (isNumber(entry.first)) total.first = total.first === null ? entry.first : Math.min(total.first, entry.first)
      if (isNumber(entry.last)) total.last = total.last === null ? entry.last : Math.max(total.last, entry.last)
    }
  }
  return totals
}

// A calibration signal comes from counts, so it carries no session or time: the summary knows which.
function withOrigin(finding, lanes, seats) {
  const origin = (finding.type === 'design-rounds' ? seats : lanes).get(finding.id.slice(finding.id.indexOf(':') + 1))
  if (!origin) return finding
  return {
    ...finding,
    sessions: finding.sessions.length ? finding.sessions : [...origin.sessions].sort(),
    firstTime: finding.firstTime ?? origin.first,
    lastTime: finding.lastTime ?? origin.last,
  }
}

// The kinds of the faults of one class, counted, in the order of FAULT_KINDS: " (TypeError ×2, other ×1)", or nothing when
// none of them has a kind. Only words of the list are here, since readFaults drops any other kind.
function kindsText(byKind) {
  if (!byKind) return ''
  const parts = FAULT_KINDS.filter((kind) => byKind.has(kind)).map((kind) => `${kind} ×${byKind.get(kind)}`)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

function faultFindings(totals, faults) {
  const findings = []
  for (const [source, total] of totals) {
    if (total.value <= 0) continue
    const name = identifier(source)
    const classes = new Map()
    const kinds = new Map()
    const times = []
    for (const fault of faults) {
      if (fault.source !== source) continue
      const cls = identifier(fault.class)
      classes.set(cls, (classes.get(cls) || 0) + 1)
      if (fault.kind !== undefined) {
        const byKind = kinds.get(cls) || new Map()
        byKind.set(fault.kind, (byKind.get(fault.kind) || 0) + 1)
        kinds.set(cls, byKind)
      }
      if (isNumber(fault.time)) times.push(fault.time)
    }
    const evidence = [`Source ${name} recorded ${total.value} silent faults in ${total.sessions.length} sessions`]
    for (const [cls, n] of [...classes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) evidence.push(`Class ${cls}: ${n} faults still on disk${kindsText(kinds.get(cls))}`)
    findings.push({
      id: `fault:${name}`,
      kind: 'failure',
      type: 'fault',
      title: `Silent faults in ${name}`,
      evidence,
      numbers: { count: total.value },
      firstTime: times.length ? Math.min(...times) : total.first,
      lastTime: times.length ? Math.max(...times) : total.last,
      sessions: [...total.sessions].sort(),
    })
  }
  return findings
}

function frictionFindings(toolTotals, kindTotals) {
  const findings = []
  for (const [tool, total] of toolTotals) {
    if (total.value <= 0) continue
    findings.push({
      id: `tool-failures:${identifier(tool)}`,
      kind: 'friction',
      type: 'tool-failures',
      title: `Tool ${identifier(tool)} failed ${total.value} times`,
      evidence: [`Tool ${identifier(tool)}: ${total.value} failures in ${total.sessions.length} sessions`],
      numbers: { count: total.value },
      firstTime: total.first,
      lastTime: total.last,
      sessions: [...total.sessions].sort(),
    })
  }
  const compactions = kindTotals.get('PreCompact')
  if (compactions && compactions.value > 0) {
    findings.push({
      id: 'compactions',
      kind: 'friction',
      type: 'compactions',
      title: `The context was compacted ${compactions.value} times`,
      evidence: [`PreCompact recorded ${compactions.value} times in ${compactions.sessions.length} sessions`],
      numbers: { count: compactions.value },
      firstTime: compactions.first,
      lastTime: compactions.last,
      sessions: [...compactions.sessions].sort(),
    })
  }
  return findings
}

// One friction item per session that has a corrections.json in the development installation. Only the count and
// the time of each item are read from it: the owner's words and the Lead's never leave that file.
function correctionFindings(dataDir) {
  let folders
  try {
    folders = fs.readdirSync(devDir(dataDir))
  } catch {
    return []
  }
  const findings = []
  for (const session of folders.filter((name) => SESSION_FOLDER.test(name)).sort()) {
    let saved
    try {
      saved = JSON.parse(fs.readFileSync(path.join(devDir(dataDir), session, 'corrections.json'), 'utf8'))
    } catch {
      continue
    }
    if (!isObject(saved) || !isNumber(saved.count) || saved.count <= 0) continue
    const times = (Array.isArray(saved.items) ? saved.items : [])
      .map((entry) => (isObject(entry) && typeof entry.time === 'string' ? Date.parse(entry.time) : NaN))
      .filter((time) => !Number.isNaN(time))
    const firstTime = times.length ? Math.min(...times) : millis(saved.time)
    const lastTime = times.length ? Math.max(...times) : millis(saved.time)
    findings.push({
      id: `owner-correction:${session}`,
      kind: 'friction',
      type: 'owner-correction',
      title: `Owner corrections in session ${session}: ${saved.count}`,
      evidence: [
        `${saved.count} owner message(s) matched the correction word lists of config/observe.json`,
        `first ${new Date(firstTime).toISOString()}, last ${new Date(lastTime).toISOString()}`,
        `file: observe/dev/${session}/corrections.json`,
        'This is a heuristic of words, not a judgment: some matches are not corrections and some corrections are missed.',
      ],
      numbers: { count: saved.count },
      firstTime,
      lastTime,
      sessions: [session],
    })
  }
  return findings
}

function issueOf(finding) {
  const numbers = Object.entries(finding.numbers).map(([key, value]) => `- ${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
  const sessions = finding.sessions.map((session) => `- ${session}`)
  const body = [
    '## Evidence', '', ...finding.evidence.map((line) => `- ${line}`), '',
    '## Numbers', '', ...numbers, '',
    '## Sessions', '', ...(sessions.length ? sessions : ['- none recorded']), '',
  ].join('\n')
  return { title: finding.title, body }
}

const issueFile = (dataDir, id) => path.join(issuesDir(dataDir), `${id.replace(/[^A-Za-z0-9._-]/g, '-')}.md`)

function compareFindings(a, b) {
  return RANK[a.kind] - RANK[b.kind]
    || b.evidence.length - a.evidence.length
    || (b.lastTime ?? 0) - (a.lastTime ?? 0)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function readObservations({ dataDir, repoRoot = null, now = Date.now(), pairs = loadPairs().pairs, cfg = loadObserveConfig(), prices } = {}) {
  digestAll(dataDir, prices === undefined ? {} : { prices })
  const sessions = readSummary(dataDir).sessions

  const delegateEntries = readDelegateEntries(dataDir)
  const events = readEvents(dataDir)
  const faults = readFaults(dataDir)
  const pending = readPendingEntries(repoRoot)
  const grants = readGrants(repoRoot)

  const lanes = totalsOf(sessions, 'lanes')
  const seats = totalsOf(sessions, 'seats')
  const calibration = calibrationSignals({
    delegateEntries,
    lanes: Object.fromEntries([...lanes].map(([key, total]) => [key, total.value])),
    seats: Object.fromEntries([...seats].map(([key, total]) => [key, total.value])),
    pairs,
  }, cfg).map((finding) => withOrigin(finding, lanes, seats))

  const items = [
    ...detectRiseWithoutReason(delegateEntries),
    ...detectPairFailures(delegateEntries, cfg),
    ...detectRuleBroken({ events, delegateEntries }),
    ...detectBlockedByMistake({ pending, grants }, cfg),
    ...faultFindings(totalsOf(sessions, 'faults'), faults),
    ...calibration,
    ...frictionFindings(totalsOf(sessions, 'toolFailures'), totalsOf(sessions, 'events')),
    ...correctionFindings(dataDir),
  ].sort(compareFindings)

  for (const item of items) {
    if (item.kind !== 'failure') continue
    item.issue = issueOf(item)
    writeAtomic(issueFile(dataDir, item.id), `# ${item.issue.title}\n\n${item.issue.body}`)
  }
  const result = { generatedAt: now, items }
  writeAtomic(path.join(observeDir(dataDir), 'read.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}

module.exports = { readObservations }
