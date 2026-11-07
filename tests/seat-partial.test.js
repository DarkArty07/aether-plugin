'use strict'

// Issue 68, design-seat half: a Writer round that fails after writing part of its document hands that
// partial to the next pair, and to the native Writer when no pair is left. The Judge keeps nothing.
// Issue 103: an Examiner round keeps the paths of its tests, never their text.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo, tempDir, runBin } = require('./helpers.js')
const { LANE_BIN, FAKE_AGY, laneEnv: rawLaneEnv } = require('./lane-fixtures.js')
const laneEnv = (t, opts = {}) => rawLaneEnv(t, {
  ...opts,
  mutate: (cfg) => {
    if (cfg?.harnesses?.agy?.models?.['claude-sonnet-5-5']?.roles) {
      cfg.harnesses.agy.models['claude-sonnet-5-5'].roles.push('writer')
    }
    if (cfg?.harnesses?.agy?.models?.['claude-opus-5-5']?.roles) {
      cfg.harnesses.agy.models['claude-opus-5-5'].roles.push('judge', 'writer', 'examiner')
    }
    if (opts.mutate) opts.mutate(cfg)
  },
})
const lanes = require('../plugins/aether/lib/lanes.js')
const examLib = require('../plugins/aether/lib/exam.js')

const FEATURE = 'specs/001-demo'
const SPEC = `${FEATURE}/spec.md`
const PLAN = `${FEATURE}/plan.md`
const TASKS = `${FEATURE}/tasks.md`
const ORIGINAL = '# Demo\n\n## Criteria\n\n- C1: it works.\n'
const CONTINUATION = 'An earlier writer began this round. Its partial document is in the worktree. It may be incomplete or wrong. Continue from it after checking it against the intent.'
const EXAMINER_CONTINUATION = 'An earlier examiner began this exam. Its partial tests are in the worktree. They may be incomplete or wrong. Continue from them after checking them against the spec and the plan.'
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

// A harness whose prompt is ignored: each real prompt runs the next script, so two tries of one round can
// share a message (and therefore its digest) while doing different work. --version and /usage are the
// harness's own checks and are passed through without taking a script.
function scriptedCommand(t, scripts) {
  const dir = tempDir(t, 'aether-seat-script-')
  const witness = path.join(dir, 'witness.jsonl')
  const countFile = path.join(dir, 'count')
  const file = path.join(dir, 'scripted-agy.js')
  const source = [
    '#!/usr/bin/env node',
    "'use strict'",
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    "const { spawnSync } = require('node:child_process')",
    'const argv = process.argv.slice(2)',
    "const at = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] }",
    // --version and /usage are the harness's own checks, not a try of the round.
    "if (argv[0] === '--version' || at('-p') === null || at('-p') === '/usage') {",
    `  const r = spawnSync(process.execPath, [${JSON.stringify(FAKE_AGY)}, ...argv], { stdio: 'inherit' })`,
    '  process.exit(r.status === null ? 1 : r.status)',
    '}',
    'function listTree(dir, prefix) {',
    '  const out = {}',
    '  if (!fs.existsSync(dir)) return out',
    '  for (const name of fs.readdirSync(dir)) {',
    "    if (name === '.git' || name === '.aether-tmp') continue",
    "    const rel = prefix ? prefix + '/' + name : name",
    '    const full = path.join(dir, name)',
    '    const st = fs.lstatSync(full)',
    '    if (st.isSymbolicLink()) out[rel] = null',
    '    else if (st.isDirectory()) Object.assign(out, listTree(full, rel))',
    "    else if (st.isFile()) out[rel] = fs.readFileSync(full, 'utf8')",
    '  }',
    '  return out',
    '}',
    `const n = fs.existsSync(${JSON.stringify(countFile)}) ? Number(fs.readFileSync(${JSON.stringify(countFile)}, 'utf8')) : 0`,
    `fs.writeFileSync(${JSON.stringify(countFile)}, String(n + 1))`,
    `const scripts = ${JSON.stringify(scripts)}`,
    'const script = scripts[Math.min(n, scripts.length - 1)]',
    `fs.appendFileSync(${JSON.stringify(witness)}, JSON.stringify({ model: at('--model'), prompt: at('-p'), files: listTree(process.cwd(), '') }) + '\\n')`,
    'const args = argv.slice()',
    "const pi = args.indexOf('-p')",
    'args[pi + 1] = script',
    `const r = spawnSync(process.execPath, [${JSON.stringify(FAKE_AGY)}, ...args], { stdio: 'inherit' })`,
    'process.exit(r.status === null ? 1 : r.status)',
    '',
  ].join('\n')
  fs.writeFileSync(file, source)
  fs.chmodSync(file, 0o755)
  return { command: file, witness }
}

function writeMessage(repo, text, session = 's1') {
  const dir = path.join(repo.dir, '.aether', 'tmp', 'seats', session)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'message.md'), text)
  return lanes.digest(text)
}

function seatDirOf(repo, id) {
  return path.join(repo.dir, '.aether', 'work', 'seats', id)
}

// Kills the runner the moment `file` appears. pair.json is written before the signal handler is installed,
// and git worktree add (which comes next) is slower than this loop, so the handler has not run.
function killWhenAppears(file, pidFile) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (!fs.existsSync(file)) continue
    const pid = Number.parseInt(fs.readFileSync(pidFile, 'utf8'), 10)
    if (!(pid > 0)) return null
    try { process.kill(-pid, 'SIGKILL') } catch { /* the group is already gone */ }
    try { process.kill(pid, 'SIGKILL') } catch { /* the runner is already gone */ }
    const until = Date.now() + 2000
    while (Date.now() < until) {
      try { process.kill(pid, 0) } catch { return pid }
    }
    return pid
  }
  return null
}

// A kill during git worktree add can leave a lock. Drop it so the next try can use the repository.
function releaseRepo(repo, id) {
  const gitDir = path.join(repo.dir, '.git')
  fs.rmSync(path.join(seatDirOf(repo, id), 'wt'), { recursive: true, force: true })
  for (const name of ['index.lock', 'HEAD.lock', 'config.lock', 'gc.pid.lock']) fs.rmSync(path.join(gitDir, name), { force: true })
  const listed = path.join(gitDir, 'worktrees')
  if (fs.existsSync(listed)) {
    for (const name of fs.readdirSync(listed)) fs.rmSync(path.join(listed, name, 'locked'), { force: true })
  }
  spawnSync('git', ['worktree', 'prune'], { cwd: repo.dir, encoding: 'utf8' })
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

// Tries of one round. They share one message, so they share its digest, and each try runs the next script.
// --exclude still names the pairs already tried; the digest, not the exclusion, is what carries the partial.
function sameMessageTurns(t, scripts, message = 'Write the spec.\n') {
  const repo = seatRepo(t)
  const { command, witness } = scriptedCommand(t, scripts)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const base = ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec']
  const excluded = []
  const rounds = []
  for (let i = 0; i < scripts.length; i++) {
    const args = excluded.length === 0 ? base : [...base, '--exclude', excluded.join(',')]
    const result = seat(repo.dir, args, env, message)
    rounds.push(result)
    const picked = result.json && result.json.decision && result.json.decision.picked && result.json.decision.picked.id
    if (typeof picked === 'string') excluded.push(picked)
  }
  return { repo, rounds, turns: turnsOf(witness), first: rounds[0], second: rounds[1] ?? null, third: rounds[2] ?? null }
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
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'work', 'seats', first.json.id, 'wt')), false)
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
  // One message for every try: the digest of that message is what makes them one round. The scripts differ, so each
  // try leaves a different document.
  const kept = sameMessageTurns(t, [
    lines(`FAKE-AGY: write ${SPEC} PARTIAL-ONE`, 'FAKE-AGY: exit-error boom'),
    lines(`FAKE-AGY: write ${SPEC} PARTIAL-TWO`, 'FAKE-AGY: exit-error boom'),
    lines('FAKE-AGY: exit-error boom'),
  ])
  assert.equal(kept.first.status, 4, kept.first.stdout + kept.first.stderr)
  assert.equal(kept.turns[1].files[SPEC], 'PARTIAL-ONE\n')
  assert.equal(kept.turns[2].files[SPEC], 'PARTIAL-TWO\n')
  assert.equal(kept.second.json.continued, true)
  assert.equal(kept.third.json.continued, true)
  assert.ok(kept.turns[2].prompt.includes(CONTINUATION))

  const wiped = sameMessageTurns(t, [
    lines(`FAKE-AGY: write ${SPEC} PARTIAL-ONE`, 'FAKE-AGY: exit-error boom'),
    lines(`FAKE-AGY: write-empty ${SPEC}`, 'FAKE-AGY: exit-error boom'),
    lines('FAKE-AGY: exit-error boom'),
  ])
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
  // The follow-up is another try of the same round: that is the try a partial a success forgot to clear would reach.
  const answer = { spec: SPEC, commit: 'abc', clarify: [], assumptions: [], questions: [] }
  const { repo, second, third, turns } = sameMessageTurns(t, [
    lines(`FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: exit-error boom'),
    lines(`FAKE-AGY: write ${SPEC} FULL-SPEC`, 'FAKE-AGY: commit the spec', `FAKE-AGY: answer ${JSON.stringify(answer)}`),
    lines('FAKE-AGY: exit-error boom'),
  ])
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.equal(second.json.continued, true)
  assert.equal(fs.readFileSync(path.join(repo.dir, SPEC), 'utf8'), 'FULL-SPEC\n')
  assert.equal(third.status, 4, third.stdout + third.stderr)
  assert.equal(third.json.continued, false)
  assert.equal(third.json.partial, undefined)
  assert.equal(turns[2].files[SPEC], 'FULL-SPEC\n')
  assert.equal(turns[2].prompt.includes(CONTINUATION), false)
})

test('a failed Judge round carries nothing (issue 68)', (t) => {
  // This file grants the judge and examiner roles to agy Opus. Opus high is 51.7, which meets the floor.
  // Argon is 50.4, below it, so Opus is the only external pair. The try after it has nowhere to carry a partial.
  const judge = seatOf(t, 'judge', lines('Review.', `FAKE-AGY: write ${SPEC} REWRITTEN`, 'FAKE-AGY: exit-error boom'))
  assert.equal(judge.first.json.decision.picked.id, 'agy/claude-opus-5-5@high')
  assert.equal(judge.first.json.partial, undefined)
  assert.equal(judge.first.json.continued, undefined)
  assert.equal(judge.first.json.timedOut, undefined)
  assert.equal(fs.existsSync(path.join(judge.repo.dir, '.aether', 'work', 'seats', judge.first.json.id, 'baseline.json')), false, 'a Judge round writes no baseline')
  assert.equal(judge.turns.length, 1)
  assert.equal(judge.turns[0].files[SPEC], ORIGINAL)
  assert.equal(judge.turns[0].prompt.includes(CONTINUATION), false)
  assert.equal(judge.second.status, 3, judge.second.stdout + judge.second.stderr)
  assert.equal(judge.second.json.unavailable, 'no-external')
  assert.equal(fs.readFileSync(path.join(judge.repo.dir, SPEC), 'utf8'), ORIGINAL)
})

const EXAM_REL = '.aether/exam/nested/c1.js'
const EXAM_OTHER = '.aether/exam/nested/c2.js'
const EXAM_BODY = 'EXAM-SECRET-BODY-103\n'
const EXAM_ONE = 'EXAM-CARRY-ONE'
const EXAM_TWO = 'EXAM-CARRY-TWO'

// No file under the seat directory holds the exam's text. Replies name paths only.
function seatTreeHas(dir, needle) {
  if (!fs.existsSync(dir)) return false
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.lstatSync(full)
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) {
      if (seatTreeHas(full, needle)) return true
    } else if (st.isFile() && fs.readFileSync(full, 'utf8').includes(needle)) return true
  }
  return false
}

test('seat-wait reports whether the Writer round started from a partial, and a stopped round keeps the file for the next pair (issue 68)', async (t) => {
  const repo = seatRepo(t)
  const message = 'Write the spec.\n'
  // The stopped try and the try after it share the message. The scripts differ, so the follow-up does not sleep.
  const { command, witness } = scriptedCommand(t, [
    lines(`FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: sleep 30'),
    lines('FAKE-AGY: exit-error boom'),
  ])
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const digest = writeMessage(repo, message)
  const started = runBin(LANE_BIN, ['seat-start', 'writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--superdelegation', 'on', '--harnesses', 'agy', '--digest', digest], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const id = started.json.id
  const spec = path.join(repo.dir, '.aether', 'work', 'seats', id, 'wt', SPEC)
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && !(fs.existsSync(spec) && fs.readFileSync(spec, 'utf8').includes('PARTIAL-SPEC'))) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.ok(fs.existsSync(spec) && fs.readFileSync(spec, 'utf8').includes('PARTIAL-SPEC'), 'the pair wrote before the stop')
  const stopped = runBin(LANE_BIN, ['seat-stop', id], repo.dir, env)
  assert.equal(stopped.json.stopped, true)
  assert.equal(stopped.json.continued, undefined, 'this round did not start from a partial')
  assert.deepEqual(stopped.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'work', 'seats', id, 'wt')), false)
  const waited = runBin(LANE_BIN, ['seat-wait', id, '--max', '5'], repo.dir, env)
  assert.equal(waited.json.done, true)
  assert.equal(waited.json.exitCode, 1, 'a round stopped before it could write a result')

  const next = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--exclude', stopped.json.pair], env, message)
  assert.equal(next.status, 4, next.stdout + next.stderr)
  assert.equal(next.json.continued, true)
  assert.deepEqual(next.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])
  const turns = turnsOf(witness)
  const carried = turns[turns.length - 1]
  assert.equal(carried.files[SPEC], 'PARTIAL-SPEC\n')
  assert.ok(carried.prompt.includes(CONTINUATION))
})

test('a stale partial from an earlier round is not loaded when the next round is killed before its signal handler, and the committed document stays (issue 68)', (t) => {
  const committed = 'COMMITTED-BY-NATIVE\n'
  const { command, witness } = scriptedCommand(t, [
    lines(`FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: exit-error boom'),
    lines('FAKE-AGY: exit-error boom'),
  ])
  const repo = seatRepo(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const roundN = 'Write the spec for round N.\n'
  const roundNext = 'Write the spec for round N+1.\n'
  const first = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec'], env, roundN)
  assert.equal(first.status, 4, first.stdout + first.stderr)
  assert.deepEqual(first.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }], first.stdout + first.stderr)
  fs.writeFileSync(path.join(repo.dir, SPEC), committed)
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'the native writer committed the document')

  const digest = writeMessage(repo, roundNext)
  const started = runBin(LANE_BIN, ['seat-start', 'writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--superdelegation', 'on', '--harnesses', 'agy', '--digest', digest], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const id = started.json.id
  const dir = seatDirOf(repo, id)
  assert.ok(killWhenAppears(path.join(dir, 'pair.json'), path.join(dir, 'pid')), 'pair.json appeared')
  assert.equal(fs.existsSync(path.join(dir, 'continued.json')), false, 'killed before the signal handler: continued.json is written after it is installed')
  assert.equal(fs.existsSync(path.join(dir, 'partial.json')), false, 'the handler did not save a partial')
  const stopped = runBin(LANE_BIN, ['seat-stop', id], repo.dir, env)
  assert.equal(stopped.json.pair, 'agy/gemini-4-argon@high', JSON.stringify(stopped.json))
  assert.equal(Object.hasOwn(stopped.json, 'partial'), false)
  releaseRepo(repo, id)

  const retry = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--exclude', stopped.json.pair], env, roundNext)
  assert.equal(retry.status, 4, retry.stdout + retry.stderr)
  assert.equal(retry.json.continued, false)
  const turns = turnsOf(witness)
  const carried = turns[turns.length - 1]
  assert.equal(carried.files[SPEC], committed, 'the stale partial is not pasted over the committed document')
  assert.equal(carried.prompt.includes(CONTINUATION), false)
  assert.equal(fs.readFileSync(path.join(repo.dir, SPEC), 'utf8'), committed)
})

test('a try whose stop names no pair still hands its saved partial to the next try of the same round (issue 68)', async (t) => {
  const message = 'Write the spec.\n'
  const { command, witness } = scriptedCommand(t, [
    lines(`FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: sleep 30'),
    lines('FAKE-AGY: exit-error boom'),
  ])
  const repo = seatRepo(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const digest = writeMessage(repo, message)
  const started = runBin(LANE_BIN, ['seat-start', 'writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--superdelegation', 'on', '--harnesses', 'agy', '--digest', digest], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const id = started.json.id
  const dir = seatDirOf(repo, id)
  const spec = path.join(dir, 'wt', SPEC)
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && !(fs.existsSync(spec) && fs.readFileSync(spec, 'utf8').includes('PARTIAL-SPEC'))) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.ok(fs.existsSync(spec) && fs.readFileSync(spec, 'utf8').includes('PARTIAL-SPEC'), 'the pair wrote before the stop')
  fs.rmSync(path.join(dir, 'pair.json'), { force: true })
  const stopped = runBin(LANE_BIN, ['seat-stop', id], repo.dir, env)
  assert.equal(stopped.json.stopped, true, JSON.stringify(stopped.json))
  assert.equal(stopped.json.pair, undefined, 'the stop names no pair, so the next try is not excluded')
  assert.deepEqual(stopped.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])

  const next = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec'], env, message)
  assert.equal(next.status, 4, next.stdout + next.stderr)
  assert.equal(next.json.continued, true)
  assert.deepEqual(next.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])
  const carried = turnsOf(witness).at(-1)
  assert.equal(carried.files[SPEC], 'PARTIAL-SPEC\n')
  assert.ok(carried.prompt.includes(CONTINUATION))
})

test('seat-stop omits partial when partial.json was not written (issue 68)', async (t) => {
  const repo = seatRepo(t)
  const { command } = witnessingCommand(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const message = lines('Write the spec.', `FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: sleep 30')
  const digest = writeMessage(repo, message)
  const started = runBin(LANE_BIN, ['seat-start', 'writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--superdelegation', 'on', '--harnesses', 'agy', '--digest', digest], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const id = started.json.id
  const dir = seatDirOf(repo, id)
  const continued = path.join(dir, 'continued.json')
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && !fs.existsSync(continued)) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(fs.existsSync(continued), 'the round got as far as recording that it is a writer')
  const pid = Number.parseInt(fs.readFileSync(path.join(dir, 'pid'), 'utf8'), 10)
  try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ }
  try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  const until = Date.now() + 2000
  while (Date.now() < until) {
    try { process.kill(pid, 0) } catch { break }
  }
  assert.equal(fs.existsSync(path.join(dir, 'partial.json')), false, 'killed before the partial was recorded')
  const stopped = runBin(LANE_BIN, ['seat-stop', id], repo.dir, env)
  assert.equal(Object.hasOwn(stopped.json, 'partial'), false, JSON.stringify(stopped.json))
})

test('a symlinked folder inside the worktree is not followed when a partial is applied (issue 68)', (t) => {
  const outside = tempDir(t, 'aether-seat-outside-')
  fs.writeFileSync(path.join(outside, 'MARKER'), 'keep\n')
  const { command, witness } = scriptedCommand(t, [
    lines(`FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: exit-error boom'),
    lines('FAKE-AGY: exit-error boom'),
  ])
  const repo = seatRepo(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const message = 'Write the spec.\n'
  const first = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec'], env, message)
  assert.equal(first.status, 4, first.stdout + first.stderr)
  assert.deepEqual(first.json.partial, [{ path: SPEC, text: 'PARTIAL-SPEC\n' }])
  const featureDir = path.join(repo.dir, FEATURE)
  fs.rmSync(featureDir, { recursive: true })
  fs.symlinkSync(outside, featureDir)
  repo.git('add', '-A')
  repo.git('commit', '-q', '-m', 'the feature folder is a symlink')

  const next = seat(repo.dir, ['writer', '--session', 's1', '--feature', FEATURE, '--doc', 'spec', '--exclude', first.json.decision.picked.id], env, message)
  assert.equal(next.status, 4, next.stdout + next.stderr)
  assert.equal(fs.existsSync(path.join(outside, 'spec.md')), false, 'the partial was not written through the symlink')
  assert.equal(fs.existsSync(path.join(outside, '001-demo')), false)
  assert.equal(fs.readFileSync(path.join(outside, 'MARKER'), 'utf8'), 'keep\n')
  assert.equal(JSON.stringify(turnsOf(witness).at(-1).files).includes('PARTIAL-SPEC'), false)
})

test('the baseline is taken after the checkout and after an offer is applied (issue 103)', (t) => {
  const message = 'Write the spec.\n'
  const { repo, first, second } = sameMessageTurns(t, [
    lines(`FAKE-AGY: write ${SPEC} PARTIAL-SPEC`, 'FAKE-AGY: exit-error boom'),
    lines('FAKE-AGY: exit-error boom'),
  ], message)
  assert.equal(first.status, 4, first.stdout + first.stderr)
  const firstBaseline = JSON.parse(fs.readFileSync(path.join(seatDirOf(repo, first.json.id), 'baseline.json'), 'utf8'))
  assert.equal(firstBaseline.files[SPEC].size, Buffer.byteLength(ORIGINAL), 'the checkout is the baseline, not the later write')
  assert.equal(typeof firstBaseline.files[SPEC].mtimeMs, 'number')
  const secondBaseline = JSON.parse(fs.readFileSync(path.join(seatDirOf(repo, second.json.id), 'baseline.json'), 'utf8'))
  assert.equal(secondBaseline.files[SPEC].size, Buffer.byteLength('PARTIAL-SPEC\n'), 'the applied offer is in the baseline')
})

test('a failed Examiner round keeps paths only, and the next try of the same round receives the files (issue 103)', (t) => {
  const message = 'Write the exam.\n'
  const secret = EXAM_BODY.trim()
  const { command, witness } = scriptedCommand(t, [
    lines(`FAKE-AGY: write ${EXAM_REL} ${secret}`, 'FAKE-AGY: write-empty .aether/exam/empty.txt', 'FAKE-AGY: exit-error boom'),
    lines(`FAKE-AGY: write ${EXAM_REL} ${secret}`, 'FAKE-AGY: exit-error later'),
    lines('FAKE-AGY: exit-error other-round'),
  ])
  const repo = seatRepo(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const base = ['examiner', '--session', 's1', '--feature', FEATURE]
  const first = seat(repo.dir, base, env, message)
  assert.equal(first.status, 4, first.stdout + first.stderr)
  assert.equal(first.json.continued, false)
  assert.equal(first.json.partial, undefined, 'an Examiner reply never carries partial texts')
  assert.equal(first.json.timedOut, undefined)
  assert.deepEqual(first.json.partialPaths, [EXAM_REL])
  assert.equal(typeof first.json.partialDir, 'string')
  assert.ok(path.isAbsolute(first.json.partialDir), first.json.partialDir)
  assert.ok(first.json.partialDir.includes(`${path.sep}exam-carry${path.sep}`), first.json.partialDir)
  assert.equal(JSON.stringify(first.json).includes(secret), false)
  const seatDir = seatDirOf(repo, first.json.id)
  assert.equal(seatTreeHas(seatDir, secret), false, 'no exam text under the seat directory')
  const recorded = JSON.parse(fs.readFileSync(path.join(seatDir, 'partial-paths.json'), 'utf8'))
  assert.deepEqual(recorded, { partialPaths: [EXAM_REL], partialDir: first.json.partialDir })
  assert.equal(JSON.stringify(recorded).includes(secret), false)
  const carried = path.join(first.json.partialDir, EXAM_REL)
  assert.equal(fs.readFileSync(carried, 'utf8'), `${secret}\n`)
  assert.equal(fs.readFileSync(path.join(first.json.partialDir, 'round'), 'utf8'), lanes.digest(message))
  assert.equal(fs.existsSync(path.join(first.json.partialDir, '.aether/exam', 'empty.txt')), false, 'an empty file is not kept')
  const listed = examLib.list(repo.dir, { dataDir: env.AETHER_DATA_DIR })
  assert.deepEqual(listed, [], 'a carry folder is not an exam exam.list shows')

  const second = seat(repo.dir, base, env, message)
  assert.equal(second.status, 4, second.stdout + second.stderr)
  assert.equal(second.json.continued, true)
  const turn = turnsOf(witness).at(-1)
  assert.equal(turn.files[EXAM_REL], `${secret}\n`)
  assert.ok(turn.prompt.includes(EXAMINER_CONTINUATION), turn.prompt.slice(-400))

  const other = seat(repo.dir, base, env, 'Write a different exam.\n')
  assert.equal(other.status, 4, other.stdout + other.stderr)
  assert.equal(other.json.continued, false)
  assert.deepEqual(other.json.partialPaths, [], 'a finished save that kept nothing clears what the workflow holds')
  assert.equal(other.json.partialDir, undefined)
  assert.equal(turnsOf(witness).at(-1).files[EXAM_REL], undefined)
  assert.equal(fs.existsSync(first.json.partialDir), false)
})

test('seat-stop of an Examiner names partialPaths and partialDir and no text (issue 103)', async (t) => {
  const message = 'Write the exam.\n'
  const secret = EXAM_BODY.trim()
  const { command, witness } = scriptedCommand(t, [
    lines(`FAKE-AGY: write ${EXAM_REL} ${secret}`, 'FAKE-AGY: sleep 30'),
    lines('FAKE-AGY: exit-error boom'),
  ])
  const repo = seatRepo(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const digest = writeMessage(repo, message)
  const started = runBin(LANE_BIN, ['seat-start', 'examiner', '--session', 's1', '--feature', FEATURE, '--superdelegation', 'on', '--harnesses', 'agy', '--digest', digest], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  assert.ok(Number.isInteger(started.json.at))
  const id = started.json.id
  const file = path.join(seatDirOf(repo, id), 'wt', EXAM_REL)
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && !(fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(secret))) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.ok(fs.existsSync(file), 'the pair wrote before the stop')
  const stopped = runBin(LANE_BIN, ['seat-stop', id], repo.dir, env)
  assert.equal(stopped.json.stopped, true, JSON.stringify(stopped.json))
  assert.equal(stopped.json.continued, undefined)
  assert.equal(stopped.json.partial, undefined)
  assert.deepEqual(stopped.json.partialPaths, [EXAM_REL])
  assert.equal(fs.readFileSync(path.join(stopped.json.partialDir, EXAM_REL), 'utf8'), `${secret}\n`)
  assert.equal(JSON.stringify(stopped.json).includes(secret), false)
  assert.equal(seatTreeHas(seatDirOf(repo, id), secret), false)
  const waited = runBin(LANE_BIN, ['seat-wait', id, '--max', '0'], repo.dir, env)
  assert.equal(waited.json.done, true)
  assert.ok(Number.isInteger(waited.json.at))

  const next = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], env, message)
  assert.equal(next.status, 4, next.stdout + next.stderr)
  assert.equal(next.json.continued, true)
  assert.equal(turnsOf(witness).at(-1).files[EXAM_REL], `${secret}\n`)
  assert.ok(turnsOf(witness).at(-1).prompt.includes(EXAMINER_CONTINUATION))
})

function offerText(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8')
}

// Two Examiner tries of one message. The scripts differ; the digest does not, so the second is a continuation.
function examinerContinuation(t, scripts, message = 'Write the exam.\n') {
  const { command, witness } = scriptedCommand(t, scripts)
  const repo = seatRepo(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const base = ['examiner', '--session', 's1', '--feature', FEATURE]
  // The digest carries the partial. Excluding the pair would leave the Examiner with no external candidate.
  const first = seat(repo.dir, base, env, message)
  assert.equal(first.status, 4, first.stdout + first.stderr)
  const second = seat(repo.dir, base, env, message)
  assert.equal(second.status, 4, second.stdout + second.stderr)
  return { first, second, turns: turnsOf(witness) }
}

test('a continuation that fails before writing keeps every carried exam file in the offer (issue 103)', (t) => {
  const message = 'Write the exam.\n'
  const { first, second, turns } = examinerContinuation(t, [
    lines(`FAKE-AGY: write ${EXAM_REL} ${EXAM_ONE}`, `FAKE-AGY: write ${EXAM_OTHER} ${EXAM_TWO}`, 'FAKE-AGY: exit-error boom'),
    lines('FAKE-AGY: exit-error boom'),
  ], message)
  assert.equal(first.json.continued, false)
  assert.deepEqual(first.json.partialPaths, [EXAM_REL, EXAM_OTHER])
  assert.equal(second.json.continued, true)
  assert.deepEqual(second.json.partialPaths, [EXAM_REL, EXAM_OTHER])
  assert.equal(typeof second.json.partialDir, 'string')
  assert.equal(offerText(second.json.partialDir, EXAM_REL), `${EXAM_ONE}\n`)
  assert.equal(offerText(second.json.partialDir, EXAM_OTHER), `${EXAM_TWO}\n`)
  assert.equal(JSON.stringify(second.json).includes(EXAM_ONE), false)
  assert.equal(JSON.stringify(second.json).includes(EXAM_TWO), false)
  const carried = turns.at(-1)
  assert.equal(carried.files[EXAM_REL], `${EXAM_ONE}\n`)
  assert.equal(carried.files[EXAM_OTHER], `${EXAM_TWO}\n`)
  assert.ok(carried.prompt.includes(EXAMINER_CONTINUATION))
})

test('a continuation that edits one exam file keeps the carried files it left untouched (issue 103)', (t) => {
  const { second } = examinerContinuation(t, [
    lines(`FAKE-AGY: write ${EXAM_REL} ${EXAM_ONE}`, `FAKE-AGY: write ${EXAM_OTHER} ${EXAM_TWO}`, 'FAKE-AGY: exit-error boom'),
    lines(`FAKE-AGY: write ${EXAM_REL} ${EXAM_ONE}-EDITED`, 'FAKE-AGY: exit-error boom'),
  ])
  assert.equal(second.json.continued, true)
  assert.deepEqual(second.json.partialPaths, [EXAM_REL, EXAM_OTHER])
  assert.equal(offerText(second.json.partialDir, EXAM_REL), `${EXAM_ONE}-EDITED\n`)
  assert.equal(offerText(second.json.partialDir, EXAM_OTHER), `${EXAM_TWO}\n`)
  assert.equal(JSON.stringify(second.json).includes(EXAM_ONE), false)
  assert.equal(JSON.stringify(second.json).includes(EXAM_TWO), false)
})

test('an Examiner exit 4 that kept nothing carries partialPaths as an empty list (issue 103)', (t) => {
  const { command } = witnessingCommand(t)
  const repo = seatRepo(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const failed = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], env, lines('Write the exam.', 'FAKE-AGY: exit-error boom'))
  assert.equal(failed.status, 4, failed.stdout + failed.stderr)
  assert.equal(failed.json.continued, false)
  assert.equal(failed.json.partial, undefined)
  assert.deepEqual(failed.json.partialPaths, [])
  assert.equal(Object.hasOwn(failed.json, 'partialDir'), false, JSON.stringify(failed.json))
  const recorded = JSON.parse(fs.readFileSync(path.join(seatDirOf(repo, failed.json.id), 'partial-paths.json'), 'utf8'))
  assert.deepEqual(recorded, { partialPaths: [], partialDir: null })
})

test('an Examiner exit 4 omits partialPaths when the save does not finish (issue 103)', (t) => {
  const dir = tempDir(t, 'aether-seat-lock-')
  const command = path.join(dir, 'lock-agy.js')
  const source = [
    '#!/usr/bin/env node',
    "'use strict'",
    "const fs = require('node:fs')",
    "const { spawnSync } = require('node:child_process')",
    'const argv = process.argv.slice(2)',
    "const at = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] }",
    "if (argv[0] === '--version' || at('-p') === null || at('-p') === '/usage') {",
    `  const r = spawnSync(process.execPath, [${JSON.stringify(FAKE_AGY)}, ...argv], { stdio: 'inherit' })`,
    '  process.exit(r.status === null ? 1 : r.status)',
    '}',
    `const r = spawnSync(process.execPath, [${JSON.stringify(FAKE_AGY)}, ...argv], { stdio: 'inherit' })`,
    // The worktree is gone before the runner can save, so the save never finishes.
    'fs.rmSync(process.cwd(), { recursive: true, force: true })',
    'process.exit(r.status === null ? 1 : r.status)',
    '',
  ].join('\n')
  fs.writeFileSync(command, source)
  fs.chmodSync(command, 0o755)
  const repo = seatRepo(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const failed = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], env, lines('Write the exam.', 'FAKE-AGY: exit-error boom'))
  assert.equal(failed.status, 4, failed.stdout + failed.stderr)
  assert.equal(failed.json.continued, false)
  assert.equal(Object.hasOwn(failed.json, 'partialPaths'), false, JSON.stringify(failed.json))
  assert.equal(Object.hasOwn(failed.json, 'partialDir'), false)
  assert.equal(failed.json.partial, undefined)
  assert.equal(fs.existsSync(path.join(seatDirOf(repo, failed.json.id), 'partial-paths.json')), false)
})

test('seat-stop of an Examiner that kept nothing carries partialPaths as an empty list (issue 103)', async (t) => {
  const repo = seatRepo(t)
  const { command } = witnessingCommand(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const message = lines('Write the exam.', 'FAKE-AGY: sleep 30')
  const digest = writeMessage(repo, message)
  const started = runBin(LANE_BIN, ['seat-start', 'examiner', '--session', 's1', '--feature', FEATURE, '--superdelegation', 'on', '--harnesses', 'agy', '--digest', digest], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const id = started.json.id
  const dir = seatDirOf(repo, id)
  const continued = path.join(dir, 'continued.json')
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && !fs.existsSync(continued)) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(fs.existsSync(continued), 'the round got as far as recording that it is an examiner')
  const stopped = runBin(LANE_BIN, ['seat-stop', id], repo.dir, env)
  assert.equal(stopped.json.stopped, true, JSON.stringify(stopped.json))
  assert.equal(stopped.json.continued, undefined)
  assert.equal(stopped.json.partial, undefined)
  assert.deepEqual(stopped.json.partialPaths, [])
  assert.equal(Object.hasOwn(stopped.json, 'partialDir'), false, JSON.stringify(stopped.json))
  const recorded = JSON.parse(fs.readFileSync(path.join(dir, 'partial-paths.json'), 'utf8'))
  assert.deepEqual(recorded, { partialPaths: [], partialDir: null })
})

test('seat-stop of an Examiner reports a finished save when continued.json is absent (issue 103)', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t, { quota: geminiFirst() })
  const emptyId = 'examiner-20261106-120000-ab12'
  const emptyDir = seatDirOf(repo, emptyId)
  fs.mkdirSync(emptyDir, { recursive: true })
  fs.writeFileSync(path.join(emptyDir, 'partial-paths.json'), `${JSON.stringify({ partialPaths: [], partialDir: null })}\n`)
  const empty = runBin(LANE_BIN, ['seat-stop', emptyId], repo.dir, env)
  assert.deepEqual(empty.json.partialPaths, [])
  assert.equal(Object.hasOwn(empty.json, 'partialDir'), false, JSON.stringify(empty.json))
  assert.equal(Object.hasOwn(empty.json, 'continued'), false)
  assert.equal(Object.hasOwn(empty.json, 'partial'), false)

  const keptId = 'examiner-20261106-120001-ab13'
  const keptDir = seatDirOf(repo, keptId)
  fs.mkdirSync(keptDir, { recursive: true })
  const partialDir = path.join(keptDir, 'carry')
  fs.writeFileSync(path.join(keptDir, 'partial-paths.json'), `${JSON.stringify({ partialPaths: [EXAM_REL], partialDir })}\n`)
  const kept = runBin(LANE_BIN, ['seat-stop', keptId], repo.dir, env)
  assert.deepEqual(kept.json.partialPaths, [EXAM_REL])
  assert.equal(kept.json.partialDir, partialDir)
  assert.equal(JSON.stringify(kept.json).includes(EXAM_ONE), false)
})

test('seat-stop of an Examiner omits partialPaths when the save never finished (issue 103)', async (t) => {
  const repo = seatRepo(t)
  const { command } = witnessingCommand(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const message = lines('Write the exam.', `FAKE-AGY: write ${EXAM_REL} ${EXAM_ONE}`, 'FAKE-AGY: sleep 30')
  const digest = writeMessage(repo, message)
  const started = runBin(LANE_BIN, ['seat-start', 'examiner', '--session', 's1', '--feature', FEATURE, '--superdelegation', 'on', '--harnesses', 'agy', '--digest', digest], repo.dir, env)
  assert.equal(started.status, 0, started.stdout + started.stderr)
  const id = started.json.id
  const dir = seatDirOf(repo, id)
  const continued = path.join(dir, 'continued.json')
  const deadline = Date.now() + 20000
  while (Date.now() < deadline && !fs.existsSync(continued)) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(fs.existsSync(continued), 'the round got as far as recording that it is an examiner')
  const pid = Number.parseInt(fs.readFileSync(path.join(dir, 'pid'), 'utf8'), 10)
  try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ }
  try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  const until = Date.now() + 2000
  while (Date.now() < until) {
    try { process.kill(pid, 0) } catch { break }
  }
  assert.equal(fs.existsSync(path.join(dir, 'partial-paths.json')), false, 'killed before the partial was recorded')
  const stopped = runBin(LANE_BIN, ['seat-stop', id], repo.dir, env)
  assert.equal(Object.hasOwn(stopped.json, 'partialPaths'), false, JSON.stringify(stopped.json))
  assert.equal(Object.hasOwn(stopped.json, 'partialDir'), false)
  assert.equal(Object.hasOwn(stopped.json, 'partial'), false)
  releaseRepo(repo, id)
})

test('an Examiner round that finishes clears its offer (issue 103)', (t) => {
  const message = 'Write the exam.\n'
  const answer = { tests: [{ id: 'c2-readme', criterion: 'C2', command: 'test -f README.md', files: [] }], notes: 'none' }
  const { command, witness } = scriptedCommand(t, [
    lines(`FAKE-AGY: write ${EXAM_REL} ${EXAM_BODY.trim()}`, 'FAKE-AGY: exit-error boom'),
    lines(`FAKE-AGY: answer ${JSON.stringify(answer)}`),
    lines('FAKE-AGY: exit-error again'),
  ])
  const repo = seatRepo(t)
  const env = laneEnv(t, { command, quota: geminiFirst() })
  const base = ['examiner', '--session', 's1', '--feature', FEATURE]
  const failed = seat(repo.dir, base, env, message)
  assert.equal(failed.status, 4, failed.stdout + failed.stderr)
  assert.ok(fs.existsSync(path.join(failed.json.partialDir, EXAM_REL)))
  const done = seat(repo.dir, base, env, message)
  assert.equal(done.status, 0, done.stdout + done.stderr)
  assert.equal(fs.existsSync(failed.json.partialDir), false, 'a finished round clears the offer')
  const again = seat(repo.dir, base, env, message)
  assert.equal(again.status, 4, again.stdout + again.stderr)
  assert.equal(again.json.continued, false)
  assert.equal(turnsOf(witness).at(-1).files[EXAM_REL], undefined)
  assert.equal(turnsOf(witness).at(-1).prompt.includes(EXAMINER_CONTINUATION), false)
})

function withTimeout(t, seatName, seconds) {
  return (cfg) => {
    cfg.harnesses.agy.timeouts[seatName] = seconds
  }
}

test('a fast Examiner failure does not set timedOut, and one that runs past the timeout margin does (issue 103)', (t) => {
  const fast = seatOf(t, 'examiner', lines('Write the exam.', 'FAKE-AGY: exit-error boom'))
  assert.equal(fast.first.json.timedOut, undefined, JSON.stringify(fast.first.json.detail))
  const repo = seatRepo(t)
  const env = laneEnv(t, { quota: geminiFirst(), mutate: withTimeout(t, 'examiner', 32) })
  const slow = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], env, lines('Write the exam.', 'FAKE-AGY: sleep 3', 'FAKE-AGY: exit-error boom'))
  assert.equal(slow.status, 4, slow.stdout + slow.stderr)
  assert.equal(slow.json.timedOut, true, JSON.stringify(slow.json))
})

test('a harness killed by the runner timer yields timedOut (issue 103)', (t) => {
  const repo = seatRepo(t)
  const env = laneEnv(t, { quota: geminiFirst(), mutate: withTimeout(t, 'examiner', 1) })
  const started = Date.now()
  const killed = seat(repo.dir, ['examiner', '--session', 's1', '--feature', FEATURE], env, lines('Write the exam.', 'FAKE-AGY: sleep 120'))
  assert.equal(killed.status, 4, killed.stdout + killed.stderr)
  assert.equal(killed.json.timedOut, true, JSON.stringify(killed.json))
  assert.ok(Date.now() - started < 90000, 'the timer is the lane timeout plus the grace, not the sleep')
})

test('docs/guide/design-seats.md says a failed Writer hands its partial document to the next pair (issue 68)', () => {
  const guide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'guide', 'design-seats.md'), 'utf8')
  assert.ok(guide.includes(CONTINUATION))
  assert.ok(guide.includes('non-empty'))
  assert.ok(guide.includes('regular file'))
  assert.ok(/Judge/.test(guide) && /Examiner/.test(guide) && /carry nothing|keeps nothing|keep nothing/.test(guide))
  assert.ok(guide.includes('for each try'))
  assert.ok(guide.includes('native Writer'))
  assert.match(guide, /digest of (its|that) message/)
  assert.match(guide, /symlink/)
})
