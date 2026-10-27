'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { tempDir } = require('./helpers.js')
const { createMuse } = require('../plugins/aether/lib/harness/muse.js')

const FAKE = path.join(__dirname, 'fixtures', 'fake-muse.js')
const GROUPS = { muse: 'Muse subscription' }
const SCHEMA = '/r/schema.json'
const NOW = Date.UTC(2026, 9, 19, 18, 0, 0)
const HOUR = 3600000
const REQUIRED = ['verdict', 'summary']
const ANSWER = '{"verdict":"approve","summary":"done"}'
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`)

let n = 0
const rec = (type, payload, stream = 'session') =>
  JSON.stringify({ schema_version: 1, id: `id-${++n}`, stream: { kind: stream, id: 's1' }, sequence: n, recorded_at: n, record_type: 'event', durability: 'durable', causation_id: 'c1', payload_type: type, payload_schema_version: 1, payload })
const completed = (text) => rec('run.terminal.completed', { kind: 'run_terminal', terminal: 'completed', reason: null, text })
const failed = (reason, terminal = 'failed') => rec(`run.terminal.${terminal}`, { kind: 'run_terminal', terminal, reason, text: null })
const usage = (allowance = null, models = [{ model: 'muse-spark-1.3', calls: 1, input_tokens: 1000, output_tokens: 200, cached_tokens: 300, reasoning_tokens: 50 }]) =>
  rec('run.usage', { kind: 'run_usage', allowance, calls: 1, completed_calls: 1, failed_calls: 0, cancelled_calls: 0, children_included: false, models }, 'exec.usage')
const out = (...lines) => `${lines.join('\n')}\n`
const allowance = (used5, usedWeek) => ({ tier: 'power', window: { usedPercent: used5, resetsAtMs: NOW + 3 * HOUR, windowDurationMins: 300 }, weekly: { usedPercent: usedWeek, resetsAtMs: NOW + 5 * 24 * HOUR } })

function build(t, extra = {}) {
  const dataDir = tempDir(t, 'muse-data-')
  return { dataDir, muse: createMuse({ groups: GROUPS, dataDir, now: () => NOW, ...extra }) }
}
const run = (muse, stdout, exitCode = 0, stderr = '') => muse.parse({ stdout, stderr, exitCode }, { required: REQUIRED })
const observedFile = (dataDir) => path.join(dataDir, 'lanes', 'quota', 'muse-observed.json')

test('muse is the adapter named muse, takes the schema as a flag and reads no quota by itself', (t) => {
  const { muse } = build(t)
  assert.equal(muse.name, 'muse')
  assert.notEqual(muse.schemaInPrompt, true)
  assert.equal(muse.quotaCost, undefined)
  assert.equal(muse.modelArg({ model: 'muse-spark-1.3', level: 'high' }), 'muse-spark-1.3')
  assert.equal(muse.usageDelta({ input: 5 }, { input: 9 }).input, 9)
})

test('argv is one headless, sandboxed, privacy-safe exec turn, and nothing else', (t) => {
  const { muse } = build(t, { command: '/opt/muse' })
  assert.deepEqual(muse.argv({ model: 'muse-spark-1.3', level: 'high', schemaFile: SCHEMA, timeoutSeconds: 2700, prompt: 'P' }), [
    '/opt/muse', 'exec', '--json', '--provider', 'meta', '--model', 'muse-spark-1.3', '--reasoning-effort', 'high', '--output-schema', SCHEMA,
    '--contributor-mode', 'off', '--no-foreign-personal-context', '--disable-approval', '--disable-reminders', '--disable-request-user-input',
    '--max-model-steps', '200', 'P',
  ])
  const bare = createMuse({ groups: GROUPS }).argv({ model: 'muse-wonder-1.0', prompt: 'P' })
  assert.equal(bare[0], 'muse')
  assert.equal(bare.includes('--reasoning-effort'), false)
  assert.equal(bare.includes('--output-schema'), false)
  assert.equal(bare.at(-1), 'P')
})

test('argv never turns the sandbox, the approval of the workspace or the contributor mode the wrong way, and never logs in', (t) => {
  const { muse } = build(t)
  const argv = muse.argv({ model: 'muse-wonder-1.0', level: 'low', schemaFile: SCHEMA, prompt: 'P' })
  for (const flag of ['--yolo', '--disable-sandbox', '--trust-workspace', '--api-key-stdin', '--prompt-file', '--workspace', '--base-url', '--disable-write', '--disable-shell']) {
    assert.equal(argv.includes(flag), false, flag)
  }
  assert.equal(argv[argv.indexOf('--contributor-mode') + 1], 'off')
  assert.equal(argv.filter((item) => /^(login|logout|auth)$/.test(item)).length, 0)
})

test('a contributor model or an empty model has no command line', (t) => {
  const { muse } = build(t)
  assert.throws(() => muse.argv({ model: 'muse-spark-1.3-contributor', prompt: 'P' }), /contributor/)
  assert.throws(() => muse.argv({ model: '', prompt: 'P' }), /model/)
})

test('installed and version come from the command, and a version that cannot be read is null', (t) => {
  fs.chmodSync(FAKE, 0o755)
  assert.equal(createMuse({ command: FAKE }).installed(), true)
  assert.equal(createMuse({ command: path.join(tempDir(t), 'muse') }).installed(), false)
  const answer = (value) => () => value
  assert.equal(createMuse({ exec: answer({ status: 0, stdout: 'Muse Code 1.4.11 (1.4.11-R6667.1)\n', stderr: '' }) }).version(), '1.4.11')
  assert.equal(createMuse({ exec: answer({ status: 1, stdout: '', stderr: 'x' }) }).version(), null)
  assert.equal(createMuse({ exec: answer({ status: 0, stdout: 'no number here', stderr: '' }) }).version(), null)
  assert.equal(createMuse({ exec: () => { throw new Error('ENOENT') } }).version(), null)
})

test('the fake muse answers --version', () => {
  fs.chmodSync(FAKE, 0o755)
  const r = spawnSync(FAKE, ['--version'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), 'Muse Code 1.4.11 (1.4.11-R6667.1)')
})

test('a completed turn with the object and every required field is clean, with its usage', (t) => {
  const { muse } = build(t)
  const clean = run(muse, out(rec('run.output.delta', { text: 'x' }), completed(ANSWER), usage()))
  assert.deepEqual([clean.clean, clean.reason, clean.structured, clean.conversation], [true, null, { verdict: 'approve', summary: 'done' }, null])
  assert.deepEqual(clean.usage, {
    input: 1000, output: 200, thinking: 50, cacheRead: 300, total: 1200,
    models: [{ model: 'muse-spark-1.3', calls: 1, input: 1000, output: 200, thinking: 50, cacheRead: 300 }],
    allowance: null,
  })
  const prose = run(muse, out(completed(`Done.\n\`\`\`json\n${ANSWER}\n\`\`\``), usage()))
  assert.equal(prose.clean, true)
})

test('the usage of several models is summed, and a run with no usage record is zeros', (t) => {
  const { muse } = build(t)
  const models = [
    { model: 'a', calls: 1, input_tokens: 10, output_tokens: 1, cached_tokens: 2, reasoning_tokens: 3 },
    { model: 'b', calls: 2, input_tokens: 20, output_tokens: 4, cached_tokens: 0, reasoning_tokens: 0 },
  ]
  const summed = run(muse, out(completed(ANSWER), usage(null, models))).usage
  assert.deepEqual([summed.input, summed.output, summed.thinking, summed.cacheRead, summed.total, summed.models.length], [30, 5, 3, 2, 35, 2])
  assert.deepEqual(run(muse, out(completed(ANSWER))).usage, { input: 0, output: 0, thinking: 0, cacheRead: 0, total: 0, models: [], allowance: null })
})

const CASES = [
  ['authRequired', { kind: 'authRequired', message: 'sign in first', retryable: false }, 'muse authRequired: sign in first'],
  ['environmentError', { kind: 'environmentError', message: 'bwrap: no permissions', retryable: false }, 'muse environmentError: bwrap: no permissions'],
  ['stepLimit', { kind: 'stepLimit', message: 'reached 200 steps', retryable: false }, 'muse stepLimit: reached 200 steps'],
  ['a model the account does not give', { kind: 'modelError', message: 'muse-wonder-full-1.0 needs the Power plan', retryable: false }, 'muse modelError: muse-wonder-full-1.0 needs the Power plan'],
  ['a failure object written as a JSON string', JSON.stringify({ kind: 'authRequired', message: 'sign in first' }), 'muse authRequired: sign in first'],
  ['a failure that is a plain string', 'boom', 'muse failed: boom'],
]
for (const [name, reason, expected] of CASES) {
  test(`a failed turn is not clean and says its class: ${name}`, (t) => {
    const { muse } = build(t)
    const result = run(muse, out(failed(reason), usage()), 1, 'warning: x')
    assert.deepEqual([result.clean, result.reason, result.structured], [false, expected, null])
    assert.equal(result.reason.startsWith('quota: '), false, 'only the quota data of a failure makes a quota reason')
    assert.equal(result.usage.input, 1000, 'the usage is kept')
  })
}

test('a cancelled turn is not clean', (t) => {
  const { muse } = build(t)
  const result = run(muse, out(failed(null, 'cancelled')), 130)
  assert.deepEqual([result.clean, result.reason], [false, 'muse cancelled'])
})

test('a failure is a quota failure only by its quota data, never by the words of its message', (t) => {
  const { muse } = build(t)
  const resets = NOW + 4 * HOUR
  const quota = { kind: 'modelError', message: 'limit reached', retryable: false, quota: { limitKind: 'tierLimit', resetsAtMs: resets } }
  const expected = `quota: muse tierLimit, resets ${new Date(resets).toISOString()}`
  assert.equal(run(muse, out(failed(quota)), 1).reason, expected)
  assert.equal(run(muse, out(failed(JSON.stringify(quota))), 1).reason, expected)
  const words = run(muse, out(failed({ kind: 'modelError', message: 'your quota of file handles is low and the rate limit is 429', retryable: false })), 1)
  assert.equal(words.reason.startsWith('quota: '), false)
  assert.match(words.reason, /^muse modelError: /)
})

test('a run with no record or a bad exit says so', (t) => {
  const { muse } = build(t)
  assert.equal(run(muse, out(completed(ANSWER)), 1).reason, 'exit 1')
  assert.equal(run(muse, '', 2, 'error: bad flag\nmore').reason, 'exit 2: error: bad flag')
  // The stderr of real failures (measured): Muse's own notices come first, and the error after them.
  const notices = 'muse: workspace root: /tmp/work (cwd default)\nmuse: Agent delegation: auto unavailable: workspace is untrusted.\n'
  assert.equal(run(muse, '', 1, `${notices}missing meta credentials: run \`muse login\` or set META_API_KEY\n`).reason, 'exit 1: missing meta credentials: run `muse login` or set META_API_KEY')
  assert.equal(run(muse, '', 1, 'muse: local session messaging disabled: session logging is required\nfailed to fetch model catalog: authentication failed\n').reason, 'exit 1: failed to fetch model catalog: authentication failed')
  assert.equal(run(muse, '', 143, notices).reason, 'exit 143: muse: workspace root: /tmp/work (cwd default)', 'a run that only wrote notices keeps the first one')
  assert.equal(run(muse, '', null).reason, 'exit unknown')
  assert.equal(run(muse, 'hello, not records\n', 0).reason, 'unreadable output')
  assert.equal(run(muse, out(completed('   ')), 0).reason, 'no result')
  assert.equal(run(muse, out(completed('I am done.')), 0).reason, 'no structured output')
  assert.equal(run(muse, out(completed('{"verdict":"approve"}')), 0).reason, 'missing summary')
})

test('the real capture of the echo provider reads: a completed turn whose text is not an object', (t) => {
  const { muse } = build(t)
  const capture = fs.readFileSync(path.join(__dirname, 'fixtures', 'muse', 'exec-json-echo.jsonl'), 'utf8')
  const result = muse.parse({ stdout: capture, stderr: '', exitCode: 0 }, { required: [] })
  assert.deepEqual([result.clean, result.reason], [false, 'no structured output'])
  assert.deepEqual([result.usage.input, result.usage.total, result.usage.allowance], [0, 0, null])
})

// A real call (2026-10-19, muse 1.4.11, muse-wonder-full-1.0 at low, asked to write a file and answer with an object):
// exit 0 in 12 s, the object as the text of the terminal record, and the `allowance` Muse itself reported, in snake_case.
test('the real capture of a Muse call reads: a clean answer, its usage, and the quota Muse reported', (t) => {
  const real = Date.parse('2026-10-20T00:13:30Z')
  const { dataDir, muse } = build(t, { now: () => real })
  const capture = fs.readFileSync(path.join(__dirname, 'fixtures', 'muse', 'exec-json-real.jsonl'), 'utf8')
  const result = muse.parse({ stdout: capture, stderr: 'muse: workspace root: /tmp/work (cwd default)\nmuse: Agent delegation: auto unavailable: workspace is untrusted.\n', exitCode: 0 }, { required: ['status', 'file'] })
  assert.deepEqual([result.clean, result.reason, result.structured], [true, null, { file: 'hello.txt', status: 'done' }])
  assert.deepEqual([result.usage.input, result.usage.output, result.usage.thinking, result.usage.cacheRead, result.usage.total], [53722, 144, 57, 26740, 53866])
  assert.deepEqual(result.usage.models.map((m) => [m.model, m.calls]), [['muse-wonder-full-1.0', 2]])
  assert.equal(fs.existsSync(observedFile(dataDir)), true)
  const windows = muse.quota().groups.muse.windows
  near(windows['5h'].remaining, 1)
  near(windows.weekly.remaining, 0.94)
  assert.deepEqual([windows['5h'].resetsAt, windows.weekly.resetsAt], ['2026-10-20T05:13:14.000Z', '2026-10-26T00:00:00.000Z'])
})

test('quota is unknown until a call has brought an allowance, and never throws', (t) => {
  const { dataDir, muse } = build(t)
  assert.deepEqual(muse.quota(), { groups: { muse: { unknown: true, windows: {} } } })
  fs.mkdirSync(path.dirname(observedFile(dataDir)), { recursive: true })
  fs.writeFileSync(observedFile(dataDir), '{not json')
  assert.deepEqual(muse.quota(), { groups: { muse: { unknown: true, windows: {} } } })
  run(muse, out(completed(ANSWER), usage('not an allowance')))
  assert.equal(muse.quota().groups.muse.unknown, true)
  run(muse, out(completed(ANSWER), usage({ window: { usedPercent: 'a', resetsAtMs: 'b' } })))
  assert.equal(muse.quota().groups.muse.unknown, true)
})

test('72 % used in the 5 h window and 40 % in the weekly one read as 28 % and 60 % left, with their resets', (t) => {
  const { dataDir, muse } = build(t)
  run(muse, out(completed(ANSWER), usage(allowance(72, 40))))
  const reading = muse.quota().groups.muse
  near(reading.windows['5h'].remaining, 0.28)
  near(reading.windows.weekly.remaining, 0.6)
  assert.equal(reading.windows['5h'].resetsAt, new Date(NOW + 3 * HOUR).toISOString())
  assert.equal(reading.windows.weekly.resetsAt, new Date(NOW + 5 * 24 * HOUR).toISOString())
  assert.deepEqual([reading.source.command, reading.source.ageMinutes], ['muse exec --json', 0])
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(observedFile(dataDir), 'utf8'))).sort(), ['observedAt', 'weekly', 'window'])
  // The reading ages with the clock.
  const later = createMuse({ groups: GROUPS, dataDir, now: () => NOW + 7 * 60000 })
  assert.equal(later.quota().groups.muse.source.ageMinutes, 7)
})

test('an allowance in snake_case reads the same, over 100 % is nothing left, and a window whose reset has passed is dropped', (t) => {
  const { dataDir, muse } = build(t)
  run(muse, out(completed(ANSWER), usage({ window: { used_percent: 150, resets_at_ms: NOW + HOUR }, weekly: { used_percent: 10, resets_at_ms: NOW + 24 * HOUR } })))
  const reading = muse.quota().groups.muse
  assert.equal(reading.windows['5h'].remaining, 0)
  near(reading.windows.weekly.remaining, 0.9)
  const afterFive = createMuse({ groups: GROUPS, dataDir, now: () => NOW + 2 * HOUR })
  assert.deepEqual(Object.keys(afterFive.quota().groups.muse.windows), ['weekly'])
  const afterAll = createMuse({ groups: GROUPS, dataDir, now: () => NOW + 25 * HOUR })
  assert.deepEqual(afterAll.quota(), { groups: { muse: { unknown: true, windows: {} } } })
})

test('a quota failure clears the windows kept before it, keeps no window of its own, and a later healthy allowance reads again', (t) => {
  const { dataDir, muse } = build(t)
  run(muse, out(completed(ANSWER), usage(allowance(10, 10))))
  assert.deepEqual(Object.keys(muse.quota().groups.muse.windows), ['5h', 'weekly'])
  const resets = NOW + 4 * HOUR
  run(muse, out(failed({ kind: 'modelError', message: 'limit', retryable: false, quota: { limitKind: 'tierLimit', resetsAtMs: resets } })), 1)
  assert.deepEqual(muse.quota(), { groups: { muse: { unknown: true, windows: {} } } })
  const kept = JSON.parse(fs.readFileSync(observedFile(dataDir), 'utf8'))
  assert.deepEqual([kept.observedAt, kept.window, kept.weekly], [NOW, null, null])
  assert.equal('exhaustedUntilMs' in kept, false)
  run(muse, out(completed(ANSWER), usage(allowance(10, 10))))
  assert.deepEqual(Object.keys(muse.quota().groups.muse.windows), ['5h', 'weekly'])
})

test('a quota failure that brings its own allowance keeps that allowance, so a window with nothing left reads as nothing left', (t) => {
  const { muse } = build(t)
  run(muse, out(failed({ kind: 'modelError', message: 'limit', retryable: false, quota: { limitKind: 'tierLimit', resetsAtMs: NOW + 4 * HOUR } }), usage(allowance(100, 40))), 1)
  const reading = muse.quota().groups.muse
  assert.equal(reading.windows['5h'].remaining, 0)
  near(reading.windows.weekly.remaining, 0.6)
})

test('an environmentError or an authRequired failure does not touch what was observed', (t) => {
  const { muse } = build(t)
  run(muse, out(completed(ANSWER), usage(allowance(10, 10))))
  run(muse, out(failed({ kind: 'environmentError', message: 'bwrap failed', retryable: false })), 1)
  run(muse, out(failed({ kind: 'authRequired', message: 'sign in', retryable: false })), 1)
  assert.deepEqual(Object.keys(muse.quota().groups.muse.windows), ['5h', 'weekly'])
})

test('a data directory that cannot be written is not an error of the call', (t) => {
  const dataDir = path.join(tempDir(t, 'muse-data-'), 'a-file')
  fs.writeFileSync(dataDir, 'not a directory')
  const { muse } = build(t, { dataDir })
  assert.equal(run(muse, out(completed(ANSWER), usage(allowance(10, 10)))).clean, true)
  assert.deepEqual(muse.quota(), { groups: { muse: { unknown: true, windows: {} } } })
})

test('argv rewrites a nested schema file into strict form and returns the same argument list', (t) => {
  const { muse } = build(t, { command: '/opt/muse' })
  const schemaFile = path.join(tempDir(t, 'muse-schema-'), 'schema.json')
  const schema = {
    type: 'object',
    required: ['verdict', 'findings', 'open'],
    properties: {
      verdict: { type: 'string', enum: ['approve', 'revise', 'reject'], description: 'the verdict' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          required: ['title'],
          properties: { title: { type: 'string', description: 'the title' } },
        },
      },
      open: { type: 'object', additionalProperties: true, required: ['note'], properties: { note: { type: 'string' } } },
    },
  }
  fs.writeFileSync(schemaFile, `${JSON.stringify(schema, null, 2)}\n`)
  assert.deepEqual(muse.argv({ model: 'muse-spark-1.3', level: 'high', schemaFile, timeoutSeconds: 2700, prompt: 'P' }), [
    '/opt/muse', 'exec', '--json', '--provider', 'meta', '--model', 'muse-spark-1.3', '--reasoning-effort', 'high', '--output-schema', schemaFile,
    '--contributor-mode', 'off', '--no-foreign-personal-context', '--disable-approval', '--disable-reminders', '--disable-request-user-input',
    '--max-model-steps', '200', 'P',
  ])
  const written = JSON.parse(fs.readFileSync(schemaFile, 'utf8'))
  assert.equal(written.additionalProperties, false)
  assert.equal(written.properties.findings.items.additionalProperties, false)
  assert.equal(written.properties.open.additionalProperties, true)
  assert.deepEqual(written.required, ['verdict', 'findings', 'open'])
  assert.deepEqual(written.properties.findings.items.required, ['title'])
  assert.deepEqual(written.properties.verdict.enum, ['approve', 'revise', 'reject'])
  assert.equal(written.properties.verdict.description, 'the verdict')
  assert.equal(written.properties.findings.items.properties.title.description, 'the title')
})

test('a renewal judges the run, not the answer: needsAnswer accepts prose, observe: false keeps nothing', (t) => {
  const { dataDir, muse } = build(t)
  const raw = { stdout: out(completed('ok'), usage(allowance(72, 40))), stderr: '', exitCode: 0 }
  assert.equal(run(muse, raw).clean, false, 'prose is no structured output to a call')
  const judged = muse.parse(raw, { observe: false, needsAnswer: false })
  assert.deepEqual([judged.clean, judged.reason, judged.structured], [true, null, null])
  assert.equal(muse.quota().groups.muse.unknown, true, 'judging keeps nothing')
  assert.equal(fs.existsSync(observedFile(dataDir)), false)
})

test('argv with a missing schema path or a file that is not JSON returns the argument list and leaves the file', (t) => {
  const { muse } = build(t, { command: '/opt/muse' })
  const missing = path.join(tempDir(t, 'muse-schema-'), 'missing.json')
  assert.equal(fs.existsSync(missing), false)
  assert.deepEqual(muse.argv({ model: 'muse-wonder-1.0', level: 'low', schemaFile: missing, timeoutSeconds: 2700, prompt: 'P' }), [
    '/opt/muse', 'exec', '--json', '--provider', 'meta', '--model', 'muse-wonder-1.0', '--reasoning-effort', 'low', '--output-schema', missing,
    '--contributor-mode', 'off', '--no-foreign-personal-context', '--disable-approval', '--disable-reminders', '--disable-request-user-input',
    '--max-model-steps', '200', 'P',
  ])
  assert.equal(fs.existsSync(missing), false)

  const bad = path.join(tempDir(t, 'muse-schema-'), 'schema.json')
  const text = 'not json {'
  fs.writeFileSync(bad, text)
  assert.deepEqual(muse.argv({ model: 'muse-wonder-1.0', level: 'low', schemaFile: bad, prompt: 'P' }), [
    '/opt/muse', 'exec', '--json', '--provider', 'meta', '--model', 'muse-wonder-1.0', '--reasoning-effort', 'low', '--output-schema', bad,
    '--contributor-mode', 'off', '--no-foreign-personal-context', '--disable-approval', '--disable-reminders', '--disable-request-user-input',
    '--max-model-steps', '200', 'P',
  ])
  assert.equal(fs.readFileSync(bad, 'utf8'), text)
})
