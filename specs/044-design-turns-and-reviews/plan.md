# Plan 044: turnos del diseño, revisiones y fallas recientes

- **Spec:** `specs/044-design-turns-and-reviews/spec.md` (R1 a R32, C1 a C10).
- **Mapa del código:** `.aether/autonomy/auto-20261117-141739-785c/code-map.md` (archivo y línea por requisito). Las líneas son posiciones de lectura: el implementador las confirma antes de editar.

## Technical context

- Node.js 22, CommonJS, sin dependencias. Pruebas con `node --test "tests/*.test.js"` (`npm test`); `npm run check` suma `npm run test:mod` (los `hooks/*.test.ts` del mod) y `npm run validate`.
- Los flujos (`workflows/design.workflow.js`, `workflows/run.workflow.js`) son scripts de la herramienta Workflow: no importan módulos, no leen el reloj ni el disco; sus pasos de shell van al agente `aether:ops` por la lista de comandos de `hooks/ops-command.mjs`, y las pruebas los corren en `tests/workflow-harness.js` con agentes de mentira.
- Los esquemas del flujo de diseño son copias de `lib/lane-schemas.js` que una prueba mantiene iguales (`tests/workflow-design.test.js` y `tests/lane-schemas.test.js`).
- Las partes del arranque del Lead salen de `skills/using-aether/SKILL.md`; hoy pesan 9.023, 9.472 y 5.516 caracteres de 9.800 (medido con `bootstrapParts('plugins/aether')`): la parte 2 deja 328 caracteres de margen.
- Estructura: agentes en `plugins/aether/agents/`, libs en `plugins/aether/lib/`, datos en `plugins/aether/config/`, skills en `plugins/aether/skills/`, docs en `docs/`, sitio en `site/`.

## Gate

El proyecto no tiene `.specify/memory/constitution.md`: no hay principios que contar.

- `Nothing speculative, and nothing for a hypothetical need.` Pasa: cada pieza nueva (agente `mapper`, verbo `aether-plan requirements`, dos esquemas del Writer, `REVIEW_FINDINGS`) la pide un requisito por su nombre (R3 a R7, R13); ninguna sirve a una necesidad futura.
- `No abstraction, option, file or dependency that no requirement asks for.` Pasa: los cuatro archivos nuevos del código (`agents/mapper.md`, `lib/plan-requirements.js`, `config/design.json`, y los nuevos archivos de prueba) se justifican en `## Complexity`; no hay dependencia, bandera ni opción de usuario nuevas, y el cambio a `lib/lane-schemas.js` se limita a lo que R13 exige.

## Design

### D1. Topes de turnos (R1, R2). Serves: C1

`agents/writer.md` pasa a `maxTurns: 100` y `agents/examiner.md` a `maxTurns: 80`. Es una línea cada uno; la prueba nueva lee los dos frontmatter. Tres sitios de pruebas existentes pinzan `60` y `40` (`tests/agents.test.js` líneas 54 y 93, `tests/examiner-order.test.js` líneas 12 a 14) y los cambia la Tarea 1; el cuerpo de los dos agentes no cita cifras de turnos.

### D2. El paso del mapa (R3, R4, R5, R6). Serves: C2

Respuesta a Q1 (cómo corre el paso, en el modelo más barato y sin herramientas de escritura):

- **Agente propio de solo lectura.** `agents/mapper.md`, con `tools: Read, Grep, Glob`, `model: haiku`, `effort: high`, `maxTurns: 40`, siguiendo el precedente de `agents/reviewer.md` (sin Write, Edit ni Bash). Una llamada de agente del flujo no admite quitar herramientas por llamada (la firma que usan los dos flujos es `agent(prompt, { agentType, model, effort, phase, label, schema })`, sin `tools`): la restricción vive en la definición del agente, que es donde ya vive la de los demás roles. Por eso el paso no puede escribir en el repositorio ni en `specs/` y la prueba comprueba el frontmatter del agente y que la llamada no pide otro `agentType`.
- **Modelo.** El flujo guarda `MAP_PAIR = { model: 'haiku', effort: 'high' }`, copia de la primera rampa de `config/ladder.json` (`haiku-high`), como ya guarda `REFERENCE` una copia de `lib/seats.js`; una prueba compara `MAP_PAIR` con `loadLadder().rungs[0]` y con el frontmatter de `mapper.md`. Con superdelegación el asiento no cambia el paso: `lib/seats.js` solo tiene asientos de Judge, Writer y Examiner, y la escalera ya pone a Haiku como el modelo más barato que sirve (ver Assumptions).
- **Dónde vive el umbral (dato único).** `plugins/aether/config/design.json` con `{ "mapMinRequirements": 15 }`. El flujo no puede leer el disco ni contar líneas, así que el conteo y la comparación los hace un verbo nuevo de solo lectura, `aether-plan requirements <spec.md>`, que imprime `{ "requirements": N, "threshold": 15, "map": true|false }` y lee el umbral de `config/design.json`. El número no aparece escrito en ningún otro sitio del código (la prueba busca `15` y `mapMinRequirements` fuera de ese archivo). El conteo es el de las líneas `- Rn:` de la spec (`/^- R\d+:/gm`), que es lo que define R3.
  - `lib/plan-requirements.js` (nuevo) calcula el resultado; `bin/aether-plan` solo despacha el verbo y suma su forma al `USAGE`.
  - `hooks/ops-command.mjs` suma la forma `[word('requirements'), is(SPEC)]` a `aether-plan`, con `SPEC = /^specs\/\d{3}-…\/spec\.md$/` (la misma regla que `TASKS`); `docs/guide/ops.md` y `tests/ops-command-design.test.js` la listan.
- **Dónde corre.** En `full()` de `design.workflow.js`, entre la aprobación de la spec y el Writer del plan: una llamada ops `aether-plan requirements <SPEC>` (shell, sin modelo, como `check`). Si `map` es verdadero, una llamada `call('mapper', MAP_PAIR.model, MAP_PAIR.effort, mapMessage(), { phase: 'Plan', label: 'plan: map', schema: MAP_SCHEMA })`, con `MAP_SCHEMA = { required: ['map'], map: string }` (una línea por requisito: `Rn: archivo:línea, qué se reutiliza, qué pruebas lo fijan`). La llamada es de solo lectura y no es una tarea de `aether-delegate`: no pasa por el cierre de D9 ni escribe en el log de delegados.
- **Mensaje del Writer.** `planWriterMessage(map = null)` agrega, solo cuando hay mapa, un bloque `## Mapa del código` con el texto y una línea que dice que las líneas son posiciones de lectura y se confirman. Sin mapa el mensaje es el de hoy, letra por letra; la corrida de una spec de 14 requisitos o menos hace los mismos pasos de agente que hoy (la llamada ops de conteo es un paso de shell que el mod responde sin modelo).
- **Falla del mapa (R6).** Si el verbo falla, el agente termina sin respuesta, la respuesta no ajusta al esquema o `map` está vacío, `full()` hace `log('plan: map: <motivo>; the plan is written without a map')` y sigue con el mensaje de hoy. No pasa por `failure()`: el resultado no cambia de forma.
- Encabezado de `design.workflow.js` (líneas 12 a 23, el orden del flujo): agrega el paso.

### D3. El Writer nativo en dos llamadas (R7, R8). Serves: C3

- **Dos esquemas nuevos del flujo** (solo en `design.workflow.js`; el asiento externo conserva `WRITER_SCHEMA` y `lib/lane-schemas.js` no cambia): `PLAN_WRITER_SCHEMA` (`plan`, `commit`, `assumptions`, `questions`, `complexity?`) y `TASKS_WRITER_SCHEMA` (`tasks`, `commit`, `check`, `assumptions`, `questions`). Las listas de `required` y las propiedades son las de `WRITER_SCHEMA` repartidas por documento; `disagreements` no aparece (es de las revisiones, que no cambian). Una prueba fija la forma de cada uno.
- **Primera llamada.** `writePlan('write', planText)` sigue siendo `seatRound({ seat: 'writer', doc: 'plan', … })`, que primero ofrece el asiento externo con `WRITER_SCHEMA` y el mensaje de hoy. `seatRound` recibe dos parámetros nuevos opcionales, `nativeText` (el mensaje del Writer nativo cuando el asiento le devuelve la ronda; por defecto `text`) y devuelve además `effort` (el par nativo con que corrió), para que la segunda llamada use el mismo par. Con `nativeSchema: PLAN_WRITER_SCHEMA` y `nativeText` = mensaje de la primera llamada nativa (`planWriterMessage` más «escribe solo `plan.md` y haz su commit; las tareas vienen en otra llamada»). Si un asiento externo contesta, trae `plan` y `tasks` juntos y no hay segunda llamada (R7, último párrafo).
- **Segunda llamada (solo si `plan.seat === 'native'`).** `nativeAnswer({ seat: 'writer', base: 'plan: writer tasks', text: tasksMessage(), schema: TASKS_WRITER_SCHEMA, phase: 'Plan', native: { model, effort } })`. `tasksMessage()` dice: escribe `tasks.md` de `<feature>` leyendo el `plan.md` ya escrito (su ruta), corre `aether-plan check` hasta que pase y haz su commit. Su respuesta devuelve `{ answer, model }` como una ronda más y se une a la primera para lo que sigue (`complexity` viene de la primera).
- **El reintento del `check` (R8).** `checkedAfter(step, text, retry)` ya corre `aether-plan check` después del Writer y repite una vez con los errores. La llamada de reintento cambia según quién escribió: con el Writer nativo es la segunda llamada otra vez (`retry = writeTasks`, con `tasksMessage` más los errores); con un asiento externo, la ronda completa de hoy (`retry = writePlan`). El Judge recibe `plan.md` y `tasks.md` en una sola ronda sin cambios (`reviews({ doc: 'plan' … })`).
- **Las revisiones del Writer no cambian.** `corrector('plan')` sigue con una sola llamada y `REVISION_SCHEMA`; el spec parte el paso del plan, no las correcciones.
- `agents/writer.md` dice las dos formas del mensaje: cuando pide solo `plan.md`, responde `plan`, `commit`, `assumptions`, `questions`, `complexity` y no toca `tasks.md`; cuando pide solo `tasks.md`, lo escribe leyendo el plan, corre `aether-plan check`, hace su commit y responde `tasks`, `commit`, `check`, `assumptions`, `questions`. La forma de una sola llamada (plan y tareas, el asiento externo y la corrección) queda como está.

### D4. El Examiner que se queda sin turnos (R9, R10). Serves: C4

Respuesta a la pregunta abierta del Judge (un solo relanzamiento, también cuando un asiento externo ya cayó al nativo):

- El primer lanzamiento es todo lo que hoy hace `seatRound` para el Examiner: los asientos externos, la caída al Examiner nativo con las pruebas parciales y el reintento propio de `nativeAnswer` por una respuesta que no ajusta. Que un asiento externo ya haya caído al nativo no cuenta como relanzamiento: sigue siendo el lanzamiento 1.
- **El relanzamiento es uno solo en el total**, y vive en `examine()`: solo cuando ese primer lanzamiento terminó fallido (`round.failed`, sin `refused`) se corre `aether-exam recover <feature>`. Si `recover` falla o `tests` viene vacío, no hay relanzamiento y el resultado es el de hoy (R10). Si `tests` trae pruebas, una sola llamada `call('examiner', …)` con el par nativo del primer lanzamiento (el que `seatRound` devuelve ahora en su resultado fallido como `native`; por defecto `nativeOf('examiner', {}, author)`), etiqueta `exam: examiner (relaunch)`, mensaje `examinerMessage()` más `examinerPartialForNative({ partialDir: <repo>/.aether/exam, partialPaths })` (el texto que ya usa el relevo entre asientos) y `schema: EXAMINER_SCHEMA`. Es una sola llamada, sin el reintento propio de `nativeAnswer`: el relanzamiento no puede costar más de un Examiner de 80 turnos.
- Si la respuesta del relanzamiento ajusta al esquema, el flujo sigue como un Examiner nativo que terminó: `aether-exam store`. Si no termina, se vuelve a correr `aether-exam recover` y el resultado lista las pruebas que existen con su marca de índice, con la forma de hoy (`failedResult('examiner', …)` más `tests`). Nunca hay un tercer lanzamiento.

### D5. El revisor dice «listo» y trae el arreglo (R11, R12, R13). Serves: C5

- `agents/reviewer.md` (sección Report, líneas 66 a 110): `ready` es no tener hallazgo crítico ni importante, aunque queden menores; tope de 10 hallazgos menores; cada hallazgo trae su arreglo (`fix`). El mapa no encontró «when not obvious» en el texto actual: la regla se escribe sin ese calificativo, para todos los hallazgos.
- `REVIEW_FINDINGS` (nuevo, en `workflows/run.workflow.js` y copiado en `lib/lane-schemas.js`): `FINDINGS` con una propiedad `fix` (string, requerida) en cada hallazgo. `REVIEW_SCHEMA` usa `REVIEW_FINDINGS`; `SUPERVISOR_SCHEMA` sigue con `FINDINGS` (el supervisor no cambia). La prueba que mantiene las copias iguales (`tests/lane-schemas.test.js`, lista con `REVIEW_SCHEMA`) cubre el cambio.
- El resultado de la corrida ya entrega los hallazgos completos al Lead (`reviewResult` copia el objeto y `findings.push(...checked.findings)`): con el campo en el esquema, el arreglo llega sin más código; una prueba con un revisor de mentira fija que cada `fix` aparece en `finalReview.findings`.

### D6. La regla del Lead sobre los veredictos (R14 a R18, y la parte de regla de R26). Serves: C5, C7, C10

Respuesta sobre dónde vive para que las partes del arranque no se pasen de 9.800 caracteres:

- **La regla completa va en `skills/swarm/SKILL.md`**, en el apartado «Final review findings» (donde ya está «They are not worked»), que el Lead carga al actuar sobre el resultado de una corrida; no pesa en el arranque. Dice: `ready` se aprueba; `ready-with-fixes` se aprueba si ningún hallazgo es importante o crítico, y si alguno lo es, se corrigen los críticos e importantes y los menores quedan diferidos; los menores no se trabajan con `ready` ni con `ready-with-fixes`, sin excepción (R15; la frase «They are not worked» se conserva, solo cambia si contradice la regla nueva); un `not-ready` no se aprueba sin escribir antes el motivo, en el diario de la corrida (`.aether/autonomy/<run id>/diary.md`) o, fuera de una corrida, en la siguiente respuesta al dueño, sin comando ni bandera (R16). Sirve igual al revisor final que al revisor de un delegado.
- **El arranque lleva solo un puntero de una línea** en `skills/using-aether/SKILL.md`, en el párrafo «Verify before you relay» (parte 2): el veredicto de un revisor, final o de un delegado, se actúa con la regla de `aether:swarm`, «Final review findings». Se mide con `bootstrapParts`; el puntero y el cambio de R26 deben caber en los 328 caracteres de margen de la parte 2 (o en la parte 3, que deja más de 4.000): si no caben, se acorta una frase del mismo párrafo, sin quitar reglas.
- **La parte de regla de R26** (en el párrafo «The verdict» de `using-aether`) reemplaza la frase «A read-only delegate did not edit, so `aether-delegate approve` refuses it and `approve` on that line closes it» por: un delegado de solo lectura con comprobaciones en verde lo cierra el sistema; el Lead usa `verdict` con él solo para `fix` o `infeasible`, y con una comprobación en rojo por archivos de otro escritor, `verdict --verdict approve --ignore '<glob>'`. El cambio se hace con el texto del párrafo al mismo tamaño o menor.
- **Prueba de documentos** (nueva): `tests/review-verdict-rule.test.js` comprueba cada frase de la regla en `swarm/SKILL.md`, el puntero en `using-aether`, el motivo del `not-ready` (diario o respuesta, sin comando) y el texto nuevo de R26. **R18**: no se añade una prueba de tamaño; sigue valiendo `tests/session-start-parts.test.js` (líneas 34 a 38).

### D7. Lo que sigue falso del #301 (R19, R20, R21, R22). Serves: C6

- **R19.** `site/app.js` (`p.direct.a`, español e inglés) y el `alt` de `site/index.html` (la imagen y el `<noscript>`) dejan «cinco llamadas a herramientas» y dicen la regla de tres ediciones o diez lecturas en ambos idiomas, con el texto de `p.direct.w` como canónico. `tests/site.test.js` (línea 391, «p.direct.a alt stays unchanged») pasa a comprobar el `alt` nuevo y `p.direct.a` nuevo. `p.direct.c` («~5 LLAMADAS») no entra en R19 y no se toca.
- **R20.** `MERGE_MAIN` en `lib/delegate-approve.js` (línea 20): el texto sigue pidiendo la concesión con `aether-autonomy grant --class merge-main`, pero dice que en una corrida autónoma la fusión va a «Espera tu sí» del informe y no se le pregunta al dueño en ese momento. `tests/delegate-approve.test.js` (línea 160) cambia al texto nuevo.
- **R21. Sí necesita cambio de código; la prueba va primero.** Confirmado en el código: `quota-brake` (`lib/autonomy-command.js`, línea 335) arma `sessions` con `run.session` solamente, y `stopAll` (`lib/delegate-run.js`, línea 497) detiene solo los archivos de ejecución cuya clave empieza con `${len}-${session}--`; `continue` (`lib/autonomy.js`, línea 1280) pone la sesión nueva en `run.session` y manda la anterior a `previousSessions`, pero las cadenas lanzadas antes conservan la clave de la sesión vieja. Una cadena lanzada antes de `continue` queda sin detener. El arreglo es una línea: `sessions` pasa a ser la unión de `autonomy.runSessions(run)` (ya exportada, línea 1561) de cada corrida pausada. La prueba nueva (en `tests/autonomy-continue.test.js` o junto a `tests/aether-autonomy-sessions.test.js`, con el patrón de `spawnSleeper` de `tests/delegate-run.test.js:600`) abre una corrida en la sesión A, deja un archivo de ejecución con `log.fileKey('A', 't1')` y un proceso vivo, hace `continue` a la sesión B, pausa por cuota y corre `quota-brake` desde B: falla sin el arreglo (el proceso sigue vivo) y pasa con él.
- **R22.** `docs/guide/maintenance.md` (línea 62, la limpieza con una corrida abierta) y `docs/guide/troubleshooting.md` (línea 52, «unread quota above», y línea 182, recompilar sin `--only`) se reescriben a lo que el código hace hoy; el implementador lee primero el código de cada caso (la limpieza de `aether-wt sweep`/`finalize` con corrida abierta, la lectura de cuota, `aether-plan compile --run` sin `--only`) y escribe lo que hace. Una aserción por frase en `tests/docs-facts.test.js` (patrón de las líneas 826 a 864) que falla con el texto viejo.

### D8. Guard: una lectura no es una instalación (R29, R30, R31). Serves: C9

El cambio queda solo en `isSkillInstallSegment` (`lib/guard.js`, línea 707), no en `writeTargets`: `claudeConfigWrite` (línea 653) comparte `writeTargets`, y tocarla debilitaría la protección de los ajustes de Claude (R31). `isSkillInstallSegment` calcula hoy `naming = isAutonomyCall(...) ? redirectTargets(words) : writeTargets(words)`; se añade una tercera rama: un segmento de solo lectura nombra solo sus redirecciones. Es de solo lectura (a) `find` sin ninguna de las acciones `-delete`, `-exec`, `-execdir`, `-ok`, `-okdir`, `-fprint`, `-fprint0`, `-fprintf`, `-fls` y (b) `gh issue …` y `gh pr …` (su texto nombra la carpeta pero no escribe en ella). Cualquier redirección (`>`, `>>`) sigue contando por `redirectTargets`; `cp`, `ln`, `mv`, `find -delete` y `find -exec` quedan como hoy. El `installClass(...)` del final no cambia. Pruebas en `tests/guard.test.js` (pasan: `find ~/.claude/skills -name SKILL.md`, un `gh issue comment` y un `gh pr create` cuyo texto nombra la carpeta; siguen marcados: `cp -r x ~/.claude/skills/`, `ln -s`, `mv`, `find … -delete`, `find … -exec cp …`, una redirección) y las pruebas existentes de refuso de los ajustes de Claude, que siguen verdes sin cambio (R31).

### D9. El cierre solo del delegado de solo lectura (R23, R24, R25, R26). Serves: C7

Respuesta a Q2 y al formato del veredicto: `verdict()` escribe una línea `{ kind: 'verdict', time, session, task, attempt, step, verdict: 'approved', input: { kind: 'approve', findings: [], reason, fromScratch: false }, reason, cause, next, ignore: [], repo }`. `unverdictedDelegates` (`isUnverdictedTask`) y por lo tanto el aviso de Stop dejan de contar una tarea cualquiera que tiene una línea `verdict` después de su último lanzamiento; así que **si el cierre automático escribe esa misma línea, R25 se cumple sin tocar `lib/delegate-report.js` ni `lib/continuity-hook.js`**, y las pruebas lo fijan.

- **Una sola función de cierre**, `closeReadOnly({ task, session, cwd, dataDir, now })` en `lib/delegate-task.js`, junto a `verdict()`: toma el último lanzamiento, devuelve sin hacer nada si la tarea edita (`editsOf(launch)`), si la escalera ya la cerró (`ladderLib.judge` rechaza «the task is approved/blocked») o si `approveError(r, entries, launch, undefined, [])` devuelve error; con la misma `approveError` que usa `approve`, «sus comprobaciones pasan» significa exactamente lo que ya significa (resultado externo con `checks.ok`, o respuesta de Claude no vacía y sin archivos tocados desde el lanzamiento, `touchedSince`); con `--ignore` no hay nada que ignorar, así que una comprobación en rojo (vacío o archivos de otro escritor) deja la tarea pendiente. Si pasa, agrega la línea de veredicto `approved` con `ladderLib.judge` y los mismos campos que `verdict()`, más `auto: true` y `reason: 'closed by the system: the read-only checks passed'`.
- **Dónde se llama** (Q2): después de la línea `result` de `runTask` en `lib/delegate-run.js` (camino de pares externos), solo si el resultado es `ok`, y dentro de `recordAnswer` (camino de Claude), después de agregar la línea `answer` de un lanzamiento de solo lectura; ese es el punto donde el resultado llega al Lead (`wait` lee ese resultado y `aether-delegate answer` lo registra). `delegate-run.js` pasa a requerir `delegate-task.js` (no hay ciclo: `delegate-task.js` no requiere `delegate-run.js`), y `bin/aether-delegate` (línea 127) pasa `cwd: process.cwd()` a `recordAnswer`. Un fallo del cierre nunca rechaza: el resultado ya está registrado y la tarea queda pendiente como hoy.
- **R26 (cambio del 2026-11-18, «hazlo neotnces»).** `fix` e `infeasible` sobre un delegado de solo lectura abierto ya los acepta `verdict()` hoy. Sobre una aprobación automática (`auto: true`) sin un lanzamiento posterior, `verdict()` también los acepta: juzga contra el estado de antes del cierre (`reopenableAuto` la detecta y `effectiveVerdictInputs` deja fuera la aprobación que se reabre), así que `fix` sube un escalón con sus hallazgos e `infeasible` pide su motivo, como en una tarea abierta, y la aprobación reabierta no suma un intento propio. Un relanzamiento rechazado del mismo id no cuenta como lanzamiento posterior. `approve` sobre una tarea cerrada por el sistema se rechaza sin escribir nada. `verdict --verdict approve --ignore` queda intacto (`ignoreOf`, `approveError`, `tests/delegate-task.test.js` líneas 426 y 446). Cambian el texto de regla (D6), los textos que recibe el Lead (`stepNote` de un lanzamiento de solo lectura y la línea del resultado que pasó sus comprobaciones) y las pruebas.
- **R24.** Un delegado que edita no pasa por `closeReadOnly`; sigue necesitando `verdict` y sus pruebas.
- Pruebas (nuevo `tests/delegate-auto-close.test.js`): comprobaciones en verde, con el camino externo y con el de Claude, el log trae la aprobación sin llamar a `verdict` y `unverdictedDelegates` no lo lista; respuesta vacía o una comprobación en rojo quedan pendientes; en rojo por archivos de otro escritor `verdict --verdict approve --ignore` sigue aprobando; un delegado que edita sigue pidiendo `verdict`; `verdict fix` e `infeasible` sobre una tarea cerrada por el sistema la reabren (`fix` sube un escalón con sus hallazgos), y `approve` sobre ella se rechaza sin escribir nada. Cambian los casos de `tests/delegate-mod.test.js` (409 a 422), `tests/delegate-report.test.js` (192 a 194, 306 a 319) y `tests/continuity-hook.test.js` (59) que hoy esperan el veredicto del Lead para un solo-lectura que salió bien.

### D10. La decisión nueva y el #196 (R27, R28). Serves: C7, C8

- **R27.** `docs/decisions.md`: una decisión nueva (`A132`, la siguiente después de A131) que para un delegado de solo lectura con comprobaciones en verde reemplaza la frase de A85 («solo cuenta el veredicto que pasa por `aether-delegate verdict`»), registra la reapertura de la aprobación automática por `fix` o `infeasible`, cita ambas palabras del dueño (la palabra 3, «Si a todo trabja autonomamente en resolverlo» del 2026-11-17, y «hazlo neotnces» del 2026-11-18) y deja A85 en pie para los delegados que editan. La regla de `.specify/plan-rules.json` obliga a que la tarea posea `docs/index.md`, `tests/docs-032.test.js` y `tests/docs-facts.test.js` (fijan el rango de decisiones). Las frases que repiten la regla vieja (`docs/guide/delegates.md`, y la línea de `AGENTS.md` sobre «Only a verdict that goes through `aether-delegate verdict` counts») se ajustan para el caso nuevo. Una aserción de documentos falla sin la fila.
- **R28.** Sin cambio de código ni revisor nuevo. La evidencia es la prueba existente de `aether-delegate approve` que corre las pruebas de la tarea antes de fusionar (`tests/delegate-approve.test.js`, citada en R32). Cerrar el #196 con la palabra del dueño es una acción de GitHub del Lead, reversible, fuera de este plan.

### D11. Orden y olas

Las piezas casi todas son independientes; los únicos encadenamientos son los de un mismo archivo.

- **Ola 1, independientes:** turnos del Writer y del Examiner con el texto del Writer (D1, D3 texto); `aether-plan requirements` con su dato y su forma en el mod (D2 base); revisor (D5); regla del Lead (D6); guard (D8); sitio (D7 R19); `MERGE_MAIN` (D7 R20); `quota-brake` (D7 R21); cierre del solo-lectura (D9); la decisión nueva (D10).
- **Cadena sobre `design.workflow.js` y `tests/workflow-design.test.js`:** el mapa (D2, depende del verbo y del agente `mapper.md`), luego la segunda llamada del Writer (D3), luego el relanzamiento del Examiner (D4).
- **Después:** R22 (depende de la decisión nueva porque ambas tocan `tests/docs-facts.test.js`) y una pasada corta de documentos del flujo de diseño (`skills/designing/SKILL.md` y `docs/guide/design-seats.md`, solo si contradicen el mapa, las dos llamadas o el relanzamiento).
- **Al final:** `npm run check` (R32).

## Files

| Archivo | Qué cambia y por qué |
| --- | --- |
| `plugins/aether/agents/writer.md` | `maxTurns: 100` (R1) y las dos formas nuevas del mensaje (R7). |
| `plugins/aether/agents/examiner.md` | `maxTurns: 80` (R2). |
| `plugins/aether/agents/mapper.md` (nuevo) | El agente de solo lectura del mapa, Haiku `high` (R4). |
| `plugins/aether/config/design.json` (nuevo) | El umbral `mapMinRequirements: 15`, único lugar del número (R3). |
| `plugins/aether/lib/plan-requirements.js` (nuevo), `plugins/aether/bin/aether-plan` | Cuenta `- Rn:` y compara con el umbral (R3). |
| `plugins/aether/hooks/ops-command.mjs`, `docs/guide/ops.md`, `docs/reference/components.md` | Permite el verbo nuevo en el agente ops; lista el módulo y el dato (regla de `.specify/plan-rules.json`) (R3). |
| `plugins/aether/workflows/design.workflow.js` | El paso del mapa, los dos esquemas del Writer, la segunda llamada, el relanzamiento del Examiner (R3 a R10). |
| `plugins/aether/agents/reviewer.md`, `plugins/aether/workflows/run.workflow.js`, `plugins/aether/lib/lane-schemas.js` | `ready`, tope de 10 menores y `fix` en cada hallazgo (R11 a R13). |
| `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/skills/using-aether/SKILL.md` | La regla de veredictos y su puntero; la frase de R26 (R14 a R18, R26). |
| `site/app.js`, `site/index.html` | La regla de tres ediciones o diez lecturas (R19). |
| `plugins/aether/lib/delegate-approve.js` | Texto de `MERGE_MAIN` (R20). |
| `plugins/aether/lib/autonomy-command.js` | `quota-brake` incluye las sesiones anteriores de la corrida (R21). |
| `docs/guide/maintenance.md`, `docs/guide/troubleshooting.md` | Lo que el código sí hace (R22). |
| `plugins/aether/lib/delegate-task.js`, `plugins/aether/lib/delegate-run.js`, `plugins/aether/bin/aether-delegate` | `closeReadOnly` y sus dos puntos de llamada (R23 a R26). |
| `docs/decisions.md`, `docs/index.md`, `docs/guide/delegates.md`, `AGENTS.md` | La decisión nueva y las frases que repiten la regla vieja (R27). |
| `plugins/aether/lib/guard.js` | La rama de solo lectura de `isSkillInstallSegment` (R29 a R31). |
| `skills/designing/SKILL.md`, `docs/guide/design-seats.md` | Solo si contradicen el mapa, las dos llamadas o el relanzamiento. |
| Pruebas | Nuevas: `tests/review-verdict-rule.test.js`, `tests/delegate-auto-close.test.js`, `tests/plan-requirements.test.js` (el verbo y el dato), y una prueba de turnos (`tests/agents-design.test.js` o similar). Cambian: `tests/workflow-design.test.js`, `tests/ops-command-design.test.js`, `tests/lane-schemas.test.js`, las de `run.workflow` que usan un revisor de mentira, `tests/site.test.js`, `tests/delegate-approve.test.js`, `tests/delegate-mod.test.js`, `tests/delegate-report.test.js`, `tests/continuity-hook.test.js`, `tests/guard.test.js`, `tests/autonomy-continue.test.js`, `tests/docs-facts.test.js`, `tests/docs-032.test.js`. |

## Verification

Comando de pruebas: `npm test` (y `node --test tests/<archivo>.test.js` por tarea). Antes de cerrar: `npm run check` (`npm test`, `npm run test:mod`, `npm run validate`).

| Requisito | Qué lo comprueba (falla sin el cambio) |
| --- | --- |
| R1, R2 | Una prueba lee `agents/writer.md` y `agents/examiner.md` y exige `maxTurns: 100` y `maxTurns: 80`. |
| R3 | Prueba del flujo con una spec de 15 requisitos: el paso del mapa corre una vez, antes del Writer del plan; con una de 14, no corre. Prueba de `aether-plan requirements` (cuenta, umbral de `config/design.json`) y búsqueda de que el número 15 no está escrito en otro lado. |
| R4 | `agents/mapper.md` tiene `tools: Read, Grep, Glob` y `model: haiku`; la llamada del mapa usa `aether:mapper` en `MAP_PAIR`, igual a la primera rampa de `config/ladder.json`. |
| R5 | El mensaje del Writer con 15 requisitos contiene el mapa; con 14 es idéntico al de hoy y la secuencia de llamadas de agente no cambia. |
| R6 | Mapa que rechaza, termina sin respuesta o viene vacío: el plan se escribe, el resultado conserva su forma y el registro dice que el mapa falló. |
| R7 | Un Writer de mentira que cuenta llamadas: el Writer nativo hace dos y la segunda recibe la ruta de `plan.md`; con un asiento externo hay una sola llamada; los esquemas de cada llamada. |
| R8 | Con un `check` que falla la primera vez, la segunda llamada se repite una vez con los errores; el Judge recibe `plan.md` y `tasks.md` en una ronda. |
| R9, R10 | Un Examiner de mentira: sin respuesta tras escribir pruebas y a la segunda completa (relanzamiento con las pruebas, `store` corre, el Lead no retoma); sin respuesta dos veces (un solo relanzamiento y el resultado lista las pruebas con marca de índice); sin pruebas (ningún relanzamiento); con un asiento externo que ya cayó al nativo (sigue habiendo un solo relanzamiento). El caso de `tests/workflow-design.test.js` líneas 1685 a 1712 se actualiza. |
| R11, R12, R13 | Prueba de documentos sobre `agents/reviewer.md` (`ready`, tope de 10, `fix` en cada hallazgo); la prueba de copias iguales de `REVIEW_SCHEMA`; una corrida con un revisor de mentira cuyo `fix` llega a `finalReview.findings`. |
| R14, R15, R16 | `tests/review-verdict-rule.test.js` sobre `skills/swarm/SKILL.md`: cada veredicto, los menores sin excepción, el motivo del `not-ready` en el diario o en la respuesta y sin comando ni bandera. |
| R17, R18 | `tests/session-start-parts.test.js` (ya existente) en verde con el puntero; no se añade otra. |
| R19 | `tests/site.test.js` comprueba el `alt` nuevo y `p.direct.a` en ambos idiomas, y que «cinco llamadas» ya no aparece. |
| R20 | `tests/delegate-approve.test.js` con el texto nuevo de `MERGE_MAIN`. |
| R21 | La prueba de `quota-brake` con una corrida retomada: falla antes del arreglo (la cadena sigue viva) y pasa después. |
| R22 | Una aserción por frase en `tests/docs-facts.test.js`. |
| R23, R24, R25 | `tests/delegate-auto-close.test.js` y los casos ajustados de `delegate-mod`, `delegate-report` y `continuity-hook`. |
| R26 | `tests/delegate-task.test.js` líneas 426 y 446 en verde; en `tests/delegate-auto-close.test.js`, `verdict fix` e `infeasible` son aceptados en una tarea de solo lectura abierta y, sin lanzamiento posterior, reabren la aprobación automática (sin sumar intento propio; un relanzamiento rechazado no cuenta como lanzamiento posterior), y se rechazan solo después de un lanzamiento posterior tras ese cierre sin haberse reabierto; `approve` sobre la tarea cerrada se rechaza sin escribir nada. |
| R27 | Aserción de documentos (`tests/decision-044.test.js`) sobre A132 (ambas citas del dueño: «Si a todo trabja autonomamente en resolverlo» y «hazlo neotnces», el registro de la reapertura por `fix` o `infeasible`, y A85 en pie para los que editan), junto con `tests/docs-032.test.js`. |
| R28 | La prueba existente de `approve` que corre las pruebas antes de fusionar; el cierre del #196 lo hace el Lead. |
| R29, R30, R31 | `tests/guard.test.js`: casos que pasan, casos que siguen marcados y los refusos de los ajustes de Claude sin cambio. |
| R32 | `npm run check` en verde; cada requisito con cambio tiene una prueba que falla sin él (R25 y R26 la tienen aunque el cambio sea de cierre y de texto). |

## Assumptions

- Umbral de 15, topes de 100 y 80 turnos, un solo relanzamiento del Examiner y tope de 10 menores: las cifras del Lead (spec, `## Assumptions`). El umbral vive en `config/design.json`.
- El paso del mapa corre siempre en Haiku `high` nativo, también con superdelegación: la escalera ya pone a Haiku como el modelo más barato que sirve y `lib/seats.js` no tiene un asiento para este paso. Reversible: un asiento nuevo sería otra spec.
- El mapa no se guarda en `specs/`; vive en el mensaje del Writer (spec, `## Assumptions`).
- `mapper.md` tiene `maxTurns: 40`; es una cifra del plan, reversible.
- Solo el Writer nativo se parte en dos llamadas; las correcciones del plan siguen con una (el Lead lo fijó así).
- El relanzamiento del Examiner es una sola llamada, sin el reintento interno de `nativeAnswer`, para que el costo no pase de un Examiner más. El «lanzamiento 1» incluye todo lo que `seatRound` hace hoy, también la caída de un asiento externo al nativo.
- El cierre automático se registra cuando el resultado de solo lectura llega al Lead (los dos puntos de D9), como asumió el Lead; los hallazgos menores de un `ready-with-fixes` quedan diferidos; `verdict --verdict approve --ignore` sigue.
- La línea de cierre es un `verdict` normal con `auto: true`: la escalera, el informe y el aviso de Stop no necesitan reglas nuevas.
- `fix` es requerido en `REVIEW_FINDINGS` (el revisor final), no en el supervisor.
- Las pruebas nuevas van en archivos nuevos cuando no hay un archivo propio del tema, para no tocar los más grandes sin necesidad.

## Risks

- **`fix` requerido** en el esquema del revisor final rompe los revisores de mentira de las pruebas de `run.workflow` que no lo traen, y un asiento externo (agy) puede devolver un hallazgo sin `fix`. Mitigación: las tareas poseen esas pruebas y las actualizan; una respuesta que no ajusta ya cae al reintento de la ronda. Si el asiento externo falla de seguido, se vuelve opcional (un cambio de una línea).
- **El conteo del mapa es una llamada de shell más** en toda corrida de diseño. Es un paso del agente `ops` que el mod responde sin modelo, y la lista de comandos permitidos del mod crece en una forma (`ops-command.mjs`, probada en `tests/ops-command-design.test.js` y en `claude plugin test`). Una spec de 14 requisitos no cambia sus llamadas de agente.
- **Margen de la parte 2 del arranque** (328 caracteres): el puntero de D6 y la frase de R26 son cortas, pero si un cambio mueve un encabezado a otra parte, `tests/session-start-parts.test.js` lo detecta; se acorta una frase del mismo párrafo.
- **`closeReadOnly` y los `touchedSince` del camino de Claude** dependen de `cwd`; si `aether-delegate answer` corre desde una carpeta distinta de la del Lead, la comprobación de archivos tocados puede ver otro árbol. Mitigación: el cierre usa la misma `approveError` que `approve`, así que errar solo deja la tarea pendiente (el comportamiento de hoy), nunca la cierra de más.
- **Un delegado de solo lectura cuyo resultado externo llegó `ok` con respuesta vacía** no se cierra solo (R24); queda al Lead, como hoy.
- **El mapa de Haiku puede ser incompleto o tener líneas viejas.** El mensaje al Writer lo marca como posiciones de lectura que se confirman; el Judge revisa el plan, no el mapa.
- **La spec no tiene contradicciones que cambiar.** R20 pide que el mensaje hable de «Espera tu sí» «durante una corrida autónoma» y la función no sabe si hay una corrida abierta: el texto cubre los dos casos en una sola frase en vez de ramificar por contexto.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Agente nuevo `agents/mapper.md` | R4: el paso del mapa no puede escribir en el repositorio ni en `specs/`. | Reutilizar `aether:reviewer` mezcla un cuerpo de revisor final con un trabajo de mapa; una llamada con herramientas restringidas por parámetro no existe en el flujo (`agent()` no acepta `tools`), así que la restricción tiene que estar en la definición del agente. |
| Verbo nuevo `aether-plan requirements`, `lib/plan-requirements.js`, `config/design.json` y su forma en `ops-command.mjs` | R3: el umbral de 15 es un dato y el flujo no lee el disco ni cuenta líneas. | Contar en el flujo no es posible (sin disco); que el Lead pase el conteo no sirve porque la spec la escribe el mismo diseño; escribir el 15 en el flujo y en una prueba lo repite en varios sitios, que R3 prohíbe. |
| `PLAN_WRITER_SCHEMA` y `TASKS_WRITER_SCHEMA` (dos esquemas más en el flujo) | R7: cada llamada del Writer nativo tiene su propio esquema, no el que exige `plan` y `tasks` juntos. | Reusar `WRITER_SCHEMA` obligaría a la primera llamada a inventar `tasks` y `check` que aún no existen. |
| `REVIEW_FINDINGS` (copia en el flujo y en `lib/lane-schemas.js`) | R13: cada hallazgo del revisor final trae su arreglo, sin cambiar los hallazgos del supervisor. | Agregar `fix` a `FINDINGS` cambia también el esquema del supervisor, que ningún requisito pide. |
| `closeReadOnly` como función separada en `delegate-task.js`, llamada desde dos sitios | R23 y R24: dos caminos (par externo y Claude) cierran con la misma regla. | Duplicar la lógica en `runTask` y en `recordAnswer` repite `approveError`; llamar al bin desde dentro de la lib agrega un proceso y no mejora nada. |
