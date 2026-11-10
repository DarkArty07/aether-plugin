'use strict'

// SessionStart hook handler for Aether mode. It marks the session and injects context for the Lead agent.
// Called by bin/aether-session-start when a Claude Code session begins.
// Family: session.

// SessionStart hook. It acts only for the Lead (agent_type aether:lead): any other session
// gets no output, no file and no sweep. hooks/hooks.json runs it four times in one entry (issue #139):
// - with no --part, the notes command marks the session, hands the superdelegation option to the session's
//   commands through CLAUDE_ENV_FILE, and, on startup, clear and compact, prunes old usage files, lane logs,
//   observation files and session markers (the observation digest keeps their counts first), sweeps stale runs
//   in the session's repository and prints "Aether mode is active." with its notes (an open autonomous run, the
//   sweep, what it could not do). On startup only it also adds the hook's top-level systemMessage, a welcome
//   line for the person with the plugin's version and /aether:help (spec 024 R9), and the notices of issues the
//   worker opened (spec 020) that fit in the same output.
// - with --part k, on startup, clear and compact, it prints part k of the using-aether bootstrap and does
//   nothing else; nothing when the bootstrap has fewer than k parts.
// Claude Code delivers a hook's output whole only up to 10,000 characters and gives a longer one as a preview and
// a file, so the bootstrap goes in parts whose whole output stays within PART_LIMIT.

const fs = require('node:fs')
const path = require('node:path')
const PLUGIN_ROOT = path.join(__dirname, '..')

// The most characters of a part command's whole standard output, the JSON with its escapes and its newline:
// under Claude Code's 10,000-character cut per hook output, measured in issue #139.
const PART_LIMIT = 9800

// The file of the Lead's rules in the plugin at root.
const skillFile = (root) => path.join(root, 'skills', 'using-aether', 'SKILL.md')

// Claude Code replaces ${CLAUDE_PLUGIN_ROOT} in a skill's content but not in a hook's additionalContext,
// so the bootstrap gets the plugin folder's absolute path here, where the Lead can read the files it names.
function bootstrap(root) {
  const raw = fs.readFileSync(skillFile(root), 'utf8')
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim().split('${CLAUDE_PLUGIN_ROOT}').join(root)
}

// The whole standard output of a command that injects a context.
function contextOutput(context) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }) + '\n'
}

// Each part command is a process of its own, and one that fails or times out leaves no trace in the session: every
// part's heading says what to do when a part is missing.
function partHeading(k, n, root = PLUGIN_ROOT) {
  const file = path.join(root, 'skills', 'using-aether', 'SKILL.md')
  return (
    [
      "You are the Lead of Aether mode: the owner's right hand.",
      `Aether mode bootstrap, part ${k} of ${n}: read all ${n} parts before you act, whatever order they arrive in; if a part from 1 to ${n} did not reach you, read the whole file ${file} before you act.`,
    ].join('\n') + '\n\n'
  )
}

// The offsets of text where a line starts that matches the pattern, after offset 0.
function lineStarts(text, pattern) {
  const starts = []
  for (const m of text.matchAll(pattern)) if (m.index > 0) starts.push(m.index)
  return starts
}

// Splits a text into the fewest consecutive slices whose part output (heading and slice) is at most limit
// characters. A cut falls just before a line that starts with "## ", so a section that fits in a part is never split
// and the blank line before a heading ends the slice before it; only a section that cannot fit in a part of its own is
// cut at its blank lines, then at its line breaks, then anywhere. The parts are { heading, slice, context, output };
// the slices joined give the text back, byte for byte. root is the plugin folder that the headings name.
function splitParts(text, root, limit = PART_LIMIT) {
  const levels = [lineStarts(text, /^## /gm), lineStarts(text, /(?<=\n\n)/g), lineStarts(text, /(?<=\n)/g)]
  for (const cuts of levels) cuts.push(text.length)
  const split = (n) => {
    const fits = (from, to) => contextOutput(partHeading(n, n, root) + text.slice(from, to)).length <= limit
    const slices = []
    let from = 0
    while (from < text.length) {
      let to = -1
      for (const cuts of levels) {
        // The furthest cut of this level that still fits: the size only grows with the slice.
        for (const cut of cuts) {
          if (cut <= from) continue
          if (!fits(from, cut)) break
          to = cut
        }
        if (to > 0) break
      }
      if (to < 0) {
        to = from + 1
        while (to < text.length && fits(from, to + 1)) to += 1
      }
      slices.push(text.slice(from, to))
      from = to
    }
    return slices
  }
  // A part's heading is longest with k = n, and its length grows with the digits of n (twice in it): split again while
  // the count has more digits than the split assumed.
  let assumed = 1
  let slices = split(assumed)
  while (String(slices.length).length > String(assumed).length) {
    assumed = slices.length
    slices = split(assumed)
  }
  const n = slices.length
  return slices.map((slice, i) => {
    const heading = partHeading(i + 1, n, root)
    const context = heading + slice
    return { heading, slice, context, output: contextOutput(context) }
  })
}

// The parts of the using-aether bootstrap of the plugin at root, as splitParts gives them.
function bootstrapParts(root) {
  return splitParts(bootstrap(root), root)
}

// The plugin's version, read from <root>/.claude-plugin/plugin.json; '' when it cannot be read.
function pluginVersion(root) {
  try {
    const { version } = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
    return typeof version === 'string' ? version.trim() : ''
  } catch {
    return ''
  }
}

// The line Claude Code shows the person (the hook's top-level systemMessage) when a Lead session starts: Spanish when
// the first non-empty of LC_ALL, LC_MESSAGES and LANG starts with es, English otherwise.
function welcome(root, env) {
  const locale = ['LC_ALL', 'LC_MESSAGES', 'LANG'].map((name) => env[name]).find((value) => typeof value === 'string' && value !== '') || ''
  const version = pluginVersion(root)
  const name = version ? `Aether ${version}` : 'Aether'
  if (/^es/i.test(locale)) return `${name} · Lead listo · dime lo que quieres, o escribe /aether:help para ver qué puedo hacer`
  return `${name} · Lead ready · tell me what you want, or type /aether:help to see what I can do`
}

function sweepNote(cwd, env) {
  try {
    const { sweepStale } = require('./worktrees.js')
    const { dataDir } = require('./run.js')
    const { swept } = sweepStale(cwd, { dataDir: dataDir(env) })
    return swept.length ? `Aether swept ${swept.length} stale run(s): ${swept.join(', ')}.` : ''
  } catch (err) {
    if (/not a git repository/i.test(err.message)) return ''
    return `Aether could not sweep stale runs: ${err.message}`
  }
}

function autonomyNote(cwd) {
  try {
    const { repoPaths } = require('./git.js')
    const { openRun, runPaths, status } = require('./autonomy.js')
    const { mainRoot } = repoPaths(cwd)
    const run = openRun(mainRoot)
    if (!run) return ''
    const { diary } = runPaths(mainRoot, run.id)
    let note = `Autonomous run ${run.id} is open: load the aether:autonomous-runs skill, then read ${diary} and run \`aether-autonomy status\` before anything else.`
    const current = status(mainRoot)
    if (current && current.stop === 'quota' && current.quota) {
      note += ` The run is paused by the quota brake: the five-hour window resets ${current.quota.resetsAt} and the run resumes ${current.quota.resumeAt}. Do not start anything of this run before then; Aether re-arms the resume in this session.`
    }
    return note
  } catch {
    return ''
  }
}

// The usage meter's files grow with every session, and so do the lane log, the observation files and the
// session markers: sessions not written to for 30 days go, from all of them, after the observation digest has
// kept their counts. A session whose spend cannot be archived stays, and the prunes leave a trace of it in
// prune-failures.json (lib/spend-archive.js).
function pruneOldFiles(env) {
  // The observation comes first: its digest summarizes a source before its prune deletes it. It has a try of its own, so
  // that an error in it never stops the prunes below.
  try {
    const { pruneObserve } = require('./observe-digest.js')
    const { dataDir } = require('./run.js')
    pruneObserve(dataDir(env), { days: 30 })
  } catch {
    // Housekeeping: a failed digest never blocks the session or the other prunes.
  }
  let dir = null
  try {
    const { pruneUsage: prune } = require('./report.js')
    const { pruneLog } = require('./lanes.js')
    const { pruneSessions } = require('./session.js')
    const { pruneDelegateLog } = require('./delegate-prune.js')
    const { dataDir } = require('./run.js')
    dir = dataDir(env)
    prune(dir, { days: 30 })
    pruneLog(dir, { days: 30 })
    pruneSessions(dir, { days: 30 })
    pruneDelegateLog(dir, { days: 30 })
    require('./spend-archive.js').clearFailure(dir, 'session-start')
  } catch (err) {
    // Pruning is housekeeping: it never blocks the session. What stopped it is left in the trace, which does not
    // throw either.
    try {
      if (dir !== null) require('./spend-archive.js').noteFailure(dir, 'session-start', err)
    } catch {}
  }
}

// The sources that calculate and display a continuity notice (spec 030 R5, R7).
const NOTICE_SOURCES = ['startup', 'clear', 'fork']

// Marks the session; returns the reason it could not, or '' when it did.
function mark(sessionId, env, { cwd = process.cwd(), procRoot = '/proc', from = process.ppid, now = Date.now() } = {}) {
  try {
    const { markSession, delegateSettingsFrom, brakeSettingsFrom, readMark, markerFile } = require('./session.js')
    const { dataDir } = require('./run.js')
    const { repoPaths } = require('./git.js')
    const { claudeProcess } = require('./continuity-store.js')
    const { writeFileAtomic } = require('./common.js')
    const dir = dataDir(env)
    const noteDir = readMark(dir, sessionId)?.noteDir
    let repo = null
    try {
      repo = repoPaths(cwd).mainRoot
    } catch {
      repo = null
    }
    const claude = repo !== null ? claudeProcess({ procRoot, from }) : null
    // The ops option is on unless it is exactly false: the mod reads the session's ops-off file.
    // The superdelegation option, the harnesses and the quota deadline go to the session's delegate file, which
    // aether-delegate reads.
    // The brake settings go to the session's brake file.
    markSession(dir, sessionId, now, {
      opsInMod: env.CLAUDE_PLUGIN_OPTION_OPS !== 'false',
      delegate: delegateSettingsFrom(env),
      brake: brakeSettingsFrom(env),
      repo,
      claude,
    })
    // Resume and compact reuse the note: keep its recorded folder when refreshing the mark, so SessionEnd
    // can still close it without git (spec 030 R3).
    if (typeof noteDir === 'string' && noteDir !== '') {
      writeFileAtomic(markerFile(dir, sessionId), JSON.stringify({ ...readMark(dir, sessionId), noteDir }) + '\n')
    }
    return ''
  } catch (err) {
    return (err && err.message) || String(err)
  }
}

// Appends the superdelegation option and the harness list to CLAUDE_ENV_FILE; returns false when it
// could not. The option is resolved by lib/superdelegation.js, and the list is the option's known names,
// or agy when none is valid: lanes.js reads it the same way.
function passSuperdelegation(env) {
  const file = env.CLAUDE_ENV_FILE
  if (!file) return false
  try {
    const { resolveOption } = require('./superdelegation.js')
    const { enabledHarnesses } = require('./lanes.js')
    const { on } = resolveOption(env)
    const harnesses = enabledHarnesses({ AETHER_LANE_HARNESSES: env.CLAUDE_PLUGIN_OPTION_HARNESSES })
    fs.appendFileSync(file, `export AETHER_SUPERDELEGATION=${on ? 'on' : 'off'}\nexport AETHER_LANE_HARNESSES=${harnesses.join(',')}\n`)
    return true
  } catch {
    return false
  }
}

// The legacy folders migrate checks (spec 030 R19).
const OLD_MIGRATION_FOLDERS = [
  path.join('.aether', 'lanes'),
  path.join('.aether', 'exams'),
  path.join('.aether', 'seats'),
  path.join('.aether', 'delegates'),
  '.aether-tmp',
  '.aether-exam',
]

function main({ input = null, part = null, env = process.env, cwd = process.cwd(), stdout = process.stdout, procRoot = '/proc', from = process.ppid, now = Date.now() } = {}) {
  if (!input) return
  const { LEAD_AGENT } = require('./session.js')
  if (input.agent_type !== LEAD_AGENT) return

  const root = env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..')
  const source = input.source === undefined ? 'startup' : input.source
  const injects = ['startup', 'clear', 'compact'].includes(source)

  // A part command prints its part of the bootstrap and does nothing else: the notes command has the side effects.
  if (part !== null) {
    if (!injects || !/^[1-9]\d*$/.test(String(part))) return
    const found = bootstrapParts(root)[Number(part) - 1]
    if (found) stdout.write(found.output)
    return
  }

  // mainRoot is the main checkout, where the notes, the runs and the .aether/ state are kept and idle skills are counted.
  // workRoot is the top of the working copy the Lead starts in, where the project's own files (CLAUDE.md, AGENTS.md,
  // skills) are read for the disorder notice. Both are null outside git.
  let mainRoot = null
  let workRoot = null
  try {
    const { repoPaths } = require('./git.js')
    const paths = repoPaths(cwd)
    mainRoot = paths.mainRoot
    workRoot = paths.worktree
  } catch {
    mainRoot = null
    workRoot = null
  }

  // 1. Before this session writes anything: evaluate the migration gate (spec 030 R19).
  let gate = null
  if (mainRoot !== null && injects) {
    try {
      const { migrationGate } = require('./tree-migrate.js')
      const { claudeProcess } = require('./continuity-store.js')
      const { dataDir } = require('./run.js')
      gate = migrationGate(mainRoot, {
        dataDir: dataDir(env),
        now,
        selfSession: input.session_id,
        selfProcess: claudeProcess({ procRoot, from }),
        procRoot,
      })
    } catch {}
  }

  // 2. Mark the session and pass superdelegation.
  const markFailure = mark(input.session_id, env, { cwd, procRoot, from, now })
  const passed = passSuperdelegation(env)

  const noteInput = input.cwd ? input : { ...input, cwd }

  // Resume gives no notice and prints nothing, but refreshes its session note process (spec 030 R5).
  if (source === 'resume') {
    try {
      const { continuityDir, claudeProcess, readNote, updateNote } = require('./continuity-store.js')
      const { openNote } = require('./continuity-hook.js')
      const dir = continuityDir({ cwd, env })
      const id = input.session_id
      if (!readNote(dir, id)) {
        openNote(noteInput, { env, procRoot, from, source: 'resume', fork: false })
      }
      const selfProcess = claudeProcess({ procRoot, from })
      const refreshed = updateNote(dir, id, { source: 'resume', process: selfProcess, closed: null, cut: null })
      // A note can outlive its session marker. Reconnect it so SessionEnd can close it without git.
      if (refreshed) {
        const { dataDir } = require('./run.js')
        const { readMark, markerFile } = require('./session.js')
        const { writeFileAtomic } = require('./common.js')
        const data = dataDir(env)
        const marker = readMark(data, id)
        if (marker && marker.noteDir !== dir) {
          writeFileAtomic(markerFile(data, id), JSON.stringify({ ...marker, noteDir: dir }) + '\n')
        }
      }
    } catch {}
    return
  }

  if (!NOTICE_SOURCES.includes(source) && source !== 'compact') return

  if (source === 'fork') {
    let noticeLines = []
    try {
      const { continuityDir, claudeProcess } = require('./continuity-store.js')
      const { notice } = require('./continuity-notice.js')
      const { openNote } = require('./continuity-hook.js')
      const { dataDir } = require('./run.js')
      const dir = continuityDir({ cwd, env })
      const selfProcess = claudeProcess({ procRoot, from })
      const res = notice({ cwd, session: input.session_id, source, dataDir: dataDir(env), dir, env, procRoot, selfProcess })
      // A fork with no earlier session has nothing to tell anyone.
      noticeLines = Array.isArray(res?.lines) && !res.first ? [...res.lines] : []
      openNote(noteInput, { env, procRoot, from, source, fork: true })
    } catch {}

    const buildForkPayload = (lines) => {
      const text = lines.join('\n')
      return JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
        systemMessage: text,
      }) + '\n'
    }
    while (noticeLines.length > 1 && buildForkPayload(noticeLines).length > PART_LIMIT) {
      noticeLines.pop()
    }
    stdout.write(buildForkPayload(noticeLines))
    return
  }

  // 3. Migrate legacy state if gate allows (spec 030 R19).
  let migrationNote = ''
  if (mainRoot !== null && injects && gate) {
    try {
      const { migrate } = require('./tree-migrate.js')
      if (gate.move) {
        const res = migrate(mainRoot, { gate })
        if (res.moved.length > 0) {
          migrationNote = `Aether moved the old state of .aether/ to its new places (${res.moved.length} folders).`
          if (res.kept.length > 0) {
            const why = res.kept.map((k) => k.why || String(k)).join(', ')
            migrationNote += ` Aether left ${res.kept.length} old folder(s) of .aether/ where they are: ${why}.`
          }
        } else if (res.kept.length > 0) {
          const why = res.kept.map((k) => k.why || String(k)).join(', ')
          migrationNote = `Aether left ${res.kept.length} old folder(s) of .aether/ where they are: ${why}.`
        }
      } else {
        const hasOld = OLD_MIGRATION_FOLDERS.some((f) => fs.existsSync(path.join(mainRoot, f)))
        if (hasOld) {
          migrationNote = `Aether left the old state of .aether/ where it is for now: ${gate.reasons.join(', ')}.`
        }
      }
    } catch {}
  }

  // 4. Ensure README map exists (spec 030 R14).
  if (mainRoot !== null && injects) {
    try {
      const { ensureReadme } = require('./tree-map.js')
      ensureReadme(mainRoot)
    } catch {}
  }

  // 5. Clean project temporary and stale items (spec 030 R17).
  let cleanNote = ''
  if (mainRoot !== null && injects) {
    try {
      const { cleanProject } = require('./tree-clean.js')
      const { dataDir } = require('./run.js')
      const cleanRes = cleanProject(cwd, { dataDir: dataDir(env), now })
      if (cleanRes?.removed?.length > 0) {
        cleanNote = `Aether cleaned ${cleanRes.removed.length} old item(s) of .aether/.`
      }
    } catch {}
  }

  let noticeLines = []
  // A first session in a project (no earlier note): its one line goes only to the person at startup, never to the
  // Lead's context, so a project with no notes keeps the context it always had.
  let firstSession = false
  let dir = null
  if (NOTICE_SOURCES.includes(source)) {
    try {
      const { continuityDir, claudeProcess } = require('./continuity-store.js')
      const { notice } = require('./continuity-notice.js')
      const { openNote } = require('./continuity-hook.js')
      const { dataDir } = require('./run.js')
      dir = continuityDir({ cwd, env })
      const selfProcess = claudeProcess({ procRoot, from })
      const res = notice({ cwd, session: input.session_id, source, dataDir: dataDir(env), dir, env, procRoot, selfProcess })
      noticeLines = Array.isArray(res?.lines) ? [...res.lines] : []
      firstSession = Boolean(res?.first)
      openNote(noteInput, { env, procRoot, from, source, fork: false })
    } catch {}
  }

  // 6. Prune old files and notes.
  pruneOldFiles(env)
  if (dir && (source === 'startup' || source === 'clear')) {
    try {
      const { pruneNotes } = require('./continuity-store.js')
      pruneNotes(dir, { cwd })
    } catch {}
  }

  let tidyLines = []
  let idleLines = []
  if (source === 'startup' || source === 'clear') {
    try {
      const os = require('node:os')
      const { isSpanish } = require('./continuity-store.js')
      const { detect, noticeLines: tidyNoticeLines } = require('./tidy-detect.js')
      const home = env.HOME || os.homedir()
      const spanish = isSpanish(env)
      const findings = detect(workRoot ?? cwd, { home })?.findings || []
      const lines = tidyNoticeLines(findings, { spanish })
      if (Array.isArray(lines) && lines.length > 0) {
        tidyLines = [...lines]
      }
    } catch {}
    if (mainRoot !== null) {
      try {
        const { dataDir } = require('./run.js')
        const { isSpanish } = require('./continuity-store.js')
        const { idleSkills, idleLine } = require('./skill-idle.js')
        const spanish = isSpanish(env)
        const idle = idleSkills(dataDir(env), { repo: mainRoot, now })
        const line = idleLine(idle.map((s) => s.name), { spanish })
        if (line) {
          idleLines = [line]
        }
      } catch {}
    }
  }

  const baseContext = [
    'Aether mode is active.',
    passed ? '' : "Aether could not pass the superdelegation option to this session's commands, so superdelegation is off.",
    markFailure ? `Aether could not mark this session (${markFailure}): the spec and plan guard and the usage meter are off in it.` : '',
    migrationNote,
    cleanNote,
    sweepNote(cwd, env),
  ].filter(Boolean).join('\n\n')
  // The open run's note stays the last thing of the context (tests/session-start-autonomy.test.js): the continuity notice
  // goes before it.
  const runNote = autonomyNote(cwd)

  // The welcome line is for the person and only at startup: a clear or a compact inside a session adds none. At startup the
  // notices of confirmed issues (spec 020) are shown too, oldest first, claiming only those that keep the whole output within
  // PART_LIMIT: one that does not fit stays pending without holding back a smaller later one.
  const welcomeLine = source === 'startup' ? welcome(root, env) : null
  let noticeLine = () => ''
  // The continuity notice that goes to the Lead's context (none for a project's first session), and the whole context.
  const contextOf = (lines) => {
    const contextNotice = firstSession ? '' : lines.join('\n')
    const additionalContext = [baseContext, contextNotice, tidyLines.join('\n'), idleLines.join('\n'), runNote]
      .filter(Boolean)
      .join('\n\n')
    return { contextNotice, additionalContext }
  }
  const buildPayload = (lines, issueNotices = []) => {
    const { contextNotice, additionalContext } = contextOf(lines)
    const output = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext } }
    if (welcomeLine !== null) {
      const sysLines = [welcomeLine, ...lines, ...issueNotices.map((n) => noticeLine(n))].filter((s) => typeof s === 'string' && s !== '')
      output.systemMessage = sysLines.join('\n')
    } else if (source === 'clear' && contextNotice) {
      output.systemMessage = contextNotice
    }
    return JSON.stringify(output) + '\n'
  }

  // The payload holds the whole context, so its length is the one to check: the disorder and idle lines go first.
  while ((tidyLines.length > 0 || idleLines.length > 0) && buildPayload(noticeLines).length > PART_LIMIT) {
    if (idleLines.length > 0) {
      idleLines.pop()
    } else {
      tidyLines.pop()
    }
  }

  while (noticeLines.length > 1 && buildPayload(noticeLines).length > PART_LIMIT) {
    noticeLines.pop()
  }

  let issueNotices = []
  if (welcomeLine !== null) {
    try {
      const { dataDir } = require('./run.js')
      const store = require('./observe-notice.js')
      noticeLine = store.noticeLine
      issueNotices = store.takeNotices(dataDir(env), (list) => buildPayload(noticeLines, list).length <= PART_LIMIT)
    } catch { /* A notice must never stop startup. */ }
  }
  stdout.write(buildPayload(noticeLines, issueNotices))
}

module.exports = {
  NOTICE_SOURCES,
  PART_LIMIT,
  bootstrapParts,
  splitParts,
  main,
}
