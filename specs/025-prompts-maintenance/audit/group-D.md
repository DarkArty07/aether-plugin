**Veredicto.** El grupo D casi no tiene errores de hecho: su problema es que es largo y repite mucho. Pero tiene una contradicción seria y otras cinco medias. Los sitios de prompt suman unos 62 KB de código fuente (texto más el código que lo arma) en 14 archivos; `lib/lane-work.js` no construye ninguno. Casi todo lo que los workflows dicen al Writer, Judge, Examiner, implementer, supervisor y reviewer ya está en su `agents/*.md`. En los harnesses externos llega dos o tres veces en el mismo prompt (cuerpo del rol + nota + mensaje).

Lo repetido, estimado:
- un diseño mínimo (5 llamadas): ~4,5 KB;
- un diseño con tres revisiones por documento: ~14 KB;
- cada intento del enjambre: 0,5–1 KB.

Se podrían quitar ~4,7 KB de texto fuente sin cambiar lo que se ordena. Además hay ~3,2 KB de código que solo llaman los tests. El freno es que varios tests fijan **a propósito** la misma frase en los dos lados (#91, #92, #99, R10). Para deduplicar hay que tocar esos tests, y eso lo decide el dueño.

---

## 1. `workflows/run.workflow.js` — 93 529 B (sitios: ~16,8 KB)

**Hechos.**
- Quién lo recibe:
  - implementer, supervisor, reviewer y ops, en cada intento o llamada;
  - en un nativo, su `agents/*.md` es el system prompt;
  - en una lane, `lib/lane-calls.js` antepone el cuerpo del rol y la nota.
- Sitios:
  - `opsPrompt` L314-333;
  - `implementerPrompt` L647-691 (3 347 B);
  - `supervisorPrompt` L694-743 (2 393);
  - `READING_PLAN` L753-758 (462);
  - `reviewerPrompt` L762-796 (1 947);
  - `roundLines` L635-643;
  - `describeMerge`/`mergeContext` L798-835 (van al siguiente implementer);
  - `failureContext` L855-862;
  - el informe salvado L1229-1237 (va al supervisor);
  - `NOT_A_*` L33-35;
  - `blockHint` L1609 y `deferredReview` L1778 (van al Lead).
- Pins:
  - `workflow-lanes.test.js:122` (`/^You are implementing task-1: Task 1 title\.\n/`), `:124` (paso 4 de la lane), `:187`, `:481`;
  - `workflow-next-pair.test.js:64,93,182` («## An external agent began this attempt\n<harness modelo> stopped before it finished: …»);
  - `workflow-gate.test.js:49-59` («## Gate evidence\nChecks: pass\nTests: …», «Known failures:»);
  - `workflow.test.js:790-794` y `workflow-ladder.test.js:284-285` (todo el bloque «## Ladder»);
  - `workflow-salvage.test.js:45`;
  - `aether-lane.test.js:154-156` (los esquemas iguales a los de `lane-schemas.js`);
  - unos diez tests de lanes empiezan su prompt falso con «You are implementing task-1: Task 1 title.».

**Incoherencias.**
- **Hallazgos en español dentro de prompts en inglés.**
  - Nacen en:
    - `run.workflow.js` L1347 «fuera de Owns», L1350-1351 «el intento no terminó (sin informe | el intento falló)», L1367 «la puerta falló», L1577 «el intento no cambió ningún archivo»;
    - `lib/wt-gate.js` L43, L46, L114 «salió con N», L126 «la prueba falló», L128 «falló: …»;
    - `lib/ladder.js` L17 «superó el tiempo límite».
  - Llegan al siguiente implementer y al supervisor por `roundLines` L640.
  - Son claves del ladder (`findingKey`, `GATE_CUT_KEY` en `ladder.js` L80): si se cambia el idioma, hay que cambiarlo en todos esos sitios o se rompe la regla de hallazgos repetidos.
  - Pins: `workflow-ladder.test.js:113,132,141,165,193`, `workflow-gate.test.js:62-80`, `wt-gate.test.js:61,70,77`, `ladder-gate-cut.test.js:13`.
  - Gravedad: baja.
- **«npm test» fijo.** `wt-gate.js` L114 y L123 y `ladder.js` L17 nombran `npm test` sea cual sea `graph.testCommand`. El implementer lee, por ejemplo, «[important] npm test: salió con 1 (npm test)». En un proyecto con otro comando de tests, eso nombra un comando equivocado. Gravedad: media-baja.
- **Modelo equivocado en el texto.** «Attempt N ran on <rung>» (L698, L665, `roundLines` L636) da el peldaño del ladder («haiku high»), no el par que corrió (`round.provider`). Con superdelegation, el supervisor juzga «this model» (supervisor.md L65) sobre un modelo que no corrió. Gravedad: baja.
- **Fase obsoleta.** `meta` L9 dice «Opus reviews everything the run merged», pero `reviewPlan` L1649-1651 elige Sonnet high en una corrida pequeña, o un par externo. Es texto de la interfaz. Gravedad: baja.

**Redundancia.**
- `READING_PLAN` (414 B) repite reviewer.md L26-31 (466 B) y ha divergido: «Begin your answer by turn 28» frente a «Give your report by turn 28». Ningún test lo fija.
- L668 «Read the brief first…» (140 B) es igual a implementer.md L16.
- Los pasos nativos L657-661 repiten implementer.md L20-29.
- Los pasos de lane L650-654 repiten la nota de `lane-calls.js` L55 («Skip the `aether-wt ensure`…», «Never edit the integration worktree…»). En una lane, las reglas del worktree y de `aether-wt` salen 2-3 veces.
- L740 repite supervisor.md L78; los dos lados están fijados.
- «Earlier rulings in area» (L719) repite los fallos de la misma unidad que ya están en «Earlier attempts» (`remember` en L1421/1426/1475).
- En los hallazgos del gate, `roundLines` L640 escribe el archivo dos veces (el título ya es `archivo: qué`).

**Redacción que confunde.**
- **Cuándo correr los tests.** L659-660 y L652-653 dicen «Run it in the worktree before you commit» y «a commit after each part that passes», mientras implementer.md L26 dice «Run the project's whole test command once before you commit». Una lectura corre la suite entera antes de cada commit parcial; la otra hace commits sin probar. Gravedad: media-baja.
- **L686** «It spent its budget reading.» afirma una causa para cualquier informe que falta, aunque haya sido un timeout o la cuota.
- **Límites que no se dicen.** L661 dice «60 turns» y L757 «30 turns», pero el límite que de verdad corta al supervisor y al reviewer nativos es el de 900 s (L53 `NATIVE_CAP_SECONDS`), que nadie les dice. El efecto es inferido.
- **`mergeContext` en Codex.** L829/L832 piden «Merge … and commit», y en Codex `CODEX_NOTE` prohíbe `git commit` y dice que el sandbox no escribe metadatos de Git. Inferido: imposible allí.

**Reducción segura.** ~1,2 KB.

**No tocar:**
- `opsPrompt`: hay 4 copias byte a byte (los dos workflows, `hooks/ops-command.mjs` L11-17, `ops-command-design/ladder.test.js`);
- los bloques fijados («## Ladder», «## Gate evidence», «## An external agent began…», «You are implementing»);
- las claves en español del ladder.

## 2. `workflows/design.workflow.js` — 56 663 B (~15,6 KB, de ellos 4,2 KB de esquemas)

**Hechos.**
- Quién lo recibe: Writer, Judge y Examiner, en cada ronda.
  - Nativo: cuerpo del agente + mensaje + `nativeLines` L346-350.
  - Externo: payload → `seat-start` → `seats.js seatPrompt`.
- Sitios:
  - `SCOPE` L30-31 (242 B);
  - `FINDING_FIELDS` L606-607 (238);
  - `specWriterMessage` L617-627;
  - `planWriterMessage` L629-639;
  - `reviewLines` L642-659 (1 744);
  - `JUDGE_READING_PLAN` L663-668 (448);
  - `judgeMessage` L674-683;
  - `changedText` L686-695;
  - la copia de `findingTouch`/`revisionBrief` L700-741;
  - `revisionMessage` L745-760;
  - `checkErrorsLines` L763-765;
  - `examinerMessage` L767-780;
  - `ARGS_SHAPE` L178-179 (al Lead).
- Pins en `workflow-design.test.js`:
  - `:281` (SCOPE en los cinco primeros mensajes);
  - `:282-288` («aether:specify», «[NEEDS CLARIFICATION: <question>]», «each criterion comes from the owner's words», «## Gate», «## Complexity», «Serves», «never tasks.md», «Write the exam under /repo/.aether-exam/ and nothing else.», «Your checkout is /repo: …»);
  - `:296`, `:302` (#91/#92);
  - `:308-315` (#99);
  - `:538-592` (EDIT_ONLY, «names no line», «Revise », «Your earlier verdict:», «Where those findings touch:»);
  - `:995-1128` (NATIVE_PARTIAL).
- `agents-design.test.js:9-61` fija las mismas frases en los agentes.

**Incoherencias.**
- **Writer externo corrigiendo.**
  - `corrector` L849-851 pide a `seat-start` el esquema del borrador (`SPEC_WRITER_SCHEMA`/`WRITER_SCHEMA`).
  - Pero writer.md L46 y L110-115, que va en el mismo prompt, ordena «Answer in the revision shape» (`document`…).
  - En grok/cursor (esquema dentro del prompt) se ven las dos formas. Una respuesta en la forma de revisión falla la validación (`seats.js` L884) y la ronda cuenta como fallida.
  - Gravedad: media.
- **Examiner nativo.** Se llama con `EXAMINER_SCHEMA`, pero examiner.md L58-65 dice «Exactly this, and nothing before or after it: ## Exam …». No tiene la línea de salida estructurada que sí tienen judge.md L75 y writer.md L89. Gravedad: media-baja.
- **Versión de `aether-plan`.** El Writer corre `aether-plan check` a secas (L635, L747, L764), mientras el workflow chequea con `binDir` en el PATH (L789). Inferido: en una sesión con `--plugin-dir`, el Writer podría chequear con otra versión (CLAUDE.md, #13).

**Redundancia.**
- `reviewLines` L653+L655 (868 B) copia literal de judge.md L34 (844 B); fijado en los dos lados.
- L774 (441 B) es igual a examiner.md L39-45.
- L771 repite examiner.md L22-23 y L72, y `seats.js` L544.
- L776 y `nativeLines` L348 dicen dos veces, en el mismo mensaje, que solo se escribe en `.aether-exam/`.
- L621-623 (529 B) repite writer.md L26-28 y L94-95, y specify SKILL.md L14/L16/L39/L47. En una ronda externa de spec la regla aparece 4 veces.
- L633-635 (473 B) repite writer.md L33-37, L50 y L68.
- `SCOPE` va en cada mensaje (~13 llamadas, ~3 KB por diseño) y ya está en writer.md L120, judge.md L80 y examiner.md L69.
- **Tipos de hallazgo.** Se definen en `FINDING_FIELDS`, en las descripciones de `JUDGE_SCHEMA` L87-89, en judge.md L46-48 y en `seats.js` L509: hasta cuatro veces en un prompt externo. Además divergen: el esquema dice «wrong: it says something that is not so» y judge.md L48 dice «incorrect, unsafe, impossible to test…».
- **Revisiones 2 y 3.** «Your earlier verdict» (`judgeText` L337: cada hallazgo con evidencia y arreglo) y «Where those findings touch» (`formatFindings` L721-731: los mismos hallazgos más el lugar) dan la lista dos veces. Hasta ~2 KB por revisión.

**Redacción que confunde.**
- L678 dice «Your» aunque el veredicto anterior lo haya dado otro par o el nativo.
- L664 dice «budget is 30 turns» también a Judges externos, cuyo límite es tiempo (`SEAT_CAP_SECONDS` L59).
- L654 restringe la definición de `extra` de judge.md L47 («and that the Complexity table does not justify»).

**Reducción segura.** ~2,5 KB, moviendo cada regla a su agente y tocando los pins citados.

**No tocar:** `opsPrompt`, la copia hecha a mano de `seats.js` (issue 67; el workflow no tiene módulos) y los esquemas (copias fijadas).

## 3. `lib/seats.js` — 52 829 B (~9 KB)

**Hechos.**
- `seatPrompt` L551-555 arma: `roleBody` + `seatNote` L506-545 + CLAUDE.md + mensaje (+ `answerSection` en grok/cursor).
- Parte fija, medida sin CLAUDE.md ni mensaje:

| Asiento | Bytes |
|---|---|
| Judge | 5 939 |
| Writer (spec) | 12 568 |
| Writer (plan) | 15 600 (lleva las skills plan 2 367 + tasks 4 367) |
| Examiner | 6 180 |

- En este repo se suma CLAUDE.md (11 695 B) a cada ronda.
- Pins:
  - `seats.test.js:298` y `:654` («You are the Aether Judge/Writer, run by the agy CLI rather than Claude Code.»), `:684-733`;
  - `seats-design.test.js:113`;
  - `seat-partial.test.js:33` (`CONTINUATION_LINE` completa).

**Incoherencias.**
- **El commit del Writer externo se descarta.** Se le dice «commit it» (L515, L530) pero `finishSpec`/`finishWriter` L684-734 copian el archivo y hacen su propio commit, y L889/L892 sobrescriben `commit`. Gasta turnos. Gravedad: baja.
- **Nota del Examiner.** L544 no dice «in place of the block your role describes», como sí dice la del Judge (L509). Gravedad: baja.

**Redundancia.** `findingTouch`…`revisionBrief` (L411-496, ~3,2 KB) no los llama ningún código de producción (lo dice L489-490); solo los usan los tests.

## 4. `lib/lane-calls.js` — 32 516 B (~4,6 KB)

**Hechos.**
- `callPrompt` L94-98 arma: `roleBody` + nota L54-58 o `unitReviewerNote` L66-68 + CLAUDE.md + mensaje.
- Parte fija: implementer 4 482 B, supervisor 4 778, reviewer 4 393.
- Pins: `aether-lane.test.js:195-197` (las tres notas completas), `:212` (`WORKDIR_RULE`), `:220-222`, `:367`; `codex-lane.test.js:317-324`.

**Incoherencia.** Reviewer en Codex: L50 dice «your only tool is the shell, so use it to read», y reviewer.md L22, en el mismo prompt, dice «You have no shell». Gravedad: media-baja.

**Redundancia.** ~250 B de texto común en las cuatro notas. La nota del implementer (L55) repite el mensaje de lane (`run.workflow.js` L650-653).

## 5. `lib/delegate-task.js` — 32 480 B (~4,2 KB)

**Hechos.**
- Añade secciones al prompt del Lead en una corrección o una subida: `sectionsOf` L222-239, `previousWork` L211-220, `startSection` L248-250.
- `refusedText` L296-301 es el prompt entero de un lanzamiento rechazado.
- Notas al Lead: L314, L369, L389-392, L409, L447.
- Pins: `delegate-task.test.js:59` y `:69-70` («the brief tells a delegate on Claude to apply the patch itself (issue 88)»), `delegate-mod.test.js:68-71`.

**Incoherencia (la más seria del grupo).**
- El mismo `fullPrompt` (L429) es el brief del par externo (L466, L471).
- En una corrección con carry (por defecto: `ladder.js` L145 `carry = !fromScratch`):
  1. `delegate-run.js` L199-200 pasa `--carry`.
  2. `lane-work.js` L39-42 aplica el parche en el worktree.
  3. `lane-delegate.js` L299 añade «Its uncommitted work, if any, is in the worktree. Continue from it.» (L112).
- Mientras tanto el brief (L216) dice «It is not applied in your worktree: before anything else, run `git apply <patch>` … Only when it does not apply, rebuild what it describes.»
- El parche vive en `<data dir>/delegates/patches/` (`delegate-run.js` L221), fuera del worktree al que lo limita `WORKDIR_RULE`.
- Un `git apply` de un parche ya aplicado falla, y entonces el texto manda reconstruir: trabajo duplicado o rehecho.
- Además, «## Findings to fix» va dos veces: L231 y `--findings` → `lane-delegate.js` L119.
- Gravedad: alta.

**Redacción.** L369 «Judge it with aether-delegate verdict --task <id>.» omite `--verdict`, que el bin exige (bin/aether-delegate L34).

## 6. `lib/lane-delegate.js` — 23 836 B (~2,2 KB)

**Hechos.**
- `implementerPrompt` L116-121, `CONTINUATION_BLOCK` L112, `reviewerPrompt` L125-154.
- Pins: `lane-delegate.test.js:144`, `lane-delegate-ladder.test.js:96-105`. El texto del reviewer y `CONTINUATION_BLOCK` no están fijados.

**Incoherencia.**
- L150 «Judge the diff against what the brief asks for, and nothing else.»
- Pero la nota (`lane-calls.js` L67) dice «Every other rule of your role holds», con reviewer.md: L10 (revisa una corrida entera), L12-16 (plan, spec, unidades), L41, L46 (criterios del spec) y L61.
- El rol pide documentos que esta llamada no da. Gravedad: media.

## 7. `lib/lane-work.js` — 19 823 B

Sin texto de prompt. Pone `brief.md` y `package.diff` donde las notas dicen (L37-38, L368-373; comprobado).

## 8. `lib/delegate-calls.js` — 16 333 B (~1,5 KB)

- `delegatePrompt` L76-79 = `DELEGATE_NOTE` L38-45 + «Task:» + el prompt del Lead.
- Pins: `delegate-calls.test.js:163-164`, `delegate-grok.test.js:71`.
- En grok, el formato de respuesta se dice dos veces (L44 y L72-74), ~150 B.
- En Codex, el prefijo `CODEX_NOTE` («leave your changes in the working tree… commit field») contradice L41 («never change, create or delete a file»). Gravedad: baja.

## 9. Otros

- **`lib/plan.js` `renderBrief` L443-469 (963 B; cada brief del enjambre).**
  - Pins: `plan.test.js:367-369`, `aether-plan.test.js:179-199`.
  - `- Plan:` es una ruta absoluta (`plan-compile.js` L45), fuera del worktree de una lane, mientras `- Spec:` es relativa. El reviewer ya la convierte (`run.workflow.js` L777). Gravedad: media-baja.
  - L453 repite implementer.md L25.
- **`lib/harness/codex.js` `CODEX_NOTE` L18-19.** Va en todo prompt de Codex, de cualquier rol (L76). Pins: `harness-codex.test.js:47,58-61`. Su mitad de commits no aplica a los roles de solo lectura.
- **`hooks/quota-brake.mjs` L61-68 (al Lead).** Fijado literal en `quota-brake.test.ts:74,86`. «save each swarm unit with aether-wt save» no encaja con el uso `aether-wt save <run>`, que guarda la corrida entera. «aether-autonomy quota-saved» omite `--from <saved.json>`.
- **`ops.md` L3** está obsoleta: también lo usa el diseño, y L960 manda `git -C … ls-files`, que el mod nunca contesta.

---

## Duplicados entre archivos y fuente única propuesta

El criterio: el nativo recibe el `.md` como system prompt y el externo lo recibe como `roleBody`, así que la regla vive en el `.md` y el mensaje lleva solo datos (rutas, hallazgos, salida del check, números).

| Contenido | Dónde se repite | Fuente única |
|---|---|---|
| SCOPE | 5 mensajes de diseño | writer/judge/examiner.md |
| Método del Judge para planes (L653, L655) | design workflow | judge.md L34 |
| Plan de lectura del Judge | solo en el workflow | judge.md (es su `maxTurns: 30`) |
| Tipos de hallazgo | 4 sitios | judge.md + el esquema |
| Reglas de prosa del Examiner | design L774 | examiner.md L39-45 |
| Reglas del Writer | mensajes de diseño | writer.md y las skills |
| Plan de lectura del reviewer | run L753-758 | reviewer.md L26-31 |
| Línea del ladder | run L740 | supervisor.md L78 |
| Reglas de worktree del implementer | pasos nativos y de lane | implementer.md; en lanes, la nota con los hechos de ubicación |

Las cuatro variantes de «continúa desde lo anterior» (design L356, seats L30, run L860, lane-delegate L112) están adaptadas a cada caso y fijadas: alinearlas, no fundirlas.

## Incoherencias por gravedad

1. **Alta:** `delegate-task.js` L216 frente a `lane-delegate.js` L112/L299 (carry ya aplicado, la ruta fuera del worktree, hallazgos duplicados).
2. **Media:** el esquema de corrección del Writer externo frente a writer.md L46/L110-115.
3. **Media:** el reviewer de `aether-lane delegate` frente a reviewer.md.
4. **Media-baja:** «npm test» fijo en los hallazgos del gate.
5. **Media-baja:** tests antes de cada commit frente a commit por partes.
6. **Media-baja:** ruta absoluta del plan en los briefs de lanes.
7. **Media-baja:** «no shell» frente a «only tool is the shell» en Codex.
8. **Media-baja:** formato de texto del Examiner nativo frente a salida estructurada.
9. **Baja:**
   - textos en español (también `<ruta>` y `<huella>` en el uso de `aether-wt`);
   - el peldaño en lugar del par que corrió;
   - la fase «Opus reviews»;
   - `--verdict` omitido;
   - las órdenes del freno de cuota;
   - `ops.md`;
   - «Your earlier verdict»;
   - el commit del Writer externo;
   - `CODEX_NOTE` en roles de solo lectura.

## Qué no pude verificar

- No corrí tests ni sesiones reales (tarea de solo lectura). Los tamaños de ejecución salen de `seatPrompt`/`buildPrompt` con mensaje vacío, y el resto del código fuente.
- No sé si los modelos tropiezan de verdad con las contradicciones: el efecto es inferido.
- No comprobé qué versión de los bins queda primera en el PATH de un agente nativo con `--plugin-dir`.
- No probé el sandbox de Codex ante `git merge`.
- No sé si el issue #88 ya cubre lo del carry: `gh issue view` pedía aprobación.
- No audité: los textos de rechazo de `guard.js`, `register.js`, `observe-*.js` ni las notas de `session-start.js` (grupo A).
- Fuera de alcance: `lane-delegate.js` L399 escribe `ladder: { haiku: 2, sonnet: 2, opus: 1 }` en `graph.json`, y no encontré quién lo lee.