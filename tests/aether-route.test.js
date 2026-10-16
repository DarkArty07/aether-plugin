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
    fs.writeFileSync(path.join(dataDir, 'router', 'external', `${id}.json`), JSON.stringify({ id, session: 's1', harness: 'agy', rung: { model: 'gemini-3.8-flash', effort: 'medium', group: 'gemini' }, task: { description: 'audit', prompt }, fallback: { model: 'haiku', effort: 'high' }, timeoutMs: 1320000 }))
  }
  const env = { ...lane }
  external('r1', 'Audit it.\nFAKE-AGY: answer {"answer": "found it"}')
  const ok = runBin(BIN, ['delegate', '--id', 'r1', '--session', 's1'], repo.dir, env)
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(ok.json.ok, true)
  assert.equal(ok.json.status, 'ok')
  assert.equal(ok.json.text, 'found it')
  external('r2', 'Audit it.\nFAKE-AGY: exit-error model not found')
  const bad = runBin(BIN, ['delegate', '--id', 'r2', '--session', 's1'], repo.dir, env)
  assert.equal(bad.status, 0)
  assert.equal(bad.json.ok, false)
  assert.equal(bad.json.status, 'failed')
  assert.equal(bad.json.marked, null, 'a failure that is not the explicit refusal leaves no mark')
  assert.deepEqual(marks.readAllMarks(dataDir), [])
  const missing = runBin(BIN, ['delegate', '--id', 'nope', '--session', 's1'], repo.dir, env)
  assert.deepEqual(missing.json, { ok: false, status: 'unavailable' })
  const outcomes = log.readJournal(dataDir).filter((e) => e.kind === 'outcome')
  assert.deepEqual(outcomes.map((e) => [e.id, e.status, e.harness]), [['r1', 'ok', 'agy'], ['r2', 'failed', 'agy']])
  assert.equal(outcomes[0].model, 'gemini-3.8-flash-medium')
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
  fs.writeFileSync(file, JSON.stringify({ harness: 'agy', readAt: now, groups: { gemini: { windows: { '5h': win(0.98, 5), weekly: win(0.98, 60) } }, claude: { windows: { weekly: win(0.9, 40) } } } }))
  const env = { ...lane }
  const decide = (name) => {
    const input = path.join(repo.dir, `${name}.json`)
    fs.writeFileSync(input, JSON.stringify(event()))
    const began = runBin(BIN, ['begin', '--session', 's1', '--input', input], repo.dir, env)
    const answer = path.join(repo.dir, `${name}.txt`)
    fs.writeFileSync(answer, JSON.stringify(answers()))
    return runBin(BIN, ['finish', '--id', began.json.id, '--answer-file', answer], repo.dir, env)
  }
  const before = decide('one')
  assert.equal(before.status, 0, before.stderr)
  assert.equal(before.json.external.harness, 'agy', 'the reading says 98 %: the group is a candidate')
  assert.equal(before.json.external.group, 'gemini')

  const stored = path.join(dataDir, 'router', 'external', `${before.json.external.id}.json`)
  const external = JSON.parse(fs.readFileSync(stored, 'utf8'))
  external.task.prompt = 'Audit it.\nFAKE-AGY: exit-error Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.'
  fs.writeFileSync(stored, JSON.stringify(external))
  const ran = runBin(BIN, ['delegate', '--id', external.id, '--session', 's1'], repo.dir, env)
  assert.equal(ran.status, 0, ran.stderr)
  assert.equal(ran.json.ok, false, 'the mod then runs the same delegate in Claude (R26)')
  assert.ok(Math.abs(ran.json.marked - (Date.now() + 588147000)) < 60000, 'the mark holds until the reset the refusal states')
  assert.equal(log.readJournal(dataDir).find((e) => e.kind === 'outcome').markedUntil, ran.json.marked)
  assert.equal(fs.existsSync(path.join(dataDir, 'lanes', 'marks')), false, 'the swarm store is not written')

  const after = decide('two')
  assert.equal(after.json.external, null, 'nothing goes to the group the refusal marked')
  const second = log.readJournal(dataDir).filter((e) => e.kind === 'decision')[1]
  const g = second.quota.find((c) => c.harness === 'agy' && c.group === 'gemini')
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

test('the executable bit is set and the commands page counts the bins', () => {
  assert.ok(fs.statSync(BIN).mode & 0o111)
  const count = fs.readdirSync(path.join(PLUGIN, 'bin')).length
  assert.equal(count, 10)
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'docs', 'reference', 'components.md'), 'utf8').includes('the ten commands of `bin/`'))
})
