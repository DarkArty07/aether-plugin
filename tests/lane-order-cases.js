'use strict'

// The cases of the order rule (spec 002, R9 to R12), as data: the workflow's copy of the rule and lib/lane-order.js
// both run them (tests/lane-order.test.js, tests/workflow-order.test.js). `harnesses` has the shape of
// `aether-lane status`: per harness, whether it is installed and, per group, the view of its reading.
// `ordered` lists harness:model in the order the rule gives; `excluded` lists harness:model:why in table order.

const NOW = Date.parse('2026-10-14T06:08:00Z')

// What agy's /usage and grok's log gave on 2026-10-14, as readings (the shape the adapters return).
const READINGS = {
  flash: {
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

const agy = (groups) => ({ installed: true, groups })
const FLASH = { harness: 'agy', model: 'gemini-3.8-flash', group: 'flash' }
const SONNET = { harness: 'agy', model: 'claude-sonnet-5-5', group: 'claude' }
const GROK_47 = { harness: 'grok', model: 'grok-4.7', group: 'grok' }
const CODEX = { harness: 'codex', model: 'gpt-codex', group: 'codex' }
const TODAY = { agy: agy({ flash: GEMINI, claude: CLAUDE_LOW }), grok: { installed: true, groups: { grok: GROK } } }

const CASES = [
  {
    name: 'today, an implementer of the haiku tier: Grok before Gemini',
    candidates: [FLASH, GROK_47],
    harnesses: TODAY,
    ordered: ['grok:grok-4.7', 'agy:gemini-3.8-flash'],
    excluded: [],
  },
  {
    name: 'today, a call of the sonnet tier: the only candidate is under the reserve',
    candidates: [SONNET],
    harnesses: TODAY,
    ordered: [],
    excluded: ['agy:claude-sonnet-5-5:reserve'],
  },
  {
    name: 'after the reset of the Claude group, the sonnet call goes to Claude in agy',
    candidates: [SONNET],
    harnesses: { agy: agy({ claude: view(0.0066, '2026-10-23T04:41:07.000Z') }) },
    ordered: ['agy:claude-sonnet-5-5'],
    excluded: [],
  },
  {
    name: 'a group with no reading goes after the groups with one, in the order of harnesses',
    candidates: [GROK_47, FLASH],
    harnesses: { agy: agy({ flash: GEMINI }), grok: { installed: true, groups: { grok: NO_READING } } },
    ordered: ['agy:gemini-3.8-flash', 'grok:grok-4.7'],
    excluded: [],
  },
  {
    name: 'a group whose balance is unknown but whose reset is known is a group with no reading',
    candidates: [GROK_47, FLASH],
    harnesses: {
      agy: agy({ flash: GEMINI }),
      grok: { installed: true, groups: { grok: { unknown: true, usable: true, priority: null, remaining: null, resetsAt: '2026-10-17T09:08:51.805Z' } } },
    },
    ordered: ['agy:gemini-3.8-flash', 'grok:grok-4.7'],
    excluded: [],
  },
  {
    name: 'a window under the reserve holds its group even when another window of it has no balance',
    candidates: [SONNET, FLASH],
    harnesses: { agy: agy({ claude: HALF, flash: GEMINI }) },
    ordered: ['agy:gemini-3.8-flash'],
    excluded: ['agy:claude-sonnet-5-5:reserve'],
  },
  {
    name: 'a group whose longest window cannot be read has no priority: it goes after the groups with one, not before them',
    candidates: [FLASH, GROK_47],
    harnesses: { agy: agy({ flash: NO_LONGEST }), grok: { installed: true, groups: { grok: GROK } } },
    ordered: ['grok:grok-4.7', 'agy:gemini-3.8-flash'],
    excluded: [],
  },
  {
    name: 'a harness with no reader goes after the groups with a reading, and keeps the order of harnesses among its kind',
    candidates: [CODEX, FLASH],
    harnesses: { agy: agy({ flash: GEMINI }), codex: { installed: true, groups: { codex: NO_READING } } },
    ordered: ['agy:gemini-3.8-flash', 'codex:gpt-codex'],
    excluded: [],
  },
  {
    name: 'nothing usable: no candidate is left, and each says why',
    candidates: [FLASH, GROK_47],
    harnesses: {
      agy: agy({ flash: view(0.0004, '2026-10-21T03:35:44.000Z', { usable: false }) }),
      grok: { installed: true, groups: { grok: view(0.0004, '2026-10-17T09:08:51.805Z', { usable: false }) } },
    },
    ordered: [],
    excluded: ['agy:gemini-3.8-flash:reserve', 'grok:grok-4.7:reserve'],
  },
  {
    name: 'the highest priority goes first even when another group resets sooner: the quota that could be wasted is the one with the most left per hour',
    candidates: [GROK_47, FLASH],
    harnesses: {
      agy: agy({ flash: GEMINI }),
      // Grok resets on the 17th with 5% of the week left (0.05 / 75 h); Gemini on the 21st with all of it (1 / 165 h).
      grok: { installed: true, groups: { grok: view(0.000667, '2026-10-17T09:08:51.805Z') } },
    },
    ordered: ['agy:gemini-3.8-flash', 'grok:grok-4.7'],
    excluded: [],
  },
  {
    name: 'a tie in priority goes to the nearer reset',
    candidates: [FLASH, GROK_47],
    harnesses: {
      agy: agy({ flash: view(0.01, '2026-10-20T00:00:00.000Z') }),
      grok: { installed: true, groups: { grok: view(0.01, '2026-10-18T00:00:00.000Z') } },
    },
    ordered: ['grok:grok-4.7', 'agy:gemini-3.8-flash'],
    excluded: [],
  },
  {
    name: 'a tie in priority and in reset goes to the order of harnesses',
    candidates: [FLASH, GROK_47],
    harnesses: {
      agy: agy({ flash: view(0.01, '2026-10-20T00:00:00.000Z') }),
      grok: { installed: true, groups: { grok: view(0.01, '2026-10-20T00:00:00.000Z') } },
    },
    ordered: ['agy:gemini-3.8-flash', 'grok:grok-4.7'],
    excluded: [],
  },
  {
    name: 'a group with a dry mark is left out, whatever else it reads',
    candidates: [FLASH, GROK_47],
    harnesses: {
      agy: agy({ flash: GEMINI }),
      grok: { installed: true, groups: { grok: { ...GROK, usable: false, mark: { harness: 'grok', group: 'grok', until: 1760000000000 } } } },
    },
    ordered: ['agy:gemini-3.8-flash'],
    excluded: ['grok:grok-4.7:marked'],
  },
  {
    name: 'a group that ran dry earlier in the run is left out',
    candidates: [FLASH, GROK_47],
    harnesses: { agy: agy({ flash: { ...GEMINI, dryInRun: true } }), grok: { installed: true, groups: { grok: GROK } } },
    ordered: ['grok:grok-4.7'],
    excluded: ['agy:gemini-3.8-flash:dry'],
  },
  {
    name: 'a harness that is not installed is left out',
    candidates: [FLASH, GROK_47],
    harnesses: { agy: { installed: false, groups: {} }, grok: { installed: true, groups: { grok: GROK } } },
    ordered: ['grok:grok-4.7'],
    excluded: ['agy:gemini-3.8-flash:not-installed'],
  },
  {
    name: 'a status that gives no priority keeps the order of harnesses',
    candidates: [FLASH, GROK_47],
    harnesses: { agy: agy({ flash: { usable: true } }), grok: { installed: true, groups: { grok: { usable: true } } } },
    ordered: ['agy:gemini-3.8-flash', 'grok:grok-4.7'],
    excluded: [],
  },
  {
    name: 'a harness missing from the reading is a harness with no reading, not a harness left out',
    candidates: [FLASH, GROK_47],
    harnesses: {},
    ordered: ['agy:gemini-3.8-flash', 'grok:grok-4.7'],
    excluded: [],
  },
]

module.exports = { NOW, READINGS, GEMINI, CLAUDE_LOW, GROK, NO_READING, HALF_READING, HALF, NO_LONGEST_READING, NO_LONGEST, CASES }
