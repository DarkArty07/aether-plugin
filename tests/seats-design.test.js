'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo } = require('./helpers.js')
const { LANE_BIN, laneEnv, agyTurns, argAfter } = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const seats = require('../plugins/aether/lib/seats.js')
const schemas = require('../plugins/aether/lib/lane-schemas.js')
const { loadPairs } = require('../plugins/aether/lib/pairs.js')

const FEATURE = 'specs/001-demo'
const DAY = 86400000
// What the fake agy's /usage reports so that Gemini's weekly window resets before the Claude and GPT one: Argon takes
// the Writer. Argon is 50.4, below the Judge's floor (Opus high 51.7, at least 50.7), so a Judge round on the
// shipped table is the native agent unless the test grants the judge role to claude-opus-5-5.
const geminiFirst = () => ({
  'Gemini Models': [0.9, 0.9, null, new Date(Date.now() + 2 * DAY).toISOString()],
  'Claude and GPT models': [0.9, 0.9, null, new Date(Date.now() + 3 * DAY).toISOString()],
})
const grantOpusSeats = (cfg) => {
  if (cfg?.harnesses?.agy?.models?.['claude-opus-5-5']?.roles) {
    cfg.harnesses.agy.models['claude-opus-5-5'].roles.push('judge', 'examiner')
  }
}
const SPEC_ANSWER = { spec: `${FEATURE}/spec.md`, commit: 'abc123', clarify: ['[NEEDS CLARIFICATION: which store?]'], assumptions: ['A1'], proposals: [], questions: [] }

function seatRepo(t) {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, FEATURE), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, FEATURE, 'spec.md'), '# Demo\n')
  fs.writeFileSync(path.join(repo.dir, FEATURE, 'plan.md'), '# Plan\n')
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'docs')
  return repo
}

function seat(cwd, args, env, input = '') {
  const base = { ...process.env }
  for (const name of ['AETHER_SUPERDELEGATION', 'AETHER_LANE_HARNESSES', 'CLAUDE_ENV_FILE']) delete base[name]
  const r = spawnSync(process.execPath, [LANE_BIN, 'seat', ...args], { cwd, input, encoding: 'utf8', env: { ...base, ...env } })
  let json = null
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    json = null
  }
  return { status: r.status, json, stdout: r.stdout }
}

// What the fake Writer does in its worktree: copy a new spec, optionally more, commit, answer.
function specInput(t, { extra = '', answer = SPEC_ANSWER } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-spec-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const spec = path.join(dir, 'spec.md')
  fs.writeFileSync(spec, '# Demo\n\n## Requirements\n\n- R1. It works. Serves: C1.\n')
  return [`Write the spec of ${FEATURE}.`, `FAKE-AGY: copy ${spec} ${FEATURE}/spec.md`, extra, 'FAKE-AGY: commit the spec', `FAKE-AGY: answer ${JSON.stringify(answer)}`, ''].join('\n')
}

test('the Writer asks Sonnet high, and an external Writer runs at the effort of its pair (R11)', (t) => {
  assert.equal(seats.NATIVE.writer.effort, 'high')
  assert.deepEqual(seats.REFERENCE.writer, { model: 'sonnet', effort: 'high' })
  const repo = seatRepo(t)
  const r = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE], { ...laneEnv(t), AETHER_SUPERDELEGATION: 'off' }, 'x')
  assert.equal(r.status, 3)
  assert.equal(r.json.native.effort, 'high', 'the native Writer a seat falls back to starts at high')
  const env = laneEnv(t, { quota: geminiFirst() })
  const spec = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec'], env, 'Write.\nFAKE-AGY: exit-error boom\n')
  assert.equal(spec.status, 4, spec.stdout)
  assert.equal(spec.json.model, 'gemini-4-argon')
  const [turn] = agyTurns(env)
  assert.equal(argAfter(turn.argv, '--model'), 'gemini-4-argon-high', 'the effort of the pair, high, and no translated xhigh')
  const [entry] = lanes.readLog(env.AETHER_DATA_DIR).filter((e) => e.kind === 'call')
  assert.equal(entry.effort, 'high')
  assert.equal(entry.reference.id, 'claude/sonnet@high')
})

test('--doc and --id are checked', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t)
  const bad = [
    [['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'x'], /--doc must be spec or plan, not x/],
    [['judge', '--session', 's1', '--feature', FEATURE, '--doc', 'spec'], /--doc applies to the writer only/],
    [['judge', '--session', 's1', '--id', 'writer-20261015-120000-ab12'], /--id must be judge-YYYYMMDD-HHMMSS-xxxx/],
    [['judge', '--session', 's1', '--id', 'judge-1'], /--id must be judge-YYYYMMDD-HHMMSS-xxxx/],
  ]
  for (const [args, pattern] of bad) {
    const r = seat(repo.dir, args, env, 'x')
    assert.equal(r.status, 1, args.join(' '))
    assert.match(r.json.error, pattern)
  }
})

test('a Writer round with --doc spec writes spec.md only, commits it in the checkout without aether-plan, and names its round by --id', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t, { quota: geminiFirst() })
  const id = 'writer-20261015-120000-ab12'
  const r = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--id', id], env, specInput(t))
  assert.equal(r.status, 0, r.stdout)
  const head = repo.git('rev-parse', 'HEAD')
  assert.equal(r.json.id, id)
  assert.equal(r.json.result.commit, head)
  assert.equal(repo.git('log', '-1', '--format=%s'), 'docs(specs): spec of 001-demo, by agy/gemini-4-argon')
  assert.equal(repo.git('show', '--name-only', '--format=', 'HEAD'), `${FEATURE}/spec.md`)
  assert.ok(r.json.answer.startsWith(`## Spec\n- Spec: ${FEATURE}/spec.md\n- Commit: ${head}\n## Clarify\n- [NEEDS CLARIFICATION: which store?]\n## Assumptions\n- A1\n## Open questions\n- none\n- Lane: agy gemini-4-argon-high`), r.json.answer)
  const turn = agyTurns(env)[0]
  assert.ok(turn.cwd.includes(`${path.sep}seats${path.sep}${id}${path.sep}`), turn.cwd)
  const prompt = argAfter(turn.argv, '-p')
  assert.ok(prompt.includes('## The skill aether:specify'))
  assert.ok(!prompt.includes('## The skill aether:plan'))
})

test('a Writer round for the spec that changes the plan is undone, and its work is kept in a ref', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t, { quota: geminiFirst() })
  const before = repo.git('rev-parse', 'HEAD')
  const r = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec'], env, specInput(t, { extra: `FAKE-AGY: write ${FEATURE}/plan.md changed` }))
  assert.equal(r.status, 4, r.stdout)
  assert.equal(r.json.failed, 'violation')
  assert.deepEqual(r.json.files, [`${FEATURE}/plan.md`])
  assert.equal(r.json.native.effort, 'high')
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('the Judge answer needs a type for each finding, and its text shows it (R9)', (t) => {
  const repo = seatRepo(t)
  const finding = { severity: 'major', title: 'Extra', evidence: '`R3`', fix: 'drop it' }
  const without = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], laneEnv(t, { mutate: grantOpusSeats }), `Review.\nFAKE-AGY: answer ${JSON.stringify({ verdict: 'revise', findings: [finding], openQuestions: [] })}\n`)
  assert.equal(without.status, 4, without.stdout)
  assert.equal(without.json.detail, 'invalid answer: missing findings[0].type')
  const typed = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], laneEnv(t, { mutate: grantOpusSeats }), `Review.\nFAKE-AGY: answer ${JSON.stringify({ verdict: 'revise', findings: [{ ...finding, type: 'extra' }], openQuestions: [] })}\n`)
  assert.equal(typed.status, 0, typed.stdout)
  assert.ok(typed.json.answer.includes('1. [major] [extra] Extra — `R3` — drop it'), typed.json.answer)
  assert.ok(typed.json.answer.includes('- Lane: agy claude-opus-5-5-high'), typed.json.answer)
  assert.deepEqual(schemas.JUDGE_SCHEMA.properties.findings.items.properties.type.enum, ['missing', 'extra', 'wrong'])
  assert.ok(schemas.JUDGE_SCHEMA.properties.findings.items.required.includes('type'))
  assert.deepEqual(schemas.SPEC_WRITER_SCHEMA.required, ['spec', 'commit', 'clarify', 'assumptions', 'questions'])
  assert.deepEqual(schemas.REVISION_SCHEMA.required, ['document', 'commit', 'assumptions', 'questions'])
  assert.ok('disagreements' in schemas.REVISION_SCHEMA.properties)
  assert.ok(!schemas.WRITER_SCHEMA.required.includes('complexity'))
  assert.ok('complexity' in schemas.WRITER_SCHEMA.properties && 'disagreements' in schemas.WRITER_SCHEMA.properties)
})

test('a Judge round on the shipped agy table finds no external pair at Opus high', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t)
  const finding = { severity: 'major', type: 'extra', title: 'Extra', evidence: '`R3`', fix: 'drop it' }
  const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], env, `Review.\nFAKE-AGY: answer ${JSON.stringify({ verdict: 'revise', findings: [finding], openQuestions: [] })}\n`)
  assert.equal(r.status, 3, r.stdout)
  assert.equal(r.json.unavailable, 'no-external')
  assert.equal(r.json.native.agent, 'aether:judge')
  assert.equal(r.json.native.intelligence, 51.7)
  assert.equal(agyTurns(env).length, 0)
})

test('C16: a Muse round reads the quota after it parses the output, so the allowance of that very round is the quota after it', (t) => {
  const FAKE_MUSE = path.join(__dirname, 'fixtures', 'fake-muse.js')
  fs.chmodSync(FAKE_MUSE, 0o755)
  const repo = seatRepo(t)
  const now = Date.now()
  const record = (type, payload) => JSON.stringify({ schema_version: 1, id: type, stream: { kind: 'session', id: 's1' }, sequence: 1, recorded_at: 1, record_type: 'event', durability: 'durable', causation_id: 'c1', payload_type: type, payload_schema_version: 1, payload })
  const answer = JSON.stringify({ verdict: 'approve', findings: [], openQuestions: [] })
  const allowance = { tier: 'power', window: { usedPercent: 72, resetsAtMs: now + 3 * 3600000, windowDurationMins: 300 }, weekly: { usedPercent: 40, resetsAtMs: now + 5 * 86400000 } }
  const stdout = `${[
    record('run.terminal.completed', { kind: 'run_terminal', terminal: 'completed', reason: null, text: answer }),
    record('run.usage', { kind: 'run_usage', allowance, calls: 1, completed_calls: 1, failed_calls: 0, cancelled_calls: 0, children_included: false, models: [{ model: 'muse-wonder-full-1.0', calls: 1, input_tokens: 10, output_tokens: 2, cached_tokens: 0, reasoning_tokens: 0 }] }),
  ].join('\n')}\n`
  const env = { ...laneEnv(t, { mutate: (config) => { config.harnesses.muse.command = FAKE_MUSE; config.harnesses.muse.models['muse-wonder-full-1.0'].roles.push('judge') } }), AETHER_SUPERDELEGATION: 'on', AETHER_LANE_HARNESSES: 'muse', AETHER_FAKE_MUSE_SCRIPT: JSON.stringify({ stdout }) }
  const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], env, 'Review it.')
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.harness, 'muse')
  const call = lanes.readLog(env.AETHER_DATA_DIR).find((entry) => entry.kind === 'call' && entry.harness === 'muse')
  assert.ok(Math.abs(call.quotaAfter.windows.weekly.remaining - 0.6) < 1e-9, JSON.stringify(call.quotaAfter))
})

// Argon is below the Judge's floor and Opus lists no judge role, so neither takes a round on the shipped table.
// An exclusion is still recorded on the pair the test names.
const ARGON = 'agy/gemini-4-argon@high'
const OPUS_PAIR = 'agy/claude-opus-5-5@high'
const { pairs: PAIR_TABLE } = loadPairs()
const openIn = (days) => ({ usable: true, unknown: false, mark: null, resetsAt: new Date(Date.UTC(2026, 9, 20) + days * DAY).toISOString() })
const seatConfig = lanes.loadConfig(lanes.CONFIG_FILE)
const chooseExcluded = (seat, more = {}) => seats.chooseSeat({
  config: seatConfig,
  pairs: PAIR_TABLE,
  seat,
  harnesses: { agy: { installed: true, groups: { gemini: openIn(2), claude: openIn(3) } } },
  ...more,
})
const JUDGE_REPLY = { verdict: 'revise', findings: [{ severity: 'major', type: 'missing', title: 'Task 3 is too large', evidence: '`Owns: src/**`', fix: 'split it' }], openQuestions: [] }
const judgeInput = `Review.\nFAKE-AGY: answer ${JSON.stringify(JUDGE_REPLY)}\n`
const whyOf = (chosen, id) => chosen.tried.find((entry) => entry.id === id)

test('--exclude reaches the choice and the next pair of the rule takes the seat', (t) => {
  const chosen = chooseExcluded('judge', { exclude: [ARGON] })
  assert.equal(chosen.external, undefined)
  assert.equal(chosen.native.agent, 'aether:judge')
  assert.equal(chosen.native.model, 'opus')
  assert.deepEqual(whyOf(chosen, ARGON), { id: ARGON, outcome: 'passed', why: 'excluded' })
  const repo = seatRepo(t)
  const env = laneEnv(t, { quota: geminiFirst() })
  const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE, '--exclude', ARGON], env, judgeInput)
  assert.equal(r.status, 3, r.stdout)
  assert.equal(r.json.unavailable, 'no-external')
  assert.equal(r.json.native.agent, 'aether:judge')
  assert.equal(r.json.native.model, 'opus')
  assert.deepEqual(agyTurns(env), [])
})

test('excluding every pair that can take the round hands it to the native agent', (t) => {
  const chosen = chooseExcluded('judge', { exclude: [ARGON, OPUS_PAIR] })
  assert.equal(chosen.external, undefined)
  assert.equal(chosen.native.agent, 'aether:judge')
  assert.equal(chosen.native.model, 'opus')
  assert.equal(whyOf(chosen, ARGON).why, 'excluded')
  assert.equal(whyOf(chosen, OPUS_PAIR).why, 'excluded')
  const repo = seatRepo(t)
  const env = laneEnv(t, { quota: geminiFirst() })
  const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE, '--exclude', `${ARGON},${OPUS_PAIR}`], env, judgeInput)
  assert.equal(r.status, 3, r.stdout)
  assert.equal(r.json.unavailable, 'no-external')
  assert.equal(r.json.native.agent, 'aether:judge')
  assert.equal(r.json.native.model, 'opus')
  assert.equal(r.json.tried.find((entry) => entry.id === ARGON).why, 'excluded')
  assert.equal(r.json.tried.find((entry) => entry.id === OPUS_PAIR).why, 'excluded')
  assert.deepEqual(agyTurns(env), [])
})

test('a malformed --exclude is a usage error', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t)
  for (const value of ['agy/x', 'agy/gemini-4-argon', `${ARGON},nope`]) {
    const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE, '--exclude', value], env, 'Review.\n')
    assert.equal(r.status, 1, value)
    assert.match(r.json.error, /--exclude must be pair ids like agy\/model@effort/, value)
  }
})

test('the author rule holds together with an exclusion', (t) => {
  for (const seatName of ['judge', 'examiner']) {
    const chosen = chooseExcluded(seatName, { author: 'opus', exclude: [ARGON] })
    assert.equal(chosen.external, undefined, seatName)
    assert.equal(chosen.native.agent, `aether:${seatName}`, seatName)
    assert.notEqual(chosen.decision.native.model, 'opus', seatName)
    assert.equal(chosen.decision.native.model, 'sonnet', seatName)
    assert.equal(whyOf(chosen, ARGON).why, 'excluded', seatName)
  }
  const repo = seatRepo(t)
  const env = laneEnv(t, { quota: geminiFirst() })
  const r = seat(repo.dir, ['judge', '--session', 's1', '--author', 'opus', '--feature', FEATURE, '--exclude', ARGON], env, judgeInput)
  assert.equal(r.status, 3, r.stdout)
  assert.equal(r.json.unavailable, 'no-external')
  assert.equal(r.json.native.agent, 'aether:judge')
  assert.equal(r.json.native.model, 'sonnet')
  assert.deepEqual(agyTurns(env), [])
})
