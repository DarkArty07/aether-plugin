'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const lanes = require('../plugins/aether/lib/lanes.js')
const schemas = require('../plugins/aether/lib/lane-schemas.js')
const work = require('../plugins/aether/lib/lane-work.js')
const calls = require('../plugins/aether/lib/lane-calls.js')
const { buildPrompt, LANE_NOTES, WORKDIR_RULE } = calls
const { registerAdapter, unregisterAdapter } = require('../plugins/aether/lib/harness/index.js')
const { createAgy } = require('../plugins/aether/lib/harness/agy.js')
const { PLUGIN, WT_BIN, runBin, commitIn, tempDir } = require('./helpers.js')
const fx = require('./lane-fixtures.js')

const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' })
const APPROVE = JSON.stringify({ verdict: 'approve', findings: [], ruling: 'Approve.', guidance: '', question: '' })
const READY = JSON.stringify({ verdict: 'ready', findings: [], declined: [], summary: 'Ready.' })
const IMPLEMENT = 'task-1-1-implement'
const flags = (digest, { role = 'implementer', task = 'task-1', model = 'gemini-3.8-flash', effort = 'xhigh' } = {}) => [
  '--role',
  role,
  ...(task ? ['--task', task] : []),
  '--model',
  model,
  '--effort',
  effort,
  '--digest',
  digest,
]
const unitDir = (args) => path.join(args.repoRoot, '.aether', 'worktrees', args.runId, 'task-1')

// A table entry for a second harness of one model, which replaces sonnet and serves implementers.
function codexEntry(command, group = 'codex') {
  const levels = { low: 'low', medium: 'medium', high: 'high', xhigh: 'high' }
  return {
    command,
    maxParallel: 1,
    waitSeconds: 60,
    timeouts: { implementer: 60, supervisor: 60, reviewer: 60, designer: 60 },
    groups: { [group]: `${group} models` },
    models: { [`gpt-${group}`]: { group, replaces: 'sonnet', roles: ['implementer'], levels } },
  }
}

// Sets this process's environment to env for one test, and puts each variable back after it.
function useEnv(t, env) {
  for (const [name, value] of Object.entries(env)) {
    const previous = process.env[name]
    t.after(() => {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    })
    process.env[name] = value
  }
}

// A harness adapter for this process only: the runner is another process, and loads only the bundled adapters.
function fakeCodex() {
  return { name: 'codex', installed: () => true, version: () => '9.1.0', quota: () => ({ groups: { codex: { unknown: true } } }) }
}

// Starts an implementer call on a fresh run and waits for it. `lines` is the payload after its
// first line, or a function of the run's args that returns it.
function implement(t, lines, { env = fx.laneEnv(t), session = null } = {}) {
  const { repo, args } = fx.laneRun(t)
  const body = typeof lines === 'function' ? lines(args) : lines
  const message = ['You are implementing task-1: Task 1 title.', ...body].join('\n')
  const digest = fx.writePrompt(args, IMPLEMENT, message, { session })
  const start = fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  assert.deepEqual(start.json, { started: true, model: 'gemini-3.8-flash-high', group: 'gemini' }, start.stdout + start.stderr)
  return { repo, args, env, message, done: fx.waitDone(args, IMPLEMENT, env) }
}

// A unit with one commit and its review package, made the way a native implementer would.
function preparedUnit(t) {
  const { repo, args } = fx.laneRun(t)
  const unit = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], args.repoRoot).json.path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  runBin(WT_BIN, ['diff', args.runId, 'task-1'], args.repoRoot)
  return { repo, args, unit }
}

test("the bin's role schemas are the workflow's", () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'workflows', 'run.workflow.js'), 'utf8')
  const block = source.slice(source.indexOf('const FINDINGS = {'), source.indexOf('const OPS_SCHEMA = {'))
  const workflow = new Function(`${block}; return { IMPLEMENTER_SCHEMA, SUPERVISOR_SCHEMA, REVIEW_SCHEMA }`)()
  assert.deepEqual(schemas.IMPLEMENTER_SCHEMA, workflow.IMPLEMENTER_SCHEMA)
  assert.deepEqual(schemas.SUPERVISOR_SCHEMA, workflow.SUPERVISOR_SCHEMA)
  assert.deepEqual(schemas.REVIEW_SCHEMA, workflow.REVIEW_SCHEMA)
})

test('buildPrompt puts the role, the lane note and the CLAUDE.md files before the message', (t) => {
  const home = tempDir(t)
  const work = tempDir(t)
  fs.mkdirSync(path.join(home, '.claude'))
  fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'user rules\n')
  fs.writeFileSync(path.join(work, 'CLAUDE.md'), 'project rules\n\n')
  assert.equal(
    buildPrompt({ role: 'supervisor', message: 'THE MESSAGE', workdir: work, home }),
    [
      fx.roleBody('supervisor'),
      LANE_NOTES.supervisor,
      `## Instructions from ${path.join(home, '.claude', 'CLAUDE.md')}\n\nuser rules`,
      `## Instructions from ${path.join(work, 'CLAUDE.md')}\n\nproject rules`,
      'THE MESSAGE',
    ].join('\n\n'),
  )
  assert.equal(buildPrompt({ role: 'implementer', message: 'M', workdir: tempDir(t), home: tempDir(t) }), [fx.roleBody('implementer'), LANE_NOTES.implementer, 'M'].join('\n\n'))
  assert.match(LANE_NOTES.implementer, /^## You run in an external harness\n\nYou are an Aether implementer, run by the agy CLI rather than Claude Code\./)
  assert.match(LANE_NOTES.supervisor, /Your review is read-only: do not run commands, and do not change any file\./)
  assert.match(LANE_NOTES.reviewer, /^## You run in an external harness\n\nYou are the Aether final reviewer/)
  assert.equal(WORKDIR_RULE, 'Work only inside the working directory you are given: do not run `env` or `ps`, and do not search outside that directory.')
  for (const role of ['implementer', 'supervisor', 'reviewer']) assert.ok(LANE_NOTES[role].includes(WORKDIR_RULE), role)
})

test("a lane note names the harness that runs the call, and agy's notes read as they always did", (t) => {
  const home = tempDir(t)
  const workdir = tempDir(t)
  const prompt = buildPrompt({ role: 'reviewer', message: 'M', workdir, home, harness: 'codex' })
  assert.ok(prompt.includes('You are the Aether final reviewer, run by the codex CLI rather than Claude Code.'))
  assert.equal(buildPrompt({ role: 'reviewer', message: 'M', workdir, home }), buildPrompt({ role: 'reviewer', message: 'M', workdir, home, harness: 'agy' }))
  assert.ok(buildPrompt({ role: 'reviewer', message: 'M', workdir, home }).includes(LANE_NOTES.reviewer))
})

test("status reads each group's windows, marks a group under the reserve unusable, and logs the reading", (t) => {
  const env = fx.laneEnv(t, { quota: { 'Gemini Models': [0.04, 0.9], 'Claude and GPT models': [0.9, 0.9] } })
  const { args } = fx.laneRun(t)
  const r = fx.lane(args, 'status', [], env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const agy = r.json.harnesses.agy
  assert.deepEqual([agy.enabled, agy.path, agy.installed, agy.version, agy.groups.gemini.usable, agy.groups.claude.usable], [true, fx.FAKE_AGY, true, '1.3.2', false, true])
  assert.deepEqual(agy.groups.claude.windows['5h'], { remaining: 0.9, resetsAt: '2026-10-09T05:53:31Z' })
  const readings = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'reading')
  assert.equal(readings.length, 1)
  assert.deepEqual([readings[0].run, readings[0].version, readings[0].harness, Object.keys(readings[0].groups).sort()], [args.runId, '1.3.2', 'agy', ['claude', 'gemini']])
  const missing = fx.lane(args, 'status', [], fx.laneEnv(t, { command: '/nowhere/agy' }))
  assert.deepEqual(missing.json, { harnesses: { agy: { enabled: true, command: '/nowhere/agy', path: null, installed: false, version: null, groups: {} } } })
})

test('status lists every harness of the table: an enabled one with its command, path and install, a disabled one by its command only', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, {
    mutate: (c) => {
      c.harnesses.codex = codexEntry('/nowhere/codex')
      c.harnesses.grok = codexEntry('/nowhere/grok', 'grok')
    },
  })
  const alone = fx.lane(args, 'status', [], { ...env, AETHER_LANE_HARNESSES: 'agy' })
  assert.equal(alone.status, 0, alone.stdout + alone.stderr)
  assert.deepEqual([alone.json.harnesses.agy.enabled, alone.json.harnesses.agy.path, alone.json.harnesses.agy.installed], [true, fx.FAKE_AGY, true])
  assert.deepEqual(alone.json.harnesses.codex, { enabled: false, command: '/nowhere/codex' })
  assert.deepEqual(alone.json.harnesses.grok, { enabled: false, command: '/nowhere/grok' })

  // grok is enabled but not installed: no path, no version and no groups, and no adapter is loaded for it.
  const grok = fx.lane(args, 'status', [], { ...env, AETHER_LANE_HARNESSES: 'grok' })
  assert.equal(grok.status, 0, grok.stdout + grok.stderr)
  assert.deepEqual(grok.json.harnesses.grok, { enabled: true, command: '/nowhere/grok', path: null, installed: false, version: null, groups: {} })
  assert.deepEqual(grok.json.harnesses.agy, { enabled: false, command: fx.FAKE_AGY })
})

test('status reads each enabled harness through its own adapter, and logs one reading per installed harness, named', (t) => {
  const { repo, args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { mutate: (c) => (c.harnesses.codex = codexEntry(fx.FAKE_AGY)) })
  useEnv(t, { ...env, AETHER_LANE_HARNESSES: 'agy,codex' })
  registerAdapter('codex', () => fakeCodex())
  t.after(() => unregisterAdapter('codex'))
  const out = calls.status(repo.dir, args.runId)
  assert.deepEqual([out.harnesses.codex.enabled, out.harnesses.codex.installed, out.harnesses.codex.version, out.harnesses.codex.groups.codex.usable], [true, true, '9.1.0', true])
  assert.deepEqual([out.harnesses.agy.enabled, out.harnesses.agy.version], [true, '1.3.2'])
  assert.deepEqual(lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'reading').map((e) => e.harness).sort(), ['agy', 'codex'])
})

test('start refuses a model of a harness the lanes option does not enable, and names the table when no harness has the model', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { mutate: (c) => (c.harnesses.codex = codexEntry('/nowhere/codex')) })
  const digest = fx.writePrompt(args, IMPLEMENT, 'the message')
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest, { model: 'gpt-codex' })], { ...env, AETHER_LANE_HARNESSES: 'agy' }).json, { unavailable: 'harness' })
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest, { model: 'nope-1' })], env).json, { error: 'no harness in the lane table has the model nope-1' })
  assert.equal(fs.existsSync(path.join(args.runDir, 'lanes', IMPLEMENT, 'call.json')), false)
})

test("without AETHER_LANE_HARNESSES, as where the mod runs aether-lane, status and start read the run's compiled list", (t) => {
  const { repo, args } = fx.laneRun(t)
  const graphFile = path.join(args.runDir, 'graph.json')
  const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'))
  fs.writeFileSync(graphFile, JSON.stringify({ ...graph, lanes: { harness: 'codex', harnesses: ['codex'] } }))
  const env = fx.laneEnv(t, { mutate: (c) => (c.harnesses.codex = codexEntry('/nowhere/codex')) })
  useEnv(t, env)
  const previous = process.env.AETHER_LANE_HARNESSES
  delete process.env.AETHER_LANE_HARNESSES
  t.after(() => {
    if (previous !== undefined) process.env.AETHER_LANE_HARNESSES = previous
  })
  const out = calls.status(repo.dir, args.runId)
  assert.deepEqual([out.harnesses.codex.enabled, out.harnesses.agy.enabled], [true, false])
  const digest = fx.writePrompt(args, IMPLEMENT, 'the message')
  const flagsOf = { role: 'implementer', task: 'task-1', effort: 'high', digest }
  // agy's model is refused, since the run listed codex alone; codex's passes that check and stops at its install.
  assert.deepEqual(calls.start(args.repoRoot, args.runId, IMPLEMENT, { ...flagsOf, model: 'gemini-3.8-flash' }), { unavailable: 'harness' })
  assert.deepEqual(calls.start(args.repoRoot, args.runId, IMPLEMENT, { ...flagsOf, model: 'gpt-codex' }), { unavailable: 'not-installed' })
})

test('start takes the harness from the model, and records it in the call', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { mutate: (c) => (c.harnesses.codex = codexEntry(fx.FAKE_AGY)) })
  useEnv(t, { ...env, AETHER_LANE_HARNESSES: 'agy,codex' })
  registerAdapter('codex', () => fakeCodex())
  t.after(() => unregisterAdapter('codex'))
  // The runner it starts is another process and cannot load this adapter: the test ends the call itself.
  t.after(() => {
    try {
      calls.stop(args.repoRoot, args.runId, IMPLEMENT)
    } catch {
      // the repository is gone already
    }
  })
  const digest = fx.writePrompt(args, IMPLEMENT, 'You are implementing task-1: Task 1 title.')
  assert.deepEqual(calls.start(args.repoRoot, args.runId, IMPLEMENT, { role: 'implementer', task: 'task-1', model: 'gpt-codex', effort: 'high', digest }), {
    started: true,
    model: 'gpt-codex-high',
    group: 'codex',
  })
  const info = JSON.parse(fs.readFileSync(path.join(args.runDir, 'lanes', IMPLEMENT, 'call.json'), 'utf8'))
  assert.deepEqual([info.harness, info.laneModel, info.model, info.group], ['codex', 'gpt-codex', 'gpt-codex-high', 'codex'])
})

test('a harness that takes the schema in its prompt gets the answer section at the end of it, and agy does not', async (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { mutate: (c) => (c.harnesses.codex = codexEntry(fx.FAKE_AGY)) })
  useEnv(t, { ...env, AETHER_LANE_HARNESSES: 'agy,codex' })
  // The fake agy answers for it, from the same code as agy's adapter, with the schema flag in its prompt.
  registerAdapter('codex', ({ command, groups }) => Object.assign(createAgy({ command, groups }), { schemaInPrompt: true }))
  t.after(() => unregisterAdapter('codex'))
  const { workdir } = work.prepareImplementer(args.repoRoot, args.runId, 'task-1')
  fx.writePrompt(args, IMPLEMENT, `You are implementing task-1: Task 1 title.\nFAKE-AGY: answer ${DONE}`)
  const dir = path.join(args.runDir, 'lanes', IMPLEMENT)
  const info = {
    runId: args.runId,
    call: IMPLEMENT,
    role: 'implementer',
    task: 'task-1',
    harness: 'codex',
    model: 'gpt-codex-high',
    laneModel: 'gpt-codex',
    group: 'codex',
    effort: 'high',
    timeoutSeconds: 60,
    workdir,
    quotaBefore: null,
    session: null,
    startedAt: Date.now(),
  }
  fs.writeFileSync(path.join(dir, 'call.json'), `${JSON.stringify(info)}\n`)
  await calls.runCall(args.repoRoot, args.runId, IMPLEMENT)
  const done = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'))
  assert.deepEqual([done.status, done.lane.harness], ['ok', 'codex'], done.detail)
  const [turn] = fx.agyTurns(env)
  const section = `## Your answer\n\nEnd your answer with one JSON object that matches this schema, and nothing after it:\n\n\`\`\`json\n${JSON.stringify(schemas.IMPLEMENTER_SCHEMA, null, 2)}\n\`\`\``
  assert.ok(turn.argv[1].endsWith(`\n\n${section}`))
  assert.ok(turn.argv[1].includes('You are an Aether implementer, run by the codex CLI rather than Claude Code.'))
})

test('start refuses, changing nothing, when the prompt, digest, role, harness or quota does not allow the call', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags('00000000:0')], env).json, { unavailable: 'prompt' })
  const digest = fx.writePrompt(args, IMPLEMENT, `FAKE-AGY: answer ${DONE}`)
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags('00000000:0')], env).json, { unavailable: 'digest' })
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest, { effort: 'max' })], env).json, { unavailable: 'role' })
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest, { role: 'supervisor' })], env).json, { unavailable: 'role' })
  const missing = fx.laneEnv(t, { command: path.join(path.dirname(fx.FAKE_AGY), 'no-such-agy') })
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], missing).json, { unavailable: 'not-installed' })
  const dry = fx.laneEnv(t, { quota: { 'Gemini Models': [0.05, 0.9], 'Claude and GPT models': [0.9, 0.9] } })
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], dry).json, { unavailable: 'quota' })
  assert.equal(fs.existsSync(unitDir(args)), false)
  assert.deepEqual(fs.readdirSync(path.join(args.runDir, 'lanes', IMPLEMENT)).sort(), ['prompt.md', 'spawn.json'])
  assert.equal(fx.agyTurns(env).length, 0)
})

test("an implementer call runs agy in the unit worktree, and returns its report with git's head, a package, a log entry and a digest", (t) => {
  const { args, env, message, done } = implement(
    t,
    ['FAKE-AGY: write src/t1/a.js one', 'FAKE-AGY: commit add a', 'FAKE-AGY: usage 1000 200 0 500', `FAKE-AGY: answer ${DONE}`],
    { session: 's-1' },
  )
  assert.equal(done.status, 'ok', done.detail)
  const unit = unitDir(args)
  const head = fx.git(unit, 'rev-parse', 'HEAD')
  assert.deepEqual([done.result.status, done.result.head], ['DONE', head])
  assert.deepEqual([done.lane.harness, done.lane.model, done.lane.group, done.lane.effort], ['agy', 'gemini-3.8-flash-high', 'gemini', 'xhigh'])
  assert.deepEqual(done.lane.usage, { input: 1000, output: 200, thinking: 0, cacheRead: 500, total: 1200 })
  assert.equal(done.digest, lanes.resultDigest({ result: done.result, lane: done.lane }))
  assert.ok(fs.readFileSync(path.join(args.runDir, 'packages', 'task-1.diff'), 'utf8').includes(`Head: ${head}`))
  assert.equal(fs.readFileSync(path.join(unit, '.aether-tmp', 'brief.md'), 'utf8'), fs.readFileSync(args.tasks['task-1'].brief, 'utf8'))

  const [turn] = fx.agyTurns(env)
  assert.equal(turn.cwd, unit)
  assert.equal(turn.marker, `${args.runId}/${IMPLEMENT}`)
  assert.equal(fx.argAfter(turn.argv, '--model'), 'gemini-3.8-flash-high')
  assert.equal(fx.argAfter(turn.argv, '--print-timeout'), '2700s')
  assert.equal(fx.argAfter(turn.argv, '--conversation'), null)
  assert.ok(turn.argv.includes('--dangerously-skip-permissions'))
  assert.deepEqual(JSON.parse(fs.readFileSync(fx.argAfter(turn.argv, '--json-schema'), 'utf8')), schemas.IMPLEMENTER_SCHEMA)
  assert.ok(turn.argv[1].startsWith(fx.roleBody('implementer')))
  assert.ok(turn.argv[1].includes(LANE_NOTES.implementer))
  assert.ok(turn.argv[1].includes(WORKDIR_RULE))
  assert.ok(turn.argv[1].endsWith(message))
  // agy takes the schema as a flag, so its prompt carries no answer section.
  assert.equal(turn.argv[1].includes('## Your answer'), false)

  const entry = lanes.readLog(env.AETHER_DATA_DIR).find((e) => e.kind === 'call')
  assert.deepEqual(
    [entry.session, entry.run, entry.design, entry.call, entry.role, entry.task, entry.harness, entry.model, entry.group, entry.effort, entry.status],
    ['s-1', args.runId, null, IMPLEMENT, 'implementer', 'task-1', 'agy', 'gemini-3.8-flash-high', 'gemini', 'xhigh', 'ok'],
  )
  assert.deepEqual(entry.usage, done.lane.usage)
  assert.equal(entry.conversation, done.lane.conversation)
  assert.deepEqual([entry.quotaBefore.windows['5h'].remaining, entry.quotaAfter.windows.weekly.remaining], [0.9, 0.9])
  assert.ok(entry.startedAt <= entry.time)
  const dir = path.join(args.runDir, 'lanes', IMPLEMENT)
  assert.deepEqual([fs.existsSync(path.join(dir, 'pid')), fs.existsSync(path.join(dir, 'agy.pid'))], [false, false])
  assert.deepEqual(fx.lane(args, 'result', [IMPLEMENT], env).json, done)
})

test("agy gets an allowlisted environment, never the caller's tokens, keys or secrets", (t) => {
  const envFile = path.join(tempDir(t), 'agy-env.json')
  const env = {
    ...fx.laneEnv(t),
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    TZ: 'UTC',
    XDG_CONFIG_HOME: '/tmp/xdg',
    CLAUDE_CODE_MESSAGING_TOKEN: 'secret',
    ORCA_AGENT_HOOK_TOKEN: 'secret',
    ORCA_PANE_KEY: 'secret',
    GIT_CONFIG_GLOBAL: '/nowhere',
    STARSHIP_SHELL: 'fish',
    AETHER_TEST_TOKEN: 'secret',
    UNLISTED: 'x',
  }
  const { args, done } = implement(t, [`FAKE-AGY: env ${envFile}`, `FAKE-AGY: answer ${DONE}`], { env })
  assert.equal(done.status, 'ok', done.detail)
  const seen = JSON.parse(fs.readFileSync(envFile, 'utf8'))
  assert.deepEqual(Object.keys(seen).filter((name) => !fx.allowedEnvName(name)), [])
  assert.deepEqual(
    [seen.HOME, seen.PATH, seen.LANG, seen.LC_ALL, seen.TZ, seen.XDG_CONFIG_HOME, seen.AETHER_DATA_DIR, seen.AETHER_LANE_CALL],
    [env.HOME, process.env.PATH, 'C.UTF-8', 'C.UTF-8', 'UTC', '/tmp/xdg', env.AETHER_DATA_DIR, `${args.runId}/${IMPLEMENT}`],
  )
})

test('work agy leaves uncommitted inside Owns is committed by the runner', (t) => {
  const { args, done } = implement(t, ['FAKE-AGY: write src/t1/b.js two', `FAKE-AGY: answer ${DONE}`])
  assert.equal(done.status, 'ok', done.detail)
  assert.equal(fx.git(unitDir(args), 'log', '-1', '--format=%s'), 'lanes: commit the work the external agent left uncommitted')
  assert.equal(fx.git(unitDir(args), 'status', '--porcelain'), '')
  assert.equal(done.result.head, fx.git(unitDir(args), 'rev-parse', 'HEAD'))
})

test('changes outside Owns make a violation that lists the files', (t) => {
  const { done } = implement(t, ['FAKE-AGY: write src/t1/a.js one', 'FAKE-AGY: write other/x.js two', 'FAKE-AGY: commit both', `FAKE-AGY: answer ${DONE}`])
  assert.deepEqual([done.status, done.result, done.files, done.detail], ['violation', null, ['other/x.js'], 'changes outside Owns'])
  assert.equal(done.digest, lanes.resultDigest({ result: null, lane: done.lane }))
})

test('a change to the integration worktree blocks the unit', (t) => {
  const { done } = implement(t, (args) => [`FAKE-AGY: write-abs ${path.join(args.repoRoot, 'stray.txt')} x`, `FAKE-AGY: answer ${DONE}`])
  assert.deepEqual([done.status, done.detail, done.result], ['blocked', 'the integration worktree changed during the lane call', null])
})

test("a non-clean call is quota when the group fell under the reserve, failed otherwise, and agy's partial work stays uncommitted", (t) => {
  const env = fx.laneEnv(t)
  const low = JSON.stringify({ 'Gemini Models': [0.01, 0.9], 'Claude and GPT models': [0.9, 0.9] })
  const quota = implement(t, ['FAKE-AGY: write src/t1/partial.js half', `FAKE-AGY: write-abs ${env.AETHER_FAKE_AGY_QUOTA_FILE} ${low}`, 'FAKE-AGY: exit-error'], { env })
  assert.deepEqual([quota.done.status, quota.done.result], ['quota', null])
  assert.match(quota.done.detail, /^exit 1: model not found/)
  assert.match(fx.git(unitDir(quota.args), 'status', '--porcelain', '--untracked-files=all'), /src\/t1\/partial\.js/)

  const failed = implement(t, ['FAKE-AGY: write src/t1/half.js half', 'FAKE-AGY: timeout'])
  assert.equal(failed.done.status, 'failed')
  assert.match(failed.done.detail, /^stderr: \[agy\] print timeout/)
  assert.match(fx.git(unitDir(failed.args), 'status', '--porcelain', '--untracked-files=all'), /src\/t1\/half\.js/)
})

test('a non-clean call whose /usage cannot be read afterwards is failed, not quota', (t) => {
  const env = fx.laneEnv(t)
  const { done } = implement(t, [`FAKE-AGY: write-abs ${env.AETHER_FAKE_AGY_QUOTA_FILE} unreadable`, 'FAKE-AGY: exit-error'], { env })
  assert.deepEqual([done.status, done.result], ['failed', null])
  assert.match(done.detail, /^exit 1: model not found/)
  const entry = lanes.readLog(env.AETHER_DATA_DIR).find((e) => e.kind === 'call')
  assert.deepEqual([entry.status, entry.quotaAfter], ['failed', null])
})

test('a supervisor call reviews in a disposable copy of the unit branch, then the copy is removed', (t) => {
  const { args, unit } = preparedUnit(t)
  const env = fx.laneEnv(t)
  const call = 'task-1-1-supervise'
  const digest = fx.writePrompt(args, call, `Review task-1.\nFAKE-AGY: answer ${APPROVE}`)
  const start = fx.lane(args, 'start', [call, ...flags(digest, { role: 'supervisor', model: 'claude-sonnet-5-5', effort: 'high' })], env)
  assert.deepEqual(start.json, { started: true, model: 'claude-sonnet-5-5-high', group: 'claude' })
  const done = fx.waitDone(args, call, env)
  assert.equal(done.status, 'ok', done.detail)
  assert.equal(done.result.verdict, 'approve')
  const copy = path.join(args.repoRoot, '.aether', 'lanes', args.runId, call)
  const [turn] = fx.agyTurns(env)
  assert.deepEqual([turn.cwd, turn.head, turn.files], [copy, fx.git(unit, 'rev-parse', 'HEAD'), ['brief.md', 'package.diff']])
  assert.equal(fx.argAfter(turn.argv, '--print-timeout'), '900s')
  assert.ok(turn.argv[1].startsWith(fx.roleBody('supervisor')))
  assert.equal(fs.existsSync(copy), false)
  assert.equal(fx.git(args.repoRoot, 'worktree', 'list').includes(copy), false)
})

test('a supervisor call that writes to the real unit worktree is blocked', (t) => {
  const { args, unit } = preparedUnit(t)
  const env = fx.laneEnv(t)
  const call = 'task-1-1-supervise'
  const digest = fx.writePrompt(args, call, `FAKE-AGY: write-abs ${path.join(unit, 'src', 't1', 'z.js')} x\nFAKE-AGY: answer ${APPROVE}`)
  fx.lane(args, 'start', [call, ...flags(digest, { role: 'supervisor', model: 'claude-sonnet-5-5', effort: 'high' })], env)
  const done = fx.waitDone(args, call, env)
  assert.deepEqual([done.status, done.detail, done.result], ['blocked', 'the unit worktree changed during a read-only lane call', null])
  assert.equal(fs.existsSync(path.join(args.repoRoot, '.aether', 'lanes', args.runId, call)), false)
})

test("the final reviewer reads a disposable copy of the integration branch with the run's package", (t) => {
  const { args } = preparedUnit(t)
  assert.equal(runBin(WT_BIN, ['merge', args.runId, 'task-1'], args.repoRoot).json.merged, true)
  runBin(WT_BIN, ['diff', args.runId, '--final'], args.repoRoot)
  const env = fx.laneEnv(t)
  const digest = fx.writePrompt(args, 'final-review', `Final review.\nFAKE-AGY: answer ${READY}`)
  const start = fx.lane(args, 'start', ['final-review', ...flags(digest, { role: 'reviewer', task: null, model: 'claude-opus-5-5', effort: 'high' })], env)
  assert.deepEqual(start.json, { started: true, model: 'claude-opus-5-5-high', group: 'claude' })
  const done = fx.waitDone(args, 'final-review', env)
  assert.deepEqual([done.status, done.result.verdict], ['ok', 'ready'])
  const [turn] = fx.agyTurns(env)
  assert.deepEqual([turn.head, turn.files], [fx.git(args.repoRoot, 'rev-parse', args.integration.branch), ['package.diff']])
})

test("stop kills a running call's runner and agy, and wait then reports it unfinished", async (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  const digest = fx.writePrompt(args, IMPLEMENT, `FAKE-AGY: sleep 60\nFAKE-AGY: answer ${DONE}`, { session: 's-1' })
  fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  const dir = path.join(args.runDir, 'lanes', IMPLEMENT)
  const runner = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'))
  const deadline = Date.now() + 15000
  while (!fs.existsSync(path.join(dir, 'agy.pid')) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  const agy = Number(fs.readFileSync(path.join(dir, 'agy.pid'), 'utf8'))
  // The runner runs on the allowlisted environment too.
  const runnerEnv = fs.readFileSync(`/proc/${runner}/environ`, 'utf8').split('\0').filter(Boolean).map((entry) => entry.slice(0, entry.indexOf('=')))
  assert.deepEqual(runnerEnv.filter((name) => !fx.allowedEnvName(name)), [])
  assert.ok(runnerEnv.includes('AETHER_LANE_CALL'))
  assert.deepEqual(fx.lane(args, 'stop', [IMPLEMENT], env).json, { stopped: [IMPLEMENT] })
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.deepEqual([fx.alive(runner), fx.alive(agy)], [false, false])
  assert.deepEqual(fx.lane(args, 'wait', [IMPLEMENT, '--max', '1'], env).json, { done: false })
  assert.deepEqual(fx.lane(args, 'stop', [IMPLEMENT], env).json, { stopped: [] })

  // The stopped call has its log entry, in the runner's shape, and only one however often stop runs.
  const entries = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'call')
  assert.equal(entries.length, 1)
  const [entry] = entries
  assert.deepEqual(
    [entry.session, entry.run, entry.design, entry.call, entry.role, entry.task, entry.harness, entry.model, entry.group, entry.effort, entry.status],
    ['s-1', args.runId, null, IMPLEMENT, 'implementer', 'task-1', 'agy', 'gemini-3.8-flash-high', 'gemini', 'xhigh', 'stopped'],
  )
  assert.deepEqual([entry.usage, entry.conversation, entry.quotaAfter], [{ input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }, null, null])
  assert.equal(entry.quotaBefore.windows['5h'].remaining, 0.9)
  assert.ok(entry.startedAt <= entry.time && entry.durationMs === entry.time - entry.startedAt)
  assert.equal(typeof entry.detail, 'string')
})

test("stop logs the usage agy reported when agy finished but the runner wrote no result", (t) => {
  const { args, env, done } = implement(t, ['FAKE-AGY: usage 3000 400 0 700', `FAKE-AGY: answer ${DONE}`])
  assert.equal(done.status, 'ok', done.detail)
  // A runner that died between agy's end and its result leaves agy's output and no result.
  fs.rmSync(path.join(args.runDir, 'lanes', IMPLEMENT, 'result.json'))
  assert.deepEqual(fx.lane(args, 'stop', [IMPLEMENT], env).json, { stopped: [] })
  const stopped = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'call' && e.status === 'stopped')
  assert.equal(stopped.length, 1)
  assert.deepEqual([stopped[0].usage, stopped[0].conversation], [done.lane.usage, done.lane.conversation])
})

test('stop of a call that finished, or never started, logs nothing', (t) => {
  const { args, env, done } = implement(t, [`FAKE-AGY: answer ${DONE}`])
  assert.equal(done.status, 'ok', done.detail)
  fx.lane(args, 'stop', [IMPLEMENT], env)
  fx.lane(args, 'stop', ['task-1-2-implement'], env)
  assert.deepEqual(lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'call').map((e) => e.status), ['ok'])
})

test('a command without its run id answers with its usage', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  const bare = (verb, ...rest) => runBin(fx.LANE_BIN, [verb, ...rest], args.repoRoot, env)
  assert.deepEqual([bare('status').status, bare('status').json], [1, { error: 'usage: aether-lane status <run>' }])
  assert.deepEqual(bare('stop').json, { error: 'usage: aether-lane stop <run> [<call>]' })
  assert.deepEqual(bare('result', args.runId).json, { error: 'usage: aether-lane result <run> <call>' })
  assert.deepEqual(bare('wait').json, { error: 'usage: aether-lane wait <run> <call> [--max <seconds>]' })
})

test("a failed call's detail holds agy's error text once, whether stderr repeats it as is or after a prefix", (t) => {
  const text = `model not found: nope. ${'Available models are listed by agy models. '.repeat(10)}`.trim()
  const same = implement(t, [`FAKE-AGY: exit-error ${text}`, `FAKE-AGY: stderr ${text}`])
  assert.deepEqual([same.done.status, same.done.detail], ['failed', `exit 1: ${text}`])
  const prefixed = implement(t, [`FAKE-AGY: exit-error ${text}`, `FAKE-AGY: stderr Error: ${text}`])
  assert.deepEqual([prefixed.done.status, prefixed.done.detail], ['failed', `exit 1\nError: ${text}`])
  const timeout = implement(t, ['FAKE-AGY: timeout'])
  assert.equal(timeout.done.detail, 'stderr: [agy] print timeout 10s reached, returning partial output')
})

test("stop also ends the commands agy started in sessions of their own, found by the call's marker, and nothing else", { timeout: 60000 }, async (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  const pidFile = path.join(tempDir(t), 'detached.pid')
  const digest = fx.writePrompt(args, IMPLEMENT, `FAKE-AGY: detach ${pidFile} 120\nFAKE-AGY: sleep 60\nFAKE-AGY: answer ${DONE}`)
  fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  await fx.waitForFile(pidFile)
  const detached = Number(fs.readFileSync(pidFile, 'utf8'))
  t.after(() => fx.killQuietly(detached))
  const loose = fx.ownSession(t, `${args.runId}/${IMPLEMENT}`)
  const sibling = fx.ownSession(t, `${args.runId}/task-1-1-supervise`)
  const unmarked = fx.ownSession(t, null)
  assert.deepEqual(fx.lane(args, 'stop', [IMPLEMENT], env).json, { stopped: [IMPLEMENT] })
  await loose.exited
  assert.deepEqual([fx.alive(detached), fx.alive(sibling.pid), fx.alive(unmarked.pid)], [false, true, true])
})

test('once agy exits, the runner ends the commands agy left running in sessions of their own', (t) => {
  const pidFile = path.join(tempDir(t), 'detached.pid')
  const { done } = implement(t, [`FAKE-AGY: detach ${pidFile} 120`, 'FAKE-AGY: write src/t1/a.js one', `FAKE-AGY: answer ${DONE}`])
  const detached = Number(fs.readFileSync(pidFile, 'utf8'))
  t.after(() => fx.killQuietly(detached))
  assert.equal(done.status, 'ok', done.detail)
  assert.equal(fx.alive(detached), false)
})

test('wait gives up after --max, and a new start of the same call never returns the old result', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  assert.deepEqual(fx.lane(args, 'wait', [IMPLEMENT], env).json, { error: `no such lane call: ${IMPLEMENT}` })
  let digest = fx.writePrompt(args, IMPLEMENT, `FAKE-AGY: sleep 3\nFAKE-AGY: write src/t1/a.js one\nFAKE-AGY: commit a\nFAKE-AGY: answer ${DONE}`)
  fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  assert.deepEqual(fx.lane(args, 'wait', [IMPLEMENT, '--max', '1'], env).json, { done: false })
  const first = fx.waitDone(args, IMPLEMENT, env)
  assert.equal(first.status, 'ok', first.detail)
  digest = fx.writePrompt(args, IMPLEMENT, `FAKE-AGY: sleep 3\nFAKE-AGY: answer ${DONE}`)
  assert.equal(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env).json.started, true)
  assert.deepEqual(fx.lane(args, 'wait', [IMPLEMENT, '--max', '1'], env).json, { done: false })
  const second = fx.waitDone(args, IMPLEMENT, env)
  assert.notEqual(second.lane.conversation, first.lane.conversation)
})
