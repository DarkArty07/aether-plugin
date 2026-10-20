'use strict'

// Pure group views for quota-aware lanes (spec 002, R9 to R12).
// Determines lane priority and quota usability without external I/O or clock access.

const MIN_HOURS = 1

// Whether a window has a balance that can be compared with the reserve.
const hasBalance = (win) => win != null && typeof win.remaining === 'number' && Number.isFinite(win.remaining)

// Whether a group reading allows the lane to be used. Returns false for null, for an object without windows, and
// for any window with a balance not above the reserve, even when another window has none; true for { unknown: true }
// and for a reading none of whose windows has a balance (it is used until a call fails for quota); otherwise true
// only if EVERY window with a balance has remaining > reserve.
function readingUsable(reading, reserve) {
  if (reading == null || typeof reading !== 'object') return false
  if (reading.unknown === true) return true
  if (reading.windows == null || typeof reading.windows !== 'object') return false
  const entries = Object.entries(reading.windows)
  if (entries.length === 0) return false
  return entries.every(([_, win]) => !hasBalance(win) || win.remaining > reserve)
}

// The view of a quota group at time `now` (epoch ms).
function groupView(reading, { reserve, now, mark = null }) {
  const isObject = reading != null && typeof reading === 'object'
  const usedPercentAbsent = Boolean(isObject && reading.usedPercentAbsent === true)
  const passedMark = mark ?? null

  const hasWindowsObj = Boolean(isObject && reading.windows != null && typeof reading.windows === 'object')
  const rawWinEntries = hasWindowsObj ? Object.entries(reading.windows) : []

  const unknown = !isObject ||
    reading.unknown === true ||
    !hasWindowsObj ||
    rawWinEntries.length === 0 ||
    rawWinEntries.some(([_, w]) => !hasBalance(w))

  // A window with a balance not above the reserve holds the group, even when another window of it has none: that one
  // makes the group unknown, which only lets it be used while nothing known says it is dry.
  const usable = passedMark === null && (
    !isObject || reading.unknown === true || rawWinEntries.every(([_, w]) => !hasBalance(w) || w.remaining > reserve)
  )

  const windows = {}
  let longest = null
  let longestTime = -Infinity
  let longestName = null
  let resetUnreadable = false

  if (hasWindowsObj) {
    for (const [name, win] of rawWinEntries) {
      const remaining = (win != null && typeof win.remaining === 'number' && Number.isFinite(win.remaining))
        ? win.remaining
        : null

      let resetsAt = null
      let hoursLeft = null
      let priority = null
      let resetTime = null

      if (win != null && win.resetsAt != null) {
        const d = new Date(win.resetsAt)
        if (!isNaN(d.getTime())) {
          resetTime = d.getTime()
          resetsAt = d.toISOString()
          const rawHours = (resetTime - now) / 3600000
          hoursLeft = Math.round(rawHours * 10) / 10 + 0
          if (remaining !== null) {
            priority = Number((remaining / Math.max(MIN_HOURS, rawHours)).toFixed(6))
          }
        } else {
          resetsAt = String(win.resetsAt)
        }
      }

      windows[name] = { remaining, resetsAt, hoursLeft, priority }

      if (resetTime === null) resetUnreadable = true
      else if (resetTime > longestTime) {
        longestTime = resetTime
        longestName = name
        longest = windows[name]
      }
    }
    // A window whose reset cannot be read may be the longest, so no other window can stand in for it: the 5 h window
    // would give a priority about ten times any weekly group's, against A4. The group has none, as when its only
    // window has no readable reset, and is ordered with the groups that have no reading.
    if (resetUnreadable) {
      longest = null
      longestName = null
    }
  }

  return {
    unknown,
    usable,
    priority: (unknown || longest === null) ? null : longest.priority,
    remaining: (unknown || longest === null) ? null : longest.remaining,
    resetsAt: longest !== null ? longest.resetsAt : null,
    hoursLeft: longest !== null ? longest.hoursLeft : null,
    windowName: longest !== null ? longestName : null,
    usedPercentAbsent,
    mark: passedMark,
    windows,
  }
}

module.exports = {
  MIN_HOURS,
  readingUsable,
  groupView,
}
