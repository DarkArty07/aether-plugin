'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const { SESSION_BIN, SESSION_COMMANDS, PLUGIN, makeRepo, compile, tempDir, ageRun, age, partHeading, leadParts } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure } = require('../plugins/aether/lib/worktrees.js')
const { appendLog, logFile } = require('../plugins/aether/lib/lanes.js')
const { markSession, readDelegateSettings } = require('../plugins/aether/lib/session.js')
const observe = require('../plugins/aether/lib/observe.js')

const AETHER = { hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', agent_type: 'aether:lead' }

const OLD_LANES = 'CLAUDE_PLUGIN_OPTION_' + 'LAN' + 'ES'
const OLD_SEATS = 'CLAUDE_PLUGIN_OPTION_' + 'SEA' + 'TS'
const OLD_LEGACY = 'AETHER_SUPERDELEGATION_' + 'LEG' + 'ACY'

// The values of options a user may still have saved from before spec 013 removed them, as an environment. The names
// are built from their parts: the scan for the removed identifiers (tests/no-router.test.js) is for what the plugin
// uses, and these tests only prove that a saved value changes nothing.
function removedOptions(values) {
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [`CLAUDE_PLUGIN_OPTION_${name.toUpperCase()}`, value]))
}

// The hook's environment, without what a surrounding session may have set.
function hookEnv(data, extra = {}) {
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }
  for (const key of ['LC_ALL', 'LC_MESSAGES', 'LANG', 'CLAUDE_ENV_FILE', OLD_LANES, 'CLAUDE_PLUGIN_OPTION_HARNESSES', 'CLAUDE_PLUGIN_OPTION_OPS', 'CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', OLD_SEATS, 'CLAUDE_PLUGIN_OPTION_DEADLINES', ...Object.keys(removedOptions({ router: '', decider: '', fallback: '' })), 'AETHER_SUPERDELEGATION', OLD_LEGACY]) delete env[key]
  return { ...env, ...extra }
}

function start(cwd, data, { input = AETHER, env = {}, args = [] } = {}) {
  const r = spawnSync(process.execPath, [SESSION_BIN, ...args], {
    cwd,
    encoding: 'utf8',
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: hookEnv(data, env),
  })
  return { status: r.status, stdout: r.stdout, out: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr }
}

// The bootstrap the part commands inject for the Lead (issue #139): their contexts joined, each without its heading.
function injected(cwd, data, env = {}) {
  return leadParts(cwd, hookEnv(data, env))
}

test('session start injects the Lead bootstrap', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const r = start(repo.dir, data)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(r.out.hookSpecificOutput.additionalContext, /^Aether mode is active\./)
  const parts = injected(repo.dir, data)
  for (const out of parts.outputs.filter(Boolean)) assert.equal(JSON.parse(out).hookSpecificOutput.hookEventName, 'SessionStart')
  assert.ok(parts.contexts[0].startsWith(partHeading(1, parts.contexts.length, PLUGIN) + '# Aether mode\n'), parts.contexts[0].slice(0, 300))
  const context = parts.bootstrap
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
  const parts = injected(repo.dir, tempDir(t, 'aether-data-'))
  for (const context of parts.contexts) assert.doesNotMatch(context, /\$\{CLAUDE_PLUGIN_ROOT\}/)
  const context = parts.bootstrap
  assert.doesNotMatch(context, /\$\{CLAUDE_PLUGIN_ROOT\}/)
  assert.ok(context.includes(`${PLUGIN}/config/models/models.json`), 'the bootstrap names the models index by its absolute path')
  assert.ok(context.includes(`${PLUGIN}/config/prices.json`), 'the bootstrap names the price table by its absolute path')
})

test('the plugin folder is put into the bootstrap as it is, even with characters that replace patterns use', (t) => {
  const repo = makeRepo(t)
  const copy = path.join(tempDir(t), 'a$&b$1', 'aether')
  fs.cpSync(PLUGIN, copy, { recursive: true })
  const parts = injected(repo.dir, tempDir(t, 'aether-data-'), { CLAUDE_PLUGIN_ROOT: copy })
  for (const context of parts.contexts) assert.doesNotMatch(context, /\$\{CLAUDE_PLUGIN_ROOT\}/)
  assert.ok(parts.bootstrap.includes(`${copy}/config/models/models.json`))
})

test('session start sweeps stale runs and says so', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  const unit = ensure(repo.dir, args.runId, 'task-1')
  ageRun(args, 48)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.out.hookSpecificOutput.additionalContext.includes(`Aether swept 1 stale run(s): ${args.runId}.`))
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
  // Every SessionStart command of hooks/hooks.json: the notes command and the part commands.
  assert.equal(SESSION_COMMANDS.length, 4)
  for (const args of SESSION_COMMANDS) {
    for (const input of inputs) {
      const r = start(repo.dir, data, { input, args, env: { CLAUDE_ENV_FILE: envFile, [OLD_LANES]: 'true' } })
      assert.equal(r.status, 0, r.stderr)
      assert.equal(r.stdout, '', `${args.join(' ')} ${JSON.stringify(input)}`)
    }
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
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export AETHER_SUPERDELEGATION=off\nexport AETHER_LANE_HARNESSES=agy\n')
})

function exported(t, extra = {}) {
  const repo = makeRepo(t)
  const envFile = path.join(tempDir(t, 'aether-env-'), 'env')
  const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_ENV_FILE: envFile, ...extra } })
  assert.equal(r.status, 0, r.stderr)
  return { text: fs.readFileSync(envFile, 'utf8'), context: r.out.hookSpecificOutput.additionalContext, repo }
}

test('C1: with nothing set, superdelegation is off and nothing is ignored', (t) => {
  const { text, context, repo } = exported(t)
  assert.equal(text, 'export AETHER_SUPERDELEGATION=off\nexport AETHER_LANE_HARNESSES=agy\n')
  assert.doesNotMatch(context, /seats option|lanes option/)
  assert.doesNotMatch(injected(repo.dir, tempDir(t, 'aether-data-')).bootstrap, /seats option|lanes option/)
})

test('C1: a set superdelegation wins, true or false', (t) => {
  assert.ok(exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' }).text.startsWith('export AETHER_SUPERDELEGATION=on\n'))
  assert.ok(exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', [OLD_LANES]: 'true' }).text.startsWith('export AETHER_SUPERDELEGATION=off\n'))
})

test('the environment file has the switch and the harness list, and no line about old options', (t) => {
  const on = exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true', CLAUDE_PLUGIN_OPTION_HARNESSES: 'agy' })
  assert.equal(on.text, 'export AETHER_SUPERDELEGATION=on\nexport AETHER_LANE_HARNESSES=agy\n')
  const off = exported(t, { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false', [OLD_LANES]: 'true', [OLD_SEATS]: 'robust' })
  assert.equal(off.text, 'export AETHER_SUPERDELEGATION=off\nexport AETHER_LANE_HARNESSES=agy\n')
})

test('an old lanes or seats option changes nothing and the start says nothing about it', (t) => {
  const repo = makeRepo(t)
  const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { [OLD_LANES]: 'true', [OLD_SEATS]: 'robust' } })
  assert.equal(r.status, 0, r.stderr)
  // The bootstrap itself says a delegate's model "is ignored", so only the old-option notes are checked.
  assert.doesNotMatch(r.stdout, /counts as on|The (lanes|seats) option|no longer exists/)
})

test('the lines are appended to what the file already holds', (t) => {
  const repo = makeRepo(t)
  const envFile = path.join(tempDir(t), 'env.sh')
  fs.writeFileSync(envFile, 'export OTHER=1\n')
  start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' } })
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export OTHER=1\nexport AETHER_SUPERDELEGATION=on\nexport AETHER_LANE_HARNESSES=agy\n')
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
    assert.equal(fs.readFileSync(envFile, 'utf8'), `export AETHER_SUPERDELEGATION=off\nexport AETHER_LANE_HARNESSES=${list}\n`, JSON.stringify(value))
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
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'export AETHER_SUPERDELEGATION=off\nexport AETHER_LANE_HARNESSES=agy\n')
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
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')).sort(), ['s1.brake.json', 's1.delegate.json', 's1.json'])
})

test('a digest that throws does not stop the other prunes of session start', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  // The digest cannot write its summary: the summary's path is a folder, so the write over it fails.
  observe.appendEvent(data, { time: 1, session: 's-9', kind: 'SessionEnd' })
  fs.mkdirSync(path.join(data, 'observe', 'summary.json'))
  appendLog(data, 'old-session', { kind: 'reading', time: 1 })
  const old = new Date(Date.now() - 31 * 24 * 3600 * 1000)
  fs.utimesSync(logFile(data, 'old-session'), old, old)
  markSession(data, 'old')
  fs.utimesSync(path.join(data, 'sessions', 'old.json'), old, old)
  const r = start(repo.dir, data)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(fs.existsSync(logFile(data, 'old-session')), false)
  assert.deepEqual(fs.readdirSync(path.join(data, 'sessions')).sort(), ['s1.brake.json', 's1.delegate.json', 's1.json'])
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

test('session start writes the delegate file from the options', (t) => {
  const repo = makeRepo(t)
  const standard = tempDir(t, 'aether-data-')
  assert.equal(start(repo.dir, standard).status, 0)
  assert.deepEqual(readDelegateSettings(standard, 's1'), { lanes: false, harnesses: ['agy'], deadlines: { quotaMs: 3000 } })
  const set = tempDir(t, 'aether-data-')
  const env = {
    CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true',
    CLAUDE_PLUGIN_OPTION_HARNESSES: 'grok,agy',
    CLAUDE_PLUGIN_OPTION_DEADLINES: 'other=5,quota=2',
    ...removedOptions({ router: 'command', decider: 'jev', fallback: 'opus:max' }),
  }
  assert.equal(start(repo.dir, set, { env }).status, 0)
  assert.deepEqual(readDelegateSettings(set, 's1'), { lanes: true, harnesses: ['grok', 'agy'], deadlines: { quotaMs: 2000 } })
})

test('session start leaves a router file an older version left, and a resumed session follows the options it has now', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  markSession(data, 's1', 1)
  const oldFile = path.join(data, 'sessions', 's1' + '.' + 'router' + '.json')
  fs.writeFileSync(oldFile, '{}')
  assert.equal(start(repo.dir, data, { env: { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true' } }).status, 0)
  assert.equal(fs.existsSync(oldFile), true)
  assert.equal(readDelegateSettings(data, 's1').lanes, true)
  assert.equal(start(repo.dir, data, { env: { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'false' } }).status, 0)
  assert.equal(readDelegateSettings(data, 's1').lanes, false)
})

test('session start gives no note of a router mode: the option no longer exists', (t) => {
  const repo = makeRepo(t)
  for (const mode of ['advise', 'command']) {
    const r = start(repo.dir, tempDir(t, 'aether-data-'), { env: { CLAUDE_PLUGIN_OPTION_SUPERDELEGATION: 'true', ...removedOptions({ router: mode }) } })
    assert.equal(r.status, 0, r.stderr)
    // The bootstrap is the skill's, which another task rewrites: only the note this hook used to add is checked.
    assert.doesNotMatch(r.out.hookSpecificOutput.additionalContext, /Aether router \(/)
  }
})

test('the session start bin no longer names the router notes or writes the router settings', () => {
  const source = fs.readFileSync(SESSION_BIN, 'utf8')
  assert.doesNotMatch(source, /ROUTER_NOTES|routerNote|routerSettingsFrom/)
})

// R9 (spec 024): the welcome line is the hook's top-level systemMessage, shown to the person, on startup of a Lead session.
const VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version
const WELCOME_ES = (version) => `Aether ${version} · Lead listo · dime lo que quieres, o escribe /aether:help para ver qué puedo hacer`
const WELCOME_EN = (version) => `Aether ${version} · Lead ready · tell me what you want, or type /aether:help to see what I can do`
const NOTICE_EN = 'No earlier session in this project.'
const NOTICE_ES = 'No hay una sesión anterior en este proyecto.'

function welcomeOf(t, env = {}, input = AETHER) {
  const r = start(makeRepo(t).dir, tempDir(t, 'aether-data-'), { input, env })
  assert.equal(r.status, 0, r.stderr)
  return r
}

test('R9: a Lead startup shows the English welcome line when no locale is set or it is not Spanish', (t) => {
  const none = welcomeOf(t)
  assert.equal(none.out.systemMessage, `${WELCOME_EN(VERSION)}\n${NOTICE_EN}`)
  // The line sits next to hookSpecificOutput, not inside it.
  assert.equal('systemMessage' in none.out.hookSpecificOutput, false)
  assert.equal(welcomeOf(t, { LANG: 'en_US.UTF-8' }).out.systemMessage, `${WELCOME_EN(VERSION)}\n${NOTICE_EN}`)
  assert.equal(welcomeOf(t, { LANG: 'fr_FR.UTF-8' }).out.systemMessage, `${WELCOME_EN(VERSION)}\n${NOTICE_EN}`)
  assert.equal(welcomeOf(t, { LANG: 'C' }).out.systemMessage, `${WELCOME_EN(VERSION)}\n${NOTICE_EN}`)
})

test('R9: a Lead startup shows the Spanish welcome line when the locale starts with es, in any case', (t) => {
  for (const env of [{ LANG: 'es_MX.UTF-8' }, { LANG: 'ES_ES' }, { LANG: 'es' }, { LC_MESSAGES: 'es_AR.UTF-8' }, { LC_ALL: 'es_CO.UTF-8' }]) {
    assert.equal(welcomeOf(t, env).out.systemMessage, `${WELCOME_ES(VERSION)}\n${NOTICE_ES}`, JSON.stringify(env))
  }
})

test('R9: LC_ALL wins over LC_MESSAGES, which wins over LANG; an empty one is skipped', (t) => {
  assert.equal(welcomeOf(t, { LC_ALL: 'en_US.UTF-8', LANG: 'es_MX.UTF-8' }).out.systemMessage, `${WELCOME_EN(VERSION)}\n${NOTICE_EN}`)
  assert.equal(welcomeOf(t, { LC_ALL: 'es_MX.UTF-8', LANG: 'en_US.UTF-8' }).out.systemMessage, `${WELCOME_ES(VERSION)}\n${NOTICE_ES}`)
  assert.equal(welcomeOf(t, { LC_MESSAGES: 'en_US.UTF-8', LANG: 'es_MX.UTF-8' }).out.systemMessage, `${WELCOME_EN(VERSION)}\n${NOTICE_EN}`)
  assert.equal(welcomeOf(t, { LC_ALL: 'es_MX.UTF-8', LC_MESSAGES: 'en_US.UTF-8' }).out.systemMessage, `${WELCOME_ES(VERSION)}\n${NOTICE_ES}`)
  assert.equal(welcomeOf(t, { LC_ALL: '', LANG: 'es_MX.UTF-8' }).out.systemMessage, `${WELCOME_ES(VERSION)}\n${NOTICE_ES}`)
})

test('R9: a startup with no source in the input counts as startup and gets the welcome line', (t) => {
  const { source, ...noSource } = AETHER
  assert.equal(welcomeOf(t, {}, noSource).out.systemMessage, `${WELCOME_EN(VERSION)}\n${NOTICE_EN}`)
})

test('R9: the welcome line takes the version from the plugin.json of CLAUDE_PLUGIN_ROOT', (t) => {
  const copy = path.join(tempDir(t), 'aether')
  fs.cpSync(PLUGIN, copy, { recursive: true })
  const manifest = path.join(copy, '.claude-plugin', 'plugin.json')
  fs.writeFileSync(manifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifest, 'utf8')), version: '9.8.7' }))
  assert.equal(welcomeOf(t, { CLAUDE_PLUGIN_ROOT: copy }).out.systemMessage, `${WELCOME_EN('9.8.7')}\n${NOTICE_EN}`)
  assert.equal(welcomeOf(t, { CLAUDE_PLUGIN_ROOT: copy, LANG: 'es_MX.UTF-8' }).out.systemMessage, `${WELCOME_ES('9.8.7')}\n${NOTICE_ES}`)
})

test('R9: without a readable plugin.json the welcome line has no version and the start does not fail', (t) => {
  const copy = path.join(tempDir(t), 'aether')
  fs.cpSync(PLUGIN, copy, { recursive: true })
  const manifest = path.join(copy, '.claude-plugin', 'plugin.json')
  const expectEn = `Aether · Lead ready · tell me what you want, or type /aether:help to see what I can do\n${NOTICE_EN}`
  const expectEs = `Aether · Lead listo · dime lo que quieres, o escribe /aether:help para ver qué puedo hacer\n${NOTICE_ES}`
  // Missing file.
  fs.rmSync(manifest)
  let r = welcomeOf(t, { CLAUDE_PLUGIN_ROOT: copy })
  assert.equal(r.out.systemMessage, expectEn)
  assert.match(r.out.hookSpecificOutput.additionalContext, /^Aether mode is active\./)
  assert.equal(welcomeOf(t, { CLAUDE_PLUGIN_ROOT: copy, LANG: 'es_MX.UTF-8' }).out.systemMessage, expectEs)
  // Not JSON, and JSON without a version.
  for (const text of ['not json', '{}', '{"version": 3}', 'null']) {
    fs.writeFileSync(manifest, text)
    r = welcomeOf(t, { CLAUDE_PLUGIN_ROOT: copy })
    assert.equal(r.out.systemMessage, expectEn, text)
  }
})

test('R9: clear and compact keep the output as it was: the context and no welcome line', (t) => {
  const clear = welcomeOf(t, { LANG: 'es_MX.UTF-8' }, { ...AETHER, source: 'clear' })
  assert.match(clear.out.hookSpecificOutput.additionalContext, /^Aether mode is active\./)
  // A first session has nothing to tell after a clear: its one line is shown only at startup (spec 030, Lead's fix).
  assert.equal(clear.out.systemMessage, undefined)
  assert.doesNotMatch(clear.stdout, /\/aether:help to see|para ver qué puedo hacer/)

  const compact = welcomeOf(t, { LANG: 'es_MX.UTF-8' }, { ...AETHER, source: 'compact' })
  assert.deepEqual(Object.keys(compact.out), ['hookSpecificOutput'])
  assert.deepEqual(Object.keys(compact.out.hookSpecificOutput).sort(), ['additionalContext', 'hookEventName'])
  assert.match(compact.out.hookSpecificOutput.additionalContext, /^Aether mode is active\./)
  assert.doesNotMatch(compact.stdout, /systemMessage|\/aether:help to see|para ver qué puedo hacer/)

  for (const source of ['clear', 'compact']) {
    // The part commands give the whole bootstrap again, with no welcome line either.
    const parts = leadParts(makeRepo(t).dir, hookEnv(tempDir(t, 'aether-data-'), { LANG: 'es_MX.UTF-8' }), { ...AETHER, source })
    assert.ok(parts.contexts.length >= 2, source)
    assert.match(parts.bootstrap, /## The execution method/, source)
    for (const out of parts.outputs.filter(Boolean)) assert.deepEqual(Object.keys(JSON.parse(out)), ['hookSpecificOutput'], source)
  }
})

test('R9: resume and any other source give no output at all, and a session that is not the Lead gets no welcome line', (t) => {
  for (const source of ['resume', 'other', '']) {
    const r = welcomeOf(t, {}, { ...AETHER, source })
    assert.equal(r.stdout, '', JSON.stringify(source))
    for (const args of SESSION_COMMANDS) {
      const part = start(makeRepo(t).dir, tempDir(t, 'aether-data-'), { input: { ...AETHER, source }, args })
      assert.equal(part.status, 0, part.stderr)
      assert.equal(part.stdout, '', `${args.join(' ')} ${JSON.stringify(source)}`)
    }
  }
  for (const input of [{ ...AETHER, agent_type: undefined }, { ...AETHER, agent_type: 'Explore' }, { ...AETHER, agent_type: 'claude' }]) {
    const r = welcomeOf(t, { LANG: 'es_MX.UTF-8' }, input)
    assert.equal(r.stdout, '', JSON.stringify(input))
  }
})

test('startup bounds notice output before claiming and preserves the remainder', (t) => {
  const dir = tempDir(t)
  const { saveNotice } = require('../plugins/aether/lib/observe-notice.js')
  for (let number = 1; number <= 150; number++) saveNotice(dir, { number, url: `https://github.com/owner/repo/issues/${number}`, id: 'fault:test' })
  const { main } = require('../plugins/aether/lib/session-start.js')
  const delivered = []
  for (let i = 0; i < 10 && delivered.length < 150; i++) {
    let output = ''
    main({ input: AETHER, env: { AETHER_DATA_DIR: dir }, cwd: dir, stdout: { write(s) { output += s } } })
    assert.ok(output.length <= 9800, `hook output: ${output.length}`)
    delivered.push(...Array.from(JSON.parse(output).systemMessage.matchAll(/Aether opened issue #(\d+):/g), (match) => Number(match[1])))
    if (i === 0) assert.ok(delivered.length > 0 && delivered.length < 150)
  }
  assert.deepEqual(delivered.sort((a, b) => a - b), Array.from({ length: 150 }, (_, i) => i + 1))
  assert.deepEqual(fs.readdirSync(path.join(dir, 'observe', 'notices')), [])
})

test('a notice that does not fit stays available without being claimed', (t) => {
  const dir = tempDir(t)
  const { saveNotice, takeNotices } = require('../plugins/aether/lib/observe-notice.js')
  saveNotice(dir, { number: 1, url: 'https://github.com/owner/repo/issues/1', id: 'fault:test' })
  const noticesDir = path.join(dir, 'observe', 'notices')
  const pending = fs.readdirSync(noticesDir)
  assert.deepEqual(takeNotices(dir, () => false), [])
  assert.deepEqual(fs.readdirSync(noticesDir), pending)
  assert.deepEqual(takeNotices(dir), [{ number: 1, url: 'https://github.com/owner/repo/issues/1', reason: 'silent faults' }])
  assert.deepEqual(takeNotices(dir), [])
})

test('a notice too large for this startup does not hold back smaller notices', (t) => {
  const dir = tempDir(t)
  const root = tempDir(t)
  const { saveNotice } = require('../plugins/aether/lib/observe-notice.js')
  const { main, PART_LIMIT } = require('../plugins/aether/lib/session-start.js')
  const manifest = path.join(root, '.claude-plugin', 'plugin.json')
  fs.mkdirSync(path.dirname(manifest))
  fs.writeFileSync(manifest, JSON.stringify({ version: 'v' }))
  const startWith = (env) => {
    let output = ''
    main({ input: AETHER, env, cwd: dir, stdout: { write(s) { output += s } } })
    return output
  }
  const env = { AETHER_DATA_DIR: dir, CLAUDE_PLUGIN_ROOT: root }
  const baseline = startWith(env)
  fs.writeFileSync(manifest, JSON.stringify({ version: 'v'.repeat(PART_LIMIT - baseline.length - 149) }))

  const notices = path.join(dir, 'observe', 'notices')
  saveNotice(dir, { number: 1, url: `https://github.com/${'o'.repeat(39)}/${'r'.repeat(100)}/issues/1`, id: 'fault:test' })
  fs.renameSync(path.join(notices, fs.readdirSync(notices)[0]), path.join(notices, '000000000000000-ffffffff.json'))
  saveNotice(dir, { number: 2, url: 'https://github.com/o/r/issues/2', id: 'fault:test' })
  const output = startWith(env)
  assert.ok(output.length <= PART_LIMIT)
  assert.ok(JSON.parse(output).systemMessage.includes('Aether opened issue #2:'), 'the smaller notice is delivered')
  assert.doesNotMatch(JSON.parse(output).systemMessage, /Aether opened issue #1:/)
  assert.deepEqual(fs.readdirSync(notices), ['000000000000000-ffffffff.json'])

  const later = startWith({ AETHER_DATA_DIR: dir })
  assert.match(JSON.parse(later).systemMessage, /Aether opened issue #1:/)
  assert.deepEqual(fs.readdirSync(notices), [])
})

test('startup budgets the encoded greeting and notes before consuming notices', (t) => {
  const dir = tempDir(t)
  const root = tempDir(t)
  const { saveNotice, takeNotices } = require('../plugins/aether/lib/observe-notice.js')
  const { main, PART_LIMIT } = require('../plugins/aether/lib/session-start.js')
  fs.mkdirSync(path.join(root, '.claude-plugin'))
  // Each character below expands to two in JSON, so budgeting just the visible message would overflow.
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '\\"\n'.repeat(1500) }))
  for (let number = 1; number <= 20; number++) saveNotice(dir, { number, url: `https://github.com/owner/repo/issues/${number}`, id: 'fault:test' })
  let output = ''
  main({ input: AETHER, env: { AETHER_DATA_DIR: dir, CLAUDE_PLUGIN_ROOT: root }, cwd: dir, stdout: { write(s) { output += s } } })
  assert.ok(output.length <= PART_LIMIT, `encoded hook output: ${output.length}`)
  const sent = Array.from(JSON.parse(output).systemMessage.matchAll(/Aether opened issue #(\d+):/g), (match) => Number(match[1]))
  assert.ok(sent.length > 0 && sent.length < 20)
  const remaining = takeNotices(dir).map((notice) => notice.number)
  assert.equal(remaining.length, 20 - sent.length)
  assert.deepEqual([...sent, ...remaining].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1))
})

test('startup keeps notices pending when the greeting alone exceeds the output limit', (t) => {
  const dir = tempDir(t)
  const root = tempDir(t)
  const { saveNotice, takeNotices } = require('../plugins/aether/lib/observe-notice.js')
  const { main, PART_LIMIT } = require('../plugins/aether/lib/session-start.js')
  fs.mkdirSync(path.join(root, '.claude-plugin'))
  fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: 'v'.repeat(PART_LIMIT) }))
  saveNotice(dir, { number: 1, url: 'https://github.com/owner/repo/issues/1', id: 'fault:test' })
  let output = ''
  main({ input: AETHER, env: { AETHER_DATA_DIR: dir, CLAUDE_PLUGIN_ROOT: root }, cwd: dir, stdout: { write(s) { output += s } } })
  assert.ok(output.length > PART_LIMIT)
  assert.ok(!JSON.parse(output).systemMessage.includes('Aether opened issue #1:'))
  assert.deepEqual(takeNotices(dir).map((notice) => notice.number), [1])
})

test('clear, compact, resume and bootstrap parts leave startup notices pending', (t) => {
  const dir = tempDir(t)
  const { saveNotice, takeNotices } = require('../plugins/aether/lib/observe-notice.js')
  const { main } = require('../plugins/aether/lib/session-start.js')
  saveNotice(dir, { number: 42, url: 'https://github.com/owner/repo/issues/42', id: 'fault:test' })
  const cases = [
    { input: { ...AETHER, agent_type: 'other' } },
    ...['clear', 'compact', 'resume'].map((source) => ({ input: { ...AETHER, source } })),
    { input: AETHER, part: 1 },
  ]
  for (const args of cases) {
    let output = ''
    main({ ...args, env: { AETHER_DATA_DIR: dir }, cwd: dir, stdout: { write(s) { output += s } } })
    assert.doesNotMatch(output, /Aether opened issue/)
    assert.equal(fs.readdirSync(path.join(dir, 'observe', 'notices')).length, 1)
  }
  assert.equal(takeNotices(dir)[0].number, 42)
})

test('session start prunes the delegate log of sessions idle for 30 days and archives their outcomes first (R12)', (t) => {
  const repo = makeRepo(t)
  const data = tempDir(t, 'aether-data-')
  const delegateLog = require('../plugins/aether/lib/delegate-log.js')
  const day = 24 * 3600 * 1000
  const oldTime = Date.now() - 40 * day
  delegateLog.appendEntry(data, { kind: 'outcome', id: 'd-1', task: 't-old', attempt: 1, session: 'old-session', time: oldTime, status: 'ok', harness: 'agy', model: 'some-model', effort: 'low', durationMs: 1, usage: { input: 1000, output: 1000 } })
  delegateLog.appendEntry(data, { kind: 'launch', task: 't-new', attempt: 1, session: 'new-session', time: Date.now() - day, step: 'haiku' })
  const r = start(repo.dir, data)
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual([...new Set(delegateLog.readEntries(data).map((e) => e.session))], ['new-session'])
  const archived = fs.readFileSync(path.join(data, 'spend', 'old-session.outcomes.jsonl'), 'utf8').trim().split('\n')
  assert.equal(archived.length, 1)
  assert.equal(JSON.parse(archived[0]).session, 'old-session')
})
