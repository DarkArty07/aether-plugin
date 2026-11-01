'use strict'

// Doctor: checks that Aether can run on this machine and says how to fix what cannot. It reads and writes nothing: it
// looks at the PATH, the plugin cache, three settings files and the version of `claude` and `git`, and returns one
// object. The checks are plain functions over what run() is given (the environment, the working directory and a command
// runner), so the tests need no network, no model and no real `claude`.
// Family: none.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { isExecutableFile } = require('./common.js')
const { MARKER, DEFAULT_NAME, newestLauncher } = require('./first-setup.js')

const MIN_CLAUDE = '2.1.294'
const MIN_NODE_MAJOR = 22
const MIN_GIT = '2.36'
// The harness CLIs, in the order they are listed. The option names the cursor harness `cursor`; its CLI is `cursor-agent`.
const HARNESS_CLIS = ['agy', 'codex', 'grok', 'cursor-agent', 'muse']
const HARNESS_ALIASES = { cursor: 'cursor-agent' }
const OPTIONS_KEY = 'aether@aether-plugin'
const INSTALL_FIX = 'claude plugin install aether --marketplace DarkArty07/aether-plugin'
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const MAX_NAME_LENGTH = 64
const FORBIDDEN_NAME = 'claude'
const EXIT_USAGE = 2
const COMMAND_TIMEOUT_MS = 10 * 1000
// A stub is a few lines; a file larger than this is not one, and is not read.
const MAX_STUB_BYTES = 64 * 1024
const MAX_SETTINGS_BYTES = 1024 * 1024
const PLUGIN_JSON = path.join(__dirname, '..', '.claude-plugin', 'plugin.json')

// A failure with the exit code the bin gives: 2 for a usage mistake.
class DoctorError extends Error {
  constructor(message, exitCode) {
    super(message)
    this.exitCode = exitCode
  }
}

const usageError = (message) => new DoctorError(message, EXIT_USAGE)

const homeOf = (env) => env.HOME || os.homedir()
const configDirOf = (env) => env.CLAUDE_CONFIG_DIR || path.join(homeOf(env), '.claude')

const check = (id, status, detail, fix = null) => ({ id, status, detail, fix })

function validateName(name) {
  if (typeof name === 'string' && name.length > MAX_NAME_LENGTH) {
    throw usageError(`invalid name of ${name.length} characters: at most ${MAX_NAME_LENGTH}`)
  }
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw usageError(`invalid name ${JSON.stringify(name)}: use letters, digits, "." , "_" and "-", and start with a letter or a digit`)
  }
  if (name === FORBIDDEN_NAME) throw usageError(`invalid name "${name}": the launcher runs \`claude\`, so a command of that name would call itself`)
}

// The runner of commands: never a shell, a limit of time, the environment it is given for the lookup on the PATH.
function defaultExec(env) {
  return (command, args) => {
    const r = spawnSync(command, args, { encoding: 'utf8', timeout: COMMAND_TIMEOUT_MS, env, stdio: ['ignore', 'pipe', 'ignore'] })
    return { status: r.error ? null : r.status, stdout: r.stdout || '' }
  }
}

// What a command printed, or null when it is not found: it did not start, it did not finish, or its status is not 0.
function output(exec, command, args) {
  try {
    const r = exec(command, args)
    if (!r || r.status !== 0) return null
    return String(r.stdout ?? '')
  } catch {
    return null
  }
}

// Numbers compare as numbers: 2.1.294 against 2.1.294 is equal, 2.1.1000 is above it, a missing part counts as 0.
function atLeast(version, minimum) {
  const left = version.split('.').map(Number)
  const right = minimum.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const a = left[i] || 0
    const b = right[i] || 0
    if (a !== b) return a > b
  }
  return true
}

const versionIn = (text, pattern) => (text.match(pattern) || [])[0] || null

function claudeCheck(exec) {
  const out = output(exec, 'claude', ['--version'])
  if (out === null) {
    return check('claude', 'error', '`claude` was not found on the PATH', 'Install Claude Code (npm install -g @anthropic-ai/claude-code), then open a new terminal')
  }
  const version = versionIn(out, /\d+\.\d+\.\d+/)
  if (!version) return check('claude', 'error', '`claude --version` did not print a version', 'claude update')
  if (!atLeast(version, MIN_CLAUDE)) {
    return check('claude', 'error', `Claude Code ${version} is older than the ${MIN_CLAUDE} that Aether needs`, 'claude update')
  }
  return check('claude', 'ok', `Claude Code ${version}`)
}

function nodeCheck(version) {
  const major = Number(String(version).split('.')[0])
  if (!(major >= MIN_NODE_MAJOR)) {
    return check('node', 'error', `Node ${version} is older than the ${MIN_NODE_MAJOR} that Aether needs`, `Install Node ${MIN_NODE_MAJOR} or newer from nodejs.org`)
  }
  return check('node', 'ok', `Node ${version}`)
}

function gitCheck(exec) {
  const out = output(exec, 'git', ['--version'])
  if (out === null) return check('git', 'error', '`git` was not found on the PATH', `Install git ${MIN_GIT} or newer`)
  const version = versionIn(out, /\d+\.\d+(\.\d+)?/)
  if (!version) return check('git', 'error', '`git --version` did not print a version', `Update git to ${MIN_GIT} or newer`)
  if (!atLeast(version, MIN_GIT)) {
    return check('git', 'error', `git ${version} is older than the ${MIN_GIT} that Aether needs`, `Update git to ${MIN_GIT} or newer`)
  }
  return check('git', 'ok', `git ${version}`)
}

function aetherCheck(release, configDir) {
  if (release) return check('aether', 'ok', `Aether ${release.version} is installed`)
  return check('aether', 'warn', `no installed release of Aether was found in ${path.join(configDir, 'plugins', 'cache')}`, INSTALL_FIX)
}

// The first executable file of that name on the PATH, or null.
function findOnPath(name, env, cwd) {
  for (const entry of (env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(path.resolve(cwd, entry), name)
    if (isExecutableFile(candidate)) return candidate
  }
  return null
}

// Whether the file, followed through links, is a stub of Aether's: it has the marker as a line of its own in its first
// 64 KiB. A file larger than that is not one.
function isOwnStub(file) {
  let fd
  try {
    if (!fs.statSync(file).isFile()) return false
    fd = fs.openSync(file, 'r')
    const buffer = Buffer.alloc(MAX_STUB_BYTES + 1)
    const length = fs.readSync(fd, buffer, 0, buffer.length, 0)
    if (length > MAX_STUB_BYTES) return false
    return buffer.toString('utf8', 0, length).split(/\r?\n/).includes(MARKER)
  } catch {
    return false
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

// What the person types to start Aether, and where it stands: { check, command: { name, path, own, onPath } }.
function commandState(name, env, cwd) {
  const found = findOnPath(name, env, cwd)
  if (found) {
    const own = isOwnStub(found)
    if (own) return { command: { name, path: found, own: true, onPath: true }, check: check('command', 'ok', `${name} runs Aether (${found})`) }
    return {
      command: { name, path: found, own: false, onPath: true },
      check: check('command', 'warn', `${found} is already a command named ${name}, and it is not Aether's`, 'Run /aether:setup and pick another name'),
    }
  }
  const dir = path.join(homeOf(env), '.local', 'bin')
  const stub = path.join(dir, name)
  if (isOwnStub(stub)) {
    return {
      command: { name, path: stub, own: true, onPath: false },
      check: check('command', 'warn', `${stub} runs Aether, but ${dir} is not on the PATH`, `Add ${dir} to your PATH, then open a new terminal (/aether:setup shows the line for your shell)`),
    }
  }
  return {
    command: { name, path: null, own: false, onPath: false },
    check: check('command', 'warn', `the command ${name} is not installed`, 'Run /aether:setup'),
  }
}

// A settings file as an object, or null when it is missing, not valid JSON, or not an object. It never throws.
function readSettings(file) {
  try {
    if (fs.statSync(file).size > MAX_SETTINGS_BYTES) return null
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function canonicalFile(file) {
  try {
    return fs.realpathSync(file)
  } catch {
    return path.resolve(file)
  }
}

// The settings files that can turn workflows on or off, the user's and the project's, each once and only when it reads.
function settingsSources(configDir, cwd) {
  const files = [path.join(configDir, 'settings.json'), path.join(cwd, '.claude', 'settings.json'), path.join(cwd, '.claude', 'settings.local.json')]
  const seen = new Set()
  const sources = []
  for (const file of files) {
    const key = canonicalFile(file)
    if (seen.has(key)) continue
    seen.add(key)
    const settings = readSettings(file)
    if (settings) sources.push({ file, settings })
  }
  return sources
}

// Dynamic workflows (Claude Code 2.1.316): any source that turns them off wins. Off by the environment variable, or by
// disableWorkflows: true or enableWorkflows: false in a settings file; on by enableWorkflows: true when nothing turns
// them off; otherwise they depend on the plan, on except on Pro.
function workflowsCheck(env, sources) {
  const flag = String(env.CLAUDE_CODE_DISABLE_WORKFLOWS ?? '').trim()
  const offs = []
  if (flag !== '' && !['0', 'false'].includes(flag.toLowerCase())) {
    offs.push({ what: `CLAUDE_CODE_DISABLE_WORKFLOWS=${flag}`, fix: 'unset CLAUDE_CODE_DISABLE_WORKFLOWS' })
  }
  let enabledIn = null
  for (const { file, settings } of sources) {
    if (settings.disableWorkflows === true) offs.push({ what: `disableWorkflows: true in ${file}`, fix: `remove disableWorkflows from ${file}` })
    if (settings.enableWorkflows === false) offs.push({ what: `enableWorkflows: false in ${file}`, fix: `remove enableWorkflows: false from ${file}` })
    if (settings.enableWorkflows === true && enabledIn === null) enabledIn = file
  }
  if (offs.length) {
    return check('workflows', 'error', `Dynamic workflows are turned off by ${offs.map((off) => off.what).join(' and ')}`, ['In /config turn Dynamic workflows on', ...offs.map((off) => off.fix)].join('; '))
  }
  if (enabledIn) return check('workflows', 'ok', `Dynamic workflows are on (enableWorkflows: true in ${enabledIn})`)
  return check('workflows', 'info', 'Dynamic workflows are not set: they are on unless your plan is Pro', 'On the Pro plan: /config → Dynamic workflows')
}

// The options saved for the plugin, or null when there are none: { superdelegation, harnesses }, each as saved.
function savedOptions(configDir) {
  const settings = readSettings(path.join(configDir, 'settings.json'))
  const configs = settings && settings.pluginConfigs
  const options = configs && typeof configs === 'object' && configs[OPTIONS_KEY] && configs[OPTIONS_KEY].options
  if (!options || typeof options !== 'object') return null
  const pick = (key) => (options[key] === undefined ? null : options[key])
  const picked = { superdelegation: pick('superdelegation'), harnesses: pick('harnesses') }
  return picked.superdelegation === null && picked.harnesses === null ? null : picked
}

const isOn = (value) => value === true || String(value).trim().toLowerCase() === 'true'

// The harnesses the option names, as the CLIs they run, each once.
function namedHarnesses(value) {
  const text = Array.isArray(value) ? value.join(',') : value
  if (typeof text !== 'string') return []
  const names = text.split(/[,\s]+/).map((name) => name.trim().toLowerCase()).filter(Boolean)
  return [...new Set(names)].map((name) => ({ name, cli: HARNESS_ALIASES[name] || name }))
}

function harnessesCheck(found, options) {
  if (options && isOn(options.superdelegation)) {
    const missing = namedHarnesses(options.harnesses).filter(({ cli }) => !found.includes(cli))
    if (missing.length) {
      const names = missing.map(({ name }) => name)
      return check(
        'harnesses',
        'warn',
        `superdelegation is on and asks for ${names.join(', ')}, which ${names.length === 1 ? 'is' : 'are'} not installed`,
        `Install ${names.join(', ')}, or take ${names.length === 1 ? 'it' : 'them'} out of the harnesses option with claude plugin configure ${OPTIONS_KEY}`,
      )
    }
  }
  if (found.length) return check('harnesses', 'info', `other harnesses installed: ${found.join(', ')}`)
  return check('harnesses', 'info', 'no other harness is installed (agy, codex, grok, cursor-agent, muse): Aether runs on Claude alone')
}

function projectCheck(exec, cwd, name) {
  const out = output(exec, 'git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'])
  if (out !== null && out.trim() === 'true') return check('project', 'ok', `${cwd} is a git repository`)
  return check('project', 'info', "this folder is not a git repository: open Aether in your project's folder", `cd <your project> && ${name}`)
}

function pluginVersion() {
  try {
    return JSON.parse(fs.readFileSync(PLUGIN_JSON, 'utf8')).version || null
  } catch {
    return null
  }
}

// The report: { ok, version, installed, harnesses (option names), options, command, checks }. ok is false when a check has status error.
function run({ name = DEFAULT_NAME, env = process.env, cwd = process.cwd(), exec = defaultExec(env), nodeVersion = process.versions.node } = {}) {
  validateName(name)
  const configDir = configDirOf(env)
  const release = newestLauncher(configDir)
  const options = savedOptions(configDir)
  const found = HARNESS_CLIS.filter((cli) => findOnPath(cli, env, cwd) !== null)
  const { command, check: commandCheck } = commandState(name, env, cwd)
  const checks = [
    claudeCheck(exec),
    nodeCheck(nodeVersion),
    gitCheck(exec),
    aetherCheck(release, configDir),
    commandCheck,
    workflowsCheck(env, settingsSources(configDir, cwd)),
    harnessesCheck(found, options),
    projectCheck(exec, cwd, name),
  ]
  return {
    ok: !checks.some((entry) => entry.status === 'error'),
    version: pluginVersion(),
    installed: release ? release.version : null,
    // The names the harnesses option takes (cursor, not cursor-agent), so /aether:setup can save them as they are.
    harnesses: found.map((cli) => Object.keys(HARNESS_ALIASES).find((name) => HARNESS_ALIASES[name] === cli) || cli),
    options,
    command,
    checks,
  }
}

module.exports = { run, usageError, DoctorError, MIN_CLAUDE, MIN_GIT, MIN_NODE_MAJOR, HARNESS_CLIS }
