'use strict'

// One delegate task of the Lead on the ladder. `begin` takes the Agent call the mod caught and says how this attempt
// runs: the step's model and effort (never what the Lead asked), the sections a correction or a rise adds to the brief,
// and, with superdelegation on, the external pair of the one choice function that reaches the points of the step.
// `verdict` takes the Lead's judgment of the last attempt, runs the objective checks before an approve, and asks the
// ladder (lib/ladder.js) what the next launch is. Everything goes to the delegate log (lib/delegate-log.js), which is
// the only state: the step, the corrections spent and the next launch are read back from it. Neither function throws.
// No number of the ladder is written here: they come from config/ladder.json.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const log = require('./delegate-log.js')
const ladderLib = require('./ladder.js')
const checks = require('./delegate-checks.js')
const lanes = require('./lanes.js')
const { git, repoPaths } = require('./git.js')
const { EXTERNAL_LIMIT_MS } = require('./delegate-limits.js')
const { liftMark } = require('./lane-marks.js')
const { loadPairs } = require('./pairs.js')
const { pairStep } = require('./router-pick.js')
const { readAllMarks } = require('./router-marks.js')
const { peekReadings, EXTERNAL } = require('./router-quota.js')
const { startRenewal } = require('./router-renewal.js')
const { slowPairIds } = require('./router-slow.js')
const { readDelegateSettings } = require('./session.js')
const { matchesAny } = require('./globs.js')

const ID_RE = /^[A-Za-z0-9_-]+$/
const TASK_PREFIX = 'AETHER-TASK:'
const OWNS_PREFIX = 'AETHER-OWNS:'
const TESTS_PREFIX = 'AETHER-TESTS:'
// The agents whose call an external harness may take: the ones with no system prompt or tool limits of their own.
const PLAIN_AGENTS = ['general-purpose', 'Explore']
// A refused launch still has to run something, and does nothing: the cheapest call, which only says why.
const REFUSED_ARGS = { model: 'haiku', effort: 'low' }
const VERDICTS = ['approve', 'fix', 'infeasible']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const TASK_KINDS = ['launch', 'result', 'verdict', 'answer']
const NO_WORKTREE = 'approve needs the worktree of the attempt (--worktree) or the checks of its result'
const NO_ANSWER = 'approve needs the answer of the attempt: the mod records it when the delegate ends; wait for the agent to end, or judge it fix or infeasible'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isId = (value) => typeof value === 'string' && ID_RE.test(value)
const messageOf = (err) => (err && typeof err.message === 'string' && err.message ? err.message : String(err))

// ---- the brief ----

function parseBrief(prompt) {
  const brief = { task: null, owns: [], tests: null }
  if (typeof prompt !== 'string') return brief
  let seenTask = false
  let seenOwns = false
  let seenTests = false
  for (const raw of prompt.split(/\r?\n/)) {
    const line = raw.trimStart()
    if (!seenTask && line.startsWith(TASK_PREFIX)) {
      seenTask = true
      const id = line.slice(TASK_PREFIX.length).trim()
      if (isId(id)) brief.task = id
    } else if (!seenOwns && line.startsWith(OWNS_PREFIX)) {
      seenOwns = true
      brief.owns = line.slice(OWNS_PREFIX.length).split(',').map((item) => item.trim()).filter((item) => item !== '')
    } else if (!seenTests && line.startsWith(TESTS_PREFIX)) {
      seenTests = true
      const command = line.slice(TESTS_PREFIX.length).trim()
      if (command) brief.tests = command
    }
  }
  return brief
}

// ---- the dependencies ----

function once(make) {
  let made = false
  let value
  return () => {
    if (!made) {
      value = make()
      made = true
    }
    return value
  }
}

function realSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The pair step of lib/router-pick.js with the dependencies it reads, built only when a launch asks for a pair.
function defaultPickPair({ dataDir, now, settings, pairs, lanesConfig }) {
  const d = {
    dataDir,
    now,
    lanesConfig,
    pairs,
    sleep: realSleep,
    readings: (harnesses = EXTERNAL) => peekReadings({ dataDir, config: lanesConfig(), harnesses, now: now() }),
    lift: (mark) => liftMark(dataDir, mark),
    slow: () => slowPairIds(dataDir, pairs(), now()),
    marks: () => readAllMarks(dataDir, now(), lanes.groupKnown(lanesConfig())),
    renew: (harness) => startRenewal({ dataDir, harness, now: now() }),
    installed: (harness) => {
      const command = lanesConfig()?.harnesses?.[harness]?.command
      return typeof command === 'string' && lanes.commandInstalled(command)
    },
  }
  return async (reference) => {
    if (!lanesConfig()) return { pick: null, quota: [] }
    return pairStep(d, settings, { reference })
  }
}

// The dependencies both steps read, with their defaults.
function resolve(deps) {
  const dataDir = deps.dataDir || require('./run.js').dataDir()
  const now = deps.now || Date.now
  return { dataDir, now, cwd: deps.cwd || process.cwd(), ladder: deps.ladder || ladderLib.loadLadder() }
}

// What begin reads besides: the session's settings, the id of a task with none, and the pair step.
function resolveBegin(deps, session) {
  const r = resolve(deps)
  const settings = deps.settings !== undefined ? deps.settings : readDelegateSettings(r.dataDir, session)
  const lanesConfig = once(() => (deps.lanesConfig !== undefined ? deps.lanesConfig : lanes.loadConfig()))
  const pairs = once(() => deps.pairs || loadPairs().pairs)
  return {
    ...r,
    settings,
    pairs,
    newId: deps.newId || (() => `d-${r.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`),
    pickPair: deps.pickPair || (settings ? defaultPickPair({ dataDir: r.dataDir, now: r.now, settings, pairs, lanesConfig }) : null),
  }
}

// ---- the log of one task ----

function taskEntries(dataDir, task, session) {
  return log.readEntries(dataDir, { task, session }).filter((entry) => entry.task === task && TASK_KINDS.includes(entry.kind))
}

const lastOf = (entries, test) => {
  for (let i = entries.length - 1; i >= 0; i--) if (test(entries[i])) return { entry: entries[i], index: i }
  return { entry: null, index: -1 }
}

const isLaunch = (entry) => entry.kind === 'launch' && entry.launchKind !== 'refused'

function verdictInputs(entries) {
  return entries.filter((entry) => entry.kind === 'verdict' && isObject(entry.input)).map((entry) => entry.input)
}

function rungOf(ladder, step) {
  return ladder.rungs.find((rung) => rung.step === step)
}

function findingText(finding) {
  return finding.line === null || finding.line === undefined ? `${finding.file}: ${finding.what}` : `${finding.file}:${finding.line}: ${finding.what}`
}

// ---- the repository ----

function headOf(cwd) {
  try {
    const r = git(['rev-parse', 'HEAD'], cwd, { allowFail: true })
    return r.status === 0 && r.stdout ? r.stdout : null
  } catch {
    return null
  }
}

function contentHash(root, file) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(path.join(root, file))).digest('hex')
  } catch {
    return 'absent'
  }
}

// The files already changed in the checkout at a read-only launch, each with the hash of its content then.
function dirtyOf(cwd, base) {
  const root = repoPaths(cwd).worktree
  const dirty = {}
  for (const file of checks.changedFiles(cwd, base)) dirty[file] = contentHash(root, file)
  return dirty
}

// The files a read-only delegate touched since its launch: the ones changed now that were not dirty then, and the dirty
// ones whose content is no longer what it was.
function touchedSince(cwd, launch) {
  if (!launch.base) return []
  const root = repoPaths(cwd).worktree
  const dirty = isObject(launch.dirty) ? launch.dirty : {}
  const touched = new Set(checks.changedFiles(cwd, launch.base).filter((file) => !Object.hasOwn(dirty, file)))
  for (const [file, hash] of Object.entries(dirty)) if (contentHash(root, file) !== hash) touched.add(file)
  return [...touched].sort()
}

// ---- the brief of an attempt that follows a verdict ----

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

// The earlier work a correction or a rise receives, from the latest work recorded: the patch of a result (a task that
// edits), or an answer (a read-only one: the file of an external result, or the text the mod recorded for an attempt
// on Claude).
function previousWork(entries) {
  const { entry } = lastOf(entries, (e) => (e.kind === 'result' && (isText(e.patch) || isText(e.answer))) || (e.kind === 'answer' && isText(e.text)))
  if (!entry) return null
  if (entry.kind === 'answer') return entry.text
  if (isText(entry.patch)) {
    return `The patch of your previous attempt is ${entry.patch}. It is not applied in your worktree: before anything else, run \`git apply ${entry.patch}\` there, and go on from that work. Only when it does not apply, rebuild what it describes.`
  }
  const text = readText(entry.answer)
  return isText(text) ? text : `Your previous answer is in ${entry.answer}`
}

function sectionsOf(verdict, entries) {
  if (!verdict) return { sections: [], findings: null, carry: null }
  const input = isObject(verdict.input) ? verdict.input : {}
  const reason = isText(verdict.reason) ? verdict.reason : null
  const carry = Boolean(verdict.next && verdict.next.carry)
  const sections = []
  let findings = null
  if (!input.fromScratch && Array.isArray(input.findings) && input.findings.length > 0) {
    findings = input.findings.map(findingText)
    sections.push(`## Findings to fix\n\n${findings.join('\n')}`)
  }
  if (reason) sections.push(`## Reason\n\n${reason}`)
  if (carry) {
    const work = previousWork(entries)
    if (work) sections.push(`## Your previous work\n\n${work}`)
  }
  return { sections, findings, carry }
}

function withSections(prompt, sections) {
  return sections.length === 0 ? prompt : `${prompt}\n\n${sections.join('\n\n')}`
}

// Claude Code makes the isolation worktree of an editing delegate on Claude from its own base (the default branch's tip
// unless the owner's setting says otherwise), not from the Lead's HEAD (issue 94): the call tells the delegate where its
// work starts, which is the commit the launch records and the checks diff against.
function startSection(base) {
  return `## Where your worktree starts\n\nAether recorded commit ${base} as the start of this task, and your work is judged against it. Your isolated worktree may have been made from another commit: before anything else, run \`git rev-parse HEAD\`, and when it is not ${base}, run \`git checkout --detach ${base}\` and work from there.`
}

// ---- plans ----

function emptyPlan(fields) {
  return { id: null, skip: false, step: null, kind: null, attempt: null, args: null, notes: [], external: null, answerOf: null, ...fields }
}

function requestedOf(event, args) {
  const model = isText(event.model) ? event.model : null
  const effort = isText(event.effort) ? event.effort : null
  if (!model && !effort) return { requested: null, ignored: false }
  return { requested: { model, effort }, ignored: (model !== null && model !== args.model) || (effort !== null && effort !== args.effort) }
}

function namedAgent(event) {
  const type = event.subagent_type
  return typeof type === 'string' && type !== '' && !PLAIN_AGENTS.includes(type) ? type : null
}

// The candidates of the pair step that come after the pick, in rank order, each as the rung a delegate runs on.
function alternatesOf(quota, pairs) {
  const next = (Array.isArray(quota) ? quota : []).filter((entry) => isObject(entry) && entry.outcome === 'next')
  if (next.length === 0) return []
  let table
  try {
    table = pairs()
  } catch {
    return []
  }
  const alternates = []
  for (const entry of next.sort((a, b) => a.rank - b.rank)) {
    const pair = table.find((row) => row.id === entry.id)
    if (pair) alternates.push({ harness: pair.harness, rung: { model: pair.model, effort: pair.effort, group: pair.group } })
  }
  return alternates
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value) + '\n')
}

function refusedText(id, status) {
  if (status === 'approved') {
    return `Aether delegate task ${id} was approved already: no step of the ladder opens for it again. Do not do any work. Answer only that the task is approved, and that new work needs a new AETHER-TASK id.`
  }
  return `Aether delegate task ${id} is exhausted: every step of the ladder spent its corrections, and there is no other step. Do not do any work. Answer only that the task is exhausted, and that the Lead must defer it or take it to the owner's list.`
}

// The launch of a task whose ladder is closed: no step opens, and the call only says so.
function refusedPlan(r, ctx, status) {
  const prompt = refusedText(ctx.id, status)
  const args = { ...REFUSED_ARGS, prompt }
  const { requested, ignored } = requestedOf(ctx.event, args)
  log.appendEntry(r.dataDir, {
    kind: 'launch', time: r.now(), session: ctx.session, task: ctx.id, step: null, attempt: ctx.attempt, launchKind: 'refused',
    effort: args.effort, edits: ctx.edits, owns: ctx.brief.owns, tests: ctx.brief.tests, description: ctx.description,
    requested, ignored, pin: null, base: null, dirty: null,
  })
  const what = status === 'approved' ? 'Give new work a new AETHER-TASK id.' : "Defer it or take it to the owner's list."
  const notes = [...ctx.notes, `Aether delegate task ${ctx.id} is ${status}: no step opens. ${what}`]
  return emptyPlan({ id: ctx.id, kind: 'refused', attempt: ctx.attempt, args, notes })
}

// A new task with the owned paths and the tests of a task of the same session that did not end approved.
function relaunchOf(dataDir, session, id, brief) {
  if (brief.owns.length === 0) return null
  const key = JSON.stringify([[...new Set(brief.owns)].sort(), brief.tests])
  const approved = new Set()
  const matching = []
  for (const entry of log.readEntries(dataDir, { session })) {
    if (entry.task === id || !isId(entry.task)) continue
    if (entry.kind === 'verdict' && entry.verdict === 'approved') approved.add(entry.task)
    if (entry.kind !== 'launch' || !Array.isArray(entry.owns)) continue
    if (JSON.stringify([[...new Set(entry.owns)].sort(), entry.tests ?? null]) === key) matching.push(entry.task)
  }
  // The latest matching task that did not end approved.
  return matching.reverse().find((task) => !approved.has(task)) ?? null
}

// What the next launch of the task is, read back from its log: { status, step, launchKind, verdict, attempt }.
function nextLaunch(entries, ladder) {
  const launches = entries.filter(isLaunch)
  const attempt = launches.length + 1
  if (launches.length === 0) return { status: 'open', step: ladder.rungs[0].step, launchKind: 'first', verdict: null, attempt }
  const state = ladderLib.stateOf(verdictInputs(entries), ladder)
  if (state.status !== 'open') return { status: state.status, step: null, launchKind: 'refused', verdict: null, attempt }
  const lastLaunch = lastOf(entries, isLaunch)
  const lastVerdict = lastOf(entries, (e) => e.kind === 'verdict')
  if (lastVerdict.index < lastLaunch.index) return { status: 'open', step: state.step, launchKind: 'unjudged', verdict: lastVerdict.entry, attempt }
  const kind = lastVerdict.entry.next && lastVerdict.entry.next.kind
  return { status: 'open', step: state.step, launchKind: kind === 'rise' ? 'rise' : 'fix', verdict: lastVerdict.entry, attempt }
}

// The pair of a correction: the harness and model of the pair that did the earlier attempt, one effort up when the table
// has it and the ladder's effort for a correction allows it, else the same effort; only a pair the choice of this launch
// found able to serve (a candidate that was picked or ranked next). Null when none is, and the choice stands (the owner's
// word, issue 87: improve the effort, not so aggressively, and do not change the model).
function sameModelPair(pairs, previous, limit, quota) {
  let table
  try {
    table = pairs()
  } catch {
    return null
  }
  const usable = new Set((Array.isArray(quota) ? quota : []).filter((entry) => isObject(entry) && (entry.outcome === 'picked' || entry.outcome === 'next')).map((entry) => entry.id))
  const rank = (effort) => EFFORTS.indexOf(effort)
  const same = table.filter((row) => row.harness === previous.harness && row.model === previous.model && usable.has(row.id))
  const up = same.filter((row) => rank(row.effort) > rank(previous.effort) && rank(row.effort) <= rank(limit)).sort((a, b) => rank(a.effort) - rank(b.effort))[0]
  return up ?? same.find((row) => row.id === previous.id) ?? null
}

function stepNote(id, step, attempt, launchKind, args, pick) {
  const where = pick ? `on ${pick.harness} ${pick.model} ${pick.effort} (pair ${pick.id}), with claude ${args.model} ${args.effort} as its rescue` : `on claude ${args.model} ${args.effort}`
  return `Aether delegate task ${id}: step ${step}, attempt ${attempt} (${launchKind}), runs ${where}. Judge it with aether-delegate verdict --task ${id}.`
}

async function begin(input, deps = {}) {
  let id = null
  try {
    const event = isObject(input && input.event) ? input.event : {}
    const session = typeof (input && input.session) === 'string' ? input.session : null
    if (typeof event.subagent_type === 'string' && event.subagent_type.startsWith('aether:')) return emptyPlan({ skip: true, why: 'aether-agent' })
    const r = resolveBegin(deps, session)
    if (!r.settings) return emptyPlan({ skip: true, why: 'no-settings' })
    const prompt = typeof event.prompt === 'string' ? event.prompt : ''
    const brief = parseBrief(prompt)
    const notes = []
    id = brief.task
    if (id === null) {
      id = r.newId()
      notes.push(`Aether delegate task ${id}: pass it to aether-delegate verdict`)
    }
    const entries = taskEntries(r.dataDir, id, session)
    const next = nextLaunch(entries, r.ladder)
    const edits = brief.owns.length > 0
    const description = typeof event.description === 'string' ? event.description : ''
    const ctx = { id, session, event, brief, edits, description, notes, attempt: next.attempt }
    if (next.status !== 'open') return refusedPlan(r, ctx, next.status)

    const { step, launchKind, attempt } = next
    const effort = ladderLib.effortFor(r.ladder, step, launchKind)
    const args = { model: rungOf(r.ladder, step).model, effort }
    const { requested, ignored } = requestedOf(event, args)
    const { sections, findings, carry } = sectionsOf(next.verdict, entries)
    const fullPrompt = withSections(prompt, sections)
    const base = headOf(r.cwd)
    // The prompt of the call is what a delegate on Claude reads, the rescue of an external pair too; the brief file of an
    // external pair is `fullPrompt`, whose branch the lane command makes from the base.
    const claudePrompt = edits && base !== null ? withSections(prompt, [...sections, startSection(base)]) : fullPrompt
    if (claudePrompt !== prompt) args.prompt = claudePrompt
    if (edits) args.isolation = 'worktree'

    const correcting = launchKind === 'fix' || launchKind === 'unjudged'
    const lastResult = lastOf(entries, (e) => e.kind === 'result').entry
    const previous = correcting && lastResult && isObject(lastResult.pair) && isText(lastResult.pair.id) ? lastResult.pair : null
    let pin = null

    let pick = null
    let external = null
    if (r.settings.lanes && namedAgent(event) === null && r.pickPair) {
      const chosen = await r.pickPair({ model: step, effort })
      if (chosen && typeof chosen.error === 'string') notes.push(`Aether delegate task ${id}: the pair choice failed (${chosen.error}); this attempt runs on Claude.`)
      pick = chosen && isObject(chosen.pick) ? chosen.pick : null
      let alternates = alternatesOf(chosen && chosen.quota, r.pairs)
      if (pick && previous) {
        // A correction keeps the model of the earlier attempt and raises its effort a step; the pair the choice made
        // stays the next candidate. A task that edits is pinned to it, and the lane command drops the pin if it cannot serve.
        const kept = sameModelPair(r.pairs, previous, effort, chosen.quota)
        if (kept) {
          pin = kept.id
          if (kept.id !== pick.id) {
            const rung = (row) => ({ harness: row.harness, rung: { model: row.model, effort: row.effort, group: row.group } })
            alternates = [rung(pick), ...alternates.filter((a) => !(a.harness === kept.harness && a.rung.model === kept.model && a.rung.effort === kept.effort))]
            pick = kept
          }
        }
      }
      if (pick) {
        const briefFile = path.join(r.dataDir, 'delegates', 'briefs', `${id}-${attempt}.md`)
        fs.mkdirSync(path.dirname(briefFile), { recursive: true })
        fs.writeFileSync(briefFile, fullPrompt)
        writeJson(path.join(r.dataDir, 'delegates', 'external', `${id}.json`), {
          id, session, cwd: r.cwd, attempt, step, effort, launchKind, edits, owns: brief.owns, tests: brief.tests,
          brief: briefFile, findings, carry, pin, base, harness: pick.harness,
          rung: { model: pick.model, effort: pick.effort, group: pick.group },
          task: { description, prompt: fullPrompt },
          alternates,
          timeoutMs: EXTERNAL_LIMIT_MS,
        })
        external = { id, edits, timeoutMs: EXTERNAL_LIMIT_MS, pin }
      }
    }

    // A read-only attempt, on an external pair or on Claude, works in the Lead's checkout (its rescue does on Claude): what
    // was already changed there is not its doing.
    const onClaudeReadOnly = external === null && !edits
    const dirty = !edits && base !== null ? dirtyOf(r.cwd, base) : null
    const time = r.now()
    log.appendEntry(r.dataDir, {
      kind: 'launch', time, session, task: id, step, attempt, launchKind, effort, edits, owns: brief.owns, tests: brief.tests,
      description, requested, ignored, pin, base, dirty,
    })
    if (launchKind === 'first') {
      const of = relaunchOf(r.dataDir, session, id, brief)
      if (of !== null) log.appendEntry(r.dataDir, { kind: 'relaunch', time, session, task: id, of })
    }
    notes.push(stepNote(id, step, attempt, launchKind, args, pick))
    return emptyPlan({ id, step, kind: launchKind, attempt, args, notes, external, answerOf: onClaudeReadOnly ? { task: id, attempt } : null })
  } catch (err) {
    return emptyPlan({ id: isId(id) ? id : null, error: messageOf(err) })
  }
}

// ---- the verdict ----

function editsFailure(check, tests) {
  const reasons = []
  if (check.empty) reasons.push('empty task: no changes')
  if (check.outside.length > 0) reasons.push(`files outside owns: ${check.outside.join(', ')}`)
  if (check.tests === 'fail') reasons.push(tests.timedOut ? `tests timed out: ${tests.command}` : `tests failed: ${tests.command} exited ${tests.exitCode}`)
  return reasons
}

function readOnlyFailure(check) {
  const reasons = []
  if (check.empty) reasons.push('empty answer')
  if (check.outside.length > 0) {
    reasons.push(`files changed by a read-only task: ${check.outside.join(', ')} (if another writer of this checkout changed them, judge again with --ignore '<glob>' for each, for example --ignore '${check.outside[0]}')`)
  }
  return reasons
}

// Whether a task edits: it has AETHER-OWNS, so its check is by what it owns.
const editsOf = (launch) => launch.edits === true || (Array.isArray(launch.owns) && launch.owns.length > 0)

// The --ignore globs of a verdict: files that another writer of the checkout changed, which a read-only task is not charged with.
function ignoreOf(ignore) {
  const list = ignore === undefined ? [] : Array.isArray(ignore) ? ignore : [ignore]
  for (const glob of list) if (!isText(glob) || glob.trim().startsWith('--')) return { error: '--ignore needs a glob: --ignore <glob>' }
  return { globs: list.map((glob) => glob.trim()) }
}

// The objective checks of an approve, by how the last attempt ran. Returns null when they pass, or the error.
function approveError(r, entries, launch, worktree, ignore = []) {
  const attempt = launch.attempt
  const result = lastOf(entries, (e) => e.kind === 'result' && e.attempt === attempt && e.ok === true).entry
  if (result) {
    const own = isObject(result.checks) ? result.checks : null
    if (own && own.ok === true) return null
    // A read-only result charged with files another writer of the checkout changed (issue 100) passes when --ignore covers all of them.
    const charged = own !== null && own.kind === 'read-only' && own.empty !== true && Array.isArray(own.outside) && own.outside.length > 0
    if (charged && ignore.length > 0 && own.outside.every((file) => matchesAny(file, ignore))) return null
    const reasons = own && Array.isArray(own.reasons) && own.reasons.length > 0 ? own.reasons : ['the result has no passing checks']
    const hint = charged ? ` (if another writer of this checkout changed those files, judge again with --ignore '<glob>' for each, for example --ignore '${own.outside[0]}')` : ''
    return `checks failed: ${reasons.join('; ')}${hint}`
  }
  const owns = Array.isArray(launch.owns) ? launch.owns : []
  if (editsOf(launch)) {
    if (!isText(worktree)) return NO_WORKTREE
    const tests = isText(launch.tests) ? checks.runTests(worktree, launch.tests) : null
    const check = checks.checkEdits({ files: checks.changedFiles(worktree, launch.base), owns, tests })
    return check.ok ? null : `checks failed: ${editsFailure(check, tests).join('; ')}`
  }
  const answer = lastOf(entries, (e) => e.kind === 'answer' && e.attempt === attempt).entry
  if (!answer) return NO_ANSWER
  const files = touchedSince(r.cwd, launch).filter((file) => !matchesAny(file, ignore))
  const check = checks.checkReadOnly({ answer: typeof answer.text === 'string' ? answer.text : '', files })
  return check.ok ? null : `checks failed: ${readOnlyFailure(check).join('; ')}`
}

function parsedFindings(findings) {
  const list = Array.isArray(findings) ? findings : []
  const parsed = []
  for (const text of list) {
    const finding = ladderLib.parseFinding(text)
    if (!finding) return { error: `finding not accepted: "${text}": write it as file[:line]: what is missing` }
    parsed.push(finding)
  }
  if (parsed.length === 0) return { error: 'a fix needs at least one finding: file[:line]: what is missing' }
  return { parsed }
}

function correctionsOf(ladder, state) {
  return { used: state.correctionsUsed, cap: rungOf(ladder, state.step).corrections }
}

// The session a verdict belongs to: the one it names, or the one of the task's last launch.
function sessionOf(dataDir, task, session) {
  if (typeof session === 'string' && session) return session
  const launch = lastOf(log.readEntries(dataDir, { task }), (e) => e.kind === 'launch' && e.task === task).entry
  return launch ? launch.session ?? null : null
}

async function verdict(input, deps = {}) {
  const { task, verdict: kind, reason, findings, fromScratch, worktree, session: named, ignore } = isObject(input) ? input : {}
  const refuse = (error, extra = {}) => ({ ok: false, task: isId(task) ? task : null, verdict: null, step: null, next: null, corrections: null, error, ...extra })
  try {
    if (!isId(task)) return refuse('unknown task')
    const r = resolve(deps)
    const session = sessionOf(r.dataDir, task, named)
    const entries = taskEntries(r.dataDir, task, session)
    const launch = lastOf(entries, isLaunch).entry
    if (!launch) return refuse('unknown task')
    const state = ladderLib.stateOf(verdictInputs(entries), r.ladder)
    const at = { step: state.step, corrections: correctionsOf(r.ladder, state) }
    if (!VERDICTS.includes(kind)) return refuse('the verdict must be approve, fix or infeasible', at)
    const ignored = ignoreOf(ignore)
    if (ignored.error) return refuse(ignored.error, at)
    if (ignored.globs.length > 0 && editsOf(launch)) return refuse('--ignore is for a read-only task: an editing task is checked by its AETHER-OWNS, not by --ignore', at)

    const verdictInput = { kind, findings: [], reason: isText(reason) ? reason.trim() : null, fromScratch: Boolean(fromScratch) }
    if (kind === 'fix') {
      const { parsed, error } = parsedFindings(findings)
      if (error) return refuse(error, at)
      verdictInput.findings = parsed
    }
    const judged = ladderLib.judge(state, verdictInput, r.ladder)
    if (!judged.accepted) return refuse(judged.error, at)
    if (kind === 'approve') {
      const error = approveError(r, entries, launch, worktree, ignored.globs)
      if (error) return refuse(error, at)
    }

    const next = judged.next
    const label = next.kind === 'exhausted' ? 'exhausted' : kind === 'approve' ? 'approved' : kind
    log.appendEntry(r.dataDir, {
      kind: 'verdict', time: r.now(), session, task, attempt: launch.attempt, step: state.step, verdict: label,
      input: verdictInput, reason: verdictInput.reason, cause: next.cause, next, ignore: ignored.globs,
    })
    return { ok: true, task, verdict: label, step: judged.state.step, next, corrections: correctionsOf(r.ladder, judged.state) }
  } catch (err) {
    return refuse(messageOf(err))
  }
}

module.exports = { parseBrief, begin, verdict }
