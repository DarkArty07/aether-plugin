'use strict'

// The Designer's rounds on agy. `start` opens a design and runs its first round; `reply` runs the
// next one in the same agy conversation. Each round is a transaction on the Designer's worktree: it
// starts clean, may change only specs and plans, and is undone whole when it breaks that rule or
// ends without a clean result. A design's state lives in <main checkout>/.aether/design/<id>/.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { git, repoPaths } = require('./git.js')
const run = require('./run.js')
const lanes = require('./lanes.js')
const { createAgy } = require('./harness/agy.js')
const { roleBody, claudeMdSections } = require('./lane-calls.js')
const { DESIGNER_SCHEMA } = require('./lane-schemas.js')
const { priceEntry, loadPrices } = require('./prices.js')

const HARNESS = 'agy'
const ROLE = 'designer'
const NATIVE_MODEL = 'opus'
const EFFORT = 'xhigh'
const PLUGIN_BIN = path.join(__dirname, '..', 'bin')
const ALLOWED_PREFIXES = ['docs/superpowers/specs/', 'docs/superpowers/plans/']
const KILL_GRACE_SECONDS = 60
const NO_USAGE = { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }

const USAGE =
  'usage: aether-lane design start --session <id> --cwd <path> | reply <id> | end <id> | list (start and reply read stdin)'

// ---- Output ----

const jsonLine = (value) => `${JSON.stringify(value)}\n`
const answer = (exitCode, value) => ({ exitCode, stdout: jsonLine(value) })
const unavailable = (reason) => answer(3, { unavailable: reason })
const noOpenDesign = (id) => answer(1, { error: `no open design ${id}` })

// ---- Files ----

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

function designsDir(mainRoot) {
  return path.join(run.aetherDir(mainRoot), 'design')
}

function designDir(mainRoot, id) {
  return path.join(designsDir(mainRoot), id)
}

const stateFile = (dir) => path.join(dir, 'state.json')

// The state of design id, or null when the id is malformed or names no design.
function readState(mainRoot, id) {
  if (!run.isRunId(id)) return null
  return readJsonOrNull(stateFile(designDir(mainRoot, id)))
}

// ---- The worktree ----

function topOf(cwd) {
  return git(['rev-parse', '--show-toplevel'], cwd).stdout
}

function isDirty(cwd) {
  return git(['status', '--porcelain', '--untracked-files=all'], cwd, { raw: true }).stdout !== ''
}

function nulList(args, cwd) {
  return git(args, cwd, { raw: true }).stdout.split('\0').filter(Boolean)
}

// Every path the round touched since start: committed, uncommitted or untracked. Renames count
// both of their paths.
function changedPaths(top, start) {
  const paths = new Set([
    ...nulList(['diff', '--name-only', '--no-renames', '-z', start, 'HEAD'], top),
    ...nulList(['diff', '--name-only', '--no-renames', '-z', 'HEAD'], top),
    ...nulList(['ls-files', '--others', '--exclude-standard', '-z'], top),
  ])
  return [...paths].sort()
}

// Puts the worktree back at the round's starting commit, on the branch it started on, and removes
// what the round created. A round starts clean, so this never touches earlier work; ignored files
// survive because clean runs without -x.
function undoRound(top, start, startBranch) {
  const branch = git(['branch', '--show-current'], top, { allowFail: true }).stdout
  if (branch !== startBranch) {
    git(['checkout', '-q', '-f', ...(startBranch ? [startBranch] : ['--detach', start])], top, { allowFail: true })
  }
  git(['reset', '-q', '--hard', start], top)
  git(['clean', '-fdq'], top)
}

// ---- Superpowers ----

// The SKILL.md paths of the installed superpowers' brainstorming and writing-plans, or null.
function superpowersSkills() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const plugins = readJsonOrNull(path.join(configDir, 'plugins', 'installed_plugins.json'))?.plugins
  if (!plugins || typeof plugins !== 'object') return null
  const key = Object.keys(plugins).find((name) => name.startsWith('superpowers@'))
  const installPath = key && Array.isArray(plugins[key]) ? plugins[key][0]?.installPath : null
  if (typeof installPath !== 'string' || installPath === '') return null
  const skills = {
    brainstorming: path.join(installPath, 'skills', 'brainstorming', 'SKILL.md'),
    writingPlans: path.join(installPath, 'skills', 'writing-plans', 'SKILL.md'),
  }
  return Object.values(skills).every((file) => fs.existsSync(file)) ? skills : null
}

function designNote({ brainstorming, writingPlans }) {
  return [
    '## You run in an external harness',
    '',
    'You are the Aether Designer, run by the agy CLI rather than Claude Code. Your role above holds, with these changes:',
    `- You have no Skill tool. Where your role says to load a superpowers skill, read its SKILL.md and follow it: superpowers:brainstorming is ${brainstorming}, and superpowers:writing-plans is ${writingPlans}. Files those skills mention sit beside them.`,
    `- Run aether-voice as ${PLUGIN_BIN}/aether-voice and aether-plan as ${PLUGIN_BIN}/aether-plan.`,
    '- Commit only files under docs/superpowers/specs/ and docs/superpowers/plans/. A change to any other file undoes your whole round.',
    '- Your reply goes in the structured output your harness asks for: forOwner is the text of "For the owner"; stage, waitingFor and files are the bullets of "For the Lead".',
  ].join('\n')
}

// ---- The table and the adapter ----

function harnessSettings(config) {
  const harness = config?.harnesses?.[HARNESS]
  if (!harness) throw new Error(`the lane table has no ${HARNESS} harness`)
  return { harness, adapter: createAgy({ command: harness.command, groups: harness.groups }) }
}

// The group's reading, or null when /usage fails or does not report it.
function readQuota(adapter, group) {
  try {
    return adapter.quota().groups[group] ?? null
  } catch {
    return null
  }
}

// ---- agy ----

// The group of a child that has exited: its leader is gone, so killGroup's marker check cannot pass,
// and this process holds the child, so the pid cannot have been reused.
function killExitedGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // The group is already empty.
  }
}

// Runs agy detached in cwd, with its pid in <dir>/pid until it ends. Resolves to its exit code.
// When this process is told to stop, it stops agy and calls onInterrupt before it exits.
function runAgy(argv, { cwd, dir, marker, timeoutSeconds, onInterrupt }) {
  const pidFile = path.join(dir, 'pid')
  const out = fs.openSync(path.join(dir, 'agy.stdout'), 'w')
  const err = fs.openSync(path.join(dir, 'agy.stderr'), 'w')
  let child
  try {
    child = spawn(argv[0], argv.slice(1), {
      cwd,
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
    const onSignal = () => {
      lanes.killGroup(pidFile, marker)
      try {
        onInterrupt()
      } finally {
        process.exit(143)
      }
    }
    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP']
    const settle = () => {
      clearTimeout(timer)
      for (const signal of signals) process.removeListener(signal, onSignal)
    }
    child.once('error', (error) => {
      settle()
      reject(new Error(`agy did not start: ${error.message}`))
    })
    child.once('spawn', () => {
      fs.writeFileSync(pidFile, `${child.pid}\n`)
      for (const signal of signals) process.on(signal, onSignal)
      timer = setTimeout(() => lanes.killGroup(pidFile, marker), (timeoutSeconds + KILL_GRACE_SECONDS) * 1000)
    })
    child.once('exit', (code, signal) => {
      settle()
      killExitedGroup(child.pid)
      fs.rmSync(pidFile, { force: true })
      resolve(code ?? 128 + (os.constants.signals[signal] || 0))
    })
  })
}

// ---- The reply ----

// The drop in a window's remaining fraction, in percent, or ? when it cannot be measured.
function windowUsed(before, after, window) {
  const a = before?.windows?.[window]
  const b = after?.windows?.[window]
  if (!a || !b || typeof a.remaining !== 'number' || typeof b.remaining !== 'number' || a.resetsAt !== b.resetsAt) return '?'
  return (Math.max(0, a.remaining - b.remaining) * 100).toFixed(1)
}

function laneLine(state, n, usage, quotaBefore, quotaAfter, groupLabel) {
  const tokens = lanes.laneTokens(usage)
  const count = tokens.input + tokens.output + tokens.cacheRead
  const usd = priceEntry({ model: state.agyModel, ...tokens, agent: 'lane' }, loadPrices())
  const dollars = usd === null ? '?' : usd.toFixed(2)
  const fiveHour = windowUsed(quotaBefore, quotaAfter, '5h')
  const weekly = windowUsed(quotaBefore, quotaAfter, 'weekly')
  return `- Lane: agy ${state.agyModel}, design ${state.id}; this round ${count} tokens, $${dollars} at list price; ${groupLabel} used ${fiveHour} % of the 5 h window and ${weekly} % of the weekly one`
}

function replyText(structured, lane) {
  return [
    '## For the owner',
    String(structured.forOwner),
    '',
    '## For the Lead',
    `- Stage: ${structured.stage}`,
    `- Waiting for: ${structured.waitingFor}`,
    `- Files: ${structured.files}`,
    lane,
    '',
  ].join('\n')
}

// ---- A round ----

// The cumulative usage of the last earlier round in conversation, or null.
function previousCumulative(rounds, conversation) {
  if (!conversation) return null
  const earlier = [...rounds].reverse().find((round) => round.conversation === conversation && round.cumulative)
  return earlier ? earlier.cumulative : null
}

function judge(files, parsed, quotaAfter, reserve) {
  const outside = files.filter((file) => !ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix)))
  if (outside.length > 0) return { status: 'violation', files: outside, detail: 'changes outside specs and plans' }
  if (!parsed.clean) return { status: lanes.usable(quotaAfter, reserve) ? 'failed' : 'quota', detail: parsed.reason }
  return { status: 'ok', detail: '' }
}

async function runRound({ mainRoot, state, config, harness, adapter, input, quotaBefore, skills }) {
  const dir = designDir(mainRoot, state.id)
  const marker = `design/${state.id}`
  const n = state.rounds.length + 1
  const opening = state.conversation === null
  const top = topOf(state.cwd)
  const prompt = opening ? [roleBody(ROLE), designNote(skills), ...claudeMdSections(state.cwd, os.homedir()), input].join('\n\n') : input
  const schemaFile = path.join(dir, 'schema.json')
  fs.writeFileSync(schemaFile, `${JSON.stringify(DESIGNER_SCHEMA, null, 2)}\n`)

  const start = git(['rev-parse', 'HEAD'], top).stdout
  const startBranch = git(['branch', '--show-current'], top).stdout
  const startedAt = Date.now()
  const timeoutSeconds = harness.timeouts[ROLE]
  const argv = adapter.argv({ model: state.agyModel, schemaFile, timeoutSeconds, prompt, conversation: state.conversation })
  let parsed
  try {
    const onInterrupt = () => undoRound(top, start, startBranch)
    const exitCode = await runAgy(argv, { cwd: state.cwd, dir, marker, timeoutSeconds, onInterrupt })
    parsed = adapter.parse(
      { stdout: readTextOrEmpty(path.join(dir, 'agy.stdout')), stderr: readTextOrEmpty(path.join(dir, 'agy.stderr')), exitCode },
      { conversation: state.conversation, required: DESIGNER_SCHEMA.required },
    )
  } catch (err) {
    parsed = { clean: false, reason: err.message, structured: null, usage: NO_USAGE, conversation: null }
  }
  const quotaAfter = readQuota(adapter, state.group)
  const outcome = judge(changedPaths(top, start), parsed, quotaAfter, config.reserve)
  if (outcome.status !== 'ok') undoRound(top, start, startBranch)

  const time = Date.now()
  const usage = adapter.usageDelta(previousCumulative(state.rounds, parsed.conversation), parsed.usage)
  if (outcome.status === 'ok' && opening) state.conversation = parsed.conversation
  state.rounds.push({
    n,
    status: outcome.status,
    start,
    startedAt,
    durationMs: time - startedAt,
    conversation: parsed.conversation,
    cumulative: parsed.usage,
    usage,
    quotaBefore,
    quotaAfter,
    detail: outcome.detail,
    ...(outcome.files ? { files: outcome.files } : {}),
  })
  // `end` removes the directory while a round runs; the round must not bring it back.
  if (fs.existsSync(stateFile(dir))) run.writeJson(stateFile(dir), state)
  try {
    lanes.appendLog(run.dataDir(), state.session, {
      kind: 'call',
      time,
      startedAt,
      session: state.session,
      run: null,
      design: state.id,
      call: `round-${n}`,
      role: ROLE,
      task: null,
      harness: HARNESS,
      model: state.agyModel,
      group: state.group,
      effort: EFFORT,
      status: outcome.status,
      durationMs: time - startedAt,
      usage,
      conversation: parsed.conversation,
      quotaBefore,
      quotaAfter,
      detail: outcome.detail,
    })
  } catch {
    // A log that cannot be written must not keep the reply from the Lead.
  }

  if (outcome.status !== 'ok') {
    const failed = { failed: outcome.status }
    if (outcome.status === 'violation') failed.files = outcome.files
    else failed.detail = outcome.detail
    failed.undone = true
    return answer(4, failed)
  }
  const groupLabel = harness.groups[state.group] ?? state.group
  const lane = laneLine(state, n, usage, quotaBefore, quotaAfter, groupLabel)
  return { exitCode: 0, stdout: replyText(parsed.structured, lane) }
}

// ---- Commands ----

function flags(args) {
  const out = {}
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--') || i + 1 >= args.length) throw new Error(USAGE)
    out[args[i].slice(2)] = args[++i]
  }
  return out
}

function newDesignId(mainRoot) {
  for (;;) {
    const id = run.newRunId()
    if (!fs.existsSync(designDir(mainRoot, id))) return id
  }
}

async function start(args, input) {
  const { session, cwd } = flags(args)
  if (typeof session !== 'string' || session === '' || typeof cwd !== 'string' || cwd === '') throw new Error(USAGE)
  const workdir = path.resolve(cwd)
  const { mainRoot, gitCommonDir } = repoPaths(process.cwd())
  const config = lanes.loadConfig(lanes.configPath())
  const lane = lanes.laneFor(config, ROLE, NATIVE_MODEL, EFFORT)
  if (!lane || lane.harness !== HARNESS) return unavailable('role')
  const { harness, adapter } = harnessSettings(config)
  if (!adapter.installed()) return unavailable('not-installed')
  const skills = superpowersSkills()
  if (!skills) return unavailable('superpowers')
  let quotaBefore
  try {
    quotaBefore = adapter.quota().groups[lane.group] ?? null
  } catch {
    return unavailable('quota')
  }
  if (!lanes.usable(quotaBefore, config.reserve)) return unavailable('quota')
  if (isDirty(topOf(workdir))) return unavailable('dirty')

  run.ensureExcluded(gitCommonDir)
  const id = newDesignId(mainRoot)
  const state = { id, session, cwd: workdir, conversation: null, agyModel: lane.agyModel, group: lane.group, status: 'open', rounds: [] }
  run.writeJson(stateFile(designDir(mainRoot, id)), state)
  return runRound({ mainRoot, state, config, harness, adapter, input, quotaBefore, skills })
}

async function reply(args, input) {
  const [id] = args
  const { mainRoot } = repoPaths(process.cwd())
  const state = readState(mainRoot, id)
  if (!state || state.status !== 'open') return noOpenDesign(id)
  if (isDirty(topOf(state.cwd))) return unavailable('dirty')
  const config = lanes.loadConfig(lanes.configPath())
  const { harness, adapter } = harnessSettings(config)
  // A design whose first round failed has no conversation yet; its next round opens one.
  const skills = state.conversation === null ? superpowersSkills() : null
  if (state.conversation === null && !skills) return unavailable('superpowers')
  const quotaBefore = readQuota(adapter, state.group)
  return runRound({ mainRoot, state, config, harness, adapter, input, quotaBefore, skills })
}

function end(args) {
  const [id] = args
  const { mainRoot } = repoPaths(process.cwd())
  if (!run.isRunId(id)) return noOpenDesign(id)
  const dir = designDir(mainRoot, id)
  if (!fs.existsSync(dir)) return noOpenDesign(id)
  lanes.killGroup(path.join(dir, 'pid'), `design/${id}`)
  fs.rmSync(dir, { recursive: true, force: true })
  return answer(0, { ended: id })
}

function list() {
  const { mainRoot } = repoPaths(process.cwd())
  const root = designsDir(mainRoot)
  const ids = fs.existsSync(root) ? fs.readdirSync(root).filter((name) => run.isRunId(name)).sort() : []
  const designs = []
  for (const id of ids) {
    const state = readState(mainRoot, id)
    if (!state) continue
    const { session, cwd, conversation, status, rounds } = state
    designs.push({ id, session, cwd, conversation, status, rounds: Array.isArray(rounds) ? rounds.length : 0 })
  }
  return answer(0, { designs })
}

async function main(args, { input = '' } = {}) {
  const [verb, ...rest] = args
  if (verb === 'start') return start(rest, input)
  if (verb === 'reply') return reply(rest, input)
  if (verb === 'end') return end(rest)
  if (verb === 'list') return list()
  throw new Error(USAGE)
}

module.exports = { main }
