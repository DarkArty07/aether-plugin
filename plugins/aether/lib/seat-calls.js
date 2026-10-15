'use strict'

// One design-seat round, started and awaited in steps. A round of an external seat can outlast the
// time one command may run, so `start` checks the Lead's message, saves it and launches a detached runner;
// the runner calls `aether-lane seat`'s own code (seats.js) and writes result.json last; `wait` and `stop`
// read and end it. The commands share nothing but the files of the round directory, <mainRoot>/.aether/seats/<id>/,
// which seats.js also uses for its worktree and its harness's files.

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { repoPaths } = require('./git.js')
const run = require('./run.js')
const lanes = require('./lanes.js')
const seats = require('./seats.js')

const BIN = path.join(__dirname, '..', 'bin', 'aether-lane')
const SEAT_WAIT_SECONDS = 540
const POLL_MS = 250

// Each verb's usage, as the bin lists it.
const COMMANDS = {
  start:
    'seat-start <judge|writer|examiner> --session <id> [--author <model>] --feature specs/NNN-<topic> [--doc <spec|plan>] --seats <native|balanced|robust> --lanes <on|off> --harnesses <h1,h2> --digest <digest>',
  wait: 'seat-wait <id> [--max <seconds>]',
  stop: 'seat-stop <id>',
}

// The same shapes seats.js checks for a round's id and its feature.
const SEAT_ID = new RegExp(`^(${lanes.SEATS.join('|')})-\\d{8}-\\d{6}-[0-9a-f]{4}$`)
const FEATURE = /^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*$/
const SESSION = /^[A-Za-z0-9-]+$/
const HARNESSES = /^[a-z]+(,[a-z]+)*$/

// ---- The round directory ----

function seatPaths(cwd, id) {
  if (!SEAT_ID.test(String(id))) throw new Error(`invalid seat round id: ${id}`)
  const { mainRoot } = repoPaths(cwd)
  const dir = path.join(run.aetherDir(mainRoot), 'seats', id)
  const file = (name) => path.join(dir, name)
  return {
    dir,
    // The runner's marker. seats.js marks the harness's processes seat/<id>, so the two are told apart.
    marker: `seat-call/${id}`,
    harnessMarker: `seat/${id}`,
    call: file('call.json'),
    message: file('message.md'),
    pid: file('pid'),
    result: file('result.json'),
  }
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// ---- start ----

function requireFlag(flags, name) {
  if (typeof flags[name] !== 'string' || flags[name] === '') throw new Error(`seat-start needs --${name}`)
  return flags[name]
}

// The flags of a start, checked, with the feature as seats.js reads it: relative, without a closing slash.
function checkedFlags(flags) {
  const { seat } = flags
  if (!lanes.SEATS.includes(seat)) throw new Error(`usage: aether-lane ${COMMANDS.start}`)
  const session = requireFlag(flags, 'session')
  if (!SESSION.test(session)) throw new Error(`--session must be letters, digits and dashes, not ${session}`)
  const feature = requireFlag(flags, 'feature').split(path.sep).join('/').replace(/\/+$/, '')
  if (!FEATURE.test(feature)) throw new Error(`--feature must be specs/NNN-<topic>, not ${flags.feature}`)
  let doc = null
  if (flags.doc !== undefined) {
    if (seat !== 'writer') throw new Error('--doc applies to the writer only')
    if (flags.doc !== 'spec' && flags.doc !== 'plan') throw new Error(`--doc must be spec or plan, not ${flags.doc}`)
    doc = flags.doc
  }
  const lanesOption = requireFlag(flags, 'lanes')
  if (lanesOption !== 'on' && lanesOption !== 'off') throw new Error(`--lanes must be on or off, not ${lanesOption}`)
  const harnesses = requireFlag(flags, 'harnesses')
  if (!HARNESSES.test(harnesses)) throw new Error(`--harnesses must be harness names separated by commas, not ${harnesses}`)
  const seatsOption = requireFlag(flags, 'seats')
  if (!lanes.SEAT_CHOICES.includes(seatsOption)) throw new Error(`--seats must be ${lanes.SEAT_CHOICES.join(', ')}, not ${seatsOption}`)
  const digest = requireFlag(flags, 'digest')
  const author = typeof flags.author === 'string' && flags.author !== '' ? flags.author : null
  return { seat, session, author, feature, doc, lanes: lanesOption, harnesses, seats: seatsOption, digest }
}

// The message the Lead saved for a round, where the mod's bins look for it: <checkout>/.aether-tmp/seats/<session>/message.md.
function messageFile(top, session) {
  return path.join(top, '.aether-tmp', 'seats', session, 'message.md')
}

// Starts a round in the background. flags are the verb's flags by name, with the seat as flags.seat. The mod runs
// this in Claude Code's own environment, which has none of the session's exports, so the options come in the flags
// and the runner gets them as the variables seats.js reads.
function start(cwd, flags, { env = process.env } = {}) {
  const checked = checkedFlags(flags)
  const { worktree: top } = repoPaths(cwd)
  let message
  try {
    message = fs.readFileSync(messageFile(top, checked.session), 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { unavailable: 'message' }
    throw err
  }
  if (lanes.digest(message) !== checked.digest) return { unavailable: 'digest' }

  const id = `${checked.seat}-${run.newRunId()}`
  const paths = seatPaths(cwd, id)
  fs.mkdirSync(paths.dir, { recursive: true })
  fs.writeFileSync(paths.message, message)
  run.writeJson(paths.call, { id, ...checked, startedAt: Date.now() })
  const runner = spawn(process.execPath, [BIN, '_seat', id], {
    cwd: top,
    detached: true,
    stdio: 'ignore',
    // laneEnv drops CLAUDE_CONFIG_DIR and CLAUDE_CODE_PLUGIN_CACHE_DIR, which the data directory may come from: the
    // runner is told where it is, so its log lands where the report looks.
    env: {
      ...lanes.laneEnv(env, paths.marker),
      AETHER_DATA_DIR: run.dataDir(env),
      AETHER_SEATS: checked.seats,
      AETHER_LANES: checked.lanes,
      AETHER_LANE_HARNESSES: checked.harnesses,
    },
  })
  runner.unref()
  fs.writeFileSync(paths.pid, `${runner.pid}\n`)
  return { started: true, id }
}

// ---- The runner ----

// Writes the result whole or not at all: wait never reads a half-written file.
function writeResult(paths, outcome) {
  const temporary = `${paths.result}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify({ done: true, ...outcome })}\n`)
  fs.renameSync(temporary, paths.result)
}

// Runs the round that start prepared, through the same code as `aether-lane seat`, and records its reply as the
// result. It does not catch the signal stop sends: seats.js does that while a round runs, kills the harness and
// removes the worktree. It never throws; whatever breaks becomes an exit-1 result.
async function runSeat(cwd, id) {
  const paths = seatPaths(cwd, id)
  let outcome
  try {
    const call = JSON.parse(fs.readFileSync(paths.call, 'utf8'))
    const message = fs.readFileSync(paths.message, 'utf8')
    const author = call.author === null ? [] : ['--author', call.author]
    const doc = call.doc === null ? [] : ['--doc', call.doc]
    const argv = [call.seat, '--session', call.session, '--id', id, '--feature', call.feature, ...author, ...doc]
    const { exitCode, value } = await seats.seatCommand(argv, { input: message, env: process.env, cwd })
    outcome = { exitCode, value }
  } catch (err) {
    outcome = { exitCode: 1, value: { error: err.message } }
  }
  writeResult(paths, outcome)
  fs.rmSync(paths.pid, { force: true })
}

// ---- wait, stop ----

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The finished result, or null while there is none.
function finishedResult(paths) {
  const done = readJsonOrNull(paths.result)
  return done && done.done === true ? done : null
}

// Whether the round's runner lives: its pid file names a process that carries the runner's marker and is not a zombie.
// A pid the system gave to something else since, or a runner stop ended, is not it.
function runnerAlive(paths) {
  let pid
  try {
    pid = Number.parseInt(fs.readFileSync(paths.pid, 'utf8'), 10)
  } catch {
    return false
  }
  if (!(pid > 0)) return false
  try {
    const environ = fs.readFileSync(`/proc/${pid}/environ`, 'utf8')
    if (!environ.split('\0').includes(`AETHER_LANE_CALL=${paths.marker}`)) return false
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat[stat.lastIndexOf(')') + 2] !== 'Z'
  } catch {
    return false
  }
}

// The result of a round, or { done: false } when it still runs after maxSeconds. A round whose runner is gone and
// left no result is a result too, an exit-1 one, so that nobody waits for it.
async function wait(cwd, id, { maxSeconds = null } = {}) {
  const paths = seatPaths(cwd, id)
  if (!fs.existsSync(paths.dir)) throw new Error(`no such seat round: ${id}`)
  const deadline = Date.now() + (maxSeconds ?? SEAT_WAIT_SECONDS) * 1000
  for (;;) {
    const done = finishedResult(paths)
    if (done) return done
    if (!runnerAlive(paths)) {
      // The runner writes its result and then drops its pid: a result that came between the two reads is the answer.
      return finishedResult(paths) ?? { done: true, exitCode: 1, value: { error: `the seat round ${id} ended without a result` } }
    }
    if (Date.now() >= deadline) return { done: false }
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())))
  }
}

// Ends a round: the runner, whose signal handler in seats.js kills the harness and removes the worktree, and then
// whatever still carries the harness's marker.
function stop(cwd, id) {
  const paths = seatPaths(cwd, id)
  if (!fs.existsSync(paths.dir)) throw new Error(`no such seat round: ${id}`)
  const runner = lanes.killGroup(paths.pid, paths.marker)
  const marked = lanes.killMarked(paths.harnessMarker)
  return { stopped: runner.killed || marked.length > 0 }
}

module.exports = { SEAT_WAIT_SECONDS, COMMANDS, start, wait, stop, runSeat }
