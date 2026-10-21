'use strict'

// The `aether-lane delegate` command: a loose editing charge runs first on an external pair, in a
// one-unit run the command writes itself, and comes back as the unit's branch with the tests the
// command ran in its worktree and a review of its diff. The pair is the one rule's (choose in
// lib/superdelegation.js, over the views of lib/lane-pick.js); a pair that fails saves its work as a
// patch and passes to the next candidate, never the same one, and a full cupo on one harness only
// excludes that harness for this charge. The command never merges: the Lead reads the result,
// merges with aether-wt, or, on `no-candidate`, runs the charge natively under the same id.

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { repoPaths, currentBranch, head } = require('./git.js')
const run = require('./run.js')
const lanes = require('./lanes.js')
const pairs = require('./pairs.js')
const superdelegation = require('./superdelegation.js')
const lanePick = require('./lane-pick.js')
const calls = require('./lane-calls.js')
const wt = require('./worktrees.js')
const { normalizePattern } = require('./globs.js')

const ALLOWED_HARNESSES = ['agy', 'grok', 'muse']
const DELEGATE_USAGE = 'delegate --brief <file> --model <haiku|sonnet|opus> --effort <low|medium|high|xhigh|max> --owns <glob>[,<glob>...] [--tests <command>] [--session <id>]'
const TASK_ID = 'task-1'
const WAIT_MARGIN_SECONDS = 180
const TEST_TIMEOUT_MS = 15 * 60 * 1000
const OUTPUT_TAIL_CHARS = 4000

// The reviewer's native reference pair, derived from the model the charge names.
function reviewerReference(model) {
  if (model === 'opus') return { model: 'opus', effort: 'xhigh' }
  if (model === 'haiku') return { model: 'sonnet', effort: 'high' }
  return { model: 'opus', effort: 'high' }
}

// An Owns entry is a relative path or glob: no absolute path, no ".." segment,
// no whitespace, no backtick and no brackets. The same rule as a plan's Owns.
function isOwnsEntry(entry) {
  if (typeof entry !== 'string' || entry === '') return false
  if (entry.startsWith('/') || entry.split('/').includes('..')) return false
  return !/[\s`{}()[\]]/.test(entry)
}

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

function readPid(file) {
  try {
    const pid = Number.parseInt(fs.readFileSync(file, 'utf8'), 10)
    return pid > 0 ? pid : null
  } catch {
    return null
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function listDirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

// ---- The cupo slots ----

function cupoDir(dataDir, harness) {
  return path.join(dataDir, 'lanes', 'cupo', harness)
}

// Takes the first free slot-<i> of a harness under <dataDir>/lanes/cupo/<harness>/, atomically by
// mkdir, while the standing slots do not reach maxParallel - liveExternal; a slot whose pid no
// longer lives is reclaimed on the spot. The slot holds `pid` and, when runId is given, `run`, so
// that liveLaneCalls does not count the slot holder's own call twice. Null when there is no room.
function acquireSlot(dataDir, harness, maxParallel, { pid = process.pid, isAlive = defaultIsAlive, liveExternal = 0, runId = null } = {}) {
  if (!Number.isInteger(maxParallel) || maxParallel < 1) return null
  const capacity = maxParallel - liveExternal
  if (capacity <= 0) return null
  const dir = cupoDir(dataDir, harness)
  fs.mkdirSync(dir, { recursive: true })
  for (;;) {
    let standing = 0
    const free = []
    for (let i = 0; i < maxParallel; i++) {
      const slot = path.join(dir, `slot-${i}`)
      if (!fs.existsSync(slot)) {
        free.push(slot)
        continue
      }
      const holder = readPid(path.join(slot, 'pid'))
      // A slot whose pid file cannot be read yet belongs to a delegate still writing it: it stands.
      if (holder === null || isAlive(holder)) {
        standing += 1
        continue
      }
      fs.rmSync(slot, { recursive: true, force: true })
      free.push(slot)
    }
    if (standing >= capacity || free.length === 0) return null
    const slot = free[0]
    try {
      fs.mkdirSync(slot)
    } catch (err) {
      if (err.code === 'EEXIST') continue
      throw err
    }
    fs.writeFileSync(path.join(slot, 'pid'), `${pid}\n`)
    if (runId !== null) fs.writeFileSync(path.join(slot, 'run'), `${runId}\n`)
    return { slot }
  }
}

// Releases a slot: removes its directory. Never throws.
function releaseSlot(dataDir, harness, slot) {
  try {
    const given = typeof slot === 'string' ? slot : slot?.slot
    if (typeof given !== 'string' || given === '') return
    const dir = path.isAbsolute(given) ? given : path.join(cupoDir(dataDir, harness), given)
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // A slot that cannot be removed is reclaimed when its pid is dead.
  }
}

// The run ids a standing slot of harness already counts: the trimmed `run` file of each slot whose
// pid lives. Counting never reclaims a slot; that is acquireSlot's.
function slottedRuns(dataDir, harness, isAlive) {
  const runs = new Set()
  for (const name of listDirs(cupoDir(dataDir, harness))) {
    if (!name.startsWith('slot-')) continue
    const dir = path.join(cupoDir(dataDir, harness), name)
    const pid = readPid(path.join(dir, 'pid'))
    if (pid === null || !isAlive(pid)) continue
    const runId = readText(path.join(dir, 'run'))?.trim()
    if (runId) runs.add(runId)
  }
  return runs
}

// How many lane calls of harness are still in flight in this repository that no standing slot
// already counts: one per call folder under <mainRoot>/.aether/runs/*/lanes/*/ whose call.json is
// of the harness (a missing harness field ran on agy, as in lane-calls.js), of a run that is not
// excludeRun nor held by a standing slot of the data directory, with no finished result and a live
// pid file. An unreadable call.json counts nothing and breaks nothing.
function liveLaneCalls(mainRoot, harness, { dataDir = null, excludeRun = null, isAlive = defaultIsAlive } = {}) {
  const runsDir = path.join(run.aetherDir(mainRoot), 'runs')
  if (!fs.existsSync(runsDir)) return 0
  const held = dataDir === null ? new Set() : slottedRuns(dataDir, harness, isAlive)
  let count = 0
  for (const runId of listDirs(runsDir)) {
    if (runId === excludeRun || held.has(runId)) continue
    for (const call of listDirs(path.join(runsDir, runId, 'lanes'))) {
      const dir = path.join(runsDir, runId, 'lanes', call)
      const info = readJsonOrNull(path.join(dir, 'call.json'))
      if (info === null || typeof info !== 'object') continue
      const of = typeof info.harness === 'string' ? info.harness : 'agy'
      if (of !== harness) continue
      if (readJsonOrNull(path.join(dir, 'result.json'))?.done === true) continue
      const pid = readPid(path.join(dir, 'pid'))
      if (pid !== null && isAlive(pid)) count += 1
    }
  }
  return count
}

// ---- The command ----

const usageError = () => new Error(`usage: aether-lane ${DELEGATE_USAGE}`)

// The flags of the charge, checked. Throws the usage error the bin prints as { error }.
function checkFlags(flags) {
  const known = ['brief', 'model', 'effort', 'owns', 'tests', 'session']
  for (const name of Object.keys(flags ?? {})) if (!known.includes(name)) throw usageError()
  const { brief, model, effort, owns, tests, session } = flags ?? {}
  if (typeof brief !== 'string' || brief === '') throw usageError()
  if (!pairs.NATIVE_MODELS.includes(model)) throw usageError()
  if (!pairs.EFFORTS.includes(effort)) throw usageError()
  if (typeof owns !== 'string' || owns === '') throw usageError()
  const entries = owns.split(',').map(normalizePattern).filter(Boolean)
  if (entries.length === 0 || !entries.every(isOwnsEntry)) throw usageError()
  if (tests !== undefined && (typeof tests !== 'string' || tests === '')) throw usageError()
  if (session !== undefined && !/^[A-Za-z0-9_-]+$/.test(session)) throw usageError()
  return { brief, model, effort, owns: entries, tests: tests ?? null, session: session ?? null }
}

// The command's clock: deps.now as a number or as a function of no arguments.
const nowOf = (deps) => (typeof deps.now === 'function' ? deps.now() : (deps.now ?? Date.now()))

const pickedOf = (pair) =>
  pair && {
    id: pair.id,
    harness: pair.harness,
    model: pair.model,
    effort: pair.effort,
    group: pair.group,
    family: pair.family,
    intelligence: pair.intelligence,
    costPerTaskUsd: pair.costPerTaskUsd,
  }

const pairOf = (pair) => ({ id: pair.id, harness: pair.harness, model: pair.model, effort: pair.effort })

// The prompt of the pair that writes: the brief, then the paths the charge owns and, when it
// carries one, its test command.
function implementerPrompt(briefText, { owns, tests }) {
  const parts = [briefText, ['## Paths you own', '', 'You may change only these paths:', ...owns.map((entry) => `- ${entry}`)].join('\n')]
  if (tests !== null) parts.push(['## Tests', '', `Run these tests before you finish: \`${tests}\``].join('\n'))
  return parts.join('\n\n')
}

// The prompt of a reviewer of the unit: the instruction, what the implementer reported, and the
// result of the tests the command itself ran, in that order.
function reviewerPrompt({ implementer, tests }) {
  const reported = [
    '## What the implementer reported',
    '',
    `Status: ${implementer.status ?? ''}`,
    `Summary: ${implementer.summary ?? ''}`,
    `Tests: ${implementer.tests ?? ''}`,
    `Concerns: ${implementer.concerns ?? ''}`,
  ].join('\n')
  const ran =
    tests === null
      ? ['## Tests the command ran', '', 'The charge brought no test command, so the command ran none.'].join('\n')
      : [
          '## Tests the command ran',
          '',
          `Command: \`${tests.command}\``,
          `Exit code: ${tests.exitCode}`,
          `Passed: ${tests.passed}`,
          `Timed out: ${tests.timedOut}`,
          '',
          '```',
          tests.outputTail,
          '```',
        ].join('\n')
  return [
    'Review the review package `package.diff` against the brief `brief.md`: both are in the `.aether-tmp` folder of your copy. Judge the diff against what the brief asks for, and nothing else.',
    reported,
    ran,
  ].join('\n\n')
}

// Runs the charge's test command inside the unit worktree, as merge runs its own.
function runTests(worktree, command) {
  const done = spawnSync(command, { cwd: worktree, shell: true, encoding: 'utf8', timeout: TEST_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 })
  return {
    command,
    exitCode: done.status,
    passed: done.status === 0,
    timedOut: Boolean(done.error && done.error.code === 'ETIMEDOUT'),
    outputTail: `${done.stdout || ''}${done.stderr || ''}`.slice(-OUTPUT_TAIL_CHARS),
  }
}

// The patch of a failed attempt of the writer, renamed to its attempt number so the next attempt
// cannot overwrite it; null when the attempt left nothing to save.
function salvagePatch(ctx, attempt) {
  let patch = null
  try {
    patch = wt.removeUnit(ctx.cwd, ctx.id, TASK_ID, { keepPatch: true }).patch
  } catch {
    return null
  }
  if (!patch) return null
  const named = path.join(ctx.runDir, 'patches', `${TASK_ID}-attempt-${attempt}.patch`)
  fs.mkdirSync(path.dirname(named), { recursive: true })
  if (path.resolve(patch) !== path.resolve(named)) fs.renameSync(patch, named)
  return named
}

// The cause with which a loop that found no pair ends: a failed attempt outranks a full cupo,
// which outranks the dry test choose itself makes for its reason, and what is left is no-pair.
function endCause({ tried, decision }) {
  if (tried.some((entry) => entry.pair !== null)) return 'failed'
  if (tried.some((entry) => entry.cause === 'cupo')) return 'cupo'
  return decision !== null && decision.reason.includes('is dry') ? 'dry' : 'no-pair'
}

// One launched attempt: writes the prompt, starts the call, waits with the injected wait, and
// reads its result. Returns { result } on a lane `ok`, else { cause, detail }.
async function attemptCall(ctx, { role, call, picked, prompt }) {
  const dir = path.join(ctx.runDir, 'lanes', call)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'prompt.md'), prompt)
  run.writeJson(path.join(dir, 'spawn.json'), { session: ctx.session, workflowRunId: null, agentIndex: null })
  const started = calls.start(ctx.cwd, ctx.id, call, { role, task: TASK_ID, model: picked.model, effort: picked.effort, digest: lanes.digest(prompt) })
  if (started.unavailable) return { cause: `unavailable: ${started.unavailable}`, detail: `unavailable: ${started.unavailable}` }
  const harness = ctx.config.harnesses[picked.harness]
  await ctx.wait(ctx.cwd, ctx.id, call, { maxSeconds: harness.timeouts[role] + WAIT_MARGIN_SECONDS })
  let done
  try {
    done = calls.result(ctx.cwd, ctx.id, call)
  } catch (err) {
    // The wait gave up on a call still running: end it before its work is salvaged or retried.
    try {
      calls.stop(ctx.cwd, ctx.id, call)
    } catch {
      // The failure is already the attempt's cause; a stop that breaks changes nothing.
    }
    return { cause: 'failed', detail: err.message }
  }
  if (done.status !== 'ok') return { cause: done.status, detail: done.detail || done.status }
  if (role === 'implementer' && done.result?.status === 'NEEDS_CONTEXT') return { cause: 'needs-context', detail: done.result.question || done.result.summary || 'needs-context' }
  if (role === 'implementer' && done.result?.status === 'BLOCKED') return { cause: 'blocked', detail: done.result.question || done.result.summary || 'blocked' }
  return { result: done.result }
}

// The one choice loop of the writer and of the reviewer: choose, log the choice, count the live
// calls, take a slot or exclude the full harness for this charge, run the attempt, and on a
// failure exclude that pair and choose again. A full cupo is never an attempt.
async function runLoop(ctx, { role, reference, exclude: initialExclude, prompt, callName }) {
  const exclude = [...initialExclude]
  const tried = []
  const fullHarnesses = new Set()
  let attempts = 0
  let decision = null
  let lastDetail = null
  for (;;) {
    const now = nowOf(ctx.deps)
    const latest = await lanePick.latestReadings(ctx.config, ctx.enabled, { dataDir: ctx.dataDir, now })
    const harnesses = lanePick.harnessViews(ctx.config, ctx.enabled, { dataDir: ctx.dataDir, now, latest })
    decision = superdelegation.choose({ pairs: ctx.table, reference, harnesses, exclude, nativeDiffers: role !== 'implementer' })
    const call = callName(attempts + 1)
    lanes.appendLog(ctx.dataDir, null, {
      kind: 'choice',
      time: now,
      session: null,
      run: ctx.id,
      design: null,
      call,
      role,
      requested: decision.requested,
      reference: decision.reference,
      picked: pickedOf(decision.picked),
      native: decision.native,
      reason: decision.reason,
      candidates: decision.candidates.map(({ id, outcome, why }) => ({ id, outcome, why })),
    })
    if (!decision.picked) break
    const picked = decision.picked
    const harness = ctx.config.harnesses[picked.harness]
    const liveExternal = liveLaneCalls(ctx.mainRoot, picked.harness, { dataDir: ctx.dataDir, excludeRun: ctx.id, isAlive: ctx.isAlive })
    const held = acquireSlot(ctx.dataDir, picked.harness, harness.maxParallel, { isAlive: ctx.isAlive, liveExternal, runId: ctx.id })
    if (held === null) {
      if (!fullHarnesses.has(picked.harness)) {
        fullHarnesses.add(picked.harness)
        tried.push({ pair: null, harness: picked.harness, cause: 'cupo' })
      }
      for (const pair of ctx.table) if (pair.harness === picked.harness && !exclude.includes(pair.id)) exclude.push(pair.id)
      continue
    }
    attempts += 1
    let outcome
    try {
      outcome = await attemptCall(ctx, { role, call, picked, prompt })
    } finally {
      releaseSlot(ctx.dataDir, picked.harness, held.slot)
    }
    if (outcome.result !== undefined) return { result: outcome.result, picked, reason: decision.reason, tried, attempts }
    lastDetail = outcome.detail
    if (role === 'implementer') {
      tried.push({ pair: picked.id, cause: outcome.cause, patch: salvagePatch(ctx, attempts) })
    } else {
      tried.push({ pair: picked.id, cause: outcome.cause })
    }
    exclude.push(picked.id)
  }
  return { cause: endCause({ tried, decision }), reason: lastDetail ?? decision?.reason ?? '', tried, attempts }
}

// Runs fn with env laid over process.env, restoring what was there: the libraries the command
// composes (the lane table's path, the data directory, the runner a start spawns) read the
// process environment, and a test that calls the command in its own process passes its own.
async function withEnv(env, fn) {
  const previous = new Map()
  for (const [name, value] of Object.entries(env)) {
    previous.set(name, Object.hasOwn(process.env, name) ? process.env[name] : undefined)
    process.env[name] = value
  }
  try {
    return await fn()
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

async function delegateWithEnv(cwd, flags, deps) {
  const charge = checkFlags(flags)
  const env = deps.env ?? process.env
  const gate = superdelegation.enabled(env)
  if (!gate.on) return { status: 'off', reason: gate.reason }

  const briefFile = path.resolve(cwd, charge.brief)
  let briefText
  try {
    briefText = fs.readFileSync(briefFile, 'utf8')
  } catch {
    throw new Error(`cannot read brief: ${briefFile}`)
  }
  const tableFile = lanes.configPath()
  const config = lanes.loadConfig(tableFile)
  if (!config) throw new Error(`no lane table: ${tableFile}`)
  const table = pairs.loadPairs().pairs
  const enabled = lanes.enabledHarnesses(env).filter((name) => ALLOWED_HARNESSES.includes(name))

  const paths = repoPaths(cwd)
  const branch = currentBranch(cwd)
  if (!branch) throw new Error('the integration worktree has a detached HEAD; check out the integration branch first')
  const base = head(cwd)
  const id = typeof deps.newRunId === 'function' ? deps.newRunId() : run.newRunId()
  run.assertRunId(id)
  run.ensureExcluded(paths.gitCommonDir)
  const runDir = run.runDir(paths.mainRoot, id)
  const briefPath = path.join(runDir, 'briefs', `${TASK_ID}.md`)
  fs.mkdirSync(path.dirname(briefPath), { recursive: true })
  fs.writeFileSync(briefPath, briefText)
  const laneArgs = superdelegation.runArgs(config, table, { installed: (name, harness) => lanes.commandInstalled(harness.command, env), enabled })
  run.writeJson(path.join(runDir, 'graph.json'), {
    runId: id,
    binDir: path.join(__dirname, '..', 'bin'),
    repoRoot: paths.mainRoot,
    runDir,
    plan: null,
    spec: null,
    integration: { branch, worktree: paths.worktree, base, firstBase: base, watched: false },
    testCommand: charge.tests ?? 'true',
    ladder: { haiku: 2, sonnet: 2, opus: 1 },
    maxAgents: 1,
    waves: [[TASK_ID]],
    tasks: {
      [TASK_ID]: {
        number: 1,
        title: 'delegate',
        tier: charge.model,
        tierReason: 'delegate',
        effort: charge.effort,
        review: 'high',
        area: 'delegate',
        owns: charge.owns,
        dependsOn: [],
        brief: briefPath,
      },
    },
    lanes: laneArgs,
  })
  run.writeJson(path.join(runDir, 'state.json'), {
    runId: id,
    status: 'compiled',
    plan: null,
    compiledAt: new Date(nowOf(deps)).toISOString(),
    launches: 1,
  })

  const ctx = {
    cwd,
    id,
    runDir,
    mainRoot: paths.mainRoot,
    config,
    table,
    enabled,
    dataDir: run.dataDir(env),
    session: charge.session,
    deps,
    isAlive: deps.isAlive ?? defaultIsAlive,
    wait: deps.wait ?? calls.wait,
  }

  const written = await runLoop(ctx, {
    role: 'implementer',
    reference: { model: charge.model, effort: charge.effort },
    exclude: [],
    prompt: implementerPrompt(briefText, charge),
    callName: (attempt) => `${TASK_ID}-${attempt}-implement`,
  })
  if (written.result === undefined) {
    const result = { status: 'no-candidate', id, run: id, cause: written.cause, reason: written.reason, tried: written.tried }
    lanes.appendLog(ctx.dataDir, charge.session, { kind: 'delegate', time: nowOf(deps), session: charge.session, run: id, id, status: 'no-candidate', cause: written.cause, tried: written.tried })
    return result
  }

  const implementer = written.result
  const worktree = run.unitWorktree(paths.mainRoot, id, TASK_ID)
  const tests = charge.tests === null ? null : runTests(worktree, charge.tests)
  const reviewed = await runLoop(ctx, {
    role: 'reviewer',
    reference: reviewerReference(charge.model),
    exclude: [written.picked.id],
    prompt: reviewerPrompt({ implementer, tests }),
    callName: (attempt) => `${TASK_ID}-review-${attempt}`,
  })
  const review =
    reviewed.result !== undefined
      ? { status: 'done', pair: pairOf(reviewed.picked), verdict: reviewed.result.verdict, findings: reviewed.result.findings, summary: reviewed.result.summary }
      : reviewed.attempts === 0
        ? { status: 'none', cause: reviewed.cause }
        : { status: 'no-verdict', tried: reviewed.tried }
  return {
    status: 'done',
    id,
    run: id,
    branch: run.unitBranch(id, TASK_ID),
    worktree,
    head: typeof implementer.head === 'string' && implementer.head !== '' ? implementer.head : head(worktree),
    pair: pairOf(written.picked),
    reason: written.reason,
    summary: implementer.summary,
    implementer: { status: implementer.status, tests: implementer.tests, concerns: implementer.concerns, question: implementer.question },
    tests,
    review,
    tried: written.tried,
    merge: `aether-wt merge ${id} ${TASK_ID}`,
  }
}

// The delegate command: flags are the bin's --name values by name; deps carries the environment,
// the clock, the run id, the wait and the pid check a test replaces. Off, done and no-candidate
// all come back as a result; a bad usage throws, for the bin to print as { error }.
function delegateCommand(cwd, flags, deps = {}) {
  return withEnv(deps.env ?? {}, () => delegateWithEnv(cwd, flags, deps))
}

module.exports = { ALLOWED_HARNESSES, DELEGATE_USAGE, reviewerReference, isOwnsEntry, acquireSlot, releaseSlot, liveLaneCalls, delegateCommand }
