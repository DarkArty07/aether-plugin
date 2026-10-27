'use strict'

// SessionStart hook handler for Aether mode. It marks the session and injects context for the Lead agent.
// Called by bin/aether-session-start when a Claude Code session begins.
// Family: session.

// SessionStart hook. It acts only for the Lead (agent_type aether:lead): any other session
// gets no output, no file and no sweep. For the Lead it marks the session, hands the superdelegation
// option to the session's commands through CLAUDE_ENV_FILE, and, on startup, clear and
// compact, injects the using-aether bootstrap, points to an open autonomous run, sweeps
// stale runs in the session's repository, and prunes old usage files, lane logs,
// observation files and session markers (the observation digest keeps their counts first).

const fs = require('node:fs')
const path = require('node:path')

// Claude Code replaces ${CLAUDE_PLUGIN_ROOT} in a skill's content but not in a hook's additionalContext,
// so the bootstrap gets the plugin folder's absolute path here, where the Lead can read the files it names.
function bootstrap(root) {
  const raw = fs.readFileSync(path.join(root, 'skills', 'using-aether', 'SKILL.md'), 'utf8')
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim().split('${CLAUDE_PLUGIN_ROOT}').join(root)
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
  let dir = null
  try {
    const { pruneUsage: prune } = require('./report.js')
    const { pruneLog } = require('./lanes.js')
    const { pruneSessions } = require('./session.js')
    const { dataDir } = require('./run.js')
    dir = dataDir(env)
    // The digest and the prune of the observation files come first: a source is summarized before any prune deletes it.
    const { digestAll, pruneObserve } = require('./observe-digest.js')
    digestAll(dir)
    pruneObserve(dir, { days: 30 })
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

function main({ input = null, env = process.env, cwd = process.cwd(), stdout = process.stdout } = {}) {
  if (!input) return
  const { LEAD_AGENT } = require('./session.js')
  if (input.agent_type !== LEAD_AGENT) return

  const root = env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..')
  const markFailure = mark(input.session_id, env)
  const passed = passSuperdelegation(env)

  const source = input.source === undefined ? 'startup' : input.source
  if (!['startup', 'clear', 'compact'].includes(source)) return

  pruneOldFiles(env)
  const context = [
    'Aether mode is active.',
    bootstrap(root),
    passed ? '' : "Aether could not pass the superdelegation option to this session's commands, so superdelegation is off.",
    markFailure ? `Aether could not mark this session (${markFailure}): the spec and plan guard and the usage meter are off in it.` : '',
    sweepNote(cwd),
    autonomyNote(cwd),
  ].filter(Boolean).join('\n\n')
  stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }) + '\n')
}

module.exports = {
  main,
}
