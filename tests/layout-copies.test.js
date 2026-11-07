'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, commitIn } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const run = require('../plugins/aether/lib/run.js')
const { ensure, diffPackage } = require('../plugins/aether/lib/worktrees.js')
const work = require('../plugins/aether/lib/lane-work.js')

test('run.js names the places of the new layout and keeps the old exclusions (R15)', () => {
  assert.equal(run.tmpDir('/r'), path.join('/r', '.aether', 'tmp'))
  assert.equal(run.laneCopiesDir('/r'), path.join('/r', '.aether', 'worktrees', 'lanes'))
  assert.equal(run.examCopiesDir('/r'), path.join('/r', '.aether', 'worktrees', 'exams'))
  assert.equal(run.workDir('/r', 'seats', 'judge-1'), path.join('/r', '.aether', 'work', 'seats', 'judge-1'))
  assert.equal(run.workDir('/r', 'delegates', 'd1'), path.join('/r', '.aether', 'work', 'delegates', 'd1'))
  assert.deepEqual(run.EXCLUDES, ['/.aether/', '/.aether-tmp/', '/.aether-exam/'])
})

test('a unit worktree keeps its temporary files in .aether/tmp and git does not see them (R15)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  assert.ok(fs.statSync(path.join(unit, '.aether', 'tmp')).isDirectory())
  assert.equal(fs.existsSync(path.join(unit, '.aether-tmp')), false)
  fs.writeFileSync(path.join(unit, '.aether', 'tmp', 'brief.md'), 'x')
  assert.equal(repo.git('-C', unit, 'status', '--porcelain'), '')
})

test('the brief of an implementer on another harness and the files of a reader copy live in .aether/tmp (R15)', (t) => {
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1)]))
  const { workdir, brief } = work.prepareImplementer(repo.dir, args.runId, 'task-1')
  assert.equal(brief, path.join(workdir, '.aether', 'tmp', 'brief.md'))
  const unit = ensure(repo.dir, args.runId, 'task-1').path
  commitIn(repo, unit, 'src/t1/a.js', 'one\n', 'add a')
  diffPackage(repo.dir, args.runId, 'task-1')
  const copy = work.prepareReader(repo.dir, args.runId, 'task-1-1-supervise', { taskId: 'task-1' })
  assert.deepEqual(fs.readdirSync(path.join(copy.workdir, '.aether', 'tmp')).sort(), ['brief.md', 'package.diff'])
  assert.equal(work.removeReader(repo.dir, args.runId, 'task-1-1-supervise'), true)
})

test('the run workflow and the implementer prompt name .aether/tmp/ and no longer .aether-tmp/ (R15)', () => {
  const plugin = path.join(__dirname, '..', 'plugins', 'aether')
  const flow = fs.readFileSync(path.join(plugin, 'workflows', 'run.workflow.js'), 'utf8')
  const prompt = fs.readFileSync(path.join(plugin, 'agents', 'implementer.md'), 'utf8')
  assert.ok(flow.includes('.aether/tmp/brief.md') && flow.includes('.aether/tmp/package.diff'))
  assert.ok(prompt.includes('.aether/tmp/'))
  assert.ok(!flow.includes('.aether-tmp') && !prompt.includes('.aether-tmp'))
})
