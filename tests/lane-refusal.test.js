'use strict'

// Issue 021, issue 015 and decision A60. agy's /usage lists two groups and its refusal («Individual quota reached») is
// the only sign of an individual limit, so:
//   - the table may have several keys read one /usage group (the shipped table has `argon` and `flash`, both reading
//     «Gemini Models», so a refusal of one does not hold the other: issue 038);
//   - a call agy refuses leaves a mark on the key of the model that was refused, in the swarm's lane calls and in the
//     design seats, that holds dryMarkMinutes (60), not the reset agy states, which was once wrong: it is kept in the mark;
//     a design seat reads the key of its pair in the pairs table, so a split table needs a split pairs table too;
//   - a mark that came from a reading is lifted by a fresh healthy reading, and a refusal's mark never is;
//   - an unconfirmed mark cannot hold longer than 60 minutes whatever its file says;
//   - a mark of a key the table does not have is ignored.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo, runBin } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const marks = require('../plugins/aether/lib/lane-marks.js')
const seats = require('../plugins/aether/lib/seats.js')
const { createAgy } = require('../plugins/aether/lib/harness/agy.js')
const { quotaRefusal, refusalIn } = require('../plugins/aether/lib/quota-refusal.js')
const { readAllMarks } = require('../plugins/aether/lib/router-marks.js')
const { formatReport } = require('../plugins/aether/lib/lane-quota.js')

const FIXTURE = path.join(__dirname, 'fixtures', 'agy-usage-2026-10-14.json')
const IMPLEMENT = 'task-1-1-implement'
const FEATURE = 'specs/001-demo'
const HOUR = 3600 * 1000
const MIN = 60 * 1000
const RESERVE = 0.05
const LIFE = 10 * MIN
// The refusal as agy 1.3.6 words it, with the reset it states: 163 h 22 min 27 s.
const REFUSAL = 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.'
// The 429 a real Muse call failed with (issue 75), with the reset it states.
const MUSE_429 = 'API error 429 [request_id=req-75]: Subscription quota exhausted. Your usage window resets at 2026-10-26T00:00:00Z. (rate_limit_error)'
const RESET_MS = (163 * 60 + 22) * MIN + 27 * 1000
const refuse = (extra = []) => [...extra, `FAKE-AGY: exit-error ${REFUSAL}`, 'FAKE-AGY: exit-code 3']
const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' })
const APPROVE = JSON.stringify({ verdict: 'approve', findings: [], openQuestions: [] })
const flags = (digest) => ['--role', 'implementer', '--task', 'task-1', '--model', 'gemini-3.8-flash', '--effort', 'xhigh', '--digest', digest]
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aether-refusal-'))
// What the fake agy's /usage reports so that Gemini's weekly window resets before the Claude and GPT one: Argon takes
// the Judge, as it does when the quota that renews first is Gemini's.
const geminiFirst = () => ({
  'Gemini Models': [0.9, 0.9, null, new Date(Date.now() + 2 * 24 * HOUR).toISOString()],
  'Claude and GPT models': [0.9, 0.9, null, new Date(Date.now() + 3 * 24 * HOUR).toISOString()],
})
const healthy = (readAt = Date.now()) => ({ windows: { '5h': { remaining: 0.98, resetsAt: new Date(readAt + 4 * HOUR).toISOString() }, weekly: { remaining: 0.99, resetsAt: new Date(readAt + 160 * HOUR).toISOString() } } })
const dry = (readAt = Date.now()) => ({ windows: { weekly: { remaining: 0.01, resetsAt: new Date(readAt + 40 * HOUR).toISOString() } } })

// A call of the swarm on gemini-3.8-flash, and its result.
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
  for (const name of ['AETHER_SUPERDELEGATION', 'AETHER_LANE_HARNESSES', 'CLAUDE_ENV_FILE']) delete base[name]
  const r = spawnSync(process.execPath, [fx.LANE_BIN, 'seat', 'judge', '--session', 's1', '--feature', FEATURE], { cwd: repo.dir, input, encoding: 'utf8', env: { ...base, ...env } })
  return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()) }
}

// ---- the refusal ----

test('the refusal is recognized, with the reset it states, in the text of a failed call', () => {
  assert.deepEqual(quotaRefusal(`exit 3: ${REFUSAL}`), { resetMs: RESET_MS })
  assert.deepEqual(quotaRefusal('Individual quota reached. Resets in 45m.'), { resetMs: 45 * MIN })
  assert.deepEqual(quotaRefusal('Individual quota reached.'), { resetMs: null })
  assert.equal(quotaRefusal('exit 1: model not found: gemini-9'), null)
  assert.equal(quotaRefusal(undefined), null)
  assert.deepEqual(refusalIn('exit 1: other', '', `Error: ${REFUSAL}`), { resetMs: RESET_MS }, 'the first text that holds it')
  assert.equal(refusalIn('exit 1: other', null), null)
})

test('issue 75: Muse\'s subscription-quota 429 is a refusal, with the reset it states kept as stated, and any other 429 is not', () => {
  assert.deepEqual(quotaRefusal(MUSE_429), { resetMs: null, resetsAt: '2026-10-26T00:00:00.000Z' })
  assert.deepEqual(refusalIn(`muse modelError: ${MUSE_429}`), { resetMs: null, resetsAt: '2026-10-26T00:00:00.000Z' })
  // A 429 or a rate_limit_error that does not say the subscription quota is exhausted stays a plain failure.
  assert.equal(quotaRefusal('API error 429 [request_id=req-1]: Too many requests, slow down. (rate_limit_error)'), null)
  assert.equal(quotaRefusal('API error 429: rate_limit_error'), null)
  assert.equal(quotaRefusal('Subscription quota exhausted.'), null, 'the phrase without rate_limit_error is not the 429 that was seen')
  // The mark holds 60 minutes (A60), not until the stated reset, which is kept only for people to read (A75).
  const dataDir = tmp()
  const now = Date.now()
  const mark = marks.markDry(dataDir, { harness: 'muse', group: 'muse', reserve: RESERVE, now, refusal: quotaRefusal(MUSE_429) })
  assert.deepEqual([mark.confirmed, mark.reason, mark.until, mark.resetsAt, mark.statedResetMs, mark.statedResetAt], [false, 'quota refusal', now + 60 * MIN, null, null, '2026-10-26T00:00:00.000Z'])
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('issue 037: the reset is read whatever the case of the units and with spaces between the parts, and a duration the reader cannot place states none', () => {
  const said = (duration) => quotaRefusal(`Individual quota reached. Resets in ${duration}.`)
  assert.deepEqual(said('163H22M27S'), { resetMs: 588147000 })
  assert.deepEqual(said('1D2H'), { resetMs: 26 * 60 * MIN })
  assert.deepEqual(said('2h 30m'), { resetMs: 150 * MIN })
  assert.deepEqual(said('1d 2h 3m 4s'), { resetMs: ((26 * 60 + 3) * 60 + 4) * 1000 })
  assert.deepEqual(said('2H  30M'), { resetMs: 150 * MIN })
  // The lowercase forms are read as before.
  assert.deepEqual(said('163h22m27s'), { resetMs: 588147000 })
  assert.deepEqual(said('45m'), { resetMs: 45 * MIN })
  // Decimals, parts out of order, a bare number and nothing at all give the refusal and no stated reset.
  for (const duration of ['1.5h', '30m 2h', '2h 30', '90', '']) assert.deepEqual(said(duration), { resetMs: null }, duration)
  assert.deepEqual(quotaRefusal('Individual quota reached. Resets in'), { resetMs: null })
})

test('a refusal marks the key of the refused model for 60 minutes, though it states 163 h, and keeps the stated reset', () => {
  const dataDir = tmp()
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

test('issue 063: a refusal whose own reading shows a window used up holds the group until that window resets, and the stated reset is still not read', () => {
  const dataDir = tmp()
  const now = Date.now()
  const used = { windows: { '5h': { remaining: 0, resetsAt: new Date(now + 3 * HOUR).toISOString() }, weekly: { remaining: 0.83, resetsAt: new Date(now + 100 * HOUR).toISOString() } } }
  const dry = marks.markDry(dataDir, { harness: 'agy', group: 'argon', reading: used, reserve: RESERVE, now, refusal: quotaRefusal(REFUSAL) })
  assert.deepEqual([dry.confirmed, dry.reason, dry.until, dry.resetsAt, dry.statedResetMs], [true, 'quota refusal', now + 3 * HOUR, new Date(now + 3 * HOUR).toISOString(), RESET_MS])
  assert.notEqual(marks.liveMark(dataDir, 'agy', 'argon', now + 2 * HOUR), null, 'still held two hours on')
  assert.equal(marks.liveMark(dataDir, 'agy', 'argon', now + 3 * HOUR + MIN), null, 'and free once the window has reset')
  const shown = formatReport({ time: new Date(now).toISOString(), reserve: RESERVE, harnesses: { agy: { command: 'agy', path: '/bin/agy', installed: true, version: '1', groups: { argon: { label: 'Gemini Models', unknown: false, usable: false, priority: null, mark: dry, windows: {}, source: null } } } } })
  assert.match(shown, /argon, "Gemini Models": not usable, dry mark until .*, its reset, after agy refused a call for its individual quota\n/)
  // A refusal whose reading shows balance keeps the 60 minutes of A60, whatever it states.
  const balance = marks.markDry(dataDir, { harness: 'agy', group: 'flash', reading: healthy(now), reserve: RESERVE, now, refusal: quotaRefusal(REFUSAL) })
  assert.deepEqual([balance.confirmed, balance.until - now, balance.statedResetMs], [false, 60 * MIN, RESET_MS])
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('a reading with balance does not lift the mark of a refusal, nor shorten it', () => {
  const dataDir = tmp()
  const now = Date.now()
  const held = marks.markDry(dataDir, { harness: 'agy', group: 'argon', reserve: RESERVE, now, refusal: quotaRefusal(REFUSAL) })
  assert.deepEqual(marks.markDry(dataDir, { harness: 'agy', group: 'argon', reading: healthy(now), reserve: RESERVE, now: now + MIN }), held)
  assert.deepEqual(marks.markDry(dataDir, { harness: 'agy', group: 'argon', reading: { unknown: true, windows: {} }, reserve: RESERVE, now: now + 2 * MIN }), held)
  assert.deepEqual(marks.liveMark(dataDir, 'agy', 'argon', now + 3 * MIN), held)
  // A reading that shows the group under the reserve, with its reset, is another matter: it replaces the mark.
  assert.equal(marks.markDry(dataDir, { harness: 'agy', group: 'argon', reading: dry(now), reserve: RESERVE, now: now + 4 * MIN }).confirmed, true)
  fs.rmSync(dataDir, { recursive: true, force: true })
})

// ---- a /usage group that feeds several keys ----

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

test('issue 038: the shipped keys of Argon and Flash show the same windows and the same reset from one /usage reading, each in a copy of its own', () => {
  const groups = lanes.loadConfig(lanes.CONFIG_FILE).harnesses.agy.groups
  const exec = () => ({ status: 0, stdout: fs.readFileSync(FIXTURE, 'utf8'), stderr: '' })
  const { groups: read } = createAgy({ command: 'agy', groups, exec }).quota()
  assert.deepEqual(Object.keys(read).sort(), ['argon', 'claude', 'flash'])
  assert.deepEqual(read.argon, read.flash)
  assert.notEqual(read.argon.windows, read.flash.windows)
  assert.equal(read.argon.windows.weekly.resetsAt, read.flash.windows.weekly.resetsAt)
  assert.ok(read.argon.windows.weekly.resetsAt)
  assert.notDeepEqual(read.argon, read.claude)
})

test('the shipped table has a key for Argon and one for Flash, both reading «Gemini Models», and one for the Claude and GPT models', () => {
  const agy = lanes.loadConfig(lanes.CONFIG_FILE).harnesses.agy
  assert.deepEqual(agy.groups, { argon: 'Gemini Models', flash: 'Gemini Models', claude: 'Claude and GPT models' })
  assert.deepEqual(Object.fromEntries(Object.entries(agy.models).map(([id, model]) => [id, model.group])), {
    'gemini-3.8-flash': 'flash',
    'claude-sonnet-5-5': 'claude',
    'claude-opus-5-5': 'claude',
    'gemini-4-argon': 'argon',
  })
  // The pairs table names the same keys, since a design seat reads the key of its pair there.
  const keys = new Set(Object.keys(agy.groups))
  const { pairs } = require('../plugins/aether/lib/pairs.js').loadPairs()
  for (const pair of pairs.filter((p) => p.harness === 'agy')) assert.equal(pair.group, agy.models[pair.model].group, pair.id)
  assert.ok(pairs.filter((p) => p.harness === 'agy').every((p) => keys.has(p.group)))
})

// ---- the swarm and the seats mark a refusal ----

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

test('a seat round on Argon that agy refuses marks Argon only, and the next round skips it for the next pair while Flash stays usable', (t) => {
  const repo = seatRepo(t)
  const env = fx.laneEnv(t, { quota: geminiFirst() })
  const first = judgeRound(repo, env, `Review.\n${refuse().join('\n')}\n`)
  assert.equal(first.status, 4, JSON.stringify(first.json))
  assert.equal(first.json.failed, 'quota')
  assert.equal(first.json.model, 'gemini-4-argon')
  const mark = marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'argon')
  assert.deepEqual([mark.confirmed, mark.reason, mark.until - mark.at, mark.statedResetMs], [false, 'quota refusal', 60 * MIN, RESET_MS])
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'flash'), null, 'Flash has a quota of its own')
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'claude'), null)

  // The held key is not called again: with no other external pair listing judge, the native agent takes the round.
  const second = judgeRound(repo, env, `Review.\nFAKE-AGY: answer ${APPROVE}\n`)
  assert.equal(second.status, 3, JSON.stringify(second.json))
  assert.equal(second.json.unavailable, 'no-external')
  assert.equal(second.json.native.agent, 'aether:judge')
  assert.deepEqual(fx.agyTurns(env).map((turn) => fx.argAfter(turn.argv, '--model')), ['gemini-4-argon-high'])

  // Flash is still a lane for the swarm: its call goes through while Argon is held.
  const { done } = runFlashCall(t, [`FAKE-AGY: answer ${DONE}`], env)
  assert.equal(done.status, 'ok', done.detail)
})

test('issue 038: with the shipped table, a refusal of Argon leaves Flash usable for the swarm, and a refusal of Flash leaves Argon usable for a seat', (t) => {
  const repo = seatRepo(t)
  const env = fx.laneEnv(t, { quota: geminiFirst() })
  const first = judgeRound(repo, env, `Review.\n${refuse().join('\n')}\n`)
  assert.equal(first.json.failed, 'quota', JSON.stringify(first.json))
  assert.equal(first.json.model, 'gemini-4-argon')
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'argon').reason, 'quota refusal')
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'flash'), null)
  const { done } = runFlashCall(t, [`FAKE-AGY: answer ${DONE}`], env)
  assert.equal(done.status, 'ok', done.detail)

  const other = fx.laneEnv(t, { quota: geminiFirst() })
  const refused = runFlashCall(t, refuse(), other)
  assert.equal(refused.done.status, 'quota', refused.done.detail)
  assert.equal(marks.liveMark(other.AETHER_DATA_DIR, 'agy', 'flash').reason, 'quota refusal')
  assert.equal(marks.liveMark(other.AETHER_DATA_DIR, 'agy', 'argon'), null)
  const judged = judgeRound(repo, other, `Review.\nFAKE-AGY: answer ${APPROVE}\n`)
  assert.equal(judged.status, 0, JSON.stringify(judged.json))
  assert.equal(judged.json.model, 'gemini-4-argon')
})

test('a pair whose key a mark holds is dry for a seat, and a pair of an unmarked key is not', () => {
  const config = {
    harnesses: {
      agy: {
        command: 'agy',
        waitSeconds: 540,
        timeouts: { judge: 1200 },
        groups: {},
        models: {
          'gemini-4-argon': { roles: ['judge'] },
          'claude-opus-5-5': { roles: ['judge'] },
        },
      },
    },
  }
  const { pairs } = require('../plugins/aether/lib/pairs.js').loadPairs()
  const open = (days) => ({ usable: true, unknown: false, mark: null, resetsAt: new Date(Date.now() + days * 24 * HOUR).toISOString() })
  const held = { usable: false, unknown: false, mark: { reason: 'quota refusal' }, resetsAt: new Date(Date.now() + 24 * HOUR).toISOString() }
  const view = (argon) => ({ agy: { installed: true, groups: { argon, flash: open(2), claude: open(3) } } })
  const chosen = seats.chooseSeat({ config, pairs, seat: 'judge', harnesses: view(held) })
  assert.equal(chosen.external.pair.id, 'agy/claude-opus-5-5@high')
  assert.deepEqual(chosen.tried.find((entry) => entry.id === 'agy/gemini-4-argon@high'), { id: 'agy/gemini-4-argon@high', outcome: 'passed', why: 'dry' })
  assert.equal(seats.chooseSeat({ config, pairs, seat: 'judge', harnesses: view(open(1)) }).external.pair.id, 'agy/gemini-4-argon@high')
})

// ---- a mark of a key the table does not have ----

test('a mark file of a key the table does not have is ignored by every reader, and nothing is deleted', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  // agy's table had one Gemini key until issue 038; the mark files of that old key stay on disk when the table has two.
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
  assert.equal(quota.stdout.includes('gemini,'), false, 'the old key is not shown')

  const known = lanes.groupKnown(lanes.loadConfig(lanes.CONFIG_FILE))
  assert.equal(marks.liveMarks(env.AETHER_DATA_DIR).length, 1, 'the file is still on disk')
  assert.deepEqual(readAllMarks(env.AETHER_DATA_DIR, Date.now(), known), [])
  assert.equal(fs.readFileSync(orphan, 'utf8'), body)
  // A call on the table's models starts as if it were not there.
  const { done } = runFlashCall(t, [`FAKE-AGY: answer ${DONE}`], env)
  assert.equal(done.status, 'ok', done.detail)
})

// ---- an unconfirmed mark cannot hold longer than 60 minutes ----

test('an unconfirmed mark of 161 hours, as found on the owner\'s disk, is read as ending 60 minutes after it was written', () => {
  const dataDir = tmp()
  const found = { harness: 'agy', group: 'gemini', at: 1792131450120, until: 1792712790120, confirmed: false, resetsAt: null, usedPercentAbsent: false }
  fs.mkdirSync(marks.marksDir(dataDir), { recursive: true })
  fs.writeFileSync(marks.markFile(dataDir, 'agy', 'gemini'), JSON.stringify(found))
  assert.equal((found.until - found.at) / HOUR, 161.48333333333332)
  const at = found.at
  assert.equal(marks.liveMark(dataDir, 'agy', 'gemini', at + 10 * MIN).until, at + 60 * MIN)
  assert.equal(marks.liveMarks(dataDir, at + 10 * MIN)[0].until, at + 60 * MIN)
  assert.equal(marks.liveMark(dataDir, 'agy', 'gemini', at + 61 * MIN), null, 'the file says 161 h; the mark ended after 60 minutes')
  assert.deepEqual(marks.liveMarks(dataDir, at + 61 * MIN), [])
  // A confirmed mark keeps its reset, and a mark written for a longer table keeps the minutes it was given.
  fs.writeFileSync(marks.markFile(dataDir, 'agy', 'claude'), JSON.stringify({ ...found, group: 'claude', confirmed: true }))
  fs.writeFileSync(marks.markFile(dataDir, 'agy', 'flash'), JSON.stringify({ ...found, group: 'flash', until: at + 120 * MIN, minutes: 120 }))
  assert.notEqual(marks.liveMark(dataDir, 'agy', 'claude', at + 61 * MIN), null)
  assert.notEqual(marks.liveMark(dataDir, 'agy', 'flash', at + 61 * MIN), null)
  assert.equal(marks.liveMark(dataDir, 'agy', 'flash', at + 121 * MIN), null)
  fs.rmSync(dataDir, { recursive: true, force: true })
})

// ---- a healthy reading lifts a mark that came from a reading ----

test('liftIfHealthy lifts a mark from a reading when a fresh healthy reading taken after it shows every window above the reserve', () => {
  const dataDir = tmp()
  const now = Date.now()
  const base = { harness: 'agy', group: 'gemini', reserve: RESERVE, lifeMs: LIFE }
  const mark = (at, extra = {}) => marks.markDry(dataDir, { harness: 'agy', group: 'gemini', reading: dry(at), reserve: RESERVE, now: at, ...extra })
  const lift = (reading, readAt, at = now) => marks.liftIfHealthy(dataDir, { ...base, reading, readAt, now: at })

  mark(now - 30 * MIN)
  assert.notEqual(marks.liveMark(dataDir, 'agy', 'gemini', now), null)
  // None of these lifts it: still under the reserve, a window without a balance, unknown, taken before the mark, older
  // than the reading's life, or not taken yet.
  assert.notEqual(lift(dry(now), now), null, 'under the reserve')
  assert.notEqual(lift({ windows: { weekly: { remaining: 0.9, resetsAt: 'x' }, '5h': { remaining: null } } }, now), null, 'a window without a balance')
  assert.notEqual(lift({ unknown: true, windows: {} }, now), null, 'unknown')
  assert.notEqual(lift({ ...healthy(now), usedPercentAbsent: true }, now), null, 'a percentage that was not read')
  assert.notEqual(lift(healthy(now - 40 * MIN), now - 40 * MIN), null, 'taken before the mark')
  assert.notEqual(lift(healthy(now - 11 * MIN), now - 11 * MIN), null, 'older than quotaLifeMinutes')
  assert.notEqual(lift({ ...healthy(now), source: { ageMinutes: 31 } }, now, now), null, 'its own source is older than its life')
  assert.notEqual(lift(healthy(now + MIN), now + MIN), null, 'taken in the future')
  assert.notEqual(marks.liveMark(dataDir, 'agy', 'gemini', now), null, 'the mark was never lifted')
  // A fresh healthy reading taken after it does.
  assert.equal(lift(healthy(now - MIN), now - MIN), null)
  assert.equal(marks.liveMark(dataDir, 'agy', 'gemini', now), null)
  assert.equal(fs.existsSync(marks.markFile(dataDir, 'agy', 'gemini')), false)

  // A refusal's mark is never lifted by a reading, however healthy and fresh.
  mark(now - 30 * MIN, { reading: null, refusal: quotaRefusal(REFUSAL) })
  assert.notEqual(lift(healthy(now), now), null)
  assert.equal(marks.liveMark(dataDir, 'agy', 'gemini', now).reason, 'quota refusal')
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('issue 75: a stale muse reading does not lift the mark of its subscription refusal, and one observed after the refusal does', () => {
  const dataDir = tmp()
  const at = Date.now()
  // Muse's reading is the allowance of the same subscription windows its 429 refuses for, so a healthy reading
  // observed after the refusal lifts its mark (A75); one kept from before it must not, however healthy it looks.
  const held = marks.markDry(dataDir, { harness: 'muse', group: 'muse', reserve: RESERVE, now: at, refusal: quotaRefusal(MUSE_429) })
  const Muse = (sourceTs) => ({ windows: healthy(at).windows, source: { command: 'muse exec --json', ts: new Date(sourceTs).toISOString(), ageMinutes: 1 } })
  const lift = (reading, when) => marks.liftIfHealthy(dataDir, { harness: 'muse', group: 'muse', reading, readAt: when, reserve: RESERVE, lifeMs: LIFE, now: when })
  assert.deepEqual(lift(Muse(at - 1000), at + MIN), held, 'observed before the refusal: it is what the refused call had seen')
  assert.equal(fs.existsSync(marks.markFile(dataDir, 'muse', 'muse')), true)
  assert.equal(lift(Muse(at), at + MIN).reason, 'quota refusal', 'observed at the moment of the mark is not newer than it')
  assert.equal(lift(Muse(at + 1000), at + MIN), null, 'observed after the refusal')
  assert.equal(marks.liveMark(dataDir, 'muse', 'muse', at + MIN), null)
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('aether-lane quota and status lift a mark from a reading when the fresh reading is healthy, and not a refusal\'s mark', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  const written = (extra) => marks.markDry(env.AETHER_DATA_DIR, { harness: 'agy', group: 'flash', reading: dry(), reserve: RESERVE, now: Date.now() - 20 * MIN, ...extra })
  const groups = (verb) => (verb === 'quota' ? runBin(fx.LANE_BIN, ['quota', 'agy', '--json'], args.repoRoot, env).json : fx.lane(args, 'status', [], env).json).harnesses.agy.groups

  written()
  assert.equal(groups('quota').flash.mark, null, 'quota takes a fresh reading, with balance: the mark is lifted')
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'flash'), null)
  written()
  assert.equal(groups('status').flash.mark, null, 'status serves the kept reading, taken after the mark')
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'flash'), null)
  written({ reading: null, refusal: quotaRefusal(REFUSAL) })
  assert.equal(groups('quota').flash.mark.reason, 'quota refusal')
  assert.equal(groups('status').flash.usable, false)
  // A reading still under the reserve keeps the other kind.
  fs.rmSync(marks.markFile(env.AETHER_DATA_DIR, 'agy', 'flash'))
  written()
  fs.writeFileSync(env.AETHER_FAKE_AGY_QUOTA_FILE, JSON.stringify({ 'Gemini Models': [0.02, 0.02], 'Claude and GPT models': [0.9, 0.9] }))
  assert.notEqual(groups('quota').flash.mark, null)
})

test('a seat round lifts a mark from a reading when the group reads healthy, and a refusal\'s mark keeps its round off that group', (t) => {
  const repo = seatRepo(t)
  const env = fx.laneEnv(t, { quota: geminiFirst(), mutate: (cfg) => { cfg.harnesses.agy.models['claude-opus-5-5'].roles.push('judge') } })
  marks.markDry(env.AETHER_DATA_DIR, { harness: 'agy', group: 'argon', reading: dry(), reserve: RESERVE, now: Date.now() - 20 * MIN })
  const lifted = judgeRound(repo, env, `Review.\nFAKE-AGY: answer ${APPROVE}\n`)
  assert.equal(lifted.status, 0, JSON.stringify(lifted.json))
  assert.equal(lifted.json.model, 'gemini-4-argon')
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'argon'), null, 'the fresh reading of the group (90 %) lifted the mark')

  marks.markDry(env.AETHER_DATA_DIR, { harness: 'agy', group: 'argon', reserve: RESERVE, now: Date.now() - 20 * MIN, refusal: quotaRefusal(REFUSAL) })
  const held = judgeRound(repo, env, `Review.\nFAKE-AGY: answer ${APPROVE}\n`)
  assert.equal(held.status, 0, JSON.stringify(held.json))
  assert.equal(held.json.model, 'claude-opus-5-5', 'the held group is passed over for the next pair')
  assert.equal(marks.liveMark(env.AETHER_DATA_DIR, 'agy', 'argon').reason, 'quota refusal')

  // With both keys held, no pair is left and the native agent takes the round.
  marks.markDry(env.AETHER_DATA_DIR, { harness: 'agy', group: 'claude', reserve: RESERVE, now: Date.now() - 20 * MIN, refusal: quotaRefusal(REFUSAL) })
  const turns = fx.agyTurns(env).length
  const none = judgeRound(repo, env, `Review.\nFAKE-AGY: answer ${APPROVE}\n`)
  assert.equal(none.status, 3, JSON.stringify(none.json))
  assert.deepEqual(none.json.tried.find((entry) => entry.id === 'agy/gemini-4-argon@high'), { id: 'agy/gemini-4-argon@high', outcome: 'passed', why: 'dry' })
  assert.equal(none.json.native.agent, 'aether:judge')
  assert.equal(fx.agyTurns(env).length, turns, 'no held group is called')
})
