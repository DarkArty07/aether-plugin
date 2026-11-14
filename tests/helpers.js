'use strict'

// Scrubbed first, before anything else: no child a test starts may inherit Node's env-proxy switch (issue #254).
require('./env-proxy.js')

// Shared test fixtures: throwaway git repositories and CLI runners.
// Every temporary directory is removed when its test ends.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const PLUGIN = path.join(__dirname, '..', 'plugins', 'aether')
const PLAN_BIN = path.join(PLUGIN, 'bin', 'aether-plan')
const WT_BIN = path.join(PLUGIN, 'bin', 'aether-wt')
const SESSION_BIN = path.join(PLUGIN, 'bin', 'aether-session-start')
// A lane table that does not exist, so a bin run by a test sees no lanes unless the test names a table.
const NO_LANES_CONFIG = path.join(os.tmpdir(), 'aether-no-lanes', 'lanes.json')
// The AETHER_* variables the libs, bins and hooks read. A test inherits none of them: a suite run inside an
// Aether session would otherwise see that session's lanes and modes (issue #69). A test that needs one sets it
// on purpose, through the env argument of runBin or through process.env after this file loads.
// tests/env-scrub.test.js fails when the code reads a name that is not listed here.
const AETHER_VARIABLES = [
  'AETHER_AUTOISSUE',
  'AETHER_DATA_DIR',
  'AETHER_IRREVERSIBLE',
  'AETHER_LANES_CONFIG',
  'AETHER_LANE_CALL',
  'AETHER_LANE_HARNESSES',
  'AETHER_OBSERVE',
  'AETHER_PAIRS_CONFIG',
  'AETHER_PERMISSION_MODE',
  'AETHER_SKILLS_CONFIG',
  'AETHER_SUPERDELEGATION',
]
// Every child process gets process.env, so this covers the environment the helper hands to children and the
// in-process reads of a test file alike. Each test file runs in a process of its own (node --test).
// Every AETHER_* variable in the environment is cleared, the listed ones and any other: the shell that runs the suite may export
// variables the code does not read (the owner's own settings, a retired name), and a test must not inherit those either (the
// scan in tests/env-scrub.test.js still compares the list with what the code reads).
for (const name of Object.keys(process.env)) if (name.startsWith('AETHER_')) delete process.env[name]
delete process.env.CLAUDE_PLUGIN_OPTION_OBSERVEDEV
delete process.env.CLAUDE_PLUGIN_OPTION_AUTOISSUE

// The owner's real home comes from the account, not from HOME, and is read before HOME moves. A test must never write
// under it: the Claude config folder and the home point at a temporary folder (removed when the process exits), so the
// continuity notes and the memory folders of the owner's projects stay untouched (spec 030 R44). git still reads the
// owner's global configuration (name, mail, default branch) from the real file, named by GIT_CONFIG_GLOBAL.
const REAL_HOME = os.userInfo().homedir
const REAL_GIT_CONFIG = process.env.GIT_CONFIG_GLOBAL || path.join(REAL_HOME, '.gitconfig')
const SCRATCH_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aether-test-home-')))
process.on('exit', () => fs.rmSync(SCRATCH_HOME, { recursive: true, force: true }))
process.env.GIT_CONFIG_GLOBAL = REAL_GIT_CONFIG
process.env.HOME = SCRATCH_HOME
process.env.CLAUDE_CONFIG_DIR = path.join(SCRATCH_HOME, '.claude')

function tempDir(t, prefix = 'aether-test-') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function run(command, args, cwd, env = {}) {
  const r = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, AETHER_LANES_CONFIG: NO_LANES_CONFIG, AETHER_SUPERDELEGATION: 'on', ...env },
  })
  if (r.error) throw r.error
  return r
}

function makeRepo(t, { prefix = 'aether-test-' } = {}) {
  const dir = tempDir(t, prefix)
  const git = (...args) => {
    const r = run('git', args, dir)
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`)
    return r.stdout.trim()
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Aether Test')
  git('config', 'user.email', 'aether-test@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n')
  git('add', 'README.md')
  git('commit', '-q', '-m', 'base')
  git('switch', '-q', '-c', 'feature/x')
  return { dir, git }
}

function writePlan(dir, markdown) {
  const file = path.join(dir, 'plan.md')
  fs.writeFileSync(file, markdown)
  return file
}

function runBin(bin, args, cwd, env = {}) {
  const r = run(process.execPath, [bin, ...args], cwd, env)
  let json = null
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    json = null
  }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

function compile(repo, markdown, extra = []) {
  const r = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, markdown), ...extra], repo.dir)
  if (r.status !== 0) throw new Error(`compile failed: ${r.stdout}${r.stderr}`)
  return r.json
}

function commitIn(repo, dir, file, content, message) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), content)
  repo.git('-C', dir, 'add', file)
  repo.git('-C', dir, 'commit', '-q', '-m', message)
}

function useDataDir(t) {
  const dir = tempDir(t, 'aether-data-')
  const previous = process.env.AETHER_DATA_DIR
  process.env.AETHER_DATA_DIR = dir
  t.after(() => {
    if (previous === undefined) delete process.env.AETHER_DATA_DIR
    else process.env.AETHER_DATA_DIR = previous
  })
  return dir
}

function age(dir, hours) {
  const when = new Date(Date.now() - hours * 3600 * 1000)
  for (const entry of fs.readdirSync(dir, { recursive: true })) fs.utimesSync(path.join(dir, entry), when, when)
  fs.utimesSync(dir, when, when)
}

// Ages a run's directory and, when it has unit worktrees, those too.
function ageRun(args, hours) {
  age(args.runDir, hours)
  const worktrees = path.join(args.repoRoot, '.aether', 'worktrees', args.runId)
  if (fs.existsSync(worktrees)) age(worktrees, hours)
}

// The SessionStart commands of hooks/hooks.json, as the arguments each gives aether-session-start: the notes command
// (no argument) first, then the part commands (issue #139).
const SESSION_COMMANDS = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
  .hooks.SessionStart.flatMap((entry) => entry.hooks)
  .map((hook) => /\/bin\/aether-session-start"(.*)$/.exec(hook.command))
  .filter(Boolean)
  .map((m) => m[1].trim().split(/\s+/).filter(Boolean))
const PART_COMMANDS = SESSION_COMMANDS.filter((args) => args[0] === '--part')

// The start of a Lead session, as the session-start tests give it to the hook.
const LEAD_START = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' }

// Runs aether-session-start once, with the given arguments, as a hook runs it: the input on stdin.
function runSessionStart(cwd, env, input = LEAD_START, args = []) {
  const r = spawnSync(process.execPath, [SESSION_BIN, ...args], {
    cwd,
    encoding: 'utf8',
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env,
  })
  if (r.error) throw r.error
  return r
}

// Runs the part commands of hooks/hooks.json in order and returns what they print: outputs (each command's whole
// standard output, '' when it printed nothing), contexts (the additionalContext of each part that printed) and
// bootstrap (the parts' contexts without their heading, joined in order). It throws when a command fails, when a part
// does not carry its heading, or when a command prints after one that printed nothing.
// The heading of part k of n: what to do when a part is missing, with the rules' file in the plugin at root.
function partHeading(k, n, root = PLUGIN) {
  const file = path.join(root, 'skills', 'using-aether', 'SKILL.md')
  return (
    [
      "You are the Lead of Aether mode: the owner's right hand.",
      `Aether mode bootstrap, part ${k} of ${n}: read all ${n} parts before you act, whatever order they arrive in; if a part from 1 to ${n} did not reach you, read the whole file ${file} before you act.`,
    ].join('\n') + '\n\n'
  )
}

function leadParts(cwd, env, input = LEAD_START) {
  const outputs = PART_COMMANDS.map((args) => {
    const r = runSessionStart(cwd, env, input, args)
    if (r.status !== 0) throw new Error(`aether-session-start ${args.join(' ')} exited ${r.status}: ${r.stderr}`)
    return r.stdout
  })
  const printed = outputs.filter((out) => out !== '')
  if (outputs.slice(0, printed.length).some((out) => out === '')) throw new Error('a part command printed after one that printed nothing')
  const contexts = printed.map((out) => JSON.parse(out).hookSpecificOutput.additionalContext)
  const slices = contexts.map((context, i) => {
    const heading = partHeading(i + 1, printed.length, env.CLAUDE_PLUGIN_ROOT || PLUGIN)
    if (!context.startsWith(heading)) throw new Error(`part ${i + 1} does not start with its heading: ${context.slice(0, 80)}`)
    return context.slice(heading.length)
  })
  return { outputs, contexts, bootstrap: slices.join('') }
}

module.exports = {
  PLUGIN,
  REAL_HOME,
  PLAN_BIN,
  WT_BIN,
  SESSION_BIN,
  SESSION_COMMANDS,
  PART_COMMANDS,
  LEAD_START,
  NO_LANES_CONFIG,
  AETHER_VARIABLES,
  tempDir,
  makeRepo,
  writePlan,
  runBin,
  compile,
  commitIn,
  useDataDir,
  age,
  ageRun,
  runSessionStart,
  partHeading,
  leadParts,
}
