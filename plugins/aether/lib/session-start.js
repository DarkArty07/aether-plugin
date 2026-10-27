'use strict'

// Handles session start initialization, marking, and context injection for Aether mode.
// Called by bin/aether-session-start when a Claude Code session begins.
// Family: session.

const fs = require('node:fs')
const path = require('node:path')

const { sweepStale } = require('./worktrees.js')
const { repoPaths } = require('./git.js')
const { openRun, runPaths, status } = require('./autonomy.js')
const { pruneUsage } = require('./report.js')
const { pruneLog, enabledHarnesses } = require('./lanes.js')
const {
  LEAD_AGENT,
  markSession,
  delegateSettingsFrom,
  brakeSettingsFrom,
  pruneSessions,
} = require('./session.js')
const { dataDir } = require('./run.js')
const { digestAll, pruneObserve } = require('./observe-digest.js')
const spendArchive = require('./spend-archive.js')
const { resolveOption } = require('./superdelegation.js')

function bootstrap(root) {
  const raw = fs.readFileSync(path.join(root, 'skills', 'using-aether', 'SKILL.md'), 'utf8')
  return raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim().split('${CLAUDE_PLUGIN_ROOT}').join(root)
}

function sweepNote(cwd) {
  try {
    const { swept } = sweepStale(cwd)
    return swept.length ? `Aether swept ${swept.length} stale run(s): ${swept.join(', ')}.` : ''
  } catch (err) {
    if (/not a git repository/i.test(err.message)) return ''
    return `Aether could not sweep stale runs: ${err.message}`
  }
}

function autonomyNote(cwd) {
  try {
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

function pruneOldFiles(env) {
  let dir = null
  try {
    dir = dataDir(env)
    digestAll(dir)
    pruneObserve(dir, { days: 30 })
    pruneUsage(dir, { days: 30 })
    pruneLog(dir, { days: 30 })
    pruneSessions(dir, { days: 30 })
    spendArchive.clearFailure(dir, 'session-start')
  } catch (err) {
    try {
      if (dir !== null) spendArchive.noteFailure(dir, 'session-start', err)
    } catch {}
  }
}

function mark(sessionId, env) {
  try {
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

function passSuperdelegation(env) {
  const file = env.CLAUDE_ENV_FILE
  if (!file) return false
  try {
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
