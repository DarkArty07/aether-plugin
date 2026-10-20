# Muse Code como harness de Aether (0.13.0): plan

**Spec:** [spec.md](spec.md). Lo medido que este plan usa está en [evidence/](evidence/README.md) y en [evidence/repo-map.md](evidence/repo-map.md); el plan lo comprobó contra el código de `plugins/aether/lib/` en `2ebe425`.

## Technical context

- **Pila.** Node.js 22, CommonJS, sin dependencias de npm (`package.json` solo tiene scripts). Los módulos del mod (`hooks/*.mjs`, `panel.jsx`) son ESM y se prueban con `npm test` (las partes puras) y con `npm run test:mod`.
- **Estructura que el trabajo toca** (ver [repo-map.md](evidence/repo-map.md) §1 y §2): el registro y los adaptadores en `plugins/aether/lib/harness/`; la tabla `plugins/aether/config/lanes.json`; el panel en `plugins/aether/hooks/panel-*.mjs`; los datos del índice de modelos en `plugins/aether/config/models/` y `config/prices.json`; `scripts/build-models-index.js`; los docs y la web (`docs/`, `README.md`, `CLAUDE.md`, `site/`).
- **Lo que el código ya hace y el plan reutiliza sin tocar:**
  - `lane-calls.js` lanza el adaptador con `spawn` en el worktree de la unidad, en un grupo de procesos aparte que mata al vencer el tiempo (R7), con `laneEnv` (que ya borra `META_API_KEY`: R12). Un cambio suyo, de orden, está en D4: `runCall` lee la cuota de después de la llamada antes de llamar a `adapter.parse`, y para Muse tiene que ser al revés.
  - `judge()` ya manda un fallo con razón `quota: …` a estado `quota` (marca) y cualquier otro fallo a `failed`, y el workflow ya trata `failed` como fallo de infraestructura que toma el agente nativo sin gastar un intento de la escalera (`run.workflow.js` ~533). Por eso R11 se cumple con que el adaptador devuelva la razón correcta y con nada más en el workflow.
  - `lane-marks.js` ya da marcas sin confirmar de 60 minutos que una lectura sana más joven levanta, y marcas confirmadas hasta el reinicio cuando una lectura muestra la ventana bajo la reserva. Un cambio suyo, de una línea, está en D4: `liftable` no mira `reading.source.ts`, y una observación anterior a la marca no debe poder levantarla.
  - `lane-order.js` ya ordena por saldo y horas al reinicio, con reserva de 5 % (R15) para cualquier harness de la tabla.
- **No hay constitución** (`.specify/memory/constitution.md` no existe).
- **Lo que no se pudo medir** (evidencia §7) y que este plan trata como forma supuesta hasta la llamada real: `allowance` de `run.usage`, el objeto del fallo de `run.terminal.failed`, si `--output-schema` acepta los esquemas de los roles, el tamaño máximo de un prompt posicional, si el sandbox arranca en WSL2 y si la suscripción cubre `muse exec`.

## Gate

| Comprobación | Resultado |
| --- | --- |
| Principios de `.specify/memory/constitution.md` | No aplica: el proyecto no tiene constitución. |
| Nothing speculative, and nothing for a hypothetical need. | Pasa. Cada pieza sirve a un requisito (sección Design). Lo que Muse trae de más (asiento de diseño, router, contributor, pago por token, medición contra el nativo, lectura de cuota por `muse serve`) va a Proposals y no se construye. |
| No abstraction, option, file or dependency that no requirement asks for. | Pasa con tres piezas justificadas en Complexity: el archivo de la última observación de cuota (R14, R16), los dos cambios pequeños en `lane-calls.js` y `lane-marks.js` que esa observación necesita (R14, R16) y la prueba que recorre el repositorio (R21). No hay opción nueva en `plugin.json` (solo la descripción de `harnesses`, R19), ni dependencia, ni función compartida nueva entre adaptadores. |

## Design

**D1. El adaptador `lib/harness/muse.js` sigue el contrato de los otros** (`name`, `installed`, `version`, `quota`, `modelArg`, `argv`, `parse`, `usageDelta`) y se registra como quinto nombre, al final: `HARNESS_NAMES = ['agy','codex','grok','cursor','muse']`. El orden de la lista de la opción lo dicta el dueño; el del registro solo decide qué nombres existen. Serves: C1, C2.

**D2. La línea de órdenes es esta, y los tests la fijan entera.** `argv({ model, level, schemaFile, prompt })` da:

```
muse exec --json --provider meta --model <model> [--reasoning-effort <level>] [--output-schema <schemaFile>]
  --contributor-mode off --no-foreign-personal-context --disable-approval --disable-reminders
  --disable-request-user-input --max-model-steps 200 <prompt>
```

- Sin aprobaciones interactivas (`--disable-approval` quita solo las aprobaciones y deja el sandbox: evidencia §1) y sin esperar entrada (`--disable-request-user-input`). R3.
- El sandbox queda encendido y el workspace sin confianza: el adaptador **nunca** pasa `--yolo`, `--disable-sandbox`, `--trust-workspace`, `--api-key-stdin` ni `--contributor-mode on`, y un modelo que termina en `-contributor` hace lanzar a `argv` (el runner lo toma como fallo y la llamada corre en el nativo). R9, R10, R12, R24. Sin `--trust-workspace`, Muse no carga reglas del proyecto ni delega solo a subagentes (aviso medido en la evidencia §1): eso, más `--disable-reminders`, es lo que R7 pide de las llamadas de fondo y los subagentes propios.
- El worktree de la unidad es el `cwd` del proceso (`lane-calls.js` lo lanza con `cwd: workdir`) y Muse toma el `cwd` como workspace por defecto: no se pasa `--workspace`. R3.
- `--output-schema` recibe el archivo del esquema del rol (R5); por eso `schemaInPrompt` no se declara. Si la llamada real muestra que Muse rechaza esos esquemas, se pasa a `schemaInPrompt = true` y se quita la bandera (un cambio de dos líneas, Risks).
- `--max-model-steps 200` es el tope de pasos (A-6 del spec); el tiempo límite lo pone el runner con los `timeouts` de la tabla. Es una constante del adaptador, reversible.
- El `level` llega tal cual de la tabla de lanes (`levels`): la tabla de Muse traduce el nivel de Aether al esfuerzo de Muse (`low|medium|high|xhigh`, que Muse acepta). Serves: C2, C3.

**D3. `parse` lee los registros JSONL de `--json` y devuelve la forma de siempre** `{ clean, reason, structured, usage, conversation }`.

- Los registros se leen por `payload_type` (evidencia §1): `run.terminal.completed` / `run.terminal.failed` / `run.terminal.cancelled` (el último `run.terminal.*` decide el turno) y `run.usage`. Las líneas que no son JSON se ignoran. Los avisos de la salida de error no cuentan.
- **Limpia** solo si el turno terminó `completed`, la salida fue 0, el texto final no está vacío y trae el objeto JSON con los campos `required` (se reutilizan `extractJsonObject` y `missingField` de `structured.js`). R4, R5.
- **Razón de un fallo**, por la primera regla que se cumpla: (1) el fallo trae el dato `quota` (objeto del fallo: `reason.quota`, o `error.quota`) → `quota: muse <limitKind>, resets <ISO>`; **nunca por el texto del mensaje** (R16); (2) el turno terminó no completo → `muse <kind>: <message>` con `kind` del objeto del fallo (`authRequired`, `environmentError`, `stepLimit`, `modelError`, `configError`, …), o `muse failed: <texto>` / `muse cancelled` cuando no hay `kind`; (3) salida distinta de 0 → `exit <n>[: <primera línea de stderr>]` (`exit unknown` si no hay número); (4) sin registro terminal → `unreadable output`; (5) texto vacío → `no result`; (6) sin objeto → `no structured output`; (7) falta un campo → `missing <campo>`. El objeto del fallo se acepta como objeto, como cadena JSON o como cadena suelta: la forma real se ve en la llamada real (R27).
- **Ninguna razón de un fallo que no es de cuota empieza por `quota: `**, y `environmentError` nunca pasa por la regla (1): el runner solo marca cuando la razón empieza así (`lane-calls.js` `judge`). Así la unidad corre en el nativo, sin marca en disco y sin que se cuente como cuota agotada (R13); la siguiente unidad que el orden mande a Muse prueba el sandbox otra vez. Aether nunca repite la llamada con el sandbox apagado.
- **Uso.** Se suman los `models[]` de `run.usage`: `{ input, output, thinking, cacheRead, total }` (`total` = entrada + salida) más `models: [{ model, calls, input, output, thinking, cacheRead }]` y `allowance` tal como Muse lo informa (o `null`). El uso se conserva en un fallo. `usageDelta(prev, cur)` devuelve `cur` (cada llamada informa la suya). R6, R4.
- Serves: C2, C3, C4.

**D4. La cuota de Muse es la última observación que Aether hizo, guardada por el propio adaptador.** `quota()` no lanza ningún proceso ni gasta nada: lee `<dataDir>/lanes/quota/muse-observed.json` y la da en la forma de los otros harness, un grupo (A-8 del spec) con ventanas `5h` y `weekly`.

- Cada `parse` guarda `{ observedAt, window, weekly }`. Con un `allowance` legible (campos `window` y `weekly` con `usedPercent` y `resetsAtMs`, en camelCase o snake_case, como el esquema de `SubscriptionUsage`) guarda las dos ventanas. Un fallo con dato `quota` **sustituye** las ventanas guardadas por las de su propio `allowance` y, si no trae uno legible, las deja en `null` (`observedAt` ahora): una lectura sana anterior no puede contradecir al fallo. Cualquier otro `parse` no toca el archivo. Escritura atómica (temporal y `rename`), como `lane-readings.js`.
- `quota()` → `{ groups: { muse: { windows: { '5h': { remaining, resetsAt }, weekly: { … } }, source: { command: 'muse exec --json', ts, ageMinutes } } } }`, con `remaining = 1 - usedPercent/100` acotado a [0, 1], `resetsAt` ISO y `ts` = `observedAt` en ISO. Una ventana cuyo reinicio ya pasó se descarta (se rellenó). Sin archivo, ilegible, sin ventanas vigentes o con un campo roto: `{ unknown: true, windows: {} }`, y nunca lanza. No hay ventana sintética: Muse no inventa un `limit` ni un reinicio. R14.
- **La marca de un fallo de cuota es la de los otros harness (R16).** Sin `allowance` en el fallo las ventanas quedan borradas, la lectura de después de la llamada es «desconocida», `judge` ve la razón `quota: …` y manda la unidad a estado `quota`, y `holdDry` deja la marca sin confirmar de 60 minutos de `lane-marks.js`. Si el `allowance` del propio fallo muestra una ventana bajo la reserva, la lectura la excluye y `holdDry` deja la marca confirmada hasta ese reinicio, como en los otros harness.
- **Dos cambios pequeños en código compartido, y nada más** (sin tocar `lane-order.js` ni `lane-quota.js`):
  1. `lane-calls.js` `runCall` llama a `adapter.parse(...)` **antes** de leer `quotaAfter` con `readings.readGroups(...)`. Hoy lee la cuota primero (`quotaAfter`) y después hace el `parse`: para Muse, que guarda su observación dentro de `parse`, la lectura de esa misma llamada no vería el `allowance` que la llamada trajo, y `lane.quota` quedaría desconocida. Para agy, codex, grok y cursor el orden no cambia nada (su `parse` no toca la cuota).
  2. `lane-marks.js` `liftable` no levanta una marca con una lectura cuyo `source.ts` es anterior a `mark.at` (`Date.parse(reading.source.ts) < mark.at`; sin `source.ts` legible la regla no aplica). Sin esto, la observación que dejó el propio fallo, con ventanas sanas y tomada unos milisegundos antes de la marca, podría levantarla; con esto, solo la levanta una observación de una llamada posterior (R16).
- Con eso las reglas de siempre hacen el resto: una lectura bajo la reserva excluye al grupo y `holdDry` la confirma hasta el reinicio; una lectura desconocida cuenta como usable y detrás de las que tienen lectura; un fallo de cuota deja la marca de 60 minutos y una lectura sana más joven que la marca (una observación nueva con saldo) la levanta (R15, R16). `quotaLifeMinutes: 30` en la tabla acota cuánto vale una observación para levantar una marca.
- Es el mismo mecanismo en el panel y en `aether-lane quota` (el panel solo lee su salida). Lo que esto no hace —leer el saldo **antes** de la primera llamada— queda dicho en Risks y en Proposals (P6).
- Serves: C4, C5.

**D5. Sin sesión, sin sandbox, sin cuenta: todos son fallos de la llamada, nunca una pregunta.** Aether no abre archivos de Muse, no lanza `muse login`, no usa `META_API_KEY` (el runner la borra) ni ofrece el pago por token. La falta de sesión se sabe por `authRequired` en el fallo. Las llamadas no tienen entrada estándar (`stdio: ['ignore', …]`). Serves: C3.

**D6. El registro y la vista del panel cambian juntos, en una tarea; el resto del panel, en otra.** `tests/panel-conformance.test.js` exige que `HARNESS_NAMES` de `hooks/panel-view.mjs` sea igual al del registro: separar las dos ediciones dejaría un merge con una prueba en rojo. La tarea 6 añade `muse` a las dos listas, `READ_TIMEOUT_MS.muse = 20000` (la lectura es un archivo, como codex y cursor), los fixtures `quota-muse.json` y `quota-missing.json`, y las aserciones de `tests/harness-index.test.js` y `tests/panel-*.test.js` que ese cambio de datos rompe. La tarea 13 (después, y fuera de `npm test`) cambia el texto «four harnesses» de `panel.jsx` y las pruebas del mod `panel.test.tsx` (nombres, conteos de lecturas y `Not installed`). Serves: C5 (R17).

**D7. La entrada de la tabla `config/lanes.json`** es `harnesses.muse = { command: 'muse', maxParallel: 1, waitSeconds: 540, quotaLifeMinutes: 30, timeouts: { implementer: 2700, supervisor: 900, reviewer: 1200 }, groups: { muse: 'Muse subscription' }, models: {} }`.

- `maxParallel: 1` hasta medir que dos `muse exec` en worktrees distintos conviven con el índice SQLite compartido (R8, A-7).
- `models: {}` mientras no haya una medición de Artificial Analysis (R23, A-4): el Lead no tiene `ARTIFICIAL_ANALYSIS_API_KEY` en esta sesión (evidencia §3). Con la tabla sin modelos Muse es un harness registrado, visible y con cuota leída, y `scripts/lane-smoke.js muse <modelo>` (que ya acepta el modelo como segundo argumento) lo llama. Añadir un modelo es editar esta tabla, con su `aa.slug`, y refrescar con `scripts/refresh-lanes.js` (Lead, paso L3).
- No hay `designSeats` de Muse (A-3 del spec).
- La descripción de la opción `harnesses` de `plugin.json` y la fila de `docs/guide/options.md` nombran a Muse y siguen iguales entre sí (`tests/manifest.test.js` las compara). Serves: C1, C5 (R8, R19, R2).

**D8. Los modelos entran por las tres reglas, y la prueba nueva las comprueba sobre la tabla.** `tests/lane-models.test.js` (hoy no existe y la prueba del índice no lee `config/lanes.json`) recorre `harnesses.muse.models` y comprueba, por cada modelo: que `harness-models.json` lo lista (la CLI lo lista), que es la generación más nueva de su línea entre lo que lista la CLI (**decisión del plan para R22: la hace la prueba, no el script**: la línea es el id sin el número de versión —`muse-spark-1.3` → `muse-spark`, `muse-wonder-full-1.0` → `muse-wonder-full`—, gana el número mayor, y un `-contributor` no es de ninguna línea que entre), que `profiles.json` tiene su perfil y que `lanes.json` le da `replaces` y `aa` (R23). Rechaza `-contributor`, imagen, voz y `sam` (R24). Con la tabla sin modelos las comprobaciones por modelo no recorren nada, y la prueba usa una tabla y un listado sintéticos para demostrar que sí fallan con un modelo viejo, sin perfil, sin medición o `-contributor`. `scripts/build-models-index.js` solo aprende el nombre `muse` (`HARNESSES` y `CAPTURE`: `with the model/list method of muse serve`); **no entra en `DEFAULT_HARNESSES`** hasta que el listado de la CLI esté capturado (paso L3), porque con un nombre por defecto sin listado el script se niega a correr. Serves: C6 (R22, R23, R24, R25).

**D9. Perfiles y precios (R6, R18).** `profiles.json` gana los perfiles de `muse-spark-1.3`, `muse-wonder-1.0` y `muse-wonder-full-1.0`, escritos con los datos de la evidencia §4 y sus fuentes de Meta (`checked: 2026-10-19`); el de `muse-wonder-full-1.0` lleva `price: null` (el panel y el README del índice lo muestran como «price: the host's»). `config/prices.json` gana filas para `muse-spark-1.3` (entrada 1.25, salida 4.25, caché 0.15) y `muse-wonder-1.0` (entrada 4.00, salida 20.00, caché 0.20), por millón de tokens, con la fuente de Meta; `muse-wonder-full-1.0` no tiene fila y `aether-report` ya lo cuenta a $0 con la nota «no price for lane model» (`report.js` `laneDollars`). Los precios vienen de un resumen de WebFetch: el Lead los verifica contra la página en L3 (Risks). Serves: C2, C5 (R6, R18).

**D10. Una prueba recorre el repositorio (R21).** `tests/harness-lists.test.js` lee los archivos de texto que git rastrea y falla en toda línea que (a) nombre al menos tres de `agy`, `codex`, `grok`, `cursor` como lista y no nombre `muse`, o (b) cuente los harnesses con un número («four harnesses», «cuatro harnesses», «4 harnesses»). Las excepciones son una tabla en la propia prueba, cada una con su motivo: los registros históricos (`docs/decisions.md` salvo la fila nueva, `docs/changelog.md` por debajo de la entrada 0.13.0, `docs/handoff/`, `docs/issues/`, `docs/roadmap*`, `docs/evaluations/` y todo `specs/`, que son documentos de diseño que describen el estado de su fecha), los fixtures de `tests/` que son salida capturada, los archivos de prueba (`tests/*.test.js` y `hooks/panel.test.tsx`: sus entradas son subconjuntos sintéticos de los harnesses y sus listas reales las fijan las pruebas de conformidad, del registro, del manifiesto y de la tabla), la línea de cabecera de `lib/harness/structured.js` (un comentario histórico de quién escribió esos ayudantes) y los textos que dicen «otro harness» en genérico. El router, los asientos y los delegados nombran dos harnesses como máximo, así que no entran en la regla (a). Serves: C5 (R21).

**D11. Docs y web (R20).** Los docs se escriben de lo que el código hace, en inglés; la web, en los dos idiomas que ya tiene. Dónde: `docs/guide/lanes.md` (la sección de Muse: banderas, privacidad, fallbacks, cuota por observación), `docs/guide/ops.md`, `docs/guide/troubleshooting.md`, `docs/getting-started.md` (tarea 4); `README.md`, `CLAUDE.md`, `docs/methodology.md`, `docs/purpose.md` y la parte a mano de `docs/models/README.md` (tarea 12); `docs/guide/options.md` (tarea 7); los skills `using-aether` y `swarm` (tarea 11); `site/index.html` y `site/app.js` (tarea 5); y los comentarios y listas de `scripts/build-models-index.js` (tarea 2). Cada línea que la prueba de D10 marque tiene dueño en una de esas tareas. Serves: C5 (R20).

**D12. Versión 0.13.0 y registros (R29, R30), en dos tareas.** `docs-facts.test.js` y `launcher.test.js` comparan la versión del manifiesto con el README, el changelog y el roadmap, y fijan el changelog en 0.12.5, así que esos lugares cambian en una sola tarea (la 10): `plugin.json`, la fijación de `tests/launcher.test.js`, la línea `Version` y la insignia del README, la línea `Now` y la descripción de `docs/roadmap.md`, la primera línea `Version X.Y.Z:` del changelog (con el enlace al handoff nuevo) y la parte del changelog de la prueba R15 de `docs-facts.test.js`. La tarea 14, que va antes, escribe lo que esa tarea enlaza: el handoff `docs/handoff/2026-10-19-muse-harness-0.13.0.md`, la decisión en `docs/decisions.md` (el siguiente número libre al cerrar, hoy A63; otra sesión del dueño sigue activa, así que se vuelve a leer la tabla antes de escribir), el rango `A1–A<n>` de `docs/index.md` (que la prueba R12 compara con la última decisión) y la parte de las decisiones de la prueba R15. No se hace merge, push, tag ni `claude plugin update` (R31). Serves: C8.

**D13. Lo que hace el Lead y no el swarm** (R26 a R28, R30, R31). Los implementadores no tienen la concesión `paid-call` ni deben llamar a Muse. Cuando el swarm termina, el Lead:

1. **L1.** Corre `aether-autonomy check paid-call`. Con `covered: true`: `node scripts/lane-smoke.js muse muse-spark-1.3 --effort low` (la tabla no tiene modelos de Muse, así que el modelo va explícito). Sin la concesión: el comando exacto va a «Espera tu sí» y L2 queda pendiente; todo lo demás sigue.
2. **L2.** Guarda en `specs/008-muse-harness/evidence/` la constancia (comando exacto, respuesta, uso, la forma real de `allowance`, del `reason` de un fallo y de las herramientas en `--json`, y la cuota antes y después leída con `muse serve` `usage/read` si responde; lo que no se pudo medir, dicho aparte) y una captura sin credenciales ni texto ajeno como fixture. Si la forma real difiere de la supuesta, corrige `muse.js` y sus pruebas para que sigan la real (R27) y, de paso, `schemaInPrompt` o el `--output-schema`, el tope de pasos y el `maxParallel` si la medición lo pide.
3. **L3.** Captura el listado de la CLI (`model/list` de `muse serve`, sin gasto), verifica los precios contra las páginas de Meta y, si hay `ARTIFICIAL_ANALYSIS_API_KEY`, añade los modelos medidos a `config/lanes.json` y regenera el índice (`node scripts/build-models-index.js --harnesses claude,agy,grok,muse --write`, y entonces añade `muse` a `DEFAULT_HARNESSES`). Sin la clave, la tabla sigue sin modelos de Muse (R23) y el informe lo dice.
4. **L4.** Corre `npm run check`, comprueba las cuatro apariciones de la versión y deja el informe: lo hecho, lo no medido, y el merge, el push, el tag y `claude plugin update` para el dueño.

## Files

Los archivos que cada tarea posee están en [tasks.md](tasks.md). Resumen:

| Archivo | Qué y por qué |
| --- | --- |
| `plugins/aether/lib/harness/muse.js` (nuevo) | El adaptador (D1 a D5). |
| `plugins/aether/lib/harness/index.js` | Registra `muse` (D1). |
| `plugins/aether/config/lanes.json` | Entrada `muse` (D7). |
| `plugins/aether/.claude-plugin/plugin.json` | Descripción de `harnesses` (D7) y la versión (D12). |
| `plugins/aether/lib/lane-calls.js`, `plugins/aether/lib/lane-marks.js` | Los dos cambios pequeños de D4 (el `parse` antes de la lectura de después de la llamada; `liftable` mira `source.ts`). |
| `plugins/aether/hooks/panel-view.mjs`, `panel-layout.mjs` (tarea 6); `panel.jsx`, `panel.test.tsx` (tarea 13) | Muse en el panel (D6). |
| `plugins/aether/config/models/profiles.json`, `plugins/aether/config/prices.json` | Perfiles y precios (D9). |
| `scripts/build-models-index.js` | El nombre `muse` (D8). |
| `tests/harness-muse.test.js`, `tests/fixtures/fake-muse.js`, `tests/fixtures/muse/**` (nuevos) | Pruebas del adaptador y la `muse` simulada. |
| `tests/muse-lane.test.js` (nuevo) | Las formas de falla de punta a punta con el runner real (C2, C3, C4). |
| `tests/lane-models.test.js`, `tests/muse-profiles.test.js`, `tests/muse-prices.test.js`, `tests/harness-lists.test.js` (nuevos) | R22 a R25, R6, R18, R21. |
| `tests/harness-index.test.js`, `tests/panel-*.test.js`, `tests/fixtures/panel/**`, `tests/manifest.test.js`, `tests/lanes.test.js`, `tests/lane-fixtures.js`, `tests/lane-marks.test.js`, `tests/models-index.test.js`, `tests/prices.test.js`, `tests/roles.test.js`, `tests/launcher.test.js`, `tests/docs-facts.test.js` | Las aserciones existentes que nombran cuatro harnesses o 0.12.5, o que la entrada `muse` de la tabla rompe (con `muse` instalado en la máquina), y los casos nuevos de `lane-marks.test.js`. |
| `README.md`, `CLAUDE.md`, `docs/**`, `skills/using-aether`, `skills/swarm`, `site/**` | Documentación y web (D11, D12), incluidos `docs/index.md` y `docs/roadmap.md`. |
| `specs/008-muse-harness/evidence/*` | Solo el Lead (D13). |

## Verification

- **Comando de prueba:** `npm test` (node --test sobre `tests/*.test.js`). Antes de cerrar, el Lead corre `npm run check` (`npm test`, `npm run test:mod` y `npm run validate`).
- **Ninguna prueba del repositorio llama a Muse de verdad:** usan `tests/fixtures/fake-muse.js` (que el adaptador lanza como `muse`) o un `exec` inyectado.

| Criterio | Qué lo prueba |
| --- | --- |
| C1 | `harness-index.test.js` y `lanes.test.js` (`muse` válido en `harnesses`, orden, duplicados y desconocidos); `harness-muse.test.js` (`installed`, `version` con un `exec` simulado); `manifest.test.js`. |
| C2 | `harness-muse.test.js` (argv entero, parse limpio, salida estructurada, uso) y `muse-lane.test.js` (una unidad corre en el worktree con la `muse` simulada y vuelve limpia con el uso). |
| C3 | `muse-lane.test.js`: una prueba por forma de falla (no instalado, `authRequired`, cuota, `environmentError`, tiempo, `stepLimit`, salida ilegible, `modelError`, salida distinta de 0) termina en estado `failed` o `quota` sin pregunta, y el workflow ya las manda al nativo. |
| C4 | `harness-muse.test.js` (lectura de 72 % y 40 %, desconocida, fallo de cuota que sustituye las ventanas) y `muse-lane.test.js` (la cuota de la llamada que trajo el `allowance`, orden con la misma regla y reserva, marca de 60 minutos por fallo con dato `quota`, marca levantada por una observación posterior y no por una anterior) y `lane-marks.test.js` (`liftable` y `source.ts`). |
| C5 | `panel-*.test.js` y `panel-conformance.test.js`, `manifest.test.js`, `harness-lists.test.js`, `site.test.js`, `docs-facts.test.js`. |
| C6 | `lane-models.test.js`, `muse-profiles.test.js`, `muse-prices.test.js`. |
| C7 | Constancia de L1 y L2 en `evidence/`; sin concesión, el comando va a «Espera tu sí». |
| C8 | `launcher.test.js`, `docs-facts.test.js`, `npm run check`; ninguna orden de merge, push, tag o update. |
| C9 | `## Proposals` de este plan; ningún archivo construye una propuesta. |

## Assumptions

- **A-P1. Sin medición de Artificial Analysis la tabla de Muse queda sin modelos** (R23). Reversible: editar la tabla y refrescar.
- **A-P2. `maxModelSteps` = 200** como constante del adaptador (A-6 del spec). Reversible; la llamada real puede pedir otro valor.
- **A-P3. Un solo grupo de cuota, `muse`,** con las ventanas `5h` y `weekly` (A-8 del spec).
- **A-P4. La cuota se lee de la última observación** de `allowance`, que un fallo de cuota sustituye por el suyo, no de `muse serve` (A-9 del spec; D4). Reversible: cambia el cuerpo de `quota()`.
- **A-P5. `--output-schema` con el esquema del rol** y sin el esquema en el prompt (D2). Reversible por la llamada real.
- **A-P6. El prompt va como argumento posicional,** como en los otros harness. Si empezara por `-` o pasara del límite de un argumento, la llamada fallaría y correría en el nativo; la llamada real lo mide (Risks).
- **A-P7. Los niveles de la tabla** (cuando haya modelos) son la identidad `low|medium|high|xhigh`, porque Muse acepta esos esfuerzos; no hay medición que pida otra cosa.
- **A-P8. La decisión de Muse** lleva el siguiente número libre de `docs/decisions.md` al cerrar (hoy A63).
- **A-P9. La prueba R21 es una regla sobre líneas** (tres nombres o un número), no un análisis de lenguaje; sus excepciones están escritas con su motivo en la propia prueba.

## Risks

- **La forma real de `allowance` y del fallo difiere de la supuesta.** Todo el `parse` y la lectura de cuota la leen de forma tolerante (camelCase o snake_case, objeto, cadena JSON o cadena suelta) y, ante lo ilegible, dan un fallo sin marca o una cuota desconocida, nunca una excepción ni una pregunta. L2 reconcilia con lo real (R27). Hasta entonces la cuota de Muse vale «desconocida» salvo tras una llamada que traiga `allowance`.
- **La cuota solo se conoce después de la primera llamada.** Antes, Muse es «desconocida» (usable, detrás de los que tienen lectura): el swarm lo prueba y, si falla por cuota, el fallo deja la marca y el nativo toma la unidad. No es una pregunta, pero sí una llamada que pudo no hacerse; P6 propone leerla con `muse serve`.
- **La suscripción puede no cubrir `muse exec`,** o el sandbox no arrancar en WSL2: ambos son fallos de la llamada (`authRequired`, `environmentError`) y corren en el nativo. Si en esta máquina todas las llamadas fallan así, el informe lo dice; no se baja la seguridad (R10, R13).
- **`--output-schema` puede rechazar los esquemas de los roles** (p. ej. `additionalProperties`). Entonces cada llamada falla con `exit 2` y corre en el nativo; L2 lo ve en la primera llamada real y pasa a `schemaInPrompt` (A-P5).
- **Los precios de Meta vienen de un resumen de WebFetch** (evidencia §4). L3 los verifica en la página antes del cierre; hasta entonces `aether-report` usa los de la tabla.
- **Un cambio de `HARNESS_NAMES` rompe varias pruebas a la vez.** Rompe a la vez varias pruebas (índice, panel, conformidad, docs). Cada tarea posee las pruebas que su cambio rompe y la tarea del registro va con la vista del panel (D6) para que ningún merge deje una prueba en rojo. La entrada `muse` de la tabla rompe además pruebas que enumeran los harnesses instalados cuando `muse` está en el `PATH` de la máquina (como en la del dueño): `tests/lane-fixtures.js` apunta `muse` a una ruta que no existe por defecto, como esas pruebas ya hacen con codex y cursor.
- **Otra sesión del dueño sigue activa en el repositorio.** `main` puede avanzar con docs y decisiones: el número de decisión y los de issues se releen al cerrar (D12).
- **El modelo de índice (`models.json`) no se regenera sin la clave de Artificial Analysis.** Mientras eso sea así, el índice committed no nombra a Muse y R18 se cumple en lo que depende de la tabla (sin modelos admitidos) y en los perfiles y precios ya escritos; el informe lo dice como pendiente de L3.

## Proposals

Ninguna se construye (C9, R32). Las cinco del spec (P1 a P5) siguen en pie; el plan añade:

- P6. Leer la cuota de Muse **antes** de la primera llamada con `muse serve` (`initialize` y `usage/read` por stdio), si L2 muestra que responde sin un turno previo. Por qué: la observación de D4 solo existe después de una llamada; leerla por el protocolo daría saldo desde el arranque, a cambio de un cliente MSP que Aether no tiene.
- P7. Subir `maxParallel` de Muse cuando una medición muestre que dos `muse exec` en worktrees distintos conviven con el índice SQLite compartido (A-7 del spec). Por qué: hoy es 1 y es solo un cambio de la tabla, pero necesita esa medición.
- P8. Pasar el prompt por `--prompt-file` en vez de como argumento. Por qué: evita el límite de tamaño de un argumento y los prompts que empiezan por `-`; hoy los otros harness también usan el argumento y no hay un caso que lo pida.

## Complexity

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| El archivo `lanes/quota/muse-observed.json`, que escribe `parse` y lee `quota()`, y las opciones `dataDir` y `now` del adaptador (D4). | R14 y R16: `aether-lane quota` debe dar el saldo de las dos ventanas y un fallo de cuota debe dejar una marca que una lectura sana levante; el adaptador es el único que ve el `allowance` y el dato `quota` de cada llamada. | Leer con `muse serve` `usage/read` exige un cliente MSP (`initialize` y marcos de JSON-RPC) cuya forma nadie midió y, según el esquema, no contesta hasta que el host observe algo; probar con una llamada gasta cuota solo para leerla; devolver siempre «desconocida» incumple R14 y deja la marca sin cura. |
| Dos cambios en código compartido: `lane-calls.js` hace el `parse` antes de leer `quotaAfter`, y `lane-marks.js` `liftable` compara `reading.source.ts` con `mark.at` (D4). | R14 y R16: la cuota de la llamada que trajo el `allowance` y una marca de fallo que solo levanta una observación posterior, con la vida de marca de los otros harness. | Dejar el orden y `liftable` como están hace que `lane.quota` de Muse quede siempre desconocida y que la observación del propio fallo pueda levantar su marca; una ventana `limit` sintética con un reinicio propio de Muse da a Muse una vida de marca distinta de la de los otros (R16 lo prohíbe). |
| `tests/harness-lists.test.js`, una prueba que recorre los archivos rastreados (D10). | R21: ninguna lista fija de harnesses puede quedar sin Muse sin una excepción con motivo. | Una lista de archivos escrita a mano se pudre en cuanto alguien añade una lista nueva, que es el fallo que R21 quiere cerrar. |
