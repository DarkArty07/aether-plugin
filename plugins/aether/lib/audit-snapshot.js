'use strict'

// The before/after photograph of the audited repository: git status with content hashes, HEAD, worktrees and stash.
// Family: audit.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { git } = require('./git.js')
const { EXCLUDES } = require('./run.js')

function isAetherPath(entry) {
  return entry === '.aether' || entry === '.aether-tmp' || entry === '.aether-exam'
    || entry.startsWith('.aether/') || entry.startsWith('.aether-tmp/') || entry.startsWith('.aether-exam/')
}

function statusOf(root) {
  const out = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], root, { raw: true })
  const entries = out.stdout.split('\0').filter((entry) => entry !== '')
  const rows = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const code = entry.slice(0, 2)
    let file = entry.slice(3)
    if (code[0] === 'R' || code[0] === 'C' || code[1] === 'R' || code[1] === 'C') i++
    if (isAetherPath(file)) continue
    let hash = null
    try {
      hash = crypto.createHash('sha1').update(fs.readFileSync(path.join(root, file))).digest('hex')
    } catch {
      hash = null
    }
    rows.push({ path: file, code, hash })
  }
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return rows
}

function worktreesOf(root) {
  const out = git(['worktree', 'list', '--porcelain'], root)
  return out.stdout.split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length))
}

function branchesOf(root) {
  const out = git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/remotes'], root)
  const branches = {}
  for (const line of out.stdout.split('\n')) {
    if (line === '') continue
    const at = line.indexOf(' ')
    branches[line.slice(0, at)] = line.slice(at + 1)
  }
  return branches
}

function stashOf(root) {
  const out = git(['stash', 'list', '--format=%gd %H'], root, { allowFail: true })
  if (out.status !== 0 || out.stdout === '') return []
  return out.stdout.split('\n').filter((line) => line !== '')
}

function excludeOf(root) {
  const commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], root).stdout
  let text = ''
  try {
    text = fs.readFileSync(path.join(commonDir, 'info', 'exclude'), 'utf8')
  } catch {
    return []
  }
  const kept = new Set(EXCLUDES)
  return text.split('\n').map((line) => line.trim()).filter((line) => line !== '' && !kept.has(line))
}

// snapshot(root) -> the photograph R6 compares: status with content hashes, HEAD, branch, worktrees, branches, stash and exclude.
function snapshot(root) {
  return {
    head: git(['rev-parse', 'HEAD'], root).stdout,
    branch: git(['branch', '--show-current'], root).stdout,
    status: statusOf(root),
    worktrees: worktreesOf(root),
    branches: branchesOf(root),
    stash: stashOf(root),
    exclude: excludeOf(root),
  }
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function statusFiles(a, b) {
  const seen = new Map()
  for (const row of a.status) seen.set(row.path, row)
  const other = new Map()
  for (const row of b.status) other.set(row.path, row)
  const files = []
  for (const [file, row] of seen) {
    const next = other.get(file)
    if (!next || next.code !== row.code || next.hash !== row.hash) files.push(file)
  }
  for (const [file] of other) if (!seen.has(file)) files.push(file)
  return files.sort()
}

// diffSnapshots(a, b) -> the kinds that changed between two photographs.
function diffSnapshots(a, b) {
  const items = []
  if (a.head !== b.head || a.branch !== b.branch) {
    items.push({ kind: 'head', before: { head: a.head, branch: a.branch }, after: { head: b.head, branch: b.branch } })
  }
  const files = statusFiles(a, b)
  if (files.length > 0) items.push({ kind: 'status', files })
  if (!sameJson([...a.worktrees].sort(), [...b.worktrees].sort())) {
    items.push({ kind: 'worktrees', before: a.worktrees, after: b.worktrees })
  }
  if (!sameJson(a.branches, b.branches)) items.push({ kind: 'branches', before: a.branches, after: b.branches })
  if (!sameJson(a.stash, b.stash)) items.push({ kind: 'stash', before: a.stash, after: b.stash })
  if (!sameJson(a.exclude, b.exclude)) items.push({ kind: 'exclude', before: a.exclude, after: b.exclude })
  return { changed: items.length > 0, items }
}

// withSnapshots(root, steps, { snapshotFn }) -> runs each step between two photographs and tells which step changed what.
async function withSnapshots(root, steps, { snapshotFn = snapshot } = {}) {
  const results = []
  const attributed = []
  const unattributable = []
  let first = null
  let previousAfter = null
  let previousName = null
  for (const step of steps) {
    const before = await snapshotFn(root)
    if (first === null) first = before
    if (previousAfter !== null) {
      const gap = diffSnapshots(previousAfter, before)
      if (gap.items.length > 0) unattributable.push({ between: [previousName, step.name], items: gap.items })
    }
    results.push(await step.run())
    const after = await snapshotFn(root)
    const own = diffSnapshots(before, after)
    if (own.items.length > 0) attributed.push({ step: step.name, items: own.items })
    previousAfter = after
    previousName = step.name
  }
  const whole = diffSnapshots(first, previousAfter)
  return { results, changes: { changed: whole.changed, attributed, unattributable } }
}

module.exports = {
  snapshot,
  diffSnapshots,
  withSnapshots,
}
