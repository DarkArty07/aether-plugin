# Plan 043: aviso de modelos nuevos y arreglos de las corridas largas

- **Spec:** `specs/043-new-models-and-run-fixes/spec.md` (criterios C1 a C8, requisitos R1 a R31). No se repite aquí.
- **Date:** 2026-11-16
- **Convención:** `P/` = `plugins/aether/`, `T/` = `tests/`. Los números de línea vienen del mapa de código hecho sobre `fa2991f` y se confirman al implementar.

## Technical context

- Node.js 22, CommonJS, sin dependencias. Pruebas con `node --test "tests/*.test.js"` sobre repositorios temporales (`T/helpers.js`: `tempDir`, `makeRepo`); los flujos se prueban con agentes de mentira (`T/workflow-harness.js`), sin gastar tokens.
- No hay constitución (`.specify/memory/constitution.md` no existe).
- Estructura que el cambio toca: `P/lib/` (lógica; los `P/bin/aether-*` son delgados), `P/config/` (datos), `P/hooks/hooks.json` (SessionEnd, `aether-observe hook`, timeout 30 s), `P/workflows/design.workflow.js`, `P/agents/examiner.md`, las skills `autonomous-runs`, `swarm`, `designing`, `using-aether`, la skill de proyecto `.agents/skills/new-harness/SKILL.md`, `docs/`, `site/`.
- `.specify/plan-rules.json` obliga a que: todo módulo nuevo de `P/lib/**` y todo bin nuevo se registre en `docs/reference/components.md` dentro del `Owns` de la tarea que lo crea; y que una tarea que cambie `docs/decisions.md` posea también `docs/index.md`, `T/docs-032.test.js` y `T/docs-facts.test.js`.

## Gate

- Constitución: no existe. No aplica.
- `Nothing speculative, and nothing for a hypothetical need.` Pasa. Cada pieza nueva tiene un requisito (ver Complexity); no se construye un cliente MSP de Muse ni un lector de mensajes del dueño.
- `No abstraction, option, file or dependency that no requirement asks for.` Pasa con cuatro piezas justificadas en Complexity (el proceso desprendido, el archivo `config/model-watch.json`, el registro del vínculo run-tarea y la selección guardada por lanzamiento). Los módulos nuevos de R29 los pide la spec; los de R1 a R5 son los dos mínimos (`model-listing.js`, `model-watch.js`).

## Design

### D1. Aviso de modelos nuevos (R1 a R8). Serves: C1, C2

- **Lectura sin modelo.** Nuevo `P/lib/model-listing.js`: por harness, el medio de captura de la tabla `captureVia` de `P/config/model-watch.json` (no es código): `agy` corre `agy models`, `grok` corre `grok models`, `codex` lee `~/.codex/models_cache.json`, `muse` no tiene medio (ver D1.5). Claude y Cursor no están en la tabla de medios. Ninguna orden de captura es una llamada a un modelo; una prueba comprueba que los argumentos de `captureVia` son solo `models` y el archivo de caché (R1).
- **Comparación pura.** `compare(harnessName, listedIds, table)` donde `table = harness-models.json` (la lee `seats.harnessListing()`, `P/lib/seats.js:85`): nuevo = listado que no está en `models`, `superseded` ni `outOfScope` (los ids de `models` son strings o `{id}`; también cuenta `calledNotListed` de Muse como conocido); retirado = en `models` (id de string o de objeto) que el harness ya no lista (R2). Nunca escribe en la tabla (R8).
- **Obtener la lista.** `listModels(harnessName, {env, timeoutMs, spawn})` devuelve `{status:'ok', ids}` o `{status:'failed'|'timeout'|'not-installed'|'no-capture', reason}`. Usa `commandInstalled` (`P/lib/lane-process.js:27`) y el nombre de comando de `P/config/lanes.json`. Cada llamada va acotada por `perHarnessSeconds`.
- **El trabajo.** Nuevo `P/lib/model-watch.js`: `runWatch({dataDir, mainRoot, harnesses, now})` hace: sellar (una vez al día, patrón `P/lib/tree-clean.js:52-69`: `<dataDir>/model-watch/stamp.json` `{at}`), leer cada harness activo con medio, comparar, y escribir `<dataDir>/model-watch/result.json`:
  `{at, harnesses:{<name>:{status, reason?, readAt, new:[ids], retired:[ids], noticed:false}}}`. Un lector que falla anota su motivo y sigue. El tiempo total (`totalSeconds`) corta el resto y anota `skipped: 'total-timeout'`. Un sello del mismo día sin `force` no llama a nadie (R1). `noticed` se pone a `true` cuando el arranque muestra la línea (D1.3); una diferencia nueva (id que no estaba en el resultado anterior) vuelve a `noticed:false`, así el aviso sale «una vez por diferencia» (supuesto de la spec).
- **Desprendido.** SessionEnd tiene 30 s y su lectura es síncrona (`P/lib/observe-hook.js:36-49`), por eso `observe-hook.js` `endSession` llama, en una sesión del Lead y con la opción `harnesses`, a `modelWatch.launch({dataDir, mainRoot, env})`, que arranca `node P/bin/aether-observe models-read` con `detached: true, stdio: 'ignore'` y `unref()` (precedente `P/lib/observe-issue.js:133-140`), traga todo error y no espera (R5, R6). El verbo nuevo `models-read` de `P/bin/aether-observe` es el trabajador: llama a `runWatch`, imprime una línea JSON y sale 0. `launch` no arranca nada fuera de una sesión del Lead, ni cuando el sello ya es de hoy (así ni siquiera hay proceso).
- **Configuración.** `P/config/model-watch.json`: `{"perHarnessSeconds": 10, "totalSeconds": 30, "captureVia": {...}}` (valores por defecto cortos; supuesto de la spec: se cambian en `config/`).

**D1.2. Qué harnesses.** La opción `harnesses` se resuelve con el mismo lector que usa `P/lib/lanes.js` para decidir los harnesses activos; la lectura solo recorre la intersección con `{agy, grok, codex, muse}` (R6). Claude y Cursor nunca.

**D1.3. Línea de arranque (R3).** `model-watch.js` exporta `noticeLine(result)`: «Aether: modelos nuevos en <harness>: a, b; retirados: c.» sin diferencias sin avisar devuelve `null`, y `markNoticed(dataDir)`. `P/lib/session-start.js` la une a `contextOf` (`:569-577`) junto a `calibrationNote` y la agrega a las líneas que los bucles de recorte pueden quitar primero (`:592`, `:602`), con tope de 400 caracteres por línea (corta con «y N más»). No toca `PART_LIMIT` ni la skill `using-aether`: la parte 2 no crece (R25 y supuesto 6 del Lead).

**D1.4. Doctor (R4).** `P/lib/doctor.js` suma `modelsCheck()` al arreglo `checks` (`:340-352`), estado `info` cuando hay diferencias o no hay lectura, `warn` cuando un harness no se pudo leer, nunca `error`; muestra por harness activo nuevos, retirados, cuándo se leyó y el motivo si falló. Solo lee el resultado (el doctor no escribe nada).

**D1.5. Muse y Codex.** Muse no tiene medio de captura sin llamada al modelo en el código (`muse.js` solo corre `muse exec`; listar vía `muse serve` pediría un cliente MSP). Se juzga demasiado grande y fuera de lo pedido: Muse queda como `no-capture` («sin medio de captura»), que `aether-doctor` informa. Codex lee `~/.codex/models_cache.json`, que está tan fresco como la última ejecución de codex: se anota como límite en `aether-doctor` (campo `reason`) y en la guía. Se registra en Assumptions.

### D2. Procedimiento para un modelo nuevo (R7, R8). Serves: C2

Nueva sección en `.agents/skills/new-harness/SKILL.md` (skill de proyecto, no la lee un usuario del plugin ni va en el arranque), «Un modelo nuevo de un harness que ya está»: 1) leer las páginas de AA con `node scripts/aa-pages.js read <slug> --harness <name>` (sin `--write`), 2) mostrar dónde caería en la escalera con `node scripts/refresh-lanes.js` sin `--write`, 3) dejar las filas de pares y el precio como borrador en `.aether/model-drafts/<harness>-<model>.json` (carpeta no versionada), 4) esperar el sí del dueño en sus palabras antes de tocar `config/`. La prueba `T/new-harness-skill.test.js` fija la sección. Una prueba de `model-watch` hace un hash de `config/pairs.json`, `config/prices.json` y `config/models/harness-models.json` antes y después de `runWatch`, de `noticeLine` y del doctor (R8).

### D3. Topes del plan aprobado (R9 a R12). Serves: C3

- `P/lib/autonomy.js` `hasApprovedPlanMode(records, latestStarted)` (`:82-101`) hoy devuelve un booleano. Se agrega `approvedPlanText(records, latestStarted)` que devuelve el texto del plan tras «## Approved Plan:» del `tool_result` aprobado (o `null`), y `ceilingsFromPlan(text)` que devuelve `{hours, usd, unreadable}`: busca cifras de horas (`N h`, `N horas`, `N hours`) y de dólares (`US$ N`, `USD N`, `$N`, `N dólares`, `N dollars`) en el texto; si un tipo tiene más de una cifra distinta, ese tipo es `unreadable` y no se elige (supuesto de la spec); si no hay ninguna de un tipo, es `null` (todo como hoy).
- `start(mainRoot, {quote, session, hours, usd})` (`:520`): por cada tope sin bandera, usa el del plan si lo hay; si no, el de defecto. La fuente de cada tope (`flag`, `plan`, `default`) pasa por `ceiling()` (`:486-490`) que hoy da `owner|default`: se amplía con `plan` conservando `owner` para la bandera. Se guarda `ceilings.source` como hoy. Si una bandera difiere de la cifra del plan, `start` devuelve un aviso con las dos cifras; si abre con los de defecto y el plan nombraba otros (o `unreadable`), devuelve el aviso de R11.
- `P/lib/autonomy-command.js` `start` (`:185-194`) imprime con qué topes abrió y de dónde salió cada uno, y los avisos. No lee mensajes del dueño (R10).
- El texto de la skill de corridas autónomas lo hace la tarea de skills (D8).

### D4. Limpieza del arranque (R13 a R15). Serves: C4

- `P/lib/tree-clean.js` `cleanProject(cwd, {now, dataDir, force, openRun})`: con `openRun === true` salta el paso 1 (`.aether/tmp` y `.aether-tmp`); `.aether/autonomy/` ya está prohibido por `isSafeToDelete` (`:22-44`). El paso 2 (seats y delegates con `WORK_DAYS = 7`) no cambia. `cleanProject` devuelve además `deleted: [paths]`.
- `P/lib/session-start.js` paso 5 (`:445-455`): calcula `openRun = autonomy.openRuns(mainRoot).length > 0` (`P/lib/autonomy.js:407`; cualquiera, de la sesión que sea) y se lo pasa; `cleanNote` nombra las rutas, hasta 3, y «y N más». `cleanProject` no importa `autonomy` (evita un ciclo): el llamador pasa el booleano.
- Sin corrida abierta el umbral de 24 h sigue igual.

### D5. La cadena obedece al freno (R16 a R18). Serves: C5

- **R17.** `P/lib/delegate-chain.js` `runChain` (`:80`): antes de cada candidato del `for (const candidate of queue)` (`:91`) llama a `autonomy.launchRefusal(cwd, {session, dataDir, now})` (`P/lib/autonomy.js:1068`, el mismo que usan `delegate-task.js:625` y `plan-compile.js:322`). Con rechazo (pausa de cuota o tope) no lanza el par; devuelve el mismo resultado relanzable que hoy devuelve un rechazo de arranque (`isStartRefusal`, `:46-50`), nunca `failed` (supuesto de la spec). El compromiso: el rechazo cubre pausa y topes, igual que el resto de la «Run gates» de `AGENTS.md`.
- **Vínculo (R16).** `lane-delegate.js` (`:416`, `run.newRunId()`) al arrancar una llamada editora escribe `<dataDir>/lanes/links/<laneRunId>.json` con `{taskKey: fileKey(session, id), session, writtenAt}` (escritura atómica con `run.writeJson`). `delegate-run.js` exporta `stopTask(dataDir, taskKey)` (lee `run/<fileKey>.json` `{pid}`, `P/lib/delegate-run.js:113`, y mata el grupo con `killGroup`) y `stopAll(dataDir)` (todo `run/*.json` cuyo pid vive). `lane-calls.js` `stop(cwd, runId, call)` (`:685`), tras matar las llamadas del run, busca el vínculo del `runId` y llama a `stopTask`. Un run sin vínculo se comporta como hoy.
- **Freno.** `P/lib/autonomy-command.js` `quota-brake` (`:317`) llama a `stopAll` para cada delegado en vuelo del run y suma «chains stopped N» a su salida; el texto de uso (`:23`, `:37`) deja de pedir al Lead que los detenga primero.

### D6. Reanudar solo lo de la corrida (R19 a R21). Serves: C6

- `P/lib/plan-compile.js` `compile` (`:315`): cada lanzamiento guarda su selección en `state.json` `launches[k].only` (lista de ids de tareas; `null` = todo el plan) además de `args` (`:452-476`). Con `--run` y sin `--only`, la selección de la corrida es la unión de las selecciones de sus lanzamientos (`null` en alguno = todo el plan); para corridas viejas sin el campo se deriva de `units.json` (`run.extendUnits`, `P/lib/run.js:163-165`). Ofrece `selección − fusionadas` (`alreadyMerged`, `:336-349`) en vez de «todo el plan − fusionadas».
- Si el conjunto ofrecido es mayor que el del lanzamiento anterior (`launches[last]` ofrecido), escribe por stderr «recompile offers N tasks, the previous launch offered M».
- Un `--only` explícito sigue mandando, como hoy.

### D7. Examiner sin respuesta (R22 a R24). Serves: C7

- `P/lib/exam.js` suma `inventory(examDir)` que lista las pruebas de `.aether/exam/` y marca cada una `inIndex: true|false` según `exam.json` (usa `readExam`, `:55`), y `rebuildIndex(examDir)` que devuelve un `exam.json` con una entrada por prueba terminada (la que tiene su archivo de resultado; define la prueba terminada el mismo criterio que `examProblem`, `:37-50`).
- `P/workflows/design.workflow.js` `examine(author)` (`:989-1000`): cuando el examinador (nativo tras su reintento, `:467-482`, o externo) termina sin respuesta que cumpla su esquema, antes de devolver el fallo llama a `inventory` y `rebuildIndex`, guarda el índice reconstruido (las terminadas) y devuelve al Lead `{status:'failed', step:'examiner', reason, tests:[{path, inIndex}]}` con las tres marcas (R23); no pierde las del índice. El camino de un examen que sí contestó no cambia.
- R22 (el índice verdadero tras cada prueba) vive en `P/agents/examiner.md` `:25` y en el formato (`:51-58`): una entrada por prueba terminada, escrita al terminarla. Un Examiner de mentira no lo prueba; lo cubre una prueba de documentos (D8).
- R24: la regla del Lead en `P/skills/designing/SKILL.md:24` suma «una prueba fuera del índice se corre antes de añadirla».

### D8. Textos de las skills y del agente (R12, R15, R18, R21, R22, R24). Serves: C3, C4, C5, C6, C7

Una sola tarea posee los textos para que no se pisen: `P/skills/autonomous-runs/SKILL.md` (R12 forma del plan, aprobación = cifra del dueño, `--hours`/`--usd` tras un mensaje; R15 lo duradero en `.aether/autonomy/<id>/`; R18 `quota-brake` y `aether-lane stop` terminan la cadena); `P/skills/swarm/SKILL.md` (R21 reanudar = recompilar con `--run`, el compile conserva la selección); `P/agents/examiner.md` (R22); `P/skills/designing/SKILL.md` (R24). Una prueba de documentos por requisito.

### D9. Menores de #300 (R25 a R30). Serves: C8

- **R25.** `AGENTS.md` ya dice, en «Commands», que en un árbol de desarrollo los nombres `aether-*` en `PATH` son los bins de la versión instalada; la tarea añade una prueba que lo fija y no toca la skill `using-aether` (la parte 2 no crece). `P/lib/delegate-approve.js:20` `MERGE_MAIN` y el rechazo `:245` dicen el siguiente paso: «merge-main needs a grant: ask the owner for the merge, record it with `aether-autonomy grant merge-main` (their words), then run approve again» (el texto exacto lo fija `T/delegate-approve.test.js`).
- **R26.** Quitar la frase de la fila «Direct» en los seis archivos de la spec y ajustar sus pruebas; una prueba de grep (sin `specs/`) comprueba que no queda.
- **R27.** Una decisión nueva (A128, la última hoy es A127) en `docs/decisions.md`: los worktrees de las unidades atendidas quedan fuera de la señal de vida del watch (`P/lib/wt-watch.js:47`). Va en la tarea de documentos por la regla de `plan-rules.json`.
- **R28.** `P/lib/harness/index.js` `HARNESS_NAMES` (cinco, con cursor) pasa a `ADAPTER_NAMES`; `P/lib/harness-names.js` `HARNESS_NAMES` (sin cursor) pasa a `DELEGATE_HARNESS_NAMES`; los importadores del mapa se actualizan sin cambiar su comportamiento. `hooks/panel-view.mjs` no se toca.
- **R29.** `P/lib/skill-review.js` queda con la revisión de una skill (`reviewSkill`, `posttool`, `outsideAgents`); el registro de cargas del Lead pasa a `P/lib/skill-loads.js` (`recordLeadSkillLoad`, `leadLoadedSkills`, `alreadyNoticed`, `skillToken`, `mainRootOf`); el detector de temas a `P/lib/skill-topics.js` (`detectUncoveredTopics`, `topicLine`, `startupTopicNotice`, auxiliares). Sin cambio de comportamiento: las pruebas existentes se repartan sin cambiar sus afirmaciones. Importadores: `continuity-posttool.js`, `session-start.js`, `T/skill-review.test.js`, `T/new-harness-skill.test.js`. Los dos módulos nuevos van a `docs/reference/components.md`.
- **R30.** Nueva `docs/guide/plan-rules.md` (`title`, `description`, `order: 9`, el hueco libre) que explica `.specify/plan-rules.json` y los avisos de `aether-plan check`, enlazada desde `docs/index.md`.

### D10. Registro y documentación (R31). Serves: C1, C3, C4, C5, C7

Páginas que describen el arranque, el doctor, las corridas y el examen dicen lo nuevo (`docs/guide/observe.md`, `docs/guide/` de doctor y de corridas autónomas, `docs/reference/components.md` para el arranque y el examen si las nombra); decisiones nuevas con número en `docs/decisions.md`: A128 (watch, R27), A129 (aviso de modelos nuevos), A130 (topes del plan aprobado), A131 (cadena obedece al freno). Los rangos que fijan `docs/index.md`, `T/docs-032.test.js` y `T/docs-facts.test.js` se ajustan en la misma tarea.

## Files

| Área | Archivos | Por qué |
| --- | --- | --- |
| Aviso de modelos | `P/lib/model-listing.js` (nuevo), `P/lib/model-watch.js` (nuevo), `P/config/model-watch.json` (nuevo), `P/bin/aether-observe`, `P/lib/observe-hook.js`, `P/lib/session-start.js`, `P/lib/doctor.js`, `docs/reference/components.md` | D1 |
| Procedimiento | `.agents/skills/new-harness/SKILL.md`, `T/new-harness-skill.test.js` | D2 |
| Topes | `P/lib/autonomy.js`, `P/lib/autonomy-command.js` | D3 |
| Limpieza | `P/lib/tree-clean.js`, `P/lib/session-start.js` | D4 |
| Cadena y freno | `P/lib/delegate-chain.js`, `P/lib/lane-delegate.js`, `P/lib/lane-calls.js`, `P/lib/delegate-run.js`, `P/lib/autonomy-command.js` | D5 |
| Compile | `P/lib/plan-compile.js` | D6 |
| Examiner | `P/lib/exam.js`, `P/workflows/design.workflow.js`, `P/lib/seats.js` (si el índice reconstruido lo pide) | D7 |
| Textos | `P/skills/autonomous-runs/SKILL.md`, `P/skills/swarm/SKILL.md`, `P/agents/examiner.md`, `P/skills/designing/SKILL.md` | D8 |
| #300 | `P/lib/delegate-approve.js`, `AGENTS.md`, `P/skills/using-aether/SKILL.md`, `docs/methodology.md`, `docs/tutorials/first-request.md`, `docs/es/guias/primera-peticion.md`, `site/index.html`, `site/app.js`, `P/lib/harness/index.js`, `P/lib/harness-names.js` y sus importadores, `P/lib/skill-review.js`, `P/lib/skill-loads.js` (nuevo), `P/lib/skill-topics.js` (nuevo), `P/lib/continuity-posttool.js`, `docs/guide/plan-rules.md` (nuevo), `docs/index.md`, `docs/decisions.md` | D9 |

### Reparto en tareas para el enjambre (12)

`Dep` = depende de. Los `Owns` son disjuntos dentro de una ola; donde dos tareas tocan el mismo archivo (`session-start.js`, `autonomy-command.js`, `docs-facts.test.js`, `new-harness-skill.test.js`, `components.md`) una depende de la otra. Cada tarea posee, además de sus archivos, las pruebas que hoy fijan lo que cambia (lista de arriba) y las nuevas. `Review: xhigh` solo donde un error alcanza procesos o datos: T5 (mata procesos) y T3 (abre una corrida con topes de gasto).

| T | Nombre (área) | Archivos que posee | Dep | Sirve a |
| --- | --- | --- | --- | --- |
| T1 | Lectura de modelos (models) | `P/lib/model-listing.js`, `P/lib/model-watch.js`, `P/config/model-watch.json`, `P/bin/aether-observe`, `P/lib/observe-hook.js`, `docs/reference/components.md`; `T/model-listing.test.js`, `T/model-watch.test.js`, `T/observe-hook.test.js`, `T/aether-observe.test.js` (el texto de uso), `T/harness-lists.test.js` | ninguna | R1, R2, R5, R6, R8 |
| T2 | Aviso de inicio y doctor (models) | `P/lib/session-start.js`, `P/lib/doctor.js`; `T/session-start-model-watch.test.js`, `T/doctor.test.js`, `T/session-start-parts.test.js` | T1 | R3, R4, R5 |
| T3 | Topes del plan aprobado (autonomy) | `P/lib/autonomy.js`, `P/lib/autonomy-command.js` (verbo `start`); `T/autonomy.test.js`, `T/autonomy-continue.test.js`, `T/aether-autonomy.test.js` | ninguna | R9, R10, R11 |
| T4 | Limpieza del arranque (tmp) | `P/lib/tree-clean.js`, `P/lib/session-start.js` (paso 5); `T/tree-clean.test.js`, `T/session-start-tree.test.js`, `T/session-start-tidy.test.js` | T2 | R13, R14 |
| T5 | La cadena obedece al freno (delegates) | `P/lib/delegate-chain.js`, `P/lib/lane-delegate.js`, `P/lib/lane-calls.js`, `P/lib/delegate-run.js`, `P/lib/autonomy-command.js` (verbo `quota-brake` y su uso); `T/delegate-chain.test.js`, `T/delegate-run.test.js`, `T/delegate-run-steps.test.js`, `T/aether-lane.test.js`, `T/seat-calls.test.js`, `T/quota-brake-command.test.js`, `T/quota-brake-scenarios.test.js`, `T/quota-brake.test.js`, `T/quota-brake-docs.test.js` | T3 | R16, R17 |
| T6 | Compile al reanudar (plan) | `P/lib/plan-compile.js`; `T/compile-run-launches.test.js`, `T/plan-relaunch.test.js`, `T/plan-scope.test.js`, `T/worktrees-merge.test.js` | ninguna | R19, R20 |
| T7 | Examiner sin respuesta (design) | `P/lib/exam.js`, `P/workflows/design.workflow.js`, `P/lib/seats.js`; `T/exam.test.js`, `T/layout-exam.test.js`, `T/workflow-design.test.js`, `T/seats-design.test.js` | ninguna | R22 (lado flujo), R23 |
| T8 | Textos de reglas (skills) | `P/skills/autonomous-runs/SKILL.md`, `P/skills/swarm/SKILL.md`, `P/agents/examiner.md`, `P/skills/designing/SKILL.md`; `T/autonomous-runs-skill.test.js`, `T/examiner-order.test.js`, pruebas de las skills `swarm` y `designing` | T3, T4, T5, T6, T7 | R12, R15, R18, R21, R22, R24 |
| T9 | Mensaje de merge-main, AGENTS.md y fila Direct (docs-300) | `P/lib/delegate-approve.js`, `AGENTS.md`, `P/skills/using-aether/SKILL.md`, `docs/methodology.md`, `docs/tutorials/first-request.md`, `docs/es/guias/primera-peticion.md`, `site/index.html`, `site/app.js`; `T/delegate-approve.test.js`, `T/using-aether-030.test.js`, `T/docs-facts.test.js`, `T/site.test.js`, `T/issue-300-items.test.js` (nuevo: AGENTS.md y grep de la frase) | ninguna | R25, R26 |
| T10 | Procedimiento de modelo nuevo y documentación (docs) | `.agents/skills/new-harness/SKILL.md`, `docs/guide/plan-rules.md` (nuevo), `docs/index.md`, `docs/decisions.md`, `docs/guide/observe.md` y las páginas de arranque, doctor, corridas y examen que nombre la tarea, `T/new-harness-skill.test.js`, `T/docs-032.test.js`, `T/docs-facts.test.js` | T9 (docs-facts) | R7, R27, R30, R31 |
| T11 | Nombres de las listas de harnesses (harness) | `P/lib/harness/index.js`, `P/lib/harness-names.js`, `P/lib/lanes.js`, `P/lib/doctor.js`, `P/lib/router-pick.js`, `P/lib/router-quota.js`, `P/lib/router-renewal.js`, `P/lib/delegate-calls.js`; `T/copies-harness.test.js`, `T/copies-harness-config.test.js`, `T/harness-index.test.js`, `T/codex-lists.test.js`, `T/router-pick.test.js`, `T/router-renewal.test.js`, `T/lanes-docs.test.js` | T2 (doctor.js), T5 (lane-delegate, delegate-calls), T10 (new-harness-skill.test.js) | R28 |
| T12 | Partir skill-review (skills-lib) | `P/lib/skill-review.js`, `P/lib/skill-loads.js` (nuevo), `P/lib/skill-topics.js` (nuevo), `P/lib/continuity-posttool.js`, `P/lib/session-start.js` (el import de `:530`), `docs/reference/components.md`; `T/skill-review.test.js`, `T/skill-loads.test.js`, `T/skill-topics.test.js` | T4 (session-start.js), T1 (components.md), T10 (new-harness-skill.test.js) | R29 |

Notas: la comprobación final (`npm run check`, la parte 2 del arranque sin crecer) la hace el Lead tras la fusión, no es una tarea. T11 no puede ir antes de T2, T5 y T10 porque posee archivos que ellas cambian; si el Lead prefiere menos dependencias, T11 se puede fundir con T12 en una sola tarea de «higiene de nombres y módulos».

Pruebas que fijan lo que cambia hoy (el mapa de código): `T/harness-index`, `harness-lists`, `copies-harness-config`, `lane-models`, `codex-models`, `models-index`, `seats`, `doctor`, `observe-hook`, `observe-read`, `observe-notice`, `session-start`, `session-start-parts`, `autonomy`, `autonomy-continue`, `aether-autonomy`, `autonomous-runs-skill`, `tree-clean`, `session-start-tree`, `session-start-tidy`, `delegate-chain`, `delegate-run*`, `aether-lane`, `seat-calls`, `quota-brake*`, `compile-run-launches`, `plan-relaunch`, `plan-scope`, `worktrees-merge`, `workflow-design`, `examiner-order`, `seats-design`, `exam`, `layout-exam`, `delegate-approve`, `using-aether-030`, `docs-facts`, `site`, `wt-watch`, `skill-review`, `new-harness-skill`, `lanes-docs`, `codex-lists`, `router-pick`, `router-renewal`. Cada tarea posee los que fijan lo que ella cambia (hallados con la búsqueda de la regla de `Owns`).

## Verification

- Comando: `npm test` (todo), más `node --test tests/<archivo>.test.js` por tarea; `npm run check` antes de la PR.
- C1: `T/model-listing.test.js` (comparación y lectores con procesos de mentira: nuevo, retirado, falla, no contesta, sin medio), `T/model-watch.test.js` (sello del día sin llamadas; una sesión que no es del Lead no hace nada; solo medios sin modelo), `T/observe-hook.test.js` (el cierre no se demora: el proceso se desprende), `T/session-start-model-watch.test.js` y `T/doctor.test.js` (línea de arranque y doctor).
- C2: `T/new-harness-skill.test.js` (la sección) y la prueba de no-escritura de D2 en `T/model-watch.test.js`.
- C3: pruebas con transcripciones falsas en `T/autonomy.test.js` (plan con topes, sin topes, ilegible, bandera sobre plan) y `T/autonomous-runs-skill.test.js`.
- C4: `T/tree-clean.test.js`, `T/session-start-tree.test.js` (con y sin corrida abierta, de otra sesión, texto del aviso), `T/autonomous-runs-skill.test.js`.
- C5: `T/delegate-chain.test.js` (pausa → no lanza), `T/aether-lane.test.js` y `T/delegate-run.test.js` (stop del run termina la cadena), `T/quota-brake-command.test.js` (freno termina cadenas).
- C6: `T/compile-run-launches.test.js` (10 de 54, nueve fusionadas, ofrece una; aviso con crecimiento).
- C7: `T/workflow-design.test.js` (Examiner de mentira con tres pruebas), `T/exam.test.js` (`inventory`, `rebuildIndex`), `T/examiner-order.test.js` y una prueba de documentos de `agents/examiner.md` y `skills/designing`.
- C8: `T/delegate-approve.test.js`, la prueba de grep de la frase, `T/wt-watch`/`T/docs-facts.test.js` (decisión), `T/harness-index.test.js` y las que importan los nombres, `T/skill-review.test.js` y las dos pruebas nuevas de los módulos partidos, `T/docs-facts.test.js` (guía enlazada, componentes).
- Parte 2 del arranque: `T/session-start-parts.test.js` sigue verde y no crece (hoy 549 caracteres libres).

## Assumptions

- Los valores de los tiempos de lectura son 10 s por harness y 30 s en total; se cambian en `P/config/model-watch.json`.
- Muse queda sin medio de captura en esta spec (D1.5): hacer un cliente MSP de `muse serve` no está pedido y es un módulo propio. Se revierte abriendo un issue y una tarea de ese cliente; `aether-doctor` lo informa mientras tanto.
- Codex: `~/.codex/models_cache.json` es tan reciente como la última ejecución de codex; se informa como límite.
- Un id de `models` puede ser string o `{id}`; la comparación usa el id con su sufijo de esfuerzo tal como lo lista el harness (agy lista `gemini-4-argon-high`); un harness que lista un id con sufijo de esfuerzo que la tabla guarda sin él no se cuenta como nuevo si el id sin sufijo está en `models` (misma regla que `offeredByListing`, `P/lib/seats.js:100`).
- `launchRefusal` en la cadena (D5) cubre la pausa y también los topes de tiempo y costo de la corrida; es coherente con las «Run gates» de `AGENTS.md`.
- El vínculo run-tarea vive en `<dataDir>/lanes/links/<laneRunId>.json`; se borra con la limpieza normal de `lanes/` y un run sin vínculo se comporta como hoy.
- Una corrida compilada antes de esta spec no tiene `launches[k].only`: su selección se deriva de `units.json`.
- Los nombres nuevos de las listas (R28) son `ADAPTER_NAMES` y `DELEGATE_HARNESS_NAMES`.
- La decisión de R27 es A128; si otra rama ya la usó, se toma la siguiente.
- AGENTS.md ya contiene el aviso de R25; la tarea solo lo fija con una prueba.

## Risks

- **session-start.js y doctor.js las tocan varias tareas.** El plan las serializa por dependencias (aviso, limpieza, partición de skill-review); si una falla, las siguientes esperan.
- **Los límites del arranque.** La línea del aviso es recortable y limitada a 400 caracteres; si el arranque se acerca a `PART_LIMIT`, el recorte la quita antes que el resto.
- **Una lectura desprendida sigue viva tras el cierre.** Un proceso `models-read` huérfano termina solo con `totalSeconds`; la prueba comprueba que el trabajador sale por tiempo.
- **Matar la cadena puede dejar un par a medio camino.** `stopTask` mata el grupo de procesos de la cadena (con sus hijos); la tarea queda relanzable porque no se anota un resultado (R17).
- **Plan de topes ambiguo.** Con dos cifras distintas del mismo tipo `start` abre con los de defecto y avisa (R11); el dueño ve el aviso al abrir. Mitigación: R12 le dice a quien escribe el plan en qué forma nombrarlos.
- **La spec y `AGENTS.md`.** R25 pedía un aviso nuevo en `AGENTS.md` que ya existe; no es una contradicción pero la tarea queda reducida a una prueba. Se avisa al Lead.
- **Profundidad de dependencias.** Las tareas que comparten `session-start.js`, `docs-facts.test.js` y `docs/reference/components.md` forman una cadena larga; el resto va en paralelo.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Proceso desprendido `aether-observe models-read` al cerrar la sesión | R5: la lectura nunca demora ni hace fallar el cierre, y SessionEnd tiene 30 s | Leer en el proceso del hook obliga a esperar a cuatro CLIs lentas dentro de los 30 s |
| `P/config/model-watch.json` (tiempos y medios de captura) | R5 y supuesto de la spec: los tiempos son valores de configuración | Constantes en el código obligan a editar código para ajustar un tiempo, y la regla del repo es que lo que cambia con el tiempo es dato |
| Registro `lanes/links/<laneRunId>.json` | R16: hoy ningún dato une el run de un delegado editor con su cadena | Buscar procesos por nombre es lo que el Lead hace a mano y la spec lo prohíbe (C5) |
| `launches[k].only` guardado en `state.json` | R19: la selección de la corrida debe sobrevivir a recompilar | Derivarla siempre de `units.json` mezcla lo seleccionado con lo que se añadió después |
