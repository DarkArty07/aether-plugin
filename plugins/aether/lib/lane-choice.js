'use strict'

// The `choice` entry of the lane log: where one call of a run went, which candidates were ahead of it and
// why each was passed over. The workflow has no file system, so it hands the decision to
// `aether-lane choice` as two tokens, and this module reads them, checks that they agree and writes the entry.
//
//   --pick   native | <harness>:<model>
//   --order  <harness>:<model>:<rank>:<outcome>[:absent] items joined by '/', in the order they were tried
//
// <rank> is the candidate's priority (a decimal), `unknown` (no reading) or `excluded` (not usable). The
// closed list of hooks/ops-command.mjs holds a copy of these expressions, checked token by token: change one
// here and change the other, and tests/ops-command-lanes.test.js says whether they still agree.

const lanes = require('./lanes.js')
const { assertRunId } = require('./run.js')

const CALL = /^(task-\d+-\d+-(implement|supervise)|final-review)$/
const ROLES = ['implementer', 'supervisor', 'reviewer']
const TIERS = ['haiku', 'sonnet', 'opus']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

const PICK = /^(native|([a-z][a-z0-9-]*):([A-Za-z0-9][A-Za-z0-9._-]*))$/
// A decimal of at most 15 digits on each side: always finite, and the same bound in the mod's copy.
const ITEM = /^([a-z][a-z0-9-]*):([A-Za-z0-9][A-Za-z0-9._-]*):(\d{1,15}(?:\.\d{1,15})?|unknown|excluded):(picked|pool-full|untried|reserve|marked|not-installed|dry|unavailable-[a-z]+(?:-[a-z]+)*)(:absent)?$/

// Why a candidate was passed over, by outcome. `unavailable-<reason>` says what stopped its start.
const MOTIVES = {
  reserve: 'is under the reserve',
  marked: 'is marked dry',
  'not-installed': 'is not installed',
  dry: 'ran dry earlier in the run',
  'pool-full': 'has its pool full',
  untried: 'was not tried',
}
const UNAVAILABLE = 'unavailable-'

function parsePick(token) {
  const found = typeof token === 'string' ? PICK.exec(token) : null
  if (!found) throw new Error(`--pick must be native or <harness>:<model>, not ${token}`)
  return found[1] === 'native' ? null : { harness: found[2], model: found[3] }
}

function parseItem(item) {
  const found = ITEM.exec(item)
  if (!found) throw new Error(`--order has an item that is not <harness>:<model>:<rank>:<outcome>[:absent]: ${JSON.stringify(item)}`)
  const [, harness, model, rank, outcome, absent] = found
  const ordered = rank !== 'unknown' && rank !== 'excluded'
  return {
    harness,
    model,
    state: ordered ? 'priority' : rank,
    priority: ordered ? Number(rank) : null,
    outcome,
    usedPercentAbsent: absent !== undefined,
  }
}

function parseOrder(token) {
  return String(token).split('/').map(parseItem)
}

// --pick and --order name the same call: a lane's pick is the one `picked` item, and native has none.
function assertAgree(pick, candidates) {
  const taken = candidates.filter((c) => c.outcome === 'picked')
  const agree = pick === null ? taken.length === 0 : taken.length === 1 && taken[0].harness === pick.harness && taken[0].model === pick.model
  if (!agree) throw new Error('--pick and the picked item of --order do not agree')
}

const nameOf = (c) => `${c.harness} ${c.model}`
const motiveOf = (c) => (c.outcome.startsWith(UNAVAILABLE) ? `did not start (${c.outcome.slice(UNAVAILABLE.length)})` : MOTIVES[c.outcome])
const passedOver = (c) => `${nameOf(c)} ${motiveOf(c)}`

// One line on why the call went where it went, from the candidates as the workflow tried them.
function reasonOf(pick, candidates) {
  assertAgree(pick, candidates)
  if (pick === null) {
    const lead = candidates.some((c) => c.state !== 'excluded') ? 'every usable candidate was passed over' : 'no candidate is usable'
    return `native: ${lead}: ${candidates.map(passedOver).join('; ')}`
  }
  const at = candidates.findIndex((c) => c.outcome === 'picked')
  const took = `took ${pick.harness} ${pick.model}`
  if (at > 0) return `${took} after ${candidates.slice(0, at).map(passedOver).join(', ')}`
  const ordered = candidates.filter((c) => c.state !== 'excluded')
  return `${took}, first in order (${ordered.map((c) => `${nameOf(c)} ${c.priority === null ? 'no reading' : c.priority}`).join(', ')})`
}

function oneOf(flag, values, value) {
  if (!values.includes(value)) throw new Error(`${flag} must be one of ${values.join(', ')}`)
  return value
}

// The log entry for a call; throws, with the message the bin prints, when any part is not valid.
function entryOf(runId, call, flags = {}, now = Date.now()) {
  assertRunId(runId)
  if (!CALL.test(String(call))) throw new Error(`invalid call id: ${call}`)
  const role = oneOf('--role', ROLES, flags.role)
  const tier = oneOf('--tier', TIERS, flags.tier)
  const effort = oneOf('--effort', EFFORTS, flags.effort)
  const picked = parsePick(flags.pick)
  const candidates = parseOrder(flags.order)
  return {
    kind: 'choice',
    time: now,
    session: null,
    run: runId,
    design: null,
    call,
    role,
    tier,
    effort,
    picked,
    candidates,
    reason: reasonOf(picked, candidates),
  }
}

function logChoice(dataDir, runId, call, flags, { now = Date.now() } = {}) {
  lanes.appendLog(dataDir, null, entryOf(runId, call, flags, now))
  return { logged: true }
}

module.exports = { parsePick, parseOrder, reasonOf, entryOf, logChoice }
