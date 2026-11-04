'use strict'

// The read-only reading of the repository: secrets without their value, TODO and FIXME, hotspots and branches.
// Family: audit.

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { git } = require('./git.js')

// The secret patterns are a table of data, applied to the tree and to the added lines of the history.
const SECRET_PATTERNS = [
  { type: 'aws-access-key-id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, confidence: 'high' },
  { type: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/, confidence: 'high' },
  { type: 'stripe-live-key', pattern: /\b[rs]k_live_[0-9A-Za-z]{24,}\b/, confidence: 'high' },
  { type: 'slack-token', pattern: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/, confidence: 'high' },
  { type: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/, confidence: 'high' },
  { type: 'private-key-block', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, confidence: 'high' },
  { type: 'generic-assignment', pattern: /(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'][^"'\s]{12,}["']/i, confidence: 'low' },
]

// redact(text) -> the text with every secret-looking match replaced by its type, never by its value.
function redact(text) {
  let out = String(text)
  for (const { type, pattern } of SECRET_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
    out = out.replace(new RegExp(pattern.source, flags), `[redacted ${type}]`)
  }
  return out
}

function matchesOf(line) {
  const found = []
  for (const { type, pattern } of SECRET_PATTERNS) {
    const probe = new RegExp(pattern.source, pattern.flags.replace('g', ''))
    if (probe.test(line)) found.push(type)
  }
  return found
}

function treeSecrets(root) {
  const out = git(['ls-files'], root)
  const hits = new Map()
  for (const file of out.stdout.split('\n').filter((line) => line !== '')) {
    let text = null
    try {
      text = fs.readFileSync(path.join(root, file), 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const type of matchesOf(lines[i])) {
        const key = `${type}\0${file}`
        if (!hits.has(key)) {
          const confidence = SECRET_PATTERNS.find((row) => row.type === type).confidence
          hits.set(key, { type, file, line: i + 1, confidence })
        }
      }
    }
  }
  return hits
}

function readHistory(root, maxHistoryBytes, timeoutMs) {
  return new Promise((resolve) => {
    let child = null
    try {
      child = spawn('git', ['log', '--all', '-p', '-U0', '--format=commit %H'], { cwd: root })
    } catch {
      resolve({ text: '', truncated: false })
      return
    }
    const chunks = []
    let size = 0
    let truncated = false
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ text: Buffer.concat(chunks).toString('utf8'), truncated })
    }
    const timer = setTimeout(() => {
      truncated = true
      try {
        child.kill('SIGKILL')
      } catch {}
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    child.stdout.on('data', (chunk) => {
      if (size >= maxHistoryBytes) {
        truncated = true
        return
      }
      const left = maxHistoryBytes - size
      if (chunk.length > left) {
        chunks.push(chunk.slice(0, left))
        size = maxHistoryBytes
        truncated = true
        try {
          child.kill('SIGKILL')
        } catch {}
      } else {
        chunks.push(chunk)
        size += chunk.length
      }
    })
    child.on('error', finish)
    child.on('close', finish)
  })
}

function historyCommits(text) {
  const commits = new Map()
  let sha = null
  let file = null
  for (const line of text.split('\n')) {
    if (line.startsWith('commit ')) {
      const candidate = line.slice('commit '.length)
      sha = /^[0-9a-f]{40}$/.test(candidate) ? candidate : null
      file = null
    } else if (line.startsWith('+++ ')) {
      const marker = line.slice('+++ '.length)
      file = marker === '/dev/null' ? null : marker.replace(/^b\//, '')
    } else if (sha !== null && file !== null && line.startsWith('+') && !line.startsWith('+++')) {
      const added = line.slice(1)
      for (const type of matchesOf(added)) commits.set(`${type}\0${file}`, sha)
    }
  }
  return commits
}

// secrets(root, options) -> the secret-looking findings of the tree and of every branch, without any value.
async function secrets(root, { maxHistoryBytes = 200 * 1024 * 1024, timeoutMs = 60000 } = {}) {
  const tree = treeSecrets(root)
  const { text, truncated } = await readHistory(root, maxHistoryBytes, timeoutMs)
  const commits = historyCommits(text)
  const keys = new Set([...tree.keys(), ...commits.keys()])
  const findings = [...keys].map((key) => {
    const treeHit = tree.get(key)
    const [type, file] = key.split('\0')
    return {
      type,
      file,
      line: treeHit ? treeHit.line : null,
      commit: commits.get(key) || null,
      inTree: Boolean(treeHit),
      confidence: treeHit ? treeHit.confidence : SECRET_PATTERNS.find((row) => row.type === type).confidence,
    }
  })
  findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.type < b.type ? -1 : 1))
  return { state: 'result', findings, truncated }
}

function todoTag(text) {
  const hit = text.match(/\b(TODO|FIXME)\b/)
  return hit ? hit[1] : null
}

// todos(root, options) -> the TODO and FIXME comments of the tracked files, with their text redacted.
function todos(root, { max = 200 } = {}) {
  const out = git(['grep', '-n', '-I', '-E', '\\b(TODO|FIXME)\\b'], root, { allowFail: true })
  if (out.status !== 0) return { state: 'result', total: 0, items: [], truncated: false }
  const lines = out.stdout.split('\n').filter((line) => line !== '')
  const items = []
  for (const line of lines) {
    const first = line.indexOf(':')
    const second = line.indexOf(':', first + 1)
    if (first === -1 || second === -1) continue
    const text = line.slice(second + 1)
    const tag = todoTag(text)
    if (tag === null) continue
    items.push({ file: line.slice(0, first), line: Number(line.slice(first + 1, second)), tag, text: redact(text.trim()).slice(0, 160) })
  }
  return { state: 'result', total: items.length, items: items.slice(0, max), truncated: items.length > max }
}

function isGeneratedOrVendored(file) {
  if (/(^|\/)(node_modules|vendor|dist|build)\//.test(file)) return true
  if (/\.min\.js$/.test(file)) return true
  return /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock|bun\.lockb|Cargo\.lock|composer\.lock|Gemfile\.lock|go\.sum|poetry\.lock|Pipfile\.lock)$/.test(file)
}

function headLineCount(root, file) {
  const out = git(['show', `HEAD:${file}`], root, { raw: true, allowFail: true })
  if (out.status !== 0) return null
  if (out.bytes.includes(0)) return null
  const text = out.bytes.toString('utf8')
  if (text === '') return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

// hotspots(root, options) -> the files that change the most, weighted by size, over the last months.
function hotspots(root, { top = 10, months = 12 } = {}) {
  const out = git(['log', `--since=${months} months ago`, '--name-only', '--format=commit %H'], root, { allowFail: true })
  const changes = new Map()
  if (out.status === 0) {
    for (const line of out.stdout.split('\n')) {
      if (line === '' || line.startsWith('commit ')) continue
      changes.set(line, (changes.get(line) || 0) + 1)
    }
  }
  const items = []
  for (const [file, count] of changes) {
    if (count < 2 || isGeneratedOrVendored(file)) continue
    const lines = headLineCount(root, file)
    if (lines === null) continue
    items.push({ file, changes: count, lines, score: count * Math.log2(lines + 1) })
  }
  items.sort((a, b) => (b.score - a.score) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  return { state: 'result', items: items.slice(0, top) }
}

function defaultBranch(root, heads) {
  const symbolic = git(['symbolic-ref', '--short', '--quiet', 'refs/remotes/origin/HEAD'], root, { allowFail: true })
  if (symbolic.status === 0 && symbolic.stdout !== '') return symbolic.stdout.replace(/^origin\//, '')
  if (heads.includes('main')) return 'main'
  if (heads.includes('master')) return 'master'
  return git(['branch', '--show-current'], root).stdout || heads[0] || ''
}

function branchDetail(root, name, kind, fallback, nowMs, staleDays) {
  const lastCommit = git(['log', '-1', '--format=%cI', name], root).stdout
  const ageDays = Math.floor((nowMs - new Date(lastCommit).getTime()) / 86400000)
  const aheadOfDefault = Number(git(['rev-list', '--count', `${fallback}..${name}`], root).stdout)
  const merged = git(['merge-base', '--is-ancestor', name, fallback], root, { allowFail: true }).status === 0
  return { name, kind, lastCommit, ageDays, aheadOfDefault, merged, stale: ageDays >= staleDays && name !== fallback }
}

// branches(root, options) -> every local and remote branch with its age, lead and staleness.
function branches(root, { now = new Date(), staleDays = 60 } = {}) {
  const heads = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], root).stdout.split('\n').filter((line) => line !== '')
  const remotes = git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes'], root).stdout.split('\n').filter((line) => line !== '' && !line.endsWith('/HEAD'))
  const fallback = defaultBranch(root, heads)
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const items = [
    ...heads.map((name) => branchDetail(root, name, 'local', fallback, nowMs, staleDays)),
    ...remotes.map((name) => branchDetail(root, name, 'remote', fallback, nowMs, staleDays)),
  ]
  items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { state: 'result', default: fallback, stale: items.filter((item) => item.stale).length, items }
}

module.exports = {
  SECRET_PATTERNS,
  redact,
  secrets,
  todos,
  hotspots,
  branches,
}
