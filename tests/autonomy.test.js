'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const { tempDir, makeRepo, useDataDir, PLUGIN } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')

const SESSION = 'sess-owner-1'
const OTHER = 'sess-owner-2'
const T0 = Date.parse('2026-10-09T20:00:00.000Z')
const HOUR = 3600 * 1000

const MERGE = 'apruebo merge a main en esta ocasion y en todas las futuras ocasiones'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const QUOTE = HOURS
const REVOKE = 'ya no fusiones a main sin preguntarme'

// Records shaped like Claude Code transcripts (see tests/voice.test.js).
const human = (text, time, extra = {}) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: time, message: { role: 'user', content: text }, ...extra })
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
  assert.deepEqual(autonomy.CLASSES, ['merge-main', 'push', 'publish', 'deploy', 'delete', 'credentials', 'paid-call', 'skill-install'])
  assert.deepEqual(autonomy.SCOPES, ['repo', 'session'])
  assert.deepEqual(autonomy.OUTCOMES, ['done', 'ceiling', 'incomplete'])
  assert.equal(autonomy.MIN_QUOTE, 12)
})

test('skill-install is granted and checked like the other classes (R25)', (t) => {
  const quote = 'apruebo instalar skills en esta ocasion y en todas las futuras ocasiones'
  const { configDir, mainRoot } = setup(t, { [SESSION]: [human(quote, '2026-10-09T19:32:31.611Z')] })
  assert.equal(autonomy.grant(mainRoot, { class: 'skill-install', quote, session: SESSION }, { configDir }).ok, true)
  assert.equal(autonomy.check(mainRoot, 'skill-install', { configDir }).status, 'verified')
  assert.equal(autonomy.check(mainRoot, 'push', { configDir }), null)
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

test('revoke by default removes only this session\'s session grants of the class (issue 017)', (t) => {
  const { configDir, mainRoot } = setup(t, { [SESSION]: OWNER_LINES, [OTHER]: [human(MERGE, '2026-10-09T18:00:00.000Z')] })
  autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION }, { configDir, now: T0 })
  autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION, scope: 'session' }, { configDir, now: T0 })
  autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: OTHER, scope: 'session' }, { configDir, now: T0 })
  autonomy.grant(mainRoot, { class: 'push', quote: MERGE, session: SESSION }, { configDir, now: T0 })
  const r = autonomy.revoke(mainRoot, { class: 'merge-main', quote: REVOKE, session: SESSION }, { configDir, now: T0 + HOUR })
  assert.deepEqual(r, {
    ok: true,
    revocation: { class: 'merge-main', quote: REVOKE, session: SESSION, all: false, time: '2026-10-09T21:00:00.000Z', added: '2026-10-09T21:00:00.000Z', removed: 1 },
  })
  // The repository grant and the other session's grant of the same class stay.
  assert.equal(autonomy.check(mainRoot, 'merge-main', { configDir }).scope, 'repo')
  assert.equal(autonomy.check(mainRoot, 'merge-main', { configDir, session: OTHER }).session, OTHER)
  assert.equal(autonomy.check(mainRoot, 'push', { configDir }).class, 'push')
  const registry = autonomy.readGrants(mainRoot)
  assert.deepEqual(registry.grants.map((g) => [g.class, g.scope, g.session]), [
    ['merge-main', 'repo', SESSION],
    ['merge-main', 'session', OTHER],
    ['push', 'repo', SESSION],
  ])
  assert.equal(registry.revoked.length, 1)
})

test('revoke with all removes every grant of the class, of both scopes and sessions (issue 017)', (t) => {
  const { configDir, mainRoot } = setup(t, { [SESSION]: OWNER_LINES, [OTHER]: [human(MERGE, '2026-10-09T18:00:00.000Z')] })
  autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION }, { configDir, now: T0 })
  autonomy.grant(mainRoot, { class: 'merge-main', quote: MERGE, session: OTHER, scope: 'session' }, { configDir, now: T0 })
  autonomy.grant(mainRoot, { class: 'push', quote: MERGE, session: SESSION }, { configDir, now: T0 })
  const r = autonomy.revoke(mainRoot, { class: 'merge-main', quote: REVOKE, session: SESSION, all: true }, { configDir, now: T0 + HOUR })
  assert.equal(r.revocation.all, true)
  assert.equal(r.revocation.removed, 2)
  assert.equal(autonomy.check(mainRoot, 'merge-main', { configDir, session: SESSION }), null)
  assert.deepEqual(autonomy.readGrants(mainRoot).grants.map((g) => g.class), ['push'])
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
    brakeOff: null,
    quotaPauses: [],
    quotaCrossings: [],
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
    hours: { elapsed: 1.5, ceiling: 8, paused: 0 },
    usd: { spent: 0, ceiling: 50 },
    idleMinutes: 0,
    idle: false,
    stop: null,
    quota: { paused: false, brakeOff: false, resetsAt: null, resumeAt: null, percentUsed: null },
  })
  autonomy.spend(mainRoot, 30.004, '20261009-201500-ab12', { now: T0 + 2 * HOUR })
  const after = autonomy.spend(mainRoot, 20, 'design-1/1', { now: T0 + 2 * HOUR })
  assert.deepEqual([after.usd.spent, after.stop], [50, 'cost'])
  assert.equal(autonomy.status(mainRoot, { now: T0 + 8 * HOUR }).stop, 'time')
})

test('status flags a run whose diary and state have been quiet for 30 minutes (GitHub #31)', (t) => {
  const { configDir, mainRoot } = setup(t)
  const { run, diary, runFile } = autonomy.start(mainRoot, { quote: HOURS, session: SESSION }, { configDir, now: T0 })
  const at = new Date(T0)
  fs.utimesSync(diary, at, at)
  fs.utimesSync(runFile, at, at)
  assert.deepEqual([autonomy.status(mainRoot, { now: T0 + 10 * 60000 }).idleMinutes, autonomy.status(mainRoot, { now: T0 + 10 * 60000 }).idle], [10, false])
  assert.deepEqual([autonomy.status(mainRoot, { now: T0 + 31 * 60000 }).idleMinutes, autonomy.status(mainRoot, { now: T0 + 31 * 60000 }).idle], [31, true])
  // A diary edit is activity: the run is awake again.
  const later = new Date(T0 + 30 * 60000)
  fs.utimesSync(diary, later, later)
  assert.deepEqual([autonomy.status(mainRoot, { now: T0 + 31 * 60000 }).idleMinutes, autonomy.status(mainRoot, { now: T0 + 31 * 60000 }).idle], [1, false])
  assert.ok(run.id)
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

test('a quote taken from a negated clause is refused, and sin, a plain repeat and a negated revocation are not (R5)', (t) => {
  const NEGATED = 'Por ahora no hagas push a origin ni publiques nada.'
  const SIN = 'Haz push sin preguntarme cuando terminen las pruebas.'
  const NIGHT = 'Trabaja toda la noche sin parar hasta cerrar la lista.'
  const EN = "Please don't run all night on this branch, never push anything."
  const lines = [NEGATED, SIN, NIGHT, EN, 'ya no fusiones a main sin preguntarme', HOURS].map((text, i) => human(text, `2026-10-09T19:0${i}:00.000Z`))
  const { configDir, mainRoot } = setup(t, { [SESSION]: lines })
  const denied = { ok: false, reason: "the quote is in a negated clause of the owner's message" }

  for (const quote of ['hagas push a origin ni publiques nada', 'publiques nada', 'push a origin', 'run all night on this branch', 'push anything']) {
    assert.deepEqual(autonomy.verifyQuote(SESSION, quote, { configDir }), denied, quote)
    assert.equal(autonomy.verifyQuote(SESSION, quote, { configDir, allowNegation: true }).ok, true, quote)
  }
  assert.deepEqual(autonomy.grant(mainRoot, { class: 'push', quote: 'hagas push a origin ni publiques nada', session: SESSION }, { configDir, now: T0 }), denied)
  assert.equal(fs.existsSync(grantsFile(mainRoot)), false, 'a refused grant writes nothing')
  assert.deepEqual(autonomy.start(mainRoot, { quote: 'run all night on this branch', session: SESSION }, { configDir, now: T0 }), denied)
  assert.equal(autonomy.openRun(mainRoot), null)

  for (const quote of ['Haz push sin preguntarme', 'Trabaja toda la noche sin parar', HOURS]) {
    assert.equal(autonomy.verifyQuote(SESSION, quote, { configDir }).ok, true, quote)
  }
  assert.equal(autonomy.grant(mainRoot, { class: 'push', quote: 'Haz push sin preguntarme', session: SESSION }, { configDir, now: T0 }).ok, true)
  assert.equal(autonomy.start(mainRoot, { quote: 'Trabaja toda la noche sin parar', session: SESSION }, { configDir, now: T0 }).ok, true)
  assert.equal(autonomy.revoke(mainRoot, { class: 'merge-main', quote: 'ya no fusiones a main sin preguntarme', session: SESSION }, { configDir, now: T0 }).ok, true)
})

test('a quote that is negated in one message and plain in another is accepted (R5)', (t) => {
  const { configDir } = setup(t, {
    [SESSION]: [human('No hagas push a origin todavia.', '2026-10-09T19:00:00.000Z'), human('Ahora sí, puedes hacer push a origin cuando quieras.', '2026-10-09T19:05:00.000Z')],
  })
  assert.equal(autonomy.verifyQuote(SESSION, 'push a origin', { configDir }).ok, true)
})

test('an accented más does not end a clause, so the prohibition stays refused (R5)', (t) => {
  const denied = { ok: false, reason: "the quote is in a negated clause of the owner's message" }
  for (const text of ['No hagas más push a origin.', 'No quiero más push a origin sin que yo lo pida.']) {
    const { configDir } = setup(t, { [SESSION]: [human(text, '2026-10-09T19:00:00.000Z')] })
    assert.deepEqual(autonomy.verifyQuote(SESSION, 'push a origin', { configDir }), denied, text)
    assert.equal(autonomy.verifyQuote(SESSION, 'push a origin', { configDir, allowNegation: true }).ok, true, text)
  }
})

test('neither mas nor más ends a clause, and negators keep their accent folding (R5)', (t) => {
  for (const text of ['Ya no hagas mas push a origin.', 'Ya no hagas más push a origin.']) {
    const kept = setup(t, { [SESSION]: [human(text, '2026-10-09T19:00:00.000Z')] })
    assert.deepEqual(autonomy.verifyQuote(SESSION, 'push a origin', { configDir: kept.configDir }), { ok: false, reason: "the quote is in a negated clause of the owner's message" }, text)
  }
  const folded = setup(t, { [SESSION]: [human('Jamás publiques sin avisar hoy mismo.', '2026-10-09T19:00:00.000Z')] })
  assert.deepEqual(autonomy.verifyQuote(SESSION, 'publiques sin avisar hoy mismo', { configDir: folded.configDir }), {
    ok: false,
    reason: "the quote is in a negated clause of the owner's message",
  })
})

test('a quote that starts in the middle of a word is read with the negator it cuts (R5)', (t) => {
  const denied = { ok: false, reason: "the quote is in a negated clause of the owner's message" }
  for (const [text, quote] of [
    ['No hagas push a origin.', 'o hagas push a origin'],
    ['Never push to origin tonight.', 'ever push to origin tonight'],
    ["Don't push to origin tonight.", "t push to origin tonight"],
  ]) {
    const { configDir } = setup(t, { [SESSION]: [human(text, '2026-10-09T19:00:00.000Z')] })
    assert.deepEqual(autonomy.verifyQuote(SESSION, quote, { configDir }), denied, quote)
    assert.equal(autonomy.verifyQuote(SESSION, quote, { configDir, allowNegation: true }).ok, true, quote)
  }
  const { configDir } = setup(t, { [SESSION]: [human('Haz push a origin cuando acaben.', '2026-10-09T19:00:00.000Z')] })
  assert.equal(autonomy.verifyQuote(SESSION, 'az push a origin cuando acaben', { configDir }).ok, true, 'a mid-word cut with no negator is accepted')
})

test('a negator before a clause boundary does not negate a quote after it (R5)', (t) => {
  const cases = [
    ['No hagas push a main, haz push a origin cuando acaben.', 'haz push a origin cuando acaben'],
    ['No hagas push a main. Haz push a origin cuando acaben.', 'Haz push a origin cuando acaben'],
    ['No hagas push a main; haz push a origin cuando acaben.', 'haz push a origin cuando acaben'],
    ['No hagas push a main: haz push a origin cuando acaben.', 'haz push a origin cuando acaben'],
    ['No hagas push a main! Haz push a origin cuando acaben.', 'Haz push a origin cuando acaben'],
    ['No hagas push a main? Haz push a origin cuando acaben.', 'Haz push a origin cuando acaben'],
    ['No hagas push a main pero haz push a origin cuando acaben.', 'haz push a origin cuando acaben'],
    ['No hagas push a main sino haz push a origin cuando acaben.', 'haz push a origin cuando acaben'],
    ['No hagas push a main aunque haz push a origin cuando acaben.', 'haz push a origin cuando acaben'],
    ['Do not push to main but push to origin when tests pass.', 'push to origin when tests pass'],
    ['Do not push to main however push to origin when tests pass.', 'push to origin when tests pass'],
    ['Do not push to main although push to origin when tests pass.', 'push to origin when tests pass'],
    ['No hagas push a main\nhaz push a origin cuando acaben.', 'haz push a origin cuando acaben'],
  ]
  for (const [text, quote] of cases) {
    const { configDir } = setup(t, { [SESSION]: [human(text, '2026-10-09T19:00:00.000Z')] })
    assert.equal(autonomy.verifyQuote(SESSION, quote, { configDir }).ok, true, text)
  }
})

test('a quote whose first word is a negator is refused (R5)', (t) => {
  const { configDir } = setup(t, {
    [SESSION]: [human('Haz lo que quieras, no hagas push a origin.', '2026-10-09T19:00:00.000Z')],
  })
  assert.deepEqual(autonomy.verifyQuote(SESSION, 'no hagas push a origin', { configDir }), {
    ok: false,
    reason: "the quote is in a negated clause of the owner's message",
  })
})

test('a quote containing ni is refused with no negator before it (R5)', (t) => {
  const { configDir } = setup(t, {
    [SESSION]: [human('Sube la rama ni te detengas.', '2026-10-09T19:00:00.000Z')],
  })
  assert.deepEqual(autonomy.verifyQuote(SESSION, 'Sube la rama ni te detengas', { configDir }), {
    ok: false,
    reason: "the quote is in a negated clause of the owner's message",
  })
  assert.equal(autonomy.verifyQuote(SESSION, 'Sube la rama ni te detengas', { configDir, allowNegation: true }).ok, true)
})

test('do not as a pair negates, while a no inside the quote does not (R5)', (t) => {
  const refused = setup(t, {
    [SESSION]: [human('Please do not push to origin tonight.', '2026-10-09T19:00:00.000Z')],
  })
  assert.deepEqual(autonomy.verifyQuote(SESSION, 'push to origin tonight', { configDir: refused.configDir }), {
    ok: false,
    reason: "the quote is in a negated clause of the owner's message",
  })
  const plain = setup(t, {
    [SESSION]: [human('Usa el modo manual o no presencial esta noche.', '2026-10-09T19:00:00.000Z')],
  })
  assert.equal(autonomy.verifyQuote(SESSION, 'el modo manual o no presencial esta noche', { configDir: plain.configDir }).ok, true)
})

test('quarantine sets aside an unreadable grants.json and refuses a readable one (R26)', (t) => {
  const repo = makeRepo(t)
  const dir = path.join(repo.dir, '.aether', 'autonomy')
  fs.mkdirSync(dir, { recursive: true })
  assert.equal(autonomy.quarantine(repo.dir, { target: 'grants' }).ok, false, 'no file: nothing to set aside')
  fs.writeFileSync(path.join(dir, 'grants.json'), JSON.stringify({ grants: [], revoked: [] }))
  const readable = autonomy.quarantine(repo.dir, { target: 'grants' })
  assert.equal(readable.ok, false)
  assert.match(readable.reason, /aether-autonomy/)
  assert.equal(fs.existsSync(path.join(dir, 'grants.json')), true)
  fs.writeFileSync(path.join(dir, 'grants.json'), '{ not json')
  const moved = autonomy.quarantine(repo.dir, { target: 'grants' }, { now: Date.UTC(2026, 10, 5, 12, 0, 0) })
  assert.equal(moved.ok, true)
  assert.equal(fs.existsSync(path.join(dir, 'grants.json')), false)
  assert.equal(fs.readFileSync(moved.to, 'utf8'), '{ not json')
  assert.match(path.relative(repo.dir, moved.to), /^\.aether\/broken-runs\/grants\.json-20261105-120000-[0-9a-f]{4}$/)
})

test('quarantine never overwrites a destination that already exists, it picks another suffix (R26)', (t) => {
  const repo = makeRepo(t)
  const dir = path.join(repo.dir, '.aether', 'autonomy')
  const broken = path.join(repo.dir, '.aether', 'broken-runs')
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(broken, { recursive: true })
  fs.writeFileSync(path.join(dir, 'grants.json'), '{ not json')
  const taken = path.join(broken, 'grants.json-20261105-120000-abcd')
  fs.writeFileSync(taken, 'keep me')
  let calls = 0
  t.mock.method(crypto, 'randomBytes', () => Buffer.from(calls++ === 0 ? [0xab, 0xcd] : [0x12, 0x34]))
  const moved = autonomy.quarantine(repo.dir, { target: 'grants' }, { now: Date.UTC(2026, 10, 5, 12, 0, 0) })
  t.mock.restoreAll()
  assert.equal(moved.ok, true)
  assert.equal(fs.readFileSync(taken, 'utf8'), 'keep me', 'the file that was already there is kept')
  assert.notEqual(moved.to, taken)
  assert.match(moved.to, /grants\.json-20261105-120000-1234$/)
  assert.equal(fs.readFileSync(moved.to, 'utf8'), '{ not json')
  assert.equal(fs.existsSync(path.join(dir, 'grants.json')), false)
})

test('quarantine sets aside the folder of a run whose run.json cannot be read, and never a readable or missing one (R26)', (t) => {
  const repo = makeRepo(t)
  const id = 'auto-20261009-200000-ab12'
  const dir = path.join(repo.dir, '.aether', 'autonomy', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'diary.md'), 'the diary')
  assert.equal(autonomy.quarantine(repo.dir, { target: 'run', id }).ok, false, 'a folder with no run.json')
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ id, spend: [] }))
  const readableRun = autonomy.quarantine(repo.dir, { target: 'run', id })
  assert.equal(readableRun.ok, false, 'a readable run is not set aside')
  assert.match(readableRun.reason, /aether-autonomy end/)
  assert.equal(fs.existsSync(dir), true)
  for (const bad of ['../x', 'grants', 'auto-1/../../x', '']) assert.equal(autonomy.quarantine(repo.dir, { target: 'run', id: bad }).ok, false, bad)
  assert.equal(autonomy.quarantine(repo.dir, { target: 'run', id: 'auto-20990101-000000-ffff' }).ok, false, 'a run that does not exist')
  fs.writeFileSync(path.join(dir, 'run.json'), '{ broken')
  const moved = autonomy.quarantine(repo.dir, { target: 'run', id })
  assert.equal(moved.ok, true)
  assert.equal(fs.existsSync(dir), false)
  assert.equal(fs.readFileSync(path.join(moved.to, 'diary.md'), 'utf8'), 'the diary')
})

function planUse(toolUseId = 'toolu_plan_1', timestamp = '2026-04-06T10:00:02.000Z') {
  return JSON.stringify({
    type: 'assistant',
    entrypoint: 'cli',
    timestamp,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: toolUseId, name: 'ExitPlanMode', input: {} }],
    },
  })
}

function planResult(toolUseId = 'toolu_plan_1', approved = true, timestamp = '2026-04-06T10:00:03.000Z') {
  return JSON.stringify({
    type: 'user',
    entrypoint: 'cli',
    timestamp,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          is_error: !approved,
          content: approved
            ? 'User has approved your plan. You can now start coding.'
            : "The user doesn't want to proceed with this tool use.",
        },
      ],
    },
  })
}

test('start in a Lead session rejects interactive cli, missing-entrypoint, unknown-entrypoint and mixed transcripts without ExitPlanMode approval, succeeds once approved, resumes an open run without a new start, refuses reuse, and leaves non-Lead sessions unchanged', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const { configDir, mainRoot, transcript } = setup(t, {
    [SESSION]: [human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' })],
  })

  // Outside a Lead session (not marked): works as today without ExitPlanMode (C7)
  const plainStart = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(plainStart.ok, true)
  autonomy.end(mainRoot, 'done', { now: Date.parse('2026-04-06T10:01:00.000Z') })
  fs.rmSync(path.join(mainRoot, '.aether', 'autonomy'), { recursive: true, force: true })

  // Mark as Lead session
  markSession(dataDir, SESSION, 1000, { repo: mainRoot, claude: null })

  const withoutPlan = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(withoutPlan.ok, false)
  assert.match(withoutPlan.reason, /plan mode/i)

  // Missing entrypoint (no entrypoint field in JSON) fails closed without ExitPlanMode
  fs.writeFileSync(
    transcript(SESSION),
    [human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: undefined })].join('\n') + '\n'
  )
  const missingEntrypoint = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(missingEntrypoint.ok, false)
  assert.match(missingEntrypoint.reason, /plan mode/i)

  // Unknown entrypoint ('desktop') fails closed without ExitPlanMode
  fs.writeFileSync(
    transcript(SESSION),
    [human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'desktop' })].join('\n') + '\n'
  )
  const desktopEntrypoint = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(desktopEntrypoint.ok, false)
  assert.match(desktopEntrypoint.reason, /plan mode/i)

  // Mixed 'sdk-cli' and 'cli' records fail closed without ExitPlanMode
  fs.writeFileSync(
    transcript(SESSION),
    [
      human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'sdk-cli' }),
      human('continua', '2026-04-06T10:00:02.000Z', { entrypoint: 'cli' }),
    ].join('\n') + '\n'
  )
  const mixedEntrypoint = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(mixedEntrypoint.ok, false)
  assert.match(mixedEntrypoint.reason, /plan mode/i)

  fs.writeFileSync(
    transcript(SESSION),
    [
      human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' }),
      planUse('toolu_p1'),
      planResult('toolu_p1', false),
    ].join('\n') + '\n'
  )
  const rejectedPlan = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(rejectedPlan.ok, false)

  fs.writeFileSync(
    transcript(SESSION),
    [
      human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' }),
      planUse('toolu_p1'),
      planResult('toolu_p1', true),
    ].join('\n') + '\n'
  )
  const approvedPlan = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:00:05.000Z') }
  )
  assert.equal(approvedPlan.ok, true)

  // Resuming an open run reads status on the open run with no new start or new plan approval
  const resumed = autonomy.status(mainRoot, { now: Date.parse('2026-04-06T10:05:00.000Z') })
  assert.equal(resumed.open, true)
  assert.equal(resumed.id, approvedPlan.run.id)
  assert.equal(resumed.stop, null)

  autonomy.end(mainRoot, 'done', { now: Date.parse('2026-04-06T10:10:00.000Z') })

  const reusedApproval = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 2 },
    { configDir, dataDir, now: Date.parse('2026-04-06T10:11:00.000Z') }
  )
  assert.equal(reusedApproval.ok, false)
  assert.match(reusedApproval.reason, /plan mode/i)
})

test('interactive plan approvals require an earlier matching use and accept text blocks only once per ID', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const { configDir, mainRoot, transcript } = setup(t)
  markSession(dataDir, SESSION, 1000, { repo: mainRoot, claude: null })
  const owner = human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' })
  const start = (now) => autonomy.start(mainRoot, { quote: QUOTE, session: SESSION, hours: 2 }, { configDir, dataDir, now })
  const write = (lines) => fs.writeFileSync(transcript(SESSION), [owner, ...lines].join('\n') + '\n')
  const errorResult = JSON.parse(planResult('p1'))
  errorResult.message.content[0].is_error = true
  for (const [name, lines] of [
    ['no tool use', [planResult('p1')]],
    ['result before use', [planResult('p1'), planUse('p1')]],
    ['different ID', [planUse('p1'), planResult('p2')]],
    ['error with approval text', [planUse('p1'), JSON.stringify(errorResult)]],
  ]) {
    write(lines)
    const result = start(Date.parse('2026-04-06T10:00:05.000Z'))
    assert.equal(result.ok, false, name)
    assert.match(result.reason, /plan mode/i, name)
  }

  const blockResult = JSON.parse(planResult('p1'))
  blockResult.message.content[0].content = [
    { type: 'image', text: 'ignored' },
    { type: 'text', text: 'Plan review\nUser has approved your plan. You can now start coding.' },
  ]
  const firstApproval = [planUse('p1'), JSON.stringify(blockResult)]
  write(firstApproval)
  assert.equal(start(Date.parse('2026-04-06T10:00:05.000Z')).ok, true)
  autonomy.end(mainRoot, 'done', { now: Date.parse('2026-04-06T10:01:00.000Z') })

  // Neither a repeated result nor another use of the same ID grants a second run.
  write([...firstApproval, planResult('p1'), planUse('p1'), planResult('p1')])
  const duplicate = start(Date.parse('2026-04-06T10:02:00.000Z'))
  assert.equal(duplicate.ok, false)
  assert.match(duplicate.reason, /plan mode/i)

  write([...firstApproval, planUse('p2', '2026-04-06T10:02:00.000Z'), planResult('p2', true, '2026-04-06T10:02:01.000Z')])
  const second = start(Date.parse('2026-04-06T10:03:00.000Z'))
  assert.equal(second.ok, true)
  assert.equal(autonomy.status(mainRoot).id, second.run.id)
})

test('interactive runs require an approval later than the latest run in the session', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const { configDir, mainRoot, transcript } = setup(t)
  markSession(dataDir, SESSION, 1000, { repo: mainRoot, claude: null })
  const owner = human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' })
  const lines = [owner, planUse('a1'), planResult('a1'), planUse('a2'), planResult('a2')]
  const write = () => fs.writeFileSync(transcript(SESSION), lines.join('\n'))
  const start = (time) => autonomy.start(mainRoot, { quote: QUOTE, session: SESSION }, { configDir, dataDir, now: Date.parse(time) })
  write()
  assert.equal(start('2026-04-06T10:00:05.000Z').ok, true)
  autonomy.end(mainRoot, 'done', { now: Date.parse('2026-04-06T10:01:00.000Z') })
  assert.match(start('2026-04-06T10:02:00.000Z').reason, /plan mode/i)
  const undated = JSON.parse(planResult('a3'))
  delete undated.timestamp
  lines.push(planUse('a3'), JSON.stringify(undated))
  write()
  assert.match(start('2026-04-06T10:02:00.000Z').reason, /plan mode/i)
  lines.push(planUse('a4'), planResult('a4', true, '2026-04-06T10:02:01.000Z'))
  write()
  assert.equal(start('2026-04-06T10:03:00.000Z').ok, true)
})

test('sidechain plan approvals do not authorize an interactive run', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const sidechain = (line) => JSON.stringify({ ...JSON.parse(line), isSidechain: true })
  const { configDir, mainRoot } = setup(t, { [SESSION]: [human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' }), sidechain(planUse()), sidechain(planResult())] })
  markSession(dataDir, SESSION, 1000, { repo: mainRoot, claude: null })
  const result = autonomy.start(mainRoot, { quote: QUOTE, session: SESSION }, { configDir, dataDir })
  assert.match(result.reason, /plan mode/i)
})

test('launchRefusal reports time, cost and quota stops in a Lead session, finds the run from a linked worktree, and returns null outside a Lead session or outside git', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const { configDir } = setup(t, {
    [SESSION]: [human(QUOTE, '2026-04-06T10:00:01.000Z')],
  })
  // The runs live in the main checkout of a real repository, and a linked worktree is another path into it.
  const repo = makeRepo(t)
  const mainRoot = repo.dir
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'linked/x', linked)
  markSession(dataDir, SESSION, 1000, { repo: mainRoot, claude: null })

  const t0 = Date.parse('2026-04-06T10:00:05.000Z')
  assert.equal(autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: t0 }), null)
  const started = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 1, usd: 5 },
    { configDir, dataDir, now: t0 }
  )
  assert.equal(started.ok, true)
  assert.equal(autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: t0 + 1000 }), null)

  // Time ceiling
  const byTime = autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: t0 + 3601 * 1000 })
  assert.equal(byTime.stop, 'time')
  assert.equal(byTime.id, started.run.id)
  assert.deepEqual(byTime, {
    stop: 'time', id: started.run.id,
    hours: { elapsed: 1, ceiling: 1, paused: 0 },
    usd: { spent: 0, ceiling: 5 },
    quota: { paused: false, brakeOff: false, resetsAt: null, resumeAt: null, percentUsed: null },
    message: `autonomous run ${started.run.id} reached its time ceiling (1h / 1h); close it with: aether-autonomy end --outcome ceiling`,
  })

  // From a linked worktree the run of the main checkout is found all the same
  const fromLinked = autonomy.launchRefusal(linked, { session: SESSION, dataDir, now: t0 + 3601 * 1000 })
  assert.equal(fromLinked.stop, 'time')
  assert.equal(fromLinked.id, started.run.id)
  const subdir = path.join(mainRoot, 'nested')
  fs.mkdirSync(subdir)
  assert.deepEqual(autonomy.launchRefusal(subdir, { session: SESSION, dataDir, now: t0 + 3601 * 1000 }), byTime)

  // Non-Lead session is not refused even when ceiling is reached
  assert.equal(autonomy.launchRefusal(mainRoot, { session: 'plain-session', dataDir, now: t0 + 3601 * 1000 }), null)

  // Outside a git repository there is no run to refuse
  assert.equal(autonomy.launchRefusal(tempDir(t, 'aether-nogit-'), { session: SESSION, dataDir, now: t0 + 3601 * 1000 }), null)

  // Quota pause
  const resetsAt = new Date(t0 + 4 * 3600 * 1000).toISOString()
  autonomy.recordCrossing(
    mainRoot,
    { kind: 'five_hour', percentUsed: 80, resetsAt, threshold: 80 },
    { now: t0 + 2000, dataDir }
  )
  const byQuota = autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: t0 + 3000 })
  assert.equal(byQuota.stop, 'quota')
  assert.equal(byQuota.id, started.run.id)
  const quotaStatus = autonomy.status(mainRoot, { now: t0 + 3000 })
  assert.deepEqual(byQuota, {
    stop: 'quota', id: started.run.id,
    hours: quotaStatus.hours, usd: { spent: 0, ceiling: 5 },
    quota: { paused: true, brakeOff: false, resetsAt, resumeAt: quotaStatus.quota.resumeAt, percentUsed: 80 },
    message: `autonomous run ${started.run.id} is paused by the quota brake (80% used; resumeAt ${quotaStatus.quota.resumeAt}); wait until ${quotaStatus.quota.resumeAt} or close the run with: aether-autonomy end --outcome incomplete`,
  })

  // Spend ceiling (in a fresh run with a 10-hour ceiling)
  autonomy.end(mainRoot, 'incomplete', { now: t0 + 4000 })
  const startedCost = autonomy.start(
    mainRoot,
    { quote: QUOTE, session: SESSION, hours: 10, usd: 5 },
    { configDir, dataDir, now: t0 + 5000 }
  )
  assert.equal(startedCost.ok, true)
  autonomy.spend(mainRoot, 5, 'u1', { now: t0 + 6000 })
  const byCost = autonomy.launchRefusal(linked, { session: SESSION, dataDir, now: t0 + 7000 })
  assert.equal(byCost.stop, 'cost')
  assert.equal(byCost.id, startedCost.run.id)
  assert.deepEqual(byCost, {
    stop: 'cost', id: startedCost.run.id,
    hours: { elapsed: 0, ceiling: 10, paused: 0 },
    usd: { spent: 5, ceiling: 5 },
    quota: { paused: false, brakeOff: false, resetsAt: null, resumeAt: null, percentUsed: null },
    message: `autonomous run ${startedCost.run.id} reached its spend ceiling ($5 / $5); close it with: aether-autonomy end --outcome ceiling`,
  })
  autonomy.end(mainRoot, 'ceiling', { now: t0 + 8000 })
  assert.equal(autonomy.launchRefusal(mainRoot, { session: SESSION, dataDir, now: t0 + 9000 }), null)
})

test('interactive authorization handles transcript edge cases and runs from another session', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const { configDir, mainRoot, transcript } = setup(t, {
    [SESSION]: [human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' })],
    [OTHER]: [human(QUOTE, '2026-04-06T10:00:01.000Z')],
  })
  markSession(dataDir, SESSION, 1000, { repo: mainRoot, claude: null })
  const start = (session = SESSION, now = Date.parse('2026-04-06T10:00:05.000Z')) =>
    autonomy.start(mainRoot, { quote: QUOTE, session, hours: 2 }, { configDir, dataDir, now })
  const owner = human(QUOTE, '2026-04-06T10:00:01.000Z', { entrypoint: 'cli' })
  const reason = 'interactive session requires an approved plan in plan mode (ExitPlanMode) before starting an autonomous run; present the plan in plan mode and wait for the owner to approve it before running aether-autonomy start'
  const invalid = JSON.parse(planResult('p1'))
  invalid.message.content[0].content = 'prefix User has approved your plan.'
  for (const content of [invalid.message.content[0].content, [{ type: 'text', text: invalid.message.content[0].content }], [{ type: 'image', text: 'User has approved your plan.' }]]) {
    invalid.message.content[0].content = content
    fs.writeFileSync(transcript(SESSION), [owner, planUse('p1'), JSON.stringify(invalid)].join('\n'))
    assert.deepEqual(start(), { ok: false, reason })
  }
  fs.writeFileSync(transcript(SESSION), [owner, '{invalid json', planUse('p1'), planResult('p1')].join('\n'))
  assert.equal(start(OTHER).ok, true)
  autonomy.end(mainRoot, 'done', { now: Date.parse('2026-04-06T10:01:00.000Z') })
  assert.equal(start(SESSION, Date.parse('2026-04-06T10:02:00.000Z')).ok, true)
  autonomy.end(mainRoot, 'done', { now: Date.parse('2026-04-06T10:03:00.000Z') })

  fs.writeFileSync(transcript(SESSION), [human(QUOTE, '2026-04-06T10:00:01.000Z'), JSON.stringify({ type: 'system' }), JSON.stringify({ entrypoint: 42 })].join('\n'))
  assert.equal(start(SESSION, Date.parse('2026-04-06T10:04:00.000Z')).ok, true)
  autonomy.end(mainRoot, 'done', { now: Date.parse('2026-04-06T10:05:00.000Z') })
  fs.rmSync(transcript(SESSION))
  assert.equal(start().ok, false)
  fs.mkdirSync(transcript(SESSION))
  assert.equal(start().ok, false)
})

test('launchRefusal propagates operational git errors', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const repo = tempDir(t, 'aether-git-error-')
  markSession(dataDir, SESSION, 1000, { repo, claude: null })
  const childProcess = require('node:child_process')
  const original = childProcess.spawnSync
  const gitPath = require.resolve('../plugins/aether/lib/git.js')
  const autonomyPath = require.resolve('../plugins/aether/lib/autonomy.js')
  const gitModule = require.cache[gitPath]
  const autonomyModule = require.cache[autonomyPath]
  try {
    childProcess.spawnSync = () => ({ error: Object.assign(new Error('git spawn denied'), { code: 'EPERM' }) })
    delete require.cache[gitPath]
    delete require.cache[autonomyPath]
    const isolated = require(autonomyPath)
    assert.throws(() => isolated.launchRefusal(repo, { session: SESSION, dataDir }), { code: 'EPERM' })
  } finally {
    childProcess.spawnSync = original
    require.cache[gitPath] = gitModule
    require.cache[autonomyPath] = autonomyModule
  }
})


test('launchRefusal recognizes non-repository errors in a localized Git environment', (t) => {
  const dataDir = useDataDir(t)
  const { markSession } = require('../plugins/aether/lib/session.js')
  const cwd = tempDir(t, 'aether-localized-git-')
  markSession(dataDir, SESSION, 1000, { repo: cwd, claude: null })
  const childProcess = require('node:child_process')
  const original = childProcess.spawnSync
  const gitPath = require.resolve('../plugins/aether/lib/git.js')
  const autonomyPath = require.resolve('../plugins/aether/lib/autonomy.js')
  const gitModule = require.cache[gitPath]
  const autonomyModule = require.cache[autonomyPath]
  try {
    childProcess.spawnSync = (command, args, options) => {
      if (options.env && options.env.LC_ALL === 'C') {
        assert.equal(command, 'git')
        assert.deepEqual(args, ['rev-parse', '--show-toplevel'])
        assert.equal(options.cwd, cwd)
        return { status: 128, stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git' }
      }
      return { status: 128, stdout: '', stderr: 'fatal: no es un repositorio git (ni ninguno de los directorios superiores): .git' }
    }
    delete require.cache[gitPath]
    delete require.cache[autonomyPath]
    const isolated = require(autonomyPath)
    assert.equal(isolated.launchRefusal(cwd, { session: SESSION, dataDir }), null)
  } finally {
    childProcess.spawnSync = original
    require.cache[gitPath] = gitModule
    require.cache[autonomyPath] = autonomyModule
  }
})
