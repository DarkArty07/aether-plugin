'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  defaultExec,
  extractJsonObject,
  missingField,
  parseJson,
  parseRun,
  quotaLine,
  stringsIn,
  usageOf,
} = require('../plugins/aether/lib/harness/structured.js')

test('extractJsonObject reads the object in prose and the one in a fenced json block', () => {
  assert.deepEqual(extractJsonObject('Here is the result: {"verdict":"approve"} as asked.'), { verdict: 'approve' })
  assert.deepEqual(extractJsonObject('Done.\n```json\n{\n  "verdict": "approve",\n  "summary": "ok"\n}\n```\nSee above.'), {
    verdict: 'approve',
    summary: 'ok',
  })
})

test('extractJsonObject keeps nested objects whole, and reads braces and quotes inside strings', () => {
  assert.deepEqual(extractJsonObject('x {"a":{"b":{"c":1}},"d":[{"e":2}]} y'), { a: { b: { c: 1 } }, d: [{ e: 2 }] })
  assert.deepEqual(extractJsonObject('{"text":"a } b { \\"c\\" \\\\ }","n":1}'), { text: 'a } b { "c" \\ }', n: 1 })
  assert.deepEqual(extractJsonObject('{"text":"closing \\"}"}'), { text: 'closing "}' })
})

test('extractJsonObject gives the last of several objects, and only top-level ones count', () => {
  assert.deepEqual(extractJsonObject('first {"verdict":"reject"} then {"verdict":"approve"}'), { verdict: 'approve' })
  assert.deepEqual(extractJsonObject('{"a":1} and {"b":{"c":2}}'), { b: { c: 2 } })
  // A balanced run that is not valid JSON is skipped whole, so an object inside it does not count.
  assert.equal(extractJsonObject('{"a":{"b":1}, bad}'), null)
})

test('extractJsonObject reads the object after a brace in prose that never closes', () => {
  assert.deepEqual(extractJsonObject('use { for blocks, then {"verdict":"approve"}'), { verdict: 'approve' })
})

test('extractJsonObject gives null for an answer cut off inside a JSON object, so an object inside it does not count', () => {
  assert.equal(extractJsonObject('{"verdict":"approve","details":{"x":1}'), null)
  assert.equal(extractJsonObject('Answer: {"verdict":"approve"'), null)
})

test('extractJsonObject gives null for text with no JSON object', () => {
  assert.equal(extractJsonObject('no braces here'), null)
  assert.equal(extractJsonObject('{ not json }'), null)
  assert.equal(extractJsonObject('[1, 2, 3]'), null)
  assert.equal(extractJsonObject(''), null)
  assert.equal(extractJsonObject(undefined), null)
})

test('missingField names the first required field the object lacks, or null', () => {
  assert.equal(missingField({ verdict: 'approve', summary: 'ok' }, ['verdict', 'summary']), null)
  assert.equal(missingField({ verdict: 'approve' }, ['verdict', 'summary', 'files']), 'summary')
  // A field present with a null value is present, as agy's check counts it.
  assert.equal(missingField({ verdict: null }, ['verdict']), null)
  assert.equal(missingField(null, ['verdict']), 'verdict')
  assert.equal(missingField({}, []), null)
})

test('quotaLine gives the first line that reads as a quota or rate-limit error, trimmed', () => {
  assert.equal(quotaLine('starting\n  Rate limit reached for gpt  \nRate limit again'), 'Rate limit reached for gpt')
  assert.equal(quotaLine('error: rate-limited'), 'error: rate-limited')
  assert.equal(quotaLine('You have hit your usage limit'), 'You have hit your usage limit')
  assert.equal(quotaLine('HTTP 429 from upstream'), 'HTTP 429 from upstream')
  assert.equal(quotaLine('Too Many Requests'), 'Too Many Requests')
  assert.equal(quotaLine('Monthly quota exceeded'), 'Monthly quota exceeded')
  assert.equal(quotaLine('1429 files changed\nall 12 tests pass'), null)
  assert.equal(quotaLine(''), null)
  assert.equal(quotaLine(undefined), null)
})

test("usageOf gives agy's shape, zero where unknown, and a total of input plus output when none is given", () => {
  assert.deepEqual(usageOf({ input: 1000, output: 200, cacheRead: 800 }), { input: 1000, output: 200, thinking: 0, cacheRead: 800, total: 1200 })
  assert.deepEqual(usageOf({ input: 10, output: 5, total: 99 }), { input: 10, output: 5, thinking: 0, cacheRead: 0, total: 99 })
  assert.deepEqual(usageOf({ input: '10', output: null }), { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 })
  assert.deepEqual(usageOf(), { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 })
})

// What an adapter's read of a run gives: the answer, the usage and the stdout outside the answer.
const ZERO = { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0 }
const reads = (answer, outside = '') => () => ({ answer, usage: ZERO, outside })
const NO_ANSWER = reads('')

test('parseRun calls a clean answer clean, whatever its text and stderr say about limits', () => {
  const answer = '{"verdict":"approve"} The rate limit of the API is documented.'
  assert.deepEqual(parseRun({ stdout: 'x', stderr: 'Rate limit reached\n', exitCode: 0 }, reads(answer, 'usage limit'), ['verdict']), {
    clean: true,
    reason: null,
    structured: { verdict: 'approve' },
    usage: ZERO,
    conversation: null,
  })
})

test('parseRun reads a run that did not exit 0 by its quota lines first, then its exit, then its answer', () => {
  const reason = (raw, read = NO_ANSWER) => parseRun(raw, read).reason
  assert.equal(reason({ stdout: '', stderr: 'Rate limit reached\n', exitCode: 1 }), 'quota: Rate limit reached')
  assert.equal(reason({ stdout: '', stderr: 'Rate limit reached\n', exitCode: 0 }), 'quota: Rate limit reached')
  assert.equal(reason({ stdout: '', stderr: '', exitCode: 1 }, reads('', 'usage limit reached')), 'quota: usage limit reached')
  assert.equal(reason({ stdout: '', stderr: '', exitCode: 0 }, reads('', 'usage limit reached')), 'no result')
  assert.equal(reason({ stdout: '', stderr: 'error: sandbox denied\n', exitCode: 1 }, reads('', 'no limit here')), 'exit 1: error: sandbox denied')
  assert.equal(reason({ stdout: '', stderr: '', exitCode: 0 }), 'no result')
  assert.equal(reason({ stdout: '', stderr: '', exitCode: 0 }, reads('no json here')), 'no structured output')
})

test('parseRun reads a missing required field as missing, even when the answer talks about limits', () => {
  assert.equal(parseRun({ stdout: '', stderr: '', exitCode: 0 }, reads('{"verdict":"approve"} rate limit'), ['files']).reason, 'missing files')
})

test('parseRun gives a run whose exit is not known the reason exit unknown, and never calls it clean', () => {
  assert.equal(parseRun({ stdout: '', stderr: '' }, reads('{"verdict":"approve"}'), ['verdict']).reason, 'exit unknown')
  assert.equal(parseRun({ stdout: '', stderr: 'boom\n', exitCode: null }, NO_ANSWER).reason, 'exit unknown: boom')
  assert.equal(parseRun(undefined, NO_ANSWER).reason, 'exit unknown')
})

test('parseRun quotes at most 200 characters of a quota line', () => {
  const line = `rate limit ${'x'.repeat(300)}`
  assert.equal(parseRun({ stdout: '', stderr: line, exitCode: 1 }, NO_ANSWER).reason, `quota: ${line.slice(0, 200)}`)
})

test('stringsIn gives every string of a JSON value at any depth, and parseJson undefined for text that is not JSON', () => {
  assert.deepEqual(stringsIn({ a: 'x', b: ['y', { c: 'z' }], n: 1, t: null }), ['x', 'y', 'z'])
  assert.deepEqual(stringsIn('s'), ['s'])
  assert.deepEqual(stringsIn(5), [])
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 })
  assert.equal(parseJson('nope'), undefined)
})

test('defaultExec runs argv without a shell, and throws when the command cannot start', () => {
  const script = 'process.stdout.write(process.argv[1]); process.stderr.write("warn")'
  assert.deepEqual(defaultExec([process.execPath, '-e', script, '$HOME; echo no'], { timeoutMs: 20000 }), {
    status: 0,
    stdout: '$HOME; echo no',
    stderr: 'warn',
  })
  assert.throws(() => defaultExec(['/nonexistent/aether-test-cli'], { timeoutMs: 20000 }))
})

test('parseRun with quotaByText false gives a quota word no quota reason, and the default keeps it', () => {
  const extract = (stdout) => ({ answer: '', usage: {}, outside: stdout })
  const raw = { stdout: 'usage limit reached\n', stderr: 'Rate limit reached\n', exitCode: 1 }
  assert.equal(parseRun(raw, extract, []).reason, 'quota: Rate limit reached')
  assert.equal(parseRun(raw, extract, [], { quotaByText: false }).reason, 'exit 1: Rate limit reached')
  assert.equal(parseRun({ ...raw, stderr: '' }, extract, [], { quotaByText: false }).reason, 'exit 1')
})
