'use strict'

// Pure order rules and group views for quota-aware lanes (spec 002, R9 to R12).
// Determines lane priority and orders call candidates without external I/O or clock access.

const MIN_HOURS = 1

// Whether a group reading allows the lane to be used. Returns false for null, for an object
// without windows, and for any window under reserve; true for { unknown: true } and for any
// reading with a non-numeric window balance; otherwise true only if EVERY window has remaining > reserve.
function readingUsable(reading, reserve) {
  if (reading == null || typeof reading !== 'object') return false
  if (reading.unknown === true) return true
  if (reading.windows == null || typeof reading.windows !== 'object') return false
  const entries = Object.entries(reading.windows)
  if (entries.length === 0) return false
  const hasNonNumeric = entries.some(([_, win]) => win == null || typeof win.remaining !== 'number' || !Number.isFinite(win.remaining))
  if (hasNonNumeric) return true
  return entries.every(([_, win]) => win != null && typeof win.remaining === 'number' && Number.isFinite(win.remaining) && win.remaining > reserve)
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
    rawWinEntries.some(([_, w]) => w == null || typeof w.remaining !== 'number' || !Number.isFinite(w.remaining))

  const usable = passedMark === null && (
    unknown || rawWinEntries.every(([_, w]) => w != null && typeof w.remaining === 'number' && Number.isFinite(w.remaining) && w.remaining > reserve)
  )

  const windows = {}
  let longest = null
  let longestTime = -Infinity
  let longestName = null

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

      if (resetTime !== null && resetTime > longestTime) {
        longestTime = resetTime
        longestName = name
        longest = windows[name]
      }
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

// The candidates of a call from calls[role][tier].
function candidatesOf(calls, role, tier, defaultHarness = null) {
  if (calls == null || typeof calls !== 'object') return []
  const byRole = calls[role]
  if (byRole == null || typeof byRole !== 'object') return []
  const raw = byRole[tier]
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list
    .filter((lane) => lane != null && typeof lane === 'object')
    .map((lane) => ({
      ...lane,
      harness: lane.harness ?? defaultHarness,
    }))
}

// Orders candidates according to quota readings and exclusion rules.
function orderCandidates(candidates, harnesses) {
  if (!Array.isArray(candidates)) return { ordered: [], excluded: [] }

  const orderedPriority = []
  const orderedUnknown = []
  const excluded = []

  candidates.forEach((c, index) => {
    const harnessInfo = (harnesses != null && typeof harnesses === 'object') ? harnesses[c.harness] : null
    const view = (harnessInfo != null && harnessInfo.groups != null && typeof harnessInfo.groups === 'object')
      ? harnessInfo.groups[c.group]
      : null

    let why = null
    if (harnessInfo != null && harnessInfo.installed === false) {
      why = 'not-installed'
    } else if (view != null && view.mark != null) {
      why = 'marked'
    } else if (view != null && view.dryInRun === true) {
      why = 'dry'
    } else if (view != null && view.usable === false) {
      why = 'reserve'
    }

    const priorityVal = (view != null && typeof view.priority === 'number' && Number.isFinite(view.priority))
      ? view.priority
      : null
    const resetsAt = (view != null && view.resetsAt != null) ? view.resetsAt : null
    const usedPercentAbsent = Boolean(view != null && view.usedPercentAbsent === true)

    if (why !== null) {
      excluded.push({
        harness: c.harness,
        model: c.model,
        group: c.group,
        state: 'excluded',
        priority: priorityVal,
        resetsAt,
        usedPercentAbsent,
        why,
      })
      return
    }

    const isPriority = view != null && view.unknown !== true && priorityVal !== null
    if (isPriority) {
      orderedPriority.push({
        harness: c.harness,
        model: c.model,
        group: c.group,
        state: 'priority',
        priority: priorityVal,
        resetsAt,
        usedPercentAbsent,
        why: null,
        index,
      })
    } else {
      orderedUnknown.push({
        harness: c.harness,
        model: c.model,
        group: c.group,
        state: 'unknown',
        priority: null,
        resetsAt,
        usedPercentAbsent,
        why: null,
        index,
      })
    }
  })

  orderedPriority.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority
    }
    const dateA = a.resetsAt != null ? Date.parse(a.resetsAt) : NaN
    const dateB = b.resetsAt != null ? Date.parse(b.resetsAt) : NaN
    const validA = !isNaN(dateA)
    const validB = !isNaN(dateB)
    if (validA && validB) {
      if (dateA !== dateB) return dateA - dateB
    } else if (validA) {
      return -1
    } else if (validB) {
      return 1
    }
    return a.index - b.index
  })

  const ordered = [...orderedPriority, ...orderedUnknown].map(({ index, ...entry }) => entry)

  return { ordered, excluded }
}

module.exports = {
  MIN_HOURS,
  readingUsable,
  groupView,
  candidatesOf,
  orderCandidates,
}
