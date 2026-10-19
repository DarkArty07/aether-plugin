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
const LEVELS = { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' }

// A second harness of two models, the first replacing sonnet for implementers and reviewers, the second
// replacing haiku for supervisors. Its implementer wait is longer than agy's, and its reviewer wait is 5 rounds.
function codexHarness(group = 'codex') {
  return {
    command: 'codex',
    maxParallel: 2,
    waitSeconds: 300,
    timeouts: { implementer: 3000, supervisor: 900, reviewer: 1200, designer: 1800 },
    groups: { [group]: 'Codex Models' },
    models: {
      'gpt-codex': { group, replaces: 'sonnet', roles: ['implementer', 'reviewer'], levels: LEVELS },
      'gpt-mini': { group, replaces: 'haiku', roles: ['supervisor'], levels: LEVELS },
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

test('the shipped table names one lane model per native model, with its group, roles and levels', () => {
  const config = shipped()
  assert.equal(config.reserve, 0.05)
  const agy = config.harnesses.agy
  assert.equal(agy.command, 'agy')
  assert.equal(agy.maxParallel, 4)
  assert.equal(agy.waitSeconds, 540)
  assert.deepEqual(agy.timeouts, { implementer: 2700, supervisor: 900, reviewer: 1200, judge: 1200, writer: 2700, examiner: 1800 })
  assert.deepEqual(agy.groups, { gemini: 'Gemini Models', claude: 'Claude and GPT models' })
  assert.deepEqual(
    Object.entries(agy.models).map(([id, m]) => [id, m.group, m.replaces, m.roles, m.levels]),
    [
      ['gemini-3.8-flash', 'gemini', 'haiku', ['implementer'], LEVELS],
      ['claude-sonnet-5-5', 'claude', 'sonnet', ['implementer', 'supervisor'], LEVELS],
      ['claude-opus-5-5', 'claude', 'opus', ['implementer', 'reviewer'], LEVELS],
      ['gemini-4-argon', 'gemini', undefined, ['judge', 'writer', 'examiner'], LEVELS],
    ],
  )
  assert.deepEqual(config.designSeats, {
    native: { judge: [], writer: [], examiner: false },
    balanced: { judge: ['agy/gemini-4-argon'], writer: [], examiner: ['agy/gemini-4-argon'] },
    robust: { judge: [], writer: ['agy/gemini-4-argon'], examiner: [] },
  })
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
    [(c) => (c.harnesses.agy.timeouts.reviewer = -1), /timeouts/],
    [(c) => (c.harnesses.agy.models['gemini-3.8-flash'].group = 'other'), /gemini-3\.8-flash.*group/],
    [(c) => (c.harnesses.agy.models['gemini-3.8-flash'].replaces = 'gpt'), /gemini-3\.8-flash.*replaces/],
    [(c) => (c.harnesses.agy.models['gemini-3.8-flash'].roles = ['ops']), /gemini-3\.8-flash.*roles/],
    [(c) => (c.harnesses.agy.models['claude-opus-5-5'].roles = ['implementer', 'designer']), /claude-opus-5-5.*roles/],
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

test('loadConfig refuses design seats it cannot trust, naming the choice and the seat', (t) => {
  const bad = [
    [(c) => (c.designSeats = []), /designSeats must be an object/],
    [(c) => (c.designSeats.cheap = { judge: [] }), /designSeats\.cheap: the choice must be native, balanced or robust/],
    [(c) => (c.designSeats.balanced.designer = []), /designSeats\.balanced: designer is not judge, writer or examiner/],
    [(c) => (c.designSeats.balanced.judge = false), /designSeats\.balanced\.judge: only the examiner can be off/],
    [(c) => (c.designSeats.balanced.judge = 'agy/gemini-4-argon'), /designSeats\.balanced\.judge must be a list/],
    [(c) => (c.designSeats.balanced.judge = ['gemini-4-argon']), /must be <harness>\/<model>/],
    [(c) => (c.designSeats.balanced.judge = ['codex/gemini-4-argon']), /codex\/gemini-4-argon is not a model in the table/],
    [(c) => (c.designSeats.robust.writer = ['agy/claude-opus-5-5']), /agy\/claude-opus-5-5 does not list writer in its roles/],
    [(c) => (c.harnesses.agy.models['gemini-4-argon'].replaces = 'gpt'), /gemini-4-argon.*replaces/],
    [(c) => (c.harnesses.agy.models['gemini-4-argon'].roles = ['judge', 'reviewer']), /gemini-4-argon.*replaces/],
    [(c) => (c.harnesses.agy.timeouts.judge = 0), /timeouts must give an integer of at least 1 for each seat/],
  ]
  for (const [mutate, pattern] of bad) {
    const file = writeConfig(t, mutate)
    assert.throws(
      () => lanes.loadConfig(file),
      (err) => err.message.startsWith(`lanes config ${file}: `) && pattern.test(err.message),
      String(pattern),
    )
  }
  const without = writeConfig(t, (c) => {
    delete c.designSeats
    delete c.harnesses.agy.timeouts.writer
  })
  const config = lanes.loadConfig(without)
  assert.deepEqual(lanes.seatList(config, 'balanced', 'judge'), [])
  assert.equal(lanes.seatTimeout(config.harnesses.agy, 'writer'), 2700)
})

test('seatsChoice takes native, balanced or robust, and balanced for anything else, which it marks unknown', () => {
  assert.deepEqual(lanes.seatsChoice({}), { name: 'balanced', known: true })
  assert.deepEqual(lanes.seatsChoice({ AETHER_SEATS: 'native' }), { name: 'native', known: true })
  assert.deepEqual(lanes.seatsChoice({ AETHER_SEATS: ' ROBUST ' }), { name: 'robust', known: true })
  assert.deepEqual(lanes.seatsChoice({ AETHER_SEATS: 'cheap' }), { name: 'balanced', known: false })
  const c = shipped()
  assert.equal(lanes.seatList(c, 'native', 'examiner'), false)
  assert.deepEqual(lanes.seatList(c, 'robust', 'writer'), ['agy/gemini-4-argon'])
  assert.deepEqual(lanes.seatList(null, 'robust', 'writer'), [])
})

test('a model that only takes seats gets no swarm call', () => {
  const c = shipped()
  for (const role of ['implementer', 'supervisor', 'reviewer']) {
    for (const model of ['haiku', 'sonnet', 'opus']) {
      const lane = lanes.laneFor(c, role, model, 'high')
      assert.notEqual(lane && lane.model, 'gemini-4-argon', `${role} ${model}`)
    }
  }
  const args = lanes.lanesArgs(c, { installed: () => true, enabled: ['agy'] })
  assert.equal(JSON.stringify(args.calls).includes('gemini-4-argon'), false)
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
  assert.equal(lanes.laneFor(c, 'designer', 'opus', 'xhigh'), null)
  assert.equal(lanes.laneFor(c, 'implementer', 'opus', 'max'), null)
  assert.equal(lanes.laneFor(c, 'supervisor', 'haiku', 'high'), null)
  assert.equal(lanes.laneFor(c, 'reviewer', 'sonnet', 'high'), null)
  assert.equal(lanes.laneFor(c, 'ops', 'haiku', 'low'), null)
  assert.equal(lanes.laneFor(null, 'implementer', 'haiku', 'xhigh'), null)
})

test('a role left out of a model turns that lane off', (t) => {
  const file = writeConfig(t, (c) => (c.harnesses.agy.models['claude-opus-5-5'].roles = ['implementer']))
  assert.equal(lanes.laneFor(lanes.loadConfig(file), 'reviewer', 'opus', 'xhigh'), null)
})

test('lanesArgs gives the run its lanes when the harness is installed, and null otherwise', () => {
  const c = shipped()
  const seen = []
  const args = lanes.lanesArgs(c, { enabled: ['agy'], installed: (name, harness) => (seen.push([name, harness.command]), true) })
  assert.deepEqual(seen, [['agy', 'agy']])
  assert.deepEqual(args, {
    harness: 'agy',
    harnesses: ['agy'],
    maxParallel: 4,
    maxParallelByHarness: { agy: 4 },
    waits: { implementer: 6, supervisor: 3, reviewer: 4 },
    calls: {
      implementer: {
        haiku: [{ model: 'gemini-3.8-flash', group: 'gemini', harness: 'agy' }],
        sonnet: [{ model: 'claude-sonnet-5-5', group: 'claude', harness: 'agy' }],
        opus: [{ model: 'claude-opus-5-5', group: 'claude', harness: 'agy' }],
      },
      supervisor: { sonnet: [{ model: 'claude-sonnet-5-5', group: 'claude', harness: 'agy' }] },
      reviewer: { opus: [{ model: 'claude-opus-5-5', group: 'claude', harness: 'agy' }] },
    },
  })
  assert.equal(lanes.lanesArgs(c, { enabled: ['agy'], installed: () => false }), null)
  assert.equal(lanes.lanesArgs(null, { enabled: ['agy'], installed: () => true }), null)
  // cursor ships without models, so on its own it gives no calls.
  assert.equal(lanes.lanesArgs(c, { enabled: ['cursor'], installed: () => true }), null)
})

test('lanesArgs lists every enabled, installed harness with a model for each call, harnesses in the order enabled', () => {
  const c = twoHarnesses()
  const everywhere = () => true
  const codexFirst = lanes.lanesArgs(c, { enabled: ['codex', 'agy'], installed: everywhere })
  assert.deepEqual(codexFirst, {
    harness: 'codex',
    harnesses: ['codex', 'agy'],
    maxParallel: 2,
    maxParallelByHarness: { codex: 2, agy: 4 },
    waits: { implementer: 11, supervisor: 4, reviewer: 5 },
    calls: {
      implementer: {
        haiku: [{ model: 'gemini-3.8-flash', group: 'gemini', harness: 'agy' }],
        sonnet: [
          { model: 'gpt-codex', group: 'codex', harness: 'codex' },
          { model: 'claude-sonnet-5-5', group: 'claude', harness: 'agy' },
        ],
        opus: [{ model: 'claude-opus-5-5', group: 'claude', harness: 'agy' }],
      },
      supervisor: {
        haiku: [{ model: 'gpt-mini', group: 'codex', harness: 'codex' }],
        sonnet: [{ model: 'claude-sonnet-5-5', group: 'claude', harness: 'agy' }],
      },
      reviewer: {
        sonnet: [{ model: 'gpt-codex', group: 'codex', harness: 'codex' }],
        opus: [{ model: 'claude-opus-5-5', group: 'claude', harness: 'agy' }],
      },
    },
  })

  // Enabled the other way round, agy comes first for the sonnet implementer, and codex stays a candidate after it.
  const agyFirst = lanes.lanesArgs(c, { enabled: ['agy', 'codex'], installed: everywhere })
  assert.equal(agyFirst.harness, 'agy')
  assert.deepEqual(agyFirst.harnesses, ['agy', 'codex'])
  assert.equal(agyFirst.maxParallel, 4)
  assert.deepEqual(agyFirst.calls.implementer.sonnet.map((lane) => `${lane.harness}/${lane.model}`), ['agy/claude-sonnet-5-5', 'codex/gpt-codex'])
  assert.deepEqual(agyFirst.calls.reviewer.sonnet.map((lane) => `${lane.harness}/${lane.model}`), ['codex/gpt-codex'])

  // Only codex enabled: its calls alone, and no call for a native model it has no model for.
  const onlyCodex = lanes.lanesArgs(c, { enabled: ['codex'], installed: everywhere })
  assert.deepEqual(onlyCodex.harnesses, ['codex'])
  assert.equal(onlyCodex.calls.implementer.haiku, undefined)
  assert.equal(onlyCodex.calls.reviewer.opus, undefined)
  assert.deepEqual(onlyCodex.maxParallelByHarness, { codex: 2 })

  // A harness not installed gives no calls, and a harness not in the table is skipped.
  const agyMissing = lanes.lanesArgs(c, { enabled: ['codex', 'agy'], installed: (name) => name !== 'agy' })
  assert.deepEqual(agyMissing.harnesses, ['codex'])
  assert.equal(agyMissing.calls.implementer.haiku, undefined)
  assert.deepEqual(agyMissing.calls.implementer.sonnet.map((lane) => lane.harness), ['codex'])
  assert.equal(lanes.lanesArgs(c, { enabled: ['cursor'], installed: everywhere }), null)
  assert.equal(lanes.lanesArgs(c, { enabled: [], installed: everywhere }), null)
})

test('two models of one harness for the same call are both candidates, in the order of the table', () => {
  const c = shipped()
  c.harnesses.agy.models['gemini-3.9-flash'] = { ...c.harnesses.agy.models['gemini-3.8-flash'] }
  const args = lanes.lanesArgs(c, { enabled: ['agy'], installed: () => true })
  assert.deepEqual(args.calls.implementer.haiku.map((lane) => lane.model), ['gemini-3.8-flash', 'gemini-3.9-flash'])
})

test('lanesArgs gives each role the largest wait among the listed harnesses that serve it', () => {
  const c = twoHarnesses()
  // codex serves no reviewer model: the reviewer wait is agy's, though codex's own wait would be 11 rounds.
  c.harnesses.codex.models['gpt-codex'].roles = ['implementer']
  c.harnesses.codex.timeouts.reviewer = 3000
  const args = lanes.lanesArgs(c, { enabled: ['codex', 'agy'], installed: () => true })
  assert.deepEqual(args.harnesses, ['codex', 'agy'])
  assert.deepEqual(args.waits, { implementer: 11, supervisor: 4, reviewer: 4 })
})

test('lanesArgs reads the enabled harnesses from AETHER_LANE_HARNESSES when none are given', (t) => {
  const previous = process.env.AETHER_LANE_HARNESSES
  t.after(() => {
    if (previous === undefined) delete process.env.AETHER_LANE_HARNESSES
    else process.env.AETHER_LANE_HARNESSES = previous
  })
  process.env.AETHER_LANE_HARNESSES = 'codex'
  assert.equal(lanes.lanesArgs(twoHarnesses(), { installed: () => true }).harness, 'codex')
  process.env.AETHER_LANE_HARNESSES = 'nope'
  assert.equal(lanes.lanesArgs(twoHarnesses(), { installed: () => true }).harness, 'agy')
})

test('idleHarnesses names each enabled harness that gives no call, with the reason, in the enabled order', () => {
  const config = twoHarnesses()
  config.harnesses.grok = { ...codexHarness(), command: 'grok', groups: { grok: 'Grok plan' }, models: {} }
  const installed = (name) => name !== 'cursor'
  assert.deepEqual(lanes.idleHarnesses(config, { installed, enabled: ['agy', 'codex', 'grok', 'cursor'] }).map((h) => h.name), ['grok', 'cursor'])
  assert.deepEqual(lanes.idleHarnesses(config, { installed, enabled: ['grok'] }), [{ name: 'grok', reason: 'has no models in the lane table yet' }])
  assert.deepEqual(lanes.idleHarnesses(config, { installed: () => false, enabled: ['codex'] }), [{ name: 'codex', reason: `is not installed: ${config.harnesses.codex.command} was not found` }])
  delete config.harnesses.grok
  assert.deepEqual(lanes.idleHarnesses(config, { installed, enabled: ['grok'] }), [{ name: 'grok', reason: 'has no entry in the lane table' }])
  assert.deepEqual(lanes.idleHarnesses(null, { installed, enabled: ['agy'] }), [])
})

test('idleHarnesses names a harness whose models serve no swarm role', () => {
  const config = twoHarnesses()
  config.harnesses.codex.models = { 'gpt-judge': { group: 'codex', roles: ['judge'], levels: LEVELS } }
  assert.deepEqual(lanes.idleHarnesses(config, { installed: () => true, enabled: ['agy', 'codex'] }), [
    { name: 'codex', reason: 'takes no swarm call: none of its models serves implementer, supervisor or reviewer' },
  ])
  // A harness that is enabled later is no longer idle because an earlier one has models for the same calls.
  assert.deepEqual(lanes.idleHarnesses(twoHarnesses(), { installed: () => true, enabled: ['codex', 'agy'] }), [])
})

test('the shipped table has codex and cursor without models, and grok with grok-4.7 at the haiku tier', () => {
  const config = shipped()
  assert.deepEqual(Object.keys(config.harnesses), ['agy', 'codex', 'grok', 'cursor', 'muse'])
  for (const name of ['codex', 'cursor']) assert.deepEqual(config.harnesses[name].models, {}, name)
  assert.deepEqual(config.harnesses.cursor.command, 'cursor-agent')
  // grok-4.7-build-fast is the same model faster and twice the price: it is not a lane model.
  assert.deepEqual(Object.keys(config.harnesses.grok.models), ['grok-4.7'])
  const args = lanes.lanesArgs(config, { installed: () => true, enabled: ['codex', 'grok', 'cursor', 'agy'] })
  // codex and cursor take no call; for the haiku implementer grok comes first and Gemini after it, agy takes the rest.
  assert.deepEqual(args.harnesses, ['grok', 'agy'])
  assert.deepEqual(args.calls.implementer.haiku, [
    { model: 'grok-4.7', group: 'grok', harness: 'grok' },
    { model: 'gemini-3.8-flash', group: 'gemini', harness: 'agy' },
  ])
  assert.deepEqual(args.calls.implementer.sonnet.map((lane) => lane.harness), ['agy'])
  assert.deepEqual(args.calls.implementer.opus.map((lane) => lane.harness), ['agy'])
  assert.deepEqual(args.calls.supervisor.sonnet.map((lane) => lane.harness), ['agy'])
  assert.deepEqual(args.calls.reviewer.opus.map((lane) => lane.harness), ['agy'])
})

test('enabledHarnesses reads AETHER_LANE_HARNESSES: known names, trimmed, lowercased, each once, in order', () => {
  assert.deepEqual(lanes.enabledHarnesses({}), ['agy'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: '' }), ['agy'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'nope, ,' }), ['agy'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: ' Codex , grok,codex,AGY,nope,cursor ' }), ['codex', 'grok', 'agy', 'cursor'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'cursor' }), ['cursor'])
})

test('loadConfig refuses two harnesses that use one group key, and accepts distinct keys', (t) => {
  const shared = writeConfig(t, (c) => (c.harnesses.codex = codexHarness('gemini')))
  assert.throws(
    () => lanes.loadConfig(shared),
    (err) => err.message.startsWith(`lanes config ${shared}: `) && err.message.includes('group gemini is used by harnesses agy and codex: group keys are unique across the table'),
  )
  const distinct = writeConfig(t, (c) => (c.harnesses.codex = codexHarness()))
  assert.deepEqual(Object.keys(lanes.loadConfig(distinct).harnesses), ['agy', 'codex', 'grok', 'cursor', 'muse'])
})

test('loadConfig refuses one model id in two harnesses, and accepts distinct ids', (t) => {
  // claude-opus-5-5 is agy's model; codex lists it too, with its own group, so the id is in two harnesses.
  const twice = writeConfig(t, (c) => {
    c.harnesses.codex = codexHarness()
    c.harnesses.codex.models['claude-opus-5-5'] = { group: 'codex', replaces: 'opus', roles: ['reviewer'], levels: LEVELS }
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

test('lanesEnabled: lanes are on only when AETHER_LANES is on, and only on Linux', () => {
  assert.deepEqual(lanes.lanesEnabled({ AETHER_LANES: 'on' }, 'linux'), { on: true, reason: null })
  assert.deepEqual(lanes.lanesEnabled({ AETHER_LANES: 'on' }, 'darwin'), { on: false, reason: 'platform' })
  assert.deepEqual(lanes.lanesEnabled({ AETHER_LANES: 'on' }, 'win32'), { on: false, reason: 'platform' })
  for (const value of [undefined, '', 'off', 'ON', 'true', '1']) {
    assert.deepEqual(lanes.lanesEnabled({ AETHER_LANES: value }, 'linux'), { on: false, reason: 'option' }, String(value))
  }
  assert.deepEqual(lanes.lanesEnabled({}, 'darwin'), { on: false, reason: 'option' })
})

test('the table takes a model id exactly when the lane choice can log it: the table, lane-choice.js and the mod agree (R16)', async (t) => {
  const choice = require('../plugins/aether/lib/lane-choice.js')
  const { parseOpsPrompt } = await import(path.join(__dirname, '..', 'plugins', 'aether', 'hooks', 'ops-command.mjs'))
  const inTable = (id) => {
    const file = writeConfig(t, (c) => {
      c.harnesses.agy.models[id] = c.harnesses.agy.models['gemini-3.8-flash']
      delete c.harnesses.agy.models['gemini-3.8-flash']
    })
    try {
      lanes.loadConfig(file)
      return true
    } catch (err) {
      assert.match(err.message, /model .*: id must/, id)
      return false
    }
  }
  const logs = (id) => {
    const item = `agy:${id}:0.5:picked`
    const read = (() => {
      try {
        choice.parseOrder(item)
        choice.parsePick(`agy:${id}`)
        return true
      } catch {
        return false
      }
    })()
    const command = `aether-lane choice 20261014-060800-ab12 task-1-1-implement --role implementer --tier haiku --effort high --pick agy:${id} --order ${item}`
    const prompt = ['Run this command with the Bash tool, once, exactly as written:', '', `cd '/repo' && ${command}`, '', 'Then return its exit code and its complete standard output, exactly as printed. Do not run anything else, and do not fix or retry anything.'].join('\n')
    assert.equal(parseOpsPrompt(prompt) !== null, read, `${id}: lib and mod agree`)
    return read
  }
  const shippedIds = Object.values(shipped().harnesses).flatMap((h) => Object.keys(h.models))
  assert.ok(shippedIds.length > 0)
  for (const id of shippedIds) assert.equal(logs(id), true, `shipped ${id}`)
  assert.doesNotThrow(() => lanes.loadConfig(lanes.CONFIG_FILE))
  const ids = ['m1', 'gpt-5.1', 'a_b', 'x-ai/grok-5', 'gpt-5@high', 'o3:high', '-x', '.x', '_x', 'x y', 'x;y', 'x$y', "x'y", 'é', 'x\\y', 'x/', 'a::b']
  for (const id of ids) assert.equal(inTable(id), logs(id), id)
  assert.equal(inTable('x-ai/grok-5'), false)
  assert.equal(inTable('gpt-5@high'), false)
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

test('the shipped lane table has a muse harness with one lane at a time and no models until Artificial Analysis measures one', () => {
  const config = lanes.loadConfig(lanes.CONFIG_FILE)
  const muse = config.harnesses.muse
  assert.deepEqual([muse.command, muse.maxParallel, muse.quotaLifeMinutes, muse.waitSeconds], ['muse', 1, 30, 540])
  assert.deepEqual(muse.timeouts, { implementer: 2700, supervisor: 900, reviewer: 1200 })
  assert.deepEqual(muse.groups, { muse: 'Muse subscription' })
  assert.deepEqual(muse.models, {})
  assert.equal(JSON.stringify(config.designSeats).includes('muse'), false, 'Muse takes no design seat')
})

test('muse is a valid value of the harnesses option, in the owner order, without duplicates or unknown names', () => {
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'agy,muse' }), ['agy', 'muse'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: ' MUSE , agy, muse, gork ' }), ['muse', 'agy'])
  assert.deepEqual(lanes.enabledHarnesses({ AETHER_LANE_HARNESSES: 'gork' }), ['agy'])
})

test('a Muse model of a synthetic table gives the swarm a candidate after agy, in the order enabled', () => {
  const config = JSON.parse(JSON.stringify(lanes.loadConfig(lanes.CONFIG_FILE)))
  config.harnesses.muse.models = { 'muse-spark-1.3': { group: 'muse', replaces: 'sonnet', roles: ['implementer'], levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' } } }
  const args = lanes.lanesArgs(config, { installed: () => true, enabled: ['agy', 'muse'] })
  assert.deepEqual(args.harnesses, ['agy', 'muse'])
  assert.deepEqual(args.calls.implementer.sonnet.map((c) => c.harness), ['agy', 'muse'])
  assert.equal(args.maxParallelByHarness.muse, 1)
})

