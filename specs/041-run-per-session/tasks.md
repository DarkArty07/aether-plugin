# Tasks: una corrida autónoma por sesión (Spec 041)

**Spec:** [spec.md](spec.md)

## Global Constraints

- Node.js 22, CommonJS (`'use strict'`), no dependencies. Bins stay thin and the logic stays in `lib/`. No new bin, hook, option or product module.
- A run belongs to the session in `run.session`. One selector, `selectRun` in `plugins/aether/lib/autonomy.js`, decides which run a verb acts on (`start`, `status`, `spend`, `end`, `extend`, `brakeOff`, `launchRefusal`, `continueRun`); the quota functions read every open run through `openRuns` (Task 4). `openRun(mainRoot)` (the latest open run, as today) stays only for the start notice and the `quota-brake` command until Task 5 and Task 8 move them. The selector never writes, and its refusals change no file.
- A call that names a run by id (`status <id>`, `end <id>`, `continue <id>`) is never checked for who opened it: no owner check, no transcript, no grant, no new permission (R6, R13). No limit is shared by the project's runs.
- With one session and one run, commands, files and outputs stay exactly as today: no new key in `status`, `start` or `run.json` (a run gains `previousSessions` only after `continue`), and the message `run <id> is already open` stays word for word. A run written by the previous version (no `session`, maybe no `brakeOff`, `quotaPauses`, `quotaCrossings` or `ceilingChanges`) can still be followed and closed.
- Every message that suggests closing or continuing the run of another session names its id: `aether-autonomy end <id> --outcome incomplete`, `aether-autonomy continue <id>`. The pause-by-quota message keeps today's text when no other run is open (R6).
- `aether-plan check` accepts only requirement ids of the form `R<number>` (`plugins/aether/lib/plan.js:24`), so `R5b` cannot appear in a `Serves` line: Task 1 serves R5 and covers R5b in its tests (see `## Risks` in plan.md).
- The tests of every task after Task 1 use `tests/run-session-fixture.js` (Task 1), which gives `A`, `B`, `C`, `QUOTE`, `OFF_QUOTE`, `MIN`, `HOUR`, `T0` and `setupRuns(t, { ids, repo, dataDir })`.
- Tests run on throwaway git repositories from `tests/helpers.js`; none spends tokens or calls a model. `tests/helpers.js` removes `CLAUDE_CODE_SESSION_ID` from `process.env` (Task 2), so a test never inherits the session of the Lead or implementer that runs `npm test`: a test that needs a session passes it explicitly.
- The mod (`plugins/aether/hooks/`) is tested by `npm run test:mod`, not by `npm test`; Task 10 is checked with it.

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] [US1] Select the run of the calling session, open one run per session, refuse launches by the caller's own run only, add `status <id>` and `end <id>` in `plugins/aether/lib/autonomy.js` → Task 1
- [ ] T002 [P] [US7] Stamp the launching session into `state.json` and into the finalized record in `plugins/aether/lib/plan-compile.js`, `plugins/aether/lib/lane-delegate.js` and `plugins/aether/lib/report.js`, and keep the ambient session out of the tests in `tests/helpers.js` → Task 2
- [ ] T003 [P] [US13] Say in the Lead rules, the skill and the guides that the run is per session and how to continue it in `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/autonomous-runs/SKILL.md`, `docs/guide/autonomy.md`, `docs/es/guias/trabajar-horas.md` and `docs/reference/components.md` → Task 3
- [ ] T004 [US8] Pause every open run at a quota crossing, report and save per run in `plugins/aether/lib/autonomy.js` → Task 4
- [ ] T005 [P] [US9] Name the session's own run and, apart, the runs of other sessions in the start notice in `plugins/aether/lib/session-start.js` → Task 5
- [ ] T006 [P] [US3] Stop a stuck wait by the ceiling of the swarm's own session in `plugins/aether/lib/wt-stuck.js` → Task 6
- [ ] T007 [US7] Count in a run only the work of its sessions in `plugins/aether/lib/autonomy.js` → Task 7
- [ ] T008 [P] [US4] Give the CLI the ids, `continue` and the session of the caller in `plugins/aether/lib/autonomy-command.js` → Task 8
- [ ] T009 [US13] Continue the run of a restarted session with `continueRun` in `plugins/aether/lib/autonomy.js` → Task 9
- [ ] T010 [US8] Tell the Lead of a session whose run another session's crossing already paused, in `plugins/aether/hooks/register.js` → Task 10

### Task 1: Una corrida por sesión: selector, apertura, rechazos propios, `status <id>` y `end <id>` en `lib/autonomy.js`

**Aether:**
- Review: xhigh — a wrong selection would close, re-cap or spend on the run of another session, whose ceilings the owner approved and whose state other sessions write at the same time
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `tests/run-session-fixture.js`, `tests/autonomy-per-session.test.js`, `tests/autonomy.test.js`, `tests/autonomy-refusal.test.js`
- Depends on: none
- Serves: R1, R2, R3, R4, R5, R6, R12, R13

**Interfaces:**

All in `plugins/aether/lib/autonomy.js`. `item` is `{ run, paths }` as `runs()` yields it.

```text
openRuns(mainRoot) -> Array<item>            // every run with ended === null, in folder order
selectRun(mainRoot, { session = null, id = null } = {}) ->
  { ok: true, item }                                       // the run the call acts on
  | { ok: false, code, message, runs: Array<{ id, session }>, item? }
// code: 'no-run' | 'unknown-id' | 'not-open' | 'ambiguous' | 'foreign'; item only for 'foreign' with exactly one open run
runsFor(mainRoot, session) -> { own: item | null, others: Array<item> }   // own as selectRun would pick it (ok), others = the rest of the open runs
openRun(mainRoot) -> run | null                              // unchanged: the latest open run, kept until Task 5 and Task 8 stop calling it
start(mainRoot, { quote, session, hours, usd }, opts)         // same signature
status(mainRoot, { now, dataDir, session = null, id = null } = {})
spend(mainRoot, usd, source, { now, dataDir, session = null } = {})
end(mainRoot, outcome, { now, session = null, id = null } = {})
extend(mainRoot, { hours, usd, quote, session }, { configDir, now })     // session already there
brakeOff(mainRoot, { quote, session }, { configDir, now })               // session already there
launchRefusal(cwd, { session, dataDir, now })                            // same signature
```

`selectRun` rules, in this order. (1) With `id`: the open run with that id, whoever opened it, or `not-open` (the folder exists, its run ended) or `unknown-id`. (2) No open run: `no-run`. (3) With `session`: the open run whose `run.session` equals it (if a legacy folder state gives several, the latest); else, when exactly one run is open and it has no `session` field, that run (as today); else, when every open run lacks `session` (several), `ambiguous`; else `foreign`. (4) Without `session`: exactly one open run is that run; several are `ambiguous`.

Messages, written word for word (`list` is each open run as `<id> (session <sid>)`, `unknown` when it has no session, joined by `, `):

- `no-run`: `no open run` (today's text; the bins and `extend`/`brakeOff` callers already match it).
- `unknown-id`: `no run <id>`. `not-open`: `run <id> is not open`.
- `ambiguous`: `more than one run is open and this call does not say which is its own: <list>; name one with aether-autonomy status <id> or aether-autonomy end <id> --outcome incomplete, or pass --session <id>`
- `foreign`: `session <session> has no run open; open runs: <list>; if one is yours from a restarted session, continue it with: aether-autonomy continue <id> [or aether-autonomy continue <id2> ...]; otherwise close an old run with: aether-autonomy end <id> --outcome incomplete [or ...]` (one `continue` and one `end` clause per open run, each with its concrete id).

Behavior:

- `start`: the only refusal is `run <id> is already open` (exactly that text, `throw new Error`) when `selectRun`-style own lookup finds an open run whose `session` equals the caller's. A run of another session never blocks it. Everything else in `start` is unchanged.
- `status`: an `ok` result gives `statusOfRun` exactly as today (no new key). `no-run` gives `{ open: false }`; a closed `id` gives `{ open: false }`; an unknown `id` throws `no run <id>`. A `foreign` result with one open run gives that run's `statusOfRun` plus `foreign: true`; with several, or `ambiguous`, gives `{ open: true, selected: false, code, runs, message }`. It never writes.
- `spend`, `end`: act only on an `ok` run; on `no-run` they throw `no open run` as today; on any other refusal they throw `Error(message)` and change no file. `end` with `id` closes that run (any session's).
- `extend`, `brakeOff`: select with the `session` they already receive. On `no-run` they return `{ ok: false, reason: 'no open run' }` as today; on `ambiguous` or `foreign`, `{ ok: false, reason: message, code }` before the quote is read.
- `launchRefusal(cwd, { session })`: unchanged gate (`isAetherSession`, repo, unreadable state refusal), then `selectRun` with the session; only an `ok` run can refuse, with today's time and cost messages. A `foreign`, `ambiguous` or `no-run` result returns `null`. The quota message keeps today's text word for word when no other run is open; when `others` (from `runsFor`) is not empty it ends `...and only an old run that another session left open is closed, with: aether-autonomy end <id> --outcome incomplete` with that other run's id (several joined by ` or `).
- Keep exporting everything exported today and add `openRuns`, `selectRun` and `runsFor`. `findOpenRun` stays private: `openRun`, `brakeSettings`, `recordCrossing` and `recordSaved` still call it until Task 4; no other function does.

**Tests (write first):**

`tests/run-session-fixture.js`:

```js
'use strict'

// Support for the per-session run tests (spec 041): a project where several Lead sessions can each open a run.

const fs = require('node:fs')
const path = require('node:path')
const { tempDir, makeRepo, useDataDir } = require('./helpers.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { markSession } = require('../plugins/aether/lib/session.js')

const A = 'sess-aaaa-1111'
const B = 'sess-bbbb-2222'
const C = 'sess-cccc-3333'
const QUOTE = 'trabaja por horas en esto, no cuentes conmigo hasta acabar'
const OFF_QUOTE = 'apaga el freno de cuota, sigue trabajando aunque se agote'
const MIN = 60 * 1000
const HOUR = 60 * MIN
const T0 = Date.parse('2026-11-16T10:00:00.000Z')

const human = (text, time) =>
  JSON.stringify({ type: 'user', isSidechain: false, origin: { kind: 'human' }, entrypoint: 'sdk-cli', timestamp: time, message: { role: 'user', content: text } })

// A project, a data directory where every session is marked as a Lead session, and a Claude config directory with one
// headless transcript per session holding the owner's two quotes. open(id) starts a run for that session.
function setupRuns(t, { ids = [A, B, C], repo = makeRepo(t), dataDir = useDataDir(t) } = {}) {
  const configDir = tempDir(t, 'aether-claude-')
  const folder = path.join(configDir, 'projects', '-home-owner-project')
  fs.mkdirSync(folder, { recursive: true })
  for (const id of ids) {
    markSession(dataDir, id, 1000, { repo: repo.dir, claude: null })
    const lines = [human(QUOTE, '2026-11-16T09:50:00.000Z'), human(OFF_QUOTE, '2026-11-16T09:51:00.000Z')]
    fs.writeFileSync(path.join(folder, `${id}.jsonl`), lines.join('\n') + '\n')
  }
  let tick = 0
  const open = (id, extra = {}, now = T0 + 1000 * tick++) =>
    autonomy.start(repo.dir, { quote: QUOTE, session: id, ...extra }, { configDir, dataDir, now })
  const file = (runId) => autonomy.runPaths(repo.dir, runId).runFile
  const read = (runId) => JSON.parse(fs.readFileSync(file(runId), 'utf8'))
  const raw = (runId) => fs.readFileSync(file(runId), 'utf8')
  const patch = (runId, change) => {
    const run = read(runId)
    change(run)
    fs.writeFileSync(file(runId), JSON.stringify(run, null, 2) + '\n')
    return run
  }
  return { repo, dataDir, configDir, open, read, raw, patch }
}

module.exports = { A, B, C, QUOTE, OFF_QUOTE, MIN, HOUR, T0, human, setupRuns }
```

`tests/autonomy-per-session.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { A, B, C, QUOTE, OFF_QUOTE, MIN, HOUR, T0, setupRuns } = require('./run-session-fixture.js')

const LATER = T0 + 2 * HOUR
const sorted = (list) => [...list].sort()

test('R1: two sessions of one project each open a run, each with its folder, ceilings and diary', (t) => {
  const { repo, open, read } = setupRuns(t)
  const a = open(A, { hours: 2 })
  const b = open(B, { usd: 10 })
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  assert.notEqual(a.run.id, b.run.id)
  assert.ok(fs.existsSync(a.diary) && fs.existsSync(b.diary) && a.diary !== b.diary)
  assert.equal(read(a.run.id).session, A)
  assert.equal(read(b.run.id).session, B)
  assert.equal(read(a.run.id).ceilings.hours, 2)
  assert.equal(read(b.run.id).ceilings.usd, 10)
  assert.equal(read(a.run.id).ended, null)
  assert.deepEqual(sorted(autonomy.openRuns(repo.dir).map((x) => x.run.id)), sorted([a.run.id, b.run.id]))
})

test('R2: a session with a run open cannot open another, the message names it, and another session still can', (t) => {
  const { open } = setupRuns(t)
  const a = open(A)
  assert.throws(() => open(A), new RegExp(`run ${a.run.id} is already open`))
  assert.equal(open(B).ok, true)
})

test('R3: the lapsed time ceiling of A refuses the launches of A and never those of B or of a session with no run', (t) => {
  const { repo, dataDir, open } = setupRuns(t)
  const a = open(A, { hours: 1 })
  open(B)
  const refusal = autonomy.launchRefusal(repo.dir, { session: A, dataDir, now: LATER })
  assert.equal(refusal.stop, 'time')
  assert.equal(refusal.id, a.run.id)
  assert.equal(autonomy.launchRefusal(repo.dir, { session: B, dataDir, now: LATER }), null)
  assert.equal(autonomy.launchRefusal(repo.dir, { session: C, dataDir, now: LATER }), null)
})

test('R4: status, spend, extend, brake-off and end act on the run of the session that calls and on no other', (t) => {
  const { repo, dataDir, configDir, open, read, raw } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const aBefore = raw(a.run.id)
  assert.equal(autonomy.status(repo.dir, { session: B, dataDir, now: T0 + MIN }).id, b.run.id)
  assert.equal(autonomy.spend(repo.dir, 4, 'seat/x', { session: B, dataDir, now: T0 + MIN }).id, b.run.id)
  assert.deepEqual(read(b.run.id).spend.map((e) => e.usd), [4])
  assert.equal(autonomy.extend(repo.dir, { hours: 20, quote: QUOTE, session: B }, { configDir, now: T0 + MIN }).ok, true)
  assert.equal(read(b.run.id).ceilings.hours, 20)
  assert.equal(autonomy.brakeOff(repo.dir, { quote: OFF_QUOTE, session: B }, { configDir, now: T0 + MIN }).ok, true)
  assert.equal(read(b.run.id).brakeOff.quote, OFF_QUOTE)
  assert.equal(autonomy.end(repo.dir, 'done', { session: B, now: T0 + 2 * MIN }).id, b.run.id)
  assert.equal(read(b.run.id).outcome, 'done')
  assert.equal(raw(a.run.id), aBefore, 'the run of A is byte for byte what it was')
})

test('R5: with several runs open, a caller that does not say its session changes none and the message lists them', (t) => {
  const { repo, dataDir, open, raw } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const before = [raw(a.run.id), raw(b.run.id)]
  const names = [a.run.id, b.run.id, A, B]
  assert.throws(() => autonomy.spend(repo.dir, 1, 's', { dataDir, now: LATER }), (err) => names.every((piece) => err.message.includes(piece)))
  assert.throws(() => autonomy.end(repo.dir, 'done', { now: LATER }), (err) => names.every((piece) => err.message.includes(piece)))
  const st = autonomy.status(repo.dir, { dataDir, now: LATER })
  assert.equal(st.selected, false)
  assert.deepEqual(sorted(st.runs.map((r) => r.id)), sorted([a.run.id, b.run.id]))
  assert.deepEqual([raw(a.run.id), raw(b.run.id)], before)
})

test('R5: with one run open, a caller that does not say its session acts on it, as today', (t) => {
  const { repo, dataDir, open } = setupRuns(t)
  const a = open(A)
  assert.equal(autonomy.status(repo.dir, { dataDir, now: LATER }).id, a.run.id)
  assert.equal(autonomy.spend(repo.dir, 1, 's', { dataDir, now: LATER }).id, a.run.id)
  assert.equal(autonomy.end(repo.dir, 'done', { now: LATER }).id, a.run.id)
})

test('R5b: a known session with no run of its own changes no run of another and the message names it, its session and both ways out', (t) => {
  const { repo, dataDir, configDir, open, raw } = setupRuns(t)
  const a = open(A)
  const id = a.run.id
  const before = raw(id)
  const has = (text) => [id, A, `aether-autonomy continue ${id}`, `aether-autonomy end ${id} --outcome incomplete`].every((piece) => text.includes(piece))
  assert.throws(() => autonomy.spend(repo.dir, 1, 's', { session: C, dataDir, now: LATER }), (err) => has(err.message))
  assert.throws(() => autonomy.end(repo.dir, 'done', { session: C, now: LATER }), (err) => has(err.message))
  const widened = autonomy.extend(repo.dir, { hours: 99, quote: QUOTE, session: C }, { configDir, now: LATER })
  assert.equal(widened.ok, false)
  assert.ok(has(widened.reason), widened.reason)
  const off = autonomy.brakeOff(repo.dir, { quote: OFF_QUOTE, session: C }, { configDir, now: LATER })
  assert.equal(off.ok, false)
  assert.ok(has(off.reason), off.reason)
  const st = autonomy.status(repo.dir, { session: C, dataDir, now: LATER })
  assert.deepEqual([st.id, st.session, st.foreign], [id, A, true])
  assert.equal(raw(id), before)
})

test('R5b: with several runs of other sessions, status lists them and nothing changes', (t) => {
  const { repo, dataDir, open, raw } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const before = [raw(a.run.id), raw(b.run.id)]
  const st = autonomy.status(repo.dir, { session: C, dataDir, now: LATER })
  assert.equal(st.selected, false)
  assert.deepEqual(sorted(st.runs.map((r) => r.id)), sorted([a.run.id, b.run.id]))
  assert.deepEqual([raw(a.run.id), raw(b.run.id)], before)
})

test('R5b and R12: a run of the previous format, with no session and none of the brake fields, is acted on as today', (t) => {
  const { repo, dataDir, open, patch, read } = setupRuns(t)
  const a = open(A)
  patch(a.run.id, (run) => {
    for (const key of ['session', 'brakeOff', 'quotaPauses', 'quotaCrossings', 'ceilingChanges']) delete run[key]
  })
  const st = autonomy.status(repo.dir, { session: C, dataDir, now: LATER })
  assert.equal(st.id, a.run.id)
  assert.equal('foreign' in st, false)
  assert.equal(autonomy.spend(repo.dir, 1, 's', { session: C, dataDir, now: LATER }).id, a.run.id)
  assert.equal(autonomy.end(repo.dir, 'done', { session: C, now: LATER }).id, a.run.id)
  assert.equal(read(a.run.id).outcome, 'done')
})

test('R12: with one session the keys of start, status and run.json are those of today', (t) => {
  const { repo, dataDir, open, read } = setupRuns(t)
  const a = open(A)
  assert.deepEqual(Object.keys(a).sort(), ['diary', 'ok', 'run', 'runFile'])
  assert.deepEqual(Object.keys(read(a.run.id)).sort(), ['brakeOff', 'ceilingChanges', 'ceilings', 'ended', 'id', 'outcome', 'quotaCrossings', 'quotaPauses', 'quote', 'quoteTime', 'session', 'spend', 'started'])
  const st = autonomy.status(repo.dir, { session: A, dataDir, now: T0 + MIN })
  assert.deepEqual(Object.keys(st).sort(), ['diary', 'hours', 'id', 'idle', 'idleMinutes', 'open', 'quota', 'session', 'started', 'stop', 'swarms', 'usd'])
})

test('C3 and R6: status and end reach the run of another session by its id, with no check of who opened it', (t) => {
  const { repo, dataDir, open, read } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const stranger = 'sess-with-no-transcript-and-no-mark'
  const st = autonomy.status(repo.dir, { session: stranger, id: a.run.id, dataDir, now: LATER })
  assert.deepEqual([st.id, st.session], [a.run.id, A])
  assert.equal(autonomy.end(repo.dir, 'incomplete', { session: stranger, id: a.run.id, now: LATER }).outcome, 'incomplete')
  assert.notEqual(read(a.run.id).ended, null)
  assert.equal(read(b.run.id).ended, null)
  assert.deepEqual(autonomy.status(repo.dir, { id: a.run.id, dataDir, now: LATER }), { open: false })
  assert.throws(() => autonomy.status(repo.dir, { id: 'auto-20200101-000000-abcd', dataDir }), /no run auto-20200101-000000-abcd/)
  assert.throws(() => autonomy.end(repo.dir, 'done', { id: a.run.id, now: LATER }), /run .* is not open/)
})

test('R6: the quota-pause message names the run another session left open, and with one run it is the text of today', (t) => {
  const { repo, dataDir, open, patch } = setupRuns(t)
  const a = open(A)
  const pause = {
    started: new Date(T0).toISOString(),
    percentUsed: 96,
    threshold: 95,
    resetsAt: new Date(T0 + 3 * HOUR).toISOString(),
    resumeAt: new Date(T0 + 3 * HOUR + 2 * MIN).toISOString(),
    notify: { sent: true, reason: null },
    savedUnits: [],
  }
  patch(a.run.id, (run) => { run.quotaPauses.push(pause) })
  const today = `autonomous run ${a.run.id} is paused by the quota brake (96% used; resumeAt ${pause.resumeAt}); it is paused, not ended; start nothing of this run and wait until it resumes; and only an old run that another session left open is closed, with: aether-autonomy end --outcome incomplete`
  assert.equal(autonomy.launchRefusal(repo.dir, { session: A, dataDir, now: T0 + MIN }).message, today)
  const b = open(B)
  const message = autonomy.launchRefusal(repo.dir, { session: A, dataDir, now: T0 + MIN }).message
  assert.ok(message.includes(`aether-autonomy end ${b.run.id} --outcome incomplete`), message)
  assert.ok(!message.includes('aether-autonomy end --outcome incomplete'), message)
})
```

In `tests/autonomy.test.js` and `tests/autonomy-refusal.test.js`, change only what these behaviours make fail: a test that opens a second run for a different session expecting `is already open`, or that calls a verb for a session that has no run of its own while another is open. The existing `already open` test for the same session and the keys of today's outputs must pass untouched.

**Acceptance:**

- `node --test tests/autonomy-per-session.test.js tests/autonomy.test.js tests/autonomy-refusal.test.js` passes, and `npm test` passes for every file this task does not hand to a later task (the later tasks update `tests/quota-brake*.test.js`, `tests/aether-autonomy.test.js` and the spend tests; they must still pass here, because Task 1 does not change what they call).
- `start`, `status`, `spend`, `end`, `extend`, `brakeOff` and `launchRefusal` read the open run only through `selectRun` (`findOpenRun` stays private for `openRun`, `brakeSettings`, `recordCrossing` and `recordSaved`, which Task 4 changes; Task 1 leaves their behaviour as it is).
- With one session and one run, `start`, `status` and `run.json` have the same keys as before (the key test above) and the message `run <id> is already open` is unchanged.
- The quota message, the `continue` clause and the `end <id>` clause are word for word as in the Interfaces.

### Task 2: Anotar la sesión que lanzó cada enjambre en `state.json` y en el registro final

**Aether:**
- Area: swarm-state
- Owns: `plugins/aether/lib/plan-compile.js`, `plugins/aether/lib/lane-delegate.js`, `plugins/aether/lib/report.js`, `tests/helpers.js`, `tests/run-session-stamp.test.js`, `tests/aether-plan.test.js`, `tests/lane-delegate.test.js`, `tests/report.test.js`, `tests/report-ladder.test.js`
- Depends on: none
- Serves: R7, R8

**Interfaces:**

- `.aether/runs/<id>/state.json` gains `session: string | null`.
  - `plugins/aether/lib/plan-compile.js` `compile`: `session` is `previous.session` when the previous state has one, otherwise `env.CLAUDE_CODE_SESSION_ID || null`. A relaunch by another session keeps the first session; a relaunch of a run stamped `null` adopts the session of the relaunch.
  - `plugins/aether/lib/lane-delegate.js`: the state it writes next to `compiledAt` gets `session: charge.session` (`null` when the call had none).
- `plugins/aether/lib/report.js` `finalize`: the record appended to `runs.jsonl` gets a top-level `session`: the `session` of the run's `state.json`, read before the run directory is swept, or `null` when the file has none or cannot be read. The rest of the record is unchanged, and a line written before this change still reads.
- `tests/helpers.js`: next to the scrub of every `AETHER_*` variable, `delete process.env.CLAUDE_CODE_SESSION_ID`, with a comment that says why: `npm test` may run inside a live Lead or implementer session, and `helpers.compile`, `finishedRun` and the bins would stamp that session into every swarm; a test that needs a session passes it in the `env` of `runBin` or sets it itself.
- No reader of `state.json` or of `runs.jsonl` changes in this task.

**Tests (write first):**

`tests/run-session-stamp.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLAN_BIN, makeRepo, writePlan, runBin, useDataDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const { T0, MIN, sampleUsage, finishedRun } = require('./report-fixtures.js')
const { finalize } = require('../plugins/aether/lib/report.js')

const stateOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'))

test('R7: aether-plan compile writes the session that launches the run into state.json, and a relaunch keeps the first', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir, { CLAUDE_CODE_SESSION_ID: 'sess-one' })
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.equal(stateOf(first.json.runDir).session, 'sess-one')
  const again = runBin(PLAN_BIN, ['compile', file, '--run', first.json.runId, '--only', 'task-2'], repo.dir, { CLAUDE_CODE_SESSION_ID: 'sess-two' })
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.equal(stateOf(first.json.runDir).session, 'sess-one')
})

test('R7, R8: a compile with no session writes null, and a later relaunch by a session adopts it', (t) => {
  useDataDir(t)
  const repo = makeRepo(t)
  const file = writePlan(repo.dir, plan([task(1), task(2)]))
  const first = runBin(PLAN_BIN, ['compile', file], repo.dir)
  assert.equal(first.status, 0, first.stdout + first.stderr)
  assert.equal(stateOf(first.json.runDir).session, null)
  const again = runBin(PLAN_BIN, ['compile', file, '--run', first.json.runId, '--only', 'task-2'], repo.dir, { CLAUDE_CODE_SESSION_ID: 'sess-two' })
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.equal(stateOf(first.json.runDir).session, 'sess-two')
})

test('R7: finalize copies the session of state.json into the runs.jsonl record, and writes null when there is none', (t) => {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const stamped = finishedRun(t)
  const file = path.join(stamped.args.runDir, 'state.json')
  fs.writeFileSync(file, JSON.stringify({ ...stateOf(stamped.args.runDir), session: 'sess-one' }))
  finalize(stamped.repo.dir, stamped.args.runId, { tests: false, now: T0 + 40 * MIN })
  const bare = finishedRun(t)
  const bareState = stateOf(bare.args.runDir)
  delete bareState.session
  fs.writeFileSync(path.join(bare.args.runDir, 'state.json'), JSON.stringify(bareState))
  finalize(bare.repo.dir, bare.args.runId, { tests: false, now: T0 + 40 * MIN })
  const records = fs.readFileSync(path.join(dataDir, 'runs.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(records.find((r) => r.runId === stamped.args.runId).session, 'sess-one')
  assert.equal(records.find((r) => r.runId === bare.args.runId).session, null)
})
```

In `tests/lane-delegate.test.js`, add (it reuses the file's `agyEnv`, `roleFake`, `writeBrief`, `briefLines`, `runDelegate`):

```js
test('the state of a delegate run holds the session of the call (spec 041 R7)', (t) => {
  const repo = makeRepo(t)
  const env = agyEnv(t, { command: roleFake(t) })
  const brief = writeBrief(repo, briefLines())
  const r = runDelegate(repo, env, { brief, tests: 'node -e "process.exit(0)"', session: 'sess-delegate-1' })
  assert.equal(r.json.status, 'done', r.stdout + r.stderr)
  const state = JSON.parse(fs.readFileSync(path.join(repo.dir, '.aether', 'runs', r.json.id, 'state.json'), 'utf8'))
  assert.equal(state.session, 'sess-delegate-1')
})
```

In `tests/aether-plan.test.js`, `tests/report.test.js` and `tests/report-ladder.test.js`, change only an assertion that compares the whole `state.json` or the whole finalized record by key and now fails on the new `session` key. In any other test file that fails because it read the ambient `CLAUDE_CODE_SESSION_ID`, set the session explicitly in that test (the files that already pass it in the `env` of `runBin` need no change).

**Acceptance:**

- `node --test tests/run-session-stamp.test.js tests/aether-plan.test.js tests/lane-delegate.test.js tests/report.test.js tests/report-ladder.test.js tests/env-scrub.test.js` passes, and the same files pass when `CLAUDE_CODE_SESSION_ID=sess-ambient` is exported in the shell that runs them (the scrub is what holds).
- Nothing else about `state.json` or the record changes: `compiledAt` and `launches` behave as before, and a run compiled before this change (no `session`) still reports and finalizes.

### Task 3: Decir que la corrida es por sesión en las reglas del Lead, la skill y las guías

**Aether:**
- Area: docs
- Owns: `plugins/aether/skills/using-aether/SKILL.md`, `plugins/aether/skills/autonomous-runs/SKILL.md`, `docs/guide/autonomy.md`, `docs/es/guias/trabajar-horas.md`, `docs/reference/components.md`, `tests/run-per-session-docs.test.js`, `tests/autonomous-runs-skill.test.js`, `tests/quota-brake-docs.test.js`, `tests/docs-030.test.js`, `tests/using-aether-030.test.js`, `tests/docs-claims.test.js`
- Depends on: none
- Serves: R11, R6, R15

**Interfaces:**

The texts below must appear (a task may add words around them; it must not change them):

- `plugins/aether/skills/using-aether/SKILL.md`, in the "Autonomous runs" section: the sentence `A run belongs to the session that opened it.` and the three commands `aether-autonomy status <id>`, `aether-autonomy end <id>` and `aether-autonomy continue <id>` with one line on what each is for (see another session's run, close it, continue your own after a restart that gave the session a new id). The text added is paid for by shortening nearby text of the same part: `tests/session-start-parts.test.js` (R32) fixes that no part of the bootstrap grows over the 0.41.0 base and that each part's whole output stays within 9,800 characters. Measure with that test before and after.
- `plugins/aether/skills/autonomous-runs/SKILL.md`: the sentence `A run belongs to the session that opened it.` under **Ceilings.**, with `aether-autonomy end <id> --outcome incomplete` where it now says to close an old run another session left open (never an `end` with no id for another session's run), and in **Resuming.** the step: when the session start notice says another session's run is open and it is yours from a restart, run `aether-autonomy continue <id>` before anything else (it needs no quote), then read its diary. The headings the existing test pins stay.
- `docs/guide/autonomy.md` (the "Autonomous runs" item): `A run belongs to the session that opened it.`, that each session opens its own run with its own ceilings and diary, that the quota brake pauses every open run and each resumes by itself, that `aether-autonomy status <id>` and `aether-autonomy end <id>` reach another session's run and `aether-autonomy continue <id>` continues one after a restart, with no new permission.
- `docs/es/guias/trabajar-horas.md`: the same in Spanish, with `Cada sesión abre su propia corrida` and `aether-autonomy continue <id>`.
- `docs/reference/components.md`: in the `aether-autonomy` row, add `continue` to the list of run verbs.

**Tests (write first):**

`tests/run-per-session-docs.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8')

test('R11: the Lead rules say the run belongs to the session, how to reach another and how to continue', () => {
  const rules = read('plugins', 'aether', 'skills', 'using-aether', 'SKILL.md')
  assert.ok(rules.includes('A run belongs to the session that opened it.'))
  for (const piece of ['aether-autonomy status <id>', 'aether-autonomy end <id>', 'aether-autonomy continue <id>']) assert.ok(rules.includes(piece), piece)
})

test('R11: the autonomous-runs skill names the id forms under Ceilings and continue under Resuming', () => {
  const skill = read('plugins', 'aether', 'skills', 'autonomous-runs', 'SKILL.md')
  const ceilings = skill.slice(skill.indexOf('**Ceilings.**'), skill.indexOf('**The quota brake.**'))
  assert.ok(ceilings.includes('A run belongs to the session that opened it.'))
  assert.ok(skill.includes('aether-autonomy end <id> --outcome incomplete'))
  const resuming = skill.slice(skill.indexOf('**Resuming.**'), skill.indexOf('**An unreadable run state.**'))
  assert.ok(resuming.includes('aether-autonomy continue <id>'))
})

test('R11: the guides in both languages say the run is per session, and the components table lists continue', () => {
  const guide = read('docs', 'guide', 'autonomy.md')
  assert.ok(guide.includes('A run belongs to the session that opened it.'))
  for (const piece of ['aether-autonomy status <id>', 'aether-autonomy end <id>', 'aether-autonomy continue <id>']) assert.ok(guide.includes(piece), piece)
  const es = read('docs', 'es', 'guias', 'trabajar-horas.md')
  assert.ok(es.includes('Cada sesión abre su propia corrida'))
  assert.ok(es.includes('aether-autonomy continue <id>'))
  const row = read('docs', 'reference', 'components.md').split('\n').find((line) => line.startsWith('| `aether-autonomy` |'))
  assert.ok(row && row.includes('continue'), row)
})
```

In `tests/autonomous-runs-skill.test.js` and `tests/quota-brake-docs.test.js`, change only an assertion that pins a sentence this task rewrites (search both for `end --outcome incomplete`, `Resuming`, `Ceilings`).

**Acceptance:**

- `node --test tests/run-per-session-docs.test.js tests/autonomous-runs-skill.test.js tests/quota-brake-docs.test.js tests/session-start-parts.test.js tests/docs-facts.test.js` passes.
- The quota-brake paragraph still says the brake pauses, and only an old run another session left open is closed; the pause of a run is never closed with `end --outcome ceiling`.

### Task 4: El freno de cuota pausa todas las corridas abiertas y cada una se reanuda por su cuenta en `lib/autonomy.js`

**Aether:**
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `tests/autonomy-quota-sessions.test.js`, `tests/quota-brake.test.js`, `tests/quota-brake-settings.test.js`, `tests/quota-brake-scenarios.test.js`
- Depends on: Task 1 — uses `openRuns` and `selectRun` and the fixture, and edits the same file
- Depends on: Task 2 — `recordSaved` reads the `session` of the swarm's `state.json`
- Serves: R9, R14

**Interfaces:**

All in `plugins/aether/lib/autonomy.js`. Each keeps today's return keys for one run and adds the ones named here.

```text
recordCrossing(mainRoot, { kind, percentUsed, resetsAt, threshold, notify }, { now, dataDir, session = null })
  // every open run gets today's logic: a new pause, a duplicate pause (same resetsAt), or, when that run has brakeOff,
  // a crossing without a pause. It answers for the caller, chosen as selectRun chooses (never another session's run):
  //   - `session` with a run of its own: the result of that run, with today's keys (recorded, paused, run, resetsAt,
  //     resumeAt, duplicate?, brakeOff?, quote?). A run that another session's crossing already paused answers
  //     `duplicate: true`, as today for a repeated crossing;
  //   - `session` known but with no run of its own (selectRun says foreign or ambiguous): { recorded: true,
  //     paused: false, run: null }, every open run is still paused, but nothing is armed or prompted for a caller
  //     that has no run to stop;
  //   - no `session`: the result of the first open run, with today's keys.
  // In every case it adds `runs`: Array<{ run, paused, duplicate?, brakeOff? }> with the result of every open run.
  // no open run: { recorded: false, paused: false, reason: 'no-run' } (today). seven_day: unchanged (nothing paused).
brakeSettings(mainRoot, { session = null, now, dataDir })
  // same keys as today. With a session: openRun / brakeOff / paused of that session's run (null when it has none).
  // Without a session: openRun is the first open run, and paused is the pause of the first open run that is paused.
recordSaved(mainRoot, saved, { now })
  // saved = { run: <swarm run id>, at, units }. The target is the open run whose session (or previousSessions) equals the
  // `session` of the swarm's .aether/runs/<saved.run>/state.json; when that file has no session, every open run whose
  // window [started, ended or now] holds the swarm's compiledAt. A target with no quota pause is skipped. Return:
  //   one target written: { recorded: true, run, savedUnits }  (today's shape)
  //   several written:    the same with run = the first, plus runs: string[]
  //   no open run: { recorded: false, reason: 'no-run' }; none attributable: { recorded: false, reason: 'no-attribution' };
  //   targets found but none paused: { recorded: false, reason: 'no-pause' }
```

`brake-off` is already per run (Task 1): it keeps the brake off for the rest of that run, as today.

**Tests (write first):**

`tests/autonomy-quota-sessions.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { A, B, C, OFF_QUOTE, MIN, HOUR, T0, setupRuns } = require('./run-session-fixture.js')

const NOW = T0 + 10 * MIN
const RESET = new Date(T0 + 3 * HOUR).toISOString()
const RESUME = new Date(T0 + 3 * HOUR + autonomy.RESUME_MARGIN_MS).toISOString()
const crossing = { kind: 'five_hour', percentUsed: 96, resetsAt: RESET, threshold: 95, notify: { sent: true, reason: null } }
const stopOf = (s, session, now = NOW) => autonomy.status(s.repo.dir, { session, dataDir: s.dataDir, now }).stop

function stampSwarm(repo, swarmId, state) {
  const dir = path.join(repo.dir, '.aether', 'runs', swarmId)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ runId: swarmId, status: 'compiled', ...state }))
}
const unit = { task: 'task-1', branch: 'aether/x/task-1', head: 'abc123', merged: false }

test('R9 and R14: a crossing pauses every open run and answers with the run of the session that calls', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  const r = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: B })
  assert.deepEqual([r.recorded, r.paused, r.run, r.resumeAt], [true, true, b.run.id, RESUME])
  assert.deepEqual(r.runs.map((x) => x.run).sort(), [a.run.id, b.run.id].sort())
  for (const id of [a.run.id, b.run.id]) assert.equal(s.read(id).quotaPauses.length, 1)
  assert.deepEqual([stopOf(s, A), stopOf(s, B)], ['quota', 'quota'])
})

test('C5: the brake-off of one run resumes that run and leaves the other paused until its own resumeAt', (t) => {
  const s = setupRuns(t)
  s.open(A)
  s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  assert.equal(autonomy.brakeOff(s.repo.dir, { quote: OFF_QUOTE, session: A }, { configDir: s.configDir, now: NOW }).ok, true)
  assert.deepEqual([stopOf(s, A), stopOf(s, B)], [null, 'quota'])
  const after = T0 + 3 * HOUR + 3 * MIN
  assert.deepEqual([stopOf(s, A, after), stopOf(s, B, after)], [null, null])
})

test('R14: a crossing from a known session with no run of its own pauses every run and answers with no run, so nothing is armed for it', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  const r = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: C })
  assert.deepEqual([r.recorded, r.paused, r.run], [true, false, null])
  assert.equal(r.runs.length, 2)
  assert.equal(r.resumeAt, undefined)
  for (const id of [a.run.id, b.run.id]) assert.equal(s.read(id).quotaPauses.length, 1)
})

test('R14: a crossing from an unknown session answers with the first open run; a repeat is a duplicate for each run', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  const first = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir })
  assert.deepEqual([first.paused, first.run], [true, a.run.id])
  assert.equal(first.runs.length, 2)
  const again = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW + MIN, dataDir: s.dataDir })
  assert.equal(again.duplicate, true)
  assert.equal(again.runs.every((x) => x.duplicate === true), true)
  for (const id of [a.run.id, b.run.id]) assert.equal(s.read(id).quotaPauses.length, 1)
})

test('R9: the session whose run another session\'s crossing paused gets a duplicate answer for its own run', (t) => {
  const s = setupRuns(t)
  s.open(A)
  const b = s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  const r = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW + MIN, dataDir: s.dataDir, session: B })
  assert.deepEqual([r.run, r.paused, r.duplicate, r.resumeAt], [b.run.id, true, true, RESUME])
  assert.equal(s.read(b.run.id).quotaPauses.length, 1)
})

test('R14: a run with its brake off records the crossing without pausing, and the other run is paused', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  autonomy.brakeOff(s.repo.dir, { quote: OFF_QUOTE, session: A }, { configDir: s.configDir, now: NOW })
  const r = autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  assert.deepEqual([r.run, r.paused, r.brakeOff], [a.run.id, false, true])
  assert.equal(s.read(a.run.id).quotaPauses.length, 0)
  assert.equal(s.read(a.run.id).quotaCrossings.length, 1)
  assert.equal(s.read(b.run.id).quotaPauses.length, 1)
})

test('R14: brake-settings gives the pause of the run of the session that calls, and of any run when the session is unknown', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  autonomy.brakeOff(s.repo.dir, { quote: OFF_QUOTE, session: B }, { configDir: s.configDir, now: NOW })
  const forA = autonomy.brakeSettings(s.repo.dir, { session: A, now: NOW, dataDir: s.dataDir })
  assert.deepEqual([forA.openRun, forA.brakeOff, forA.paused.run], [a.run.id, false, a.run.id])
  const forB = autonomy.brakeSettings(s.repo.dir, { session: B, now: NOW, dataDir: s.dataDir })
  assert.deepEqual([forB.openRun, forB.brakeOff, forB.paused], [b.run.id, true, null])
  const forC = autonomy.brakeSettings(s.repo.dir, { session: C, now: NOW, dataDir: s.dataDir })
  assert.deepEqual([forC.openRun, forC.paused], [null, null])
  assert.equal(autonomy.brakeSettings(s.repo.dir, { now: NOW, dataDir: s.dataDir }).paused.run, a.run.id)
})

test('R14: the saved units of a swarm are noted in the run of the session that launched it', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  stampSwarm(s.repo, '20261116-100500-ab12', { session: B, compiledAt: new Date(T0 + 5 * MIN).toISOString() })
  const r = autonomy.recordSaved(s.repo.dir, { run: '20261116-100500-ab12', at: NOW, units: [unit] }, { now: NOW })
  assert.deepEqual([r.recorded, r.run], [true, b.run.id])
  assert.equal(s.read(b.run.id).quotaPauses[0].savedUnits.length, 1)
  assert.equal(s.read(a.run.id).quotaPauses[0].savedUnits.length, 0)
})

test('R14: with no session in the swarm state the units go to every open run whose window holds its start, and with none nothing is noted', (t) => {
  const s = setupRuns(t)
  const a = s.open(A)
  const b = s.open(B)
  autonomy.recordCrossing(s.repo.dir, crossing, { now: NOW, dataDir: s.dataDir, session: A })
  stampSwarm(s.repo, '20261116-100600-cd34', { session: null, compiledAt: new Date(T0 + 5 * MIN).toISOString() })
  const inside = autonomy.recordSaved(s.repo.dir, { run: '20261116-100600-cd34', at: NOW, units: [unit] }, { now: NOW })
  assert.equal(inside.recorded, true)
  assert.deepEqual([...inside.runs].sort(), [a.run.id, b.run.id].sort())
  stampSwarm(s.repo, '20261116-070000-ef56', { compiledAt: new Date(T0 - 3 * HOUR).toISOString() })
  const outside = autonomy.recordSaved(s.repo.dir, { run: '20261116-070000-ef56', at: NOW, units: [unit] }, { now: NOW })
  assert.deepEqual([outside.recorded, outside.reason], [false, 'no-attribution'])
})
```

In `tests/quota-brake.test.js`, `tests/quota-brake-settings.test.js` and `tests/quota-brake-scenarios.test.js`, change only what the new keys (`runs`) or the new session handling make fail; each result for one run keeps today's keys and values.

**Acceptance:**

- `node --test tests/autonomy-quota-sessions.test.js tests/quota-brake.test.js tests/quota-brake-settings.test.js tests/quota-brake-scenarios.test.js tests/autonomy-per-session.test.js` passes.
- With one open run the results of `recordCrossing`, `brakeSettings` and `recordSaved` have exactly today's keys (`runs` appears only in `recordCrossing`, and in `recordSaved` only when more than one run was written).
- No quota function asks for a run name, and `recordCrossing`, `brakeSettings` and `recordSaved` no longer call `findOpenRun`.
- A crossing never answers with the run of another session: a known session with no run of its own gets `run: null`.

### Task 5: El aviso de inicio nombra la corrida propia y, aparte, las de otras sesiones

**Aether:**
- Area: session-start
- Owns: `plugins/aether/lib/session-start.js`, `tests/session-start-sessions.test.js`, `tests/session-start-autonomy.test.js`
- Depends on: Task 1 — calls `runsFor` and `status` with a session, and uses the fixture's conventions
- Serves: R10

**Interfaces:**

`autonomyNote(cwd, session)` in `plugins/aether/lib/session-start.js` (the caller passes `input.session_id`). It calls `runsFor(mainRoot, session)` and builds the note from these sentences, joined by one space, in this order (the note stays the last thing of the context, as today):

- Own run (`own` is not null): today's sentence unchanged, `Autonomous run <id> is open: load the aether:autonomous-runs skill, then read <diary> and run \`aether-autonomy status\` before anything else.`, and, when `status(mainRoot, { session }).stop === 'quota'`, today's quota sentence, both for that run.
- No own run but other runs open: `This session has no autonomous run open.`
- Other runs open (`others` not empty): `Autonomous runs of other sessions are open (information only, not yours): <list>. If one of them is yours from a restarted session, continue it before anything else: <continues>.` where `<list>` is each as `<id> (session <sid>)` (`unknown` when it has none) joined by `, `, and `<continues>` is each as `aether-autonomy continue <id>` joined by ` or `.
- No open runs: no note (as today). With one run and one session the note is exactly today's.

The function keeps its `try`/`catch` returning `''`.

**Tests (write first):**

`tests/session-start-sessions.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { SESSION_BIN, PLUGIN, makeRepo, tempDir } = require('./helpers.js')

function start(cwd, data, sessionId, source = 'startup') {
  const input = { hook_event_name: 'SessionStart', session_id: sessionId, source, agent_type: 'aether:lead' }
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, AETHER_DATA_DIR: data }
  for (const key of ['CLAUDE_ENV_FILE', 'CLAUDE_PLUGIN_OPTION_SUPERDELEGATION', 'AETHER_SUPERDELEGATION']) delete env[key]
  const r = spawnSync(process.execPath, [SESSION_BIN], { cwd, encoding: 'utf8', input: JSON.stringify(input), env })
  return { status: r.status, context: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : null, stderr: r.stderr }
}

// A run state as `aether-autonomy start` writes it (session null writes none, as the previous version did).
function writeRun(mainRoot, id, session) {
  const dir = path.join(mainRoot, '.aether', 'autonomy', id)
  fs.mkdirSync(dir, { recursive: true })
  const run = {
    id,
    ...(session === null ? {} : { session }),
    quote: 'trabaja por horas en esto',
    quoteTime: '2026-10-09T19:50:00.000Z',
    started: '2026-10-09T20:00:00.000Z',
    ceilings: { hours: 8, usd: 50, source: { hours: 'default', usd: 'default' } },
    spend: [],
    ended: null,
    outcome: null,
  }
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify(run))
  return path.join(dir, 'diary.md')
}

const ID1 = 'auto-20261009-200000-ab12'
const ID2 = 'auto-20261009-210000-cd34'
const own = (id, diary) => `Autonomous run ${id} is open: load the aether:autonomous-runs skill, then read ${diary} and run \`aether-autonomy status\` before anything else.`
const others = (list) => `Autonomous runs of other sessions are open (information only, not yours): ${list.map(([id, s]) => `${id} (session ${s})`).join(', ')}. If one of them is yours from a restarted session, continue it before anything else: ${list.map(([id]) => `aether-autonomy continue ${id}`).join(' or ')}.`

test('R10: the own run is named, and the runs of other sessions follow apart as information with their continue command', (t) => {
  const repo = makeRepo(t)
  const diary = writeRun(repo.dir, ID1, 's1')
  writeRun(repo.dir, ID2, 's2')
  const r = start(repo.dir, tempDir(t, 'aether-data-'), 's1')
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.context.endsWith(`${own(ID1, diary)} ${others([[ID2, 's2']])}`), r.context.slice(-600))
})

test('R10 and US13: a restarted session with a new id is told it has no run, which run is open and how to continue it', (t) => {
  const repo = makeRepo(t)
  writeRun(repo.dir, ID1, 'old-session')
  const r = start(repo.dir, tempDir(t, 'aether-data-'), 'new-session')
  assert.ok(r.context.endsWith(`This session has no autonomous run open. ${others([[ID1, 'old-session']])}`), r.context.slice(-600))
  assert.ok(!r.context.includes(`Autonomous run ${ID1} is open`))
  assert.ok(r.context.includes(`aether-autonomy continue ${ID1}`))
})

test('R10, R12: with one session the note is the one of today, also for a run of the previous format with no session', (t) => {
  const repo = makeRepo(t)
  const diary = writeRun(repo.dir, ID1, 's1')
  assert.ok(start(repo.dir, tempDir(t, 'aether-data-'), 's1').context.endsWith(own(ID1, diary)))
  const old = makeRepo(t)
  const oldDiary = writeRun(old.dir, ID1, null)
  const r = start(old.dir, tempDir(t, 'aether-data-'), 's9')
  assert.ok(r.context.endsWith(own(ID1, oldDiary)), r.context.slice(-400))
  assert.ok(!r.context.includes('information only'))
})

test('R10: a session with several runs of others lists them all', (t) => {
  const repo = makeRepo(t)
  writeRun(repo.dir, ID1, 's2')
  writeRun(repo.dir, ID2, 's3')
  const r = start(repo.dir, tempDir(t, 'aether-data-'), 's1')
  assert.ok(r.context.endsWith(`This session has no autonomous run open. ${others([[ID1, 's2'], [ID2, 's3']])}`), r.context.slice(-700))
})
```

In `tests/session-start-autonomy.test.js` change nothing that still passes; a test that writes a run for session `s1` and starts as `s1` keeps today's note.

**Acceptance:**

- `node --test tests/session-start-sessions.test.js tests/session-start-autonomy.test.js tests/session-start-parts.test.js` passes; each part of the bootstrap is unchanged and the notes command's whole output stays within 9,800 characters.
- A resumed session (`source: 'resume'`) still gets no notice, and no output appears outside a Lead session.

### Task 6: Un enjambre atascado se detiene por el tope de la corrida de su sesión

**Aether:**
- Area: swarm-stuck
- Owns: `plugins/aether/lib/wt-stuck.js`, `tests/wt-stuck-sessions.test.js`, `tests/wt-stuck.test.js`, `tests/aether-wt-stuck.test.js`
- Depends on: Task 1 — `status` takes the session and marks a run of another session as `foreign`
- Depends on: Task 2 — the swarm's session comes from its `state.json`
- Serves: R3

**Interfaces:**

`plugins/aether/lib/wt-stuck.js`: `defaultStopped(mainRoot, runId)` reads `session` from `<run dir>/state.json` of the swarm run (a missing or unreadable file means no session), calls `autonomy.status(mainRoot, { session })`, and answers `true` only when `st.open && st.selected !== false && !st.foreign && st.stop === 'time'`. `stuckTick` passes its `runId` to it. Behaviour with no session in the state is today's (`status` with no session, which acts on the only open run).

**Tests (write first):**

`tests/wt-stuck-sessions.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { makeRepo, compile, useDataDir } = require('./helpers.js')
const { task, plan } = require('./plan-fixtures.js')
const wt = require('../plugins/aether/lib/worktrees.js')
const run = require('../plugins/aether/lib/run.js')
const { digest } = require('../plugins/aether/lib/lanes.js')
const stuck = require('../plugins/aether/lib/wt-stuck.js')
const { A, B, C, HOUR, setupRuns } = require('./run-session-fixture.js')

// Two open runs: A's time ceiling (1 h, opened 3 h ago) is lapsed, B's is not. One swarm run with a waiting unit.
function scenario(t, session) {
  const dataDir = useDataDir(t)
  const repo = makeRepo(t)
  const args = compile(repo, plan([task(1), task(2)]))
  wt.ensure(repo.dir, args.runId, 'task-1')
  const target = run.stuckPayloadFile(repo.dir, args.runId, 'task-1')
  const text = JSON.stringify({ reason: 'the ladder is spent (exhausted)' })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
  stuck.stuckBegin(repo.dir, args.runId, 'task-1', { payload: target, digest: digest(text) })
  const stateFile = path.join(args.runDir, 'state.json')
  fs.writeFileSync(stateFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(stateFile, 'utf8')), session }))
  const s = setupRuns(t, { ids: [A, B, C], repo, dataDir })
  s.open(A, { hours: 1 }, Date.now() - 3 * HOUR)
  s.open(B, {}, Date.now())
  return { repo, args }
}
const tick = (s) => stuck.stuckTick(s.repo.dir, s.args.runId, 'task-1', 1, { sleep: async () => {} })

test('R3: a stuck wait stops at the lapsed ceiling of the run of the swarm\'s own session', async (t) => {
  assert.equal((await tick(scenario(t, A))).stop, true)
})

test('R3: it does not stop for the ceiling of another session\'s run, nor when its session has no run, nor when it cannot tell', async (t) => {
  assert.equal((await tick(scenario(t, B))).stop, false)
  assert.equal((await tick(scenario(t, C))).stop, false)
  assert.equal((await tick(scenario(t, null))).stop, false)
})
```

In `tests/wt-stuck.test.js` and `tests/aether-wt-stuck.test.js` change nothing that still passes: the swarm of the latter's default-path test (a run of session `sess-test` over the ceiling) is compiled with no session (Task 2 scrubs the ambient one), so `status` runs with no session over the one open run, and it still stops.

**Acceptance:**

- `node --test tests/wt-stuck-sessions.test.js tests/wt-stuck.test.js tests/aether-wt-stuck.test.js` passes.
- The `stopped` function a caller injects still replaces the default, and a tick with no open run still says `stop: false`.

### Task 7: La cifra en dólares de una corrida cuenta solo el trabajo de sus sesiones

**Aether:**
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `tests/autonomy-spend-sessions.test.js`, `tests/autonomy-spend-once.test.js`, `tests/autonomy-swarm-spend.test.js`, `tests/autonomy-abandoned-run.test.js`, `tests/autonomy-delegate-window.test.js`, `tests/report-fixed.test.js`
- Depends on: Task 4 — edits the same file after it
- Depends on: Task 9 — its test continues a run with `continueRun`
- Depends on: Task 2 — reads the `session` of `state.json` and of the finalized record
- Serves: R7, R8

**Interfaces:**

`swarmSpend(mainRoot, run, { dataDir, now })` in `plugins/aether/lib/autonomy.js` keeps its window rule and adds a filter on who launched the work.

- The sessions of a run are `[run.session, ...(run.previousSessions || [])]` without empties. A swarm run counts in the run when its launching session is in that list. Its launching session is the `session` of `.aether/runs/<id>/state.json`, or, for a swarm known only by its finalized record in `runs.jsonl`, the record's `session`.
- A swarm with no launching session recorded (`null`, absent, or a state that cannot be read) counts by the window as today (R8). A run with no `session` of its own counts every swarm in its window as today.
- When a swarm's launching session is known, its report is asked for with `reportRun(mainRoot, id, { tests: false, dataDir, now, session })` so that its native requests are that session's; if that call throws because the session's usage is not found, ask for it without `session`, as today. The `info.session` used by the union of native requests is the launching session when known, else the report's own.
- `status`, `spentOf`, `launchRefusal` and the rest are unchanged; the delegate log needs no change (its lines already carry `session`).

**Tests (write first):**

`tests/autonomy-spend-sessions.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useDataDir } = require('./helpers.js')
const { T0, MIN, sampleUsage, finishedRun, sampleLaneLog } = require('./report-fixtures.js')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { report, finalize } = require('../plugins/aether/lib/report.js')
const { A, B, C, HOUR, setupRuns } = require('./run-session-fixture.js')

const cents = (x) => Math.round(x * 100) / 100

function setSession(runDir, session) {
  const file = path.join(runDir, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (session === null) delete state.session
  else state.session = session
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n')
}

// One finished swarm run (compiled at the fixtures' T0) launched by `session`, and the runs of A and B, both open
// since an hour before it and each with a 30 dollar ceiling.
function scenario(t, session) {
  const dataDir = useDataDir(t)
  sampleUsage(dataDir)
  const { repo, args } = finishedRun(t)
  sampleLaneLog(dataDir, args.runId)
  setSession(args.runDir, session)
  const s = setupRuns(t, { ids: [A, B, C], repo, dataDir })
  const a = s.open(A, { usd: 30 }, T0 - HOUR)
  const b = s.open(B, { usd: 30 }, T0 - HOUR + 1000)
  const figure = report(repo.dir, args.runId, { dataDir, tests: false }).lanes.totals.run.totalUsd
  const st = (session, now = T0 + 10 * MIN) => autonomy.status(repo.dir, { session, dataDir, now })
  return { ...s, args, a, b, figure, st }
}

test('C4: the work of a swarm counts in the run of the session that launched it and not in the other open run', (t) => {
  const s = scenario(t, A)
  const forA = s.st(A)
  const forB = s.st(B)
  assert.deepEqual(forA.swarms.runs, [{ run: s.args.runId, usd: cents(s.figure) }])
  assert.equal(forA.usd.spent, cents(s.figure))
  assert.deepEqual(forB.swarms.runs, [])
  assert.equal(forB.usd.spent, 0)
})

test('R8: a swarm with no session recorded counts by the window in every open run whose window holds it, as before', (t) => {
  const s = scenario(t, null)
  assert.equal(s.st(A).usd.spent, cents(s.figure))
  assert.equal(s.st(B).usd.spent, cents(s.figure))
})

test('C4: a finalized swarm keeps the session that launched it', (t) => {
  const s = scenario(t, A)
  finalize(s.repo.dir, s.args.runId, { tests: false, now: T0 + 40 * MIN })
  assert.equal(fs.existsSync(s.args.runDir), false)
  const forA = s.st(A, T0 + 50 * MIN)
  assert.deepEqual(forA.swarms.runs.map((r) => r.run), [s.args.runId])
  assert.ok(forA.usd.spent > 0)
  assert.deepEqual(s.st(B, T0 + 50 * MIN).swarms.runs, [])
})

test('R7: after continue, the run counts the work of the sessions before it as well', (t) => {
  const s = scenario(t, A)
  assert.equal(autonomy.continueRun(s.repo.dir, s.a.run.id, { session: C, now: T0 + 5 * MIN }).ok, true)
  const forC = s.st(C)
  assert.equal(forC.id, s.a.run.id)
  assert.equal(forC.usd.spent, cents(s.figure))
  assert.deepEqual(s.st(B).swarms.runs, [])
})
```

In `tests/autonomy-spend-once.test.js`, `tests/autonomy-swarm-spend.test.js`, `tests/autonomy-abandoned-run.test.js` and `tests/report-fixed.test.js`, change only what the filter makes fail. Their runs carry one session, and their swarms are compiled with no session because `tests/helpers.js` (Task 2) removes the ambient `CLAUDE_CODE_SESSION_ID`; a swarm with no session counts by the window as before, so their figures must not move. A test of those files that stamps a session on a swarm must stamp the session of its run.

**Acceptance:**

- `node --test tests/autonomy-spend-sessions.test.js tests/autonomy-spend-once.test.js tests/autonomy-swarm-spend.test.js tests/autonomy-abandoned-run.test.js tests/report-fixed.test.js tests/autonomy-per-session.test.js` passes, also with `CLAUDE_CODE_SESSION_ID=sess-ambient` exported in the shell.
- A swarm stamped with a session counts in exactly one run of a project with two open runs; an unstamped one counts as it did.

### Task 8: `aether-autonomy` acepta ids, `continue` y la sesión de quien llama

**Aether:**
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy-command.js`, `tests/aether-autonomy-sessions.test.js`, `tests/aether-autonomy.test.js`, `tests/quota-brake-command.test.js`
- Depends on: Task 1 — calls `status`, `end`, `spend`, `continueRun` with a session and an id
- Depends on: Task 4 — `brake-crossing` and `quota-brake` use the per-run quota functions
- Depends on: Task 9 — the `continue` verb calls `continueRun`
- Serves: R4, R5, R6, R9, R14, R15

**Interfaces:**

`plugins/aether/lib/autonomy-command.js`:

- `status [<id>] [--session <id>]`, `end [<id>] --outcome done|ceiling|incomplete [--session <id>]`, `spend <usd> --source <label> [--session <id>]`, `continue <id> [--session <id>]`. A positional `<id>` is the first argument after the verb when it does not start with `--`, checked against `/^auto-[0-9]{8}-[0-9]{6}-[0-9a-f]+$/` (anything else is a usage error). The caller's session is `--session`, else `CLAUDE_CODE_SESSION_ID`, else none (`getSession(rest, false, env)`); `continue` requires it.
- `status` prints what `autonomy.status` returns; `end` prints `{ ended: <run> }`; `spend` prints the status as today; `continue` prints `{ continued: { id, session, from, previousSessions, unchanged? } }` and exits 0, or `{ error: <reason> }` and exits 1.
- A selection refusal (`ambiguous` or `foreign` from `extend` or `brake-off`, or the `Error` of `spend` and `end`) exits 1 with `{ error: <message> }` (plus `runs` when the lib gives them); `{ verified: false, reason }` and exit 2 stay for a quote that does not verify; `no open run` stays exit 1 `{ error: 'no open run' }`.
- `brake-crossing` passes `--session` to `recordCrossing` as `{ session }`. `quota-brake` selects its in-flight swarms from the earliest `started` among all open runs, saves each and notes it with `recordSaved` (Task 4); with no open run its output is as today. No quota verb takes a run name.
- `USAGE` becomes today's string with `status [<id>] [--session <id>]`, `spend <usd> --source <label> [--session <id>]`, `end [<id>] --outcome done|ceiling|incomplete [--session <id>]` and `continue <id> [--session <id>]` in place of `status`, `spend <usd> --source <label>` and `end --outcome done|ceiling|incomplete`, `continue` placed after `end`. The header comment of the file lists the same.

**Tests (write first):**

`tests/aether-autonomy-sessions.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PLUGIN, makeRepo, tempDir, runBin, useDataDir } = require('./helpers.js')
const { A, B, C, QUOTE, OFF_QUOTE, human } = require('./run-session-fixture.js')

const BIN = path.join(PLUGIN, 'bin', 'aether-autonomy')

// A project and a config directory with a transcript per session; cli(as, args) runs the bin as that session.
function setup(t) {
  useDataDir(t)
  const repo = makeRepo(t)
  const config = tempDir(t, 'aether-claude-')
  const folder = path.join(config, 'projects', '-repo')
  fs.mkdirSync(folder, { recursive: true })
  for (const id of [A, B, C]) {
    const lines = [human(QUOTE, '2026-11-16T09:50:00.000Z'), human(OFF_QUOTE, '2026-11-16T09:51:00.000Z')]
    fs.writeFileSync(path.join(folder, `${id}.jsonl`), lines.join('\n') + '\n')
  }
  const cli = (as, args, cwd = repo.dir) => runBin(BIN, args, cwd, { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: as })
  const start = (as) => {
    const r = cli(as, ['start', '--quote', QUOTE])
    assert.equal(r.status, 0, r.stdout + r.stderr)
    return r.json.started.id
  }
  return { repo, cli, start }
}

test('R1, R2: two sessions start a run each; a second start by the same session is refused with the text of today', (t) => {
  const { cli, start } = setup(t)
  const a = start(A)
  const b = start(B)
  assert.notEqual(a, b)
  const again = cli(A, ['start', '--quote', QUOTE])
  assert.equal(again.status, 1)
  assert.deepEqual(again.json, { error: `run ${a} is already open` })
})

test('R4: status, spend and end act on the run of the calling session, and status <id> and end <id> reach another', (t) => {
  const { cli, start } = setup(t)
  const a = start(A)
  const b = start(B)
  assert.equal(cli(B, ['status']).json.id, b)
  assert.equal(cli(B, ['spend', '3', '--source', 'seat/x']).json.usd.spent, 3)
  assert.equal(cli(A, ['status']).json.usd.spent, 0)
  assert.equal(cli(B, ['status', a]).json.id, a)
  const closed = cli(C, ['end', a, '--outcome', 'incomplete'])
  assert.equal(closed.status, 0, closed.stdout + closed.stderr)
  assert.equal(closed.json.ended.outcome, 'incomplete')
  assert.equal(cli(B, ['status']).json.id, b)
  assert.equal(cli(B, ['end', '--outcome', 'done']).json.ended.id, b)
})

test('R5b: a session with no run changes none and the message names the open run, its session and both ways out', (t) => {
  const { repo, cli, start } = setup(t)
  const a = start(A)
  const file = path.join(repo.dir, '.aether', 'autonomy', a, 'run.json')
  const before = fs.readFileSync(file, 'utf8')
  const wanted = [a, A, `aether-autonomy continue ${a}`, `aether-autonomy end ${a} --outcome incomplete`]
  for (const args of [['spend', '1', '--source', 's'], ['end', '--outcome', 'done'], ['extend', '--hours', '99', '--quote', QUOTE], ['brake-off', '--quote', OFF_QUOTE]]) {
    const r = cli(C, args)
    assert.equal(r.status, 1, args.join(' ') + r.stdout)
    assert.ok(wanted.every((piece) => r.json.error.includes(piece)), r.json.error)
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before)
})

test('R15: continue makes the run of a restarted session its own; it is refused with another run open and for a closed run', (t) => {
  const { cli, start } = setup(t)
  const a = start(A)
  const done = cli(C, ['continue', a])
  assert.equal(done.status, 0, done.stdout + done.stderr)
  assert.deepEqual([done.json.continued.id, done.json.continued.session, done.json.continued.from], [a, C, A])
  assert.equal(cli(C, ['status']).json.id, a)
  const b = start(B)
  const busy = cli(B, ['continue', a])
  assert.equal(busy.status, 1)
  assert.ok(busy.json.error.includes(b), busy.json.error)
  cli(C, ['end', '--outcome', 'done'])
  assert.equal(cli(B, ['continue', a]).status, 1)
  assert.equal(cli(B, ['continue']).status, 1)
})

test('R9, R14: a crossing pauses every run and a brake-off resumes only the run of the session that gives it', (t) => {
  const { cli, start } = setup(t)
  const a = start(A)
  start(B)
  const resetsAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString()
  const crossing = cli(A, ['brake-crossing', '--kind', 'five_hour', '--percent', '96', '--resets-at', resetsAt, '--threshold', '95', '--notify', 'sent'])
  assert.equal(crossing.status, 0, crossing.stdout + crossing.stderr)
  assert.equal(crossing.json.run, a)
  assert.equal(crossing.json.runs.length, 2)
  assert.deepEqual([cli(A, ['status']).json.stop, cli(B, ['status']).json.stop], ['quota', 'quota'])
  assert.equal(cli(A, ['brake-off', '--quote', OFF_QUOTE]).status, 0)
  assert.deepEqual([cli(A, ['status']).json.stop, cli(B, ['status']).json.stop], [null, 'quota'])
  const saved = cli(B, ['quota-brake'])
  assert.equal(saved.status, 0, saved.stdout + saved.stderr)
  assert.deepEqual(saved.json, { saved: [], recorded: false, pushed: [] })
})

test('R12: with one session the outputs have the keys of today, and the usage names the new forms', (t) => {
  const { cli, start } = setup(t)
  const r = cli(A, ['start', '--quote', QUOTE])
  assert.deepEqual(Object.keys(r.json), ['started'])
  assert.deepEqual(Object.keys(r.json.started).sort(), ['ceilings', 'diary', 'id', 'runFile'])
  assert.deepEqual(Object.keys(cli(A, ['status']).json).sort(), ['diary', 'hours', 'id', 'idle', 'idleMinutes', 'open', 'quota', 'session', 'started', 'stop', 'swarms', 'usd'])
  const usage = cli(A, ['nope']).json.error
  for (const form of ['status [<id>]', 'end [<id>] --outcome done|ceiling|incomplete', 'continue <id>']) assert.ok(usage.includes(form), form)
  void start
})
```

In `tests/aether-autonomy.test.js` replace the `USAGE` constant with the new string, and change nothing else that still passes. In `tests/quota-brake-command.test.js` change only what the new keys make fail.

**Acceptance:**

- `node --test tests/aether-autonomy-sessions.test.js tests/aether-autonomy.test.js tests/quota-brake-command.test.js` passes, and `npm test` passes for the whole tree.
- `aether-autonomy` with one session prints the same keys as before; a bad id is a usage error (`USAGE`, exit 1).

### Task 9: Continuar la corrida propia tras un reinicio: `continueRun` en `lib/autonomy.js`

**Aether:**
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `tests/autonomy-continue.test.js`
- Depends on: Task 1 — uses `selectRun`, `openRuns` and the fixture
- Depends on: Task 4 — edits the same file after it
- Serves: R15, R13

**Interfaces:**

In `plugins/aether/lib/autonomy.js`, exported next to the rest:

```text
continueRun(mainRoot, id, { session = null, now = Date.now() } = {}) ->
  { ok: true, run, from: string | null, unchanged?: true } | { ok: false, reason }
```

Behavior: `continueRun` refuses with `{ ok: false, reason }` for a missing session (`continue needs the session id of the caller; pass --session <id> or set CLAUDE_CODE_SESSION_ID`), a caller that already has a different open run (`session <session> already has run <own id> open; close it before continuing another`), a run that is not open (`run <id> is not open`) or does not exist (`no run <id>`). When the run is already the caller's it changes nothing and returns `{ ok: true, run, from: session, unchanged: true }`. Otherwise it sets `run.session = session`, `run.previousSessions = [...(run.previousSessions || []), <old session>]` (the old session only when there was one; `[]` for a run with no session), appends to the diary `\n## Continuación <iso>\n\n- La corrida pasa de la sesión <old or "sin sesión"> a la sesión <new>.\n`, writes `run.json` with `writeJsonFile`, and returns `{ ok: true, run, from: <old or null> }`. It reads no transcript, asks for no quote and changes no ceiling, pause or spend.

**Tests (write first):**

`tests/autonomy-continue.test.js`:

```js
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const autonomy = require('../plugins/aether/lib/autonomy.js')
const { A, B, C, QUOTE, MIN, HOUR, T0, setupRuns } = require('./run-session-fixture.js')

const LATER = T0 + 2 * HOUR

test('R15: continue makes the named run the run of the session that calls, and that session works it with its ceilings', (t) => {
  const { repo, dataDir, configDir, open, read } = setupRuns(t)
  const a = open(A, { hours: 1 })
  const done = autonomy.continueRun(repo.dir, a.run.id, { session: B, now: T0 + 10 * MIN })
  assert.deepEqual([done.ok, done.from], [true, A])
  const run = read(a.run.id)
  assert.equal(run.session, B)
  assert.deepEqual(run.previousSessions, [A])
  assert.equal(run.ceilings.hours, 1)
  const diary = fs.readFileSync(a.diary, 'utf8')
  assert.ok(diary.includes('## Continuación') && diary.includes(A) && diary.includes(B), diary)
  assert.equal(autonomy.status(repo.dir, { session: B, dataDir, now: T0 + 20 * MIN }).id, a.run.id)
  assert.equal(autonomy.launchRefusal(repo.dir, { session: B, dataDir, now: LATER }).stop, 'time')
  assert.equal(autonomy.spend(repo.dir, 2, 'seat/y', { session: B, dataDir, now: LATER }).id, a.run.id)
  assert.equal(autonomy.extend(repo.dir, { hours: 5, quote: QUOTE, session: B }, { configDir, now: LATER }).ok, true)
  assert.equal(autonomy.end(repo.dir, 'done', { session: B, now: LATER }).outcome, 'done')
})

test('R15: continue is refused for an unknown caller, for a session that has another run, and for a run that is not open', (t) => {
  const { repo, open, raw } = setupRuns(t)
  const a = open(A)
  const b = open(B)
  const before = raw(a.run.id)
  const unknown = autonomy.continueRun(repo.dir, a.run.id, { session: null })
  assert.equal(unknown.ok, false)
  assert.match(unknown.reason, /session/)
  const busy = autonomy.continueRun(repo.dir, a.run.id, { session: B })
  assert.equal(busy.ok, false)
  assert.ok(busy.reason.includes(b.run.id), busy.reason)
  autonomy.end(repo.dir, 'done', { id: b.run.id })
  const closed = autonomy.continueRun(repo.dir, b.run.id, { session: C })
  assert.equal(closed.ok, false)
  assert.match(closed.reason, /is not open/)
  assert.equal(autonomy.continueRun(repo.dir, 'auto-20200101-000000-abcd', { session: C }).ok, false)
  assert.equal(raw(a.run.id), before)
})

test('R15: continue on a run that is already the caller\'s changes nothing, and on a run with no session it keeps no previous one', (t) => {
  const { repo, open, patch, read, raw } = setupRuns(t)
  const a = open(A)
  const before = raw(a.run.id)
  const same = autonomy.continueRun(repo.dir, a.run.id, { session: A })
  assert.deepEqual([same.ok, same.unchanged], [true, true])
  assert.equal(raw(a.run.id), before)
  patch(a.run.id, (run) => { delete run.session })
  assert.equal(autonomy.continueRun(repo.dir, a.run.id, { session: C }).ok, true)
  assert.equal(read(a.run.id).session, C)
  assert.deepEqual(read(a.run.id).previousSessions, [])
})
```

**Acceptance:**

- `node --test tests/autonomy-continue.test.js tests/autonomy-per-session.test.js tests/autonomy.test.js` passes.
- `continueRun` reads no transcript, asks for no quote and compares nothing with who opened the run (R13); a refusal changes no file.

### Task 10: El Lead de la sesión cuya corrida pausó el cruce de otra sesión también se entera de la pausa en `hooks/register.js`

**Aether:**
- Area: mod
- Owns: `plugins/aether/hooks/register.js`, `plugins/aether/hooks/quota-brake.test.ts`
- Depends on: Task 4 — once a crossing pauses every open run, the second session's own crossing answers `duplicate: true` for its run, and a caller with no run answers `run: null`
- Serves: R9, R14

**Interfaces:**

`brakeRecorded` in `plugins/aether/hooks/register.js` today submits the brake prompt only when `record.duplicate !== true && !wasPaused`. It submits it when `!wasPaused` alone, where `wasPaused` is what it is today: this session already knows a pause for that reset hour (from the settings it read, or from an earlier answer). The answer still arms the resume once per pause (`armResume`), and an answer with no `run` or `paused !== true` still does nothing. The text of the prompt does not change. Nothing else in the mod changes; `hooks/delegate.mjs` and the other hooks are not touched.

**Tests (write first):**

In `plugins/aether/hooks/quota-brake.test.ts`, replace the test `a duplicate answer arms the resume and submits no second stop` with these two, and add the third:

```ts
test('a duplicate answer to a session that had not seen the pause tells its Lead once and arms the resume', async ($, on) => {
  const s = stubs(on, { crossing: { ...PAUSED, duplicate: true } })
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  expect(s.prompts).toHaveLength(1)
  expect(s.prompts[0].text).toContain(`Autonomous run ${RUN} is now paused by the quota brake until ${RESUME}`)
  await step($)
  expect(s.prompts).toHaveLength(1)
  await s.clock.advance(Date.parse(RESUME) - NOW)
  expect(s.prompts).toHaveLength(2)
  expect(s.prompts[1].text).toContain('the five_hour window has reset')
})

test('a duplicate answer to a session that already knows the pause submits no second stop', async ($, on) => {
  const s = stubs(on, { settings: { ...SETTINGS, paused: { run: RUN, resetsAt: RESET, resumeAt: RESUME, percentUsed: 97 } }, crossing: { ...PAUSED, duplicate: true } })
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  expect(s.prompts).toEqual([])
  await s.clock.advance(Date.parse(RESUME) - NOW)
  expect(s.prompts).toHaveLength(1)
  expect(s.prompts[0].text).toContain('the five_hour window has reset')
})

test('an answer for a session with no run of its own arms nothing and prompts nothing', async ($, on) => {
  const s = stubs(on, { crossing: { recorded: true, paused: false, run: null, runs: [{ run: RUN, paused: true }] } })
  s.setLimits([{ kind: 'five_hour', percentUsed: 97, resetsAt: RESET }])
  await step($)
  expect(s.prompts).toEqual([])
  await s.clock.advance(Date.parse(RESUME) - NOW)
  expect(s.prompts).toEqual([])
})
```

**Acceptance:**

- `npm run test:mod` passes (the mod is not run by `npm test`), and `npm test` still passes.
- The first test of the file (`a five-hour crossing warns once, records the pause and wakes the Lead after the reset`) passes untouched.
