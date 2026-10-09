'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const close = (a, b) => Math.abs(a - b) < 1e-9
const shipped = () => lanes.loadConfig(lanes.CONFIG_FILE)
const LEVELS = { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' }

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

test('the shipped table names one lane model per native model, with its group, roles and levels', () => {
  const config = shipped()
  assert.equal(config.reserve, 0.05)
  const agy = config.harnesses.agy
  assert.equal(agy.command, 'agy')
  assert.equal(agy.maxParallel, 4)
  assert.equal(agy.waitSeconds, 540)
  assert.deepEqual(agy.timeouts, { implementer: 2700, supervisor: 900, reviewer: 1200, designer: 1800 })
  assert.deepEqual(agy.groups, { gemini: 'Gemini Models', claude: 'Claude and GPT models' })
  assert.deepEqual(
    Object.entries(agy.models).map(([id, m]) => [id, m.group, m.replaces, m.roles, m.levels]),
    [
      ['gemini-3.8-flash', 'gemini', 'haiku', ['implementer'], LEVELS],
      ['claude-sonnet-5-5', 'claude', 'sonnet', ['implementer', 'supervisor'], LEVELS],
      ['claude-opus-5-5', 'claude', 'opus', ['implementer', 'reviewer', 'designer'], LEVELS],
    ],
  )
  assert.deepEqual(agy.models['gemini-3.8-flash'].aa, { slug: 'gemini-3-8-flash', intelligence: 40.9, terminalBench: 0.2, checked: '2026-10-08' })
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
    [(c) => (c.harnesses.agy.maxParallel = 0), /maxParallel/],
    [(c) => (c.harnesses.agy.waitSeconds = 'soon'), /waitSeconds/],
    [(c) => (c.harnesses.agy.timeouts.designer = -1), /timeouts/],
    [(c) => (c.harnesses.agy.models['gemini-3.8-flash'].group = 'other'), /gemini-3\.8-flash.*group/],
    [(c) => (c.harnesses.agy.models['gemini-3.8-flash'].replaces = 'gpt'), /gemini-3\.8-flash.*replaces/],
    [(c) => (c.harnesses.agy.models['gemini-3.8-flash'].roles = ['ops']), /gemini-3\.8-flash.*roles/],
    [(c) => (c.harnesses.agy.models['claude-opus-5-5'].levels.xhigh = 'max'), /claude-opus-5-5.*levels/],
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

test('laneFor maps a native call to its lane model and level, and keeps max and unlisted roles native', () => {
  const c = shipped()
  assert.deepEqual(lanes.laneFor(c, 'implementer', 'haiku', 'medium'), {
    harness: 'agy',
    model: 'gemini-3.8-flash',
    group: 'gemini',
    agyModel: 'gemini-3.8-flash-medium',
  })
  assert.equal(lanes.laneFor(c, 'implementer', 'haiku', 'xhigh').agyModel, 'gemini-3.8-flash-high')
  assert.deepEqual(lanes.laneFor(c, 'supervisor', 'sonnet', 'high'), {
    harness: 'agy',
    model: 'claude-sonnet-5-5',
    group: 'claude',
    agyModel: 'claude-sonnet-5-5-high',
  })
  assert.equal(lanes.laneFor(c, 'implementer', 'sonnet', 'xhigh').agyModel, 'claude-sonnet-5-5-high')
  assert.equal(lanes.laneFor(c, 'reviewer', 'opus', 'high').agyModel, 'claude-opus-5-5-high')
  assert.equal(lanes.laneFor(c, 'designer', 'opus', 'xhigh').agyModel, 'claude-opus-5-5-high')
  assert.equal(lanes.laneFor(c, 'implementer', 'opus', 'max'), null)
  assert.equal(lanes.laneFor(c, 'supervisor', 'haiku', 'high'), null)
  assert.equal(lanes.laneFor(c, 'reviewer', 'sonnet', 'high'), null)
  assert.equal(lanes.laneFor(c, 'ops', 'haiku', 'low'), null)
  assert.equal(lanes.laneFor(null, 'implementer', 'haiku', 'xhigh'), null)
})

test('a role left out of a model turns that lane off', (t) => {
  const file = writeConfig(t, (c) => (c.harnesses.agy.models['claude-opus-5-5'].roles = ['implementer', 'reviewer']))
  assert.equal(lanes.laneFor(lanes.loadConfig(file), 'designer', 'opus', 'xhigh'), null)
})

test('lanesArgs gives the run its lanes when the harness is installed, and null otherwise', () => {
  const c = shipped()
  const seen = []
  const args = lanes.lanesArgs(c, { installed: (name, harness) => (seen.push([name, harness.command]), true) })
  assert.deepEqual(seen, [['agy', 'agy']])
  assert.deepEqual(args, {
    harness: 'agy',
    maxParallel: 4,
    waits: { implementer: 6, supervisor: 3, reviewer: 4 },
    calls: {
      implementer: {
        haiku: { model: 'gemini-3.8-flash', group: 'gemini' },
        sonnet: { model: 'claude-sonnet-5-5', group: 'claude' },
        opus: { model: 'claude-opus-5-5', group: 'claude' },
      },
      supervisor: { sonnet: { model: 'claude-sonnet-5-5', group: 'claude' } },
      reviewer: { opus: { model: 'claude-opus-5-5', group: 'claude' } },
    },
  })
  assert.equal(lanes.lanesArgs(c, { installed: () => false }), null)
  assert.equal(lanes.lanesArgs(null, { installed: () => true }), null)
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
