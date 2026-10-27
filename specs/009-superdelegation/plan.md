# Superdelegación: plan

**Spec:** [spec.md](spec.md)

## Technical context

- **Stack.** Node.js 22 CommonJS sin dependencias; los `.mjs` del mod son ESM. Los bins son finos y `plugins/aether/lib/` guarda la lógica (CLAUDE.md). Las pruebas son `node --test "tests/*.test.js"`.
- **Lo que existe y se reutiliza.** `lib/lane-quota.js` (`harnessView`, `refreshStale`) y `lib/lane-order.js` (`groupView`) dan la vista de cada cuota con su ventana más larga (`resetsAt`), su `usable` y su `mark`; `lib/lane-marks.js` guarda las marcas de cuota seca; `lib/lane-calls.js` arranca, espera y para las llamadas externas (`start`, `wait`, `result`, `stop`; desde la 0.13.0 `runCall` lee la salida del harness antes de su cuota, para que la cuota que Muse informa en su última llamada cuente); `lib/harness/muse.js` (el quinto harness, A64) guarda esa cuota en `lanes/quota/muse-observed.json` y no tiene refrescador; `lib/seats.js` y `lib/seat-calls.js` corren las rondas del diseño; `lib/report.js` ya trae `lanes.run`, `radar.delegation` y el saldo de cada grupo; `scripts/lane-smoke.js` hace una llamada real.
- **Dos restricciones de la arquitectura que mandan el diseño.** (1) Un workflow no tiene módulos ni reloj: `run.workflow.js` y `design.workflow.js` no pueden importar la regla ni leer la hora, y por eso hoy llevan una copia a mano de la regla de cuota (`orderOf`, `exclusionOf`), que `tests/workflow-order.test.js` sostiene. (2) El mod (`hooks/ops-command.mjs`) corre los comandos `aether-lane` del workflow sin modelo y solo acepta una lista cerrada de formas.
- **Estructura nueva.** `plugins/aether/config/pairs.json` (la tabla única de pares), `lib/pairs.js` (la carga), `lib/superdelegation.js` (la función de elección, el interruptor y los argumentos de la corrida), `lib/lane-pick.js` (los comandos `pick`, `took` y `pause` de `aether-lane`), `lib/lane-cupo.js` y `scripts/lane-cupo.js` (la medición del cupo).
- **Sin constitución.** `.specify/memory/constitution.md` no existe.
- **Pruebas sin cuota.** Todo se prueba con tablas fijas, el `fake-agy` de `tests/fixtures/` y el arnés de workflows con agentes simulados (`tests/workflow-harness.js`). Nada de `npm test` llama a un harness real.

## Gate

- Nothing speculative, and nothing for a hypothetical need. **Pass.** Cada pieza sirve a un requisito de la spec (tabla de abajo, en Design). Muse Code entra por la regla (C16), sin código propio; no se prevé terminal-bench, ni el refrescador del costo por tarea, ni un cambio de la guía de efforts: son Out of scope o Proposals.
- No abstraction, option, file or dependency that no requirement asks for. **Fail, kept and justified in Complexity.** La spec pide una regla y un mecanismo (R19), pero no nombra tres comandos de `aether-lane` (`pick`, `took`, `pause`), el campo `family` y el campo `ownerDecision` de la tabla, las claves heredadas `lanes` y `seats` del manifiesto, ni el módulo `lib/lane-cupo.js`. Cada una nace de una restricción medida arriba (workflows sin módulos ni reloj, un mismo modelo en dos harness, valores guardados por el dueño, una medición con llamadas a la vez) y la sección Complexity dice por qué la alternativa simple es peor.

## Design

Cada decisión dice a qué criterio o requisito sirve.

**D1. Una tabla única de pares, `config/pairs.json`.** Una fila por par: `id` (`<harness>/<modelo>@<effort>`, por ejemplo `agy/gemini-4-argon@high` o `claude/sonnet@xhigh`), `slug` (el de Artificial Analysis, de `evidence/`; el par de Claude dentro de agy lleva el del par nativo, y el par de Muse el de `claude-opus-5-5-high`; `refresh-lanes.js` refresca la inteligencia por él), `harness`, `model` (el alias `haiku|sonnet|opus` en Claude; el id del modelo de la tabla de lanes en un externo), `family` (la identidad del modelo, igual en el nativo y en el mismo modelo dentro de agy), `effort`, `group` (la cuota; `null` en Claude), `intelligence`, `costPerTaskUsd` (`null` si Artificial Analysis no lo publica), `ownerDecision` (opcional: las palabras del dueño cuando él decidió que el par entra; solo un par con ella puede entrar sin costo, y su inteligencia sigue siendo un número), `outputTokensPerSecond` y `timeToFirstTokenS` (solo informativos: nada los lee, C7). Trae los 22 pares de `evidence/`, 6 de Claude dentro de agy (Sonnet y Opus, `low`, `medium` y `high`, que agy ofrece), con las cifras del nativo, y el de Muse: `muse/muse-wonder-full-1.0@high`, `family` `muse-wonder-full-1.0`, `group` `muse`, inteligencia 53.6 (la de Opus `high`: tarjeta, fila 15), `costPerTaskUsd` `null` y `ownerDecision` con las palabras de la cita 16 («si deja entrar a musewonder full es uno d elos mejores modelos que tiene el harness, ... esta anivel de opus segun yo»). 29 filas; la de Muse es la última. Muse queda con ese único par: Artificial Analysis lo mide solo a `max`, que la CLI no toma, y `high` es el effort al que la otra sesión lo probó. `lib/pairs.js` la carga y la valida. *Serves: R7, R8, R13, R24; C4, C5, C14, C16.*

**D2. Una sola función de elección, `choose` en `lib/superdelegation.js`, pura.** Recibe la tabla, el par de referencia (`{ model, effort }`), la vista de cuotas de los harness habilitados, los pares excluidos y los modelos autores, y devuelve la decisión: los puntos pedidos, el par elegido o `null`, el agente nativo de respaldo, los candidatos en orden con el motivo de cada descarte, y una frase con la razón. La regla, en este orden:
1. Pide `reference.intelligence`; es candidato un par externo de un harness habilitado e instalado, con inteligencia y costo medidos, cuya inteligencia llega a lo pedido menos 1 punto (inclusivo, comparado en décimas enteras). Sin costo medido solo es candidato el par con `ownerDecision` (Muse); sin él, el motivo es `no-cost`.
2. Se descarta el par dominado dentro de su cuota (D3), el excluido, el de un modelo autor y el de una cuota seca (`usable` falso o con marca).
3. Orden: primero la cuota cuya ventana semanal se renueva antes (`resetsAt` menor; una ventana ilegible va después de las legibles); dentro de la cuota, el menor costo por tarea, y el par sin costo (el de la decisión del dueño) después de los que lo tienen; con el mismo costo, más puntos; después, el orden de la tabla.
4. La velocidad no entra en ningún paso.
*Serves: R5, R8, R9, R10, R11, R13, R16, R17, R19, R24; C3 a C8, C11, C12, C14, C16.*

**D3. «No da más puntos» se lee con la tolerancia de 1 punto.** Un par P se descarta si otro par Q de la misma cuota cuesta menos por tarea y Q da al menos los puntos de P menos 1 (P no da más de 1 punto sobre Q). Con la lectura estricta, Grok `xhigh` (46.4) no quedaría dominado por Grok `high` (46.3) y ganaría una llamada que pida 47.4, contra la evidencia de C5. El Lead lo confirmó. Como dice R9, Q debe ser también candidato de esa misma llamada (llegar a lo pedido menos 1 punto y pasar los demás descartes) y no haber sido excluido por un reintento: un Q que no llega a lo pedido, que un reintento excluyó o que es de una cuota seca no domina. Por eso Grok `xhigh` (46.4) sí gana una llamada que pida 47.4, a la que Grok `high` (46.3) no llega, y cae solo cuando `high` es candidato de la llamada (una que pida 47.3 o menos). Un par sin costo por tarea (el de Muse) ni se compara ni compara: no es dominado y no domina. En la tabla de hoy solo cae Grok `xhigh`, y solo ante una llamada que pida 47.3 puntos o menos, con `high` sin excluir. *Serves: R9; C5.*

**D4. Nativo de respaldo y «nadie revisa lo suyo».** `decision.native` es el agente que corre cuando `picked` es `null` o la llamada externa falla: el par de referencia. Con `nativeDiffers` (supervisor, Judge, Examiner y revisor de la revisión final: todo el que revisa lo que otro hizo; el Writer y el implementador no), si el modelo de referencia es un autor, `native` es el modelo de Claude, entre Haiku, Sonnet y Opus, que no es autor, al mismo effort de la referencia, con la inteligencia más cercana a lo pedido (el más fuerte si hay empate); si los tres son autores, queda la referencia y la decisión lo dice. Un par externo cuyo `family` es un autor no es candidato. El agente nativo que corre una llamada es siempre `decision.native`, también cuando cae a nativo por espera de cupo agotada o por un fallo del par externo, y también en un asiento del diseño con la superdelegación apagada (la decisión se calcula entonces sin candidatos), para que ningún camino a nativo deje a un revisor en el modelo del autor. *Serves: R16, R17; C11, C12.*

**D5. El swarm llega al mecanismo por un comando.** El workflow no puede importar `choose`, así que llama a `aether-lane pick <run> <call> --role <rol> --model <alias> --effort <effort> [--exclude <ids>] [--author <family>]`, que lee la tabla de lanes y la de pares, las vistas de cuota (renueva la lectura vieja de Grok y la guarda en el archivo de lecturas del router, `<dataDir>/router/readings/grok.json`, porque cada `pick` es un proceso nuevo y el refresco de Grok por ACP no deja huella en su registro: mientras dure `quotaLifeMinutes` ningún otro `pick` lo repite), llama a `choose`, registra la decisión en el log de lanes y la imprime. Desaparecen del workflow la copia de la regla y la etapa de cuota por ola: `groupViews`, `notInstalled`, `dryInRun`, `readQuota`, `exclusionOf`, `orderOf`, `rankOf`. El workflow pasa los `pick` por una cola para que dos llamadas no renueven la misma lectura a la vez. *Serves: R5, R10, R19, R20; C3, C14.*

**D6. El cupo.** El workflow ya cuenta las llamadas externas en vuelo por harness. Antes de arrancar la llamada elegida, si el harness está lleno espera: hasta `cupo.polls` rondas de `aether-lane pause --seconds <cupo.pollSeconds>` (10 rondas de 60 s, 10 minutos, constantes de `lib/superdelegation.js` que `aether-plan compile` pasa en los argumentos), y a la ronda en que hay lugar arranca. Si se agota, la llamada corre nativa (`took --cause wait-limit`). `pause` existe porque un workflow no lee el reloj. Espera por el harness del par elegido, no cambia a otro par. *Serves: R15, R16; C10, C11.*

**D7. Reintentos.** Cada intento llama a `pick` con el par de referencia de su escalón (`effortFor`) y con `--exclude` del par donde corrió el intento que no aprobó. Un `start` que vuelve `unavailable` repite el `pick` excluyendo ese par hasta que no quede candidato; entonces corre nativo. `max` pasa por `pick` como cualquier otro effort (hoy ningún externo llega a 56, así que sale nativo por resultado). La escalera y su bloqueo no cambian. *Serves: R14, R16, R20; C9, C11.*

**D8. El diseño usa la misma función.** `lib/seats.js` reemplaza `chooseSeat` por una llamada a `choose` con la referencia de cada asiento (Judge y Examiner Opus `high`, Writer Sonnet `high`) y las vistas de cuota de `lib/lane-pick.js` (`harnessViews`, con las lecturas de `latestReadings`, que también guardan el refresco de Grok). Desaparecen `EXTERNAL_EFFORT`, `designSeats` y los perfiles. Las correcciones del Writer dejan de ser nativas por regla: pasan por `seatRound` como cualquier ronda del Writer (con `--doc spec|plan` y el mensaje de la corrección), y el agente nativo solo las toma si ningún par llega, con el esquema de corrección de hoy. `aether-lane seat` y `seat-start` reciben `--superdelegation on|off` en lugar de `--seats` y `--lanes`. El agente nativo de un asiento sale de `decision.native`, en la respuesta de exit 3 (también con la superdelegación apagada) y en la de exit 4, y el Examiner, como el Judge, difiere del autor (el workflow ya no lleva su propia tabla de modelos). *Serves: R5, R16, R17, R19, R20; C2, C3, C12, C14.*

**D9. El interruptor y la migración.** `plugin.json` gana `superdelegation` (booleano, sin `default`, para distinguir «no puesto»). `lanes` y `seats` quedan en el manifiesto solo como claves heredadas, marcadas así en su título y su descripción y sin selector ni valor por defecto de `seats`, porque Claude Code solo entrega a la sesión los valores de las claves que el manifiesto conoce y el dueño tiene guardados los suyos. `resolveOption` (en `lib/superdelegation.js`) lee las variables `CLAUDE_PLUGIN_OPTION_*` y da el interruptor: `superdelegation` si está puesta (`true` o `false`); si no, `lanes`; `seats` siempre se ignora, también `native`. Lo que se ignora o se reinterpreta queda en `legacy` y `aether-session-start` lo dice (al contexto de la sesión) y lo guarda en `AETHER_SUPERDELEGATION_LEGACY` para que `aether-report` lo repita. La sesión exporta `AETHER_SUPERDELEGATION=on|off` y `AETHER_LANE_HARNESSES`; ya no `AETHER_LANES` ni `AETHER_SEATS`. La opción `lanes` del router (`lib/session.js`) pasa a ser el mismo interruptor resuelto, para que Aether tenga un solo criterio. *Serves: R1, R2, R3, R4; C1, C2.*

**D10. Los argumentos de la corrida.** `aether-plan compile` solo da `lanes` cuando el interruptor está encendido (y en Linux) y algún harness habilitado está instalado y tiene pares: `{ superdelegation: true, harnesses, maxParallelByHarness, waits, cupo }`. Sin las listas de candidatos por rol: las decide `pick` en cada llamada. *Serves: R4, R5, R15; C2, C10.*

**D11. El informe.** `pick` escribe una entrada `choice` (referencia, puntos pedidos, par elegido, candidatos, razón) y el workflow escribe una `took` al terminar cada llamada con `aether-lane took` (quién la corrió y por qué). Como el workflow no lee el reloj, la hora de ambas es la del bin, y el tiempo de la llamada es la diferencia entre la primera `choice` y la `took` de la misma llamada. `lib/report.js` junta las dos por llamada y suma a `radar.delegation` la parte del trabajo que salió de Claude (llamadas externas sobre el total) y la cuota consumida por harness; los dólares a precio de lista y los saldos ya los trae. El informe también repite lo que se ignoró o reinterpretó del dueño. *Serves: R2, R12, R18; C7, C13.*

**D12. La medición del cupo.** Se hace en `agy`, `grok` y `muse`. `scripts/lane-cupo.js <harness>` lanza `scripts/lane-smoke.js` en rampa (1, 2, 3, … llamadas a la vez, techo de 8) hasta que una llamada falla o el paso más lento tarda más del doble que la llamada sola, y con `--write` deja el cupo hallado en `maxParallel` de `config/lanes.json`, con `maxParallelMeasured` (`at`, `ceiling`, `limited`). La lógica de la rampa vive en `lib/lane-cupo.js` para probarla con una función de llamada simulada. La medición real la hace el Lead con el permiso `paid-call`. *Serves: R23; C10, C15.*

**D13. La regla escrita.** `docs/guide/lanes.md` pasa a ser la regla de superdelegación (qué pide cada llamada, quién es candidato, el orden, el nativo, la revisión cruzada, el cupo, el informe); `docs/guide/options.md`, `design-seats.md`, el README, `getting-started.md`, `troubleshooting.md`, `reference/components.md`, `methodology.md`, `purpose.md` y la web (`site/`, en español e inglés) dicen lo mismo. No se crea una página nueva, para no tocar la lista de páginas de `tests/docs-facts.test.js`. Una decisión nueva en `docs/decisions.md`, la A65 (A63 y A64 ya existen). Las páginas que listan los harness siguen listando a Muse, y `docs/guide/lanes.md` conserva su sección `## Muse`, ajustada a la regla (`tests/muse-docs.test.js`, `tests/muse-docs-overview.test.js`, `tests/harness-lists.test.js`, `tests/muse-skills.test.js` y `tests/lanes-docs.test.js` las sostienen). `docs/guide/lanes.md` y `docs/guide/options.md` son las únicas páginas que pueden nombrar `lanes` y `seats` (la migración). *Serves: R19, R21, R25; C14, C16.*

**D14. La lista final de lo que desaparece (R20).** Una prueba (Task 11) lo busca en `plugins/` y en `scripts/`:
- la tabla de equivalencias: la clave `levels` de cada modelo de `config/lanes.json` (también el `xhigh` → `high` de Muse), `EXTERNAL_EFFORT` de `lib/seats.js` y su lectura en `lib/lane-calls.js` (`laneModel`); `laneFor` de `lib/lanes.js`; y la clave `replaces` de cada modelo (también la de Muse), que es la otra mitad de esa tabla (el modelo de Claude que cada modelo externo "reemplaza"): sale de `config/lanes.json`, de `validateModel` (que la pedía a todo modelo de enjambre), de `laneFor` y `lanesArgs`, y del índice de modelos (`lane.replaces` de `config/models/models.json`, que escribe `scripts/build-models-index.js`; `lane` conserva `roles`);
- los perfiles: la opción `seats` como selector de `plugin.json`, `designSeats`, `seatList`, `validateSeats`, `SEAT_CHOICES`, `DEFAULT_SEATS` y `seatsChoice` de `lib/lanes.js`, `SEAT_CHOICES` y `input.seats` de `design.workflow.js`, `--seats` y `AETHER_SEATS`;
- la regla fija de `max`: la salida `effort === 'max'` de `laneWalk`, y con ella `laneWalk` entero;
- las correcciones nativas por regla: `nativeRevision` y el texto «the native Writer corrects the document, with no seat round» de `design.workflow.js`;
- la segunda regla de cuota del swarm: `groupViews`, `notInstalled`, `dryInRun`, `readQuota`, `exclusionOf`, `orderOf`, `rankOf`, `unavailableOutcome`, `logChoice`, `choiceLogs`, `candidatesFor`, `plannedLanes`, la razón `reserve` y la copia `tests/workflow-order.test.js`; y en las libs `lanesArgs`, `lanesEnabled` y `AETHER_LANES`, `orderCandidates` y `candidatesOf` de `lib/lane-order.js`, `lib/lane-choice.js` con el comando `aether-lane choice` y su gramática en el mod.

Se quedan, porque otra cosa los lee y no son parte de la política: `roles`, `aa` y `ownerDecision` de cada modelo de `config/lanes.json` (los lee el router —`roles`—, el índice de modelos y la comprobación de la tabla), y de Muse todo lo demás de su entrada (`group`, `maxParallel`, `waitSeconds`, `timeouts`, `quotaLifeMinutes`), `groupView` y `readingUsable` de `lib/lane-order.js`, las marcas y las lecturas.

**D15. El orden de la obra deja el árbol verde en cada fusión.** Cada fusión corre `npm test` completo, así que lo viejo se retira solo cuando ya no lo lee nadie, y cada tarea cabe en pocas rutas (issue 003: la opción y la sesión, el ajuste del router, el panel, el manifiesto y `aether-plan` son tareas aparte, como el diseño en sus asientos y su workflow, las guías, las demás páginas y la web, y cada retiro de lo viejo). Ola 1: la tabla y la función (Task 1) y la rampa del cupo (Task 2). Ola 2: los comandos (Task 3), el arranque de la sesión (Task 4), el informe (Task 5), el ajuste del router (Task 12), `aether-plan compile` (Task 15), el índice de modelos (Task 20) y las pruebas de Muse sobre la regla (Task 23), que solo añaden: la Task 23 reescribe `tests/muse-lane.test.js` para que no nombre lo que retiran las Tasks 19, 21 y 22, que dependen de ella. Ola 3: el workflow del swarm (Task 6), los asientos del diseño (Task 7) y el panel (Task 13), cada uno retira lo suyo. Ola 4: el manifiesto con la tabla de opciones (Task 14) y el workflow de diseño con la lista cerrada del mod (Task 16). Ola 5: la regla escrita y las guías (Task 8), el retiro del comando `choice` (Task 9) y las skills del Lead (Task 10). Ola 6: las demás páginas (Task 17) y `status` y `laneModel` sin la tabla de equivalencias (Task 19). Ola 7: la web, la decisión y las pruebas de cierre de los documentos (Task 18), la tabla de lanes y `lib/lanes.js` (Task 21) y el orden por candidatos (Task 22). Ola 8: las pruebas de escenario y la búsqueda de R20 (Task 11).

## Files

| Archivo | Qué y por qué |
|---|---|
| `plugins/aether/config/pairs.json` (nuevo) | La tabla única de pares, con el par de Muse y las palabras del dueño (D1). |
| `plugins/aether/lib/pairs.js` (nuevo) | Carga y valida la tabla; `referenceOf`, `pairId` (D1). |
| `plugins/aether/lib/superdelegation.js` (nuevo) | `choose`, `enabled`, `resolveOption`, `legacyNotes`, `runArgs`, `idleHarnesses` y las constantes (D2 a D4, D6, D9, D10). |
| `plugins/aether/lib/lane-pick.js` (nuevo) | `pickCommand`, `tookCommand`, `pauseCommand`, `harnessViews` (D5, D6, D11). |
| `plugins/aether/bin/aether-lane` | Los comandos `pick`, `took`, `pause`; después se quita `choice`. |
| `plugins/aether/hooks/ops-command.mjs` | Las formas nuevas de la lista cerrada; después `seat-start` con `--superdelegation` y sin `choice`. |
| `plugins/aether/lib/lane-calls.js` | Exporta `enabledFor`; después `start` deja de traducir el effort. |
| `plugins/aether/workflows/run.workflow.js` | `pick` en lugar de `laneWalk`, el cupo, `took`, el retiro de la regla copiada (D5 a D7). |
| `plugins/aether/workflows/design.workflow.js`, `lib/seats.js`, `lib/seat-calls.js` | El diseño sobre `choose`, las correcciones por ronda (D8). |
| `plugins/aether/.claude-plugin/plugin.json`, `bin/aether-session-start`, `bin/aether-plan`, `lib/session.js`, `hooks/panel-view.mjs`, `hooks/panel-layout.mjs` | El interruptor, la migración, los argumentos de la corrida y el panel (D9, D10). |
| `plugins/aether/lib/report.js` | El informe por llamada y las cifras de RADAR (D11). |
| `plugins/aether/lib/lanes.js`, `lib/lane-order.js`, `config/lanes.json`, `scripts/refresh-lanes.js`, `scripts/build-models-index.js` | El retiro de las tablas viejas (D14), también el `levels` y el `replaces` de Muse, cuya entrada conserva lo demás; `refresh-lanes.js` también refresca la inteligencia de `pairs.json`. |
| `plugins/aether/lib/lane-cupo.js`, `scripts/lane-cupo.js` (nuevos) | La rampa del cupo (D12). |
| `plugins/aether/skills/using-aether`, `swarm`, `autonomous-runs` | El Lead lanza el diseño con `superdelegation` y lee el resultado nuevo. |
| `docs/**`, `README.md`, `site/**` | La regla escrita y la coherencia de textos (D13). |
| `tests/**` | Las pruebas de cada tarea, y las de escenario y de búsqueda (Task 11). Las de Muse que nombran lo retirado: `muse-lane.test.js` (Task 23), `lanes.test.js` y `lane-models.test.js` (Task 21), `lane-table-index.test.js` (Task 20), `roles.test.js` (Task 10), `launcher.test.js` y `manifest.test.js` (Tasks 14 y 17), `docs-facts.test.js` (Task 18). |

## Verification

- **Comando de prueba:** `npm test`. Antes de un PR también `npm run check` (`npm test`, `npm run test:mod`, `npm run validate`): el mod tiene pruebas propias en `hooks/*.test.ts`.
- **Qué prueba cada criterio:**

| Criterio | Prueba |
|---|---|
| C1 | `tests/superdelegation.test.js` (`resolveOption`), `tests/manifest.test.js`, `tests/session-start.test.js` |
| C2 | `tests/workflow-superdelegation.test.js` (sin `lanes`), `tests/workflow-design.test.js` (apagado), `tests/superdelegation-scenarios.test.js` |
| C3 | `tests/superdelegation.test.js`, `tests/workflow-superdelegation.test.js`, `tests/workflow-design.test.js` |
| C4 | `tests/superdelegation.test.js` (51.9 y 46.8), `tests/lane-pick.test.js` |
| C5 | `tests/superdelegation.test.js` (1 punto, Flash `low`, Grok `xhigh`) |
| C6 | `tests/superdelegation.test.js` (dos cuotas, Grok sin Sonnet `xhigh`) |
| C7 | `tests/superdelegation.test.js` (velocidades cambiadas), `tests/report.test.js` (tiempo por llamada) |
| C8 | `tests/superdelegation.test.js` (propiedad: ningún par por debajo de lo pedido menos 1; Sonnet `xhigh` nunca baja a `high`) |
| C9 | `tests/workflow-superdelegation.test.js` (reintento) |
| C10 | `tests/workflow-superdelegation.test.js` (cupo lleno y límite), `tests/lane-cupo.test.js`; la medición real, abajo |
| C11 | `tests/superdelegation.test.js`, `tests/workflow-superdelegation.test.js` (las cuatro causas) |
| C12 | `tests/superdelegation.test.js` (revisión cruzada), `tests/workflow-superdelegation.test.js`, `tests/workflow-design.test.js` |
| C13 | `tests/report.test.js` |
| C14 | `tests/superdelegation-gone.test.js` (búsqueda), `tests/docs-facts.test.js`, `tests/site.test.js` |
| C15 | `tests/superdelegation-scenarios.test.js` (sin cuota); la medición y la corrida real, abajo |
| C16 | `tests/pairs.test.js` (la fila de Muse), `tests/superdelegation.test.js` (Muse toma hasta Opus `high`, sin decisión no entra, va último en su cuota), `tests/lane-pick.test.js`, `tests/superdelegation-scenarios.test.js`, `tests/muse-lane.test.js`, `tests/lane-models.test.js`, `tests/lanes.test.js` y las pruebas de páginas de Muse |

- **Lo que hace el Lead con el permiso `paid-call` del dueño (R23, C15).** No es una tarea del swarm; se hace con todas las tareas fusionadas y `npm test` verde, desde el checkout de la rama (`<repo>/.worktrees/superdelegation`), con los bins de la rama por ruta y con `AETHER_IRREVERSIBLE=enforce` vigente. El dueño lo autorizó con «no estare dispnble trabaja autonomamente impelmetnandolo apruebo purbas reales». Primero el permiso, en una llamada aparte de las que ejecutan la acción (si el registro no acepta la cita, porque solo lee los mensajes normales del chat, el Lead no corre nada: deja las órdenes de abajo en el brief para que el dueño las corra con `!`):

  ```
  node plugins/aether/bin/aether-autonomy grant --class paid-call --quote "no estare dispnble trabaja autonomamente impelmetnandolo apruebo purbas reales"
  ```

  1. **El cupo de cada harness**, una orden por llamada de Bash (cada una lanza hasta 36 llamadas cortas, 1 + 2 + … + 8, y escribe `maxParallel` y `maxParallelMeasured` en `plugins/aether/config/lanes.json`; con `--ceiling N` se baja el techo):

     ```
     node scripts/lane-cupo.js agy --write
     node scripts/lane-cupo.js grok --write
     node scripts/lane-cupo.js muse --write
     ```

     Después, `git diff plugins/aether/config/lanes.json` debe mostrar solo las dos líneas por harness, y `node --test tests/lanes.test.js tests/lane-table-index.test.js` debe seguir verde.
  2. **Una corrida real corta**, en un repositorio descartable con tres tareas pequeñas (Haiku `high`, Sonnet `high`, Sonnet `xhigh`; el archivo pasa `aether-plan check`):

     ```
     W=<repo>/.worktrees/superdelegation
     S=$(mktemp -d) && cd $S && git init -q && printf 'node_modules\n.aether\n' > .gitignore && printf '# smoke\n' > README.md
     cat > tasks.md <<'EOF'
     # Smoke: tres tareas pequeñas

     ## Global Constraints

     - Node.js 22, CommonJS, sin dependencias. Cada tarea escribe su prueba primero y deja `node --test` verde.

     ## Aether Execution

     - Test command: `node --test`
     - Ladder: haiku 2, sonnet 2, opus 1
     - Max agents: 10

     ## Checklist

     - [ ] T001 [P] La suma in src/add.js → Task 1
     - [ ] T002 [P] La resta in src/sub.js → Task 2
     - [ ] T003 [P] El producto in src/mul.js → Task 3

     ### Task 1: La suma

     **Aether:**
     - Tier: haiku high — una función pura que una prueba exacta fija
     - Area: smoke-a
     - Owns: `src/add.js`, `tests/add.test.js`
     - Depends on: none

     Escribe `src/add.js` con `module.exports = { add }`, donde `add(a, b)` devuelve `a + b`, y `tests/add.test.js` con `node:test` que comprueba `add(2, 3) === 5`.

     ### Task 2: La resta

     **Aether:**
     - Tier: sonnet high — una función pura con un borde que la prueba fija
     - Area: smoke-b
     - Owns: `src/sub.js`, `tests/sub.test.js`
     - Depends on: none

     Escribe `src/sub.js` con `module.exports = { sub }`, donde `sub(a, b)` devuelve `a - b`, y `tests/sub.test.js` con `node:test` que comprueba `sub(5, 3) === 2` y `sub(3, 5) === -2`.

     ### Task 3: El producto

     **Aether:**
     - Tier: sonnet xhigh — una función pura con varios bordes que la prueba fija
     - Area: smoke-c
     - Owns: `src/mul.js`, `tests/mul.test.js`
     - Depends on: none

     Escribe `src/mul.js` con `module.exports = { mul }`, donde `mul(a, b)` devuelve `a * b`, y `tests/mul.test.js` con `node:test` que comprueba `mul(2, 3) === 6`, `mul(0, 9) === 0` y `mul(-2, 3) === -6`.
     EOF
     git add -A && git commit -qm init
     node $W/plugins/aether/bin/aether-plan check tasks.md
     AETHER_SUPERDELEGATION=on AETHER_LANE_HARNESSES=agy,grok,muse node $W/plugins/aether/bin/aether-plan compile tasks.md
     ```

     Con el JSON que imprime `compile` como argumentos, el Lead lanza `/aether:run` con la herramienta Workflow y, al terminar, corre `node $W/plugins/aether/bin/aether-report finalize --run <runId>` desde `$S`. El informe debe traer, por llamada, el par de referencia, el par que la tomó, el motivo y el tiempo, y `radar.delegation.work` con la parte delegada. Se anota qué harness tomó cada llamada y se comprueba que ninguna llamada de Sonnet `xhigh` la tomó Grok.
  3. `npm run test:mod` y `npm run validate`, que `npm test` no corre.

## Assumptions

- **La identificación de un par es `<harness>/<modelo>@<effort>`.** Los tokens del mod aceptan `/`, `@` y `,`.
- **«No da más puntos» (R9) usa la tolerancia de 1 punto (D3),** confirmada por el Lead. Reversible: cambiar la comparación de `choose` por la estricta; Grok `xhigh` ganaría entonces también una llamada que pida 47.3 puntos o menos, en la que hoy `high` lo domina.
- **`roles` de la tabla de lanes deja de decidir quién es candidato** (lo decide la inteligencia) y se queda en la tabla porque el router lo lee; **`replaces` se va** (D14). Un modelo que antes solo tomaba asientos (Argon) puede tomar un implementador, y Flash puede supervisar si llega a los puntos. Lo mismo vale para Muse: su par, de 53.6, puede tomar cualquier llamada hasta Opus `high`, también de nivel Haiku si su ventana semanal se renueva antes que las demás (el costo solo ordena dentro de una cuota).
- **Un par externo corre al effort de su par, tal cual**: `start` pasa el effort al harness sin traducirlo. El harness entiende `xhigh` solo si la tabla de pares lo lista (hoy solo Grok).
- **Los 6 pares de Claude dentro de agy copian las cifras del nativo** (spec, supuesto de agy). Un test los mantiene iguales.
- **`superdelegation` no tiene `default` en el manifiesto.** «No puesta» es una variable vacía o ausente. Claude Code puede aplicar defaults distintos de lo que este plan supone; la primera sesión real lo confirma (Risks).
- **El nativo de respaldo de una revisión** va al mismo effort que la referencia. Si Haiku, Sonnet y Opus son todos autores, corre la referencia y la decisión lo anota.
- **El autor de la revisión final** es el modelo que implementó más unidades fusionadas (con empate, el de la unidad de menor número). El de un supervisor es el modelo que corrió el intento que revisa.
- **El Examiner no tiene estado «apagado».** Sin superdelegación corre nativo, como corría con `balanced` y `lanes` apagado.
- **Un `start` que vuelve `unavailable` repite el `pick`** sin ese par, hasta quedar nativo.
- **El tiempo de una llamada** es de la primera `choice` a la `took` de la misma llamada; incluye la espera de cupo.
- **El techo de la rampa del cupo es 8 llamadas a la vez; «retrasa» es que el paso más lento tarde más del doble que la llamada sola.**
- **Muse entra con el par `muse/muse-wonder-full-1.0@high` a 53.6 (el de Opus `high`), sin costo por tarea y último en su cuota.** Supuesto de la tarjeta (fila 15), reversible: basta cambiar la fila de `pairs.json` (otra cifra, o quitarle `ownerDecision`, y deja de entrar). Su `slug` es el de `claude-opus-5-5-high`, así que `refresh-lanes.js` la mantiene igual a la de Opus `high`.
- **Las cifras de la tabla de pares son las de `evidence/` del 2026-10-19.** `scripts/refresh-lanes.js` refresca la inteligencia de `pairs.json` por `slug`; el costo por tarea se actualiza a mano.
- **Sin versión, sin changelog, sin publicar** (Out of scope de la spec). La versión que sigue a la 0.13.0 es la 0.14.0; el Lead la sube al publicar, y ninguna tarea toca la versión ni `docs/changelog.md`.
- **`lanes` y `seats` quedan en `plugin.json` como claves heredadas** (confirmado por el Lead); solo `docs/guide/lanes.md` y `docs/guide/options.md` pueden nombrarlas, y las pruebas de búsqueda lo dicen.
- **`replaces` se va también de la entrada de Muse** (el Lead lo decidió: junto con `levels` es la tabla de equivalencias de C14, y solo la leen el validador de `lib/lanes.js`, `laneFor`, `lanesArgs` y el índice de modelos, no el router). De la entrada de Muse se van `levels` y `replaces`; se quedan `group`, `roles`, `aa`, `ownerDecision` y `note`.

## Risks

- **Claude Code puede no entregar el valor guardado de una clave que el manifiesto ya no tiene, ni distinguir «no puesta» de un `default`.** Por eso `lanes` y `seats` quedan como claves heredadas y `superdelegation` no tiene `default`. Si la primera sesión real muestra que `CLAUDE_PLUGIN_OPTION_SUPERDELEGATION` llega como `false` sin que el dueño la haya puesto, la migración de `lanes` no se puede leer y hay que cambiar de camino (el Lead confirmó que las claves heredadas se quedan).
- **Cada `pick` es un proceso nuevo y el refresco de Grok por ACP no deja huella en su registro.** Sin guardarlo, cada `pick` lo repetiría (hasta 10 s). `latestReadings` (en `lib/lane-pick.js`) guarda la lectura nueva en el archivo de lecturas del router y la reutiliza dentro de `quotaLifeMinutes`; el workflow pasa los `pick` por una cola, así que el segundo ya encuentra la lectura guardada por el primero. El costo es que cada `pick` espera al anterior (un comando corto, sin modelo) y que el router ve esa lectura como suya.
- **La espera de cupo mira el harness del par elegido.** Si ese cupo está lleno diez minutos y otro harness tenía lugar, la llamada va nativa. Es lo que pide la spec (E5) y lo que el dueño espera que casi nunca pase («normalmente no hay cupo»).
- **Muse gasta un modelo fuerte en trabajo débil.** Como el costo solo ordena dentro de una cuota y Muse no tiene costo, si su ventana semanal se renueva antes, su par toma incluso llamadas de nivel Haiku. Es lo que dicen la regla y la tarjeta (C6, C16); la medición real lo mostrará en el informe.
- **Dos fuentes de inteligencia.** `aa` de `lanes.json` (que lee el índice del router) y `pairs.json` pueden diferir con el tiempo; `refresh-lanes.js` refresca las dos, y el costo por tarea solo existe en `pairs.json`. La de Muse es la excepción: `aa` de su entrada guarda el 55.8 de `max` de Artificial Analysis y su fila de `pairs.json` el 53.6 de Opus `high` por decisión del dueño.
- **El índice de modelos pierde `levels` y `replaces`.** `scripts/build-models-index.js` usaba `levels` para los modelos no listados; pasa a leer los efforts de la tabla de pares. `lane.replaces` deja de escribirse en `config/models/models.json` (`lane` conserva `roles`, que el router lee). `config/router/rungs.json` debe quedar idéntico (Task 20 lo comprueba).
- **Las pruebas de `hooks/*.test.ts` no corren con `npm test`.** `npm run test:mod` queda en la verificación final y en la lista del Lead.
- **Una medición de cupo que lanza 36 llamadas reales puede agotar una cuota pequeña.** El Lead la hace con el permiso del dueño y puede bajar el techo con `--ceiling`.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Tres comandos nuevos de `aether-lane` y sus formas en la lista cerrada del mod: `pick`, `took` y `pause`. | R19 pide un solo mecanismo para el swarm y el diseño; R15 pide la espera de cupo con límite; R12 y R18 piden el tiempo y el motivo de cada llamada. Un workflow no tiene módulos ni reloj, y el mod solo corre formas cerradas. | Copiar la regla en el workflow, como hoy `orderOf` y `exclusionOf`, es exactamente la segunda regla que el dueño quiere que desaparezca (R19, R20); esperar con un bucle sin reloj no tiene límite de 10 minutos; medir el tiempo en el workflow está prohibido (no hay `Date`). |
| El campo `family` en cada par de la tabla. | R17 compara «el mismo modelo» entre el nativo y un harness: Claude Sonnet dentro de agy es el mismo modelo que Sonnet nativo. | Comparar por el nombre del par o por el alias no ve que `claude-sonnet-5-5` en agy es el nativo, y un Judge de agy revisaría al Writer nativo con su mismo modelo. |
| Las claves `lanes` y `seats` quedan en `plugin.json` marcadas como heredadas. | R2 pide leer `lanes` del dueño cuando `superdelegation` no está puesta y avisarle de un `seats` viejo; R3 pide que dejen de ser opciones elegibles. | Quitarlas del todo puede dejar sin valor lo que el dueño guardó (Risks) y rompe R2 en silencio, justo lo que C1 prohíbe. |
| `lib/lane-cupo.js` y `scripts/lane-cupo.js`: la rampa y su escritura en la tabla. | R23 pide medir el cupo con llamadas a la vez en rampa y escribirlo en `maxParallel`; `scripts/lane-smoke.js` hace una sola llamada y no lo mide. | Una medición a mano de cada harness no deja rastro ni se repite, y no queda en la tabla (C10). |
| La descalificación de pares dominados usa la tolerancia de 1 punto y compara solo con candidatos de la misma llamada que un reintento no excluyó (D3). | R9 y la evidencia de C5 (Grok `xhigh` no gana a `high` cuando ambos son candidatos). | La lectura estricta deja que Grok `xhigh` gane también cuando `high` es candidato; comparar con todos los pares de la cuota contradice R9, que deja a `xhigh` sin dominar cuando `high` no llega o fue excluido. |
| El campo `maxParallelMeasured` en `config/lanes.json`. | R23: el resultado puede ser «sin tope hasta el techo», y `maxParallel` solo guarda un entero. | Guardar solo el entero hace pasar el techo por un tope hallado, y el dueño no podría distinguirlos. |
| El campo `ownerDecision` de un par y el orden «sin costo, al final de su cuota» (D1, D2). | R8, R10 y R24: Muse, por la decisión del dueño, entra con una cifra que Artificial Analysis no mide a un effort que su CLI tome y sin costo por tarea publicado. | Dejar a Muse fuera contradice la decisión del dueño; inventarle un costo da una cifra falsa que decidiría el orden; una excepción escrita en `choose` por nombre de harness sería una segunda regla (R19). |
