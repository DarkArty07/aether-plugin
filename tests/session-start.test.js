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
  for (const key of ['CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_LANES', 'CLAUDE_PLUGIN_OPTION_HARNESSES', 'CLAUDE_PLUGIN_OPTION_OPS', 'CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', 'CLAUDE_PLUGIN_OPTION_SEATS', 'AETHER_SUPERDELEGATION', 'AETHER_SUPERDELEGATION_LEGACY']) delete env[key]
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
  // The main session is the Lead: the owner's right hand, with a Writer and a Judge.
  assert.match(context, /You are the \*\*Lead\*\*/)
  assert.match(context, /the owner's right hand/)
  assert.match(context, /`aether:judge`/)
  assert.match(context, /`aether:writer`/)
  assert.match(context, /`aether:specify`/)
  assert.match(context, /## RADAR/)
  assert.match(context, /## Designing/)
  assert.match(context, /At most two revisions per document/)
  // The owner gets one list of what is irreversible or only the owner can decide.
  assert.match(context, /## The owner's list/)
  assert.match(context, /\.aether\/pending\.jsonl/)
  assert.match(context, /## Fallbacks never reach the owner/)
  // The Lead runs autonomously, records authorizations, and reports in a brief.
  assert.match(context, /## Autonomous runs/)
  assert.match(context, /aether-autonomy check <class>/)
  assert.match(context, /aether-autonomy grant --class <class> --quote/)
  assert.match(context, /--scope session/)
  // The Designer and the old relay are gone.
  assert.doesNotMatch(context, /aether:designer/)
  assert.doesNotMatch(context, /LEAD DECISION/)
  assert.doesNotMatch(context, /aether-lane design/)
  assert.doesNotMatch(context, /## Decision/)
  assert.doesNotMatch(context, /## For the owner/)
  assert.doesNotMatch(context, /Waiting for/)
  assert.doesNotMatch(context, /## The relay/)
  // The execution method offers the swarm.
  assert.match(context, /`aether:swarm` skill/)
  assert.doesNotMatch(context, /arrives in a later version/)
})

test('session start gives the bootstrap the plugin folder, the way Claude Code does for a skill', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  const context = r.out.hookSpecificOutput.additionalContext
  assert.doesNotMatch(context, /\$\{CLAUDE_PLUGIN_ROOT\}/)
  assert.ok(context.includes(`${PLUGIN}/config/models/models.json`), 'the bootstrap names the models index by its absolute path')
  assert.ok(context.includes(`${PLUGIN}/config/prices.json`), 'the bootstrap names the price table by its absolute path')
})

test('the plugin folder is put into the bootstrap as it is, even with characters that replace patterns use', (t) => {
  const repo = makeRepo(t)
  const copy = path.join(tempDir(t), 'a$&b$1', 'aether')
  fs.cpSync(PLUGIN, copy, { recursive: true })
  const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_PLUGIN_ROOT: copy } })
  assert.equal(r.status, 0, r.stderr)
  const context = r.out.hookSpecificOutput.additionalContext
  assert.doesNotMatch(context, /\$\{CLAUDE_PLUGIN_ROOT\}/)
  assert.ok(context.includes(`${copy}/config/models/models.json`))
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

test('an Aether session is marked, gets the superdelegation lines, and gets the context', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const r = start(repo.dir, data, { env: { CLAUDE_ENV_FILE: envFile } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.out.hookSpecificOutput.additionalContext, /^Aether mode is active\./)
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'sessions', 's1.json'), 'utf8')).session, 's1')
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export AETHER_SUPERDELEGATION=off\nexport AETHER_SUPERDELEGATION_LEGACY=\nexport AETHER_LANE_HARNESSES=agy\n')
})

function exported(t, extra = {}) {
  const repo = makeRepo(t)
  const envFile = path.join(tempDir(t, 'aether-env-'), 'env')
  const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_ENV_FILE: envFile, ...extra } })
  assert.equal(r.status, 0, r.stderr)
  return { text: fs.readFileSync(envFile, 'utf8'), context: r.out.hookSpecificOutput.additionalContext }
}

test('C1: with nothing set, superdelegation is off and nothing is ignored', (t) => {
  const { text, context } = exported(t)
  assert.equal(text, 'export AETHER_SUPERDELEGATION=off\nexport AETHER_SUPERDELEGATION_LEGACY=\nexport AETHER_LANE_HARNESSES=agy\n')
  assert.doesNotMatch(context, /seats option|lanes option/)
})

test('C1: a set superdelegation wins, true or false', (t) => {
  assert.ok(exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }).text.startsWith('export AETHER_SUPERDELEGATION=on\n'))
  assert.ok(exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', CLAUDE_PLUGIN_OPTION_LANES: 'true' }).text.startsWith('export AETHER_SUPERDELEGATION=off\nexport AETHER_SUPERDELEGATION_LEGACY=lanes-ignored\n'))
})

test('E8: lanes on with superdelegation unset counts as on, and seats native is ignored, and the owner is told both', (t) => {
  const { text, context } = exported(t, { CLAUDE_PLUGIN_OPTION_LANES: 'true', CLAUDE_PLUGIN_OPTION_SEATS: 'native' })
  assert.equal(text, 'export AETHER_SUPERDELEGATION=on\nexport AETHER_SUPERDELEGATION_LEGACY=lanes-as-on,seats-ignored\nexport AETHER_LANE_HARNESSES=agy\n')
  assert.ok(context.includes('The lanes option is on and superdelegation is not set, so superdelegation counts as on. Set superdelegation to choose it yourself.'))
  assert.ok(context.includes('The seats option no longer exists (native, balanced and robust are gone): its value is ignored.'))
})

test('the lines are appended to what the file already holds', (t) => {
  const repo = makeRepo(t)
  const envFile = path.join(tempDir(t), 'env.sh')
  fs.writeFileSync(envFile, 'export OTHER=1\n')
  start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' } })
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export OTHER=1\nexport AETHER_SUPERDELEGATION=on\nexport AETHER_SUPERDELEGATION_LEGACY=\nexport AETHER_LANE_HARNESSES=agy\n')
})

test('the harness line keeps the known names of the option, in order, or is agy when none is valid', (t) => {
  const repo = makeRepo(t)
  const cases = [
    ['agy,codex', 'agy,codex'],
    [' Grok , nope,CURSOR,grok,codex', 'grok,cursor,codex'],
    ['', 'agy'],
    ['nope, ,', 'agy'],
  ]
  for (const [value, list] of cases) {
    const envFile = path.join(tempDir(t), 'env.sh')
    const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_HARNESSES: value } })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(fs.readFileSync(envFile, 'utf8'), `export AETHER_SUPERDELEGATION=off\nexport AETHER_SUPERDELEGATION_LEGACY=\nexport AETHER_LANE_HARNESSES=${list}\n`, JSON.stringify(value))
  }
})

test('the harness list is still the option, or agy', (t) => {
  assert.match(exported(t, { CLAUDE_PLUGIN_OPTION_HARNESSES: 'grok, AGY,nope' }).text, /export AETHER_LANE_HARNESSES=grok,agy\n$/)
})

test('a resumed Aether session is marked and gets the superdelegation lines, with no output', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const envFile = path.join(tempDir(t), 'env.sh')
  const r = start(repo.dir, data, { input: { ...AETHER, source: 'resume' }, env: { CLAUDE_ENV_FILE: envFile } })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(path.join(data, 'sessions', 's1.json')), true)
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export AETHER_SUPERDELEGATION=off\nexport AETHER_SUPERDELEGATION_LEGACY=\nexport AETHER_LANE_HARNESSES=agy\n')
})

test('without CLAUDE_ENV_FILE the context says superdelegation is off', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' } })
  assert.ok(r.out.hookSpecificOutput.additionalContext.includes("Aether could not pass the superdelegation option to this session's commands, so superdelegation is off."))
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
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')).sort(), ['s1.json', 's1.router.json'])
})

test('session start marks the session ops-off only when the ops option is false', (t) => {
  const repo = makeRepo(t)
  const off = tempDir(t, 'aether-data-')
  assert.equal(start(repo.dir, off, { env: { CLAUDE_PLUGIN_OPTION_OPS: 'false' } }).status, 0)
  assert.equal(fs.existsSync(path.join(off, 'sessions', 's1.json')), true)
  assert.equal(fs.existsSync(path.join(off, 'sessions', 's1.ops-off')), true)
  for (const env of [{}, { CLAUDE_PLUGIN_OPTION_OPS: 'true' }]) {
    const on = tempDir(t, 'aether-data-')
    assert.equal(start(repo.dir, on, { env }).status, 0)
    assert.equal(fs.existsSync(path.join(on, 'sessions', 's1.json')), true)
    assert.equal(fs.existsSync(path.join(on, 'sessions', 's1.ops-off')), false)
  }
})
