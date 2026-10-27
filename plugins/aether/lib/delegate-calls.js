'use strict'

// A read-only delegate of the Lead on agy, grok or muse, outside a run: one call of the harness's CLI, with the model
// and the native effort of the pair the router chose, in a disposable worktree of the current commit. It is judged from
// outside, as a design seat's round is (lib/seats.js): anything the delegate changed undoes its answer, and the
// worktree is removed whatever happens. A checkout with uncommitted work is not delegated at all (the copy would
// answer about older code). This module writes no log entry and no quota mark: the bin does.
// Family: delegate.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { isObject, killGroup, nulEntries, readTextOrEmpty, removeWorktree } = require('./common.js')
const { git, repoPaths } = require('./git.js')
const run = require('./run.js')
const lanes = require('./lanes.js')
const { readGroups } = require('./lane-readings.js')
const { createAdapter } = require('./harness/index.js')
const { WORKDIR_RULE } = require('./lane-calls.js')
const { KILL_GRACE_SECONDS, cliSeconds } = require('./delegate-limits.js')
const { refusalIn } = require('./quota-refusal.js')

// The harnesses a delegate may run on (R19): codex and cursor are not among them.
const HARNESSES = ['agy', 'grok', 'muse']
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP']
// What a delegate may leave in its worktree without breaking its rule: the temporary files of its tools.
const TMP_DIR = '.aether-tmp/'

const DELEGATE_SCHEMA = { type: 'object', required: ['answer'], additionalProperties: false, properties: { answer: { type: 'string' } } }

// What the note below asks of every delegate: the number of tool calls (every read and search counts) it may spend before
// it answers. Grok 4.7 at high made 33 to 42 of them on single-file audits and was still working when the CLI limit
// killed it; its lookups, which end by themselves, took 12 to 60 s (issue 035).
const DELEGATE_TOOL_BUDGET = 20

const DELEGATE_NOTE = [
  '## You run as a read-only delegate',
  '',
  'The current directory is a disposable copy of the repository. Your work is read-only: read files and run read-only commands such as `git log` or `grep`, but never change, create or delete a file, and never commit; any change undoes your answer.',
  WORKDIR_RULE,
  `You have a few minutes, not an open-ended search: use at most about ${DELEGATE_TOOL_BUDGET} tool calls (every read and search counts), then stop and answer with the best you have, saying in the answer what you did not check.`,
  'Answer with one JSON object that matches this schema, and nothing else: {"answer": "<string>"}, where answer holds everything you found.',
].join('\n')

const NO_USAGE = { input: 0, output: 0, thinking: 0, cacheRead: 0 }

function hasBalance(window) {
  return isObject(window) && typeof window.remaining === 'number' && Number.isFinite(window.remaining)
}

// What each window lost between two readings of one group: only windows with a balance in both readings and the
// same reset time, since a window that reset in between was refilled and its drop measures nothing.
function quotaSpent(before, after) {
  if (!isObject(before?.windows) || !isObject(after?.windows)) return []
  const spent = []
  for (const [window, a] of Object.entries(before.windows)) {
    const b = after.windows[window]
    if (!hasBalance(a) || !hasBalance(b) || a.resetsAt !== b.resetsAt) continue
    spent.push({ window, fraction: Math.round(Math.max(0, a.remaining - b.remaining) * 1e4) / 1e4 })
  }
  return spent
}

// The CLI's argv for a rung. The rung's effort is the harness's native name and reaches the CLI as it is: the
// levels of the lane table, which translate the swarm's efforts, are never read (R16).
function delegateArgv(adapter, rung, { schemaFile, timeoutSeconds, prompt }) {
  return adapter.argv({ model: rung.model, level: rung.effort, schemaFile, timeoutSeconds, prompt })
}

function answerSection() {
  return ['## Your answer', 'End your answer with one JSON object that matches this schema, and nothing after it:', `\`\`\`json\n${JSON.stringify(DELEGATE_SCHEMA, null, 2)}\n\`\`\``].join('\n\n')
}

function delegatePrompt(adapter, task) {
  const prompt = `${DELEGATE_NOTE}\n\nTask: ${task.description}\n\n${task.prompt}`
  return adapter.schemaInPrompt === true ? `${prompt}\n\n${answerSection()}` : prompt
}

// ---- The worktree ----

function nulList(args, cwd) {
  return nulEntries(git(args, cwd, { raw: true }).stdout)
}

// What the delegate changed in its worktree: files committed since start, and files changed or new (not ignored)
// outside .aether-tmp/; and whether HEAD moved.
function worktreeChanges(worktree, start) {
  const head = git(['rev-parse', 'HEAD'], worktree).stdout
  const files = new Set()
  if (head !== start) for (const file of nulList(['diff', '--name-only', '--no-renames', '-z', start, head], worktree)) files.add(file)
  for (const entry of nulList(['status', '--porcelain', '-z', '--untracked-files=all', '--no-renames'], worktree)) {
    const file = entry.slice(3)
    if (!file.startsWith(TMP_DIR)) files.add(file)
  }
  return { files: [...files].sort(), head, moved: head !== start }
}

// The paths of the checkout that are not committed: changed, staged or new (not ignored). The disposable copy is
// built from HEAD, so it has none of them. --no-optional-locks keeps this read from touching the index of a
// checkout the Lead is editing.
function uncommittedPaths(top) {
  return nulList(['--no-optional-locks', 'status', '--porcelain', '-z', '--no-renames'], top).map((entry) => entry.slice(3))
}

const NAMED_CHANGES = 5

function dirtyDetail(files) {
  const named = files.slice(0, NAMED_CHANGES).join(', ')
  const rest = files.length > NAMED_CHANGES ? ` and ${files.length - NAMED_CHANGES} more` : ''
  return `the checkout has uncommitted changes (${named}${rest}): the disposable copy is built from the last commit and would not see them, so the delegate would answer about older code`
}

// ---- Running the CLI ----

// Runs argv in cwd to its end, in a group of its own, killing the group when it outlives the timeout and its grace.
// Resolves to its exit code. `limit.killed` is set when it was the kill timer that ended the process, so that the caller
// can tell a call that ran out of time from one that failed by itself.
function runCli(argv, { cwd, marker, stdoutFile, stderrFile, timeoutSeconds, graceSeconds, limit, onSpawn }) {
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
      timer = setTimeout(() => {
        limit.killed = true
        killGroup(child.pid)
      }, (timeoutSeconds + graceSeconds) * 1000)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve(code ?? 128 + (os.constants.signals[signal] || 0))
    })
  })
}

// ---- A delegate ----

function usageOf(usage) {
  if (!isObject(usage)) return { ...NO_USAGE }
  const count = (key) => (Number.isFinite(usage[key]) ? usage[key] : 0)
  return { input: count('input'), output: count('output'), thinking: count('thinking'), cacheRead: count('cacheRead') }
}

// One read-only delegate of the task on the rung, in a disposable worktree of cwd's HEAD. Resolves to its Outcome,
// whose status is ok, quota, failed, violation, unavailable (nothing launched) or dirty (the checkout has uncommitted
// work; nothing launched, no quota read); a violation also has `changed`, the files it touched. It throws only for an
// id that is not a plain name. maxCliSeconds, when it is given, caps the CLI's limit below what the harness's settings allow: a later attempt of a delegate has only the time
// the earlier ones left (lib/delegate-chain.js). graceSeconds is the grace before the kill; only a test shortens it.
// `timedOut` says the call was killed at its limit: such a call is `failed`, never `quota` (it says nothing of the
// quota), and the router keeps its pair out of the choice for a while (lib/router-slow.js).
async function runDelegate({ cwd, id, harness, rung, task, config, dataDir, adapter = null, now = Date.now, maxCliSeconds = null, graceSeconds = KILL_GRACE_SECONDS }) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`the delegate id must be a plain name (${ID}), not ${JSON.stringify(id)}`)
  const startedAt = now()
  let modelArg = rung.model
  const settings = config?.harnesses?.[harness]
  const outcome = (status, fields = {}) => ({
    status,
    text: '',
    detail: '',
    harness,
    modelArg,
    durationMs: now() - startedAt,
    usage: { ...NO_USAGE },
    quotaBefore: null,
    quotaAfter: null,
    quotaSpent: [],
    timedOut: false,
    ...fields,
  })

  // 1. Nothing is launched for a harness that is not a delegate's, not in the table, without the model, or not installed.
  if (!HARNESSES.includes(harness)) return outcome('unavailable', { detail: `${harness} cannot run a delegate: only ${HARNESSES.join(' and ')} can` })
  if (!isObject(settings)) return outcome('unavailable', { detail: `${harness} is not in the lane table` })
  if (!isObject(settings.models) || !Object.hasOwn(settings.models, rung.model)) return outcome('unavailable', { detail: `${harness} has no model ${rung.model}` })
  let cli = adapter
  try {
    cli ??= createAdapter(harness, settings)
  } catch (err) {
    return outcome('unavailable', { detail: err.message })
  }
  if (typeof cli.modelArg === 'function') modelArg = cli.modelArg({ model: rung.model, level: rung.effort })
  if (!cli.installed()) return outcome('unavailable', { detail: `${harness} is not installed` })

  // 2. The checkout is committed. This comes before anything is read or launched: the Lead edits before it delegates,
  // and a copy of HEAD would not hold those edits.
  let paths
  try {
    paths = repoPaths(cwd)
  } catch (err) {
    return outcome('failed', { detail: `delegate: ${err.message}` })
  }
  const { worktree: top, mainRoot, gitCommonDir } = paths
  try {
    // Aether's own directories (a delegate going on at the same time has one in .aether/) are not the Lead's work.
    run.ensureExcluded(gitCommonDir)
  } catch {
    // If git does not ignore them, they show below as changes, and the delegate runs on Claude.
  }
  let uncommitted
  try {
    uncommitted = uncommittedPaths(top)
  } catch (err) {
    return outcome('failed', { detail: `delegate: ${err.message}` })
  }
  if (uncommitted.length > 0) return outcome('dirty', { detail: dirtyDetail(uncommitted) })

  // 3. The quota before, served from the saved reading while it holds.
  let quotaBefore = null
  try {
    quotaBefore = readGroups(cli, { harness, settings, dataDir, now: now() }).groups[rung.group] ?? null
  } catch {
    // An unreadable quota leaves no reading, which is not usable.
  }
  if (!lanes.usable(quotaBefore, config.reserve)) {
    const detail = quotaBefore === null ? `the quota of ${harness} group ${rung.group} cannot be read` : `${harness} group ${rung.group} is at or under the reserve`
    return outcome('quota', { detail, quotaBefore })
  }

  // 4. The disposable worktree, the schema and the prompt.
  const dir = path.join(run.aetherDir(mainRoot), 'delegates', id)
  const worktree = path.join(dir, 'wt')
  const marker = `delegate/${id}`
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  try {
    fs.mkdirSync(dir)
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
    return outcome('failed', { detail: `${dir} already exists: another delegate has the id ${id}`, quotaBefore })
  }

  let child = null
  const cleanUp = () => {
    if (child !== null) killGroup(child)
    if (child !== null) lanes.killMarked(marker)
    removeWorktree(mainRoot, worktree)
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const onSignal = (signal) => {
    cleanUp()
    process.exit(128 + (os.constants.signals[signal] || 15))
  }
  for (const signal of SIGNALS) process.on(signal, onSignal)

  let result
  let usage = { ...NO_USAGE }
  let quotaAfter = null
  const limit = { killed: false }
  let timeoutSeconds = null
  try {
    const start = git(['rev-parse', 'HEAD'], top).stdout
    git(['worktree', 'add', '-q', '--detach', worktree, start], top)
    const schemaFile = path.join(dir, 'schema.json')
    fs.writeFileSync(schemaFile, `${JSON.stringify(DELEGATE_SCHEMA, null, 2)}\n`)
    timeoutSeconds = Number.isFinite(maxCliSeconds) && maxCliSeconds > 0 ? Math.min(cliSeconds(settings), maxCliSeconds) : cliSeconds(settings)
    const argv = delegateArgv(cli, rung, { schemaFile, timeoutSeconds, prompt: delegatePrompt(cli, task) })

    // 5. The CLI, in its own process group, with an environment clean of credentials.
    const stdoutFile = path.join(dir, 'stdout')
    const stderrFile = path.join(dir, 'stderr')
    const exitCode = await runCli(argv, {
      cwd: worktree,
      marker,
      stdoutFile,
      stderrFile,
      timeoutSeconds,
      graceSeconds,
      limit,
      onSpawn: (pid) => {
        child = pid
      },
    })
    killGroup(child)
    lanes.killMarked(marker)

    // 6. The quota after, read anew so the saved reading is renewed; then the verdict.
    let quotaRead = false
    try {
      quotaAfter = readGroups(cli, { harness, settings, dataDir, now: now(), fresh: true }).groups[rung.group] ?? null
      quotaRead = true
    } catch {
      // An unreadable quota is an infrastructure failure, not a verdict on the quota.
    }
    const parsed = cli.parse({ stdout: readTextOrEmpty(stdoutFile), stderr: readTextOrEmpty(stderrFile), exitCode }, { required: DELEGATE_SCHEMA.required })
    usage = usageOf(parsed.usage)
    const changes = worktreeChanges(worktree, start)
    if (changes.files.length > 0 || changes.moved) {
      const what = changes.files.length > 0 ? `changed ${changes.files.join(', ')}` : `moved HEAD from ${start} to ${changes.head}`
      result = { status: 'violation', detail: `the read-only delegate ${what}`, changed: changes.files }
    } else if (limit.killed) {
      // Killed at its limit: its output is cut, and what the quota reads afterwards is not the call's verdict.
      result = { status: 'failed', detail: `ran out of time: killed at ${timeoutSeconds + graceSeconds} s, exit ${exitCode}` }
    } else if (!parsed.clean) {
      // An explicit refusal is the quota's verdict even when both readings still show balance (agy's /usage does not
      // report its individual limits), so the router can tell it from a failure and try the next candidate.
      const quotaGone = (quotaRead && !lanes.usable(quotaAfter, config.reserve)) || String(parsed.reason).startsWith('quota: ') || refusalIn(parsed.reason) !== null
      result = { status: quotaGone ? 'quota' : 'failed', detail: parsed.reason }
    } else if (typeof parsed.structured?.answer !== 'string') {
      result = { status: 'failed', detail: 'invalid answer: answer is not a string' }
    } else {
      result = { status: 'ok', text: parsed.structured.answer }
    }
  } catch (err) {
    result = { status: 'failed', detail: `delegate: ${err.message}` }
  } finally {
    // 7. Always: no process, no worktree and no temporary file outlives the delegate.
    cleanUp()
    for (const signal of SIGNALS) process.removeListener(signal, onSignal)
  }

  return outcome(result.status, {
    text: result.status === 'ok' ? result.text : '',
    detail: result.detail ?? '',
    usage,
    quotaBefore,
    quotaAfter,
    quotaSpent: quotaSpent(quotaBefore, quotaAfter),
    timedOut: limit.killed,
    ...(result.status === 'violation' ? { changed: result.changed } : {}),
  })
}

module.exports = { DELEGATE_SCHEMA, DELEGATE_NOTE, DELEGATE_TOOL_BUDGET, quotaSpent, delegateArgv, runDelegate }
