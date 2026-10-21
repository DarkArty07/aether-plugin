'use strict'

// E7 is not here: a bin has no session to tell apart. The mod-side test (plugins/aether/hooks/quota-brake.test.ts,
// 'a session that is not the Lead sees nothing of the brake') covers it through the mod's own gate.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { PLUGIN, PLAN_BIN, WT_BIN, SESSION_BIN, makeRepo, writePlan, commitIn, runBin, tempDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

const AUTONOMY = path.join(PLUGIN, 'bin', 'aether-autonomy')
const SESSION = 'sess-scenarios-1'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const UNLIMITED = 'sigue hasta acabar aunque se acabe la cuota'

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })
const show = (repo, spec) => spawnSync('git', ['show', spec], { cwd: repo.dir, encoding: 'utf8' }).stdout
const iso = (ms) => new Date(ms).toISOString()

function setup(t) {
  const repo = makeRepo(t)
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), [human(HOURS, '2026-10-21T09:00:00.000Z'), human(UNLIMITED, '2026-10-21T09:05:00.000Z')].join('\n') + '\n')
  const dataDir = tempDir(t, 'aether-data-')
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: SESSION, AETHER_DATA_DIR: dataDir }
  const cli = (args) => runBin(AUTONOMY, args, repo.dir, env)
  const start = () => {
    const r = cli(['start', '--quote', HOURS])
    assert.equal(r.status, 0, r.stdout)
    return r.json.started
  }
  return { repo, cli, start, env, dataDir }
}

test('E1: the five-hour window crosses in an autonomous run', (t) => {
  const { repo, cli, start } = setup(t)
  const run = start()
  const args = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, plan([task(1), task(2)]))], repo.dir).json
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  fs.mkdirSync(path.join(one.path, 'src', 't1'), { recursive: true })
  fs.writeFileSync(path.join(one.path, 'src', 't1', 'wip.js'), 'wip\n')
  const resetsAt = iso(Date.now() + 3600000)
  const crossing = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96.5', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'sent'])
  assert.deepEqual([crossing.json.recorded, crossing.json.paused, crossing.json.run], [true, true, run.id])
  assert.equal(crossing.json.resumeAt, iso(Date.parse(resetsAt) + 120000))
  const status = cli(['status']).json
  assert.equal(status.stop, 'quota')
  assert.deepEqual([status.quota.resetsAt, status.quota.percentUsed], [resetsAt, 96.5])
  const saved = runBin(WT_BIN, ['save', args.runId], repo.dir).json
  assert.equal(cli(['quota-saved', '--from', saved.path]).json.recorded, true)
  const diary = fs.readFileSync(run.diary, 'utf8')
  assert.ok(diary.includes('- Aviso al dueño: enviado.'))
  assert.ok(diary.includes(`la corrida se retoma ${crossing.json.resumeAt}.`))
  assert.ok(diary.includes(`\`task-1\` en \`aether/${args.runId}/task-1\``))
  assert.equal(show(repo, `aether/${args.runId}/task-1:src/t1/wip.js`), 'wip\n')
  const runFile = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'autonomy', run.id, 'run.json'), 'utf8'))
  assert.deepEqual([runFile.ended, runFile.outcome], [null, null])
})

test('E10: a notice that never leaves still pauses, is recorded, and keeps its resume', (t) => {
  const { cli, start } = setup(t)
  const run = start()
  const resetsAt = iso(Date.now() + 3600000)
  const crossing = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '97', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'failed', '--notify-reason', 'disabled'])
  assert.equal(crossing.json.paused, true)
  assert.ok(fs.readFileSync(run.diary, 'utf8').includes('- Aviso al dueño: no enviado (disabled).'))
  const settings = cli(['brake-settings']).json
  assert.deepEqual(settings.paused, { run: run.id, resetsAt, resumeAt: crossing.json.resumeAt, percentUsed: 97 })
})

test('E2 and E3: after the resume hour the stop lifts, and a fresh session is told while it lasts', (t) => {
  const { repo, cli, start, env } = setup(t)
  const run = start()
  const resetsAt = iso(Date.now() + 3600000)
  cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'sent'])
  const sessionEnv = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: env.AETHER_DATA_DIR }
  const input = { hook_event_name: 'SessionStart', session_id: 'sess-next', source: 'startup', agent_type: 'aether:lead' }
  const r = spawnSync(process.execPath, [SESSION_BIN], { cwd: repo.dir, encoding: 'utf8', input: JSON.stringify(input), env: sessionEnv })
  assert.equal(r.status, 0, r.stderr)
  const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext
  assert.ok(context.includes(`the five-hour window resets ${resetsAt} and the run resumes ${iso(Date.parse(resetsAt) + 120000)}`), context.slice(-500))
  // The resume hour passes with no one touching anything: the stop is gone and the pause never counted.
  const runFile = path.join(repo.dir, '.aether', 'autonomy', run.id, 'run.json')
  const state = JSON.parse(fs.readFileSync(runFile, 'utf8'))
  state.quotaPauses[0].started = iso(Date.now() - 3 * 3600000)
  state.quotaPauses[0].resetsAt = iso(Date.now() - 130000)
  state.quotaPauses[0].resumeAt = iso(Date.now() - 10000)
  fs.writeFileSync(runFile, JSON.stringify(state))
  const status = cli(['status']).json
  assert.equal(status.stop, null)
  assert.ok(status.hours.paused > 2.9, JSON.stringify(status.hours))
  assert.ok(status.hours.elapsed < 0.2, JSON.stringify(status.hours))
})

test('E4: the owner words turn the brake off, and the crossing is recorded with the quote', (t) => {
  const { cli, start } = setup(t)
  const run = start()
  assert.equal(cli(['brake-off', '--quote', UNLIMITED]).status, 0)
  const out = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '98', '--resets-at', iso(Date.now() + 3600000), '--threshold', '95', '--notify', 'sent'])
  assert.deepEqual([out.json.paused, out.json.brakeOff, out.json.quote], [false, true, UNLIMITED])
  assert.equal(cli(['status']).json.stop, null)
  assert.ok(fs.readFileSync(run.diary, 'utf8').includes(`«${UNLIMITED}»`))
})

test('E5: with no autonomous run open a crossing records nothing to pause', (t) => {
  const { repo, cli } = setup(t)
  const out = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '99', '--resets-at', iso(Date.now() + 3600000), '--threshold', '95', '--notify', 'sent'])
  assert.deepEqual([out.json.recorded, out.json.paused, out.json.reason], [false, false, 'no-run'])
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'autonomy')), false)
  const settings = cli(['brake-settings']).json
  assert.deepEqual([settings.openRun, settings.paused], [null, null])
})

test('E6: the weekly window crosses and the run goes on', (t) => {
  const { repo, cli, start } = setup(t)
  const run = start()
  const out = cli(['brake-crossing', '--kind', 'seven_day', '--percent', '99', '--resets-at', iso(Date.now() + 86400000), '--threshold', '95', '--notify', 'sent'])
  assert.deepEqual([out.json.recorded, out.json.paused, out.json.reason], [false, false, 'weekly'])
  assert.equal(cli(['status']).json.stop, null)
  const state = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'autonomy', run.id, 'run.json'), 'utf8'))
  assert.deepEqual(state.quotaPauses, [])
})

test('E8: an interrupted workflow is saved on its branches and a relaunch does not repeat it', (t) => {
  const { repo } = setup(t)
  const text = plan([task(1), task(2)])
  const args = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text)], repo.dir).json
  const one = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  commitIn(repo, one.path, 'src/t1/a.js', 'one\n', 'add a')
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], repo.dir).json.merged, true)
  runBin(WT_BIN, ['remove', args.runId, 'task-1'], repo.dir)
  const two = runBin(WT_BIN, ['ensure', args.runId, 'task-2'], repo.dir).json
  fs.mkdirSync(path.join(two.path, 'src', 't2'), { recursive: true })
  fs.writeFileSync(path.join(two.path, 'src', 't2', 'wip.js'), 'wip\n')
  assert.equal(runBin(WT_BIN, ['save', args.runId], repo.dir).status, 0)
  const sweep = runBin(WT_BIN, ['sweep', '--run', args.runId], repo.dir).json
  assert.deepEqual(sweep.savedBranches.map((b) => b.task), ['task-2'])
  const relaunched = runBin(PLAN_BIN, ['compile', writePlan(repo.dir, text), '--run', args.runId], repo.dir)
  assert.equal(relaunched.status, 0, relaunched.stdout + relaunched.stderr)
  assert.deepEqual(relaunched.json.alreadyMerged, ['task-1'])
  assert.deepEqual(Object.keys(relaunched.json.tasks), ['task-2'])
  assert.equal(show(repo, `aether/${args.runId}/task-2:src/t2/wip.js`), 'wip\n')
})

test('E9: no reading at all produces no crossing, and neither does a spend limit', async () => {
  const brake = await import(pathToFileURL(path.join(PLUGIN, 'hooks', 'quota-brake.mjs')).href)
  const state = brake.initialBrakeState(null)
  for (const limits of [[], undefined, null, [{ kind: 'spend_limit', percentUsed: 100, resetsAt: iso(Date.now()) }], [{ kind: 'five_hour' }]]) {
    const out = brake.crossingsOf(limits, 95, state)
    assert.deepEqual(out.crossings, [], JSON.stringify(limits))
    assert.deepEqual(out.state, state)
  }
  const changed = brake.crossingsOf([{ kind: 'five_hour', percentUsed: 95, resetsAt: iso(Date.now()) }], 80, state)
  assert.equal(changed.crossings.length, 1)
})
