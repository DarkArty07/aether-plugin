'use strict'

// Design seats: the Judge, the Writer and the Examiner, which an external harness takes in place of Aether's
// own agent, one round at a time, when superdelegation is on. The seat asks for the points of its native
// reference pair and lib/superdelegation.js choose picks the pair, as it does for a swarm call; the native
// agent takes the round only when no pair can. A round runs in a disposable worktree of the current commit and
// is judged from outside: what changed in git, and an answer checked against the seat's schema. Anything else
// gives the seat back to the native agent, which redoes the round from the files. A Writer that failed
// after writing part of its document is the exception: that partial is kept and the next pair continues
// from it (issue 68). A round keeps no conversation, so any harness can take any seat.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { git, repoPaths } = require('./git.js')
const run = require('./run.js')
const lanes = require('./lanes.js')
const schemas = require('./lane-schemas.js')
const laneMarks = require('./lane-marks.js')
const { refusalIn } = require('./quota-refusal.js')
const { createAdapter } = require('./harness/index.js')
const { roleBody, claudeMdSections, WORKDIR_RULE } = require('./lane-calls.js')
const { priceEntry, loadPrices } = require('./prices.js')
const { choose, enabled: superdelegationEnabled } = require('./superdelegation.js')
const pairsTable = require('./pairs.js')
const { harnessViews, latestReadings } = require('./lane-pick.js')

const PLUGIN_BIN = path.join(__dirname, '..', 'bin')
const SKILLS_DIR = path.join(__dirname, '..', 'skills')
const KILL_GRACE_SECONDS = 60
const MAX_FINDINGS = 10
const EXAM_DIR = '.aether-exam'
// What the next Writer is told when its worktree already holds an earlier pair's partial. The guide quotes this line.
const CONTINUATION_LINE = 'An earlier writer began this round. Its partial document is in the worktree. It may be incomplete or wrong. Continue from it after checking it against the intent.'

// The native pair each seat asks the points of: the Judge and the Examiner review as Opus high, the Writer
// writes as Sonnet high.
const REFERENCE = {
  judge: { model: 'opus', effort: 'high' },
  writer: { model: 'sonnet', effort: 'high' },
  examiner: { model: 'opus', effort: 'high' },
}

// Each seat's native agent, with the model and effort its agent file sets, and that model's id.
const NATIVE = {
  judge: { agent: 'aether:judge', ...REFERENCE.judge, id: 'claude-opus-5-5' },
  writer: { agent: 'aether:writer', ...REFERENCE.writer, id: 'claude-sonnet-5-5' },
  examiner: { agent: 'aether:examiner', ...REFERENCE.examiner, id: 'claude-opus-5-5' },
}

// The Claude Code model aliases an --author may give, with the ids lane models use for the same model.
const ALIASES = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }

// What a Judge or Examiner round says when the only external pair left is the author's own family (issue 64).
const SAME_FAMILY_NOTE = 'the same family that wrote the document judged it: no other external pair could'

const SCHEMAS = { judge: schemas.JUDGE_SCHEMA, writer: schemas.WRITER_SCHEMA, examiner: schemas.EXAMINER_SCHEMA }

// The schema of a seat's answer: the Writer's depends on the document it writes.
const schemaFor = (seat, doc) => (seat === 'writer' && doc === 'spec' ? schemas.SPEC_WRITER_SCHEMA : SCHEMAS[seat])

const USAGE =
  'usage: aether-lane seat <judge|writer|examiner> --session <id> [--author <model>] [--exclude <id>[,<id>...]] [--feature specs/NNN-<topic>] [--doc <spec|plan>] [--id <seat id>] [--cwd <dir>] (the message on stdin)'

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

// The models each harness's CLI listed, as captured in config/models/harness-models.json
// (scripts/build-models-index.js captures them). Read once; a file that cannot be read
// captures nothing, and then no model is refused on this ground.
let listingCache = undefined
function harnessListing() {
  if (listingCache === undefined) {
    try {
      listingCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'models', 'harness-models.json'), 'utf8'))
    } catch {
      listingCache = null
    }
  }
  return listingCache
}

// Whether the harness's captured listing offers the model at the level the seat's effort
// maps to (issue 016): with no listing for the harness, the listing cannot say, and the
// model is not refused. The level may sit in the id (`gemini-4-argon-high`, which the
// writer's xhigh maps to) or be a flag of the bare model id.
function offeredByListing(harnessName, model, level, listing = harnessListing()) {
  const models = listing && listing.harnesses && listing.harnesses[harnessName] && listing.harnesses[harnessName].models
  if (!Array.isArray(models)) return true
  return models.some((entry) => {
    const id = typeof entry === 'string' ? entry : entry && entry.id
    if (typeof id !== 'string' || (entry && typeof entry === 'object' && entry.excluded)) return false
    return id === model || id === `${model}-${level}`
  })
}

// A pair's quota view, or null when its harness gives none for its group.
function quotaViewOf(harnesses, pair) {
  const groups = harnesses && harnesses[pair.harness] && harnesses[pair.harness].groups
  return groups && Object.hasOwn(groups, pair.group) ? groups[pair.group] : null
}

// The design seats ask choose with the author family as a reserve: another family first, then the author's
// own, and the native agent only last. The swarm and aether-lane delegate keep the default, which is a bar.
function seatChoice(seat, { pairs, harnesses, exclude, authors }) {
  return choose({
    pairs,
    reference: REFERENCE[seat],
    harnesses,
    exclude,
    authors,
    nativeDiffers: seat !== 'writer',
    authorRule: 'reserve',
  })
}

// The pair to hold back from the Writer: the Judge's only external candidate, when the Writer would take
// that same pair and still has another. The Judge is the scarce seat, so the Writer must not spend the only
// pair the Judge can use. Null when the Judge has another candidate, when the Writer would not have taken
// this one, or when holding it back would leave the Writer with no external pair. The document is not written
// yet, so the Judge is asked with no author.
function reservedPair(offeredPairs, harnesses, exclude, authors) {
  const judge = seatChoice('judge', { pairs: offeredPairs, harnesses, exclude: [], authors: [] })
  const open = judge.candidates.filter((candidate) => candidate.why === null)
  if (open.length !== 1) return null
  const held = open[0].id
  if (exclude.includes(held)) return null
  const writer = seatChoice('writer', { pairs: offeredPairs, harnesses, exclude, authors })
  if (!writer.picked || writer.picked.id !== held) return null
  const without = seatChoice('writer', { pairs: offeredPairs, harnesses, exclude: [...exclude, held], authors })
  return without.picked ? held : null
}

// Who takes seat: the external pair that lib/superdelegation.js choose gives for the seat's reference pair,
// or the native agent when none can. harnesses is the view of the quotas of the enabled harnesses; offered(harness,
// model, effort) says whether the harness's captured listing offers the model at that effort (issue 016): a pair it
// does not offer is left out before the choice and listed as passed over, with the reason not-offered. exclude is
// the pair ids the round already tried. A Judge or an Examiner reviews what another model wrote, so its native
// agent is not the author's model either, exclusions or not; the Writer's may be. Before a Writer round, the Judge's
// only external pair is left out when the Writer would take it and still has another (issue 64); tried lists it as
// reserved. Pure apart from the calls it is given. Returns { external } or { native }, each with the pairs passed
// over and why (tried), the whole decision, and note when the answer is the author's own family.
function chooseSeat({ config, pairs, seat, author = null, harnesses, offered = () => true, exclude = [] }) {
  const authorId = authorModel(author)
  const authors = authorId === null ? [] : [authorId]
  const dropped = pairs.filter((pair) => pair.harness !== pairsTable.NATIVE_HARNESS && !offered(pair.harness, pair.model, pair.effort))
  const offeredPairs = pairs.filter((pair) => !dropped.includes(pair))
  const reserved = seat === 'writer' ? reservedPair(offeredPairs, harnesses, exclude, authors) : null
  const chosen = seatChoice(seat, { pairs: offeredPairs, harnesses, exclude: reserved === null ? exclude : [...exclude, reserved], authors })
  const notOffered = dropped.map((pair) => ({
    id: pair.id, harness: pair.harness, group: pair.group, intelligence: pair.intelligence, costPerTaskUsd: pair.costPerTaskUsd, rank: null, outcome: 'passed', why: 'not-offered',
  }))
  const decision = { ...chosen, candidates: [...chosen.candidates, ...notOffered] }
  for (const candidate of decision.candidates) {
    if (candidate.id === reserved && candidate.why === 'excluded') candidate.why = 'reserved'
  }
  const tried = decision.candidates.map(({ id, outcome, why }) => ({ id, outcome, why }))
  let note = null
  if (seat !== 'writer' && decision.picked && authors.includes(decision.picked.family)) {
    note = SAME_FAMILY_NOTE
    decision.reason = `${decision.reason}; ${note}`
  }
  if (decision.picked === null) return { native: { agent: NATIVE[seat].agent, ...decision.native }, tried, decision, note }
  const pair = decision.picked
  return {
    external: {
      harness: pair.harness,
      model: pair.model,
      group: pair.group,
      effort: pair.effort,
      level: pair.effort,
      timeoutSeconds: lanes.seatTimeout(config.harnesses[pair.harness], seat),
      quotaBefore: quotaViewOf(harnesses, pair),
      pair,
    },
    tried,
    decision,
    note,
  }
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

// The documents a Writer round may leave, in the order a partial lists them.
function documentPaths(feature, doc) {
  return doc === 'spec' ? [`${feature}/spec.md`] : [`${feature}/plan.md`, `${feature}/tasks.md`]
}

// Whether a changed path is one the seat may change.
function allowedFor(seat, feature, doc) {
  if (seat === 'writer') {
    const own = documentPaths(feature, doc)
    return (file) => own.includes(file)
  }
  if (seat === 'examiner') return (file) => file.startsWith(`${EXAM_DIR}/`)
  return () => false
}

// A non-empty regular file at rel inside root. A symlink is not one, and neither is a path that resolves outside
// root: the partial is the document the pair wrote, not a pointer at something else.
function textInside(root, rel) {
  if (typeof rel !== 'string' || rel === '' || path.isAbsolute(rel) || rel.split('/').includes('..')) return null
  const full = path.join(root, rel)
  let st
  try {
    st = fs.lstatSync(full)
  } catch {
    return null
  }
  if (!st.isFile() || st.size === 0) return null
  let realFile
  let realRoot
  try {
    realFile = fs.realpathSync(full)
    realRoot = fs.realpathSync(root)
  } catch {
    return null
  }
  const relative = path.relative(realRoot, realFile)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null
  let text
  try {
    text = fs.readFileSync(full, 'utf8')
  } catch {
    return null
  }
  return text === '' ? null : text
}

// Where a Writer's partial waits for the next pair of this session and document. Null when session, feature or
// doc could not be a path under the seat directory: the partial is never written anywhere else.
function offerDir(mainRoot, session, feature, doc) {
  if (!/^[A-Za-z0-9-]+$/.test(String(session))) return null
  if (!/^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(feature))) return null
  if (doc !== 'spec' && doc !== 'plan') return null
  return path.join(run.aetherDir(mainRoot), 'seats', 'carry', session, feature, doc)
}

// The digest of the round this partial belongs to, or null when there is none. Written last, so a save that
// was killed before it finished is not taken for the round.
function offerDigest(mainRoot, session, feature, doc) {
  const dir = offerDir(mainRoot, session, feature, doc)
  if (dir === null) return null
  try {
    const text = fs.readFileSync(path.join(dir, 'round'), 'utf8').trim()
    return text === '' ? null : text
  } catch {
    return null
  }
}

function saveOffer(mainRoot, session, feature, doc, files, digest) {
  const dir = offerDir(mainRoot, session, feature, doc)
  if (dir === null) return
  fs.rmSync(dir, { recursive: true, force: true })
  if (!Array.isArray(files) || files.length === 0 || typeof digest !== 'string' || digest === '') return
  const allowed = new Set(documentPaths(feature, doc).map((rel) => path.basename(rel)))
  const kept = files.filter((file) => allowed.has(path.basename(file.path)) && typeof file.text === 'string' && file.text !== '')
  if (kept.length === 0) return
  fs.mkdirSync(dir, { recursive: true })
  for (const file of kept) fs.writeFileSync(path.join(dir, path.basename(file.path)), file.text)
  fs.writeFileSync(path.join(dir, 'round'), digest)
}

function clearOffer(mainRoot, session, feature, doc) {
  const dir = offerDir(mainRoot, session, feature, doc)
  if (dir !== null) fs.rmSync(dir, { recursive: true, force: true })
}

function loadOffer(mainRoot, session, feature, doc, digest) {
  const dir = offerDir(mainRoot, session, feature, doc)
  if (dir === null || offerDigest(mainRoot, session, feature, doc) !== digest) return []
  const files = []
  for (const rel of documentPaths(feature, doc)) {
    const text = textInside(dir, path.basename(rel))
    if (text !== null) files.push({ path: rel, text })
  }
  return files
}

// Whether the nearest existing ancestor of full resolves inside root. A symlink to a folder outside the
// worktree resolves outside, so the write that would follow it is refused before any directory is created.
function resolvesInside(root, full) {
  let realRoot
  try {
    realRoot = fs.realpathSync(root)
  } catch {
    return false
  }
  let current = path.dirname(full)
  while (true) {
    try {
      const relative = path.relative(realRoot, fs.realpathSync(current))
      return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
    } catch (err) {
      if (err.code !== 'ENOENT') return false
      const parent = path.dirname(current)
      if (parent === current) return false
      current = parent
    }
  }
}

// Copies the saved partial into the new worktree, uncommitted, and only where it is still a regular file inside it.
function applyOffer(worktree, files) {
  const applied = []
  for (const file of files) {
    if (typeof file.path !== 'string' || typeof file.text !== 'string' || file.text === '') continue
    const full = path.resolve(worktree, file.path)
    const relative = path.relative(worktree, full)
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue
    if (!resolvesInside(worktree, full)) continue
    fs.mkdirSync(path.dirname(full), { recursive: true })
    if (!resolvesInside(worktree, full)) continue
    try {
      const st = fs.lstatSync(full)
      if (!st.isFile()) fs.rmSync(full, { force: true })
    } catch (err) {
      if (err.code !== 'ENOENT') continue
    }
    if (!resolvesInside(worktree, full)) continue
    fs.writeFileSync(full, file.text)
    const text = textInside(worktree, file.path)
    if (text !== null) applied.push({ path: file.path, text })
  }
  return applied
}

// The allowed documents this attempt changed and left as non-empty files. What it left replaces the previous
// partial: an empty document, or a change that is not one of these paths, drops it.
function salvagePartial(worktree, start, feature, doc) {
  const changed = new Set(changedPaths(worktree, start))
  const files = []
  for (const rel of documentPaths(feature, doc)) {
    if (!changed.has(rel)) continue
    const text = textInside(worktree, rel)
    if (text !== null) files.push({ path: rel, text })
  }
  return files
}

function writeJsonAtomic(file, value) {
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`)
  fs.renameSync(temporary, file)
}

// ---- The prompt ----

// A skill's text, without its frontmatter.
function skillBody(name) {
  const text = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8')
  const end = text.indexOf('\n---\n', 4)
  return (end === -1 ? text : text.slice(end + '\n---\n'.length)).trim()
}

// Where a finding touches the document (issue 67). A line it names wins (`file:line`, or "line N"); otherwise a
// markdown heading it names; otherwise, when the document text is in hand, the heading above the quote in its
// evidence. This is the reference copy that the workflow's copy follows and the tests pin. The design workflow
// keeps its own copy of the no-document half and never calls this: it cannot read the file, so a round's message
// says "names no line" unless the finding itself names a line or a heading.
const PATH_LINE = /(?:^|[\s`'"(])([A-Za-z0-9_./-]*[./][A-Za-z0-9_./-]*):(\d+)(?:[ \t]*[-–][ \t]*(\d+))?(?=$|[\s`'")\],.;:])/
const WORD_LINE = /\blines?[ \t]+(\d+)(?:[ \t]*[-–][ \t]*(\d+))?\b/i
const NAMED_HEADING = /(?:^|[\s`'"(])(#{1,6}[ \t]+\S[^\n`]*)/

function spanOf(start, end) {
  return end ? `lines ${start}-${end}` : `line ${start}`
}

function lineTouch(text) {
  const path = PATH_LINE.exec(text)
  if (path) return spanOf(path[2], path[3])
  const word = WORD_LINE.exec(text)
  if (word) return spanOf(word[1], word[2])
  return null
}

function headingTouch(text) {
  const heading = NAMED_HEADING.exec(text)
  return heading ? heading[1].trim() : null
}

function quoteTouch(evidence) {
  const match = /`([^`]+)`/.exec(evidence)
  if (!match) return null
  const quote = match[1].trim()
  if (quote === '' || /^#{1,6}[ \t]/.test(quote)) return null
  if (PATH_LINE.test(quote) || WORD_LINE.test(quote)) return null
  return quote
}

function headingAbove(document, quote) {
  const at = document.indexOf(quote)
  if (at < 0) return null
  let found = null
  for (const line of document.slice(0, at).split('\n')) {
    const heading = /^(#{1,6}[ \t]+\S.*)$/.exec(line.trim())
    if (heading) found = heading[1].trim()
  }
  return found
}

function findingTouch(finding, document = '') {
  const evidence = finding !== null && typeof finding === 'object' && typeof finding.evidence === 'string' ? finding.evidence : ''
  const title = finding !== null && typeof finding === 'object' && typeof finding.title === 'string' ? finding.title : ''
  const named = `${evidence}\n${title}`
  const line = lineTouch(named)
  if (line) return line
  const heading = headingTouch(named)
  if (heading) return heading
  if (document !== '') {
    const quote = quoteTouch(evidence)
    const above = quote ? headingAbove(document, quote) : null
    if (above) return above
  }
  return 'names no line'
}

function formatFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return ['- none']
  return findings.map((finding, index) => {
    const severity = typeof finding.severity === 'string' && finding.severity !== '' ? finding.severity : 'major'
    const type = typeof finding.type === 'string' && finding.type !== '' ? ` [${finding.type}]` : ''
    const title = typeof finding.title === 'string' ? finding.title : ''
    const parts = [`${index + 1}. [${severity}]${type} ${title}`, findingTouch(finding)]
    if (typeof finding.evidence === 'string' && finding.evidence !== '') parts.push(finding.evidence)
    if (typeof finding.fix === 'string' && finding.fix !== '') parts.push(finding.fix)
    return parts.join(' — ')
  })
}

// The block a correction round gives the Writer: the edit, the paths, and each finding with its place.
const EDIT_ONLY = 'Edit the document in place. Change only what the findings need. Do not rewrite, reorder or reformat the rest. Keep everything the Judge did not flag.'

// This is the reference copy that the workflow's copy follows and the tests pin. The design workflow keeps its
// own copy, and nothing in a round calls this one.
function revisionBrief({ paths, findings, openQuestions = [] }) {
  const questions = Array.isArray(openQuestions) ? openQuestions.filter((item) => typeof item === 'string' && item !== '') : []
  const out = [EDIT_ONLY, '', 'The document:', ...paths.map((item) => `- ${item}`), '', 'Findings:', ...formatFindings(findings)]
  if (questions.length > 0) out.push('', 'Open questions:', ...questions.map((item) => `- ${item}`))
  return out.join('\n')
}

// A message that starts a correction, as design.workflow.js writes it. The skills below stay as the rules of the
// fields; they are not a brief to write the document again.
function correctionLine(message) {
  if (typeof message !== 'string' || !message.startsWith('Revise ')) return []
  return ['- This round corrects the document. Edit it in place, as the message says. What follows is the rule of the fields, not a brief to write the document again.']
}

// The note that tells the role it runs in an external harness, and what changes for it there.
function seatNote(seat, harness, feature, doc, message = '') {
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
      ...correctionLine(message),
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
      ...correctionLine(message),
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
  const parts = [roleBody(seat), seatNote(seat, harness, feature, doc, message), ...claudeMdSections(workdir, os.homedir()), message]
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
// what failed. The worktree is removed whatever happens. A Writer's partial document is saved before that,
// so the next pair can continue from it.
async function runRound({ cwd, mainRoot, seat, session, feature, doc, id: givenId, message, external, decision, config, adapter, dataDir, note = null }) {
  const id = givenId ?? `${seat}-${run.newRunId()}`
  const dir = path.join(run.aetherDir(mainRoot), 'seats', id)
  const worktree = path.join(dir, 'wt')
  const marker = `seat/${id}`
  const settings = config.harnesses[external.harness]
  const schema = schemaFor(seat, doc)
  const modelArg = adapter.modelArg({ model: external.model, level: external.level })
  const label = `${external.harness}/${external.model}`
  fs.mkdirSync(dir, { recursive: true })
  // A partial belongs to the round whose message has this digest: every try of one round shares the message, and a
  // later round's differs. A partial of another round is cleared before pair.json exists. A stop that then lands
  // before the signal handler can name the pair, and the next try still cannot paste that older partial over the
  // commit (issue 68). The same digest, and not --exclude, is what makes a try a continuation: a stop that names
  // no pair leaves the exclusion empty, and the next try of this round must still receive what this one saved.
  const roundDigest = lanes.digest(message)
  const sameRound = seat === 'writer' && offerDigest(mainRoot, session, feature, doc) === roundDigest
  if (seat === 'writer' && !sameRound) clearOffer(mainRoot, session, feature, doc)
  // The pair this round runs on, for `seat-stop` to name when the workflow ends the round at its time cap (issue 62), so
  // that the next try leaves it out.
  if (typeof decision?.picked?.id === 'string') fs.writeFileSync(path.join(dir, 'pair.json'), `${JSON.stringify({ pair: decision.picked.id })}\n`)
  const start = git(['rev-parse', 'HEAD'], cwd).stdout
  git(['worktree', 'add', '-q', '--detach', worktree, start], cwd)

  const startedAt = Date.now()
  let child = null
  let outcome
  let settled = false
  let carried = []
  let continued = false
  // Once, before the worktree goes. A round that finished clears the partial, so a later round does not paste it
  // back over the document it just committed. A round that did not replaces the partial with what it left, which
  // is nothing when it left nothing worth keeping. A second call, or a worktree already gone, does not clear it:
  // the signal and the finally both reach this, and the one that finds no worktree must not drop what the other saved.
  const settlePartial = () => {
    if (settled || seat !== 'writer') return
    settled = true
    if (outcome && outcome.status === 'ok') {
      clearOffer(mainRoot, session, feature, doc)
      carried = []
      writeJsonAtomic(path.join(dir, 'partial.json'), [])
      return
    }
    if (!fs.existsSync(worktree)) return
    try {
      carried = salvagePartial(worktree, start, feature, doc)
      saveOffer(mainRoot, session, feature, doc, carried, roundDigest)
      writeJsonAtomic(path.join(dir, 'partial.json'), carried)
    } catch {
      carried = []
    }
  }
  const onSignal = () => {
    if (child !== null) killGroup(child)
    settlePartial()
    removeWorktree(mainRoot, worktree)
    process.exit(143)
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, onSignal)

  let parsed = { usage: NO_USAGE, conversation: null }
  let quotaAfter = null
  let quotaRead = false
  let refusal = null
  let roundMessage = message
  try {
    if (seat === 'writer') {
      // sameRound was decided before pair.json, from the digest. A partial of another round was cleared then.
      if (sameRound) {
        const offered = loadOffer(mainRoot, session, feature, doc, roundDigest)
        if (offered.length > 0 && applyOffer(worktree, offered).length > 0) {
          continued = true
          roundMessage = `${message.replace(/\s+$/, '')}\n\n${CONTINUATION_LINE}\n`
        }
      }
      // Written even when this round did not continue, so seat-stop can tell a Writer from a Judge.
      writeJsonAtomic(path.join(dir, 'continued.json'), { continued })
    }
    const schemaFile = path.join(dir, 'schema.json')
    fs.writeFileSync(schemaFile, `${JSON.stringify(schema, null, 2)}\n`)
    const prompt = seatPrompt({ seat, harness: external.harness, adapter, message: roundMessage, workdir: worktree, feature, doc })
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
    // The output is parsed before the quota is read: a harness that keeps in parse what the call reported of its quota
    // (muse's allowance) gives that to the reading below, and for the others the order changes nothing.
    parsed = adapter.parse({ stdout: readTextOrEmpty(path.join(dir, 'stdout')), stderr: readTextOrEmpty(path.join(dir, 'stderr')), exitCode }, { required: schema.required })
    try {
      quotaAfter = adapter.quota().groups[external.group] ?? null
      quotaRead = true
    } catch {
      // An unreadable quota is an infrastructure failure, not a verdict on the quota.
    }
    const allowed = allowedFor(seat, feature, doc)
    const outside = changedPaths(worktree, start).filter((file) => !allowed(file))
    if (outside.length > 0) {
      const backup = saveRound(worktree, backupRef(id), dir, `aether: seat ${id}, kept because it changed files outside its seat`)
      outcome = { status: 'violation', files: outside, backup, detail: 'changes outside the seat' }
    } else if (!parsed.clean) {
      // An explicit refusal in words (agy's individual quota, Muse's subscription 429; quota-refusal.js) needs no reading.
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
    settlePartial()
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
    feature: feature ?? null,
    call: 'round-1',
    role: seat,
    task: null,
    harness: external.harness,
    model: modelArg,
    group: external.group,
    effort: external.effort,
    reference: decision.reference,
    reason: decision.reason,
    ...(typeof note === 'string' && note !== '' ? { note } : {}),
    status: outcome.status,
    durationMs: time - startedAt,
    usage: parsed.usage ?? NO_USAGE,
    conversation: parsed.conversation ?? null,
    quotaBefore: external.quotaBefore,
    quotaAfter,
    detail: outcome.detail ?? '',
  })

  // The native agent that redoes a failed round comes from the decision, so that a Judge or an Examiner is not the author's model.
  const native = { agent: NATIVE[seat].agent, ...decision.native }
  if (outcome.status !== 'ok') {
    const failed = { failed: outcome.status, seat, id, harness: external.harness, model: external.model, detail: outcome.detail, undone: true, native, decision }
    if (outcome.files) failed.files = outcome.files
    if (outcome.backup) failed.backup = outcome.backup
    if (seat === 'writer') {
      failed.continued = continued
      if (carried.length > 0) failed.partial = carried
    }
    return reply(4, failed)
  }
  const groupLabel = settings.groups[external.group] ?? external.group
  const lane = laneLine({ harness: external.harness, modelArg, id, usage: parsed.usage, quotaBefore: external.quotaBefore, quotaAfter, groupLabel })
  const value = { seat, id, harness: external.harness, model: external.model, answer: `${outcome.text}\n${lane}`, result: outcome.result, lane }
  if (outcome.stored) value.stored = outcome.stored
  if (typeof note === 'string' && note !== '') value.note = note
  if (seat === 'writer') value.continued = continued
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

// The pair ids a round already tried, as `--exclude` gives them: the same rule and message as `aether-lane pick`
// (lib/lane-pick.js excludeList), so that both refuse the same ids. Keep the two in step.
const PAIR_ID = /^[a-z][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*@(low|medium|high|xhigh|max)$/

function excludeList(value) {
  if (value === undefined) return []
  const ids = String(value).split(',')
  const bad = ids.find((id) => !PAIR_ID.test(id))
  if (bad !== undefined) throw new Error(`--exclude must be pair ids like agy/model@effort, not ${JSON.stringify(bad)}`)
  return ids
}

const FEATURE = /^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*$/

// The reply of a round that does not run: the native agent of the decision takes it, with the decision beside it.
function unavailable(seat, reason, { native, tried, decision }) {
  return reply(3, { unavailable: reason, seat, native, tried, decision })
}

// aether-lane seat: one round of a design seat. Exit 0 is an external answer; 3, nothing ran and the
// native agent of the decision takes the round; 4, the external round failed and was undone, and the native
// agent of the decision takes it; 1, the command broke.
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
  const exclude = excludeList(opts.exclude)
  const cwd = path.resolve(callerCwd, opts.cwd ?? '.')
  const { worktree: top, mainRoot, gitCommonDir } = repoPaths(cwd)
  // Before any answer: a native Examiner writes its exam under .aether-exam/ in this checkout, and git must not see it.
  run.ensureExcluded(gitCommonDir)
  const session = opts.session
  const dataDir = run.dataDir(env)
  const author = opts.author ?? null

  const config = lanes.loadConfig()
  const table = pairsTable.loadPairs().pairs
  const note = (status, extra) => logEntry(dataDir, session, { kind: 'seat', time: Date.now(), session, seat, feature, status, ...extra })
  // A round that does not run: no harness is enabled for the choice, so the decision is the native agent's alone, and
  // a Judge or an Examiner still does not fall on the author's model.
  const handBack = (reason) => {
    const chosen = chooseSeat({ config, pairs: table, seat, author, harnesses: {}, exclude })
    note('native', { reason, reference: chosen.decision.reference })
    return unavailable(seat, reason, { ...chosen, tried: [] })
  }
  const switchState = superdelegationEnabled(env)
  if (!switchState.on) return handBack(switchState.reason === 'platform' ? 'platform' : 'superdelegation-off')
  if (config === null) return handBack('no-table')
  // An external seat reads the commit, so the feature's documents must be committed.
  if (feature !== null && git(['status', '--porcelain', '--', feature], top).stdout !== '') return handBack('uncommitted')

  const adapters = {}
  const adapterOf = (name, settings) => (adapters[name] ||= createAdapter(name, settings))
  const now = Date.now()
  const enabledNames = lanes.enabledHarnesses(env)
  const latest = await latestReadings(config, enabledNames, { dataDir, now })
  // The readings as the adapters gave them: the lane line measures what the round used between two of them.
  const readings = {}
  const harnesses = {}
  for (const name of enabledNames) {
    const onRead = ({ groups }) => {
      readings[name] = groups
    }
    Object.assign(harnesses, harnessViews(config, [name], { dataDir, now, latest, onRead }))
  }
  const chosen = chooseSeat({ config, pairs: table, seat, author, harnesses, exclude, offered: (name, model, effort) => offeredByListing(name, model, effort) })
  if (chosen.native) {
    note('native', { reason: 'no-external', tried: chosen.tried, reference: chosen.decision.reference })
    return unavailable(seat, 'no-external', chosen)
  }
  const { external, decision } = chosen
  external.quotaBefore = readings[external.harness]?.[external.group] ?? external.quotaBefore
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
    decision,
    config,
    adapter: adapterOf(external.harness, config.harnesses[external.harness]),
    dataDir,
    note: chosen.note,
  })
}

module.exports = { REFERENCE, NATIVE, EXAM_DIR, USAGE, authorModel, excludeList, chooseSeat, offeredByListing, changedPaths, judgeText, windowUsed, findingTouch, revisionBrief, seatPrompt, seatCommand }
