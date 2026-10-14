'use strict'

// agy's /usage as the reader sees it on 2026-10-14, captured with `agy -p /usage --output-format json` (a slash command:
// status SUCCESS, num_turns 0, no tokens, no model call): Gemini Models at 100% of the week (resets 2026-10-21 03:35 UTC),
// Claude and GPT models at 0.18% (resets 2026-10-16 04:41 UTC), both 5 h windows at 100% (reset 12:49 UTC).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createAgy } = require('../plugins/aether/lib/harness/agy.js')

const FIXTURE = path.join(__dirname, 'fixtures', 'agy-usage-2026-10-14.json')
const GROUPS = { gemini: 'Gemini Models', claude: 'Claude and GPT models' }

test("the reader gives the two groups of agy's real /usage of 2026-10-14, each with its weekly and 5 h windows", () => {
  const calls = []
  const exec = (argv) => (calls.push(argv), { status: 0, stdout: fs.readFileSync(FIXTURE, 'utf8'), stderr: '' })
  const quota = createAgy({ command: '/opt/agy', groups: GROUPS, exec }).quota()
  assert.deepEqual(calls, [['/opt/agy', '-p', '/usage', '--output-format', 'json']])
  assert.deepEqual(quota, {
    groups: {
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
    },
  })
})

test('the capture is a command answer with no model call in it', () => {
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  assert.deepEqual([data.status, data.num_turns, data.usage.total_tokens, data.command.name], ['SUCCESS', 0, 0, 'usage'])
})
