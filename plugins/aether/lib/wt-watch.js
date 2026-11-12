'use strict'

// The watch a Lead leaves running beside a swarm run. It ends when a unit of the run is stuck and
// unattended, when the run leaves its end mark, or when the run shows no sign of life past its
// silence cap. It writes nothing and touches no branch.
// Family: wt.

const fs = require('node:fs')
const path = require('node:path')
const { repoPaths } = require('./git.js')
const run = require('./run.js')
const { loadSwarmConfig } = require('./wt-config.js')

const DEFAULT_INTERVAL_SECONDS = 5

function parseInterval(value) {
  const seconds = typeof value === 'string' ? Number(value) : value
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('--interval must be a number of seconds above 0')
  }
  return seconds
}

function parseSilence(value) {
  const seconds = typeof value === 'string' ? Number(value) : value
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1) {
    throw new Error('--silence must be a whole number of seconds from 1')
  }
  return seconds
}

// The newest modification time under the run directory, files and folders alike, without following
// links. The heartbeat counts as a sign of life, since every pause of the stuck wait writes it.
function newestWriteMs(dir) {
  let newest = -Infinity
  const pending = [dir]
  while (pending.length > 0) {
    const current = pending.pop()
    let stat
    try {
      stat = fs.lstatSync(current)
    } catch {
      continue // gone since it was listed
    }
    if (stat.mtimeMs > newest) newest = stat.mtimeMs
    if (!stat.isDirectory()) continue
    let names
    try {
      names = fs.readdirSync(current)
    } catch {
      continue // unreadable or gone: nothing more to learn from it
    }
    for (const name of names) pending.push(path.join(current, name))
  }
  return newest
}

function taskNumber(taskId) {
  return Number(String(taskId).slice('task-'.length))
}

// Every stuck record of the run, in task number order. A file that cannot be read is skipped: a
// half-written record must not stop the watch.
function readStuckRecords(mainRoot, runId) {
  const dir = run.stuckDir(mainRoot, runId)
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const records = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    let record
    try {
      record = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
    } catch {
      continue
    }
    if (!record || typeof record !== 'object' || typeof record.task !== 'string') continue
    records.push(record)
  }
  records.sort((a, b) => taskNumber(a.task) - taskNumber(b.task))
  return records
}

function endedMessage(records) {
  if (records.length === 0) return 'nada se trabó'
  if (records.length === 1) return 'hubo 1 unidad trabada'
  return `hubo ${records.length} unidades trabadas`
}

// Polls the run until a waiting unit, the end mark or the silence cap ends the watch.
// interval counts the seconds between polls (a number or a numeric text above 0, default 5);
// silence counts the seconds without a sign of life that end the watch as silent (a whole number
// or a whole-number text from 1, default loadSwarmConfig().watchSilenceSeconds). sleep(ms) and
// now() are injected by the tests (default setTimeout and Date.now).
async function watchCommand(cwd, runId, { interval, silence, sleep, now } = {}) {
  const intervalSeconds = interval === undefined || interval === null ? DEFAULT_INTERVAL_SECONDS : parseInterval(interval)
  const silenceCap = silence === undefined || silence === null ? loadSwarmConfig().watchSilenceSeconds : parseSilence(silence)
  const wait = typeof sleep === 'function' ? sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const clock = typeof now === 'function' ? now : () => Date.now()
  const { mainRoot } = repoPaths(cwd)
  const dir = run.runDir(mainRoot, runId)
  if (!fs.existsSync(dir)) throw new Error(`run ${runId} not found`)
  const endFile = run.launchEndFile(mainRoot, runId)
  for (;;) {
    const silentSeconds = (clock() - newestWriteMs(dir)) / 1000
    const silent = silentSeconds > silenceCap
    if (!silent) {
      const waiting = readStuckRecords(mainRoot, runId).filter((record) => record.state === 'waiting')
      if (waiting.length > 0) {
        const found = waiting[0]
        return {
          watch: 'stuck',
          run: runId,
          task: found.task,
          reason: found.reason,
          branch: found.branch,
          worktree: found.worktree,
          head: found.head,
          outside: found.outside,
          left: found.left,
        }
      }
    }
    if (fs.existsSync(endFile)) {
      const records = readStuckRecords(mainRoot, runId)
      const stuck = records.map((record) => {
        const outcome = record.ended && typeof record.ended.outcome === 'string' && record.ended.outcome !== ''
          ? record.ended.outcome
          : record.state
        return { task: record.task, outcome }
      })
      return { watch: 'ended', run: runId, stuck, message: endedMessage(records) }
    }
    // A unit left waiting by a run that died is a dead flow nobody will attend: each pause of the
    // stuck wait writes the heartbeat, so a silent run reports silence, not a stuck unit.
    if (silent) return { watch: 'silent', run: runId, message: 'sin señal de la corrida', silentSeconds }
    await wait(intervalSeconds * 1000)
  }
}

module.exports = { watchCommand }
