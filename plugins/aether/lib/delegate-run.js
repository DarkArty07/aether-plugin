'use strict'

// Launching, running and waiting for one delegate attempt that runs on an external pair. `start` launches `run` in a
// process of its own, detached from the mod's hook, and returns at once; `run` (runTask) reads the external file that
// `begin` wrote (lib/delegate-task.js) and does the work: an editing task through `aether-lane delegate`
// (lib/lane-delegate.js), which comes back as a unit branch with its tests and a review by another pair; a read-only
// task through the chain of read-only delegates (lib/delegate-chain.js). It writes the result where `wait` finds it,
// `<dataDir>/delegates/results/<id>.json`, and a `result` entry in the delegate log. `wait` polls for that file. Nothing
// here merges, pushes or writes in the Lead's checkout: the Lead judges the attempt with `aether-delegate verdict` and
// merges with aether-wt.

const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const log = require('./delegate-log.js')
const checksLib = require('./delegate-checks.js')
const delegateChain = require('./delegate-chain.js')
const laneDelegate = require('./lane-delegate.js')
const lanes = require('./lanes.js')
const { readDelegateSettings } = require('./session.js')

const BIN = path.join(__dirname, '..', 'bin', 'aether-delegate')
const ID = /^[A-Za-z0-9_-]+$/
const POLL_MS = 250
// The longest single wait: under the engine's limit on one step, so the mod asks again rather than being cut off.
const MAX_WAIT_SECONDS = 540

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const messageOf = (err) => (err && typeof err.message === 'string' && err.message ? err.message : String(err))

// ---- the files of a launch ----

const delegatesDir = (dataDir) => path.join(dataDir, 'delegates')
const externalFile = (dataDir, id) => path.join(delegatesDir(dataDir), 'external', `${id}.json`)
const resultFile = (dataDir, id) => path.join(delegatesDir(dataDir), 'results', `${id}.json`)
const runFile = (dataDir, id) => path.join(delegatesDir(dataDir), 'run', `${id}.json`)
const runLog = (dataDir, id) => path.join(delegatesDir(dataDir), 'run', `${id}.log`)

function assertId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`the delegate id must be letters, digits, - and _, not ${JSON.stringify(id)}`)
}

let writeCounter = 0

// Written whole or not at all: `wait` reads these files while `run` writes them.
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${++writeCounter}.tmp`
  try {
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

function readJson(file) {
  try {
    return { found: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch (err) {
    return { found: err.code !== 'ENOENT', value: null }
  }
}

// ---- start ----

// Launches `node <binPath> run --id <id>` in cwd, detached, with its output in run/<id>.log, and records its pid in
// run/<id>.json. The earlier result of the id is removed first, so that `wait` never reads it as this one's.
function start({ id, cwd, dataDir }, { spawn = childProcess.spawn, binPath = BIN } = {}) {
  assertId(id)
  fs.rmSync(resultFile(dataDir, id), { force: true })
  const logPath = runLog(dataDir, id)
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  const out = fs.openSync(logPath, 'a')
  let child
  try {
    child = spawn(process.execPath, [binPath, 'run', '--id', id], {
      cwd,
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...process.env, AETHER_DATA_DIR: dataDir },
    })
  } finally {
    fs.closeSync(out)
  }
  if (typeof child.on === 'function') child.on('error', () => {})
  child.unref()
  if (!Number.isInteger(child.pid)) throw new Error(`the run of delegate ${id} did not start`)
  writeAtomic(runFile(dataDir, id), `${JSON.stringify({ pid: child.pid, startedAt: Date.now() })}\n`)
  return { started: true, id, pid: child.pid }
}

// ---- run ----

const pairIdOf = ({ harness, model, effort }) => `${harness}/${model}@${effort}`

function pairOf(pair) {
  if (!isObject(pair)) return null
  const { harness, model, effort } = pair
  return { id: isText(pair.id) ? pair.id : pairIdOf(pair), harness, model, effort }
}

function judgeLine(id) {
  return `Judge it: aether-delegate verdict --task ${id} --verdict approve|fix|infeasible`
}

function checksLine(checks) {
  if (!checks) return 'Checks: none'
  return checks.ok ? 'Checks: pass' : `Checks: FAIL (${checks.reasons.join('; ')})`
}

function testsLine(tests) {
  if (!isObject(tests)) return 'Tests: none were given'
  if (tests.timedOut) return `Tests: ${tests.command} timed out`
  return `Tests: ${tests.command} ${tests.passed ? 'passed' : `failed (exit ${tests.exitCode})`}`
}

function reviewLines(review) {
  if (!isObject(review)) return ['Review: none']
  if (review.status !== 'done') return [`Review: ${review.status === 'none' ? `none (${review.cause ?? 'no pair'})` : 'no verdict from the pairs tried'}`]
  const by = pairOf(review.pair)
  const lines = [`Review by ${by ? by.id : 'another pair'}: ${review.verdict}${isText(review.summary) ? ` (${review.summary})` : ''}`]
  for (const finding of Array.isArray(review.findings) ? review.findings : []) {
    lines.push(`- ${typeof finding === 'string' ? finding : JSON.stringify(finding)}`)
  }
  return lines
}

// The `findings` the lane command reads as a file: the external file holds them as lines, or already as a file.
function findingsFile(dataDir, external) {
  if (typeof external.findings === 'string' && external.findings !== '') return external.findings
  if (!Array.isArray(external.findings) || external.findings.length === 0) return null
  const file = path.join(delegatesDir(dataDir), 'in', `${external.id}-${external.attempt}-findings.md`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${external.findings.join('\n')}\n`)
  return file
}

// The earlier work a correction or a rise starts from: the patch of the task's latest result, when `carry` is on.
function carryFile(dataDir, external) {
  if (typeof external.carry === 'string' && external.carry !== '') return external.carry
  if (external.carry !== true) return null
  const results = log.readEntries(dataDir, { task: external.id }).filter((entry) => entry.kind === 'result' && entry.task === external.id && isText(entry.patch))
  for (let i = results.length - 1; i >= 0; i--) if (fs.existsSync(results[i].patch)) return results[i].patch
  return null
}

// The delegate's work as one patch: what it committed since base and what it left uncommitted, new files included. A
// throwaway index holds the snapshot, so the worktree's own index is not touched.
function savePatch(worktree, base, file) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-patch-'))
  try {
    const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, 'index') }
    const git = (args) => {
      const r = childProcess.spawnSync('git', args, { cwd: worktree, env, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
      if (r.error) throw r.error
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.toString('utf8').trim()}`)
      return r.stdout
    }
    git(['read-tree', 'HEAD'])
    git(['add', '-A'])
    const patch = git(['diff', '--cached', '--binary', '--no-renames', base || 'HEAD'])
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, patch)
    return file
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

function editsChecks(worktree, base, owns, tests) {
  try {
    return checksLib.checkEdits({ files: checksLib.changedFiles(worktree, base), owns, tests })
  } catch (err) {
    const testStatus = isObject(tests) && typeof tests.passed === 'boolean' ? (tests.passed ? 'pass' : 'fail') : 'none'
    return { kind: 'edits', ok: false, empty: false, outside: [], tests: testStatus, reasons: [`the worktree ${worktree} cannot be read: ${messageOf(err)}`] }
  }
}

function editsText(external, done, checks, patch) {
  const pair = pairOf(done.pair)
  return [
    `Aether delegate task ${external.id}, attempt ${external.attempt} (step ${external.step}): the work of ${pair ? `${pair.model} at ${pair.effort} on ${pair.harness} (pair ${pair.id})` : 'an external pair'}.`,
    `Branch: ${done.branch} at ${done.head}, in the worktree ${done.worktree}, from base ${done.base}.`,
    ...(isText(done.summary) ? [`Summary: ${done.summary}`] : []),
    testsLine(done.tests),
    ...reviewLines(done.review),
    checksLine(checks),
    ...(patch ? [`Patch: ${patch}`] : []),
    `Merge it, once approved: ${done.merge}`,
    judgeLine(external.id),
  ].join('\n')
}

async function runEdits(external, { cwd, dataDir }, delegateCommand) {
  const flags = { brief: external.brief, model: external.step, effort: external.effort, owns: external.owns.join(',') }
  if (isText(external.tests)) flags.tests = external.tests
  if (isText(external.session)) flags.session = external.session
  if (isText(external.pin)) flags.pair = external.pin
  const carry = carryFile(dataDir, external)
  if (carry) flags.carry = carry
  const findings = findingsFile(dataDir, external)
  if (findings) flags.findings = findings
  // This process was started detached by `start`, without the Lead's Bash environment, so the lane gate would read no
  // switch and no harnesses. The session's delegate file has them: with lanes on, the command gets them in its environment.
  const settings = readDelegateSettings(dataDir, external.session)
  const deps = settings && settings.lanes === true ? { env: { ...process.env, AETHER_SUPERDELEGATION: 'on', AETHER_LANE_HARNESSES: settings.harnesses.join(',') } } : undefined

  let done
  try {
    done = await delegateCommand(cwd, flags, deps)
  } catch (err) {
    done = { status: 'failed', reason: messageOf(err) }
  }
  if (!isObject(done) || done.status !== 'done') {
    const status = isObject(done) && isText(done.status) ? done.status : 'failed'
    return { result: { ok: false, status, text: null, checks: null }, entry: { pair: null, branch: null, worktree: null, base: null, head: null, patch: null, answer: null, review: null } }
  }
  const checks = editsChecks(done.worktree, done.base, external.owns, done.tests)
  let patch = null
  try {
    patch = savePatch(done.worktree, done.base, path.join(delegatesDir(dataDir), 'patches', `${external.id}-${external.attempt}.patch`))
  } catch {
    // A patch that cannot be saved costs a later correction its starting point, not this attempt its result.
  }
  return {
    result: { ok: true, status: 'done', text: editsText(external, done, checks, patch), checks },
    entry: { pair: pairOf(done.pair), branch: done.branch ?? null, worktree: done.worktree ?? null, base: done.base ?? null, head: done.head ?? null, patch, answer: null, review: done.review ?? null },
  }
}

async function runReadOnly(external, { cwd, dataDir }, runChain) {
  const config = lanes.loadConfig()
  const chain = await runChain({ cwd, id: external.id, session: external.session ?? null, external, config, dataDir })
  const last = Array.isArray(chain.attempts) && chain.attempts.length > 0 ? chain.attempts[chain.attempts.length - 1] : null
  const pair = last ? pairOf(last) : null
  const changed = Array.isArray(chain.changed) ? chain.changed : []
  const none = { pair, branch: null, worktree: null, base: null, head: null, patch: null, answer: null, review: null }
  if (chain.status === 'violation') {
    const checks = checksLib.checkReadOnly({ files: changed })
    return { result: { ok: false, status: 'violation', text: null, checks }, entry: none }
  }
  if (!chain.ok) return { result: { ok: false, status: chain.status ?? 'failed', text: null, checks: null }, entry: none }
  const answer = typeof chain.text === 'string' ? chain.text : ''
  const checks = checksLib.checkReadOnly({ answer, files: changed })
  const answerPath = path.join(delegatesDir(dataDir), 'answers', `${external.id}-${external.attempt}.md`)
  let saved = null
  try {
    fs.mkdirSync(path.dirname(answerPath), { recursive: true })
    fs.writeFileSync(answerPath, answer)
    saved = answerPath
  } catch {
    // The Lead still reads the answer in the text.
  }
  const text = [chain.attribution, '', answer, '', checksLine(checks), judgeLine(external.id)].filter((part) => part !== null && part !== undefined).join('\n')
  return { result: { ok: true, status: chain.status ?? 'ok', text, checks }, entry: { ...none, answer: saved } }
}

// Runs the attempt the external file of `id` describes, and writes its result to results/<id>.json and to the log. The
// editing path writes no `outcome`: `aether-lane delegate` records its calls in the lane log, which the spend already
// reads. Resolves to the Result; never rejects.
async function runTask({ id, cwd, dataDir, now = Date.now }, { delegateCommand = laneDelegate.delegateCommand, runChain = delegateChain.runChain } = {}) {
  let attempt = null
  let session = null
  let outcome
  try {
    assertId(id)
    const read = readJson(externalFile(dataDir, id))
    const external = isObject(read.value) ? { ...read.value, id } : null
    if (!external) {
      outcome = { result: { ok: false, status: 'unavailable', text: null, checks: null }, entry: {} }
    } else {
      attempt = Number.isInteger(external.attempt) ? external.attempt : null
      session = isText(external.session) ? external.session : null
      external.owns = Array.isArray(external.owns) ? external.owns : []
      outcome = external.edits ? await runEdits(external, { cwd, dataDir }, delegateCommand) : await runReadOnly(external, { cwd, dataDir }, runChain)
    }
  } catch (err) {
    // Under `start`, stderr is the run's log (run/<id>.log): the reason stays there.
    process.stderr.write(`aether-delegate run ${id}: ${messageOf(err)}\n`)
    outcome = { result: { ok: false, status: 'failed', text: null, checks: null }, entry: {} }
  }
  const result = { ...outcome.result, attempt }
  const empty = { pair: null, branch: null, worktree: null, base: null, head: null, patch: null, answer: null, review: null }
  log.appendEntry(dataDir, { kind: 'result', time: now(), session, task: id, attempt, ok: result.ok, status: result.status, ...empty, ...outcome.entry, checks: result.checks })
  try {
    if (typeof id === 'string' && ID.test(id)) writeAtomic(resultFile(dataDir, id), `${JSON.stringify(result)}\n`)
  } catch {
    // `wait` reports the run as died once its process is gone.
  }
  return result
}

// ---- answer ----

// Records the final answer of a read-only delegate that ran on Claude, as the mod saw it. Never throws.
function recordAnswer({ task, attempt, text, session, dataDir, now = Date.now }) {
  try {
    const recorded = log.appendEntry(dataDir, { kind: 'answer', time: now(), session: session ?? null, task, attempt, text: typeof text === 'string' ? text : '' })
    return { recorded }
  } catch {
    return { recorded: false }
  }
}

// ---- wait ----

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function finished(read) {
  const value = isObject(read.value) ? read.value : {}
  return { done: true, ok: value.ok === true, status: isText(value.status) ? value.status : 'failed', text: typeof value.text === 'string' ? value.text : null }
}

// Polls for the result of `id` for up to `seconds` (at most MAX_WAIT_SECONDS). A run whose process is gone without a
// result died; an id with neither a run nor a result was never started here.
async function wait({ id, dataDir, seconds, now = Date.now, sleep = realSleep, alive = pidAlive }) {
  assertId(id)
  const limit = Math.min(Math.max(Number(seconds) || 0, 0), MAX_WAIT_SECONDS) * 1000
  const deadline = now() + limit
  for (;;) {
    const result = readJson(resultFile(dataDir, id))
    if (isObject(result.value)) return finished(result)
    const run = readJson(runFile(dataDir, id))
    if (!run.found) return { done: true, ok: false, status: 'unknown', text: null }
    const pid = isObject(run.value) ? run.value.pid : null
    if (!Number.isInteger(pid)) return { done: true, ok: false, status: 'unknown', text: null }
    if (!alive(pid)) {
      // The result may have landed between the two reads.
      const late = readJson(resultFile(dataDir, id))
      return isObject(late.value) ? finished(late) : { done: true, ok: false, status: 'died', text: null }
    }
    const left = deadline - now()
    if (left <= 0) return { done: false }
    await sleep(Math.min(POLL_MS, left))
  }
}

module.exports = { MAX_WAIT_SECONDS, start, runTask, recordAnswer, wait }
