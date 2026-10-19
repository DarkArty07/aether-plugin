'use strict'

// agy's explicit quota refusal: `Individual quota reached. Please upgrade your subscription to increase your limits.
// Resets in 163h22m27s.` It is the only sign of agy's individual limits, which /usage does not report, so every path
// that calls agy (the swarm's lane calls, the design seats, the delegate router) reads it here and turns it into a mark.

const REFUSAL_RE = /individual quota reached/i
// The duration is a run of <n>d, <n>h, <n>m, <n>s parts in that order, any subset, with no spaces.
const RESET_RE = /resets in ((?:\d+d)?(?:\d+h)?(?:\d+m)?(?:\d+s)?)(?!\w)/i
const DURATION_UNIT_MS = { d: 86400000, h: 3600000, m: 60000, s: 1000 }
const DURATION_PART_RE = /(\d+)([dhms])/g

function durationMs(duration) {
  let total = 0
  for (const [, amount, unit] of duration.matchAll(DURATION_PART_RE)) {
    total += Number(amount) * DURATION_UNIT_MS[unit]
  }
  return total
}

// Returns null unless text is a string holding agy's explicit quota refusal. resetMs is the time the message states,
// or null when it states none.
function quotaRefusal(text) {
  if (typeof text !== 'string' || !REFUSAL_RE.test(text)) return null
  const reset = RESET_RE.exec(text)
  if (!reset || reset[1] === '') return { resetMs: null }
  return { resetMs: durationMs(reset[1]) }
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
