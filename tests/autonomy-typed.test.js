'use strict'

// An authorization for an irreversible action, a trusted skill author and the quota brake are recorded only from words
// typed in a session with a terminal: a transcript record whose entrypoint is `cli` (spec 034). Starting a run, withdrawing
// an authorization and placing a delegate on a model verify a quote as they did before.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { tempDir } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const auth = require('../plugins/aether/lib/delegate-authorize.js')

const SESSION = 'sess-typed-1'
const OTHER = 'sess-typed-2'
const T0 = Date.parse('2026-11-11T10:00:00.000Z')
const TIME = '2026-11-11T09:00:00.000Z'
const HOURS = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const MERGE = 'apruebo merge a main en esta ocasion y en todas las futuras ocasiones'
const TRUST = 'confio en anthropics como autor de skills'
const UNLIMITED = 'sigue hasta acabar aunque se acabe la cuota'
const REVOKE = 'ya no fusiones a main sin preguntarme'
const SONNET = 'pásalo a Sonnet para esto, por favor'
const REFUSED = 'this quote is not in words typed in a session with a terminal: record it in a session with a terminal'

// A transcript record of the owner's message. entrypoint is set only when given; origin only when origin is true.
function record(text, { entrypoint, origin = true, time = TIME } = {}) {
  const r = { type: 'user', isSidechain: false, timestamp: time, message: { role: 'user', content: text } }
  if (origin) r.origin = { kind: 'human' }
  if (entrypoint !== undefined) r.entrypoint = entrypoint
  return JSON.stringify(r)
}
const typed = (text, time = TIME) => record(text, { entrypoint: 'cli', time })
const untyped = (text, time = TIME) => record(text, { entrypoint: 'sdk-cli', time })

// A Claude config directory with the session's transcript, an empty main checkout and an empty data directory.
function world(t, lines, session = SESSION) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, `${session}.jsonl`)
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return { configDir, file, mainRoot: tempDir(t, 'aether-repo-'), dataDir: tempDir(t, 'aether-data-') }
}

const grantsFile = (mainRoot) => path.join(mainRoot, '.aether', 'autonomy', 'grants.json')
const trustedFile = (dataDir) => path.join(dataDir, 'skills', 'trusted.json')
const runJson = (mainRoot, id) => JSON.parse(fs.readFileSync(autonomy.runPaths(mainRoot, id).runFile, 'utf8'))

// Opens the run that brake-off reaches, from HOURS (starting a run is not a typed-only command).
function openRun(w) {
  const r = autonomy.start(w.mainRoot, { quote: HOURS, session: SESSION }, { configDir: w.configDir, dataDir: w.dataDir, now: T0 })
  assert.equal(r.ok, true, r.reason)
  return r.run
}

const recordedThreeWays = (w, quotes, run) => ({
  grant: autonomy.grant(w.mainRoot, { class: 'merge-main', quote: quotes.merge, session: SESSION }, { configDir: w.configDir, now: T0 }),
  trust: autonomy.trustAuthor(w.dataDir, { author: 'anthropics', quote: quotes.trust, session: SESSION }, { configDir: w.configDir, now: T0 }),
  brake: autonomy.brakeOff(w.mainRoot, { quote: quotes.unlimited, session: SESSION }, { configDir: w.configDir, now: T0 }),
  run,
})

const ALL = { merge: MERGE, trust: TRUST, unlimited: UNLIMITED }

test('words that were not typed do not record a grant, a trusted author or a brake-off, and write nothing (test 1)', (t) => {
  for (const origin of [true, false]) {
    const w = world(t, [HOURS, MERGE, TRUST, UNLIMITED].map((text) => record(text, { entrypoint: 'sdk-cli', origin })))
    const run = openRun(w)
    const r = recordedThreeWays(w, ALL, run)
    assert.deepEqual(r.grant, { ok: false, reason: REFUSED }, `origin ${origin}`)
    assert.deepEqual(r.trust, { ok: false, reason: REFUSED }, `origin ${origin}`)
    assert.deepEqual(r.brake, { ok: false, reason: REFUSED }, `origin ${origin}`)
    assert.equal(fs.existsSync(grantsFile(w.mainRoot)), false, 'grants.json stays absent')
    assert.equal(fs.existsSync(trustedFile(w.dataDir)), false, 'trusted.json stays absent')
    assert.equal(runJson(w.mainRoot, run.id).brakeOff, null, 'the open run keeps its brake')
  }
})

test('the same words typed in a session with a terminal record all three, and other records do not (test 2)', (t) => {
  const typedWorld = world(t, [HOURS, MERGE, TRUST, UNLIMITED].map((text) => typed(text)))
  const run = openRun(typedWorld)
  const r = recordedThreeWays(typedWorld, ALL, run)
  assert.equal(r.grant.ok, true, r.grant.reason)
  assert.equal(r.trust.ok, true, r.trust.reason)
  assert.equal(r.brake.ok, true, r.brake.reason)
  assert.equal(runJson(typedWorld.mainRoot, run.id).brakeOff.quote, UNLIMITED)

  for (const extra of [{}, { entrypoint: 'desktop' }, { entrypoint: 'sdk-ts' }, { entrypoint: 42 }]) {
    const lines = [HOURS, MERGE, TRUST, UNLIMITED].map((text) => record(text, { ...extra, origin: true }))
    const w = world(t, lines)
    const opened = openRun(w)
    const refused = recordedThreeWays(w, ALL, opened)
    assert.deepEqual(refused.grant, { ok: false, reason: REFUSED }, JSON.stringify(extra))
    assert.deepEqual(refused.trust, { ok: false, reason: REFUSED }, JSON.stringify(extra))
    assert.deepEqual(refused.brake, { ok: false, reason: REFUSED }, JSON.stringify(extra))
  }
})

test('a typed message that does not hold the quote does not count, and a typed one that does is taken with its time (test 3)', (t) => {
  const refused = world(t, [typed(HOURS), untyped(MERGE, '2026-11-11T09:00:00.000Z'), typed('otra cosa que no es la cita', '2026-11-11T09:05:00.000Z')])
  assert.deepEqual(autonomy.grant(refused.mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION }, { configDir: refused.configDir }), { ok: false, reason: REFUSED })

  const accepted = world(t, [typed(HOURS), untyped(MERGE, '2026-11-11T09:00:00.000Z'), typed(MERGE, '2026-11-11T09:05:00.000Z')])
  const r = autonomy.grant(accepted.mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION }, { configDir: accepted.configDir })
  assert.equal(r.ok, true, r.reason)
  assert.equal(r.grant.time, '2026-11-11T09:05:00.000Z')
})

test('start, revoke, trust --remove and delegate-authorize accept a quote that is not typed, as before (test 4)', (t) => {
  const w = world(t, [untyped(HOURS), untyped(REVOKE), untyped(TRUST), untyped(SONNET)])
  assert.equal(autonomy.start(w.mainRoot, { quote: HOURS, session: SESSION }, { configDir: w.configDir, dataDir: w.dataDir, now: T0 }).ok, true)

  assert.equal(autonomy.revoke(w.mainRoot, { class: 'merge-main', quote: REVOKE, session: SESSION }, { configDir: w.configDir, now: T0 }).ok, true)

  fs.mkdirSync(path.dirname(trustedFile(w.dataDir)), { recursive: true })
  fs.writeFileSync(trustedFile(w.dataDir), JSON.stringify({ authors: ['anthropics'], log: [] }))
  assert.deepEqual(autonomy.trustAuthor(w.dataDir, { author: 'anthropics', quote: TRUST, session: SESSION, remove: true }, { configDir: w.configDir }), { ok: true, authors: [] })

  const delegated = auth.authorize({ session: SESSION, model: 'sonnet', quote: SONNET, task: 'p4' }, { dataDir: w.dataDir, configDir: w.configDir, now: () => 500 })
  assert.equal(delegated.ok, true, delegated.error)
})

test('a stored grant whose quote is only in words that were not typed covers nothing, and is listed as not-typed (test 5)', (t) => {
  const w = world(t, [typed(MERGE)])
  const granted = autonomy.grant(w.mainRoot, { class: 'merge-main', quote: MERGE, session: SESSION }, { configDir: w.configDir, now: T0 })
  assert.equal(granted.ok, true, granted.reason)

  // The same session's words are now a session without a terminal.
  fs.writeFileSync(w.file, untyped(MERGE) + '\n')
  assert.equal(autonomy.check(w.mainRoot, 'merge-main', { configDir: w.configDir, session: SESSION }), null)
  assert.equal(autonomy.check(w.mainRoot, 'merge-main', { configDir: w.configDir, session: OTHER }), null)
  assert.deepEqual(autonomy.list(w.mainRoot, { configDir: w.configDir }).grants.map((g) => [g.class, g.status]), [['merge-main', 'not-typed']])

  // The registry is readable, so quarantine refuses it.
  const quarantined = autonomy.quarantine(w.mainRoot, { target: 'grants' })
  assert.deepEqual(quarantined, { ok: false, reason: 'grants.json is readable; use aether-autonomy grant, revoke and end' })
  assert.equal(fs.existsSync(grantsFile(w.mainRoot)), true)

  // Without its transcript the grant is returned, as today.
  fs.rmSync(w.file)
  assert.equal(autonomy.check(w.mainRoot, 'merge-main', { configDir: w.configDir }).status, 'transcript-gone')

  // revoke --all with a quote of the current session removes every grant of the class.
  fs.writeFileSync(w.file, untyped(REVOKE) + '\n')
  const revoked = autonomy.revoke(w.mainRoot, { class: 'merge-main', quote: REVOKE, session: SESSION, all: true }, { configDir: w.configDir, now: T0 })
  assert.equal(revoked.ok, true, revoked.reason)
  assert.equal(revoked.revocation.removed, 1)
  assert.equal(autonomy.check(w.mainRoot, 'merge-main', { configDir: w.configDir }), null)
})
