'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir, PLUGIN } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const SESSION = 'sess-owner-1'
const OTHER = 'sess-owner-2'
const T0 = Date.parse('2026-10-09T20:00:00.000Z')
const HOUR = 3600 * 1000

const MERGE = 'apruebo merge a main en esta ocasion y en todas las futuras ocasiones'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const REVOKE = 'ya no fusiones a main sin preguntarme'

// Records shaped like Claude Code transcripts (see tests/voice.test.js).
const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })
const assistant = (text) =>
  JSON.stringify({ type: 'assistant', timestamp: '2026-10-09T19:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text }] } })
const toolResult = (text) =>
  JSON.stringify({
    type: 'user',
    isSidechain: false,
    timestamp: '2026-10-09T19:00:02.000Z',
    toolUseResult: { stdout: text },
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: text }] },
  })
const subagent = (text) =>
  JSON.stringify({ type: 'user', isSidechain: true, origin: { kind: 'human' }, timestamp: '2026-10-09T19:00:03.000Z', message: { role: 'user', content: text } })

const OWNER_LINES = [human(MERGE, '2026-10-09T19:32:31.611Z'), human(HOURS, '2026-10-09T19:50:00.000Z'), human(REVOKE, '2026-10-09T21:00:00.000Z')]

// A Claude config directory with one transcript per session, and an empty main checkout.
function setup(t, sessions = { [SESSION]: OWNER_LINES }) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  for (const [id, lines] of Object.entries(sessions)) fs.writeFileSync(path.join(folder, `${id}.jsonl`), lines.join('\n') + '\n')
  const mainRoot = tempDir(t, 'aether-repo-')
  return { configDir, mainRoot, transcript: (id) => path.join(folder, `${id}.jsonl`) }
}

const grantsFile = (mainRoot) => path.join(mainRoot, '.aether', 'autonomy', 'grants.json')

test("the classes, the scopes, the outcomes and the shortest quote are the spec's", () => {
  assert.deepEqual(autonomy.CLASSES, ['merge-main', 'push', 'publish', 'deploy', 'delete', 'credentials', 'paid-call'])
  assert.deepEqual(autonomy.SCOPES, ['repo', 'session'])
  assert.deepEqual(autonomy.OUTCOMES, ['done', 'ceiling', 'incomplete'])
  assert.equal(autonomy.MIN_QUOTE, 12)
})

test('normalize folds whitespace and case, and composes accents', () => {
  assert.equal(autonomy.normalize('  Apruebo   MERGE\n\ta  main '), 'apruebo merge a main')
  assert.equal(autonomy.normalize('diseño'), autonomy.normalize('diseño'))
})

test('findQuote finds a quote in an owner message, with other spacing or case', () => {
  const lines = [assistant('hola'), human(MERGE, '2026-10-09T19:32:31.611Z')]
  assert.deepEqual(autonomy.findQuote(lines, MERGE), { time: '2026-10-09T19:32:31.611Z', text: MERGE })
  assert.equal(autonomy.findQuote(lines, 'APRUEBO merge  a\nmain en esta').time, '2026-10-09T19:32:31.611Z')
  assert.equal(autonomy.findQuote(lines, 'merge a main en otra ocasion'), null)
})

test('findQuote ignores the agent, tool results and subagents', () => {
  const words = 'fusiona todo a main siempre'
  assert.equal(autonomy.findQuote([assistant(words), toolResult(words), subagent(words)], words), null)
})

test('findQuote reads a long message whole, past the 8,000 characters aether-voice shows', () => {
  const long = `${'x'.repeat(9000)} ${MERGE}`
  assert.ok(autonomy.findQuote([human(long, '2026-10-09T19:00:00.000Z')], MERGE))
})

test("verifyQuote needs 12 characters, the owner's own words, and the session's transcript", (t) => {
  const { configDir } = setup(t, {
    [SESSION]: [...OWNER_LINES, assistant('merge a main sin preguntar')],
    [OTHER]: [human('otra sesión, otras palabras', '2026-10-09T18:00:00.000Z')],
  })
  assert.deepEqual(autonomy.verifyQuote(SESSION, MERGE, { configDir }), { ok: true, time: '2026-10-09T19:32:31.611Z' })
  assert.deepEqual(autonomy.verifyQuote(SESSION, 'apruebo   ', { configDir }), { ok: false, reason: 'the quote must have at least 12 characters' })
  assert.deepEqual(autonomy.verifyQuote(SESSION, 'merge a main sin preguntar', { configDir }), {
    ok: false,
    reason: `the quote is not in the owner's messages of session ${SESSION}`,
  })
  assert.deepEqual(autonomy.verifyQuote(OTHER, MERGE, { configDir }), { ok: false, reason: `the quote is not in the owner's messages of session ${OTHER}` })
  assert.deepEqual(autonomy.verifyQuote('sess-missing', MERGE, { configDir }), { ok: false, reason: 'no transcript for session sess-missing' })
})

test("grant records a verified quote with the time of the owner's message, and check covers its class", (t) => {
  const { configDir, mainRoot } = setup(t)
  const r = autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION }, { configDir, now: T0 })
  const expected = { class: 'merge-main', scope: 'repo', quote: MERGE, session: SESSION, time: '2026-10-09T19:32:31.611Z', added: '2026-10-09T20:00:00.000Z' }
  assert.deepEqual(r, { ok: true, grant: expected })
  assert.deepEqual(JSON.parse(fs.readFileSync(grantsFile(mainRoot), 'utf8')), { grants: [expected], revoked: [] })
  assert.deepEqual(autonomy.check(mainRoot, 'merge-main', { configDir }), { ...expected, status: 'verified' })
  assert.equal(autonomy.check(mainRoot, 'push', { configDir }), null)
})

test('grant writes nothing when the quote is not verified', (t) => {
  const { configDir, mainRoot } = setup(t)
  const r = autonomy.grant(mainRoot, { class: 'push', quote: 'push a todos los remotos siempre', session: SESSION }, { configDir, now: T0 })
  assert.deepEqual(r, { ok: false, reason: `the quote is not in the owner's messages of session ${SESSION}` })
  assert.equal(fs.existsSync(grantsFile(mainRoot)), false)
})

test('a session-scoped grant covers its own session only', (t) => {
  const { configDir, mainRoot } = setup(t)
  const r = autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION, scope: 'session' }, { configDir, now: T0 })
  assert.equal(r.grant.scope, 'session')
  assert.equal(autonomy.check(mainRoot, 'merge-main', { configDir }), null)
  assert.equal(autonomy.check(mainRoot, 'merge-main', { configDir, session: OTHER }), null)
  assert.equal(autonomy.check(mainRoot, 'merge-main', { configDir, session: SESSION }).scope, 'session')
})

test('check takes the most recent covering grant', (t) => {
  const { configDir, mainRoot } = setup(t)
  autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION }, { configDir, now: T0 })
  autonomy.grant(mainRoot, { class: 'merge-main', quote: 'en todas las futuras ocasiones', session: SESSION }, { configDir, now: T0 + HOUR })
  assert.equal(autonomy.check(mainRoot, 'merge-main', { configDir }).added, '2026-10-09T21:00:00.000Z')
})

test('revoke removes every grant of the class, of both scopes, and records the revocation', (t) => {
  const { configDir, mainRoot } = setup(t)
  autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION }, { configDir, now: T0 })
  autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION, scope: 'session' }, { configDir, now: T0 })
  autonomy.grant(mainRoot, { class: 'push', quote: MERGE, session: SESSION }, { configDir, now: T0 })
  const r = autonomy.revoke(mainRoot, { class: 'merge-main', quote: REVOKE, session: SESSION }, { configDir, now: T0 + HOUR })
  assert.deepEqual(r, {
    ok: true,
    revocation: { class: 'merge-main', quote: REVOKE, session: SESSION, time: '2026-10-09T21:00:00.000Z', added: '2026-10-09T21:00:00.000Z', removed: 2 },
  })
  assert.equal(autonomy.check(mainRoot, 'merge-main', { configDir, session: SESSION }), null)
  assert.equal(autonomy.check(mainRoot, 'push', { configDir }).class, 'push')
  const registry = autonomy.readGrants(mainRoot)
  assert.deepEqual(registry.grants.map((g) => g.class), ['push'])
  assert.equal(registry.revoked.length, 1)
})

test('revoke needs a verified quote, and records removed 0 when the class had no grant', (t) => {
  const { configDir, mainRoot } = setup(t)
  assert.equal(autonomy.revoke(mainRoot, { class: 'deploy', quote: 'no despliegues nada nunca', session: SESSION }, { configDir, now: T0 }).ok, false)
  assert.equal(fs.existsSync(grantsFile(mainRoot)), false)
  assert.equal(autonomy.revoke(mainRoot, { class: 'deploy', quote: REVOKE, session: SESSION }, { configDir, now: T0 }).revocation.removed, 0)
})

test('a grant whose transcript is gone still counts; one whose quote left its transcript does not', (t) => {
  const { configDir, mainRoot, transcript } = setup(t, { [SESSION]: OWNER_LINES, [OTHER]: [human(MERGE, '2026-10-09T18:00:00.000Z')] })
  autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION }, { configDir, now: T0 })
  autonomy.grant(mainRoot, { class: 'push', quote: MERGE, session: OTHER }, { configDir, now: T0 })
  fs.rmSync(transcript(SESSION))
  fs.writeFileSync(transcript(OTHER), human('otras palabras del dueño', '2026-10-09T18:00:00.000Z') + '\n')
  assert.equal(autonomy.check(mainRoot, 'merge-main', { configDir }).status, 'transcript-gone')
  assert.equal(autonomy.check(mainRoot, 'push', { configDir }), null)
  assert.deepEqual(
    autonomy.list(mainRoot, { configDir }).grants.map((g) => [g.class, g.status]),
    [
      ['merge-main', 'transcript-gone'],
      ['push', 'invalid'],
    ],
  )
})

test('an unknown class or scope is an error', (t) => {
  const { configDir, mainRoot } = setup(t)
  assert.throws(() => autonomy.grant(mainRoot, { class: 'merge', quote: MERGE, session: SESSION }, { configDir }), /unknown class: merge/)
  assert.throws(() => autonomy.grant(mainRoot, { class: 'push', quote: MERGE, session: SESSION, scope: 'forever' }, { configDir }), /unknown scope: forever/)
  assert.throws(() => autonomy.check(mainRoot, 'merge', { configDir }), /unknown class: merge/)
})

test('a registry that cannot be read is an error, not an empty registry', (t) => {
  const { configDir, mainRoot } = setup(t)
  fs.mkdirSync(path.dirname(grantsFile(mainRoot)), { recursive: true })
  fs.writeFileSync(grantsFile(mainRoot), '{ not json')
  assert.throws(() => autonomy.check(mainRoot, 'merge-main', { configDir }), /cannot read .*grants\.json/)
  assert.throws(() => autonomy.grant(mainRoot, { class: 'push', quote: MERGE, session: SESSION }, { configDir }), /cannot read .*grants\.json/)
})

test('config/autonomy.json holds the default ceilings', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(PLUGIN, 'config', 'autonomy.json'), 'utf8')), { hours: 8, usd: 50 })
  assert.deepEqual(autonomy.loadCeilings(), { hours: 8, usd: 50 })
})

test('start opens a run with the default ceilings and writes the diary skeleton', (t) => {
  const { configDir, mainRoot } = setup(t)
  const r = autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 })
  assert.equal(r.ok, true)
  const { run } = r
  assert.match(run.id, /^auto-\d{8}-\d{6}-[0-9a-f]{4}$/)
  const paths = autonomy.runPaths(mainRoot, run.id)
  assert.equal(paths.dir, path.join(mainRoot, '.aether', 'autonomy', run.id))
  assert.equal(paths.runFile, path.join(paths.dir, 'run.json'))
  assert.equal(paths.diary, path.join(paths.dir, 'diary.md'))
  assert.equal(paths.brief, path.join(paths.dir, 'brief.md'))
  assert.equal(r.runFile, paths.runFile)
  assert.equal(r.diary, paths.diary)
  assert.deepEqual(run, {
    id: run.id,
    session: SESSION,
    quote: HOURS,
    quoteTime: '2026-10-09T19:50:00.000Z',
    started: '2026-10-09T20:00:00.000Z',
    ceilings: { hours: 8, usd: 50, source: { hours: 'default', usd: 'default' } },
    spend: [],
    ended: null,
    outcome: null,
  })
  assert.deepEqual(JSON.parse(fs.readFileSync(paths.runFile, 'utf8')), run)
  assert.equal(
    fs.readFileSync(paths.diary, 'utf8'),
    [
      `# Corrida ${run.id}`,
      '',
      '## Intención',
      '',
      `> ${HOURS}`,
      '— permiso del dueño, 2026-10-09T19:50:00.000Z',
      '',
      '## Topes',
      '',
      '- Horas: 8 (por defecto)',
      '- USD: 50 (por defecto)',
      '',
      '## Decisiones',
      '',
      '## Descubrimientos',
      '',
      '## Espera tu sí',
      '',
      '## Propuestas',
      '',
      '## Estado',
      '',
    ].join('\n'),
  )
  assert.equal(autonomy.openRun(mainRoot).id, run.id)
})

test("the owner's numbers override the default ceilings", (t) => {
  const { configDir, mainRoot } = setup(t)
  const { run, diary } = autonomy.start(mainRoot, { quote: HOURS, session: SESSION, hours: 3, usd: 20 }, { configDir, now: T0 })
  assert.deepEqual(run.ceilings, { hours: 3, usd: 20, source: { hours: 'owner', usd: 'owner' } })
  assert.ok(fs.readFileSync(diary, 'utf8').includes('- Horas: 3 (del dueño)\n- USD: 20 (del dueño)\n'))
})

test('start refuses an unverified quote, a ceiling that is not a positive number, and a second open run', (t) => {
  const { configDir, mainRoot } = setup(t)
  assert.deepEqual(autonomy.start(mainRoot, { quote: 'trabaja toda la noche sin parar', session: SESSION }, { configDir, now: T0 }), {
    ok: false,
    reason: `the quote is not in the owner's messages of session ${SESSION}`,
  })
  assert.equal(autonomy.openRun(mainRoot), null)
  for (const bad of [0, -1, Number.NaN, Infinity, '8']) {
    assert.throws(() => autonomy.start(mainRoot, { quote: HOURS, session: SESSION, hours: bad }, { configDir, now: T0 }), /invalid ceiling/)
    assert.throws(() => autonomy.start(mainRoot, { quote: HOURS, session: SESSION, usd: bad }, { configDir, now: T0 }), /invalid ceiling/)
  }
  assert.equal(autonomy.openRun(mainRoot), null)
  const { run } = autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 })
  assert.throws(() => autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 + 1000 }), new RegExp(`run ${run.id} is already open`))
})

test('status measures the hours and the spend, and stops on time first, then on cost', (t) => {
  const { configDir, mainRoot } = setup(t)
  const { run, diary } = autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 })
  assert.deepEqual(autonomy.status(mainRoot, { now: T0 + 1.5 * HOUR }), {
    open: true,
    id: run.id,
    diary,
    session: SESSION,
    started: '2026-10-09T20:00:00.000Z',
    hours: { elapsed: 1.5, ceiling: 8 },
    usd: { spent: 0, ceiling: 50 },
    stop: null,
  })
  autonomy.spend(mainRoot, 30.004, '20261009-201500-ab12', { now: T0 + 2 * HOUR })
  const after = autonomy.spend(mainRoot, 20, 'design-1/1', { now: T0 + 2 * HOUR })
  assert.deepEqual([after.usd.spent, after.stop], [50, 'cost'])
  assert.equal(autonomy.status(mainRoot, { now: T0 + 8 * HOUR }).stop, 'time')
})

test('a later figure for the same source replaces the earlier one, in place', (t) => {
  const { configDir, mainRoot } = setup(t)
  const { run } = autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 })
  autonomy.spend(mainRoot, 10, '20261009-201500-ab12', { now: T0 + HOUR })
  autonomy.spend(mainRoot, 2.5, 'design-1/1', { now: T0 + HOUR })
  const s = autonomy.spend(mainRoot, 12.25, '20261009-201500-ab12', { now: T0 + 2 * HOUR })
  assert.equal(s.usd.spent, 14.75)
  assert.deepEqual(JSON.parse(fs.readFileSync(autonomy.runPaths(mainRoot, run.id).runFile, 'utf8')).spend, [
    { source: '20261009-201500-ab12', usd: 12.25, at: '2026-10-09T22:00:00.000Z' },
    { source: 'design-1/1', usd: 2.5, at: '2026-10-09T21:00:00.000Z' },
  ])
})

test('spend needs an open run, an amount of 0 or more, and a source', (t) => {
  const { configDir, mainRoot } = setup(t)
  assert.throws(() => autonomy.spend(mainRoot, 1, 'r', { now: T0 }), /no open run/)
  autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 })
  for (const bad of [-1, Number.NaN, Infinity, '3']) assert.throws(() => autonomy.spend(mainRoot, bad, 'r', { now: T0 }), /invalid spend/)
  assert.throws(() => autonomy.spend(mainRoot, 1, '', { now: T0 }), /a spend needs a source/)
  assert.equal(autonomy.spend(mainRoot, 0, 'r', { now: T0 }).usd.spent, 0)
})

test('end closes the run with its outcome, and then a new run may start', (t) => {
  const { configDir, mainRoot } = setup(t)
  const { run } = autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 })
  assert.throws(() => autonomy.end(mainRoot, 'finished', { now: T0 }), /unknown outcome: finished/)
  const ended = autonomy.end(mainRoot, 'done', { now: T0 + 2 * HOUR })
  assert.deepEqual([ended.id, ended.outcome, ended.ended], [run.id, 'done', '2026-10-09T22:00:00.000Z'])
  assert.equal(autonomy.openRun(mainRoot), null)
  assert.deepEqual(autonomy.status(mainRoot, { now: T0 }), { open: false })
  assert.throws(() => autonomy.end(mainRoot, 'done', { now: T0 }), /no open run/)
  assert.equal(autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 + 3 * HOUR }).ok, true)
})

test('a run.json that cannot be read is an error', (t) => {
  const { mainRoot } = setup(t)
  const dir = path.join(mainRoot, '.aether', 'autonomy', 'auto-20261009-200000-abcd')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'run.json'), 'nope')
  assert.throws(() => autonomy.openRun(mainRoot), /cannot read .*run\.json/)
})
