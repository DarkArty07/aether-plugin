'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo } = require('./helpers.js')
const common = require('../plugins/aether/lib/common.js')

test('common exports exactly the twenty-one helpers', () => {
  assert.deepEqual(Object.keys(common).sort(), ['exists', 'isExecutableFile', 'isNumber', 'isObject', 'isText', 'killGroup', 'messageOf', 'nulEntries', 'numberOrZero', 'parseJson', 'pidAlive', 'readJson', 'readJsonOrNull', 'readTextOrEmpty', 'removeWorktree', 'runShell', 'sleep', 'sleepSync', 'withLock', 'writeAtomic', 'writeFileAtomic'])
})

test('the predicates', () => {
  assert.equal(common.isObject({}), true)
  for (const value of [null, [], 'x', 3, undefined]) assert.equal(common.isObject(value), false)
  assert.equal(common.isNumber(1.5), true)
  for (const value of [NaN, Infinity, '1', null]) assert.equal(common.isNumber(value), false)
  assert.equal(common.numberOrZero(4), 4)
  for (const value of ['4', NaN, undefined, null]) assert.equal(common.numberOrZero(value), 0)
  assert.equal(common.isText(' a '), true)
  for (const value of ['', '  ', 3, null]) assert.equal(common.isText(value), false)
  assert.equal(common.messageOf(new Error('boom')), 'boom')
  assert.equal(common.messageOf('plain'), 'plain')
})

test('reading: readJson throws, the others fall back', (t) => {
  const dir = tempDir(t)
  const good = path.join(dir, 'a.json')
  fs.writeFileSync(good, '{"a":1}')
  assert.deepEqual(common.readJson(good), { a: 1 })
  assert.throws(() => common.readJson(path.join(dir, 'missing.json')))
  assert.deepEqual(common.readJsonOrNull(good), { a: 1 })
  assert.equal(common.readJsonOrNull(path.join(dir, 'missing.json')), null)
  assert.equal(common.readTextOrEmpty(path.join(dir, 'missing.json')), '')
  assert.equal(common.readTextOrEmpty(good), '{"a":1}')
  assert.deepEqual(common.parseJson('[1]'), [1])
  assert.equal(common.parseJson('not json'), undefined)
})

test('writing is atomic and leaves no temporary file', (t) => {
  const dir = tempDir(t)
  const one = path.join(dir, 'deep', 'one.txt')
  common.writeAtomic(one, 'a')
  common.writeAtomic(one, 'b')
  assert.equal(fs.readFileSync(one, 'utf8'), 'b')
  const two = path.join(dir, 'deeper', 'two.txt')
  common.writeFileAtomic(two, 'c')
  assert.equal(fs.readFileSync(two, 'utf8'), 'c')
  for (const folder of ['deep', 'deeper']) assert.deepEqual(fs.readdirSync(path.join(dir, folder)).filter((name) => name.endsWith('.tmp')), [])
})

test('files and processes', (t) => {
  const dir = tempDir(t)
  const script = path.join(dir, 'run.sh')
  fs.writeFileSync(script, '#!/bin/sh\n')
  assert.equal(common.exists(script), true)
  assert.equal(common.exists(path.join(dir, 'nope')), false)
  assert.equal(common.isExecutableFile(script), false)
  fs.chmodSync(script, 0o755)
  assert.equal(common.isExecutableFile(script), true)
  assert.equal(common.isExecutableFile(dir), false)
  assert.equal(common.pidAlive(process.pid), true)
  assert.equal(common.pidAlive(2 ** 22 + 12345), false)
  assert.doesNotThrow(() => common.killGroup(2 ** 22 + 12345))
  assert.deepEqual(common.nulEntries('a\0b\0\0c\0'), ['a', 'b', 'c'])
  const started = Date.now()
  common.sleepSync(30)
  assert.ok(Date.now() - started >= 25)
})

test('sleep resolves later', async () => {
  const started = Date.now()
  await common.sleep(30)
  assert.ok(Date.now() - started >= 25)
})

test('runShell returns spawnSync-shaped output and the exit status (R9)', (t) => {
  const dir = tempDir(t)
  const ok = common.runShell('echo out; echo err 1>&2', { cwd: dir, timeoutMs: 5000 })
  assert.deepEqual([ok.status, ok.stdout, ok.stderr, ok.error], [0, 'out\n', 'err\n', undefined])
  const bad = common.runShell('exit 3', { cwd: dir, timeoutMs: 5000 })
  assert.equal(bad.status, 3)
})

test('runShell reports an output over maxBuffer as ENOBUFS with status null, and keeps the tail (R9)', (t) => {
  const dir = tempDir(t)
  const over = common.runShell(`node -e "process.stdout.write('A'.repeat(3000) + 'END')"`, { cwd: dir, timeoutMs: 5000, maxBuffer: 100 })
  assert.equal(over.status, null)
  assert.equal(over.error.code, 'ENOBUFS')
  assert.equal(over.stdout.length, 100)
  assert.ok(over.stdout.endsWith('END'))
  const fits = common.runShell('echo hi', { cwd: dir, timeoutMs: 5000, maxBuffer: 100 })
  assert.deepEqual([fits.status, fits.error, fits.stdout], [0, undefined, 'hi\n'])
})

test('runShell kills the whole process group when the timeout ends, and does not wait for a grandchild that holds the output (R9)', (t) => {
  const dir = tempDir(t)
  const pidFile = path.join(dir, 'child.pid')
  const started = Date.now()
  const r = common.runShell(`sleep 60 & echo $! > '${pidFile}'; wait`, { cwd: dir, timeoutMs: 400 })
  assert.ok(Date.now() - started < 10000, 'the call returns soon after the timeout')
  assert.equal(r.status, null)
  assert.equal(r.error.code, 'ETIMEDOUT')
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      common.sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false, 'the background child is dead')
})

test('runShell kills a shell that ignores SIGTERM and its background child on timeout (R9)', (t) => {
  const dir = tempDir(t)
  const pidFile = path.join(dir, 'term-child.pid')
  const started = Date.now()
  const r = common.runShell(`trap '' TERM; sleep 60 & echo $! > '${pidFile}'; wait`, { cwd: dir, timeoutMs: 400 })
  assert.ok(Date.now() - started < 10000, 'the call returns soon after the timeout')
  assert.equal(r.status, null)
  assert.equal(r.error.code, 'ETIMEDOUT')
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  let alive = true
  for (let i = 0; i < 100 && alive; i++) {
    try {
      process.kill(pid, 0)
      common.sleepSync(20)
    } catch {
      alive = false
    }
  }
  assert.equal(alive, false, 'the background child is dead')
})

test('withLock holds <target>.lock while fn runs and removes it after (R10)', (t) => {
  const target = path.join(tempDir(t), 'x.json')
  const seen = common.withLock(target, () => fs.existsSync(`${target}.lock`) && 'held')
  assert.equal(seen, 'held')
  assert.equal(fs.existsSync(`${target}.lock`), false)
  assert.throws(() => common.withLock(target, () => { throw new Error('boom') }), /boom/)
  assert.equal(fs.existsSync(`${target}.lock`), false, 'the lock goes even when fn throws')
})

test('withLock breaks a stale lock and runs without the lock when it cannot get it (R10)', (t) => {
  const target = path.join(tempDir(t), 'x.json')
  fs.writeFileSync(`${target}.lock`, '')
  const old = new Date(Date.now() - 60 * 1000)
  fs.utimesSync(`${target}.lock`, old, old)
  assert.equal(common.withLock(target, () => 'ran'), 'ran')
  assert.equal(fs.existsSync(`${target}.lock`), false, 'the stale lock was broken and then released')
  fs.writeFileSync(`${target}.lock`, '')
  assert.equal(common.withLock(target, () => 'ran', { waitMs: 50 }), 'ran')
  assert.equal(fs.existsSync(`${target}.lock`), true, 'a lock that is not ours is left alone')
})

test('withLock serialises four processes that read, add one and write a counter (R10)', async (t) => {
  const dir = tempDir(t)
  const counter = path.join(dir, 'counter')
  fs.writeFileSync(counter, '0')
  const script = `
    const common = require(${JSON.stringify(path.join(__dirname, '..', 'plugins', 'aether', 'lib', 'common.js'))})
    for (let i = 0; i < 50; i++) common.withLock(process.argv[1], () => {
      const n = Number(require('node:fs').readFileSync(process.argv[1], 'utf8'))
      common.sleepSync(1)
      require('node:fs').writeFileSync(process.argv[1], String(n + 1))
    }, { waitMs: 60000 })`
  await Promise.all([0, 1, 2, 3].map(() => new Promise((resolve, reject) => {
    const child = require('node:child_process').spawn(process.execPath, ['-e', script, counter], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })))
  assert.equal(fs.readFileSync(counter, 'utf8'), '200')
})

test('removeWorktree removes a worktree and its folder', (t) => {
  const repo = makeRepo(t)
  const worktree = path.join(tempDir(t), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'unit/x', worktree)
  assert.equal(fs.existsSync(worktree), true)
  common.removeWorktree(repo.dir, worktree)
  assert.equal(fs.existsSync(worktree), false)
  assert.equal(repo.git('worktree', 'list').split('\n').length, 1)
})
