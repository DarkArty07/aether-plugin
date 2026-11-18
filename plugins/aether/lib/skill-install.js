'use strict'

// Downloads a skill for review and installs a reviewed skill byte for byte (spec 045, R23).
// The download runs once, into an isolated folder under the data dir; the install
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

function reviewRoot(dataDir) {
  return path.join(dataDir, 'skills', 'review')
}

function reviewDir(dataDir, id) {
  return path.join(reviewRoot(dataDir), id)
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

// `add <source> --skill <name>` once, into a fresh folder under the data dir
// (never the project, never global): computes the SHA-256 of what arrived and
// writes review.json. No second download ever runs after the review.
function fetchForReview({ source, name, env, runner, dataDir } = {}) {
  const run = runner || runSkillBin
  const id = skillId(name)
  const dir = reviewDir(dataDir, id)
  removeDir(dir)
  fs.mkdirSync(dir, { recursive: true })
  const fail = (message) => {
    removeDir(dir)
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
  const skillDir = path.join(dir, '.agents', 'skills', name)
  let stat = null
  try {
    stat = fs.statSync(skillDir)
  } catch {
    stat = null
  }
  if (!stat || !stat.isDirectory()) return fail(`download of ${source} --skill ${name} left no skill folder`)
  const hash = computedHash(skillDir)
  const review = { name, source, author: authorOf(source), hash }
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(review, null, 2) + '\n')
  return { ok: true, id, dir, hash }
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
  skillsBin,
  runSkillBin,
  reviewRoot,
  reviewDir,
  skillId,
  removeDir,
  fetchForReview,
  copyReviewed,
  listEntries,
  installedHash: computedHash,
}
