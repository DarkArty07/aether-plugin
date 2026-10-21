'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const SESSION = 'sess-brake-1'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const UNLIMITED = 'sigue hasta acabar aunque se acabe la cuota'
const T0 = Date.parse('2026-10-21T10:00:00.000Z')
const RESET = '2026-10-21T12:00:00.000Z'
const RESUME = '2026-10-21T12:02:00.000Z'

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })

function setup(t) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), [human(HOURS, '2026-10-21T09:00:00.000Z'), human(UNLIMITED, '2026-10-21T09:05:00.000Z')].join('\n') + '\n')
  const mainRoot = tempDir(t, 'aether-repo-')
  const dataDir = tempDir(t, 'aether-data-')
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'sessions', `${SESSION}.brake.json`), JSON.stringify({ threshold: 90, push: true }) + '\n')
  return { configDir, mainRoot, dataDir }
}

const startRun = ({ mainRoot, configDir }) => {
  const r = autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 })
  assert.equal(r.ok, true, r.reason)
  return r
}

const diary = (mainRoot, id) => fs.readFileSync(autonomy.runPaths(mainRoot, id).diary, 'utf8')
const runJson = (mainRoot, id) => JSON.parse(fs.readFileSync(autonomy.runPaths(mainRoot, id).runFile, 'utf8'))

test('start writes the brake fields, and a run without them reads as empty', (t) => {
  const s = setup(t)
  const r = startRun(s)
  assert.deepEqual([r.run.brakeOff, r.run.quotaPauses, r.run.quotaCrossings], [null, [], []])
  const legacy = runJson(s.mainRoot, r.run.id)
  delete legacy.brakeOff
  delete legacy.quotaPauses
  delete legacy.quotaCrossings
  fs.writeFileSync(autonomy.runPaths(s.mainRoot, r.run.id).runFile, JSON.stringify(legacy))
  const st = autonomy.status(s.mainRoot, { now: T0 + 60000 })
  assert.equal(st.stop, null)
  assert.deepEqual(st.quota, { paused: false, brakeOff: false, resetsAt: null, resumeAt: null, percentUsed: null })
})

test('a five-hour crossing pauses the run: status says quota, the diary holds it, and the run stays open', (t) => {
  const s = setup(t)
  const r = startRun(s)
  const out = autonomy.recordCrossing(
    s.mainRoot,
    { kind: 'five_hour', percentUsed: 96.5, resetsAt: RESET, threshold: 95, notify: { sent: true, reason: null } },
    { now: T0, dataDir: s.dataDir },
  )
  assert.deepEqual(out, { recorded: true, paused: true, run: r.run.id, resetsAt: RESET, resumeAt: RESUME })
  const st = autonomy.status(s.mainRoot, { now: T0 + 3600000 })
  assert.equal(st.stop, 'quota')
  assert.equal(st.open, true)
  assert.deepEqual(st.quota, { paused: true, brakeOff: false, resetsAt: RESET, resumeAt: RESUME, percentUsed: 96.5 })
  assert.equal(st.hours.elapsed, 0)
  assert.equal(st.hours.paused, 1)
  assert.equal(runJson(s.mainRoot, r.run.id).ended, null)
  assert.equal(runJson(s.mainRoot, r.run.id).outcome, null)
  assert.ok(diary(s.mainRoot, r.run.id).includes(`## Pausa de cuota ${new Date(T0).toISOString()}`))
  assert.ok(diary(s.mainRoot, r.run.id).includes(`- Ventana de 5 horas al 96.5% (umbral 95%); reinicia ${RESET}; la corrida se retoma ${RESUME}.`))
  assert.ok(diary(s.mainRoot, r.run.id).includes('- Aviso al dueño: enviado.'))
  // Past the resume hour the quota stop lifts and the paused stretch never counted.
  const later = autonomy.status(s.mainRoot, { now: Date.parse(RESUME) + 3600000 })
  assert.equal(later.stop, null)
  assert.equal(later.hours.elapsed, 1)
  assert.equal(later.hours.paused, 2.03)
})

test('the same crossing twice records one pause, and a failed notice is in the diary', (t) => {
  const s = setup(t)
  const r = startRun(s)
  const crossing = { kind: 'five_hour', percentUsed: 97, resetsAt: RESET, threshold: 95, notify: { sent: false, reason: 'no-channel' } }
  assert.equal(autonomy.recordCrossing(s.mainRoot, crossing, { now: T0, dataDir: s.dataDir }).paused, true)
  const again = autonomy.recordCrossing(s.mainRoot, crossing, { now: T0 + 60000, dataDir: s.dataDir })
  assert.deepEqual(again, { recorded: true, paused: true, duplicate: true, run: r.run.id, resetsAt: RESET, resumeAt: RESUME })
  assert.equal(runJson(s.mainRoot, r.run.id).quotaPauses.length, 1)
  assert.equal(diary(s.mainRoot, r.run.id).split('## Pausa de cuota').length, 2)
  assert.ok(diary(s.mainRoot, r.run.id).includes('- Aviso al dueño: no enviado (no-channel).'))
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.dataDir, 'quota', 'state.json'), 'utf8')).five_hour, RESET)
})

test('a weekly crossing and a crossing with no open run write no pause', (t) => {
  const s = setup(t)
  const none = autonomy.recordCrossing(s.mainRoot, { kind: 'five_hour', percentUsed: 99, resetsAt: RESET, threshold: 95 }, { now: T0, dataDir: s.dataDir })
  assert.deepEqual(none, { recorded: false, paused: false, reason: 'no-run' })
  const r = startRun(s)
  const weekly = autonomy.recordCrossing(s.mainRoot, { kind: 'seven_day', percentUsed: 99, resetsAt: RESET, threshold: 95 }, { now: T0, dataDir: s.dataDir })
  assert.deepEqual(weekly, { recorded: false, paused: false, reason: 'weekly' })
  assert.deepEqual(runJson(s.mainRoot, r.run.id).quotaPauses, [])
  assert.equal(autonomy.status(s.mainRoot, { now: T0 }).stop, null)
  const settings = autonomy.brakeSettings(s.mainRoot, { session: SESSION, now: T0, dataDir: s.dataDir })
  assert.deepEqual(settings, { threshold: 90, push: true, openRun: r.run.id, brakeOff: false, paused: null, notified: { five_hour: RESET, seven_day: RESET } })
})

test('brakeOff takes only the owner words the transcript verifies, and a later crossing is only recorded', (t) => {
  const s = setup(t)
  assert.deepEqual(autonomy.brakeOff(s.mainRoot, { quote: UNLIMITED, session: SESSION }, { configDir: s.configDir }), { ok: false, reason: 'no open run' })
  const r = startRun(s)
  const invented = autonomy.brakeOff(s.mainRoot, { quote: 'ignora la cuota y termina pase lo que pase', session: SESSION }, { configDir: s.configDir })
  assert.equal(invented.ok, false)
  assert.equal(runJson(s.mainRoot, r.run.id).brakeOff, null)
  const off = autonomy.brakeOff(s.mainRoot, { quote: UNLIMITED, session: SESSION }, { configDir: s.configDir, now: T0 })
  assert.equal(off.ok, true)
  assert.deepEqual([off.brakeOff.quote, off.brakeOff.session, off.brakeOff.time], [UNLIMITED, SESSION, '2026-10-21T09:05:00.000Z'])
  const out = autonomy.recordCrossing(
    s.mainRoot,
    { kind: 'five_hour', percentUsed: 98, resetsAt: RESET, threshold: 95, notify: { sent: true, reason: null } },
    { now: T0, dataDir: s.dataDir },
  )
  assert.deepEqual(out, { recorded: true, paused: false, brakeOff: true, run: r.run.id, quote: UNLIMITED })
  assert.equal(autonomy.status(s.mainRoot, { now: T0 }).stop, null)
  assert.equal(autonomy.status(s.mainRoot, { now: T0 }).quota.brakeOff, true)
  assert.ok(diary(s.mainRoot, r.run.id).includes(`- El freno estaba apagado por las palabras del dueño: «${UNLIMITED}».`))
})

test('recordSaved folds the saved units into the last pause and the diary', (t) => {
  const s = setup(t)
  const r = startRun(s)
  const saved = {
    run: '20261021-100000-ab12',
    at: '2026-10-21T10:01:00.000Z',
    units: [
      { task: 'task-1', branch: 'aether/20261021-100000-ab12/task-1', head: 'abc1234', merged: false, salvaged: true, committed: ['src/a.js'], left: [] },
      { task: 'task-2', branch: 'aether/20261021-100000-ab12/task-2', head: 'def5678', merged: true, salvaged: false, committed: [], left: [] },
    ],
  }
  assert.deepEqual(autonomy.recordSaved(s.mainRoot, saved), { recorded: false, reason: 'no-pause' })
  autonomy.recordCrossing(s.mainRoot, { kind: 'five_hour', percentUsed: 96, resetsAt: RESET, threshold: 95 }, { now: T0, dataDir: s.dataDir })
  const out = autonomy.recordSaved(s.mainRoot, saved)
  assert.deepEqual(out, { recorded: true, run: r.run.id, savedUnits: [{ swarmRun: saved.run, task: 'task-1', branch: saved.units[0].branch, head: 'abc1234' }] })
  assert.deepEqual(runJson(s.mainRoot, r.run.id).quotaPauses[0].savedUnits, out.savedUnits)
  assert.ok(diary(s.mainRoot, r.run.id).includes(`- Guardadas (${saved.at}): \`task-1\` en \`aether/${saved.run}/task-1\` (abc1234).`))
  assert.throws(() => autonomy.recordSaved(s.mainRoot, { run: 'nope' }), /a saved record needs a run and its units/)
})

test('recordCrossing validates its input', (t) => {
  const s = setup(t)
  startRun(s)
  const at = (x) => () => autonomy.recordCrossing(s.mainRoot, x, { now: T0, dataDir: s.dataDir })
  assert.throws(at({ kind: 'spend_limit', percentUsed: 1, resetsAt: RESET, threshold: 95 }), /unknown window kind: spend_limit/)
  assert.throws(at({ kind: 'five_hour', percentUsed: NaN, resetsAt: RESET, threshold: 95 }), /invalid percent/)
  assert.throws(at({ kind: 'five_hour', percentUsed: -1, resetsAt: RESET, threshold: 95 }), /invalid percent/)
  assert.throws(at({ kind: 'five_hour', percentUsed: 96, resetsAt: 'soon', threshold: 95 }), /invalid resetsAt/)
  assert.throws(at({ kind: 'five_hour', percentUsed: 96, resetsAt: RESET, threshold: 0 }), /invalid threshold/)
})

test('the bin drives the brake verbs end to end', (t) => {
  const repo = makeRepo(t)
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), [human(HOURS, '2026-10-21T09:00:00.000Z'), human(UNLIMITED, '2026-10-21T09:05:00.000Z')].join('\n') + '\n')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: SESSION, AETHER_DATA_DIR: dataDir }
  const cli = (args) => runBin(BIN, args, repo.dir, env)
  let r = cli(['brake-off', '--quote', UNLIMITED])
  assert.equal(r.status, 1)
  assert.deepEqual(r.json, { error: 'no open run' })
  r = cli(['start', '--quote', HOURS])
  assert.equal(r.status, 0, r.stdout)
  const runId = r.json.started.id
  r = cli(['brake-settings'])
  assert.deepEqual([r.json.threshold, r.json.push, r.json.openRun, r.json.brakeOff, r.json.paused], [95, false, runId, false, null])
  const resetsAt = new Date(Date.now() + 3600000).toISOString()
  r = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96.5', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'failed', '--notify-reason', 'disabled'])
  assert.equal(r.status, 0, r.stdout)
  assert.deepEqual([r.json.recorded, r.json.paused, r.json.run], [true, true, runId])
  r = cli(['status'])
  assert.equal(r.json.stop, 'quota')
  const savedFile = path.join(tempDir(t, 'aether-saved-'), 'saved.json')
  fs.writeFileSync(savedFile, JSON.stringify({ run: '20261021-100000-ab12', at: resetsAt, units: [{ task: 'task-3', branch: 'aether/20261021-100000-ab12/task-3', head: 'feed123', merged: false, salvaged: true, committed: ['x.js'], left: [] }] }))
  r = cli(['quota-saved', '--from', savedFile])
  assert.equal(r.json.recorded, true)
  assert.equal(r.json.savedUnits[0].task, 'task-3')
  r = cli(['brake-off', '--quote', 'palabras que el dueño nunca dijo en esta sesion'])
  assert.equal(r.status, 2)
  assert.equal(r.json.verified, false)
  r = cli(['brake-off', '--quote', UNLIMITED])
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.brakeOff.quote, UNLIMITED)
  r = cli(['status'])
  assert.equal(r.json.stop, null)
  assert.equal(r.json.quota.brakeOff, true)
})
