'use strict'

// The session note of spec 030: one JSON file per session in the project's memory folder, that folder, the identity of
// the claude process read from /proc, and the cleanup of old and merged notes. It reads no conversation and calls no model.
// Family: continuity.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { git, repoPaths } = require('./git.js')
const { isObject, numberOrZero, readJsonOrNull, writeFileAtomic } = require('./common.js')

const NOTE_VERSION = 1
const MAX_MESSAGE = 2000
const MAX_SUMMARY = 8000
const NOTE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
// The main branch is the first of these that exists: origin/HEAD, then main, then master (spec 030 R8).
const MAIN_REFS = ['origin/HEAD', 'main', 'master']

// The first non-empty of LC_ALL, LC_MESSAGES and LANG starts with es: the notes shown to the owner are in Spanish.
function isSpanish(env = process.env) {
  for (const name of ['LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const value = env[name]
    if (typeof value === 'string' && value !== '') return /^es/i.test(value)
  }
  return false
}

// autoMemoryDirectory of the person's own settings (<configDir>/settings.json): an absolute path as it is, or ~/ under home.
function autoMemorySetting(configDir, home) {
  const settings = readJsonOrNull(path.join(configDir, 'settings.json'))
  const value = isObject(settings) && typeof settings.autoMemoryDirectory === 'string' ? settings.autoMemoryDirectory.trim() : ''
  if (value === '') return null
  if (value === '~' || value.startsWith('~/')) return path.join(home, value.slice(1))
  return path.isAbsolute(value) ? value : null
}

// The main checkout of the repository, so every working copy of it shares one folder; the folder itself when cwd is outside git.
function projectRoot(cwd) {
  try {
    return repoPaths(cwd).mainRoot
  } catch {
    return path.resolve(cwd)
  }
}

// Claude Code's folder name for a project: every character that is not a letter or a digit becomes a dash.
const encodeProjectPath = (p) => p.replace(/[^A-Za-z0-9]/g, '-')

// The memory folder of the project, not created: autoMemoryDirectory first, then CLAUDE_CODE_PROJECT_DIR_NAME, then the
// folder Claude Code derives from the main checkout (spec 030 R1).
function memoryDir({ cwd, env = process.env, home = os.homedir() }) {
  const configDir = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude')
  const setting = autoMemorySetting(configDir, home)
  if (setting) return setting
  const projects = path.join(configDir, 'projects')
  if (env.CLAUDE_CODE_PROJECT_DIR_NAME) return path.join(projects, env.CLAUDE_CODE_PROJECT_DIR_NAME, 'memory')
  return path.join(projects, encodeProjectPath(projectRoot(cwd)), 'memory')
}

const continuityDir = (options) => path.join(memoryDir(options), 'continuity')

// One process of /proc: its name, its parent and its start time (field 22 of stat), or null when it cannot be read.
// The name sits between the parentheses, which may hold spaces, so the fields are counted after the last one.
function readStat(procRoot, pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null
  try {
    const text = fs.readFileSync(path.join(procRoot, String(pid), 'stat'), 'utf8')
    const close = text.lastIndexOf(')')
    const fields = text.slice(close + 2).trim().split(/\s+/)
    const stat = { comm: text.slice(text.indexOf('(') + 1, close), ppid: Number(fields[1]), start: Number(fields[19]) }
    return Number.isFinite(stat.ppid) && Number.isFinite(stat.start) ? stat : null
  } catch {
    return null
  }
}

// The claude process above the hook: the first process, climbing parents from `from`, whose name is claude. Null without
// /proc, without such a process, or when the parent chain ends or loops.
function claudeProcess({ procRoot = '/proc', from = process.ppid } = {}) {
  const seen = new Set()
  let pid = from
  while (Number.isInteger(pid) && pid > 0 && !seen.has(pid)) {
    seen.add(pid)
    const stat = readStat(procRoot, pid)
    if (!stat) return null
    if (stat.comm === 'claude') return { pid, start: stat.start }
    pid = stat.ppid
  }
  return null
}

// 'unknown' without /proc or without a process to look for; 'alive' when the process runs with the start time saved;
// 'gone' otherwise, including a pid that another process has taken (its start time differs).
function processState(proc, { procRoot = '/proc' } = {}) {
  if (!proc || !fs.existsSync(procRoot)) return 'unknown'
  const stat = readStat(procRoot, proc.pid)
  return stat && stat.start === proc.start ? 'alive' : 'gone'
}

// The file of a session's note. A session id that could escape the folder is refused.
function noteFile(dir, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '' || /[/\\]/.test(sessionId) || sessionId.includes('..')) {
    throw new Error(`invalid session id: ${String(sessionId)}`)
  }
  return path.join(dir, `${sessionId}.json`)
}

const clip = (text, max) => (typeof text === 'string' && text.length > max ? `${text.slice(0, max - 1)}…` : text)

// The note as it is stored: the current version, the two texts clipped, and a time of update.
function shapeNote(note) {
  return {
    ...note,
    version: NOTE_VERSION,
    lastMessage: clip(note.lastMessage, MAX_MESSAGE),
    compactSummary: clip(note.compactSummary, MAX_SUMMARY),
    updatedAt: typeof note.updatedAt === 'number' ? note.updatedAt : Date.now(),
  }
}

// Writes the note of note.session atomically and returns its path.
function writeNote(dir, note) {
  const file = noteFile(dir, note.session)
  writeFileAtomic(file, `${JSON.stringify(shapeNote(note), null, 2)}\n`)
  return file
}

function readNote(dir, sessionId) {
  const note = readJsonOrNull(noteFile(dir, sessionId))
  return isObject(note) && note.version === NOTE_VERSION ? note : null
}

// Merges patch into the note of sessionId and returns it; null when the note does not exist.
function updateNote(dir, sessionId, patch) {
  const note = readNote(dir, sessionId)
  if (!note) return null
  writeNote(dir, { ...note, ...patch, session: sessionId, updatedAt: patch.updatedAt ?? Date.now() })
  return readNote(dir, sessionId)
}

// The readable notes of dir with their files, the most recent first. Files that are not of the current version are skipped.
function readEntries(dir) {
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const entries = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const file = path.join(dir, name)
    const note = readJsonOrNull(file)
    if (isObject(note) && note.version === NOTE_VERSION) entries.push({ file, note })
  }
  return entries.sort((a, b) => numberOrZero(b.note.updatedAt) - numberOrZero(a.note.updatedAt))
}

const readNotes = (dir) => readEntries(dir).map((entry) => entry.note)

// The main branch's tip commit, or null when none of the main branch names exists.
function mainTip(cwd) {
  for (const ref of MAIN_REFS) {
    const r = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd, { allowFail: true })
    if (r.status === 0 && r.stdout) return r.stdout
  }
  return null
}

// The names of the main branch: `main`, `master`, and the branch origin/HEAD points to.
function mainBranchNames(cwd) {
  const names = new Set(['main', 'master'])
  const r = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd, { allowFail: true })
  if (r.status === 0 && r.stdout) names.add(r.stdout.replace(/^origin\//, ''))
  return names
}

// A note's work is merged when its branch is not the main branch and its commit is an ancestor of the main tip (A12: "the
// branch it recorded is merged"). A note taken on the main branch itself is never merged work: its commit is always in main,
// and deleting it would lose where work on main was left. A note without a commit, or without a main branch, is not merged.
function isMerged(note, cwd, tip, mainNames = mainBranchNames(cwd)) {
  if (!tip || typeof note.commit !== 'string' || !/^[0-9a-f]{7,64}$/i.test(note.commit)) return false
  if (typeof note.branch === 'string' && mainNames.has(note.branch)) return false
  return git(['merge-base', '--is-ancestor', note.commit, tip], cwd, { allowFail: true }).status === 0
}

// Deletes the notes older than `days` and the notes of merged work that have a newer note of the project. The newest note
// is never deleted. Returns the session ids deleted.
function pruneNotes(dir, { cwd, now = Date.now(), days = NOTE_DAYS } = {}) {
  const entries = readEntries(dir)
  if (entries.length < 2) return []
  const tip = mainTip(cwd)
  const mainNames = tip ? mainBranchNames(cwd) : new Set()
  const removed = []
  for (const entry of entries.slice(1)) {
    const { note, file } = entry
    const age = now - numberOrZero(note.updatedAt)
    const newer = entries.some((other) => numberOrZero(other.note.updatedAt) > numberOrZero(note.updatedAt))
    if (age > days * DAY_MS || (newer && isMerged(note, cwd, tip, mainNames))) {
      fs.rmSync(file, { force: true })
      removed.push(note.session)
    }
  }
  return removed
}

module.exports = {
  NOTE_VERSION,
  MAX_MESSAGE,
  MAX_SUMMARY,
  NOTE_DAYS,
  isSpanish,
  memoryDir,
  continuityDir,
  claudeProcess,
  processState,
  noteFile,
  writeNote,
  readNote,
  updateNote,
  readNotes,
  pruneNotes,
}
