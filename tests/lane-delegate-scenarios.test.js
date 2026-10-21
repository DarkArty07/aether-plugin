'use strict'

// The scenarios E1 to E8 and the no-candidate measure, run end to end through the real path:
// the aether-lane delegate bin, the router (route.begin/route.finish) and the aether-report bin,
// all on one data directory per test. No test writes the router journal or the lane log by hand:
// every entry is born from running the delegate command, the router, or the report bin.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { PLUGIN, WT_BIN, runBin, makeRepo, tempDir } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const pairs = require('../plugins/aether/lib/pairs.js')
const delegate = require('../plugins/aether/lib/lane-delegate.js')
const route = require('../plugins/aether/lib/route.js')
const log = require('../plugins/aether/lib/router-log.js')
const session = require('../plugins/aether/lib/session.js')

const REPORT_BIN = path.join(PLUGIN, 'bin', 'aether-report')
const FAKE_GROK = path.join(__dirname, 'fixtures', 'fake-grok.js')
const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote the file.', head: '', tests: 'ok', concerns: '', question: '' })
const READY = JSON.stringify({ verdict: 'ready', findings: [], declined: [], summary: 'The diff does what the brief asks.' })
const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/
const QUOTA_TEXT = 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.'
const OUTSIDE_MEASURE =
  'Calls the router never records are outside this measure: aether:* agents leave no journal entry, calls whose brief carries ROUTER-OVERRIDE: are recorded without a class, and a session without router settings records nothing. A delegate that edits by one of those routes is not listed, and that is a limit of the measure, not a no-candidate.'

const agyEnv = (t, options) => ({ ...fx.laneEnv(t, options), AETHER_LANE_HARNESSES: 'agy' })
const choicesOf = (env, role = null) => lanes.readLog(env.AETHER_DATA_DIR).filter((entry) => entry.kind === 'choice' && (role === null || entry.role === role))
const modelArgOf = (picked) => `${picked.model}-${picked.effort}`
const pairModelArg = (pairId) => {
  const [rest, effort] = [pairId.slice(pairId.indexOf('/') + 1, pairId.lastIndexOf('@')), pairId.slice(pairId.lastIndexOf('@') + 1)]
  return `${rest}-${effort}`
}

// Copied from tests/lane-delegate.test.js: a wrapper CLI that forwards to the fake agy, adding
// directives to the -p argument: a model failure or a quota refusal for the --model values named,
// and the review answer for a reviewer turn.
function roleFake(t, { failModels = [], quotaModels = [], reviewAnswer = READY, writeOnFail = null } = {}) {
  const file = path.join(tempDir(t, 'aether-role-fake-'), 'role-fake.js')
  const lines = [
    '#!/usr/bin/env node',
    "'use strict'",
    "const { spawnSync } = require('node:child_process')",
    'const argv = process.argv.slice(2)',
    "const at = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] }",
    "const pi = argv.indexOf('-p')",
    "if (pi !== -1 && argv[pi + 1] !== '/usage') {",
    "  const model = at('--model')",
    '  const extra = []',
    `  if (${JSON.stringify(failModels)}.includes(model)) {`,
    ...(writeOnFail ? [`    extra.push(${JSON.stringify(`FAKE-AGY: write ${writeOnFail}`)})`] : []),
    "    extra.push('FAKE-AGY: exit-error model not found: ' + model)",
    `  } else if (${JSON.stringify(quotaModels)}.includes(model)) {`,
    ...(writeOnFail ? [`    extra.push(${JSON.stringify(`FAKE-AGY: write ${writeOnFail}`)})`] : []),
    "    extra.push('FAKE-AGY: exit-code 3')",
    `    extra.push(${JSON.stringify(`FAKE-AGY: exit-error ${QUOTA_TEXT}`)})`,
    `  } else if (${JSON.stringify(reviewAnswer)} !== null && argv[pi + 1].startsWith(${JSON.stringify(fx.roleBody('reviewer').slice(0, 120))})) {`,
    `    extra.push('FAKE-AGY: answer ' + ${JSON.stringify(reviewAnswer)})`,
    '  }',
    "  if (extra.length > 0) argv[pi + 1] = argv[pi + 1] + '\\n' + extra.join('\\n')",
    '}',
    `const r = spawnSync(${JSON.stringify(fx.FAKE_AGY)}, argv, { stdio: 'inherit' })`,
    'process.exit(r.status === null ? 1 : r.status)',
  ]
  fs.writeFileSync(file, lines.join('\n') + '\n')
  fs.chmodSync(file, 0o755)
  return file
}

const briefLines = (extra = []) => [
  'Write src/new.js saying hello and commit it.',
  ...extra,
  'FAKE-AGY: write src/new.js hello',
  'FAKE-AGY: commit add new',
  `FAKE-AGY: answer ${DONE}`,
  'FAKE-GROK: write src/new.js hello',
  `FAKE-GROK: answer ${DONE}`,
]

const docBriefLines = () => [
  'Write docs/note.md saying hello and commit it.',
  'FAKE-AGY: write docs/note.md hello',
  'FAKE-AGY: commit add note',
  `FAKE-AGY: answer ${DONE}`,
]

function writeBrief(repo, lines) {
  const file = path.join(repo.dir, 'brief.md')
  fs.writeFileSync(file, lines.join('\n') + '\n')
  repo.git('add', 'brief.md')
  repo.git('commit', '-q', '-m', 'brief')
  return file
}

function runDelegate(repo, env, { brief, model = 'haiku', effort = 'high', owns = 'src/**', tests = null, session = 's1' } = {}) {
  const args = ['delegate', '--brief', brief, '--model', model, '--effort', effort, '--owns', owns]
  if (tests !== null) args.push('--tests', tests)
  if (session !== null) args.push('--session', session)
  return runBin(fx.LANE_BIN, args, repo.dir, env)
}

// One successful delegate run in its own repository, to learn which pairs the choice picks there.
function probe(t) {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const brief = writeBrief(repo, briefLines())
  const r = runDelegate(repo, env, { brief, tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  return { choices: choicesOf(env) }
}

// The router setup of tests/router-route.test.js (settings, readings, finish), adapted to a data
// directory the caller names: the delegate command's AETHER_DATA_DIR.
const NOW = Date.parse('2026-10-15T21:32:00-06:00')
const H = 3600 * 1000
const MIN = 60 * 1000
const win = (remaining, hours) => ({ remaining, resetsAt: new Date(NOW + hours * H).toISOString() })
const weekly = (remaining, hours) => ({ windows: { weekly: win(remaining, hours) } })
const gemini = (remaining, hours) => ({ windows: { '5h': win(1, 5), weekly: win(remaining, hours) } })
const geminiKeys = (remaining, hours) => ({ argon: gemini(remaining, hours), flash: gemini(remaining, hours) })
const READINGS = {
  agy: { readAt: NOW - 2 * MIN, groups: { ...geminiKeys(1, 60), claude: weekly(0.9, 80) } },
  grok: { readAt: NOW - MIN, groups: { grok: weekly(0.95, 29.6) } },
}

function routerDeps(dataDir, { mode = 'record' } = {}) {
  const settings = {
    mode, decider: 'haiku', fallback: { alias: 'sonnet', effort: 'high' }, deadlines: { haikuMs: 8000, jevMs: 3000, quotaMs: 3000 },
    lanes: true, harnesses: ['agy', 'grok'],
  }
  session.markSession(dataDir, 's1', NOW, { router: settings })
  let n = 0
  const clock = { t: NOW }
  return {
    dataDir, clock,
    now: () => clock.t,
    sleep: async (ms) => { clock.t += ms },
    newId: () => `r${++n}`,
    readings: () => READINGS,
    marks: () => [],
    renew: () => ({ started: true, running: true }),
    installed: () => true,
  }
}

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
const readOnlyAnswer = () => JSON.stringify(answers())
const editsAnswer = () => JSON.stringify(answers({ shape: { choice: 'mechanical_edit', confidence: 0.95 }, edits_files: { noul: 0.98, confidence: 0.95 } }))

async function go(deps, ev, answer) {
  const first = await route.begin({ session: 's1', event: ev }, deps)
  if (!first.ask) return first
  return route.finish({ id: first.id, answer }, deps)
}
const journal = (dataDir) => log.readJournal(dataDir).filter((e) => e.kind === 'decision')

// An environment with agy and grok enabled against their fakes, one place each, as in
// tests/lane-delegate.test.js.
function twoHarnessEnv(t) {
  fs.chmodSync(FAKE_GROK, 0o755)
  const env = fx.laneEnv(t, {
    command: roleFake(t),
    mutate: (config) => {
      config.harnesses.grok.command = FAKE_GROK
      config.harnesses.agy.maxParallel = 1
      config.harnesses.grok.maxParallel = 1
    },
  })
  const logFile = path.join(env.HOME, '.grok', 'logs', 'unified.jsonl')
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  const entry = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'grok-billing.jsonl'), 'utf8').trim().split('\n')[1])
  entry.ts = new Date(Date.now() - 5 * 60000).toISOString()
  entry.ctx.config.currentPeriod.end = new Date(Date.now() + 50 * 3600000).toISOString()
  entry.ctx.config.creditUsagePercent = 30
  fs.writeFileSync(logFile, `${JSON.stringify(entry)}\n`)
  return { ...env, AETHER_LANE_HARNESSES: 'agy,grok', AETHER_FAKE_GROK_LOG: path.join(path.dirname(env.HOME), 'grok.log') }
}

test('E1: a small editing charge leaves Claude for an external pair, comes back as a unit branch, and after the merge the charge test command passes in the repository', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const brief = writeBrief(repo, briefLines())
  const headBefore = repo.git('rev-parse', 'HEAD')
  const tests = 'node -e "const fs=require(\'fs\');process.exit(fs.readFileSync(\'src/new.js\',\'utf8\').trim()===\'hello\'?0:1)"'
  const r = runDelegate(repo, env, { brief, tests })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const json = r.json
  assert.equal(json.status, 'done')
  assert.ok(RUN_ID.test(json.id) && json.run === json.id)
  assert.equal(json.pair.harness, 'agy')
  assert.equal(json.branch, 'aether/' + json.id + '/task-1')
  assert.equal(repo.git('show', `${json.branch}:src/new.js`), 'hello')
  assert.equal(repo.git('status', '--porcelain'), '', "the owner's checkout is untouched")
  assert.equal(repo.git('rev-parse', 'HEAD'), headBefore)
  assert.equal(json.tests.passed, true)
  assert.equal(json.review.status, 'done')
  assert.equal(json.review.verdict, 'ready')
  assert.notEqual(json.review.pair.id, json.pair.id, 'the reviewer is not the pair that wrote')
  assert.equal(json.merge,`aether-wt merge ${json.id} task-1`)
  const merged = runBin(WT_BIN, ['merge', json.id, 'task-1'], repo.dir, env)
  assert.equal(merged.json.merged, true, merged.stdout + merged.stderr)
  const after = spawnSync(tests, { shell: true, cwd: repo.dir, encoding: 'utf8' })
  assert.equal(after.status, 0, `the charge test command passes in the repository after the merge: ${after.stdout}${after.stderr}`)
})

test('E2: with scaled timeouts the delegate command runs whole in its own process and no child of the attempt is left alive', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, {
    command: roleFake(t),
    mutate: (config) => {
      for (const harness of Object.values(config.harnesses)) harness.timeouts.implementer = 3
    },
  })
  const brief = writeBrief(repo, briefLines(['FAKE-AGY: sleep 2']))
  const r = runDelegate(repo, env, { brief })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.status, 'done')
  const callFile = path.join(repo.dir, '.aether', 'runs', r.json.id, 'lanes', 'task-1-1-implement', 'call.json')
  assert.equal(JSON.parse(fs.readFileSync(callFile, 'utf8')).timeoutSeconds, 3, 'the lane timeout, not a smaller delegate cap')
  const turns = fx.agyTurns(env)
  assert.ok(turns.some((entry) => entry.argv[1].startsWith(fx.roleBody('implementer'))), 'the implementer turn completed')
  assert.ok(turns.some((entry) => entry.argv[1].startsWith(fx.roleBody('reviewer'))), 'the reviewer turn completed')
  // The runner removes its pid files when a call ends, so liveness is read from the processes
  // themselves: every process of a lane call carries AETHER_LANE_CALL=<runId>/<call> in its
  // environment, and killMarked returns the markers it finds alive (and ends them).
  const calls = fs.readdirSync(path.join(repo.dir, '.aether', 'runs', r.json.id, 'lanes'))
  assert.ok(calls.includes('task-1-1-implement') && calls.some((call) => call.startsWith('task-1-review-')), `the scan covers the implementer and reviewer calls: ${calls.join(', ')}`)
  assert.deepEqual(lanes.killMarked(`${r.json.id}/`, { prefix: true }), [], 'no process of the attempt is alive when the command returns')

  // Control: the same scan does find a live process that carries a marker of that shape, so an
  // empty answer above means nothing was alive and not that the scan cannot see.
  const controlPrefix = `${r.json.id}-control/`
  const control = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    env: { ...process.env, AETHER_LANE_CALL: `${controlPrefix}task-1-1-implement` },
    stdio: 'ignore',
    detached: true,
  })
  t.after(() => {
    try {
      process.kill(-control.pid, 'SIGKILL')
    } catch {
      // Gone already.
    }
  })
  assert.deepEqual(lanes.killMarked(controlPrefix, { prefix: true }), [`${controlPrefix}task-1-1-implement`], 'the scan sees a live marked process')
})

test('a delegate command that is killed ends its calls: no process of the attempt is left to spend quota', async (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const brief = writeBrief(repo, briefLines(['FAKE-AGY: sleep 25']))
  const child = spawn(process.execPath, [fx.LANE_BIN, 'delegate', '--brief', brief, '--model', 'haiku', '--effort', 'high', '--owns', 'src/**', '--session', 's1'], { cwd: repo.dir, env, stdio: 'ignore' })
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  t.after(() => {
    try {
      child.kill('SIGKILL')
    } catch {
      // Gone already.
    }
  })
  const runsDir = path.join(repo.dir, '.aether', 'runs')
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  let id = null
  for (let k = 0; k < 100 && id === null; k++) {
    const found = fs.existsSync(runsDir) ? fs.readdirSync(runsDir).find((name) => fs.existsSync(path.join(runsDir, name, 'lanes', 'task-1-1-implement', 'call.json'))) : undefined
    if (found) id = found
    else await sleep(100)
  }
  assert.ok(id, 'the implementer call started')
  await sleep(1500)
  child.kill('SIGTERM')
  const ended = await exited
  assert.equal(ended.code, 143, `the command left with 143, not ${JSON.stringify(ended)}`)
  assert.deepEqual(lanes.killMarked(`${id}/`, { prefix: true }), [], 'no process of the attempt is alive after the command was killed')
})

test('E3: a pair that runs out of quota mid-way passes to the next pair, and with no candidate left the charge ends as no-candidate', (t) => {
  const { choices } = probe(t)
  const first = choices.find((entry) => entry.role === 'implementer').picked
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t, { quotaModels: [modelArgOf(first)], writeOnFail: 'src/attempt.js attempt-one' }) })
  const brief = writeBrief(repo, briefLines())
  const r = runDelegate(repo, env, { brief, tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.notEqual(r.json.pair.id, first.id, 'the pair that finishes is not the one that failed')
  assert.equal(r.json.tried.length, 1)
  assert.deepEqual([r.json.tried[0].pair, r.json.tried[0].cause], [first.id, 'quota'])
  const patch = r.json.tried[0].patch
  assert.ok(patch.includes(path.join('runs', r.json.id, 'patches', 'task-1-attempt-1.patch')), patch)
  assert.ok(fs.readFileSync(patch, 'utf8').includes('attempt-one'))
  assert.ok(!repo.git('ls-tree', '-r', '--name-only', r.json.branch).includes('src/attempt.js'), 'the failed attempt worktree is gone: its file is not on the branch')

  // The variant with no candidate left: the only pair that reaches runs out of quota.
  const table = pairs.loadPairs()
  const only = { fetchedAt: table.fetchedAt, pairs: table.pairs.filter((pair) => pair.harness === 'claude' || pair.id === 'agy/claude-opus-5-5@high') }
  const pairsFile = path.join(tempDir(t, 'aether-pairs-'), 'pairs.json')
  fs.writeFileSync(pairsFile, JSON.stringify(only))
  const lone = makeRepo(t)
  const loneEnv = { ...agyEnv(t, { command: roleFake(t, { quotaModels: [pairModelArg('agy/claude-opus-5-5@high')], writeOnFail: 'src/attempt.js attempt-one' }) }), AETHER_PAIRS_CONFIG: pairsFile }
  const loneBrief = writeBrief(lone, briefLines())
  const gone = runDelegate(lone, loneEnv, { brief: loneBrief })
  assert.equal(gone.status, 0, gone.stdout + gone.stderr)
  assert.equal(gone.json.status, 'no-candidate')
  assert.ok(RUN_ID.test(gone.json.id))
  assert.deepEqual([gone.json.tried[0].pair, gone.json.tried[0].cause], ['agy/claude-opus-5-5@high', 'quota'])
  assert.ok(fs.readFileSync(gone.json.tried[0].patch, 'utf8').includes('attempt-one'))
  assert.equal(fs.existsSync(path.join(lone.dir, '.aether', 'worktrees', gone.json.id, 'task-1')), false, 'the attempt worktree is gone')
  const entry = lanes.readLog(loneEnv.AETHER_DATA_DIR).find((item) => item.kind === 'delegate')
  assert.deepEqual([entry.id, entry.status], [gone.json.id, 'no-candidate'])
})

test('E4: an unreachable reference ends as no-candidate with the no-pair cause, logged under its id, with no external turn and no question', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const brief = writeBrief(repo, briefLines())
  const headBefore = repo.git('rev-parse', 'HEAD')
  const r = runDelegate(repo, env, { brief, model: 'opus', effort: 'max' })
  assert.equal(r.status, 0, 'the bin ends on its own, with no interactive input: ' + r.stdout + r.stderr)
  assert.equal(r.json.status, 'no-candidate')
  assert.equal(r.json.cause, 'no-pair')
  assert.ok(RUN_ID.test(r.json.id))
  const entry = lanes.readLog(env.AETHER_DATA_DIR).find((item) => item.kind === 'delegate')
  assert.ok(entry)
  assert.deepEqual([entry.id, entry.run, entry.status, entry.cause], [r.json.id, r.json.id, 'no-candidate', 'no-pair'])
  assert.equal(fx.agyTurns(env).length, 0, 'nothing ran outside')
  assert.equal(repo.git('status', '--porcelain'), '')
  assert.equal(repo.git('rev-parse', 'HEAD'), headBefore)
})

test('E5: a documentation brief without a test command, with a reviewer, without one, and with tests but no verdict', (t) => {
  const withReview = makeRepo(t)
  const envA = agyEnv(t, { command: roleFake(t) })
  const a = runDelegate(withReview, envA, { brief: writeBrief(withReview, docBriefLines()), owns: 'docs/**' })
  assert.equal(a.json?.status, 'done', a.stdout + a.stderr)
  assert.equal(a.json.tests, null)
  assert.equal(a.json.review.status, 'done')
  assert.equal(a.json.review.verdict, 'ready')

  const table = pairs.loadPairs()
  const only = { fetchedAt: table.fetchedAt, pairs: table.pairs.filter((pair) => pair.harness === 'claude' || pair.id === 'agy/claude-opus-5-5@high') }
  const pairsFile = path.join(tempDir(t, 'aether-pairs-'), 'pairs.json')
  fs.writeFileSync(pairsFile, JSON.stringify(only))
  const noReviewer = makeRepo(t)
  const envB = { ...agyEnv(t, { command: roleFake(t) }), AETHER_PAIRS_CONFIG: pairsFile }
  const b = runDelegate(noReviewer, envB, { brief: writeBrief(noReviewer, docBriefLines()), owns: 'docs/**' })
  assert.equal(b.json?.status, 'done', b.stdout + b.stderr)
  assert.equal(b.json.tests, null)
  assert.equal(b.json.review.status, 'none')

  const { choices } = probe(t)
  const reviewChoice = choices.find((entry) => entry.role === 'reviewer')
  const failModels = reviewChoice.candidates.filter((candidate) => candidate.outcome !== 'passed').map((candidate) => pairModelArg(candidate.id))
  const noVerdict = makeRepo(t)
  const envC = agyEnv(t, { command: roleFake(t, { failModels, reviewAnswer: null }) })
  const c = runDelegate(noVerdict, envC, { brief: writeBrief(noVerdict, docBriefLines()), owns: 'docs/**', tests: 'true' })
  assert.equal(c.json?.status, 'done', c.stdout + c.stderr)
  assert.equal(c.json.tests.passed, true)
  assert.equal(c.json.review.status, 'no-verdict')
})

test('E6: with superdelegation off the delegate command does nothing, and the router in the same environment still decides Claude for an editing task', async (t) => {
  const repo = makeRepo(t)
  const env = { ...agyEnv(t, { command: roleFake(t) }), AETHER_SUPERDELEGATION: 'off' }
  const brief = writeBrief(repo, briefLines())
  const before = lanes.readLog(env.AETHER_DATA_DIR).length
  const r = runDelegate(repo, env, { brief })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json, { status: 'off', reason: 'option' })
  assert.equal(fx.agyTurns(env).length, 0)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'runs')), false, 'no run was created')
  assert.equal(lanes.readLog(env.AETHER_DATA_DIR).length, before, 'no new lane log entries')

  const deps = routerDeps(env.AETHER_DATA_DIR, { mode: 'command' })
  const plan = await go(deps, { subagent_type: 'general-purpose', description: 'Rename fetchUser', prompt: 'Rename fetchUser to loadUser everywhere.' }, editsAnswer())
  assert.equal(plan.external, null, 'an editing delegate stays on Claude, as today')
  assert.ok(['haiku', 'sonnet', 'opus'].includes(plan.args.model), JSON.stringify(plan.args))
  assert.equal(journal(env.AETHER_DATA_DIR)[0].decision.harness, 'claude')
})

test('E7: a full cupo on one harness sends the charge to the other, and with every harness full the charge ends as no-candidate with the cupo cause', (t) => {
  const bySlot = makeRepo(t)
  const slotEnv = twoHarnessEnv(t)
  const briefA = writeBrief(bySlot, briefLines())
  const held = delegate.acquireSlot(slotEnv.AETHER_DATA_DIR, 'agy', 1, {})
  assert.ok(held)
  const a = runDelegate(bySlot, slotEnv, { brief: briefA })
  delegate.releaseSlot(slotEnv.AETHER_DATA_DIR, 'agy', held.slot)
  assert.equal(a.json?.status, 'done', a.stdout + a.stderr)
  assert.equal(a.json.pair.harness, 'grok')

  const full = makeRepo(t)
  const fullEnv = twoHarnessEnv(t)
  const briefB = writeBrief(full, briefLines())
  const heldAgy = delegate.acquireSlot(fullEnv.AETHER_DATA_DIR, 'agy', 1, {})
  const heldGrok = delegate.acquireSlot(fullEnv.AETHER_DATA_DIR, 'grok', 1, {})
  assert.ok(heldAgy && heldGrok)
  const b = runDelegate(full, fullEnv, { brief: briefB })
  delegate.releaseSlot(fullEnv.AETHER_DATA_DIR, 'agy', heldAgy.slot)
  delegate.releaseSlot(fullEnv.AETHER_DATA_DIR, 'grok', heldGrok.slot)
  assert.equal(b.status, 0, b.stdout + b.stderr)
  assert.equal(b.json.status, 'no-candidate')
  assert.equal(b.json.cause, 'cupo')
  assert.ok(b.json.tried.some((entry) => entry.pair === null && entry.harness === 'agy' && entry.cause === 'cupo'))
  const entry = lanes.readLog(fullEnv.AETHER_DATA_DIR).find((item) => item.kind === 'delegate')
  assert.deepEqual([entry.id, entry.cause], [b.json.id, 'cupo'])
  assert.equal(fx.agyTurns(fullEnv).length, 0)
})

test('E8: the environment the fake dumps carries no secrets, and every turn ran inside .aether/worktrees/ or .aether/lanes/, never the repository', (t) => {
  const repo = makeRepo(t)
  const envFile = path.join(tempDir(t), 'agy-env.json')
  const env = { ...agyEnv(t, { command: roleFake(t) }), AETHER_TEST_SECRET_TOKEN: 'x', ANTHROPIC_API_KEY: 'x' }
  const brief = writeBrief(repo, briefLines([`FAKE-AGY: env ${envFile}`]))
  const r = runDelegate(repo, env, { brief })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  const seen = JSON.parse(fs.readFileSync(envFile, 'utf8'))
  assert.ok(Object.keys(seen).length > 0, 'the fake dumped an environment')
  assert.deepEqual(Object.keys(seen).filter((name) => !fx.allowedEnvName(name)), [])
  const turns = fx.agyTurns(env)
  assert.ok(turns.length >= 2, 'the implementer and reviewer turns ran')
  for (const turn of turns) {
    assert.notEqual(turn.cwd, repo.dir)
    const inside = turn.cwd.includes(`${path.sep}.aether${path.sep}worktrees${path.sep}`) || turn.cwd.includes(`${path.sep}.aether${path.sep}lanes${path.sep}`)
    assert.ok(inside, `the turn ran inside .aether/worktrees/ or .aether/lanes/: ${turn.cwd}`)
  }
})

test('the measure by the real path: only the editing delegation on Claude with no no-candidate behind it is listed (R16, R18)', async (t) => {
  const repo = makeRepo(t)
  const HOUR = 3600 * 1000
  const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString()
  const dry = { 'Gemini Models': [0.9, 0.02, null, inHours(40)], 'Claude and GPT models': [0.9, 0.02, null, inHours(40)] }
  const env = agyEnv(t, { command: roleFake(t), quota: dry })
  const dataDir = env.AETHER_DATA_DIR

  // (a) The delegate command, with the quota dry: a no-candidate and its id, in the lane log.
  const brief = writeBrief(repo, briefLines())
  const a = runDelegate(repo, env, { brief })
  assert.equal(a.json?.status, 'no-candidate', a.stdout + a.stderr)
  assert.equal(a.json.cause, 'dry')
  const taskId = a.json.id
  assert.ok(RUN_ID.test(taskId))

  const deps = routerDeps(dataDir, { mode: 'record' })
  const ev = (description, prompt, over = {}) => ({ subagent_type: 'general-purpose', description, prompt, ...over })

  // (b) A native editing call whose brief carries that id, after more than 400 characters of filler.
  const filler = 'Filler for the brief. '.repeat(30)
  const withId = `${filler}\nAETHER-TASK: ${taskId}\nRename fetchUser to loadUser everywhere.`
  assert.ok(withId.indexOf('AETHER-TASK:') > 400)
  await go(deps, ev('edits behind the no-candidate', withId), editsAnswer())

  // (c) Another native editing call with no such line and no model or effort asked, in record mode:
  // its real journal entry keeps ranOn null, and the measure has to count it as Claude.
  await go(deps, ev('edits with nothing behind it', 'Rename fetchUser to loadUser everywhere.'), editsAnswer())

  // (d) A read-only call.
  await go(deps, ev('reads only', 'Read src/ and report each call that skips the retry wrapper.'), readOnlyAnswer())

  // (e) An aether:* call: the router skips it and it leaves no entry.
  const beforeSkip = journal(dataDir).length
  const skipped = await route.begin({ session: 's1', event: ev('an aether implementer', 'Rename fetchUser to loadUser everywhere.', { subagent_type: 'aether:implementer' }) }, deps)
  assert.equal(skipped.skip, true)
  assert.equal(journal(dataDir).length, beforeSkip)

  // (f) A native editing call whose brief carries ROUTER-OVERRIDE: and the AETHER-TASK: line.
  await route.begin({ session: 's1', event: ev('edits by override', `Rename fetchUser to loadUser everywhere.\nROUTER-OVERRIDE: the Lead keeps this one native\nAETHER-TASK: ${taskId}`) }, deps)

  const entries = journal(dataDir)
  const counted = entries.find((e) => e.description === 'edits with nothing behind it')
  assert.ok(counted, 'the record-mode editing call is in the journal the router wrote')
  assert.equal(counted.ranOn, null, 'its real journal entry keeps ranOn null')
  assert.equal(counted.taskClass, 'edits')
  assert.equal(counted.requested, null)
  const behind = entries.find((e) => e.description === 'edits behind the no-candidate')
  assert.equal(behind.aetherTask, taskId, 'the id was read from the whole brief, past the 400 characters of filler')
  assert.equal(entries.find((e) => e.description === 'reads only').taskClass, 'read-only')
  const override = entries.find((e) => e.description === 'edits by override')
  assert.equal(override.taskClass, null)
  assert.equal(override.aetherTask, taskId)

  const report = runBin(REPORT_BIN, ['--delegates', '--session', 's1'], repo.dir, env)
  assert.equal(report.status, 0, report.stdout + report.stderr)
  const listed = report.json.editsOnClaudeWithoutNoCandidate
  assert.equal(listed.length, 1, JSON.stringify(listed))
  assert.equal(listed[0].description, 'edits with nothing behind it')
  assert.equal(listed[0].id, counted.id)
  assert.equal(listed[0].session, 's1')
  assert.equal(listed[0].aetherTask, null)
  assert.equal(listed[0].ranOn, null)
  assert.equal(report.json.outsideMeasure, OUTSIDE_MEASURE)
})

