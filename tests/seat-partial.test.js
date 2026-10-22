'use strict'

// Issue 68, design-seat half: a Writer round that fails after writing part of its document hands that
// partial to the next pair, and to the native Writer when no pair is left. The Judge and the Examiner
// keep nothing.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo, tempDir, runBin } = require('./helpers.js')
const { LANE_BIN, FAKE_AGY, laneEnv } = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')

const FEATURE = 'specs/001-demo'
const SPEC = `${FEATURE}/spec.md`
const PLAN = `${FEATURE}/plan.md`
const TASKS = `${FEATURE}/tasks.md`
const ORIGINAL = '# Demo\n\n## Criteria\n\n- C1: it works.\n'
const CONTINUATION = 'An earlier writer began this round. Its partial document is in the worktree. It may be incomplete or wrong. Continue from it after checking it against the intent.'
const DAY = 86400000
const geminiFirst = () => ({
  'Gemini Models': [0.9, 0.9, null, new Date(Date.now() + 2 * DAY).toISOString()],
  'Claude and GPT models': [0.9, 0.9, null, new Date(Date.now() + 3 * DAY).toISOString()],
})
const QUOTA = 'Individual quota reached. Resets in 1h2m3s'

function seatRepo(t) {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, FEATURE), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, FEATURE, 'spec.md'), ORIGINAL)
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'spec')
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
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

// Records the worktree as the pair's process starts, before its own directives run.
function witnessingCommand(t) {
  const dir = tempDir(t, 'aether-seat-witness-')
  const witness = path.join(dir, 'witness.jsonl')
  const file = path.join(dir, 'witness-agy.js')
  const source = [
    '#!/usr/bin/env node',
    "'use strict'",
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    "const { spawnSync } = require('node:child_process')",
    'const argv = process.argv.slice(2)',
    "const at = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] }",
    'function listTree(dir, prefix) {',
    '  const out = {}',
    '  if (!fs.existsSync(dir)) return out',
    '  for (const name of fs.readdirSync(dir)) {',
    "    if (name === '.git' || name === '.aether-tmp') continue",
    "    const rel = prefix ? prefix + '/' + name : name",
    '    const full = path.join(dir, name)',
    '    const st = fs.lstatSync(full)',
    '    if (st.isDirectory()) Object.assign(out, listTree(full, rel))',
    "    else if (st.isFile()) out[rel] = fs.readFileSync(full, 'utf8')",
    '    else out[rel] = null',
    '  }',
    '  return out',
    '}',
    "const prompt = at('-p')",
    "if (prompt !== null && prompt !== '/usage') {",
    `  fs.appendFileSync(${JSON.stringify(witness)}, JSON.stringify({ model: at('--model'), prompt, files: listTree(process.cwd(), '') }) + '\\n')`,
    '}',
    `const r = spawnSync(process.execPath, [${JSON.stringify(FAKE_AGY)}, ...argv], { stdio: 'inherit' })`,
    'process.exit(r.status === null ? 1 : r.status)',
    '',
  ].join('\n')
  fs.writeFileSync(file, source)
  fs.chmodSync(file, 0o755)
  return { command: file, witness }
}

function turnsOf(witness) {
  if (!fs.existsSync(witness)) return []
  return fs.readFileSync(witness, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

function lines(...parts) {
  return `${parts.join('\n')}\n`
}

// Two Writer rounds in one session. The second leaves out the pair the first ran on.
function writerTurns(t, input, { second = input, doc = 'spec', third = null } = {}) {
  const repo = seatRepo(t)
  const { command, witness } = witnessingCommand(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const base = ['writer', '--session', 's1', '--feature', FEATURE, '--doc', doc]
  const first = seat(repo.dir, base, env, input)
  assert.equal(first.status, 4, first.stdout + first.stderr)
  const excluded = [first.json.decision.picked.id]
  const secondRound = seat(repo.dir, [...base, '--exclude', excluded.join(',')], env, second)
  let thirdRound = null
  if (third !== null) {
    const picked = secondRound.json && secondRound.json.decision && secondRound.json.decision.picked && secondRound.json.decision.picked.id
    if (typeof picked === 'string') excluded.push(picked)
    thirdRound = seat(repo.dir, [...base, '--exclude', excluded.join(',')], env, third)
  }
  return { repo, env, first, second: secondRound, third: thirdRound, turns: turnsOf(witness) }
}

function seatOf(t, seatName, input) {
  const repo = seatRepo(t)
  const { command, witness } = witnessingCommand(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const base = [seatName, '--session', 's1', '--feature', FEATURE]
  const first = seat(repo.dir, base, env, input)
  assert.equal(first.status, 4, first.stdout + first.stderr)
  const second = seat(repo.dir, [...base, '--exclude', first.json.decision.picked.id], env, input)
  return { repo, first, second, turns: turnsOf(witness) }
}

test('a Writer that writes part of spec.md and then fails leaves that file in the next worktree, and the message says to continue (issue 68)', (t) => {
  const input = lines('Write the spec.', `FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: commit partial', 'FAKE-AGY: exit-error boom')
  const { repo, first, second, turns } = writerTurns(t, input)
  assert.equal(first.json.failed, 'failed')
  assert.equal(first.json.continued, false)
  assert.deepEqual(first.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])
  assert.equal(second.json.continued, true)
  assert.equal(turns.length, 2, turns.map((turn) => turn.model).join(','))
  assert.equal(turns[0].files[SPEC], ORIGINAL)
  assert.equal(turns[0].prompt.includes(CONTINUATION), false)
  assert.equal(turns[1].files[SPEC], 'PARTIAL-SPEC\n')
  assert.ok(turns[1].prompt.includes(CONTINUATION), 'the next pair is told to continue from the partial')
  assert.equal(fs.readFileSync(path.join(repo.dir, SPEC), 'utf8'), ORIGINAL, 'the Lead checkout is unchanged')
  assert.equal(repo.git('status', '--porcelain'), '')
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'seats', first.json.id, 'wt')), false)
})

test('a Writer that writes part of spec.md and then runs out of quota leaves that file in the next worktree (issue 68)', (t) => {
  const input = lines('Write the spec.', `FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: exit-code 3', `FAKE-AGY: exit-error ${QUOTA}`)
  const { first, second, turns } = writerTurns(t, input)
  assert.equal(first.json.failed, 'quota', first.json.detail)
  assert.equal(first.json.continued, false)
  assert.deepEqual(first.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])
  assert.equal(second.json.continued, true)
  assert.equal(turns[1].files[SPEC], 'PARTIAL-SPEC\n')
  assert.ok(turns[1].prompt.includes(CONTINUATION))
  assert.equal(turns[0].prompt.includes(CONTINUATION), false)
})

test('a plan round carries plan.md and tasks.md, and not a file outside those paths (issue 68)', (t) => {
  const input = lines(
    'Write the plan.',
    `FAKE-AGY: write ${PLAN} PARTIAL-PLAN`,
    `FAKE-AGY: write ${TASKS} PARTIAL-TASKS`,
    `FAKE-AGY: write ${SPEC} SHOULD-NOT`,
    'FAKE-AGY: exit-error boom',
  )
  const { first, turns } = writerTurns(t, input, { doc: 'plan' })
  assert.equal(first.json.failed, 'violation', first.json.detail)
  assert.deepEqual(first.json.files, [SPEC])
  assert.deepEqual(first.json.partial, [
    { path: PLAN, text: 'PARTIAL-PLAN\n' },
    { path: TASKS, text: 'PARTIAL-TASKS\n' },
  ])
  assert.equal(turns[1].files[PLAN], 'PARTIAL-PLAN\n')
  assert.equal(turns[1].files[TASKS], 'PARTIAL-TASKS\n')
  assert.equal(turns[1].files[SPEC], ORIGINAL)
  assert.ok(turns[1].prompt.includes(CONTINUATION))
})

test('a file outside the allowed paths is not carried, and neither is an empty document (issue 68)', (t) => {
  const outside = lines('Write the spec.', 'FAKE-AGY: write src/nope.js SECRET', 'FAKE-AGY: exit-error boom')
  const dropped = writerTurns(t, outside)
  assert.equal(dropped.first.json.failed, 'violation')
  assert.equal(dropped.first.json.partial, undefined)
  assert.equal(dropped.first.json.continued, false)
  assert.equal(dropped.second.json.continued, false)
  assert.equal(dropped.turns[1].files['src/nope.js'], undefined)
  assert.equal(dropped.turns[1].files[SPEC], ORIGINAL)
  assert.equal(dropped.turns[1].prompt.includes(CONTINUATION), false)

  const empty = lines('Write the spec.', `FAKE-AGY: write-empty ${SPEC}`, 'FAKE-AGY: exit-error boom')
  const blank = writerTurns(t, empty)
  assert.equal(blank.first.json.partial, undefined)
  assert.equal(blank.second.json.continued, false)
  assert.equal(blank.turns[1].files[SPEC], ORIGINAL)
  assert.equal(blank.turns[1].prompt.includes(CONTINUATION), false)
})

test('a symlink at the document path is not carried (issue 68)', (t) => {
  const outside = path.join(tempDir(t), 'secret.txt')
  fs.writeFileSync(outside, 'SECRET-OUTSIDE\n')
  const input = lines('Write the spec.', `FAKE-AGY: link ${SPEC} ${outside}`, 'FAKE-AGY: exit-error boom')
  const { first, turns } = writerTurns(t, input)
  assert.equal(first.json.partial, undefined)
  assert.equal(turns[1].files[SPEC], ORIGINAL)
  assert.equal(turns[1].prompt.includes(CONTINUATION), false)
  assert.equal(JSON.stringify(turns[1].files).includes('SECRET-OUTSIDE'), false)
})

test('a later failure replaces the partial: what it left is what the pair after it sees, and an empty document drops it (issue 68)', (t) => {
  const firstInput = lines('Write the spec.', `FAKE-AGY: write ${SPEC} PARTIAL-ONE`, 'FAKE-AGY: exit-error boom')
  const secondInput = lines('Write the spec.', `FAKE-AGY: write ${SPEC} PARTIAL-TWO`, 'FAKE-AGY: exit-error boom')
  const thirdInput = lines('Write the spec.', 'FAKE-AGY: exit-error boom')
  const kept = writerTurns(t, firstInput, { second: secondInput, third: thirdInput })
  assert.equal(kept.turns[1].files[SPEC], 'PARTIAL-ONE\n')
  assert.equal(kept.turns[2].files[SPEC], 'PARTIAL-TWO\n')
  assert.equal(kept.second.json.continued, true)
  assert.equal(kept.third.json.continued, true)
  assert.ok(kept.turns[2].prompt.includes(CONTINUATION))

  const wipedSecond = lines('Write the spec.', `FAKE-AGY: write-empty ${SPEC}`, 'FAKE-AGY: exit-error boom')
  const wiped = writerTurns(t, firstInput, { second: wipedSecond, third: thirdInput })
  assert.equal(wiped.turns[1].files[SPEC], 'PARTIAL-ONE\n', 'the second pair started from the first partial')
  assert.equal(wiped.turns[2].files[SPEC], ORIGINAL, 'the empty document is not carried on')
  assert.equal(wiped.third.json.continued, false)
  assert.equal(wiped.turns[2].prompt.includes(CONTINUATION), false)
})

test('a later Writer round starts from the commit, not from a partial an earlier round left (issue 68)', (t) => {
  const failed = lines('Write the spec.', `FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: exit-error boom')
  const quiet = lines('Write the spec.', 'FAKE-AGY: exit-error boom')
  const repo = seatRepo(t)
  const { command, witness } = witnessingCommand(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const base = ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec']
  const first = seat(repo.dir, base, env, failed)
  assert.equal(first.status, 4, first.stdout + first.stderr)
  assert.deepEqual(first.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])
  // No --exclude: this is the next round of the session, not a retry of the one that failed.
  const later = seat(repo.dir, base, env, quiet)
  assert.equal(later.status, 4, later.stdout + later.stderr)
  const turns = turnsOf(witness)
  const laterTurn = turns[turns.length - 1]
  assert.equal(laterTurn.files[SPEC], ORIGINAL, 'a later round starts from the commit')
  assert.equal(laterTurn.prompt.includes(CONTINUATION), false)
  assert.equal(later.json.continued, false)
  assert.equal(later.json.partial, undefined)
  const retry = seat(repo.dir, [...base, '--exclude', later.json.decision.picked.id], env, quiet)
  assert.equal(retry.status, 4, retry.stdout + retry.stderr)
  assert.equal(retry.json.continued, false)
  const after = turnsOf(witness)
  assert.equal(after[after.length - 1].files[SPEC], ORIGINAL, 'a retry of the later round does not revive the earlier partial')
  assert.equal(after[after.length - 1].prompt.includes(CONTINUATION), false)
})

test('a Writer that then succeeds does not leave the partial for the round after it (issue 68)', (t) => {
  const failed = lines('Write the spec.', `FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: exit-error boom')
  const answer = { spec: SPEC, commit: 'abc', clarify: [], assumptions: [], questions: [] }
  const succeeded = lines('Write the spec.', `FAKE-AGY: write ${SPEC} FULL-SPEC`, 'FAKE-AGY: commit the spec', `FAKE-AGY: answer ${JSON.stringify(answer)}`)
  const again = lines('Write the spec.', 'FAKE-AGY: exit-error boom')
  const { repo, second, third, turns } = writerTurns(t, failed, { second: succeeded, third: again })
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.equal(second.json.continued, true)
  assert.equal(fs.readFileSync(path.join(repo.dir, SPEC), 'utf8'), 'FULL-SPEC\n')
  assert.equal(third.status, 4, third.stdout + third.stderr)
  assert.equal(third.json.continued, false)
  assert.equal(third.json.partial, undefined)
  assert.equal(turns[2].files[SPEC], 'FULL-SPEC\n')
  assert.equal(turns[2].prompt.includes(CONTINUATION), false)
})

test('a failed Judge round and a failed Examiner round carry nothing (issue 68)', (t) => {
  const judge = seatOf(t, 'judge', lines('Review.', `FAKE-AGY: write ${SPEC} REWRITTEN`, 'FAKE-AGY: exit-error boom'))
  assert.equal(judge.first.json.partial, undefined)
  assert.equal(judge.first.json.continued, undefined)
  assert.equal(judge.turns[1].files[SPEC], ORIGINAL)
  assert.notEqual(judge.turns[1].files[SPEC], 'REWRITTEN\n')
  assert.equal(judge.turns[1].prompt.includes(CONTINUATION), false)

  const exam = seatOf(t, 'examiner', lines('Write the exam.', 'FAKE-AGY: write .aether-exam/note.txt EXAM-PARTIAL', 'FAKE-AGY: exit-error boom'))
  assert.equal(exam.first.json.partial, undefined)
  assert.equal(exam.first.json.continued, undefined)
  assert.equal(exam.turns[1].files['.aether-exam/note.txt'], undefined)
  assert.equal(exam.turns[1].prompt.includes(CONTINUATION), false)
})

test('seat-wait reports whether the Writer round started from a partial, and a stopped round keeps the file for the next pair (issue 68)', async (t) => {
  const repo = seatRepo(t)
  const { command, witness } = witnessingCommand(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const message = lines('Write the spec.', `FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: sleep 30')
  const dir = path.join(repo.dir, '.aether-tmp', 'seats', 's1')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'message.md'), message)
  const digest = lanes.digest(message)
  const started = runBin(LANE_BIN, ['seat-start', 'writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--superdelegation', 'on', '--harnesses', 'agy', '--digest', digest], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const id = started.json.id
  const spec = path.join(repo.dir, '.aether', 'seats', id, 'wt', SPEC)
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && !(fs.existsSync(spec) && fs.readFileSync(spec, 'utf8').includes('PARTIAL-SPEC'))) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.ok(fs.existsSync(spec) && fs.readFileSync(spec, 'utf8').includes('PARTIAL-SPEC'), 'the pair wrote before the stop')
  const stopped = runBin(LANE_BIN, ['seat-stop', id], repo.dir, env)
  assert.equal(stopped.json.stopped, true)
  assert.equal(stopped.json.continued, undefined, 'this round did not start from a partial')
  assert.deepEqual(stopped.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'seats', id, 'wt')), false)
  const waited = runBin(LANE_BIN, ['seat-wait', id, '--max', '5'], repo.dir, env)
  assert.equal(waited.json.done, true)
  assert.equal(waited.json.exitCode, 1, 'a round stopped before it could write a result')

  const next = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--exclude', stopped.json.pair], env, lines('Write the spec.', 'FAKE-AGY: exit-error boom'))
  assert.equal(next.status, 4, next.stdout + next.stderr)
  assert.equal(next.json.continued, true)
  assert.deepEqual(next.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])
  const turns = turnsOf(witness)
  const carried = turns[turns.length - 1]
  assert.equal(carried.files[SPEC], 'PARTIAL-SPEC\n')
  assert.ok(carried.prompt.includes(CONTINUATION))
})

test('docs/guide/design-seats.md says a failed Writer hands its partial document to the next pair (issue 68)', () => {
  const guide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'guide', 'design-seats.md'), 'utf8')
  assert.ok(guide.includes(CONTINUATION))
  assert.ok(guide.includes('non-empty'))
  assert.ok(guide.includes('regular file'))
  assert.ok(/Judge/.test(guide) && /Examiner/.test(guide) && /carry nothing|keeps nothing|keep nothing/.test(guide))
  assert.ok(guide.includes('for each try'))
  assert.ok(guide.includes('native Writer'))
})
