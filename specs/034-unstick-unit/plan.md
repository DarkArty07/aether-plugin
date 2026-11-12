# Plan: Destrabar en marcha una unidad del enjambre (034-unstick-unit)

- **Spec:** [spec.md](spec.md). Tarjeta de intención: [intent.md](intent.md). Cierra el issue #238 (parte 3 de #188).
- **Rama:** `feat/034-unstick-unit`. La versión, el empuje y la fusión a `main` esperan el sí del dueño (spec, «Out of scope»).

Hoy una unidad que queda trabada obliga al Lead a parar todo el flujo con `TaskStop`, guardar, arreglar a mano, adoptar y relanzar. El trabajo hace que la unidad trabada **espere un arreglo** (con tiempo acotado) mientras las demás siguen; que el Lead se entere por un comando en segundo plano que termina cuando algo se traba (`aether-wt watch`); y que el Lead entregue el arreglo (`aether-wt deliver`) o declare que no puede (`aether-wt decline`), tras lo cual el flujo lo fusiona por el camino de siempre y lanza los dependientes. Todo se habla por archivos de la corrida, como ya hacen `adopted.json` y la escalera.

## Technical context

- **Pila:** Node.js 22, CommonJS, sin dependencias. Pruebas con `node --test` (`npm test`); las del mod con `npm run test:mod`. Las pruebas usan repositorios temporales de `tests/helpers.js` y el arnés del flujo (`tests/workflow-harness.js`) con agentes simulados: no gastan tokens.
- **Dónde vive lo que cambia:**
  - **El flujo** `plugins/aether/workflows/run.workflow.js`: `runUnit(id)` llama a `work()` y, si la unidad `attempts > 0`, a `close()`; el bucle final corre `await parallel(waves[i].map(runUnit))` ola por ola, y `work()` salta una unidad cuya dependencia no quedó `merged`. La fusión de una unidad es el bloque `serialized(...)` dentro de `work()` (`aether-wt merge`, `status`, rerun). Las pausas del flujo existen ya: `capClock` ejecuta `aether-lane pause` por un agente `aether:ops` sin contar en el presupuesto (el script no tiene reloj ni lee archivos).
  - **`aether-wt`** (`bin/aether-wt`, 68 líneas) es delgado y llama a `lib/worktrees.js` (`salvageUnit`, `merge`, `adoptUnit`, `sweepRun`), `lib/wt-ladder.js` (el patrón de un comando con `--payload` y `--digest`) y `lib/wt-gate.js`. Los bins no pueden pasar de 160 líneas ni usar `fs` (`tests/bins-thin.test.js`).
  - **El mod** (`hooks/ops-command.mjs`, `hooks/register.js`) responde sin modelo solo los comandos de `aether-wt` que `ops-command.mjs` lista, token por token, y solo guarda cargas (`payload`) en rutas cerradas (`PAYLOAD_PATH`); los tokens de un comando son `[A-Za-z0-9._:=@/,-]`, sin espacios.
  - **El informe** `lib/report.js` (`qualityOf`) cuenta las unidades de `result.json` y las adoptadas de `adopted.json`; el gasto de un lanzamiento (#191) se lee de ese mismo `result.json` (`lib/autonomy.js`, `swarmSpend`).
  - **La configuración**: `plugin.json` `userConfig` es la tabla de opciones (no cambia); los datos que leen las libs viven en `plugins/aether/config/*.json`. Un archivo de `lib/` con guion toma su familia del prefijo, que `docs/reference/components.md` debe declarar (`tests/guards.test.js`): los archivos nuevos son de la familia `wt`.
  - **El autonomy** `lib/autonomy.js` `status(mainRoot)` da `stop: 'time'` cuando se alcanza el techo de horas de la corrida autónoma: de ahí lee la espera su techo.
- **Invariantes que las pruebas sujetan y este plan respeta:** cada archivo nuevo de `lib/` lleva `// Family: wt.` en su cabecera y no deja nombres sin uso; los bins siguen delgados; ninguna variable `AETHER_*` nueva (`tests/env-scrub.test.js`); `Object.keys(args).pop()` de `aether-plan compile` sigue siendo `lanes` (`tests/aether-plan.test.js`), así que `stuckWaitSeconds` va justo después de `maxAgents`; `skills/using-aether` y sus partes del arranque no se tocan.
- **Lo que no cambia con la espera apagada.** Con `stuckWaitSeconds` en 0, o sin ninguna unidad trabada, el flujo hace las mismas llamadas, en el mismo orden, que hoy: ninguna llamada nueva, y el resultado no gana campos. Por eso las marcas de la corrida (`launch-end.json`) las escribe el `aether-wt sweep --run` que el `finally` ya ejecuta, y no una llamada más.

## Gate

No existe `.specify/memory/constitution.md`; se comprueban las dos reglas de la compuerta y las invariantes de `CLAUDE.md`.

- **Nothing speculative, and nothing for a hypothetical need:** **pasa.** Cada pieza sirve a un requisito del spec (véase `Serves` en cada decisión). No hay segunda espera, ni reintentos, ni una ampliación de `Owns` con la entrega: el spec los deja fuera.
- **No abstraction, option, file or dependency that no requirement asks for:** **pasa.** Archivos nuevos: `config/swarm.json` (R8 lo pide por nombre), `lib/wt-config.js`, `lib/wt-stuck.js` y `lib/wt-watch.js` (R1 a R4 piden los comandos, R8 el tiempo). Ninguna opción de `userConfig`, ninguna dependencia, ningún hook nuevo. Las piezas que añaden estructura están en `## Complexity`, cada una con su requisito.
- **Huella durmiente fuera de una sesión del Lead:** **pasa.** No se añade ni se cambia ningún hook; el mod solo reconoce tres formas más de un comando que ya existe, y solo en una sesión del Lead.
- **Bins delgados, sin red ni modelos en pruebas:** **pasa.** La lógica vive en `lib/`; `bin/aether-wt` solo lee argumentos.

## Design

**D1. La configuración: `config/swarm.json`, leída por `lib/wt-config.js` (R8).**
`{ "stuckWaitSeconds": 1800, "watchSilenceSeconds": 2400 }`. `loadSwarmConfig(file?)` valida (`stuckWaitSeconds` entero >= 0; `watchSilenceSeconds` entero >= 1, o, si falta, `stuckWaitSeconds + 600`) y falla con `swarm config ...` si el archivo no se lee o es inválido: el valor por defecto vive en el archivo y no en el código. `aether-plan compile` pone `stuckWaitSeconds` en los argumentos, justo después de `maxAgents`; los argumentos del lanzamiento pueden cambiarlo para ese lanzamiento (`0` apaga la espera), y unos argumentos sin la clave (un compile viejo) valen 0. *Serves:* C5.

**D2. El estado de la espera, por archivos de la corrida (R1, R2).**
Bajo `<runDir>/stuck/<task>.json`, un registro `{ run, task, reason, branch, worktree, head, outside, left, at, state }` con `state` en `waiting | delivered | declined | ended`, más `delivered {commit, reason, at}`, `declined {reason, at}` o `ended {outcome, at}` según el caso. Una unidad está **atendida** cuando su estado no es `waiting` (R4). `<runDir>/heartbeat.json` es la marca de latido que escribe cada pausa de la espera, y `<runDir>/launch-end.json` la marca de fin de corrida. Las rutas las da `lib/run.js` (`stuckDir`, `stuckFile`, `heartbeatFile`, `launchEndFile`, `stuckPayloadFile`), que ya es el lugar de las rutas de la corrida. Cada `aether-plan compile` borra `stuck/`, `heartbeat.json` y `launch-end.json`: son del lanzamiento, y un relanzamiento no debe heredar la marca de fin ni una espera muerta del anterior. *Serves:* C1, C3.

**D3. Los comandos de `aether-wt`, en `lib/wt-stuck.js` y `lib/wt-watch.js` (R1 a R4, R8).**
Del flujo (el mod los responde sin modelo): `stuck <run> <task> --payload <ruta> --digest <huella>` abre la espera: la carga es `{ "reason": <texto> }` en `ladder/<task>-stuck.json` (la misma ruta cerrada y la misma huella que un veredicto de la escalera; el motivo es texto libre y no cabe en un token), y el comando guarda el trabajo (`salvageUnit`: confirma en la rama lo que `Owns` cubre), lista los archivos fuera de `Owns` y escribe el registro en `waiting`. `stuck-tick <run> <task> --seconds <1 a 120>` duerme el tick, escribe el latido, lee el registro y responde `{ paused, state, stop, commit?, reason? }`: `stop` es `true` cuando `autonomy.status` da `stop: 'time'`. `stuck-end <run> <task> --outcome <expired|ceiling|declined|merged|rejected>` cierra el registro. Del Lead: `deliver <run> <task> --commit <sha> --reason <texto>` y `decline <run> <task> --reason <texto>`; ambos se rechazan si la unidad no espera o si la corrida ya dejó su marca de fin, y ninguno toca la rama de integración; `deliver` exige que el commit sea la punta de la rama de la unidad, porque la fusión que sigue integra la rama. `watch <run> [--interval <s>] [--silence <s>]` sondea los registros y termina con `{watch: 'stuck', ...}` (corrida, unidad y motivo) cuando hay uno `waiting`, con `{watch: 'ended', stuck: [...], message}` cuando existe `launch-end.json`, o con `{watch: 'silent', message: 'sin señal de la corrida'}` cuando la escritura más reciente bajo el directorio de la corrida (el latido incluido) es más vieja que `watchSilenceSeconds`; esto vale también cuando queda un registro `waiting` (un flujo muerto o detenido que dejó una unidad esperando): el registro de una corrida en silencio no se avisa como trabada sino como `silent`. La marca de fin la escribe `sweepRun` solo cuando se le pide la opción `endMark`, que pasa `aether-wt sweep --run` sin `--finish`: la limpieza del `finally` del flujo ya lo llama una vez por lanzamiento. `sweepStale` y `report.js` no la piden, porque una pasada obsoleta que conserva un directorio de corrida lo escribiría y la corrida parecería activa de nuevo (`modifiedSince` mira las fechas de sus archivos). *Serves:* C1, C3, C5.

**D4. La espera y el arreglo en el flujo (R1, R5, R7, R8, R9).**
Una unidad es «trabada» si termina `blocked` con intentos y su motivo es uno de los cuatro de R1: `blocked-same-cause: ...`, `blocked-outside-owns: ...`, `the ladder is spent (exhausted)` o `merge failed again: ...`; cualquier otro bloqueo (una pregunta del supervisor, un fallo de lane, una fusión sin verificar) sigue como hoy. Con `stuckWaitSeconds > 0`, en vez de cerrarse, la unidad abre la espera (`aether-wt stuck`), lo dice con `log()` y hace `ceil(stuckWaitSeconds / 120)` pausas, cada una un `agent()` de `aether:ops` con `aether-wt stuck-tick` (como `capClock`: no pasan por `call()`, así que no cuentan en el presupuesto). Según la respuesta de la pausa: `delivered` fusiona la rama por el mismo bloque `serialized` que cualquier unidad (se extrae a `mergeHeld(unit)` sin cambiar su comportamiento), sin pasar por la escalera ni por una segunda espera; si se fusiona, la unidad queda `merged` con `fixedByLead: { commit, reason }`, donde `commit` es el que el Lead entregó (el del arreglo que R10 pide; el commit de fusión queda en `unit.commit`, como en cualquier unidad); si se rechaza, queda `blocked` con su motivo de siempre más `The Lead's fix was refused: <motivo de la fusión>`. `declined` termina la espera de inmediato y deja el motivo del Lead junto al de siempre. `stop`, el tiempo agotado o una pausa que no corre dejan la unidad `blocked` con su motivo de siempre. Cada salida cierra el registro con `stuck-end`. La unidad cerrada así no recibe un veredicto `approve` de la escalera (el arreglo del Lead no es un intento). *Serves:* C3, C4, C5.

**D5. Las demás unidades siguen: promesas en vez de salto de ola (R6, R7).**
Cada unidad tiene una promesa `done` que se resuelve cuando su estado es final (después de `close`). `runUnit` devuelve en cuanto termina `work()`: una unidad trabada sigue en una promesa aparte (`rescue`) y libera la barrera de su ola, de modo que las unidades de la ola siguiente que no dependen de ella arrancan. `work()` espera la promesa de una dependencia cuyo estado aún es `pending` o que está esperando, y solo entonces decide si salta o corre: así los dependientes directos e indirectos de la trabada esperan su resultado, y los demás no. Después del último ciclo de olas, el flujo espera todas las esperas pendientes antes de decidir la revisión final. Como la revisión final se difiere hasta que todas las unidades están `merged` y corre una vez por lanzamiento, un lanzamiento con una unidad arreglada en marcha termina con una sola, cuyo paquete (`diff --final`) ya incluye la fusión del arreglo. *Serves:* C2, C3, C4.

**D6. El mod reconoce las tres formas nuevas (R8).**
`hooks/ops-command.mjs` acepta `stuck` (con carga, ruta `ladder/<task>-stuck.json` derivada de la corrida y la tarea, como el veredicto), `stuck-tick` y `stuck-end`, y `PAYLOAD_PATH` acepta esa ruta; `hooks/register.js` guarda la carga sin escribir `spawn.json`, como con un veredicto. `deliver`, `decline` y `watch` son comandos del Lead, con texto libre: el mod no los responde. *Serves:* C5.

**D7. El informe (R10).**
`qualityOf` recoge, de las unidades de `result.json`, las que traen `fixedByLead` y devuelve `fixedUnits: [{ id, commit, reason }]` solo cuando hay alguna (así las formas que otras pruebas sujetan no cambian); la unidad sigue contando `merged` e `integrated`. `report()` añade una nota por cada una, como las adoptadas. El resultado del lanzamiento termina de forma normal, y el Lead lo guarda como `result.json` como siempre: el gasto (#191) lo lee de ahí, sin cambio. *Serves:* C6.

**D8. El arnés y los escenarios (R11).**
`tests/workflow-harness.js` fija `stuckWaitSeconds` en 0 en los argumentos que da al flujo, salvo que el escenario dé `overrides.stuckWait`; reconoce las pausas `: stuck wait N/M` como las de `: deadline N/M` (por defecto no terminan, a menos que el escenario dé `overrides.deadline`, que puede contestar `{ paused, state, stop, commit, reason }`); lee los verbos con guion (`stuck-tick`, `stuck-end`) y la carga de `stuck`; y contesta por defecto `stuck` y `stuck-end`. Así, los escenarios de unidad bloqueada que ya existen terminan igual sin tocarlos, y los nuevos (`tests/workflow-stuck.test.js`) encienden la espera con un valor y con su propio reloj. *Serves:* C7.

**D9. Las reglas del Lead (R12).**
La skill `aether:swarm` gana la regla: dejar `aether-wt watch <runId>` en segundo plano al lanzar el enjambre; cuando termina con una unidad trabada, leer el motivo, arreglarla en el worktree de la unidad, confirmar el arreglo en su rama y entregarlo con `aether-wt deliver`, o declinarla con `aether-wt decline`, y relanzar la vigilancia; sin entrega a tiempo la unidad termina bloqueada y se trata como hoy. Su línea «no ejecutes comandos de `aether-wt`» gana la excepción. Las guías de `docs/` que describen unidades bloqueadas dicen lo mismo. `skills/using-aether` no se toca. *Serves:* C8.

## Files

- `plugins/aether/config/swarm.json` (nuevo): el tiempo de espera y el tope de silencio de la vigilancia (R8).
- `plugins/aether/lib/wt-config.js` (nuevo): `loadSwarmConfig`, lo leen `plan-compile.js` y `wt-watch.js`.
- `plugins/aether/lib/run.js`: las rutas de la espera (D2).
- `plugins/aether/lib/plan-compile.js`: `stuckWaitSeconds` en los argumentos y el borrado del estado del lanzamiento anterior.
- `plugins/aether/lib/wt-stuck.js` (nuevo): `stuck`, `stuck-tick`, `stuck-end`, `deliver`, `decline`.
- `plugins/aether/lib/wt-watch.js` (nuevo) y `plugins/aether/lib/worktrees.js` (la marca de fin en `sweepRun`): la vigilancia.
- `plugins/aether/bin/aether-wt`: los seis verbos nuevos, con su uso.
- `plugins/aether/hooks/ops-command.mjs`, `plugins/aether/hooks/register.js`, `plugins/aether/hooks/ops.test.ts`: las tres formas del mod.
- `plugins/aether/workflows/run.workflow.js`: la espera, el arreglo y las promesas de unidad; `tests/workflow-harness.js`, `tests/workflow-stuck.test.js` (nuevo) y `tests/run-workflow-paths.test.js`.
- `plugins/aether/lib/report.js`: `fixedUnits` y su nota.
- `plugins/aether/skills/swarm/SKILL.md`, `docs/guide/troubleshooting.md`, `docs/guide/ops.md`, `docs/reference/components.md`: las reglas del Lead y las guías.
- Pruebas nuevas: `tests/wt-config.test.js`, `tests/wt-stuck.test.js`, `tests/wt-watch.test.js`, `tests/aether-wt-stuck.test.js`, `tests/ops-command-stuck.test.js`, `tests/report-fixed.test.js`, `tests/swarm-stuck-docs.test.js`.

## Verification

- **Comando de prueba:** `npm test`. Las pruebas del mod (`hooks/*.test.ts`) corren con `npm run test:mod`, que no es parte de `npm test`: la tarea 5 añade su prueba a `hooks/ops.test.ts`, y `npm run check` (que corre las tres) debe pasar antes del PR.
- **C1 (la alerta):** `tests/workflow-stuck.test.js` deja una unidad trabada mientras el flujo corre y comprueba su registro (`stuck`, con la carga `{reason}`) y la línea de progreso; `tests/wt-watch.test.js` muestra que la vigilancia termina, con la corrida, la unidad y el motivo, y que termina de inmediato si ya había una trabada.
- **C2 (las demás siguen):** el mismo escenario, con una independiente de la misma ola y una de una ola posterior, ve sus fusiones antes de la entrega.
- **C3 (arreglar en marcha):** el escenario con entrega termina con la unidad y su dependiente fusionados; el escenario de arreglo rechazado, con la unidad bloqueada y su dependiente saltado; `tests/wt-stuck.test.js` cubre `deliver` y `decline` contra un repositorio real.
- **C4 (una sola revisión):** el escenario cuenta una línea `final review on` y un `diff --final` posterior a la fusión del arreglo.
- **C5 (espera acotada):** escenarios de tiempo agotado, de declinación y de techo; `tests/wt-config.test.js` lee `swarm.json` y comprueba que el código no repite el número.
- **C6 (el informe):** `tests/report-fixed.test.js`, con `quality.fixedUnits`, la nota y el gasto del lanzamiento visto por `autonomy.status`.
- **C7 (sin gastar):** todos los escenarios corren en el arnés con el modelo falso dentro de `npm test`.
- **C8 (reglas del Lead):** `tests/swarm-stuck-docs.test.js`; las pruebas de tamaño de las partes del arranque (`tests/session-start-parts.test.js`) siguen pasando porque ninguna tarea toca `skills/using-aether`.

## Assumptions

- **Qué es «trabada» se decide por el texto del motivo**, con los cuatro prefijos de D4, y no por una marca en cada `finish()` (más de treinta sitios). Reversible: una marca explícita reemplaza al texto.
- **El arreglo es la punta de la rama de la unidad.** `deliver` exige que el commit entregado sea la punta de `aether/<run>/<task>`, porque la fusión integra la rama entera. Un commit anterior se rechaza con ese mensaje. Reversible.
- **La marca de fin la escribe `sweepRun` solo con la opción `endMark`**, que `aether-wt sweep --run` (sin `--finish`) pasa y que el `finally` del flujo ya ejecuta; el spec dice «el flujo escribe una marca en su bloque `finally`», y este es el mismo bloque sin una llamada nueva. `sweepStale` no la pasa: una pasada obsoleta no debe escribir en un directorio de corrida que conserva. Un `aether-wt sweep --run` del Lead también deja la marca: la corrida ya no está corriendo.
- **`watchSilenceSeconds` es una segunda clave de `swarm.json`**, con 2400 (los 1800 de la espera más 600 de margen); si falta, se calcula así.
- **Una pausa que no corre** (el comando falla o no devuelve el tick) termina la espera con el resultado `expired` y la unidad queda bloqueada como hoy: no se espera sin reloj.
- **El techo es el de horas** (`autonomy.status` con `stop: 'time'`); un freno de cuota o de dólares no termina la espera.
- **Una pausa duerme el tick entero** (hasta 120 s); una entrega se nota en la pausa siguiente.
- **Un arreglo fusionado no pasa por la escalera.** No se manda `approve` a `aether-wt ladder`, que está bloqueada o agotada.
- **Los mensajes están en inglés**, salvo los dos textos de la vigilancia que el spec cita (`sin señal de la corrida`, `nada se trabó`).
- **Se rechaza una entrega sobre una corrida cuya marca de fin existe**, y un `compile` posterior la borra junto con el resto del estado del lanzamiento.

## Risks

- **El despertar del Lead por un Bash en segundo plano no se probó con un modelo real** (el spec lo declara). Ninguna prueba sin tokens lo cubre; una sesión real lo comprobaría a petición del dueño, que no quiere mediciones de pago sin pedirlas.
- **El cambio de `runUnit` y de las olas toca todos los lanzamientos.** Lo guardan las pruebas de flujo que ya existen (corren con la espera en 0 y deben dar los mismos resultados) y la tarea 6, que va con `Review: xhigh`: una fusión doble o perdida llegaría a la rama de integración.
- **Las pruebas del mod no corren en `npm test`.** La tarea 5 prueba `ops-command.mjs` desde `tests/` (que sí corre) y añade el caso de `register.js` en `hooks/ops.test.ts`; `npm run test:mod` lo corre, y `npm run check` antes del PR.
- **Sin el Lead mirando, una corrida espera hasta 30 minutos** por cada unidad trabada, y con `ops` apagado cada pausa cuesta una llamada de Haiku (15 por unidad). Es el valor por defecto del spec, configurable y apagable con 0.
- **El tope de silencio de la vigilancia** (2400 s) puede despertar al Lead con «sin señal de la corrida» si un implementador no escribe nada en el directorio de la corrida durante 40 minutos; el Lead relanza la vigilancia si la corrida sigue viva (R3).
- **Un flujo detenido con `TaskStop` o muerto** deja un registro `waiting` y ninguna marca; como el latido deja de escribirse, pasado el tope la vigilancia termina con `silent` («sin señal de la corrida») aunque quede ese registro, y no lo avisa como trabada; un `aether-plan compile` nuevo borra el estado. Es el caso que R3 cubre con «sin señal».
- **Ampliar `Owns` con la entrega** sigue siendo la pregunta abierta del spec: el arreglo que toca archivos fuera de `Owns` se rechaza y la unidad sigue por `aether-wt adopt`.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Promesas `done` por unidad en lugar de la barrera de ola, para los dependientes (D5) | R6 pide que las unidades que no dependen de la trabada, también las de olas posteriores, no esperen | Esperar la ola entera retiene las independientes de las olas siguientes durante toda la espera, que es el defecto que R6 quiere evitar |
| Carga (`payload`) para el motivo de la unidad y una ruta nueva en `PAYLOAD_PATH` y en `register.js` (D3, D6) | R1 pide el motivo en el estado de la corrida y R8 pide que cada comando de ops lo haga el mod sin modelo | El motivo es texto libre y un comando de ops solo admite tokens sin espacios; un código corto perdería el motivo que R1 pide |
| Marca de fin escrita por `sweepRun` con la opción `endMark` (D3) | R3 pide una marca de fin de corrida en el estado de la corrida | Una llamada de ops más al final de cada lanzamiento cambia la secuencia de llamadas de todos los escenarios existentes, que R11 pide dejar iguales |
| Tres archivos nuevos de `lib/` y uno de configuración (D1, D3) | R1 a R4 piden los comandos y R8 la configuración fuera del código | Meterlo todo en `worktrees.js` (1468 líneas) mezcla el estado de la espera con la fusión, y las pruebas de cada comando no se separan |
