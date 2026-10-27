'use strict'

// Superdelegation: the one switch that sends every call but the Lead's to an external harness first, and the
// one rule that picks the pair for a call. A call asks for the points of its native reference pair; an external
// pair reaches it at those points minus TOLERANCE_POINTS; within a quota a pair that gives no more points than a
// cheaper candidate is dominated; the quota that renews first takes the call, at its cheapest pair. Speed is
// never read. authorRule is 'bar' (the default, for the swarm, the final review and aether-lane delegate: a pair
// of an author's family is not a candidate) or 'reserve' (the design seats: a pair of another family first, then
// the author's own family, and the native agent only last). When a call names a role, an external pair is a
// candidate only if the lane table's entry for its model lists that role. Everything here is pure: the lane
// table, the pairs and the quota views come in as arguments.
// Family: none.

const { isNumber } = require('./common.js')
const { NATIVE_HARNESS, NATIVE_MODELS, referenceOf } = require('./pairs.js')

const TOLERANCE_POINTS = 1
const ROLES = ['implementer', 'supervisor', 'reviewer']

// Whether superdelegation may run: the session exported AETHER_SUPERDELEGATION=on, and the platform is Linux
// (external sessions are killed by process group and /proc).
function enabled(env = process.env, platform = process.platform) {
  if (env.AETHER_SUPERDELEGATION !== 'on') return { on: false, reason: 'option' }
  if (platform !== 'linux') return { on: false, reason: 'platform' }
  return { on: true, reason: null }
}

// The plugin option as Claude Code exports it: on only with 'true'; 'false' is set and off; anything else is the default, off.
function resolveOption(env) {
  const superdelegation = env.CLAUDE_PLUGIN_OPTION_SUPERDELEGATION
  if (superdelegation === 'true' || superdelegation === 'false') {
    return { on: superdelegation === 'true', source: 'superdelegation' }
  }
  return { on: false, source: 'default' }
}

// Points are compared in integer tenths, so that 45.8 reaches 46.8 minus 1 and 45.7 does not.
const tenths = (points) => Math.round(points * 10)
const TOLERANCE_TENTHS = TOLERANCE_POINTS * 10
const hasCost = (pair) => typeof pair.costPerTaskUsd === 'number'

function resetsKey(quota) {
  const time = quota && typeof quota.resetsAt === 'string' ? Date.parse(quota.resetsAt) : NaN
  return Number.isNaN(time) ? Infinity : time
}

const isDry = (quota) => Boolean(quota) && (quota.usable === false || Boolean(quota.mark))

// Whether the lane table's entry for a pair's model lists the role of the call. A pair with no entry, or a
// call that brings no table, allows nothing.
function allowsRole(pair, role, lanes) {
  const harness = lanes && lanes.harnesses && Object.hasOwn(lanes.harnesses, pair.harness) ? lanes.harnesses[pair.harness] : null
  const model = harness && harness.models && Object.hasOwn(harness.models, pair.model) ? harness.models[pair.model] : null
  return Boolean(model && Array.isArray(model.roles) && model.roles.includes(role))
}

// The reason a pair is not a candidate before dominance, in the order of precedence, or null.
// Under authorRule 'reserve' the author's family is not barred here: it sorts after every other family.
function firstBar(pair, { harnesses, exclude, authors, floor, authorRule, role, lanes }) {
  if (!Object.hasOwn(harnesses, pair.harness)) return 'harness-off'
  const view = harnesses[pair.harness]
  if (!view || view.installed !== true) return 'not-installed'
  if (exclude.includes(pair.id)) return 'excluded'
  if (role !== undefined && !allowsRole(pair, role, lanes)) return 'role'
  if (authorRule !== 'reserve' && authors.includes(pair.family)) return 'author'
  if (isDry(quotaOf(pair, harnesses))) return 'dry'
  return measureBar(pair, floor)
}

// The reason a pair's own figures keep it out: no cost per task without the owner's decision, or fewer points
// than the floor of the call (in tenths). null when its figures let it in.
function measureBar(pair, floor) {
  if (!hasCost(pair) && !pair.ownerDecision) return 'no-cost'
  if (!isNumber(pair.intelligence) || tenths(pair.intelligence) < floor) return 'below'
  return null
}

// A quota view of a pair, or undefined when its harness gives none for its group (a quota with no reading).
function quotaOf(pair, harnesses) {
  const groups = harnesses[pair.harness] && harnesses[pair.harness].groups
  return groups && Object.hasOwn(groups, pair.group) ? groups[pair.group] : undefined
}

// P is dominated when a cheaper candidate Q of the same quota gives at least P's points minus the tolerance.
// A pair with no cost neither dominates nor is dominated.
function dominated(pair, open) {
  if (!hasCost(pair)) return false
  return open.some((other) => other !== pair && hasCost(other) && other.harness === pair.harness && other.group === pair.group &&
    other.costPerTaskUsd < pair.costPerTaskUsd && tenths(pair.intelligence) <= tenths(other.intelligence) + TOLERANCE_TENTHS)
}

// Under reserve, an author's pair must not knock a pair of another family out of the same quota: that other
// family is taken even when the author's pair is cheaper. Each side is dominated only by its own side.
function rivalsOf(pair, open, authorRule, authors) {
  if (authorRule !== 'reserve') return open
  const own = authors.includes(pair.family)
  return open.filter((other) => authors.includes(other.family) === own)
}

// The order of the candidates: the quota that renews first (an unreadable window after the readable ones),
// then the lower cost per task (no cost last), then more points, then the order of the table.
function compareCandidates(a, b) {
  return (a.resets - b.resets) || (a.cost - b.cost) || (tenths(b.pair.intelligence) - tenths(a.pair.intelligence)) || (a.index - b.index)
}

const pairPoints = (pair) => ({ id: pair.id, model: pair.model, effort: pair.effort, family: pair.family, intelligence: pair.intelligence })

// The native agent of the call: the reference pair, or, for a call that reviews the work of an author model,
// the Claude model at the same effort that is not an author and whose points are closest to the ones asked
// (the stronger on a tie). When all three Claude models are authors the reference stays, marked `none`.
function nativeFor(pairs, ref, { authors, nativeDiffers }) {
  if (!nativeDiffers || !authors.includes(ref.family)) return { pair: ref, swapped: false, none: false }
  const asked = tenths(ref.intelligence)
  const others = pairs.filter((pair) => pair.harness === NATIVE_HARNESS && pair.effort === ref.effort &&
    NATIVE_MODELS.includes(pair.model) && pair.model !== ref.model && !authors.includes(pair.family) && isNumber(pair.intelligence))
  if (others.length === 0) return { pair: ref, swapped: false, none: true }
  const best = [...others].sort((a, b) =>
    (Math.abs(tenths(a.intelligence) - asked) - Math.abs(tenths(b.intelligence) - asked)) || (tenths(b.intelligence) - tenths(a.intelligence)))[0]
  return { pair: best, swapped: true, none: false }
}

// The decision for one call. See the header for the rule; candidates lists every external pair of the table,
// the candidates first in their order, then the others in the order of the table with the reason they passed.
function choose({ pairs, reference, harnesses, exclude = [], authors = [], nativeDiffers = false, authorRule = 'bar', role, lanes }) {
  if (authorRule !== 'bar' && authorRule !== 'reserve') throw new Error(`authorRule must be bar or reserve, not ${JSON.stringify(authorRule)}`)
  const ref = referenceOf(pairs, reference)
  const requested = ref.intelligence
  const floor = tenths(requested) - TOLERANCE_TENTHS
  const external = pairs.map((pair, index) => ({ pair, index })).filter(({ pair }) => pair.harness !== NATIVE_HARNESS)
  const context = { harnesses: harnesses || {}, exclude, authors, floor, authorRule, role, lanes }
  const barred = external.map((entry) => ({ ...entry, why: firstBar(entry.pair, context) }))
  const open = barred.filter((entry) => entry.why === null).map((entry) => entry.pair)
  for (const entry of barred) {
    if (entry.why === null && dominated(entry.pair, rivalsOf(entry.pair, open, authorRule, authors))) entry.why = 'dominated'
  }
  // Reserve sorts every other family ahead of the author's, before renewal and cost, so a cheaper or sooner
  // pair of the author's family waits until no other family can take the call.
  const authorLater = (pair) => (authorRule === 'reserve' && authors.includes(pair.family) ? 1 : 0)
  const ranked = barred
    .filter((entry) => entry.why === null)
    .map((entry) => ({ ...entry, resets: resetsKey(quotaOf(entry.pair, context.harnesses)), cost: hasCost(entry.pair) ? entry.pair.costPerTaskUsd : Infinity, authorLater: authorLater(entry.pair) }))
    .sort((a, b) => (a.authorLater - b.authorLater) || compareCandidates(a, b))
  const passed = barred.filter((entry) => entry.why !== null)

  const describe = ({ pair }, rank, outcome, why) => ({
    id: pair.id, harness: pair.harness, group: pair.group, intelligence: pair.intelligence, costPerTaskUsd: pair.costPerTaskUsd, rank, outcome, why,
  })
  const candidates = [
    ...ranked.map((entry, i) => describe(entry, i + 1, i === 0 ? 'picked' : 'next', null)),
    ...passed.map((entry) => describe(entry, null, 'passed', entry.why)),
  ]
  const picked = ranked.length > 0 ? { ...ranked[0].pair } : null
  const native = nativeFor(pairs, ref, { authors, nativeDiffers })

  const minimum = floor / 10
  let reason
  if (picked) {
    reason = `${picked.id}: ${picked.intelligence} points for ${requested} asked (at least ${minimum}), the first of ${ranked.length} candidate${ranked.length === 1 ? '' : 's'}`
  } else if (role !== undefined && !external.some(({ pair }) => allowsRole(pair, role, lanes))) {
    reason = `native ${native.pair.id}: no external model allows the role ${role}`
  } else {
    // A quota is eligible when one of its pairs would be a candidate but for its dry quota.
    const dryOnly = passed.some((entry) => entry.why === 'dry' && measureBar(entry.pair, floor) === null)
    reason = dryOnly
      ? `native ${native.pair.id}: every quota with a pair that reaches ${minimum} points is dry`
      : `native ${native.pair.id}: no external pair is a candidate for ${requested} points (at least ${minimum})`
  }
  if (native.swapped) reason += `; the native fallback is ${native.pair.model}, not ${ref.model}, which is an author`
  if (native.none) reason += `; no other Claude model is free of the authors, so the native fallback stays ${ref.model}`

  return {
    requested,
    reference: { id: ref.id, model: ref.model, effort: ref.effort, intelligence: ref.intelligence },
    picked,
    native: pairPoints(native.pair),
    candidates,
    reason,
  }
}

const waitRounds = (harness, role) => Math.ceil(harness.timeouts[role] / harness.waitSeconds) + 1

function entryOf(config, name) {
  return config && config.harnesses && Object.hasOwn(config.harnesses, name) ? config.harnesses[name] : null
}

const hasPairs = (pairs, name) => pairs.some((pair) => pair.harness === name && pair.harness !== NATIVE_HARNESS)

// The enabled harnesses that may take a call of the run, in the order enabled names them.
function listedHarnesses(config, pairs, { installed, enabled: names }) {
  return names.filter((name) => {
    const harness = entryOf(config, name)
    return harness !== null && installed(name, harness) && hasPairs(pairs, name)
  })
}

// The lanes args of `aether-plan compile`: the harnesses that may take a call and each role's wait rounds
// (the largest among those harnesses). null when none may.
function runArgs(config, pairs, { installed, enabled: names }) {
  if (!config) return null
  const listed = listedHarnesses(config, pairs, { installed, enabled: names })
  if (listed.length === 0) return null
  const waitOf = (role) => Math.max(...listed.map((name) => waitRounds(config.harnesses[name], role)))
  return {
    superdelegation: true,
    harnesses: listed,
    waits: Object.fromEntries(ROLES.map((role) => [role, waitOf(role)])),
  }
}

// The enabled harnesses that give the run nothing, each with the reason, so that none stays idle unnoticed.
function idleHarnesses(config, pairs, { installed, enabled: names }) {
  if (!config) return []
  const listed = listedHarnesses(config, pairs, { installed, enabled: names })
  return names
    .filter((name) => !listed.includes(name))
    .map((name) => {
      const harness = entryOf(config, name)
      if (!harness) return { name, reason: 'has no entry in the lane table' }
      if (!installed(name, harness)) return { name, reason: `is not installed: ${harness.command} was not found` }
      if (!harness.models || Object.keys(harness.models).length === 0) return { name, reason: 'has no models in the lane table yet' }
      return { name, reason: 'has no pairs in the pairs table yet' }
    })
}

module.exports = {
  TOLERANCE_POINTS,
  enabled,
  resolveOption,
  choose,
  runArgs,
  idleHarnesses,
}
