'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const { ABSENT_USED_PERCENT, newestEntry, readingOf, readGrokQuota, refreshGrokQuota } = require('../plugins/aether/lib/harness/grok-quota.js')

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

// By default ACP gives nothing, so a test of the fallback never starts a real grok.
const options = (ui, extra = {}) => ({
  command: 'grok',
  logFile: ui.logFile,
  lockFile: ui.lockFile,
  env: { HOME: '/home/someone', PATH: '/usr/bin', XAI_API_KEY: 'secret', GROK_AUTH: 'x' },
  now: ui.now,
  wait: ui.wait,
  acp: async () => null,
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
  const reading = await refreshGrokQuota({ command: fakeGrok, logFile, lockFile: path.join(dir, 'lock'), env: process.env, timeoutMs: 15000, acp: async () => null })
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

// ---- spec 002, A3: a missing creditUsagePercent, in one place ----

test('a missing creditUsagePercent is read by one constant, and the other reading the owner may choose is its one-line change', (t) => {
  assert.equal(ABSENT_USED_PERCENT, 0)
  const entry = newestEntry(LINE_1041)
  const asNothingUsed = readingOf(entry, IN_1041_PERIOD)
  assert.deepEqual([asNothingUsed.windows.weekly.remaining, asNothingUsed.usedPercent, asNothingUsed.usedPercentAbsent], [1, null, true])
  // The balance unknown, the reset known: what the constant becomes if grok 1.0.41 never gives the field after real use.
  const asUnknown = readingOf(entry, IN_1041_PERIOD, null, { absentUsed: null })
  assert.deepEqual(asUnknown.windows, { weekly: { remaining: null, resetsAt: '2026-10-17T09:08:51.805Z' } })
  assert.deepEqual([asUnknown.usedPercent, asUnknown.usedPercentAbsent], [null, true])
  // A line that has the field is read the same either way.
  const given = newestEntry(LINE_1013)
  assert.equal(readingOf(given, IN_1013_PERIOD, null, { absentUsed: null }).windows.weekly.remaining, 0.79)
  const logFile = writeLog(t, [LINE_1041])
  assert.equal(readGrokQuota({ logFile, now: IN_1041_PERIOD, absentUsed: null }).windows.weekly.remaining, null)
  assert.equal(readGrokQuota({ logFile, now: IN_1041_PERIOD }).windows.weekly.remaining, 1)
})

// ---- the session folder each refresh leaves ----

// A throwaway home with a grok sessions folder holding the folder of another temporary directory and one of a project.
function homeWithSessions(t) {
  const home = tempDir(t)
  const sessions = path.join(home, '.grok', 'sessions')
  const other = path.join(sessions, encodeURIComponent(path.join(os.tmpdir(), 'aether-grok-quota-OTHER1')))
  const project = path.join(sessions, encodeURIComponent('/home/me/project'))
  for (const folder of [other, project]) {
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'session.json'), '{}')
  }
  fs.writeFileSync(path.join(sessions, 'session_search.sqlite'), 'x')
  return { home, sessions, other, project }
}

// The UI grok opens writes a session folder named after the directory it started in.
function launchWithSession(ui, sessions, seen) {
  return (options) => {
    const folder = path.join(sessions, encodeURIComponent(options.cwd))
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(path.join(folder, 'session.json'), '{}')
    seen.push(folder)
    return ui.launch(options)
  }
}

test('a refresh removes the session folder of its own temporary directory after the UI ends, and no other folder', async (t) => {
  const { home, sessions, other, project } = homeWithSessions(t)
  const ui = fakeUi(t, { logLines: [LINE_1041] })
  const seen = []
  const stoppedWhileThere = []
  const stop = (child, marker) => {
    stoppedWhileThere.push(fs.existsSync(seen[0]))
    return ui.stop(child, marker)
  }
  const reading = await refreshGrokQuota(options(ui, { env: { HOME: home, PATH: '/usr/bin' }, launch: launchWithSession(ui, sessions, seen), stop }))
  assert.notEqual(reading, null)
  assert.equal(seen.length, 1)
  assert.match(path.basename(seen[0]), /^%2F.*aether-grok-quota-/)
  assert.deepEqual(stoppedWhileThere, [true], 'the folder is removed after the UI ends, not before')
  assert.equal(fs.existsSync(seen[0]), false)
  assert.equal(fs.existsSync(other), true, 'the folder of another temporary directory stays')
  assert.equal(fs.existsSync(project), true)
  assert.equal(fs.existsSync(path.join(sessions, 'session_search.sqlite')), true)
})

test('a refresh that gives no reading, or whose UI exits or throws, still removes its session folder', async (t) => {
  const { home, sessions, other } = homeWithSessions(t)
  const env = { HOME: home, PATH: '/usr/bin' }
  const timedOut = fakeUi(t, { writeAfterMs: null })
  const seenA = []
  assert.equal(await refreshGrokQuota(options(timedOut, { env, launch: launchWithSession(timedOut, sessions, seenA) })), null)
  const exits = fakeUi(t, { writeAfterMs: null, exitAfterMs: 1000 })
  const seenB = []
  assert.equal(await refreshGrokQuota(options(exits, { env, launch: launchWithSession(exits, sessions, seenB) })), null)
  const throws = fakeUi(t)
  const seenC = []
  const launch = (o) => {
    launchWithSession(throws, sessions, seenC)(o)
    throw new Error('spawn failed')
  }
  assert.equal(await refreshGrokQuota(options(throws, { env, launch })), null)
  assert.equal(seenA.length + seenB.length + seenC.length, 3)
  for (const folder of [...seenA, ...seenB, ...seenC]) assert.equal(fs.existsSync(folder), false, folder)
  assert.deepEqual(fs.readdirSync(sessions).sort(), [path.basename(other), '%2Fhome%2Fme%2Fproject', 'session_search.sqlite'].sort())
})

// ---- the refresh over ACP, and the UI as its fallback ----

// What readBillingViaAcp gives for the config of grok 1.0.41's line: no creditUsagePercent.
const [ACP_INITIALIZE, , ACP_BILLING] = fs.readFileSync(path.join(__dirname, 'fixtures', 'grok-acp-billing.jsonl'), 'utf8').trim().split('\n')
const acpAnswer = (at, extra = {}) => ({ config: JSON.parse(ACP_BILLING).result.config, subscriptionTier: 'SuperGrok', version: JSON.parse(ACP_INITIALIZE).result._meta.agentVersion, at, ...extra })

test('a refresh asks grok over ACP first, reads its config as a log line is read, and opens no UI when the answer comes', async (t) => {
  const ui = fakeUi(t, { logLines: [LINE_1041] })
  const asked = []
  const acp = async (request) => {
    asked.push(request)
    return acpAnswer(IN_1041_PERIOD + 800)
  }
  const reading = await refreshGrokQuota(options(ui, { acp, timeoutMs: 20000 }))
  assert.deepEqual(reading.windows, { weekly: { remaining: 1, resetsAt: '2026-10-17T09:08:51.805Z' } })
  assert.deepEqual([reading.usedPercent, reading.usedPercentAbsent], [null, true])
  assert.deepEqual(reading.source, { method: 'acp', log: null, ts: new Date(IN_1041_PERIOD + 800).toISOString(), pid: null, version: '1.0.52', ageMinutes: 0 })
  assert.equal(asked.length, 1)
  assert.deepEqual([asked[0].command, asked[0].timeoutMs, asked[0].env.HOME, asked[0].now === ui.now], ['grok', 10000, '/home/someone', true])
  assert.equal(ui.launches.length, 0, 'no UI is opened')
  assert.equal(fs.existsSync(ui.lockFile), false)
})

test('the same config is read the same through ACP and through the log, and a given percent counts', async (t) => {
  const ui = fakeUi(t)
  const given = acpAnswer(IN_1041_PERIOD + 10)
  given.config.creditUsagePercent = 40
  const reading = await refreshGrokQuota(options(ui, { acp: async () => given }))
  assert.deepEqual([reading.windows.weekly.remaining, reading.usedPercent, reading.usedPercentAbsent], [0.6, 40, false])
  const absent = readingOf(newestEntry(LINE_1041), IN_1041_PERIOD + 10)
  const viaAcp = await refreshGrokQuota(options(ui, { acp: async () => acpAnswer(IN_1041_PERIOD) }))
  assert.deepEqual(viaAcp.windows, absent.windows)
  // The answer of a period that has ended is no reading: the fallback runs.
  const ended = acpAnswer(IN_1041_PERIOD)
  ended.config.currentPeriod.end = '2026-10-14T05:00:00+00:00'
  const late = fakeUi(t, { writeAfterMs: null })
  assert.equal(await refreshGrokQuota(options(late, { acp: async () => ended })), null)
  assert.equal(late.launches.length, 1)
})

test('when ACP gives no answer, an error or no config, the refresh opens the UI and reads the line it writes', async (t) => {
  const thrown = async () => {
    throw new Error('acp broke')
  }
  for (const acp of [async () => null, async () => undefined, thrown, async () => ({ config: null, at: IN_1041_PERIOD }), async () => ({ config: {}, version: '1.0.52', at: IN_1041_PERIOD })]) {
    const ui = fakeUi(t, { logLines: [LINE_1041] })
    const reading = await refreshGrokQuota(options(ui, { acp }))
    assert.equal(ui.launches.length, 1)
    assert.deepEqual([reading.usedPercent, reading.source.method, reading.source.ts], [30, undefined, new Date(IN_1041_PERIOD + 500).toISOString()])
    assert.equal(ui.stops.length, 1)
    assert.equal(fs.existsSync(ui.lockFile), false)
  }
})

test('the UI fallback is judged from when it starts, so a line grok wrote during the ACP attempt is not its reading', async (t) => {
  const ui = fakeUi(t, { writeAfterMs: null })
  const acp = async () => {
    await ui.wait(3000)
    fs.appendFileSync(ui.logFile, `${billingLine({ ts: ui.now(), percent: 77 })}\n`)
    await ui.wait(1000)
    return null
  }
  assert.equal(await refreshGrokQuota(options(ui, { acp, timeoutMs: 20000 })), null)
  assert.equal(ui.launches.length, 1)
  assert.ok(ui.stops[0].at - IN_1041_PERIOD >= 4000 + 17750, 'the UI has its own 20 s, after the time ACP took')
})

test('a refresh started while another runs, whether it asks over ACP or opens the UI, waits for it and takes the line it left', async (t) => {
  const ui = fakeUi(t, { writeAfterMs: null })
  let asks = 0
  // grok leaves the same line in its log when it answers _x.ai/billing.
  const acp = async () => {
    asks += 1
    await ui.wait(1000)
    fs.appendFileSync(ui.logFile, `${billingLine({ ts: ui.now(), percent: 12 })}\n`)
    return acpAnswer(ui.now())
  }
  const [first, second] = await Promise.all([refreshGrokQuota(options(ui, { acp })), refreshGrokQuota(options(ui, { acp }))])
  assert.equal(asks, 1)
  assert.equal(ui.launches.length, 0)
  assert.deepEqual([first.source.method, second.usedPercent, second.windows.weekly.remaining], ['acp', 12, 0.88])
  assert.equal(fs.existsSync(ui.lockFile), false)
})

test('a refresh started while another falls back to the UI waits for all of it, past the time the UI alone is given', async (t) => {
  // ACP takes its whole 10 s and gives nothing; the UI then writes its line 15 s after it opens, 25 s after the start.
  const ui = fakeUi(t, { writeAfterMs: 15000, percent: 12 })
  let asks = 0
  const acp = async () => {
    asks += 1
    // One turn first, so that the second refresh starts on the clock as it was, before ACP's 10 s pass.
    await Promise.resolve()
    await ui.wait(10000)
    return null
  }
  const [first, second] = await Promise.all([refreshGrokQuota(options(ui, { acp })), refreshGrokQuota(options(ui, { acp }))])
  assert.equal(asks, 1)
  assert.equal(ui.launches.length, 1)
  assert.deepEqual([first.usedPercent, second.usedPercent], [12, 12])
  assert.equal(fs.existsSync(ui.lockFile), false)
})
