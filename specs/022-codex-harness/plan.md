# Codex como harness de trabajo (0.27.0): plan

- **Spec:** [spec.md](spec.md) (criterios C1 a C12, requisitos R1 a R26). Lo medido: [evidence/README.md](evidence/README.md). El método de elegir está en la skill `.claude/skills/new-harness/SKILL.md`.
- **Rama:** `feat/codex-harness` (worktree `.worktrees/codex-harness`). No hay merge, push, tag ni `claude plugin update`: son del dueño.

## Technical context

- **Pila.** Node.js 22, CommonJS, sin dependencias de npm; los `.mjs` del mod son ESM. Pruebas con `node:test`: `npm test` (`node --test "tests/*.test.js"`), `npm run test:mod` y `npm run validate`; `npm run check` corre las tres.
- **Lo que ya existe y se reutiliza.** `lib/harness/codex.js` es un adaptador sin usar (línea de órdenes de `codex exec`, lectura de eventos de Spec Kit, cuota siempre desconocida); `lib/harness/index.js` ya lo registra; `plugin.json` ya acepta `codex` en `harnesses`; `config/lanes.json` ya tiene la entrada `codex` (grupo `codex`, sin modelos); `hooks/panel-view.mjs` ya lo lista. La maquinaria de cuota, marcas, orden y reserva es la de agy: `lib/lane-readings.js` guarda la lectura de un adaptador con `quotaCost: 'process'` durante `quotaLifeMinutes`; `lib/lane-calls.js` (`judge`) y `lib/delegate-calls.js` convierten un fallo en «quota» cuando la lectura posterior muestra el grupo bajo la reserva; `lib/lane-marks.js` confirma la marca hasta el reinicio de esa lectura y la levanta (`liftIfHealthy`) cuando una lectura nueva sana la contradice; `lib/superdelegation.js` (`choose`) es la regla de los escalones; `lib/router-*.js` es el router de delegados.
- **Estructura que se toca.** `plugins/aether/lib/harness/` (adaptador y lector de cuota), `plugins/aether/config/` (`pairs.json`, `lanes.json`, `prices.json`, `models/*.json`), las listas fijas de `lib/` y del mod, `scripts/` (`build-models-index.js`, `lane-smoke.js`), `docs/`, `site/`, dos skills del repositorio (`.claude/skills/`) y `tests/`.
- **No hay constitución** (`.specify/memory/constitution.md` no existe): el Gate solo lleva las dos comprobaciones generales.

## Gate

| Comprobación | Resultado |
|---|---|
| Nada especulativo ni para una necesidad hipotética. | Pasa. Cada pieza sirve a un requisito de la spec (la columna «Serves» de cada decisión). Lo que Codex trae de más (leer otros cupos de `rateLimitsByLimitId`, Codex como asiento de diseño, refrescar toda la tabla) no se construye: está en `## Proposals`. |
| Ninguna abstracción, opción, archivo ni dependencia que ningún requisito pida. | Pasa con cuatro excepciones justificadas en `## Complexity`: los campos `checked` y `costEstimate` de una fila de pares (R12, R13), el lector de cuota que corre en un proceso hijo (R9), la clave `excludedEfforts` de `harness-models.json` (R16) y el ayudante de pruebas `tests/harness-literals.js` (R3, R23). Ninguna dependencia nueva. |

## Design

El Lead hace dos tandas de llamadas reales de pago (spec, `## Irreversible actions`; cubiertas por la concesión `paid-call` del 2026-10-27, A6 de la spec; se comprueba con `aether-autonomy check paid-call` antes de la primera), una **antes** del enjambre y otra **después**. Las construye el enjambre (`tasks.md`, 12 tareas); ninguna tarea posee archivos bajo `specs/`.

### D0. El orden de trabajo (Lead, enjambre, Lead)

- **Paso 0 (Lead, antes de `/aether:run`).** Con un guion suyo en `evidence/` (como `codex-rate-limits-probe.js`: lanza `codex exec` en un directorio vacío, con el entorno de `laneEnv`, y guarda la salida cruda y la cuota de antes y de después) hace pocas llamadas mínimas (Luna y Terra, un esfuerzo bajo, salvo la que mide `max`) y deja en `evidence/` lo que la spec manda medir: (a) los eventos reales de `codex exec --json` (`codex-exec-events.jsonl`: el nombre de cada evento, dónde está la respuesta, el uso y un fallo); (b) si Codex acepta el esfuerzo `max` (R6); (c) si `--disable hooks` apaga los hooks del dueño y si `-c project_doc_max_bytes=0` quita su `AGENTS.md`, por la comparación de `usage.input_tokens` de C7 (las dos llamadas con `--ephemeral`, `--ignore-user-config` y `--ignore-rules`, una con la candidata y otra sin ella), más la lista de `~/.codex/sessions` y `history*` antes y después; (d) si `-c approval_policy=never` y `--sandbox workspace-write` corren en esta máquina (WSL) sin pedir nada. Nada se escribe en `~/.codex` ni se copia ni se enlaza `auth.json`.
- **Entre el paso 0 y el enjambre.** El Lead corrige en `tasks.md` solo lo que el paso 0 contradiga: los nombres de evento de la tarea 1 (sección *Interfaces* y la prueba del archivo de eventos reales), las tres opciones candidatas (`--disable hooks`, `-c project_doc_max_bytes=0`, `-c approval_policy=never`) y, si Codex rechaza `max`, quita de las tareas 3, 4 y 5 el par `Sol max` y pone Sol xhigh como escalón de Opus high (R6, R17). Si el límite de `AGENTS.md` o de hooks no tiene opción, se escribe medido en `evidence/` y la tarea 10 lo recoge en `docs/guide/lanes.md` (R19, último párrafo). Lo que el paso 0 no contradice queda como está.
- **Paso N (Lead, después de que el enjambre une).** Llamadas reales a Sol, Terra y Luna a través de Aether (`node scripts/lane-smoke.js codex <modelo> --effort <nivel> --raw <archivo>`, y una unidad o un delegado con `aether-lane`), con una respuesta estructurada, `aether-lane quota codex` antes y después de cada una, y el registro en `evidence/`. Si una llamada real contradice lo construido, el Lead abre una corrección (una tarea nueva por `/aether:swarm`, no un parche suyo sobre archivos de una tarea ya unida). Después escribe la cifra de lo gastado y la lectura real de C4 en el handoff.
- **Serves:** C9 (R21, R22), C7 (R19), C2 (R6).

### D1. Una sola ruta de llamada: `codex exec` en el adaptador existente

`createCodex` sigue siendo el único adaptador. Su `argv` (lo fija la tarea 1; el paso 0 puede ajustar las tres últimas opciones) es: `codex exec <prompt> --model <modelo> -c model_reasoning_effort=<nivel> --json --sandbox workspace-write --ephemeral --ignore-user-config --ignore-rules --disable hooks -c project_doc_max_bytes=0 -c approval_policy=never [--output-schema <archivo>]`. El proceso corre con el `cwd` del worktree de la unidad o de la tarea, como el de los otros harness, y con el entorno de `laneEnv` (que ya deja fuera todo nombre con `TOKEN`, `KEY` o `SECRET`, `OPENAI_API_KEY` incluido). El adaptador no conoce el rol, así que el sandbox es `workspace-write` para todos (el supervisor, el revisor y el delegado de lectura se comprueban después con las comprobaciones de «worktree sin cambios» que ya existen). Un esquema pedido pasa por `--output-schema` con la copia estricta de `strictSchema` (el archivo del llamador, escrito en su lugar, como hace Muse), y `schemaInPrompt` pasa a `false`; el ejecutor ya valida la respuesta contra el esquema del rol y la rechaza como fallo.
**Serves:** C2 (R4, R5, R7), C7 (R19).

### D2. El fallo de cuota es un dato, nunca un texto

`parseRun` (`lib/harness/structured.js`) reconoce hoy una cuota por una línea de texto (`QUOTA_LINE`). Para Codex eso se apaga con una opción nueva `quotaByText` (verdadera por defecto; el resto de los harness no cambia). Un `codex exec` que falla sin juzgarse por texto da `exit <n>[: <primera línea de stderr>]`, `no result`, `no structured output` o `missing <campo>`; el que decide si fue cuota es el ejecutor, con la lectura gratis posterior (D3): si la ventana de 5 horas o la semanal quedó bajo la reserva, `judge` (`lib/lane-calls.js`) y `delegate-calls.js` ya dan estado «quota», `markDry` deja una marca confirmada hasta el reinicio de esa lectura y la ruta de siempre pasa al siguiente. Si la lectura no la muestra llena, es un fallo común y corre en el agente nativo. R11 pedía además «si `codex exec --json` trae un dato del fallo»: el paso 0 lo mide; si existe, el adaptador lo usa para la razón (`quota: codex <ventana>`); si no, queda la lectura. Esta decisión no cambia la maquinaria de marcas.
**Serves:** C4 (R11), C3 (R8).

### D3. La cuota: una lectura gratis, en un proceso hijo, con la forma de agy

`lib/harness/codex-quota.js` lee `account/rateLimits/read` de `codex app-server` (stdio, líneas JSON: `initialize`, `initialized`, la lectura; la misma secuencia que `evidence/codex-rate-limits-probe.js`). `lane-readings.readGroups` llama `adapter.quota()` de forma **síncrona**, y el protocolo es asíncrono, así que el módulo se ejecuta a sí mismo como proceso hijo con `spawnSync(process.execPath, [__filename, <comando>], { timeout })` y recibe una línea JSON (el pie del módulo `if (require.main === module)`). El resultado se vuelve `{ groups: { <clave>: { windows: { '5h': { remaining, resetsAt }, weekly: { remaining, resetsAt } } } } }`: `remaining = (100 - usedPercent) / 100`, `resetsAt` es el ISO de los segundos Unix, una ventana de 300 minutos es `5h` y una de 10080 es `weekly` (cualquier otra se nombra `<n>m`), y el límite es `rateLimitsByLimitId.codex` cuando existe y si no `rateLimits`. `ordinaryUsageAllowed === false` pone ambas ventanas en 0 (es un dato del propio servidor). La lectura no lleva `source`: `lane-quota` la presenta como «leída de la CLI en `readAt`», como a agy. El adaptador declara `quotaCost: 'process'`, así que `lane-readings` la guarda `quotaLifeMinutes` (10, el valor de la entrada `codex` de `lanes.json`, A11 de la spec) y una lectura más vieja que su vida o con una ventana ya reiniciada no decide. Si el servidor no responde o falla, `quota()` lanza y la vista deja el grupo desconocido con el error (como agy): se usa hasta que una llamada falle. El orden y la reserva son los de siempre (`lib/lane-order.js`, `reserve` de la tabla) y no hay regla propia (R10). Ningún código abre `auth.json` ni lee `OPENAI_API_KEY`.
**Serves:** C4 (R9, R10, R11).

### D4. Los datos: Sol, Terra y Luna, en los cinco esfuerzos, con la regla del modelo de arriba

Tres tareas que solo se ponen verdes juntas (`Merges with`): `config/pairs.json` (tarea 3), el índice de modelos (tarea 4: `harness-models.json`, `profiles.json`, `prices.json`, `models.json`, la parte generada de `docs/models/README.md`) y `config/lanes.json` (tarea 5), porque `tests/lane-table-index.test.js` exige que los tres concuerden.
- **Pares.** 15 filas `codex/<modelo>@<esfuerzo>` con las cifras de AA del 2026-10-29 (inteligencia, velocidad y primer token de `evidence/aa-api-2026-10-29.json`; `lib/pairs.js` no tiene campo de Terminal-Bench y no se le añade: la cifra de Terminal-Bench de cada esfuerzo vive en los `scores` de `models.json` (tarea 4, 15 valores que `tests/codex-models.test.js` fija contra `evidence/README.md` §2) y la del esfuerzo `max` también en `aa.terminalBench` de `lanes.json` (tarea 5)), grupo `codex`, familia el modelo, y los campos nuevos `checked: "2026-10-29"` y `costEstimate` (el método de D5). Las demás filas no se tocan (supuesto A1 de la spec; la diferencia medida es P1).
- **Modelos de `harness-models.json`.** La entrada `codex` se captura con fecha 2026-10-29 de `codex-models-2026-10-29.json`, con los diez modelos que Codex lista: Sol, Terra y Luna entran; `gpt-6-astra` (con las palabras del dueño «no lo vamos a usar hasta que salga astra 6.1» y GPT-6.1 Astra como el modelo que reabre la pregunta, igual que Fable 5.1 hasta Fable 5.5, A43), `gpt-6-sol`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-reserve` y `codex-auto-review` llevan `excluded` con su razón; el esfuerzo `ultra` queda en la clave nueva `excludedEfforts` de la entrada, con la razón (AA no lo mide). Los esfuerzos de la entrada son `low, medium, high, xhigh, max`.
- **models.json y la parte generada de `docs/models/README.md`.** Se generan con el script (`--from specs/022-codex-harness/evidence/aa-api-2026-10-29.json`, `--harnesses claude,agy,codex,grok,muse`, `--out` y `--docs` a un directorio temporal) y se **empalman** en los archivos del repositorio solo los registros de Codex y la fecha `listedOn.codex`, sin tocar ninguno de los otros (regenerar todo con la API de hoy re-mediría Haiku, Sonnet, Opus, Grok y Muse y rompería la concordancia con `pairs.json`: es P1). `DEFAULT_HARNESSES` del script pasa a incluir `codex`.
- **Precios y contexto.** `config/prices.json`: Sol 2/10, Terra 1/5, Luna 0.1/0.5 por millón (entrada/salida); `cacheRead` = 10 % de la entrada y `cacheWrite5m`/`cacheWrite1h` = la entrada (supuesto A-P3 de abajo). Contexto de los perfiles: Sol 500 000, Terra 500 000, Luna 272 000 (`codex-models-2026-10-29.json`).
- **Lanes.** `config/lanes.json` `codex.models`: Sol `implementer`, `supervisor`, `reviewer`; Terra `implementer`, `supervisor`; Luna `implementer`; ninguno de Judge, Writer ni Examiner (R15, A3 de la spec).
**Serves:** C5 (R12, R14, R15, R16).

### D5. El costo por tarea: la fórmula de A96, escrita completa

AA no da por API el costo por tarea de ningún par de Codex, pero **midió dos** en el gráfico del dueño del 2026-10-26: Sol max US$ 0.724 y Luna max US$ 0.068 (`evidence/aa-cost-per-task-2026-10-26.md`). Esas dos filas llevan el costo medido tal cual y **sin** `costEstimate`; las otras 13 llevan una **estimación** marcada en `costEstimate`. El método de A96 es un ancla medida más la razón entre esfuerzos de las curvas medidas; aquí va completo y una prueba lo recalcula:
1. *Entradas de la curva.* Las filas de `config/pairs.json` con `harness` `claude` o `grok` y un `costPerTaskUsd` numérico (Haiku, Sonnet y Opus nativos y Grok 4.7; las filas de `agy` repiten las de Claude y no se cuentan) y el precio de **salida** por millón de `config/prices.json` de su modelo (`haiku` 0.5, `sonnet` 10, `opus` 20, `grok-4.7` 6).
2. *Unidades.* Para cada fila, `u = costPerTaskUsd / precioSalida`: los millones de tokens de salida que equivalen a su costo por tarea.
3. *Curva.* Para cada esfuerzo `e` (`low`, `medium`, `high`, `xhigh`, `max`), `U(e)` es la **mediana** de `u` de las filas de ese esfuerzo (con un número par, la media de las dos centrales). Hoy: low 0.0375, medium 0.067, high 0.1255, xhigh 0.2205, max 0.42.
4. *Ancla de cada modelo.* `ancla(Sol) = 0.724` y `ancla(Luna) = 0.068` (medidas, esfuerzo `max`); `ancla(Terra) = ancla(Sol) * precioSalida(Terra) / precioSalida(Sol)` (de `config/prices.json`, Sol 10 y Terra 5) = 0.362, porque AA no midió a Terra (salió el 2026-10-26) y se supone que gasta los mismos tokens por tarea que Sol (supuesto A-P6).
5. *Costo.* Para un par de Codex de modelo `m` y esfuerzo `e`: `Math.round(ancla(m) * U(e) / U(max) * 1000) / 1000` (doble de JavaScript, en ese orden). Resultado (low, medium, high, xhigh, max): Sol 0.065, 0.115, 0.216, 0.38, **0.724**; Terra 0.032, 0.058, 0.108, 0.19, 0.362; Luna 0.006, 0.011, 0.02, 0.036, **0.068** (en negrita, los medidos).
Los puntos de las filas no entran en la fórmula: el costo mide cuánta salida gasta una tarea a ese esfuerzo; los puntos son los de AA de cada fila de Codex. La primera versión de este plan usaba la curva sin ancla (`U(e) * precioSalida(m)`) porque la evidencia no traía los costos medidos; daba Sol max 4.2 contra los 0.724 que AA midió, y por eso la regla mandaba dos escalones a agy. Las estimaciones no se ajustan a mano para que pase R17.
**Serves:** C5 (R13).

### D6. Los escalones: lo que la regla elige, fijado por una prueba

Con `choose` (`lib/superdelegation.js`) y la tabla entregada la regla da (calculado con los costos de D5 y el mismo reinicio para todos los cupos; el Lead lo recalculó con un guion suyo antes de editar este plan):

| Referencia nativa (puntos pedidos, mínimo) | Solo Codex abierto | Los cuatro harness abiertos |
|---|---|---|
| Haiku high (37.8; 36.8) | Terra medium (0.058) | Terra medium (0.058) |
| Haiku xhigh, la corrección (41.2; 40.2) | **Terra high** (0.108) | **Terra high** (0.108), contra `agy/claude-sonnet-5-5@medium` (0.48) |
| Sonnet high (46.8; 45.8) | Sol medium (0.115) | Sol medium (0.115) |
| Opus high (53.6; 52.6) | **Sol max** (0.724, medido) | **Sol max** (0.724), contra `agy/claude-opus-5-5@high` (1.82) |

La prueba fija las dos columnas, que hoy coinciden: la de «solo Codex» es C6 y R17 tal como los escribió el dueño, y la de «los cuatro» es la elección real cuando otro harness puede ganar por costo (R17, segunda frase). Con la curva sin ancla de la primera versión (Sol max 4.2) las dos columnas diferían en dos escalones; el brief final dice qué ancla se usó y que el costo de Terra es un supuesto. Luna max (27.8) queda bajo el mínimo de cualquier referencia nativa (el más bajo es Haiku low, 28.5) y la prueba lo fija (R18).
**Serves:** C6 (R17, R18).

### D7. Los delegados cuentan a Codex

Cinco listas fijas ganan `codex` con el orden del registro: `EXTERNAL` (`lib/router-quota.js`), `RENEWABLE` (`lib/router-renewal.js`), `DELEGATE_HARNESSES` (`lib/router-pick.js`), `HARNESSES` (`lib/delegate-calls.js`) y `ALLOWED_HARNESSES` (`lib/lane-delegate.js`), más la línea de uso y el mensaje de `renew` en `bin/aether-delegate` y de `renewReading`, y los comentarios que decían «codex and cursor cannot». `REFRESHABLE` de `lib/lane-pick.js` (los que tienen un refresher que lee con una llamada) **no** incluye a Codex: su lectura es gratis y la toma el adaptador. Cursor sigue fuera. Un delegado de lectura y uno de edición caen en Codex por el orden de cuota, y con Codex sin cuota, sin sesión o caído caen en el siguiente o en el agente nativo con la ruta de siempre (R8).
**Serves:** C8 (R3, R20), C3 (R8).

### D8. El fallback es el que ya existe, y una prueba punta a punta lo fija

No hay código nuevo para el fallback: un `codex` que no está, que no tiene sesión, con la cuota agotada o que falla a mitad da una llamada fallida o `unavailable`, y `lib/lane-calls.js`, `lib/delegate-calls.js` y la ruta del enjambre la reintentan con el siguiente par y al final en el agente nativo, sin pregunta (R8), con el fallo y su causa en el registro. La tarea 8 lo fija con un `codex` simulado en cuatro fallos (no instalado, sin sesión, cuota agotada por la lectura, caída a mitad de llamada), con una unidad del swarm y con un delegado de lectura y uno de edición.
**Serves:** C3 (R7, R8), C2, C8.

### D9. Lo que el panel y los avisos ya hacen

El panel (`hooks/panel-view.mjs`) y `idleHarnesses` ya listan a Codex y ya piden `aether-lane quota`; con D3 esa lectura trae las dos ventanas en lugar de «desconocido». No se cambia el panel: la tarea 9 solo agrega la prueba de detección (instalado y versión con un `codex` simulado, y no instalado sin él) y quita de la descripción de `harnesses` la frase «Codex … not tested with a real account» (queda dicha solo de Cursor).
**Serves:** C1 (R1, R2).

### D10. Las llamadas reales de la herramienta de humo

`scripts/lane-smoke.js` hoy solo acepta `--effort low|medium|high` y no guarda la salida cruda. La tarea 7 le suma los cinco esfuerzos y `--raw <archivo>` (la salida cruda de stdout y stderr, para `evidence/`); sin esas dos cosas el paso N no puede confirmar `max` ni dejar los eventos reales.
**Serves:** C9 (R21, R6).

### D11. El método queda en skills y una prueba lo ata al árbol

`.claude/skills/new-harness/SKILL.md` (ya existe un primer texto, commit `80fb2a9`) se completa: el orden de la sección 2 de la tarjeta, los errores de Muse, la descripción que la carga cuando se pide un harness y el paso 9 con **todas** las listas, nombradas por archivo e identificador. `.claude/skills/artificial-analysis/SKILL.md` (está en el repositorio principal sin seguimiento de git: se **lee** de ahí, se copia al worktree, se edita la copia y se añade a la rama; el original no se toca, A10 de la spec) recoge la regla del modelo de arriba y la trampa de las escalas. La prueba `tests/new-harness-skill.test.js` comprueba en los dos sentidos que las listas de la skill y el árbol coinciden (cada lista que la skill manda tocar existe; cada lista fija de `lib/` con dos o más nombres de harness está nombrada), y `tests/harness-lists.test.js` falla si una lista fija de código omite a Codex (hoy la regla solo se fija en Muse). Un ayudante compartido, `tests/harness-literals.js`, recorre `plugins/aether/lib/` y `hooks/`.
**Serves:** C10 (R23, R24), C1 (R3).

### D12. Documentos, versión y propuestas

Las guías (`lanes`, `ops`, `troubleshooting`, `delegates`, `options`), `getting-started`, `docs/reference/components.md`, el README, la web (en español y en inglés) y las skills `using-aether` y `swarm` dicen que Codex es un harness de trabajo, con sus tres modelos, los escalones, la lectura gratis, el fallback y el límite medido de R19 (tarea 10). La versión 0.27.0 (`plugin.json`, el pin de `tests/launcher.test.js`, el README, el historial de cambios, el handoff), la decisión A100 (la numeración se comprueba otra vez al escribirla) y la prueba de que los cinco lugares coinciden son la tarea 12; `npm run check` pasa. Lo que Codex trae de más está en `## Proposals`.
**Serves:** C1 (R3), C11 (R25), C12 (R26).

## Files

| Archivo | Qué y por qué | Tarea |
|---|---|---|
| `plugins/aether/lib/harness/codex.js` | El adaptador: línea de órdenes de D1, esquema estricto, lectura de los eventos reales, cuota por D3 (R4, R5, R19, R22). | 1, 2 |
| `plugins/aether/lib/harness/structured.js` | La opción `quotaByText` de `parseRun` (D2). | 1 |
| `plugins/aether/lib/harness/codex-quota.js` | El lector de `account/rateLimits/read` (D3). Nuevo. | 2 |
| `tests/lane-fixtures.js` | `laneEnv` pone el `command` de Codex en `/nowhere/codex`, como el de Muse, para que ninguna prueba arranque el `codex` real. | 2 |
| `tests/harness-codex.test.js`, `tests/harness-structured.test.js`, `tests/harness-codex-quota.test.js` | Pruebas del adaptador, de la opción y del lector. | 1, 2 |
| `tests/fixtures/fake-codex.js`, `tests/fixtures/codex/**` | Un `codex` simulado (`--version`, `exec`, `app-server`) y sus datos. Nuevos. | 1 |
| `plugins/aether/config/pairs.json`, `plugins/aether/lib/pairs.js`, `tests/codex-pairs.test.js`, `tests/pairs.test.js`, `tests/seats.test.js` | Las 15 filas, los dos campos nuevos y la prueba de la fórmula y de los escalones; los conteos de `pairs.test.js` pasan a 50 y `seats.test.js` acepta los pares de Codex vetados. | 3 |
| `plugins/aether/config/models/{harness-models,profiles,models}.json`, `plugins/aether/config/prices.json`, `docs/models/README.md`, `scripts/build-models-index.js`, `tests/codex-models.test.js`, `tests/models-index.test.js`, `tests/copies-harness-config.test.js` | Captura de la lista, exclusiones, perfiles, precios, índice (con las 15 cifras de Terminal-Bench) y su README; `CHOSEN` de la prueba de copias lleva a Codex. | 4 |
| `plugins/aether/config/lanes.json`, `tests/codex-lanes.test.js` | Modelos de Codex y sus roles. | 5 |
| `plugins/aether/lib/{router-quota,router-renewal,router-pick,delegate-calls,lane-delegate}.js`, `plugins/aether/bin/aether-delegate`, `tests/{router-pick,router-quota,router-renewal,delegate-calls}.test.js` | Las listas de delegados (D7) y los cuatro archivos de prueba que fijaban «Codex no». | 6 |
| `scripts/lane-smoke.js`, `tests/codex-smoke.test.js` | Los cinco esfuerzos y `--raw` (D10). | 7 |
| `tests/codex-lane.test.js` | Punta a punta: unidad, delegados, fallos, cuota y marca (D8). Nuevo. | 8 |
| `plugins/aether/.claude-plugin/plugin.json`, `docs/guide/options.md`, `tests/manifest.test.js`, `tests/codex-detect.test.js` | La descripción de `harnesses` y la detección (D9). | 9 |
| `docs/guide/{lanes,ops,troubleshooting,delegates}.md`, `docs/getting-started.md`, `docs/reference/components.md`, `README.md`, `site/index.html`, `site/app.js`, `plugins/aether/skills/{using-aether,swarm}/SKILL.md`, `tests/codex-docs.test.js` | Codex en las guías, la web, las skills (D12). | 10 |
| `.claude/skills/new-harness/SKILL.md`, `.claude/skills/artificial-analysis/SKILL.md`, `tests/harness-lists.test.js`, `tests/harness-literals.js`, `tests/new-harness-skill.test.js` | El método en skills y las pruebas que lo atan al árbol (D11). | 11 |
| `plugins/aether/.claude-plugin/plugin.json` (versión), `tests/launcher.test.js`, `README.md` (línea `Version`), `docs/changelog.md`, `docs/decisions.md`, `docs/roadmap.md`, `docs/handoff/2026-10-29-codex-harness.md`, `tests/codex-release.test.js` | La 0.27.0 y A100; la línea **Now** de `docs/roadmap.md` nombra la versión del manifiesto (lo exige `tests/docs-facts.test.js`, «R12: the roadmap's Now line names the manifest's version»). | 12 |
| `specs/022-codex-harness/evidence/**` | Lo que deja el Lead en los pasos 0 y N. **No lo posee ninguna tarea.** | Lead |

## Verification

- **Comando de pruebas:** `npm test`; antes de cerrar, `npm run check` (pruebas, `test:mod` y `validate`).
- **Qué prueba cada criterio.**

| Criterio | Prueba |
|---|---|
| C1 | `tests/manifest.test.js` (acepta `codex`, rechaza mal escrito, ya existe), `tests/codex-detect.test.js` (instalado y versión con un `codex` simulado; no instalado sin él), `tests/harness-lists.test.js`. |
| C2 | `tests/harness-codex.test.js` (línea de órdenes, esquema, eventos), `tests/codex-lane.test.js` (una unidad y un delegado por `codex exec` en su worktree con el modelo y el esfuerzo del par), y las llamadas reales del paso N. |
| C3 | `tests/codex-lane.test.js` (no instalado, sin sesión, cuota agotada, caída a mitad de llamada: corre nativo, sin pregunta, causa en el registro). |
| C4 | `tests/harness-codex-quota.test.js` (dos ventanas, sin llamar a un modelo, sin credenciales, lectura vieja), `tests/codex-lane.test.js` (marca confirmada y que se cura sola), y la lectura real del paso N contra `evidence/codex-rate-limits-2026-10-29.json`. |
| C5 | `tests/codex-models.test.js`, `tests/codex-lanes.test.js`, `tests/codex-pairs.test.js` (la fórmula recalculada), `tests/lane-table-index.test.js` y `tests/models-index.test.js` (ya existen). |
| C6 | `tests/codex-pairs.test.js` (las dos columnas de D6 y Luna max). |
| C7 | `tests/harness-codex.test.js` (la línea de órdenes y que ningún código nombre `auth.json` ni `OPENAI_API_KEY`) y la comparación real de `input_tokens` del paso 0, más la lista de `~/.codex/sessions` y `history*` igual antes y después. |
| C8 | `tests/router-pick.test.js`, `tests/delegate-calls.test.js`, `tests/codex-lane.test.js`. |
| C9 | Lo que el Lead deja en `evidence/` (pasos 0 y N): llamadas a Sol, Terra y Luna, cuota antes y después, respuesta estructurada, `max`, eventos reales. |
| C10 | `tests/new-harness-skill.test.js`, `tests/harness-lists.test.js`. |
| C11 | `tests/codex-release.test.js`, `npm run check`. |
| C12 | `## Proposals` de este plan y de la spec; el diff no construye ninguna. |

## Assumptions

- **A-P1. El paso 0 precede al enjambre y el Lead corrige `tasks.md` donde la medición lo contradiga** (D0). Hasta entonces las tareas llevan la forma supuesta de Spec Kit (`item.completed`, `turn.completed`, `usage.input_tokens`, `cached_input_tokens`, `output_tokens`) y las tres opciones candidatas. Reversible: es texto.
- **A-P2. El grupo de cuota se llama `codex`, y las ventanas `5h` y `weekly`** (los nombres de Muse y de agy), para que el panel, el orden y las marcas no cambien.
- **A-P3. Los precios de cache de Codex no están medidos**: `cacheRead` = el 10 % de la entrada y `cacheWrite*` = la entrada. Solo afectan a `aether-report`. Se marcan como estimación en `prices.json` y se corrigen cuando el dueño dé el precio.
- **A-P4. El sandbox es `workspace-write` para todos los roles** (el adaptador no recibe el rol; `argv` no lo pasa). El supervisor, el revisor y el delegado de lectura ya se comprueban sin cambios en el worktree.
- **A-P5. El prompt va justo después de `exec`**, como en el adaptador de hoy; los prompts de Aether no empiezan con `-`.
- **A-P6. El costo de Terra supone los mismos tokens por tarea que Sol** (D5): AA no midió a Terra, y su ancla es la de Sol por la razón de precios de salida (1/2). Si Terra gasta más tokens que Sol a un esfuerzo, sus costos reales son mayores; lo reemplaza el gráfico de AA del dueño. Las curvas de esfuerzos (de Claude y Grok) tampoco son de GPT. Reversible cambiando el ancla y recalculando.
- **A-P7. La opción `harnesses` por defecto no cambia** (`agy`): Codex es elegible, no encendido, como Muse.

## Risks

- **Las opciones candidatas pueden no existir o no hacer lo que se espera** (`--disable hooks`, `-c project_doc_max_bytes=0`, `-c approval_policy=never`): el paso 0 las mide y, si no sirven, el límite queda medido y escrito (R19) en vez de afirmar una privacidad que no se comprobó. Una opción que Codex rechaza haría que toda llamada fallara y corriera nativa: la primera llamada real del paso 0 lo ve antes del enjambre.
- **El `AGENTS.md` global (`~/.codex/AGENTS.md`) puede cargarse aunque `project_doc_max_bytes` sea 0.** Mismo tratamiento: si la comparación de `input_tokens` no baja, se escribe como límite y no se descarta el harness.
- **La forma real de los eventos puede ser muy distinta de la supuesta.** El Lead corrige la tarea 1 antes del enjambre; la prueba que lee `tests/fixtures/codex/exec-events.jsonl` (la captura real) no supone nombres: pide una respuesta limpia y un uso mayor que cero.
- **El lector de cuota puede colgarse** si `codex app-server` no contesta: el hijo tiene tiempo máximo (20 s, el de `READ_TIMEOUT_MS` de Codex en el panel) y se mata el árbol del proceso; la prueba lo fija con un servidor simulado que no contesta.
- **`REFRESHABLE` y otras listas con dos nombres de harness** pueden salir en el recorrido de `tests/harness-literals.js` sin ser parte de los cinco de la spec: la tarea 11 las nombra en la skill (con la razón de que Codex no entra) en lugar de ocultarlas; si el recorrido encuentra otra, la nombra con su razón.
- **Solo dos costos son medidos (Sol max, Luna max, del 2026-10-26); los otros 13 son estimaciones**, y los de Terra descansan además en A-P6. Por eso el brief final dice qué par gana de verdad y con qué cifras (D6), y P1 queda para el dueño.
- **La suscripción es Plus** (cupo pequeño): el paso 0 y el paso N usan pocas llamadas mínimas y anotan lo que cada una gastó de la cuota.

## Proposals

Anotadas para el dueño; no se construyen en esta spec (R26). Las dos primeras son las de la spec.

- **P1. Refrescar toda la tabla de pares con las cifras de AA de hoy** (casi toda fila bajó entre 3 y 12 puntos desde el 26 de octubre, `evidence/README.md` §3). Cambia el reparto de los otros harness y obliga a rehacer las estimaciones de Muse Spark. Va con la diferencia medida.
- **P2. Codex como asiento de diseño (Judge, Writer, Examiner).** Hoy solo agy los tiene; hacerlo exige medirlo con los casos de Aether.
- **P3. Leer los demás cupos de `rateLimitsByLimitId`.** `account/rateLimits/read` devuelve un mapa por límite; hoy solo se usa `codex`. Si Codex pone un cupo propio por modelo (Luna, Sol), cada par podría tener el suyo. Se anota para decidir cuando exista el dato.
- **P4. Usar `--output-last-message` como segunda fuente de la respuesta.** Si los eventos de `--json` cambian entre versiones, un archivo con el último mensaje sería una fuente más estable. Se anota; no se construye.
- **P5. Descubrir los modelos de la cuenta con `codex app-server` en lugar de `models_cache.json`.** Hoy se lee el caché local porque Codex no tiene un comando que los liste; el servidor podría darlos con un método propio. Hay que medirlo antes.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Dos campos opcionales en una fila de `pairs.json` (`checked`, `costEstimate`) y su validación en `lib/pairs.js`. | R12 pide la fecha de las cifras de AA en cada fila y R13 pide que una estimación vaya «marcada como tal en su fila»; una prueba (R13) tiene que reconocer qué filas son estimadas para recalcularlas. | Dejar la marca en el texto de `ownerDecision` (como Muse) la haría ilegible para una prueba, y `ownerDecision` es la palabra del dueño, no un método. |
| `lib/harness/codex-quota.js` corre su propio archivo como proceso hijo con `spawnSync`. | R9 pide leer `account/rateLimits/read` de `codex app-server`, y esa conversación es asíncrona, mientras `lane-readings.readGroups` llama a `adapter.quota()` de forma síncrona (agy, grok y Muse lo cumplen así). | Volver `quota()` asíncrono cambiaría `lane-readings`, `lane-quota`, `router-quota` y `lane-pick`, cuyos otros harness no cambian (spec, fuera de alcance: «cambiar el comportamiento de agy, grok, Muse»). Llamar `spawnSync(command, ['app-server'], { input: <las tres líneas JSON>, timeout })` directo es más corto, pero `input` escribe todo y cierra la entrada de inmediato: el protocolo es secuencial (`initialized` y la lectura se envían al recibir la respuesta de `initialize`, como en `evidence/codex-rate-limits-probe.js`) y no está medido que el servidor conteste las tres con la entrada ya cerrada (puede salir al leer EOF antes de responder y la lectura quedaría sin respuesta); `spawnSync` tampoco termina al llegar la respuesta, sino al salir el servidor o vencer el tiempo, y el hijo propio sí cierra al recibirla y mata el árbol. Si el paso 0 muestra que el servidor contesta con la entrada cerrada, el Lead puede simplificar esto antes del enjambre. |
| La clave `excludedEfforts` en la entrada `codex` de `harness-models.json`. | R16 pide que el esfuerzo `ultra` esté en la lista de excluidos con su razón, y esa lista solo tiene un lugar para modelos (`excluded` de un modelo). | Meter `ultra` como si fuera un modelo falsearía el índice; dejarlo solo en una nota no se puede comprobar con una prueba (C5). |
| El ayudante `tests/harness-literals.js` que recorre `lib/` y `hooks/` buscando listas fijas de harness. | R3 y R23 piden una prueba que falle cuando una lista fija omite a Codex y otra, en los dos sentidos, que compare la skill con el árbol; las dos usan el mismo recorrido. | Copiar el recorrido en cada prueba lo duplicaría y las dos pruebas podrían dejar de coincidir. |
