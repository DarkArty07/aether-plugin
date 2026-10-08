// Fixed-timestep accumulator. Pure: time comes in as arguments.
const MAX_TICKS_PER_CALL = 5

export function createLoop({ startMs }) {
  let last = startMs
  let accumulated = 0

  return {
    // Returns the ticks now due (at most 5, the rest dropped) and the progress toward the next one.
    advance(nowMs, tickMs) {
      accumulated += Math.max(0, nowMs - last)
      last = Math.max(last, nowMs)
      let ticks = Math.floor(accumulated / tickMs)
      if (ticks > MAX_TICKS_PER_CALL) {
        ticks = MAX_TICKS_PER_CALL
        accumulated = 0
      } else {
        accumulated -= ticks * tickMs
      }
      return { ticks, alpha: accumulated / tickMs }
    },
    // The next tick is a full tick away from nowMs.
    reset(nowMs) {
      last = nowMs
      accumulated = 0
    },
  }
}
