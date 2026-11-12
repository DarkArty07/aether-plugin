'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, makeRepo, tempDir, runBin, compile } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const run = require('../plugins/aether/lib/run.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const WT = path.join(PLUGIN, 'bin', 'aether-wt')
const COMMAND = path.join(PLUGIN, 'lib', 'autonomy-command.js')
const SESSION = 'sess-brake-cmd'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const PUSH = 'sube el trabajo a origin cuando el freno de cuota lo pida'

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: time, message: { role: 'user', content: text } })

function writeAt(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

function setup(t, { push = false, grant = false } = {}) {
  const repo = makeRepo(t)
  const bare = tempDir(t, 'aether-origin-')
  const init = spawnSync('git', ['init', '-q', '--bare', '-b', 'main', bare], { encoding: 'utf8' })
  if (init.status !== 0) throw new Error(init.stderr || init.stdout)
  repo.git('remote', 'add', 'origin', bare)
  repo.git('config', 'protocol.file.allow', 'always')
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  const lines = [human(HOURS, '2026-10-21T09:00:00.000Z')]
  if (grant) lines.push(human(PUSH, '2026-10-21T09:01:00.000Z'))
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), lines.join('\n') + '\n')
  const dataDir = tempDir(t, 'aether-data-')
  if (push) {
    fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'sessions', `${SESSION}.brake.json`), JSON.stringify({ threshold: 95, push: true }) + '\n')
  }
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: SESSION, AETHER_DATA_DIR: dataDir }
  const cli = (args) => runBin(BIN, args, repo.dir, env)
  const started = cli(['start', '--quote', HOURS])
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const autoId = started.json.started.id
  const runFile = path.join(repo.dir, '.aether', 'autonomy', autoId, 'run.json')
  const state = JSON.parse(fs.readFileSync(runFile, 'utf8'))
  state.started = new Date(Date.now() - 60_000).toISOString()
  fs.writeFileSync(runFile, JSON.stringify(state))
  if (grant) {
    const g = cli(['grant', '--class', 'push', '--quote', PUSH])
    assert.equal(g.status, 0, g.stdout + g.stderr)
  }
  const pause = () => {
    const crossing = cli(['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', new Date(Date.now() + 3600_000).toISOString(), '--threshold', '95', '--notify', 'sent'])
    assert.equal(crossing.status, 0, crossing.stdout)
  }
  return { repo, bare, cli, autoId, runFile, pause }
}

// A real in-flight swarm: one unit with an uncommitted file inside Owns.
function inFlight(repo) {
  const args = compile(repo, plan([task(1)]))
  const one = runBin(WT, ['ensure', args.runId, 'task-1'], repo.dir)
  assert.equal(one.status, 0, one.stdout + one.stderr)
  writeAt(path.join(one.json.path, 'src', 't1', 'wip.js'), 'wip\n')
  return args
}

function savedFile(repo, runId) {
  return path.join(run.runDir(repo.dir, runId), 'saved.json')
}

function age(file, msAgo) {
  const t = new Date(Date.now() - msAgo)
  fs.utimesSync(file, t, t)
}

test('quota-brake scans in-flight runs, saves and records them, and does not push when push is off', (t) => {
  const { repo, bare, cli, pause } = setup(t)
  const live = inFlight(repo)
  const ended = inFlight(repo)
  writeAt(run.launchEndFile(repo.dir, ended.runId), '{}\n')
  const old = inFlight(repo)
  age(path.join(run.runDir(repo.dir, old.runId), 'graph.json'), 3_600_000)
  const other = inFlight(repo)
  pause()

  const named = cli(['quota-brake', '--run', live.runId])
  assert.equal(named.status, 0, named.stdout + named.stderr)
  assert.deepEqual(named.json, { saved: [live.runId], recorded: true, pushed: [] })
  assert.equal(fs.existsSync(savedFile(repo, other.runId)), false)
  assert.equal(fs.existsSync(savedFile(repo, ended.runId)), false)
  assert.equal(fs.existsSync(savedFile(repo, old.runId)), false)

  fs.rmSync(savedFile(repo, live.runId))
  const scanned = cli(['quota-brake'])
  assert.equal(scanned.status, 0, scanned.stdout + scanned.stderr)
  assert.deepEqual(scanned.json.saved.sort(), [live.runId, other.runId].sort())
  assert.equal(scanned.json.recorded, true)
  assert.deepEqual(scanned.json.pushed, [])
  assert.equal(fs.existsSync(savedFile(repo, ended.runId)), false)
  assert.equal(fs.existsSync(savedFile(repo, old.runId)), false)

  const saved = JSON.parse(fs.readFileSync(savedFile(repo, live.runId), 'utf8'))
  const unit = saved.units.find((u) => u.task === 'task-1')
  assert.equal(unit.branch, `aether/${live.runId}/task-1`)
  assert.equal(repo.git('show', `${unit.branch}:src/t1/wip.js`), 'wip')
  const autoDirs = fs.readdirSync(path.join(repo.dir, '.aether', 'autonomy')).filter((name) => name.startsWith('auto-'))
  const lastPause = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'autonomy', autoDirs[0], 'run.json'), 'utf8')).quotaPauses.at(-1)
  assert.ok(lastPause.savedUnits.some((u) => u.swarmRun === live.runId && u.branch === unit.branch && u.head === unit.head))
  const remote = spawnSync('git', ['--git-dir', bare, 'rev-parse', '--verify', `refs/heads/${unit.branch}`], { encoding: 'utf8' })
  assert.notEqual(remote.status, 0)
})

test('with push on, a push grant sends the saved branch, and without the grant nothing is pushed', (t) => {
  const granted = setup(t, { push: true, grant: true })
  const live = inFlight(granted.repo)
  granted.pause()
  const r = granted.cli(['quota-brake'])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const branch = `aether/${live.runId}/task-1`
  assert.deepEqual(r.json.pushed, [branch])
  const remote = spawnSync('git', ['--git-dir', granted.bare, 'rev-parse', '--verify', `refs/heads/${branch}`], { encoding: 'utf8' })
  assert.equal(remote.status, 0, remote.stderr)
  assert.equal(remote.stdout.trim(), granted.repo.git('rev-parse', branch))

  const refused = setup(t, { push: true, grant: false })
  const held = inFlight(refused.repo)
  refused.pause()
  const no = refused.cli(['quota-brake'])
  assert.equal(no.status, 0, no.stdout + no.stderr)
  assert.deepEqual(no.json.pushed, [])
  assert.equal(no.json.saved.length, 1)
  const absent = spawnSync('git', ['--git-dir', refused.bare, 'rev-parse', '--verify', `refs/heads/aether/${held.runId}/task-1`], { encoding: 'utf8' })
  assert.notEqual(absent.status, 0)
})

test('with no open run quota-brake prints the empty result', (t) => {
  const repo = makeRepo(t)
  const r = runBin(BIN, ['quota-brake'], repo.dir, { CLAUDE_CODE_SESSION_ID: SESSION })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json, { saved: [], recorded: false, pushed: [] })
})

test('the usage line names quota-brake', (t) => {
  const repo = makeRepo(t)
  const r = runBin(BIN, [], repo.dir)
  assert.equal(r.status, 1)
  assert.match(r.json.error, /quota-brake \[--session <id>\] \[--run <swarmRunId>\]…/)
})

test('quota-brake does not stop workflows, delegates or lane calls', () => {
  const src = fs.readFileSync(COMMAND, 'utf8')
  const help = src.split('\n').find((line) => line.startsWith('// It does not stop'))
  assert.equal(help, '// It does not stop workflows, delegates or lane calls (those stay with the Lead: TaskStop, aether-lane stop).')
  assert.equal(src.includes('TaskStop('), false)
  assert.equal(src.includes("'aether-lane'"), false)
  assert.equal(src.includes('"aether-lane"'), false)
})
