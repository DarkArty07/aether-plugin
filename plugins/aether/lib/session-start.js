'use strict'

// SessionStart hook handler for Aether mode. It marks the session and injects context for the Lead agent.
// Called by bin/aether-session-start when a Claude Code session begins.
// Family: session.

// SessionStart hook. It acts only for the Lead (agent_type aether:lead): any other session
// gets no output, no file and no sweep. hooks/hooks.json runs it six times in one entry (issue #139):
// - with no --part, the notes command marks the session, hands the superdelegation option to the session's
//   commands through CLAUDE_ENV_FILE, and, on startup, clear and compact, prunes old usage files, lane logs,
//   observation files and session markers (the observation digest keeps their counts first), sweeps stale runs
//   in the session's repository and prints "Aether mode is active." with its notes (an open autonomous run, the
//   sweep, what it could not do). On startup only it also adds the hook's top-level systemMessage, a welcome
//   line for the person with the plugin's version and /aether:help (spec 024 R9).
// - with --part k, on startup, clear and compact, it prints part k of the using-aether bootstrap and does
//   nothing else; nothing when the bootstrap has fewer than k parts.
// Claude Code delivers a hook's output whole only up to 10,000 characters and gives a longer one as a preview and
// a file, so the bootstrap goes in parts whose whole output stays within PART_LIMIT.

const fs = require('node:fs')
const path = require('node:path')

// The most characters of a part command's whole standard output, the JSON with its escapes and its newline:
// under Claude Code's 10,000-character cut per hook output, measured in issue #139.
const PART_LIMIT = 9800

// Claude Code replaces ${CLAUDE_PLUGIN_ROOT} in a skill's content but not in a hook's additionalContext,
// so the bootstrap gets the plugin folder's absolute path here, where the Lead can read the files it names.
function bootstrap(root) {
  const raw = fs.readFileSync(path.join(root, 'skills', 'using-aether', 'SKILL.md'), 'utf8')
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim().split('${CLAUDE_PLUGIN_ROOT}').join(root)
}

// The whole standard output of a command that injects a context.
function contextOutput(context) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }) + '\n'
}

const partHeading = (k, n) => `Aether mode, part ${k} of ${n}.\n\n`

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
// the slices joined give the text back, byte for byte.
function splitParts(text, limit = PART_LIMIT) {
  const levels = [lineStarts(text, /^## /gm), lineStarts(text, /(?<=\n\n)/g), lineStarts(text, /(?<=\n)/g)]
  for (const cuts of levels) cuts.push(text.length)
  const split = (n) => {
    const fits = (from, to) => contextOutput(partHeading(n, n) + text.slice(from, to)).length <= limit
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
  // A part's heading is longest with k = n, and its length grows with the digits of n: split again while the count
  // has more digits than the split assumed.
  let assumed = 1
  let slices = split(assumed)
  while (String(slices.length).length > String(assumed).length) {
    assumed = slices.length
    slices = split(assumed)
  }
  const n = slices.length
  return slices.map((slice, i) => {
    const heading = partHeading(i + 1, n)
    const context = heading + slice
    return { heading, slice, context, output: contextOutput(context) }
  })
}

// The parts of the using-aether bootstrap of the plugin at root, as splitParts gives them.
function bootstrapParts(root) {
  return splitParts(bootstrap(root))
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

function sweepNote(cwd) {
  try {
    const { sweepStale } = require('./worktrees.js')
    const { swept } = sweepStale(cwd)
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
    const { dataDir } = require('./run.js')
    dir = dataDir(env)
    prune(dir, { days: 30 })
    pruneLog(dir, { days: 30 })
    pruneSessions(dir, { days: 30 })
    require('./spend-archive.js').clearFailure(dir, 'session-start')
  } catch (err) {
    // Pruning is housekeeping: it never blocks the session. What stopped it is left in the trace, which does not
    // throw either.
    try {
      if (dir !== null) require('./spend-archive.js').noteFailure(dir, 'session-start', err)
    } catch {}
  }
}

// Marks the session; returns the reason it could not, or '' when it did.
function mark(sessionId, env) {
  try {
    const { markSession, delegateSettingsFrom, brakeSettingsFrom } = require('./session.js')
    const { dataDir } = require('./run.js')
    // The ops option is on unless it is exactly false: the mod reads the session's ops-off file.
    // The superdelegation option, the harnesses and the quota deadline go to the session's delegate file, which
    // aether-delegate reads.
    // The brake settings go to the session's brake file.
    markSession(dataDir(env), sessionId, Date.now(), {
      opsInMod: env.CLAUDE_PLUGIN_OPTION_OPS !== 'false',
      delegate: delegateSettingsFrom(env),
      brake: brakeSettingsFrom(env),
    })
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

function main({ input = null, part = null, env = process.env, cwd = process.cwd(), stdout = process.stdout } = {}) {
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

  const markFailure = mark(input.session_id, env)
  const passed = passSuperdelegation(env)
  if (!injects) return

  pruneOldFiles(env)
  const context = [
    'Aether mode is active.',
    passed ? '' : "Aether could not pass the superdelegation option to this session's commands, so superdelegation is off.",
    markFailure ? `Aether could not mark this session (${markFailure}): the spec and plan guard and the usage meter are off in it.` : '',
    sweepNote(cwd),
    autonomyNote(cwd),
  ].filter(Boolean).join('\n\n')
  const output = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }
  // The welcome line is for the person and only at startup: a clear or a compact inside a session adds none.
  if (source === 'startup') output.systemMessage = welcome(root, env)
  stdout.write(JSON.stringify(output) + '\n')
}

module.exports = {
  PART_LIMIT,
  bootstrapParts,
  splitParts,
  main,
}
