'use strict'

// The token counts of a lane call, normalised for pricing: lib/spend.js and lib/lanes.js ask for them here.
// Family: spend.

// agy counts thinking inside total only in some builds: it is output only when total includes it.
function laneTokens(usage = {}) {
  const numberOrZero = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  const input = numberOrZero(usage.input)
  const output = numberOrZero(usage.output)
  const thinking = numberOrZero(usage.thinking)
  const total = numberOrZero(usage.total)
  const thinkingCounted = thinking > 0 && total >= input + output + thinking
  return {
    input,
    output: thinkingCounted ? output + thinking : output,
    cacheRead: numberOrZero(usage.cacheRead),
    cacheWrite: 0,
  }
}

module.exports = { laneTokens }
