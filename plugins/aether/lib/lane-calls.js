'use strict'

// One lane call, from its prompt to its result. `start` checks that the call may run, prepares its
// workspace and launches a detached runner; the runner drives agy, checks the workspace from
// outside, records the usage and writes result.json last; `wait`, `result` and `stop` read and end
// it. The commands share nothing but the files of the call directory, <runDir>/lanes/<call>/.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { repoPaths } = require('./git.js')
const run = require('./run.js')
const lanes = require('./lanes.js')
const work = require('./lane-work.js')
const schemas = require('./lane-schemas.js')
const { createAgy } = require('./harness/agy.js')

const HARNESS = 'agy'
const BIN = path.join(__dirname, '..', 'bin', 'aether-lane')
const AGENTS_DIR = path.join(__dirname, '..', 'agents')
const CALL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const KEPT_ON_START = ['prompt.md', 'spawn.json']
const POLL_MS = 250
const KILL_GRACE_SECONDS = 60
const STDERR_DETAIL_CHARS = 2000
const CALLED_ROLES = ['implementer', 'supervisor', 'reviewer']
const ROLE_SCHEMAS = {
  implementer: schemas.IMPLEMENTER_SCHEMA,
  supervisor: schemas.SUPERVISOR_SCHEMA,
  reviewer: schemas.REVIEW_SCHEMA,
}

const LANE_NOTES = {
  implementer:
    '## You run in an external harness\n\nYou are an Aether implementer, run by the agy CLI rather than Claude Code. Your unit worktree is the current directory; the harness created it and copied your brief to .aether-tmp/brief.md. Skip the `aether-wt ensure` and `aether-wt diff` steps of your role: the harness packages your diff and reads your head from git. Never edit the integration worktree, the main checkout, or another unit\'s worktree. Every other rule of your role holds. Answer with the structured output your harness asks for.',
  supervisor:
    '## You run in an external harness\n\nYou are an Aether supervisor, run by the agy CLI rather than Claude Code. The current directory is a disposable copy of the unit\'s branch; the brief and the review package are in its .aether-tmp/ folder. Your review is read-only: do not run commands, and do not change any file. Every other rule of your role holds. Answer with the structured output your harness asks for.',
  reviewer:
    '## You run in an external harness\n\nYou are the Aether final reviewer, run by the agy CLI rather than Claude Code. The current directory is a disposable copy of the integration branch; the review package is in its .aether-tmp/ folder. Your review is read-only: do not run commands, and do not change any file. Every other rule of your role holds. Answer with the structured output your harness asks for.',
}

// ---- Prompts ----

function roleBody(role) {
  const text = fs.readFileSync(path.join(AGENTS_DIR, `${role}.md`), 'utf8')
  const end = text.indexOf('\n---\n', 4)
  if (end === -1) throw new Error(`agents/${role}.md has no closing frontmatter line`)
  return text.slice(end + '\n---\n'.length).trim()
}

function claudeMdSections(workdir, home) {
  const files = [path.join(home, '.claude', 'CLAUDE.md'), path.join(workdir, 'CLAUDE.md'), path.join(workdir, '.claude', 'CLAUDE.md')]
  return files.filter((file) => fs.existsSync(file)).map((file) => `## Instructions from ${file}\n\n${fs.readFileSync(file, 'utf8').trimEnd()}`)
}

function buildPrompt({ role, message, workdir, home, note }) {
  return [roleBody(role), note ?? LANE_NOTES[role], ...claudeMdSections(workdir, home), message].join('\n\n')
}

// ---- The call directory ----

function callPaths(cwd, runId, call) {
  run.assertRunId(runId)
  if (!CALL_ID.test(String(call))) throw new Error(`invalid call id: ${call}`)
  const { mainRoot } = repoPaths(cwd)
  const dir = path.join(run.runDir(mainRoot, runId), 'lanes', call)
  const file = (name) => path.join(dir, name)
  return {
    dir,
    marker: `${runId}/${call}`,
    prompt: file('prompt.md'),
    spawn: file('spawn.json'),
    call: file('call.json'),
    schema: file('schema.json'),
    pid: file('pid'),
    agyPid: file('agy.pid'),
    agyStdout: file('agy.stdout'),
    agyStderr: file('agy.stderr'),
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

function readTextOrEmpty(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

// ---- The table and the adapter ----

function harnessSettings() {
  const file = lanes.configPath()
  const config = lanes.loadConfig(file)
  if (!config) throw new Error(`no lane table: ${file}`)
  const harness = config.harnesses[HARNESS]
  if (!harness) throw new Error(`the lane table has no ${HARNESS} harness`)
  return { config, harness, adapter: createAgy({ command: harness.command, groups: harness.groups }) }
}

// The table's entry for a lane model that serves role at effort, or null.
function laneModel(harness, role, model, effort) {
  const entry = Object.hasOwn(harness.models, model) ? harness.models[model] : null
  if (!entry || !entry.roles.includes(role) || !Object.hasOwn(entry.levels, effort)) return null
  return { group: entry.group, agyModel: `${model}-${entry.levels[effort]}` }
}

// ---- status ----

function status(cwd, runId) {
  run.assertRunId(runId)
  repoPaths(cwd)
  const { config, adapter } = harnessSettings()
  if (!adapter.installed()) return { harnesses: { [HARNESS]: { installed: false, version: null, groups: {} } } }
  const version = adapter.version()
  let quota
  try {
    quota = adapter.quota()
  } catch (err) {
    return { harnesses: { [HARNESS]: { installed: true, version, error: err.message, groups: {} } } }
  }
  const groups = {}
  for (const [group, reading] of Object.entries(quota.groups)) {
    groups[group] = { usable: lanes.usable(reading, config.reserve), windows: reading.windows }
  }
  lanes.appendLog(run.dataDir(), null, {
    kind: 'reading',
    time: Date.now(),
    session: null,
    run: runId,
    design: null,
    harness: HARNESS,
    version,
    groups: quota.groups,
  })
  return { harnesses: { [HARNESS]: { installed: true, version, groups } } }
}

// ---- start ----

// Ends whatever an earlier launch of this call left running, so its runner cannot write over this one.
function killCall(paths) {
  const runner = lanes.killGroup(paths.pid, paths.marker)
  const agy = lanes.killGroup(paths.agyPid, paths.marker)
  return runner.killed || agy.killed
}

function clearCallDir(paths) {
  for (const name of fs.readdirSync(paths.dir)) {
    if (!KEPT_ON_START.includes(name)) fs.rmSync(path.join(paths.dir, name), { recursive: true, force: true })
  }
}

function prepareWorkspace(cwd, runId, call, role, task) {
  if (role === 'implementer') return work.prepareImplementer(cwd, runId, task).workdir
  return work.prepareReader(cwd, runId, call, { taskId: role === 'supervisor' ? task : null }).workdir
}

function start(cwd, runId, call, { role, task = null, model, effort, digest }) {
  const paths = callPaths(cwd, runId, call)
  for (const [name, value] of Object.entries({ role, model, effort, digest })) {
    if (typeof value !== 'string' || value === '') throw new Error(`start needs --${name}`)
  }
  const unitTask = role === 'reviewer' ? null : task
  if ((role === 'implementer' || role === 'supervisor') && unitTask === null) throw new Error(`start needs --task for the ${role}`)

  if (!fs.existsSync(paths.prompt)) return { unavailable: 'prompt' }
  const message = fs.readFileSync(paths.prompt, 'utf8')
  if (lanes.digest(message) !== digest) return { unavailable: 'digest' }
  const { config, harness, adapter } = harnessSettings()
  const lane = CALLED_ROLES.includes(role) ? laneModel(harness, role, model, effort) : null
  if (!lane) return { unavailable: 'role' }
  if (!adapter.installed()) return { unavailable: 'not-installed' }
  let quotaBefore
  try {
    quotaBefore = adapter.quota().groups[lane.group] ?? null
  } catch {
    return { unavailable: 'quota' }
  }
  if (!lanes.usable(quotaBefore, config.reserve)) return { unavailable: 'quota' }

  killCall(paths)
  clearCallDir(paths)
  let workdir
  try {
    workdir = prepareWorkspace(cwd, runId, call, role, unitTask)
  } catch {
    return { unavailable: 'workspace' }
  }
  const spawned = readJsonOrNull(paths.spawn)
  run.writeJson(paths.call, {
    runId,
    call,
    role,
    task: unitTask,
    model: lane.agyModel,
    laneModel: model,
    group: lane.group,
    effort,
    timeoutSeconds: harness.timeouts[role],
    workdir,
    quotaBefore,
    session: spawned?.session ?? null,
    startedAt: Date.now(),
  })
  const runner = spawn(process.execPath, [BIN, '_runner', runId, call], {
    cwd,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, AETHER_LANE_CALL: paths.marker },
  })
  runner.unref()
  fs.writeFileSync(paths.pid, `${runner.pid}\n`)
  return { started: true, model: lane.agyModel, group: lane.group }
}

// ---- The runner ----

// The runner kills its own child's group directly: it holds the child, so the pid cannot have been
// reused, and after agy exits its leader is gone, which killGroup's marker check would need.
function killAgyGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // The group is already empty.
  }
}

// Runs agy to its end, killing its group when it outlives the timeout. Resolves to its exit code.
function runAgy(argv, { workdir, marker, paths, timeoutSeconds, onSpawn }) {
  const out = fs.openSync(paths.agyStdout, 'w')
  const err = fs.openSync(paths.agyStderr, 'w')
  let child
  try {
    child = spawn(argv[0], argv.slice(1), {
      cwd: workdir,
      detached: true,
      stdio: ['ignore', out, err],
      env: { ...process.env, AETHER_LANE_CALL: marker },
    })
  } finally {
    fs.closeSync(out)
    fs.closeSync(err)
  }
  return new Promise((resolve, reject) => {
    let timer = null
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`agy did not start: ${error.message}`))
    })
    child.once('spawn', () => {
      onSpawn(child.pid)
      fs.writeFileSync(paths.agyPid, `${child.pid}\n`)
      timer = setTimeout(() => killAgyGroup(child.pid), (timeoutSeconds + KILL_GRACE_SECONDS) * 1000)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve(code ?? 128 + (os.constants.signals[signal] || 0))
    })
  })
}

function failedDetail(reason, stderr) {
  const text = stderr.slice(0, STDERR_DETAIL_CHARS)
  return text.trim() === '' ? reason : `${reason}\n${text}`
}

// The status, result and detail of a finished call, from the checks and agy's output, in that order.
function judge(cwd, info, before, parsed, quotaAfter, reserve, stderr) {
  const { runId, role, task } = info
  const integration = work.checkIntegration(cwd, runId, before)
  if (!integration.ok) return { status: 'blocked', detail: integration.detail }
  if (role === 'supervisor') {
    const unit = work.checkUnitUnchanged(cwd, runId, task, before)
    if (!unit.ok) return { status: 'blocked', detail: unit.detail }
  }
  if (!parsed.clean) {
    if (!lanes.usable(quotaAfter, reserve)) return { status: 'quota', detail: parsed.reason }
    return { status: 'failed', detail: failedDetail(parsed.reason, stderr) }
  }
  if (role === 'implementer') {
    const owns = work.checkOwns(cwd, runId, task)
    if (!owns.ok) return { status: 'violation', files: owns.files, detail: 'changes outside Owns' }
    const { head } = work.finishImplementer(cwd, runId, task)
    return { status: 'ok', result: { ...parsed.structured, head }, detail: '' }
  }
  return { status: 'ok', result: parsed.structured, detail: '' }
}

const NO_USAGE = { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }

async function runCall(cwd, runId, call) {
  const paths = callPaths(cwd, runId, call)
  const info = JSON.parse(fs.readFileSync(paths.call, 'utf8'))
  const { role, task, workdir, group } = info
  let agyPid = null
  const onSignal = () => {
    if (agyPid !== null) killAgyGroup(agyPid)
    process.exit(143)
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, onSignal)

  let outcome
  let parsed = { usage: NO_USAGE, conversation: null }
  let quotaAfter = null
  try {
    const { config, adapter } = harnessSettings()
    const schema = ROLE_SCHEMAS[role]
    fs.writeFileSync(paths.schema, `${JSON.stringify(schema, null, 2)}\n`)
    const before = work.snapshot(cwd, runId, { taskId: role === 'reviewer' ? null : task })
    const message = fs.readFileSync(paths.prompt, 'utf8')
    const prompt = buildPrompt({ role, message, workdir, home: os.homedir() })
    const argv = adapter.argv({ model: info.model, schemaFile: paths.schema, timeoutSeconds: info.timeoutSeconds, prompt })
    const exitCode = await runAgy(argv, {
      workdir,
      marker: paths.marker,
      paths,
      timeoutSeconds: info.timeoutSeconds,
      onSpawn: (pid) => {
        agyPid = pid
      },
    })
    killAgyGroup(agyPid)
    try {
      quotaAfter = adapter.quota().groups[group] ?? null
    } catch {
      quotaAfter = null
    }
    const stdout = readTextOrEmpty(paths.agyStdout)
    const stderr = readTextOrEmpty(paths.agyStderr)
    parsed = adapter.parse({ stdout, stderr, exitCode }, { required: schema.required })
    outcome = judge(cwd, info, before, parsed, quotaAfter, config.reserve, stderr)
  } catch (err) {
    outcome = { status: 'failed', detail: `runner: ${err.message}` }
  } finally {
    if (agyPid !== null) killAgyGroup(agyPid)
    if (role !== 'implementer') {
      try {
        work.removeReader(cwd, runId, call)
      } catch {
        // stop removes it as well; the result matters more than the copy.
      }
    }
  }

  const time = Date.now()
  const result = outcome.status === 'ok' ? outcome.result : null
  const lane = {
    harness: HARNESS,
    model: info.model,
    group,
    effort: info.effort,
    durationMs: time - info.startedAt,
    usage: parsed.usage,
    conversation: parsed.conversation,
  }
  try {
    lanes.appendLog(run.dataDir(), info.session, {
      kind: 'call',
      time,
      startedAt: info.startedAt,
      session: info.session,
      run: runId,
      design: null,
      call,
      role,
      task,
      harness: HARNESS,
      model: info.model,
      group,
      effort: info.effort,
      status: outcome.status,
      durationMs: lane.durationMs,
      usage: lane.usage,
      conversation: lane.conversation,
      quotaBefore: info.quotaBefore,
      quotaAfter,
      detail: outcome.detail,
    })
  } catch {
    // A log that cannot be written must not keep the result from the workflow.
  }

  // A later start of the same call rewrites call.json; this launch's result then belongs to no one.
  if (readJsonOrNull(paths.call)?.startedAt !== info.startedAt) return
  const done = { done: true, status: outcome.status, result, lane, detail: outcome.detail }
  if (outcome.files) done.files = outcome.files
  done.digest = lanes.resultDigest({ result, lane })
  fs.writeFileSync(paths.result, `${JSON.stringify(done)}\n`)
  fs.rmSync(paths.pid, { force: true })
  fs.rmSync(paths.agyPid, { force: true })
}

// ---- wait, result, stop ----

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The finished result, or null while there is none or it is still being written.
function finishedResult(paths) {
  const done = readJsonOrNull(paths.result)
  return done && done.done === true ? done : null
}

async function wait(cwd, runId, call, { maxSeconds = null } = {}) {
  const paths = callPaths(cwd, runId, call)
  if (!fs.existsSync(paths.call)) throw new Error(`no such lane call: ${call}`)
  const seconds = maxSeconds ?? harnessSettings().harness.waitSeconds
  const deadline = Date.now() + seconds * 1000
  for (;;) {
    const done = finishedResult(paths)
    if (done) return done
    if (Date.now() >= deadline) return { done: false }
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())))
  }
}

function result(cwd, runId, call) {
  const paths = callPaths(cwd, runId, call)
  const done = finishedResult(paths)
  if (!done) throw new Error(`no result for lane call: ${call}`)
  return done
}

function stop(cwd, runId, call = null) {
  run.assertRunId(runId)
  const { mainRoot } = repoPaths(cwd)
  const lanesDir = path.join(run.runDir(mainRoot, runId), 'lanes')
  let calls = [call]
  if (call === null) {
    calls = fs.existsSync(lanesDir)
      ? fs
          .readdirSync(lanesDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && CALL_ID.test(entry.name))
          .map((entry) => entry.name)
          .sort()
      : []
  }
  const stopped = []
  for (const name of calls) {
    if (killCall(callPaths(cwd, runId, name))) stopped.push(name)
    work.removeReader(cwd, runId, name)
  }
  return { stopped }
}

module.exports = { LANE_NOTES, roleBody, claudeMdSections, buildPrompt, status, start, wait, result, stop, runCall }
