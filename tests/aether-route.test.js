'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, runBin, tempDir } = require('./helpers.js')
const { laneEnv } = require('./lane-fixtures.js')
const session = require('../plugins/aether/lib/session.js')
const log = require('../plugins/aether/lib/router-log.js')
const readings = require('../plugins/aether/lib/lane-readings.js')
const marks = require('../plugins/aether/lib/router-marks.js')
const { EXTERNAL_LIMIT_MS } = require('../plugins/aether/lib/delegate-limits.js')
const quota = require('../plugins/aether/lib/router-quota.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-route')
const answers = (over = {}) => ({
  shape: { choice: 'explore', confidence: 0.95 },
  stakes: { score: 1.1, confidence: 0.95 },
  reads_a_lot: { score: 0.5, confidence: 0.9 },
  pinned_by_checks: { noul: 0.2, confidence: 0.9 },
  needs_judgment: { noul: 0.3, confidence: 0.9 },
  edits_files: { noul: 0.03, confidence: 0.95 },
  many_steps: { noul: 0.1, confidence: 0.9 },
  ...over,
})

function setup(t, settings = {}, extraEnv = {}) {
  const dataDir = tempDir(t, 'aether-route-data-')
  session.markSession(dataDir, 's1', Date.now(), { router: { mode: 'command', decider: 'haiku', fallback: { alias: 'sonnet', effort: 'high' }, deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 }, lanes: false, harnesses: ['agy'], ...settings } })
  const cwd = tempDir(t, 'aether-route-cwd-')
  const env = { AETHER_DATA_DIR: dataDir, OPENROUTER_API_KEY: '', ...extraEnv }
  const input = (event) => {
    const file = path.join(cwd, 'event.json')
    fs.writeFileSync(file, JSON.stringify(event))
    return file
  }
  return { dataDir, cwd, env, input, run: (args) => runBin(BIN, args, cwd, env) }
}
const event = (over = {}) => ({ subagent_type: 'general-purpose', description: 'Audit the API usage', prompt: 'Read src/ and report each call that skips the retry wrapper.', ...over })

test('with no verb, or an unknown one, it prints the usage as an error and exits 1', (t) => {
  const s = setup(t)
  const r = s.run([])
  assert.equal(r.status, 1)
  assert.ok(r.json.error.includes('usage: aether-route'))
  assert.equal(s.run(['frobnicate']).status, 1)
  assert.equal(s.run(['begin']).status, 1)
})

test('begin and finish: the mod asks the model between them, and the plan comes out whole', (t) => {
  const s = setup(t)
  const began = s.run(['begin', '--session', 's1', '--input', s.input(event())])
  assert.equal(began.status, 0, began.stderr)
  assert.equal(began.json.skip, false)
  assert.equal(began.json.ask.model, 'haiku')
  assert.equal(began.json.ask.effort, 'low')
  const answer = path.join(s.cwd, 'answer.txt')
  fs.writeFileSync(answer, JSON.stringify(answers()))
  const done = s.run(['finish', '--id', began.json.id, '--answer-file', answer])
  assert.equal(done.status, 0, done.stderr)
  assert.deepEqual(done.json.args, { model: 'haiku', effort: 'high' })
  assert.equal(done.json.external, null, 'lanes are off in this session')
  assert.equal(log.readJournal(s.dataDir).filter((e) => e.kind === 'decision').length, 1)
  const failed = s.run(['begin', '--session', 's1', '--input', s.input(event())])
  const fell = s.run(['finish', '--id', failed.json.id, '--failure', 'timeout'])
  assert.deepEqual(fell.json.args, { model: 'sonnet', effort: 'high' })
})

test('an aether agent is skipped, and a decider with no key falls back without a question (R9, C10)', (t) => {
  const s = setup(t)
  const skipped = s.run(['begin', '--session', 's1', '--input', s.input(event({ subagent_type: 'aether:judge' }))])
  assert.equal(skipped.json.skip, true)
  const jev = setup(t, { decider: 'jev' })
  const plan = jev.run(['begin', '--session', 's1', '--input', jev.input(event())])
  assert.equal(plan.status, 0)
  assert.deepEqual(plan.json.args, { model: 'sonnet', effort: 'high' })
  const [entry] = log.readJournal(jev.dataDir)
  assert.equal(entry.fallback, 'decider: no-key')
})

test('in record mode begin leaves the decision for the background, and decide makes it (R7)', (t) => {
  const s = setup(t, { mode: 'record', decider: 'jev' })
  const began = s.run(['begin', '--session', 's1', '--input', s.input(event())])
  assert.equal(began.status, 0, began.stderr)
  assert.equal(began.json.background, true)
  assert.equal(began.json.decide, true)
  assert.equal(log.readJournal(s.dataDir).length, 0)
  const done = s.run(['decide', '--id', began.json.id])
  assert.equal(done.status, 0, done.stderr)
  assert.equal(done.json.args, null, 'record never rewrites the call')
  const [entry] = log.readJournal(s.dataDir)
  assert.equal(entry.fallback, 'decider: no-key')
  assert.equal(entry.background, true)
})

test('delegate runs a read-only delegate on the external harness and records its outcome (R18)', (t) => {
  const lane = laneEnv(t)
  const repo = makeRepo(t)
  const dataDir = lane.AETHER_DATA_DIR
  const external = (id, prompt) => {
    fs.mkdirSync(path.join(dataDir, 'router', 'external'), { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'router', 'external', `${id}.json`), JSON.stringify({ id, session: 's1', harness: 'agy', rung: { model: 'gemini-3.8-flash', effort: 'medium', group: 'flash' }, task: { description: 'audit', prompt }, fallback: { model: 'haiku', effort: 'high' }, timeoutMs: EXTERNAL_LIMIT_MS }))
  }
  const env = { ...lane }
  external('r1', 'Audit it.\nFAKE-AGY: answer {"answer": "found it"}')
  const ok = runBin(BIN, ['delegate', '--id', 'r1', '--session', 's1'], repo.dir, env)
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(ok.json.ok, true)
  assert.equal(ok.json.status, 'ok')
  assert.equal(ok.json.text, 'found it')
  assert.match(ok.json.attribution, /^Aether router: this answer is from gemini-3\.8-flash at medium on agy, run in a disposable copy of the checkout\./)
  assert.match(ok.json.attribution, /no tool uses or tokens/)
  external('r2', 'Audit it.\nFAKE-AGY: exit-error model not found')
  const bad = runBin(BIN, ['delegate', '--id', 'r2', '--session', 's1'], repo.dir, env)
  assert.equal(bad.status, 0)
  assert.equal(bad.json.ok, false)
  assert.equal(bad.json.status, 'failed')
  assert.equal(bad.json.attribution, null, 'a failed delegate has no answer to attribute')
  assert.equal(bad.json.marked, null, 'a failure that is not the explicit refusal leaves no mark')
  assert.deepEqual(marks.readAllMarks(dataDir), [])
  const missing = runBin(BIN, ['delegate', '--id', 'nope', '--session', 's1'], repo.dir, env)
  assert.deepEqual(missing.json, { ok: false, status: 'unavailable' })
  const outcomes = log.readJournal(dataDir).filter((e) => e.kind === 'outcome')
  assert.deepEqual(outcomes.map((e) => [e.id, e.status, e.harness]), [['r1', 'ok', 'agy'], ['r2', 'failed', 'agy']])
  assert.equal(outcomes[0].model, 'gemini-3.8-flash-medium')
  const kept = fs.readdirSync(path.join(dataDir, 'router', 'external'))
  assert.deepEqual(kept, [], 'once the outcome is written the file with the Lead\'s whole prompt is gone, whether the delegate ended ok or not')
})

test('delegate with uncommitted work in the checkout ends dirty: the outcome is written, no mark is left, and the file with the prompt is removed', (t) => {
  const lane = laneEnv(t)
  const repo = makeRepo(t)
  const dataDir = lane.AETHER_DATA_DIR
  fs.writeFileSync(path.join(repo.dir, 'README.md'), 'fixture, edited and not committed\n')
  fs.mkdirSync(path.join(dataDir, 'router', 'external'), { recursive: true })
  const file = path.join(dataDir, 'router', 'external', 'r9.json')
  fs.writeFileSync(file, JSON.stringify({ id: 'r9', session: 's1', harness: 'agy', rung: { model: 'gemini-3.8-flash', effort: 'medium', group: 'flash' }, task: { description: 'audit', prompt: 'Audit it.\nFAKE-AGY: answer {"answer": "x"}' }, fallback: { model: 'haiku', effort: 'high' }, timeoutMs: EXTERNAL_LIMIT_MS }))
  const r = runBin(BIN, ['delegate', '--id', 'r9', '--session', 's1'], repo.dir, { ...lane })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.ok, false, 'the mod then runs the same delegate in Claude')
  assert.equal(r.json.status, 'dirty')
  assert.match(r.json.detail, /uncommitted/)
  assert.equal(r.json.marked, null)
  assert.deepEqual(marks.readAllMarks(dataDir), [])
  const [outcome] = log.readJournal(dataDir).filter((e) => e.kind === 'outcome')
  assert.deepEqual([outcome.id, outcome.status, outcome.harness, outcome.markedUntil], ['r9', 'dirty', 'agy', null])
  assert.match(outcome.detail, /README\.md/)
  assert.equal(fs.existsSync(file), false)
})

test('spawn appends the link between a delegation and the agent that ran it, and rejects a wrong use (R27, R30)', (t) => {
  const s = setup(t)
  const before = Date.now()
  const linked = s.run(['spawn', '--session', 's1', '--id', 'r-mpx1-1f2e', '--agent', 'agent-1'])
  assert.equal(linked.status, 0, linked.stderr)
  assert.deepEqual(linked.json, { spawned: true, id: 'r-mpx1-1f2e', agentId: 'agent-1' })
  const [entry] = log.readJournal(s.dataDir)
  assert.deepEqual(Object.keys(entry), ['kind', 'id', 'time', 'session', 'agentId'])
  assert.equal(entry.kind, 'spawn')
  assert.equal(entry.id, 'r-mpx1-1f2e')
  assert.equal(entry.session, 's1')
  assert.equal(entry.agentId, 'agent-1')
  assert.ok(entry.time >= before && entry.time <= Date.now())
  const bare = s.run(['spawn', '--id', 'r2', '--agent', 'agent-2'])
  assert.equal(bare.status, 0, bare.stderr)
  assert.equal(log.readJournal(s.dataDir)[1].session, null, 'without --session the entry holds null')

  const written = log.readJournal(s.dataDir).length
  const wrong = [
    ['spawn'],
    ['spawn', '--id', 'r3'],
    ['spawn', '--agent', 'agent-3'],
    ['spawn', '--id', 'r3', '--agent'],
    ['spawn', '--id', 'r3', '--agent', ''],
    ['spawn', '--id', '', '--agent', 'agent-3'],
    ['spawn', '--id', '../x', '--agent', 'agent-3'],
    ['spawn', '--id', 'a b', '--agent', 'agent-3'],
    ['spawn', '--id', 'a/b', '--agent', 'agent-3'],
    ['spawn', '--id', 'r3', '--agent', 'agent-3', '--now'],
  ]
  for (const args of wrong) {
    const r = s.run(args)
    assert.equal(r.status, 1, args.join(' '))
    assert.equal(typeof r.json.error, 'string', args.join(' '))
    assert.equal(r.json.spawned, undefined, args.join(' '))
  }
  assert.equal(log.readJournal(s.dataDir).length, written, 'a wrong use writes nothing')

  const blocked = tempDir(t, 'aether-route-blocked-')
  fs.writeFileSync(path.join(blocked, 'router'), 'a file where the log directory should be')
  const lost = runBin(BIN, ['spawn', '--id', 'r4', '--agent', 'agent-4'], s.cwd, { AETHER_DATA_DIR: blocked })
  assert.equal(lost.status, 1, 'an entry that could not be written is not reported as spawned')
  assert.equal(typeof lost.json.error, 'string')
})

test('scenario 20: a refusal the router saw leaves its mark, and the next decision sends nothing to that group (R22, R22b)', (t) => {
  const lane = laneEnv(t)
  const repo = makeRepo(t)
  const dataDir = lane.AETHER_DATA_DIR
  fs.mkdirSync(dataDir, { recursive: true })
  session.markSession(dataDir, 's1', Date.now(), { router: { mode: 'command', decider: 'haiku', fallback: { alias: 'sonnet', effort: 'high' }, deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 }, lanes: true, harnesses: ['agy'] } })
  const now = Date.now()
  const win = (remaining, hours) => ({ remaining, resetsAt: new Date(now + hours * 3600 * 1000).toISOString() })
  const file = readings.cacheFile(dataDir, 'agy')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ harness: 'agy', readAt: now, groups: { flash: { windows: { '5h': win(0.98, 5), weekly: win(0.98, 60) } }, claude: { windows: { weekly: win(0.9, 40) } } } }))
  const env = { ...lane }
  // The input files go outside the repository: a file left in it is uncommitted work, and the delegate would not run.
  const scratch = tempDir(t, 'aether-route-scratch-')
  const decide = (name) => {
    const input = path.join(scratch, `${name}.json`)
    fs.writeFileSync(input, JSON.stringify(event()))
    const began = runBin(BIN, ['begin', '--session', 's1', '--input', input], repo.dir, env)
    const answer = path.join(scratch, `${name}.txt`)
    fs.writeFileSync(answer, JSON.stringify(answers()))
    return runBin(BIN, ['finish', '--id', began.json.id, '--answer-file', answer], repo.dir, env)
  }
  const before = decide('one')
  assert.equal(before.status, 0, before.stderr)
  assert.equal(before.json.external.harness, 'agy', 'the reading says 98 %: the group is a candidate')
  assert.equal(before.json.external.group, 'flash')

  const stored = path.join(dataDir, 'router', 'external', `${before.json.external.id}.json`)
  const external = JSON.parse(fs.readFileSync(stored, 'utf8'))
  external.task.prompt = 'Audit it.\nFAKE-AGY: exit-error Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.'
  fs.writeFileSync(stored, JSON.stringify(external))
  const ran = runBin(BIN, ['delegate', '--id', external.id, '--session', 's1'], repo.dir, env)
  assert.equal(ran.status, 0, ran.stderr)
  assert.equal(ran.json.ok, false, 'the mod then runs the same delegate in Claude (R26)')
  assert.ok(Math.abs(ran.json.marked - (Date.now() + 60 * 60 * 1000)) < 60000, 'the mark holds 60 minutes, not the 163 h the refusal states')
  assert.equal(log.readJournal(dataDir).find((e) => e.kind === 'outcome').markedUntil, ran.json.marked)
  assert.equal(fs.existsSync(path.join(dataDir, 'lanes', 'marks')), false, 'the swarm store is not written')

  const after = decide('two')
  assert.equal(after.json.external, null, 'nothing goes to the group the refusal marked')
  const second = log.readJournal(dataDir).filter((e) => e.kind === 'decision')[1]
  const g = second.quota.find((c) => c.harness === 'agy' && c.group === 'flash')
  assert.equal(g.why, 'mark')
  assert.equal(g.note, 'marca vigente; la lectura con saldo no la desmiente')
})

test('replay --journal shows what a changed criterion would decide again (C11)', (t) => {
  const s = setup(t)
  log.appendEntry(s.dataDir, { kind: 'decision', id: 'a', time: Date.now(), session: 's1', requested: { model: 'opus', effort: null }, asked: { alias: 'opus', effort: 'xhigh', level: 'D' }, answers: answers({ shape: { choice: 'lookup', confidence: 0.95 }, stakes: { score: 0.9, confidence: 0.95 } }), decision: { level: 'A', alias: 'haiku', effort: 'low' }, description: 'find header' })
  const r = s.run(['replay', '--journal'])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.totals.n, 1)
  assert.equal(r.json.rows[0].decision.alias, 'haiku')
})

test('replay with a decider needs --paid, because it spends tokens or sends briefs out', (t) => {
  const s = setup(t)
  const r = s.run(['replay', '--projects', s.cwd, '--decider', 'haiku'])
  assert.equal(r.status, 1)
  assert.ok(r.json.error.includes('--paid is required'))
})

test('replay --timeout is the limit of one claude process: 60 seconds unless told, at most 300, and a bad value is a usage error', (t) => {
  const s = setup(t)
  for (const bad of ['abc', '0', '-5', '301', '', '10s']) {
    const r = s.run(['replay', '--journal', '--timeout', bad])
    assert.equal(r.status, 1, JSON.stringify(bad))
    assert.match(r.json.error, /--timeout/, JSON.stringify(bad))
  }
  assert.equal(s.run(['replay', '--journal', '--timeout']).status, 1, 'the flag needs a value')
  for (const good of ['1', '60', '300', '2.5']) assert.equal(s.run(['replay', '--journal', '--timeout', good]).status, 0, good)
  assert.match(s.run([]).json.error, /\[--timeout <seconds>\]/, 'the usage line lists it')
})

// A claude on PATH that is not the real one, and the only one the bin can find: no model is ever called.
function fakeClaude(t, body) {
  const bin = tempDir(t, 'aether-fake-claude-')
  const file = path.join(bin, 'claude')
  fs.writeFileSync(file, `#!${process.execPath}\nlet stdin = ''\nprocess.stdin.on('data', (chunk) => { stdin += chunk })\nprocess.stdin.on('end', () => { ${body} })\n`)
  fs.chmodSync(file, 0o755)
  return bin
}

function historyOf(t, calls) {
  const root = tempDir(t, 'aether-history-')
  const proj = path.join(root, '-home-u-work')
  fs.mkdirSync(proj, { recursive: true })
  const line = ([id, subagentType, extra]) => JSON.stringify({ type: 'assistant', timestamp: '2026-10-14T10:00:00Z', message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { description: id, subagent_type: subagentType, prompt: `Find where ${id} is defined.`, ...extra } }] } })
  fs.writeFileSync(path.join(proj, 'sess1.jsonl'), calls.map(line).join('\n') + '\n')
  return root
}

test('the paid replay gives each claude process the --timeout it was told, records what the call cost and how long it took, and never asks an aether agent', (t) => {
  const s = setup(t)
  const history = historyOf(t, [['toolu_1', 'general-purpose', { model: 'opus' }], ['toolu_2', 'aether:judge', {}], ['toolu_3', 'Explore', {}]])
  const reply = JSON.stringify({ type: 'result', result: JSON.stringify(answers()), duration_ms: 3840, total_cost_usd: 0.0021 })
  const path1 = fakeClaude(t, `if (!stdin.includes('<brief>')) process.exit(3); process.stdout.write(${JSON.stringify(reply)})`)
  const r = runBin(BIN, ['replay', '--projects', history, '--decider', 'haiku', '--paid', '--timeout', '5'], s.cwd, { ...s.env, PATH: path1 })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.totals.n, 2)
  assert.equal(r.json.totals.skipped, 1)
  assert.equal(r.json.totals.skippedBy['aether-agent'], 1)
  assert.deepEqual(r.json.rows.map((row) => row.id), ['toolu_1', 'toolu_3'])
  assert.deepEqual(r.json.rows[0].call, { durationMs: 3840, costUsd: 0.0021 })
  assert.equal(r.json.totals.call.n, 2)
  assert.equal(r.json.totals.call.medianMs, 3840)
  assert.equal(r.json.totals.call.p90Ms, 3840)
  assert.ok(Math.abs(r.json.totals.call.costUsd - 0.0042) < 1e-9)
  assert.equal(r.json.rows[0].fallback, null)

  const slow = fakeClaude(t, 'setTimeout(() => process.stdout.write("{}"), 4000)')
  const started = Date.now()
  const late = runBin(BIN, ['replay', '--projects', history, '--decider', 'haiku', '--paid', '--timeout', '1'], s.cwd, { ...s.env, PATH: slow })
  assert.equal(late.status, 0, late.stdout + late.stderr)
  assert.ok(Date.now() - started < 3900, 'the process was killed by the limit of 1 second')
  assert.deepEqual(late.json.rows.map((row) => row.fallback), ['decider: timeout', 'decider: timeout'])
})

test('renew saves grok\'s reading where the router reads it, from an ACP answer that leaves no line in grok\'s log (R23)', (t) => {
  const s = setup(t)
  for (const args of [['renew'], ['renew', '--harness'], ['renew', '--harness', 'codex'], ['renew', '--harness', 'grok', '--now']]) {
    const r = s.run(args)
    assert.equal(r.status, 1, args.join(' '))
    assert.equal(typeof r.json.error, 'string', args.join(' '))
  }
  assert.match(s.run(['renew', '--harness', 'grok']).json.error, /no lane table/)

  const fakeGrok = path.join(__dirname, 'fixtures', 'fake-grok-acp.js')
  fs.chmodSync(fakeGrok, 0o755)
  const lane = laneEnv(t, { mutate: (config) => { config.harnesses.grok.command = fakeGrok } })
  const env = { ...lane, AETHER_FAKE_ACP_END_IN_HOURS: '48' }
  const before = Date.now()
  const r = runBin(BIN, ['renew', '--harness', 'grok'], s.cwd, env)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(Object.keys(r.json), ['renewed', 'harness', 'readAt'])
  assert.equal(r.json.renewed, true)
  assert.equal(r.json.harness, 'grok')
  assert.ok(r.json.readAt >= before && r.json.readAt <= Date.now())
  const config = JSON.parse(fs.readFileSync(lane.AETHER_LANES_CONFIG, 'utf8'))
  const got = quota.peekReadings({ dataDir: lane.AETHER_DATA_DIR, config, harnesses: ['grok'], createAdapter: (name, settings) => require('../plugins/aether/lib/harness/grok.js').createGrok({ ...settings, env }) })
  assert.equal(got.grok.readAt, r.json.readAt)
  assert.equal(got.grok.groups.grok.source.method, 'acp')
  assert.deepEqual(quota.staleHarnesses({ readings: got, config, harnesses: ['grok'], now: Date.now() }), [])
})

test('the executable bit is set and the commands page counts the bins', () => {
  assert.ok(fs.statSync(BIN).mode & 0o111)
  const count = fs.readdirSync(path.join(PLUGIN, 'bin')).length
  assert.equal(count, 11)
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'docs', 'reference', 'components.md'), 'utf8').includes('the eleven commands of `bin/`'))
})
