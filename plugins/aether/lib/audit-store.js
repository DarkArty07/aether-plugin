'use strict'

// The audit's store: the identity of the audited project, its key, the report folder and the earlier audits.
// Family: audit.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { git, repoPaths } = require('./git.js')
const { writeAtomic } = require('./common.js')
const { safeRealpath, toId } = require('./run.js')

// 'https://user:tok@GitHub.com/Owner/Repo.git', 'git@github.com:Owner/Repo.git', 'ssh://git@github.com/Owner/Repo.git/' -> 'github.com/owner/repo'
// Rule: drop the protocol, drop the user info, turn the scp-like `host:path` (only when the text had no `://`) into `host/path`, drop a trailing `.git` and `/`, lowercase.
function normalizeRemote(url) {
  let rest = String(url).trim()
  if (rest.includes('://')) {
    rest = rest.slice(rest.indexOf('://') + 3)
  } else {
    const colon = rest.indexOf(':')
    if (colon >= 0) rest = `${rest.slice(0, colon)}/${rest.slice(colon + 1)}`
  }
  const at = rest.lastIndexOf('@')
  if (at >= 0) rest = rest.slice(at + 1)
  rest = rest.replace(/\/+$/, '')
  if (rest.toLowerCase().endsWith('.git')) rest = rest.slice(0, -('.git'.length))
  rest = rest.replace(/\/+$/, '')
  return rest.toLowerCase()
}

function stripUserInfo(url) {
  if (url.includes('://')) return url.replace(/:\/\/[^@/]*@/, '://')
  const at = url.indexOf('@')
  if (at >= 0 && (url.indexOf(':') === -1 || at < url.indexOf(':'))) return url.slice(at + 1)
  return url
}

function remoteOf(cwd) {
  let names = []
  try {
    names = git(['remote'], cwd, { allowFail: true }).stdout.split('\n').map((line) => line.trim()).filter(Boolean)
  } catch {
    return null
  }
  if (names.length === 0) return null
  const first = names.includes('origin') ? 'origin' : names[0]
  try {
    const raw = git(['remote', 'get-url', first], cwd, { allowFail: true }).stdout.trim()
    if (!raw) return null
    return stripUserInfo(raw)
  } catch {
    return null
  }
}

// -> { identity, remote, root, name, key }. remote is the origin URL (or the first remote's) with the user info removed, or null.
// identity is normalizeRemote(remote) or, with no remote, the real path of the main checkout's root (repoPaths(cwd).mainRoot of lib/git.js, through safeRealpath).
// name is the last segment of identity; key is projectKey(identity).
function identityOf(cwd) {
  const root = safeRealpath(repoPaths(cwd).mainRoot)
  const remote = remoteOf(cwd)
  const identity = remote === null ? root : normalizeRemote(remote)
  const name = identity.split('/').filter(Boolean).pop() || identity
  return { identity, remote, root, name, key: projectKey(identity) }
}

// `${toId(last segment of identity)}-${first 12 hex digits of sha256(identity)}`; toId from lib/run.js.
function projectKey(identity) {
  const text = String(identity)
  const last = text.split('/').filter(Boolean).pop() || text
  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
  return `${toId(last)}-${hash}`
}

// The folder of the next audit: <dataDir>/audits/<key>/<date>, or <date>-2, <date>-3 ... when that one exists. Does not create it.
function nextReportDir(dataDir, key, date) {
  const first = path.join(dataDir, 'audits', key, date)
  if (!fs.existsSync(first)) return first
  let n = 2
  while (fs.existsSync(`${first}-${n}`)) n++
  return `${first}-${n}`
}

// Creates dir and writes report.json (JSON.stringify(data, null, 2)) and report.md (markdown) with writeAtomic of lib/common.js.
function writeReport(dir, data, markdown) {
  writeAtomic(path.join(dir, 'report.json'), JSON.stringify(data, null, 2))
  writeAtomic(path.join(dir, 'report.md'), markdown)
}

function dirDate(name) {
  const suffixed = name.match(/^(.*)-(\d+)$/)
  if (suffixed && /^\d{4}-\d{2}-\d{2}$/.test(suffixed[1])) return { date: suffixed[1], suffix: Number(suffixed[2]) }
  return { date: name, suffix: 1 }
}

// The latest saved audit of the project (by date, then by suffix), or null: { dir, date, report }. Skips a folder whose report.json cannot be read.
function previousReport(dataDir, key) {
  const root = path.join(dataDir, 'audits', key)
  let names
  try {
    names = fs.readdirSync(root)
  } catch {
    return null
  }
  const found = []
  for (const name of names) {
    const dir = path.join(root, name)
    let report
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'))
    } catch {
      continue
    }
    const { date, suffix } = dirDate(name)
    found.push({ dir, date, suffix, report })
  }
  if (found.length === 0) return null
  found.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.suffix - b.suffix))
  const latest = found[found.length - 1]
  return { dir: latest.dir, date: latest.date, report: latest.report }
}

function round2(value) {
  return Math.round(value * 100) / 100
}

// From the saved audits of every project (<dataDir>/audits/*/*/report.json): the range per topic of what an audit cost.
// -> { samples: 0 } with none; else { samples, perTopic: { minutes: [min, max], usd: [min, max] } }, rounded to 2 decimals.
// An audit counts when meta.durationSeconds > 0 and meta.topics has at least one topic; usd counts only when meta.costUsd is a number.
// minutes = durationSeconds / 60 / topics.length, usd = costUsd / topics.length. samples = audits that counted for minutes. When no audit has a cost, usd is null.
function estimate(dataDir) {
  const root = path.join(dataDir, 'audits')
  let keys
  try {
    keys = fs.readdirSync(root)
  } catch {
    return { samples: 0 }
  }
  const minutes = []
  const usd = []
  for (const key of keys) {
    let days
    try {
      days = fs.readdirSync(path.join(root, key))
    } catch {
      continue
    }
    for (const day of days) {
      let meta
      try {
        meta = JSON.parse(fs.readFileSync(path.join(root, key, day, 'report.json'), 'utf8')).meta
      } catch {
        continue
      }
      if (!meta || !(meta.durationSeconds > 0) || !Array.isArray(meta.topics) || meta.topics.length === 0) continue
      minutes.push(meta.durationSeconds / 60 / meta.topics.length)
      if (typeof meta.costUsd === 'number' && Number.isFinite(meta.costUsd)) usd.push(meta.costUsd / meta.topics.length)
    }
  }
  if (minutes.length === 0) return { samples: 0 }
  const range = (values) => [round2(Math.min(...values)), round2(Math.max(...values))]
  return { samples: minutes.length, perTopic: { minutes: range(minutes), usd: usd.length === 0 ? null : range(usd) } }
}

module.exports = {
  normalizeRemote,
  identityOf,
  projectKey,
  nextReportDir,
  writeReport,
  previousReport,
  estimate,
}
