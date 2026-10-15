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
const fine = { windows: { '5h': { remaining: 0.9, resetsAt: 'a' }, weekly: { remaining: 0.9, resetsAt: 'b' } } }
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
  for (const name of ['AETHER_SEATS', 'AETHER_LANE_HARNESSES', 'AETHER_LANES', 'CLAUDE_ENV_FILE']) delete base[name]
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

test('the native Writer starts at high and the external one keeps xhigh (R11)', (t) => {
  assert.equal(seats.NATIVE.writer.effort, 'high')
  assert.deepEqual(seats.EXTERNAL_EFFORT, { judge: 'high', writer: 'xhigh', examiner: 'high' })
  const chosen = seats.chooseSeat(lanes.loadConfig(lanes.CONFIG_FILE), { choice: 'robust', seat: 'writer', enabled: ['agy'], installed: () => true, quota: () => fine })
  assert.equal(chosen.external.effort, 'xhigh')
  assert.equal(chosen.external.level, 'high')
  const repo = seatRepo(t)
  const r = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE], laneEnv(t), 'x')
  assert.equal(r.status, 3)
  assert.equal(r.json.native.effort, 'high', 'the native Writer a seat falls back to starts at high')
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
  const env = { ...laneEnv(t), AETHER_SEATS: 'robust' }
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
  const env = { ...laneEnv(t), AETHER_SEATS: 'robust' }
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
