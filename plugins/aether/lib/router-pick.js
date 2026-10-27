'use strict'

// The router's use of superdelegation's one choice function (lib/superdelegation.js choose) for a read-only delegate
// of the Lead. The router decides how strong the task has to be, which is the Claude rung it would run on; this module
// asks the function the swarm and the design seats ask which external pair reaches the points of that rung. It reads
// the quota the router already has, as lib/router-quota.js does, so it never starts a quota call: a harness whose
// reading expired and that could serve the call is renewed in the background and waited for up to the quota deadline;
// one that could not serve it (every group marked, or no pair at the points asked) is neither renewed nor waited for;
// an expired harness is left out when it is still expired. Everything else it needs comes in through `d`, the
// router's dependencies (lib/route.js resolve).

const laneMarks = require('./lane-marks.js')
const { groupView } = require('./lane-quota.js')
const { choose } = require('./superdelegation.js')
const { lifeMs, staleHarnesses } = require('./router-quota.js')
const { waitForReading } = require('./router-renewal.js')

// The harnesses that can run a delegate (lib/delegate-calls.js): codex and cursor cannot.
const DELEGATE_HARNESSES = ['agy', 'grok', 'muse']

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// The view of the quota groups of one harness that choose reads, from the reading the router has of it (null when the
// harness keeps none, which leaves its groups unknown and usable, as in the swarm). A mark that came from a reading is
// lifted by a valid reading that shows the group healthy and is newer than the mark; a refusal's mark never is.
function viewOf(config, name, reading, { marks, now, lift }) {
  const settings = config.harnesses[name]
  const life = lifeMs(config, name)
  const groups = {}
  for (const key of Object.keys(settings.groups ?? {})) {
    const raw = isObject(reading?.groups?.[key]) ? reading.groups[key] : null
    const held = marks.filter((mark) => mark.harness === name && mark.group === key && mark.until > now)
    const lifted = raw !== null && held.length > 0 && held.every((mark) => laneMarks.liftable(mark, raw, { readAt: reading.readAt, reserve: config.reserve, lifeMs: life, now }))
    if (lifted && typeof lift === 'function') for (const mark of held) lift(mark)
    const mark = held.length > 0 && !lifted ? held[0] : null
    groups[key] = groupView(settings.groups[key], raw ?? { unknown: true, windows: {} }, {
      reserve: config.reserve, now, command: settings.command, mark, readAt: reading?.readAt ?? now, lifeMs: life,
    })
  }
  return { command: settings.command, installed: true, groups }
}

// A reading that lacks a group of the lane table is not a whole reading: the swarm would read the harness again to
// complete it, and a hook cannot start a quota call. It counts as expired. A harness that keeps no reading (null) is
// not incomplete: its groups are unknown, and unknown is usable.
function incomplete(config, name, reading) {
  if (reading == null) return false
  return Object.keys(config.harnesses[name].groups ?? {}).some((key) => !isObject(reading.groups?.[key]))
}

// What a harness could serve whatever its reading says: every group open but the ones a live mark holds.
function openViews(config, names, marks, now) {
  return Object.fromEntries(names.map((name) => [name, {
    installed: true,
    groups: Object.fromEntries(Object.keys(config.harnesses[name].groups ?? {}).map((key) => [
      key,
      marks.some((mark) => mark.harness === name && mark.group === key && mark.until > now) ? { mark: true } : {},
    ])),
  }]))
}

// The pair that takes a read-only delegate whose native reference is { model, effort } (an alias and an effort of the
// pairs table), or none. Resolves to { pick, quota, waitedMs, reason }: pick is the pair or null, quota the candidates
// of the decision for the journal, reason the function's own words. The pairs that ran out of time lately (d.slow(),
// lib/router-slow.js) are excluded from every call of the function, so they show in the candidates as excluded and the
// alternates of the decision never hold them. It never throws: when something under it fails (a reference the table
// lacks, a table that cannot be read) it returns the failure as `error`, with no reason, so that the router journals it
// as an internal error and not as a choice (issue 036).
async function pairStep(d, settings, { reference }) {
  try {
    const config = d.lanesConfig()
    const pairs = d.pairs()
    const listed = settings.harnesses.filter((name) => DELEGATE_HARNESSES.includes(name) && isObject(config?.harnesses?.[name]) && pairs.some((pair) => pair.harness === name))
    const live = listed.filter((name) => d.installed(name))
    const marks = d.marks()
    const exclude = typeof d.slow === 'function' ? d.slow() : []
    // The harnesses with no whole, valid reading: expired or incomplete.
    const unreadable = (names) => {
      const readings = d.readings(names)
      const expired = staleHarnesses({ readings, config, harnesses: names, now: d.now() })
      return names.filter((name) => expired.includes(name) || incomplete(config, name, readings[name]))
    }
    const stale = unreadable(live)
    // The harnesses that could serve the call whatever their readings say: a group with a rung at the points asked and
    // no live mark. A stale harness outside this set is neither renewed nor waited for (issue 025): one whose every
    // pair is held by a mark, or below the points asked, cannot have its pick changed by a reading, so the decision
    // starts no quota call for it and does not sit out the quota deadline.
    const serving = new Set(choose({ pairs, reference, exclude, harnesses: openViews(config, live, marks, d.now()) })
      .candidates.filter((entry) => entry.outcome !== 'passed').map((entry) => entry.harness))
    const waiting = stale.filter((name) => serving.has(name))
    const renewals = {}
    for (const harness of waiting) {
      let result = null
      try {
        result = d.renew(harness)
      } catch {}
      if (result && result.started) renewals[harness] = 'started'
      else if (result && result.running) renewals[harness] = 'running'
    }
    let waitedMs = 0
    if (waiting.length > 0) {
      const waited = await waitForReading({
        isValid: () => unreadable(waiting).length === 0,
        waitMs: settings.deadlines.quotaMs,
        now: d.now,
        sleep: d.sleep,
      })
      waitedMs = waited.waitedMs
    }
    const readings = d.readings(live)
    const now = d.now()
    const expired = new Set(unreadable(live))
    const views = {}
    for (const name of listed) {
      if (!live.includes(name)) views[name] = { installed: false, groups: {} }
      else if (!expired.has(name)) views[name] = viewOf(config, name, readings[name] ?? null, { marks, now, lift: d.lift })
    }
    const decision = choose({ pairs, reference, exclude, harnesses: views, role: 'reviewer', lanes: config })
    const quota = decision.candidates.map((entry) => ({
      ...entry,
      ...(expired.has(entry.harness) ? { why: 'no-reading' } : {}),
      ...(renewals[entry.harness] ? { renewal: renewals[entry.harness] } : {}),
    }))
    return { pick: decision.picked, quota, waitedMs, reason: decision.reason }
  } catch (err) {
    return { pick: null, quota: null, waitedMs: 0, reason: null, error: err instanceof Error ? err.message : String(err) }
  }
}

module.exports = { DELEGATE_HARNESSES, pairStep }
