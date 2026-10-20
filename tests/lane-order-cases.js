'use strict'

// Pure group views and readings for quota-aware lanes (spec 002, R9 to R12), as data for tests/lane-order.test.js.

const NOW = Date.parse('2026-10-14T06:08:00Z')

// What agy's /usage and grok's log gave on 2026-10-14, as readings (the shape the adapters return).
const READINGS = {
  gemini: {
    windows: {
      weekly: { remaining: 1, resetsAt: '2026-10-21T03:35:44Z' },
      '5h': { remaining: 1, resetsAt: '2026-10-14T12:49:06Z' },
    },
  },
  claude: {
    windows: {
      weekly: { remaining: 0.0017788000404834747, resetsAt: '2026-10-16T04:41:07Z' },
      '5h': { remaining: 1, resetsAt: '2026-10-14T12:49:06Z' },
    },
  },
  grok: {
    windows: { weekly: { remaining: 1, resetsAt: '2026-10-17T09:08:51.805Z' } },
    usedPercent: null,
    usedPercentAbsent: true,
  },
}

const view = (priority, resetsAt, extra = {}) => ({ unknown: false, usable: true, priority, resetsAt, ...extra })
const NO_READING = { unknown: true, usable: true, priority: null, resetsAt: null }

// Two readings that are not from the capture, with the views they give. Half a reading: the weekly window is under the
// reserve and the 5 h window has no balance, so the group is unknown yet not usable (R10: every window must be above the
// reserve, and one known to be under it holds the group). No longest window: the weekly window has no readable reset, so
// the 5 h window cannot be taken for the longest, and the group has no priority (A4: the weekly window defines the risk).
const HALF_READING = {
  windows: {
    weekly: { remaining: 0.0017788000404834747, resetsAt: '2026-10-16T04:41:07Z' },
    '5h': { remaining: null, resetsAt: '2026-10-14T12:49:06Z' },
  },
}
const NO_LONGEST_READING = {
  windows: {
    weekly: { remaining: 1, resetsAt: null },
    '5h': { remaining: 1, resetsAt: '2026-10-14T12:49:06Z' },
  },
}

// The group views those readings give at NOW.
const GEMINI = view(0.006044, '2026-10-21T03:35:44.000Z')
const CLAUDE_LOW = view(0.000038, '2026-10-16T04:41:07.000Z', { usable: false })
const GROK = view(0.013331, '2026-10-17T09:08:51.805Z', { usedPercentAbsent: true })
const HALF = { unknown: true, usable: false, priority: null, remaining: null, resetsAt: '2026-10-16T04:41:07.000Z' }
const NO_LONGEST = { unknown: false, usable: true, priority: null, remaining: null, resetsAt: null }

module.exports = { NOW, READINGS, GEMINI, CLAUDE_LOW, GROK, NO_READING, HALF_READING, HALF, NO_LONGEST_READING, NO_LONGEST }
