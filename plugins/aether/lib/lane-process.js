'use strict'

// The process helpers of a lane: finding a harness command, the environment a lane may inherit, and the
// kills that stop a lane's processes, by pid file group and by environment marker. lib/lanes.js asks for them.
// Family: lane.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { isExecutableFile, sleepSync } = require('./common.js')

const KILL_WAIT_MS = 2000
const KILL_POLL_MS = 50

// The absolute path where command is an executable: itself when it is absolute, else the first match on
// PATH. Null when there is none.
function commandPath(command, env = process.env) {
  if (path.isAbsolute(command)) return isExecutableFile(command) ? command : null
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    if (dir === '') continue
    const file = path.resolve(dir, command)
    if (isExecutableFile(file)) return file
  }
  return null
}

function commandInstalled(command, env = process.env) {
  return commandPath(command, env) !== null
}

// What a lane's runner and agy may inherit. agy needs only HOME and PATH to sign in (agy 1.3.2,
// 2026-10-09); the rest keeps locales, terminals and temporary directories working. Anything named
// like a secret stays out, whatever its prefix: agy ran `env` once, and its output reaches the model.
const ENV_NAMES = ['HOME', 'PATH', 'LANG', 'TERM', 'TMPDIR', 'TZ', 'USER', 'LOGNAME', 'SHELL']
const ENV_PREFIXES = ['LC_', 'XDG_', 'AETHER_']
const ENV_SECRET = /TOKEN|KEY|SECRET/i

// The allowlisted part of env, with AETHER_LANE_CALL set to marker, and the variables that keep the
// owner's credentials out of a lane.
function laneEnv(env, marker) {
  const out = {}
  for (const [name, value] of Object.entries(env)) {
    if (ENV_SECRET.test(name)) continue
    if (ENV_NAMES.includes(name) || ENV_PREFIXES.some((prefix) => name.startsWith(prefix))) out[name] = value
  }
  // HOME stays, because each CLI keeps its own login there; these variables keep the owner's git, GitHub,
  // package-registry and cloud credentials out of the lane. A plain git command in a lane cannot reach a remote,
  // which prevents accidents; it does not stop an agent that overrides the setting, as `git -c protocol.allow=always` does.
  const noCredentials = path.join(os.tmpdir(), 'aether-lane-no-credentials')
  Object.assign(out, {
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'protocol.allow',
    GIT_CONFIG_VALUE_0: 'never',
    GH_CONFIG_DIR: noCredentials,
    DOCKER_CONFIG: noCredentials,
    CLOUDSDK_CONFIG: noCredentials,
    NPM_CONFIG_USERCONFIG: '/dev/null',
    AWS_CONFIG_FILE: '/dev/null',
    AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
    KUBECONFIG: '/dev/null',
  })
  out.AETHER_LANE_CALL = marker
  return out
}

function procRead(pid, name) {
  try {
    return fs.readFileSync(`/proc/${pid}/${name}`, 'utf8')
  } catch {
    return null
  }
}

// The state letter from /proc/<pid>/stat, or null when the process is gone. The command name may hold spaces.
function procState(pid) {
  const stat = procRead(pid, 'stat')
  if (stat === null) return null
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]
}

function isRunning(pid) {
  const state = procState(pid)
  return state !== null && state !== 'Z'
}

// The process group from /proc/<pid>/stat, or null when the process is gone.
function procGroup(pid) {
  const stat = procRead(pid, 'stat')
  if (stat === null) return null
  const group = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
  return group > 0 ? group : null
}

const MARKER_PREFIX = 'AETHER_LANE_CALL='

// The value of AETHER_LANE_CALL in a process's environment, or null.
function markerOf(pid) {
  const environ = procRead(pid, 'environ')
  if (environ === null) return null
  const entry = environ.split('\0').find((item) => item.startsWith(MARKER_PREFIX))
  return entry === undefined ? null : entry.slice(MARKER_PREFIX.length)
}

function ownedBy(pid, uid) {
  try {
    return fs.statSync(`/proc/${pid}`).uid === uid
  } catch {
    return false
  }
}

// This user's live processes, this one aside, whose AETHER_LANE_CALL is marker or, with prefix,
// starts with it. agy starts its commands in sessions of their own, so the marker every lane process
// inherits is the only thread to all of them. Reads /proc: Linux only.
function markedProcesses(marker, { prefix = false } = {}) {
  if (typeof marker !== 'string' || marker === '') return []
  let names
  try {
    names = fs.readdirSync('/proc')
  } catch {
    return []
  }
  const uid = process.getuid()
  const found = []
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue
    const pid = Number(name)
    if (pid === process.pid || !ownedBy(pid, uid)) continue
    const value = markerOf(pid)
    if (value === null || !(prefix ? value.startsWith(marker) : value === marker)) continue
    if (isRunning(pid)) found.push({ pid, marker: value })
  }
  return found
}

function signalQuietly(target, signal) {
  try {
    process.kill(target, signal)
  } catch {
    // Gone already, or not ours to signal.
  }
}

// Signals each process and its process group, never this process's own group.
function signalMarked(found, signal) {
  const own = procGroup(process.pid)
  for (const { pid } of found) {
    const group = procGroup(pid)
    signalQuietly(pid, signal)
    if (group !== null && group !== 1 && group !== own) signalQuietly(-group, signal)
  }
}

// Ends every process markedProcesses finds, with its process group: SIGTERM, then, after the wait
// killGroup gives, SIGKILL to those still marked and alive. Returns the markers it found, sorted.
function killMarked(marker, { prefix = false } = {}) {
  const found = markedProcesses(marker, { prefix })
  if (found.length === 0) return []
  signalMarked(found, 'SIGTERM')
  const deadline = Date.now() + KILL_WAIT_MS
  while (found.some(({ pid }) => isRunning(pid)) && Date.now() < deadline) sleepSync(KILL_POLL_MS)
  signalMarked(markedProcesses(marker, { prefix }), 'SIGKILL')
  return [...new Set(found.map((entry) => entry.marker))].sort()
}

function isLaneProcess(pid, marker) {
  const environ = procRead(pid, 'environ')
  if (environ === null || !environ.split('\0').includes(`AETHER_LANE_CALL=${marker}`)) return false
  return procState(pid) !== 'Z'
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal)
  } catch (err) {
    if (err.code !== 'ESRCH') throw err
  }
}

// Stops the process group led by the pid in pidFile, when that process carries the marker in its environment.
function killGroup(pidFile, marker) {
  let text
  try {
    text = fs.readFileSync(pidFile, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { killed: false, pid: null }
    throw err
  }
  fs.rmSync(pidFile, { force: true })
  const pid = Number.parseInt(text, 10)
  if (!(pid > 0)) return { killed: false, pid: null }
  if (!isLaneProcess(pid, marker)) return { killed: false, pid }
  signalGroup(pid, 'SIGTERM')
  const deadline = Date.now() + KILL_WAIT_MS
  while (isRunning(pid) && Date.now() < deadline) sleepSync(KILL_POLL_MS)
  if (isRunning(pid)) signalGroup(pid, 'SIGKILL')
  return { killed: true, pid }
}

module.exports = {
  commandPath,
  commandInstalled,
  laneEnv,
  killGroup,
  killMarked,
}
