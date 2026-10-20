'use strict'

// Fixtures for the aether-lane tests: a compiled run, a lane table whose harness is the fake agy,
// and the environment that points the bin and its runner at them.

const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { PLUGIN, tempDir, makeRepo, compile, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const LANE_BIN = path.join(PLUGIN, 'bin', 'aether-lane')
const FAKE_AGY = path.join(__dirname, 'fixtures', 'fake-agy.js')

// One test's environment: a lane table naming the fake agy (or `command`), a data directory, a home
// directory, the fake's call log and conversation state, and the quota it reports.
function laneEnv(t, { command = FAKE_AGY, quota = null, mutate = null } = {}) {
  fs.chmodSync(FAKE_AGY, 0o755)
  const dir = tempDir(t, 'aether-lane-env-')
  const config = JSON.parse(fs.readFileSync(lanes.CONFIG_FILE, 'utf8'))
  config.harnesses.agy.command = command
  if (config.harnesses.muse) config.harnesses.muse.command = '/nowhere/muse'
  if (mutate) mutate(config)
  const configFile = path.join(dir, 'lanes.json')
  fs.writeFileSync(configFile, JSON.stringify(config))
  const env = {
    AETHER_LANES_CONFIG: configFile,
    AETHER_LANES: 'on',
    AETHER_DATA_DIR: path.join(dir, 'data'),
    HOME: path.join(dir, 'home'),
    AETHER_FAKE_AGY_LOG: path.join(dir, 'agy.log'),
    AETHER_FAKE_AGY_STATE: path.join(dir, 'agy-state'),
    AETHER_FAKE_AGY_QUOTA_FILE: path.join(dir, 'quota.json'),
  }
  fs.mkdirSync(env.HOME, { recursive: true })
  fs.mkdirSync(env.AETHER_FAKE_AGY_STATE, { recursive: true })
  if (quota) fs.writeFileSync(env.AETHER_FAKE_AGY_QUOTA_FILE, JSON.stringify(quota))
  return env
}

// A compiled run whose integration worktree is the repository itself. Task 1 owns src/t1/**.
function laneRun(t, tasks = [task(1)]) {
  const repo = makeRepo(t)
  return { repo, args: compile(repo, plan(tasks)) }
}

// Writes what the mod would: the payload and spawn.json. Returns the payload's digest.
function writePrompt(args, call, text, { session = null } = {}) {
  const dir = path.join(args.runDir, 'lanes', call)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'prompt.md'), text)
  fs.writeFileSync(path.join(dir, 'spawn.json'), JSON.stringify({ session, workflowRunId: null, agentIndex: null }))
  return lanes.digest(text)
}

function lane(args, verb, rest, env) {
  return runBin(LANE_BIN, [verb, args.runId, ...rest], args.repoRoot, env)
}

// Waits for a lane call to finish, up to `seconds`.
function waitDone(args, call, env, seconds = 60) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    const r = lane(args, 'wait', [call, '--max', '5'], env)
    if (r.json && r.json.error) throw new Error(r.json.error)
    if (r.json && r.json.done) return r.json
  }
  throw new Error(`lane call ${call} did not finish in ${seconds} s`)
}

function agyCalls(env) {
  if (!fs.existsSync(env.AETHER_FAKE_AGY_LOG)) return []
  return fs
    .readFileSync(env.AETHER_FAKE_AGY_LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

// The calls that ran a turn, not /usage or --version.
function agyTurns(env) {
  return agyCalls(env).filter((c) => c.argv[0] === '-p' && c.argv[1] !== '/usage')
}

function argAfter(argv, name) {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1]
}

function roleBody(role) {
  const text = fs.readFileSync(path.join(PLUGIN, 'agents', `${role}.md`), 'utf8')
  return text.slice(text.indexOf('\n---\n', 4) + 5).trim()
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

function alive(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat[stat.lastIndexOf(')') + 2] !== 'Z'
  } catch {
    return false
  }
}

// A long-running process in a session of its own (detached: setsid), as agy starts its commands,
// with the lane marker in its environment, or without one when marker is null. Killed when the test ends.
function ownSession(t, marker) {
  const env = { ...process.env }
  delete env.AETHER_LANE_CALL
  if (marker) env.AETHER_LANE_CALL = marker
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore', env })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  t.after(() => killQuietly(child.pid))
  return { pid: child.pid, exited }
}

function killQuietly(pid) {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
}

// The variables laneEnv sets for every lane. GIT_CONFIG_KEY_0 names a key, not a secret.
const LANE_VARIABLES = [
  'GIT_TERMINAL_PROMPT',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',
  'GH_CONFIG_DIR',
  'DOCKER_CONFIG',
  'CLOUDSDK_CONFIG',
  'NPM_CONFIG_USERCONFIG',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE',
  'KUBECONFIG',
]

// Whether a variable may reach a lane: the allowlist, or a variable laneEnv sets, and nothing else named like a secret.
function allowedEnvName(name) {
  if (LANE_VARIABLES.includes(name)) return true
  const listed = ['HOME', 'PATH', 'LANG', 'TERM', 'TMPDIR', 'TZ', 'USER', 'LOGNAME', 'SHELL'].includes(name) || /^(LC_|XDG_|AETHER_)/.test(name)
  return listed && !/TOKEN|KEY|SECRET/i.test(name)
}

// Waits up to `seconds` for file to exist, polling.
async function waitForFile(file, seconds = 15) {
  const deadline = Date.now() + seconds * 1000
  while (!fs.existsSync(file) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  if (!fs.existsSync(file)) throw new Error(`${file} did not appear in ${seconds} s`)
}

module.exports = {
  LANE_BIN,
  FAKE_AGY,
  laneEnv,
  laneRun,
  writePrompt,
  lane,
  waitDone,
  agyCalls,
  agyTurns,
  argAfter,
  roleBody,
  git,
  alive,
  ownSession,
  killQuietly,
  allowedEnvName,
  waitForFile,
}
