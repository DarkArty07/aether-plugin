// The fixed-step clock of the game, pure: it never reads a clock itself, the caller passes the time.
// `last` is the time of the latest tick boundary; advance() hands out the ticks that fell due since
// then and how far the next one has come (alpha, in [0, 1)), for the renderer to interpolate with.

const MAX_TICKS_PER_CALL = 5 // after a stall (a slow frame, a busy tab) the rest is dropped, not replayed
const BELOW_ONE = 1 - Number.EPSILON

export function createLoop({ startMs = 0 } = {}) {
  let last = startMs

  function advance(nowMs, tickMs) {
    if (!(tickMs > 0)) return { ticks: 0, alpha: 0 }
    const elapsed = Math.max(0, nowMs - last) // time going backwards counts as none
    const due = Math.floor(elapsed / tickMs)
    let ticks = due
    if (due > MAX_TICKS_PER_CALL) {
      ticks = MAX_TICKS_PER_CALL
      last = nowMs - (elapsed % tickMs)
    } else {
      last += due * tickMs
    }
    const alpha = Math.min(Math.max(0, (nowMs - last) / tickMs), BELOW_ONE)
    return { ticks, alpha }
  }

  // The next tick is then a full tick away.
  function reset(nowMs) {
    last = nowMs
  }

  return { advance, reset }
}
