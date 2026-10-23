'use strict'

// The delegates report (R17, R18): what `aether-report --delegates` prints. One row per task of the delegate log
// (lib/delegate-log.js) and one per `decision` of the old router journal (lib/router-log.js, read only), for the rows
// the /harnesses panel draws; and, per step of config/ladder.json, how the delegates of the log went. The ladder
// counts come from the log alone.

const run = require('./run.js')
const log = require('./delegate-log.js')
const { loadLadder } = require('./ladder.js')
const { readJournal } = require('./router-log.js')

const CAUSES = ['exhausted', 'repeated', 'infeasible']

const last = (list) => list[list.length - 1]

// A refused relaunch (the task was approved or exhausted) is logged as a launch, but no step opened for it: it is not an
// attempt and not where the task ran.
const isAttempt = (entry) => entry.kind === 'launch' && entry.launchKind !== 'refused'

// Where a task of the log ran. An external attempt that ended ok ran on its outcome's pair. One that did not was
// rerun on Claude (the step's model, the launch's effort) and the row says why in `fallback`; a task with no outcome
// at all ran on Claude, rewritten.
function rowOfTask(id, entries) {
  const launches = entries.filter(isAttempt)
  const outcomes = entries.filter((e) => e.kind === 'outcome')
  const first = launches[0]
  const latest = last(launches)
  const outcome = outcomes.length > 0 ? last(outcomes) : null
  const onClaude = { harness: 'claude', model: latest.step, effort: latest.effort ?? null }
  const failed = outcome !== null && outcome.status !== 'ok'
  let ranOn = onClaude
  if (outcome && !failed) ranOn = { harness: outcome.harness, model: outcome.model, effort: outcome.effort }
  return {
    id,
    time: first.time,
    session: first.session,
    description: first.description,
    applied: outcome ? 'external' : 'rewritten',
    ranOn,
    fallback: failed ? `external ${outcome.status}` : null,
    step: latest.step,
    attempts: launches.length,
  }
}

// One row per decision of the old journal whose id is not a task of the log. The last outcome of the id says where it
// ran; if it did not end ok it ran on the decision's rescue pair.
function rowsOfJournal(journal, taken) {
  const outcomes = new Map()
  for (const entry of journal) {
    if (entry.kind === 'outcome') outcomes.set(entry.id, [...(outcomes.get(entry.id) ?? []), entry])
  }
  return journal
    .filter((entry) => entry.kind === 'decision' && !taken.has(entry.id))
    .map((entry) => {
      const attempted = outcomes.get(entry.id) ?? []
      const outcome = attempted.length > 0 ? last(attempted) : null
      const failed = outcome !== null && outcome.status !== 'ok'
      let fallback = entry.fallback || null
      if (!fallback && failed) fallback = `external ${outcome.status}`
      let ranOn = entry.ranOn || null
      if (outcome) ranOn = failed ? entry.rescue || null : { harness: outcome.harness, model: outcome.model, effort: outcome.effort }
      else if (entry.applied === 'external') ranOn = entry.rescue || null
      return {
        id: entry.id,
        time: entry.time,
        session: entry.session,
        description: entry.description,
        applied: entry.applied,
        ranOn,
        fallback,
        step: null,
        attempts: attempted.length,
      }
    })
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
    tasks: new Set(launches.map((e) => e.task)).size,
    attempts: launches.length,
    corrections: launches.filter((e) => e.launchKind === 'fix').length,
    approved: verdicts.filter((v) => v.verdict === 'approved').length,
    rises,
    infeasible: verdicts.filter((v) => v.verdict === 'infeasible').map((v) => ({ task: v.task, reason: v.reason ?? null })),
  }
}

function delegatesReport({ dataDir = run.dataDir(), session = null, since = 0 } = {}) {
  const entries = log.readEntries(dataDir, { session, since })
  const byTask = new Map()
  for (const entry of entries) {
    // An `outcome` entry names its task in `id`; the others in `task`.
    const id = entry.kind === 'outcome' ? entry.id : entry.task
    if (id === undefined || id === null) continue
    if (!byTask.has(id)) byTask.set(id, [])
    byTask.get(id).push(entry)
  }
  const fromLog = [...byTask].filter(([, list]) => list.some(isAttempt)).map(([id, list]) => rowOfTask(id, list))
  const taken = new Set(fromLog.map((row) => row.id))
  const delegations = [...fromLog, ...rowsOfJournal(readJournal(dataDir, { since, session }), taken)]
  const ladder = loadLadder()
  return {
    delegations,
    ladder: {
      steps: ladder.rungs.map((rung) => stepCounts(rung, entries)),
      relaunches: entries.filter((e) => e.kind === 'relaunch').map((e) => ({ task: e.task, of: e.of })),
    },
  }
}

module.exports = { delegatesReport }
