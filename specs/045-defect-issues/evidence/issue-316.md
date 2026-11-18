# #316: Menores diferidos de la spec 044: 30 hallazgos menores de la revisión final

Los 30 hallazgos menores de la revisión final de la corrida del enjambre `20261117-151251-ad62` (spec 044, rama `feat/044-design-turns-and-reviews`; revisión en Opus `xhigh`, veredicto `ready-with-fixes`). Por la regla del enjambre, los menores se difieren y no se trabajan en la corrida: este issue los guarda con su evidencia para retomarlos después. Los 10 hallazgos importantes se arreglaron en la misma corrida (corrida autónoma `auto-20261117-141739-785c`).

Además, dos cosas que el revisor dejó aparte y que caben aquí:
- `claudeConfigWrite` sigue rechazando una lectura o un texto que nombra `.claude/settings.json` o `.claude/hooks` (por ejemplo, el cuerpo de un `gh issue`). Es la misma clase de falso positivo que el #315, pero R31 pedía no tocar `claudeConfigWrite`.
- `trustedWrite` (guard.js:914-928) sigue usando `writeTargets`, así que un `find` o un cuerpo de `gh` que nombra la lista de autores de confianza sigue rechazado.

### 1. The mapper is promised a plan context that its message never carries

`plugins/aether/agents/mapper.md:12`

mapper.md says "The message gives you the approved spec and the plan's context." The only message the workflow sends is `mapMessage()` (design.workflow.js:826-828): one line naming the spec path, with no plan context. An agent told to expect an input that never arrives may spend turns looking for it.

Fix: drop "and the plan's context" from mapper.md, or have mapMessage also name the feature folder and the intent card.

### 2. mapper.md never names the `map` field its answer schema requires

`plugins/aether/agents/mapper.md:22`

The workflow calls the mapper with MAP_SCHEMA. It requires one string field, `map`, with no description (design.workflow.js:203-209). An answer without a non-empty `map` is thrown away and the plan is written without a map (design.workflow.js:983-985). mapper.md describes the lines but not where they go. writer.md, by contrast, names every field of its schemas, and tests/agent-outputs.test.js pins that. The risk is low with a single field, but a wrong answer costs the whole map call.

Fix: add "Put the lines, one per requirement, in the `map` field of your answer."

### 3. The mod's SPEC rule is narrower than the feature rule the design workflow accepts

`plugins/aether/hooks/ops-command.mjs:46`

SPEC is /^specs\/\d{3}-[a-z0-9-]+\/spec\.md$/. TASKS (line 45), FEATURE in design.workflow.js:35, lib/plan-design.js:12 and lib/exam.js:16 all accept [A-Za-z0-9][A-Za-z0-9._-]*. A feature such as specs/045-API_v2 passes /aether:design, and the mod answers its `aether-plan check`. Its `aether-plan requirements` is refused by the mod and falls back to the Haiku ops agent, so the step costs a model call where none was meant, and the map step depends on that agent echoing the JSON. The plan contradicts itself here: it says "the same rule as the existing TASKS" and then gives the narrower regex, which the implementer copied. This is a plan defect more than an implementation one. Its effect is theoretical today, because all 30 folders under specs/ are lowercase-hyphen. Fix: build SPEC from the TASKS pattern, i.e. /^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*\/spec\.md$/.

### 4. No test pins the bin's USAGE, and `requirements` with no spec prints a different usage than check/compile

`tests/aether-plan.test.js:571`

The new test runs `aether-plan requirements` with no spec. That path reaches lib/plan-requirements.js main (line 54), which prints the lib's own `usage: aether-plan requirements <spec.md>` (line 43). The test therefore passes whatever the bin's USAGE says, and deleting `| aether-plan requirements <spec.md>` from bin/aether-plan would leave it green. The existing rule pinned in tests/plan-number.test.js:102-107 says a verb with no argument prints the same full usage as an unknown verb. The bin now enforces that for check/compile (bin/aether-plan:24-26) but not for requirements, so the CLI is inconsistent. Fix: assert the unknown-verb error names `aether-plan requirements <spec.md>`, and print the bin's full USAGE for `requirements` with no argument as well.

### 5. Two USAGE copies remain; the bin re-checks a missing plan to work around the stale one

`plugins/aether/bin/aether-plan:24`

lib/plan-compile.js:33-34 still holds the old USAGE without `requirements`. To keep plan-number.test.js:106 green without editing plan-compile.js, which was outside Owns, commit 0f14dab added a branch to the bin: `(verb === 'check' || verb === 'compile') && !argv[1]`. That branch repeats plan-compile's load() check and adds logic to a bin the plan said "only dispatches". Behaviour is backward-compatible: the JSON shape and exit 1 are unchanged. But the next USAGE edit has two strings to keep in step, and plan-compile's copy is now unreachable from the bin. A follow-up should keep one USAGE, exported from one module, and drop the branch.

### 6. loadThreshold's error paths are untested, and a `null` config gives a raw TypeError

`plugins/aether/lib/plan-requirements.js:17`

The plan's interface says loadThreshold "throws a clear error when the file or the key is missing or not a positive integer". The code has the three branches: not found, not JSON, and not a positive integer. Tests only call loadThreshold() on the real config. A design.json that holds `null` reaches `data.mapMinRequirements` at line 30 and throws "Cannot read properties of null", not the clear message. main still wraps it as a JSON error, so nothing breaks. Fix: guard with `data && typeof data === 'object'`, and add one test per branch using a temp configPath.

### 7. The mod case for `aether-plan requirements` was written but never run

`plugins/aether/hooks/ops.test.ts:389`

The new mod test mirrors the aether-exam recover case at line 367 and uses the same helpers: stubs, spawn, step, answered and opsPrompt. It looks consistent, but the task's acceptance list does not include `npm run test:mod` and the supervisor recorded that it was not run. The Node-side test in tests/ops-command-design.test.js does cover the parse and the bad forms. Run `npm run test:mod` before the branch merges.

### 8. The cap of 10 minor findings applies per slice, so a sliced review can give the Lead many more

`plugins/aether/workflows/run.workflow.js:2013`

reviewer.md:68 says 'Report at most 10 minor findings.' Each slice reviewer reads that line on its own, and reviewRunSliced concatenates every slice's findings (`findings.push(...checked.findings)`) with no overall cap. A run with N slices can therefore hand the Lead up to 10×N minors. This run has 10 slices, so that is up to 100. R12 asks only for the text, which is VERIFIED. But #210 asked for a cap on minors, and a reader of the result would expect a cap of 10 per review. The harm is noise in the Lead's result, because minors are not worked (R15). Fix: in the slice part of reviewerPrompt, say the cap is 10 for the slice, or keep the first 10 minors in reviewRunSliced and note how many were cut.

### 9. REVIEW_FINDINGS copies FINDINGS field by field instead of extending it

`plugins/aether/lib/lane-schemas.js:23`

Both run.workflow.js:70 and lane-schemas.js:23 repeat the four property definitions of FINDINGS (severity enum, title, file, evidence) and add `fix`. A later change to FINDINGS, such as a new severity, now has to be made in four places. The equality test in tests/aether-lane.test.js:150-157 checks one file against the other, but it does not check FINDINGS against REVIEW_FINDINGS inside either file, so the two can drift apart without a failing test. Fix: build REVIEW_FINDINGS from FINDINGS.items with spreads (`required: [...FINDINGS.items.required, 'fix']`, `properties: { ...FINDINGS.items.properties, fix: {...} }`) in both files.

### 10. No test checks a lane reviewer answer that has a fix, or one that lacks it

`tests/aether-lane.test.js:179`

lane-calls.js:485 checks every lane answer against REVIEW_SCHEMA. With `fix` now required, a lane reviewer finding without it fails as 'invalid answer: missing findings[0].fix'. That applies to final-review slices and also to the lane reviewer of a delegate (lane-delegate.js:533), which moves on to another pair or to native. The only REVIEW_SCHEMA validate case (aether-lane.test.js:179) uses READY with `findings: []`, so on the lane path nothing exercises a finding with `fix`, and nothing exercises one without it. The workflow-final-slices fixture now carries `fix`, but it asserts only the titles. Fix: add two validate cases, one with a finding that has `fix` (expect null) and one without (expect 'missing findings[0].fix').

### 11. The approval bullets come before "Re-grade each finding by its effect", and the fix route given only fits the swarm

`plugins/aether/skills/swarm/SKILL.md:141-147`

"ready-with-fixes is approved when no finding is important or critical" appears before "Re-grade each finding by its effect". The text does not say whether approval goes by the reviewer's grades or by the Lead's re-grade. The heading line now says the rule "serves the final reviewer and the reviewer of a delegate alike". The fix route that follows (line 147: a short fix on the integration branch, a relaunch, or the Writer) belongs to the swarm only. For a delegate's reviewer, "fix the critical and important findings" should mean `aether-delegate verdict --verdict fix --finding ...`, and the text never says so. Fix: add "after your re-grade" to the ready-with-fixes bullet, and add "for a delegate, through `aether-delegate verdict --verdict fix` with those findings" to the fix bullet.

### 12. The pointer sits in "Fallbacks never reach the owner" instead of "Verify before you relay" (supervisor deferral)

`plugins/aether/skills/using-aether/SKILL.md:183`

The plan put the pointer in the paragraph «Verify before you relay» (line 118). It allowed part 3 only if the two changes did not fit the 328-character margin of part 2. By my estimate the net growth is about +50 characters in the verdict paragraph plus about 97 for the pointer, so both would probably have fitted. As an item of the Fallbacks list, the reviewer-verdict rule also falls under "If the same fallback fails twice at one step, apply the repetition rule", which does not fit a verdict. Harmless, but the pointer would be easier to find under Verify.

### 13. The verdict paragraph lost the `${CLAUDE_PLUGIN_ROOT}/bin/` path for `aether-delegate approve` (supervisor deferral)

`plugins/aether/skills/using-aether/SKILL.md:136`

The old text named `${CLAUDE_PLUGIN_ROOT}/bin/aether-delegate approve --task <id>`, which session-start replaces with the absolute bin path of the loaded tree. Now every call in the paragraph is a bare name. In a `--plugin-dir` development session, bare `aether-*` names on PATH are the installed release's bins (issue #13), so `approve` can run a different build from the branch under test. The rewording also goes beyond the one sentence the brief named ("gives the verdict, merges and runs the tests" became "judges, merges and tests it", and "For the other cases" became "Otherwise"). Moving "Pass `--ignore <glob>` ..." into the paragraph about the editing worktree is accurate: `approve`'s `worktreeProblem` honors `--ignore` (lib/delegate-approve.js:148-166). Fix: put the `${CLAUDE_PLUGIN_ROOT}/bin/` prefix back on the first mention.

### 14. The R14-R16 tests check text from "Final review findings" to the end of the file, not just that section

`tests/review-verdict-rule.test.js:11`

`swarm.slice(swarm.indexOf('Final review findings'))` takes everything from that heading to the end of the file, so the R14-R16 assertions would still pass if the sentences moved to «Leftovers» or later. The plan dictated this test word for word. Fix: end the slice at the next top-level bullet (for example `indexOf('- **Leftovers:**')`).

### 15. Several of the new exemption's edges have no test

`tests/guard-skills.test.js:2416`

The R30 test covers `-delete`, `-exec` and `-fprint`. It does not cover `-execdir`, `-ok`, `-okdir`, `-fprint0`, `-fprintf` or `-fls`, although all of them are in FIND_WRITE_ACTIONS (guard.js:703). The R29 test has no case for a wrapped or path-run find (`sudo find …`, `/usr/bin/find …`), which is the case that relies on `named` instead of `words`. Neither test covers a `gh issue`/`gh pr` body with a `$(cp x <dir>/y)` substitution. Today that substitution becomes its own segment and is flagged (bash-parse.js:295-299), but no test locks that in. One loop over the missing flags and two extra commands in each test would cover them. Fix: add those cases to the existing R29 and R30 loops.

### 16. The system approves a truncated or refused answer: any non-empty end of turn counts as a passing check

`plugins/aether/hooks/delegate.mjs:214`

The mod records `answer` for any `stopReason` other than `tool_use` (delegate.mjs:214), so `max_tokens` and `refusal` are recorded too. `closeReadOnly` → `approveError` → `checkReadOnly` checks only that the answer is non-empty and no file was touched, so a cut-off or refusing answer is now approved with no reader. Before this change, the Lead read and judged it. Fix: call `closeReadOnly` only for `end_turn` (pass the stop reason to `answer`, or have the mod skip `answer`'s automatic close on other stops). A test with `stopReason: 'max_tokens'` should leave the task pending.

### 17. La prueba no fija que la corrida quedó en pausa; el plan pedía algo que la salida de quota-brake no tiene

`tests/quota-brake-continued.test.js:87`

El paso 4 de la tarea 9 pide que la salida de `quota-brake` «liste la corrida como pausada». Pero `out` (lib/autonomy-command.js:383-387) solo tiene saved, recorded, pushed, chains, skipped, notPushed y failures; ningún campo lista las corridas pausadas. Como la aceptación limita el diff a la línea de `sessions`, esa parte del paso no se podía cumplir: el defecto está en el plan, no en el código. El implementador comprobó en su lugar `chains stopped 1`, que sí prueba lo que importa. Lo que falta es una precondición: en la línea 81 solo se comprueba `crossing.status === 0` y no que la pausa se registró (`crossing.json.paused === true`, o que la entrada de `runs` de autoId diga `paused: true`). Si `brake-crossing` dejara de pausar, la prueba fallaría con un mensaje engañoso: «sleeper still alive». (El supervisor citó la línea 133, pero el archivo tiene 88 líneas.)

### 18. Falta un control negativo: una cadena de otra sesión que debe seguir viva tras el freno de una corrida retomada

`tests/quota-brake-continued.test.js:47`

La prueba nueva solo lanza un proceso, el de la sesión A, y comprueba que muere. Si la unión de sesiones se ampliara de más, por ejemplo a todas las claves del directorio run/, la prueba seguiría en verde. tests/quota-brake-command.test.js:187 sí deja viva una cadena de 'other-sess', pero en una corrida sin `continue`. Con un tercer proceso, clave `fileKey('sess-C','t2')`, comprobado vivo al final, quedaría fijado que `quota-brake` detiene las sesiones A y B de la corrida y ninguna más.

### 19. Troubleshooting still sends the reader 'above' to a section that is below (R22 phrase only partly fixed; deferred by the task-12 supervisor)

`docs/guide/troubleshooting.md:52`

The new sentence says 'as with a `Quota unavailable` line above', but the section '## The /harnesses panel says «Quota unavailable» or «enabled, not installed»' is at line 132, below it. The same section (line 136) also says a missing CLI shows `enabled, not installed`, not `Quota unavailable`, so the sentence mixes the two marks. R22 asks the page to stop saying what misleads, and a reader who looks above finds nothing. Fix: link to `#the-harnesses-panel-says-quota-unavailable-or-enabled-not-installed` and say 'below'. The R22 test (tests/docs-facts.test.js, 'a harness that could not be read…') checks only that the old phrase is gone and that `Quota unavailable` appears, so it does not catch this.

### 20. The designing skill does not tell the Lead that the workflow has already relaunched the Examiner, so it still orders another launch

`plugins/aether/skills/designing/SKILL.md:24`

Line 23 now says the workflow relaunches an Examiner that ended without an answer once, with its tests. The workflow's comment (design.workflow.js:1071) says 'There is never a third launch'. The `approved` bullet on line 24 still tells the Lead, when `exam.status` is `failed` and `.aether/exam/` holds tests that do not cover every criterion, to 'start the Examiner once more with the criteria that have no test'. After the new relaunch, that is a third Examiner (Opus) on the same partial tests that already failed twice. C4 says the Lead gets what exists 'como hoy', so this is not a spec breach. But the Task 16 interface asked that a page contradicting the new flow be corrected, and here the Lead is not told the in-workflow relaunch already ran. Suggest adding one clause: the workflow already relaunched it once, so complete the exam yourself from the tests that exist or report it, instead of starting another Examiner.

### 21. R28's evidence test only greps a test file for a word; it does not show `approve` running tests before the merge

`tests/decision-044.test.js:31`

`assert.match(approve, /runs? the (task's )?tests|test command|npm test|testCommand/i)` matches tests/delegate-approve.test.js:83 (`assert.equal(r.json.testCommand, 'npm test')`). That assertion is about the test run *after* the merge: plugins/aether/lib/delegate-approve.js:250-257 merges first, then runs the tests, and keeps the merge when they fail ('the tests failed; the merge was kept'). The pre-merge run is the verdict's checks (delegate-task.js:846/864, only when the task named AETHER-TESTS). The test that shows a failed check refusing the merge is delegate-approve.test.js:190. For the same reason, A132's 'approve runs the task's tests before the merge' holds only for a task with AETHER-TESTS. The plan wrote this test verbatim, so this is a plan weakness. When the Lead closes #196, it should cite delegate-approve.test.js:190 and the verdict checks, not this grep.

### 22. No decision amends A124, which still says the Examiner's maxTurns stays at 40

`docs/decisions.md:312`

A124 clause (5) says '`maxTurns` of the Examiner is not raised and stays at 40'. Spec 044 R2 raises it to 80, and R1 raises the Writer from 60 to 100. The project records amendments explicitly (A127 'amends the law of A121'). A132 covers only the read-only delegate rule, because that is all the plan asked for, so the decision record now has a superseded clause with no pointer to what replaced it. Suggest one sentence in A132, or a separate row, saying spec 044 raised both caps, citing the owner's words «yo digo que subas los turnos».

### 23. The native branch repeats checkedAfter's check-and-retry logic (deferred by the task-14 supervisor)

`plugins/aether/workflows/design.workflow.js:1148`

Lines 1148-1157 copy checkedAfter (around line 990) line for line, with the same failure steps and messages. The two copies can drift apart. Fix: `const checkedTasks = await checkedAfter('tasks write', tasksMessage(), writeTasks)` and take `checkedTasks.retried || tasks` as the final answer.

### 24. Both new schemas describe commit as covering plan.md and tasks.md (deferred by the task-14 supervisor)

`plugins/aether/workflows/design.workflow.js:127`

The `commit` description in PLAN_WRITER_SCHEMA (line 127) and in TASKS_WRITER_SCHEMA (line 139) says 'your commit of plan.md and tasks.md'. That contradicts the 'Write only plan.md' message, and the schema text reaches the model. Fix: 'your commit of plan.md' and 'your commit of tasks.md'.

### 25. The failure exits of the native two-call path have no test (deferred by the task-14 supervisor)

`tests/workflow-design.test.js:3045`

No case reaches `tasks.failed` (line 1139), the check-did-not-run exits (lines 1149 and 1155) or `again.failed` (line 1152). Only the check-fails-twice exit is covered, through 'a design that ends failed still carries the questions'. Fix: add three cases: a tasks call that answers null twice, a check that returns `{ error }`, and a retry that answers null.

### 26. The store step is copied into the relaunch branch of examine() (deferred by the task-15 supervisor)

`plugins/aether/workflows/design.workflow.js:1090`

Lines 1090-1094 repeat the native store at the end of examine() (opsTwice store, the error, the dir or stored field, the 'named no directory' failure). Fix: extract `async function storeExam()` and call it from both places.

### 27. The try/catch around the mapper call cannot be reached

`plugins/aether/workflows/design.workflow.js:973`

`call()` (lines 301-307) already catches a rejected `agent()`, logs '<label>: the agent failed' and returns null. The 'the mapper call threw' branch therefore never runs. The R6 'throws' test passes through call()'s catch and the 'ended without an answer' log. The plan asked for the try/catch on the belief that the harness rethrows. Fix: remove the try/catch, or keep it with a comment that it only guards a future call() that rethrows.

### 28. A local `message` in seatRound shadows the module helper message(err)

`plugins/aether/workflows/design.workflow.js:768`

`const message = nativeText === null …` hides `const message = (err) => …` (line 293) for the whole body of seatRound. Nothing calls message(...) there today, but a future `message(err)` placed above line 768 would throw a TDZ ReferenceError, and one placed below would call a string. Fix: rename the local to `nativeMessage`.

### 29. R4 is partial: the map step always runs on native Haiku, even with superdelegation on

`plugins/aether/workflows/design.workflow.js:974`

R4 asks for 'el modelo más barato que la escalera (o el asiento, con superdelegación) permita'. The plan narrowed this to a plain `call('mapper', MAP_PAIR…)` with no seat, so with superdelegation on a cheaper external pair is never offered. The implementation follows the plan, so the plan is narrower than the spec. Fix: either record in the spec or in decisions that the map stays native (it is already the cheapest Claude rung), or route it through a seat in a later change.

### 30. The mod's spec pattern for `aether-plan requirements` is narrower than the feature names the workflow accepts

`plugins/aether/hooks/ops-command.mjs:642`

`SPEC = /^specs\/\d{3}-[a-z0-9-]+\/spec\.md$/`, while the workflow's FEATURE (design.workflow.js:35) and the mod's own TASKS pattern allow uppercase, '.' and '_'. For such a feature, the requirements step that my unit sends goes to a model step instead of being answered by the mod. It still works, but it spends a model call. Fix: `/^specs\/\d{3}-[A-Za-z0-9][A-Za-z0-9._-]*\/spec\.md$/`.


## Comentarios

Tres menores más, de la revisión (muse `muse-wonder-1.0@max`, `ready`) del delegado `044-fix-design-flow`, que arregló los hallazgos importantes del flujo de diseño (`14f30c5`):

1. **Las formas de respuesta separadas listan `disagreements`, que ningún esquema separado tiene.** `plugins/aether/agents/writer.md:121` y `:129` piden ese campo, pero ni `PLAN_WRITER_SCHEMA` (design.workflow.js:122-132) ni `TASKS_WRITER_SCHEMA` (:134-143) lo tienen, y la unión de `full()` (:1167-1173) lo descarta. Hoy no hace daño, porque `fits()` ignora las claves de más. Arreglo: quitar las dos viñetas, o añadir el campo a los dos esquemas y unirlo en `join`.
2. **El respaldo muerto `native=null` de `writePlan` conserva el mensaje contradictorio de antes.** `design.workflow.js:1140-1141` usa por defecto el texto de una sola llamada más «Write only plan.md…». El único llamador (:1145) siempre pasa `planOnlyText`, así que hoy nadie llega ahí, pero un llamador futuro que omita el argumento volvería a meter el fallo. Arreglo: hacer obligatorio el parámetro o construir el texto de solo el plan por defecto.
3. **La prueba de las formas de respuesta busca las viñetas en toda la sección, no dentro de cada forma.** `tests/agent-turns.test.js:24-33` corta desde `## Your answer`, y varias viñetas también están bajo «After the plan and the tasks» (writer.md:105-113). Arreglo: limitar cada aserción al texto entre su encabezado y el siguiente.


