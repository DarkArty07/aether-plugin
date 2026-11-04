'use strict'

// Spec 026 (R4 to R8, R27): the reading of the repository: snapshots, secrets without their values, TODO, branches, hotspots, issues and PR.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PLUGIN, makeRepo, tempDir, commitIn } = require('./helpers.js')

const lib = (name) => require(path.join(PLUGIN, 'lib', name))
const snap = lib('audit-snapshot.js')
const scan = lib('audit-scan.js')
const github = lib('audit-github.js')

// Fake values, built here so that no file of the repository holds one whole.
const STRIPE = ['sk', 'live', 'a1B2c3D4e5F6g7H8i9J0k1L2m3'].join('_')
const AWS = 'AKIA' + 'IOSFODNN7EXAMPLE'
const GITHUB = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'
const leaks = (text, value) => {
  for (let i = 0; i + 8 <= value.length; i++) if (text.includes(value.slice(i, i + 8))) return true
  return false
}

function commitOn(repo, file, content, message, isoDate) {
  fs.mkdirSync(path.dirname(path.join(repo.dir, file)), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, file), content)
  repo.git('add', file)
  const r = spawnSync('git', ['commit', '-q', '-m', message], { cwd: repo.dir, encoding: 'utf8', env: { ...process.env, GIT_COMMITTER_DATE: isoDate, GIT_AUTHOR_DATE: isoDate } })
  assert.equal(r.status, 0, r.stderr)
}
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString()
const fake = (reply) => {
  const calls = []
  const exec = async (file, args, opts) => { calls.push([file, ...args]); return typeof reply === 'function' ? reply(file, args, opts) : reply }
  exec.calls = calls
  return exec
}

test('a snapshot of a quiet repository equals the next one, and the lines and the folder of Aether do not count (R6, R25)', (t) => {
  const repo = makeRepo(t)
  const before = snap.snapshot(repo.dir)
  assert.equal(snap.diffSnapshots(before, snap.snapshot(repo.dir)).changed, false)
  fs.mkdirSync(path.join(repo.dir, '.aether', 'delegates'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'state.json'), '{}')
  assert.equal(snap.diffSnapshots(before, snap.snapshot(repo.dir)).changed, false, 'the folder .aether/ does not count even before its exclude lines')
  const exclude = path.join(repo.dir, '.git', 'info', 'exclude')
  fs.mkdirSync(path.dirname(exclude), { recursive: true })
  fs.appendFileSync(exclude, '/.aether/\n/.aether-tmp/\n/.aether-exam/\n')
  assert.equal(snap.diffSnapshots(before, snap.snapshot(repo.dir)).changed, false, 'the three exclude lines of Aether do not count')
  fs.appendFileSync(exclude, '/private-notes/\n')
  assert.deepEqual(snap.diffSnapshots(before, snap.snapshot(repo.dir)).items.map((i) => i.kind), ['exclude'])
})

test('a change to a tracked file counts, also when it was already modified; an ignored file does not; a new untracked file does (R6)', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, '.gitignore', 'coverage/\n', 'ignore coverage')
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'a\n')
  const one = snap.snapshot(repo.dir)
  fs.appendFileSync(path.join(repo.dir, 'README.md'), 'b\n')
  const two = snap.snapshot(repo.dir)
  const d = snap.diffSnapshots(one, two)
  assert.equal(d.changed, true)
  assert.deepEqual(d.items.map((i) => [i.kind, i.files]), [['status', ['README.md']]])
  fs.mkdirSync(path.join(repo.dir, 'coverage'))
  fs.writeFileSync(path.join(repo.dir, 'coverage', 'lcov.info'), 'x')
  assert.equal(snap.diffSnapshots(two, snap.snapshot(repo.dir)).changed, false)
  fs.writeFileSync(path.join(repo.dir, 'notes.txt'), 'x')
  assert.deepEqual(snap.diffSnapshots(two, snap.snapshot(repo.dir)).items.map((i) => i.files), [['notes.txt']])
})

test('a commit, a branch, a stash and a worktree are changes of their own kind (R6)', (t) => {
  const repo = makeRepo(t)
  const kinds = (fn) => {
    const before = snap.snapshot(repo.dir)
    fn()
    return snap.diffSnapshots(before, snap.snapshot(repo.dir)).items.map((i) => i.kind)
  }
  assert.ok(kinds(() => commitIn(repo, repo.dir, 'a.txt', 'a', 'a')).includes('head'))
  assert.ok(kinds(() => repo.git('branch', 'other')).includes('branches'))
  assert.ok(kinds(() => { fs.appendFileSync(path.join(repo.dir, 'a.txt'), 'x'); repo.git('stash', 'push', '-q', '-m', 'wip') }).includes('stash'))
  assert.ok(kinds(() => repo.git('worktree', 'add', '-q', '-b', 'wt', path.join(tempDir(t), 'wt'))).includes('worktrees'))
})

test('withSnapshots attributes a change to the step that made it and calls a change between two steps unattributable (R6)', async (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, '.gitignore', 'coverage/\n', 'ignore coverage')
  const steps = [
    { name: 'tests', run: async () => { fs.mkdirSync(path.join(repo.dir, 'coverage')); fs.writeFileSync(path.join(repo.dir, 'coverage', 'lcov.info'), 'x') } },
    { name: 'lint', run: async () => { fs.appendFileSync(path.join(repo.dir, 'README.md'), 'fixed\n'); return 'lint done' } },
    { name: 'dependencies', run: async () => 'ok' },
  ]
  let calls = 0
  const snapshotFn = (root) => {
    calls++
    if (calls === 5) fs.writeFileSync(path.join(root, 'other-session.txt'), 'x\n') // another session, after the second step and before the third
    return snap.snapshot(root)
  }
  const out = await snap.withSnapshots(repo.dir, steps, { snapshotFn })
  assert.equal(calls, 6, 'one snapshot before and one after each step')
  assert.deepEqual(out.results, [undefined, 'lint done', 'ok'])
  assert.equal(out.changes.changed, true)
  assert.deepEqual(out.changes.attributed.map((a) => a.step), ['lint'])
  assert.deepEqual(out.changes.attributed[0].items[0].files, ['README.md'])
  assert.deepEqual(out.changes.unattributable.map((u) => u.between), [['lint', 'dependencies']])
  assert.deepEqual(out.changes.unattributable[0].items[0].files, ['other-session.txt'])
})

test('secrets: the tree and the history of every branch are read and no value is ever printed (R4, R7, scenario 8)', async (t) => {
  const repo = makeRepo(t)
  commitOn(repo, 'config/dev.env', `STRIPE_KEY=${STRIPE}\n`, 'add dev env', daysAgo(30))
  const oldCommit = repo.git('rev-parse', 'HEAD')
  repo.git('rm', '-q', 'config/dev.env')
  repo.git('commit', '-q', '-m', 'remove dev env')
  commitOn(repo, 'src/config.js', `// config\nconst id = '${AWS}'\n`, 'add config', daysAgo(10))
  repo.git('switch', '-q', '-c', 'side')
  commitOn(repo, 'leak.txt', `token ${GITHUB}\n`, 'leak on a side branch', daysAgo(5))
  repo.git('switch', '-q', 'feature/x')
  const result = await scan.secrets(repo.dir)
  assert.equal(result.state, 'result')
  assert.equal(result.truncated, false)
  const byFile = Object.fromEntries(result.findings.map((f) => [f.file, f]))
  assert.deepEqual([byFile['config/dev.env'].type, byFile['config/dev.env'].inTree, byFile['config/dev.env'].commit, byFile['config/dev.env'].line], ['stripe-live-key', false, oldCommit, null])
  assert.deepEqual([byFile['src/config.js'].type, byFile['src/config.js'].inTree, byFile['src/config.js'].line], ['aws-access-key-id', true, 2])
  assert.match(byFile['src/config.js'].commit, /^[0-9a-f]{40}$/)
  assert.deepEqual([byFile['leak.txt'].type, byFile['leak.txt'].inTree], ['github-token', false])
  assert.match(byFile['leak.txt'].commit, /^[0-9a-f]{40}$/)
  const text = JSON.stringify(result)
  for (const value of [STRIPE, AWS, GITHUB]) assert.equal(leaks(text, value), false, `a part of ${value.slice(0, 6)}... is in the result`)
})

test('secrets: an assignment of a long literal is a low-confidence finding, an environment read and a short literal are not, and a clean repository has none', async (t) => {
  const repo = makeRepo(t)
  commitOn(repo, 'a.py', 'password = "hunter2hunter2hunter2"\ntoken = os.environ["TOKEN"]\nsecret = "short"\n', 'assignments', daysAgo(1))
  const result = await scan.secrets(repo.dir)
  assert.deepEqual(result.findings.map((f) => [f.type, f.file, f.line, f.confidence]), [['generic-assignment', 'a.py', 1, 'low']])
  assert.equal(leaks(JSON.stringify(result), 'hunter2hunter2hunter2'), false)
  const clean = await scan.secrets(makeRepo(t).dir)
  assert.deepEqual([clean.state, clean.findings], ['result', []])
})

test('secrets: a history larger than the cap is read in part and says so', async (t) => {
  const repo = makeRepo(t)
  commitOn(repo, 'big.txt', 'x\n'.repeat(5000), 'big', daysAgo(1))
  const result = await scan.secrets(repo.dir, { maxHistoryBytes: 100 })
  assert.equal(result.state, 'result')
  assert.equal(result.truncated, true)
})

test('redact replaces every secret-looking value by its type', () => {
  assert.equal(scan.redact(`a ${AWS} b`), 'a [redacted aws-access-key-id] b')
  assert.equal(scan.redact('nothing here'), 'nothing here')
})

test('todos: TODO and FIXME of the tracked files, with file and line, the text redacted (R4)', (t) => {
  const repo = makeRepo(t)
  commitIn(repo, repo.dir, 'src/a.js', 'one\ntwo\n// TODO: fix the retry\n', 'a')
  commitIn(repo, repo.dir, 'src/b.py', '# FIXME later\nx = 1\n', 'b')
  commitIn(repo, repo.dir, 'src/c.js', `// TODO use ${AWS}\n`, 'c')
  fs.writeFileSync(path.join(repo.dir, 'untracked.js'), '// TODO not tracked\n')
  const r = scan.todos(repo.dir)
  assert.equal(r.state, 'result')
  assert.equal(r.total, 3)
  const by = Object.fromEntries(r.items.map((i) => [i.file, i]))
  assert.deepEqual([by['src/a.js'].line, by['src/a.js'].tag, by['src/a.js'].text], [3, 'TODO', '// TODO: fix the retry'])
  assert.deepEqual([by['src/b.py'].line, by['src/b.py'].tag], [1, 'FIXME'])
  assert.equal(leaks(JSON.stringify(r), AWS), false)
  assert.ok(by['src/c.js'].text.includes('[redacted aws-access-key-id]'))
  assert.equal(by['untracked.js'], undefined)
})

test('hotspots: ordered by how much a file changes and how big it is, and a big file that hardly changes stays below one that changes a lot (R8)', (t) => {
  const repo = makeRepo(t)
  const body = (lines, tag) => 'x\n'.repeat(lines - 1) + `// ${tag}\n`
  commitIn(repo, repo.dir, 'big.js', body(400, 0), 'big once')
  for (let i = 0; i < 2; i++) commitIn(repo, repo.dir, 'big2.js', body(400, i), `big2 ${i}`)
  for (let i = 0; i < 6; i++) commitIn(repo, repo.dir, 'hot.js', body(20, i), `hot ${i}`)
  for (let i = 0; i < 3; i++) commitIn(repo, repo.dir, 'mid.js', body(20, i), `mid ${i}`)
  const r = scan.hotspots(repo.dir)
  assert.equal(r.state, 'result')
  assert.deepEqual(r.items.map((i) => i.file), ['hot.js', 'big2.js', 'mid.js'])
  assert.deepEqual([r.items[0].changes, r.items[0].lines], [6, 20])
  assert.equal(typeof r.items[0].score, 'number')
  assert.ok(r.items[0].score > r.items[1].score && r.items[1].score > r.items[2].score)
})

test('branches: the age, the lead over the default branch and whether each is merged; a branch is stale after 60 days (R4)', (t) => {
  const repo = makeRepo(t)
  repo.git('switch', '-q', 'main')
  repo.git('switch', '-q', '-c', 'old')
  commitOn(repo, 'old.txt', 'x', 'old work', daysAgo(100))
  repo.git('switch', '-q', 'main')
  repo.git('branch', 'merged')
  const r = scan.branches(repo.dir, { now: new Date() })
  assert.equal(r.state, 'result')
  assert.equal(r.default, 'main')
  const by = Object.fromEntries(r.items.map((i) => [i.name, i]))
  assert.deepEqual([by.old.stale, by.old.merged, by.old.aheadOfDefault, by.old.kind], [true, false, 1, 'local'])
  assert.ok(by.old.ageDays >= 100 && by.old.ageDays < 101)
  assert.deepEqual([by.merged.stale, by.merged.merged, by.merged.aheadOfDefault], [false, true, 0])
  assert.equal(by.main.stale, false)
  assert.equal(r.stale, 1)
})

const issuesJson = JSON.stringify([{ number: 41, title: 'Export CSV', createdAt: daysAgo(100), labels: [{ name: 'enhancement' }], url: 'https://github.com/o/r/issues/41' }])
const prsJson = JSON.stringify([{ number: 7, title: 'Fix stock', createdAt: daysAgo(3), isDraft: true, headRefName: 'fix/stock', url: 'https://github.com/o/r/pull/7' }])

test('github: a GitHub remote and a gh that answers give the open issues and PR with their age (R4, R17)', async (t) => {
  const repo = makeRepo(t)
  repo.git('remote', 'add', 'origin', 'git@github.com:o/r.git')
  const exec = fake((file, args) => ({ status: 0, stdout: args[0] === 'issue' ? issuesJson : prsJson, stderr: '', timedOut: false }))
  const issues = await github.issues(repo.dir, { exec, env: {} })
  assert.equal(issues.state, 'result')
  assert.deepEqual(issues.open.map((i) => [i.number, i.labels]), [[41, ['enhancement']]])
  assert.ok(issues.open[0].ageDays >= 100)
  assert.equal(issues.olderThan90, 1)
  assert.deepEqual(exec.calls[0].slice(0, 3), ['gh', 'issue', 'list'])
  assert.ok(exec.calls[0].includes('--state') && exec.calls[0].includes('open'))
  const prs = await github.prs(repo.dir, { exec, env: {} })
  assert.equal(prs.state, 'result')
  assert.deepEqual(prs.open.map((p) => [p.number, p.draft, p.branch]), [[7, true, 'fix/stock']])
  assert.deepEqual(exec.calls[1].slice(0, 3), ['gh', 'pr', 'list'])
})

test('github: no GitHub remote is not applicable, a missing gh and a failing gh could not be read, and nothing runs without a GitHub remote', async (t) => {
  const never = fake({ status: 0, stdout: '[]', stderr: '', timedOut: false })
  const none = makeRepo(t)
  const a = await github.issues(none.dir, { exec: never, env: {} })
  assert.equal(a.state, 'not-applicable')
  none.git('remote', 'add', 'origin', 'https://gitlab.com/o/r.git')
  const b = await github.prs(none.dir, { exec: never, env: {} })
  assert.equal(b.state, 'not-applicable')
  assert.match(b.reason, /not GitHub/)
  assert.equal(never.calls.length, 0)
  const repo = makeRepo(t)
  repo.git('remote', 'add', 'origin', 'https://github.com/o/r.git')
  const missing = await github.issues(repo.dir, { exec: fake({ status: null, stdout: '', stderr: '', timedOut: false, error: { code: 'ENOENT', message: 'spawn gh ENOENT' } }), env: {} })
  assert.deepEqual([missing.state, missing.reason], ['could-not', 'gh is not installed'])
  const failing = await github.issues(repo.dir, { exec: fake({ status: 1, stdout: '', stderr: 'HTTP 401: bad credentials\nmore', timedOut: false }), env: {} })
  assert.equal(failing.state, 'could-not')
  assert.match(failing.reason, /gh failed: HTTP 401: bad credentials/)
  const garbage = await github.prs(repo.dir, { exec: fake({ status: 0, stdout: 'not json', stderr: '', timedOut: false }), env: {} })
  assert.deepEqual([garbage.state, garbage.reason], ['could-not', 'gh output not understood'])
})
