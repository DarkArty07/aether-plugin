'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn, tempDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { ensure, diffPackage, sweepStale } = require('../plugins/aether/lib/worktrees.js')
const work = require('../plugins/aether/lib/lane-work.js')

test('the copy of a read-only lane lives under .aether/worktrees/lanes/<run>/<call> (R15)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const copy = work.prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' })
  assert.equal(copy.workdir, path.join(repo.dir, '.aether', 'worktrees', 'lanes', args.runId, 'task-1-1-supervise'))
  assert.equal(copy.workdir, work.readerDir(repo.dir, args.runId, 'task-1-1-supervise'))
  assert.equal(work.removeReader(repo.dir, args.runId, 'task-1-1-supervise'), true)
  assert.equal(fs.existsSync(copy.workdir), false)
})

test('sweepStale finds a lane copy left in the old .aether/lanes folder and one in the new place, and removes both (R15, R19)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const call = work.prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' })
  const old = path.join(repo.dir, '.aether', 'lanes', args.runId, 'task-1-9-leftover')
  fs.mkdirSync(old, { recursive: true })
  fs.writeFileSync(path.join(old, 'junk.txt'), 'x')
  const aged = new Date(Date.now() - 48 * 3600 * 1000)
  for (const dir of [args.runDir, path.join(repo.dir, '.aether', 'worktrees', args.runId), path.join(repo.dir, '.aether', 'lanes', args.runId), old, call.workdir]) {
    for (const entry of fs.readdirSync(dir, { recursive: true })) try { fs.utimesSync(path.join(dir, entry), aged, aged) } catch { /* a link that is gone */ }
    fs.utimesSync(dir, aged, aged)
  }
  sweepStale(repo.dir, { dataDir: tempDir(t, 'aether-stamp-'), now: Date.now() })
  assert.equal(fs.existsSync(old), false)
  assert.equal(fs.existsSync(call.workdir), false)
})
