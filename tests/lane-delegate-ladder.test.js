'use strict'

// The flags of `aether-lane delegate` that a correction uses: --findings, --carry and --pair, and the
// base the done result carries. Each test builds what tests/lane-delegate.test.js builds: a throwaway
// repository, a data directory and a lane table of agy with the fake, and calls the command in process.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { makeRepo, tempDir } = require('./helpers.js')
const fx = require('./lane-fixtures.js')
const lanes = require('../plugins/aether/lib/lanes.js')
const delegate = require('../plugins/aether/lib/lane-delegate.js')

const DONE = JSON.stringify({ status: 'DONE', summary: 'Wrote src/new.js.', head: '', tests: 'ok', concerns: '', question: '' })
const READY = JSON.stringify({ verdict: 'ready', findings: [], declined: [], summary: 'The diff does what the brief asks.' })
const CONTINUATION = 'Its uncommitted work, if any, is in the worktree. Continue from it.'

const agyEnv = (t, options) => ({ ...fx.laneEnv(t, options), AETHER_LANE_HARNESSES: 'agy' })
const choicesOf = (env, role = null) => lanes.readLog(env.AETHER_DATA_DIR).filter((entry) => entry.kind === 'choice' && (role === null || entry.role === role))
const pairModelArg = (pairId) => `${pairId.slice(pairId.indexOf('/') + 1, pairId.lastIndexOf('@'))}-${pairId.slice(pairId.lastIndexOf('@') + 1)}`

// A wrapper CLI that forwards to the fake agy: the --model values named fail, and a reviewer turn answers ready.
function roleFake(t, { failModels = [] } = {}) {
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
    `  if (${JSON.stringify(failModels)}.includes(model)) extra.push('FAKE-AGY: exit-error model not found: ' + model)`,
    `  else if (argv[pi + 1].startsWith(${JSON.stringify(fx.roleBody('reviewer').slice(0, 120))})) extra.push('FAKE-AGY: answer ' + ${JSON.stringify(READY)})`,
    "  if (extra.length > 0) argv[pi + 1] = argv[pi + 1] + '\\n' + extra.join('\\n')",
    '}',
    `const r = spawnSync(${JSON.stringify(fx.FAKE_AGY)}, argv, { stdio: 'inherit' })`,
    'process.exit(r.status === null ? 1 : r.status)',
  ]
  fs.writeFileSync(file, lines.join('\n') + '\n')
  fs.chmodSync(file, 0o755)
  return file
}

const briefLines = () => [
  'Write src/new.js saying hello and commit it.',
  'FAKE-AGY: write src/new.js hello',
  'FAKE-AGY: commit add new',
  `FAKE-AGY: answer ${DONE}`,
]

// The charge: a brief file committed in the toy repository, so the owner's checkout starts clean.
function writeBrief(repo) {
  const file = path.join(repo.dir, 'brief.md')
  fs.writeFileSync(file, briefLines().join('\n') + '\n')
  repo.git('add', 'brief.md')
  repo.git('commit', '-q', '-m', 'brief')
  return file
}

// A file of the charge (findings or patch), outside the repository.
function fileOf(t, name, text) {
  const file = path.join(tempDir(t, 'aether-ladder-'), name)
  fs.writeFileSync(file, text)
  return file
}

// A patch that adds the file in a scratch clone of the repository, so the repository itself stays clean.
function patchAdding(t, repo, relative, text) {
  const scratch = tempDir(t, 'aether-ladder-clone-')
  spawnSync('git', ['clone', '-q', repo.dir, scratch], { encoding: 'utf8' })
  fs.mkdirSync(path.dirname(path.join(scratch, relative)), { recursive: true })
  fs.writeFileSync(path.join(scratch, relative), text)
  spawnSync('git', ['add', relative], { cwd: scratch })
  return fileOf(t, 'carry.patch', spawnSync('git', ['diff', '--cached'], { cwd: scratch, encoding: 'utf8' }).stdout)
}

const promptOf = (repo, id, attempt) => fs.readFileSync(path.join(repo.dir, '.aether', 'runs', id, 'lanes', `task-1-${attempt}-implement`, 'prompt.md'), 'utf8')

async function delegateIn(repo, env, extra = {}) {
  const flags = { brief: writeBriefOnce(repo), model: 'haiku', effort: 'high', owns: 'src/**', session: 's1', ...extra }
  return delegate.delegateCommand(repo.dir, flags, { env })
}

const briefs = new WeakMap()
function writeBriefOnce(repo) {
  if (!briefs.has(repo)) briefs.set(repo, writeBrief(repo))
  return briefs.get(repo)
}

test('--findings puts a "## Findings to fix" section with the file text in the prompt of the implementer', async (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const findings = fileOf(t, 'findings.md', 'src/new.js:1: say goodbye\n')
  const result = await delegateIn(repo, env, { findings })
  assert.equal(result.status, 'done')
  const prompt = promptOf(repo, result.id, 1)
  assert.ok(prompt.includes('## Findings to fix'), prompt)
  assert.ok(prompt.includes('src/new.js:1: say goodbye'), prompt)
  assert.ok(prompt.indexOf('## Tests') === -1 || prompt.indexOf('## Tests') < prompt.indexOf('## Findings to fix'))
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('--carry offers the earlier patch: the attempt starts from that work and the prompt says to continue', async (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const carry = patchAdding(t, repo, 'src/old.js', 'old\n')
  const result = await delegateIn(repo, env, { carry })
  assert.equal(result.status, 'done')
  assert.equal(result.continued, true, String(result.carry))
  assert.ok(promptOf(repo, result.id, 1).includes(CONTINUATION))
  assert.equal(fs.readFileSync(path.join(result.worktree, 'src', 'old.js'), 'utf8'), 'old\n')
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('--carry with a patch that touches files outside --owns is not applied', async (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const carry = patchAdding(t, repo, 'notes/outside.txt', 'secret\n')
  const result = await delegateIn(repo, env, { carry })
  assert.equal(result.status, 'done')
  assert.equal(result.continued, false)
  assert.equal(typeof result.carry, 'string')
  assert.match(result.carry, /notes\/outside\.txt/)
  assert.ok(!promptOf(repo, result.id, 1).includes(CONTINUATION))
  assert.equal(fs.existsSync(path.join(result.worktree, 'notes', 'outside.txt')), false)
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('--pair runs the first attempt on that pair, and the pair after it when it fails', async (t) => {
  const probeRepo = makeRepo(t)
  const probeEnv = agyEnv(t, { command: roleFake(t) })
  const probed = await delegateIn(probeRepo, probeEnv)
  assert.equal(probed.status, 'done')
  const choice = choicesOf(probeEnv, 'implementer')[0]
  const second = choice.candidates.find((candidate) => candidate.outcome === 'next')
  assert.ok(second, 'the table has a second candidate for the charge')

  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t, { failModels: [pairModelArg(second.id)] }) })
  const result = await delegateIn(repo, env, { pair: second.id })
  assert.equal(result.status, 'done')
  const chosen = choicesOf(env, 'implementer')
  assert.equal(chosen[0].picked.id, second.id, 'the first choice is the pair asked for')
  assert.notEqual(chosen[1].picked.id, second.id, 'the pair that failed is never tried again')
  assert.equal(result.tried[0].pair, second.id)
  assert.notEqual(result.pair.id, second.id)
  assert.equal(repo.git('status', '--porcelain'), '')
})

test('the done result carries base, the head the checkout had when the delegate began', async (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  writeBriefOnce(repo)
  const before = repo.git('rev-parse', 'HEAD')
  const result = await delegateIn(repo, env)
  assert.equal(result.status, 'done')
  assert.equal(result.base, before)
})

test('a --pair that is not in the pairs table, and a --carry or --findings file that does not exist, are the usage error', async (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const missing = path.join(tempDir(t, 'aether-ladder-'), 'nope')
  await assert.rejects(delegateIn(repo, env, { pair: 'agy/not-a-model@high' }), /usage: aether-lane delegate/)
  await assert.rejects(delegateIn(repo, env, { carry: missing }), /usage: aether-lane delegate/)
  await assert.rejects(delegateIn(repo, env, { findings: missing }), /usage: aether-lane delegate/)
  assert.equal(repo.git('status', '--porcelain'), '')
})
