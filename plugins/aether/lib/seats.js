'use strict'

// Design seats: the Judge, the Writer and the Examiner, which a lane harness may take in place of
// Aether's own agent, one round at a time. The seats option chooses, per seat, the external models in
// order of preference (config/lanes.json, designSeats); the native agent always comes last. A round runs
// in a disposable worktree of the current commit and is judged from outside: what changed in git, and
// an answer checked against the seat's schema. Anything else gives the seat back to the native agent,
// which redoes the round from the files. A round keeps no conversation, so any harness can take any seat.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { git, repoPaths } = require('./git.js')
const run = require('./run.js')
const lanes = require('./lanes.js')
const schemas = require('./lane-schemas.js')
const laneMarks = require('./lane-marks.js')
const laneQuota = require('./lane-quota.js')
const { refusalIn } = require('./quota-refusal.js')
const { createAdapter } = require('./harness/index.js')
const { roleBody, claudeMdSections, WORKDIR_RULE } = require('./lane-calls.js')
const { priceEntry, loadPrices } = require('./prices.js')

const PLUGIN_BIN = path.join(__dirname, '..', 'bin')
const SKILLS_DIR = path.join(__dirname, '..', 'skills')
const KILL_GRACE_SECONDS = 60
const MAX_FINDINGS = 10
const EXAM_DIR = '.aether-exam'

// Each seat's native agent, with the model and effort its agent file sets, and that model's id.
const NATIVE = {
  judge: { agent: 'aether:judge', model: 'opus', effort: 'high', id: 'claude-opus-5-5' },
  writer: { agent: 'aether:writer', model: 'sonnet', effort: 'high', id: 'claude-sonnet-5-5' },
  examiner: { agent: 'aether:examiner', model: 'opus', effort: 'high', id: 'claude-opus-5-5' },
}

// The effort an external round asks of its harness. The Writer's differs from the native one: the native Writer
// starts at high and the Lead raises it when a round needs more, but an external Writer has no one to raise it.
const EXTERNAL_EFFORT = { judge: 'high', writer: 'xhigh', examiner: 'high' }

// The Claude Code model aliases an --author may give, with the ids lane models use for the same model.
const ALIASES = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }

const SCHEMAS = { judge: schemas.JUDGE_SCHEMA, writer: schemas.WRITER_SCHEMA, examiner: schemas.EXAMINER_SCHEMA }

// The schema of a seat's answer: the Writer's depends on the document it writes.
const schemaFor = (seat, doc) => (seat === 'writer' && doc === 'spec' ? schemas.SPEC_WRITER_SCHEMA : SCHEMAS[seat])

const USAGE =
  'usage: aether-lane seat <judge|writer|examiner> --session <id> [--author <model>] [--feature specs/NNN-<topic>] [--doc <spec|plan>] [--id <seat id>] [--cwd <dir>] (the message on stdin)'

const NO_USAGE = { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }

// ---- Output ----

const reply = (exitCode, value) => ({ exitCode, value })

// ---- The choice ----

// The model id an --author names: a lane model as <harness>/<model> or <model>, or a Claude Code alias.
function authorModel(author) {
  if (typeof author !== 'string' || author.trim() === '') return null
  const name = author.trim()
  const bare = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name
  return ALIASES[bare] ?? bare
}

// Who takes seat under the seats choice: the first external model on its list whose harness is enabled
// and installed, that is not the author's model, and whose group has no dry mark and has quota above the
// reserve; else the native agent. Pure apart from the calls it is given: installed(harness), quota(harness, group)
// and marked(harness, group, reading), which says whether a live mark still holds the group once the reading of the
// group (null when it could not be read) has had the chance to lift it; with none given, no mark holds.
// Returns { off } for an examiner the choice does not run, { external } or { native }, each with the
// models it passed over and why.
function chooseSeat(config, { choice, seat, author = null, enabled = [], installed, quota, marked = () => false }) {
  const list = lanes.seatList(config, choice, seat)
  if (list === false) return { off: true, tried: [] }
  const authorId = authorModel(author)
  const tried = []
  for (const item of list) {
    const [harnessName, model] = item.split('/')
    const settings = config.harnesses[harnessName]
    const entry = settings.models[model]
    if (!enabled.includes(harnessName)) {
      tried.push({ model: item, reason: 'harness-off' })
      continue
    }
    if (model === authorId) {
      tried.push({ model: item, reason: 'author' })
      continue
    }
    if (!installed(harnessName, settings)) {
      tried.push({ model: item, reason: 'not-installed' })
      continue
    }
    // The group is read first: a healthy reading lifts a mark that came from a reading, and the group is passed over
    // only if a mark still holds, whether or not the reading could be read.
    let reading = null
    let unreadable = false
    try {
      reading = quota(harnessName, settings, entry.group)
    } catch {
      unreadable = true
    }
    if (marked(harnessName, entry.group, reading)) {
      tried.push({ model: item, reason: 'quota' })
      continue
    }
    if (unreadable) {
      tried.push({ model: item, reason: 'quota-unreadable' })
      continue
    }
    if (!lanes.usable(reading, config.reserve)) {
      tried.push({ model: item, reason: 'quota' })
      continue
    }
    const effort = EXTERNAL_EFFORT[seat]
    return {
      external: {
        harness: harnessName,
        model,
        group: entry.group,
        effort,
        level: entry.levels[effort],
        timeoutSeconds: lanes.seatTimeout(settings, seat),
        quotaBefore: reading,
      },
      tried,
    }
  }
  const native = { ...NATIVE[seat] }
  if (authorId !== null && native.id === authorId) native.sameModelAsAuthor = true
  return { native, tried }
}

// ---- The worktree ----

function nulList(args, cwd) {
  const out = git(args, cwd, { raw: true }).stdout
  return out.split('\0').filter((entry) => entry !== '')
}

// Every path the round changed: committed since start, changed in the worktree, or new and not ignored.
function changedPaths(top, start) {
  const paths = new Set([
    ...nulList(['diff', '--name-only', '--no-renames', '-z', start, 'HEAD'], top),
    ...nulList(['diff', '--name-only', '--no-renames', '-z', 'HEAD'], top),
    ...nulList(['ls-files', '--others', '--exclude-standard', '-z'], top),
  ])
  return [...paths].sort()
}

// The ref that keeps a round's worktree when it broke its seat's rule, so that the Lead and the owner can see it.
function backupRef(id) {
  return `refs/aether/seat/${id}/round-1`
}

function gitWithIndex(args, cwd, indexFile) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: indexFile } })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`)
  return r.stdout.trim()
}

// Keeps the worktree as it is (tracked changes and untracked files, not ignored ones) as a commit at ref,
// whose parent is the worktree's HEAD. Returns the ref.
function saveRound(top, ref, indexDir, message) {
  const indexFile = path.join(indexDir, 'backup.index')
  try {
    gitWithIndex(['read-tree', 'HEAD'], top, indexFile)
    gitWithIndex(['add', '-A'], top, indexFile)
    const tree = gitWithIndex(['write-tree'], top, indexFile)
    const commit = git(['commit-tree', tree, '-p', git(['rev-parse', 'HEAD'], top).stdout, '-m', message], top).stdout
    git(['update-ref', ref, commit], top)
    return ref
  } finally {
    fs.rmSync(indexFile, { force: true })
  }
}

function removeWorktree(mainRoot, worktree) {
  git(['worktree', 'remove', '--force', worktree], mainRoot, { allowFail: true })
  fs.rmSync(worktree, { recursive: true, force: true })
  git(['worktree', 'prune'], mainRoot, { allowFail: true })
}

// Whether a changed path is one the seat may change.
function allowedFor(seat, feature, doc) {
  if (seat === 'writer') {
    const own = doc === 'spec' ? [`${feature}/spec.md`] : [`${feature}/plan.md`, `${feature}/tasks.md`]
    return (file) => own.includes(file)
  }
  if (seat === 'examiner') return (file) => file.startsWith(`${EXAM_DIR}/`)
  return () => false
}

// ---- The prompt ----

// A skill's text, without its frontmatter.
function skillBody(name) {
  const text = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8')
  const end = text.indexOf('\n---\n', 4)
  return (end === -1 ? text : text.slice(end + '\n---\n'.length)).trim()
}

// The note that tells the role it runs in an external harness, and what changes for it there.
function seatNote(seat, harness, feature, doc) {
  const head = `## You run in an external harness\n\n`
  if (seat === 'judge') {
    return `${head}You are the Aether Judge, run by the ${harness} CLI rather than Claude Code. The current directory is a disposable copy of the repository at the commit under review. Your review is read-only: read files and run read-only commands such as \`git log\` or \`grep\`, but never change, create or delete a file; any change undoes your review. ${WORKDIR_RULE} Every other rule of your role holds. Your answer is the structured output your harness asks for, in place of the indented block your role describes: verdict, findings (each with severity, type, title, evidence and fix; at most ${MAX_FINDINGS}) and openQuestions. Each finding's type says what is wrong: \`missing\` (the document lacks something it needs), \`extra\` (it has something nobody asked for) or \`wrong\` (it says something that is not so).`
  }
  if (seat === 'writer' && doc === 'spec') {
    return [
      `${head}You are the Aether Writer, run by the ${harness} CLI rather than Claude Code, and this round writes the spec only. The current directory is a disposable copy of the repository. Your role above holds, with these changes:`,
      '- You have no Skill tool. Where your role says to load the skill aether:specify, follow its text, which is below. Do not write a plan or tasks, and do not run aether-plan.',
      `- Change only \`${feature}/spec.md\`, and commit it. A change to any other file undoes your whole round.`,
      `- ${WORKDIR_RULE}`,
      '- Your reply goes in the structured output your harness asks for: spec is its path, commit is your commit, clarify lists each [NEEDS CLARIFICATION: ...] mark left in the spec, and assumptions, proposals, questions and disagreements are lists.',
      '',
      '## The skill aether:specify',
      '',
      skillBody('specify'),
    ].join('\n')
  }
  if (seat === 'writer') {
    return [
      `${head}You are the Aether Writer, run by the ${harness} CLI rather than Claude Code. The current directory is a disposable copy of the repository. Your role above holds, with these changes:`,
      '- You have no Skill tool. Where your role says to load the skills aether:plan and aether:tasks, follow their text, which is below.',
      `- Run aether-plan as \`${path.join(PLUGIN_BIN, 'aether-plan')}\`.`,
      `- Change only \`${feature}/plan.md\` and \`${feature}/tasks.md\`, and commit them. A change to any other file undoes your whole round.`,
      `- ${WORKDIR_RULE}`,
      '- Your reply goes in the structured output your harness asks for: plan and tasks are their paths, commit is your commit, check is what `aether-plan check` printed, and assumptions and questions are lists.',
      '',
      '## The skill aether:plan',
      '',
      skillBody('plan'),
      '',
      '## The skill aether:tasks',
      '',
      skillBody('tasks'),
    ].join('\n')
  }
  return `${head}You are the Aether Examiner, run by the ${harness} CLI rather than Claude Code. The current directory is a disposable copy of the repository. Write the exam under \`${EXAM_DIR}/\` in the current directory, and nothing else: a change outside it undoes your round. Never read \`tasks.md\`. ${WORKDIR_RULE} Every other rule of your role holds. Your answer is the structured output your harness asks for: tests (each with id, criterion, command and files) and notes.`
}

function answerSection(seat, doc) {
  return ['## Your answer', 'End your answer with one JSON object that matches this schema, and nothing after it:', `\`\`\`json\n${JSON.stringify(schemaFor(seat, doc), null, 2)}\n\`\`\``].join('\n\n')
}

function seatPrompt({ seat, harness, adapter, message, workdir, feature, doc = 'plan' }) {
  const parts = [roleBody(seat), seatNote(seat, harness, feature, doc), ...claudeMdSections(workdir, os.homedir()), message]
  if (adapter.schemaInPrompt === true) parts.push(answerSection(seat, doc))
  return parts.join('\n\n')
}

// ---- Running the harness ----

function killGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // The group is already empty.
  }
}

// Runs argv in cwd to its end, in a group of its own, killing the group when it outlives the timeout.
// Resolves to its exit code.
function runHarness(argv, { cwd, marker, stdoutFile, stderrFile, timeoutSeconds, onSpawn }) {
  const out = fs.openSync(stdoutFile, 'w')
  const err = fs.openSync(stderrFile, 'w')
  let child
  try {
    child = spawn(argv[0], argv.slice(1), { cwd, detached: true, stdio: ['ignore', out, err], env: lanes.laneEnv(process.env, marker) })
  } finally {
    fs.closeSync(out)
    fs.closeSync(err)
  }
  return new Promise((resolve, reject) => {
    let timer = null
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(new Error(`${argv[0]} did not start: ${error.message}`))
    })
    child.once('spawn', () => {
      onSpawn(child.pid)
      timer = setTimeout(() => killGroup(child.pid), (timeoutSeconds + KILL_GRACE_SECONDS) * 1000)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve(code ?? 128 + (os.constants.signals[signal] || 0))
    })
  })
}

function readTextOrEmpty(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

// ---- What a round leaves ----

// Whether the reset time `later` is not before the reset time `earlier`; false when either is not a time.
function notBefore(later, earlier) {
  const a = Date.parse(later)
  const b = Date.parse(earlier)
  return Number.isFinite(a) && Number.isFinite(b) && a >= b
}

// The drop in a window's remaining fraction, in percent, or ? when it cannot be measured. Two readings are of one
// window when they share its reset time. agy gives a window with nothing used no reset time of its own, only the time
// of the read plus the window's length, so a window that was full before the round is the same one after it when its
// reset time did not move back.
function windowUsed(before, after, window) {
  const a = before?.windows?.[window]
  const b = after?.windows?.[window]
  if (!a || !b || typeof a.remaining !== 'number' || typeof b.remaining !== 'number') return '?'
  const sameWindow = a.resetsAt === b.resetsAt || (a.remaining === 1 && notBefore(b.resetsAt, a.resetsAt))
  if (!sameWindow) return '?'
  return (Math.max(0, a.remaining - b.remaining) * 100).toFixed(1)
}

// The line the Lead records: tokens, list price and quota.
function laneLine({ harness, modelArg, id, usage, quotaBefore, quotaAfter, groupLabel }) {
  const tokens = lanes.laneTokens(usage)
  const count = tokens.input + tokens.output + tokens.cacheRead
  const usd = priceEntry({ model: modelArg, ...tokens, agent: 'lane' }, loadPrices())
  const dollars = usd === null ? '?' : usd.toFixed(2)
  const quota =
    quotaBefore?.unknown === true
      ? `${groupLabel} does not report its quota`
      : `${groupLabel} used ${windowUsed(quotaBefore, quotaAfter, '5h')} % of the 5 h window and ${windowUsed(quotaBefore, quotaAfter, 'weekly')} % of the weekly one`
  return `- Lane: ${harness} ${modelArg}, seat ${id}; ${count} tokens, $${dollars} at list price; ${quota}`
}

// The Judge's answer in the format of its own agent file.
function judgeText(result) {
  const findings = result.findings.length === 0 ? ['none'] : result.findings.map((f, i) => `${i + 1}. [${f.severity}] [${f.type}] ${f.title} — ${f.evidence} — ${f.fix}`)
  const questions = result.openQuestions.length === 0 ? ['- none'] : result.openQuestions.map((q) => `- ${q}`)
  return ['## Verdict', result.verdict, '## Findings', ...findings, '## Open questions', ...questions].join('\n')
}

function writerText(result, done) {
  const list = (items) => (items.length === 0 ? ['- none'] : items.map((item) => `- ${item}`))
  return [
    '## Plan and tasks',
    `- Plan: ${done.plan}`,
    `- Tasks: ${done.tasks}`,
    `- Commit: ${done.commit}`,
    `- aether-plan check: ${done.check}`,
    '## Assumptions',
    ...list(result.assumptions),
    '## Open questions',
    ...list(result.questions),
  ].join('\n')
}

function specText(result, done) {
  const list = (items) => (items.length === 0 ? ['- none'] : items.map((item) => `- ${item}`))
  return [
    '## Spec',
    `- Spec: ${done.spec}`,
    `- Commit: ${done.commit}`,
    '## Clarify',
    ...list(result.clarify),
    '## Assumptions',
    ...list(result.assumptions),
    '## Open questions',
    ...list(result.questions),
  ].join('\n')
}

function examinerText(result, done) {
  const byCriterion = {}
  for (const t of result.tests) byCriterion[t.criterion] = (byCriterion[t.criterion] || 0) + 1
  const counts = Object.entries(byCriterion).map(([criterion, n]) => `${criterion} ${n}`).join(', ')
  return ['## Exam', `- Stored: ${done.stored}`, `- Tests: ${result.tests.length} (${counts})`, '## Notes', result.notes || 'none'].join('\n')
}

// ---- After a clean round ----

function relative(file) {
  return file.split(path.sep).join('/')
}

// Puts back files in the Lead's checkout as they are at HEAD, or removes those HEAD does not have.
function restore(cwd, files) {
  for (const file of files) {
    const tracked = git(['cat-file', '-e', `HEAD:${file}`], cwd, { allowFail: true }).status === 0
    if (tracked) git(['checkout', 'HEAD', '--', file], cwd)
    else fs.rmSync(path.join(cwd, file), { force: true })
  }
}

// Copies the Writer's plan.md and tasks.md into the Lead's checkout, checks them with aether-plan, and
// commits them there. Returns { ok, ... } or { ok: false, detail }; on a failure the checkout is put back.
function finishWriter(cwd, worktree, feature, seatLabel) {
  const files = [`${feature}/plan.md`, `${feature}/tasks.md`]
  if (!fs.existsSync(path.join(worktree, files[1]))) return { ok: false, detail: `the round left no ${files[1]}` }
  if (git(['status', '--porcelain', '--', ...files], cwd).stdout !== '') {
    return { ok: false, detail: `${files.join(' or ')} changed in the Lead's checkout during the round` }
  }
  const copied = files.filter((file) => fs.existsSync(path.join(worktree, file)))
  for (const file of copied) {
    fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    fs.copyFileSync(path.join(worktree, file), path.join(cwd, file))
  }
  const check = spawnSync(process.execPath, [path.join(PLUGIN_BIN, 'aether-plan'), 'check', files[1]], { cwd, encoding: 'utf8' })
  const printed = (check.stdout || '').trim().split('\n').pop() || (check.stderr || '').trim()
  if (check.status !== 0) {
    restore(cwd, copied)
    return { ok: false, detail: `aether-plan check failed: ${printed.slice(0, 500)}` }
  }
  if (git(['status', '--porcelain', '--', ...copied], cwd).stdout === '') {
    return { ok: true, plan: files[0], tasks: files[1], commit: git(['rev-parse', 'HEAD'], cwd).stdout, check: printed }
  }
  git(['add', '--', ...copied], cwd)
  const committed = git(['commit', '-q', '-m', `docs(specs): plan and tasks of ${path.basename(feature)}, by ${seatLabel}`, '--', ...copied], cwd, { allowFail: true })
  if (committed.status !== 0) {
    git(['reset', '-q', '--', ...copied], cwd, { allowFail: true })
    restore(cwd, copied)
    return { ok: false, detail: `the commit failed: ${committed.stderr || committed.stdout}` }
  }
  return { ok: true, plan: files[0], tasks: files[1], commit: git(['rev-parse', 'HEAD'], cwd).stdout, check: printed }
}

// Copies the Writer's spec.md into the Lead's checkout and commits it there, without aether-plan: a spec has
// no check. Returns { ok, ... } or { ok: false, detail }; on a failure the checkout is put back.
function finishSpec(cwd, worktree, feature, seatLabel) {
  const file = `${feature}/spec.md`
  if (!fs.existsSync(path.join(worktree, file))) return { ok: false, detail: `the round left no ${file}` }
  if (git(['status', '--porcelain', '--', file], cwd).stdout !== '') {
    return { ok: false, detail: `${file} changed in the Lead's checkout during the round` }
  }
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
  fs.copyFileSync(path.join(worktree, file), path.join(cwd, file))
  if (git(['status', '--porcelain', '--', file], cwd).stdout !== '') {
    git(['add', '--', file], cwd)
    const committed = git(['commit', '-q', '-m', `docs(specs): spec of ${path.basename(feature)}, by ${seatLabel}`, '--', file], cwd, { allowFail: true })
    if (committed.status !== 0) {
      git(['reset', '-q', '--', file], cwd, { allowFail: true })
      restore(cwd, [file])
      return { ok: false, detail: `the commit failed: ${committed.stderr || committed.stdout}` }
    }
  }
  return { ok: true, spec: file, commit: git(['rev-parse', 'HEAD'], cwd).stdout }
}

// Writes the Examiner's answer beside its test files and stores the exam where the swarm does not see it.
function finishExaminer(mainRoot, worktree, feature, result, dataDir) {
  const dir = path.join(worktree, EXAM_DIR)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'exam.json'), `${JSON.stringify(result, null, 2)}\n`)
  try {
    const stored = require('./exam.js').store(mainRoot, feature, dir, { dataDir })
    return { ok: true, stored: stored.dir }
  } catch (err) {
    return { ok: false, detail: `the exam cannot be stored: ${err.message}` }
  }
}

// ---- A round ----

// The first problem of an answer beyond its schema, or null.
function answerProblem(seat, result) {
  if (seat === 'judge' && result.findings.length > MAX_FINDINGS) return `more than ${MAX_FINDINGS} findings`
  if (seat === 'examiner' && result.tests.length === 0) return 'an exam without tests'
  return null
}

function logEntry(dataDir, session, entry) {
  try {
    lanes.appendLog(dataDir, session, entry)
  } catch {
    // A log that cannot be written must not keep the answer from the Lead.
  }
}

// One round of seat on its external model. Returns the reply: exit 0 with the answer, or exit 4 with
// what failed. The worktree is removed whatever happens.
async function runRound({ cwd, mainRoot, seat, session, feature, doc, id: givenId, message, external, config, adapter, choiceName, dataDir }) {
  const id = givenId ?? `${seat}-${run.newRunId()}`
  const dir = path.join(run.aetherDir(mainRoot), 'seats', id)
  const worktree = path.join(dir, 'wt')
  const marker = `seat/${id}`
  const settings = config.harnesses[external.harness]
  const schema = schemaFor(seat, doc)
  const modelArg = adapter.modelArg({ model: external.model, level: external.level })
  const label = `${external.harness}/${external.model}`
  fs.mkdirSync(dir, { recursive: true })
  const start = git(['rev-parse', 'HEAD'], cwd).stdout
  git(['worktree', 'add', '-q', '--detach', worktree, start], cwd)

  const startedAt = Date.now()
  let child = null
  const onSignal = () => {
    if (child !== null) killGroup(child)
    removeWorktree(mainRoot, worktree)
    process.exit(143)
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, onSignal)

  let outcome
  let parsed = { usage: NO_USAGE, conversation: null }
  let quotaAfter = null
  let quotaRead = false
  let refusal = null
  try {
    const schemaFile = path.join(dir, 'schema.json')
    fs.writeFileSync(schemaFile, `${JSON.stringify(schema, null, 2)}\n`)
    const prompt = seatPrompt({ seat, harness: external.harness, adapter, message, workdir: worktree, feature, doc })
    fs.writeFileSync(path.join(dir, 'prompt.md'), prompt)
    const argv = adapter.argv({ model: external.model, level: external.level, schemaFile, timeoutSeconds: external.timeoutSeconds, prompt })
    const exitCode = await runHarness(argv, {
      cwd: worktree,
      marker,
      stdoutFile: path.join(dir, 'stdout'),
      stderrFile: path.join(dir, 'stderr'),
      timeoutSeconds: external.timeoutSeconds,
      onSpawn: (pid) => {
        child = pid
      },
    })
    killGroup(child)
    lanes.killMarked(marker)
    try {
      quotaAfter = adapter.quota().groups[external.group] ?? null
      quotaRead = true
    } catch {
      // An unreadable quota is an infrastructure failure, not a verdict on the quota.
    }
    parsed = adapter.parse({ stdout: readTextOrEmpty(path.join(dir, 'stdout')), stderr: readTextOrEmpty(path.join(dir, 'stderr')), exitCode }, { required: schema.required })
    const allowed = allowedFor(seat, feature, doc)
    const outside = changedPaths(worktree, start).filter((file) => !allowed(file))
    if (outside.length > 0) {
      const backup = saveRound(worktree, backupRef(id), dir, `aether: seat ${id}, kept because it changed files outside its seat`)
      outcome = { status: 'violation', files: outside, backup, detail: 'changes outside the seat' }
    } else if (!parsed.clean) {
      // agy's refusal for its individual quota is explicit, and /usage does not report that limit: it needs no reading.
      refusal = refusalIn(parsed.reason, parsed.error, readTextOrEmpty(path.join(dir, 'stderr')))
      const quotaGone = refusal !== null || (quotaRead && (!lanes.usable(quotaAfter, config.reserve) || (quotaAfter?.unknown === true && parsed.reason?.startsWith('quota: '))))
      outcome = { status: quotaGone ? 'quota' : 'failed', detail: parsed.reason }
    } else {
      const problem = schemas.validate(schema, parsed.structured) ?? answerProblem(seat, parsed.structured)
      if (problem !== null) {
        outcome = { status: 'failed', detail: `invalid answer: ${problem}` }
      } else if (seat === 'writer' && doc === 'spec') {
        const done = finishSpec(cwd, worktree, feature, label)
        outcome = done.ok ? { status: 'ok', text: specText(parsed.structured, done), result: { ...parsed.structured, commit: done.commit } } : { status: 'failed', detail: done.detail }
      } else if (seat === 'writer') {
        const done = finishWriter(cwd, worktree, feature, label)
        outcome = done.ok ? { status: 'ok', text: writerText(parsed.structured, done), result: { ...parsed.structured, commit: done.commit } } : { status: 'failed', detail: done.detail }
      } else if (seat === 'examiner') {
        const done = finishExaminer(mainRoot, worktree, feature, parsed.structured, dataDir)
        outcome = done.ok ? { status: 'ok', text: examinerText(parsed.structured, done), result: parsed.structured, stored: done.stored } : { status: 'failed', detail: done.detail }
      } else {
        outcome = { status: 'ok', text: judgeText(parsed.structured), result: parsed.structured }
      }
    }
  } catch (err) {
    outcome = { status: 'failed', detail: `seat: ${err.message}` }
  } finally {
    if (child !== null) killGroup(child)
    removeWorktree(mainRoot, worktree)
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.removeListener(signal, onSignal)
  }

  const time = Date.now()
  // A refused round holds its group until the reset the refusal states, so the next round skips it.
  if (refusal !== null) {
    try {
      laneMarks.markDry(dataDir, { harness: external.harness, group: external.group, reading: quotaAfter, reserve: config.reserve, now: time, minutes: config.dryMarkMinutes, refusal })
    } catch {
      // A mark that cannot be written changes nothing: the group goes unmarked this time.
    }
  }
  logEntry(dataDir, session, {
    kind: 'call',
    time,
    startedAt,
    session,
    run: null,
    design: null,
    seat,
    seatId: id,
    choice: choiceName,
    feature: feature ?? null,
    call: 'round-1',
    role: seat,
    task: null,
    harness: external.harness,
    model: modelArg,
    group: external.group,
    effort: external.effort,
    status: outcome.status,
    durationMs: time - startedAt,
    usage: parsed.usage ?? NO_USAGE,
    conversation: parsed.conversation ?? null,
    quotaBefore: external.quotaBefore,
    quotaAfter,
    detail: outcome.detail ?? '',
  })

  const native = NATIVE[seat]
  if (outcome.status !== 'ok') {
    const failed = { failed: outcome.status, seat, id, harness: external.harness, model: external.model, detail: outcome.detail, undone: true, native }
    if (outcome.files) failed.files = outcome.files
    if (outcome.backup) failed.backup = outcome.backup
    return reply(4, failed)
  }
  const groupLabel = settings.groups[external.group] ?? external.group
  const lane = laneLine({ harness: external.harness, modelArg, id, usage: parsed.usage, quotaBefore: external.quotaBefore, quotaAfter, groupLabel })
  const value = { seat, id, harness: external.harness, model: external.model, answer: `${outcome.text}\n${lane}`, result: outcome.result, lane }
  if (outcome.stored) value.stored = outcome.stored
  return reply(0, value)
}

// ---- The command ----

function flags(args) {
  const out = {}
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) throw new Error(`unexpected argument: ${args[i]}`)
    if (i + 1 >= args.length) throw new Error(`${args[i]} needs a value`)
    out[args[i].slice(2)] = args[++i]
  }
  return out
}

const SEAT_ID = /^(judge|writer|examiner)-\d{8}-\d{6}-[0-9a-f]{4}$/

const FEATURE = /^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*$/

// The native answer the Lead acts on: the seat's agent, unless the choice turns the seat off.
function unavailable(seat, reason, { choice, tried = [], native = NATIVE[seat] }) {
  return reply(3, { unavailable: reason, seat, choice, native, tried })
}

// aether-lane seat: one round of a design seat. Exit 0 is an external answer; 3, nothing ran and the
// native agent takes the round (or, with native null, no one does); 4, the external round failed and was
// undone, and the native agent takes it; 1, the command broke.
// input is the message, or a function that resolves to it, called only when an external round runs.
async function seatCommand(argv, { input = '', env = process.env, cwd: callerCwd = process.cwd() } = {}) {
  const [seat, ...rest] = argv
  if (!lanes.SEATS.includes(seat)) throw new Error(USAGE)
  const opts = flags(rest)
  if (!opts.session) throw new Error(`${USAGE}: --session is required`)
  const feature = opts.feature ? relative(opts.feature).replace(/\/+$/, '') : null
  if (feature !== null && !FEATURE.test(feature)) throw new Error(`--feature must be specs/NNN-<topic>, not ${opts.feature}`)
  if ((seat === 'writer' || seat === 'examiner') && feature === null) throw new Error(`the ${seat} needs --feature specs/NNN-<topic>`)
  if (opts.doc !== undefined) {
    if (seat !== 'writer') throw new Error('--doc applies to the writer only')
    if (opts.doc !== 'spec' && opts.doc !== 'plan') throw new Error(`--doc must be spec or plan, not ${opts.doc}`)
  }
  const doc = seat === 'writer' ? (opts.doc ?? 'plan') : null
  if (opts.id !== undefined && !(SEAT_ID.test(opts.id) && opts.id.startsWith(`${seat}-`))) throw new Error(`--id must be ${seat}-YYYYMMDD-HHMMSS-xxxx`)
  const cwd = path.resolve(callerCwd, opts.cwd ?? '.')
  const { worktree: top, mainRoot, gitCommonDir } = repoPaths(cwd)
  // Before any answer: a native Examiner writes its exam under .aether-exam/ in this checkout, and git must not see it.
  run.ensureExcluded(gitCommonDir)
  const choice = lanes.seatsChoice(env)
  const session = opts.session
  const dataDir = run.dataDir(env)

  const note = (status, extra) => logEntry(dataDir, session, { kind: 'seat', time: Date.now(), session, seat, choice: choice.name, feature, status, ...extra })
  const config = lanes.loadConfig()
  if (lanes.seatList(config, choice.name, seat) === false) {
    note('off', {})
    return unavailable(seat, 'off', { choice: choice.name, native: null })
  }
  const enabled = lanes.lanesEnabled(env)
  if (!enabled.on || config === null) {
    const reason = config === null ? 'no-table' : enabled.reason === 'platform' ? 'platform' : 'lanes-off'
    note('native', { reason })
    return unavailable(seat, reason, { choice: choice.name })
  }
  // An external seat reads the commit, so the feature's documents must be committed.
  if (feature !== null && git(['status', '--porcelain', '--', feature], top).stdout !== '') {
    note('native', { reason: 'uncommitted' })
    return unavailable(seat, 'uncommitted', { choice: choice.name })
  }
  const adapters = {}
  const adapterOf = (name, settings) => (adapters[name] ||= createAdapter(name, settings))
  const chosen = chooseSeat(config, {
    choice: choice.name,
    seat,
    author: opts.author ?? null,
    enabled: lanes.enabledHarnesses(env),
    installed: (name, settings) => adapterOf(name, settings).installed(),
    quota: (name, settings, group) => adapterOf(name, settings).quota().groups[group] ?? null,
    // The reading was taken a moment ago, so its life is the harness's whole life.
    marked: (name, group, reading) =>
      laneMarks.liftIfHealthy(dataDir, { harness: name, group, reading, readAt: Date.now(), reserve: config.reserve, lifeMs: laneQuota.lifeMsOf(config.harnesses[name]), now: Date.now() }) !== null,
  })
  if (chosen.native) {
    note('native', { reason: 'no-external', tried: chosen.tried })
    return unavailable(seat, 'no-external', { choice: choice.name, tried: chosen.tried, native: chosen.native })
  }
  const { external } = chosen
  const message = typeof input === 'function' ? await input() : input
  if (message.trim() === '') throw new Error('the message is empty: give it on stdin')
  return runRound({
    cwd: top,
    mainRoot,
    seat,
    session,
    feature,
    doc,
    id: opts.id,
    message,
    external,
    config,
    adapter: adapterOf(external.harness, config.harnesses[external.harness]),
    choiceName: choice.name,
    dataDir,
  })
}

module.exports = { NATIVE, EXTERNAL_EFFORT, EXAM_DIR, USAGE, authorModel, chooseSeat, changedPaths, judgeText, windowUsed, seatPrompt, seatCommand }
