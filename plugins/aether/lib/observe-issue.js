'use strict'

// The automatic issues of the development installation (spec 020): each failure the reading found is filed on the plugin's
// own repository, with the evidence the reading already wrote. launch() starts the worker detached from the SessionEnd hook;
// fileIssues() is the worker. The ledger (observe/issues-filed.json) keeps what was filed, and a marker in each issue body
// lets another machine or data directory see it. This is the only observation file that runs a process and the only one
// that names gh. It never reads a conversation: the reading's findings are its whole input.
// Family: observe.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { isObject, readJsonOrNull, writeAtomic } = require('./common.js')
const { PLUGIN_ROOT, observeDir, loadObserveConfig, autoIssueOn } = require('./observe.js')
const { redact } = require('./observe-redact.js')

const MANIFEST = path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json')
const BIN = path.join(PLUGIN_ROOT, 'bin', 'aether-observe')
const LABEL = 'aether-observe'
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const GITHUB_URL = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/
const CALL_MS = 20000
const RUN_MS = 90000
const LOCK_MS = 5 * 60 * 1000
const SESSION_CUT = 8
// The absolute paths of a person's home that a body may not keep: /home/<x>, /Users/<x> and /root, with the user's name dropped.
const SYSTEM_HOME = /\/(?:home\/[^/\s"'`]+|Users\/[^/\s"'`]+|root)(?=\/|$|[\s"'`])/g

const ledgerFile = (dataDir) => path.join(observeDir(dataDir), 'issues-filed.json')
const lockFile = (dataDir) => path.join(observeDir(dataDir), 'issues-filed.lock')
const readingFile = (dataDir) => path.join(observeDir(dataDir), 'read.json')

// The owner/name of the repository the manifest names on github.com, or null when it names no repository of that shape (D5).
function repoOf(manifestPath = MANIFEST) {
  const manifest = readJsonOrNull(manifestPath)
  const match = isObject(manifest) && typeof manifest.repository === 'string' ? GITHUB_URL.exec(manifest.repository.trim()) : null
  if (!match) return null
  const repo = `${match[1]}/${match[2]}`
  return REPO.test(repo) ? repo : null
}

// The id as the marker keeps it: any character outside the list becomes _, and at most 120 characters are kept.
const markerIdOf = (id) => String(id).replace(/[^A-Za-z0-9_.:/-]/g, '_').slice(0, 120)
const markerOf = (id) => `<!-- aether-observe:${markerIdOf(id)} -->`

// The cleaning of D4, in this order: each session becomes its first eight characters, each absolute path of the home
// directory or of /home/<x>, /Users/<x> or /root becomes ~, and redact() runs last. The caller compares the text before
// and after redact() to decide whether it may be sent.
function scrub(text, { sessions, home }) {
  let out = text
  for (const session of sessions) {
    if (session.length > SESSION_CUT) out = out.split(session).join(session.slice(0, SESSION_CUT))
  }
  if (home && home.length > 1 && home.startsWith('/')) {
    out = out.split(`${home}/`).join('~/')
    out = out.split(home).join('~')
  }
  return out.replace(SYSTEM_HOME, '~')
}

// The title and body to send for one failure. The footer and the marker come after the comparison, so they can never make a
// draft held. A draft that redact() would change holds a key or a secret, and is not sent (D4).
function draftOf(finding, { home = os.homedir(), version = 'unknown', now = Date.now() } = {}) {
  const sessions = Array.isArray(finding.sessions) ? finding.sessions.filter((session) => typeof session === 'string') : []
  const title = scrub(finding.issue.title, { sessions, home })
  const body = scrub(finding.issue.body, { sessions, home }).trimEnd()
  const held = redact(title) !== title || redact(body) !== body
  const footer = `Abierto por aether-observe (autoissue, modo de desarrollo) · plugin ${version} · ${new Date(now).toISOString()}`
  return { title, body: `${body}\n\n${footer}\n${markerOf(finding.id)}\n`, held }
}

function versionOf(manifest) {
  const file = readJsonOrNull(manifest)
  return isObject(file) && typeof file.version === 'string' ? file.version : 'unknown'
}

// Starts the worker detached, from the SessionEnd hook, with no output and nothing to wait for. The gate is checked again here,
// and every failure is swallowed: a hook prints nothing and exits 0 (D2, D7).
function launch({ dataDir, env = process.env } = {}) {
  try {
    if (!autoIssueOn(env)) return false
    const childEnv = typeof dataDir === 'string' && dataDir ? { ...env, AETHER_DATA_DIR: dataDir } : { ...env }
    const child = spawn(process.execPath, [BIN, 'file-issues'], { detached: true, stdio: 'ignore', env: childEnv })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

// One gh call with its own time limit, never longer than what is left of the run. A call that cannot start or fails is not ok.
function gh(args, { env, input, deadline }) {
  const left = deadline - Date.now()
  if (left <= 0) return { ok: false, stdout: '' }
  const r = spawnSync('gh', args, { encoding: 'utf8', env, input, timeout: Math.min(CALL_MS, left), maxBuffer: 16 * 1024 * 1024 })
  return { ok: !r.error && r.status === 0, stdout: r.stdout || '' }
}

// The issues of the label as { number, state, url, body }, or null when the listing is not a JSON array.
function parseList(text) {
  let list
  try {
    list = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(list)) return null
  return list.filter(isObject).map((issue) => ({
    number: issue.number,
    state: String(issue.state || '').toUpperCase(),
    url: String(issue.url || ''),
    body: typeof issue.body === 'string' ? issue.body : '',
  }))
}

// The failures of the last reading that can be filed: kind failure, with the issue the reading drafted.
function fileableOf(dataDir) {
  const reading = readJsonOrNull(readingFile(dataDir))
  const items = isObject(reading) && Array.isArray(reading.items) ? reading.items : []
  return items
    .filter((item) => isObject(item) && item.kind === 'failure' && typeof item.id === 'string' && isObject(item.issue))
    .filter((item) => typeof item.issue.title === 'string' && typeof item.issue.body === 'string')
    .map((item) => ({ id: item.id, issue: item.issue, sessions: Array.isArray(item.sessions) ? item.sessions : [] }))
}

// The lock of a run is created exclusively, and taken over only when it is older than LOCK_MS. False when another run holds it.
function takeLock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.closeSync(fs.openSync(file, 'wx'))
      return true
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      let age
      try {
        age = Date.now() - fs.statSync(file).mtimeMs
      } catch {
        continue
      }
      if (age < LOCK_MS) return false
      fs.rmSync(file, { force: true })
    }
  }
  return false
}

// The worker: files the failures of the last reading that the ledger does not have, on the plugin's repository. Returns one
// object with created, found, held and skipped, and an error only when the gate, the destination or a create fails.
// A gh that is missing or fails at the listing is not an error: nothing is noted, and the next run tries again.
function fileIssues({ dataDir, env = process.env, now = Date.now(), manifest = MANIFEST } = {}) {
  const none = { created: 0, found: 0, held: 0, skipped: 0 }
  if (!autoIssueOn(env)) return { ...none, error: 'autoissue-off' }
  const repo = repoOf(manifest)
  if (repo === null) return { ...none, error: 'repository-invalid' }
  const lock = lockFile(dataDir)
  if (!takeLock(lock)) return { ...none, busy: true }
  try {
    return fileAll({ dataDir, env, now, manifest, repo })
  } finally {
    fs.rmSync(lock, { force: true })
  }
}

function fileAll({ dataDir, env, now, manifest, repo }) {
  const result = { created: 0, found: 0, held: 0, skipped: 0 }
  const ledger = readJsonOrNull(ledgerFile(dataDir))
  const filed = isObject(ledger) ? ledger : {}
  const pending = fileableOf(dataDir).filter((finding) => {
    if (Object.prototype.hasOwnProperty.call(filed, finding.id)) {
      result.skipped += 1
      return false
    }
    return true
  })
  if (pending.length === 0) return result

  const { maxPerSession, maxOpen } = loadObserveConfig().autoIssue
  const home = env.HOME || os.homedir()
  const version = versionOf(manifest)
  const deadline = Date.now() + RUN_MS
  const listed = gh(['issue', 'list', '--repo', repo, '--label', LABEL, '--state', 'all', '--limit', '200', '--json', 'number,state,url,body'], { env, deadline })
  const issues = listed.ok ? parseList(listed.stdout) : null
  if (!issues) return { ...result, error: 'gh-unavailable' }

  let open = issues.filter((issue) => issue.state === 'OPEN').length
  let labelReady = false
  for (let index = 0; index < pending.length; index++) {
    if (Date.now() >= deadline) {
      result.skipped += pending.length - index
      break
    }
    const finding = pending[index]
    const draft = draftOf(finding, { home, version, now })
    const marker = markerOf(finding.id)
    const existing = issues.find((issue) => issue.body.includes(marker))
    if (existing) {
      filed[finding.id] = { number: existing.number, url: existing.url, time: now, via: 'found' }
      writeAtomic(ledgerFile(dataDir), `${JSON.stringify(filed, null, 2)}\n`)
      result.found += 1
      continue
    }
    if (draft.held) {
      result.held += 1
      continue
    }
    if (result.created >= maxPerSession || open >= maxOpen) {
      result.skipped += 1
      continue
    }
    if (!labelReady) {
      gh(['label', 'create', LABEL, '--repo', repo, '--description', 'Opened by aether-observe (autoissue)'], { env, deadline })
      labelReady = true
    }
    const created = gh(['issue', 'create', '--repo', repo, '--title', draft.title, '--body-file', '-', '--label', LABEL], { env, deadline, input: draft.body })
    const url = created.ok ? created.stdout.trim().split('\n').pop().trim() : ''
    const number = /\/issues\/(\d+)$/.exec(url)
    if (!number) return { ...result, error: 'gh-create-failed' }
    filed[finding.id] = { number: Number(number[1]), url, time: now, via: 'created' }
    writeAtomic(ledgerFile(dataDir), `${JSON.stringify(filed, null, 2)}\n`)
    result.created += 1
    open += 1
  }
  return result
}

module.exports = { launch, fileIssues, repoOf, draftOf, markerOf }
