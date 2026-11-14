'use strict'

// One delegate task of the Lead on the ladder. `begin` takes the Agent call the mod caught and says how this attempt
// runs: the step's model and effort (never what the Lead asked), the sections a rise adds to the brief,
// and, with superdelegation on, the external pair of the one choice function that reaches the points of the step.
// `verdict` takes the Lead's judgment of the last attempt, runs the objective checks before an approve, and asks the
// ladder (lib/ladder.js) what the next launch is. Everything goes to the delegate log (lib/delegate-log.js), which is
// the only state: the step and the next launch are read back from it. Neither function throws.
// No number of the ladder is written here: they come from config/ladder.json.
// Family: delegate.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { isObject, isText, messageOf, sleep: realSleep } = require('./common.js')
const log = require('./delegate-log.js')
const { isLaunch } = log
const ladderLib = require('./ladder.js')
const auth = require('./delegate-authorize.js')
const autonomy = require('./autonomy.js')
const checks = require('./delegate-checks.js')
const lanes = require('./lanes.js')
const { git, repoPaths } = require('./git.js')
const { EXTERNAL_LIMIT_MS } = require('./delegate-limits.js')
const { liftMark } = require('./lane-marks.js')
const { loadPairs } = require('./pairs.js')
const { pairStep } = require('./router-pick.js')
const { readAllMarks } = require('./router-marks.js')
const { peekReadings, EXTERNAL } = require('./router-quota.js')
const { EXCLUDES } = require('./run.js')
const { startRenewal } = require('./router-renewal.js')
const { slowPairIds } = require('./router-slow.js')
const { readDelegateSettings } = require('./session.js')
const { matchesAny } = require('./globs.js')
const { loadSkills, skillsSection, recordUse, parseSkillNames, matchDelegateSkills } = require('./skill-brief.js')
const { recordNotice } = require('./skill-registry.js')

const ID_RE = /^[A-Za-z0-9_-]+$/
const TASK_PREFIX = 'AETHER-TASK:'
const OWNS_PREFIX = 'AETHER-OWNS:'
const TESTS_PREFIX = 'AETHER-TESTS:'
const SKILLS_PREFIX = 'AETHER-SKILLS:'
const TREE_PREFIX = 'AETHER-TREE:'
// The agents whose call an external harness may take: the ones with no system prompt or tool limits of their own.
const PLAIN_AGENTS = ['general-purpose', 'Explore']
// A refused launch still has to run something, and does nothing: the cheapest call, which only says why.
const REFUSED_ARGS = { model: 'haiku', effort: 'low' }
// Spec 036 R7: the brief of an editing external pair never asks for `checkout --detach` (it carries no
// startSection), so when the Lead's own prompt asks for it, the result tells the Lead and leaves the prompt
// and the brief as written. A prompt without the text, or a delegate on Claude, gets no note.
const DETACHED_NOTE = 'note: the prompt you wrote asks the delegate to run "checkout --detach"; the system does not ask for it and the brief is left as you wrote it. A commit on a detached HEAD is followed by the branch (spec 036 R4), but ask for the branch instead.'
const VERDICTS = ['approve', 'fix', 'infeasible']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const TASK_KINDS = ['launch', 'result', 'verdict', 'answer']
const NO_WORKTREE = 'approve needs the worktree of the attempt (--worktree) or the checks of its result'
const NO_ANSWER = 'approve needs the answer of the attempt: the mod records it when the delegate ends; wait for the agent to end, or judge it fix or infeasible'

const isId = (value) => typeof value === 'string' && ID_RE.test(value)

// ---- the brief ----

function parseBrief(prompt) {
  const brief = { task: null, owns: [], tests: null, skills: [], tree: null }
  if (typeof prompt !== 'string') return brief
  let seenTask = false
  let seenOwns = false
  let seenTests = false
  let seenSkills = false
  let seenTree = false
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
    } else if (!seenSkills && line.startsWith(SKILLS_PREFIX)) {
      seenSkills = true
      brief.skills = parseSkillNames(line)
    } else if (!seenTree && line.startsWith(TREE_PREFIX)) {
      seenTree = true
      const tree = line.slice(TREE_PREFIX.length).trim()
      if (tree) brief.tree = tree
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
  // configDir is the Claude config directory the owner's transcripts are read from (by default, CLAUDE_CONFIG_DIR).
  return {
    dataDir,
    now,
    cwd: deps.cwd || process.cwd(),
    configDir: deps.configDir,
    ladder: deps.ladder || ladderLib.loadLadder(),
    home: deps.home || os.homedir(),
    pluginRoot: deps.pluginRoot || path.resolve(__dirname, '..'),
  }
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

// The sections a rise adds: `sections` for a delegate on Claude and for a read-only external pair, and
// `laneSections` for the brief of an editing external pair. `aether-lane delegate` gives that pair the findings itself
// (--findings) and applies the patch in its worktree before it starts (--carry), saying so in the prompt, so its brief
// carries neither (issue 142).
function sectionsOf(verdict, entries) {
  if (!verdict) return { sections: [], laneSections: [], findings: null, carry: null, work: null }
  const input = isObject(verdict.input) ? verdict.input : {}
  const reason = isText(verdict.reason) ? verdict.reason : null
  const carry = Boolean(verdict.next && verdict.next.carry)
  const sections = []
  const laneSections = []
  let findings = null
  if (!input.fromScratch && Array.isArray(input.findings) && input.findings.length > 0) {
    findings = input.findings.map(findingText)
    sections.push(`## Findings to fix\n\n${findings.join('\n')}`)
  }
  if (reason) {
    sections.push(`## Reason\n\n${reason}`)
    laneSections.push(`## Reason\n\n${reason}`)
  }
  // Read once: the text of the brief and the patch the external file carries come from the same read.
  const work = carry ? log.previousWork(entries) : null
  if (carry) {
    if (work) {
      sections.push(`## Your previous work\n\n${work.text}`)
      if (!work.patch) laneSections.push(`## Your previous work\n\n${work.text}`)
    }
  }
  return { sections, laneSections, findings, carry, work }
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

// The request of the call and whether the launch ignored it. A model the owner's authorization covers (`covered`) is honored
// when it names the step's model (spec 021: claude-opus-5-5 is opus).
function requestedOf(event, args, covered = false) {
  const model = isText(event.model) ? event.model : null
  const effort = isText(event.effort) ? event.effort : null
  if (!model && !effort) return { requested: null, ignored: false }
  const modelIgnored = model !== null && model !== args.model && !covered
  return { requested: { model, effort }, ignored: modelIgnored || (effort !== null && effort !== args.effort) }
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
  return `Aether delegate task ${id} is exhausted: every step of the ladder was tried, and there is no other step. Do not do any work. Answer only that the task is exhausted, and that the Lead must defer it or take it to the owner's list.`
}

function logRefusedLaunch(r, ctx, { effort, requested, ignored }) {
  log.appendEntry(r.dataDir, {
    kind: 'launch', time: r.now(), session: ctx.session, task: ctx.id, step: null, attempt: ctx.attempt, launchKind: 'refused',
    effort, edits: ctx.edits, owns: ctx.brief.owns, tests: ctx.brief.tests, description: ctx.description,
    requested, ignored, pin: null, base: null, dirty: null,
  })
}

function refusedLaunchPlan(r, ctx, prompt, note) {
  const args = { ...REFUSED_ARGS, prompt }
  const { requested, ignored } = requestedOf(ctx.event, args)
  logRefusedLaunch(r, ctx, { effort: args.effort, requested, ignored })
  const notes = [...ctx.notes, note]
  return emptyPlan({ id: ctx.id, kind: 'refused', attempt: ctx.attempt, args, notes })
}

// The launch of a task whose ladder is closed: no step opens, and the call only says so.
function refusedPlan(r, ctx, status) {
  const prompt = refusedText(ctx.id, status)
  const what = status === 'approved' ? 'Give new work a new AETHER-TASK id.' : "Defer it or take it to the owner's list."
  const note = `Aether delegate task ${ctx.id} is ${status}: no step opens. ${what}`
  return refusedLaunchPlan(r, ctx, prompt, note)
}

function skillRefusedPlan(r, ctx, error) {
  const prompt = `Aether delegate task ${ctx.id} was not launched: ${error}. Fix the AETHER-SKILLS line and call again.`
  return refusedLaunchPlan(r, ctx, prompt, prompt)
}

function treeRefusedPlan(r, ctx, error) {
  const prompt = `Aether delegate task ${ctx.id} was not launched: ${error}. Fix the AETHER-TREE line and call again.`
  return refusedLaunchPlan(r, ctx, prompt, prompt)
}

function autonomyRefusedPlan(r, ctx, refusal) {
  const deny = `Aether delegate task ${ctx.id} was not launched: ${refusal.message}. Nothing was started.`
  const model = isText(ctx.event.model) ? ctx.event.model : null
  const effort = isText(ctx.event.effort) ? ctx.event.effort : null
  const requested = model || effort ? { model, effort } : null
  logRefusedLaunch(r, ctx, { effort: null, requested, ignored: false })
  return emptyPlan({ id: ctx.id, kind: 'refused', attempt: ctx.attempt, notes: [...ctx.notes], stop: refusal.stop, run: refusal.id, deny })
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

// What the next launch of the task is, read back from its log: { status, step, launchKind, verdict, attempt }. A first
// launch starts on `firstStep` (the rung the owner placed it on, or the first one); later ones on the step it starts on.
function nextLaunch(entries, ladder, { firstStep, configDir }) {
  const launches = entries.filter(isLaunch)
  const attempt = launches.length + 1
  if (launches.length === 0) return { status: 'open', step: firstStep, launchKind: 'first', verdict: null, attempt }
  const state = ladderLib.stateOf(verdictInputs(entries), ladder, auth.startStepOf(entries, ladder, configDir))
  if (state.status !== 'open') return { status: state.status, step: null, launchKind: 'refused', verdict: null, attempt }
  const lastLaunch = lastOf(entries, isLaunch)
  const lastVerdict = lastOf(entries, (e) => e.kind === 'verdict')
  if (lastVerdict.index < lastLaunch.index) return { status: 'open', step: state.step, launchKind: 'unjudged', verdict: lastVerdict.entry, attempt }
  const kind = lastVerdict.entry.next && lastVerdict.entry.next.kind
  return { status: 'open', step: state.step, launchKind: kind === 'rise' ? 'rise' : 'first', verdict: lastVerdict.entry, attempt }
}

// The pair of an unjudged launch: the harness and model of the pair that did the earlier attempt, one effort up when the table
// has it and the ladder's effort for the step allows it, else the same effort; only a pair the choice of this launch
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
  return `Aether delegate task ${id}: step ${step}, attempt ${attempt} (${launchKind}), runs ${where}. Judge it with aether-delegate verdict --task ${id} --verdict approve|fix|infeasible.`
}

// The owner's placement of a first launch (spec 021): the rung the call asks for above the first one, and the authorization
// that covers it. A generated id has no task authorization (its brief names no id). Null when the task has launched already,
// or the call asks for no such rung.
function placementOf(r, entries, session, event, brief) {
  if (entries.some(isLaunch)) return null
  const modelName = isText(event.model) ? event.model : null
  if (!modelName) return null
  const callRung = auth.namedRung(r.ladder, modelName)
  if (!callRung) return null
  const lines = log.readEntries(r.dataDir, { session })
  const cover = auth.coverOf(lines, { session, task: brief.task, rung: callRung, ladder: r.ladder, configDir: r.configDir })
  const placedRung = cover ? auth.rungFor(r.ladder, callRung.model, cover.effort) : callRung
  if (r.ladder.rungs.findIndex((x) => x.step === placedRung.step) === 0) return null
  return { rung: placedRung, cover }
}

// What a launch records of the authorization that places its task: the line's own fields, never the whole line.
const authorizedLine = (line) => {
  const kept = { model: line.model, scope: line.scope, task: line.task, quote: line.quote, quoteTime: line.quoteTime }
  if (line.effort !== undefined && line.effort !== null) kept.effort = line.effort
  return kept
}

// The effort of a launch the owner's authorization covers (issue 141): the first launch runs at the authorized effort
// instead of the ladder's, even when it is lower; an unjudged launch keeps it unless the ladder
// raises it further, never lowering it; a rise to a higher step goes back to the ladder's effort for that step.
// Without an authorized effort the ladder's effort stands, as before.
function coveredEffort(ladderEffort, ownerEffort, launchKind) {
  if (ownerEffort === null || launchKind === 'rise') return ladderEffort
  if (launchKind === 'first') return ownerEffort
  return EFFORTS[Math.max(EFFORTS.indexOf(ladderEffort), EFFORTS.indexOf(ownerEffort))]
}

// The note the Lead reads on a first launch the owner asked to place above the first rung.
function placementNote(id, rung, cover, args, brief) {
  if (cover) {
    return `Aether delegate task ${id}: the owner's word places it on ${rung.model} (${cover.scope === 'task' ? 'this task' : 'the session'}), so it runs on claude ${args.model} ${args.effort} by that word.`
  }
  const grant = brief.task === null ? '--scope session' : `--task ${brief.task} or --scope session`
  return `Aether delegate task ${id}: no owner authorization covers ${rung.model}, so it started on ${args.model} and the request is ignored. To place it on ${rung.model}, record the owner's words that name it: aether-delegate authorize --model ${rung.model} --quote <the owner's words> (${grant}).`
}

// ---- the tree of a read-only copy and what it cannot hold (spec 033, D4 and D5) ----

const realOf = (file) => {
  try {
    return fs.realpathSync(file)
  } catch {
    return null
  }
}

// The worktrees of the repository the checkout `cwd` belongs to, as git lists them.
function worktreesOf(cwd) {
  const listed = git(['worktree', 'list', '--porcelain'], cwd, { allowFail: true })
  if (listed.status !== 0) return []
  return listed.stdout.split('\n').filter((line) => line.startsWith('worktree ')).map((line) => line.slice('worktree '.length))
}

// The real path of the worktree the brief names with AETHER-TREE:, or the error that refuses the launch.
function treeNamed(cwd, named) {
  const worktrees = worktreesOf(cwd)
  const wanted = realOf(path.resolve(cwd, named))
  if (wanted !== null && worktrees.map(realOf).includes(wanted)) return { ok: true, tree: wanted }
  return { ok: false, error: `AETHER-TREE: ${named} is not a worktree of this repository (the worktrees are ${worktrees.join(', ')})` }
}

// Issue 243: the brief the external reader receives names no AETHER-TREE: line. Its working directory already is a copy
// of that tree, and the raw line named a path different from its own directory, which confused a real reader. The line
// is replaced by one sentence saying so; the launch line keeps `tree` for the system's own records. Only the first line
// counts, as in parseBrief, and the sentence names no path, so it cannot be parsed back into a tree.
const READER_TREE_SENTENCE = 'Your working directory already is a copy of the tree this task named, with its uncommitted work: read it here and nowhere else.'
function readerPromptOf(prompt, tree) {
  if (tree === null) return prompt
  const lines = prompt.split('\n')
  const at = lines.findIndex((line) => line.trimStart().startsWith(TREE_PREFIX))
  if (at === -1) return prompt
  return [...lines.slice(0, at), READER_TREE_SENTENCE, ...lines.slice(at + 1)].join('\n')
}

// Issue 241: the worktree of this repository holding `abs`, or null. Only a path inside another worktree of the same
// repository gets the AETHER-TREE hint in the launch notice; the Lead's own root is skipped, so a path inside its own
// checkout (an ignored file, a .env file, one of Aether's folders) gets none.
function worktreeHolding(cwd, abs) {
  const real = realOf(abs)
  if (real === null) return null
  const root = rootOf(cwd)
  for (const listed of worktreesOf(cwd)) {
    const wt = realOf(listed) ?? listed
    if (wt === root) continue
    if (real === wt || real.startsWith(`${wt}${path.sep}`)) return wt
  }
  return null
}

// The real path of the top level of the checkout `dir`, or null when it is not in a repository.
function rootOf(dir) {
  const top = git(['rev-parse', '--show-toplevel'], dir, { allowFail: true })
  return top.status === 0 && top.stdout !== '' ? realOf(top.stdout) : null
}

// The Lead's brief without its AETHER- lines, which name the task and its tests and not the work, split into words.
function briefWords(prompt) {
  return prompt.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('AETHER-')).join('\n').split(/\s+/)
}

// A word with the quotes, brackets and final punctuation around it taken off, and a line suffix (`:12`, `:12:4`,
// `:12-20`, `#12`).
const OPEN_MARK = /^[`"'([{<]+/
const CLOSE_MARK = /[`"')\]}>.,;:!?]+$/
const LINE_SUFFIX = /(?::\d+(?::\d+)?|:\d+-\d+|#\d+)$/
function pathWord(word) {
  let current = word
  for (;;) {
    const next = current.replace(OPEN_MARK, '').replace(CLOSE_MARK, '').replace(LINE_SUFFIX, '')
    if (next === current) return current
    current = next
  }
}

// A word that may name a path: absolute, `~/`, `./`, `../`, or with a `/` inside it.
const isCandidate = (word) => word.startsWith('/') || word.startsWith('~/') || word.startsWith('./') || word.startsWith('../') || word.includes('/')
const SKIPPED_COMMANDS = ['/usr/bin/env', '/bin/sh', '/bin/bash']
const SKIPPED_ROOTS = ['/dev', '/proc', '/sys']
const OWN_FOLDERS = EXCLUDES.map((pattern) => pattern.replace(/^\/|\/$/g, ''))
const isEnvName = (name) => name === '.env' || name.startsWith('.env.')

// Whether the path is a command word of the brief that is not a file the copy would lack (a device, or a system command).
function isSkipped(word, abs) {
  if (SKIPPED_COMMANDS.includes(word)) return true
  if (SKIPPED_ROOTS.some((root) => abs === root || abs.startsWith(`${root}/`))) return true
  try {
    const stat = fs.statSync(abs)
    return stat.isCharacterDevice() || stat.isBlockDevice()
  } catch {
    return false
  }
}

// Whether the copy of the tree at `root` (a real path) cannot hold the existing path `abs`: it lies outside the tree, in
// another repository or worktree under it, under one of Aether's folders at the root, a `.env` file, or ignored by git.
// Git's own check-ignore reports a tracked file as not ignored, which is right: the copy holds it.
function notHeld(abs, root) {
  const real = realOf(abs)
  if (real === null) return false
  const rel = path.relative(root, real)
  if (rel === '') return false
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return true
  const dir = fs.statSync(real).isDirectory() ? real : path.dirname(real)
  if (rootOf(dir) !== root) return true
  const parts = rel.split(path.sep)
  if (OWN_FOLDERS.includes(parts[0])) return true
  if (isEnvName(parts[parts.length - 1])) return true
  return git(['check-ignore', '-q', '--', parts.join('/')], root, { allowFail: true }).status === 0
}

// The first path of the Lead's brief that the copy of the tree at `root` cannot hold, or null. Only a path that exists
// counts; a `~/` path is taken from `home`, a relative one from the tree.
function outsideOf(prompt, { root, home }) {
  if (!root) return null
  for (const raw of briefWords(prompt)) {
    const word = pathWord(raw)
    if (!isCandidate(word)) continue
    const abs = word.startsWith('~/') ? path.join(home, word.slice(2)) : path.resolve(root, word)
    if (!fs.existsSync(abs) || isSkipped(word, abs)) continue
    if (notHeld(abs, root)) return abs
  }
  return null
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
    const placed = placementOf(r, entries, session, event, brief)
    const cover = placed && placed.cover
    const next = nextLaunch(entries, r.ladder, { firstStep: cover ? placed.rung.step : r.ladder.rungs[0].step, configDir: r.configDir })
    const edits = brief.owns.length > 0
    const description = typeof event.description === 'string' ? event.description : ''
    const ctx = { id, session, event, brief, edits, description, notes, attempt: next.attempt }
    const refusal = autonomy.launchRefusal(r.cwd, { session, dataDir: r.dataDir, now: r.now() })
    if (refusal) return autonomyRefusedPlan(r, ctx, refusal)
    if (next.status !== 'open') return refusedPlan(r, ctx, next.status)

    let loadedSkills = null
    if (brief.skills.length > 0) {
      const res = loadSkills(brief.skills, { cwd: r.cwd, home: r.home, pluginRoot: r.pluginRoot })
      if (!res.ok) return skillRefusedPlan(r, ctx, res.error)
      loadedSkills = res.skills
    }

    // The tree the copy is of, and whether the copy can hold what the brief names (spec 033, D4 and D5). Both are decided
    // here, before a pair is picked or a quota is read. A task that edits ignores AETHER-TREE: it is checked by AETHER-OWNS.
    let tree = null
    let outside = null
    if (!edits) {
      if (brief.tree !== null) {
        const named = treeNamed(r.cwd, brief.tree)
        if (!named.ok) return treeRefusedPlan(r, ctx, named.error)
        tree = named.tree
      }
      outside = outsideOf(prompt, { root: tree ?? rootOf(r.cwd), home: r.home })
    }

    const { step, launchKind, attempt } = next
    // The owner's placement of this task: the authorization of its first launch (spec 021), kept by every later attempt.
    const authorized = cover && launchKind === 'first' ? authorizedLine(cover) : auth.authorizedOf(entries)
    const storedEffort = isObject(authorized) && typeof authorized.effort === 'string' ? authorized.effort.trim().toLowerCase() : null
    const ownerEffort = storedEffort !== null && EFFORTS.includes(storedEffort) ? storedEffort : null
    const effort = coveredEffort(ladderLib.effortFor(r.ladder, step), ownerEffort, launchKind)
    const rung = rungOf(r.ladder, step)
    const args = { model: rung.model, effort }
    const covered = authorized !== null && auth.namedRung(r.ladder, event.model)?.model === args.model
    const { requested, ignored } = requestedOf(event, args, covered)
    if (launchKind === 'first' && placed) notes.push(placementNote(id, placed.rung, cover, args, brief))
    const { sections, laneSections, findings, carry, work } = sectionsOf(next.verdict, entries)
    const fullPrompt = withSections(prompt, sections)
    const base = headOf(r.cwd)
    // The prompt of the call is what a delegate on Claude reads, the rescue of an external pair too; the brief file of an
    // external pair is `externalPrompt`, whose branch the lane command makes from the base.
    let claudePrompt = edits && base !== null ? withSections(prompt, [...sections, startSection(base)]) : fullPrompt
    let externalPrompt = edits ? withSections(prompt, laneSections) : readerPromptOf(fullPrompt, tree)
    if (loadedSkills && loadedSkills.length > 0) {
      const skillsText = skillsSection(loadedSkills).trimEnd()
      claudePrompt = `${claudePrompt.trimEnd()}\n\n${skillsText}`
      externalPrompt = `${externalPrompt.trimEnd()}\n\n${skillsText}`
    }
    if (claudePrompt !== prompt) args.prompt = claudePrompt
    if (edits) args.isolation = 'worktree'

    const correcting = launchKind === 'unjudged'
    const lastResult = lastOf(entries, (e) => e.kind === 'result').entry
    const previous = correcting && lastResult && isObject(lastResult.pair) && isText(lastResult.pair.id) ? lastResult.pair : null
    let pin = null

    let pick = null
    let external = null
    // A task the owner placed on a model runs on Claude in every attempt: the pair choice is not asked for it (spec 021).
    if (r.settings.lanes && namedAgent(event) === null && r.pickPair && authorized === null && outside === null) {
      const chosen = await r.pickPair({ model: rung.model, effort: rung.effort })
      if (chosen && typeof chosen.error === 'string') notes.push(`Aether delegate task ${id}: the pair choice failed (${chosen.error}); this attempt runs on Claude.`)
      pick = chosen && isObject(chosen.pick) ? chosen.pick : null
      let alternates = alternatesOf(chosen && chosen.quota, r.pairs)
      if (pick && previous) {
        // An unjudged launch keeps the model of the earlier attempt and raises its effort a step; the pair the choice made
        // stays the next candidate. A task that edits is pinned to it, and the lane command drops the pin if it cannot serve.
        const kept = sameModelPair(r.pairs, previous, effort, chosen.quota)
        if (kept) {
          pin = kept.id
          if (kept.id !== pick.id) {
            const rungFn = (row) => ({ harness: row.harness, rung: { model: row.model, effort: row.effort, group: row.group } })
            alternates = [rungFn(pick), ...alternates.filter((a) => !(a.harness === kept.harness && a.rung.model === kept.model && a.rung.effort === kept.effort))]
            pick = kept
          }
        }
      }
      if (pick) {
        const briefFile = path.join(r.dataDir, 'delegates', 'briefs', `${log.fileKey(session, id)}-${attempt}.md`)
        fs.mkdirSync(path.dirname(briefFile), { recursive: true })
        fs.writeFileSync(briefFile, externalPrompt)
        writeJson(path.join(r.dataDir, 'delegates', 'external', `${log.fileKey(session, id)}.json`), {
          id, session, cwd: r.cwd, tree, attempt, step, effort, launchKind, edits, owns: brief.owns, tests: brief.tests,
          brief: briefFile, findings, carry: carry && work ? work.patch : null, pin, base, harness: pick.harness,
          rung: { model: pick.model, effort: pick.effort, group: pick.group },
          task: { description, prompt: externalPrompt },
          alternates,
          timeoutMs: EXTERNAL_LIMIT_MS,
        })
        // The pair names the attempt for the mod's rescue line (its answer says which pair did not deliver).
        external = { id, edits, timeoutMs: EXTERNAL_LIMIT_MS, pin, pair: { harness: pick.harness, model: pick.model, effort: pick.effort } }
      }
    }

    // A read-only attempt, on an external pair or on Claude, works in the Lead's checkout (its rescue does on Claude): what
    // was already changed there is not its doing.
    const dirty = !edits && base !== null ? dirtyOf(r.cwd, base) : null
    const time = r.now()
    let repo = null
    try { repo = repoPaths(r.cwd).mainRoot } catch { /* not a repository: the record keeps repo null */ }
    const launch = {
      kind: 'launch', time, session, task: id, step, attempt, launchKind, effort, edits, owns: brief.owns, tests: brief.tests,
      description, requested, ignored, pin, base, dirty,
    }
    if (launchKind === 'first' && authorized !== null) launch.authorized = authorized
    if (loadedSkills && loadedSkills.length > 0) launch.skills = loadedSkills.map((s) => s.name)
    if (tree !== null) launch.tree = tree
    if (outside !== null) launch.outside = outside
    log.appendEntry(r.dataDir, launch)
    if (loadedSkills && loadedSkills.length > 0) {
      recordUse(r.dataDir, { session, kind: 'delegate', task: id, skills: launch.skills, time, repo })
    }
    if (brief.skills.length === 0) {
      const matched = matchDelegateSkills(r.cwd, { prompt, description, owns: brief.owns })
      if (matched.length > 0) {
        notes.push(`Aether delegate task ${id}: project skill(s) ${matched.join(', ')} match this brief; add AETHER-SKILLS: ${matched.slice(0, 3).join(', ')} if it helps.`)
        for (const name of matched) recordNotice(r.dataDir, { time, session, repo, kind: 'delegate-skill', name })
      }
    }
    if (launchKind === 'first') {
      const of = relaunchOf(r.dataDir, session, id, brief)
      if (of !== null) log.appendEntry(r.dataDir, { kind: 'relaunch', time, session, task: id, of })
    }
    if (outside !== null) {
      let notice = `Aether delegate task ${id}: the brief names ${outside}, which the copy of the tree does not hold (it lies outside the tree, in another repository, is ignored by git, is a .env file or is one of Aether's folders), so this attempt runs on claude ${args.model} ${args.effort} and no other harness.`
      // Issue 241: the Lead is told about AETHER-TREE: only here, never in its startup text. A path in another worktree
      // of the same repository could run on another harness with the line naming that worktree; anything else stays on
      // Claude by design and gets no hint.
      const holder = worktreeHolding(r.cwd, outside)
      if (holder !== null) notice += ` Adding AETHER-TREE: ${holder} to the brief would let it run on another harness.`
      notes.push(notice)
    }
    notes.push(stepNote(id, step, attempt, launchKind, args, pick))
    // Spec 036 R7: the mod relays plan.notes, so the detach warning lives there, and the brief stays as the Lead wrote it.
    if (edits && pick !== null && prompt.includes('checkout --detach')) notes.push(DETACHED_NOTE)
    return emptyPlan({ id, step, kind: launchKind, attempt, args, notes, external, answerOf: external === null ? { task: id, attempt } : null })
  } catch (err) {
    return emptyPlan({ id: isId(id) ? id : null, error: messageOf(err) })
  }
}

// ---- the verdict ----

function editsFailure(check, tests) {
  const reasons = []
  if (check.empty) reasons.push('empty task: no changes')
  if (check.outside.length > 0) reasons.push(`files outside owns: ${check.outside.join(', ')}`)
  if (check.tests === 'fail') {
    const failures = Array.isArray(tests?.failures) && tests.failures.length > 0
      ? tests.failures
      : (Array.isArray(check.failures) && check.failures.length > 0 ? check.failures : [])
    if (tests?.timedOut) {
      reasons.push(`tests timed out: ${tests.command}`)
    } else if (failures.length > 0) {
      reasons.push(`tests failed (not ok: ${checks.formatFailures(failures)})`)
    } else if (tests?.command && tests?.exitCode !== undefined && tests?.exitCode !== null) {
      reasons.push(`tests failed: ${tests.command} exited ${tests.exitCode}`)
    } else {
      reasons.push('tests failed')
    }
  }
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

// Whether a result's checks failed only because of the tests.
function failedOnlyOnTests(c) {
  if (!isObject(c) || c.ok === true) return false
  if (c.empty === true) return false
  if (Array.isArray(c.outside) && c.outside.length > 0) return false
  if (c.tests === 'fail') return true
  if (Array.isArray(c.reasons) && c.reasons.length > 0) {
    return c.reasons.every((r) => typeof r === 'string' && r.startsWith('tests failed'))
  }
  return false
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
    if (failedOnlyOnTests(own) && isText(worktree)) {
      const owns = Array.isArray(launch.owns) ? launch.owns : []
      const tests = isText(launch.tests) ? checks.runTests(worktree, launch.tests) : null
      const check = checks.checkEdits({ files: checks.changedFiles(worktree, checks.worktreeBase(worktree, launch.base)), owns, tests })
      return check.ok ? null : `checks failed: ${editsFailure(check, tests).join('; ')}`
    }
    let reasons = own && Array.isArray(own.reasons) && own.reasons.length > 0 ? own.reasons : ['the result has no passing checks']
    if (Array.isArray(own?.failures) && own.failures.length > 0) {
      reasons = reasons.map((reason) => (reason === 'tests failed' ? `tests failed (not ok: ${checks.formatFailures(own.failures)})` : reason))
    }
    const hint = charged ? ` (if another writer of this checkout changed those files, judge again with --ignore '<glob>' for each, for example --ignore '${own.outside[0]}')` : ''
    return `checks failed: ${reasons.join('; ')}${hint}`
  }
  const owns = Array.isArray(launch.owns) ? launch.owns : []
  if (editsOf(launch)) {
    if (!isText(worktree)) return NO_WORKTREE
    const tests = isText(launch.tests) ? checks.runTests(worktree, launch.tests) : null
    const check = checks.checkEdits({ files: checks.changedFiles(worktree, checks.worktreeBase(worktree, launch.base)), owns, tests })
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

// The session a verdict belongs to: the one it names, or the one of the task's last launch.
function sessionOf(dataDir, task, session) {
  if (typeof session === 'string' && session) return session
  const launch = lastOf(log.readEntries(dataDir, { task }), (e) => e.kind === 'launch' && e.task === task).entry
  return launch ? launch.session ?? null : null
}

async function verdict(input, deps = {}) {
  const { task, verdict: kind, reason, findings, fromScratch, worktree, session: named, ignore } = isObject(input) ? input : {}
  const refuse = (error, extra = {}) => ({ ok: false, task: isId(task) ? task : null, verdict: null, step: null, next: null, error, ...extra })
  try {
    if (!isId(task)) return refuse('unknown task')
    const r = resolve(deps)
    const session = sessionOf(r.dataDir, task, named)
    const entries = taskEntries(r.dataDir, task, session)
    const launch = lastOf(entries, isLaunch).entry
    if (!launch) return refuse('unknown task')
    const state = ladderLib.stateOf(verdictInputs(entries), r.ladder, auth.startStepOf(entries, r.ladder, r.configDir))
    const at = { step: state.step }
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
    let repo = null
    try { repo = repoPaths(r.cwd).mainRoot } catch { /* not a repository: the record keeps repo null */ }
    log.appendEntry(r.dataDir, {
      kind: 'verdict', time: r.now(), session, task, attempt: launch.attempt, step: state.step, verdict: label,
      input: verdictInput, reason: verdictInput.reason, cause: next.cause, next, ignore: ignored.globs, repo,
    })
    return { ok: true, task, verdict: label, step: judged.state.step, next }
  } catch (err) {
    return refuse(messageOf(err))
  }
}

module.exports = { parseBrief, begin, verdict }
