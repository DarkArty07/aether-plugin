'use strict'

// The explicit quota refusals a harness states in words, each the only sign of the limit it names: agy's
// `Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.`, of a
// limit /usage does not report, and Muse's subscription 429, `Subscription quota exhausted. Your usage window resets
// at 2026-10-26T00:00:00Z. (rate_limit_error)`, which a real call brought with the message text alone and no
// structured quota data (issue 75). Every path that calls either harness (the swarm's lane calls, the design seats,
// the delegate router) reads them here and turns one into a mark. No other words count: a 429 or a rate_limit_error
// that does not say the subscription quota is exhausted is a plain failure.

const REFUSAL_RE = /individual quota reached/i
const MUSE_EXHAUSTED_RE = /subscription quota exhausted/i
const MUSE_RATE_LIMIT_RE = /rate_limit_error/i
// Muse states its reset as a moment, not a duration: `resets at 2026-10-26T00:00:00Z`.
const MUSE_RESET_RE = /resets at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/i
// The duration is a run of <n>d, <n>h, <n>m, <n>s parts in that order, any subset, in either case, with optional spaces
// between the parts. A duration the pattern cannot place (a decimal, parts out of order, a number with no unit) does not
// match at all: the lookaheads refuse a tail that would be left unread, and the refusal then states no reset.
const RESET_RE = /resets in ((?:\d+d)?(?:\s*\d+h)?(?:\s*\d+m)?(?:\s*\d+s)?)(?!\w)(?!\s*\d)/i
const DURATION_UNIT_MS = { d: 86400000, h: 3600000, m: 60000, s: 1000 }
const DURATION_PART_RE = /(\d+)([dhms])/gi

function durationMs(duration) {
  let total = 0
  for (const [, amount, unit] of duration.matchAll(DURATION_PART_RE)) {
    total += Number(amount) * DURATION_UNIT_MS[unit.toLowerCase()]
  }
  return total
}

// Returns null unless text is a string holding one of the explicit refusals. For agy's, resetMs is the duration the
// message states, or null when it states none. Muse's states a moment instead, kept as resetsAt (an ISO time, or
// null when none reads), with resetMs null: a stated reset is only a hint either way (A75), kept for people to read.
function quotaRefusal(text) {
  if (typeof text !== 'string') return null
  if (REFUSAL_RE.test(text)) {
    const reset = RESET_RE.exec(text)
    if (!reset || reset[1] === '') return { resetMs: null }
    return { resetMs: durationMs(reset[1]) }
  }
  if (MUSE_EXHAUSTED_RE.test(text) && MUSE_RATE_LIMIT_RE.test(text)) {
    const stated = MUSE_RESET_RE.exec(text)
    const at = stated ? Date.parse(stated[1]) : NaN
    return { resetMs: null, resetsAt: Number.isFinite(at) ? new Date(at).toISOString() : null }
  }
  return null
}

// The first refusal among the texts a failed call left (its parsed reason, its error, its stderr), or null.
function refusalIn(...texts) {
  for (const text of texts) {
    const refusal = quotaRefusal(text)
    if (refusal) return refusal
  }
  return null
}

module.exports = { durationMs, quotaRefusal, refusalIn }
