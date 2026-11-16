'use strict'

// Finds the next free three-digit spec number across the working tree, all local and remote-tracking branches, and all worktrees.
// Family: plan.

const fs = require('node:fs')
const path = require('node:path')
const { git, isRepository, repoPaths } = require('./git.js')

const SPEC_DIR_RE = /^(\d{3})-/

function pad3(n) {
  return String(n).padStart(3, '0')
}

// Read NNN-* directory names from <root>/specs/ on disk.
function numbersOnDisk(root) {
  const specsDir = path.join(root, 'specs')
  let entries
  try {
    entries = fs.readdirSync(specsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const nums = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const m = entry.name.match(SPEC_DIR_RE)
    if (m) nums.push(parseInt(m[1], 10))
  }
  return nums
}

// List local and remote-tracking branch short names, skipping symrefs (e.g. origin/HEAD).
function gitRefs(cwd) {
  const r = git(['for-each-ref', '--format=%(symref)|%(refname:short)', 'refs/heads', 'refs/remotes'], cwd, { allowFail: true })
  if (r.status !== 0 || !r.stdout) return []
  const refs = []
  for (const line of r.stdout.split('\n')) {
    const sep = line.indexOf('|')
    if (sep === -1) continue
    const symref = line.slice(0, sep)
    const name = line.slice(sep + 1).trim()
    if (!symref && name) refs.push(name)
  }
  return refs
}

// Read NNN-* directory names under specs/ in a git ref.
function numbersInRef(ref, cwd) {
  const r = git(['ls-tree', '-d', '--name-only', ref, 'specs/'], cwd, { allowFail: true })
  if (r.status !== 0 || !r.stdout) return []
  const nums = []
  for (const line of r.stdout.split('\n')) {
    const base = path.posix.basename(line.trim())
    const m = base.match(SPEC_DIR_RE)
    if (m) nums.push(parseInt(m[1], 10))
  }
  return nums
}

// List worktree paths from `git worktree list --porcelain`.
function gitWorktrees(cwd) {
  const r = git(['worktree', 'list', '--porcelain'], cwd, { allowFail: true })
  if (r.status !== 0 || !r.stdout) return []
  const paths = []
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('worktree ')) paths.push(line.slice('worktree '.length).trim())
  }
  return paths
}

function findNextSpec(cwd = process.cwd()) {
  let highest = 0
  const holders = new Set()

  const record = (nums, label) => {
    for (const n of nums) {
      if (n > highest) {
        highest = n
        holders.clear()
        holders.add(label)
      } else if (n === highest && highest > 0) {
        holders.add(label)
      }
    }
  }

  if (isRepository(cwd)) {
    const worktreeRoot = repoPaths(cwd).worktree
    record(numbersOnDisk(worktreeRoot), worktreeRoot)
    for (const wtPath of gitWorktrees(cwd)) {
      record(numbersOnDisk(wtPath), wtPath)
    }
    for (const ref of gitRefs(cwd)) {
      record(numbersInRef(ref, cwd), ref)
    }
  } else {
    record(numbersOnDisk(cwd), cwd)
  }

  return {
    next: pad3(highest + 1),
    highest: highest > 0 ? pad3(highest) : null,
    where: [...holders],
  }
}

function nextSpec({ cwd = process.cwd(), stdout = process.stdout } = {}) {
  const result = findNextSpec(cwd)
  stdout.write(JSON.stringify(result) + '\n')
  return result
}

module.exports = { findNextSpec, nextSpec }
