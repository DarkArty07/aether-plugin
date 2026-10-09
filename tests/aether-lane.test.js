'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const lanes = require('../plugins/aether/lib/lanes.js')
const schemas = require('../plugins/aether/lib/lane-schemas.js')
const { buildPrompt, LANE_NOTES } = require('../plugins/aether/lib/lane-calls.js')
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

test("the bin's role schemas are the workflow's, and the Designer's is fixed", () => {
  const source = fs.readFileSync(path.join(PLUGIN, 'workflows', 'run.workflow.js'), 'utf8')
  const block = source.slice(source.indexOf('const FINDINGS = {'), source.indexOf('const OPS_SCHEMA = {'))
  const workflow = new Function(`${block}; return { IMPLEMENTER_SCHEMA, SUPERVISOR_SCHEMA, REVIEW_SCHEMA }`)()
  assert.deepEqual(schemas.IMPLEMENTER_SCHEMA, workflow.IMPLEMENTER_SCHEMA)
  assert.deepEqual(schemas.SUPERVISOR_SCHEMA, workflow.SUPERVISOR_SCHEMA)
  assert.deepEqual(schemas.REVIEW_SCHEMA, workflow.REVIEW_SCHEMA)
  assert.deepEqual(schemas.DESIGNER_SCHEMA.required, ['forOwner', 'stage', 'waitingFor', 'files'])
  assert.deepEqual(schemas.DESIGNER_SCHEMA.properties.stage.enum, ['approaches', 'design', 'spec', 'plan', 'question', 'blocked'])
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
})

test("status reads each group's windows, marks a group under the reserve unusable, and logs the reading", (t) => {
  const env = fx.laneEnv(t, { quota: { 'Gemini Models': [0.04, 0.9], 'Claude and GPT models': [0.9, 0.9] } })
  const { args } = fx.laneRun(t)
  const r = fx.lane(args, 'status', [], env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const agy = r.json.harnesses.agy
  assert.deepEqual([agy.installed, agy.version, agy.groups.gemini.usable, agy.groups.claude.usable], [true, '1.3.2', false, true])
  assert.deepEqual(agy.groups.claude.windows['5h'], { remaining: 0.9, resetsAt: '2026-10-09T05:53:31Z' })
  const readings = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'reading')
  assert.equal(readings.length, 1)
  assert.deepEqual([readings[0].run, readings[0].version, Object.keys(readings[0].groups).sort()], [args.runId, '1.3.2', ['claude', 'gemini']])
  const missing = fx.lane(args, 'status', [], fx.laneEnv(t, { command: '/nowhere/agy' }))
  assert.deepEqual(missing.json, { harnesses: { agy: { installed: false, version: null, groups: {} } } })
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
  assert.ok(turn.argv[1].endsWith(message))

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
  const quota = implement(t, ['FAKE-AGY: write src/t1/partial.js half', `FAKE-AGY: write-abs ${env.FAKE_AGY_QUOTA_FILE} ${low}`, 'FAKE-AGY: exit-error'], { env })
  assert.deepEqual([quota.done.status, quota.done.result], ['quota', null])
  assert.match(quota.done.detail, /^exit 1: model not found/)
  assert.match(fx.git(unitDir(quota.args), 'status', '--porcelain', '--untracked-files=all'), /src\/t1\/partial\.js/)

  const failed = implement(t, ['FAKE-AGY: write src/t1/half.js half', 'FAKE-AGY: timeout'])
  assert.equal(failed.done.status, 'failed')
  assert.match(failed.done.detail, /^stderr: \[agy\] print timeout/)
  assert.match(fx.git(unitDir(failed.args), 'status', '--porcelain', '--untracked-files=all'), /src\/t1\/half\.js/)
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
  const digest = fx.writePrompt(args, IMPLEMENT, `FAKE-AGY: sleep 60\nFAKE-AGY: answer ${DONE}`)
  fx.lane(args, 'start', [IMPLEMENT, ...flags(digest)], env)
  const dir = path.join(args.runDir, 'lanes', IMPLEMENT)
  const runner = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'))
  const deadline = Date.now() + 15000
  while (!fs.existsSync(path.join(dir, 'agy.pid')) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  const agy = Number(fs.readFileSync(path.join(dir, 'agy.pid'), 'utf8'))
  assert.deepEqual(fx.lane(args, 'stop', [IMPLEMENT], env).json, { stopped: [IMPLEMENT] })
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.deepEqual([fx.alive(runner), fx.alive(agy)], [false, false])
  assert.deepEqual(fx.lane(args, 'wait', [IMPLEMENT, '--max', '1'], env).json, { done: false })
  assert.deepEqual(fx.lane(args, 'stop', [IMPLEMENT], env).json, { stopped: [] })
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
