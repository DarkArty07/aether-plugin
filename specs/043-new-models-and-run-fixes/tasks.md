# Tasks 043: aviso de modelos nuevos y arreglos de las corridas largas

**Spec:** [spec.md](spec.md)

## Global Constraints

- Convención de rutas: `P/` = `plugins/aether/`, `T/` = `tests/`. En `Owns` se escriben completas. Los números de línea del mapa de código se confirman al implementar.
- Node.js 22, CommonJS, sin dependencias. Los bins son delgados; la lógica va en `P/lib/`.
- Ninguna tarea hace una llamada pagada ni llama a un modelo; las pruebas usan repositorios temporales (`T/helpers.js`: `tempDir`, `makeRepo`), procesos de mentira y el arnés de flujos con agentes de mentira.
- Ninguna tarea escribe en `P/config/pairs.json`, `P/config/prices.json` ni `P/config/models/harness-models.json` (R8).
- La parte 2 del arranque (`T/session-start-parts.test.js`) no crece: ninguna tarea toca `P/skills/using-aether/SKILL.md` salvo T9, que solo quita una frase (R26).
- Las pruebas nuevas van en el archivo que se nombra; un archivo de prueba existente que fija lo que la tarea cambia se edita en la misma tarea (por eso está en su `Owns`).
- Un módulo nuevo de `P/lib/**` o un bin nuevo se registra en `docs/reference/components.md` dentro de la tarea que lo crea; una tarea que cambia `docs/decisions.md` posee también `docs/index.md`, `T/docs-032.test.js` y `T/docs-facts.test.js` (`.specify/plan-rules.json`).
- Las decisiones nuevas toman los números siguientes al último de `docs/decisions.md` en el momento de construir (hoy A127, así que A128 a A131); si otra rama ya los usó, se toman los siguientes libres.
- Los textos de usuario nuevos van en inglés, como los demás mensajes de `P/lib/`, salvo donde la tarea da el texto exacto.
- Las tareas 1 y 2 no se construyen hasta que el Lead enmiende R1 y C1 de la spec (Muse sin medio de captura, texto pedido en `plan.md` bajo Risks); T1 fija `"muse": null` y la prueba `no-capture`.

## Aether Execution

- Test command: `npm test`
- Max agents: 200

## Checklist

- [ ] T001 [P] [US1] Lector de modelos por harness y comparación pura en P/lib/model-listing.js → Task 1
- [ ] T002 [P] [US3] Trabajo diario `runWatch`, sello y resultado en P/lib/model-watch.js → Task 1
- [ ] T003 [P] [US4] Proceso desprendido `models-read` desde el cierre de sesión en P/lib/observe-hook.js y P/bin/aether-observe → Task 1
- [ ] T004 [US1] Línea de arranque de modelos nuevos y retirados en P/lib/session-start.js → Task 2
- [ ] T005 [US1] Comprobación de modelos en `aether-doctor` en P/lib/doctor.js → Task 2
- [ ] T006 [P] [US7] Topes de horas y dólares leídos del plan aprobado en P/lib/autonomy.js y P/lib/autonomy-command.js → Task 3
- [ ] T007 [US12] Limpieza del arranque respeta la corrida abierta y nombra lo borrado en P/lib/tree-clean.js y P/lib/session-start.js → Task 4
- [ ] T008 [US13] La cadena de delegado obedece la pausa y `stop` y `quota-brake` la terminan en P/lib/delegate-chain.js, P/lib/lane-delegate.js, P/lib/lane-calls.js, P/lib/delegate-run.js y P/lib/autonomy-command.js → Task 5
- [ ] T009 [P] [US15] Compile con `--run` conserva la selección de la corrida y avisa del crecimiento en P/lib/plan-compile.js → Task 6
- [ ] T010 [P] [US17] Inventario de solo lectura del examen (`aether-exam recover`); el diseño devuelve las pruebas en P/lib/exam.js, P/bin/aether-exam, P/hooks/ops-command.mjs y P/workflows/design.workflow.js → Task 7
- [ ] T011 [US7] Textos de las skills y del Examiner para topes, limpieza, freno, reanudar y examen en P/skills/ y P/agents/examiner.md → Task 8
- [ ] T012 [P] [US18] Mensaje de `merge-main`, aviso en AGENTS.md y fuera la frase de la fila Direct → Task 9
- [ ] T013 [US6] Procedimiento del modelo nuevo, guía de reglas del plan y decisiones en .agents/skills/new-harness/SKILL.md y docs/ → Task 10
- [ ] T014 [US2] Renombrar las dos listas `HARNESS_NAMES` en P/lib/harness/index.js y P/lib/harness-names.js → Task 11
- [ ] T015 [US2] Partir P/lib/skill-review.js en tres módulos → Task 12

### Task 1: Lectura de modelos de los harnesses y su resultado diario

**Aether:**
- Area: models
- Owns: `plugins/aether/lib/model-listing.js`, `plugins/aether/lib/model-watch.js`, `plugins/aether/config/model-watch.json`, `plugins/aether/bin/aether-observe`, `plugins/aether/lib/observe-hook.js`, `docs/reference/components.md`, `tests/model-listing.test.js`, `tests/model-watch.test.js`, `tests/observe-hook.test.js`, `tests/aether-observe.test.js`, `tests/harness-lists.test.js`, `tests/components-docs.test.js`
- Depends on: none
- Serves: R1, R2, R5, R6, R8

**Interfaces:**

- `P/config/model-watch.json`: `{"perHarnessSeconds": 10, "totalSeconds": 30, "captureVia": {"agy": {"args": ["models"]}, "grok": {"args": ["models"]}, "codex": {"file": "~/.codex/models_cache.json"}, "muse": null}}`. Es dato, no código; Claude y Cursor no aparecen.
- `P/lib/model-listing.js` exporta:
  - `compare(harnessName, listedIds: string[], table) -> {new: string[], retired: string[]}`. `table` es el contenido de `harness-models.json`. Nuevo = listado que no está en `models` (ids string u objetos `{id}`), `superseded`, `outOfScope` ni `calledNotListed`; un id con sufijo de esfuerzo cuyo id sin sufijo está en `models` no es nuevo (regla de `offeredByListing`, `P/lib/seats.js:100`). Retirado = id de `models` que el harness ya no lista. Pura, no escribe nada.
  - `listModels(harnessName, {env, timeoutMs, spawn, configPath, home}) -> Promise<{status:'ok', ids:string[]} | {status:'failed'|'timeout'|'not-installed'|'no-capture', reason:string}>`. Usa `commandInstalled` (`P/lib/lane-process.js:27`) y el nombre de comando de `P/config/lanes.json`; `muse` da `no-capture` con motivo «no capture means without a model call»; un harness fuera de la tabla `captureVia` (claude, cursor) da `no-capture`.
- `P/lib/model-watch.js` exporta:
  - `runWatch({dataDir, mainRoot, harnesses, now, force, listModels, table, config}) -> Promise<result>`; escribe `<dataDir>/model-watch/result.json` con la forma `{at, harnesses:{<name>:{status, reason?, readAt, new:[], retired:[], noticed:false, skipped?:'total-timeout'}}}`. Sello `<dataDir>/model-watch/stamp.json` `{at}` (patrón de `P/lib/tree-clean.js:52-69`): el mismo día calendario sin `force` no llama a nadie. Solo recorre la intersección de `harnesses` con `{agy, grok, codex, muse}`. Un lector que falla anota su motivo y sigue; `totalSeconds` corta el resto con `skipped:'total-timeout'`. Una diferencia que no estaba en el resultado anterior vuelve a `noticed:false`.
  - `launch({dataDir, mainRoot, env, isLead, harnesses, spawn}) -> void`: arranca `node P/bin/aether-observe models-read` con `detached:true, stdio:'ignore'` y `unref()` (precedente `P/lib/observe-issue.js:133-140`); no arranca nada si la sesión no es del Lead, si no hay harnesses de la intersección o si el sello ya es de hoy; traga todo error y no espera.
  - `readResult(dataDir) -> result|null`, `noticeLine(result) -> string|null` y `markNoticed(dataDir)`. `noticeLine` da `Aether: new models in <harness>: a, b; retired: c.` (un trozo por harness con diferencias sin avisar, `;` entre harnesses), `null` sin diferencias sin avisar, tope de 400 caracteres cortando con ` and N more`.
- `P/bin/aether-observe`: verbo nuevo `models-read` (trabajador): llama a `runWatch`, imprime una línea JSON y sale 0 aunque falle; el texto de uso lo nombra. `P/lib/observe-hook.js` `endSession` llama a `modelWatch.launch` (sin esperar) cuando la sesión es del Lead y la opción `harnesses` la activa.
- `docs/reference/components.md`: `model-listing.js` y `model-watch.js` declarados (familia o sueltos) como exige `.specify/plan-rules.json`.

**Tests (write first):**

`tests/model-listing.test.js`:
- `compare('grok', ['a','b'], table)` con `models:['a']`, `superseded:{b:{}}`, `outOfScope:{c:{}}` → `{new: [], retired: []}`; con listado `['a','z']` → `new:['z']`; con `models:['a','q']` y listado `['a']` → `retired:['q']`; ids de objeto `{id:'x'}` cuentan; `calledNotListed` de Muse cuenta como conocido; `gemini-4-argon-high` no es nuevo si `gemini-4-argon` está en `models`.
- `listModels` con un `spawn` de mentira: salida con dos ids → `status:'ok'` y los dos ids; salida con código 1 → `failed` con motivo; un proceso que no termina dentro de `timeoutMs` → `timeout`; comando que no está en PATH → `not-installed`; `muse`, `claude` y `cursor` → `no-capture`; `codex` con un `models_cache.json` temporal lee sus ids.
- Los argumentos de `captureVia` del archivo real son solo `["models"]` o un archivo de caché, es decir ninguna orden de captura llama a un modelo (R1).
- `compare` no modifica el objeto `table` (comparación profunda antes y después).

`tests/model-watch.test.js`:
- `runWatch` con dos harnesses de mentira (uno con un id nuevo, uno que falla) escribe `result.json` con `new` en el primero y `status:'failed'` con `reason` en el segundo, y no lanza.
- Un segundo `runWatch` el mismo día sin `force` no llama a ningún `listModels` (contador en cero); con `force:true` sí.
- `totalSeconds` agotado: los harnesses restantes quedan `skipped:'total-timeout'`.
- `harnesses:['claude','cursor','agy']` solo lee `agy`.
- `launch` con `isLead:false` no llama a `spawn`; con sello de hoy tampoco; con sesión del Lead y sello viejo llama a `spawn` una vez con `detached:true`, `stdio:'ignore'`, y `unref` llamado; un `spawn` que lanza una excepción no propaga.
- `noticeLine`: sin diferencias → `null`; con nuevos y retirados → texto exacto `Aether: new models in grok: a, b; retired: c.`; una lista enorme cabe en 400 caracteres y termina en `and N more`; después de `markNoticed` → `null`; un id nuevo distinto después vuelve a dar línea.
- R8: el hash SHA-1 de `P/config/pairs.json`, `P/config/prices.json` y `P/config/models/harness-models.json` es el mismo antes y después de `runWatch`, `noticeLine` y `markNoticed`.
- El trabajador `models-read` ejecutado como proceso con `AETHER_*` de prueba y harnesses de mentira sale 0 y respeta `totalSeconds` (sale por tiempo, sin quedar vivo).

`tests/observe-hook.test.js`: el cierre de una sesión del Lead con `harnesses` activos llama a `launch` y no espera (el hook vuelve antes de que el trabajador termine); una sesión que no es del Lead no llama a `launch`. `tests/aether-observe.test.js`: el texto de uso nombra `models-read`; el verbo corre y sale 0. `tests/harness-lists.test.js`: ajustar si algo fija el contenido de `P/config/` que el archivo nuevo cambia.

**Acceptance:**

- Dos lecturas el mismo día llaman a cada harness una sola vez; Claude, Cursor y los harnesses no activos nunca se leen; una sesión que no es del Lead no hace nada.
- Un harness que falla, no está instalado o no contesta se salta con su motivo; el cierre de la sesión no se demora ni falla.
- Nada escribe en `pairs.json`, `prices.json` ni `harness-models.json`.
- `node --test tests/model-listing.test.js tests/model-watch.test.js tests/observe-hook.test.js tests/aether-observe.test.js tests/harness-lists.test.js tests/docs-facts.test.js` pasa.

### Task 2: Aviso de inicio y doctor de modelos nuevos

**Aether:**
- Area: models
- Owns: `plugins/aether/lib/session-start.js`, `plugins/aether/lib/doctor.js`, `tests/session-start-model-watch.test.js`, `tests/doctor.test.js`, `tests/session-start-parts.test.js`
- Depends on: Task 1 — usa `readResult`, `noticeLine` y `markNoticed` de `model-watch.js` y el `result.json` que escribe
- Serves: R3, R4, R5

**Interfaces:**

- `P/lib/session-start.js`: `contextOf` (`:569-577`) suma la línea `modelWatch.noticeLine(modelWatch.readResult(dataDir))` junto a `calibrationNote` y llama a `markNoticed(dataDir)` solo en la ejecución de las notas (la que escribe el payload al final de `main`), después de escribirlo y solo si la línea quedó dentro del payload: si el recorte la quitó, `noticed` sigue en `false`. Las ejecuciones `--part k` salen antes (`:308-311`), no construyen `contextOf` y nunca llaman a `markNoticed`. La línea cuenta entre las que los bucles de recorte (`:592`, `:602`) quitan primero. Una lectura rota o ausente no añade nada ni lanza. No toca `PART_LIMIT` ni `using-aether`.
- `P/lib/doctor.js`: `modelsCheck({dataDir, harnesses, ...}) -> check` agregado al arreglo `checks` (`:340-352`) con `check(id:'models', status, detail, fix)`: `info` cuando hay diferencias o no hay lectura; `warn` cuando algún harness activo no se pudo leer; nunca `error`. El detalle muestra por harness activo: nuevos, retirados, cuándo se leyó (`readAt`) y, si falló, el motivo; para Codex agrega el límite «cache is as fresh as the last codex run»; para Muse muestra «no capture means». Solo lee el resultado; no escribe nada (ni `noticed`).

**Tests (write first):**

`tests/session-start-model-watch.test.js` (repositorio y dataDir temporales, sesión del Lead):
- Con un `result.json` con un nuevo en `grok`, el contexto de arranque contiene `new models in grok:` y el id; un segundo arranque no la repite (`noticed` quedó en `true`).
- Sin `result.json`, o con JSON roto, el arranque no añade línea y no falla.
- Una diferencia nueva distinta después del primer aviso da línea otra vez.
- Con el contexto cerca de `PART_LIMIT` el recorte quita la línea del aviso antes que el contexto base y cada parte sigue en 9.800 caracteres como máximo; cuando el recorte la quita, `result.json` conserva `noticed:false` y el arranque siguiente (con espacio) la muestra.
- Una ejecución `aether-session-start --part 1` (y 2, 3) con un `result.json` con diferencias sin avisar no cambia `result.json` (`noticed` sigue en `false`) y su salida no contiene la línea.

`tests/doctor.test.js`: con un resultado con diferencias el check `models` es `info` y su detalle nombra el harness, el id nuevo, el retirado y `readAt`; con un harness `failed` es `warn` y el detalle dice el motivo; sin lectura es `info`; `run()` sigue con `ok:true` en todos esos casos; el doctor deja `result.json` byte por byte igual. `tests/session-start-parts.test.js`: las tres partes siguen dentro del límite y la parte 2 conserva sus caracteres libres (no crece).

**Acceptance:**

- La línea sale una vez por diferencia, cabe en los topes y se recorta primero; `aether-doctor` muestra siempre la comparación completa sin escribir.
- `node --test tests/session-start-model-watch.test.js tests/doctor.test.js tests/session-start-parts.test.js tests/session-start.test.js` pasa.

### Task 3: Topes de la corrida leídos del plan aprobado

**Aether:**
- Review: xhigh — abre una corrida autónoma con topes de gasto y horas; un tope mal leído gasta de más o corta una corrida
- Area: autonomy
- Owns: `plugins/aether/lib/autonomy.js`, `plugins/aether/lib/autonomy-command.js`, `tests/autonomy.test.js`, `tests/autonomy-continue.test.js`, `tests/aether-autonomy.test.js`
- Depends on: none
- Serves: R9, R10, R11

**Interfaces:**

- `P/lib/autonomy.js`:
  - `approvedPlanText(records, latestStarted) -> string|null`: el texto que sigue a `## Approved Plan:` en el `tool_result` de la aprobación que `hasApprovedPlanMode` (`:82-101`) acepta; `null` si no hay. `hasApprovedPlanMode` conserva su resultado booleano.
  - `ceilingsFromPlan(text) -> {hours: number|null, usd: number|null, unreadable: string[]}`: cifras de horas (`N h`, `N horas`, `N hours`) y de dólares (`US$ N`, `USD N`, `$N`, `N dólares`, `N dollars`); si un tipo tiene más de una cifra distinta, ese tipo queda `null` y se añade a `unreadable` (`'hours'` o `'usd'`); sin ninguna cifra de un tipo, `null` sin `unreadable`. Acepta decimales y miles (`US$ 1,000`).
  - `ceiling()` (`:486-490`) pasa a dar `source: 'flag' | 'plan' | 'default'` (la bandera se registra como `flag`; los estados guardados antes con `owner` siguen leyéndose). `start(mainRoot, {quote, session, hours, usd})` (`:520`): para cada tope sin bandera usa el del plan si lo hay, si no el de `config/autonomy.json`. Devuelve además `notices: string[]`: (a) bandera distinta de la cifra del plan: `--hours 12 overrides the approved plan's 10 h` (y el equivalente `--usd`); (b) abrió con los de defecto y el plan nombraba otros: `the approved plan named <cifras>, but start opened with the default ceilings` y, si `unreadable`, `the approved plan named more than one <hours|usd> figure, so start could not read it`. `ceilings.source` guarda por tope `flag|plan|default`.
- `P/lib/autonomy-command.js` verbo `start` (`:185-194`): imprime con qué topes abrió y de dónde salió cada uno (`hours 10 (plan), usd 300 (plan)`) y cada aviso. No lee mensajes del dueño.

**Tests (write first):** en `tests/autonomy.test.js`, con los ayudantes de transcripciones falsas (`human`, `assistant`, `toolResult`, `planUse`, `planResult`). Hoy `planResult(toolUseId, approved, timestamp)` (`tests/autonomy.test.js:576`) pone un contenido fijo, `User has approved your plan. You can now start coding.`; esta tarea le añade un cuarto parámetro `planText`: con él el contenido es ese mismo texto seguido de `\n\n## Approved Plan:\n` y `planText`; sin él, igual que hoy (las pruebas existentes no cambian). Casos:
- Plan aprobado cuyo texto dice «10 h» y «US$ 300», sin banderas → `start` abre con `hours:10`, `usd:300`, `source:{hours:'plan', usd:'plan'}` y la salida del verbo lo dice.
- La misma aprobación con `hours:12` por bandera → `hours:12` (`flag`), `usd:300` (`plan`) y un aviso con las dos cifras (10 y 12); con la bandera igual a la del plan no hay aviso.
- Plan sin cifras → abre como hoy: 8 h y US$ 50 (`default`), sin aviso; con `usd` por bandera, esa cifra y `flag`.
- Plan con dos cifras de horas distintas (`4 h` y `10 h`) → horas por defecto, aviso de `unreadable`; el tipo de dólares sigue su camino normal.
- Plan que nombra 10 h y US$ 300 pero sin aprobación en la transcripción (o con una aprobación anterior a otra corrida ya abierta) → `start` se niega como hoy y no usa esas cifras.
- `ceilingsFromPlan` con tabla de casos: `10 horas`, `$300`, `300 dollars`, `USD 1,000`, texto vacío, `null`.
- Un mensaje humano posterior a la aprobación con otra cifra no cambia nada (R10: `start` no lee mensajes).
`tests/autonomy-continue.test.js` y `tests/aether-autonomy.test.js`: ajustar las afirmaciones que fijaban `source:'owner'` y la salida de `start`, y comprobar la salida con el origen de cada tope.

**Acceptance:**

- El `start` sin banderas tras la aprobación de un plan con topes abre con esos topes y dice su origen; la bandera manda y se avisa de la diferencia; un plan sin topes deja todo como hoy; uno ilegible abre con los de defecto y lo avisa.
- `node --test tests/autonomy.test.js tests/autonomy-continue.test.js tests/aether-autonomy.test.js` pasa.

### Task 4: Limpieza del arranque respeta la corrida abierta

**Aether:**
- Area: tmp
- Owns: `plugins/aether/lib/tree-clean.js`, `plugins/aether/lib/session-start.js`, `tests/tree-clean.test.js`, `tests/session-start-tree.test.js`, `tests/session-start-tidy.test.js`
- Depends on: Task 2 — comparte `session-start.js` y esa tarea cambia `contextOf` primero
- Serves: R13, R14

**Interfaces:**

- `P/lib/tree-clean.js` `cleanProject(cwd, {now, dataDir, force, openRun})`: con `openRun === true` salta el paso 1 (`.aether/tmp` y `.aether-tmp`); el paso 2 (seats y delegates, `WORK_DAYS = 7`) no cambia; `.aether/autonomy/` sigue prohibido por `isSafeToDelete`. No añade campos al resultado: `cleanProject` ya devuelve `{ ran, removed, kept }` (`:285`) con `removed: [{path, why}]` de todos los pasos. No importa `autonomy`.
- `P/lib/session-start.js` paso 5 (`:445-455`): `openRun = autonomy.openRuns(mainRoot).length > 0` (cualquier corrida del proyecto, de la sesión que sea) y se lo pasa a `cleanProject`. `cleanNote` se arma desde `removed` (N = `removed.length`, rutas = `removed[i].path` relativas a `cwd`): `Aether cleaned N old item(s) of .aether/: <p1>, <p2>, <p3> and M more.` (hasta 3 rutas; sin « and M more» si N ≤ 3).

**Tests (write first):**
- `tests/tree-clean.test.js`: con `openRun:true` y un archivo de 48 h en `.aether/tmp` y otro en `.aether-tmp`, `cleanProject` no borra ninguno (`removed` sin entradas del paso 1); con `openRun:false` los borra y `removed` los nombra; el paso 2 borra un seat de más de 7 días aun con `openRun:true`; `.aether/autonomy/<id>/guion.sh` de 48 h nunca se borra en ningún caso; sin `openRun` el umbral de 24 h sigue igual (un archivo de 23 h no se borra).
- `tests/session-start-tree.test.js`: con una corrida autónoma abierta en el proyecto (de otra sesión) y archivos viejos en `.aether/tmp`, el arranque no los borra; tras cerrar la corrida (`ended` no nulo) y arrancar de nuevo, los borra y el aviso nombra las rutas, 3 como máximo y `and N more` con cinco borrados.
- `tests/session-start-tidy.test.js`: ajustar el texto del aviso de limpieza que fijaba el recuento sin rutas.

**Acceptance:**

- Con una corrida abierta no se borra nada de `.aether/tmp`; sin ella se borra con el umbral de 24 h y el aviso nombra lo borrado.
- `node --test tests/tree-clean.test.js tests/session-start-tree.test.js tests/session-start-tidy.test.js tests/session-start-parts.test.js` pasa.

### Task 5: La cadena del delegado obedece el freno y lo termina

**Aether:**
- Review: xhigh — mata procesos (grupos de procesos de la cadena) y decide si un par se lanza o no durante una pausa de cuota
- Area: delegates
- Owns: `plugins/aether/lib/delegate-chain.js`, `plugins/aether/lib/lane-delegate.js`, `plugins/aether/lib/lane-calls.js`, `plugins/aether/lib/delegate-run.js`, `plugins/aether/lib/autonomy-command.js`, `tests/delegate-chain.test.js`, `tests/delegate-run.test.js`, `tests/delegate-run-steps.test.js`, `tests/aether-lane.test.js`, `tests/seat-calls.test.js`, `tests/quota-brake-command.test.js`, `tests/quota-brake-scenarios.test.js`, `tests/quota-brake.test.js`, `tests/quota-brake-docs.test.js`, `tests/lane-delegate.test.js`, `tests/lane-delegate-ladder.test.js`
- Depends on: Task 3 — comparte `autonomy-command.js` (esa tarea cambia el verbo `start`, esta el verbo `quota-brake`)
- Serves: R16, R17

**Interfaces:**

- `P/lib/delegate-chain.js` `runChain` (`:80`): antes de cada candidato del bucle `for (const candidate of queue)` (`:91`) llama a `autonomy.launchRefusal(cwd, {session, dataDir, now})` (`P/lib/autonomy.js:1068`, el mismo que usan `delegate-task.js:625` y `plan-compile.js:322`) y actúa solo cuando el rechazo trae `stop === 'quota'`, que es lo que pide R17; un rechazo por tope de tiempo o de costo no cambia la cadena. Con la pausa de cuota no lanza el par y devuelve el mismo resultado relanzable que hoy devuelve un rechazo de arranque (`isStartRefusal`, `:46-50`), con el motivo; nunca `failed`, y sin anotar un resultado de la tarea (queda relanzable al reanudar).
- Vínculo: `P/lib/lane-delegate.js` (`:416`, `run.newRunId()`), al arrancar una llamada editora, escribe `<dataDir>/lanes/links/<laneRunId>.json` `{id, session, writtenAt}` (`id` y `session` de la tarea delegada) con `run.writeJson` (atómico). `P/lib/delegate-run.js` exporta:
  - `stopTask(dataDir, {id, session}, {graceMs = 5000}) -> {stopped: boolean, pid?, reason?}`: lee `run/<fileKey(session, id)>.json` `{pid, startedAt}` (`:40`). Comprueba que el proceso vivo es el de ese archivo: si el proceso arrancó después de `startedAt` más 5 s de holgura (pid reutilizado), o si su arranque no se puede leer, no lo toca (`stopped:false`, `reason:'unverified'`). Si es el suyo manda `SIGTERM` al pid (`runDelegate` mata entonces el grupo propio del par, `P/lib/delegate-calls.js:28`, `:285-292`), espera hasta `graceMs` a que muera y, si sigue vivo, `SIGKILL` a su grupo. Un pid muerto o sin archivo da `stopped:false` sin lanzar.
  - `stopAll(dataDir, {sessions}, {graceMs}) -> {stopped: number, skipped: [{key, reason}]}`: solo los archivos de `run/` cuya clave empieza con `<largo>-<sesión>--` de alguna de las `sessions` dadas (el directorio de datos instalado se comparte entre proyectos y sesiones); cada uno con las mismas comprobaciones de `stopTask`. Sin `sessions` o con la lista vacía no toca nada.
  - `P/lib/lane-calls.js` `stop(cwd, runId, call)` (`:685`), tras matar las llamadas del run, busca el vínculo del `runId` y llama a `stopTask(dataDir, {id, session})`; un run sin vínculo se comporta como hoy.
- `P/lib/autonomy-command.js` verbo `quota-brake` (`:317`): llama a `stopAll(dataDir, {sessions})` con las sesiones de las corridas frenadas (las que tienen una pausa activa) y añade `chains stopped N` a su salida; el texto de uso (`:23`, `:37`) deja de pedir al Lead que los detenga primero.

**Tests (write first):**
- `tests/delegate-chain.test.js`: con una pausa de cuota anotada en `run.json` (`quotaPauses` activa), `runChain` con dos pares en cola no llama a `runDelegate` ni una vez y devuelve un resultado relanzable (no `failed`); sin pausa lanza el primero como hoy; con pausa anotada entre el primer y el segundo par, lanza el primero y no el segundo; con un tope de costo superado y sin pausa de cuota, `runChain` lanza como hoy (R17 habla solo de la pausa). Tras el rechazo `aether-delegate` deja la tarea en un estado desde el que se relanza (afirmación explícita: no hay resultado `failed` ni verdicto en el registro).
- `tests/delegate-run.test.js` y `tests/delegate-run-steps.test.js`:
  - `stopTask` con un proceso de mentira que escribió `run/<fileKey>.json` `{pid, startedAt}` y que, al recibir `SIGTERM`, mata a un nieto que lanzó con `detached:true` (grupo propio) y sale: devuelve `stopped:true`, el pid y el nieto dejan de vivir y no hizo falta `SIGKILL`; tras eso `wait` devuelve `{done:true, ok:false, status:'died'}`.
  - Un proceso de mentira que ignora `SIGTERM` muere por `SIGKILL` tras `graceMs` (se pasa uno corto en la prueba).
  - Con pid muerto devuelve `stopped:false` sin lanzar; con un archivo cuyo `startedAt` es de hace un día y un pid vivo que arrancó ahora (pid reutilizado) devuelve `stopped:false`, `reason:'unverified'` y el proceso sigue vivo.
  - `stopAll(dataDir, {sessions:['A']})` con dos cadenas de la sesión A y una de la sesión B: mata las dos de A y la de B sigue viva; con `sessions` vacía no mata ninguna.
- `tests/aether-lane.test.js` y `tests/seat-calls.test.js`: una llamada editora arrancada deja `lanes/links/<laneRunId>.json` con `id` y `session`; `aether-lane stop <runId>` con vínculo termina también el proceso de la cadena (el pid de mentira del delegado muere) y sin vínculo se comporta como hoy; las llamadas de solo lectura no escriben vínculo o no rompen lo que ya fijan.
- `tests/quota-brake-command.test.js`, `tests/quota-brake-scenarios.test.js`, `tests/quota-brake.test.js`: `quota-brake` con un delegado en vuelo de la sesión de la corrida frenada termina su proceso y la salida contiene `chains stopped 1`; un delegado en vuelo de otra sesión del mismo directorio de datos sigue vivo; el texto de uso ya no pide al Lead detener delegados a mano.
- `tests/quota-brake-docs.test.js`: ajustar lo que fijaba el texto de uso viejo.

**Acceptance:**

- Con la pausa de cuota anotada ninguna cadena lanza un par nuevo y la tarea queda relanzable; `aether-lane stop` y `quota-brake` terminan la cadena (y el par que esté en vuelo) sin que el Lead busque procesos, y no tocan cadenas de otras sesiones ni un pid reutilizado.
- `node --test tests/delegate-chain.test.js tests/delegate-run.test.js tests/delegate-run-steps.test.js tests/aether-lane.test.js tests/seat-calls.test.js tests/quota-brake-command.test.js tests/quota-brake-scenarios.test.js tests/quota-brake.test.js tests/quota-brake-docs.test.js` pasa.

### Task 6: Recompilar con --run conserva la selección de la corrida

**Aether:**
- Area: plan
- Owns: `plugins/aether/lib/plan-compile.js`, `tests/compile-run-launches.test.js`, `tests/plan-relaunch.test.js`, `tests/plan-scope.test.js`, `tests/worktrees-merge.test.js`
- Depends on: none
- Serves: R19, R20

**Interfaces:**

- `P/lib/plan-compile.js` `compile` (`:315`): `state.json` `launches` sigue siendo un número (`previous.launches + 1`, `:513`; `tests/aether-plan.test.js:229` y `:237` lo fijan con `state.launches, 3` y no cambian ni se poseen aquí). La selección va en un campo nuevo, `selections`: un arreglo con un elemento por lanzamiento, en orden, cada uno `string[]` de ids de tareas o `null` (= todo el plan). Un lanzamiento con `--only` guarda esos ids; uno con `--run` y sin `--only` guarda la selección heredada de la corrida; uno sin ninguno guarda `null`. Con `--run` y sin `--only`, la selección de la corrida es la unión de `selections` (un `null` en cualquiera = todo el plan); para corridas sin el campo, se deriva de `units.json` (`run.extendUnits`, `P/lib/run.js:163-165`). Se ofrece `selección − fusionadas` (`alreadyMerged`, `:336-349`) en lugar de «todo el plan − fusionadas». Un `--only` explícito sigue mandando.
- Si el conjunto ofrecido es mayor que el que ofreció el lanzamiento anterior de esa corrida, escribe por stderr exactamente `recompile offers N tasks, the previous launch offered M` (N y M son las cifras; M es el número de tareas del `graph.json` anterior de la corrida, leído antes de escribir el nuevo).

**Tests (write first):** en `tests/compile-run-launches.test.js`:
- Plan de 54 tareas (generado), `compile --only` de 10 → corrida `r`; se fusionan nueve en el estado de la corrida (`wt.mergedUnits`); `compile --run r` sin `--only` ofrece exactamente la décima tarea (el `tasks` del resultado tiene longitud 1) y `state.json` `selections[1]` es la selección heredada (las diez tareas), no `null`; `state.json` `launches` sigue siendo el número `2`.
- Una corrida cuyo primer lanzamiento no tenía `--only` (`only: null`) ofrece todo el plan menos lo fusionado, como hoy.
- Una corrida sin `selections` (estado antiguo) deriva la selección de `units.json`.
- Dos lanzamientos con `--only` distintos: la selección es la unión.
- `--only` explícito en el recompile manda sobre la selección guardada.
- Aviso: una recompilación cuyo conjunto ofrecido (6) es mayor que el del lanzamiento anterior (3) escribe por stderr `recompile offers 6 tasks, the previous launch offered 3`; un conjunto igual o menor no escribe ese aviso.
`tests/plan-relaunch.test.js`, `tests/plan-scope.test.js`, `tests/worktrees-merge.test.js`: ajustar lo que fijaba «todo el plan − fusionadas» y comprobar que lo existente sigue verde.

**Acceptance:**

- Recompilar con `--run` ofrece solo lo pendiente de la selección de la corrida y avisa por stderr si el conjunto crece.
- `node --test tests/compile-run-launches.test.js tests/plan-relaunch.test.js tests/plan-scope.test.js tests/worktrees-merge.test.js` pasa.

### Task 7: El Examiner sin respuesta no pierde sus pruebas

**Aether:**
- Area: design
- Owns: `plugins/aether/lib/exam.js`, `plugins/aether/bin/aether-exam`, `plugins/aether/hooks/ops-command.mjs`, `plugins/aether/hooks/ops.test.ts`, `plugins/aether/workflows/design.workflow.js`, `plugins/aether/lib/seats.js`, `tests/exam.test.js`, `tests/layout-exam.test.js`, `tests/workflow-design.test.js`, `tests/seats-design.test.js`, `tests/seats.test.js`, `tests/seat-partial.test.js`, `tests/ops-command-design.test.js`
- Depends on: none
- Serves: R22, R23

**Interfaces:**

- `P/lib/exam.js`: `inventory(examDir) -> [{path, inIndex: boolean}]`, la lista de las pruebas de `.aether/exam/` (cada archivo de prueba, sin `exam.json`), marcada por si `readExam` (`:55`) las tiene en el índice. Solo lee: no reconstruye el índice ni escribe nada, porque R24 pide que una prueba fuera del índice se corra antes de añadirla y eso lo decide el Lead.
- `P/bin/aether-exam`: verbo nuevo `recover <specs/NNN-topic>` (el texto de uso lo nombra: `store | run | recover`), de solo lectura. En el checkout de `cwd` llama a `inventory` e imprime una línea `{feature, tests:[{path, inIndex}]}`; con la carpeta ausente imprime `tests: []`. No escribe `exam.json` ni nada bajo `.aether/exam/`, y no toca el almacén (eso es `store`). La lógica va en `P/lib/exam.js` (`recoverCheckout(cwd, feature)`), el bin solo la llama.
- `P/hooks/ops-command.mjs` (`:142`): la entrada `'aether-exam'` admite además `{ checks: [word('recover'), is(FEATURE)] }`; `store` no cambia y ninguna otra forma entra. `P/hooks/ops.test.ts` y `tests/ops-command-design.test.js` (`:46`, `:51`, `:85`) se ajustan para fijar la lista.
- `P/workflows/design.workflow.js` `examine(author)` (`:989-1000`): el flujo no tiene `require` ni disco, así que todo va por `ops`. Cuando el Examiner (nativo tras su reintento, `:467-482`, o externo) termina sin una respuesta que cumpla su esquema, antes de devolver el fallo llama `opsTwice('aether-exam recover <feature>', {phase:'Exam', label:'exam: recover'})` y devuelve `{status:'failed', step:'examiner', reason, tests:[{path, inIndex}]}` con lo que `recover` imprimió. Si `recover` falla, devuelve el fallo del Examiner sin `tests` y con el error de `recover` en `reason`. El camino de un examen que sí contestó no cambia. `P/lib/seats.js` solo se toca si el índice reconstruido lo pide.

**Tests (write first):**
- `tests/exam.test.js`: con `.aether/exam/` de tres pruebas (`a.test.js`, `b.test.js`, `c.test.js`) y `exam.json` con `a` y `b`: `inventory` devuelve tres entradas con `inIndex` true, true, false; `exam.json` y los archivos de la carpeta quedan byte por byte iguales; con la carpeta ausente → `[]` sin lanzar.
- `tests/exam.test.js` (también): `aether-exam recover specs/NNN-x` en un repositorio temporal con tres pruebas y un índice de dos imprime las tres marcas y deja `.aether/exam/` sin cambios (el `exam.json` no se toca); sin carpeta imprime `tests: []`; una forma con argumento de más da el error de uso y sale con 1.
- `plugins/aether/hooks/ops.test.ts` y `tests/ops-command-design.test.js`: `aether-exam recover specs/007-demo` se admite y se analiza como `aether-exam` con `['recover', feature]`; `aether-exam recover docs/x`, `aether-exam recover specs/007-demo --from /tmp` y `aether-exam list` se rechazan; `store` sigue admitido.
- `tests/workflow-design.test.js` (arnés `tests/workflow-harness.js`; su manejador de `ops` añade `recover`, y la prueba de `:393` suma `recover` a los verbos de `ops` del camino con fallo): un Examiner de mentira que escribe tres pruebas, deja dos en el índice y termina sin respuesta válida (dos veces en el camino nativo) → el diseño llama una vez a `aether-exam recover` por `ops` y devuelve `status:'failed'`, `step:'examiner'` y `tests` con las tres marcas (dos `inIndex:true`, una `false`); con un `recover` de mentira que falla, devuelve el fallo del Examiner sin `tests`; un Examiner que responde bien da el mismo resultado que hoy (`approved` con `exam`); el camino externo con salida parcial se prueba igual.
- `tests/layout-exam.test.js` y `tests/seats-design.test.js`: ajustar solo lo que cambia (nuevo campo `tests`).

**Acceptance:**

- Un Examiner sin respuesta entrega al Lead las pruebas existentes marcadas en el índice o fuera de él, sin escribir nada: añadir al índice una prueba fuera de él lo decide el Lead tras correrla (R24).
- `node --test tests/exam.test.js tests/layout-exam.test.js tests/workflow-design.test.js tests/seats-design.test.js tests/ops-command-design.test.js` pasa, y `npm run test:mod` (los `ops.test.ts` del mod) pasa.

### Task 8: Textos de las reglas del Lead y del Examiner

**Aether:**
- Area: skills
- Owns: `plugins/aether/skills/autonomous-runs/SKILL.md`, `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/skills/designing/SKILL.md`, `plugins/aether/agents/examiner.md`, `tests/autonomous-runs-skill.test.js`, `tests/examiner-order.test.js`, `tests/designing-skill-043.test.js`, `tests/swarm-skill-043.test.js`
- Depends on: Task 3 — el texto de R12 nombra la forma exacta que `start` lee
- Depends on: Task 4 — el texto de R15 nombra la carpeta que la limpieza respeta
- Depends on: Task 5 — el texto de R18 nombra lo que `quota-brake` y `aether-lane stop` terminan
- Depends on: Task 6 — el texto de R21 dice que el compile conserva la selección
- Depends on: Task 7 — el texto de R22 y R24 describe lo que el flujo entrega
- Serves: R12, R15, R18, R21, R22, R24

**Interfaces:**

Textos (en inglés, como las skills existentes), una frase o párrafo corto por requisito:
- `autonomous-runs/SKILL.md`: (R12) el plan que se aprueba nombra sus topes como `N h` y `US$ N` (o `USD N`), una sola cifra de cada; la aprobación del plan que los nombra cuenta como la cifra del dueño; el Lead pasa `--hours` o `--usd` a `aether-autonomy start` cuando el dueño escribió una cifra después de aprobar. (R15) lo que tiene que durar toda la corrida (guiones, marcadores) va en `.aether/autonomy/<id>/`, junto al diario, y no en `.aether/tmp`. (R18) borrar la instrucción de buscar y terminar a mano los procesos `aether-delegate run` tras el freno y decir que `aether-autonomy quota-brake` y `aether-lane stop` terminan la cadena.
- `swarm/SKILL.md`: (R21) reanudar una corrida es recompilar con `aether-plan compile <tasks.md> --run <runId>`; el compile conserva la selección de la corrida y avisa por stderr si el conjunto ofrecido crece.
- `agents/examiner.md` (`:25` y formato `:51-58`): (R22) deja `exam.json` verdadero tras cada prueba terminada y corrida: una entrada por prueba, escrita al terminar esa prueba.
- `designing/SKILL.md` (`:24`): (R24) con `exam.status: failed`, una prueba fuera del índice se corre antes de añadirla al índice.

**Tests (write first):** cada prueba lee el archivo y afirma con una expresión regular sobre su texto:
- `tests/autonomous-runs-skill.test.js`: contiene `US$` y `--hours` y `--usd` junto a «approv»; contiene `.aether/autonomy/<id>/` junto a `.aether/tmp`; contiene `quota-brake` y `aether-lane stop` y la palabra `chain`; ya no contiene la instrucción vieja de matar `aether-delegate run` a mano (afirmación negativa sobre la frase retirada).
- `tests/swarm-skill-043.test.js` (nuevo): `swarm/SKILL.md` contiene `--run` junto a «resum» y dice que conserva la selección.
- `tests/examiner-order.test.js`: `agents/examiner.md` dice que `exam.json` se deja verdadero «after each test» (una entrada por prueba).
- `tests/designing-skill-043.test.js` (nuevo): `designing/SKILL.md` contiene `exam.status` `failed` y la regla de correr la prueba fuera del índice antes de añadirla.
- Las pruebas que ya fijan estos archivos (`T/docs-032`, `T/docs-facts`, `T/codex-docs`, `T/workflow-*`) se corren para confirmar que siguen verdes; ninguna se edita aquí.

**Acceptance:**

- Cada texto dice lo que su requisito pide y la prueba lo fija; la parte 2 del arranque no crece (esta tarea no toca `using-aether`).
- `node --test tests/autonomous-runs-skill.test.js tests/examiner-order.test.js tests/designing-skill-043.test.js tests/swarm-skill-043.test.js tests/docs-facts.test.js tests/session-start-parts.test.js` pasa.

### Task 9: Mensaje de merge-main, aviso en AGENTS.md y fuera la frase de la fila Direct

**Aether:**
- Area: docs-300
- Owns: `plugins/aether/lib/delegate-approve.js`, `AGENTS.md`, `plugins/aether/skills/using-aether/SKILL.md`, `docs/methodology.md`, `docs/tutorials/first-request.md`, `docs/es/guias/primera-peticion.md`, `site/index.html`, `site/app.js`, `tests/delegate-approve.test.js`, `tests/using-aether-030.test.js`, `tests/docs-facts.test.js`, `tests/site.test.js`, `tests/issue-300-items.test.js`, `tests/agents-md.test.js`
- Depends on: none
- Serves: R25, R26

**Interfaces:**

- `P/lib/delegate-approve.js` (`MERGE_MAIN`, `:20`; rechazo `:245`): el rechazo en `main` o `master` sin permiso `merge-main` dice el siguiente paso, texto exacto (la sintaxis real es `aether-autonomy grant --class <class> --quote <text>`, `P/lib/autonomy-command.js:9`): `merge-main needs a grant: ask the owner for the merge, record it with aether-autonomy grant --class merge-main --quote "<their words>", then run approve again`.
- `AGENTS.md` ya contiene en «Commands» el aviso de que en un árbol de desarrollo los nombres `aether-*` en `PATH` son los bins de la versión instalada; no se reescribe, solo lo fija una prueba. No se añade nada a la skill `using-aether` para R25.
- R26: quitar la frase de la fila «Direct» (EN: «the tests the rule asks to run after a merge do not count»; ES: «las pruebas que la regla pide tras una fusión no cuentan») de `P/skills/using-aether/SKILL.md:110`, `docs/methodology.md:42`, `docs/tutorials/first-request.md:34`, `docs/es/guias/primera-peticion.md:34`, `site/index.html:221` (`p.direct.w`), `site/app.js:70` (ES) y `:237` (EN), conservando el resto de cada fila y de cada oración.

**Tests (write first):**
- `tests/delegate-approve.test.js` (`:158`): el rechazo contiene exactamente el texto anterior, incluidos `aether-autonomy grant --class merge-main --quote "<their words>"` y `run approve again`.
- `tests/issue-300-items.test.js` (nuevo): (a) `AGENTS.md` contiene `names on \`PATH\`` o el aviso equivalente con las palabras `development tree` y `installed release`; (b) ningún archivo fuera de `specs/` y `node_modules` (recorrido de `P/`, `docs/`, `site/`, `AGENTS.md`, `README.md`) contiene `do not count` junto a `after a merge`, ni `no cuentan` junto a `tras una fusión`.
- `tests/using-aether-030.test.js` (`:52`, `:78`), `tests/docs-facts.test.js` (`:826-827`, `:853-854`) y `tests/site.test.js` (`:382-383`): quitar o invertir las afirmaciones que fijaban la frase vieja.

**Acceptance:**

- El rechazo de `merge-main` dice el paso siguiente; AGENTS.md lo del `PATH` fijado por prueba; la frase no queda en ningún archivo vivo; la parte 2 del arranque no crece (solo se quitan caracteres).
- `node --test tests/delegate-approve.test.js tests/issue-300-items.test.js tests/using-aether-030.test.js tests/docs-facts.test.js tests/site.test.js tests/session-start-parts.test.js` pasa.

### Task 10: Procedimiento del modelo nuevo, guía de las reglas del plan y decisiones

**Aether:**
- Area: docs
- Owns: `.agents/skills/new-harness/SKILL.md`, `docs/guide/plan-rules.md`, `docs/index.md`, `docs/decisions.md`, `docs/guide/observe.md`, `docs/guide/troubleshooting.md`, `docs/guide/autonomy.md`, `docs/guide/delegates.md`, `docs/guide/design-seats.md`, `docs/guide/maintenance.md`, `docs/reference/components.md`, `tests/new-harness-skill.test.js`, `tests/docs-032.test.js`, `tests/docs-facts.test.js`
- Depends on: Task 9 — comparte `tests/docs-facts.test.js` y esa tarea edita sus afirmaciones primero
- Depends on: Task 1 — describe el aviso de modelos nuevos y comparte `docs/reference/components.md`
- Depends on: Task 2 — describe lo que muestra `aether-doctor`, que esa tarea construye
- Depends on: Task 4 — describe que la limpieza de `.aether/tmp` respeta la corrida abierta y nombra lo borrado, que esa tarea construye
- Depends on: Task 3 — describe los topes del plan aprobado
- Depends on: Task 5 — describe que el freno termina la cadena
- Depends on: Task 6 — describe que `--run` conserva la selección
- Depends on: Task 7 — describe el examen devuelto sin respuesta y el verbo `recover`
- Serves: R7, R27, R30, R31

**Interfaces:**

- `.agents/skills/new-harness/SKILL.md`: sección nueva `## A new model of a harness that is already in`, que dice, en orden: 1) leer las páginas de AA del modelo con `node scripts/aa-pages.js read <slug> --harness <name>` (sin `--write`); 2) mostrar dónde caería en la escalera con `node scripts/refresh-lanes.js` sin `--write`; 3) dejar las filas de pares y el precio como borrador en `.aether/model-drafts/<harness>-<model>.json` (carpeta no versionada); 4) esperar el sí del dueño, en sus palabras, antes de tocar `config/`. Es una skill de proyecto: no va en el arranque.
- `docs/guide/plan-rules.md` (nuevo): cabecera `title`, `description`, `order: 9`; explica `.specify/plan-rules.json` (campos `adds`, `changes`, `owns`, `why`) y los avisos de `aether-plan check`; enlazada desde `docs/index.md`.
- `docs/decisions.md`: cuatro decisiones nuevas con los números siguientes al último en el momento de construir (hoy A128 a A131): los worktrees de las unidades atendidas quedan fuera de la señal de vida del watch (`P/lib/wt-watch.js:47`); el aviso de modelos nuevos (lectura diaria sin modelo, Muse sin medio de captura); los topes del plan aprobado; la cadena obedece al freno. Los rangos que fijan `docs/index.md`, `tests/docs-032.test.js` y `tests/docs-facts.test.js` se ajustan en esta tarea.
- Páginas que existen hoy y que dicen lo nuevo (ninguna página nueva salvo `plan-rules.md`): `docs/guide/observe.md` (aviso de modelos nuevos y su límite en Codex y Muse), `docs/guide/troubleshooting.md` (lo que muestra `aether-doctor` y que `--run` conserva la selección), `docs/guide/autonomy.md` (topes del plan aprobado y freno de cuota), `docs/guide/delegates.md` (el freno y `aether-lane stop` terminan la cadena), `docs/guide/design-seats.md` (examen devuelto sin respuesta, con sus pruebas marcadas) y `docs/guide/maintenance.md` (la limpieza de `.aether/tmp` respeta la corrida abierta y nombra lo borrado; `aether-exam recover`).
- `docs/reference/components.md`: solo la fila de `aether-exam`, que suma `recover` (conserva `store` y `run` y no dice `list`, que fija `tests/docs-facts.test.js` R16). Los módulos nuevos los registran las tareas 1 y 12.

**Tests (write first):**
- `tests/new-harness-skill.test.js`: la sección existe y contiene `aa-pages.js read`, `refresh-lanes.js`, `.aether/model-drafts/` y la espera del sí del dueño antes de tocar `config/`; no contiene `--write` en el paso de lectura.
- `tests/docs-facts.test.js`: `docs/guide/plan-rules.md` tiene `title`, `description` y `order` entero 9, `docs/index.md` lo enlaza, y los enlaces relativos resuelven; los rangos de decisiones cubren hasta la última nueva.
- `tests/docs-032.test.js`: ajustar el rango de decisiones.
- Una afirmación por página tocada de que nombra lo nuevo (por ejemplo `docs/guide/observe.md` contiene `new models`, `docs/guide/maintenance.md` contiene `aether-exam recover`, `docs/guide/autonomy.md` contiene `approved plan`); la afirmación de R16 sobre la fila de `aether-exam` sigue verde con `recover` añadido.

**Acceptance:**

- El procedimiento existe y está fijado por prueba; la guía de reglas del plan está enlazada; las decisiones tienen número y los rangos de las pruebas de documentos las incluyen; las páginas dicen lo nuevo.
- `node --test tests/new-harness-skill.test.js tests/docs-032.test.js tests/docs-facts.test.js` pasa.

### Task 11: Nombres de las dos listas de harnesses

**Aether:**
- Area: harness
- Owns: `plugins/aether/lib/harness/index.js`, `plugins/aether/lib/harness-names.js`, `plugins/aether/lib/lanes.js`, `plugins/aether/lib/doctor.js`, `plugins/aether/lib/router-pick.js`, `plugins/aether/lib/router-quota.js`, `plugins/aether/lib/router-renewal.js`, `plugins/aether/lib/delegate-calls.js`, `plugins/aether/lib/lane-delegate.js`, `tests/copies-harness.test.js`, `tests/copies-harness-config.test.js`, `tests/harness-index.test.js`, `tests/codex-lists.test.js`, `tests/router-pick.test.js`, `tests/router-renewal.test.js`, `tests/lanes-docs.test.js`, `tests/harness-lists.test.js`, `tests/new-harness-skill.test.js`
- Depends on: Task 2 — comparte `doctor.js`
- Depends on: Task 5 — comparte `lane-delegate.js`
- Depends on: Task 10 — comparte `tests/new-harness-skill.test.js` y `docs/reference/components.md` (esa tarea cambia la fila de `aether-exam`)
- Serves: R28

**Interfaces:**

- `P/lib/harness/index.js`: `HARNESS_NAMES` (`['agy','codex','grok','cursor','muse']`) pasa a llamarse `ADAPTER_NAMES`; se exporta con el nuevo nombre (y el viejo deja de exportarse).
- `P/lib/harness-names.js`: `HARNESS_NAMES` (sin cursor, congelada) pasa a `DELEGATE_HARNESS_NAMES`; `formatHarnessesOr` queda como está.
- Se actualizan todos los importadores del mapa: `lanes.js:10`, `doctor.js:15` (de `harness/index.js`), `lane-delegate.js:28`, `router-pick.js:12`, `router-quota.js:12`, `router-renewal.js:14`, `delegate-calls.js:23` (de `harness-names.js`) y las pruebas que los importan. `hooks/panel-view.mjs` no se toca.
- Sin cambio de comportamiento.

**Tests (write first):**
- `tests/harness-index.test.js`: `require('.../harness/index.js').ADAPTER_NAMES` deep-equals `['agy','codex','grok','cursor','muse']` y `.HARNESS_NAMES` es `undefined`.
- `tests/codex-lists.test.js`: `require('.../harness-names.js').DELEGATE_HARNESS_NAMES` no contiene `cursor`, está congelada (`Object.isFrozen`) y `.HARNESS_NAMES` es `undefined`.
- Un recorrido de `P/lib/` (sin `hooks/`) comprueba que ningún archivo contiene `HARNESS_NAMES` sin el prefijo `ADAPTER_` o `DELEGATE_`.
- `tests/copies-harness.test.js`, `tests/copies-harness-config.test.js`, `tests/router-pick.test.js`, `tests/router-renewal.test.js`, `tests/lanes-docs.test.js` (`:125`), `tests/harness-lists.test.js` (`:67`, `:93`), `tests/new-harness-skill.test.js` (`:49-54`): cambiar los nombres importados o fijados; las afirmaciones de comportamiento no cambian.

**Acceptance:**

- Cada lista dice en su nombre qué contiene, ningún archivo vivo usa el nombre viejo y todo se comporta igual.
- `node --test tests/copies-harness.test.js tests/copies-harness-config.test.js tests/harness-index.test.js tests/codex-lists.test.js tests/router-pick.test.js tests/router-renewal.test.js tests/lanes-docs.test.js tests/harness-lists.test.js tests/new-harness-skill.test.js tests/doctor.test.js` pasa.

### Task 12: Partir skill-review en tres módulos

**Aether:**
- Area: skills-lib
- Owns: `plugins/aether/lib/skill-review.js`, `plugins/aether/lib/skill-loads.js`, `plugins/aether/lib/skill-topics.js`, `plugins/aether/lib/continuity-posttool.js`, `plugins/aether/lib/session-start.js`, `docs/reference/components.md`, `tests/skill-review.test.js`, `tests/skill-loads.test.js`, `tests/skill-topics.test.js`, `tests/new-harness-skill.test.js`, `tests/continuity-posttool-skills.test.js`, `tests/continuity-posttool.test.js`, `tests/components-docs.test.js`
- Depends on: Task 1 — comparte `docs/reference/components.md`
- Depends on: Task 4 — comparte `session-start.js`
- Depends on: Task 10 — comparte `tests/new-harness-skill.test.js` y `docs/reference/components.md` (esa tarea cambia la fila de `aether-exam`)
- Depends on: Task 11 — comparte `tests/new-harness-skill.test.js` (esa tarea cambia sus nombres antes)
- Serves: R29

**Interfaces:**

- `P/lib/skill-review.js` conserva la revisión de una skill: `reviewSkill`, `posttool`, `outsideAgents` y lo que solo ellas usan.
- `P/lib/skill-loads.js` (nuevo): `recordLeadSkillLoad`, `leadLoadedSkills`, `alreadyNoticed`, `skillToken`, `mainRootOf`.
- `P/lib/skill-topics.js` (nuevo): `detectUncoveredTopics`, `topicLine`, `startupTopicNotice` y sus auxiliares (`shallowNames`, `fileSignal`, `dependencyNames`, `installedBlobs`, `topicCovered`, `intentPathOf`).
- Importadores actualizados: `P/lib/continuity-posttool.js:14`, `P/lib/session-start.js:530`, `tests/skill-review.test.js:7`, `tests/new-harness-skill.test.js:67`. Si `skill-review.js` usa un auxiliar de un módulo nuevo, importa sin ciclos. Sin cambio de comportamiento.
- `docs/reference/components.md` (`:49`, `:71`): los dos módulos nuevos declarados.

**Tests (write first):**
- `tests/skill-review.test.js`: se conservan las afirmaciones de revisión; las que cubren cargas y temas se mueven (sin cambiar su afirmación) a `tests/skill-loads.test.js` y `tests/skill-topics.test.js`, que importan del módulo nuevo.
- Prueba de exportación: `Object.keys(require(skill-loads.js)).sort()` y `Object.keys(require(skill-topics.js)).sort()` contienen cada nombre de arriba; `skill-review.js` ya no exporta ninguno de los de carga ni de tema.
- Prueba de forma: `skill-review.js` tiene menos de 330 líneas.
- `tests/new-harness-skill.test.js:67`: importa del módulo que corresponda.
- El cierre pasa por `tests/docs-facts.test.js` (los dos módulos nuevos declarados en `components.md`) y por las pruebas de arranque (`tests/session-start.test.js`, `tests/session-start-parts.test.js`).

**Acceptance:**

- Tres módulos con las responsabilidades de arriba, mismo comportamiento y los dos nuevos declarados en `docs/reference/components.md`.
- `node --test tests/skill-review.test.js tests/skill-loads.test.js tests/skill-topics.test.js tests/new-harness-skill.test.js tests/continuity-posttool-skills.test.js tests/docs-facts.test.js tests/session-start.test.js tests/session-start-parts.test.js` pasa.
