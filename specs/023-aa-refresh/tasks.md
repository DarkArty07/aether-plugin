# La tabla de modelos sigue las cifras nuevas de AA (0.28.0): tareas

**Spec:** [spec.md](spec.md)

## Global Constraints

- **Base.** Se construye sobre la rama actual (`feat/aa-refresh`), que ya trae el refresco de los datos (commit e73cf6c): `config/pairs.json`, `config/lanes.json`, `config/models/models.json` y `docs/models/README.md` están en la escala de AA del 2026-10-29. El plan es [plan.md](plan.md). Si un archivo que una tarea nombra no existe y no es suyo, la tarea se detiene y lo dice.
- **Qué es el trabajo.** Las 53 pruebas que hoy fallan lo hacen porque fijaban una cifra de la escala vieja, un escalón de Codex anterior (Terra medium para Haiku high, Sol max para Opus high, etc.) o una elección de `choose()` que depende de ellas. Cada tarea hace que las suyas digan lo que la tabla nueva da, **conservando lo que la prueba afirmaba** (su intención). Una prueba no se borra ni se debilita para ponerla en verde; si su premisa ya no es cierta en la escala nueva, se reescribe con la premisa verdadera y el informe lo dice.
- **No se cambia código del plugin.** Nada bajo `plugins/aether/lib`, `bin`, `workflows`, `hooks` ni `agents`; las únicas excepciones son los archivos que una tarea lista en su `Owns`. Si una prueba solo pasa cambiando el código, la tarea se detiene y lo dice (BLOCKED) con la prueba y la razón: el código ya fue decidido.
- **Las cifras de verdad** (AA, 2026-10-29; las filas de `config/pairs.json` las tienen todas):
- Claude Haiku 5.5: low 18.6, medium 24.6, high 29.6, xhigh 34.3, max 36.2
- Claude Sonnet 5.5: low 25.3, medium 30.3, high 41.1, xhigh 49.6, max 54.2
- Claude Opus 5.5: low 34.5, medium 48.1, high 51.7, xhigh 57, max 58.4
- agy Gemini 3.8 Flash: low 22.3, medium 30, high 30.5; Gemini 4 Argon: high 50.4; the Claude pairs of agy carry the figures of the native pair of the same model and effort
- Grok 4.7: low 30.9, high 35, xhigh 34.3
- Muse Spark 1.3 (low, medium, high and xhigh are estimates of 2026-10-30, see plan D3): low 17.8, medium 22.5, high 28.7, xhigh 33.9, max 36.4; Muse Wonder Full 1.0 high: high 51.7 (the figure of Opus high); Muse Wonder 1.0 max: max 43.3
- Codex (already on this scale): Sol low 34.5, medium 46.1, high 50.2, xhigh 52.3, max 54.5; Terra low 29.2, medium 38.1, high 42.3, xhigh 45, max 51; Luna low 9.7, medium 18.3, high 21.4, xhigh 23.3, max 27.8
- **Lo que la regla elige** está en la tabla del plan D2. Los números de una elección (puntos, costo) se leen de `config/pairs.json`; el costo por tarea no se tocó (es el del 2026-10-26).
- **Idioma y estilo.** El código, los comentarios y los mensajes van en inglés; Node.js 22 CommonJS con `'use strict'`, dos espacios, sin punto y coma, sin dependencias. Se copia el estilo del archivo que se edita.
- **Primero entender, luego cambiar.** Cada prueba en rojo se corre sola (`node --test --test-name-pattern="<nombre>" tests/<archivo>.test.js`), se lee su mensaje y se decide qué dice la tabla nueva. Se cambia el número o la elección esperados, no la lógica de la prueba, salvo que la premisa haya cambiado.
- **El resto de las pruebas en rojo no es de esta tarea.** `npm test` seguirá en rojo en las que pertenecen a otras tareas hasta que se integren; la línea base de la corrida las conoce. Cada tarea deja en verde las suyas y no rompe ninguna otra.
- **Nadie escribe bajo `specs/` ni `.specify/`.** Tampoco se publica: ni merge a `main`, ni push, ni tag, ni `claude plugin update`.
- **Ningún test usa un `codex`, `agy`, `grok` ni `muse` de verdad;** las pruebas existentes ya lo evitan y se mantiene.
- **La frase de alcance, idéntica donde un archivo la lleve:** `Deliver what was asked, at the scope asked. When that work is done and checked, stop and report. Do not add features, refactors or files that nobody asked for.`

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [US2] Pares, lanes, Spark, índice de modelos y la lista guardada de AA: pruebas en la escala nueva in tests/pairs.test.js → Task 1
- [ ] T002 [US3] Los escalones y los roles de Codex en la escala nueva in tests/codex-pairs.test.js → Task 2
- [ ] T003 [US3] Los asientos de diseño piden los puntos nuevos in tests/seats.test.js → Task 3
- [ ] T004 [US3] Llamadas de asiento, parciales, examen y diseño en la escala nueva in tests/seat-calls.test.js → Task 4
- [ ] T005 [US3] La elección y la cuota en la escala nueva in tests/superdelegation.test.js → Task 5
- [ ] T006 [US4] Las guías dicen los puntos y los escalones nuevos in docs/guide/models-by-role.md → Task 6

### Task 1: Pares, lanes, Spark, índice de modelos y la lista guardada de AA

**Aether:**
- Area: data
- Owns: `tests/pairs.test.js`, `tests/lanes.test.js`, `tests/copies-muse.test.js`, `tests/muse-spark.test.js`, `tests/models-index.test.js`, `tests/codex-models.test.js`, `tests/fixtures/aa-pairs-2026-10-29.json`, `tests/fixtures/aa-pairs-2026-10-19.json`
- Depends on: none
- Serves: R1, R2, R3, R5

**Interfaces:** none new.

The red tests of this task:

- `tests/pairs.test.js` (3 in red:
  - «the table holds the 22 pairs of the evidence with the same figures, six Claude pairs for a»
  - «C16: the Muse pair has the figure of Opus high, no cost and the owner words, and the three»
  - «referenceOf gives the native pair of a model and effort, and throws for any other»)
- `tests/lanes.test.js` (2 in red:
  - «the shipped table names each lane model with its group and roles»
  - «the shipped lane table has a muse harness with Wonder Full, Wonder 1.0 and Spark 1.3, all »)
- `tests/copies-muse.test.js` (1 in red:
  - «Muse: the declared figures of muse-wonder-full-1.0 stay as the owner left them»)
- `tests/muse-spark.test.js` (3 in red:
  - «(a) the lane table passes its own validation with the Spark entry, and the CLI lists Spark»
  - «(b) routing picks muse-spark-1.3 for Haiku and Sonnet high ahead of Wonder Full»
  - «(e) the low, medium and high rows are the owner-estimated points and costs of 2026-10-27, »)
- `tests/models-index.test.js` (1 in red:
  - «the committed models.json and README are in the shape the script writes, and every model h»)
- `tests/codex-models.test.js` (2 in red:
  - «the index lists Sol, Terra and Luna at the five efforts with the figures of AA of 2026-10-»
  - «the script, run on the saved AA list, reproduces the committed Codex records and finds eve»)

What to do, test by test:
- `tests/pairs.test.js` compares the table with `tests/fixtures/aa-pairs-2026-10-19.json` (the 22 pairs read on 2026-10-19, old scale). Create `tests/fixtures/aa-pairs-2026-10-29.json` with the same shape: copy the old fixture and replace the `intelligence` of each pair by the figure of the same pair in the list of figures above (the list is the independent source: the table in `config/pairs.json` must agree with it, and the test is there to say so); keep every other field, and set `fetchedAt` to `2026-10-29`. Point the test at the new fixture and leave the old one in place only if another test reads it (`git grep aa-pairs-2026-10-19`); otherwise delete it. The count of pairs (50) and the other structural assertions stay.
- The Muse tests (`muse-spark`, `copies-muse`, and the Muse parts of `pairs` and `lanes`) pin the Spark figures 32, 38, 41 and 45.1, the figure 53.6 of Wonder Full and 52.4 of Wonder 1.0, and the old routing. The Spark rows are now estimates of 2026-10-30 (spec R2, plan D3): low 17.8, medium 22.5, high 28.7, xhigh 33.9, max 36.4; Wonder Full has the figure of Opus high (51.7); Wonder 1.0 max is 43.3. A test that said "routing picks Spark for Haiku and Sonnet high ahead of Wonder Full" must say what `choose()` gives now (run it: Spark's estimated costs are still 0.19 to 1.3, so check which pair wins) and keep its intent: the owner's decision that Muse is a lane for these asks.
- `tests/lanes.test.js` («names each lane model with its group and roles», «muse harness…») pins the `aa` blocks of `config/lanes.json`: read the new ones.
- `tests/models-index.test.js` («the committed models.json and README are in the shape the script writes») fails because `docs/models/` now also holds `artificial-analysis-2026-10-26.md` (the owner's page, added to the repository on 2026-10-30). The folder is allowed to hold that page next to the generated `README.md`: change the assertion so, and say in the test why.
- `tests/codex-models.test.js` reads `tests/fixtures/codex/aa-api-2026-10-29.json` (the Lead re-read it on 2026-10-30: same intelligence, live speeds) and the committed `models.json`: make both tests agree with them without touching the fixture.

**Acceptance:** every red test of the six files is green and nothing else is red because of this task; the new fixture exists and the test reads it; the report lists, per test, what changed and any premise that was rewritten.

### Task 2: Los escalones y los roles de Codex en la escala nueva

**Aether:**
- Area: harness
- Owns: `tests/codex-pairs.test.js`, `tests/codex-lanes.test.js`, `tests/codex-lane.test.js`, `plugins/aether/config/lanes.json`
- Depends on: Task 1 — `tests/lanes.test.js` reads the notes of `lanes.json` that this task rewrites, so it must already say the new figures
- Serves: R4, R5

**Interfaces:** none new.

The red tests of this task:

- `tests/codex-pairs.test.js` (3 in red:
  - «C6: with Codex alone the rule puts the first step on Terra medium, its correction on Terra»
  - «R17: with the four harnesses open on the same reset, the pair the rule chooses by cost is »
  - «R18: Luna max is in the table and no native reference reaches it, so it never wins»)
- `tests/codex-lanes.test.js` (2 in red:
  - «the lane table gives Codex its three models in its one quota group (R15)»
  - «the figures of AA of the table are those of the max row of 2026-10-29»)
- `tests/codex-lane.test.js` (2 in red:
  - «the quota view and the choice treat Codex as any harness (R10)»
  - «an editing delegate runs on Codex in its own worktree and comes back as a unit branch the »)

What to do:
- The tests that fix the ladder steps («C6: with Codex alone the rule puts the first step on Terra medium, its correction on Terra high, Sonnet high on Sol medium and Opus high on Sol max», «R17: with the four harnesses open on the same reset…», «the quota view and the choice treat Codex as any harness», «an editing delegate runs on Codex…») must say the new steps of plan D2: **Haiku high → Terra low, Haiku xhigh → Terra medium, Sonnet high → Terra high, Opus high → Terra max**; the pair of a delegate for a Sonnet-high ask is now `codex/gpt-6.1-terra@high` (check what the test's world gives; the reviewer must still be another pair). Rename the test titles so they say the new steps.
- «R18: Luna max is in the table and no native reference reaches it, so it never wins» has a false premise now: Luna medium (18.3) reaches Haiku low (18.6) and wins it (US$ 0.011). Rewrite the test so that it says what is true: Luna max (27.8) is below Haiku high minus 1 point (28.6), so no Haiku-high, Sonnet or Opus ask is answered by Luna, and a Haiku-low ask is answered by Luna medium. Say it in the report.
- `plugins/aether/config/lanes.json` is yours only for the `note` of Sol and of Terra (they say which ladder steps each serves, in the old terms). Rewrite them: Terra serves Haiku high (low), Haiku xhigh (medium), Sonnet high (high) and Opus high (max); Sol serves Haiku-max-and-above asks that Terra does not reach: Sonnet xhigh (high), Sonnet max (max) and Opus medium (high). Keep the roles, groups and `aa` blocks as they are.
- Ask which Terminal-Bench the steps have: Terra low reaches 15.2 % where Haiku high reaches 21.7 %. Add that to the note of Terra as a caution, in one sentence.

**Acceptance:** every red test of the three files is green; the two notes of lanes.json say the new steps; nothing else is red because of this task; the report says the premise that was rewritten (R18) and the new pairs.

### Task 3: Los asientos de diseño piden los puntos nuevos

**Aether:**
- Area: harness
- Owns: `tests/seats.test.js`
- Depends on: none
- Serves: R5

**Interfaces:** none new.

The red tests of this task:

- `tests/seats.test.js` (12 in red:
  - «the Judge asks the points of Opus high and the cheapest pair of the quota that renews firs»
  - «the Writer asks Sonnet high (46.8), and its external effort is the pair effort, never a tr»
  - «issue 64: the Judge takes Muse when it is the only external pair left, and the note names »
  - «C12: a Judge never takes the model that wrote the document, external or native»
  - «a pair of a group that has no reading competes after the readable ones, and a pair of a ha»
  - «an external Judge reviews the commit in a disposable worktree, and its answer comes back i»
  - «a Judge that changes a file is undone and kept in a ref, and the native Judge takes the ro»
  - «a Judge whose answer breaks its schema, or that fails, gives the round to the native Judge»
  - «a Judge whose author is the one external model that reaches the points goes to another pai»
  - «the seat command refuses what it cannot run»
  - «aether-report --seats counts each seat's rounds, who answered, and why the native agent to»
  - «E7: when the external round of a Judge fails, the native Judge handed back is not the auth»)

The seats (Judge, Writer, Examiner) ask the points of a reference pair (Opus high for the Judge, Sonnet high for the Writer: now 51.7 and 41.1, they were 53.6 and 46.8) and take the pair that reaches them. The tests pin the old points in their titles and in their expectations («the Writer asks Sonnet high (46.8)») and the pair that each seat gets. Run each one, read what `choose()` gives in the world the test builds, and fix the expectation; the intent of each test (who is excluded, what the author may not be, what happens when the quota is dry) stays.

**Acceptance:** every red test of tests/seats.test.js is green and nothing else is red because of this task; the titles carry the new points.

### Task 4: Llamadas de asiento, parciales, examen y diseño en la escala nueva

**Aether:**
- Area: harness
- Owns: `tests/seat-calls.test.js`, `tests/seats-design.test.js`, `tests/seat-partial.test.js`, `tests/exam.test.js`
- Depends on: none
- Serves: R5

**Interfaces:** none new.

The red tests of this task:

- `tests/seat-calls.test.js` (3 in red:
  - «an external Judge round starts in the background and its answer comes by seat-wait, with t»
  - «the other exits of a seat are results of the round: 3 for nothing ran, 4 for a failed roun»
  - «seat-wait answers { done: false } while a round runs, and seat-stop ends it and removes it»)
- `tests/seats-design.test.js` (1 in red:
  - «the Judge answer needs a type for each finding, and its text shows it (R9)»)
- `tests/seat-partial.test.js` (2 in red:
  - «a failed Judge round and a failed Examiner round carry nothing (issue 68)»
  - «a stale partial from an earlier round is not loaded when the next round is killed before i»)
- `tests/exam.test.js` (2 in red:
  - «an external Examiner writes the exam under .aether-exam/, and Aether stores it outside the»
  - «an Examiner that writes outside .aether-exam/, or names a file it did not write, gives the»)

Same work as for the seats of tests/seats.test.js (another task owns that file): these tests run a seat or the exam through an external harness, and the pair that answers, its figures or the result that depends on them changed with the scale. Fix each expectation to what the table gives now, keeping its intent.

**Acceptance:** every red test of the four files is green and nothing else is red because of this task.

### Task 5: La elección y la cuota en la escala nueva

**Aether:**
- Area: router
- Owns: `tests/superdelegation.test.js`, `tests/lane-pick.test.js`, `tests/lane-pick-slow.test.js`, `tests/lane-refusal.test.js`
- Depends on: none
- Serves: R4, R5

**Interfaces:** none new.

The red tests of this task:

- `tests/superdelegation.test.js` (7 in red:
  - «C4: a call asks for the points of its reference pair, never for a model name alone»
  - «E4 and C6: the quota that renews first takes the call, at the cheapest pair of that quota,»
  - «C5 and R9: within a quota a pair that gives no more points than a cheaper candidate of the»
  - «C8: no pair is ever picked below the points asked minus 1, and a Sonnet xhigh call never l»
  - «C11: with every eligible quota dry the call runs native, in its reference pair; with one d»
  - «C16: Muse as the only healthy harness takes a call up to Opus high by the owner decision, »
  - «a retry excludes the pair that failed, and a harness that is off or not installed is never»)
- `tests/lane-pick.test.js` (2 in red:
  - «pick gives the pair of the quota that renews first, asks the points of the reference pair »
  - «C16: pick gives the Muse pair, by the owner decision, to an Opus high call, and nothing to»)
- `tests/lane-pick-slow.test.js` (1 in red:
  - «a slow mark holds its pair for an hour, and a mark that has run out holds nothing»)
- `tests/lane-refusal.test.js` (4 in red:
  - «a seat round on Argon that agy refuses marks Argon only, and the next round skips it for t»
  - «issue 038: with the shipped table, a refusal of Argon leaves Flash usable for the swarm, a»
  - «a pair whose key a mark holds is dry for a seat, and a pair of an unmarked key is not»
  - «a seat round lifts a mark from a reading when the group reads healthy, and a refusal's mar»)

These are the tests of the choice function and of the pick command: «a call asks for the points of its reference pair», «the quota that renews first takes the call, at the cheapest pair of that quota», «Grok xhigh against Grok high», «no pair is ever picked below the points asked minus 1», «Muse as the only healthy harness takes a call up to Opus high by the owner decision, and nothing above it», and the refusal and slow-mark ones. They pin points (46.8, 53.6, 41.2…) and the pair chosen. Fix each to the table now: for instance Grok xhigh (34.3) gives fewer points than Grok high (35), so it is dominated by it; Wonder Full (51.7) equals Opus high, so Muse still takes an Opus-high call and nothing above. Where a test builds its own small table of pairs it does not depend on the scale and is not red.

**Acceptance:** every red test of the four files is green and nothing else is red because of this task.

### Task 6: Las guías dicen los puntos y los escalones nuevos

**Aether:**
- Area: docs
- Owns: `docs/guide/models-by-role.md`, `docs/guide/lanes.md`, `docs/guide/delegates.md`, `tests/lanes-docs.test.js`, `tests/delegate-docs.test.js`, `tests/models-by-role-docs.test.js`, `tests/codex-docs.test.js`, `tests/docs-claims.test.js`, `tests/docs-claims-rest.test.js`, `tests/docs-facts.test.js`
- Depends on: none
- Serves: R6

**Interfaces:** none new.

No test is red for this task today; it can only break the documentation tests by editing text they pin, and it owns them for that.

What to do:
- `docs/guide/models-by-role.md`: the table of the Claude pairs (rows `haiku high`, `haiku xhigh`, `sonnet high`, `sonnet xhigh`, `opus medium`, `opus high`, `opus max`, around lines 55 to 63) has the points of 2026-10-26: change the points to the figures of 2026-10-29 above and keep the costs and times, saying under the table that the points are those of AA on 2026-10-29 and the cost and time per task those of 2026-10-26, which the API does not give (spec D4).
- `docs/guide/lanes.md`: the examples with points in «What a call asks for», «Who is a candidate» and «The order» (lines 19 to 21) use old figures; update them to the new ones, and rewrite the Codex **Tiers** paragraph (around line 88, «the rule gives Terra medium to the first step (Haiku high), Terra high…») with the new steps of plan D2 (Haiku high → Terra low, Haiku xhigh → Terra medium, Sonnet high → Terra high, Opus high → Terra max) and the reason: AA rescored every model on 2026-10-29 and the table is on one scale; Terra's cost is an assumption (A-P6); Terra low reaches 15.2 % of Terminal-Bench against 21.7 % of Haiku high, which the rule does not see. Say also that the table was refreshed on 2026-10-30.
- `docs/guide/delegates.md` line 109 («Opus at `high` when no pair reaches its 53.6 points») uses the old figure: 51.7.
- Do not edit `docs/changelog.md`, `docs/decisions.md`, the handoff or the README: the Lead writes them at the close.
- Run the documentation tests after each edit: `tests/docs-facts.test.js` (links, front matter), `tests/lanes-docs.test.js`, `tests/delegate-docs.test.js`, `tests/models-by-role-docs.test.js`, `tests/codex-docs.test.js`, `tests/docs-claims.test.js`, `tests/docs-claims-rest.test.js`. If one pins a sentence you changed, change the assertion to the new sentence and list it in the report.

**Acceptance:** the three guides carry no figure of the old scale and the Codex steps are the new ones; all the documentation tests pass; the report lists every assertion that was changed.
