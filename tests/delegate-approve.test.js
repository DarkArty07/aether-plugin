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
const OWNS = 'AETHER-OWNS: src/**\n'
// Exits 0 and writes nothing: the approve verdict runs this command in the worktree before the merge, so a command
// that creates a file would fail the owns check.
const TASK_TESTS = 'AETHER-TESTS: node -e "process.exit(0)"\n'
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
  assert.equal(r.json.testCommand, 'npm test')
  assert.equal(r.json.testSource, 'default')
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
  assert.equal(r.json.testCommand, 'echo settings > settings-marker.txt')
  assert.equal(r.json.testSource, 'settings')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'settings-marker.txt'), 'utf8'), 'settings\n')
  assert.equal(fs.existsSync(path.join(repo.dir, 'marker.txt')), false, 'npm test did not run')
})

test("the task's own AETHER-TESTS command runs, ahead of settings.json and npm test", async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, false)
  fs.mkdirSync(path.join(repo.dir, '.aether'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'settings.json'), JSON.stringify({ testCommand: 'echo settings > settings-marker.txt' }))
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('t1', OWNS + TASK_TESTS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'x\n')
  const r = approve(repo, dataDir, ['--task', 't1', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.tests, 'passed', JSON.stringify(r.json))
  assert.equal(r.json.testCommand, 'node -e "process.exit(0)"')
  assert.equal(r.json.testSource, 'task')
  assert.equal(fs.existsSync(path.join(repo.dir, 'settings-marker.txt')), false)
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

test('approve refuses before recording any verdict when run from inside the delegate worktree, and succeeds later from the checkout (#282)', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('self-merge', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'from delegate\n')
  const sub = path.join(side, 'src')
  const before = repo.git('rev-parse', 'HEAD')

  const fromRoot = runBin(BIN, ['approve', '--task', 'self-merge', '--worktree', side], side, { AETHER_DATA_DIR: dataDir })
  assert.equal(fromRoot.status, 0, fromRoot.stdout + fromRoot.stderr)
  assert.equal(fromRoot.json.approved, false)
  assert.equal(fromRoot.json.merged, false)
  assert.match(fromRoot.json.reason, /own checkout/i)
  assert.equal(verdicts(dataDir, 'self-merge').length, 0)
  assert.equal(repo.git('rev-parse', 'HEAD'), before)

  const fromSub = runBin(BIN, ['approve', '--task', 'self-merge', '--worktree', side], sub, { AETHER_DATA_DIR: dataDir })
  assert.equal(fromSub.status, 0, fromSub.stdout + fromSub.stderr)
  assert.equal(fromSub.json.approved, false)
  assert.equal(fromSub.json.merged, false)
  assert.match(fromSub.json.reason, /own checkout/i)
  assert.equal(verdicts(dataDir, 'self-merge').length, 0)

  const fromCheckout = approve(repo, dataDir, ['--task', 'self-merge', '--worktree', side])
  assert.equal(fromCheckout.status, 0, fromCheckout.stdout + fromCheckout.stderr)
  assert.equal(fromCheckout.json.approved, true, JSON.stringify(fromCheckout.json))
  assert.equal(fromCheckout.json.merged, true, JSON.stringify(fromCheckout.json))
  assert.equal(fromCheckout.json.branch, 'feature/x')
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 'a.js'), 'utf8'), 'from delegate\n')
  assert.equal(verdicts(dataDir, 'self-merge').at(-1).verdict, 'approved')

  // Same refusal for an external pair's unit worktree when approve runs from inside it.
  const args = compile(repo, plan([planTask(1)], { execution: ['- Test command: `true`'] }))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'from unit\n', 'unit edit')
  await task.begin(call(BRIEF('self-ext', OWNS)), deps)
  log.appendEntry(dataDir, {
    kind: 'result',
    task: 'self-ext',
    attempt: 1,
    session: 's1',
    time: 5000,
    ok: true,
    pair: { harness: 'grok', model: 'grok-4.7' },
    branch: `aether/${args.runId}/task-1`,
    worktree: unit.path,
    checks: { ok: true },
  })
  const extFromUnit = runBin(BIN, ['approve', '--task', 'self-ext'], unit.path, { AETHER_DATA_DIR: dataDir })
  assert.equal(extFromUnit.status, 0, extFromUnit.stdout + extFromUnit.stderr)
  assert.equal(extFromUnit.json.approved, false)
  assert.equal(extFromUnit.json.merged, false)
  assert.match(extFromUnit.json.reason, /own checkout/i)
  assert.equal(verdicts(dataDir, 'self-ext').length, 0)
})

test('approve ignores __pycache__/, *.pyc, gitignored files, and --ignore globs in all three spellings (#281)', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  fs.writeFileSync(path.join(repo.dir, '.gitignore'), '*.ignored\n')
  repo.git('add', '.gitignore')
  repo.git('commit', '-q', '-m', 'gitignore')

  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('py', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.py', 'x = 1\n')
  fs.mkdirSync(path.join(side, '__pycache__'), { recursive: true })
  fs.writeFileSync(path.join(side, '__pycache__', 'a.cpython-314.pyc'), 'pyc\n')
  fs.mkdirSync(path.join(side, 'pkg', '__pycache__'), { recursive: true })
  fs.writeFileSync(path.join(side, 'pkg', '__pycache__', 'b.cpython-314.pyc'), 'pyc\n')
  fs.writeFileSync(path.join(side, 'extra.pyc'), 'pyc\n')
  fs.writeFileSync(path.join(side, 'note.ignored'), 'ignored\n')

  const r = approve(repo, dataDir, ['--task', 'py', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.approved, true, JSON.stringify(r.json))
  assert.equal(r.json.merged, true, JSON.stringify(r.json))
  assert.equal(fs.readFileSync(path.join(repo.dir, 'src', 'a.py'), 'utf8'), 'x = 1\n')

  for (const [idx, glob] of ['src/tmp/**', 'src/tmp/', 'src/tmp'].entries()) {
    const id = `ign-${idx}`
    await task.begin(call(BRIEF(id, OWNS)), deps)
    const wtDir = sideWorktree(t, repo, `src/b${idx}.js`, `export const v = ${idx}\n`)
    fs.mkdirSync(path.join(wtDir, 'src', 'tmp'), { recursive: true })
    fs.writeFileSync(path.join(wtDir, 'src', 'tmp', 'out.txt'), 'artifact\n')
    const ok = approve(repo, dataDir, ['--task', id, '--worktree', wtDir, '--ignore', glob])
    assert.equal(ok.status, 0, ok.stdout + ok.stderr)
    assert.equal(ok.json.approved, true, `glob ${glob}: ${JSON.stringify(ok.json)}`)
    assert.equal(ok.json.merged, true, `glob ${glob}: ${JSON.stringify(ok.json)}`)
  }

  for (const [idx, glob] of ['__pycache__/**', '__pycache__/', '__pycache__'].entries()) {
    const id = `ign-py-${idx}`
    await task.begin(call(BRIEF(id, OWNS)), deps)
    const wtDir = sideWorktree(t, repo, `src/p${idx}.py`, `v = ${idx}\n`)
    fs.mkdirSync(path.join(wtDir, '__pycache__'), { recursive: true })
    fs.writeFileSync(path.join(wtDir, '__pycache__', 'mod.cpython-314.pyc'), 'pyc\n')
    const ok = approve(repo, dataDir, ['--task', id, '--worktree', wtDir, '--ignore', glob])
    assert.equal(ok.status, 0, ok.stdout + ok.stderr)
    assert.equal(ok.json.approved, true, `glob ${glob}: ${JSON.stringify(ok.json)}`)
    assert.equal(ok.json.merged, true, `glob ${glob}: ${JSON.stringify(ok.json)}`)
  }

  const badIgnore = approve(repo, dataDir, ['--task', 'py', '--worktree', side, '--ignore', ''])
  assert.equal(badIgnore.status, 0, badIgnore.stdout + badIgnore.stderr)
  assert.equal(badIgnore.json.approved, false)
  assert.match(badIgnore.json.reason, /--ignore needs a glob/)

  // An ignored untracked file outside AETHER-OWNS still fails the Owns check in verdict.
  await task.begin(call(BRIEF('ign-out', OWNS)), deps)
  const outWt = sideWorktree(t, repo, 'src/c.js', 'export const c = 1\n')
  fs.mkdirSync(path.join(outWt, 'build'), { recursive: true })
  fs.writeFileSync(path.join(outWt, 'build', 'out.txt'), 'outside\n')
  const outRes = approve(repo, dataDir, ['--task', 'ign-out', '--worktree', outWt, '--ignore', 'build/**'])
  assert.equal(outRes.status, 0, outRes.stdout + outRes.stderr)
  assert.equal(outRes.json.approved, false)
  assert.match(outRes.json.reason, /files outside owns: build\/out\.txt/)
})


test('approve refuses before recording any verdict when a different checkout is on the same branch as the delegate', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('same-branch', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'from delegate\n')
  const sideBranch = spawnSync('git', ['branch', '--show-current'], { cwd: side, encoding: 'utf8' }).stdout.trim()

  const cloneDir = path.join(tempDir(t, 'aether-clone-'), 'repo')
  const cloned = spawnSync('git', ['-c', 'protocol.file.allow=always', 'clone', '-q', repo.dir, cloneDir], { encoding: 'utf8' })
  assert.equal(cloned.status, 0, cloned.stderr)
  const checked = spawnSync('git', ['checkout', '-q', '-b', sideBranch], { cwd: cloneDir, encoding: 'utf8' })
  assert.equal(checked.status, 0, checked.stderr)

  const claudeSame = runBin(BIN, ['approve', '--task', 'same-branch', '--worktree', side], cloneDir, { AETHER_DATA_DIR: dataDir })
  assert.equal(claudeSame.status, 0, claudeSame.stdout + claudeSame.stderr)
  assert.equal(claudeSame.json.approved, false)
  assert.equal(claudeSame.json.merged, false)
  assert.match(claudeSame.json.reason, /cannot merge branch .* into itself/i)
  assert.equal(verdicts(dataDir, 'same-branch').length, 0)

  // External unit: detach the unit worktree so another checkout can hold the unit branch.
  const args = compile(repo, plan([planTask(1)], { execution: ['- Test command: `true`'] }))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'from unit\n', 'unit edit')
  const detached = spawnSync('git', ['checkout', '-q', '--detach'], { cwd: unit.path, encoding: 'utf8' })
  assert.equal(detached.status, 0, detached.stderr)
  repo.git('checkout', '-q', `aether/${args.runId}/task-1`)

  await task.begin(call(BRIEF('same-branch-ext', OWNS)), deps)
  log.appendEntry(dataDir, {
    kind: 'result',
    task: 'same-branch-ext',
    attempt: 1,
    session: 's1',
    time: 5000,
    ok: true,
    pair: { harness: 'grok', model: 'grok-4.7' },
    branch: `aether/${args.runId}/task-1`,
    worktree: unit.path,
    checks: { ok: true },
  })
  const extSame = approve(repo, dataDir, ['--task', 'same-branch-ext'])
  assert.equal(extSame.status, 0, extSame.stdout + extSame.stderr)
  assert.equal(extSame.json.approved, false)
  assert.equal(extSame.json.merged, false)
  assert.match(extSame.json.reason, /cannot merge branch .* into itself/i)
  assert.equal(verdicts(dataDir, 'same-branch-ext').length, 0)
})

test('approve on a different worktree and branch whose HEAD equals the delegate commit answers merged:true with already:true', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('same-head', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'from delegate\n')
  const sideHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: side, encoding: 'utf8' }).stdout.trim()
  repo.git('merge', '-q', '--ff-only', sideHead)
  assert.equal(repo.git('rev-parse', 'HEAD'), sideHead)

  const r = approve(repo, dataDir, ['--task', 'same-head', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.approved, true, JSON.stringify(r.json))
  assert.equal(r.json.merged, true, JSON.stringify(r.json))
  assert.equal(r.json.already, true, JSON.stringify(r.json))
  assert.equal(r.json.tests, 'passed')
  assert.equal(r.json.branch, 'feature/x')
  assert.equal(verdicts(dataDir, 'same-head').at(-1).verdict, 'approved')

  // External unit whose tip equals target HEAD on a different branch.
  const args = compile(repo, plan([planTask(1)], { execution: ['- Test command: `true`'] }))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'from unit\n', 'unit edit')
  const unitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: unit.path, encoding: 'utf8' }).stdout.trim()
  repo.git('merge', '-q', '--ff-only', unitHead)
  assert.equal(repo.git('rev-parse', 'HEAD'), unitHead)

  await task.begin(call(BRIEF('same-head-ext', OWNS)), deps)
  log.appendEntry(dataDir, {
    kind: 'result',
    task: 'same-head-ext',
    attempt: 1,
    session: 's1',
    time: 5000,
    ok: true,
    pair: { harness: 'grok', model: 'grok-4.7' },
    branch: `aether/${args.runId}/task-1`,
    worktree: unit.path,
    checks: { ok: true },
  })
  const ext = approve(repo, dataDir, ['--task', 'same-head-ext'])
  assert.equal(ext.status, 0, ext.stdout + ext.stderr)
  assert.equal(ext.json.approved, true, JSON.stringify(ext.json))
  assert.equal(ext.json.merged, true, JSON.stringify(ext.json))
  assert.equal(ext.json.already, true, JSON.stringify(ext.json))
  assert.equal(ext.json.tests, 'passed')
  assert.equal(verdicts(dataDir, 'same-head-ext').at(-1).verdict, 'approved')
})

test('approve on an already-merged target answers merged:true with already:true', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('already-merged', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'from delegate\n')
  const sideHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: side, encoding: 'utf8' }).stdout.trim()
  repo.git('merge', '-q', '--no-ff', '-m', 'pre-merged', sideHead)
  commitIn(repo, repo.dir, 'README.md', 'later commit\n', 'later')
  const headBefore = repo.git('rev-parse', 'HEAD')

  const r = approve(repo, dataDir, ['--task', 'already-merged', '--worktree', side])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.approved, true, JSON.stringify(r.json))
  assert.equal(r.json.merged, true, JSON.stringify(r.json))
  assert.equal(r.json.already, true, JSON.stringify(r.json))
  assert.equal(r.json.tests, 'passed')
  assert.equal(repo.git('rev-parse', 'HEAD'), headBefore)
  assert.equal(verdicts(dataDir, 'already-merged').at(-1).verdict, 'approved')

  // External unit already merged into target branch.
  const args = compile(repo, plan([planTask(1)], { execution: ['- Test command: `true`'] }))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'from unit\n', 'unit edit')
  repo.git('merge', '-q', '--no-ff', '-m', 'pre-merged unit', `aether/${args.runId}/task-1`)

  await task.begin(call(BRIEF('already-merged-ext', OWNS)), deps)
  log.appendEntry(dataDir, {
    kind: 'result',
    task: 'already-merged-ext',
    attempt: 1,
    session: 's1',
    time: 5000,
    ok: true,
    pair: { harness: 'grok', model: 'grok-4.7' },
    branch: `aether/${args.runId}/task-1`,
    worktree: unit.path,
    checks: { ok: true },
  })
  const ext = approve(repo, dataDir, ['--task', 'already-merged-ext'])
  assert.equal(ext.status, 0, ext.stdout + ext.stderr)
  assert.equal(ext.json.approved, true, JSON.stringify(ext.json))
  assert.equal(ext.json.merged, true, JSON.stringify(ext.json))
  assert.equal(ext.json.already, true, JSON.stringify(ext.json))
  assert.equal(ext.json.tests, 'passed')
  assert.equal(verdicts(dataDir, 'already-merged-ext').at(-1).verdict, 'approved')
})

function gitWrapper(t, repo, scriptBody) {
  const binDir = tempDir(t, 'aether-git-wrap-')
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim()
  const gitPath = path.join(binDir, 'git')
  fs.writeFileSync(gitPath, `#!/usr/bin/env bash\nREAL_GIT=${JSON.stringify(realGit)}\n${scriptBody}\n`, { mode: 0o755 })
  return `${binDir}:${process.env.PATH}`
}

test('mergeExternal when unit tip cannot be read does not claim already unless aether-wt reports already', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const args = compile(repo, plan([planTask(1)], { execution: ['- Test command: `true`'] }))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'from unit\n', 'unit edit')
  const branch = `aether/${args.runId}/task-1`
  const marker = path.join(tempDir(t, 'aether-flag-'), 'called')
  const wrappedPath = gitWrapper(t, repo, `
if [ "$1" = "rev-parse" ] && [ "$2" = ${JSON.stringify(branch)} ] && [ ! -f ${JSON.stringify(marker)} ]; then
  touch ${JSON.stringify(marker)}
  exit 1
fi
if [ "$1" = "merge" ]; then
  exit 0
fi
exec "$REAL_GIT" "$@"
`)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('ext-no-tip', OWNS)), deps)
  log.appendEntry(dataDir, {
    kind: 'result', task: 'ext-no-tip', attempt: 1, session: 's1', time: 5000, ok: true,
    pair: { harness: 'grok', model: 'grok-4.7' }, branch, worktree: unit.path, checks: { ok: true },
  })
  const r = approve(repo, dataDir, ['--task', 'ext-no-tip'], { PATH: wrappedPath })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.merged, true)
  assert.equal(r.json.already, undefined, JSON.stringify(r.json))
})

test('mergeExternal when unit tip cannot be read reports already when aether-wt merge reports already', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const args = compile(repo, plan([planTask(1)], { execution: ['- Test command: `true`'] }))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'from unit\n', 'unit edit')
  wt.merge(repo.dir, args.runId, 'task-1')
  const branch = `aether/${args.runId}/task-1`
  const marker = path.join(tempDir(t, 'aether-flag-'), 'called')
  const wrappedPath = gitWrapper(t, repo, `
if [ "$1" = "rev-parse" ] && [ "$2" = ${JSON.stringify(branch)} ] && [ ! -f ${JSON.stringify(marker)} ]; then
  touch ${JSON.stringify(marker)}
  exit 1
fi
exec "$REAL_GIT" "$@"
`)
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('ext-no-tip-already', OWNS)), deps)
  log.appendEntry(dataDir, {
    kind: 'result', task: 'ext-no-tip-already', attempt: 1, session: 's1', time: 5000, ok: true,
    pair: { harness: 'grok', model: 'grok-4.7' }, branch, worktree: unit.path, checks: { ok: true },
  })
  const r = approve(repo, dataDir, ['--task', 'ext-no-tip-already'], { PATH: wrappedPath })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.merged, true)
  assert.equal(r.json.already, true, JSON.stringify(r.json))
})

test('both merge paths refuse when merge reports success but leaves HEAD without the delegate commit', async (t) => {
  const repo = makeRepo(t)
  commitPackage(repo, true)
  const wrappedPath = gitWrapper(t, repo, `
if [ "$1" = "merge" ]; then
  exit 0
fi
exec "$REAL_GIT" "$@"
`)
  // 1. mergeWorktree path
  const { dataDir, deps } = world(t, repo.dir)
  await task.begin(call(BRIEF('wt-no-advance', OWNS)), deps)
  const side = sideWorktree(t, repo, 'src/a.js', 'from delegate\n')
  const r1 = approve(repo, dataDir, ['--task', 'wt-no-advance', '--worktree', side], { PATH: wrappedPath })
  assert.equal(r1.json.approved, true)
  assert.equal(r1.json.merged, false)
  assert.match(r1.json.reason, /did not advance/)

  // 2. mergeExternal path
  const args = compile(repo, plan([planTask(1)], { execution: ['- Test command: `true`'] }))
  const unit = wt.ensure(repo.dir, args.runId, 'task-1')
  commitIn(repo, unit.path, 'src/t1/a.js', 'from unit\n', 'unit edit')
  await task.begin(call(BRIEF('ext-no-advance', OWNS)), deps)
  log.appendEntry(dataDir, {
    kind: 'result', task: 'ext-no-advance', attempt: 1, session: 's1', time: 5000, ok: true,
    pair: { harness: 'grok', model: 'grok-4.7' }, branch: `aether/${args.runId}/task-1`, worktree: unit.path, checks: { ok: true },
  })
  const r2 = approve(repo, dataDir, ['--task', 'ext-no-advance'], { PATH: wrappedPath })
  assert.equal(r2.json.approved, true)
  assert.equal(r2.json.merged, false)
  assert.match(r2.json.reason, /did not advance/)
})
