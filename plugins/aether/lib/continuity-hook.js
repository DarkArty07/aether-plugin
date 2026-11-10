'use strict'

// The hooks of the session note of spec 030 (R2, R3, R4): what the Stop, compaction, failed-stop and session-end hooks write
// into the note of the Lead's session, and the context a hook runs with. It reads no conversation file and calls no model.
// Family: continuity.

const os = require('node:os')
const { claudeProcess, continuityDir, isSpanish, readNote, updateNote, writeNote } = require('./continuity-store.js')
const { currentBranch, head, repoPaths } = require('./git.js')
const { markerFile, readMark, touchSession } = require('./session.js')
const { writeFileAtomic } = require('./common.js')
const { dataDir } = require('./run.js')

// Reads one fact of the repository at cwd; null when it cannot be read (outside git, no commit, a detached HEAD).
function gitFact(cwd, read) {
  try {
    return read(cwd) || null
  } catch {
    return null
  }
}

const branchAndCommit = (cwd) => ({ branch: gitFact(cwd, currentBranch), commit: gitFact(cwd, head) })

// The main checkout of the repository at cwd, or null outside git.
const mainRootOf = (cwd) => gitFact(cwd, (dir) => repoPaths(dir).mainRoot)

// The last message of the turn, when the hook carries one: a turn without a message keeps the message the note has.
const messageOf = (input) => (typeof input.last_assistant_message === 'string' ? { lastMessage: input.last_assistant_message } : {})

// The folder of the note is written into the session mark when the note is first written, so sessionend can find the note
// without git (spec 030 R3). A mark that does not exist, or that already names the folder, is left as it is.
// Never throws: without the record, sessionend leaves the note open.
function recordFolder(data, sessionId, dir) {
  try {
    const mark = readMark(data, sessionId)
    if (!mark || mark.noteDir === dir) return
    writeFileAtomic(markerFile(data, sessionId), `${JSON.stringify({ ...mark, noteDir: dir })}\n`)
  } catch {
    // The note is written; only the record of its folder is missing.
  }
}

// The folder the mark records for the note of sessionId, or null when none is recorded.
function recordedFolder(data, sessionId) {
  const dir = readMark(data, sessionId)?.noteDir
  return typeof dir === 'string' && dir !== '' ? dir : null
}

// What each hook writes into the note (R2, R3). Only sessionend skips git: it writes into the folder the mark recorded. The
// other hooks find the note's folder with continuityDir, which reads the main checkout of cwd (spec 030 R1).
const PATCHES = {
  stop: (input, now) => ({ ...messageOf(input), ...branchAndCommit(input.cwd), cwd: input.cwd ?? null, updatedAt: now }),
  precompact: (input, now) => ({ ...branchAndCommit(input.cwd), updatedAt: now }),
  postcompact: (input, now) => ({
    compactSummary: typeof input.compact_summary === 'string' ? input.compact_summary : null,
    compactAt: now,
    updatedAt: now,
  }),
  stopfailure: (input, now) => ({ ...messageOf(input), cut: { at: now, reason: input.error ?? null }, updatedAt: now }),
  sessionend: (input, now) => ({ closed: { at: now, reason: input.reason ?? null }, updatedAt: now }),
}

// Creates the note of input.session_id and returns it. Its process is the claude process above the hook (spec 030 R1, R19);
// it says whether the session is a fork. Outside git, repo, branch and commit are null.
function openNote(input, { env = process.env, home = os.homedir(), now = Date.now(), procRoot = '/proc', from = process.ppid, source = input.source, fork = false } = {}) {
  const dir = continuityDir({ cwd: input.cwd, env, home })
  writeNote(dir, {
    session: input.session_id,
    source: source ?? null,
    fork,
    cwd: input.cwd ?? null,
    repo: mainRootOf(input.cwd),
    ...branchAndCommit(input.cwd),
    startedAt: now,
    updatedAt: now,
    process: claudeProcess({ procRoot, from }),
    lastMessage: null,
    compactSummary: null,
    closed: null,
    cut: null,
  })
  recordFolder(dataDir(env), input.session_id, dir)
  return readNote(dir, input.session_id)
}

function unverdictedStopMessage(items, es) {
  const list = items.map((item) => `${item.task} (attempt ${item.attempt})`).join(', ')
  return es
    ? `Continuidad de Aether: hay resultado(s) de tareas delegadas sin veredicto en esta sesión: ${list}. Juzga cada resultado y ejecuta: aether-delegate verdict --task <id> --verdict approve|fix|infeasible antes de dar el trabajo por cerrado.`
    : `Aether continuity: delegated task result(s) arrived without a verdict in this session: ${list}. Judge each result and run: aether-delegate verdict --task <id> --verdict approve|fix|infeasible before closing the work.`
}

// Writes the hook's part into the note of input.session_id (creating the note when it is missing), then refreshes the
// last activity of the session's mark. sessionend runs no git: it writes into the folder the mark recorded, and when no
// folder is recorded it writes nothing. Stop returns context for newly unverdicted results; an unknown event writes nothing.
function handle(event, input, { env = process.env, home = os.homedir(), now = Date.now(), procRoot = '/proc', from = process.ppid, dataDir: data = dataDir(env) } = {}) {
  if (event === 'stop' && input && input.agent_id) return null
  if (!Object.hasOwn(PATCHES, event)) return null
  let result = null
  if (event === 'sessionend') {
    const dir = recordedFolder(data, input.session_id)
    if (dir) updateNote(dir, input.session_id, PATCHES.sessionend(input, now))
  } else {
    const dir = continuityDir({ cwd: input.cwd, env, home })
    if (!readNote(dir, input.session_id)) openNote(input, { env, home, now, procRoot, from })
    const prior = readNote(dir, input.session_id)
    const patch = PATCHES[event](input, now)
    if (event === 'stop') {
      const notified = Array.isArray(prior.notifiedUnverdicted) ? prior.notifiedUnverdicted : []
      let fresh = []
      try {
        const { unverdictedDelegates } = require('./delegate-report.js')
        fresh = unverdictedDelegates({ dataDir: data, session: input.session_id })
          .filter((item) => !notified.includes(`${item.task}@${item.attempt}`))
      } catch {
        // A failed notice must not prevent the continuity note from being written.
      }
      if (fresh.length) {
        patch.notifiedUnverdicted = [...notified, ...fresh.map((item) => `${item.task}@${item.attempt}`)]
        result = { additionalContext: unverdictedStopMessage(fresh, isSpanish(env)) }
      }
    }
    updateNote(dir, input.session_id, patch)
    recordFolder(data, input.session_id, dir)
  }
  touchSession(data, input.session_id, now)
  return result
}

// The context a hook runs with: its environment, the home folder, the time and the plugin's data directory.
function context(env = process.env) {
  return { env, home: os.homedir(), now: Date.now(), dataDir: dataDir(env) }
}

module.exports = { handle, openNote, context, unverdictedStopMessage }
