'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { failureSignatures, judge } = require('../plugins/aether/lib/baseline.js')
const { WT_BIN, makeRepo, compile, commitIn, runBin } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { gateCommand } = require('../plugins/aether/lib/wt-gate.js')

test('failureSignatures replaces the worktree path with <worktree> before normalizing (issue #248)', () => {
  const integrationPath = '/home/user/repo/.aether/integration'
  const output = [
    `FAILED Command '['godot', '--headless', '--path', '${integrationPath}', '--script', 'tests/sessions_v0_9.gd']' timed out after 45 seconds`,
    `not ok 1 - ${integrationPath}/tests/unit.test.js # time=10ms`,
  ].join('\n')

  const sigs = failureSignatures(output, integrationPath)
  assert.deepEqual(sigs, [
    "<worktree>/tests/unit.test.js",
    "Command '['godot', '--headless', '--path', '<worktree>', '--script', 'tests/sessions_v0_9.gd']' timed out after 45 seconds",
  ])
})

test('judge passes when baseline has integration worktree path and unit output has unit worktree path (issue #248)', () => {
  const integrationRoot = '/home/user/repo/.aether/integration'
  const unitRoot = '/home/user/repo/.aether/worktrees/20261112-002013-2902/task-1'

  const baselineOutput = `FAILED Command '['godot', '--path', '${integrationRoot}']' timed out after 45 seconds`
  const baseline = {
    signatures: failureSignatures(baselineOutput, integrationRoot),
  }

  const unitOutput = `FAILED Command '['godot', '--path', '${unitRoot}']' timed out after 45 seconds`
  const verdict = judge(baseline, { exitCode: 1, output: unitOutput }, unitRoot)

  assert.equal(verdict.pass, true)
  assert.deepEqual(verdict.known, [
    "Command '['godot', '--path', '<worktree>']' timed out after 45 seconds",
  ])
})

test('judge blocks a genuinely different failure even when paths are normalized (issue #248)', () => {
  const integrationRoot = '/home/user/repo/.aether/integration'
  const unitRoot = '/home/user/repo/.aether/worktrees/20261112-002013-2902/task-1'

  const baselineOutput = `FAILED Command '['godot', '--path', '${integrationRoot}']' timed out after 45 seconds`
  const baseline = {
    signatures: failureSignatures(baselineOutput, integrationRoot),
  }

  const unitOutput = [
    `FAILED Command '['godot', '--path', '${unitRoot}']' timed out after 45 seconds`,
    'FAILED tests/other.py::test_different - AssertionError: expected true',
  ].join('\n')

  const verdict = judge(baseline, { exitCode: 1, output: unitOutput }, unitRoot)

  assert.equal(verdict.pass, false)
  assert.equal(verdict.reason, 'new failures')
  assert.deepEqual(verdict.new, ['tests/other.py::test_different'])
})

test('wt-gate passes when a known failure carries the worktree path and fails on a new one (issue #248)', (t) => {
  const repo = makeRepo(t)
  const check = [
    "const fs = require('fs')",
    "console.log('not ok 1 - ' + process.cwd() + '/tests/old.test.js')",
    "if (fs.existsSync('src/t1/bad.js')) { console.log('not ok 2 - tests/new.test.js'); }",
    'process.exit(1)',
  ].join('\n')
  commitIn(repo, repo.dir, 'check.js', check, 'add check.js')

  const args = compile(repo, plan([task(1), task(2)], { execution: ['- Test command: `node check.js`'] }))
  const created = runBin(WT_BIN, ['ensure', args.runId, 'task-1'], repo.dir).json
  const unitWt = created.path

  // Unit changes only what it owns, without introducing new failures
  commitIn(repo, unitWt, 'src/t1/a.js', 'one\n', 'add a')
  const gPass = gateCommand(repo.dir, args.runId, 'task-1')
  assert.equal(gPass.pass, true)
  assert.deepEqual(gPass.findings, [])
  assert.deepEqual(gPass.knownFailures, ['<worktree>/tests/old.test.js'])

  // Unit introduces a new failure
  commitIn(repo, unitWt, 'src/t1/bad.js', 'boom\n', 'break')
  const gFail = gateCommand(repo.dir, args.runId, 'task-1')
  assert.equal(gFail.pass, false)
  assert.deepEqual(gFail.findings, [{ file: 'tests/new.test.js', what: 'la prueba falló' }])
})
