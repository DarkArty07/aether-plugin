'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { failureSignatures, judge } = require('../plugins/aether/lib/baseline.js')

test('TAP and node:test failures are named, with the number dropped and file or suite lines included', () => {
  const output = [
    'TAP version 13',
    'ok 1 - passes',
    'not ok 2 - adds 1 + 2',
    '  ---',
    '  error: boom',
    '  ...',
    '# Subtest: suite',
    '    not ok 3 - inner case # time=1.2ms',
    'not ok 4 - tests/a.test.js',
  ].join('\n')
  assert.deepEqual(failureSignatures(output), ['adds 1 + 2', 'inner case', 'tests/a.test.js'])
})

test('the same failure with another number, duration, timing or spacing is one signature', () => {
  assert.deepEqual(failureSignatures('not ok 12 - adds  1 + 2 # time=5.2ms\nnot ok 3 - adds 1 + 2  \n'), ['adds 1 + 2'])
})

test('Jest and Vitest failures are named, without their durations', () => {
  const output = [
    ' PASS  src/a.test.js',
    ' FAIL  src/b.test.js',
    '  ✓ adds (2 ms)',
    '  ✕ subtracts 2 - 1 (5 ms)',
    '  × multiplies (12ms)',
    '  ✗ divides [3ms]',
  ].join('\n')
  assert.deepEqual(failureSignatures(output), ['divides', 'multiplies', 'subtracts 2 - 1'])
})

test('pytest failures are named by their node id', () => {
  const output = [
    '=========== short test summary info ===========',
    'FAILED tests/test_a.py::test_one - AssertionError: assert 1 == 2',
    'FAILED tests/test_b.py::test_two[1-2]',
    '1 failed, 3 passed in 0.12s',
  ].join('\n')
  assert.deepEqual(failureSignatures(output), ['tests/test_a.py::test_one', 'tests/test_b.py::test_two[1-2]'])
})

test('Go failures are named by their test, subtests included', () => {
  const output = [
    '=== RUN   TestAdd',
    '--- FAIL: TestAdd (0.01s)',
    '    --- FAIL: TestAdd/negative (0.00s)',
    '--- PASS: TestSub (0.00s)',
    'FAIL',
  ].join('\n')
  assert.deepEqual(failureSignatures(output), ['TestAdd', 'TestAdd/negative'])
})

test('output with no failing test gives no signatures, with CRLF line ends too', () => {
  assert.deepEqual(failureSignatures('ok 1 - a\n1..1\n# pass 1\n'), [])
  assert.deepEqual(failureSignatures(''), [])
  assert.deepEqual(failureSignatures(undefined), [])
  assert.deepEqual(failureSignatures('not ok 2 - b\r\nnot ok 1 - a\r\n'), ['a', 'b'])
})

test('judge passes a command that exits 0, with or without a baseline', () => {
  assert.deepEqual(judge(null, { exitCode: 0, output: '' }), { pass: true })
  assert.deepEqual(judge({ signatures: ['a'] }, { exitCode: 0, output: 'not ok 1 - a' }), { pass: true })
})

test('judge blocks a failing run when there is no baseline', () => {
  assert.deepEqual(judge(null, { exitCode: 1, output: 'not ok 1 - a' }), { pass: false, reason: 'no baseline' })
})

test('judge blocks a failing run whose output names no test', () => {
  assert.deepEqual(judge({ signatures: [] }, { exitCode: 1, output: 'boom' }), { pass: false, reason: 'unparsed' })
})

test('judge passes a failing run whose every failure is in the baseline, and names them', () => {
  const baseline = { signatures: ['a', 'b'] }
  assert.deepEqual(judge(baseline, { exitCode: 1, output: 'not ok 1 - b\nnot ok 2 - a' }), { pass: true, known: ['a', 'b'] })
  assert.deepEqual(judge({ signatures: ['adds 1 + 2'] }, { exitCode: 1, output: 'not ok 9 - adds 1 + 2 # time=3ms' }), {
    pass: true,
    known: ['adds 1 + 2'],
  })
})

test('judge blocks a failing run with a failure the baseline does not list, and names only the new ones', () => {
  const baseline = { signatures: ['a'] }
  assert.deepEqual(judge(baseline, { exitCode: 1, output: 'not ok 1 - a\nnot ok 2 - c\nnot ok 3 - d' }), {
    pass: false,
    reason: 'new failures',
    new: ['c', 'd'],
  })
})

test('judge treats a baseline with no signatures as one with no known failures', () => {
  assert.deepEqual(judge({ signatures: [] }, { exitCode: 1, output: 'not ok 1 - a' }), {
    pass: false,
    reason: 'new failures',
    new: ['a'],
  })
})
