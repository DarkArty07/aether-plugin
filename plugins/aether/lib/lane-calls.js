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
const marks = require('./lane-marks.js')
const order = require('./lane-order.js')
const quota = require('./lane-quota.js')
const readings = require('./lane-readings.js')
const work = require('./lane-work.js')
const schemas = require('./lane-schemas.js')
const { createAdapter } = require('./harness/index.js')

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

// The one rule every lane note carries: agy once ran `env`, `ps` and a search of the home directory
// on a vague prompt, and what it reads goes to its model provider.
const WORKDIR_RULE = 'Work only inside the working directory you are given: do not run `env` or `ps`, and do not search outside that directory.'

// The note of each role's lane call, naming the harness that runs it.
const LANE_NOTE_TEXT = {
  implementer: (harness) => `## You run in an external harness\n\nYou are an Aether implementer, run by the ${harness} CLI rather than Claude Code. Your unit worktree is the current directory; the harness created it and copied your brief to .aether-tmp/brief.md. Skip the \`aether-wt ensure\` and \`aether-wt diff\` steps of your role: the harness packages your diff and reads your head from git. Never edit the integration worktree, the main checkout, or another unit's worktree. ${WORKDIR_RULE} Every other rule of your role holds. Answer with the structured output your harness asks for.`,
  supervisor: (harness) => `## You run in an external harness\n\nYou are an Aether supervisor, run by the ${harness} CLI rather than Claude Code. The current directory is a disposable copy of the unit's branch; the brief and the review package are in its .aether-tmp/ folder. Your review is read-only: do not run commands, and do not change any file. ${WORKDIR_RULE} Every other rule of your role holds. Answer with the structured output your harness asks for.`,
  reviewer: (harness) => `## You run in an external harness\n\nYou are the Aether final reviewer, run by the ${harness} CLI rather than Claude Code. The current directory is a disposable copy of the integration branch; the review package is in its .aether-tmp/ folder. Your review is read-only: do not run commands, and do not change any file. ${WORKDIR_RULE} Every other rule of your role holds. Answer with the structured output your harness asks for.`,
}

// The lane note of role, naming the harness that runs the call. agy is the default, as it was before harnesses.
function laneNote(role, harness = 'agy') {
  return LANE_NOTE_TEXT[role](harness)
}

const LANE_NOTES = { implementer: laneNote('implementer'), supervisor: laneNote('supervisor'), reviewer: laneNote('reviewer') }

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

function buildPrompt({ role, message, workdir, home, note, harness = 'agy' }) {
  return [roleBody(role), note ?? laneNote(role, harness), ...claudeMdSections(workdir, home), message].join('\n\n')
}

// The section that asks a harness for its answer as JSON, for a harness that takes the schema in its prompt.
function answerSection(role) {
  return ['## Your answer', 'End your answer with one JSON object that matches this schema, and nothing after it:', `\`\`\`json\n${JSON.stringify(ROLE_SCHEMAS[role], null, 2)}\n\`\`\``].join('\n\n')
}

// The prompt a call's harness reads: buildPrompt's, and for a harness with schemaInPrompt, the answer section last.
function callPrompt({ harness, adapter, role, message, workdir, home }) {
  const prompt = buildPrompt({ role, message, workdir, home, harness })
  return adapter.schemaInPrompt === true ? `${prompt}\n\n${answerSection(role)}` : prompt
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
    stopped: file('stopped'),
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

function loadTable() {
  const file = lanes.configPath()
  const config = lanes.loadConfig(file)
  if (!config) throw new Error(`no lane table: ${file}`)
  return config
}

// The table, the entry of harness name in it, and that harness's adapter.
function harnessSettings(name) {
  const config = loadTable()
  if (!Object.hasOwn(config.harnesses, name)) throw new Error(`the lane table has no ${name} harness`)
  const harness = config.harnesses[name]
  return { config, harness, adapter: createAdapter(name, harness) }
}

// The harness whose table entry has the lane model id. Lane model ids are unique across the table.
function harnessOfModel(config, model) {
  const owners = Object.keys(config.harnesses).filter((name) => Object.hasOwn(config.harnesses[name].models, model))
  if (owners.length === 0) throw new Error(`no harness in the lane table has the model ${model}`)
  if (owners.length > 1) throw new Error(`the model ${model} is in more than one harness: ${owners.join(', ')}`)
  return owners[0]
}

// The harness a call runs on, as start recorded it. A call that predates the record ran on agy, the only harness then.
function callHarness(info) {
  return typeof info?.harness === 'string' ? info.harness : 'agy'
}

// The table's entry for a lane model that serves role at effort: its group, its id and the level effort maps to, or null.
function laneModel(harness, role, model, effort) {
  const entry = Object.hasOwn(harness.models, model) ? harness.models[model] : null
  if (!entry || !entry.roles.includes(role) || !Object.hasOwn(entry.levels, effort)) return null
  return { group: entry.group, id: model, level: entry.levels[effort] }
}

// ---- status ----

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// The run's graph, or null when there is none or it cannot be read.
function readGraph(cwd, runId) {
  try {
    return run.readJson(path.join(run.runDir(repoPaths(cwd).mainRoot, runId), 'graph.json'))
  } catch {
    return null
  }
}

// The harnesses the owner enabled: AETHER_LANE_HARNESSES where the session's exports reach, else the ones
// the run's compile listed. The usage meter mod runs aether-lane in Claude Code's own environment, which the
// session's exports do not reach (decision A30), so there the run's graph carries the owner's list.
function enabledFor(cwd, runId) {
  if (process.env.AETHER_LANE_HARNESSES !== undefined) return lanes.enabledHarnesses()
  const listed = readGraph(cwd, runId)?.lanes?.harnesses
  if (Array.isArray(listed) && listed.length > 0) return listed
  return lanes.enabledHarnesses()
}

// The order of the candidates of each call the run's graph names: for each role and native model of lanes.calls, what
// lane-order.js's rule makes of them over the groups' views. A plan of an older compile has one lane, not a list, per
// call, and lanes.harness is the harness of a lane that names none. A graph with no lanes gives {}.
function orderOf(cwd, runId, harnesses) {
  const planned = readGraph(cwd, runId)?.lanes
  if (!isObject(planned) || !isObject(planned.calls)) return {}
  const byRole = {}
  for (const [role, byTier] of Object.entries(planned.calls)) {
    if (!isObject(byTier)) continue
    byRole[role] = {}
    for (const tier of Object.keys(byTier)) {
      byRole[role][tier] = order.orderCandidates(order.candidatesOf(planned.calls, role, tier, planned.harness ?? null), harnesses)
    }
  }
  return byRole
}

// Every harness of the table: an enabled one with the view of each of its groups (lane-quota.js), a disabled one by its
// command alone; then the order of the run's candidates and the live dry marks. It never refreshes: the reading is the
// one kept for its life, and grok's is its log's last line, however old. Each reading it takes goes to the lane log.
function status(cwd, runId) {
  run.assertRunId(runId)
  repoPaths(cwd)
  const config = loadTable()
  const enabled = enabledFor(cwd, runId)
  const dataDir = run.dataDir()
  const now = Date.now()
  const harnesses = {}
  for (const [name, settings] of Object.entries(config.harnesses)) {
    if (!enabled.includes(name)) {
      harnesses[name] = { enabled: false, command: settings.command }
      continue
    }
    const onRead = ({ groups }, version) => {
      lanes.appendLog(dataDir, null, { kind: 'reading', time: now, session: null, run: runId, design: null, harness: name, version, groups })
    }
    harnesses[name] = { enabled: true, ...quota.harnessView(name, settings, { reserve: config.reserve, now, dataDir, fresh: false, onRead }) }
  }
  return { time: new Date(now).toISOString(), harnesses, order: orderOf(cwd, runId, harnesses), marks: marks.liveMarks(dataDir, now) }
}

// The wave's quota step: renews the reading of each enabled harness that has a way to renew it (grok, over ACP and then
// through its UI) and whose reading is missing, unknown or older than its life. Only `status --refresh` calls it, and
// nobody calls it from start or the runner. A harness that cannot be refreshed leaves its reading as it is; the answer
// names the harnesses it tried, each as { refreshed, method }.
async function refreshStale(cwd, runId) {
  run.assertRunId(runId)
  repoPaths(cwd)
  return quota.refreshStale({ config: loadTable(), enabled: enabledFor(cwd, runId) })
}

// ---- start ----

// Ends whatever a launch of this call left running: the runner and agy by their pid files, then
// every process that carries the call's marker, since agy starts its commands in sessions of their own.
function killCall(paths) {
  const runner = lanes.killGroup(paths.pid, paths.marker)
  const agy = lanes.killGroup(paths.agyPid, paths.marker)
  const marked = lanes.killMarked(paths.marker)
  return runner.killed || agy.killed || marked.length > 0
}

function clearCallDir(paths) {
  for (const name of fs.readdirSync(paths.dir)) {
    if (!KEPT_ON_START.includes(name)) fs.rmSync(path.join(paths.dir, name), { recursive: true, force: true })
  }
}

// The group's reading from the harness's saved or fresh reading, or null when the reading fails or does not carry the
// group: an unknown group (R8), which never holds a call back and never leaves a mark.
function readGroup(adapter, { harness, settings, group, dataDir }) {
  try {
    return readings.readGroups(adapter, { harness, settings, dataDir }).groups[group] ?? null
  } catch {
    return null
  }
}

// Leaves the dry mark of a group, from the reading that shows it dry or, when a call ended for quota with nothing
// that shows it, from none. A mark that cannot be written changes nothing: the group goes unmarked this time.
function holdDry(dataDir, { harness, group, reading, config, now }) {
  try {
    marks.markDry(dataDir, { harness, group, reading, reserve: config.reserve, now, minutes: config.dryMarkMinutes })
  } catch {
    // The next start or call that finds the group dry marks it.
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
  const name = harnessOfModel(loadTable(), model)
  // A harness the owner did not enable runs no call, even when a model names it.
  if (!enabledFor(cwd, runId).includes(name)) return { unavailable: 'harness' }
  const { config, harness, adapter } = harnessSettings(name)
  const lane = CALLED_ROLES.includes(role) ? laneModel(harness, role, model, effort) : null
  if (!lane) return { unavailable: 'role' }
  if (!adapter.installed()) return { unavailable: 'not-installed' }
  const dataDir = run.dataDir()
  // A group a live mark holds is not read and its mark is not renewed: it is held until the mark's end.
  if (marks.liveMark(dataDir, name, lane.group) !== null) return { unavailable: 'quota' }
  // A reading that fails leaves the group unknown (R8), so the call starts: a harness that is broken fails the call
  // and the call goes native like any other failure. Only a reading that shows the group under the reserve holds it.
  const quotaBefore = readGroup(adapter, { harness: name, settings: harness, group: lane.group, dataDir })
  if (quotaBefore !== null && !lanes.usable(quotaBefore, config.reserve)) {
    holdDry(dataDir, { harness: name, group: lane.group, reading: quotaBefore, config, now: Date.now() })
    return { unavailable: 'quota' }
  }
  // The model the harness takes as --model: the adapter names it from the lane model id and its level.
  const passed = adapter.modelArg({ model: lane.id, level: lane.level })

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
    harness: name,
    model: passed,
    laneModel: lane.id,
    level: lane.level,
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
    env: lanes.laneEnv(process.env, paths.marker),
  })
  runner.unref()
  fs.writeFileSync(paths.pid, `${runner.pid}\n`)
  return { started: true, model: passed, group: lane.group }
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
      env: lanes.laneEnv(process.env, marker),
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

// The reason, then what stderr adds, each text once. agy can print its error both in its JSON, which
// the reason quotes, and on stderr: stderr then keeps it, and the reason drops its quote.
function failedDetail({ reason, error }, stderr) {
  const text = stderr
    .trim()
    .split('\n')
    .filter((line) => line.trim() === '' || !reason.includes(line.trim()))
    .join('\n')
    .trim()
    .slice(0, STDERR_DETAIL_CHARS)
  if (text === '') return reason
  const quote = error ? `: ${error}` : ''
  const head = quote !== '' && text.includes(error) && reason.endsWith(quote) ? reason.slice(0, -quote.length) : reason
  return `${head}\n${text}`
}

// The status, result and detail of a finished call, from the checks and agy's output, in that order.
// quotaRead says whether /usage could be read after the call: only a reading can find the group dry.
function judge(cwd, info, before, parsed, { quotaAfter, quotaRead }, reserve, stderr) {
  const { runId, role, task } = info
  const integration = work.checkIntegration(cwd, runId, before)
  if (!integration.ok) return { status: 'blocked', detail: integration.detail }
  if (role === 'supervisor') {
    const unit = work.checkUnitUnchanged(cwd, runId, task, before)
    if (!unit.ok) return { status: 'blocked', detail: unit.detail }
  }
  if (!parsed.clean) {
    if (quotaRead && !lanes.usable(quotaAfter, reserve)) return { status: 'quota', detail: parsed.reason }
    // A harness that reports no quota can only show it ran dry in its output, and so can grok, whose reading comes
    // from a log its headless calls do not update: a quota reason then ends the call as quota. agy's reasons never
    // start with `quota: `, so its reading alone decides.
    if (quotaRead && parsed.reason?.startsWith('quota: ')) return { status: 'quota', detail: parsed.reason }
    return { status: 'failed', detail: failedDetail(parsed, stderr) }
  }
  // Changes outside Owns are a violation whatever the answer says, so they are checked first.
  if (role === 'implementer') {
    const owns = work.checkOwns(cwd, runId, task)
    if (!owns.ok) return { status: 'violation', files: owns.files, detail: 'changes outside Owns' }
  }
  // A clean run whose answer breaks its role's schema is failed before the implementer's head is added to it.
  const problem = schemas.validate(ROLE_SCHEMAS[role], parsed.structured)
  if (problem !== null) return { status: 'failed', detail: `invalid answer: ${problem}` }
  if (role === 'implementer') {
    const { head } = work.finishImplementer(cwd, runId, task)
    return { status: 'ok', result: { ...parsed.structured, head }, detail: '' }
  }
  return { status: 'ok', result: parsed.structured, detail: '' }
}

const NO_USAGE = { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }

// A call's lane-log entry, in the one shape the report reads, for the runner and for stop alike.
function callEntry(info, { time, status, usage, conversation, quotaAfter, detail }) {
  return {
    kind: 'call',
    time,
    startedAt: info.startedAt,
    session: info.session,
    run: info.runId,
    design: null,
    call: info.call,
    role: info.role,
    task: info.task,
    harness: callHarness(info),
    model: info.model,
    group: info.group,
    effort: info.effort,
    status,
    durationMs: time - info.startedAt,
    usage,
    conversation,
    quotaBefore: info.quotaBefore,
    quotaAfter,
    detail,
  }
}

// What a finished call tells of its group: the group view of its final reading, as the order rule reads it.
function quotaSummary(reading, { reserve, now, mark }) {
  const { usable, unknown, remaining, resetsAt, priority, usedPercentAbsent } = order.groupView(reading, { reserve, now, mark })
  return { usable, unknown, remaining, resetsAt, priority, usedPercentAbsent }
}

async function runCall(cwd, runId, call) {
  const paths = callPaths(cwd, runId, call)
  const info = JSON.parse(fs.readFileSync(paths.call, 'utf8'))
  const { role, task, workdir, group } = info
  const harness = callHarness(info)
  let agyPid = null
  const onSignal = () => {
    if (agyPid !== null) killAgyGroup(agyPid)
    process.exit(143)
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, onSignal)

  let outcome
  let parsed = { usage: NO_USAGE, conversation: null }
  let config = null
  let quotaAfter = null
  let quotaRead = false
  const dataDir = run.dataDir()
  try {
    const settings = harnessSettings(harness)
    const { adapter } = settings
    config = settings.config
    const schema = ROLE_SCHEMAS[role]
    fs.writeFileSync(paths.schema, `${JSON.stringify(schema, null, 2)}\n`)
    const before = work.snapshot(cwd, runId, { taskId: role === 'reviewer' ? null : task })
    const message = fs.readFileSync(paths.prompt, 'utf8')
    const prompt = callPrompt({ harness, adapter, role, message, workdir, home: os.homedir() })
    const argv = adapter.argv({ model: info.laneModel, level: info.level, schemaFile: paths.schema, timeoutSeconds: info.timeoutSeconds, prompt })
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
    // What agy started in sessions of its own outlives its group; nothing may write after the checks.
    lanes.killMarked(paths.marker)
    try {
      // A fresh reading, which also renews the one kept for the starts that follow.
      quotaAfter = readings.readGroups(adapter, { harness, settings: settings.harness, dataDir, fresh: true }).groups[group] ?? null
      quotaRead = true
    } catch {
      // An unreadable /usage is an infrastructure failure, not a verdict on the quota.
      quotaAfter = null
    }
    const stdout = readTextOrEmpty(paths.agyStdout)
    const stderr = readTextOrEmpty(paths.agyStderr)
    parsed = adapter.parse({ stdout, stderr, exitCode }, { required: schema.required })
    outcome = judge(cwd, info, before, parsed, { quotaAfter, quotaRead }, config.reserve, stderr)
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
    harness,
    model: info.model,
    group,
    effort: info.effort,
    durationMs: time - info.startedAt,
    usage: parsed.usage,
    conversation: parsed.conversation,
  }
  // A call that ended for quota holds its group, from its final reading: until the reset when that reading shows the
  // group under the reserve, for the default length otherwise. The summary below is taken after the mark.
  if (outcome.status === 'quota') holdDry(dataDir, { harness, group, reading: quotaAfter, config, now: time })
  if (quotaRead) lane.quota = quotaSummary(quotaAfter, { reserve: config.reserve, now: time, mark: marks.liveMark(dataDir, harness, group, time) })
  try {
    lanes.appendLog(
      dataDir,
      info.session,
      callEntry(info, { time, status: outcome.status, usage: lane.usage, conversation: lane.conversation, quotaAfter, detail: outcome.detail }),
    )
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
  const seconds = maxSeconds ?? harnessSettings(callHarness(readJsonOrNull(paths.call))).harness.waitSeconds
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

// The log entry of a call that stop ended before its runner wrote a result, written once. The usage is
// what agy reported, when it got as far as reporting; zeros otherwise.
function logStopped(paths) {
  const info = readJsonOrNull(paths.call)
  if (!info || fs.existsSync(paths.result) || fs.existsSync(paths.stopped)) return
  const time = Date.now()
  fs.writeFileSync(paths.stopped, `${time}\n`)
  const reported = harnessSettings(callHarness(info)).adapter.parse({ stdout: readTextOrEmpty(paths.agyStdout), stderr: '', exitCode: 0 })
  const detail = 'stopped by aether-lane stop before the call had a result'
  lanes.appendLog(run.dataDir(), info.session, callEntry(info, { time, status: 'stopped', usage: reported.usage, conversation: reported.conversation, quotaAfter: null, detail }))
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
    const paths = callPaths(cwd, runId, name)
    if (killCall(paths)) stopped.push(name)
    try {
      logStopped(paths)
    } catch {
      // A log that cannot be written must not keep stop from ending the call.
    }
    work.removeReader(cwd, runId, name)
  }
  return { stopped }
}

module.exports = { WORKDIR_RULE, LANE_NOTES, roleBody, claudeMdSections, buildPrompt, status, refreshStale, start, wait, result, stop, runCall }
