'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, WT_BIN, runBin, makeRepo, tempDir } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const pairs = require('../plugins/aether/lib/pairs.js')
const calls = require('../plugins/aether/lib/lane-calls.js')
const delegate = require('../plugins/aether/lib/lane-delegate.js')

const LANE_DELEGATE_JS = path.join(PLUGIN, 'lib', 'lane-delegate.js')
const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote src/new.js.', head: '', tests: 'ok', concerns: '', question: '' })
const READY = JSON.stringify({ verdict: 'ready', findings: [], declined: [], summary: 'The diff does what the brief asks.' })
const RUN_ID = /^\d{8}-\d{6}-[0-9a-f]{4}$/
const QUOTA_TEXT = 'Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 163h22m27s.'

// The lanes of these tests are agy's alone unless a test names more, whatever the shell exports.
const agyEnv = (t, options) => ({ ...fx.laneEnv(t, options), AETHER_LANE_HARNESSES: 'agy' })
const choicesOf = (env, role = null) => lanes.readLog(env.AETHER_DATA_DIR).filter((entry) => entry.kind === 'choice' && (role === null || entry.role === role))
const modelArgOf = (picked) => `${picked.model}-${picked.effort}`
const pairModelArg = (pairId) => {
  const [rest, effort] = [pairId.slice(pairId.indexOf('/') + 1, pairId.lastIndexOf('@')), pairId.slice(pairId.lastIndexOf('@') + 1)]
  return `${rest}-${effort}`
}

// A wrapper CLI that forwards to the fake agy, adding directives to the -p argument: a model failure
// or a quota refusal for the --model values named, and the review answer for a reviewer turn.
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

// The sentence the swarm already tells a pair that takes over a unit (run.workflow.js).
const CONTINUATION = 'Its uncommitted work, if any, is in the worktree. Continue from it.'

// The implementer candidates of a probe, in the order the choice would try them.
function implementerIds(choices) {
  const choice = choices.find((entry) => entry.role === 'implementer')
  return [choice.picked.id, ...choice.candidates.filter((candidate) => candidate.outcome === 'next').map((candidate) => candidate.id)]
}

function implementerModels(choices) {
  return implementerIds(choices).map(pairModelArg)
}

// A life of 0 is not cached, so the start of an attempt reads /usage instead of the choice's reading.
function noQuotaCache(config) {
  config.harnesses.agy.quotaLifeMinutes = 0
}

function promptOf(repo, id, attempt) {
  return fs.readFileSync(path.join(repo.dir, '.aether', 'runs', id, 'lanes', `task-1-${attempt}-implement`, 'prompt.md'), 'utf8')
}

function witnessLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

// A wrapper that records the unit worktree as the pair's process starts, then adds failure
// directives. The record is the tree the pair sees, before its own directives run.
function witnessingFake(t, { failModels = [], quotaModels = [], writes = {}, witness, clash = null, interfere = null, plantOutside = false, recordReceipt = false } = {}) {
  const file = path.join(tempDir(t, 'aether-witness-fake-'), 'witness-fake.js')
  // Start reads /usage after the attempt's prompt is on disk and before it creates the worktree.
  // The marker makes that happen once: the choice of the pair after it also reads /usage, and
  // prompt of the attempt that was just refused is the newest one on disk then.
  const marker = path.join(path.dirname(witness), 'interfere-once')
  const lines = [
    '#!/usr/bin/env node',
    "'use strict'",
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    "const { spawnSync } = require('node:child_process')",
    'const argv = process.argv.slice(2)',
    "const at = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] }",
    'function listTree(dir, prefix) {',
    '  const out = {}',
    '  for (const name of fs.readdirSync(dir)) {',
    "    if (name === '.git' || name === '.aether-tmp') continue",
    "    const rel = prefix ? prefix + '/' + name : name",
    '    const full = path.join(dir, name)',
    '    if (fs.statSync(full).isDirectory()) Object.assign(out, listTree(full, rel))',
    "    else out[rel] = fs.readFileSync(full, 'utf8')",
    '  }',
    '  return out',
    '}',
    "const pi = argv.indexOf('-p')",
    `if (pi !== -1 && argv[pi + 1] === '/usage' && ${JSON.stringify(interfere)} !== null) {`,
    "  const runsDir = path.join(process.cwd(), '.aether', 'runs')",
    '  const ids = fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : []',
    '  for (const id of ids) {',
    "    const lanes = path.join(runsDir, id, 'lanes')",
    "    if (!fs.existsSync(path.join(lanes, 'task-1-2-implement', 'prompt.md'))) continue",
    "    if (fs.existsSync(path.join(lanes, 'task-1-3-implement', 'prompt.md'))) continue",
    `    if (fs.existsSync(${JSON.stringify(marker)})) break`,
    `    fs.writeFileSync(${JSON.stringify(marker)}, '1')`,
    `    if (${JSON.stringify(interfere)} === 'poison') {`,
    "      const wt = path.join(process.cwd(), '.aether', 'worktrees', id, 'task-1')",
    "      fs.mkdirSync(wt, { recursive: true })",
    "      fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /nope\\n')",
    `    } else if (${JSON.stringify(interfere)} === 'clash') {`,
    "      const target = path.join(process.cwd(), 'src', 'attempt.js')",
    "      fs.mkdirSync(path.dirname(target), { recursive: true })",
    "      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== 'from-integration\\n') {",
    "        fs.writeFileSync(target, 'from-integration\\n')",
    "        spawnSync('git', ['add', 'src/attempt.js'], { cwd: process.cwd() })",
    "        spawnSync('git', ['commit', '-q', '-m', 'conflict on integration'], { cwd: process.cwd() })",
    '      }',
    '    }',
    '  }',
    '}',
    "if (pi !== -1 && argv[pi + 1] !== '/usage') {",
    "  const model = at('--model')",
    '  const prompt = argv[pi + 1]',
    "  const implementer = prompt.includes('## Paths you own')",
    '  if (implementer) {',
    '    const entry = { model, files: listTree(process.cwd(), \'\') }',
    `    if (${JSON.stringify(recordReceipt)}) {`,
    "      let receipt = null",
    '      try {',
    "        const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim()",
    '        const main = path.dirname(common)',
    '        const runId = path.basename(path.dirname(process.cwd()))',
    "        receipt = fs.readFileSync(path.join(main, '.aether', 'runs', runId, 'carry', 'task-1.result.json'), 'utf8')",
    '      } catch { receipt = null }',
    '      entry.receipt = receipt',
    '    }',
    `    fs.appendFileSync(${JSON.stringify(witness)}, JSON.stringify(entry) + '\\n')`,
    '  }',
    '  const extra = []',
    '  if (implementer) {',
    `    if (${JSON.stringify(plantOutside)} && ${JSON.stringify(failModels)}.includes(model)) {`,
    "      fs.mkdirSync(path.join(process.cwd(), 'docs'), { recursive: true })",
    "      fs.mkdirSync(path.join(process.cwd(), 'notes'), { recursive: true })",
    "      fs.mkdirSync(path.join(process.cwd(), 'src'), { recursive: true })",
    `      fs.writeFileSync(path.join(process.cwd(), 'docs', 'Screen Shot.png'), Buffer.from(${JSON.stringify([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])}))`,
    "      fs.writeFileSync(path.join(process.cwd(), 'notes', 'new file.txt'), '')",
    "      fs.writeFileSync(path.join(process.cwd(), 'src', 'a.js'), 'kept\\n')",
    '    }',
    `    for (const spec of (${JSON.stringify(writes)}[model] || [])) extra.push('FAKE-AGY: write ' + spec)`,
    `    if (${JSON.stringify(clash)} === model) {`,
    "      const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim()",
    '      const main = path.dirname(common)',
    "      fs.mkdirSync(path.join(main, 'src'), { recursive: true })",
    "      fs.writeFileSync(path.join(main, 'src', 'conflict.js'), 'from-integration\\n')",
    "      spawnSync('git', ['add', 'src/conflict.js'], { cwd: main })",
    "      spawnSync('git', ['commit', '-q', '-m', 'conflict on integration'], { cwd: main })",
    '    }',
    `    if (${JSON.stringify(failModels)}.includes(model)) extra.push('FAKE-AGY: exit-error model not found: ' + model)`,
    `    else if (${JSON.stringify(quotaModels)}.includes(model)) {`,
    "      extra.push('FAKE-AGY: exit-code 3')",
    `      extra.push(${JSON.stringify(`FAKE-AGY: exit-error ${QUOTA_TEXT}`)})`,
    '    }',
    '  }',
    "  if (extra.length > 0) argv[pi + 1] = prompt + '\\n' + extra.join('\\n')",
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

// The charge: a brief file committed in the toy repository, so the owner's checkout starts clean.
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
function probe(t, { quota = null, pairsFile = null } = {}) {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t), quota })
  if (pairsFile) env.AETHER_PAIRS_CONFIG = pairsFile
  const brief = writeBrief(repo, briefLines())
  const r = runDelegate(repo, env, { brief, tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  return { repo, env, result: r.json, choices: choicesOf(env) }
}

test('a small editing charge leaves Claude for an external pair and comes back as a unit branch the Lead merges (E1)', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const brief = writeBrief(repo, briefLines())
  const headBefore = repo.git('rev-parse', 'HEAD')
  const r = runDelegate(repo, env, { brief, tests: 'node -e "process.exit(0)"' })
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
  assert.notEqual(json.review.pair.id, json.pair.id, 'the reviewer is not the pair that wrote')
  assert.equal(json.review.verdict, 'ready')
  assert.equal(json.merge, `aether-wt merge ${json.id} task-1`)
  const merged = runBin(WT_BIN, ['merge', json.id, 'task-1'], repo.dir, env)
  assert.equal(merged.json.merged, true, merged.stdout + merged.stderr)
})

test('the CLI runs in the unit worktree with the lane environment, never the owner checkout or its secrets (E8)', (t) => {
  const repo = makeRepo(t)
  const envFile = path.join(tempDir(t), 'agy-env.json')
  const env = { ...agyEnv(t, { command: roleFake(t) }), AETHER_TEST_SECRET_TOKEN: 'x', ANTHROPIC_API_KEY: 'x' }
  const brief = writeBrief(repo, briefLines([`FAKE-AGY: env ${envFile}`]))
  const r = runDelegate(repo, env, { brief })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  const seen = JSON.parse(fs.readFileSync(envFile, 'utf8'))
  assert.deepEqual(Object.keys(seen).filter((name) => !fx.allowedEnvName(name)), [])
  const turn = fx.agyTurns(env).find((entry) => entry.argv[1].startsWith(fx.roleBody('implementer')))
  assert.equal(turn.cwd, r.json.worktree)
  assert.notEqual(turn.cwd, repo.dir)
})

test('the CLI limit and the wait are the lane ones, never the delegate caps (R7, E2)', async (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const brief = writeBrief(repo, briefLines())
  const seen = []
  const wait = async (cwd, runId, call, opts) => {
    seen.push({ call, maxSeconds: opts.maxSeconds })
    return calls.wait(cwd, runId, call, opts)
  }
  const result = await delegate.delegateCommand(repo.dir, { brief, model: 'haiku', effort: 'high', owns: 'src/**', tests: 'node -e "process.exit(0)"', session: 's' }, { env, wait })
  assert.equal(result.status, 'done')
  assert.equal(seen.find((entry) => entry.call.endsWith('-implement')).maxSeconds, 2700 + 180)
  assert.equal(seen.find((entry) => entry.call.includes('-review-')).maxSeconds, 1200 + 180)
  const callFile = path.join(repo.dir, '.aether', 'runs', result.id, 'lanes', 'task-1-1-implement', 'call.json')
  assert.equal(JSON.parse(fs.readFileSync(callFile, 'utf8')).timeoutSeconds, 2700)
  const turn = fx.agyTurns(env).find((entry) => entry.argv[1].startsWith(fx.roleBody('implementer')))
  assert.equal(fx.argAfter(turn.argv, '--print-timeout'), '2700s')
  assert.ok(!fs.readFileSync(LANE_DELEGATE_JS, 'utf8').includes('delegate-limits'))

  const slowRepo = makeRepo(t)
  const slowEnv = agyEnv(t, {
    command: roleFake(t),
    mutate: (config) => {
      for (const harness of Object.values(config.harnesses)) {
        harness.timeouts.implementer = 3
        harness.timeouts.reviewer = 3
      }
    },
  })
  const slowBrief = writeBrief(slowRepo, briefLines(['FAKE-AGY: sleep 2']))
  const slow = runDelegate(slowRepo, slowEnv, { brief: slowBrief })
  assert.equal(slow.json?.status, 'done', slow.stdout + slow.stderr)
})

test('a pair whose model fails passes to the next pair, its patch kept, and is never tried again (E3, R8)', (t) => {
  const { choices } = probe(t)
  const first = choices.find((entry) => entry.role === 'implementer').picked
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t, { failModels: [modelArgOf(first)], writeOnFail: 'src/attempt.js attempt-one' }) })
  const brief = writeBrief(repo, briefLines())
  const r = runDelegate(repo, env, { brief, tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.notEqual(r.json.pair.id, first.id)
  assert.equal(r.json.tried.length, 1)
  assert.deepEqual([r.json.tried[0].pair, r.json.tried[0].cause], [first.id, 'failed'])
  const patch = r.json.tried[0].patch
  assert.ok(patch.endsWith(path.join('patches', 'task-1-attempt-1.patch')), patch)
  assert.ok(fs.readFileSync(patch, 'utf8').includes('attempt-one'))
  const turns = fx.agyTurns(env).filter((entry) => entry.argv[1].startsWith(fx.roleBody('implementer')))
  assert.equal(turns.filter((entry) => fx.argAfter(entry.argv, '--model') === modelArgOf(first)).length, 1, 'the failed pair runs once')
  assert.equal(repo.git('show', `${r.json.branch}:src/new.js`), 'hello')
  assert.equal(repo.git('show', `${r.json.branch}:src/attempt.js`), 'attempt-one', 'the next pair continued from the failed attempt, so its file is on the branch')
})

test('a quota refusal passes to the next pair with the quota cause (E3, R8)', (t) => {
  const { choices } = probe(t)
  const first = choices.find((entry) => entry.role === 'implementer').picked
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t, { quotaModels: [modelArgOf(first)], writeOnFail: 'src/attempt.js attempt-one' }) })
  const brief = writeBrief(repo, briefLines())
  const r = runDelegate(repo, env, { brief, tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.tried.length, 1)
  assert.deepEqual([r.json.tried[0].pair, r.json.tried[0].cause], [first.id, 'quota'])
  assert.ok(fs.readFileSync(r.json.tried[0].patch, 'utf8').includes('attempt-one'))
  const turns = fx.agyTurns(env).filter((entry) => entry.argv[1].startsWith(fx.roleBody('implementer')))
  assert.equal(turns.filter((entry) => fx.argAfter(entry.argv, '--model') === modelArgOf(first)).length, 1)
  assert.equal(repo.git('show', `${r.json.branch}:src/attempt.js`), 'attempt-one', 'the next pair continued from the failed attempt, so its file is on the branch')
})

test('every attempt dying at its print timeout ends as no-candidate failed, each patch kept, no unit branch left (E3, R8)', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, {
    command: roleFake(t),
    mutate: (config) => {
      for (const harness of Object.values(config.harnesses)) harness.timeouts.implementer = 1
    },
  })
  // The fake's print timeout is agy's own answer when its --print-timeout runs out.
  const brief = writeBrief(repo, ['Write, then run out of print time.', 'FAKE-AGY: write src/attempt.js attempt', 'FAKE-AGY: timeout'])
  const headBefore = repo.git('rev-parse', 'HEAD')
  const r = runDelegate(repo, env, { brief })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.status, 'no-candidate')
  assert.equal(r.json.cause, 'failed')
  assert.ok(r.json.tried.length >= 2, JSON.stringify(r.json.tried))
  const triedPairs = r.json.tried.map((entry) => entry.pair)
  assert.equal(new Set(triedPairs).size, triedPairs.length, 'no pair repeats')
  r.json.tried.forEach((entry, i) => {
    assert.ok(entry.patch.endsWith(path.join('patches', `task-1-attempt-${i + 1}.patch`)), entry.patch)
    assert.ok(fs.readFileSync(entry.patch, 'utf8').includes('attempt'), entry.patch)
  })
  assert.equal(repo.git('branch', '--list', `aether/${r.json.id}/task-1`), '')
  assert.equal(repo.git('rev-parse', 'HEAD'), headBefore)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'worktrees', r.json.id, 'task-1')), false)
})

test('no candidate: dry quotas and an unreachable reference log their delegate entry under the same id (E4, R9)', (t) => {
  const HOUR = 3600 * 1000
  const inHours = (h) => new Date(Date.now() + h * HOUR).toISOString()
  const cases = [
    { name: 'dry', quota: { 'Gemini Models': [0.9, 0.02, null, inHours(40)], 'Claude and GPT models': [0.9, 0.02, null, inHours(40)] }, model: 'haiku', effort: 'high' },
    { name: 'no-pair', quota: null, model: 'opus', effort: 'max' },
  ]
  for (const { name, quota, model, effort } of cases) {
    const repo = makeRepo(t)
    const env = agyEnv(t, { command: roleFake(t), quota })
    const brief = writeBrief(repo, briefLines())
    const headBefore = repo.git('rev-parse', 'HEAD')
    const r = runDelegate(repo, env, { brief, model, effort })
    assert.equal(r.status, 0, name + ': ' + r.stdout + r.stderr)
    assert.equal(r.json.status, 'no-candidate', name)
    assert.equal(r.json.cause, name)
    assert.ok(RUN_ID.test(r.json.id), name)
    const entry = lanes.readLog(env.AETHER_DATA_DIR).find((item) => item.kind === 'delegate')
    assert.ok(entry, name)
    assert.deepEqual([entry.id, entry.run, entry.status, entry.cause], [r.json.id, r.json.id, 'no-candidate', name])
    assert.equal(fx.agyTurns(env).length, 0, name + ': nothing ran')
    assert.equal(repo.git('status', '--porcelain'), '')
    assert.equal(repo.git('rev-parse', 'HEAD'), headBefore)
  }
})

test('reviewerReference gives the three derived references, and the reviewer choice asks for them (E5, R1)', (t) => {
  assert.deepEqual(delegate.reviewerReference('opus'), { model: 'opus', effort: 'xhigh' })
  assert.deepEqual(delegate.reviewerReference('haiku'), { model: 'sonnet', effort: 'high' })
  assert.deepEqual(delegate.reviewerReference('sonnet'), { model: 'opus', effort: 'high' })
  const { choices } = probe(t)
  const review = choices.find((entry) => entry.role === 'reviewer')
  assert.equal(review.reference.id, 'claude/sonnet@high', 'a haiku charge is reviewed against sonnet at high')
})

test('a reviewer that fails passes to the next reviewer, the branch untouched (E5, R10)', (t) => {
  const { choices } = probe(t)
  const firstReviewer = choices.find((entry) => entry.role === 'reviewer').picked
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t, { failModels: [modelArgOf(firstReviewer)] }) })
  const brief = writeBrief(repo, briefLines())
  const r = runDelegate(repo, env, { brief, tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.review.status, 'done')
  assert.notEqual(r.json.review.pair.id, firstReviewer.id)
  assert.equal(repo.git('show', `${r.json.branch}:src/new.js`), 'hello')
  const reviewerTurns = fx.agyTurns(env).filter((entry) => entry.argv[1].startsWith(fx.roleBody('reviewer')))
  assert.equal(reviewerTurns.filter((entry) => fx.argAfter(entry.argv, '--model') === modelArgOf(firstReviewer)).length, 1)
})

test('when the only pair that reaches is the one that wrote, there is no review and no reviewer turn (E5, R10)', (t) => {
  const table = pairs.loadPairs()
  const only = { fetchedAt: table.fetchedAt, pairs: table.pairs.filter((pair) => pair.harness === 'claude' || pair.id === 'agy/claude-opus-5-5@high') }
  const pairsFile = path.join(tempDir(t, 'aether-pairs-'), 'pairs.json')
  fs.writeFileSync(pairsFile, JSON.stringify(only))
  const repo = makeRepo(t)
  const env = { ...agyEnv(t, { command: roleFake(t) }), AETHER_PAIRS_CONFIG: pairsFile }
  const brief = writeBrief(repo, briefLines())
  const r = runDelegate(repo, env, { brief, tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.pair.id, 'agy/claude-opus-5-5@high')
  assert.equal(r.json.review.status, 'none')
  assert.equal(fx.agyTurns(env).filter((entry) => entry.argv[1].startsWith(fx.roleBody('reviewer'))).length, 0)
})

test('every reviewer failing gives no-verdict with each pair and cause, and the branch stands (E5, R10)', (t) => {
  const { choices } = probe(t)
  const reviewChoice = choices.find((entry) => entry.role === 'reviewer')
  const failModels = reviewChoice.candidates.filter((candidate) => candidate.outcome !== 'passed').map((candidate) => pairModelArg(candidate.id))
  assert.ok(failModels.length >= 2)
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t, { failModels, reviewAnswer: null }) })
  const brief = writeBrief(repo, briefLines())
  const r = runDelegate(repo, env, { brief, tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.review.status, 'no-verdict')
  assert.ok(r.json.review.tried.length >= 2)
  for (const entry of r.json.review.tried) assert.ok(entry.pair && entry.cause, JSON.stringify(entry))
  assert.equal(repo.git('show', `${r.json.branch}:src/new.js`), 'hello')
})

test('a charge without a test command reports tests null, with a review and without a verdict (E5, R11)', (t) => {
  const withReview = makeRepo(t)
  const envA = agyEnv(t, { command: roleFake(t) })
  const a = runDelegate(withReview, envA, { brief: writeBrief(withReview, briefLines()) })
  assert.equal(a.json?.status, 'done', a.stdout + a.stderr)
  assert.equal(a.json.tests, null)
  assert.equal(a.json.review.status, 'done')

  const { choices } = probe(t)
  const reviewChoice = choices.find((entry) => entry.role === 'reviewer')
  const failModels = reviewChoice.candidates.filter((candidate) => candidate.outcome !== 'passed').map((candidate) => pairModelArg(candidate.id))
  const noVerdict = makeRepo(t)
  const envB = agyEnv(t, { command: roleFake(t, { failModels, reviewAnswer: null }) })
  const b = runDelegate(noVerdict, envB, { brief: writeBrief(noVerdict, briefLines()) })
  assert.equal(b.json?.status, 'done', b.stdout + b.stderr)
  assert.equal(b.json.tests, null)
  assert.ok(['none', 'no-verdict'].includes(b.json.review.status))
})

test('off does nothing at all, and a bad usage is an error (E6, R20)', (t) => {
  const repo = makeRepo(t)
  const env = { ...agyEnv(t, { command: roleFake(t) }), AETHER_SUPERDELEGATION: 'off' }
  const brief = writeBrief(repo, briefLines())
  const before = lanes.readLog(env.AETHER_DATA_DIR).length
  const r = runDelegate(repo, env, { brief })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual(r.json, { status: 'off', reason: 'option' })
  assert.equal(fx.agyTurns(env).length, 0)
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'runs')), false)
  assert.equal(lanes.readLog(env.AETHER_DATA_DIR).length, before)

  const bad = runBin(fx.LANE_BIN, ['delegate', '--model', 'haiku'], repo.dir, agyEnv(t))
  assert.equal(bad.status, 1)
  assert.ok(bad.json.error.includes('usage: aether-lane delegate'), bad.json.error)
  assert.equal(delegate.isOwnsEntry('src/**'), true)
  for (const entry of ['/abs/**', 'src/../x', 'a b', 'a{b}', '']) assert.equal(delegate.isOwnsEntry(entry), false, entry)
})

// One failed writer, then a pair that finishes. `kind` is the first pair's cause.
function carryFromFailure(t, kind) {
  const { choices } = probe(t)
  const first = choices.find((entry) => entry.role === 'implementer').picked
  const model = modelArgOf(first)
  const witness = path.join(tempDir(t), 'witness.jsonl')
  const repo = makeRepo(t)
  const failing = kind === 'quota' ? { quotaModels: [model] } : { failModels: [model] }
  const env = agyEnv(t, { command: witnessingFake(t, { ...failing, writes: { [model]: ['src/attempt.js attempt-one'] }, witness }) })
  const r = runDelegate(repo, env, { brief: writeBrief(repo, briefLines()), tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.tried[0].cause, kind)
  assert.equal(r.json.tried[0].continued, false)
  assert.equal(r.json.tried[0].carry, undefined)
  assert.equal(r.json.continued, true)
  assert.equal(r.json.carry, undefined)
  const turns = witnessLines(witness)
  assert.equal(turns.length, 2, JSON.stringify(turns))
  assert.equal(turns[0].files['src/attempt.js'], undefined)
  assert.equal(turns[1].files['src/attempt.js'], 'attempt-one\n')
  assert.ok(!promptOf(repo, r.json.id, 1).includes(CONTINUATION))
  assert.ok(promptOf(repo, r.json.id, 2).includes(CONTINUATION))
  assert.ok(fs.readFileSync(r.json.tried[0].patch, 'utf8').includes('attempt-one'))
}

test('a pair that writes a file and then fails leaves that file in the next worktree, and the prompt says to continue (issue 68)', (t) => {
  carryFromFailure(t, 'failed')
})

test('a pair that writes a file and then runs out of quota leaves that file in the next worktree, and the prompt says to continue (issue 68)', (t) => {
  carryFromFailure(t, 'quota')
})

test('a patch that touches a path outside --owns is not applied, and the result says why (issue 68)', (t) => {
  const { choices } = probe(t)
  const model = modelArgOf(choices.find((entry) => entry.role === 'implementer').picked)
  const witness = path.join(tempDir(t), 'witness.jsonl')
  const repo = makeRepo(t)
  const env = agyEnv(t, {
    command: witnessingFake(t, { failModels: [model], writes: { [model]: ['src/kept.js kept', 'notes/outside.txt secret'] }, witness }),
  })
  const r = runDelegate(repo, env, { brief: writeBrief(repo, briefLines()), owns: 'src/**', tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.tried[0].continued, false)
  assert.equal(r.json.continued, false)
  assert.match(r.json.carry, /not carried over/)
  assert.match(r.json.carry, /notes\/outside\.txt/)
  const turns = witnessLines(witness)
  assert.equal(turns[1].files['notes/outside.txt'], undefined)
  assert.equal(turns[1].files['src/kept.js'], undefined)
  assert.equal(turns[1].files['src/new.js'], undefined)
  assert.ok(!promptOf(repo, r.json.id, 2).includes(CONTINUATION))
  assert.ok(fs.readFileSync(r.json.tried[0].patch, 'utf8').includes('notes/outside.txt'))
})

test('a patch that does not apply cleanly is not applied, and the result says why (issue 68)', (t) => {
  const { choices } = probe(t)
  const model = modelArgOf(choices.find((entry) => entry.role === 'implementer').picked)
  const witness = path.join(tempDir(t), 'witness.jsonl')
  const repo = makeRepo(t)
  const env = agyEnv(t, {
    command: witnessingFake(t, { failModels: [model], writes: { [model]: ['src/conflict.js from-attempt'] }, witness, clash: model }),
  })
  const r = runDelegate(repo, env, { brief: writeBrief(repo, briefLines()), owns: 'src/**', tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.continued, false)
  assert.match(r.json.carry, /does not apply cleanly/)
  const turns = witnessLines(witness)
  assert.equal(turns[1].files['src/conflict.js'], 'from-integration\n')
  assert.ok(!promptOf(repo, r.json.id, 2).includes(CONTINUATION))
})

test('two failures in a row: the third pair starts from the state after the second, and the patches are not stacked (issue 68)', (t) => {
  const { choices } = probe(t)
  const models = implementerModels(choices)
  assert.ok(models.length >= 3, models.join(','))
  const [first, second] = models
  const witness = path.join(tempDir(t), 'witness.jsonl')
  const repo = makeRepo(t)
  const env = agyEnv(t, {
    command: witnessingFake(t, {
      failModels: [first, second],
      writes: { [first]: ['src/one.js one'], [second]: ['src/two.js two'] },
      witness,
    }),
  })
  const r = runDelegate(repo, env, { brief: writeBrief(repo, briefLines()), tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.tried.length, 2)
  assert.equal(r.json.tried[0].continued, false)
  assert.equal(r.json.tried[1].continued, true)
  assert.equal(r.json.continued, true)
  const turns = witnessLines(witness)
  assert.equal(turns.length, 3, JSON.stringify(turns.map((turn) => turn.model)))
  assert.equal(turns[1].files['src/one.js'], 'one\n')
  assert.equal(turns[1].files['src/two.js'], undefined)
  assert.equal(turns[2].files['src/one.js'], 'one\n')
  assert.equal(turns[2].files['src/two.js'], 'two\n')
  const firstPatch = fs.readFileSync(r.json.tried[0].patch, 'utf8')
  const secondPatch = fs.readFileSync(r.json.tried[1].patch, 'utf8')
  assert.ok(firstPatch.includes('src/one.js') && !firstPatch.includes('src/two.js'))
  assert.ok(secondPatch.includes('src/one.js') && secondPatch.includes('src/two.js'))
  assert.ok(promptOf(repo, r.json.id, 2).includes(CONTINUATION))
  assert.ok(promptOf(repo, r.json.id, 3).includes(CONTINUATION))
  assert.ok(!promptOf(repo, r.json.id, 1).includes(CONTINUATION))
})

test('a binary file and an empty file whose names have a space, outside --owns, are not carried, and the result names them (issue 68)', (t) => {
  const { choices } = probe(t)
  const model = modelArgOf(choices.find((entry) => entry.role === 'implementer').picked)
  const witness = path.join(tempDir(t), 'witness.jsonl')
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: witnessingFake(t, { failModels: [model], witness, plantOutside: true }) })
  const r = runDelegate(repo, env, { brief: writeBrief(repo, briefLines()), owns: 'src/**', tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.continued, false)
  assert.match(r.json.carry, /docs\/Screen Shot\.png/)
  assert.match(r.json.carry, /notes\/new file\.txt/)
  const turns = witnessLines(witness)
  assert.equal(turns[1].files['docs/Screen Shot.png'], undefined)
  assert.equal(turns[1].files['notes/new file.txt'], undefined)
  assert.equal(turns[1].files['src/a.js'], undefined)
  assert.ok(!promptOf(repo, r.json.id, 2).includes(CONTINUATION))
})

test('a patch whose pre-check passes can still fail in the worktree, and the receipt and the result say so (issue 68)', (t) => {
  const { choices } = probe(t)
  const model = modelArgOf(choices.find((entry) => entry.role === 'implementer').picked)
  const witness = path.join(tempDir(t), 'witness.jsonl')
  const repo = makeRepo(t)
  const env = agyEnv(t, {
    command: witnessingFake(t, {
      failModels: [model],
      writes: { [model]: ['src/attempt.js attempt-one'] },
      witness,
      interfere: 'clash',
      recordReceipt: true,
    }),
    mutate: noQuotaCache,
  })
  const r = runDelegate(repo, env, { brief: writeBrief(repo, briefLines()), owns: 'src/**', tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.continued, false)
  assert.match(r.json.carry, /does not apply cleanly/)
  const turns = witnessLines(witness)
  assert.equal(JSON.parse(turns[1].receipt).applied, false)
  assert.equal(turns[1].files['src/attempt.js'], 'from-integration\n')
})

test('an attempt refused at its start leaves the offer, and the next pair continues from it (issue 68)', (t) => {
  const { choices } = probe(t)
  const models = implementerModels(choices)
  assert.ok(models.length >= 3, models.join(','))
  const [first] = models
  const witness = path.join(tempDir(t), 'witness.jsonl')
  const repo = makeRepo(t)
  const env = agyEnv(t, {
    command: witnessingFake(t, {
      failModels: [first],
      writes: { [first]: ['src/attempt.js attempt-one'] },
      witness,
      interfere: 'poison',
    }),
    mutate: noQuotaCache,
  })
  const r = runDelegate(repo, env, { brief: writeBrief(repo, briefLines()), tests: 'true' })
  assert.equal(r.json?.status, 'done', r.stdout + r.stderr)
  assert.equal(r.json.tried[1].cause, 'unavailable: workspace')
  assert.equal(r.json.tried[1].continued, false)
  assert.equal(r.json.continued, true)
  const turns = witnessLines(witness)
  assert.equal(turns.length, 2, JSON.stringify(turns.map((turn) => turn.model)))
  assert.equal(turns[1].files['src/attempt.js'], 'attempt-one\n')
  assert.ok(promptOf(repo, r.json.id, 3).includes(CONTINUATION))
})

test('when the last attempt is refused at its start and no pair remains, the arm file is cleared (issue 68)', (t) => {
  const { choices } = probe(t)
  const ids = implementerIds(choices)
  assert.ok(ids.length >= 2, ids.join(','))
  const table = pairs.loadPairs()
  const keep = new Set(ids.slice(0, 2))
  const only = { fetchedAt: table.fetchedAt, pairs: table.pairs.filter((pair) => pair.harness === 'claude' || keep.has(pair.id)) }
  const pairsFile = path.join(tempDir(t, 'aether-pairs-'), 'pairs.json')
  fs.writeFileSync(pairsFile, JSON.stringify(only))
  const witness = path.join(tempDir(t), 'witness.jsonl')
  const repo = makeRepo(t)
  const env = {
    ...agyEnv(t, {
      command: witnessingFake(t, {
        failModels: [pairModelArg(ids[0])],
        writes: { [pairModelArg(ids[0])]: ['src/attempt.js attempt-one'] },
        witness,
        interfere: 'poison',
      }),
      mutate: noQuotaCache,
    }),
    AETHER_PAIRS_CONFIG: pairsFile,
  }
  const r = runDelegate(repo, env, { brief: writeBrief(repo, briefLines()), tests: 'true' })
  assert.equal(r.json?.status, 'no-candidate', r.stdout + r.stderr)
  assert.equal(r.json.cause, 'failed')
  assert.equal(r.json.tried[1].cause, 'unavailable: workspace')
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'runs', r.json.id, 'carry', 'task-1.json')), false)
})
