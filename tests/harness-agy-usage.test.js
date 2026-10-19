'use strict'

// agy's /usage as the reader sees it on 2026-10-14, captured with `agy -p /usage --output-format json` (a slash command:
// status SUCCESS, num_turns 0, no tokens, no model call): Gemini Models at 100% of the week (resets 2026-10-21 03:35 UTC),
// Claude and GPT models at 0.18% (resets 2026-10-16 04:41 UTC), both 5 h windows at 100% (reset 12:49 UTC).

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAgy } = require('../plugins/aether/lib/harness/agy.js')
const readings = require('../plugins/aether/lib/lane-readings.js')

const FIXTURE = path.join(__dirname, 'fixtures', 'agy-usage-2026-10-14.json')
const GROUPS = { flash: 'Gemini Models', claude: 'Claude and GPT models' }

test("the reader gives the two groups of agy's real /usage of 2026-10-14, each with its weekly and 5 h windows", () => {
  const calls = []
  const exec = (argv) => (calls.push(argv), { status: 0, stdout: fs.readFileSync(FIXTURE, 'utf8'), stderr: '' })
  const quota = createAgy({ command: '/opt/agy', groups: GROUPS, exec }).quota()
  assert.deepEqual(calls, [['/opt/agy', '-p', '/usage', '--output-format', 'json']])
  assert.deepEqual(quota, {
    groups: {
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
    },
  })
})

test('the capture is a command answer with no model call in it', () => {
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  assert.deepEqual([data.status, data.num_turns, data.usage.total_tokens, data.command.name], ['SUCCESS', 0, 0, 'usage'])
})

// A table group that /usage does not list has no reading. It must come back as unknown, never be absent: an absent
// group is judged as a quota failure by the runner, and it keeps the kept reading from ever holding.
function usageWithout(name) {
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  data.command.data.groups = data.command.data.groups.filter((group) => group.name !== name)
  return JSON.stringify(data)
}

// A group /usage lists with an empty bucket list has no reading either, and must come back the same way: with no
// windows it would be judged dry by the runner, which holds a group for 60 minutes without having read it so.
function usageWithEmptyBuckets(name) {
  const data = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  data.command.data.groups.find((group) => group.name === name).buckets = []
  return JSON.stringify(data)
}

test('a table group that /usage does not list is unknown, with no windows, and the listed one keeps its windows', () => {
  const exec = () => ({ status: 0, stdout: usageWithout('Claude and GPT models'), stderr: '' })
  const { groups } = createAgy({ command: '/opt/agy', groups: GROUPS, exec }).quota()
  assert.deepEqual(groups.claude, { unknown: true, windows: {} })
  assert.equal(groups.flash.windows.weekly.remaining, 1)
  assert.deepEqual(Object.keys(groups).sort(), ['claude', 'flash'])
})

test('a /usage that omits a table group is still read once inside the reading life', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-usage-omit-'))
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  let reads = 0
  const exec = () => (reads++, { status: 0, stdout: usageWithout('Claude and GPT models'), stderr: '' })
  const adapter = createAgy({ command: '/opt/agy', groups: GROUPS, exec })
  const settings = { quotaLifeMinutes: 10, groups: GROUPS }
  const at = Date.parse('2026-10-14T12:00:00Z')
  const first = readings.readGroups(adapter, { harness: 'agy', settings, dataDir, now: at })
  const second = readings.readGroups(adapter, { harness: 'agy', settings, dataDir, now: at + 5 * 60 * 1000 })
  assert.equal(reads, 1)
  assert.equal(first.cached, false)
  assert.equal(second.cached, true)
  assert.deepEqual(second.groups.claude, { unknown: true, windows: {} })
})

test('a table group that /usage lists with no buckets is unknown, with no windows, and the other one keeps its windows', () => {
  const exec = () => ({ status: 0, stdout: usageWithEmptyBuckets('Gemini Models'), stderr: '' })
  const { groups } = createAgy({ command: '/opt/agy', groups: GROUPS, exec }).quota()
  assert.deepEqual(groups.flash, { unknown: true, windows: {} })
  assert.equal(groups.claude.windows.weekly.remaining, 0.0017788000404834747)
  assert.deepEqual(Object.keys(groups).sort(), ['claude', 'flash'])
})

test('a /usage that lists a table group with no buckets is still read once inside the reading life', (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-usage-empty-'))
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  let reads = 0
  const exec = () => (reads++, { status: 0, stdout: usageWithEmptyBuckets('Gemini Models'), stderr: '' })
  const adapter = createAgy({ command: '/opt/agy', groups: GROUPS, exec })
  const settings = { quotaLifeMinutes: 10, groups: GROUPS }
  const at = Date.parse('2026-10-14T12:00:00Z')
  const first = readings.readGroups(adapter, { harness: 'agy', settings, dataDir, now: at })
  const second = readings.readGroups(adapter, { harness: 'agy', settings, dataDir, now: at + 5 * 60 * 1000 })
  assert.equal(reads, 1)
  assert.equal(first.cached, false)
  assert.equal(second.cached, true)
  assert.deepEqual(second.groups.flash, { unknown: true, windows: {} })
})
