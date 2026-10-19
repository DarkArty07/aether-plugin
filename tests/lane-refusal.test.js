'use strict'

// Issue 021 and decision A60: agy has three individual quotas (Argon, Flash, Claude and GPT) and /usage lists two groups,
// so the table keeps three keys and two of them read one /usage group; a call agy refuses with «Individual quota
// reached» leaves a mark on the key of the model that was refused, in the swarm's lane calls and in the design seats.
// The mark holds dryMarkMinutes (60), not the reset agy states, which was once wrong: the stated reset is kept in it.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo, runBin } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const marks = require('../plugins/aether/lib/lane-marks.js')
const { createAgy } = require('../plugins/aether/lib/harness/agy.js')
const { quotaRefusal, refusalIn } = require('../plugins/aether/lib/quota-refusal.js')
const { readAllMarks } = require('../plugins/aether/lib/router-marks.js')

const FIXTURE = path.join(__dirname, 'fixtures', 'agy-usage-2026-10-14.json')
const IMPLEMENT = 'task-1-1-implement'
const FEATURE = 'specs/001-demo'
const HOUR = 3600 * 1000
const MIN = 60 * 1000
const RESERVE = 0.05
// The refusal as agy 1.3.6 words it, with the reset it states: 163 h 22 min 27 s.
const REFUSAL = 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.'
const RESET_MS = (163 * 60 + 22) * MIN + 27 * 1000
const refuse = (extra = []) => [...extra, `FAKE-AGY: exit-error ${REFUSAL}`, 'FAKE-AGY: exit-code 3']
const flags = (digest) => ['--role', 'implementer', '--task', 'task-1', '--model', 'gemini-3.8-flash', '--effort', 'xhigh', '--digest', digest]

// A call of the swarm on gemini-3.8-flash (the Flash group), and its result.
function runFlashCall(t, lines, env) {
  const { args } = fx.laneRun(t)
  const digest = fx.writePrompt(args, IMPLEMENT, ['You are implementing task-1: Task 1 title.', ...lines].join('\n'))
  const start = fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  assert.equal(start.json.started, true, start.stdout + start.stderr)
  return { done: fx.waitDone(args, IMPLEMENT, env), args }
}

// A committed checkout with a spec, for a Judge round; the round's answer is the fake agy's.
function seatRepo(t) {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, FEATURE), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, FEATURE, 'spec.md'), '# Demo\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'spec')
  return repo
}

function judgeRound(repo, env, input) {
  const base = { ...process.env }
  for (const name of ['AETHER_SEATS', 'AETHER_LANE_HARNESSES', 'AETHER_LANES', 'CLAUDE_ENV_FILE']) delete base[name]
  const r = spawnSync(process.execPath, [fx.LANE_BIN, 'seat', 'judge', '--session', 's1', '--feature', FEATURE], { cwd: repo.dir, input, encoding: 'utf8', env: { ...base, ...env, AETHER_SEATS: 'balanced' } })
  return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()) }
}

test('the refusal is recognized, with the reset it states, in the text of a failed call', () => {
  assert.deepEqual(quotaRefusal(`exit 3: ${REFUSAL}`), { resetMs: RESET_MS })
  assert.deepEqual(quotaRefusal('Individual quota reached. Resets in 45m.'), { resetMs: 45 * MIN })
  assert.deepEqual(quotaRefusal('Individual quota reached.'), { resetMs: null })
  assert.equal(quotaRefusal('exit 1: model not found: gemini-9'), null)
  assert.equal(quotaRefusal(undefined), null)
  assert.deepEqual(refusalIn('exit 1: other', '', `Error: ${REFUSAL}`), { resetMs: RESET_MS }, 'the first text that holds it')
  assert.equal(refusalIn('exit 1: other', null), null)
})

test('two keys of the table may read one /usage group: each gets its windows, and a group that is not listed is unknown for all its keys', () => {
  const groups = { argon: 'Gemini Models', flash: 'Gemini Models', claude: 'Claude and GPT models' }
  const exec = () => ({ status: 0, stdout: fs.readFileSync(FIXTURE, 'utf8'), stderr: '' })
  const { groups: read } = createAgy({ command: 'agy', groups, exec }).quota()
  assert.deepEqual(Object.keys(read).sort(), ['argon', 'claude', 'flash'])
  assert.deepEqual(read.argon, read.flash)
  assert.equal(read.argon.windows.weekly.remaining, 1)
  assert.notEqual(read.argon.windows, read.flash.windows, 'each key has its own copy')
  assert.notDeepEqual(read.claude, read.flash)

  const noGemini = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  noGemini.command.data.groups = noGemini.command.data.groups.filter((group) => group.name !== 'Gemini Models')
  const partial = createAgy({ command: 'agy', groups, exec: () => ({ status: 0, stdout: JSON.stringify(noGemini), stderr: '' }) }).quota().groups
  assert.deepEqual([partial.argon, partial.flash], [{ unknown: true, windows: {} }, { unknown: true, windows: {} }])
  assert.equal(partial.claude.unknown, undefined)
})

test('the shipped table has three agy keys, two of them reading «Gemini Models», and each model belongs to its own', () => {
  const agy = lanes.loadConfig(lanes.CONFIG_FILE).harnesses.agy
  assert.deepEqual(agy.groups, { argon: 'Gemini Models', flash: 'Gemini Models', claude: 'Claude and GPT models' })
  assert.deepEqual(Object.fromEntries(Object.entries(agy.models).map(([id, model]) => [id, model.group])), {
    'gemini-3.8-flash': 'flash',
    'claude-sonnet-5-5': 'claude',
    'claude-opus-5-5': 'claude',
    'gemini-4-argon': 'argon',
  })
})

test('a refusal marks the key of the refused model for 60 minutes, though it states 163 h, and keeps the stated reset', () => {
  const dataDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aether-refusal-'))
  const now = Date.now()
  const mark = marks.markDry(dataDir, { harness: 'agy', group: 'argon', reserve: RESERVE, now, refusal: quotaRefusal(REFUSAL) })
  assert.deepEqual([mark.confirmed, mark.reason, mark.until, mark.resetsAt, mark.statedResetMs], [false, 'quota refusal', now + 60 * MIN, null, RESET_MS])
  assert.notEqual(marks.liveMark(dataDir, 'agy', 'argon', now + 59 * MIN), null)
  assert.equal(marks.liveMark(dataDir, 'agy', 'argon', now + 61 * MIN), null, 'an hour later the group is tried again')
  assert.equal(marks.liveMark(dataDir, 'agy', 'flash'), null)
  assert.equal(marks.liveMark(dataDir, 'agy', 'claude'), null)
  // The length is the one the caller gives (the table's dryMarkMinutes), and a refusal that states no reset keeps none.
  const short = marks.markDry(dataDir, { harness: 'agy', group: 'flash', reserve: RESERVE, now, minutes: 15, refusal: { resetMs: 30 * 24 * HOUR } })
  assert.deepEqual([short.until - now, short.statedResetMs], [15 * MIN, 30 * 24 * HOUR])
  const plain = marks.markDry(dataDir, { harness: 'agy', group: 'claude', reserve: RESERVE, now, refusal: { resetMs: null } })
  assert.deepEqual([plain.until - now, plain.statedResetMs], [marks.DEFAULT_MARK_MINUTES * MIN, null])
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('a reading with balance does not lift the mark of a refusal, nor shorten it', () => {
  const dataDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aether-refusal-'))
  const now = Date.now()
  const held = marks.markDry(dataDir, { harness: 'agy', group: 'argon', reserve: RESERVE, now, refusal: quotaRefusal(REFUSAL) })
  const balance = { windows: { '5h': { remaining: 0.98, resetsAt: new Date(now + 4 * HOUR).toISOString() }, weekly: { remaining: 0.99, resetsAt: new Date(now + 160 * HOUR).toISOString() } } }
  assert.deepEqual(marks.markDry(dataDir, { harness: 'agy', group: 'argon', reading: balance, reserve: RESERVE, now: now + MIN }), held)
  assert.deepEqual(marks.markDry(dataDir, { harness: 'agy', group: 'argon', reading: { unknown: true, windows: {} }, reserve: RESERVE, now: now + 2 * MIN }), held)
  assert.deepEqual(marks.liveMark(dataDir, 'agy', 'argon', now + 3 * MIN), held)
  // A reading that shows the group under the reserve, with its reset, is another matter: it replaces the mark.
  const dry = { windows: { weekly: { remaining: 0.01, resetsAt: new Date(now + 40 * HOUR).toISOString() } } }
  assert.equal(marks.markDry(dataDir, { harness: 'agy', group: 'argon', reading: dry, reserve: RESERVE, now: now + 4 * MIN }).confirmed, true)
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('a swarm call agy refuses leaves the mark of Flash alone for an hour, though /usage shows balance, and the next start skips it', (t) => {
  const env = fx.laneEnv(t)
  const { done, args } = runFlashCall(t, refuse(), env)
  assert.equal(done.status, 'quota', done.detail)
  assert.match(done.detail, /^exit 3: Individual quota reached/)
  const mark = marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'flash')
  assert.deepEqual([mark.confirmed, mark.reason, mark.until - mark.at, mark.statedResetMs], [false, 'quota refusal', 60 * MIN, RESET_MS])
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'argon'), null)
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'claude'), null)
  assert.equal(done.lane.quota.usable, false, 'the result says the group is held by its mark, whatever /usage shows')

  // The next start finds the mark and goes native, without reading /usage again for it; a reading with balance (every
  // window of the fake is at 90 %) shows in the status beside the mark and does not lift it.
  const before = fx.agyCalls(env).length
  const digest = fx.writePrompt(args, 'task-1-2-implement', 'again')
  assert.deepEqual(fx.lane(args, 'start', ['task-1-2-implement', ...flags(digest)], env).json, { unavailable: 'quota' })
  assert.equal(fx.agyCalls(env).length, before)
  const agy = fx.lane(args, 'status', [], env).json.harnesses.agy
  assert.deepEqual([agy.groups.flash.usable, agy.groups.flash.windows.weekly.remaining, agy.groups.argon.usable, agy.groups.argon.mark], [false, 0.9, true, null])
  assert.equal(agy.groups.flash.mark.reason, 'quota refusal')
  const text = runBin(fx.LANE_BIN, ['quota', 'agy'], args.repoRoot, env).stdout
  assert.match(text, /flash, "Gemini Models": not usable, dry mark until .*, 60 minutes after agy refused a call for its individual quota \(agy stated a reset in 163 h, not trusted\)\n/)
  assert.match(text, /argon, "Gemini Models": usable/)
})

test('a seat round on Argon that agy refuses marks Argon only, and the next round skips it for the native agent while Flash stays usable', (t) => {
  const repo = seatRepo(t)
  const env = fx.laneEnv(t)
  const first = judgeRound(repo, env, `Review.\n${refuse().join('\n')}\n`)
  assert.equal(first.status, 4, JSON.stringify(first.json))
  assert.equal(first.json.failed, 'quota')
  const mark = marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'argon')
  assert.deepEqual([mark.confirmed, mark.reason, mark.until - mark.at, mark.statedResetMs], [false, 'quota refusal', 60 * MIN, RESET_MS])
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'flash'), null, 'Flash has a quota of its own')
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'claude'), null)

  const turns = fx.agyTurns(env).length
  const second = judgeRound(repo, env, 'Review.\n')
  assert.equal(second.status, 3, JSON.stringify(second.json))
  assert.deepEqual(second.json.tried, [{ model: 'agy/gemini-4-argon', reason: 'quota' }])
  assert.equal(fx.agyTurns(env).length, turns, 'the held group is not called again')

  // Flash is still a lane for the swarm: its call goes through while Argon is held.
  const { done } = runFlashCall(t, ['FAKE-AGY: answer ' + JSON.stringify({ status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' })], env)
  assert.equal(done.status, 'ok', done.detail)
})

test('chooseSeat leaves out a group a mark holds, without reading its quota', () => {
  const seats = require('../plugins/aether/lib/seats.js')
  const config = lanes.loadConfig(lanes.CONFIG_FILE)
  const fine = { windows: { weekly: { remaining: 0.9, resetsAt: 'a' } } }
  const quota = () => assert.fail('a held group is not read')
  const options = { choice: 'balanced', seat: 'judge', enabled: ['agy'], installed: () => true }
  assert.deepEqual(seats.chooseSeat(config, { ...options, quota, marked: (harness, group) => harness === 'agy' && group === 'argon' }).tried, [{ model: 'agy/gemini-4-argon', reason: 'quota' }])
  assert.equal(seats.chooseSeat(config, { ...options, quota: () => fine, marked: (harness, group) => group === 'flash' }).external.group, 'argon')
})

test('a mark file of a group the table no longer has (agy__gemini.json) is ignored by every reader, and nothing is deleted', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  const orphan = marks.markFile(env.AETHER_DATA_DIR, 'agy', 'gemini')
  fs.mkdirSync(path.dirname(orphan), { recursive: true })
  const body = JSON.stringify({ harness: 'agy', group: 'gemini', at: Date.now(), until: Date.now() + 5 * 24 * HOUR, confirmed: true, resetsAt: null, usedPercentAbsent: false })
  fs.writeFileSync(orphan, body)

  const quota = runBin(fx.LANE_BIN, ['quota', 'agy', '--json'], args.repoRoot, env)
  assert.equal(quota.status, 0, quota.stdout + quota.stderr)
  const shown = quota.json.harnesses.agy.groups
  assert.deepEqual(Object.keys(shown), ['argon', 'flash', 'claude'])
  assert.ok(Object.values(shown).every((group) => group.mark === null && group.usable === true))
  const status = fx.lane(args, 'status', [], env)
  assert.equal(status.status, 0, status.stdout + status.stderr)
  assert.deepEqual(status.json.marks, [])
  assert.ok(Object.values(status.json.harnesses.agy.groups).every((group) => group.mark === null))
  assert.equal(quota.stdout.includes('gemini,'), false)

  const known = lanes.groupKnown(lanes.loadConfig(lanes.CONFIG_FILE))
  assert.equal(marks.liveMarks(env.AETHER_DATA_DIR).length, 1, 'the file is still on disk')
  assert.deepEqual(readAllMarks(env.AETHER_DATA_DIR, Date.now(), known), [])
  assert.equal(fs.readFileSync(orphan, 'utf8'), body)
  // A call and a seat on the removed key's models start as if it were not there.
  const { done } = runFlashCall(t, ['FAKE-AGY: answer ' + JSON.stringify({ status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' })], env)
  assert.equal(done.status, 'ok', done.detail)
})
