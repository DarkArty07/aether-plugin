'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { readGrokQuota, refreshGrokQuota } = require('../plugins/aether/lib/harness/grok-quota.js')

// Two real lines of ~/.grok/logs/unified.jsonl: grok 1.0.13 with creditUsagePercent 21, and grok 1.0.41 without it.
const [LINE_1013, LINE_1041] = fs.readFileSync(path.join(__dirname, 'fixtures', 'grok-billing.jsonl'), 'utf8').trim().split('\n')
const IN_1013_PERIOD = Date.parse('2026-09-05T10:00:00Z')
const IN_1041_PERIOD = Date.parse('2026-10-14T06:00:00Z')

// A billing line like grok 1.0.41's, at ts, with the period end and the percent given (none when undefined).
function billingLine({ ts, end = '2026-10-17T09:08:51.805411+00:00', percent, pid = 531322 }) {
  const entry = JSON.parse(LINE_1041)
  entry.ts = new Date(ts).toISOString()
  entry.pid = pid
  entry.ctx.config.currentPeriod.end = end
  if (percent !== undefined) entry.ctx.config.creditUsagePercent = percent
  return JSON.stringify(entry)
}

function writeLog(t, lines) {
  const logFile = path.join(tempDir(t), 'unified.jsonl')
  fs.writeFileSync(logFile, lines.map((line) => `${line}\n`).join(''))
  return logFile
}

test("reads grok 1.0.41's line without creditUsagePercent as nothing used, and says the percent was absent", (t) => {
  const logFile = writeLog(t, [LINE_1041])
  assert.deepEqual(readGrokQuota({ logFile, now: IN_1041_PERIOD }), {
    windows: { weekly: { remaining: 1, resetsAt: '2026-10-17T09:08:51.805Z' } },
    source: { log: logFile, ts: '2026-10-14T05:45:16.241Z', pid: 531322, version: '1.0.41', ageMinutes: 14 },
    usedPercent: null,
    usedPercentAbsent: true,
  })
})

test("reads grok 1.0.13's creditUsagePercent as the share of the week used", (t) => {
  const logFile = writeLog(t, [LINE_1013])
  assert.deepEqual(readGrokQuota({ logFile, now: IN_1013_PERIOD }), {
    windows: { weekly: { remaining: 0.79, resetsAt: '2026-09-12T09:08:51.805Z' } },
    source: { log: logFile, ts: '2026-09-05T09:47:03.054Z', pid: 1257141, version: '1.0.13', ageMinutes: 12 },
    usedPercent: 21,
    usedPercentAbsent: false,
  })
  const spent = writeLog(t, [billingLine({ ts: IN_1041_PERIOD, percent: 100 })])
  assert.equal(readGrokQuota({ logFile: spent, now: IN_1041_PERIOD }).windows.weekly.remaining, 0)
})

test('gives null for a period that has ended, a missing log, a log without billing lines, and an unreadable newest line', (t) => {
  assert.equal(readGrokQuota({ logFile: writeLog(t, [LINE_1013]), now: IN_1041_PERIOD }), null)
  assert.equal(readGrokQuota({ logFile: writeLog(t, [LINE_1041]), now: Date.parse('2026-10-17T09:08:51.805Z') }), null)
  assert.equal(readGrokQuota({ logFile: path.join(tempDir(t), 'none.jsonl'), now: IN_1041_PERIOD }), null)
  assert.equal(readGrokQuota({ logFile: writeLog(t, ['{"ts":"2026-10-14T05:45:13.049Z","msg":"startup phase"}']), now: IN_1041_PERIOD }), null)
  // The newest line decides: when its period or its percent cannot be read, an older line does not stand in.
  for (const bad of [billingLine({ ts: IN_1041_PERIOD, end: 'soon' }), billingLine({ ts: IN_1041_PERIOD, percent: '21' })]) {
    assert.equal(readGrokQuota({ logFile: writeLog(t, [LINE_1041, bad]), now: IN_1041_PERIOD }), null)
  }
})

test('skips a last line grok is still writing, and takes the newest line by its time from any grok session', (t) => {
  const newer = billingLine({ ts: IN_1041_PERIOD - 60000, percent: 40, pid: 777 })
  const cut = billingLine({ ts: IN_1041_PERIOD, percent: 90 }).slice(0, 200)
  const logFile = writeLog(t, [LINE_1041, newer, cut])
  assert.deepEqual([readGrokQuota({ logFile, now: IN_1041_PERIOD }).usedPercent, readGrokQuota({ logFile, now: IN_1041_PERIOD }).source.pid], [40, 777])
  // An owner's open session writes lines in its own order: the time, not the place in the file, says which is newest.
  const shuffled = writeLog(t, [newer, LINE_1041, '{"ts":"2026-10-14T05:59:00.000Z","msg":"other"}'])
  assert.equal(readGrokQuota({ logFile: shuffled, now: IN_1041_PERIOD }).usedPercent, 40)
})

test('reads only the last megabyte of the log', (t) => {
  const filler = `${JSON.stringify({ ts: '2026-10-14T05:50:00.000Z', msg: 'filler', ctx: { text: 'x'.repeat(1000) } })}\n`
  const logFile = writeLog(t, [LINE_1041])
  fs.appendFileSync(logFile, filler.repeat(1100))
  assert.equal(readGrokQuota({ logFile, now: IN_1041_PERIOD }), null)
  fs.appendFileSync(logFile, `${billingLine({ ts: IN_1041_PERIOD, percent: 5 })}\n`)
  assert.equal(readGrokQuota({ logFile, now: IN_1041_PERIOD }).usedPercent, 5)
})

// A clock that the refresh's waits move forward, and a fake UI that appends a billing line once it has been open
// writeAfterMs, or never when it is null. exitAfterMs makes the UI exit on its own.
function fakeUi(t, { writeAfterMs = 500, exitAfterMs = null, percent = 30, logLines = [] } = {}) {
  const dir = tempDir(t)
  const logFile = path.join(dir, 'unified.jsonl')
  fs.writeFileSync(logFile, logLines.map((line) => `${line}\n`).join(''))
  const clock = { time: IN_1041_PERIOD }
  const launches = []
  const stops = []
  let openedAt = null
  let written = false
  const tick = () => {
    if (openedAt === null) return
    if (!written && writeAfterMs !== null && clock.time - openedAt >= writeAfterMs) {
      fs.appendFileSync(logFile, `${billingLine({ ts: clock.time, percent })}\n`)
      written = true
    }
  }
  return {
    logFile,
    lockFile: path.join(dir, 'data', 'lanes', 'grok-quota.lock'),
    launches,
    stops,
    now: () => clock.time,
    wait: async (ms) => {
      clock.time += ms
      tick()
    },
    launch: (options) => {
      launches.push({ ...options, cwdExisted: fs.existsSync(options.cwd), cwdFiles: fs.readdirSync(options.cwd) })
      openedAt = clock.time
      return { pid: 4242, exited: () => exitAfterMs !== null && clock.time - openedAt >= exitAfterMs }
    },
    stop: (child, marker) => stops.push({ pid: child.pid, marker, at: clock.time }),
  }
}

const options = (ui, extra = {}) => ({
  command: 'grok',
  logFile: ui.logFile,
  lockFile: ui.lockFile,
  env: { HOME: '/home/someone', PATH: '/usr/bin', XAI_API_KEY: 'secret', GROK_AUTH: 'x' },
  now: ui.now,
  wait: ui.wait,
  launch: ui.launch,
  stop: ui.stop,
  ...extra,
})

test('a refresh opens the UI in a new empty directory with the lane environment, stops at the new line, ends the UI and removes the directory', async (t) => {
  const ui = fakeUi(t, { logLines: [LINE_1041] })
  const reading = await refreshGrokQuota(options(ui))
  assert.deepEqual([reading.usedPercent, reading.source.ts], [30, new Date(IN_1041_PERIOD + 500).toISOString()])
  assert.equal(ui.launches.length, 1)
  const [launch] = ui.launches
  assert.deepEqual([launch.command, launch.cwdExisted, launch.cwdFiles], ['grok', true, []])
  assert.equal(fs.existsSync(launch.cwd), false)
  assert.equal(launch.env.GROK_DISABLE_AUTOUPDATER, '1')
  assert.equal(launch.env.TERM, 'xterm-256color')
  assert.match(launch.env.AETHER_LANE_CALL, /^grok-quota\//)
  assert.deepEqual(launch.env, { ...lanes.laneEnv({ HOME: '/home/someone', PATH: '/usr/bin' }, launch.env.AETHER_LANE_CALL), TERM: 'xterm-256color', GROK_DISABLE_AUTOUPDATER: '1' })
  // The UI is ended once, by the marker its processes carry, as soon as the line is read.
  assert.deepEqual(ui.stops, [{ pid: 4242, marker: launch.env.AETHER_LANE_CALL, at: IN_1041_PERIOD + 500 }])
  assert.equal(fs.existsSync(ui.lockFile), false)
})

test('a refresh gives null when no new line comes before the timeout, and ends the UI inside the timeout', async (t) => {
  // The old line in the log is not new, whatever its pid.
  const ui = fakeUi(t, { writeAfterMs: null, logLines: [billingLine({ ts: IN_1041_PERIOD - 1, pid: 4242 })] })
  assert.equal(await refreshGrokQuota(options(ui, { timeoutMs: 20000 })), null)
  assert.equal(ui.stops.length, 1)
  // Polling stops 2 s before the timeout, which is what ending the UI may take.
  assert.ok(ui.stops[0].at - IN_1041_PERIOD <= 18000, String(ui.stops[0].at - IN_1041_PERIOD))
  assert.ok(ui.stops[0].at - IN_1041_PERIOD >= 17750, String(ui.stops[0].at - IN_1041_PERIOD))
  assert.equal(fs.existsSync(ui.launches[0].cwd), false)
  assert.equal(fs.existsSync(ui.lockFile), false)
})

test('a refresh gives null at once when the UI cannot start or exits without a line, and never throws for it', async (t) => {
  const missing = fakeUi(t)
  const result = await refreshGrokQuota(options(missing, { launch: (o) => (missing.launches.push(o), null) }))
  assert.deepEqual([result, missing.stops, fs.existsSync(missing.launches[0].cwd)], [null, [], false])

  const exits = fakeUi(t, { writeAfterMs: null, exitAfterMs: 1000 })
  assert.equal(await refreshGrokQuota(options(exits)), null)
  assert.ok(exits.stops[0].at - IN_1041_PERIOD <= 1250)

  const throws = fakeUi(t)
  assert.equal(await refreshGrokQuota(options(throws, { launch: () => { throw new Error('spawn failed') } })), null)
  assert.equal(fs.existsSync(throws.lockFile), false)
})

test('a refresh started while another runs waits for it and takes its reading, without opening a second UI', async (t) => {
  const ui = fakeUi(t, { writeAfterMs: 1000, percent: 12 })
  const [first, second] = await Promise.all([refreshGrokQuota(options(ui)), refreshGrokQuota(options(ui))])
  assert.equal(ui.launches.length, 1)
  assert.equal(first.usedPercent, 12)
  assert.deepEqual(second, first)
  assert.equal(fs.existsSync(ui.lockFile), false)
})

test('a lock left by a refresh that died does not block the next one', async (t) => {
  const ui = fakeUi(t)
  fs.mkdirSync(path.dirname(ui.lockFile), { recursive: true })
  // A pid that cannot be running: Linux pids stay below 2^22.
  fs.writeFileSync(ui.lockFile, JSON.stringify({ pid: 2 ** 22 + 1, since: IN_1041_PERIOD - 5000, until: IN_1041_PERIOD + 15000 }))
  assert.equal((await refreshGrokQuota(options(ui))).usedPercent, 30)
  // This process is alive, but a lock past its deadline is left over too.
  fs.writeFileSync(ui.lockFile, JSON.stringify({ pid: process.pid, since: IN_1041_PERIOD - 60000, until: IN_1041_PERIOD - 40000 }))
  const late = fakeUi(t)
  assert.equal((await refreshGrokQuota(options(late, { lockFile: ui.lockFile }))).usedPercent, 30)
  assert.equal(late.launches.length, 1)
})

// The real launcher and kill, through script(1), on a fake grok that writes a billing line and then waits forever.
test('the real launcher opens grok on a terminal through script, and the kill ends it', { skip: lanes.commandPath('script') === null, timeout: 30000 }, async (t) => {
  const dir = tempDir(t)
  const logFile = path.join(dir, 'unified.jsonl')
  const pidFile = path.join(dir, 'grok.pid')
  const fakeGrok = path.join(dir, 'grok')
  fs.writeFileSync(
    fakeGrok,
    `#!${process.execPath}
const fs = require('node:fs')
fs.writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify({ pid: process.pid, tty: process.stdin.isTTY === true, argv: process.argv.slice(2), updater: process.env.GROK_DISABLE_AUTOUPDATER }))
const line = fs.readFileSync(${JSON.stringify(path.join(__dirname, 'fixtures', 'grok-billing.jsonl'))}, 'utf8').trim().split('\\n')[1]
const entry = JSON.parse(line)
entry.ts = new Date().toISOString()
entry.pid = process.pid
entry.ctx.config.currentPeriod.end = new Date(Date.now() + 86400000).toISOString()
fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(entry) + '\\n')
setInterval(() => {}, 1000)
`,
  )
  fs.chmodSync(fakeGrok, 0o755)
  const started = Date.now()
  const reading = await refreshGrokQuota({ command: fakeGrok, logFile, lockFile: path.join(dir, 'lock'), env: process.env, timeoutMs: 15000 })
  assert.ok(reading !== null, 'no reading')
  const ran = JSON.parse(fs.readFileSync(pidFile, 'utf8'))
  assert.deepEqual([ran.tty, ran.argv[0], ran.argv[2], ran.updater, reading.source.pid], [true, '--cwd', '--no-alt-screen', '1', ran.pid])
  assert.equal(fs.existsSync(ran.argv[1]), false)
  assert.ok(Date.now() - started < 15000)
  // Gone, or a zombie its new parent has not reaped yet.
  let state = null
  try {
    const stat = fs.readFileSync(`/proc/${ran.pid}/stat`, 'utf8')
    state = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]
  } catch {
    state = null
  }
  assert.ok(state === null || state === 'Z', `the fake grok is still running: ${state}`)
})
