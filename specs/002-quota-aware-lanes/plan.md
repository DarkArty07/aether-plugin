# Plan: lanes por cuota

**Spec:** [spec.md](spec.md) (aprobado por el Juez, revisión 4; enmendado el 2026-10-14 por spec 003, por el Lead para el método ACP de grok, y por el Lead tras la revisión de este plan: R6, R19, A2, A6 y las acciones irreversibles)

## Technical context

- **Stack.** Node.js CommonJS sin dependencias, en `plugins/aether/`. Los tests son `node --test` (`npm test`). Las lanes son solo de Linux.
- **Base.** La rama `feat/grok-lane` ya tiene lo que este plan no rehace:
  - el lector de grok sobre el log (`lib/harness/grok-quota.js`: `readGrokQuota`, `refreshGrokQuota` con `script(1)`, el candado), `aether-lane quota` (`lib/lane-quota.js`), la lane de grok en la tabla y los fixtures `tests/fixtures/grok-billing.jsonl` (commit f06ba00);
  - el índice de modelos en `plugins/aether/config/models/models.json` (spec 003).
- **Dónde está cada cosa hoy.**
  - `lib/lanes.js`: la tabla, `lanesArgs` (una lane por rol y nivel), `usable`, el diario (`appendLog`, `readLog`).
  - `lib/lane-calls.js`: `status`, `start` (lee la cuota de su grupo y devuelve `unavailable: 'quota'`), el runner (lee la cuota al terminar y juzga la llamada).
  - `workflows/run.workflow.js`: `readQuota` (arma `dryGroups` de la ola), `laneFor` (la lane fija del rol y nivel, o nativo), `laneCall`. Un workflow no importa módulos y no usa `Date` ni `Math.random`: el arnés de tests lo prohíbe.
  - `hooks/ops-command.mjs`: la lista cerrada de comandos que el mod corre sin modelo.
  - `lib/report.js`: `summarizeLanes`, `radarOf`.
- **Qué falta, contra R1 a R20.**
  - Candidatos por rol y nivel al compilar (R11), su orden (R9, R10, R12), el recorrido en el workflow (R13), las marcas en disco (R14), el estado (R15), el diario (R16), el reporte y el brief (R18), la documentación (R19), el test del índice (R17).
  - Las brechas del código existente: el refresco de grok por ACP (R3, R5 enmendados), la carpeta de sesión que deja el respaldo (restricción 4 del Lead), la vida de una lectura (C5, A6), un lector que falla como `unknown` (R8), el refresco que solo pide el paso de cuota de la ola (R6), y el `usedPercentAbsent` en estado, diario y reporte (R4).

## Design

Cada decisión dice a qué sirve.

**D1 · La regla de orden es una función pura, y el workflow tiene su copia.** `lib/lane-order.js` da la vista de un grupo (saldo, reinicio, prioridad, usable) y ordena candidatos. `aether-lane status` y `aether-lane quota` la usan. El workflow no tiene módulos, así que escribe la misma regla a mano, como ya hace con `digest` y `canonicalJson`. Un solo archivo de casos (`tests/lane-order-cases.js`, 15 casos) corre contra las dos copias, y así no pueden separarse; incluye el caso que distingue la prioridad del reinicio más cercano (el grupo que más desperdiciaría va primero aunque su reinicio sea más lejano que el de otro). La regla compara los reinicios como cadenas ISO en el workflow (sin `Date`): `status` los da siempre en ISO UTC con milisegundos. Sirve a: C1, C3, R9, R10, R12.

**D2 · Compile guarda todos los candidatos; el workflow acepta las dos formas.** `calls[rol][nivel]` pasa a ser una lista de `{ model, group, harness }` en el orden de `harnesses` y luego el de la tabla. `validLanes` y el workflow leen un objeto suelto (args de antes) como una lista de uno. `idleHarnesses` deja de decir que «un harness anterior toma todas sus llamadas»: ahora todos los harness con modelo son candidatos. Sirve a: C4, R11.

**D3 · El workflow elige con las lecturas de la ola y con la lectura final de cada llamada, sin lanzar procesos.** El paso de cuota de la ola es `aether-lane status <run> --refresh`: la bandera es lo que pide el refresco de grok (R6); un `status` hecho a mano no refresca. Devuelve la vista de cada grupo (prioridad, reinicio, marca, `usedPercentAbsent`). Cada llamada que termina devuelve en su bloque `lane.quota` la vista de su grupo con la lectura final; el workflow la guarda y reordena con ella. Un grupo que llega sin lectura, o un paso que falla, deja los grupos como `unknown`: se prueban después de los que tienen lectura, y `start` decide. Un harness que el paso encuentra no instalado queda fuera. Sirve a: C1, C3, C5, R6, R8, R12, R13.

**D4 · El recorrido de una llamada vive en una función, `laneWalk`.** Toma el primer candidato cuyo pool tiene lugar; si `start` devuelve `unavailable`, por cualquier motivo, `laneCall` libera el lugar y se prueba el siguiente; sin candidato, la llamada va al nativo de su nivel. Es `overflow` solo si se saltó un candidato por pool lleno. Los tres sitios que hoy llaman a `laneFor` (implementer, supervisor, reviewer) usan `laneWalk`. Un fallo del lane después de arrancar sigue yendo al nativo, como hoy. Sirve a: C1, C4, R13, escenarios 3, 4 y 8.

**D5 · Las marcas de agotado son archivos del directorio de datos, una por grupo.** `lib/lane-marks.js`: `markDry`, `liveMark`, `liveMarks`. Un archivo por `(harness, grupo)` escrito de forma atómica evita que dos llamadas se pisen. La marca vence en el reinicio solo cuando la lectura tiene saldo explícito (no `unknown`, no `usedPercentAbsent`) y muestra una ventana bajo la reserva; si no, vence a los 60 minutos y se renueva. Nada la acorta. Nada la quita antes de que venza: ni una lectura con `usedPercentAbsent` ni una con saldo (el reinicio temprano de un plan se pierde; es una pérdida pequeña y la elección contraria es difícil de probar). La escribe `start` solo cuando una lectura **muestra** el grupo bajo la reserva (una lectura que falla lo deja `unknown` y la llamada arranca: R8), y el runner cuando la llamada termina con motivo `quota`; `status` y `quota` las muestran; `start` las respeta sin renovarlas. Sirve a: C1, C3, R8, R10, R14.

**D6 · Una lectura que lanza un proceso se guarda mientras dura su vida.** `lib/lane-readings.js`: `readGroups(adapter, …)` guarda en el directorio de datos la lectura de un adaptador con `quotaCost: 'process'` (agy) por `quotaLifeMinutes` (10), y no la guarda para el que solo lee un archivo (grok). `status` y `start` aceptan la lectura guardada; el runner al terminar y `aether-lane quota` leen de nuevo (`fresh`) y renuevan la guardada. La vida y el largo de la marca vienen de la tabla (`quotaLifeMinutes` por harness, `dryMarkMinutes` arriba); 0 apaga la guarda. Los campos de la tabla y la lectura guardada son la misma tarea (3), de la que dependen las que los leen. Sirve a: C5, A6.

**D7 · Una sola vista de grupo, para `quota`, `status`, el runner y el workflow.** `lane-quota.js` envuelve `lane-order.groupView` con la etiqueta, la hora local y la fuente. `harnessView` la aplica a un harness; `status` es esa vista más la marca y el orden por rol y nivel. El runner devuelve un resumen de la misma vista como `lane.quota`. Una lectura que falla deja cada grupo del harness en `unknown`, con su error. Sirve a: C2, C6, R7, R8, R15.

**D8 · El `creditUsagePercent` ausente se interpreta en un solo lugar (A3).** `grok-quota.js` tiene la constante `ABSENT_USED_PERCENT = 0`, y `readingOf` la recibe como parámetro. Con `null`, la ventana queda con `remaining: null` y el reinicio conocido. `lane-order` trata cualquier ventana sin saldo como grupo `unknown` con su reinicio a la vista, y `readingUsable` lo da por usable. Cambiar la lectura es cambiar esa constante, y hay un test de cada lado. Sirve a: C1, R4, A3.

**D9 · El refresco de grok va primero por ACP, y abrir la interfaz queda de respaldo.** Un módulo nuevo, `lib/harness/grok-acp.js`, arranca `grok agent --no-leader stdio` en un directorio temporal vacío con `laneEnv` más `GROK_DISABLE_AUTOUPDATER=1`, manda `initialize` y `_x.ai/billing`, toma `result.config`, mata el grupo de procesos y borra el directorio (10 s como máximo). `refreshGrokQuota` lo llama dentro del candado; la lectura que devuelve sale con `source.method: 'acp'`. Si no hay respuesta, error o `config`, abre la interfaz como hasta ahora, y al terminar borra la carpeta de sesión de su directorio temporal y solo esa. El candado, y quien lo espera, duran `acpTimeoutMs + timeoutMs` (hasta 30 s): un refresco que llega mientras otro cae al respaldo lo espera completo. La petición deja además su línea en el log de grok, y así las lecturas siguientes (`status`, `start`) la ven. `--no-leader` evita que el agente se conecte a un proceso compartido que el grupo no mataría. Sirve a: C2, C3, C5, R3, R5, restricción 4.

**D10 · Cada decisión queda en el diario de lanes con un comando nuevo, `aether-lane choice`, y ninguna llamada espera su registro.** El workflow no tiene sistema de archivos. Después de recorrer los candidatos de una llamada (y también cuando va al nativo), inicia, **sin esperarlo**, `aether-lane choice <run> <llamada> --role … --tier … --effort … --pick <native|harness:modelo> --order <harness:modelo:prioridad|unknown|excluded:resultado[:absent]/…>`, guarda su promesa, y espera todas antes de devolver el resultado de la corrida y de barrer. El comando escribe una entrada `kind: 'choice'` con los candidatos, la prioridad de cada uno y la razón, que escribe `lib/lane-choice.js`. La lista cerrada de `hooks/ops-command.mjs` gana esa forma y la de `status <run> --refresh`, con cada argumento verificado. Un `choice` que falla no cambia nada en la corrida. Sirve a: C5, C6, R16.

**D11 · El reporte da el saldo por grupo y las decisiones.** `summarizeLanes` añade a cada grupo `balance` (saldo por ventana al empezar y al terminar con su reinicio, el próximo reinicio y `usedPercentAbsent`); `laneReport` añade `run.choices`; `radar.delegation.byGroup` da las llamadas y el saldo por grupo para el brief. Sirve a: C6, R18.

**D12 · El test del índice (R17) usa una función `problems(tabla, índice)`.** Cubre los modelos de la tabla con rol del swarm (vigente, ofrecido, con perfil, esfuerzos que el harness toma, `replaces` igual) y los de los asientos (en uso o `notOffered`, con perfil); se prueba con entradas inventadas y con los archivos reales. Sirve a: C4, R17.

**D13 · La documentación y la decisión A49 cierran el trabajo.** README (orden, marcas, lecturas, cómo agregar un harness, la cuota de grok se lee por ACP con su interfaz de respaldo, quién refresca), el skill del swarm, la línea Delegación del brief, y `docs/decisions.md` (A49; A20, A21 y A37 dicen que A49 los actualiza). Sirve a: C6, R18, R19.

## Files

| Archivo | Qué pasa | Tarea |
|---|---|---|
| `plugins/aether/lib/lane-order.js` | nuevo: la regla de orden, la vista de un grupo, `readingUsable` | 1 |
| `tests/lane-order.test.js`, `tests/lane-order-cases.js` | nuevos: los 15 casos de la regla, compartidos con el workflow | 1 |
| `plugins/aether/lib/lane-marks.js`, `tests/lane-marks.test.js` | nuevos: marcas de agotado en disco | 2 |
| `plugins/aether/lib/lane-readings.js`, `tests/lane-readings.test.js` | nuevos: la lectura guardada por su vida | 3 |
| `plugins/aether/lib/harness/agy.js` | `quotaCost: 'process'` | 3 |
| `plugins/aether/lib/lanes.js`, `plugins/aether/config/lanes.json`, `tests/lanes.test.js` | `quotaLifeMinutes` y `dryMarkMinutes` en la tabla y su validación | 3 |
| `plugins/aether/lib/harness/grok-acp.js`, `tests/grok-acp.test.js`, `tests/fixtures/grok-acp-billing.jsonl`, `tests/fixtures/fake-grok-acp.js` | nuevos: la petición `_x.ai/billing` por ACP | 4 |
| `tests/lane-table-index.test.js` | nuevo: R17 | 5 |
| `plugins/aether/lib/report.js`, `tests/report.test.js` | `balance`, `choices`, `byGroup` | 6 |
| `plugins/aether/lib/lane-choice.js`, `plugins/aether/hooks/ops-command.mjs`, `tests/lane-choice.test.js`, `tests/ops-command-lanes.test.js` | nuevos y ampliado: la entrada `choice`, y sus formas y la de `status --refresh` en la lista cerrada del mod | 7 |
| `plugins/aether/lib/lanes.js`, `tests/lanes.test.js` | compile guarda candidatos; `usable` usa la regla de `lane-order` | 8 |
| `plugins/aether/lib/harness/grok-quota.js`, `tests/grok-quota.test.js` | `ABSENT_USED_PERCENT`, ACP primero, respaldo que borra su carpeta de sesión, el candado que espera todo | 9 |
| `plugins/aether/lib/lane-quota.js`, `tests/lane-quota.test.js`, `tests/aether-lane.test.js`, `tests/harness-agy-usage.test.js`, `tests/fixtures/agy-usage-2026-10-14.json` | vista única, marcas, lectura que falla, `refreshStale`, fuente `acp`; el fixture real de agy (R20) | 10 |
| `plugins/aether/lib/lane-calls.js`, `tests/fixtures/fake-agy.js`, `tests/lane-start-marks.test.js` | `start` y el runner: marcas, lectura guardada, `lane.quota` | 11 |
| `plugins/aether/lib/lane-calls.js`, `plugins/aether/bin/aether-lane`, `tests/lane-status.test.js`, `tests/aether-lane.test.js` | `status` con orden y marcas, `status --refresh` como paso de cuota de la ola, el verbo `choice` | 12 |
| `plugins/aether/workflows/run.workflow.js`, `tests/workflow-order.test.js`, `tests/workflow-lanes.test.js`, `tests/workflow-harness.js`, `tests/ops-command.test.js` | `laneWalk`, la copia de la regla, `choice` sin esperarlo | 13 |
| `README.md`, `plugins/aether/skills/swarm/SKILL.md`, `plugins/aether/skills/using-aether/SKILL.md`, `tests/lanes-docs.test.js`, `tests/roles.test.js` | documentación de lanes | 14 |
| `docs/decisions.md`, `tests/lanes-decisions.test.js` | A49 | 15 |

Orden de construcción: ola 1 (tareas 1 a 7, hojas independientes), ola 2 (8 a 11), ola 3 (12), ola 4 (13 a 15).

## Verification

Comando: `npm test` (`node --test "tests/*.test.js"`). Cada tarea escribe sus tests primero y deja verde la suite completa. `npm run test:mod` y `npm run validate` los corre el Lead al terminar, porque tocan el mod (`ops-command.mjs`) y los manifiestos.

| Criterio | Qué lo prueba |
|---|---|
| C1 Delegación | `tests/lane-order.test.js` y `tests/workflow-order.test.js` corren los mismos 15 casos (las lecturas del 2026-10-14: haiku va a Grok 4.7 y no a Gemini; sonnet va al nativo; y el grupo que más desperdiciaría va primero aunque resetee después); `tests/lane-quota.test.js` repite el orden con los fixtures guardados de agy (la captura real) y de grok |
| C2 Autónomo | `tests/harness-agy-usage.test.js` (captura real), `tests/grok-quota.test.js` (fixtures de 1.0.13 y 1.0.41), `tests/grok-acp.test.js` (la respuesta guardada de 1.0.52), `tests/lane-quota.test.js`, `tests/lane-status.test.js` |
| C3 Robusto y sostenible | un harness sin lector entra en el orden sin tocar la regla (caso de codex); un test por forma de falla: lectura que falla (`lane-quota`, `lane-status`, `lane-start-marks`: la llamada arranca y no deja marca), arranque que falla (`workflow-order`), ACP sin respuesta, con error y sin `config` (`grok-acp`, `grok-quota`) |
| C4 Sin bajar la calidad | `tests/lane-table-index.test.js` (R17); `tests/workflow-order.test.js` (sin candidato del nivel, o con esfuerzo `max`, la llamada es nativa y no se registra elección) |
| C5 Rápido | `tests/lane-readings.test.js` y `tests/lane-start-marks.test.js` (con reloj simulado, y con el contador de `/usage`, un grupo no se lee dos veces dentro de su vida); `tests/workflow-order.test.js` (el paso de cuota no corre con una llamada en un pool; la elección no lee nada; ninguna llamada espera el registro de su elección); `tests/lane-status.test.js` (solo `--refresh` refresca) |
| C6 Visible | `tests/lane-quota.test.js`, `tests/lane-status.test.js` (estado, marcas, orden), `tests/lane-choice.test.js` y `tests/workflow-order.test.js` (diario), `tests/report.test.js` (saldo, decisiones), `tests/lanes-docs.test.js` y `tests/lanes-decisions.test.js` (brief y documentos) |

## Assumptions

- **P1 · El «diario de lanes» es el log de lanes** (`<datos>/lanes/<sesión>.jsonl`). El workflow registra cada decisión con un comando nuevo, `aether-lane choice`, que se suma a la lista cerrada del mod (el Juez aceptó esta elección). La alternativa, guardar las decisiones solo en el resultado del workflow, no cumple R16 al pie de la letra. Costo: un proceso por llamada con candidatos (el comando no lee cuota; ninguna llamada lo espera, y la corrida espera todos antes de devolver su resultado) y, con la opción `ops` apagada, un agente Haiku más por decisión. Reversible: quitar la llamada a `logChoice` del workflow.
- **P2 · El paso de cuota de la ola es `aether-lane status <run> --refresh`**, y solo con esa bandera `status` refresca la lectura de grok cuando es vieja (más que su vida de 30 minutos), como pide R6 enmendado; la lista cerrada del mod gana esa forma, y `status <run>` sin bandera sigue aceptándose. Un `status` hecho a mano no refresca y no tarda.
- **P3 · `aether-lane quota` siempre lee de nuevo; `status` y `start` aceptan la lectura guardada.** `quota` es una pregunta deliberada del dueño; el runner también lee de nuevo al terminar (R13, `quotaAfter`).
- **P4 · Una marca solo vence por tiempo.** No hay levantamiento anticipado por una lectura. R14 dice qué lecturas no la quitan; ninguna la quita.
- **P5 · Una lectura que falla, o que no trae el grupo, lo deja sin lectura (R8) y no deja marca:** `start` arranca la llamada, y la llamada fallida va al nativo. Un harness ausente de la lectura de la ola, o un paso de cuota que falla, deja sus grupos sin lectura (se prueban, después de los que tienen). Un harness que `status` dice no instalado queda fuera. Antes, todos esos casos dejaban todo seco o rechazaban el arranque; R8 pide `unknown`.
- **P6 · `overflow` cuenta cuando la llamada fue al nativo y se saltó algún candidato por pool lleno.**
- **P7 · La petición ACP lleva `--no-leader`** (`grok agent --no-leader stdio`, comprobado con `--help`) y los parámetros `{ protocolVersion: 1, clientCapabilities: {} }` para `initialize` y `{}` para `_x.ai/billing`, como se probó el 2026-10-14 con grok 1.0.52. La lectura que da el refresco sale de la respuesta (fuente `acp`, con la hora de la respuesta); las lecturas siguientes (`status`, `start`) salen de la línea `billing: fetched credits config` que la petición también deja en el log de grok. El fixture de respuesta guarda las líneas reales de ACP (con el `initialize` recortado).
- **P8 · El fixture de `agy /usage` es la captura real del 2026-10-14** (sin llamada a un modelo: estado `SUCCESS`, `num_turns` 0, cero tokens), con su texto exacto en la Task 10; los valores de los tests salen de ella.
- **P9 · La decisión nueva es A49** (A48 es la de spec 003). No se sube la versión del plugin: es del lanzamiento.
- **P10 · `choice` se registra cuando termina la llamada**, no cuando arranca: hasta entonces el workflow no sabe qué candidato la tomó. No bloquea: se inicia sin esperarlo.
- **P11 · `dryMarkMinutes` (60) y `quotaLifeMinutes` (10 agy, 30 grok) están en la tabla** (A6: «reversible en la tabla»); el mínimo de una hora de la prioridad es una constante.
- **P12 · R17 lee `plugins/aether/config/models/models.json`**, que ya está en la base (spec 003). Mira solo los harness agy y grok de la tabla y los `designSeats`.

## Risks

- **El workflow no puede usar `Date`.** El orden por reinicio compara cadenas ISO con milisegundos; el test de casos comparte `tests/lane-order-cases.js` con la copia de lib. Un reinicio que no sea ISO va al final del desempate.
- **Una forma nueva en la lista cerrada del mod es superficie de seguridad.** Las formas `choice` y `status <run> --refresh` solo aceptan fichas de `[A-Za-z0-9._:/-]`, con las banderas en ese orden y cada valor contra su expresión; el test lista las variantes rechazadas.
- **Los tests de varias suites fijan el texto de los documentos** (`roles.test.js`); la tarea 14 lo cambia junto con el texto. `launcher.test.js` ya acepta que A49 siga a A48.
- **Un registro de `choice` sin esperar** puede quedar en vuelo cuando una corrida falla; el `finally` los espera antes de barrer. Un registro que falla se anota y no cambia nada.
- **Una lectura fría y varios `start` a la vez** pueden lanzar `/usage` más de una vez (no hay candado). Es raro y solo cuesta una lectura.
- **La petición `_x.ai/billing` no la anuncia `initialize`.** Si una versión de grok la quita, el refresco pasa al respaldo; el reporte dice qué método respondió.
- **Una tarea grande agota al implementador (issue 003).** Las 15 tareas tienen a lo sumo 6 rutas propias; la más grande en trabajo, la 13 (workflow), va en Opus.
- **Lo irreversible sigue siendo del dueño:** la llamada real de validación de grok (`node scripts/lane-smoke.js grok grok-4.7`), el push, el pull request y el merge a main. Este plan no los hace. La única acción irreversible que hace el código es la que el spec lista: el respaldo de grok borra la carpeta de sesión de su propio directorio temporal, y solo esa (Task 9).
- **A3 sigue abierto** hasta una lectura de grok con uso semanal de al menos 1%. El plan lo deja en un solo lugar (D8).
