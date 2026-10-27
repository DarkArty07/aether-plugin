'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const lanes = require('../plugins/aether/lib/lanes.js')
const schemas = require('../plugins/aether/lib/lane-schemas.js')
const work = require('../plugins/aether/lib/lane-work.js')
const calls = require('../plugins/aether/lib/lane-calls.js')
const { buildPrompt, WORKDIR_RULE } = calls
const { registerAdapter, unregisterAdapter } = require('../plugins/aether/lib/harness/index.js')
const { createAgy } = require('../plugins/aether/lib/harness/agy.js')
const { parseRun, unknownQuota } = require('../plugins/aether/lib/harness/structured.js')
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
  return {
    name: 'codex',
    installed: () => true,
    version: () => '9.1.0',
    quota: () => ({ groups: { codex: { unknown: true } } }),
    modelArg: ({ model }) => model,
  }
}

// The structured output the fake agy printed as its answer, as text, or nothing when it printed none.
function readFakeAnswer(stdout) {
  let data = null
  try {
    data = JSON.parse(stdout)
  } catch {
    // Not JSON: nothing was answered.
  }
  const answer = data?.structured_output === undefined ? '' : JSON.stringify(data.structured_output)
  return { answer, usage: { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }, outside: data?.error ? String(data.error) : '' }
}

// A harness that reports no quota, as codex, grok and cursor do, run on the fake agy: its output is read by
// structured.js's parseRun, so a quota line in its stderr is a quota failure.
function unknownQuotaHarness({ command, groups }) {
  return {
    ...createAgy({ command, groups }),
    name: 'codex',
    schemaInPrompt: true,
    quota: () => unknownQuota(groups),
    modelArg: ({ model }) => model,
    argv: ({ model, level, prompt }) => [command, '-p', prompt, '--model', model, '-c', `model_reasoning_effort=${level}`, '--output-format', 'json'],
    parse: (raw, { required = [] } = {}) => parseRun(raw, readFakeAnswer, required),
  }
}

// Runs one implementer call on the codex harness, from the prompt lines after its first line, as start would
// have recorded it, and returns the call's result with the environment it ran in.
async function runCodexCall(t, lines, { harness = unknownQuotaHarness } = {}) {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { mutate: (c) => (c.harnesses.codex = codexEntry(fx.FAKE_AGY)) })
  useEnv(t, { ...env, AETHER_LANE_HARNESSES: 'agy,codex' })
  registerAdapter('codex', harness)
  t.after(() => unregisterAdapter('codex'))
  const { workdir } = work.prepareImplementer(args.repoRoot, args.runId, 'task-1')
  fx.writePrompt(args, IMPLEMENT, ['You are implementing task-1: Task 1 title.', ...lines].join('\n'))
  const dir = path.join(args.runDir, 'lanes', IMPLEMENT)
  const info = {
    runId: args.runId,
    call: IMPLEMENT,
    role: 'implementer',
    task: 'task-1',
    harness: 'codex',
    model: 'gpt-codex',
    laneModel: 'gpt-codex',
    group: 'codex',
    effort: 'high',
    level: 'high',
    timeoutSeconds: 60,
    workdir,
    quotaBefore: null,
    session: null,
    startedAt: Date.now(),
  }
  fs.writeFileSync(path.join(dir, 'call.json'), `${JSON.stringify(info)}\n`)
  await calls.runCall(args.repoRoot, args.runId, IMPLEMENT)
  return { env, done: JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')) }
}

// Starts an implementer call on a fresh run and waits for it. `lines` is the payload after its
// first line, or a function of the run's args that returns it.
function implement(t, lines, { env = fx.laneEnv(t), session = null } = {}) {
  const { repo, args } = fx.laneRun(t)
  const body = typeof lines === 'function' ? lines(args) : lines
  const message = ['You are implementing task-1: Task 1 title.', ...body].join('\n')
  const digest = fx.writePrompt(args, IMPLEMENT, message, { session })
  const start = fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  assert.deepEqual(start.json, { started: true, model: 'gemini-3.8-flash-xhigh', group: 'flash' }, start.stdout + start.stderr)
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

test('validate gives the first problem of an answer in a few words, and null for a valid one', () => {
  const retry = { verdict: 'retry', findings: [], ruling: 'Retry.', guidance: 'Fix it.', question: '' }
  assert.equal(schemas.validate(schemas.SUPERVISOR_SCHEMA, retry), null)
  assert.equal(schemas.validate(schemas.SUPERVISOR_SCHEMA, { ...retry, findings: 'see ruling' }), 'findings must be an array')
  assert.equal(schemas.validate(schemas.SUPERVISOR_SCHEMA, { ...retry, verdict: 'approved' }), 'verdict must be one of approve, retry, escalate, block')
  assert.equal(
    schemas.validate(schemas.SUPERVISOR_SCHEMA, { ...retry, findings: [{ severity: 'major', title: 't', file: 'a.js:1', evidence: 'e' }] }),
    'findings[0].severity must be one of critical, important, minor',
  )
  assert.equal(schemas.validate(schemas.SUPERVISOR_SCHEMA, { ...retry, findings: [{ severity: 'minor', title: 't', file: 'a.js:1' }] }), 'missing findings[0].evidence')
  const { question, ...unanswered } = retry
  assert.equal(schemas.validate(schemas.SUPERVISOR_SCHEMA, unanswered), 'missing question')
  assert.equal(schemas.validate(schemas.SUPERVISOR_SCHEMA, 'approve'), 'must be an object')
  assert.equal(schemas.validate({ type: ['string', 'null'] }, null), null)
  assert.equal(schemas.validate({ type: ['string', 'null'] }, 1), 'must be a string or null')
})

test('each role schema accepts the answer its role gives, and validate throws for a keyword the schemas do not use', () => {
  assert.equal(schemas.validate(schemas.IMPLEMENTER_SCHEMA, JSON.parse(DONE)), null)
  assert.equal(schemas.validate(schemas.SUPERVISOR_SCHEMA, JSON.parse(APPROVE)), null)
  assert.equal(schemas.validate(schemas.REVIEW_SCHEMA, JSON.parse(READY)), null)
  const block = { verdict: 'block', findings: [{ severity: 'critical', title: 't', file: 'a.js:3', evidence: 'e' }], ruling: 'Block.', guidance: '', question: 'Which?' }
  assert.equal(schemas.validate(schemas.SUPERVISOR_SCHEMA, block), null)
  assert.throws(() => schemas.validate({ type: 'string', minLength: 1 }, 'x'), /unsupported schema keyword: minLength/)
  assert.throws(
    () => schemas.validate({ type: 'object', properties: { a: { type: 'array', items: { type: 'string', pattern: '.' } } } }, { a: [] }),
    /unsupported schema keyword: pattern/,
  )
})

test('buildPrompt puts the role, the lane note and the CLAUDE.md files before the message', (t) => {
  const home = tempDir(t)
  const work = tempDir(t)
  fs.mkdirSync(path.join(home, '.claude'))
  fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), 'user rules\n')
  fs.writeFileSync(path.join(work, 'CLAUDE.md'), 'project rules\n\n')
  const supervisorNote = `## You run in an external harness\n\nYou are an Aether supervisor, run by the agy CLI rather than Claude Code. The current directory is a disposable copy of the unit's branch; the brief and the review package are in its .aether-tmp/ folder. Your review is read-only: do not run commands, and do not change any file. ${WORKDIR_RULE} Every other rule of your role holds. Answer with the structured output your harness asks for.`
  const implementerNote = `## You run in an external harness\n\nYou are an Aether implementer, run by the agy CLI rather than Claude Code. Your unit worktree is the current directory; the harness created it and copied your brief to .aether-tmp/brief.md. Skip the \`aether-wt ensure\` and \`aether-wt diff\` steps of your role: the harness packages your diff and reads your head from git. Never edit the integration worktree, the main checkout, or another unit's worktree. ${WORKDIR_RULE} Every other rule of your role holds. Answer with the structured output your harness asks for.`
  const reviewerNote = `## You run in an external harness\n\nYou are the Aether final reviewer, run by the agy CLI rather than Claude Code. The current directory is a disposable copy of the integration branch; the review package is in its .aether-tmp/ folder. Your review is read-only: do not run commands, and do not change any file. ${WORKDIR_RULE} Every other rule of your role holds. Answer with the structured output your harness asks for.`
  assert.equal(
    buildPrompt({ role: 'supervisor', message: 'THE MESSAGE', workdir: work, home }),
    [
      fx.roleBody('supervisor'),
      supervisorNote,
      `## Instructions from ${path.join(home, '.claude', 'CLAUDE.md')}\n\nuser rules`,
      `## Instructions from ${path.join(work, 'CLAUDE.md')}\n\nproject rules`,
      'THE MESSAGE',
    ].join('\n\n'),
  )
  assert.equal(buildPrompt({ role: 'implementer', message: 'M', workdir: tempDir(t), home: tempDir(t) }), [fx.roleBody('implementer'), implementerNote, 'M'].join('\n\n'))
  assert.match(implementerNote, /^## You run in an external harness\n\nYou are an Aether implementer, run by the agy CLI rather than Claude Code\./)
  assert.match(supervisorNote, /Your review is read-only: do not run commands, and do not change any file\./)
  assert.match(reviewerNote, /^## You run in an external harness\n\nYou are the Aether final reviewer/)
  assert.equal(WORKDIR_RULE, 'Work only inside the working directory you are given: do not run `env` or `ps`, and do not search outside that directory.')
  for (const [role, note] of [['implementer', implementerNote], ['supervisor', supervisorNote], ['reviewer', reviewerNote]]) assert.ok(note.includes(WORKDIR_RULE), role)
})

test("a lane note names the harness that runs the call, and agy's notes read as they always did", (t) => {
  const home = tempDir(t)
  const workdir = tempDir(t)
  const prompt = buildPrompt({ role: 'reviewer', message: 'M', workdir, home, harness: 'codex' })
  assert.ok(prompt.includes('You are the Aether final reviewer, run by the codex CLI rather than Claude Code.'))
  assert.equal(buildPrompt({ role: 'reviewer', message: 'M', workdir, home }), buildPrompt({ role: 'reviewer', message: 'M', workdir, home, harness: 'agy' }))
  assert.ok(buildPrompt({ role: 'reviewer', message: 'M', workdir, home }).includes('You are the Aether final reviewer, run by the agy CLI rather than Claude Code.'))
})

test("status reads each group's windows, marks a group under the reserve unusable, and logs the reading", (t) => {
  const env = fx.laneEnv(t, { quota: { 'Gemini Models': [0.04, 0.9], 'Claude and GPT models': [0.9, 0.9] } })
  const { args } = fx.laneRun(t)
  const r = fx.lane(args, 'status', [], env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const agy = r.json.harnesses.agy
  assert.deepEqual([agy.enabled, agy.path, agy.installed, agy.version, agy.groups.argon.usable, agy.groups.flash.usable, agy.groups.claude.usable], [true, fx.FAKE_AGY, true, '1.3.2', false, false, true])
  assert.deepEqual([agy.groups.claude.windows['5h'].remaining, agy.groups.claude.windows['5h'].resetsAt], [0.9, '2026-10-09T05:53:31.000Z'])
  const readings = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'reading')
  assert.equal(readings.length, 1)
  assert.deepEqual([readings[0].run, readings[0].version, readings[0].harness, Object.keys(readings[0].groups).sort()], [args.runId, '1.3.2', 'agy', ['argon', 'claude', 'flash']])
  const missing = fx.lane(args, 'status', [], fx.laneEnv(t, { command: '/nowhere/agy' }))
  assert.deepEqual(missing.json.harnesses, {
    agy: { enabled: true, command: '/nowhere/agy', path: null, installed: false, version: null, groups: {} },
    codex: { enabled: false, command: 'codex' },
    grok: { enabled: false, command: 'grok' },
    cursor: { enabled: false, command: 'cursor-agent' },
    muse: { enabled: false, command: '/nowhere/muse' },
  })
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
  // codex takes the bare model id as --model; the level goes to it as its reasoning effort.
  assert.deepEqual(calls.start(args.repoRoot, args.runId, IMPLEMENT, { role: 'implementer', task: 'task-1', model: 'gpt-codex', effort: 'high', digest }), {
    started: true,
    model: 'gpt-codex',
    group: 'codex',
  })
  const info = JSON.parse(fs.readFileSync(path.join(args.runDir, 'lanes', IMPLEMENT, 'call.json'), 'utf8'))
  assert.deepEqual([info.harness, info.laneModel, info.level, info.model, info.group], ['codex', 'gpt-codex', 'high', 'gpt-codex', 'codex'])
})

test('a harness that takes the schema in its prompt gets the answer section at the end of it, and agy does not', async (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t, { mutate: (c) => (c.harnesses.codex = codexEntry(fx.FAKE_AGY)) })
  useEnv(t, { ...env, AETHER_LANE_HARNESSES: 'agy,codex' })
  // The fake agy answers for it, as a codex adapter would be answered, with the answer section in its prompt.
  registerAdapter('codex', unknownQuotaHarness)
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
    model: 'gpt-codex',
    laneModel: 'gpt-codex',
    group: 'codex',
    effort: 'high',
    level: 'high',
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
  assert.deepEqual([fx.argAfter(turn.argv, '--model'), fx.argAfter(turn.argv, '-c')], ['gpt-codex', 'model_reasoning_effort=high'])
  const section = `## Your answer\n\nEnd your answer with one JSON object that matches this schema, and nothing after it:\n\n\`\`\`json\n${JSON.stringify(schemas.IMPLEMENTER_SCHEMA, null, 2)}\n\`\`\``
  assert.ok(turn.argv[1].endsWith(`\n\n${section}`))
  assert.ok(turn.argv[1].includes('You are an Aether implementer, run by the codex CLI rather than Claude Code.'))
})

test('start passes the effort of the pair to the harness as it is, xhigh included, and refuses an effort that does not exist', (t) => {
  const FAKE_GROK = path.join(__dirname, 'fixtures', 'fake-grok.js')
  fs.chmodSync(FAKE_GROK, 0o755)
  const { args } = fx.laneRun(t)
  const grokLog = path.join(tempDir(t), 'grok.log')
  const env = { ...fx.laneEnv(t, { mutate: (c) => (c.harnesses.grok.command = FAKE_GROK) }), AETHER_LANE_HARNESSES: 'agy,grok', AETHER_FAKE_GROK_LOG: grokLog }
  const effortsOf = () => (fs.existsSync(grokLog) ? fs.readFileSync(grokLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).map((c) => c.argv[c.argv.indexOf('--reasoning-effort') + 1]) : [])

  // xhigh is not translated to high: the call records it as the level and the CLI receives it.
  const digest = fx.writePrompt(args, IMPLEMENT, `You are implementing task-1: Task 1 title.\nFAKE-GROK: answer ${DONE}`)
  const start = fx.lane(args, 'start', [IMPLEMENT, ...flags(digest, { model: 'grok-4.7', effort: 'xhigh' })], env)
  assert.deepEqual(start.json, { started: true, model: 'grok-4.7', group: 'grok' }, start.stdout + start.stderr)
  const done = fx.waitDone(args, IMPLEMENT, env)
  assert.equal(done.status, 'ok', done.detail)
  const info = JSON.parse(fs.readFileSync(path.join(args.runDir, 'lanes', IMPLEMENT, 'call.json'), 'utf8'))
  assert.deepEqual([info.effort, info.level], ['xhigh', 'xhigh'])
  assert.deepEqual(effortsOf(), ['xhigh'])

  // An effort that does not exist, or an empty one, starts nothing.
  const other = 'task-1-2-implement'
  const second = fx.writePrompt(args, other, 'You are implementing task-1: Task 1 title.')
  assert.deepEqual(fx.lane(args, 'start', [other, ...flags(second, { model: 'grok-4.7', effort: 'extreme' })], env).json, { unavailable: 'role' })
  assert.equal(fx.lane(args, 'start', [other, ...flags(second, { model: 'grok-4.7', effort: '' })], env).status, 1)
  assert.deepEqual(effortsOf(), ['xhigh'])
})

test('start refuses, changing nothing, when the prompt, digest, role, harness or quota does not allow the call', (t) => {
  const { args } = fx.laneRun(t)
  const env = fx.laneEnv(t)
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags('00000000:0')], env).json, { unavailable: 'prompt' })
  const digest = fx.writePrompt(args, IMPLEMENT, `FAKE-AGY: answer ${DONE}`)
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags('00000000:0')], env).json, { unavailable: 'digest' })
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest, { effort: 'extreme' })], env).json, { unavailable: 'role' })
  assert.deepEqual(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest, { role: 'designer' })], env).json, { unavailable: 'role' })
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
  assert.deepEqual([done.lane.harness, done.lane.model, done.lane.group, done.lane.effort], ['agy', 'gemini-3.8-flash-xhigh', 'flash', 'xhigh'])
  assert.deepEqual(done.lane.usage, { input: 1000, output: 200, thinking: 0, cacheRead: 500, total: 1200 })
  assert.equal(done.digest, lanes.resultDigest({ result: done.result, lane: done.lane }))
  assert.ok(fs.readFileSync(path.join(args.runDir, 'packages', 'task-1.diff'), 'utf8').includes(`Head: ${head}`))
  assert.equal(fs.readFileSync(path.join(unit, '.aether-tmp', 'brief.md'), 'utf8'), fs.readFileSync(args.tasks['task-1'].brief, 'utf8'))

  const [turn] = fx.agyTurns(env)
  assert.equal(turn.cwd, unit)
  assert.equal(turn.marker, `${args.runId}/${IMPLEMENT}`)
  assert.equal(fx.argAfter(turn.argv, '--model'), 'gemini-3.8-flash-xhigh')
  assert.equal(fx.argAfter(turn.argv, '--print-timeout'), '2700s')
  assert.equal(fx.argAfter(turn.argv, '--conversation'), null)
  assert.ok(turn.argv.includes('--dangerously-skip-permissions'))
  assert.deepEqual(JSON.parse(fs.readFileSync(fx.argAfter(turn.argv, '--json-schema'), 'utf8')), schemas.IMPLEMENTER_SCHEMA)
  assert.ok(turn.argv[1].startsWith(fx.roleBody('implementer')))
  assert.ok(turn.argv[1].includes('You are an Aether implementer, run by the agy CLI rather than Claude Code.'))
  assert.ok(turn.argv[1].includes(WORKDIR_RULE))
  assert.ok(turn.argv[1].endsWith(message))
  // agy takes the schema as a flag, so its prompt carries no answer section.
  assert.equal(turn.argv[1].includes('## Your answer'), false)

  const entry = lanes.readLog(env.AETHER_DATA_DIR).find((e) => e.kind === 'call')
  assert.deepEqual(
    [entry.session, entry.run, entry.design, entry.call, entry.role, entry.task, entry.harness, entry.model, entry.group, entry.effort, entry.status],
    ['s-1', args.runId, null, IMPLEMENT, 'implementer', 'task-1', 'agy', 'gemini-3.8-flash-xhigh', 'flash', 'xhigh', 'ok'],
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
  const quota = implement(t, ['FAKE-AGY: write src/t1/partial.js half', `FAKE-AGY: write-abs ${env.AETHER_FAKE_AGY_QUOTA_FILE} ${low}`, 'FAKE-AGY: exit-error service unavailable'], { env })
  assert.deepEqual([quota.done.status, quota.done.result], ['quota', null])
  assert.match(quota.done.detail, /^exit 1: service unavailable/)
  assert.match(fx.git(unitDir(quota.args), 'status', '--porcelain', '--untracked-files=all'), /src\/t1\/partial\.js/)

  // Issue 015: the failure reason is checked before the reading, so a model
  // error stays failed even when the reading after it is under the reserve.
  const env2 = fx.laneEnv(t)
  const modelError = implement(t, [`FAKE-AGY: write-abs ${env2.AETHER_FAKE_AGY_QUOTA_FILE} ${low}`, 'FAKE-AGY: exit-error'], { env: env2 })
  assert.deepEqual([modelError.done.status, modelError.done.result], ['failed', null])
  assert.match(modelError.done.detail, /^exit 1: model not found/)

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

test('a quota failure of a harness that reports no quota is quota, and its other failures stay failed', async (t) => {
  // codex's quota is unknown, so only the quota line of its output can say it ran dry.
  const quota = await runCodexCall(t, ['FAKE-AGY: stderr Error: usage limit reached', 'FAKE-AGY: exit-error'])
  assert.deepEqual([quota.done.status, quota.done.result, quota.done.detail], ['quota', null, 'quota: Error: usage limit reached'])
  const logged = lanes.readLog(quota.env.AETHER_DATA_DIR).find((e) => e.kind === 'call')
  assert.deepEqual([logged.status, logged.harness, logged.detail], ['quota', 'codex', 'quota: Error: usage limit reached'])

  const other = await runCodexCall(t, ['FAKE-AGY: stderr Error: model not found', 'FAKE-AGY: exit-error'])
  assert.deepEqual([other.done.status, other.done.detail], ['failed', 'exit 1: Error: model not found'])
})

test("a quota line in the output ends the call as quota when the harness's reading still shows quota left, as grok's log does", async (t) => {
  // grok's reading comes from the log of its UI, which a headless call does not update: it still shows 80% left.
  const logged = (settings) => ({
    ...unknownQuotaHarness(settings),
    quota: () => ({ groups: { codex: { windows: { weekly: { remaining: 0.8, resetsAt: '2026-10-17T09:08:51.805Z' } } } } }),
  })
  const quota = await runCodexCall(t, ['FAKE-AGY: stderr Error: usage limit reached', 'FAKE-AGY: exit-error'], { harness: logged })
  assert.deepEqual([quota.done.status, quota.done.detail], ['quota', 'quota: Error: usage limit reached'])
  const other = await runCodexCall(t, ['FAKE-AGY: stderr Error: model not found', 'FAKE-AGY: exit-error'], { harness: logged })
  assert.deepEqual([other.done.status, other.done.detail], ['failed', 'exit 1: Error: model not found'])
})

test("an answer that breaks its role's schema fails the call with the problem, and a valid answer of each role passes", async (t) => {
  // The two answers a supervisor could give the workflow: a findings string, and a verdict outside the enum.
  const { args } = preparedUnit(t)
  const env = fx.laneEnv(t)
  const call = 'task-1-1-supervise'
  const retry ={ verdict: 'retry', findings: [], ruling: 'Retry.', guidance: 'Fix it.', question: '' }
  for (const [fields, detail] of [
    [{ findings: 'see ruling' }, 'invalid answer: findings must be an array'],
    [{ verdict: 'approved' }, 'invalid answer: verdict must be one of approve, retry, escalate, block'],
  ]) {
    const digest = fx.writePrompt(args, call, `Review task-1.\nFAKE-AGY: answer ${JSON.stringify({ ...retry, ...fields })}`)
    fx.lane(args, 'start', [call, ...flags(digest, { role: 'supervisor', model: 'claude-sonnet-5-5', effort: 'high' })], env)
    const done = fx.waitDone(args, call, env)
    assert.deepEqual([done.status, done.result, done.detail], ['failed', null, detail])
  }

  const approve = fx.writePrompt(args, call, `Review task-1.\nFAKE-AGY: answer ${APPROVE}`)
  fx.lane(args, 'start', [call, ...flags(approve, { role: 'supervisor', model: 'claude-sonnet-5-5', effort: 'high' })], env)
  assert.deepEqual(fx.waitDone(args, call, env).result, JSON.parse(APPROVE))
})

test('an implementer answer that breaks its schema fails before its head is added, on a harness whose quota is unknown', async (t) => {
  const invalid = JSON.stringify({ status: 'FINISHED', summary: 'Wrote it.', head: '', tests: '1/1 pass', concerns: '', question: '' })
  const failed = await runCodexCall(t, [`FAKE-AGY: answer ${invalid}`])
  assert.deepEqual([failed.done.status, failed.done.result, failed.done.detail], ['failed', null, 'invalid answer: status must be one of DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED'])

  const valid = await runCodexCall(t, [`FAKE-AGY: write src/t1/a.js one`, `FAKE-AGY: commit add a`, `FAKE-AGY: answer ${DONE}`])
  assert.deepEqual([valid.done.status, valid.done.result.status], ['ok', 'DONE'])
  assert.match(valid.done.result.head, /^[0-9a-f]{40}$/)
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
  const deadlineExit = Date.now() + 5000
  while ((fx.alive(runner) || fx.alive(agy)) && Date.now() < deadlineExit) await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual([fx.alive(runner), fx.alive(agy)], [false, false])
  assert.deepEqual(fx.lane(args, 'wait', [IMPLEMENT, '--max', '1'], env).json, { done: false })
  assert.deepEqual(fx.lane(args, 'stop', [IMPLEMENT], env).json, { stopped: [] })

  // The stopped call has its log entry, in the runner's shape, and only one however often stop runs.
  const entries = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'call')
  assert.equal(entries.length, 1)
  const [entry] = entries
  assert.deepEqual(
    [entry.session, entry.run, entry.design, entry.call, entry.role, entry.task, entry.harness, entry.model, entry.group, entry.effort, entry.status],
    ['s-1', args.runId, null, IMPLEMENT, 'implementer', 'task-1', 'agy', 'gemini-3.8-flash-xhigh', 'flash', 'xhigh', 'stopped'],
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
  assert.deepEqual([bare('status').status, bare('status').json], [1, { error: 'usage: aether-lane status <run> [--refresh]' }])
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
  let digest = fx.writePrompt(args, IMPLEMENT, `FAKE-AGY: sleep 6\nFAKE-AGY: write src/t1/a.js one\nFAKE-AGY: commit a\nFAKE-AGY: answer ${DONE}`)
  fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  assert.deepEqual(fx.lane(args, 'wait', [IMPLEMENT, '--max', '1'], env).json, { done: false })
  const first = fx.waitDone(args, IMPLEMENT, env)
  assert.equal(first.status, 'ok', first.detail)
  digest = fx.writePrompt(args, IMPLEMENT, `FAKE-AGY: sleep 6\nFAKE-AGY: answer ${DONE}`)
  assert.equal(fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env).json.started, true)
  assert.deepEqual(fx.lane(args, 'wait', [IMPLEMENT, '--max', '1'], env).json, { done: false })
  const second = fx.waitDone(args, IMPLEMENT, env)
  assert.notEqual(second.lane.conversation, first.lane.conversation)
})

// ---- quota ----

// A lane table whose agy is the fake agy, whose grok is a fake that only prints its version, and whose codex and
// cursor are not installed; grok's log, under the test's HOME, holds one billing line written ageMinutes ago.
function quotaEnv(t, { ageMinutes = 5, percent = 30, endHours = 50, agyQuota = null } = {}) {
  const dir = tempDir(t)
  const fakeGrok = path.join(dir, 'grok')
  fs.writeFileSync(fakeGrok, '#!/bin/sh\necho "grok 1.0.52 (test) [stable]"\n')
  fs.chmodSync(fakeGrok, 0o755)
  const env = fx.laneEnv(t, {
    quota: agyQuota,
    mutate: (c) => {
      c.harnesses.grok.command = fakeGrok
      c.harnesses.codex.command = '/nowhere/codex'
      c.harnesses.cursor.command = '/nowhere/cursor-agent'
    },
  })
  const logFile = path.join(env.HOME, '.grok', 'logs', 'unified.jsonl')
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  const entry = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'grok-billing.jsonl'), 'utf8').trim().split('\n')[1])
  entry.ts = new Date(Date.now() - ageMinutes * 60000).toISOString()
  entry.ctx.config.currentPeriod.end = new Date(Date.now() + endHours * 3600000).toISOString()
  if (percent !== null) entry.ctx.config.creditUsagePercent = percent
  fs.writeFileSync(logFile, `${JSON.stringify(entry)}\n`)
  return { env, dir, fakeGrok, logFile }
}

test("quota, with no run, gives each group's windows, reset, hours left, priority, usability and source, as JSON", (t) => {
  const { env, dir, fakeGrok, logFile } = quotaEnv(t, { agyQuota: { 'Gemini Models': [0.9, 0.04], 'Claude and GPT models': [0.5, 0.8] } })
  const r = runBin(fx.LANE_BIN, ['quota', 'grok', 'agy', '--json'], dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(Object.keys(r.json.harnesses), ['grok', 'agy'])
  assert.equal(r.json.reserve, 0.05)
  const grok = r.json.harnesses.grok
  assert.deepEqual([grok.installed, grok.path, grok.version, grok.refreshed], [true, fakeGrok, 'grok 1.0.52 (test) [stable]', undefined])
  const group = grok.groups.grok
  assert.deepEqual([group.label, group.unknown, group.usable], ['Grok plan', false, true])
  const weekly = group.windows.weekly
  assert.equal(weekly.remaining, 0.7)
  assert.ok(Math.abs(weekly.hoursLeft - 50) <= 0.1, String(weekly.hoursLeft))
  assert.ok(Math.abs(weekly.priority - 0.7 / 50) < 0.0001, String(weekly.priority))
  assert.equal(group.priority, weekly.priority)
  assert.match(weekly.resetsLocal, /^\d{4}-\d\d-\d\d \d\d:\d\d UTC[+-]\d+/)
  assert.deepEqual([group.source.log, group.source.ageMinutes, group.source.stale, group.source.usedPercent, group.source.usedPercentAbsent], [logFile, 5, false, 30, false])
  // agy's groups come from its /usage, read now; a weekly window under the reserve makes its group unusable.
  const agy = r.json.harnesses.agy
  assert.deepEqual([agy.groups.argon.usable, agy.groups.flash.usable, agy.groups.claude.usable], [false, false, true])
  assert.deepEqual(agy.groups.claude.windows['5h'].remaining, 0.5)
  assert.deepEqual([agy.groups.claude.source.command, agy.groups.claude.source.ageMinutes, agy.groups.claude.source.stale], [fx.FAKE_AGY, 0, false])
  // With no harness named, it lists the installed harnesses of the table.
  const all = runBin(fx.LANE_BIN, ['quota', '--json'], dir, env)
  assert.deepEqual(Object.keys(all.json.harnesses), ['agy', 'grok'])
  const named = runBin(fx.LANE_BIN, ['quota', 'codex', 'nope', '--json'], dir, env)
  assert.deepEqual(named.json.harnesses, {
    codex: { command: '/nowhere/codex', path: null, installed: false, version: null, groups: {} },
    nope: { error: 'the lane table has no nope harness', groups: {} },
  })
  assert.deepEqual(runBin(fx.LANE_BIN, ['quota', '--now'], dir, env).json, { error: 'usage: aether-lane quota [<harness>...] [--refresh] [--json]' })
})

test('quota prints the same for people, and marks a grok reading older than 30 minutes stale, keeping its values', (t) => {
  const { env, dir, logFile } = quotaEnv(t, { ageMinutes: 45, percent: null })
  const r = runBin(fx.LANE_BIN, ['quota', 'grok', 'agy'], dir, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const text = r.stdout
  assert.match(text, /^Lane quota at \d{4}-\d\d-\d\d \d\d:\d\d UTC \(\d{4}-\d\d-\d\d \d\d:\d\d UTC[+-]\d+[^)]*\); reserve 5%\n/)
  assert.match(text, /\n {2}grok, "Grok plan": usable, priority 0\.0\d+\n/)
  assert.match(text, /\n {4}weekly: 100% left, resets \d{4}-\d\d-\d\d \d\d:\d\d UTC \(\d{4}-[^)]+ UTC[+-]\d+[^)]*\), in (49\.9|50) h, priority 0\.02(00\d+)?\n/)
  assert.ok(text.includes(`source: grok's log ${logFile}, line of `), text)
  assert.ok(text.includes('(pid 531322, grok 1.0.41), 45 min old (stale: --refresh takes a new one); the line has no creditUsagePercent, read as 0% used'), text)
  assert.match(text, /\n {2}argon, "Gemini Models": usable, priority [\d.]+\n {4}weekly: 90% left, /)
  assert.match(text, /\n {2}flash, "Gemini Models": usable, priority [\d.]+\n {4}weekly: 90% left, /)
  assert.ok(text.includes(`source: ${fx.FAKE_AGY}, read now`), text)

  // A reading of a period that has ended is no reading: grok is unknown, and --refresh is named as the way to one.
  const ended = quotaEnv(t, { endHours: -1 })
  const unknown = runBin(fx.LANE_BIN, ['quota', 'grok'], ended.dir, ended.env)
  assert.ok(unknown.stdout.includes(`grok, "Grok plan": unknown, used until a call fails for quota (no reading; --refresh asks grok for one)`), unknown.stdout)
})
