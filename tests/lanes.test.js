'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const close = (a, b) => Math.abs(a - b) < 1e-9
const shipped = () => lanes.loadConfig(lanes.CONFIG_FILE)

// A second harness of two models, the first for implementers and reviewers, the second for supervisors.
function codexHarness(group = 'codex') {
  return {
    command: 'codex',
    waitSeconds: 300,
    timeouts: { implementer: 3000, supervisor: 900, reviewer: 1200, designer: 1800 },
    groups: { [group]: 'Codex Models' },
    models: {
      'gpt-codex': { group, roles: ['implementer', 'reviewer'] },
      'gpt-mini': { group, roles: ['supervisor'] },
    },
  }
}

// The shipped table with the codex harness added.
function twoHarnesses() {
  const config = shipped()
  config.harnesses.codex = codexHarness()
  return config
}

function writeConfig(t, mutate) {
  const config = JSON.parse(fs.readFileSync(lanes.CONFIG_FILE, 'utf8'))
  mutate(config)
  const file = path.join(tempDir(t), 'lanes.json')
  fs.writeFileSync(file, JSON.stringify(config))
  return file
}

function withEnv(t, name, value) {
  const previous = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  t.after(() => {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  })
}

// A long-running process in its own group, with the lane marker in its environment or without one.
function sleeper(t, marker) {
  const env = { ...process.env }
  delete env.AETHER_LANE_CALL
  if (marker) env.AETHER_LANE_CALL = marker
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore', env })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  t.after(() => {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // already gone
    }
  })
  return { pid: child.pid, exited }
}

test('the shipped table names each lane model with its group and roles', () => {
  const config = shipped()
  assert.equal(config.reserve, 0.05)
  const agy = config.harnesses.agy
  assert.equal(agy.command, 'agy')
  assert.equal(Object.hasOwn(agy, 'maxParallel'), false, 'a harness has no limit on its calls in flight')
  assert.equal(Object.hasOwn(agy, 'maxParallelMeasured'), false)
  assert.equal(agy.waitSeconds, 540)
  assert.deepEqual(agy.timeouts, { implementer: 2700, supervisor: 900, reviewer: 1200, judge: 1200, writer: 2700, examiner: 1800 })
  assert.deepEqual(agy.groups, { argon: 'Gemini Models', flash: 'Gemini Models', claude: 'Claude and GPT models' })
  assert.deepEqual(
    Object.entries(agy.models).map(([id, m]) => [id, m.group, m.roles]),
    [
      ['gemini-3.8-flash', 'flash', ['implementer']],
      ['claude-sonnet-5-5', 'claude', ['implementer', 'supervisor']],
      ['claude-opus-5-5', 'claude', ['implementer', 'reviewer']],
      ['gemini-4-argon', 'argon', ['judge', 'writer', 'examiner']],
    ],
  )
  assert.deepEqual(agy.models['gemini-3.8-flash'].aa, { slug: 'gemini-3-8-flash', intelligence: 30.5, terminalBench: 0.2, checked: '2026-10-30' })
})

test('configPath follows AETHER_LANES_CONFIG, and a missing table means no lanes', (t) => {
  withEnv(t, 'AETHER_LANES_CONFIG', undefined)
  assert.equal(lanes.configPath(), lanes.CONFIG_FILE)
  const nowhere = path.join(tempDir(t), 'none.json')
  withEnv(t, 'AETHER_LANES_CONFIG', nowhere)
  assert.equal(lanes.configPath(), nowhere)
  assert.equal(lanes.loadConfig(), null)
})

test('loadConfig refuses a table it cannot trust, naming the file and the field', (t) => {
  const bad = [
    [(c) => (c.reserve = 2), /reserve/],
    [(c) => (c.harnesses.agy.waitSeconds = 'soon'), /waitSeconds/],
    [(c) => (c.harnesses.agy.timeouts.reviewer = -1), /timeouts/],
    [(c) => (c.harnesses.agy.models['gemini-3.8-flash'].group = 'other'), /gemini-3\.8-flash.*group/],
    [(c) => (c.harnesses.agy.models['gemini-3.8-flash'].roles = ['ops']), /gemini-3\.8-flash.*roles/],
    [(c) => (c.harnesses.agy.models['claude-opus-5-5'].roles = ['implementer', 'designer']), /claude-opus-5-5.*roles/],
  ]
  for (const [mutate, pattern] of bad) {
    const file = writeConfig(t, mutate)
    assert.throws(
      () => lanes.loadConfig(file),
      (err) => err.message.startsWith(`lanes config ${file}: `) && pattern.test(err.message),
      String(pattern),
    )
  }
  const broken = path.join(tempDir(t), 'broken.json')
  fs.writeFileSync(broken, '{')
  assert.throws(() => lanes.loadConfig(broken), (err) => err.message.startsWith(`lanes config ${broken}: `))
})

test('loadConfig refuses a seat timeout it cannot trust, and seatTimeout falls back to the seat default', (t) => {
  const file = writeConfig(t, (c) => (c.harnesses.agy.timeouts.judge = 0))
  assert.throws(
    () => lanes.loadConfig(file),
    (err) => err.message.startsWith(`lanes config ${file}: `) && /timeouts must give an integer of at least 1 for each seat/.test(err.message),
  )
  const without = writeConfig(t, (c) => delete c.harnesses.agy.timeouts.writer)
  assert.equal(lanes.seatTimeout(lanes.loadConfig(without).harnesses.agy, 'writer'), 2700)
})

test('the shipped table has codex with its three models, cursor without models, and grok with grok-4.7', () => {
  const config = shipped()
  assert.deepEqual(Object.keys(config.harnesses), ['agy', 'codex', 'grok', 'cursor', 'muse'])
  assert.deepEqual(config.harnesses.cursor.models, {})
  assert.deepEqual(Object.keys(config.harnesses.codex.models), ['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna'])
  assert.deepEqual(config.harnesses.cursor.command, 'cursor-agent')
  // grok-4.7-build-fast is the same model faster and twice the price: it is not a lane model.
  assert.deepEqual(Object.keys(config.harnesses.grok.models), ['grok-4.7'])
})

test('enabledHarnesses reads AETHER_LANE_HARNESSES: known names, trimmed, lowercased, each once, in order', () => {
  assert.deepEqual(lanes.enabledHarnesses({}), ['agy'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: '' }), ['agy'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'nope, ,' }), ['agy'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: ' Codex , grok,codex,AGY,nope,cursor ' }), ['codex', 'grok', 'agy', 'cursor'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'cursor' }), ['cursor'])
})

test('loadConfig refuses two harnesses that use one group key, and accepts distinct keys', (t) => {
  const shared = writeConfig(t, (c) => (c.harnesses.codex = codexHarness('argon')))
  assert.throws(
    () => lanes.loadConfig(shared),
    (err) => err.message.startsWith(`lanes config ${shared}: `) && err.message.includes('group argon is used by harnesses agy and codex: group keys are unique across the table'),
  )
  const distinct = writeConfig(t, (c) => (c.harnesses.codex = codexHarness()))
  assert.deepEqual(Object.keys(lanes.loadConfig(distinct).harnesses), ['agy', 'codex', 'grok', 'cursor', 'muse'])
})

test('loadConfig refuses one model id in two harnesses, and accepts distinct ids', (t) => {
  // claude-opus-5-5 is agy's model; codex lists it too, with its own group, so the id is in two harnesses.
  const twice = writeConfig(t, (c) => {
    c.harnesses.codex = codexHarness()
    c.harnesses.codex.models['claude-opus-5-5'] = { group: 'codex', roles: ['reviewer'] }
  })
  assert.throws(
    () => lanes.loadConfig(twice),
    (err) =>
      err.message.startsWith(`lanes config ${twice}: `) &&
      err.message.includes('model claude-opus-5-5 is in harnesses agy and codex: model ids are unique across the table'),
  )
  const distinct = writeConfig(t, (c) => (c.harnesses.codex = codexHarness()))
  assert.deepEqual(Object.keys(lanes.loadConfig(distinct).harnesses), ['agy', 'codex', 'grok', 'cursor', 'muse'])
})

test('commandInstalled finds an absolute executable or a name on the PATH', (t) => {
  const dir = tempDir(t)
  const exe = path.join(dir, 'agy')
  fs.writeFileSync(exe, '#!/bin/sh\n')
  fs.chmodSync(exe, 0o755)
  const plain = path.join(dir, 'plain')
  fs.writeFileSync(plain, '')
  fs.chmodSync(plain, 0o644)
  assert.equal(lanes.commandInstalled(exe, {}), true)
  assert.equal(lanes.commandInstalled(plain, {}), false)
  assert.equal(lanes.commandInstalled(path.join(dir, 'missing'), {}), false)
  assert.equal(lanes.commandInstalled('agy', { PATH: `/nowhere${path.delimiter}${dir}` }), true)
  assert.equal(lanes.commandInstalled('agy', { PATH: '/nowhere' }), false)
  assert.equal(lanes.commandInstalled('plain', { PATH: dir }), false)
})

test('digest is FNV-1a over UTF-16 code units with the length, and resultDigest ignores key order', () => {
  assert.equal(lanes.digest(''), '811c9dc5:0')
  assert.equal(lanes.digest('a'), 'e40c292c:1')
  assert.equal(lanes.digest('foobar'), 'bf9cf968:6')
  assert.equal(lanes.digest('é'), '6c0b6c44:1')
  assert.equal(lanes.digest('😀'), 'cb31c4b8:2')
  assert.equal(lanes.digest('line one\nline two\n'), '558f297f:18')
  const result = { c: null, b: 1, a: [{ z: 1, y: 2 }] }
  const lane = { model: 'm', harness: 'agy' }
  assert.equal(lanes.canonicalJson({ result, lane }), '{"lane":{"harness":"agy","model":"m"},"result":{"a":[{"y":2,"z":1}],"b":1,"c":null}}')
  assert.equal(lanes.resultDigest({ result, lane }), '0415a971:84')
  assert.equal(lanes.resultDigest({ lane: { harness: 'agy', model: 'm' }, result: { a: [{ y: 2, z: 1 }], b: 1, c: null } }), '0415a971:84')
  assert.equal(lanes.canonicalJson({ a: undefined, b: [1, 'x'] }), '{"b":[1,"x"]}')
})

test('a group is usable while every window stays above the reserve', () => {
  const q = (fiveHour, weekly) => ({ windows: { '5h': { remaining: fiveHour, resetsAt: 'A' }, weekly: { remaining: weekly, resetsAt: 'B' } } })
  assert.equal(lanes.usable(q(0.5, 0.06), 0.05), true)
  assert.equal(lanes.usable(q(0.5, 0.05), 0.05), false)
  assert.equal(lanes.usable(q(0.01, 0.9), 0.05), false)
  assert.equal(lanes.usable({ windows: {} }, 0.05), false)
  assert.equal(lanes.usable(null, 0.05), false)
})

test('a group whose quota a harness cannot report is usable until a call fails for quota', () => {
  assert.equal(lanes.usable({ unknown: true }, 0.05), true)
  assert.equal(lanes.usable({ unknown: false }, 0.05), false)
})

test('commandPath gives the absolute path where a command is found, or null', (t) => {
  const dir = tempDir(t)
  const exe = path.join(dir, 'agy')
  fs.writeFileSync(exe, '#!/bin/sh\n')
  fs.chmodSync(exe, 0o755)
  const plain = path.join(dir, 'plain')
  fs.writeFileSync(plain, '')
  fs.chmodSync(plain, 0o644)
  assert.equal(lanes.commandPath(exe, {}), exe)
  assert.equal(lanes.commandPath(plain, {}), null)
  assert.equal(lanes.commandPath(path.join(dir, 'missing'), {}), null)
  assert.equal(lanes.commandPath('agy', { PATH: `/nowhere${path.delimiter}${dir}` }), exe)
  assert.equal(lanes.commandPath('agy', { PATH: `${path.delimiter}${dir}` }), exe)
  assert.equal(lanes.commandPath('agy', { PATH: '/nowhere' }), null)
})

test('quotaConsumed adds the drops between readings of one reset time, and counts resets apart', () => {
  const r = (time, fiveHour, fiveReset, weekly) => ({
    time,
    windows: { '5h': { remaining: fiveHour, resetsAt: fiveReset }, weekly: { remaining: weekly, resetsAt: 'W' } },
  })
  const out = lanes.quotaConsumed([r(3, 0.85, 'R1', 0.95), r(1, 0.9, 'R1', 0.96), r(4, 0.85, 'R1', 0.95), r(5, 0.7, 'R2', 0.94), r(6, 0.6, 'R2', 0.95)])
  assert.ok(close(out['5h'].consumed, 0.15), String(out['5h'].consumed))
  assert.equal(out['5h'].resets, 1)
  assert.ok(close(out.weekly.consumed, 0.02), String(out.weekly.consumed))
  assert.equal(out.weekly.resets, 0)
  assert.deepEqual(lanes.quotaConsumed([]), {})
})

test('laneTokens adds thinking to output only when total counts it apart', () => {
  assert.deepEqual(lanes.laneTokens({ input: 1000, output: 200, thinking: 0, cacheRead: 500, total: 1200 }), { input: 1000, output: 200, cacheRead: 500, cacheWrite: 0 })
  assert.deepEqual(lanes.laneTokens({ input: 1000, output: 200, thinking: 300, cacheRead: 0, total: 1500 }), { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 })
  assert.deepEqual(lanes.laneTokens({ input: 1000, output: 200, thinking: 300, cacheRead: 0, total: 1200 }), { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 })
  assert.deepEqual(lanes.laneTokens({}), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
})

test('the lane log appends one line per entry per session, reads them back in time order, and prunes old sessions', (t) => {
  const dataDir = tempDir(t)
  lanes.appendLog(dataDir, 's-1', { kind: 'call', time: 20, run: 'r' })
  lanes.appendLog(dataDir, 's-1', { kind: 'reading', time: 10, run: 'r' })
  lanes.appendLog(dataDir, null, { kind: 'reading', time: 15, run: 'r' })
  lanes.appendLog(dataDir, '../escape', { kind: 'reading', time: 16 })
  assert.equal(lanes.logFile(dataDir, 's-1'), path.join(dataDir, 'lanes', 's-1.jsonl'))
  assert.equal(lanes.logFile(dataDir, '../escape'), path.join(dataDir, 'lanes', 'unknown.jsonl'))
  fs.appendFileSync(lanes.logFile(dataDir, 's-1'), 'not json\n')
  assert.deepEqual(
    lanes.readLog(dataDir).map((e) => [e.time, e.kind, e.session]),
    [
      [10, 'reading', 's-1'],
      [15, 'reading', null],
      [16, 'reading', null],
      [20, 'call', 's-1'],
    ],
  )
  assert.deepEqual(lanes.readLog(dataDir, { since: 16 }).map((e) => e.time), [16, 20])
  const old = new Date(Date.now() - 31 * 24 * 3600 * 1000)
  fs.utimesSync(lanes.logFile(dataDir, 's-1'), old, old)
  assert.deepEqual(lanes.pruneLog(dataDir, { days: 30 }), { pruned: ['s-1'] })
  assert.deepEqual(lanes.readLog(dataDir).map((e) => e.time), [15, 16])
  assert.deepEqual(lanes.pruneLog(path.join(dataDir, 'nowhere')), { pruned: [] })
})

test('killGroup stops a process group that carries the marker, and leaves any other process alone', async (t) => {
  const dir = tempDir(t)
  const pidFile = path.join(dir, 'pid')
  const marker = 'run-1/task-1-1-implement'

  const ours = sleeper(t, marker)
  fs.writeFileSync(pidFile, String(ours.pid))
  assert.deepEqual(lanes.killGroup(pidFile, marker), { killed: true, pid: ours.pid })
  await ours.exited
  assert.equal(fs.existsSync(pidFile), false)

  const other = sleeper(t, null)
  fs.writeFileSync(pidFile, String(other.pid))
  assert.deepEqual(lanes.killGroup(pidFile, marker), { killed: false, pid: other.pid })
  assert.equal(fs.existsSync(`/proc/${other.pid}`), true)
  assert.equal(fs.existsSync(pidFile), false)

  const wrong = sleeper(t, 'run-1/task-1-1-supervise')
  fs.writeFileSync(pidFile, String(wrong.pid))
  assert.equal(lanes.killGroup(pidFile, marker).killed, false)
  assert.equal(fs.existsSync(`/proc/${wrong.pid}`), true)

  assert.deepEqual(lanes.killGroup(path.join(dir, 'missing'), marker), { killed: false, pid: null })
})

test('laneEnv keeps only the allowlisted variables, drops any named like a secret, and sets the marker', () => {
  const kept = {
    HOME: '/home/u',
    PATH: '/usr/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    TERM: 'xterm',
    TMPDIR: '/tmp',
    TZ: 'UTC',
    USER: 'u',
    LOGNAME: 'u',
    SHELL: '/bin/sh',
    XDG_CONFIG_HOME: '/home/u/.config',
    AETHER_DATA_DIR: '/data',
    AETHER_LANES_CONFIG: '/lanes.json',
  }
  const dropped = {
    CLAUDE_CODE_MESSAGING_TOKEN: 'x',
    CLAUDE_CONFIG_DIR: '/c',
    ORCA_AGENT_HOOK_TOKEN: 'x',
    ORCA_PANE_KEY: 'x',
    GIT_CONFIG_GLOBAL: '/g',
    GIT_DIR: '/g',
    STARSHIP_SHELL: 'fish',
    OPENAI_API_KEY: 'x',
    AETHER_API_KEY: 'x',
    AETHER_SECRET: 'x',
    AETHER_session_token: 'x',
    XDG_SESSION_TOKEN: 'x',
    EDITOR: 'vim',
  }
  assert.deepEqual(lanes.laneEnv({ ...kept, ...dropped, AETHER_LANE_CALL: 'old/call' }, 'run/call'), { ...kept, ...NO_CREDENTIALS, AETHER_LANE_CALL: 'run/call' })
  assert.deepEqual(lanes.laneEnv({}, 'm'), { ...NO_CREDENTIALS, AETHER_LANE_CALL: 'm' })
})

// What laneEnv sets on top of the allowlist: git prompts off and no protocol but none, and the owner's
// credential files pointed at nothing. HOME is not among them: each CLI keeps its login there.
const NO_CREDENTIALS = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'protocol.allow',
  GIT_CONFIG_VALUE_0: 'never',
  GH_CONFIG_DIR: path.join(os.tmpdir(), 'aether-lane-no-credentials'),
  DOCKER_CONFIG: path.join(os.tmpdir(), 'aether-lane-no-credentials'),
  CLOUDSDK_CONFIG: path.join(os.tmpdir(), 'aether-lane-no-credentials'),
  NPM_CONFIG_USERCONFIG: '/dev/null',
  AWS_CONFIG_FILE: '/dev/null',
  AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
  KUBECONFIG: '/dev/null',
}

test('git inside a lane cannot reach a remote, and keeps HOME', (t) => {
  const repo = tempDir(t)
  const init = spawnSync('git', ['init', '-q', '-b', 'main', repo], { encoding: 'utf8' })
  assert.equal(init.status, 0, init.stderr)
  const env = lanes.laneEnv({ ...process.env, HOME: '/home/u' }, 'm')
  assert.equal(env.HOME, '/home/u')
  const denied = spawnSync('git', ['ls-remote', repo], { cwd: repo, encoding: 'utf8', env })
  assert.notEqual(denied.status, 0)
  assert.match(denied.stderr, /not allowed/)
})

function alive(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat[stat.lastIndexOf(')') + 2] !== 'Z'
  } catch {
    return false
  }
}

test('killMarked ends every process that carries the marker, or a marker under a prefix, with its process group, and nothing else', { timeout: 30000 }, async (t) => {
  // A run id no other test file uses: every test process scans the same /proc.
  const run = `20980101-000000-${process.pid.toString(16).slice(-4).padStart(4, '0')}`
  // A marked leader in a session of its own, with an unmarked child in its group.
  const dir = tempDir(t)
  const childFile = path.join(dir, 'child.pid')
  const leaderScript = `const c = require('node:child_process').spawn('sleep', ['120'], { stdio: 'ignore', env: { PATH: process.env.PATH } }); require('node:fs').writeFileSync(${JSON.stringify(childFile)}, String(c.pid)); setInterval(() => {}, 1000)`
  const env = { ...process.env, AETHER_LANE_CALL: `${run}/task-1-1-implement` }
  const leader = spawn(process.execPath, ['-e', leaderScript], { detached: true, stdio: 'ignore', env })
  const leaderExited = new Promise((resolve) => leader.on('exit', resolve))
  t.after(() => {
    try {
      process.kill(-leader.pid, 'SIGKILL')
    } catch {
      // already gone
    }
  })
  const deadline = Date.now() + 15000
  while (!fs.existsSync(childFile) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  const groupChild = Number(fs.readFileSync(childFile, 'utf8'))
  const sibling = sleeper(t, `${run}/final-review`)
  const otherRun = sleeper(t, '20980101-000001-ffff/task-1-1-implement')
  const unmarked = sleeper(t, null)

  assert.deepEqual(lanes.killMarked(`${run}/task-1-1-implement`), [`${run}/task-1-1-implement`])
  await leaderExited
  assert.deepEqual([alive(groupChild), alive(sibling.pid)], [false, true])
  assert.deepEqual(lanes.killMarked(`${run}/`, { prefix: true }), [`${run}/final-review`])
  await sibling.exited
  assert.deepEqual([alive(otherRun.pid), alive(unmarked.pid)], [true, true])
  assert.deepEqual(lanes.killMarked(`${run}/`, { prefix: true }), [])
  assert.deepEqual(lanes.killMarked(''), [])
})

test('the table gives the life of a harness reading and the length of a dry mark, and refuses a bad one', (t) => {
  const config = shipped()
  assert.equal(config.dryMarkMinutes, 60)
  assert.deepEqual(Object.fromEntries(Object.entries(config.harnesses).map(([name, h]) => [name, h.quotaLifeMinutes])), { agy: 10, codex: 10, grok: 30, cursor: 10, muse: 30 })
  assert.doesNotThrow(() => lanes.loadConfig(writeConfig(t, (c) => (c.harnesses.agy.quotaLifeMinutes = 0))))
  assert.doesNotThrow(() => lanes.loadConfig(writeConfig(t, (c) => (delete c.harnesses.agy.quotaLifeMinutes, delete c.dryMarkMinutes))))
  for (const [mutate, message] of [
    [(c) => (c.dryMarkMinutes = 0), 'dryMarkMinutes must be an integer of at least 1'],
    [(c) => (c.dryMarkMinutes = '60'), 'dryMarkMinutes must be an integer of at least 1'],
    [(c) => (c.dryMarkMinutes = 10081), 'dryMarkMinutes must be at most 10080, a week'],
    [(c) => (c.harnesses.agy.quotaLifeMinutes = -1), 'harness agy: quotaLifeMinutes must be an integer of at least 0'],
    [(c) => (c.harnesses.grok.quotaLifeMinutes = 1.5), 'harness grok: quotaLifeMinutes must be an integer of at least 0'],
  ]) {
    const file = writeConfig(t, mutate)
    assert.throws(() => lanes.loadConfig(file), (err) => err.message === `lanes config ${file}: ${message}`)
  }
})

test('usable follows the rule of lane-order: a balance that is unknown is used until a call fails', () => {
  const window = (remaining) => ({ windows: { weekly: { remaining, resetsAt: '2026-10-17T09:08:51.805Z' } } })
  assert.equal(lanes.usable(window(null), 0.05), true)
  assert.equal(lanes.usable(window(0.06), 0.05), true)
  assert.equal(lanes.usable(window(0.05), 0.05), false)
})

test('the shipped lane table has a muse harness with Wonder Full, Wonder 1.0 and Spark 1.3, all in by the owner\'s decision', () => {
  const config = lanes.loadConfig(lanes.CONFIG_FILE)
  const muse = config.harnesses.muse
  assert.deepEqual([muse.command, muse.quotaLifeMinutes, muse.waitSeconds], ['muse', 30, 540])
  assert.deepEqual(muse.timeouts, { implementer: 2700, supervisor: 900, reviewer: 1200 })
  assert.deepEqual(muse.groups, { muse: 'Muse subscription' })
  assert.deepEqual(Object.keys(muse.models).sort(), ['muse-spark-1.3', 'muse-wonder-1.0', 'muse-wonder-full-1.0'])
  const wonder = muse.models['muse-wonder-full-1.0']
  assert.deepEqual([wonder.group, wonder.roles], ['muse', ['implementer', 'reviewer']])
  assert.equal('levels' in wonder, false)
  assert.equal('replaces' in wonder, false)
  assert.equal(wonder.aa.slug, 'muse-wonder-full')
  assert.match(wonder.ownerDecision, /nivel de opus|anivel de opus/, 'the model is in the table by the owner\'s decision, written in its entry')
  const spark = muse.models['muse-spark-1.3']
  assert.deepEqual([spark.group, spark.roles], ['muse', ['implementer', 'reviewer']])
  assert.equal(spark.aa.slug, 'muse-spark-1-3')
  assert.match(spark.ownerDecision, /infinitamente mas barato|nivel haiku o sonnet/)
  const wonder1 = muse.models['muse-wonder-1.0']
  assert.deepEqual([wonder1.group, wonder1.roles], ['muse', ['implementer', 'reviewer']])
  assert.deepEqual([wonder1.aa.slug, wonder1.aa.intelligence, wonder1.aa.terminalBench], ['muse-wonder', 43.3, 0.52])
  assert.equal('designSeats' in config, false)
})

test('muse is a valid value of the harnesses option, in the owner order, without duplicates or unknown names', () => {
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'agy,muse' }), ['agy', 'muse'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: ' MUSE , agy, muse, gork ' }), ['muse', 'agy'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'gork' }), ['agy'])
})

test('the lane table holds neither the hand-written level map nor the seat profiles', () => {
  const config = JSON.parse(fs.readFileSync(lanes.CONFIG_FILE, 'utf8'))
  assert.equal('designSeats' in config, false)
  for (const harness of Object.values(config.harnesses)) for (const model of Object.values(harness.models)) assert.equal('levels' in model, false)
  for (const harness of Object.values(config.harnesses)) for (const model of Object.values(harness.models)) assert.equal('replaces' in model, false)
  assert.doesNotThrow(() => lanes.loadConfig(lanes.CONFIG_FILE))
})

test('lib/lanes.js no longer exports the retired names', () => {
  for (const gone of ['seatsChoice', 'seatList', 'SEAT_CHOICES', 'DEFAULT_SEATS', 'lanesEnabled', 'laneFor', 'lanesArgs', 'idleHarnesses']) assert.equal(gone in lanes, false, gone)
})
