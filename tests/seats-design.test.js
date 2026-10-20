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

const FEATURE = 'specs/001-demo'
const DAY = 86400000
// What the fake agy's /usage reports so that Gemini's weekly window resets before the Claude and GPT one: Argon takes
// the Writer and the Judge, as it does when the quota that renews first is Gemini's.
const geminiFirst = () => ({
  'Gemini Models': [0.9, 0.9, null, new Date(Date.now() + 2 * DAY).toISOString()],
  'Claude and GPT models': [0.9, 0.9, null, new Date(Date.now() + 3 * DAY).toISOString()],
})
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
  const without = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], laneEnv(t), `Review.\nFAKE-AGY: answer ${JSON.stringify({ verdict: 'revise', findings: [finding], openQuestions: [] })}\n`)
  assert.equal(without.status, 4, without.stdout)
  assert.equal(without.json.detail, 'invalid answer: missing findings[0].type')
  const typed = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], laneEnv(t), `Review.\nFAKE-AGY: answer ${JSON.stringify({ verdict: 'revise', findings: [{ ...finding, type: 'extra' }], openQuestions: [] })}\n`)
  assert.equal(typed.status, 0, typed.stdout)
  assert.ok(typed.json.answer.includes('1. [major] [extra] Extra — `R3` — drop it'), typed.json.answer)
  assert.deepEqual(schemas.JUDGE_SCHEMA.properties.findings.items.properties.type.enum, ['missing', 'extra', 'wrong'])
  assert.ok(schemas.JUDGE_SCHEMA.properties.findings.items.required.includes('type'))
  assert.deepEqual(schemas.SPEC_WRITER_SCHEMA.required, ['spec', 'commit', 'clarify', 'assumptions', 'questions'])
  assert.deepEqual(schemas.REVISION_SCHEMA.required, ['document', 'commit', 'assumptions', 'questions'])
  assert.ok('disagreements' in schemas.REVISION_SCHEMA.properties)
  assert.ok(!schemas.WRITER_SCHEMA.required.includes('complexity'))
  assert.ok('complexity' in schemas.WRITER_SCHEMA.properties && 'disagreements' in schemas.WRITER_SCHEMA.properties)
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
  const env = { ...laneEnv(t, { mutate: (config) => { config.harnesses.muse.command = FAKE_MUSE } }), AETHER_SUPERDELEGATION: 'on', AETHER_LANE_HARNESSES: 'muse', AETHER_FAKE_MUSE_SCRIPT: JSON.stringify({ stdout }) }
  const r = seat(repo.dir, ['judge', '--session', 's1', '--feature', FEATURE], env, 'Review it.')
  assert.equal(r.status, 0, r.stdout)
  assert.equal(r.json.harness, 'muse')
  const call = lanes.readLog(env.AETHER_DATA_DIR).find((entry) => entry.kind === 'call' && entry.harness === 'muse')
  assert.ok(Math.abs(call.quotaAfter.windows.weekly.remaining - 0.6) < 1e-9, JSON.stringify(call.quotaAfter))
})
