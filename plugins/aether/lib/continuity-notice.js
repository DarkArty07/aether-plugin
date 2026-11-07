'use strict'

// The continuity notice that SessionStart gives a new session of the Lead: three to five lines about the earlier session
// of the project, read from its note, from git, from the process table and from the delegate log (spec 030 R5 to R7).
// It only reads: it writes nothing, calls no model and never throws.
// Family: continuity.

const path = require('node:path')
const { git, repoPaths, currentBranch } = require('./git.js')
const { isSpanish, readNotes, processState } = require('./continuity-store.js')
const { repoSessions, readMark } = require('./session.js')
const { readEntries, isLaunch } = require('./delegate-log.js')

const SHORT_ID = 8
const MESSAGE_MAX = 160
const LINE_MAX = 300
const NAMES_SHOWN = 3
// The main branch is the first of these that exists: origin/HEAD, then main, then master (spec 030 R8).
const MAIN_REFS = ['origin/HEAD', 'main', 'master']
const DETACHED = 'detached HEAD'

// Cuts a text to max characters; the last one becomes «…» when it is cut.
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// «1 commit» or «3 commits», in the language of the notice.
const countOf = (n, one, many) => `${n} ${n === 1 ? one : many}`

// The first three names, then «(+n more)» (or «(+n más)») for the rest; more is the word for «more» in the notice's language.
function namesOf(names, more) {
  const shown = names.slice(0, NAMES_SHOWN).join(', ')
  const rest = names.length - NAMES_SHOWN
  return rest > 0 ? `${shown} (+${rest} ${more})` : shown
}

// Runs fn and returns its value, or fallback when it throws: one section of the notice never breaks the others.
function safely(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// The same claude process: both are set and name the same pid and the same start time.
function isSameClaude(a, b) {
  if (!a || !b) return false
  return a.pid === b.pid && a.start === b.start
}

// The key the marks of this repository carry: the main checkout, or the folder itself outside git.
function repoKey(cwd) {
  return safely(() => repoPaths(cwd).mainRoot, path.resolve(cwd))
}

// The main branch that git can resolve, or null when none of the names exists.
function mainRef(cwd) {
  for (const ref of MAIN_REFS) {
    if (git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd, { allowFail: true }).status === 0) return ref
  }
  return null
}

// Line 1: where the earlier session stopped, with its last message on one line.
function whereLine(note, t) {
  const message = typeof note.lastMessage === 'string' ? note.lastMessage.replace(/\s+/g, ' ').trim() : ''
  const branch = typeof note.branch === 'string' && note.branch !== '' ? note.branch : 'unknown'
  const said = message === '' ? t('no message saved', 'sin mensaje guardado') : fit(message, MESSAGE_MAX)
  return t(
    `Last session (${note.session.slice(0, SHORT_ID)}, branch ${branch}) stopped at: ${said}`,
    `Última sesión (${note.session.slice(0, SHORT_ID)}, rama ${branch}) se quedó en: ${said}`,
  )
}

// Line 2: what changed in git since the earlier session's commit, and the branch change when the branch is not the same.
function sinceLine(note, { cwd, branch, t }) {
  const commit = note.commit
  const known = typeof commit === 'string' && /^[0-9a-f]{7,64}$/i.test(commit)
    && git(['cat-file', '-e', `${commit}^{commit}`], cwd, { allowFail: true }).status === 0
  if (!known) return t('Since then: the commit of that session is not in this repository.', 'Desde entonces: el commit de esa sesión no está en este repositorio.')
  const commits = Number(git(['rev-list', '--count', `${commit}..HEAD`], cwd).stdout)
  const files = git(['diff', '--name-only', commit, 'HEAD'], cwd).stdout.split('\n').filter(Boolean).length
  const moved = typeof note.branch === 'string' && note.branch !== '' && note.branch !== branch
  const change = commits === 0 && files === 0
    ? t('Since then: nothing changed in git.', 'Desde entonces: nada cambió en git.')
    : t(
      `Since then: ${countOf(commits, 'commit', 'commits')} and ${countOf(files, 'file', 'files')} changed on ${branch}.`,
      `Desde entonces: ${countOf(commits, 'commit', 'commits')} y ${countOf(files, 'archivo', 'archivos')} en ${branch}.`,
    )
  if (!moved) return change
  return `${change} ${t(`The branch moved from ${note.branch} to ${branch}.`, `La rama pasó de ${note.branch} a ${branch}.`)}`
}

// Line 3: the state of the earlier session, from its close mark and its claude process. Only a process that is gone
// is called cut off, and only then the resume command is given (spec 030 R6).
function stateLine(note, { selfProcess, procRoot, t }) {
  if (isSameClaude(note.process, selfProcess)) {
    return t('That session ended in this same window (it was cleared).', 'Esa sesión terminó en esta misma ventana (se limpió).')
  }
  if (note.closed) return t('The session ended normally.', 'La sesión terminó normalmente.')
  const state = processState(note.process ?? null, { procRoot })
  if (state === 'alive') return t('That session is still active in another window.', 'Esa sesión sigue activa en otra ventana.')
  if (state === 'gone') {
    const reason = note.cut && typeof note.cut.reason === 'string' && note.cut.reason !== '' ? note.cut.reason : null
    return t(
      `The session was cut off (${reason ?? 'no close mark'}): claude --resume ${note.session}`,
      `La sesión se cortó (${reason ?? 'sin marca de cierre'}): claude --resume ${note.session}`,
    )
  }
  return t(
    'That session has no close mark; this machine cannot tell whether it was cut off.',
    'Esa sesión no tiene marca de cierre; esta máquina no puede saber si se cortó.',
  )
}

// Line 4, only when there is something: the branches with work not merged into the main branch, and the delegates of the
// earlier session that have no result for the same attempt.
function workLine({ cwd, dataDir, session, t }) {
  const ref = mainRef(cwd)
  const unmerged = ref
    ? git(['branch', '--no-merged', ref, '--format=%(refname:short)'], cwd).stdout.split('\n').filter(Boolean)
    : []
  const entries = readEntries(dataDir)
  const results = new Set(entries.filter((e) => e.kind === 'result').map((e) => `${e.task}\u0000${e.attempt}`))
  const pending = [...new Set(entries
    .filter((e) => e.session === session && isLaunch(e) && typeof e.task === 'string' && !results.has(`${e.task}\u0000${e.attempt}`))
    .map((e) => e.task))]
  const parts = []
  const more = t('more', 'más')
  if (unmerged.length > 0) parts.push(`${t('Unmerged work', 'Trabajo sin fusionar')}: ${namesOf(unmerged, more)}.`)
  if (pending.length > 0) parts.push(`${t('Delegates without a result', 'Delegados sin resultado')}: ${namesOf(pending, more)}.`)
  return parts.length > 0 ? parts.join(' ') : null
}

// Line 5, only when there are other sessions active: the marked ones of this repository whose process is alive, and the
// notes of the folder without a mark whose process is alive. The earlier session and this process's own sessions are left out.
function otherLine({ cwd, dataDir, dir, session, previous, selfProcess, procRoot, t }) {
  const active = new Set(
    repoSessions(dataDir, repoKey(cwd), { except: session, exceptProcess: selfProcess, procRoot })
      .filter((row) => row.state === 'alive')
      .map((row) => row.session),
  )
  for (const note of readNotes(dir)) {
    if (note.session === session || readMark(dataDir, note.session)) continue
    if (isSameClaude(note.process, selfProcess)) continue
    if (processState(note.process ?? null, { procRoot }) === 'alive') active.add(note.session)
  }
  active.delete(session)
  active.delete(previous.session)
  if (active.size === 0) return null
  const ids = [...active].map((id) => id.slice(0, SHORT_ID)).join(', ')
  return `${t('Other sessions active:', 'Otras sesiones activas:')} ${ids}.`
}

// The notice of a session: { lines }. Nothing from a compact (A11), and one line when there is no earlier session.
// The earlier session is the most recent note of the folder that is not this session's own.
function notice({ cwd, session, source, dataDir, dir, env = process.env, procRoot = '/proc', selfProcess = null } = {}) {
  try {
    if (source === 'compact') return { lines: [] }
    const spanish = isSpanish(env)
    const t = (english, spanishText) => (spanish ? spanishText : english)
    const previous = readNotes(dir).find((note) => note.session !== session)
    if (!previous) return { lines: [t('No earlier session in this project.', 'No hay una sesión anterior en este proyecto.')] }
    const branch = safely(() => currentBranch(cwd) || DETACHED, DETACHED)
    const context = { cwd, branch, t }
    const lines = [
      whereLine(previous, t),
      safely(() => sinceLine(previous, context), t('Since then: the commit of that session is not in this repository.', 'Desde entonces: el commit de esa sesión no está en este repositorio.')),
      stateLine(previous, { selfProcess, procRoot, t }),
    ]
    const work = safely(() => workLine({ cwd, dataDir, session: previous.session, t }), null)
    if (work) lines.push(work)
    const others = safely(() => otherLine({ cwd, dataDir, dir, session, previous, selfProcess, procRoot, t }), null)
    if (others) lines.push(others)
    return { lines: lines.map((line) => fit(line, LINE_MAX)) }
  } catch {
    return { lines: [] }
  }
}

module.exports = { notice }
