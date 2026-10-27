'use strict'

// The `aether-lane delegate` command: a loose editing charge runs first on an external pair, in a
// one-unit run the command writes itself, and comes back as the unit's branch with the tests the
// command ran in its worktree and a review of its diff. The pair is the one rule's (choose in
// lib/superdelegation.js, over the views of lib/lane-pick.js); a pair that fails saves its work as a
// patch and passes to the next candidate, never the same one. When that patch is the work the pair
// left and the guards accept it, the next pair starts from that work instead of from a clean tree.
// A harness has no limit on its calls in flight: an attempt starts at once on the pair that was chosen.
// The command never merges: the Lead reads the result, merges with aether-wt, or, on `no-candidate`,
// runs the charge natively under the same id.

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
const work = require('./lane-work.js')
const wt = require('./worktrees.js')
const { normalizePattern } = require('./globs.js')

const ALLOWED_HARNESSES = ['agy', 'grok', 'muse']
const DELEGATE_USAGE = 'delegate --brief <file> --model <haiku|sonnet|opus> --effort <low|medium|high|xhigh|max> --owns <glob>[,<glob>...] [--tests <command>] [--pair <pair id>] [--carry <patch file>] [--findings <file>] [--session <id>]'
const TASK_ID = 'task-1'
const WAIT_MARGIN_SECONDS = 180
const TEST_TIMEOUT_MS = 15 * 60 * 1000
const OUTPUT_TAIL_CHARS = 4000

// The reviewer's native reference pair, derived from the model the charge names.
function reviewerReference(model) {
  if (model === 'opus') return { model: 'opus', effort: 'high' }
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

// ---- The command ----

const usageError = () => new Error(`usage: aether-lane ${DELEGATE_USAGE}`)

// Whether name is a file of the charge: a flag value that is a path to a file that exists.
function isFile(cwd, name) {
  if (typeof name !== 'string' || name === '') return false
  try {
    return fs.statSync(path.resolve(cwd, name)).isFile()
  } catch {
    return false
  }
}

// The flags of the charge, checked. Throws the usage error the bin prints as { error }.
function checkFlags(cwd, flags) {
  const known = ['brief', 'model', 'effort', 'owns', 'tests', 'pair', 'carry', 'findings', 'session']
  for (const name of Object.keys(flags ?? {})) if (!known.includes(name)) throw usageError()
  const { brief, model, effort, owns, tests, pair, carry, findings, session } = flags ?? {}
  if (typeof brief !== 'string' || brief === '') throw usageError()
  if (!pairs.NATIVE_MODELS.includes(model)) throw usageError()
  if (!pairs.EFFORTS.includes(effort)) throw usageError()
  if (typeof owns !== 'string' || owns === '') throw usageError()
  const entries = owns.split(',').map(normalizePattern).filter(Boolean)
  if (entries.length === 0 || !entries.every(isOwnsEntry)) throw usageError()
  if (tests !== undefined && (typeof tests !== 'string' || tests === '')) throw usageError()
  if (pair !== undefined && (typeof pair !== 'string' || pair === '')) throw usageError()
  if (carry !== undefined && !isFile(cwd, carry)) throw usageError()
  if (findings !== undefined && !isFile(cwd, findings)) throw usageError()
  if (session !== undefined && !/^[A-Za-z0-9_-]+$/.test(session)) throw usageError()
  return {
    brief,
    model,
    effort,
    owns: entries,
    tests: tests ?? null,
    pair: pair ?? null,
    carry: carry === undefined ? null : path.resolve(cwd, carry),
    findings: findings === undefined ? null : fs.readFileSync(path.resolve(cwd, findings), 'utf8').trimEnd(),
    session: session ?? null,
  }
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

// The line the swarm already gives a pair that takes over a unit (workflows/run.workflow.js,
// "Continue from it"): the work is in the tree, uncommitted, and the pair goes on from it.
const CONTINUATION_BLOCK = ['## An external agent began this attempt', 'An earlier agent began this task. Its uncommitted work, if any, is in the worktree. Continue from it.'].join('\n')

// The prompt of the pair that writes: the brief, then the paths the charge owns and, when it
// carries them, its test command and the findings the attempt is to fix.
function implementerPrompt(briefText, { owns, tests, findings }) {
  const parts = [briefText, ['## Paths you own', '', 'You may change only these paths:', ...owns.map((entry) => `- ${entry}`)].join('\n')]
  if (tests !== null) parts.push(['## Tests', '', `Run these tests before you finish: \`${tests}\``].join('\n'))
  if (findings !== null) parts.push(['## Findings to fix', '', findings].join('\n'))
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
// cannot overwrite it. patch is null when the attempt left nothing to save; error when the salvage
// itself failed, so the caller does not apply an older patch on top of a worktree that may remain.
function salvagePatch(ctx, attempt) {
  let saved
  try {
    saved = wt.removeUnit(ctx.cwd, ctx.id, TASK_ID, { keepPatch: true })
  } catch {
    return { patch: null, error: true }
  }
  if (!saved.patch) return { patch: null, error: false }
  const named = path.join(ctx.runDir, 'patches', `${TASK_ID}-attempt-${attempt}.patch`)
  fs.mkdirSync(path.dirname(named), { recursive: true })
  if (path.resolve(saved.patch) !== path.resolve(named)) fs.renameSync(saved.patch, named)
  return { patch: named, error: false }
}

// The latest patch is already the whole diff from the base, including whatever that attempt
// continued from. Offering it replaces the previous offer, so the next pair applies one patch.
// An empty patch drops the offer only when this attempt started from that work and left the tree
// clean. An attempt that never received it leaves the offer for the pair after it.
function offerAfter(saved, offer, continued) {
  if (saved.error) return null
  if (saved.patch && work.patchHasDiff(saved.patch)) return saved.patch
  if (saved.patch && continued) return null
  return offer
}

// The next pair starts from offer only when both guards accept that patch. A refusal is named in
// reason, so the result can say why the earlier work was not carried over.
function settleCarry(ctx, offer, owns) {
  if (!offer) return { apply: false }
  const decision = work.assessCarry(ctx.cwd, offer, owns, ctx.id)
  if (decision.apply) return { apply: true }
  if (decision.empty) return { apply: false }
  return { apply: false, reason: decision.reason }
}

// The cause with which a loop that found no pair ends: a failed attempt outranks the dry test choose
// itself makes for its reason, and what is left is no-pair.
function endCause({ tried, decision }) {
  if (tried.some((entry) => entry.pair !== null)) return 'failed'
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

// The table and the reference of a choice that can only pick the pair with this id: the Claude pairs stay in the
// table because a reference is one of them, and the lowest is the reference, so no other pair is asked for its points.
function pinnedChoice(table, id) {
  const native = table.filter((pair) => pair.harness === pairs.NATIVE_HARNESS)
  const lowest = native.reduce((low, pair) => (pair.intelligence < low.intelligence ? pair : low))
  return { table: [...native, ...table.filter((pair) => pair.id === id)], reference: { model: lowest.model, effort: lowest.effort } }
}

// The one choice loop of the writer and of the reviewer: choose, log the choice, run the attempt on the
// pair chosen, and on a failure exclude that pair and choose again.
//
// An implementer loop may start with an offer (the patch of earlier work) and with a pinned pair: the first
// choice is made over that pair alone (the table keeps the Claude pairs, which a reference needs, and the
// lowest of them is the reference, so that only the pair's own quota and marks count). A pinned pair that
// cannot be chosen is dropped, and the loop goes on with the whole table; one that fails is excluded as any.
async function runLoop(ctx, { role, reference, exclude: initialExclude, prompt, callName, owns = null, offer: initialOffer = null, pinned: pinnedPair = null }) {
  const exclude = [...initialExclude]
  const tried = []
  let attempts = 0
  let decision = null
  let lastDetail = null
  let offer = initialOffer // the newest non-empty patch a writer left, which the next pair may start from
  let pinned = pinnedPair
  try {
    for (;;) {
      const now = nowOf(ctx.deps)
      const latest = await lanePick.latestReadings(ctx.config, ctx.enabled, { dataDir: ctx.dataDir, now })
      const harnesses = lanePick.harnessViews(ctx.config, ctx.enabled, { dataDir: ctx.dataDir, now, latest })
      decision = null
      if (pinned !== null && !exclude.includes(pinned)) {
        const only = pinnedChoice(ctx.table, pinned)
        decision = superdelegation.choose({ pairs: only.table, reference: only.reference, harnesses, exclude, nativeDiffers: false, role, lanes: ctx.config })
        if (!decision.picked) decision = null
      }
      pinned = null
      if (decision === null) decision = superdelegation.choose({ pairs: ctx.table, reference, harnesses, exclude, nativeDiffers: role !== 'implementer', role, lanes: ctx.config })
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
      attempts += 1
      const carry = role === 'implementer' ? settleCarry(ctx, offer, owns) : { apply: false }
      if (role === 'implementer') work.armCarry(ctx.cwd, ctx.id, TASK_ID, carry.apply ? offer : null)
      const attemptPrompt = carry.apply ? `${prompt}\n\n${CONTINUATION_BLOCK}` : prompt
      const outcome = await attemptCall(ctx, { role, call, picked, prompt: attemptPrompt })
      const started = outcome.result !== undefined || !String(outcome.cause || '').startsWith('unavailable')
      let continued = false
      let carryNote = carry.reason || null
      // An attempt that never reached its worktree did not start from the earlier work, even when the
      // prompt was going to tell it to. The receipt is what the worktree actually received.
      if (role === 'implementer' && carry.apply && started) {
        const applied = work.consumeCarryResult(ctx.cwd, ctx.id, TASK_ID)
        continued = applied === true
        if (applied === false) carryNote = work.CARRY_UNAPPLICABLE
      }
      if (outcome.result !== undefined) return { result: outcome.result, picked, reason: decision.reason, tried, attempts, continued, carry: carryNote }
      lastDetail = outcome.detail
      if (role === 'implementer') {
        const saved = salvagePatch(ctx, attempts)
        const entry = { pair: picked.id, cause: outcome.cause, patch: saved.patch, continued }
        if (carryNote) entry.carry = carryNote
        tried.push(entry)
        offer = offerAfter(saved, offer, continued)
      } else {
        tried.push({ pair: picked.id, cause: outcome.cause })
      }
      exclude.push(picked.id)
    }
    return { cause: endCause({ tried, decision }), reason: lastDetail ?? decision?.reason ?? '', tried, attempts }
  } finally {
    // A start that refuses the attempt leaves the arm file. The loop then exits when the next
    // choice finds no pair, and a later caller must not find that file and apply it.
    if (role === 'implementer') work.armCarry(ctx.cwd, ctx.id, TASK_ID, null)
  }
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
  const charge = checkFlags(cwd, flags)
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
  if (charge.pair !== null && !table.some((pair) => pair.id === charge.pair && pair.harness !== pairs.NATIVE_HARNESS)) throw usageError()
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
  // The carry guard only takes a patch from the run's own patches folder, so the earlier work is copied there.
  let offered = null
  if (charge.carry !== null) {
    offered = path.join(runDir, 'patches', `${TASK_ID}-carry.patch`)
    fs.mkdirSync(path.dirname(offered), { recursive: true })
    fs.copyFileSync(charge.carry, offered)
  }
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
    config,
    table,
    enabled,
    dataDir: run.dataDir(env),
    session: charge.session,
    deps,
    wait: deps.wait ?? calls.wait,
  }

  // A command that is killed (the session ends, the Lead stops it) takes its calls with it: a runner is detached, and would go
  // on spending the other plan's quota with nobody to read what it writes.
  const signals = ['SIGTERM', 'SIGINT', 'SIGHUP']
  const endCalls = () => {
    try {
      calls.stop(cwd, id)
    } catch {
      // Nothing left to stop.
    }
    process.exit(143)
  }
  for (const signal of signals) process.once(signal, endCalls)
  try {
    const written = await runLoop(ctx, {
      role: 'implementer',
      reference: { model: charge.model, effort: charge.effort },
      exclude: [],
      prompt: implementerPrompt(briefText, charge),
      owns: charge.owns,
      offer: offered,
      pinned: charge.pair,
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
      base,
      head: typeof implementer.head === 'string' && implementer.head !== '' ? implementer.head : head(worktree),
      pair: pairOf(written.picked),
      reason: written.reason,
      summary: implementer.summary,
      implementer: { status: implementer.status, tests: implementer.tests, concerns: implementer.concerns, question: implementer.question },
      tests,
      review,
      tried: written.tried,
      continued: written.continued === true,
      ...(written.carry ? { carry: written.carry } : {}),
      merge: `aether-wt merge ${id} ${TASK_ID}`,
    }
  } finally {
    for (const signal of signals) process.off(signal, endCalls)
  }
}

// The delegate command: flags are the bin's --name values by name; deps carries the environment,
// the clock, the run id, the wait and the pid check a test replaces. Off, done and no-candidate
// all come back as a result; a bad usage throws, for the bin to print as { error }.
function delegateCommand(cwd, flags, deps = {}) {
  return withEnv(deps.env ?? {}, () => delegateWithEnv(cwd, flags, deps))
}

module.exports = { ALLOWED_HARNESSES, DELEGATE_USAGE, reviewerReference, isOwnsEntry, delegateCommand }
