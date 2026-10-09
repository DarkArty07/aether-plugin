# The Lead's autonomy: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Aether mode.** Every task suits the swarm. Wave 1 is Tasks 1, 3, 4, 5, 6, 7 and 9; wave 2 is Tasks 2 and 8, which use Task 1's library. This is a contract plan (A10): the code tasks give the interfaces, the failing tests in full and the acceptance, and the implementer writes the code. The text tasks give the exact text, because the text is the requirement.

**Goal:** Make the Lead the owner's delegate: it decides the Designer's rounds with the owner's intent, never asks again for what the owner authorized, and with the owner's permission works for hours within ceilings and ends with a brief.

**Architecture:**
- **`lib/autonomy.js`** holds the irreversible classes, quote verification against the owner's transcript (through `lib/voice.js`), the per-repository registry of grants, and an autonomous run's state and ceilings.
- **`bin/aether-autonomy`** is its CLI. **`config/autonomy.json`** holds the default ceilings.
- **`aether-guard`** protects the registry and the run states; **`aether-session-start`** points a new Lead to an open run. No new hook.
- **Text:** the Designer's reply gains `Decide` (and the lane schema with it); the Lead's skill replaces the relay with "Deciding with the Designer", fallbacks and autonomous runs; the swarm skill follows; the docs drop the per-stage gates.

**Tech Stack:** Node.js 22, CommonJS, `node:test`, no dependencies. Claude Code plugin agents, skills and hooks.

**Spec:** `docs/superpowers/specs/2026-10-09-lead-autonomy-design.md`

## Global Constraints

- **Code:** Node.js 22 with no dependencies; bins and libs are CommonJS and start with `'use strict'`; each bin starts with `#!/usr/bin/env node` and is executable (git mode `100755`), like the existing bins.
- **Names:** the bin is `plugins/aether/bin/aether-autonomy`, the library `plugins/aether/lib/autonomy.js`, the config `plugins/aether/config/autonomy.json`.
- **The irreversible classes, in this order:** `merge-main`, `push`, `publish`, `deploy`, `delete`, `credentials`, `paid-call`.
- **Files:** the main checkout is `repoPaths(cwd).mainRoot` from `plugins/aether/lib/git.js`. The registry is `<mainRoot>/.aether/autonomy/grants.json`; a run lives in `<mainRoot>/.aether/autonomy/<run id>/` with `run.json`, `diary.md` and `brief.md`.
- **CLI output:** one JSON line on stdout. Exit 0: ok or covered. Exit 2: a quote not verified, or a class not covered. Exit 1: any error, printed as `{ "error": "<message>" }`.
- **Hooks:** `plugins/aether/hooks/hooks.json` does not change.
- **Version:** the plugin becomes 0.5.0.
- **Language:** documents and code are in English. The diary skeleton and the brief template are in Spanish, exactly as given.
- **Specs and plans:** no task owns a file under `docs/superpowers/`.
- **Phrases other tests pin** (keep them): the using-aether skill keeps `aether-lane design start --session`, `aether-lane design reply`, `aether-lane design end`, `**Exit 3**` and `SendMessage`; the swarm skill keeps `You stay the Lead`, `ask the Designer to fix the plan task`, `--no-lanes`, `laneFailure`, `` `aether-lane` `` and `Blocked by a lane`.
- **Final check, by the Lead after the swarm:** `npm run check` (the tests, `claude plugin test` and `claude plugin validate --strict`).

## Review Focus

1. **A long session's transcript** (tens of megabytes) must not make `check` or `list` slow: each transcript is read at most once per command, however many grants cite it. Task 1, by inspection.
2. **A crash in the middle of a write** must never leave a torn `grants.json` or `run.json`: writes go to a temporary file and are renamed. Task 1, by inspection.
3. **A quote typed differently** (accents in decomposed form, line breaks, other spacing or case) must still match the owner's words. Pinned in Task 1.
4. **A Lead working in a linked worktree** must reach the same registry as one in the main checkout. Pinned in Task 2 (the CLI) and Task 8 (the session-start note).
5. **Broken autonomy files** must never block a session or count as an empty registry: session start leaves the note out, and the CLI exits 1 naming the file. Pinned in Tasks 1, 2 and 8.

## Aether Execution
- Test command: `npm test`
- Ladder: haiku 2, sonnet 2, opus 1
- Max agents: 60

## Tasks

### Task 1: `lib/autonomy.js`, the registry and the run state

**Aether:**
- Tier: opus high — an authorization check (security) whose behavior the exact tests pin down
- Review: xhigh — quote matching, the file system and an authorization check, beyond what the tests list
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `plugins/aether/config/autonomy.json`, `tests/autonomy.test.js`
- Depends on: none

**Files:**
- Create: `plugins/aether/lib/autonomy.js`
- Create: `plugins/aether/config/autonomy.json`
- Test: `tests/autonomy.test.js`

**Interfaces:**
- Consumes:
  - `ownerMessages(lines: string[], { maxChars }): Array<{ time: string, text: string }>` and `findTranscript(sessionId: string, { configDir }): string | null` from `plugins/aether/lib/voice.js`;
  - `newRunId(now: Date): string` (`YYYYMMDD-HHMMSS-xxxx`) from `plugins/aether/lib/run.js`;
  - `tempDir(t, prefix)` and `PLUGIN` from `tests/helpers.js`.
- Produces (`module.exports` of `plugins/aether/lib/autonomy.js`), used by Tasks 2 and 8:
  - `CLASSES: string[]`, `SCOPES = ['repo', 'session']`, `OUTCOMES = ['done', 'ceiling', 'incomplete']`, `MIN_QUOTE = 12`;
  - `normalize(text: string): string`;
  - `findQuote(lines: string[], quote: string): { time: string, text: string } | null`;
  - `verifyQuote(sessionId: string, quote: string, { configDir } = {}): { ok: true, time: string } | { ok: false, reason: string }`;
  - `autonomyDir(mainRoot: string): string`;
  - `runPaths(mainRoot: string, id: string): { dir, runFile, diary, brief }`;
  - `loadCeilings(): { hours: number, usd: number }`;
  - `readGrants(mainRoot): { grants: Grant[], revoked: Revocation[] }`;
  - `grant(mainRoot, { class, quote, session, scope = 'repo' }, { configDir, now = Date.now() } = {}): { ok: true, grant: Grant } | { ok: false, reason: string }`;
  - `revoke(mainRoot, { class, quote, session }, { configDir, now = Date.now() } = {}): { ok: true, revocation: Revocation } | { ok: false, reason: string }`;
  - `check(mainRoot, cls: string, { session = null, configDir } = {}): (Grant & { status }) | null`;
  - `list(mainRoot, { configDir } = {}): { grants: Array<Grant & { status }>, revoked: Revocation[] }`;
  - `openRun(mainRoot): Run | null`;
  - `start(mainRoot, { quote, session, hours = null, usd = null }, { configDir, now = Date.now() } = {}): { ok: true, run: Run, runFile: string, diary: string } | { ok: false, reason: string }`;
  - `spend(mainRoot, usd: number, source: string, { now = Date.now() } = {}): Status`;
  - `status(mainRoot, { now = Date.now() } = {}): Status | { open: false }`;
  - `end(mainRoot, outcome: string, { now = Date.now() } = {}): Run`.
- Types:
  - `Grant = { class, scope, quote, session, time, added }`: `time` is the timestamp of the owner's message holding the quote; `added` is `new Date(now).toISOString()`.
  - `Revocation = { class, quote, session, time, added, removed }`: `removed` is the number of grants it took away.
  - `status` of a grant: `'verified' | 'transcript-gone' | 'invalid'`.
  - `Run = { id, session, quote, quoteTime, started, ceilings: { hours, usd, source: { hours, usd } }, spend: Array<{ source, usd, at }>, ended: string | null, outcome: string | null }`, with each `source` `'owner'` or `'default'`.
  - `Status = { open: true, id, diary, session, started, hours: { elapsed, ceiling }, usd: { spent, ceiling }, stop: null | 'time' | 'cost' }`.

**Rules:**
- **Classes:** `CLASSES` is exactly `['merge-main', 'push', 'publish', 'deploy', 'delete', 'credentials', 'paid-call']`. A class outside it throws `unknown class: <class>`; a scope outside `SCOPES` throws `unknown scope: <scope>`; an outcome outside `OUTCOMES` throws `unknown outcome: <outcome>`.
- **`normalize`:** `String(text).normalize('NFC')`, every run of whitespace folded to one space, trimmed, lower case.
- **`findQuote`:** the first message of `ownerMessages(lines, { maxChars: Infinity })` whose normalized text includes the normalized quote, as `{ time, text }` (the message's own time and text); else `null`.
- **`verifyQuote`,** in this order:
  1. the normalized quote has fewer than `MIN_QUOTE` characters (code points): `{ ok: false, reason: 'the quote must have at least 12 characters' }`;
  2. `findTranscript(sessionId, { configDir })` gives `null`, or the file cannot be read: `{ ok: false, reason: 'no transcript for session <id>' }`;
  3. `findQuote` on the file's lines (`text.split('\n')`) gives `null`: `{ ok: false, reason: "the quote is not in the owner's messages of session <id>" }`;
  4. otherwise `{ ok: true, time }`.
- **Paths:** `autonomyDir(mainRoot)` is `<mainRoot>/.aether/autonomy`. `runPaths(mainRoot, id)` is `{ dir: <autonomyDir>/<id>, runFile: <dir>/run.json, diary: <dir>/diary.md, brief: <dir>/brief.md }`.
- **`loadCeilings`** reads `plugins/aether/config/autonomy.json` (`path.join(__dirname, '..', 'config', 'autonomy.json')`), which holds exactly `{ "hours": 8, "usd": 50 }`.
- **Reading JSON files:** a missing `grants.json` is `{ grants: [], revoked: [] }`. A `grants.json` or `run.json` that does not parse, or a `grants.json` without the two arrays, throws `cannot read <absolute file>: <reason>`. Nothing that cannot be read is treated as empty.
- **Writing JSON files:** create the directory, write `JSON.stringify(value, null, 2) + '\n'` to `<file>.<pid>.tmp`, then rename it onto the file.
- **`grant`:** check the class and the scope; read the registry; verify the quote; on failure return `{ ok: false, reason }` and write nothing; otherwise append the grant, write the registry and return `{ ok: true, grant }`.
- **`revoke`:** check the class; read the registry; verify the quote (failure: `{ ok: false, reason }`, nothing written); remove every grant of the class, of both scopes; append `{ class, quote, session, time, added, removed }` to `revoked` (with `removed: 0` when there was none); write; return `{ ok: true, revocation }`.
- **A grant's status:** `verifyQuote(grant.session, grant.quote, { configDir })`: ok is `verified`; the reason `no transcript for session …` is `transcript-gone`; any other failure is `invalid`. Within one call of `check` or `list`, each session's transcript is read at most once.
- **`check`:** check the class; among the grants of that class that are `repo`, or `session` with `grant.session === session`, take the most recent (the last in the array) whose status is not `invalid`, and return it with its `status`; else `null`.
- **`list`:** every grant with its `status`, in registry order, and `revoked` as stored.
- **`openRun`:** `null` when `autonomyDir` does not exist. Otherwise, over its subdirectories in name order that hold a `run.json` (files such as `grants.json` are skipped), the last run whose `ended` is `null`; else `null`.
- **`start`,** in this order:
  1. `hours` and `usd`: `null` or `undefined` takes the default from `loadCeilings()`, with source `'default'`; any other value must be a number, finite and above 0, with source `'owner'`, else throw `invalid ceiling: <value>`;
  2. an open run throws `run <id> is already open`;
  3. verify the quote; on failure return `{ ok: false, reason }` and write nothing;
  4. the id is `` `auto-${newRunId(new Date(now))}` ``; write `run.json` with `started: new Date(now).toISOString()`, `quoteTime` the time `verifyQuote` gave, `spend: []`, `ended: null`, `outcome: null`;
  5. write the diary skeleton (below) and return `{ ok: true, run, runFile, diary }`.
- **The diary skeleton,** the lines below joined with `\n`, ending with one `\n`. `<source>` is `del dueño` for `'owner'` and `por defecto` for `'default'`:

  ```text
  # Corrida <id>

  ## Intención

  > <quote>
  — permiso del dueño, <quoteTime>

  ## Topes

  - Horas: <hours> (<source>)
  - USD: <usd> (<source>)

  ## Decisiones

  ## Descubrimientos

  ## Espera tu sí

  ## Propuestas

  ## Estado
  ```

- **`status`:** `{ open: false }` without an open run. Otherwise `elapsed` is `(now - Date.parse(started)) / 3600000` and `spent` the sum of the spend amounts, each rounded to 2 decimals (`Math.round(x * 100) / 100`); `stop` is `'time'` when `elapsed >= ceilings.hours`, else `'cost'` when `spent >= ceilings.usd`, else `null`. `diary` is `runPaths(mainRoot, id).diary`.
- **`spend`,** in this order: `usd` must be a finite number of 0 or more, else throw `invalid spend: <value>`; `source` must be a non-empty string, else throw `a spend needs a source`; without an open run throw `no open run`. An entry with the same `source` is replaced in place by `{ source, usd, at: new Date(now).toISOString() }`; otherwise the entry is appended. Write `run.json` and return `status(mainRoot, { now })`.
- **`end`:** check the outcome; without an open run throw `no open run`; set `ended` to `new Date(now).toISOString()` and `outcome`; write `run.json`; return the run.

- [ ] **Step 1: Write the failing tests** in `tests/autonomy.test.js`:

```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/autonomy.test.js`
Expected: FAIL with `Cannot find module '../plugins/aether/lib/autonomy.js'`.

- [ ] **Step 3: Write `plugins/aether/config/autonomy.json`** with exactly:

```json
{ "hours": 8, "usd": 50 }
```

- [ ] **Step 4: Write `plugins/aether/lib/autonomy.js`** to the Interfaces and Rules above. Start it with a comment that says what it holds: the owner's standing authorizations, verified against their own words, and an autonomous run's state and ceilings.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/autonomy.test.js`, then `npm test`
Expected: PASS, and the whole suite stays green.

- [ ] **Step 6: Commit**

```bash
git add plugins/aether/lib/autonomy.js plugins/aether/config/autonomy.json tests/autonomy.test.js
git commit -m "feat(aether): record the owner's standing authorizations and an autonomous run's state"
```

**Acceptance:** the tests pass; the module touches only `.aether/autonomy/` under the given main checkout and reads transcripts; it starts no process.

### Task 2: `aether-autonomy`, the CLI

**Aether:**
- Tier: haiku — a CLI over Task 1's library, with an exact test for each exit code
- Review: xhigh — argument parsing and error paths beyond the listed cases
- Area: autonomy
- Owns: `plugins/aether/bin/aether-autonomy`, `tests/aether-autonomy.test.js`
- Depends on: Task 1 — the CLI calls `lib/autonomy.js`

**Files:**
- Create: `plugins/aether/bin/aether-autonomy` (executable, git mode `100755`)
- Test: `tests/aether-autonomy.test.js`

**Interfaces:**
- Consumes: Task 1's exports (`CLASSES`, `grant`, `revoke`, `check`, `list`, `start`, `spend`, `status`, `end`); `repoPaths(cwd)` from `plugins/aether/lib/git.js`; `ensureExcluded(gitCommonDir)` from `plugins/aether/lib/run.js`; `PLUGIN`, `makeRepo`, `tempDir`, `runBin` from `tests/helpers.js`.
- Produces: the command lines that the skills (Tasks 6 and 7) use:

      aether-autonomy grant  --class <class> --quote <text> [--session <id>] [--scope repo|session]
      aether-autonomy revoke --class <class> --quote <text> [--session <id>]
      aether-autonomy check  <class> [--session <id>]
      aether-autonomy list
      aether-autonomy start  --quote <text> [--session <id>] [--hours N] [--usd N]
      aether-autonomy spend  <usd> --source <label>
      aether-autonomy status
      aether-autonomy end    --outcome done|ceiling|incomplete

**Rules:**
- **The usage text**, printed as `{ "error": USAGE }` with exit 1 for no subcommand, an unknown one, or a missing required argument:

  ```text
  usage: aether-autonomy grant --class <class> --quote <text> [--session <id>] [--scope repo|session] | revoke --class <class> --quote <text> [--session <id>] | check <class> [--session <id>] | list | start --quote <text> [--session <id>] [--hours N] [--usd N] | spend <usd> --source <label> | status | end --outcome done|ceiling|incomplete
  ```

- **Flags:** a flag's value is the next argument. A flag followed by nothing, or by an argument that starts with `--`, throws `<flag> needs a value`. Required: `--class` and `--quote` for `grant` and `revoke`; `--quote` for `start`; `--source` for `spend`; `--outcome` for `end`. `check` needs its class and `spend` its amount as the argument right after the subcommand, one that does not start with `--`.
- **Numbers:** `--hours`, `--usd` and the spend amount go through `Number()`. An empty value or one that is not finite throws `invalid ceiling: <raw>` (`--hours`, `--usd`) or `invalid spend: <raw>` (the amount). Task 1 checks the rest (above 0, or 0 or more).
- **The session:** `--session`, or else `CLAUDE_CODE_SESSION_ID`; an empty value counts as none. `grant`, `revoke` and `start` without one throw `no session id; pass --session <id> or set CLAUDE_CODE_SESSION_ID`, after the required flags are checked. `check` without one passes `session: null`.
- **The repository:** `const { mainRoot, gitCommonDir } = repoPaths(process.cwd())`. `grant`, `revoke` and `start` call `ensureExcluded(gitCommonDir)` before they write.
- **Output and exit codes,** one JSON line on stdout:
  - `grant`: `{ "granted": <grant> }`, exit 0;
  - `revoke`: `{ "revoked": <revocation> }`, exit 0;
  - `grant`, `revoke` or `start` whose quote fails: `{ "verified": false, "reason": "<reason>" }`, exit 2;
  - `check`: `{ "covered": true, "class": <class>, "grant": <grant with status> }`, exit 0; or `{ "covered": false, "class": <class> }`, exit 2;
  - `list`: `{ "grants": [...], "revoked": [...] }`, exit 0;
  - `start`: `{ "started": { "id", "runFile", "diary", "ceilings" } }`, exit 0;
  - `spend` and `status`: the status object, exit 0;
  - `end`: `{ "ended": <run> }`, exit 0;
  - anything thrown: `{ "error": "<message>" }`, exit 1.

- [ ] **Step 1: Write the failing tests** in `tests/aether-autonomy.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin } = require('./helpers.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')
const SESSION = 'sess-cli-1'
const MERGE = 'apruebo merge a main en todas las futuras ocasiones'
const HOURS = 'trabaja por horas y no cuentes conmigo hasta acabar'
const REVOKE = 'ya no fusiones a main sin preguntarme'
const USAGE =
  'usage: aether-autonomy grant --class <class> --quote <text> [--session <id>] [--scope repo|session] | revoke --class <class> --quote <text> [--session <id>] | check <class> [--session <id>] | list | start --quote <text> [--session <id>] [--hours N] [--usd N] | spend <usd> --source <label> | status | end --outcome done|ceiling|incomplete'

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, timestamp: time, message: { role: 'user', content: text } })

// A repository on a feature branch, and a Claude config directory holding the owner's transcript.
function setup(t) {
  const repo = makeRepo(t)
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  const lines = [human(MERGE, '2026-10-09T19:32:31.611Z'), human(HOURS, '2026-10-09T19:50:00.000Z'), human(REVOKE, '2026-10-09T21:00:00.000Z')]
  fs.writeFileSync(path.join(folder, `${SESSION}.jsonl`), lines.join('\n') + '\n')
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: SESSION }
  const cli = (args, cwd = repo.dir, extra = {}) => runBin(BIN, args, cwd, { ...env, ...extra })
  return { repo, cli }
}

test('the bin is executable, and a bare or unknown command prints the usage', (t) => {
  assert.ok(fs.statSync(BIN).mode & 0o111)
  const { cli } = setup(t)
  for (const args of [[], ['nope']]) {
    const r = cli(args)
    assert.equal(r.status, 1, args.join(' '))
    assert.deepEqual(r.json, { error: USAGE })
  }
})

test("grant records the owner's words, and check covers the class from any worktree of the repository", (t) => {
  const { repo, cli } = setup(t)
  const g = cli(['grant', '--class', 'merge-main', '--quote', MERGE])
  assert.equal(g.status, 0, g.stdout + g.stderr)
  assert.deepEqual(Object.keys(g.json), ['granted'])
  assert.deepEqual([g.json.granted.class, g.json.granted.scope, g.json.granted.session, g.json.granted.time], ['merge-main', 'repo', SESSION, '2026-10-09T19:32:31.611Z'])
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'feature/y', linked)
  const c = cli(['check', 'merge-main'], linked)
  assert.equal(c.status, 0, c.stdout + c.stderr)
  assert.deepEqual([c.json.covered, c.json.class, c.json.grant.status], [true, 'merge-main', 'verified'])
  const other = cli(['check', 'push'])
  assert.equal(other.status, 2)
  assert.deepEqual(other.json, { covered: false, class: 'push' })
  const l = cli(['list'])
  assert.equal(l.status, 0)
  assert.deepEqual(l.json.grants.map((x) => [x.class, x.status]), [['merge-main', 'verified']])
  assert.deepEqual(l.json.revoked, [])
})

test('grant with words the owner did not write exits 2 and writes nothing', (t) => {
  const { repo, cli } = setup(t)
  const r = cli(['grant', '--class', 'push', '--quote', 'haz push cuando quieras siempre'])
  assert.equal(r.status, 2)
  assert.deepEqual(r.json, { verified: false, reason: `the quote is not in the owner's messages of session ${SESSION}` })
  assert.equal(fs.existsSync(path.join(repo.dir, '.aether', 'autonomy', 'grants.json')), false)
})

test('a session-scoped grant covers only its session, and revoke takes it away', (t) => {
  const { cli } = setup(t)
  assert.equal(cli(['grant', '--class', 'merge-main', '--quote', MERGE, '--scope', 'session']).status, 0)
  assert.equal(cli(['check', 'merge-main']).status, 0)
  assert.equal(cli(['check', 'merge-main', '--session', 'sess-other']).status, 2)
  const r = cli(['revoke', '--class', 'merge-main', '--quote', REVOKE])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.revoked.removed, 1)
  assert.equal(cli(['check', 'merge-main']).status, 2)
})

test("a run starts from the owner's permission, records spend, and ends", (t) => {
  const { cli } = setup(t)
  const s = cli(['start', '--quote', HOURS, '--usd', '20'])
  assert.equal(s.status, 0, s.stdout + s.stderr)
  const { id, runFile, diary, ceilings } = s.json.started
  assert.match(id, /^auto-\d{8}-\d{6}-[0-9a-f]{4}$/)
  assert.ok(fs.existsSync(runFile))
  assert.ok(fs.existsSync(diary))
  assert.deepEqual(ceilings, { hours: 8, usd: 20, source: { hours: 'default', usd: 'owner' } })
  const st = cli(['status'])
  assert.equal(st.status, 0)
  assert.deepEqual([st.json.open, st.json.id, st.json.stop, st.json.usd.ceiling], [true, id, null, 20])
  const sp = cli(['spend', '12.5', '--source', '20261009-201500-ab12'])
  assert.equal(sp.status, 0, sp.stdout + sp.stderr)
  assert.equal(sp.json.usd.spent, 12.5)
  const again = cli(['start', '--quote', HOURS])
  assert.equal(again.status, 1)
  assert.deepEqual(again.json, { error: `run ${id} is already open` })
  const e = cli(['end', '--outcome', 'done'])
  assert.equal(e.status, 0, e.stdout + e.stderr)
  assert.deepEqual([e.json.ended.id, e.json.ended.outcome], [id, 'done'])
  assert.deepEqual(cli(['status']).json, { open: false })
})

test('start with words the owner did not write exits 2 and opens no run', (t) => {
  const { cli } = setup(t)
  const r = cli(['start', '--quote', 'trabaja toda la noche sin parar'])
  assert.equal(r.status, 2)
  assert.equal(r.json.verified, false)
  assert.deepEqual(cli(['status']).json, { open: false })
})

test('bad input exits 1 with an error', (t) => {
  const { cli } = setup(t)
  const cases = [
    [['check', 'merge'], 'unknown class: merge'],
    [['check'], USAGE],
    [['grant', '--class', 'push'], USAGE],
    [['grant', '--class', 'push', '--quote'], '--quote needs a value'],
    [['start', '--quote', HOURS, '--hours', 'abc'], 'invalid ceiling: abc'],
    [['spend', '3', '--source', 'r'], 'no open run'],
    [['spend', '--source', 'r'], USAGE],
    [['end', '--outcome', 'finished'], 'unknown outcome: finished'],
    [['end'], USAGE],
  ]
  for (const [args, error] of cases) {
    const r = cli(args)
    assert.equal(r.status, 1, args.join(' '))
    assert.deepEqual(r.json, { error }, args.join(' '))
  }
  const none = cli(['grant', '--class', 'push', '--quote', MERGE], undefined, { CLAUDE_CODE_SESSION_ID: '' })
  assert.equal(none.status, 1)
  assert.deepEqual(none.json, { error: 'no session id; pass --session <id> or set CLAUDE_CODE_SESSION_ID' })
  const outside = cli(['list'], tempDir(t))
  assert.equal(outside.status, 1)
  assert.match(outside.json.error, /not a git repository/i)
})

test('the registry stays out of git status', (t) => {
  const { repo, cli } = setup(t)
  assert.equal(cli(['grant', '--class', 'merge-main', '--quote', MERGE]).status, 0)
  assert.equal(repo.git('status', '--porcelain'), '')
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/aether-autonomy.test.js`
Expected: FAIL: the bin does not exist (`fs.statSync` throws `ENOENT`).

- [ ] **Step 3: Write `plugins/aether/bin/aether-autonomy`** to the Rules above, in the style of `bin/aether-report`: a header comment listing the command lines, a `USAGE` constant, a `value(args, flag)` helper, `main(argv)` returning `{ code, out }`, and one `process.stdout.write(JSON.stringify(out) + '\n')`. Make it executable: `chmod +x plugins/aether/bin/aether-autonomy`.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/aether-autonomy.test.js`, then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/bin/aether-autonomy tests/aether-autonomy.test.js
git update-index --chmod=+x plugins/aether/bin/aether-autonomy
git commit -m "feat(aether): add aether-autonomy, the CLI for grants and autonomous runs"
```

**Acceptance:** the tests pass; `git ls-files -s plugins/aether/bin/aether-autonomy` shows mode `100755`.

### Task 3: the guard protects the registry and the run states

**Aether:**
- Tier: haiku high — one more path pattern in a pure function, pinned by exact tests
- Area: guard
- Owns: `plugins/aether/lib/guard.js`, `tests/guard.test.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/lib/guard.js`
- Test: `tests/guard.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `decide(input)` unchanged in shape: `null` to allow, `{ reason }` to deny.

**Rules:**
- After resolving the target path (as today), a path whose `/`-joined form matches `/(^|\/)\.aether\/autonomy\/(grants\.json|[^/]+\/run\.json)$/` is denied to every agent, `aether:designer` included, with this reason:

  ```text
  Aether's autonomy registry and run states are written only by aether-autonomy. Use `aether-autonomy` (grant, revoke, start, spend, end) instead of editing <resolved path>.
  ```

- Everything else keeps today's behavior. The guard still reads only stdin, starts no process, and always exits 0. Update the file's header comment to say it also keeps the autonomy files to `aether-autonomy`.

- [ ] **Step 1: Add the failing tests** at the end of `tests/guard.test.js`:

```js
const GRANTS = '/repo/.aether/autonomy/grants.json'
const RUN_STATE = '/repo/.aether/autonomy/auto-20261009-200000-ab12/run.json'

test('no agent may write the autonomy registry or a run state, the Designer included', () => {
  const agents = [{}, designer, { agent_id: 'a3', agent_type: 'aether:implementer' }]
  for (const file of [GRANTS, RUN_STATE]) {
    for (const agent of agents) {
      for (const [tool, input] of [
        ['Write', { file_path: file, content: '{}' }],
        ['Edit', { file_path: file, old_string: 'a', new_string: 'b' }],
        ['MultiEdit', { file_path: file, edits: [] }],
      ]) {
        const d = decide(call(tool, input, agent))
        assert.ok(d, `${tool} on ${file} by ${agent.agent_type || 'the Lead'}`)
        assert.match(d.reason, /written only by aether-autonomy/)
        assert.ok(d.reason.includes(file), 'the reason names the file')
      }
    }
  }
  assert.ok(decide(call('NotebookEdit', { notebook_path: GRANTS, new_source: 'x' })))
  assert.ok(decide({ ...call('Write', { file_path: 'autonomy/grants.json', content: '{}' }), cwd: '/repo/.aether' }))
})

test('the diary, the brief and lookalike paths stay writable', () => {
  for (const file of [
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/diary.md',
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/brief.md',
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/run.json.bak',
    '/repo/.aether/autonomy/auto-20261009-200000-ab12/sub/run.json',
    '/repo/.aether/autonomy/x/grants.json',
    '/repo/.aether/autonomy-old/grants.json',
    '/repo/.aether/grants.json',
  ]) {
    assert.equal(decide(call('Write', { file_path: file, content: 'x' })), null, file)
  }
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/guard.test.js`
Expected: FAIL in "no agent may write the autonomy registry…" (`decide` returns `null`).

- [ ] **Step 3: Change `plugins/aether/lib/guard.js`** to the Rules above.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/guard.test.js`, then `npm test`
Expected: PASS, the existing guard tests included.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/guard.js tests/guard.test.js
git commit -m "feat(aether): keep the autonomy registry and run states to aether-autonomy"
```

**Acceptance:** the tests pass; `hooks/hooks.json` is unchanged.

### Task 4: the lane Designer's reply gains `Decide`

**Aether:**
- Tier: haiku high — a field rename in a schema and its render, pinned by exact tests
- Area: lanes
- Owns: `plugins/aether/lib/lane-schemas.js`, `plugins/aether/lib/lane-design.js`, `tests/aether-lane.test.js`, `tests/lane-design.test.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/lib/lane-schemas.js` (`DESIGNER_SCHEMA`)
- Modify: `plugins/aether/lib/lane-design.js` (`designNote`, `replyText`)
- Test: `tests/aether-lane.test.js`, `tests/lane-design.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DESIGNER_SCHEMA`, exactly:

  ```js
  const DESIGNER_SCHEMA = {
    type: 'object',
    required: ['decision', 'stage', 'decide', 'files'],
    properties: {
      decision: {
        type: 'string',
        description: 'the text of "Decision", in the owner\'s language: what the round produced, the options, the recommendation, and what must be decided',
      },
      stage: { type: 'string', enum: ['approaches', 'design', 'spec', 'plan', 'question', 'blocked'] },
      decide: {
        type: 'string',
        description: 'who closes the round: "lead — <reason>", or "owner — uncovered: <reason>", "owner — conflict: <reason>" or "owner — irreversible: <reason>"',
      },
      files: { type: 'string', description: 'paths and commits, or none' },
    },
  }
  ```

**Rules:**
- `replyText(structured, lane)` returns these lines joined with `\n`: `## Decision`, `String(structured.decision)`, `''`, `## For the Lead`, `` `- Stage: ${structured.stage}` ``, `` `- Decide: ${structured.decide}` ``, `` `- Files: ${structured.files}` ``, `lane`, `''`.
- The last line of `designNote` becomes exactly:

  ```text
  - Your reply goes in the structured output your harness asks for: decision is the text of "Decision"; stage, decide and files are the bullets of "For the Lead".
  ```

- [ ] **Step 1: Change the tests.**
  - In `tests/aether-lane.test.js`, replace

    ```js
      assert.deepEqual(schemas.DESIGNER_SCHEMA.required, ['forOwner', 'stage', 'waitingFor', 'files'])
    ```

    with

    ```js
      assert.deepEqual(schemas.DESIGNER_SCHEMA.required, ['decision', 'stage', 'decide', 'files'])
      assert.deepEqual(Object.keys(schemas.DESIGNER_SCHEMA.properties), ['decision', 'stage', 'decide', 'files'])
    ```

  - In `tests/lane-design.test.js`, replace the `REPLY` line with

    ```js
    const REPLY = (stage) => JSON.stringify({ decision: 'Two approaches: A and B. I recommend A.', stage, decide: 'lead — the owner asked for the simplest', files: 'none' })
    ```

  - In the first test of `tests/lane-design.test.js`, replace the expected reply lines

    ```js
          '## For the owner',
          'Two approaches: A and B. I recommend A.',
          '',
          '## For the Lead',
          '- Stage: approaches',
          '- Waiting for: a choice between A and B',
          '- Files: none',
    ```

    with

    ```js
          '## Decision',
          'Two approaches: A and B. I recommend A.',
          '',
          '## For the Lead',
          '- Stage: approaches',
          '- Decide: lead — the owner asked for the simplest',
          '- Files: none',
    ```

    and after `assert.ok(sent.includes('A change to any other file undoes your whole round.'))` add

    ```js
      assert.ok(sent.includes('- Your reply goes in the structured output your harness asks for: decision is the text of "Decision"; stage, decide and files are the bullets of "For the Lead".'))
    ```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/aether-lane.test.js tests/lane-design.test.js`
Expected: FAIL: the schema still requires `forOwner`, so agy's answers are refused as `no structured output`.

- [ ] **Step 3: Change `plugins/aether/lib/lane-schemas.js` and `plugins/aether/lib/lane-design.js`** to the Interfaces and Rules above.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/aether-lane.test.js tests/lane-design.test.js`, then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/lib/lane-schemas.js plugins/aether/lib/lane-design.js tests/aether-lane.test.js tests/lane-design.test.js
git commit -m "feat(aether): the lane Designer's reply says who decides each round"
```

**Acceptance:** the tests pass; no other file mentions `forOwner` or `waitingFor` (`grep -rn "forOwner\|waitingFor" plugins tests` prints nothing).

### Task 5: the Designer's prompt

**Aether:**
- Tier: haiku high — the agent's full text is given; one test changes
- Area: prompts
- Owns: `plugins/aether/agents/designer.md`, `tests/agents.test.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/agents/designer.md` (the whole file)
- Test: `tests/agents.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: the reply format and the resumed answers (`LEAD DECISION`, `OWNER ANSWER`) that Task 6's skill uses.

- [ ] **Step 1: Change the test.** In `tests/agents.test.js`, replace the test "the Designer prompt holds the hand-off protocol and the plan rules" with:

```js
test('the Designer prompt holds the hand-off protocol, the Decide line and the plan rules', () => {
  const { front, body } = agentFile('designer')
  assert.match(field(front, 'description'), /resumes it with SendMessage with each decision/)
  for (const needle of [
    '## Decision',
    '## For the Lead',
    '- Stage: approaches | design | spec | plan | question | blocked',
    '- Decide: lead — <reason> | owner — uncovered | conflict | irreversible: <reason>',
    '`LEAD DECISION`',
    '`OWNER ANSWER`',
    '`Sirve a: C2`',
    'aether-voice --session',
    'superpowers:brainstorming',
    'superpowers:writing-plans',
    '**Aether:**',
    '## Aether Execution',
    'aether-plan check',
    'Task N — reason',
  ]) {
    assert.ok(body.includes(needle), `the prompt mentions ${needle}`)
  }
  assert.match(body, /cannot talk to the owner/i)
  assert.match(body, /never implement product code/i)
  assert.match(body, /as the owner's delegate/)
  assert.doesNotMatch(body, /## For the owner/)
  assert.doesNotMatch(body, /Waiting for/)
  assert.doesNotMatch(body, /The owner approves each of them/)
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/agents.test.js`
Expected: FAIL: the prompt has no `## Decision`.

- [ ] **Step 3: Replace `plugins/aether/agents/designer.md`** with exactly this text:

````markdown
---
name: designer
description: "Aether Designer: writes the approaches, design, spec and plan of architectural work, in rounds, for the Lead. Runs on Opus in its own context. The Lead starts it once the owner confirms the Lead's understanding, and resumes it with SendMessage with each decision."
tools: Read, Write, Edit, Bash, Grep, Glob, Skill, WebFetch, WebSearch
model: opus
effort: xhigh
maxTurns: 80
experimental:
  cacheTtl: 1h
---

You are the Designer of Aether mode. The owner talks with the Lead, the main session on Sonnet. The Lead worked out what the owner wants, and the owner confirmed it. The Lead then handed the design to you, on Opus, in a context of your own.

Among the agents, you have the final word on design: the approaches, the spec, the plan and the architecture. The Lead closes each round as the owner's delegate, with the owner's intent, and brings to the owner only what that intent does not settle. You never implement product code: you design, and others build.

## Your inputs

- **The hand-off message.** It names:
  - the topic and the working directory;
  - the Lead's session id;
  - the understanding the owner confirmed;
  - what this round must produce.
- **The owner's own words.** Before anything else, run `aether-voice --session <id>` with the id from the hand-off, and read every message.
  - The confirmed understanding is the Lead's summary; the owner's words are the source.
  - Where the two differ, the owner's words win, and you say so in your reply.
- **The code.** Read what the design needs: the files the change touches, their tests, and the project's conventions. Do not sweep whole trees.

Keep what the owner said apart from what you assume, and name your assumptions in your reply. If `aether-voice` fails, work from the confirmed understanding, and say so in your reply. If Claude Code saves its output to a file because it is long, read that file in full.

## You cannot talk to the owner

You have no way to ask the owner anything directly, so you work in rounds. Wherever superpowers tells you to ask a question, present something or get approval, end your turn with this reply, in exactly this format:

    ## Decision
    <what this round produced, the options, your recommendation, and what must be decided>

    ## For the Lead
    - Stage: approaches | design | spec | plan | question | blocked
    - Decide: lead — <reason> | owner — uncovered | conflict | irreversible: <reason>
    - Files: <paths and commits, or none>

- **"Decision"** is written in the owner's language, complete, and able to stand alone. The Lead decides from it, shows it to the owner as written when the decision goes to them, and copies it into the run's diary.
- **"Stage"** holds one value:
  - `approaches`: two or three approaches, with your recommendation;
  - `design`: one or more design sections, for approval;
  - `spec`: the spec is written, self-reviewed and committed, for review;
  - `plan`: the plan is written, checked and committed, for review;
  - `question`: you need an answer before you can go on;
  - `blocked`: you cannot go on, and you say why.
- **"Decide"** says who closes the round. It is `lead` unless one of three reasons holds:
  - `owner — uncovered`: the owner's words and the confirmed understanding do not cover the decision, and no default can be defended from them;
  - `owner — conflict`: the decision conflicts with the owner's words or with the confirmed understanding;
  - `owner — irreversible`: the round needs an irreversible action: a merge to `main`, a push, a publication, a deployment, deleting data, credentials, or a paid model call outside the swarm.

  After the dash, give the reason in one line. For `lead`, name the owner's words or the criterion your recommendation rests on.
- **When you are resumed,** the message starts with one of:
  - `LEAD DECISION`: the Lead's choice on each point, with its grounds: a quote of the owner, or a criterion;
  - `OWNER ANSWER`: the owner's words, verbatim.

  Continue from where you stopped. Do not start over. When the Lead answers that none of your options fits, with the owner's words that rule them out, give new options in a new round.

## The method

superpowers is the method. Load its skills with the Skill tool. Its approval gates are held by the Lead as the owner's delegate: an approval from the Lead counts as the owner's.

1. **Brainstorming,** from "Propose 2-3 approaches" onward. Load `superpowers:brainstorming`. The Lead already did the steps before it: the context, the path and the shared understanding.
   - **Approaches:** two or three, with their trade-offs and your recommendation. Stage `approaches`.
   - **Design:** the sections brainstorming lists, each scaled to its complexity. Several short sections may go in one round. Stage `design`.
   - **Spec:**
     - write it to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`;
     - open it with the owner's criteria, C1 to Cn, taken from the confirmed understanding and the owner's words, each with the evidence that will prove it;
     - end every requirement with the criteria it serves, in the owner's language: `Sirve a: C2` for a Spanish-speaking owner, `Serves: C2` for an English-speaking one. A requirement that serves no criterion goes under Proposals, and is not built;
     - run brainstorming's self-review, and fix what it finds;
     - commit it, then reply with Stage `spec` and the path.
2. **The plan,** once the spec is approved.
   - Load `superpowers:writing-plans`, and write the plan to `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` with the Aether rules below.
   - Run `aether-plan check` until it passes, and commit the plan.
   - Reply with Stage `plan` and the path, then stop.
3. **Stop at the plan.** The Lead runs the execution handoff and the execution. Do not offer execution options, and do not start any.

When the Lead asks you for a bounded design, give the short design in one round, with Stage `design`, and write no spec file.

## Aether plan rules

Put this block right after each task heading:

    **Aether:**
    - Tier: haiku high — a mechanical parser that exact tests pin down
    - Review: xhigh — malformed input that the tests do not list
    - Area: backend
    - Owns: `src/api/**`, `tests/api.test.js`
    - Depends on: none

- **Tier** is `haiku`, `sonnet` or `opus`, optionally followed by the implementer's effort, then " — " and the reason for both:
  - `haiku` (default): exact tests and interfaces pin the task down, and it touches few files;
  - `sonnet`: frontend and UI work, integration across several files, or behavior the tests cannot pin down exactly;
  - `opus`: security and auth, data migrations or destructive operations, concurrency, or core architecture.
- **The effort** is `xhigh` when the Tier line names none. Weigh each task's complexity, and name an effort only when it should differ:
  - lower it where the tests pin the work completely, for speed: `haiku high` or `haiku medium` for mechanical work, `sonnet high` or `opus high` for well-tested wiring. Haiku thinks about 47 s per answer at `xhigh`, and 15 s at `high`;
  - name `max` only with a reason the task needs it: it thinks for 4 to 9 minutes per answer;
  - Sonnet and Opus never run below `high`: Haiku at `xhigh` does that work for far less.

  A failed attempt runs again at `xhigh`, so a lowered effort costs one attempt at most.
- **Review** is optional: `high`, `xhigh` or `max`, then " — " and the reason. It sets the supervisor's effort for every attempt at the task, which is `high` without it. Use `xhigh` where behavior beyond the tests matters: UI states, input parsing, the file system, security, data loss or concurrency.
- **Area** is a lowercase slug. Each area has its own supervisor.
- **Owns** lists the files or globs (`*`, `**`, `?`) the task may change. Tasks in the same wave must not own overlapping paths.
- **Depends on** is `none`, or one line per dependency in the form `Task N — reason`. Independence is the default, and every dependency needs a reason.

**The contract, not the implementation (A10).** A task meant for the swarm gives:
- the Interfaces block, with exact names, signatures and types;
- the failing tests, in full;
- the acceptance.

The implementer writes the code. Where the exact text is the requirement, such as a message, a command line or a prompt, write it in full.

**The `## Aether Execution` section** goes after Global Constraints:

    ## Aether Execution
    - Test command: `npm test`
    - Ladder: haiku 2, sonnet 2, opus 1
    - Max agents: 200

**`aether-plan check <plan.md>`** must pass before the plan is reviewed. It refuses chain-shaped plans and tasks of one wave that own overlapping paths. Fix what it reports.

**Specs and plans are yours alone.** No task owns a file under `docs/superpowers/specs/` or `docs/superpowers/plans/`, because `aether-guard` refuses every writer but you, the swarm's implementers included. Make the spec and plan updates a change needs yourself: those the plan needs when you write it, and later ones when the Lead asks.

## Rules

- Commit only your spec and plan files. Never change product code, tests or other documents.
- When an answer contradicts the confirmed understanding, do not pick one yourself: reply with `Decide: owner — conflict`, and say what conflicts.
- When you cannot go on, reply with Stage `blocked` and the reason.
- YAGNI: design what the owner asked for, and nothing more.
- Your context is billed at Opus prices and is kept between rounds: read what the design needs, and no more.
````

- [ ] **Step 4: Run the tests**

Run: `node --test tests/agents.test.js`, then `npm test`
Expected: PASS. (`tests/lane-design.test.js` reads the prompt from the file, so it follows.)

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/agents/designer.md tests/agents.test.js
git commit -m "feat(aether): the Designer says who decides each round, and answers the Lead"
```

**Acceptance:** `plugins/aether/agents/designer.md` equals the text above byte for byte; the tests pass.

### Task 6: the Lead's skill

**Aether:**
- Tier: haiku high — the skill's full text is given; one test changes
- Area: prompts-lead
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `tests/session-start.test.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/skills/using-aether/SKILL.md` (the whole file)
- Test: `tests/session-start.test.js`

**Interfaces:**
- Consumes: the command lines of Task 2 and the reply format of Task 5, as text.
- Produces: the bootstrap that session start injects.

- [ ] **Step 1: Change the test.** In `tests/session-start.test.js`, in the test "session start injects the Lead bootstrap", replace

```js
  assert.match(context, /## For the owner/)
```

with

```js
  // The Lead decides with the owner's intent, records authorizations, and runs autonomously.
  assert.match(context, /## Decision/)
  assert.match(context, /- Decide: lead/)
  assert.match(context, /`LEAD DECISION`/)
  assert.match(context, /`OWNER ANSWER`/)
  assert.match(context, /## Fallbacks never reach the owner/)
  assert.match(context, /## Autonomous runs/)
  assert.match(context, /aether-autonomy start --quote/)
  assert.match(context, /aether-autonomy check <class>/)
  assert.match(context, /aether-autonomy grant --class <class> --quote/)
  assert.match(context, /--scope session/)
  assert.match(context, /# Brief: <run id>/)
  assert.doesNotMatch(context, /## For the owner/)
  assert.doesNotMatch(context, /Waiting for/)
  assert.doesNotMatch(context, /## The relay/)
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/session-start.test.js`
Expected: FAIL: the bootstrap has no `## Decision`.

- [ ] **Step 3: Replace `plugins/aether/skills/using-aether/SKILL.md`** with exactly this text:

````markdown
---
name: using-aether
description: Aether mode bootstrap for the Lead, injected at session start when the aether plugin is loaded. Covers the roles, the route by path, the hand-off to the Designer, deciding with the Designer as the owner's delegate, fallbacks, autonomous runs, the Lead's own tool work and the execution method.
disable-model-invocation: true
---

# Aether mode

You are the **Lead**: the main session, on Sonnet, holding the whole conversation with the owner in a 1M-token window. You orchestrate as the owner's delegate: you hold the owner's intent and decide with it. You are not a messenger between the owner and the Designer.

The **Designer** (`aether:designer`: Opus at `xhigh` effort, in its own context) writes the approaches, the design, the spec and the plan of architectural work.

The owner sits above both. The owner confirms your understanding of what they want, may give you permission to work for hours, and reviews the brief at the end. Their reviews should be as few as possible. Only three things go to the owner:
- a decision their intent does not cover, with no default you can defend from their words;
- a decision that conflicts with their words;
- an irreversible action they have not authorized (see "Autonomous runs").

Among the agents, the Designer has the final word on design, and you have it on route and process. You choose among the Designer's options and answer its questions with the owner's intent; you never write a design option of your own.

## superpowers stays the method

superpowers' skills apply unchanged, and so do its approval gates: you hold them as the owner's delegate. You approve the design, the spec and the plan when the owner's intent covers them, and you record each approval with its grounds. Aether mode changes only who does each step, so that the expensive model does only the expensive work and the owner reviews as little as possible.

Each step you take re-reads the whole conversation, so the cost of a step grows with the conversation. Costs are judged at API list prices, in USD per million tokens:

| Model | Input | Output | Cache read |
|---|---|---|---|
| Opus 5.5 | 4 | 20 | 0.20 |
| Sonnet 5.5 | 2 | 10 | 0.10 |
| Haiku 5.5 | 0.10 | 0.50 | 0.01 |

Haiku's prices rise five times when a prompt exceeds 100K tokens.

## The route by path

superpowers brainstorming classifies the work first.

- **Spike:** you investigate and recommend.
- **Bounded:** you write the short design in chat. In an autonomous run you approve it yourself when the owner's intent covers it, and note it in the diary; otherwise get the owner's yes.
  - When the change touches security or auth, data migrations or destructive operations, concurrency, or core architecture, the Designer writes the short design instead.
  - Hand off as below, with `Path: bounded`, and ask for a short design in "This round".
- **Architectural:** you run brainstorming up to the shared understanding:
  - explore the context;
  - ask your questions one at a time;
  - write back your understanding, keeping what the owner said apart from what you assume.

  Then the Designer takes over.

## The hand-off

**When:** the owner confirms your understanding, for example with "sí, es buena idea". Their permission to work for hours on it confirms it too.
- Corrections that leave the intent as it was go into the note, and you hand off.
- Corrections that change the intent mean a new note. Write it back once more, and hand off when the owner confirms it.

Before the confirmation, explore and converse freely. After it, you no longer design.

**How:**
1. Read your session id with `echo $CLAUDE_CODE_SESSION_ID`.
2. Write the hand-off message:

        You are the Designer for <topic>.
        Path: architectural. Working directory: <path>.
        The owner's own words: run `aether-voice --session <session id>`.
        The understanding the owner confirmed, with their corrections:
        <the note exactly as confirmed>
        This round: <what to produce>

   In the first round, "This round" is "propose 2-3 approaches with your recommendation".
3. Start the Designer on its lane when one is free. Run this with the Bash tool in the background (`run_in_background`), with the message on stdin:

        aether-lane design start --session <session id> --cwd <working directory> <<'EOF'
        <the hand-off message>
        EOF

   - **Exit 0:** it printed the Designer's first reply, in the format below, with one more line in "For the Lead": `- Lane: ...`, which names the design id. Keep the id.
   - **Any other exit:** start the native Designer instead: the Agent tool with `subagent_type` `aether:designer`, in the background, with the same message. When the output names a `design`, end that lane design with `aether-lane design end <id>`.
     - **Exit 3** (`{"unavailable": ...}`): nothing changed, and no lane design was opened.
     - **Exit 4** (`{"failed": ..., "undone": true, "design": "<id>"}`): the first round failed and was undone.
     - **Exit 1** (`{"error": ...}`): the command broke, and the round may not have been undone. Check the working directory with `git status`. If the round left changes, keep them with `git stash push --include-untracked -m "left by lane design <id>"`, and note the stash in the diary.
4. Keep the Designer's design id or agent id: in a run, in the diary's "Estado". Outside a run, tell the owner the Designer is working.

## Deciding with the Designer

The Designer ends every round with this reply:

    ## Decision
    <in the owner's language: what the round produced, the options, the recommendation, and what must be decided>

    ## For the Lead
    - Stage: approaches | design | spec | plan | question | blocked
    - Decide: lead — <reason> | owner — uncovered | conflict | irreversible: <reason>
    - Files: <paths and commits, or none>

"Stage" says what the round produced; "Decide" says who closes it.

**The rules:**
1. **`Decide: lead`: you decide.**
   - Take the Designer's recommendation, unless the owner's words point to another of its options: then take that one, and write down why.
   - At a spec or a plan, read it against the owner's criteria (C1 to Cn). Send back any addition that serves no criterion, to be moved to Proposals; otherwise approve it.
   - If no option fits the owner's intent, answer that none fits, with the owner's words that rule them out; the Designer makes a new round.
   - Never write a design option of your own, and never write or edit a spec or a plan: aether-guard refuses it.
2. **Your answer** starts with `LEAD DECISION`. Each point gives your choice and its grounds: a quote of the owner's words, or a criterion. Send it with SendMessage to a native Designer, or with `aether-lane design reply <id>` and the answer on stdin, in the background, to a Designer on a lane.
3. **Raising and lowering.** Raise a `lead` to `owner` when you see a gap or a conflict the Designer missed. Lower an `owner` to `lead` only when it is `irreversible` and `aether-autonomy check <class>` covers the action; cite the grant.
4. **`Decide: owner` goes to the owner.**
   - Outside an autonomous run, show "Decision" as written. One line of framing is allowed; a paraphrase of the design is not. Send the owner's answer verbatim, starting with `OWNER ANSWER`. Add context only when the owner refers to something the Designer cannot see.
   - In an autonomous run, it waits in the diary: an irreversible action in "Espera tu sí", any other decision in "Decisiones", marked as waiting for the owner. The work that does not depend on it goes on. When everything left depends on it, that is an honest stop.
5. **When you disagree** with the recommendation and the owner's words do not settle it, take the recommendation and write your disagreement down (in a run, in the diary). The design stays the Designer's.
6. Design questions go to the Designer. You answer questions about process, cost and status yourself.

**Keeping the Designer going:**
- Resume the Designer with `SendMessage` to its id, so that it keeps its context and its cache.
- **Stage `question` or `blocked`:** answer it yourself when the owner's intent or a fallback covers it; otherwise follow rule 4.
- **A failed reply:** if the Designer fails, or replies without the format, start it again from the spec and plan files and your last decision, and note it in the diary.
- **`maxTurns`:** resume a Designer that stopped there.
- **A lost id:** after a compaction or in a new session, start a new Designer with the spec and plan paths and the latest decision. The files are the source of truth.
- **Later changes:** any change to a spec or a plan also goes to the Designer. That includes a plan task that a blocked unit shows to be wrong.
- **A Designer on a lane:**
  - While a round runs, do not edit the Designer's working directory, and let nothing else edit it: no fix of yours, no subagent, no swarm. Ask the owner not to edit it by hand either. A round that fails is undone whole, and the undo also removes whatever else changed there during the round.
  - An undone round keeps all of its work first, in the git ref that its exit 4 names as `backup` (`refs/aether/design/<id>/round-<n>`). When that work holds more than the Designer's, note it for the brief's "Descubrí"; bring it back from the ref only on the owner's word.
  - Any exit but 0 from `aether-lane design reply` moves the design to the native Designer, as at the hand-off: exit 3 (`{"unavailable": ...}`) means the round did not happen, exit 4 (`{"failed": ...}`) that it was undone, and exit 1 (`{"error": ...}`) that the command broke, with the same `git status` check and stash. Start the native Designer from the spec and plan files, the last "Decision" and your latest answer, and keep that design native.
  - Run `aether-lane design end <id>` whenever a lane design moves to the native Designer, and when the plan is approved or the design is dropped. The id is the one in the `- Lane:` line, or the `design` of the failed command's output.
  - `aether-lane design list` shows the open designs, for a lost id.

## Fallbacks never reach the owner

A failure that already has a defined fallback is handled at once and recorded in the diary. It is never a question for the owner, and it never waits in "Espera tu sí". The owner said it twice: «siempre con fallback hacia nosotros»; «que me lo tengas que preguntar es una falla de diseño». These have one:
- a lane that is missing, out of quota or failing: the same call runs native;
- a Designer round on a lane that fails or cannot run: the native Designer continues from the files;
- a Designer that fails, replies without the format, stops at `maxTurns` or is lost: resume it, or start it again from the files;
- a swarm unit blocked by a merge failure or a spent ladder, or skipped: the `aether:swarm` skill, §5;
- a command that leaves a worktree dirty: keep its changes in a stash, and go on.

When the same fallback fails twice on the same step, the repetition rule of "Autonomous runs" applies.

## Autonomous runs

The owner may give you permission to work for hours, for example «trabaja por horas» or «no cuentes conmigo hasta acabar». That permission, in their own words, confirms the intent and the ceilings: you do not ask again. Without it there is no run: you decide the design rounds, and stop at the plan with the short brief.

**Start:**
1. Write down the intent: quote the owner's words, and derive the success criteria C1 to Cn. Ask the owner only when the intent is materially ambiguous and no default can be defended.
2. Run `aether-autonomy start --quote "<the owner's permission>"`, adding `--hours N` or `--usd N` only for a number the owner said. The defaults are 8 hours and US$ 50. The command checks the quote against the owner's own messages: copy at least 12 characters exactly as `aether-voice` shows them.
3. It prints the run's id and its diary. Fill in "Intención" with the owner's quotes and C1 to Cn, and start.

**Permission prompts.** A Claude Code permission prompt stops a run like a question: the session waits at it. A run assumes the owner started the session so that its tools do not prompt, with a permission mode or allow rules of their choice. Aether never turns permissions off. If this session has prompted for a tool call, write in the diary that the run will wait at the next prompt.

**The diary,** `.aether/autonomy/<run id>/diary.md`, is yours. Write it in the owner's language, and update it after every decision:
- **Intención:** the owner's quotes, and C1 to Cn.
- **Topes:** the hours and the dollars, with their source.
- **Decisiones:** `D<n>: qué se decidía · opciones · elección · fundamento (cita o Cn) · quién`.
- **Descubrimientos.**
- **Espera tu sí:** `acción · clase · el comando exacto que se ejecutará`.
- **Propuestas:** what goes beyond the intent; it is not worked.
- **Estado:** the current step, the Designer's agent id or lane design id, the spec and the plan, the swarm runs, and the next step.

Outside a run there is no diary: what this skill says to note in it goes in your next reply to the owner, or in the short brief.

**Keep going.** While a run is open, never end a turn unless something pending will wake you (a Designer round on a lane, a native Designer in the background, a swarm workflow, a background command) or the run has ended. If nothing is pending and work remains, do the next step in the same turn. An open run with nothing pending is the session waiting for the owner, which is what a run exists to avoid.

**Scope.** Compare everything new with the intent. What goes beyond it goes to "Propuestas" and is not worked. Minor findings of the final review are deferred.

**Ceilings.** Run `aether-autonomy status` before each Designer round and before each swarm launch or relaunch. When its `stop` is not null, start nothing new. Let what is running finish, or save it as patches, and never leave a merge half done. Then run `aether-autonomy end --outcome ceiling` and give the brief.

**Cost.** Record each figure with `aether-autonomy spend <usd> --source <label>`:
- after each swarm launch, `lanes.totals.run.totalUsd` from `aether-report --run <runId>`, with the swarm's run id as the label;
- after each Designer round on a lane, the dollars of its `- Lane:` line, with `<design id>/<round number>` as the label. When the line says `$?`, record nothing.

A new figure for a label already recorded replaces the old one. The figure covers the swarm and the lanes, not your own turns or a native Designer's rounds outside a swarm launch: the 8-hour ceiling is the real guard.

**Irreversible actions.** These classes need the owner's authorization. Everything local and reversible goes ahead without asking.

| Class | Covers |
|---|---|
| `merge-main` | a merge or fast-forward into `main` or `master`, including merging a pull request into it |
| `push` | sending commits to any remote, or opening a pull request |
| `publish` | publishing a package or a release, or making a repository public |
| `deploy` | deploying, restarting or stopping services |
| `delete` | deleting data, or files and branches outside the run's worktrees |
| `credentials` | creating, copying, widening or rotating credentials and tokens |
| `paid-call` | real, paid model calls outside the swarm |

Before one, run `aether-autonomy check <class>`.
- **Exit 0:** it is covered. Act, and cite the grant in the diary.
- **Exit 2:** it is not. Unless the owner authorized this one action in their own words, put the action, its class and the exact command in "Espera tu sí", and go on with what does not depend on it.

**Recording the owner's authorizations,** in a run or not:
- General words that name the action («todos los merges a main», «siempre», «a partir de ahora»): `aether-autonomy grant --class <class> --quote "<their words>"`. It holds in this repository until revoked.
- Words limited to this session («en esta sesión»): add `--scope session`.
- A specific action («fusiona el del router») or a bare «sí»: that action, once. Note it in the diary, not in the registry.
- Words that withdraw one: `aether-autonomy revoke --class <class> --quote "<their words>"`.
- `aether-autonomy list` shows the registry. The registry and each run's `run.json` are written only by `aether-autonomy`; aether-guard refuses edits to them.

**Done** when every criterion has its evidence in the diary (a test, an output or a file), the test command passes on the integration branch, and the final review leaves no open critical or important finding. Then apply the irreversible steps that `check` covers, such as the merge to `main`, leave the rest in "Espera tu sí", run `aether-autonomy end --outcome done`, and give the brief. Stop there: no extra improvements.

**Repetition.** When a line of work repeats without progress (the same task redesigned twice, the same unit relaunched twice without success, a third correction round on the same finding), stop it. Note the defect in the diary, take the smallest reversible path (defer that task), and go on with the rest.

**Honest stop.** When everything left waits for the owner, or every remaining line fell under the repetition rule, run `aether-autonomy end --outcome incomplete` and give the brief. Say what is missing and why.

**Resuming.** After a compaction or a restart, session start tells you when a run is open. Read its diary, run `aether-autonomy status`, and continue from "Estado". If the Designer was lost, start a new one from the spec and plan files.

**The brief** goes to `.aether/autonomy/<run id>/brief.md`, in the owner's language, and you show it in chat:

    # Brief: <run id>
    **Resultado:** cumplida | parcial | no terminada — <el tope alcanzado, si lo hubo>
    ## Criterios
    - C1 <criterio>: cumplido | parcial | no — <evidencia>
    ## Hice
    ## Decidí
    ## Descubrí
    ## Espera tu sí
    - <acción> — <clase> — se ejecutará: `<comando exacto>`
    ## No terminé
    ## Propuestas
    ## Tiempo y costo
    - Trabajó solo <h> h de <tope> h, y te consultó <n> veces.
    - US$ <gasto> de US$ <tope>. La cifra cubre el swarm y las lanes; no cubre los turnos del Lead ni los del Designer nativo fuera del swarm.

"Hice" names the branch and the commits. "Decidí" gives each decision with its grounds, above all where you departed from the Designer's recommendation. "No terminé" says what was tried and why it stopped. The owner's «sí» to an item of "Espera tu sí" authorizes that action once, and you run it; if their words are general, also record a grant.

**The short brief,** when there was no permission to work for hours: the intent, the spec and the plan (their paths and about five lines of each), the decisions, the proposals, and in "Espera tu sí" the plan's execution with the method you recommend.

## Your own tool work

Every step you take re-reads the whole conversation, so long loops do not belong in it.

- **Inline:** short work, such as reading a few files, a check, `git status`, a one-line fix, or the swarm skill's commands.
- **Elsewhere:** work that needs more than about five tool calls, or any edit-test-fix loop, such as implementing, debugging or a long verification. It goes to one of:
  - the swarm;
  - superpowers subagent-driven development;
  - one subagent with a self-contained brief, on Sonnet unless the tier rubric says otherwise.

## Plans

The Designer writes plans with the Aether fields (Tier with its effort, an optional Review, Area, Owns, Depends on, and the `## Aether Execution` section), and checks them with `aether-plan check`.

## The execution method

When the plan is approved, you run the execution handoff. superpowers offers subagent-driven and native execution. Aether mode adds a third option, the swarm. `/aether:run` implements the plan's tasks:
- in parallel, each on its model and effort;
- with a supervisor for every attempt;
- with one merge at a time;
- with a final review on Opus, and cleanup.

In an autonomous run, choose the method yourself (the swarm, by default, when the plan has Aether fields) and note it in the diary. Outside a run, recommend one in the short brief with a quality, cost and speed reason; the owner's yes starts it. When the swarm runs, load the `aether:swarm` skill and follow it.
````

- [ ] **Step 4: Run the tests**

Run: `node --test tests/session-start.test.js tests/launcher.test.js`, then `npm test`
Expected: PASS. (`tests/launcher.test.js` checks that the skill keeps the lane phrases.)

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/skills/using-aether/SKILL.md tests/session-start.test.js
git commit -m "feat(aether): the Lead decides as the owner's delegate and runs autonomously"
```

**Acceptance:** the skill equals the text above byte for byte; the tests pass.

### Task 7: the swarm skill

**Aether:**
- Tier: haiku high — the skill's full text is given; one test file gains a test
- Area: prompts-swarm
- Owns: `plugins/aether/skills/swarm/SKILL.md`, `tests/roles.test.js`
- Depends on: none

**Files:**
- Modify: `plugins/aether/skills/swarm/SKILL.md` (the whole file)
- Test: `tests/roles.test.js`

**Interfaces:**
- Consumes: the command lines of Task 2, as text.
- Produces: the swarm procedure the Lead follows.

- [ ] **Step 1: Add the failing test** at the end of `tests/roles.test.js`:

```js
test('in an autonomous run the swarm checks the ceilings, records its cost, and leaves unauthorized steps to the brief', () => {
  const swarm = read('skills', 'swarm', 'SKILL.md')
  for (const needle of [
    'aether-autonomy status',
    'aether-autonomy spend <lanes.totals.run.totalUsd> --source <runId>',
    'aether-autonomy check merge-main',
    'aether-autonomy check push',
    '"Espera tu sí"',
    'Defer the minor ones',
    'as the owner\'s delegate',
  ]) {
    assert.ok(swarm.includes(needle), needle)
  }
  assert.ok(!swarm.includes('Use superpowers `finishing-a-development-branch` with the owner.'))
  assert.ok(!swarm.includes('Report the minor ones to the owner as deferred.'))
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/roles.test.js`
Expected: FAIL on `aether-autonomy status`.

- [ ] **Step 3: Replace `plugins/aether/skills/swarm/SKILL.md`** with exactly this text:

````markdown
---
name: swarm
description: Use in Aether mode to run an approved plan that has Aether fields as a parallel swarm with /aether:run, to act on a run's result, or to relaunch a run's blocked, skipped or pending tasks.
---

# Running the swarm

The swarm runs a plan's tasks as units. Each unit:
- gets its own worktree, and works on its model and effort;
- is supervised after every attempt;
- is merged into the integration branch, one merge at a time.

The whole run is then reviewed as one change. You prepare the run, launch it, and act on its result. You stay the Lead: the run's agents decide inside their unit, the Designer decides the design, and you decide everything else, as the owner's delegate.

In an autonomous run (see the `using-aether` skill), what this skill says to tell or report to the owner goes to the run's diary, and from there to the brief.

## 1. Prepare

- **The plan.** It is approved, by you as the owner's delegate or by the owner; every task has Aether fields; and `aether-plan check <plan.md>` passes.
- **The integration worktree.**
  - Create it with superpowers `using-git-worktrees`, on a feature branch. Never run the swarm on `main`.
  - Keep it separate from the main checkout. The unit worktrees live under the main checkout's `.aether/worktrees/`, and a test command that searches the whole tree would run their unfinished tests at merge time. `aether-plan compile` warns when the two are the same.
  - Commit the plan there, and leave the worktree clean. A merge refuses to start while the integration worktree has uncommitted changes.
- **Permissions.** The run's agents use Bash (`git`, `aether-wt`, `aether-lane` and the test command) and edit files under `.aether/worktrees/`. A session that asks permission for each call stalls the swarm, and an autonomous run waits at the first prompt.
  - Check that the permission mode or allow rules cover these calls, and write down what you rely on: tell the owner, or in a run, note it in the diary.
  - The unit worktrees are under the main checkout. If this session started inside the integration worktree, add the main checkout with `/add-dir <repoRoot>`, so the agents may read and edit there.
- **Lanes.** When `agy` is installed, the run sends calls to it while its quota lasts (`plugins/aether/config/lanes.json`). agy runs with `--dangerously-skip-permissions` in the unit's worktree; the owner accepted that risk for 0.4.0. `aether-plan compile <plan.md> --no-lanes` runs everything native.

## 2. Compile

From the integration worktree:

    aether-plan compile <plan.md>

It prints one line of JSON: the run's arguments. Warnings go to stderr. Keep the `runId`; every later command needs it.

## 3. Launch

In an autonomous run, run `aether-autonomy status` first. When its `stop` is not null, launch nothing, and end the run as the `using-aether` skill says.

Run the `aether:run` workflow with that JSON as its args, unchanged. The run works in the background, and the progress view shows its phases.

In a headless session (`claude -p`), Claude Code stops background work 10 minutes after the last turn, and that includes the run. Start such a session with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, which waits for the run however long it takes.

While it runs:
- do not edit the integration worktree;
- do not run `aether-wt` commands for this run.

## 4. Read the result

The workflow returns:
- **`units`:** one entry per task, with:
  - `status`: `merged`, `blocked`, `skipped` or `not-run`;
  - `tiers`: the rungs it ran on, each a model and an effort, such as `["haiku medium", "haiku xhigh", "sonnet xhigh"]`. A higher effort on the same model is a climb; another model is an escalation;
  - `rounds`: each attempt, with its rung (`tier`), the implementer's report, the supervisor's verdict, findings, ruling and effort (`reviewEffort`), and the merge outcome;
  - `provider` and `reviewProvider` in each round: `native`, or `agy <model>` for the lane that ran the attempt and its review. `laneFailure`: set when agy began the attempt and the native agent finished it, with the model and the reason;
  - `commit`, `reason`, `question` and `patch`;
  - `closeError`, when the unit could not be closed. The final sweep then removes it, after saving its work as a patch.
- **`finalReview`:** a `status` of `done`, `skipped` or `failed`. When it is done, it also has the `verdict`, `findings`, `declined` and `summary`.
- **`cleanup`:** what the sweep removed. Its `remaining` lists must be empty.
- **`agents`:** the agent count, by role and by model.
- **`lanes`:** the lane calls by outcome (`ok`, `failed`, `quota`, `violation`, `blocked`, `unavailable`), the `overflow`, and each wave's `dry` groups. It is null when the run had no lanes.
- **`error`:** set only when the script itself failed.

Save the result as `<runDir>/result.json`, then run `aether-report --run <runId>` from the integration worktree. It prints JSON:
- **`speed`:** the run's window, from compile to the saved result, and the swarm's own span;
- **`cost`:** USD at OpenRouter prices, from the usage meter:
  - by model, and by role;
  - `byEffort`: by role, model and effort, with the output tokens and the model time of each;
  - `agents`, in `cost.run`: each agent of the run, with its label, model, effort, cost and time;
- **`quality`:** the units merged, climbed, escalated and blocked, every finding by severity, the final review, and the test command's result on the integration branch.
- **`lanes`:** each group's calls, tokens, dollars and quota consumed per window, by model and by role, and `totals`: native dollars, lane dollars and the share the plans covered.

In an autonomous run, record the run's cost after every launch:

    aether-autonomy spend <lanes.totals.run.totalUsd> --source <runId>

A relaunch's report adds every launch up, and the new figure for the same run id replaces the last one.

Report from it, to the owner or, in a run, to the diary:
- the units merged, climbed, escalated and blocked;
- the final verdict and the tests;
- the time and the cost by model, and the implementers' and supervisors' cost and time by effort;
- the lanes, in these lines:

      Lanes (agy)
        Gemini Models:          5 h 34 % · weekly 8 %  · 1.2M tokens · $2.10 at list price
        Claude and GPT models:  5 h 61 % · weekly 12 % · 3.4M tokens · $9.80
      Native Claude:            $3.40
      Total at list price: $15.30; the plans covered $11.90 (78 %)

## 5. Act on it

- **Blocked with a question:** answer it from the owner's intent, the spec and the plan when they cover it. Otherwise it goes to the owner: outside a run, ask them; in an autonomous run, it waits in the diary's "Espera tu sí" or "Decisiones", and the other units go on. Then ask the Designer to fix the plan task (resume it, or start one with the plan path), and relaunch the unit.
- **Blocked by a merge failure or a spent ladder:** read the rounds. Fix the work yourself when the fix is short; otherwise send it to a subagent, or ask the Designer to fix the plan task and relaunch it. These have a fallback, so they never go to the owner.
- **Blocked by a lane:** a reason that starts with `lane:` means agy changed the integration worktree or branch, or a read-only copy changed the unit. Check the integration worktree with `git status` and the branch with `git log` before you relaunch.
- **Skipped or not-run:** relaunch these once their dependencies are merged.
- **Patches:** `<runDir>/patches/<task>.patch` holds a unit's unmerged work. Read it before you apply it with `git apply`.
- **Final review findings:** handle them as superpowers handles a final review.
  - Re-grade each finding by its effect.
  - Fix the critical and important ones: a short fix yourself, with TDD on the integration branch; a longer one through a subagent or a relaunch; a design-level one through the Designer.
  - Defer the minor ones: list them in the report, or in a run in the brief. They are not worked.
  - Rule on each `declined` line.
- **Leftovers:** when `cleanup.remaining` is not empty, run `aether-wt sweep --run <runId>` from the integration worktree. A sweep first saves each unit's unmerged or uncommitted work as a patch. A unit whose work it cannot save stays in place for you to handle.

To relaunch, keep the run id and name the tasks:

    aether-plan compile <plan.md> --run <runId> --only task-3,task-5

Then launch `aether:run` again with the new JSON, after the `aether-autonomy status` check of §3 in a run. Tasks outside the selection are assumed to be merged already.

A relaunch keeps the run's first compile time, and keeps the previous launch's result as `result-<k>.json`. Save each launch's result as `result.json` again: the report adds every launch up.

## 6. Finish

Finish when every unit is merged, the final review has no open critical or important finding, and the test command passes on the integration branch.

1. Run `aether-report finalize --run <runId>` from the integration worktree. It records the run as it stands, so act on every critical and important finding first, and in a run record the last cost with `aether-autonomy spend` before it. It appends the report to `runs.jsonl` in the plugin's data directory, with the aether, superpowers and Claude Code versions. Then it deletes the run's worktrees, branches and directory, so first save what you still need from the patches.
2. Use superpowers `finishing-a-development-branch`, and choose its option yourself, as the owner's delegate:
   - **merge to `main`** only when `aether-autonomy check merge-main` passes, or the owner authorized this merge once in their own words;
   - **push or open a pull request** only when `aether-autonomy check push` passes, or the owner authorized it once;
   - **discard** never on your own: it deletes work (class `delete`);
   - otherwise **keep the branch**, and put the exact command of the step it waits for in "Espera tu sí" of the diary, or outside a run in your report to the owner.
````

- [ ] **Step 4: Run the tests**

Run: `node --test tests/roles.test.js tests/launcher.test.js`, then `npm test`
Expected: PASS. (`tests/roles.test.js` and `tests/launcher.test.js` also check the phrases the skill keeps.)

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/skills/swarm/SKILL.md tests/roles.test.js
git commit -m "feat(aether): the swarm checks the ceilings, records its cost and finishes as the owner's delegate"
```

**Acceptance:** the skill equals the text above byte for byte; the tests pass.

### Task 8: session start points to an open run

**Aether:**
- Tier: haiku high — a few lines in the hook, pinned by exact tests
- Review: xhigh — a broken or foreign `.aether/autonomy/` must never block a session
- Area: session
- Owns: `plugins/aether/bin/aether-session-start`, `tests/session-start-autonomy.test.js`
- Depends on: Task 1 — the note uses `openRun` and `runPaths`

**Files:**
- Modify: `plugins/aether/bin/aether-session-start`
- Test: `tests/session-start-autonomy.test.js`

**Interfaces:**
- Consumes: `openRun(mainRoot): Run | null` and `runPaths(mainRoot, id).diary` from `plugins/aether/lib/autonomy.js` (Task 1); `repoPaths(cwd).mainRoot` from `plugins/aether/lib/git.js`; `SESSION_BIN`, `PLUGIN`, `makeRepo`, `tempDir` from `tests/helpers.js`.
- Produces: one more part of the SessionStart context, last:

  ```text
  Autonomous run <id> is open: read <diary path> and run `aether-autonomy status` before anything else.
  ```

**Rules:**
- Add `autonomyNote()` beside `sweepNote()`. It loads `lib/git.js` and `lib/autonomy.js` from `root` (as `sweepNote` loads `lib/worktrees.js`), finds the main checkout of `process.cwd()`, and returns the note when `openRun` finds a run, or `''`. Any error returns `''`: outside a git repository, an unreadable `run.json`, or anything else.
- The context becomes `['Aether mode is active.', bootstrap(), sweepNote(), autonomyNote()].filter(Boolean).join('\n\n')`.
- Update the file's header comment to mention the note.

- [ ] **Step 1: Write the failing tests** in `tests/session-start-autonomy.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, makeRepo, tempDir } = require('./helpers.js')

function start(cwd, data) {
  const r = spawnSync(process.execPath, [SESSION_BIN], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data },
  })
  return { status: r.status, context: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : null, stderr: r.stderr }
}

// A run state as `aether-autonomy start` writes it; returns the run's diary path.
function writeRun(mainRoot, id, ended) {
  const dir = path.join(mainRoot, '.aether', 'autonomy', id)
  fs.mkdirSync(dir, { recursive: true })
  const run = {
    id,
    session: 's1',
    quote: 'trabaja por horas en esto',
    quoteTime: '2026-10-09T19:50:00.000Z',
    started: '2026-10-09T20:00:00.000Z',
    ceilings: { hours: 8, usd: 50, source: { hours: 'default', usd: 'default' } },
    spend: [],
    ended,
    outcome: ended ? 'done' : null,
  }
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run))
  return path.join(dir, 'diary.md')
}

const ID = 'auto-20261009-200000-ab12'
const note = (diary) => `Autonomous run ${ID} is open: read ${diary} and run \`aether-autonomy status\` before anything else.`

test('session start points a new Lead to the open autonomous run', (t) => {
  const repo = makeRepo(t)
  const diary = writeRun(repo.dir, ID, null)
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.context.endsWith(note(diary)), r.context.slice(-300))
})

test('the note names the main checkout, also from a linked worktree', (t) => {
  const repo = makeRepo(t)
  const diary = writeRun(repo.dir, ID, null)
  const linked = path.join(tempDir(t, 'aether-linked-'), 'wt')
  repo.git('worktree', 'add', '-q', '-b', 'feature/y', linked)
  const r = start(linked, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.context.endsWith(note(diary)), r.context.slice(-300))
})

test('no note when the run has ended, or outside a git repository', (t) => {
  const repo = makeRepo(t)
  writeRun(repo.dir, ID, '2026-10-09T22:00:00.000Z')
  const ended = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(ended.status, 0, ended.stderr)
  assert.doesNotMatch(ended.context, /Autonomous run/)
  const outside = start(tempDir(t), tempDir(t, 'aether-data-'))
  assert.equal(outside.status, 0, outside.stderr)
  assert.doesNotMatch(outside.context, /Autonomous run/)
})

test('a run state that cannot be read never blocks the session', (t) => {
  const repo = makeRepo(t)
  fs.mkdirSync(path.join(repo.dir, '.aether', 'autonomy', 'auto-x'), { recursive: true })
  fs.writeFileSync(path.join(repo.dir, '.aether', 'autonomy', 'auto-x', 'run.json'), 'nope')
  const r = start(repo.dir, tempDir(t, 'aether-data-'))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.context, /^Aether mode is active\./)
  assert.doesNotMatch(r.context, /Autonomous run/)
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/session-start-autonomy.test.js`
Expected: FAIL in the first two tests (no note in the context).

- [ ] **Step 3: Change `plugins/aether/bin/aether-session-start`** to the Rules above.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/session-start-autonomy.test.js tests/session-start.test.js`, then `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/aether/bin/aether-session-start tests/session-start-autonomy.test.js
git commit -m "feat(aether): point a new Lead to an open autonomous run at session start"
```

**Acceptance:** the tests pass; the bin keeps git mode `100755`.

### Task 9: the documents and the version

**Aether:**
- Tier: haiku — exact replacements across four files
- Area: docs
- Owns: `README.md`, `docs/decisions.md`, `plugins/aether/.claude-plugin/plugin.json`, `tests/launcher.test.js`
- Depends on: none

**Files:**
- Modify: `README.md`, `docs/decisions.md`, `plugins/aether/.claude-plugin/plugin.json`
- Test: `tests/launcher.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: version 0.5.0 and decisions A23–A25.

- [ ] **Step 1: Change the tests** in `tests/launcher.test.js`.
  - Replace the test "the manifest is version 0.4.0 and names the Lead, the Designer and the lanes" with:

    ```js
    test('the manifest is version 0.5.0 and names the Lead, the Designer, the lanes and the autonomy', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'))
      assert.equal(manifest.version, '0.5.0')
      assert.match(manifest.description, /the Lead on Sonnet/)
      assert.match(manifest.description, /the Designer on Opus/)
      assert.match(manifest.description, /Lanes run its calls on other coding plans/)
      assert.match(manifest.description, /decides as the owner's delegate/)
    })
    ```

  - In the test "the documents record the lanes: decisions, facts, and the skills that use them", replace

    ```js
      assert.match(read('README.md'), /^Version 0\.4: /m)
    ```

    with

    ```js
      assert.match(read('README.md'), /^Version 0\.5: /m)
    ```

  - Add at the end of the file:

    ```js
    test('the documents record the autonomy: decisions, the README, and no per-stage gates', () => {
      const decisions = read('docs', 'decisions.md')
      for (const id of ['A23', 'A24', 'A25']) assert.match(decisions, new RegExp(`^\\| ${id} \\|`, 'm'), id)
      assert.match(decisions, /\*\*Update \(2026-10-09, autonomy\)\.\*\*/)
      const readme = read('README.md')
      assert.match(readme, /^### Autonomy$/m)
      assert.ok(readme.includes('| `aether-autonomy` |'))
      assert.ok(readme.includes('docs/superpowers/specs/2026-10-09-lead-autonomy-design.md'))
      assert.doesNotMatch(readme, /approves the spec and the plan/)
      assert.doesNotMatch(readme, /the relay of both sides/)
    })
    ```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/launcher.test.js`
Expected: FAIL on the version (`0.4.0`).

- [ ] **Step 3: Change `plugins/aether/.claude-plugin/plugin.json`:** set `"version": "0.5.0"`, and set `"description"` to exactly:

```text
Aether mode for Claude Code: the Lead on Sonnet holds the conversation, the Designer on Opus writes specs and plans, and a parallel swarm of Haiku, Sonnet and Opus implementers builds them, each attempt supervised and every merge made one at a time. Lanes run its calls on other coding plans, such as agy, while their quota lasts. The Lead decides as the owner's delegate and, with the owner's permission, works for hours and ends with a brief.
```

- [ ] **Step 4: Change `README.md`** with these exact replacements.
  1. Replace

     ```text
     - **The Lead** is the main session, on Sonnet at `xhigh`. It holds the conversation with the owner, explores, chooses the route and runs the execution. It may design and implement spikes and bounded work.
     ```

     with

     ```text
     - **The Lead** is the main session, on Sonnet at `xhigh`. It holds the conversation with the owner, explores, chooses the route and runs the execution. It decides as the owner's delegate: it closes the Designer's rounds with the owner's intent, and brings the owner only what that intent does not settle. It may design and implement spikes and bounded work.
     ```

  2. Replace

     ```text
     Version 0.4: the Lead on Sonnet holds the conversation, the Designer on Opus writes specs and plans, each plan task sets its implementer's effort, and lanes run the swarm's calls and the Designer's rounds on other coding plans while their quota lasts.
     ```

     with

     ```text
     Version 0.5: the Lead on Sonnet holds the conversation and decides as the owner's delegate, the Designer on Opus writes specs and plans, each plan task sets its implementer's effort, and lanes run the swarm's calls and the Designer's rounds on other coding plans while their quota lasts. With the owner's permission, the Lead works for hours within ceilings of time and cost and ends with a brief, and it never asks again for what the owner authorized ([autonomy spec](docs/superpowers/specs/2026-10-09-lead-autonomy-design.md)).
     ```

  3. In the "How it works" diagram, replace `owner ── confirms the Lead's understanding, approves the spec and the plan` with `owner ── confirms the Lead's understanding, may give permission to work for hours, reviews the brief`, and replace `Lead (main session, Sonnet, xhigh): conversation, route, relay, execution` with `Lead (main session, Sonnet, xhigh): conversation, route, decisions as the owner's delegate, execution`.
  4. In the table, replace the `using-aether` row with

     ```text
     | `using-aether` skill | Injected at session start. The Lead's rules: the routes, the hand-off to the Designer, deciding with the Designer as the owner's delegate, fallbacks, autonomous runs and the execution method |
     ```

     replace the `aether-guard` row with these two rows

     ```text
     | `aether-guard` | A PreToolUse hook that refuses Write, Edit, MultiEdit and NotebookEdit under `docs/superpowers/specs/` and `docs/superpowers/plans/` to every agent but the Designer, and on the autonomy registry and run states to every agent |
     | `aether-autonomy` | The owner's standing authorizations, verified against their own words (`grant`, `revoke`, `check`, `list`), and an autonomous run's state and ceilings (`start`, `spend`, `status`, `end`) |
     ```

     and replace the SessionStart row with

     ```text
     | SessionStart hook | Injects the bootstrap, sweeps runs left untouched for 24 hours, deletes usage files not written to for 30 days, and points a new Lead to an open autonomous run |
     ```

  5. Insert this section right before `## Use Aether mode`, after the Lanes list:

     ```text
     ### Autonomy

     The Lead decides as the owner's delegate, and the owner's reviews are two: the permission to work at the start, and the brief at the end. See the [autonomy spec](docs/superpowers/specs/2026-10-09-lead-autonomy-design.md).

     - **Deciding.** The Designer's reply says who closes each round (`Decide: lead` or `owner`). The Lead closes what the owner's intent covers. Only what it does not cover, what conflicts with it, and unauthorized irreversible actions reach the owner. Failures with a defined fallback, such as a lane out of quota, never do.
     - **Standing authorizations.** When the owner authorizes a class of irreversible action in general words, the Lead records it with `aether-autonomy grant`, quoting the owner. The quote is checked against the owner's own messages in the session's transcript, and checked again when read. The classes are `merge-main`, `push`, `publish`, `deploy`, `delete`, `credentials` and `paid-call`. Everything local and reversible proceeds without asking.
     - **Autonomous runs.** The owner's permission to work for hours starts a run (`aether-autonomy start`), with ceilings of 8 hours and US$ 50 unless the owner names others. The Lead keeps a diary, keeps working while work remains, stops when done, at a ceiling or honestly, and writes a brief: what it did, decided and found, what waits for the owner's yes, what it did not finish, proposals, and time and cost.
     - **Cost.** A run's figure covers the swarm and the lanes, as `aether-report` prices them; the Lead's own turns are not added up. The time ceiling is the real guard.
     - **Permissions.** A permission prompt stops a run like a question. Start a session meant for an autonomous run with a permission mode or allow rules that cover its tools; Aether never turns permissions off.
     - **Files.** `.aether/autonomy/` in the repository's main checkout holds `grants.json`, and for each run `run.json`, `diary.md` and `brief.md`. Only `aether-autonomy` writes `grants.json` and `run.json`.
     ```

  6. Replace

     ```text
     Then work as you would with superpowers. When a plan is ready, the Lead offers three ways to execute it: superpowers' two (subagent-driven or native) and the swarm, and recommends one. The swarm needs:
     ```

     with

     ```text
     Then work as you would with superpowers. The Lead decides the design with your intent and stops at the plan with a short brief, recommending one of three ways to execute it: superpowers' two (subagent-driven or native) and the swarm. Give it permission to work for hours, and it runs to the end, chooses the method itself, and gives you the brief. The swarm needs:
     ```

  7. After the line `- `runs.jsonl` holds one record per finalized or abandoned run.` add a blank line and:

     ```text
     The autonomy registry and run states live in the repository itself, under `.aether/autonomy/` in its main checkout.
     ```

- [ ] **Step 5: Change `docs/decisions.md`** with these exact edits.
  1. Replace `The [lanes spec](superpowers/specs/2026-10-08-lanes-design.md) of 2026-10-08 updated D5, A4, A12 and A14, and added A20–A22. Each decision has a status:` with `The [lanes spec](superpowers/specs/2026-10-08-lanes-design.md) of 2026-10-08 updated D5, A4, A12 and A14, and added A20–A22. The [autonomy spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) of 2026-10-09 updated D2, A2, A13, A14 and A22, and added A23–A25. Each decision has a status:`
  2. In D2, after the paragraph that starts `**Update (2026-10-07).** superpowers replaces Spec Kit`, add a blank line and:

     ```text
     **Update (2026-10-09, autonomy).** The Lead holds superpowers' approval gates as the owner's delegate. The owner's reviews are the permission to work at the start and the brief at the end. See A23.
     ```

  3. In the A2 row, replace its last cell `Decided` with `Decided; updated by A23 (2026-10-09)`.
  4. In the A13 row, replace its last cell `Decided; built 2026-10-08` with `Decided; built 2026-10-08; updated by A23 (2026-10-09): the Lead decides as the owner's delegate instead of relaying`.
  5. In the A14 row, replace its last cell `Decided; built 2026-10-08; updated by A22 (2026-10-08)` with `Decided; built 2026-10-08; updated by A22 (2026-10-08) and A24 (2026-10-09)`.
  6. In the A22 row, replace its last cell `Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-lanes-design.md)` with `Decided 2026-10-08; see the [spec](superpowers/specs/2026-10-08-lanes-design.md); updated by A23 (2026-10-09): the Lead decides the rounds instead of relaying them`.
  7. After the A22 row, add:

     ```text
     | A23 | **The Lead decides as the owner's delegate.** It holds superpowers' approval gates with the owner's intent, chooses among the Designer's options and answers its questions. The Designer keeps the final word on design, and its reply's `Decide` line says who closes each round. Only what the intent does not cover, what conflicts with it, and unauthorized irreversible actions reach the owner. Failures with a defined fallback never do. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) |
     | A24 | **Standing authorizations** are recorded per repository, from the owner's quoted words verified against their transcript, by `aether-autonomy` alone; aether-guard refuses edits to the registry and the run states. Seven irreversible classes; everything local and reversible proceeds. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) |
     | A25 | **Autonomous runs.** The owner's permission to work for hours confirms the intent and the ceilings (8 hours and US$ 50 by default; the owner's numbers override them). The run keeps a diary, keeps going while work remains, stops at a ceiling, when done or honestly, and ends with a brief. Without the permission, the Lead stops at the plan with a short brief. | Decided 2026-10-09; see the [spec](superpowers/specs/2026-10-09-lead-autonomy-design.md) |
     ```

- [ ] **Step 6: Run the tests**

Run: `node --test tests/launcher.test.js`, then `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/decisions.md plugins/aether/.claude-plugin/plugin.json tests/launcher.test.js
git commit -m "docs(aether): document the Lead's autonomy and release 0.5.0"
```

**Acceptance:** the tests pass; `grep -n "approves the spec and the plan\|relay of both sides" README.md` prints nothing.
