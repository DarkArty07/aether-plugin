'use strict'

// The delegates report (R17): what `aether-report --delegates` prints. One row per task of the delegate log
// (lib/delegate-log.js) for the rows the /harnesses panel draws; and, per step of config/ladder.json, how the delegates
// of the log went. The ladder counts come from the log alone.
// Family: delegate.

const run = require('./run.js')
const { isObject } = require('./common.js')
const { isLaunch, readAllEntries } = require('./delegate-log.js')
const { loadLadder } = require('./ladder.js')

const CAUSES = ['exhausted', 'repeated', 'infeasible']

const last = (list) => list[list.length - 1]

// Where a task of the log ran, by what came after its latest launch (an earlier attempt's pair says nothing of a later
// one that ran on Claude). A read-only external attempt writes `outcome` entries; one that ended ok ran on its pair. An
// editing one writes only a `result`, whose `pair` says where it ran. An external attempt that did not end ok was rerun
// on Claude (the step's model, the launch's effort) and the row says why in `fallback`; a launch with neither ran on
// Claude, rewritten.
function rowOfTask(id, entries) {
  const launches = entries.filter(isLaunch)
  const first = launches[0]
  const latest = last(launches)
  const since = (entry) => entry.time >= latest.time
  const outcomes = entries.filter((e) => e.kind === 'outcome' && since(e))
  const results = entries.filter((e) => e.kind === 'result' && since(e))
  const outcome = outcomes.length > 0 ? last(outcomes) : null
  const result = outcome === null && results.length > 0 ? last(results) : null
  const onClaude = { harness: 'claude', model: latest.step, effort: latest.effort ?? null }
  let ranOn = onClaude
  let status = 'ok'
  if (outcome) {
    status = outcome.status
    if (status === 'ok') ranOn = { harness: outcome.harness, model: outcome.model, effort: outcome.effort }
  } else if (result) {
    status = result.ok === true && result.pair ? 'ok' : result.status || 'failed'
    if (status === 'ok') ranOn = { harness: result.pair.harness, model: result.pair.model, effort: result.pair.effort }
  }
  const external = outcome !== null || result !== null
  const row = {
    id,
    time: first.time,
    session: first.session,
    description: first.description,
    applied: external ? 'external' : 'rewritten',
    ranOn,
    fallback: external && status !== 'ok' ? `external ${status}` : null,
    step: latest.step,
    attempts: launches.length,
    unverdicted: isUnverdictedTask(entries),
  }
  // A task the owner placed on a model (spec 021) says so; no other row has the key.
  if (isObject(first.authorized)) row.authorized = { model: first.authorized.model, scope: first.authorized.scope }
  return row
}

// Two sessions may use the same task id (issue 148): a task is its session and its id.
const taskKey = (session, id) => `${session ?? ''}\u0000${id}`

function isUnverdictedTask(entries) {
  const latest = last(entries.filter(isLaunch))
  const after = entries.slice(entries.lastIndexOf(latest) + 1).filter((entry) => entry.time >= latest.time)
  return after.some((entry) => ['result', 'answer', 'outcome'].includes(entry.kind)) &&
    !after.some((entry) => entry.kind === 'verdict')
}

function groupTasks(entries) {
  const byTask = new Map()
  for (const entry of entries) {
    const id = entry.kind === 'outcome' ? entry.id : entry.task
    if (id === undefined || id === null) continue
    const key = taskKey(entry.session, id)
    if (!byTask.has(key)) byTask.set(key, { id, list: [] })
    byTask.get(key).list.push(entry)
  }
  return [...byTask.values()].filter(({ list }) => list.some(isLaunch))
}

function unverdictedTasks(entries) {
  return groupTasks(entries).filter(({ list }) => isUnverdictedTask(list)).map(({ id, list }) => {
    const launches = list.filter(isLaunch)
    const latest = last(launches)
    return { task: id, session: latest.session ?? null, attempt: launches.length, step: latest.step ?? null }
  })
}

function unverdictedDelegates({ dataDir = run.dataDir(), session = null, since = 0 } = {}) {
  return unverdictedTasks(readAllEntries(dataDir, { session, since }))
}

function stepCounts(rung, entries) {
  const launches = entries.filter((e) => e.kind === 'launch' && e.step === rung.step)
  const verdicts = entries.filter((e) => e.kind === 'verdict' && e.step === rung.step)
  const rises = Object.fromEntries(CAUSES.map((cause) => [cause, 0]))
  for (const v of verdicts) {
    const next = v.next
    if (next && next.kind === 'rise' && CAUSES.includes(next.cause)) rises[next.cause] += 1
  }
  return {
    step: rung.step,
    tasks: new Set(launches.map((e) => taskKey(e.session, e.task))).size,
    attempts: launches.length,
    corrections: launches.filter((e) => e.launchKind === 'fix').length,
    approved: verdicts.filter((v) => v.verdict === 'approved').length,
    rises,
    infeasible: verdicts.filter((v) => v.verdict === 'infeasible').map((v) => ({ task: v.task, reason: v.reason ?? null })),
  }
}

function delegatesReport({ dataDir = run.dataDir(), session = null, since = 0 } = {}) {
  const entries = readAllEntries(dataDir, { session, since })
  const delegations = groupTasks(entries).map(({ id, list }) => rowOfTask(id, list))
  const unverdicted = unverdictedTasks(entries)
  const ladder = loadLadder()
  return {
    delegations,
    unverdicted,
    ladder: {
      steps: ladder.rungs.map((rung) => stepCounts(rung, entries)),
      relaunches: entries.filter((e) => e.kind === 'relaunch').map((e) => ({ task: e.task, of: e.of })),
    },
  }
}

module.exports = { delegatesReport, unverdictedTasks, unverdictedDelegates }
