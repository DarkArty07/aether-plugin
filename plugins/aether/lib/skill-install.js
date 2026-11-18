'use strict'

// Downloads a skill for review and installs a reviewed skill byte for byte (spec 045, R23).
// The download runs once, into an isolated review folder waiting inside the worktree
// (.aether/tmp/skill-review/, out of git through .git/info/exclude); the install
// copies that reviewed content into the project, verifies its hash, and commits nothing.
// Family: skill.

const { spawnSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { computedHash } = require('./skill-registry.js')
const { authorOf } = require('./skill-rules.js')

const FIND_TIMEOUT_MS = 15000
const ADD_TIMEOUT_MS = 60000
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_SKILL_FILES = 200

function skillsBin(env) {
  const raw = (env && env.AETHER_SKILLS_BIN) || process.env.AETHER_SKILLS_BIN || 'npx skills@1.9.0'
  const parts = String(raw).trim().split(/\s+/).filter(Boolean)
  return { cmd: parts[0], prefix: parts.slice(1) }
}

// One skills call: no shell, no stdin (a CLI prompt cannot wait for an answer),
// and a time limit of its own. Never throws.
function runSkillBin(cmd, args, { cwd, timeoutMs, env } = {}) {
  try {
    const result = spawnSync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: { ...process.env, ...(env || {}) },
    })
    if (result.error) {
      const timedOut = result.error.code === 'ETIMEDOUT'
      return { status: null, stdout: result.stdout || '', stderr: result.stderr || '', timedOut, error: result.error }
    }
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', timedOut: false, error: null }
  } catch (err) {
    return { status: null, stdout: '', stderr: String((err && err.message) || err), timedOut: false, error: err }
  }
}

function reviewRoot(root) {
  return path.join(root, '.aether', 'tmp', 'skill-review')
}

function reviewDir(root, id) {
  return path.join(reviewRoot(root), id)
}

// Removes skill-review/ itself when the last candidate folder is gone, so
// an installed, discarded or rejected design leaves no empty folder behind.
function removeReviewRootIfEmpty(root) {
  if (typeof root !== 'string' || root === '') return
  try {
    const dir = reviewRoot(root)
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  } catch {}
}

// The review id of a downloaded skill: its name when it is a safe path
// segment, else a deterministic fallback that is one.
function skillId(name) {
  if (typeof name === 'string' && ID_PATTERN.test(name)) return name
  const digest = crypto.createHash('sha1').update(String(name)).digest('hex').slice(0, 12)
  return `skill-${digest}`
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {}
}

// `add <source> --skill <name>` once, into a fresh folder waiting inside the
// worktree (never the skills folders, never global): computes the SHA-256 of
// what arrived and writes review.json. No second download ever runs after the
// review. Without a review root it fails, and never falls back to the
// process working directory.
function fetchForReview({ source, name, env, runner, root } = {}) {
  const run = runner || runSkillBin
  if (typeof root !== 'string' || root === '') {
    return { ok: false, errors: [`no review root: fetchForReview needs the worktree root for ${source} --skill ${name}`] }
  }
  const id = skillId(name)
  const dir = reviewDir(root, id)
  // The review waits inside the project, so the folder stays out of git
  // through .git/info/exclude, never through .gitignore. Outside a git
  // repository there is nothing to exclude.
  try {
    const { repoPaths } = require('./git.js')
    const { ensureExcluded } = require('./run.js')
    ensureExcluded(repoPaths(root).gitCommonDir)
  } catch {}
  removeDir(dir)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    return { ok: false, errors: [`the review folder cannot be created: ${String((err && err.message) || err)}`] }
  }
  const fail = (message) => {
    removeDir(dir)
    removeReviewRootIfEmpty(root)
    return { ok: false, errors: [message] }
  }
  const { cmd, prefix } = skillsBin(env)
  let result
  try {
    result = run(cmd, [...prefix, 'add', source, '--skill', name], { cwd: dir, timeoutMs: ADD_TIMEOUT_MS, env })
  } catch (err) {
    return fail(`download of ${source} --skill ${name} failed: ${String((err && err.message) || err)}`)
  }
  if (!result || result.timedOut) return fail(`download of ${source} --skill ${name} timed out`)
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.error || `exit ${result.status}`).trim().split('\n')[0]
    return fail(`download of ${source} --skill ${name} failed: ${detail}`)
  }
  if (!pruneReviewDir(dir, name)) return fail(`download of ${source} --skill ${name} planted a symlink in the review folder: not reviewed`)
  const skillDir = path.join(dir, '.agents', 'skills', name)
  let stat = null
  try {
    stat = fs.lstatSync(skillDir)
  } catch {
    stat = null
  }
  if (!stat || !stat.isDirectory()) return fail(`download of ${source} --skill ${name} left no skill folder`)
  const hash = computedHash(skillDir)
  const review = { name, source, author: authorOf(source), hash }
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(review, null, 2) + '\n')
  return { ok: true, id, dir, hash }
}

// After the download the review folder keeps only .agents/skills/<name>/,
// skills-lock.json and review.json. Any other top-level entry, in particular
// .claude, and any top-level symlink is removed, so the unreviewed copy never
// sits as a skill or as instructions the session could load. Inside .agents
// only skills/<name>/ stays: any other entry could be loaded as instructions
// while the reviewer reads the skill. Answers true when the folder is safe to
// read, false when a planted symlink was found: lstat runs on .agents, on
// .agents/skills and on .agents/skills/<name> before any readdir or removal,
// so a link at any of the three is unlinked, never followed, and the caller
// fails the download closed.
function pruneReviewDir(dir, name) {
  const agentsDir = path.join(dir, '.agents')
  const skillsDir = path.join(agentsDir, 'skills')
  const skillDir = path.join(skillsDir, name)
  for (const candidate of [agentsDir, skillsDir, skillDir]) {
    let isLink = false
    try {
      isLink = fs.lstatSync(candidate).isSymbolicLink()
    } catch {
      isLink = false
    }
    if (isLink) {
      try {
        fs.unlinkSync(candidate)
      } catch {}
      return false
    }
  }
  let entries = null
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return true
  }
  const keep = new Set(['.agents', 'skills-lock.json', 'review.json'])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    let isLink = false
    try {
      isLink = fs.lstatSync(full).isSymbolicLink()
    } catch {
      continue
    }
    if (isLink || !keep.has(entry.name)) removeDir(full)
  }
  let agentEntries = null
  try {
    agentEntries = fs.readdirSync(agentsDir, { withFileTypes: true })
  } catch {
    agentEntries = null
  }
  if (agentEntries !== null) {
    for (const entry of agentEntries) {
      if (entry.name === 'skills') continue
      removeDir(path.join(agentsDir, entry.name))
    }
  }
  let skillEntries = null
  try {
    skillEntries = fs.readdirSync(skillsDir, { withFileTypes: true })
  } catch {
    skillEntries = null
  }
  if (skillEntries === null) return true
  for (const entry of skillEntries) {
    if (entry.name === name) continue
    removeDir(path.join(skillsDir, entry.name))
  }
  return true
}

function listEntries(root) {
  const out = []
  const walk = (current) => {
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (entry.isSymbolicLink()) {
        let target = null
        try {
          target = fs.readlinkSync(full)
        } catch {}
        out.push({ rel, kind: 'link', target })
      } else if (entry.isDirectory()) {
        out.push({ rel, kind: 'dir' })
        walk(full)
      } else if (entry.isFile()) {
        out.push({ rel, kind: 'file' })
      }
    }
  }
  walk(root)
  return out
}

function copyTree(from, to) {
  for (const entry of listEntries(from)) {
    const src = path.join(from, entry.rel)
    const dest = path.join(to, entry.rel)
    if (entry.kind === 'dir') {
      fs.mkdirSync(dest, { recursive: true })
    } else if (entry.kind === 'link') {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.symlinkSync(entry.target, dest)
    } else if (entry.kind === 'file') {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    }
  }
}

// Copies the reviewed folder byte for byte to the project and links it from
// .claude/skills: recomputes the SHA-256 of the copy and requires it equal to
// the reviewed hash, else removes the copy and fails. Never overwrites, never
// touches the index, never writes under home.
function copyReviewed({ from, name, hash, projectRoot, home } = {}) {
  void home
  if (typeof name !== 'string' || !ID_PATTERN.test(name)) {
    return { ok: false, errors: [`the skill name "${name}" is not a safe id: not installed`] }
  }
  const target = path.join(projectRoot, '.agents', 'skills', name)
  const link = path.join(projectRoot, '.claude', 'skills', name)
  for (const existing of [target, link]) {
    try {
      fs.lstatSync(existing)
      return { ok: false, errors: [`the skill "${name}" already exists at ${existing}: not overwritten`] }
    } catch {}
  }
  const fail = (message) => {
    removeDir(target)
    try {
      fs.lstatSync(link)
      fs.unlinkSync(link)
    } catch {}
    return { ok: false, errors: [message] }
  }
  try {
    fs.mkdirSync(target, { recursive: true })
    copyTree(from, target)
  } catch (err) {
    return fail(`copy of the reviewed skill "${name}" failed: ${String((err && err.message) || err)}`)
  }
  let actual = null
  try {
    actual = computedHash(target)
  } catch (err) {
    return fail(`hash of the installed skill "${name}" failed: ${String((err && err.message) || err)}`)
  }
  if (actual !== hash) return fail(`the copy of the skill "${name}" differs from the reviewed hash`)
  const wanted = JSON.stringify(listEntries(from))
  const got = JSON.stringify(listEntries(target))
  if (wanted !== got) return fail(`the copy of the skill "${name}" differs from the reviewed folder`)
  try {
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync(path.relative(path.dirname(link), target), link)
  } catch (err) {
    return fail(`link of the skill "${name}" failed: ${String((err && err.message) || err)}`)
  }
  return { ok: true, hash: actual }
}

module.exports = {
  FIND_TIMEOUT_MS,
  ADD_TIMEOUT_MS,
  ID_PATTERN,
  MAX_SKILL_FILES,
  skillsBin,
  runSkillBin,
  reviewRoot,
  reviewDir,
  removeReviewRootIfEmpty,
  skillId,
  removeDir,
  fetchForReview,
  copyReviewed,
  listEntries,
  installedHash: computedHash,
}
