'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, makeRepo, tempDir, runBin, compile, commitIn } = require('./helpers.js')
const task = require('../plugins/aether/lib/delegate-task.js')
const log = require('../plugins/aether/lib/delegate-log.js')
const wt = require('../plugins/aether/lib/worktrees.js')
const { task: planTask, plan } = require('./plan-fixtures.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-delegate')
const AUTONOMY = path.join(PLUGIN, 'bin', 'aether-autonomy')
const NATIVE = { lanes: false, harnesses: [], deadlines: { quotaMs: 1 } }
const OWNS = 'AETHER-OWNS: src/**\nAETHER-TESTS: node -e "process.exit(0)"\n'
const NO_WORKTREE = 'approve needs the worktree of the attempt (--worktree) or the checks of its result'
const SESSION = 'sess-approve-1'
const MERGE_QUOTE = 'apruebo merge a main en todas las futuras ocasiones'

function world(t, cwd) {
  const dataDir = tempDir(t, 'aether-data-')
  let n = 0
  const deps = {
    dataDir,
    cwd,
    now: () => 1000 + (n += 1),
    settings: NATIVE,
    newId: () => `gen-${n}`,
    pickPair: async () => ({ pick: null, quota: [] }),
  }
  return { dataDir, deps }
}

const call = (prompt) => ({ session: 's1', event: { subagent_type: 'general-purpose', description: 'd', prompt } })
const BRIEF = (id, more = '') => `AETHER-TASK: ${id}\n${more}Do the work.`

function packageJson(pass) {
  const body = pass
    ? "require('fs').writeFileSync('marker.txt','ok')"
    : "require('fs').writeFileSync('marker.txt','fail'); process.exit(1)"
  return JSON.stringify({ scripts: { test: `node -e ${JSON.stringify(body)}` } }) + '\n'
}

function commitPackage(repo, pass) {
  fs.writeFileSync(path.join(repo.dir, 'package.json'), packageJson(pass))
  repo.git('add', 'package.json')
  repo.git('commit', '-q', '-m', 'test script')
}

// A side branch with one commit, the way a Claude delegate's worktree holds its edit.
function sideWorktree(t, repo, file, content) {
  const dir = path.join(tempDir(t, 'aether-side-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', `side/${path.basename(file).replace(/\W/g, '')}-${Date.now()}`, dir)
  commitIn(repo, dir, file, content, 'delegate edit')
  return dir
}

function approve(repo, dataDir, args, extraEnv = {}) {
  return runBin(BIN, ['approve', ...args], repo.dir, { AETHER_DATA_DIR: dataDir, ...extraEnv })
}

function verdicts(dataDir, id) {
  return log.readEntries(dataDir, { task: id }).filter((entry) => entry.kind === 'verdict')
}

test('on a feature branch approve gives the verdict, merges the worktree and runs the test script', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('t1', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'from the delegate\n')
  const before = repo.git('rev-parse', 'HEAD')
  const r = approve(repo, dataDir, ['--task', 't1', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.approved, true)
  assert.equal(r.json.merged, true)
  assert.equal(r.json.tests, 'passed')
  assert.equal(r.json.branch, 'feature/x')
  assert.notEqual(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 'a.js'), 'utf8'), 'from the delegate\n')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'marker.txt'), 'utf8'), 'ok')
  assert.equal(verdicts(dataDir, 't1').at(-1).verdict, 'approved')
})

test('a failing test script reports tests failed and keeps the merge', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, false)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('t1', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'kept\n')
  const r = approve(repo, dataDir, ['--task', 't1', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.merged, true)
  assert.equal(r.json.tests, 'failed')
  assert.match(r.json.reason, /kept/)
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 'a.js'), 'utf8'), 'kept\n')
  assert.equal(repo.git('log', '-1', '--format=%P').split(' ').length, 2, 'the merge commit stays')
})

test('the testCommand of .aether/settings.json replaces npm test', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, false)
  fs.mkdirSync(path.join(repo.dir, '.aether'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'settings.json'), JSON.stringify({ testCommand: 'echo settings > settings-marker.txt' }))
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('t1', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'x\n')
  const r = approve(repo, dataDir, ['--task', 't1', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.tests, 'passed')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'settings-marker.txt'), 'utf8'), 'settings\n')
  assert.equal(fs.existsSync(path.join(repo.dir, 'marker.txt')), false, 'npm test did not run')
})

test('main with no grant merges nothing and records no verdict; the same call merges once the grant is recorded', async (t) => {
  const repo = makeRepo(t)
  repo.git('switch', '-q', 'main')
  commitPackage(repo, true)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('t1', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'onto main\n')
  const before = repo.git('rev-parse', 'HEAD')
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), `${JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: '2026-10-09T19:32:31.611Z', message: { role: 'user', content: MERGE_QUOTE } })}\n`)
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: SESSION }
  const blocked = approve(repo, dataDir, ['--task', 't1', '--worktree', side], env)
  assert.equal(blocked.status, 0, blocked.stdout + blocked.stderr)
  assert.equal(blocked.json.approved, false)
  assert.equal(blocked.json.merged, false)
  assert.match(blocked.json.reason, /merge-main/)
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(fs.existsSync(path.join(repo.dir, 'src', 'a.js')), false)
  assert.equal(verdicts(dataDir, 't1').length, 0)

  const grant = runBin(AUTONOMY, ['grant', '--class', 'merge-main', '--quote', MERGE_QUOTE], repo.dir, env)
  assert.equal(grant.status, 0, grant.stdout + grant.stderr)
  const allowed = approve(repo, dataDir, ['--task', 't1', '--worktree', side], env)
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr)
  assert.equal(allowed.json.approved, true)
  assert.equal(allowed.json.merged, true)
  assert.equal(allowed.json.tests, 'passed')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 'a.js'), 'utf8'), 'onto main\n')
  assert.equal(verdicts(dataDir, 't1').at(-1).verdict, 'approved')
})

test('a read-only task is refused', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('ro')), deps)
  const r = approve(repo, dataDir, ['--task', 'ro'])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.approved, false)
  assert.equal(r.json.merged, false)
  assert.match(r.json.reason, /did not edit/)
  assert.equal(verdicts(dataDir, 'ro').length, 0)
})

test('a failed delegate check refuses the approve, as verdict does', async (t) => {
  const repo = makeRepo(t)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('out', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'a\n')
  commitIn(repo, side, 'docs/x.md', 'x\n', 'outside the owns')
  const before = repo.git('rev-parse', 'HEAD')
  const r = approve(repo, dataDir, ['--task', 'out', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.approved, false)
  assert.equal(r.json.merged, false)
  assert.match(r.json.reason, /checks failed:.*docs\/x\.md/)
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(verdicts(dataDir, 'out').length, 0)
})

test('the usage line of the bin contains approve', () => {
  const r = runBin(BIN, [], process.cwd())
  assert.equal(r.status, 1)
  assert.match(r.json.error, /approve --task <id>/)
})

test('a Claude delegate merges the worktree commit; without --worktree it is refused; a conflict is aborted', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('claude', OWNS)), deps)
  const missing = approve(repo, dataDir, ['--task', 'claude'])
  assert.equal(missing.status, 0, missing.stdout + missing.stderr)
  assert.equal(missing.json.approved, false)
  assert.equal(missing.json.reason, NO_WORKTREE)
  assert.equal(verdicts(dataDir, 'claude').length, 0)

  const side = sideWorktree(t, repo, 'src/a.js', 'claude edit\n')
  const r = approve(repo, dataDir, ['--task', 'claude', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.approved, true)
  assert.equal(r.json.merged, true)
  assert.equal(r.json.tests, 'passed')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 'a.js'), 'utf8'), 'claude edit\n')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'marker.txt'), 'utf8'), 'ok')

  const clashRepo = makeRepo(t)
  commitPackage(clashRepo, true)
  fs.mkdirSync(path.join(clashRepo.dir, 'src'))
  fs.writeFileSync(path.join(clashRepo.dir, 'src', 'a.js'), 'base\n')
  clashRepo.git('add', 'src/a.js')
  clashRepo.git('commit', '-q', '-m', 'base copy')
  const other = sideWorktree(t, clashRepo, 'src/a.js', 'worktree\n')
  fs.writeFileSync(path.join(clashRepo.dir, 'src', 'a.js'), 'checkout\n')
  clashRepo.git('add', 'src/a.js')
  clashRepo.git('commit', '-q', '-m', 'checkout copy')
  const clash = world(t, clashRepo.dir)
  await task.begin(call(BRIEF('clash', OWNS)), clash.deps)
  const conflict = approve(clashRepo, clash.dataDir, ['--task', 'clash', '--worktree', other])
  assert.equal(conflict.status, 0, conflict.stdout + conflict.stderr)
  assert.equal(conflict.json.merged, false)
  assert.match(conflict.json.reason, /conflict/i)
  assert.equal(clashRepo.git('status', '--porcelain'), '')
  assert.notEqual(spawnSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: clashRepo.dir, encoding: 'utf8' }).status, 0)
  assert.equal(fs.readFileSync(path.join(clashRepo.dir, 'src', 'a.js'), 'utf8'), 'checkout\n')
})

test('a Claude worktree with work not committed is refused before the verdict: its HEAD is not the work', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('dirty', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'committed\n')
  fs.writeFileSync(path.join(side, 'src', 'b.js'), 'not committed\n')
  const before = repo.git('rev-parse', 'HEAD')
  const r = approve(repo, dataDir, ['--task', 'dirty', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.approved, false)
  assert.equal(r.json.merged, false)
  assert.match(r.json.reason, /not committed.*src\/b\.js/)
  assert.equal(repo.git('rev-parse', 'HEAD'), before)
  assert.equal(verdicts(dataDir, 'dirty').length, 0)
})

test("an external pair merges with aether-wt merge and the unit's file lands on the checkout's branch", async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const args = compile(repo, plan([planTask(1)], { execution: ['- Test command: `true`'] }))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'from the unit\n', 'unit edit')
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('ext', OWNS)), deps)
  log.appendEntry(dataDir, {
    kind: 'result',
    task: 'ext',
    attempt: 1,
    session: 's1',
    time: 5000,
    ok: true,
    pair: { harness: 'grok', model: 'grok-4.7' },
    branch: `aether/${args.runId}/task-1`,
    worktree: unit.path,
    checks: { ok: true },
  })
  const r = approve(repo, dataDir, ['--task', 'ext'])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.approved, true, JSON.stringify(r.json))
  assert.equal(r.json.merged, true, JSON.stringify(r.json))
  assert.equal(r.json.tests, 'passed')
  assert.equal(r.json.branch, 'feature/x')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 't1', 'a.js'), 'utf8'), 'from the unit\n')
  assert.equal(verdicts(dataDir, 'ext').at(-1).verdict, 'approved')
})
