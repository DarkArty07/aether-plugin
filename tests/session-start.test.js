'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const { SESSION_BIN, PLUGIN, makeRepo, compile, tempDir, ageRun, age } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure } = require('../plugins/aether/lib/worktrees.js')
const { appendLog, logFile } = require('../plugins/aether/lib/lanes.js')
const { markSession } = require('../plugins/aether/lib/session.js')

const AETHER = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' }

// The hook's environment, without what a surrounding session may have set.
function hookEnv(data, extra = {}) {
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }
  for (const key of ['CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_LANES', 'AETHER_LANES']) delete env[key]
  return { ...env, ...extra }
}

function start(cwd, data, { input = AETHER, env = {} } = {}) {
  const r = spawnSync(process.execPath, [SESSION_BIN], {
    cwd,
    encoding: 'utf8',
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: hookEnv(data, env),
  })
  return { status: r.status, stdout: r.stdout, out: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr }
}

test('session start injects the Lead bootstrap', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.out.hookSpecificOutput.hookEventName, 'SessionStart')
  const context = r.out.hookSpecificOutput.additionalContext
  assert.match(context, /^Aether mode is active\./)
  assert.match(context, /# Aether mode/)
  assert.doesNotMatch(context, /disable-model-invocation/)
  // The main session is the Lead, and the Designer is the agent that designs.
  assert.match(context, /You are the \*\*Lead\*\*/)
  assert.doesNotMatch(context, /You are the \*\*Designer\*\*/)
  assert.match(context, /aether:designer/)
  assert.match(context, /aether-voice --session/)
  assert.match(context, /SendMessage/)
  // The Lead decides with the owner's intent, records authorizations, and runs autonomously.
  assert.match(context, /## Decision/)
  assert.match(context, /- Decide: lead/)
  assert.match(context, /`LEAD DECISION`/)
  assert.match(context, /`OWNER ANSWER`/)
  assert.match(context, /## Fallbacks never reach the owner/)
  assert.match(context, /## Autonomous runs/)
  assert.match(context, /aether-autonomy start --quote/)
  assert.match(context, /aether-autonomy check <class>/)
  assert.match(context, /aether-autonomy grant --class <class> --quote/)
  assert.match(context, /--scope session/)
  assert.match(context, /# Brief: <run id>/)
  assert.doesNotMatch(context, /## For the owner/)
  assert.doesNotMatch(context, /Waiting for/)
  assert.doesNotMatch(context, /## The relay/)
  // At the plan handoff the swarm is offered next to superpowers' own execution options.
  assert.match(context, /`aether:swarm` skill/)
  assert.doesNotMatch(context, /arrives in a later version/)
})

test('session start sweeps stale runs and says so', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  ageRun(args, 48)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.out.hookSpecificOutput.additionalContext.endsWith(`Aether swept 1 stale run(s): ${args.runId}.`))
  assert.equal(fs.existsSync(unit.path), false)
})

test('session start works outside a git repository', (t) => {
  const r = start(tempDir(t), tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(r.out.hookSpecificOutput.additionalContext, /swept|could not sweep/)
})

test('session start deletes usage sessions older than 30 days', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  for (const session of ['old', 'recent']) {
    fs.mkdirSync(path.join(data, 'usage', session), { recursive: true })
    fs.writeFileSync(path.join(data, 'usage', session, '0.json'), '{"entries": []}')
  }
  age(path.join(data, 'usage', 'old'), 24 * 31)
  const r = start(repo.dir, data)
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(fs.readdirSync(path.join(data, 'usage')), ['recent'])
})

test('session start prunes lane logs not written to for 30 days', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  appendLog(data, 'old-session', { kind: 'reading', time: 1 })
  appendLog(data, 'new-session', { kind: 'reading', time: 2 })
  const old = new Date(Date.now() - 31 * 24 * 3600 * 1000)
  fs.utimesSync(logFile(data, 'old-session'), old, old)
  const r = start(repo.dir, data)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(fs.existsSync(logFile(data, 'old-session')), false)
  assert.equal(fs.existsSync(logFile(data, 'new-session')), true)
})

test('a session that is not Aether gets nothing: no output, no file, no environment line, no sweep', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  ageRun(args, 48)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const inputs = [
    { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup' },
    { ...AETHER, agent_type: 'Explore' },
    { ...AETHER, agent_type: 'claude' },
    'not json',
    '',
    'null',
    '[]',
    '"aether:lead"',
  ]
  for (const input of inputs) {
    const r = start(repo.dir, data, { input, env: { CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_LANES: 'true' } })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '', JSON.stringify(input))
  }
  assert.deepEqual(fs.readdirSync(data), [])
  assert.equal(fs.existsSync(envFile), false)
  assert.equal(fs.existsSync(unit.path), true, 'the stale run is not swept')
})

test('an Aether session is marked, gets the lanes line, and gets the context', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const r = start(repo.dir, data, { env: { CLAUDE_ENV_FILE: envFile } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.out.hookSpecificOutput.additionalContext, /^Aether mode is active\./)
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'sessions', 's1.json'), 'utf8')).session, 's1')
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export AETHER_LANES=off\n')
})

test('the lanes line is on only when the lanes option is exactly true, and is appended', (t) => {
  const repo = makeRepo(t)
  for (const [value, line] of [['true', 'export AETHER_LANES=on\n'], ['false', 'export AETHER_LANES=off\n'], ['TRUE', 'export AETHER_LANES=off\n'], ['', 'export AETHER_LANES=off\n']]) {
    const envFile = path.join(tempDir(t), 'env.sh')
    fs.writeFileSync(envFile, 'export OTHER=1\n')
    start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_LANES: value } })
    assert.equal(fs.readFileSync(envFile, 'utf8'), `export OTHER=1\n${line}`, value)
  }
})

test('a resumed Aether session is marked and gets the lanes line, with no output', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const r = start(repo.dir, data, { input: { ...AETHER, source: 'resume' }, env: { CLAUDE_ENV_FILE: envFile } })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(path.join(data, 'sessions', 's1.json')), true)
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export AETHER_LANES=off\n')
})

test('without CLAUDE_ENV_FILE the context says the lanes are off', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.ok(r.out.hookSpecificOutput.additionalContext.includes("Aether could not pass the lanes option to this session's commands, so lanes are off."))
})

test('an invalid or missing session id is said in the context, and writes no marker', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  for (const id of ['../x', undefined]) {
    const r = start(repo.dir, data, { input: { ...AETHER, session_id: id }, env: { CLAUDE_ENV_FILE: path.join(tempDir(t), 'env.sh') } })
    assert.equal(r.status, 0, r.stderr)
    const context = r.out.hookSpecificOutput.additionalContext
    assert.match(context, /^Aether mode is active\./)
    assert.match(context, /Aether could not mark this session \(.+\): the spec and plan guard and the usage meter are off in it\./)
  }
  assert.equal(fs.existsSync(path.join(data, 'sessions')), false)
  assert.equal(fs.existsSync(path.join(data, 'x.json')), false)
})

test('session start prunes session markers not written to for 30 days', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  markSession(data, 'old')
  const old = new Date(Date.now() - 31 * 24 * 3600 * 1000)
  fs.utimesSync(path.join(data, 'sessions', 'old.json'), old, old)
  start(repo.dir, data)
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')).sort(), ['s1.json'])
})
