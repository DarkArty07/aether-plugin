# El router de delegados: plan

**Spec:** [spec.md](spec.md). La evidencia medida está en [evidence/README.md](evidence/README.md); este plan la cita por sección y no la repite.

## Technical context

- **Pila.** Node.js 22, CommonJS con `'use strict'`, sin dependencias de npm. Los archivos `.mjs` del mod son ESM. Las pruebas son `node --test` (`npm test`); las del mod con el motor real son `npm run test:mod` (`claude plugin test`) y este plan no depende de ellas.
- **Estructura que se toca.** `plugins/aether/lib/` (la lógica), `plugins/aether/bin/` (un bin nuevo, `aether-route`, y una bandera nueva de `aether-report`), `plugins/aether/config/router/` (el criterio y la tabla de peldaños), `plugins/aether/hooks/` (el mod: un módulo nuevo y tres ganchos en `register.js`), `.claude-plugin/plugin.json` (dos opciones), `scripts/` (el generador de la tabla), la skill `using-aether` y `docs/`.
- **Lo que se reutiliza sin cambiarlo.** `lib/lane-order.js` (`groupView`, `orderCandidates`: la política A49), `lib/lane-readings.js` (`cacheFile`), `lib/lane-marks.js` (`liveMarks`), `lib/harness/*` (los adaptadores de agy y grok), `lib/lanes.js` (`loadConfig`, `laneEnv`, `usable`), `lib/prices.js` y `lib/report.js` (`readUsage`). Ningún archivo de esa lista se edita (R9, C4): `Owns` lo impide.
- **Lo que el motor permite** (evidencia §1, medido con el modelo falso): el gancho `tool.call` de `Agent` ve y reescribe `model` y `effort` y puede devolver un aviso al Lead; `agent.spawn` no ve ni reescribe `effort`; un delegado se puede contestar sin modelo desde su primer `turn.step`; el mod puede llamar `$.model.complete`, `$.process.run` y `$.fs`. Un gancho tiene 10 s de ejecución propia (`docs/claude-code-research.md`).
- **Datos.** `config/models/models.json` (medidas de Artificial Analysis por modelo y esfuerzo), `config/lanes.json` (harness, grupos, reserva de 5 %), `config/prices.json`. El directorio de datos (`run.dataDir()`) guarda lo nuevo: `router/decisions.jsonl` (el registro), `router/pending/`, `router/external/`, `router/in/` y `sessions/<id>.router.json`.

## Gate

Este proyecto no tiene constitución (`.specify/memory/constitution.md` no existe), así que el gate trae las dos comprobaciones fijas.

| Comprobación | Resultado |
|---|---|
| Nada especulativo ni para una necesidad hipotética. | **Pasa.** Cada pieza sirve a un requisito de la spec (columna `Serves` de cada decisión). Quedan fuera por diseño: codex y cursor, delegados que editan en otro harness, la segunda capa del guard, el lint de planes y los graders (R19, R20, R32; sección Proposals). |
| Ninguna abstracción, opción, archivo o dependencia que ningún requisito pida. | **Pasa con las filas de `## Complexity`.** Hay dos opciones (R11), un bin nuevo, un archivo de criterio, una tabla de peldaños generada y un protocolo de dos pasos entre el mod y el bin; cada uno se justifica allí con su requisito. No hay dependencias de npm. |

## Design

### D1. La decisión se separa en tres partes: cómo se pregunta, qué significa la respuesta, dónde corre

El decisor solo contesta preguntas sobre la tarea. El **criterio** (D2) vuelve esas respuestas en un nivel. La **tabla de peldaños** (D3) vuelve un nivel en modelo y esfuerzo. La **cuota** (D6) elige harness. Cada parte es un módulo puro con sus pruebas, y ninguna conoce el transporte del decisor. Así el criterio cambia sin tocar código (R3), un decisor nuevo no toca la política (R10) y la regla de cuota no depende de cómo se pregunta. Serves: C1, C2, C5.

### D2. El criterio es `config/router/criterion.json`, y es el único lugar que dice cómo se rutea

Lleva las siete preguntas de la evidencia §3 con la forma nativa de Jev (`choice`, `score`, `noul`), el eje por tipo de tarea (código para editar o probar, inteligencia general para investigar o juzgar: A-5, R14), el nivel base de cada tipo de trabajo, los ajustes (`stakes` ≥ 2.5 y `many_steps` ≥ 0.7 suben un nivel), las compuertas de calidad (`audit`, `evaluate`: nunca bajan del nivel que pidió el Lead, R6), los umbrales de confianza (`shape` 0.5, `stakes` 0.4: bajo ellos el nivel no baja de lo pedido, R4), el peldaño estándar (Sonnet `high`, A-4), el esfuerzo que se supone heredado (`xhigh`, el de `scripts/aether-lead`) y el tiempo límite del decisor (3 s, A-6). Haiku y Jev reciben las mismas preguntas, por eso la misma prueba corre con los dos (C5). Una regresión sobre briefs con respuestas registradas falla cuando se cambia un valor del criterio y la decisión se mueve (R5, C2). Serves: C2, C5.

### D3. La tabla de peldaños se deriva de las medidas, con el eje y el estado de cada medida

`config/router/rungs.json` lo genera `scripts/build-router-rungs.js` desde `models.json` y `lanes.json`, y una prueba falla si el archivo difiere de lo que el índice deriva (R13). Cada peldaño (harness, modelo, esfuerzo nativo) lleva su nivel A a D **por eje** (cortes en inteligencia 37.5, 45 y 55; en Terminal-Bench 0.18, 0.35 y 0.58, que reproducen las bandas de la evidencia §4) y un estado: `measured`; `borrowed` cuando la medida es la API nativa de Claude y agy sirve el mismo nombre (R15); `unmeasured` cuando no hay medida a ese esfuerzo (grok `medium`, R15, R16). Un peldaño `unmeasured` no se elige nunca. El esfuerzo se traduce por el nivel medido del peldaño y no por su nombre: `high` es B en Haiku y C en Sonnet (C7, R16). La tabla no toca los `levels` de `lanes.json` que usa el swarm (R9). Serves: C6, C7.

### D4. El decisor elige un nivel; el esfuerzo sale del peldaño que lo mide

La spec dice que el decisor «elige un nivel y un esfuerzo» (R2). Aquí el decisor contesta sobre la tarea, el criterio produce un **nivel**, y el esfuerzo es el del peldaño que mide ese nivel: entre los peldaños elegibles del nivel más bajo que alcance el pedido, el de menor precio de salida y, a igual precio, el de menor esfuerzo. Es la lectura de C7 («no todos los efforts valen igual») y de los escenarios 8 y 18, donde el esfuerzo (`low`, `medium`) es consecuencia del nivel B. La decisión siempre nombra un esfuerzo explícito (R17). Se anota en `## Assumptions` (S4) para que el dueño la confirme. Serves: C1, C7.

### D5. El Lead describe; el router decide en el gancho `tool.call` de `Agent`

El gancho filtra por `subagent_type` (`aether:*` queda fuera, R9) y no depende de que el motor calle el gancho para los agentes de un workflow, que nadie ha comprobado (R31). Los tres modos (`record`, `advise`, `command`, la opción `router`) son:

- `record` (estándar, A-1): el delegado corre como lo lanzó el Lead (si no pasó `model` o `effort`, hereda como hoy, A-10) y el registro guarda lo que el decisor habría elegido.
- `advise`: lo mismo, y el Lead recibe la decisión como aviso cuando difiere de lo que pidió.
- `command`: la delegación sale con el peldaño decidido y con esfuerzo explícito, y el Lead recibe el aviso (harness, modelo, esfuerzo, razón).

La anulación (A-7) es una línea del brief, `ROUTER-OVERRIDE: <motivo>`, que el router lee; con ella el delegado corre como el Lead lo pidió y el motivo queda en el registro. Un `model` o `effort` sin motivo no anula (R8). Si el nivel decidido coincide con el pedido, se queda el peldaño que pidió el Lead. Serves: C3, C4.

### D6. Dos pasos entre el mod y el bin, porque solo el mod llama a un modelo

El mod no importa `lib/` (el patrón del proyecto: el mod ejecuta bins con `$.process.run`, ver `ops-command.mjs`). El bin `aether-route begin` lee el evento (el mod lo deja en un archivo, sin límite de argumentos), arma la petición y, si el decisor es Haiku, devuelve un descriptor para `$.model.complete`; el mod llama al modelo y `aether-route finish` cierra la decisión. Con Jev, el propio bin llama a OpenRouter con `fetch` y devuelve la decisión completa en `begin`, y la llave (entorno o `.env` del directorio de datos, nunca el repositorio, R12) no pasa por el mod. Un tercer decisor es un módulo que da `request` y `parse` (R10). Entre `begin` y `finish` el estado está en `router/pending/<id>.json`. Serves: C5, C10.

### D7. Cuota: la política A49 sobre lecturas ya guardadas, con la marca vieja levantada solo para el router

`lib/router-quota.js` agrupa por (harness, grupo), elige para cada grupo el peldaño del nivel y ordena con `orderCandidates` de `lane-order.js` sin cambiarlo, con lo que el mejor es el de mayor prioridad (saldo de la ventana más larga entre las horas que faltan). No lanza ningún proceso: lee el archivo de la última lectura de agy (la que guardó `lane-readings.js`, de cualquier edad) y el registro de grok (R23). Una marca de agotado se descarta solo si una lectura posterior a la marca muestra saldo sobre la reserva en todas sus ventanas (R22); la marca guardada y el orden del swarm no se tocan. Si la lectura de agy está vieja, el bin lanza `aether-lane quota agy` suelto, sin esperarlo. Serves: C9.

### D8. Un delegado de solo lectura corre en agy o grok sin una corrida del swarm

`aether-lane start` exige un `<run>` y un worktree de unidad (evidencia §7.1). `lib/delegate-calls.js` hace una llamada sin corrida, modelada en una ronda de asiento (`seats.js`): un worktree desechable, el adaptador del harness, un esquema `{ answer }`, y una comprobación de que no cambió ningún archivo (`violation` si cambió). El mod contesta el primer `turn.step` del delegado con ese texto; si la llamada falla por infraestructura o cuota, el mod no contesta y el delegado corre en Claude con el peldaño que `finish` ya puso en la llamada (R26): el fallback nativo es gratis y no gasta la escalera. Solo corren fuera los delegados con `edits_files` bajo 0.5 y confianza suficiente, sin `isolation`, y solo con la opción `lanes` activa y el harness en la opción `harnesses` (A-2, R19, R20). Serves: C8, C10.

### D9. Fallback: nunca una pregunta al dueño, nunca una llamada más

Falla del decisor (sin llave, tiempo, HTTP, vacío, ilegible): el delegado corre con lo que pidió el Lead, o con el peldaño estándar si no pidió nada, con esfuerzo explícito (R24, A-4). Falla el harness (no instalado, sin cuota): corre en Claude en el peldaño del nivel decidido, que es el «nivel pedido» de R26. Un error interno del router deja la llamada intacta. Ninguno añade una llamada a un modelo (R25). Serves: C10.

### D10. Un registro que sobrevive y se puede repetir

`router/decisions.jsonl` en el directorio de datos guarda, por delegación, una entrada `decision` (tarea, lo que pidió el Lead, respuestas, decisión, razón, confianza, decisor, modo, estado de cuota de los grupos), una `spawn` (el id del agente, para unir el costo) y una `outcome` (lo que corrió fuera y la cuota gastada). `aether-report --delegates` junta las tres con el medidor de uso y da el peldaño, la razón, la confianza, el decisor, el costo y la cuota por delegación, y por corrida cuántas se decidieron, anularon y cayeron en fallback (R27, R30). `aether-route replay` repite el historial: de las transcripciones de Claude Code (`~/.claude/projects`, con el filtro de secretos de la evidencia) o del propio registro con las respuestas guardadas, para ver qué cambia al cambiar el criterio. Una llamada pagada exige `--paid`. Serves: C11, C13.

### D11. Dos opciones y un archivo de sesión

`router` (`record`, `advise`, `command`; estándar `record`) y `decider` (`haiku`, `jev`; estándar `haiku`). `aether-session-start` guarda su valor en `sessions/<id>.router.json` (el patrón del archivo `.ops-off`) porque el mod no ve las variables de la sesión (evidencia §3). La tabla de `docs/guide/options.md` y `plugin.json` coinciden (R11), y `docs-facts` lo comprueba. Serves: C5, C11.

## Viability

La tabla que pide C12 / R31: cada parte de lo pedido, y el ajuste que la hace viable. La repite `docs/guide/router.md` en inglés.

| Parte | Veredicto | Ajuste |
|---|---|---|
| C1. Un decisor elige con qué corre cada delegado | viable con ajuste | `tool.call` reescribe `model` y `effort`; el gancho `agent.spawn` no ve `effort`, así que el router actúa en `tool.call` (evidencia §1). El efecto sobre lanzamientos en paralelo, `isolation: "worktree"` y un modelo real no está probado. |
| C2. Sabe rutear porque se le da el criterio | viable tal cual | El criterio es un archivo legible y una regresión lo vigila (D2). |
| C3. El Lead solo describe la tarea | viable con ajuste | La anulación necesita una forma fija (`ROUTER-OVERRIDE: <motivo>`) que la skill enseña (A-7). |
| C4. Solo los delegados del Lead | viable con ajuste | El router filtra por `subagent_type`; que el gancho no se dispare para los agentes de un workflow queda sin comprobar, por eso C4 no depende de ello (R9). |
| C5. Dos decisores intercambiables | viable con ajuste | La precisión de Haiku bajo como decisor y su latencia frente al límite de 3 s no están medidas: si supera 3 s a menudo, el modo `command` caería al fallback en casi toda delegación. Jev está medido (mediana 0.29 s). |
| C6. Los niveles son capacidad medida | viable con ajuste | `replaces` de `lanes.json` mide un solo eje; la tabla nueva mide dos y marca lo medido, lo prestado y lo sin medir (D3). |
| C7. El esfuerzo también se decide | viable con ajuste | El esfuerzo se traduce por el nivel medido del peldaño, con una tabla del router aparte de los `levels` del swarm (D3, D4). |
| C8. Los delegados corren también en otros harness | viable con ajuste | `aether-lane start` exige una corrida: hace falta una llamada sin corrida (D8), y solo de solo lectura. |
| C9. Manda la ventana semanal que se renueva antes | viable con ajuste | La regla literal «el que se renueva antes» se reemplaza por A49 (saldo de la ventana semanal entre las horas que faltan), porque difieren cuando la ventana próxima tiene poco saldo (el grupo Claude de agy, 0 % semanal, se renueva en 1.1 h; escenario 17). **El dueño debe confirmarlo.** Las marcas secas obsoletas se levantan solo en la decisión del router y quedan como están para el swarm (candidato a issue). |
| C10. Siempre con fallback hacia nosotros | viable tal cual | El fallback nativo es gratis: si el mod no contesta el delegado, corre normal (evidencia §1). |

## Proposals

Cada uso hallado de esta arquitectura, con su medición. Ninguno se construye (R32, C14); `docs/guide/router.md` los repite.

1. **Segunda capa del guard.** De 57 comandos (31 peligrosos), las reglas de `aether-guard` detectan 14 (45 %) con 0 falsos positivos; reglas más Jev (`irreversible` ≥ 0.7), 28 de 31 con 0 falsos positivos. Para comandos conviene Haiku bajo, que no los saca de la máquina.
2. **Lint de planes.** El decisor coincide con el Writer y el Judge en 55 % (22 de 40; 6 sin confianza); propone bajar 17 tareas por falta de preguntas de concurrencia, seguridad y migraciones. Solo valdría para subir de nivel.
3. **Graders.** Las 98 tareas «Calificar entrevista» son 53 % del gasto (≈ US$255), casi todas en Opus heredado; hace falta un A/B (≈ US$10) antes de bajarlos. Por eso `evaluate` es una compuerta (R6).
4. **Registro de aciertos del decisor**, una vez que exista el replay (C11), para alimentar 1 y 2.

## Files

| Archivo | Qué hace |
|---|---|
| `plugins/aether/config/router/criterion.json` (nuevo) | El criterio (D2). |
| `plugins/aether/config/router/rungs.json` (nuevo, generado) | La tabla de peldaños (D3). |
| `scripts/build-router-rungs.js` (nuevo) | Genera y comprueba la tabla. |
| `plugins/aether/lib/router-criterion.js` (nuevo) | Carga y valida el criterio; `decide`, `axisOf`, `regress`. |
| `plugins/aether/lib/router-rungs.js` (nuevo) | Deriva la tabla; `levelOf`, `levelOfRung`, `pickRung`. |
| `plugins/aether/lib/router-quota.js` (nuevo) | Lecturas guardadas, marcas viejas y elección de harness (D7). |
| `plugins/aether/lib/router-deciders.js` (nuevo) | Los decisores Haiku y Jev y el registro de decisores (D6). |
| `plugins/aether/lib/router-log.js`, `router-report.js` (nuevos) | El registro y el reporte por delegación (D10). |
| `plugins/aether/lib/delegate-calls.js` (nuevo) | Un delegado de solo lectura en otro harness (D8). |
| `plugins/aether/lib/route.js` (nuevo) | `begin` y `finish`: la política completa (D5, D9). |
| `plugins/aether/lib/router-replay.js` (nuevo) | Extracción del historial y replay (D10). |
| `plugins/aether/bin/aether-route` (nuevo) | Los verbos `begin`, `finish`, `delegate` y `replay`. |
| `plugins/aether/bin/aether-report` | La bandera `--delegates`. |
| `plugins/aether/lib/session.js`, `bin/aether-session-start`, `.claude-plugin/plugin.json` | Las dos opciones y su archivo de sesión (D11). |
| `plugins/aether/hooks/router.mjs` (nuevo), `hooks/register.js` | El mod: el gancho de `Agent`, el vínculo con el agente lanzado y la respuesta del delegado externo. |
| `plugins/aether/skills/using-aether/SKILL.md` | El Lead describe y no elige modelo cuando el modo es `command`; la anulación. |
| `docs/guide/router.md` (nuevo), `docs/guide/options.md`, `docs/index.md`, `docs/reference/components.md`, `README.md`, `docs/getting-started.md` | Documentación; los hechos que `tests/docs-facts.test.js` fija (opciones, cuenta de bins, enlaces). |
| `tests/router-*.test.js`, `tests/delegate-calls.test.js`, `tests/aether-route.test.js`, `tests/fixtures/router/briefs.json`, `tests/manifest.test.js`, `tests/docs-facts.test.js` | Las pruebas de cada tarea. |

No se tocan: `run.workflow.js`, `design.workflow.js`, `lane-calls.js`, `lane-order.js`, `lane-quota.js`, `lane-readings.js`, `lane-marks.js`, `seats.js`, `config/lanes.json` ni `agents/*.md`.

## Verification

Comando: `npm test` (corre `node --test "tests/*.test.js"`; incluye `tests/docs-facts.test.js`). Antes de un PR: `npm run check`. Ninguna prueba hace una llamada pagada: los decisores son simulados, los harness son `tests/fixtures/fake-agy.js` y adaptadores simulados.

| Criterio | Qué lo prueba |
|---|---|
| C1 | `tests/router-route.test.js`: cada delegación sale con un peldaño (harness, modelo, esfuerzo) de lo que la tarea pide; `tests/router-replay.test.js`: la decisión frente a lo que decidió el Lead. |
| C2 | `tests/router-criterion.test.js` y `tests/router-regression.test.js`: 14 briefs con respuestas registradas y su decisión esperada; la prueba falla con un criterio cambiado. |
| C3 | `tests/router-route.test.js`: en `command`, una delegación sin `model` ni `effort` sale con peldaño; en `record` y `advise` hereda; la anulación con motivo conserva lo pedido y queda en el registro. |
| C4 | `tests/router-route.test.js` (`aether:*` pasa de largo); `git diff` sin cambios en los archivos del swarm; el workflow y las pruebas de lanes existentes pasan sin cambios. |
| C5 | `tests/router-deciders.test.js`: Haiku y Jev dan las mismas respuestas normalizadas; un tercero se registra sin tocar la política; con `haiku` ninguna petición sale de Claude. |
| C6 | `tests/router-rungs.test.js`: la tabla es la que el índice deriva; un modelo de agy o de grok se ubica donde mide. |
| C7 | `tests/router-rungs.test.js`: `high` es B en Haiku y C en Sonnet; `tests/router-route.test.js`: el esfuerzo es explícito en `command`. |
| C8 | `tests/delegate-calls.test.js` (agy simulado), `tests/aether-route.test.js` y `tests/router-mod.test.js`: un delegado de solo lectura vuelve su resultado sin pasar por un modelo. Una llamada real por harness la hace el dueño (spec, Irreversible actions). |
| C9 | `tests/router-quota.test.js`: los escenarios 8, 16, 17, 18 y 19 con lecturas simuladas, y el orden de cuota del swarm sin cambios (sus pruebas existentes). |
| C10 | `tests/router-route.test.js`: una prueba por cada forma de falla, y todas terminan con el delegado en Claude; `tests/router-mod.test.js`: un bin que falla deja la llamada intacta. |
| C11 | `tests/router-replay.test.js` y `tests/aether-route.test.js`; `tests/router-log.test.js` (el registro sobrevive entre sesiones). |
| C12 | `tests/router-docs.test.js`: la tabla de viabilidad de `docs/guide/router.md` trae C1 a C10 y cada ajuste. |
| C13 | `tests/router-report.test.js`: el reporte da peldaño, razón, confianza, decisor y cuota por delegación. |
| C14 | `tests/router-docs.test.js`: la sección de propuestas con sus mediciones; ningún archivo del plugin las construye (esta tarea no crea ninguno). |

Lo que ninguna prueba del repositorio comprueba, y queda para el dueño: la precisión y la latencia reales de Haiku bajo como decisor (se mide con `aether-route replay --decider haiku --paid`), que el gancho `tool.call` se comporte en lanzamientos en paralelo y con `isolation: "worktree"`, y que el motor no dispare el gancho para los agentes de un workflow.

## Assumptions

- **S1. Los valores de las opciones.** `router`: `record`, `advise`, `command` (los modos «registra», «avisa» y «manda» de la spec). `decider`: `haiku`, `jev`. Reversible: es el texto de las opciones.
- **S2. El peldaño estándar y el tiempo límite viven en `criterion.json`, no en opciones.** R11 nombra dos opciones; A-4 y A-6 dicen «se cambia en la opción» sin nombrar una. Reversible: se pasan a opciones sin tocar la política.
- **S3. Un nivel A a D se calcula con cortes fijos por eje** (inteligencia 37.5, 45, 55; Terminal-Bench 0.18, 0.35, 0.58), que reproducen las bandas de la evidencia §4. Están en el generador y en la propia tabla.
- **S4. El decisor produce el nivel y el esfuerzo es el del peldaño** (D4). Reversible: el criterio puede añadir una preferencia de esfuerzo sin tocar el contrato.
- **S5. Un peldaño `borrowed` es elegible, uno `unmeasured` no** (R15: «solo sirve al nivel que sí tiene medida»). Un peldaño prestado se reporta como tal en el registro.
- **S6. Un delegado va a otro harness solo con la opción `lanes` activa y el harness en `harnesses`.** Esos harness corren sin permisos (`--dangerously-skip-permissions`); es la misma condición del swarm. Reversible.
- **S7. «Nivel pedido» en el fallback de harness** es el nivel que la decisión pidió, en el peldaño de Claude más barato que lo mide; el fallback por falla del decisor usa lo que pidió el Lead o el estándar (D9).
- **S8. El esfuerzo supuesto de la sesión es `xhigh`** (`scripts/aether-lead --effort xhigh`) cuando el Lead pasa `model` sin `effort`, para calcular el nivel que pidió.
- **S9. Los briefs de R5 son sintéticos** (A-9 lo permite): el dueño los sustituye por los reales con el replay. Las respuestas registradas de cada brief son las que midió Jev en la evidencia §3, redondeadas.
- **S10. La forma de la anulación** (A-7): una línea del brief que empieza por `ROUTER-OVERRIDE: ` seguida de un motivo no vacío.
- **S11. El registro no se poda.** Es pequeño (una línea por delegación) y R27 pide que sobreviva; si crece, una poda es una tarea aparte.
- **S12. El «diario» de R30 es el registro `decisions.jsonl`** y su reporte `aether-report --delegates`; el diario de una corrida autónoma lo escribe el Lead y no se automatiza.
- **S13. Un delegado cuyo brief lleva `ROUTER-OVERRIDE` no llama al decisor** (ahorra la llamada); el registro dice que no hubo decisión.

## Risks

- **Haiku bajo como decisor no está medido** (precisión y latencia, spec R31). Mitigación: el estándar es `record`, que no cambia nada; el replay mide a Haiku antes de dar mando; en `command` una falla por tiempo cae al fallback sin demora mayor que 3 s.
- **El motor no se probó con lanzamientos en paralelo, `isolation: "worktree"` ni un modelo real** (evidencia §1). Mitigación: el router nunca reescribe una llamada si su propio paso falla; las pruebas del mod usan un `$` simulado y el dueño comprueba con `npm run test:mod` y una sesión real antes de pasar a `command`.
- **El gancho puede dispararse para llamadas que no son del Lead** (agentes de un workflow, delegados que lanzan delegados). Mitigación: el filtro por `subagent_type` deja fuera `aether:*`; un delegado de otro tipo lanzado por otro delegado también se rutearía, y queda anotado.
- **La política A49 reemplaza la regla literal** y el dueño debe confirmarlo (C9, R31). Está en la tabla de viabilidad y en las pruebas de los escenarios 17 y 19, que fijan los dos comportamientos.
- **La lectura de agy puede estar vieja** (solo se refresca cuando algo la lee). Mitigación: el bin lanza una lectura suelta cuando pasa de su vida; el registro guarda la edad de la lectura que se usó.
- **Un delegado en otro harness corre sin permisos.** Mitigación: solo lectura, en un worktree desechable, con comprobación de que no cambió nada, el entorno limpio de credenciales (`laneEnv`) y la condición S6.
- **Los briefs salen a un tercero con el decisor Jev.** Mitigación: Jev se activa a propósito, la llave nunca está en el repositorio, y el registro no guarda cabeceras ni la llave.
- **Un hallazgo para la spec:** A-6 dice que el límite de 3 s «se ajusta con la opción», y R11 solo nombra dos opciones (S2). No bloquea.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Un bin nuevo, `aether-route`, en vez de verbos en `aether-lane` | R9: el router no puede cambiar `aether-lane` ni su lógica de cuota; R28 pide un comando de replay | Meter los verbos en `aether-lane` toca el archivo que usa el swarm y mezcla dos dueños; sube la cuenta de bins en la documentación, que `docs-facts` fija |
| `criterion.json` con preguntas, reglas y umbrales | R3: el criterio es un archivo legible y cambiarlo cambia la decisión sin tocar código | Reglas en el código no las puede leer ni cambiar el dueño, y R5 no tendría qué vigilar |
| Una tabla de peldaños generada (`rungs.json` y su generador) | R13, R14, R15, R16: el nivel de cada peldaño sale de las medidas, por eje, y es regenerable | Reusar `replaces` de `lanes.json` mide un solo eje, no marca lo prestado ni lo sin medir, y R9 prohíbe cambiar `levels` |
| El protocolo de dos pasos `begin`/`finish` con un archivo pendiente | R10 y A-6: el decisor estándar es Haiku, que solo el mod puede llamar; el bin no tiene modelo | Llamar a `claude -p` desde el bin añade 2 a 5 s y un proceso de Claude por delegación, contra el límite de 3 s (R23) |
| Un archivo de sesión `sessions/<id>.router.json` | R11: el mod no ve las opciones de la sesión (evidencia §3) | Leer las opciones desde el mod no se puede; el patrón del archivo `.ops-off` ya existe |
| `lib/delegate-calls.js`, una llamada sin corrida | R18: `aether-lane start` exige una corrida y un worktree de unidad; R26 pide el fallback sin gastar la escalera | Reusar `start` obliga a crear una corrida falsa por delegado; reusar `seats.js` mezcla el esquema y los finalizadores de los asientos |
| Un módulo `hooks/router.mjs` aparte de `register.js` | R9 y R25: `register.js` es el medidor y el ops; el router no debe poder romperlos | Meter la lógica en `register.js` la pone en el camino del medidor y la hace difícil de probar con un `$` simulado |
