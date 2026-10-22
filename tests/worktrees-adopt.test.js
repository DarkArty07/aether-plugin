'use strict'

// Issue 005: the Lead integrates a unit by hand when the swarm could not. `aether-wt adopt` records it, with
// the commit on the integration branch and the reason, so the report and finalize agree with the branch.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WT_BIN, makeRepo, compile, commitIn, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')

function run(t) {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  return { repo, args }
}

const adopt = (repo, args, ...rest) => runBin(WT_BIN, ['adopt', args.runId, ...rest], repo.dir)

test('adopt records a unit the Lead integrated by hand, with its commit and reason', (t) => {
  const { repo, args } = run(t)
  commitIn(repo, repo.dir, 'src/t1/a.js', 'one\n', 'task 1 by hand')
  const sha = repo.git('rev-parse', 'HEAD')
  const r = adopt(repo, args, 'task-1', '--commit', sha.slice(0, 10), '--reason', 'the unit was too large; applied its patch')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.deepEqual([r.json.adopted, r.json.task, r.json.commit, r.json.reason], [true, 'task-1', sha, 'the unit was too large; applied its patch'])
  assert.deepEqual(r.json.units, ['task-1'])
  const file = JSON.parse(fs.readFileSync(path.join(args.runDir, 'adopted.json'), 'utf8'))
  assert.deepEqual(Object.keys(file), ['task-1'])
  assert.deepEqual([file['task-1'].commit, file['task-1'].reason], [sha, 'the unit was too large; applied its patch'])
  assert.match(file['task-1'].at, /^\d{4}-\d\d-\d\dT/)
})

test('adopting a unit again replaces its record, and several units are kept', (t) => {
  const { repo, args } = run(t)
  commitIn(repo, repo.dir, 'src/t1/a.js', 'one\n', 'one')
  const first = repo.git('rev-parse', 'HEAD')
  commitIn(repo, repo.dir, 'src/t2/b.js', 'two\n', 'two')
  const second = repo.git('rev-parse', 'HEAD')
  assert.equal(adopt(repo, args, 'task-1', '--commit', first, '--reason', 'first try').status, 0)
  assert.equal(adopt(repo, args, 'task-2', '--commit', second, '--reason', 'by hand').status, 0)
  const again = adopt(repo, args, 'task-1', '--commit', second, '--reason', 'second try')
  assert.deepEqual(again.json.units, ['task-1', 'task-2'])
  const file = JSON.parse(fs.readFileSync(path.join(args.runDir, 'adopted.json'), 'utf8'))
  assert.deepEqual([file['task-1'].commit, file['task-1'].reason], [second, 'second try'])
})

test('adopt refuses a commit that is not in the integration branch, an unknown commit and an unknown task', (t) => {
  const { repo, args } = run(t)
  const integration = repo.git('rev-parse', 'HEAD')
  repo.git('checkout', '-q', '-b', 'side')
  commitIn(repo, repo.dir, 'src/t1/side.js', 'side\n', 'side work')
  const side = repo.git('rev-parse', 'HEAD')
  repo.git('checkout', '-q', '-')
  assert.equal(repo.git('rev-parse', 'HEAD'), integration)
  const outside = adopt(repo, args, 'task-1', '--commit', side, '--reason', 'x')
  assert.equal(outside.status, 1)
  assert.match(outside.json.error, /is not in the integration branch/)
  const unknown = adopt(repo, args, 'task-1', '--commit', 'deadbeef', '--reason', 'x')
  assert.equal(unknown.status, 1)
  assert.match(unknown.json.error, /is not a commit/)
  const task9 = adopt(repo, args, 'task-9', '--commit', integration, '--reason', 'x')
  assert.equal(task9.status, 1)
  assert.match(task9.json.error, /task-9 is not in run/)
  assert.equal(fs.existsSync(path.join(args.runDir, 'adopted.json')), false)
})

test('adopt needs a commit and a reason that is not blank', (t) => {
  const { repo, args } = run(t)
  const sha = repo.git('rev-parse', 'HEAD')
  assert.match(adopt(repo, args, 'task-1', '--reason', 'x').json.error, /--commit/)
  assert.match(adopt(repo, args, 'task-1', '--commit', sha).json.error, /--reason/)
  assert.match(adopt(repo, args, 'task-1', '--commit', sha, '--reason', '   ').json.error, /--reason/)
})

test('adopt refuses a unit whose merge is still unverified (issue #2)', (t) => {
  const { repo, args } = run(t)
  commitIn(repo, repo.dir, 'src/t1/a.js', 'one\n', 'task 1 by hand')
  const sha = repo.git('rev-parse', 'HEAD')
  const dir = path.join(args.runDir, 'unverified')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'task-1.json'), `${JSON.stringify({ commit: sha })}\n`)
  const r = adopt(repo, args, 'task-1', '--commit', sha, '--reason', 'applied its patch while the tests had not passed')
  assert.equal(r.status, 1)
  assert.match(r.json.error, /unverified/)
  assert.match(r.json.error, /tests did not pass/)
  assert.equal(fs.existsSync(path.join(args.runDir, 'adopted.json')), false)
  assert.equal(fs.existsSync(path.join(dir, 'task-1.json')), true)
})
